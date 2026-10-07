from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from http import HTTPStatus
from urllib.parse import urlencode, urlparse, parse_qs, urlsplit, unquote
from urllib.request import Request, urlopen, build_opener, ProxyHandler
from urllib.error import HTTPError, URLError
from http.cookies import SimpleCookie
import argparse
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import time

from catalog import CatalogError, find_selection
from database import (
    DB_PATH,
    add_favorite,
    apply_mock_payment_result,
    create_order,
    get_order_for_user,
    get_user_by_google_sub,
    get_user_by_id,
    init_db,
    list_favorites_for_user,
    list_orders_for_user,
    public_user,
    remove_favorite,
    upsert_google_user,
)
from fulfillment import fulfill_paid_order


SESSION_COOKIE = "switches_session"
OAUTH_STATE_COOKIE = "switches_oauth_state"
SESSION_MAX_AGE = 60 * 60 * 24 * 14
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"


class AuthFlowError(Exception):
    def __init__(self, code, detail=""):
        super().__init__(code)
        self.code = code
        self.detail = detail


def auth_log(message):
    print(f"[AUTH] {message}", flush=True)


def loaded_flag(name):
    return "yes" if bool(os.environ.get(name, "").strip()) else "no"


def json_error_body(raw_body):
    if not raw_body:
        return {}
    try:
        parsed = json.loads(raw_body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return {}
    return {
        "error": parsed.get("error", ""),
        "error_description": parsed.get("error_description", ""),
    }


def google_urlopen(request, timeout=12):
    if os.environ.get("AUTH_USE_ENV_PROXY", "").lower() == "true":
        return urlopen(request, timeout=timeout)
    opener = build_opener(ProxyHandler({}))
    return opener.open(request, timeout=timeout)


def load_env_file():
    if not os.path.exists(".env"):
        return
    with open(".env", "r", encoding="utf-8") as env_file:
        for raw_line in env_file:
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def b64url_encode(raw):
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def b64url_decode(raw):
    padding = "=" * (-len(raw) % 4)
    return base64.urlsafe_b64decode(raw + padding)


def auth_secret():
    return os.environ.get("AUTH_SECRET", "")


def sign_value(payload):
    secret = auth_secret()
    if not secret:
        raise RuntimeError("AUTH_SECRET is not configured")
    body = b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signature = hmac.new(secret.encode("utf-8"), body.encode("ascii"), hashlib.sha256).digest()
    return f"{body}.{b64url_encode(signature)}"


def verify_signed_value(value):
    secret = auth_secret()
    if not secret or not value or "." not in value:
        return None
    body, signature = value.rsplit(".", 1)
    expected = b64url_encode(hmac.new(secret.encode("utf-8"), body.encode("ascii"), hashlib.sha256).digest())
    if not hmac.compare_digest(signature, expected):
        return None
    try:
        payload = json.loads(b64url_decode(body).decode("utf-8"))
    except (ValueError, json.JSONDecodeError):
        return None
    if payload.get("exp") and int(payload["exp"]) < int(time.time()):
        return None
    return payload


def safe_return_url(value):
    if not value:
        return "/"
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc or not value.startswith("/") or value.startswith("//"):
        return "/"
    if value == "/" or value.startswith(("/gift-cards", "/checkout", "/account", "/favorites")):
        return value
    return "/"


class SwitchesHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".avif": "image/avif",
        ".webp": "image/webp",
    }

    def translate_path(self, path):
        parsed = urlparse(path)
        clean_path = parsed.path.rstrip("/")
        spa_paths = (
            clean_path == "/gift-cards"
            or clean_path.startswith("/gift-cards/")
            or clean_path == "/checkout"
            or clean_path.startswith("/checkout/")
            or clean_path == "/account"
            or clean_path.startswith("/account/")
            or clean_path == "/favorites"
        )
        if spa_paths:
            path = "/index.html"
        return super().translate_path(path)

    def guess_type(self, path):
        extension = os.path.splitext(path)[1].lower()
        if extension == ".avif":
            return "image/avif"
        if extension == ".webp":
            return "image/webp"
        return super().guess_type(path)

    def end_headers(self):
        parsed = urlparse(self.path)
        no_cache_paths = (
            parsed.path.startswith("/assets/")
            or parsed.path.startswith("/data/")
            or parsed.path.endswith((".js", ".css", ".html"))
        )
        if no_cache_paths:
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
        super().end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/auth/me":
            self.handle_auth_me()
            return
        if parsed.path == "/api/favorites":
            self.handle_favorites_list()
            return
        if parsed.path == "/api/orders":
            self.handle_orders_list(parsed)
            return
        if parsed.path.startswith("/api/orders/"):
            self.handle_order_detail(parsed)
            return
        if parsed.path == "/auth/google":
            self.handle_google_login(parsed)
            return
        if parsed.path == "/auth/google/callback":
            self.handle_google_callback(parsed)
            return
        super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/auth/logout":
            self.handle_logout()
            return
        if parsed.path == "/api/favorites":
            self.handle_favorite_add()
            return
        if parsed.path == "/api/orders":
            self.handle_order_create()
            return
        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def do_DELETE(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/favorites/"):
            self.handle_favorite_remove(parsed)
            return
        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def request_origin(self):
        host = self.headers.get("Host", "127.0.0.1:8000")
        proto = self.headers.get("X-Forwarded-Proto") or ("https" if os.environ.get("AUTH_FORCE_HTTPS") == "true" else "http")
        return f"{proto}://{host}"

    def oauth_redirect_uri(self):
        return f"{self.request_origin()}/auth/google/callback"

    def cookie_secure(self):
        if os.environ.get("AUTH_COOKIE_SECURE"):
            return os.environ["AUTH_COOKIE_SECURE"].lower() == "true"
        return self.request_origin().startswith("https://")

    def cookie_header(self, name, value, max_age):
        parts = [
            f"{name}={value}",
            "Path=/",
            "HttpOnly",
            "SameSite=Lax",
            f"Max-Age={max_age}",
        ]
        if self.cookie_secure():
            parts.append("Secure")
        return "; ".join(parts)

    def clear_cookie_header(self, name):
        parts = [f"{name}=", "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"]
        if self.cookie_secure():
            parts.append("Secure")
        return "; ".join(parts)

    def read_cookie(self, name):
        cookie = SimpleCookie(self.headers.get("Cookie"))
        return cookie[name].value if name in cookie else ""

    def json_response(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def redirect(self, location, extra_headers=None):
        self.send_response(HTTPStatus.FOUND)
        self.send_header("Location", location)
        if extra_headers:
            for name, value in extra_headers:
                self.send_header(name, value)
        self.end_headers()

    def current_user(self):
        session = verify_signed_value(self.read_cookie(SESSION_COOKIE))
        if not session:
            return None
        user_id = session.get("user_id")
        user = get_user_by_id(user_id) if user_id else None
        if user:
            return public_user(user)

        legacy_user = session.get("user") or {}
        google_sub = legacy_user.get("sub")
        if google_sub:
            user = get_user_by_google_sub(google_sub)
            if user:
                return public_user(user)
        return None

    def handle_auth_me(self):
        user = self.current_user()
        self.json_response(HTTPStatus.OK, {"authenticated": bool(user), "user": user})

    def read_json_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if length > 32_000:
            raise ValueError("request_too_large")
        if length <= 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ValueError("invalid_json") from error

    def require_user(self):
        user = self.current_user()
        if not user:
            self.json_response(HTTPStatus.UNAUTHORIZED, {"error": "authentication_required"})
            return None
        return user

    def validate_order_payload(self, payload):
        errors = {}
        customer_name = str(payload.get("customer_name") or payload.get("fullName") or "").strip()
        customer_phone = re.sub(r"[\s-]+", "", str(payload.get("customer_phone") or payload.get("phone") or "").strip())
        delivery_email = str(payload.get("delivery_email") or payload.get("email") or "").strip().lower()
        payment_method = str(payload.get("payment_method") or "").strip().replace("-", "_")
        product_id = str(payload.get("product_id") or payload.get("product") or "").strip()
        region_id = str(payload.get("region_id") or payload.get("region") or "").strip()
        denomination_value = payload.get("denomination_value", payload.get("value"))
        checkout_attempt_id = str(payload.get("checkout_attempt_id") or "").strip()[:120]

        if len(customer_name) < 3:
            errors["customer_name"] = "invalid_customer_name"
        if not re.fullmatch(r"\+?\d{8,15}", customer_phone):
            errors["customer_phone"] = "invalid_customer_phone"
        if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", delivery_email):
            errors["delivery_email"] = "invalid_delivery_email"
        if payment_method not in ("bank_card",):
            errors["payment_method"] = "invalid_payment_method"

        try:
            catalog_item = find_selection(product_id, region_id, denomination_value)
        except CatalogError as error:
            catalog_item = None
            errors["catalog"] = str(error)

        mock_result = str(payload.get("mock_result") or "success").strip().lower()
        if mock_result not in ("success", "failed", "pending"):
            mock_result = "success"

        return errors, catalog_item, {
            "customer_name": customer_name,
            "customer_phone": customer_phone,
            "delivery_email": delivery_email,
            "payment_method": payment_method,
            "checkout_attempt_id": checkout_attempt_id,
            "mock_result": mock_result,
        }

    def handle_order_create(self):
        user = self.require_user()
        if not user:
            return
        try:
            payload = self.read_json_body()
        except ValueError as error:
            self.json_response(HTTPStatus.BAD_REQUEST, {"error": str(error)})
            return

        errors, catalog_item, customer = self.validate_order_payload(payload)
        if errors:
            self.json_response(HTTPStatus.BAD_REQUEST, {"error": "validation_failed", "fields": errors})
            return

        order, created = create_order(
            user["id"],
            catalog_item,
            customer,
            customer["checkout_attempt_id"],
        )
        if created:
            auth_log(f"order created: {order['order_number']}")
            order = apply_mock_payment_result(order["id"], customer["mock_result"])
            auth_log(f"order status changed: {order['order_number']} payment={order['payment_status']} order={order['order_status']}")
        if order and order["payment_status"] == "PAID":
            order = fulfill_paid_order(order["id"])
        self.json_response(HTTPStatus.CREATED if created else HTTPStatus.OK, {"order": order, "idempotent": not created})

    def handle_orders_list(self, parsed):
        user = self.require_user()
        if not user:
            return
        params = parse_qs(parsed.query)
        orders = list_orders_for_user(
            user["id"],
            (params.get("limit") or ["50"])[0],
            (params.get("offset") or ["0"])[0],
        )
        self.json_response(HTTPStatus.OK, {"orders": orders})

    def handle_order_detail(self, parsed):
        user = self.require_user()
        if not user:
            return
        order_number = parsed.path.rsplit("/", 1)[-1].strip().upper()
        if not re.fullmatch(r"[A-Z0-9]{6,24}", order_number):
            self.json_response(HTTPStatus.NOT_FOUND, {"error": "order_not_found"})
            return
        order = get_order_for_user(user["id"], order_number)
        if not order:
            self.json_response(HTTPStatus.NOT_FOUND, {"error": "order_not_found"})
            return
        self.json_response(HTTPStatus.OK, {"order": order})

    def clean_favorite_product_id(self, product_id):
        product_id = str(product_id or "").strip()
        if not product_id or len(product_id) > 120:
            return ""
        return product_id

    def handle_favorites_list(self):
        user = self.require_user()
        if not user:
            return
        self.json_response(HTTPStatus.OK, {"favorites": list_favorites_for_user(user["id"])})

    def handle_favorite_add(self):
        user = self.require_user()
        if not user:
            return
        try:
            payload = self.read_json_body()
        except ValueError as error:
            self.json_response(HTTPStatus.BAD_REQUEST, {"error": str(error)})
            return
        product_id = self.clean_favorite_product_id(payload.get("product_id"))
        if not product_id:
            self.json_response(HTTPStatus.BAD_REQUEST, {"error": "invalid_product_id"})
            return
        add_favorite(user["id"], product_id)
        self.json_response(HTTPStatus.OK, {"favorites": list_favorites_for_user(user["id"])})

    def handle_favorite_remove(self, parsed):
        user = self.require_user()
        if not user:
            return
        product_id = self.clean_favorite_product_id(unquote(parsed.path.rsplit("/", 1)[-1]))
        if not product_id:
            self.json_response(HTTPStatus.BAD_REQUEST, {"error": "invalid_product_id"})
            return
        remove_favorite(user["id"], product_id)
        self.json_response(HTTPStatus.OK, {"favorites": list_favorites_for_user(user["id"])})

    def handle_google_login(self, parsed):
        client_id = os.environ.get("GOOGLE_CLIENT_ID", "")
        auth_log(f"GOOGLE_CLIENT_ID loaded: {loaded_flag('GOOGLE_CLIENT_ID')}")
        auth_log(f"GOOGLE_CLIENT_SECRET loaded: {loaded_flag('GOOGLE_CLIENT_SECRET')}")
        auth_log(f"AUTH_SECRET loaded: {loaded_flag('AUTH_SECRET')}")
        if not client_id or not os.environ.get("GOOGLE_CLIENT_SECRET") or not auth_secret():
            auth_log("AUTH_LOGIN_ERROR: missing_google_config")
            self.redirect("/?auth_error=missing_google_config")
            return

        params = parse_qs(parsed.query)
        return_to = safe_return_url((params.get("returnTo") or ["/"])[0])
        state_payload = {
            "nonce": secrets.token_urlsafe(24),
            "returnTo": return_to,
            "exp": int(time.time()) + 600,
        }
        state = sign_value(state_payload)
        redirect_uri = self.oauth_redirect_uri()
        auth_log(f"authorization redirect_uri: {redirect_uri}")
        auth_log(f"state cookie secure: {'yes' if self.cookie_secure() else 'no'}")
        google_params = {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "prompt": "select_account",
        }
        self.redirect(
            f"{GOOGLE_AUTH_URL}?{urlencode(google_params)}",
            [("Set-Cookie", self.cookie_header(OAUTH_STATE_COOKIE, state, 600))],
        )

    def handle_google_callback(self, parsed):
        auth_log("callback received")
        params = parse_qs(parsed.query)
        google_error = (params.get("error") or [""])[0]
        google_error_description = (params.get("error_description") or [""])[0]
        if google_error:
            auth_log(f"AUTH_CALLBACK_ERROR: google_returned_error error={google_error} description={google_error_description}")
            self.redirect("/?auth_error=google_login_failed")
            return

        code = (params.get("code") or [""])[0]
        state = (params.get("state") or [""])[0]
        cookie_state = self.read_cookie(OAUTH_STATE_COOKIE)
        clear_state = ("Set-Cookie", self.clear_cookie_header(OAUTH_STATE_COOKIE))

        auth_log(f"code present: {'yes' if code else 'no'}")
        auth_log(f"state present: {'yes' if state else 'no'}")
        auth_log(f"stored state present: {'yes' if cookie_state else 'no'}")
        state_payload = verify_signed_value(state)
        auth_log(f"state valid: {'yes' if state_payload else 'no'}")
        state_matches_cookie = bool(state and cookie_state and hmac.compare_digest(state, cookie_state))
        auth_log(f"state matches stored: {'yes' if state_matches_cookie else 'no'}")
        if not code:
            auth_log("AUTH_CALLBACK_ERROR: authorization_code_missing")
            self.redirect("/?auth_error=invalid_oauth_state", [clear_state])
            return
        if not state_payload:
            auth_log("AUTH_CALLBACK_ERROR: state_invalid_or_expired")
            self.redirect("/?auth_error=invalid_oauth_state", [clear_state])
            return
        if not state_matches_cookie:
            auth_log("AUTH_CALLBACK_ERROR: state_cookie_missing_or_mismatch")
            self.redirect("/?auth_error=invalid_oauth_state", [clear_state])
            return

        try:
            claims = self.exchange_and_verify_google_code(code)
        except AuthFlowError as error:
            detail = f" detail={error.detail}" if error.detail else ""
            auth_log(f"AUTH_CALLBACK_ERROR: {error.code}{detail}")
            self.redirect("/?auth_error=google_login_failed", [clear_state])
            return
        except Exception as error:
            auth_log(f"AUTH_CALLBACK_ERROR: unexpected_{type(error).__name__}")
            self.redirect("/?auth_error=google_login_failed", [clear_state])
            return

        user = {
            "sub": claims["sub"],
            "name": claims.get("name") or claims.get("email", ""),
            "email": claims.get("email", ""),
            "picture": claims.get("picture", ""),
        }
        db_user = upsert_google_user(user)
        session = sign_value({
            "user_id": db_user["id"],
            "iat": int(time.time()),
            "exp": int(time.time()) + SESSION_MAX_AGE,
        })
        auth_log("session created")
        auth_log(f"session cookie secure: {'yes' if self.cookie_secure() else 'no'}")
        auth_log(f"redirecting to {safe_return_url(state_payload.get('returnTo'))}")
        headers = [
            clear_state,
            ("Set-Cookie", self.cookie_header(SESSION_COOKIE, session, SESSION_MAX_AGE)),
        ]
        self.redirect(safe_return_url(state_payload.get("returnTo")), headers)

    def exchange_and_verify_google_code(self, code):
        client_id = os.environ["GOOGLE_CLIENT_ID"]
        redirect_uri = self.oauth_redirect_uri()
        auth_log("exchanging authorization code...")
        auth_log(f"token exchange redirect_uri: {redirect_uri}")
        auth_log(f"google request proxy mode: {'environment' if os.environ.get('AUTH_USE_ENV_PROXY', '').lower() == 'true' else 'direct'}")
        token_payload = urlencode({
            "code": code,
            "client_id": client_id,
            "client_secret": os.environ["GOOGLE_CLIENT_SECRET"],
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        }).encode("utf-8")
        token_request = Request(
            GOOGLE_TOKEN_URL,
            data=token_payload,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        try:
            with google_urlopen(token_request, timeout=12) as response:
                auth_log(f"token endpoint status: {response.status}")
                token_data = json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            details = json_error_body(error.read())
            error_code = details.get("error") or "http_error"
            description = details.get("error_description") or error.reason
            raise AuthFlowError(
                f"token_exchange_{error_code}",
                f"status={error.code} description={description}",
            ) from error
        except URLError as error:
            raise AuthFlowError("token_exchange_network_error", str(error.reason)) from error
        except json.JSONDecodeError as error:
            raise AuthFlowError("token_exchange_invalid_json") from error

        auth_log(f"access_token present: {'yes' if token_data.get('access_token') else 'no'}")
        id_token = token_data.get("id_token")
        auth_log(f"id_token present: {'yes' if id_token else 'no'}")
        if not id_token:
            raise AuthFlowError("id_token_missing")

        auth_log("verifying id_token...")
        info_url = f"{GOOGLE_TOKENINFO_URL}?{urlencode({'id_token': id_token})}"
        try:
            with google_urlopen(info_url, timeout=12) as response:
                auth_log(f"tokeninfo endpoint status: {response.status}")
                claims = json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            details = json_error_body(error.read())
            error_code = details.get("error") or "http_error"
            description = details.get("error_description") or error.reason
            raise AuthFlowError(
                f"id_token_verification_{error_code}",
                f"status={error.code} description={description}",
            ) from error
        except URLError as error:
            raise AuthFlowError("id_token_verification_network_error", str(error.reason)) from error
        except json.JSONDecodeError as error:
            raise AuthFlowError("id_token_verification_invalid_json") from error

        if claims.get("aud") != client_id:
            raise AuthFlowError("id_token_audience_mismatch")
        if claims.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
            raise AuthFlowError("id_token_issuer_invalid")
        if int(claims.get("exp", "0")) < int(time.time()):
            raise AuthFlowError("id_token_expired")
        if claims.get("email_verified") not in ("true", True):
            raise AuthFlowError("id_token_email_not_verified")
        if not claims.get("sub") or not claims.get("email"):
            raise AuthFlowError("id_token_required_claims_missing")
        auth_log("user verified")
        return claims

    def handle_logout(self):
        self.send_response(HTTPStatus.NO_CONTENT)
        self.send_header("Set-Cookie", self.clear_cookie_header(SESSION_COOKIE))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()


def main():
    load_env_file()
    init_db()
    parser = argparse.ArgumentParser(description="Switches Store local server with Google auth and SPA fallback.")
    parser.add_argument("port", nargs="?", type=int, default=8000)
    args = parser.parse_args()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), SwitchesHandler)
    print(f"Serving Switches Store on http://127.0.0.1:{args.port}/")
    print(f"SQLite database: {DB_PATH}")
    server.serve_forever()


if __name__ == "__main__":
    main()
