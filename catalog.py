import json
import os


BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CATALOG_PATH = os.path.join(BASE_DIR, "data", "gift-cards.json")


class CatalogError(Exception):
    pass


def load_catalog():
    with open(CATALOG_PATH, "r", encoding="utf-8") as catalog_file:
        data = json.load(catalog_file)
    return data.get("platforms", [])


def denomination_key(value):
    return str(value)


def find_selection(product_id, region_id, denomination_value):
    product_id = str(product_id or "")
    region_id = str(region_id or "")
    denomination_value = denomination_key(denomination_value)

    for platform in load_catalog():
        if platform.get("id") != product_id:
            continue
        if not platform.get("available"):
            raise CatalogError("product_unavailable")
        for region in platform.get("regions", []):
            if region.get("id") != region_id:
                continue
            if not region.get("available"):
                raise CatalogError("region_unavailable")
            for denomination in region.get("denominations", []):
                if denomination_key(denomination.get("value")) != denomination_value:
                    continue
                if not denomination.get("available"):
                    raise CatalogError("denomination_unavailable")
                return {
                    "product_id": platform["id"],
                    "product_name": platform.get("name", platform["id"]),
                    "region_id": region["id"],
                    "region_name": region.get("label") or region.get("name") or region["id"],
                    "region_currency": region.get("currency", ""),
                    "denomination_value": denomination.get("value"),
                    "denomination_currency": region.get("currency", ""),
                    "selling_price_lyd": denomination.get("sellingPriceLYD"),
                }
            raise CatalogError("denomination_not_found")
        raise CatalogError("region_not_found")
    raise CatalogError("product_not_found")
