"""Local catalog in the existing SQLite database; public responses use allowlists."""
import json
import os
import re
import secrets
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from database import BASE_DIR, connect

DEFAULT_NOTICE = "السعر يتغير كل لحظة ويتم احتساب السعر النهائي وقت الشراء فقط"
META_KEY = "_switchesDigital"
LOCAL_ADMIN_TOKEN = secrets.token_urlsafe(32)
_remote_lock = threading.Lock()
_remote_cache = None
_remote_time = 0
PUBLIC_SETTINGS = {
    "storeName", "logo", "favicon", "phone", "whatsapp", "email", "facebook", "instagram", "tiktok",
    "address", "workingHours", "popup_enabled", "popup_image_url", "cart_discount_enabled", "cart_discount_percent",
    "featured_hero_background_url", "featured_hero_overlay_opacity", "mode_button_pc_background_url", "mode_button_gift_background_url",
    "gift_cards_whatsapp_purchase_number", "gift_card_highlight_enabled", "gift_card_highlight_playstation", "gift_card_highlight_xbox",
    "gift_card_image_playstation", "gift_card_image_xbox", "gift_card_image_steam", "gift_card_image_apple", "gift_card_image_amazon",
    "gift_card_image_google_play", "dynamic_price_notice",
}
DIGITAL_FIELDS = {
    "categoryType", "productType", "platform", "region", "activationCountry", "duration", "activationMethod",
    "deliveryMethod", "edition", "features", "featured", "family", "catalogCategory", "bundleServices",
}
PRODUCT_FIELDS = {
    "id", "name", "slug", "description", "shortDescription", "brand", "category", "images", "availability",
    "status", "isActive", "sortOrder", "seoTitle", "metaDescription", "specs", "stockQty", "trackStock",
    "internalCost", "internalReferencePrice", "internalNote", "referenceName",
}


def digital(product):
    return (product.get("specs") or product.get("specs_json") or {}).get(META_KEY, product.get("digital") or {})


def init_catalog():
    with connect() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS catalog_products (
          id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE,
          payload_json TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS catalog_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS catalog_gift_cards (
          id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL UNIQUE,
          payload_json TEXT NOT NULL, overridden INTEGER NOT NULL DEFAULT 0, deleted INTEGER NOT NULL DEFAULT 0
        );
        """)
        conn.execute("INSERT OR IGNORE INTO catalog_settings VALUES (?, ?)", ("dynamic_price_notice", json.dumps(DEFAULT_NOTICE, ensure_ascii=False)))
        seed_path = os.path.join(BASE_DIR, "data", "subscriptions-seed.json")
        if not conn.execute("SELECT 1 FROM catalog_settings WHERE key='_subscription_seed_v1'").fetchone():
            with open(seed_path, encoding="utf-8") as source:
                for item in json.load(source)["products"]:
                    item = validate_product(item)
                    conn.execute("INSERT OR IGNORE INTO catalog_products(slug,payload_json) VALUES (?,?)", (item["slug"], json.dumps(item, ensure_ascii=False)))
            conn.execute("INSERT INTO catalog_settings VALUES ('_subscription_seed_v1', 'true')")
        if not conn.execute("SELECT 1 FROM catalog_settings WHERE key='_gift_seed_v1'").fetchone():
            with open(os.path.join(BASE_DIR, "data", "gift-cards.json"), encoding="utf-8") as source:
                cards = json.load(source)["platforms"]
            cards.append({"id": "shein", "name": "SHEIN", "shortName": "SHEIN", "iconClass": "fas fa-bag-shopping", "accent": "#111827", "imageUrl": "/assets/subscriptions/shein.svg", "available": True, "regions": [{"id": "unspecified", "label": "تُحدد عند الطلب", "currency": "USD", "available": True, "denominations": [{"value": value, "available": True} for value in (300, 500, 1000)]}]})
            for index, card in enumerate(cards):
                card["slug"] = str(card["id"])
                card["status"] = "AVAILABLE" if card.get("available") else "COMING_SOON"
                card["managedGiftCard"] = True
                for region_index, region in enumerate(card.get("regions", [])):
                    for number, denomination in enumerate(region.get("denominations", [])):
                        denomination["id"] = 2000000 + index * 10000 + region_index * 1000 + number
                conn.execute("INSERT OR IGNORE INTO catalog_gift_cards(slug,payload_json,overridden) VALUES (?,?,?)", (card["slug"], json.dumps(card, ensure_ascii=False), int(card["slug"] == "shein")))
            conn.execute("INSERT INTO catalog_settings VALUES ('_gift_seed_v1', 'true')")


def list_subscriptions(public=False):
    with connect() as conn:
        rows = conn.execute("SELECT * FROM catalog_products WHERE deleted=0").fetchall()
    products = []
    for row in rows:
        item = json.loads(row["payload_json"])
        item["id"] = 1000000 + row["id"]
        if public:
            if item.get("status") != "published" or not item.get("isActive", True) or item.get("availability", "").lower() == "hidden":
                continue
            item = public_subscription(item)
        products.append(item)
    return sorted(products, key=lambda item: (item.get("sortOrder", 0), not digital(item).get("featured", False), item["id"]))


def validate_product(payload):
    if not isinstance(payload, dict):
        raise ValueError("invalid_product")
    forbidden = re.compile(r"password|api.?key|secret|session.?token|cookie", re.I)
    def reject_credentials(value):
        if isinstance(value, dict):
            if any(forbidden.search(str(key)) for key in value):
                raise ValueError("لا يمكن تخزين كلمات مرور أو مفاتيح API أو جلسات في بيانات المنتج")
            for child in value.values():
                reject_credentials(child)
        elif isinstance(value, list):
            for child in value:
                reject_credentials(child)
        elif isinstance(value, str) and re.search(r"\bsk-[A-Za-z0-9_-]{20,}", value):
            raise ValueError("لا يمكن تخزين بيانات اعتماد داخل الكتالوج")
    reject_credentials(payload)
    item = {key: value for key, value in payload.items() if key in PRODUCT_FIELDS}
    item["name"] = str(item.get("name", "")).strip()[:180]
    item["slug"] = str(item.get("slug", "")).strip().lower()
    if not item["name"] or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", item["slug"]):
        raise ValueError("أدخل اسم المنتج وSlug فريدًا بحروف إنجليزية صغيرة وأرقام وشرطات")
    meta = {key: value for key, value in digital(payload).items() if key in DIGITAL_FIELDS}
    meta["categoryType"] = "SUBSCRIPTION"
    if meta.get("productType", "") not in ("", "SUBSCRIPTION", "KEY", "SERVICE", "BUNDLE", "ACCOUNT", "GIFT"):
        raise ValueError("invalid_product_type")
    meta["features"] = [str(value)[:200] for value in meta.get("features", [])][:12]
    meta["bundleServices"] = [{"name": str(value.get("name", ""))[:100], "duration": str(value.get("duration", ""))[:80]} for value in meta.get("bundleServices", []) if isinstance(value, dict) and value.get("name")][:8]
    item["specs"] = {**(item.get("specs") or {}), META_KEY: meta}
    item["availability"] = {"available": "available", "comingsoon": "comingSoon", "coming_soon": "comingSoon", "unavailable": "unavailable", "hidden": "hidden"}.get(str(item.get("availability", "unavailable")).lower(), "unavailable")
    item["status"] = item.get("status") if item.get("status") in ("published", "draft", "hidden") else "published"
    item["isActive"] = item.get("isActive") is not False
    item["sortOrder"] = int(item.get("sortOrder") or 0)
    item["images"] = [str(url) for url in item.get("images", []) if re.match(r"^(https?://|/(?!/))", str(url))][:8]
    for field in ("internalCost", "internalReferencePrice"):
        value = item.get(field)
        item[field] = None if value in (None, "") else float(value)
        if item[field] is not None and (item[field] < 0 or item[field] == float("inf") or item[field] != item[field]):
            raise ValueError("invalid_internal_price")
    return item


def save_subscription(payload, product_id=None):
    item = validate_product(payload)
    with connect() as conn:
        if product_id:
            result = conn.execute("UPDATE catalog_products SET slug=?,payload_json=? WHERE id=? AND deleted=0", (item["slug"], json.dumps(item, ensure_ascii=False), int(product_id) - 1000000))
            if not result.rowcount:
                raise ValueError("product_not_found")
        else:
            result = conn.execute("INSERT INTO catalog_products(slug,payload_json) VALUES (?,?)", (item["slug"], json.dumps(item, ensure_ascii=False)))
            product_id = result.lastrowid + 1000000
    return {"id": int(product_id)}


def delete_subscription(product_id):
    with connect() as conn:
        conn.execute("UPDATE catalog_products SET deleted=1 WHERE id=?", (int(product_id) - 1000000,))
    return {"deleted": True}


def settings():
    with connect() as conn:
        return {row["key"]: json.loads(row["value_json"]) for row in conn.execute("SELECT * FROM catalog_settings WHERE key IN ('dynamic_price_notice','gift_cards_whatsapp_purchase_number')")}


def save_notice(payload):
    notice = str(payload.get("dynamic_price_notice", settings().get("dynamic_price_notice", DEFAULT_NOTICE))).strip()
    if not 3 <= len(notice) <= 400:
        raise ValueError("أدخل نصًا بين 3 و400 حرف")
    with connect() as conn:
        conn.execute("INSERT OR REPLACE INTO catalog_settings VALUES (?,?)", ("dynamic_price_notice", json.dumps(notice, ensure_ascii=False)))
        if "gift_cards_whatsapp_purchase_number" in payload:
            phone = re.sub(r"\D", "", str(payload["gift_cards_whatsapp_purchase_number"]))
            if phone and not 8 <= len(phone) <= 15:
                raise ValueError("أدخل رقم WhatsApp صحيحًا")
            conn.execute("INSERT OR REPLACE INTO catalog_settings VALUES (?,?)", ("gift_cards_whatsapp_purchase_number", json.dumps(phone)))
    return settings()


def local_gifts(admin=False):
    with connect() as conn:
        rows = conn.execute("SELECT * FROM catalog_gift_cards WHERE deleted=0").fetchall()
    result = []
    for row in rows:
        item = json.loads(row["payload_json"])
        item["id"] = row["id"] if admin else row["slug"]
        if admin:
            region = (item.get("regions") or [{}])[0]
            item.update({"regionCode": region.get("id", ""), "regionLabel": region.get("label", ""), "currency": region.get("currency", "USD"), "denominations": [{**denomination, "faceValue": denomination["value"], "isAvailable": denomination.get("available", True), "currency": region.get("currency", "USD")} for denomination in region.get("denominations", [])]})
        item["_localOverride"] = bool(row["overridden"])
        result.append(item)
    return result


def save_local_gift(payload, gift_id=None):
    with connect() as conn:
        row = conn.execute("SELECT * FROM catalog_gift_cards WHERE id=? AND deleted=0", (gift_id,)).fetchone() if gift_id else None
        item = json.loads(row["payload_json"]) if row else {"regions": [{"denominations": []}]}
        allowed = {"name", "displayName", "shortName", "slug", "description", "imageUrl", "backgroundUrl", "iconClass", "accent", "status", "sortOrder"}
        item.update({key: value for key, value in payload.items() if key in allowed})
        slug = str(item.get("slug", "")).strip().lower()
        if not item.get("name") or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
            raise ValueError("أدخل اسمًا وSlug صالحًا")
        item["status"] = item.get("status") if item.get("status") in ("AVAILABLE", "COMING_SOON", "UNAVAILABLE", "HIDDEN") else "UNAVAILABLE"
        item["available"] = item["status"] == "AVAILABLE"
        item["managedGiftCard"] = True
        region = item["regions"][0]
        region.update({"id": str(payload.get("regionCode", region.get("id", ""))).lower(), "label": payload.get("regionLabel", region.get("label", "")), "currency": payload.get("currency", region.get("currency", "USD")), "available": item["available"]})
        encoded = json.dumps(item, ensure_ascii=False)
        if row:
            conn.execute("UPDATE catalog_gift_cards SET slug=?,payload_json=?,overridden=1 WHERE id=?", (slug, encoded, gift_id))
        else:
            gift_id = conn.execute("INSERT INTO catalog_gift_cards(slug,payload_json,overridden) VALUES (?,?,1)", (slug, encoded)).lastrowid
    return {"id": gift_id}


def change_local_denomination(payload, gift_id=None, denomination_id=None, delete=False):
    with connect() as conn:
        rows = conn.execute("SELECT * FROM catalog_gift_cards WHERE deleted=0").fetchall()
        for row in rows:
            if gift_id is not None and row["id"] != int(gift_id):
                continue
            card = json.loads(row["payload_json"])
            for region in card["regions"]:
                items = region["denominations"]
                current = next((item for item in items if item.get("id") == denomination_id), None) if denomination_id else None
                if denomination_id and not current:
                    continue
                if delete:
                    items.remove(current)
                else:
                    if not current:
                        current = {"id": 10000000 + secrets.randbelow(80000000)}
                        items.append(current)
                    value = float(payload.get("faceValue", payload.get("value", 0)))
                    if value <= 0:
                        raise ValueError("invalid_denomination")
                    current.update({"value": int(value) if value.is_integer() else value, "available": payload.get("isAvailable") is not False, "sellingPriceLYD": float(payload.get("sellingPriceLYD") or 0), "isMostPopular": payload.get("isMostPopular") is True, "highlightEffect": payload.get("highlightEffect", "none"), "sortOrder": int(payload.get("sortOrder") or 0)})
                conn.execute("UPDATE catalog_gift_cards SET payload_json=?,overridden=1 WHERE id=?", (json.dumps(card, ensure_ascii=False), row["id"]))
                return {"id": denomination_id or current["id"]}
    raise ValueError("denomination_not_found")


def delete_local_gift(gift_id):
    with connect() as conn:
        conn.execute("UPDATE catalog_gift_cards SET deleted=1,overridden=1 WHERE id=?", (gift_id,))
    return {"deleted": True}


def public_subscription(item):
    aliases = {"images": "images_json", "shortDescription": "short_description", "sortOrder": "sort_order", "seoTitle": "seo_title", "metaDescription": "meta_description", "stockQty": "stock_qty", "trackStock": "track_stock"}
    allowed = {"id", "name", "slug", "description", "shortDescription", "category", "brand", "images", "availability", "status", "isActive", "sortOrder", "seoTitle", "metaDescription", "stockQty", "trackStock"}
    result = {key: item.get(key, item.get(aliases.get(key, ""))) for key in allowed if key in item or aliases.get(key) in item}
    meta = {key: value for key, value in digital(item).items() if key in DIGITAL_FIELDS}
    meta["categoryType"] = "SUBSCRIPTION"
    result["specs"] = {META_KEY: meta}
    # Explicit public option fields, without subscription prices or supplier data.
    specs = item.get("specs") or item.get("specs_json") or {}
    options = specs.get("_productOptions") or {}
    option_fields = {"id", "name", "value", "available", "availability", "stockQty", "stock_qty", "stock", "trackStock", "images", "image"}
    public_options = {}
    for key in ("variants", "colors"):
        rows = item.get(key) or specs.get(key) or options.get(key) or []
        clean = []
        for row in rows if isinstance(rows, list) else []:
            if isinstance(row, str) and key == "colors":
                clean.append(row)
            elif isinstance(row, dict):
                value = {field: data for field, data in row.items() if field in option_fields}
                attributes = row.get("options") or row.get("attributes") or {}
                if isinstance(attributes, dict):
                    value["options"] = {name: data for name, data in attributes.items() if isinstance(data, (str, int, float)) and not re.search(r"internal|cost|secret|password|token|cookie|supplier|margin|price", name, re.I)}
                clean.append(value)
        if clean:
            public_options[key] = clean
    if public_options:
        labels = options.get("labels") or {}
        if isinstance(labels, dict):
            public_keys = {key for row in public_options.get("variants", []) for key in row.get("options", {})}
            public_options["labels"] = {str(key): str(value) for key, value in labels.items() if key in public_keys and isinstance(value, str)}
        result["specs"]["_productOptions"] = public_options
    for key in ("benefits", "reviews"):
        rows = specs.get(key) or []
        if isinstance(rows, list) and key == "benefits":
            result["specs"][key] = [value for value in rows if isinstance(value, str)][:8]
        elif isinstance(rows, list) and key == "reviews":
            result["specs"][key] = [{field: value for field, value in row.items() if field in ("author", "text", "comment", "rating") and isinstance(value, (str, int, float))} for row in rows if isinstance(row, dict)]
    result["priceOnRequest"] = True
    return result


def public_product(item):
    if digital(item).get("categoryType") == "SUBSCRIPTION":
        return public_subscription(item)
    # Match the existing productFromRow contract, including homepage item products.
    return {
        "id": item["id"], "name": item.get("name", ""), "shortDescription": item.get("short_description", ""),
        "description": item.get("description", ""), "category": item.get("category", ""), "brand": item.get("brand", ""),
        "price": item.get("price", 0), "oldPrice": item.get("old_price"), "condition": item.get("condition") or "جديد",
        "images": item.get("images_json") or [], "specs": item.get("specs_json") or {}, "tags": item.get("tags_json") or [],
        "availability": item.get("availability") or "available", "slug": item.get("slug", ""),
        "stockQty": item.get("stock_qty"), "trackStock": item.get("track_stock"),
        "sortOrder": item.get("sort_order", 0), "status": item.get("status", "published"), "isActive": item.get("is_active", True),
        "seoTitle": item.get("seo_title", ""), "metaDescription": item.get("meta_description", ""),
    }


def supabase_read(table, query):
    if os.environ.get("SWITCHES_OFFLINE_CATALOG") == "1":
        return []
    with open(os.path.join(BASE_DIR, "shared", "supabase-config.js"), encoding="utf-8") as source:
        config = source.read()
    base = re.search(r"url\s*:\s*[\"']([^\"']+)", config).group(1)
    key = re.search(r"publishableKey\s*:\s*[\"']([^\"']+)", config).group(1)
    request = Request(base + "/rest/v1/" + table + "?" + urlencode(query), headers={"apikey": key, "Authorization": "Bearer " + key})
    with urlopen(request, timeout=8) as response:
        return json.load(response)


def remote_snapshot():
    global _remote_cache, _remote_time
    with _remote_lock:
        if _remote_cache is not None and time.monotonic() - _remote_time < 45:
            return _remote_cache
        queries = {
            "products": ("products", {"select": "id,name,short_description,description,category,brand,price,old_price,condition,images_json,specs_json,tags_json,availability,slug,stock_qty,track_stock,sort_order,status,is_active,is_deleted,seo_title,meta_description", "is_active": "eq.true", "is_deleted": "eq.false", "status": "eq.published", "order": "sort_order.asc,id.desc"}),
            "sections": ("homepage_sections", {"select": "*", "order": "sort_order.asc"}),
            "items": ("homepage_items", {"select": "*", "order": "slot_index.asc"}),
            "settings": ("store_settings", {"select": "settings_json", "id": "eq.1"}),
            "gifts": ("gift_cards", {"select": "id,slug,name,display_name,short_name,icon_class,accent,description,region_code,region_label,currency,image_url,background_url,status,sort_order", "is_deleted": "eq.false", "order": "sort_order.asc"}),
            "denominations": ("gift_card_denominations", {"select": "id,gift_card_id,face_value,currency,is_available,is_most_popular,highlight_effect,sort_order", "order": "sort_order.asc"}),
        }
        def read(pair):
            try:
                return supabase_read(*pair)
            except Exception:
                return []
        with ThreadPoolExecutor(max_workers=6) as pool:
            values = list(pool.map(read, queries.values()))
        _remote_cache = dict(zip(queries, values))
        _remote_time = time.monotonic()
        return _remote_cache


def public_settings(snapshot=None):
    snapshot = snapshot if snapshot is not None else remote_snapshot()
    raw = (snapshot.get("settings") or [{}])[0].get("settings_json") or {}
    return {**{key: value for key, value in raw.items() if key in PUBLIC_SETTINGS}, **settings()}


def public_bootstrap():
    snapshot = remote_snapshot()
    local = list_subscriptions(public=True)
    with connect() as conn:
        slugs = {row["slug"] for row in conn.execute("SELECT slug FROM catalog_products")}
    remote = [public_product(item) for item in snapshot["products"] if not (digital(item).get("categoryType") == "SUBSCRIPTION" and item.get("slug") in slugs)]
    products = remote + local
    by_id = {int(item["id"]): item for item in products}
    sections = []
    for section in snapshot["sections"]:
        items = [{"slot": item.get("slot_index", 0), "product": by_id.get(item["product_id"]), "customPrice": item.get("custom_price"), "startsAt": item.get("starts_at"), "endsAt": item.get("ends_at")} for item in snapshot["items"] if item.get("section_key") == section["section_key"] and item.get("product_id") in by_id and digital(by_id[item["product_id"]]).get("categoryType") != "SUBSCRIPTION"]
        sections.append({"key": section["section_key"], "title": section.get("title"), "isVisible": section.get("is_visible", True), "sortOrder": section.get("sort_order", 0), "maxItems": section.get("max_items", 4), "items": items})
    return {"products": products, "homepageSections": sections, "settings": public_settings(snapshot), "settingsLoaded": True, "homepageLoaded": bool(snapshot["sections"])}


def strip_private_gift(value):
    # Denomination values are retained; selling prices are never copied.
    if isinstance(value, list):
        return [strip_private_gift(item) for item in value]
    if isinstance(value, dict):
        private = re.compile(r"price|cost|margin|discount|secret|password|token|cookie", re.I)
        return {key: strip_private_gift(item) for key, item in value.items() if not private.search(key)}
    return value


def public_gifts():
    snapshot = remote_snapshot()
    fallback = strip_private_gift(local_gifts())
    result = {str(item["id"]): item for item in fallback}
    for row in snapshot["gifts"]:
        if row.get("status") == "HIDDEN":
            result.pop(row["slug"], None)
            continue
        denominations = [{"id": item["id"], "value": item["face_value"], "available": item["is_available"], "isMostPopular": item["is_most_popular"], "highlightEffect": item["highlight_effect"]} for item in snapshot["denominations"] if item["gift_card_id"] == row["id"]]
        result[row["slug"]] = {"id": row["slug"], "name": row["name"], "shortName": row.get("short_name") or row["name"], "iconClass": row.get("icon_class"), "accent": row.get("accent"), "description": row.get("description"), "imageUrl": row.get("image_url"), "backgroundUrl": row.get("background_url"), "status": row["status"], "available": row["status"] == "AVAILABLE", "managedGiftCard": True, "sortOrder": row.get("sort_order", 0), "regions": [{"id": str(row.get("region_code") or "").lower(), "label": row.get("region_label"), "name": row.get("region_label"), "currency": row.get("currency"), "available": row["status"] == "AVAILABLE", "denominations": denominations}]}
    for item in fallback:
        if item.pop("_localOverride", False):
            result[str(item["id"])] = item
    for item in result.values():
        item.pop("_localOverride", None)
    with connect() as conn:
        hidden_slugs = {row["slug"] for row in conn.execute("SELECT slug FROM catalog_gift_cards WHERE deleted=1 OR json_extract(payload_json,'$.status')='HIDDEN'")}
    return {"platforms": [item for key, item in result.items() if key not in hidden_slugs]}
