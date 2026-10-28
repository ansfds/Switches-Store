import json
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
os.environ["SWITCHES_OFFLINE_CATALOG"] = "1"
import database
import store_catalog as catalog


def assert_public(test, value):
    if isinstance(value, dict):
        for key, child in value.items():
            test.assertFalse(any(word in key.lower() for word in ("price", "cost", "margin", "secret", "password", "token", "cookie", "reference")), key)
            assert_public(test, child)
    elif isinstance(value, list):
        for child in value:
            assert_public(test, child)


class CatalogTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="switches-catalog-test-")
        self.addCleanup(self.temp.cleanup)
        database.DB_PATH = str(Path(self.temp.name) / "store.db")
        database.init_db()
        catalog._remote_cache = None
        catalog.init_catalog()

    def test_seed_is_idempotent_and_unique(self):
        catalog.init_catalog()
        products = catalog.list_subscriptions()
        self.assertEqual(len(products), 20)
        self.assertEqual(len({item["slug"] for item in products}), 20)
        self.assertEqual(sum(item["slug"] == "google-gemini-pro-3-months" for item in products), 1)

    def test_public_projection_excludes_actual_internal_values(self):
        item = catalog.list_subscriptions()[0]
        item.update(internalCost=7.89, internalReferencePrice=1234.56, internalNote="supplier only")
        catalog.save_subscription(item, item["id"])
        public = catalog.list_subscriptions(public=True)
        assert_public(self, [{key: value for key, value in row.items() if key != "priceOnRequest"} for row in public])
        self.assertNotIn("1234.56", json.dumps(public))
        self.assertEqual(catalog.list_subscriptions()[0]["internalReferencePrice"], 1234.56)

    def test_public_remote_subscription_also_uses_allowlist(self):
        item = catalog.list_subscriptions()[0]
        item.update(price=9999, old_price=12000, supplier_price=42, margin=3, api_secret="private")
        public = catalog.public_subscription(item)
        self.assertTrue(public.pop("priceOnRequest"))
        assert_public(self, public)

    def test_public_options_keep_inventory_but_strip_variant_prices_and_credentials(self):
        item = catalog.list_subscriptions()[0]
        item["specs"]["_productOptions"] = {"variants": [{"id":"annual", "options":{"duration":"12 months", "supplierPassword":"private"}, "stockQty":3, "price":99, "internalCost":42, "password":"private"}]}
        public = catalog.public_subscription(item)
        variant = public["specs"]["_productOptions"]["variants"][0]
        self.assertEqual(variant["stockQty"], 3)
        self.assertEqual(variant["options"], {"duration":"12 months"})
        self.assertNotIn("price", variant)
        public.pop("priceOnRequest")
        assert_public(self, public)

    def test_editing_a_subscription_preserves_existing_option_data(self):
        item = catalog.list_subscriptions()[0]
        item["specs"]["_productOptions"] = {"variants":[{"id":"annual", "options":{"duration":"12 months"}, "stockQty":2}]}
        catalog.save_subscription(item,item["id"])
        saved = next(row for row in catalog.list_subscriptions() if row["id"] == item["id"])
        self.assertEqual(saved["specs"]["_productOptions"], item["specs"]["_productOptions"])

    def test_unknown_regions_and_credentials_are_not_invented(self):
        products = {item["slug"]: item for item in catalog.list_subscriptions()}
        for slug in ("chatgpt-plus-1-month", "windows-11-pro-pc", "office-2024-ltsc-professional-plus", "claude-service-reference-100", "claude-service-reference-250"):
            self.assertEqual(catalog.digital(products[slug])["region"], "")
            self.assertEqual(products[slug]["availability"], "unavailable")
        self.assertEqual(catalog.digital(products["google-gemini-pro-18-months-brazil"])["region"], "BRAZIL")

    def test_bundle_has_no_lifetime_claim(self):
        item = next(item for item in catalog.list_subscriptions(public=True) if catalog.digital(item)["productType"] == "BUNDLE")
        self.assertEqual(len(catalog.digital(item)["bundleServices"]), 2)
        self.assertNotIn("lifetime", json.dumps(item).lower())

    def test_admin_hide_delete_update_and_seed_do_not_restore(self):
        item = catalog.list_subscriptions()[0]
        item["availability"] = "hidden"
        item["slug"] = "changed-slug"
        catalog.save_subscription(item, item["id"])
        self.assertNotIn(item["id"], [row["id"] for row in catalog.list_subscriptions(public=True)])
        catalog.delete_subscription(item["id"])
        catalog.init_catalog()
        self.assertEqual(len(catalog.list_subscriptions()), 19)

    def test_admin_rejects_secret_fields(self):
        item = catalog.list_subscriptions()[0]
        for forbidden in ({"password":"value"}, {"specs":{"api_key":"value"}}, {"description":"sk-abcdefghijklmnopqrstuvwxyz123456"}):
            with self.assertRaises(ValueError):
                catalog.save_subscription({**item, **forbidden}, item["id"])

    def test_gifts_keep_values_and_private_prices(self):
        gifts = catalog.local_gifts(admin=True)
        playstation = next(item for item in gifts if item["slug"] == "playstation")
        denomination = next(item for item in playstation["denominations"] if item["value"] == 50)
        catalog.change_local_denomination({"faceValue":50,"sellingPriceLYD":9876,"isAvailable":True}, denomination_id=denomination["id"])
        self.assertIn("9876", json.dumps(catalog.local_gifts(admin=True)))
        public = catalog.public_gifts()
        assert_public(self, public)
        self.assertNotIn("9876", json.dumps(public))
        ps = next(item for item in public["platforms"] if item["id"] == "playstation")
        self.assertIn(50, [item["value"] for item in ps["regions"][0]["denominations"]])
        shein = next(item for item in public["platforms"] if item["id"] == "shein")
        self.assertEqual([item["value"] for item in shein["regions"][0]["denominations"]], [300,500,1000])

    def test_shared_notice_is_editable(self):
        self.assertEqual(catalog.settings()["dynamic_price_notice"], catalog.DEFAULT_NOTICE)
        catalog.save_notice({"dynamic_price_notice":"نص سعر مشترك للاختبار"})
        self.assertEqual(catalog.public_settings()["dynamic_price_notice"], "نص سعر مشترك للاختبار")
        catalog.save_notice({"gift_cards_whatsapp_purchase_number":"+218 93 185 3169"})
        self.assertEqual(catalog.public_settings()["gift_cards_whatsapp_purchase_number"], "218931853169")

    def test_duplicate_slug_is_not_inserted(self):
        with self.assertRaises(sqlite3.IntegrityError):
            catalog.save_subscription(catalog.list_subscriptions()[0])

    def test_homepage_products_keep_existing_camel_case_contract(self):
        row = {"id":7,"name":"Existing PC","price":55,"old_price":70,"images_json":["/image.webp"],"tags_json":["freeShipping"],"specs_json":{},"status":"published","is_active":True}
        catalog._remote_cache = {"products":[row],"settings":[],"gifts":[],"denominations":[],"sections":[{"section_key":"best_selling","title":"Products"}],"items":[{"section_key":"best_selling","product_id":7,"slot_index":1}]}
        import time
        catalog._remote_time = time.monotonic()
        bootstrap = catalog.public_bootstrap()
        product = bootstrap["homepageSections"][0]["items"][0]["product"]
        self.assertEqual(product["images"], ["/image.webp"])
        self.assertEqual(product["oldPrice"], 70)
        self.assertEqual(product["tags"], ["freeShipping"])
        self.assertEqual(product["price"], 55)


if __name__ == "__main__":
    unittest.main(verbosity=2)
