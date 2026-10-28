from unified_catalog_bridge import catalog_record,selection

class CatalogError(Exception):
    pass

def load_catalog():
    return catalog_record()

def denomination_key(value):
    return str(value)

def find_selection(product_id,region_id,denomination_value):
    try:
        return selection(product_id,region_id,denomination_value)
    except (ValueError,RuntimeError) as error:
        raise CatalogError(str(error)) from error
