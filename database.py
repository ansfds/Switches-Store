from datetime import datetime, timezone
import os
import secrets
import sqlite3
import uuid


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.environ.get("SWITCHES_DB_PATH", os.path.join(DATA_DIR, "switches.db"))
SCHEMA_PATH = os.path.join(BASE_DIR, "schema.sql")
ORDER_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def connect():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with connect() as conn, open(SCHEMA_PATH, "r", encoding="utf-8") as schema_file:
        conn.executescript(schema_file.read())


def row_to_dict(row):
    return dict(row) if row else None


def public_user(row):
    if not row:
        return None
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "picture": row["avatar_url"] or "",
        "image": row["avatar_url"] or "",
    }


def get_user_by_id(user_id):
    with connect() as conn:
        return row_to_dict(conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone())


def get_user_by_google_sub(google_sub):
    with connect() as conn:
        return row_to_dict(conn.execute("SELECT * FROM users WHERE google_sub = ?", (google_sub,)).fetchone())


def upsert_google_user(profile):
    now = utc_now()
    existing = get_user_by_google_sub(profile["sub"])
    if existing:
        with connect() as conn:
            conn.execute(
                """
                UPDATE users
                SET email = ?, name = ?, avatar_url = ?, updated_at = ?, last_login_at = ?
                WHERE google_sub = ?
                """,
                (
                    profile.get("email", ""),
                    profile.get("name") or profile.get("email", ""),
                    profile.get("picture", ""),
                    now,
                    now,
                    profile["sub"],
                ),
            )
        return get_user_by_google_sub(profile["sub"])

    user_id = str(uuid.uuid4())
    with connect() as conn:
        conn.execute(
            """
            INSERT INTO users (id, google_sub, email, name, avatar_url, created_at, updated_at, last_login_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                profile["sub"],
                profile.get("email", ""),
                profile.get("name") or profile.get("email", ""),
                profile.get("picture", ""),
                now,
                now,
                now,
            ),
        )
    return get_user_by_id(user_id)


def normalize_favorite_product_id(product_id):
    return str(product_id or "").strip()[:120]


def list_favorites_for_user(user_id):
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT product_id
            FROM favorites
            WHERE user_id = ?
            ORDER BY created_at DESC
            """,
            (user_id,),
        ).fetchall()
        return [row["product_id"] for row in rows]


def add_favorite(user_id, product_id):
    normalized_product_id = normalize_favorite_product_id(product_id)
    if not normalized_product_id:
        return False
    with connect() as conn:
        conn.execute(
            """
            INSERT OR IGNORE INTO favorites (id, user_id, product_id, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (str(uuid.uuid4()), user_id, normalized_product_id, utc_now()),
        )
    return True


def remove_favorite(user_id, product_id):
    normalized_product_id = normalize_favorite_product_id(product_id)
    if not normalized_product_id:
        return False
    with connect() as conn:
        conn.execute(
            "DELETE FROM favorites WHERE user_id = ? AND product_id = ?",
            (user_id, normalized_product_id),
        )
    return True


def generate_order_number():
    return "GSH" + "".join(secrets.choice(ORDER_ALPHABET) for _ in range(12))


def add_order_event(conn, order_id, event_type, payment_status, order_status, note=""):
    conn.execute(
        """
        INSERT INTO order_events (id, order_id, event_type, payment_status, order_status, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (str(uuid.uuid4()), order_id, event_type, payment_status, order_status, note, utc_now()),
    )


def get_order_by_id(conn, order_id):
    return conn.execute("SELECT * FROM orders WHERE id = ?", (order_id,)).fetchone()


def serialize_order(row, events=None, include_code=False):
    order = row_to_dict(row)
    if not order:
        return None
    safe = {
        key: order[key]
        for key in (
            "id",
            "order_number",
            "product_id",
            "product_name_snapshot",
            "region_id",
            "region_name_snapshot",
            "region_currency",
            "denomination_value",
            "denomination_currency",
            "selling_price_lyd",
            "delivery_email",
            "customer_name",
            "customer_phone",
            "payment_method",
            "payment_status",
            "order_status",
            "provider_name",
            "provider_reference",
            "created_at",
            "updated_at",
            "paid_at",
            "processing_at",
            "delivered_at",
            "failed_at",
            "refunded_at",
        )
    }
    safe["gift_card_available"] = bool(order["gift_card_code"] and order["order_status"] == "DELIVERED")
    if safe["gift_card_available"] and include_code:
        safe["gift_card_code"] = order["gift_card_code"]
        safe["gift_card_serial"] = order["gift_card_serial"]
    if events is not None:
        safe["events"] = [row_to_dict(event) for event in events]
    return safe


def create_order(user_id, catalog_item, customer, checkout_attempt_id=""):
    now = utc_now()
    with connect() as conn:
        if checkout_attempt_id:
            existing = conn.execute(
                "SELECT * FROM orders WHERE user_id = ? AND checkout_attempt_id = ?",
                (user_id, checkout_attempt_id),
            ).fetchone()
            if existing:
                return serialize_order(existing), False

        order_id = str(uuid.uuid4())
        for _ in range(8):
            order_number = generate_order_number()
            try:
                conn.execute(
                    """
                    INSERT INTO orders (
                      id, order_number, user_id, checkout_attempt_id,
                      product_id, product_name_snapshot,
                      region_id, region_name_snapshot, region_currency,
                      denomination_value, denomination_currency, selling_price_lyd,
                      delivery_email, customer_name, customer_phone,
                      payment_method, payment_status, order_status,
                      provider_name, provider_reference, gift_card_code, gift_card_serial,
                      created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?)
                    """,
                    (
                        order_id,
                        order_number,
                        user_id,
                        checkout_attempt_id or None,
                        catalog_item["product_id"],
                        catalog_item["product_name"],
                        catalog_item["region_id"],
                        catalog_item["region_name"],
                        catalog_item["region_currency"],
                        str(catalog_item["denomination_value"]),
                        catalog_item["denomination_currency"],
                        float(catalog_item["selling_price_lyd"]),
                        customer["delivery_email"],
                        customer["customer_name"],
                        customer["customer_phone"],
                        customer["payment_method"],
                        "PENDING",
                        "PENDING_PAYMENT",
                        now,
                        now,
                    ),
                )
                add_order_event(conn, order_id, "ORDER_CREATED", "PENDING", "PENDING_PAYMENT", "Order created")
                row = get_order_by_id(conn, order_id)
                return serialize_order(row), True
            except sqlite3.IntegrityError as error:
                if "order_number" not in str(error):
                    raise
        raise RuntimeError("Unable to generate a unique order number")


def apply_mock_payment_result(order_id, result):
    normalized = result if result in ("success", "failed", "pending") else "success"
    now = utc_now()
    with connect() as conn:
        row = get_order_by_id(conn, order_id)
        if not row:
            return None
        if row["payment_status"] != "PENDING" or row["order_status"] != "PENDING_PAYMENT":
            events = list_order_events(conn, order_id)
            return serialize_order(row, events)

        if normalized == "success":
            payment_status = "PAID"
            order_status = "PAID"
            event_type = "PAYMENT_PAID"
            timestamp_field = "paid_at"
            note = "Mock payment marked as paid"
        elif normalized == "failed":
            payment_status = "FAILED"
            order_status = "FAILED"
            event_type = "PAYMENT_FAILED"
            timestamp_field = "failed_at"
            note = "Mock payment failed"
        else:
            payment_status = "PENDING"
            order_status = "PENDING_PAYMENT"
            event_type = "PAYMENT_PENDING"
            timestamp_field = None
            note = "Mock payment is pending"

        if timestamp_field:
            conn.execute(
                f"UPDATE orders SET payment_status = ?, order_status = ?, updated_at = ?, {timestamp_field} = ? WHERE id = ?",
                (payment_status, order_status, now, now, order_id),
            )
        else:
            conn.execute(
                "UPDATE orders SET payment_status = ?, order_status = ?, updated_at = ? WHERE id = ?",
                (payment_status, order_status, now, order_id),
            )
        add_order_event(conn, order_id, event_type, payment_status, order_status, note)
        updated = get_order_by_id(conn, order_id)
        events = list_order_events(conn, order_id)
        return serialize_order(updated, events)


def fulfillment_idempotency_key(order_number):
    return f"switches:{order_number}:gift-card"


def prepare_fulfillment(order_id, provider_name):
    now = utc_now()
    with connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = get_order_by_id(conn, order_id)
        if not row:
            return {"action": "missing", "order": None}

        events = list_order_events(conn, order_id)
        if row["payment_status"] != "PAID":
            return {"action": "not_paid", "order": serialize_order(row, events, include_code=True)}
        if row["order_status"] == "DELIVERED" or row["gift_card_code"] or row["provider_reference"]:
            return {"action": "already_final", "order": serialize_order(row, events, include_code=True)}
        if row["order_status"] != "PAID":
            return {"action": "not_startable", "order": serialize_order(row, events, include_code=True)}

        idempotency_key = fulfillment_idempotency_key(row["order_number"])
        attempt_id = str(uuid.uuid4())
        try:
            conn.execute(
                """
                INSERT INTO fulfillment_attempts (
                  id, order_id, provider_name, idempotency_key, status, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (attempt_id, order_id, provider_name, idempotency_key, "STARTED", now),
            )
        except sqlite3.IntegrityError:
            current = get_order_by_id(conn, order_id)
            events = list_order_events(conn, order_id)
            return {"action": "duplicate_attempt", "order": serialize_order(current, events, include_code=True)}

        conn.execute(
            """
            UPDATE orders
            SET order_status = 'PROCESSING',
                processing_at = COALESCE(processing_at, ?),
                updated_at = ?
            WHERE id = ? AND payment_status = 'PAID' AND order_status = 'PAID'
            """,
            (now, now, order_id),
        )
        add_order_event(conn, order_id, "FULFILLMENT_STARTED", "PAID", "PROCESSING", "Fulfillment started")
        updated = get_order_by_id(conn, order_id)
        return {
            "action": "purchase",
            "attempt_id": attempt_id,
            "idempotency_key": idempotency_key,
            "order": row_to_dict(updated),
        }


def complete_fulfillment(order_id, attempt_id, provider_result):
    now = utc_now()
    status = provider_result.status
    with connect() as conn:
        conn.execute("BEGIN IMMEDIATE")
        row = get_order_by_id(conn, order_id)
        if not row:
            return None

        if row["order_status"] == "DELIVERED" or row["gift_card_code"]:
            events = list_order_events(conn, order_id)
            return serialize_order(row, events, include_code=True)

        if status == "success":
            conn.execute(
                """
                UPDATE fulfillment_attempts
                SET status = 'SUCCESS', provider_reference = ?, completed_at = ?
                WHERE id = ?
                """,
                (provider_result.provider_reference, now, attempt_id),
            )
            # TODO: Real production gift card codes must be encrypted at rest.
            conn.execute(
                """
                UPDATE orders
                SET order_status = 'DELIVERED',
                    provider_name = ?,
                    provider_reference = ?,
                    gift_card_code = ?,
                    gift_card_serial = ?,
                    delivered_at = ?,
                    updated_at = ?
                WHERE id = ? AND payment_status = 'PAID'
                """,
                (
                    provider_result.provider_name,
                    provider_result.provider_reference,
                    provider_result.gift_card_code,
                    provider_result.serial_number,
                    now,
                    now,
                    order_id,
                ),
            )
            add_order_event(conn, order_id, "PROVIDER_CONFIRMED", "PAID", "PROCESSING", "Provider confirmed gift card")
            add_order_event(conn, order_id, "CARD_DELIVERED", "PAID", "DELIVERED", "Gift card delivered")
        else:
            event_type = {
                "timeout": "PROVIDER_TIMEOUT",
                "out_of_stock": "PROVIDER_OUT_OF_STOCK",
            }.get(status, "PROVIDER_FAILED")
            attempt_status = {
                "timeout": "TIMEOUT",
                "out_of_stock": "OUT_OF_STOCK",
            }.get(status, "FAILED")
            conn.execute(
                """
                UPDATE fulfillment_attempts
                SET status = ?, provider_reference = ?, error_code = ?, completed_at = ?
                WHERE id = ?
                """,
                (
                    attempt_status,
                    provider_result.provider_reference or None,
                    provider_result.error_code or status,
                    now,
                    attempt_id,
                ),
            )
            conn.execute(
                """
                UPDATE orders
                SET order_status = 'REQUIRES_REVIEW',
                    provider_name = ?,
                    provider_reference = COALESCE(?, provider_reference),
                    updated_at = ?
                WHERE id = ? AND payment_status = 'PAID'
                """,
                (provider_result.provider_name, provider_result.provider_reference or None, now, order_id),
            )
            add_order_event(conn, order_id, event_type, "PAID", "REQUIRES_REVIEW", "Provider requires review")

        updated = get_order_by_id(conn, order_id)
        events = list_order_events(conn, order_id)
        return serialize_order(updated, events, include_code=True)


def list_orders_for_user(user_id, limit=50, offset=0):
    limit = max(1, min(int(limit or 50), 100))
    offset = max(0, int(offset or 0))
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT * FROM orders
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
            """,
            (user_id, limit, offset),
        ).fetchall()
        return [serialize_order(row, include_code=False) for row in rows]


def get_order_for_user(user_id, order_number):
    with connect() as conn:
        row = conn.execute(
            "SELECT * FROM orders WHERE user_id = ? AND order_number = ?",
            (user_id, order_number),
        ).fetchone()
        if not row:
            return None
        events = list_order_events(conn, row["id"])
        return serialize_order(row, events, include_code=True)


def list_order_events(conn, order_id):
    return conn.execute(
        """
        SELECT id, event_type, payment_status, order_status, note, created_at
        FROM order_events
        WHERE order_id = ?
        ORDER BY created_at ASC
        """,
        (order_id,),
    ).fetchall()
