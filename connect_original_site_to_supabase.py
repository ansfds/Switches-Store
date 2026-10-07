from pathlib import Path
import shutil
import sys

INDEX = Path("index.html")
BACKUP = Path("index.backup-before-supabase.html")

SUPABASE_URL = "https://ctxlyttbtzivlabqbsvz.supabase.co"
SUPABASE_PUBLISHABLE_KEY = "sb_publishable_1O75zgDfOlE8BJXGLalv2g_DKb8fn7T"

if not INDEX.exists():
    print("ERROR: index.html not found. Run this script inside the Switches folder.")
    sys.exit(1)

text = INDEX.read_text(encoding="utf-8-sig")

if "async function loadProductsFromSupabase()" in text:
    print("ALREADY CONNECTED: Supabase loader already exists in index.html")
    sys.exit(0)

old_listener = """    // ===== تهيئة التطبيق =====
    document.addEventListener('DOMContentLoaded', function() {
      initApp();
    });
"""

if old_listener not in text:
    print("ERROR: Could not find the expected app initialization block.")
    print("No changes were made.")
    sys.exit(1)

if "const allProducts = [" not in text or "const sortedProducts = sortProductsByAvailability(allProducts);" not in text:
    print("ERROR: Expected product arrays were not found.")
    print("No changes were made.")
    sys.exit(1)

loader = f"""    // ===== ربط المنتجات بـ Supabase =====
    async function loadProductsFromSupabase() {{
      const supabaseUrl = {SUPABASE_URL!r};
      const publishableKey = {SUPABASE_PUBLISHABLE_KEY!r};

      const fields = [
        'id','name','short_description','description','category','brand',
        'price','old_price','condition','images_json','specs_json','tags_json',
        'availability','slug','sort_order','status','is_active','is_deleted'
      ].join(',');

      const endpoint =
        `${{supabaseUrl}}/rest/v1/products` +
        `?select=${{encodeURIComponent(fields)}}` +
        `&is_active=eq.true&is_deleted=eq.false&status=eq.published` +
        `&order=sort_order.asc,id.desc`;

      const response = await fetch(endpoint, {{
        headers: {{
          apikey: publishableKey,
          Authorization: `Bearer ${{publishableKey}}`,
          Accept: 'application/json'
        }},
        cache: 'no-store'
      }});

      if (!response.ok) {{
        throw new Error(`Supabase products request failed: ${{response.status}} ${{await response.text()}}`);
      }}

      const rows = await response.json();
      if (!Array.isArray(rows) || rows.length === 0) {{
        throw new Error('Supabase returned no products; keeping the built-in fallback products.');
      }}

      const mappedProducts = rows.map(row => ({{
        id: Number(row.id),
        name: row.name || '',
        category: row.category || '',
        brand: row.brand || '',
        price: Number(row.price) || 0,
        oldPrice: row.old_price === null || row.old_price === undefined ? null : Number(row.old_price),
        condition: row.condition || 'جديد',
        images: Array.isArray(row.images_json) ? row.images_json : [],
        description: row.description || row.short_description || '',
        specs: row.specs_json && typeof row.specs_json === 'object' && !Array.isArray(row.specs_json)
          ? row.specs_json
          : {{}},
        tags: Array.isArray(row.tags_json) ? row.tags_json : [],
        availability: row.availability || 'available',
        slug: row.slug || '',
        colorSelectionEnabled: false,
        colors: []
      }}));

      allProducts.splice(0, allProducts.length, ...mappedProducts);

      productOriginalOrder.clear();
      allProducts.forEach((product, index) => {{
        productOriginalOrder.set(product.id, index);
        Object.assign(
          product,
          {{ colorSelectionEnabled: false, colors: [] }},
          (typeof productOptionOverrides !== 'undefined' && productOptionOverrides[product.id]) || {{}}
        );
      }});

      const refreshedSortedProducts = sortProductsByAvailability(allProducts);
      sortedProducts.splice(0, sortedProducts.length, ...refreshedSortedProducts);

      window.__SWITCHES_SUPABASE_PRODUCTS_LOADED__ = true;
      console.info(`Switches Store: loaded ${{allProducts.length}} products from Supabase.`);
    }}

    // ===== تهيئة التطبيق =====
    document.addEventListener('DOMContentLoaded', async function() {{
      try {{
        await loadProductsFromSupabase();
      }} catch (error) {{
        console.error('Switches Store: Supabase load failed; using built-in fallback products.', error);
      }}
      initApp();
    }});
"""

if not BACKUP.exists():
    shutil.copy2(INDEX, BACKUP)

text = text.replace(old_listener, loader, 1)
INDEX.write_text(text, encoding="utf-8")

print("SUCCESS")
print("index.html is now connected to Supabase products.")
print(f"Backup created: {BACKUP.name}")
print("Next: git add index.html && git commit && git push")
