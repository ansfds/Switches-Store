(function (root) {
  'use strict';
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const text = value => String(value ?? '').trim();
  const labels = { color: 'اللون', size: 'الحجم', capacity: 'السعة', region: 'المنطقة', platform: 'المنصة', duration: 'المدة', activationMethod: 'طريقة التفعيل', connection: 'نوع الاتصال', edition: 'الإصدار', denomination: 'الفئة' };
  function stock(source = {}) {
    if (source.trackStock === false || source.track_stock === false) return null;
    const raw = source.stockQty ?? source.stock_qty ?? source.stock;
    return raw !== '' && raw != null && Number.isFinite(Number(raw)) ? Math.max(0, Math.floor(Number(raw))) : null;
  }
  function live(source = {}) {
    return source.available !== false && !['unavailable','comingsoon','hidden','outofstock'].includes(text(source.availability).replace(/[_\s-]/g, '').toLowerCase()) && stock(source) !== 0;
  }
  function attributes(value) {
    const entries = Array.isArray(value) ? value.map(item => [item.name || item.key, item.value]) : Object.entries(object(value));
    return Object.fromEntries(entries.filter(([key,value]) => key && value != null && text(value)).map(([key,value]) => [key,text(value)]));
  }
  function variants(product = {}) {
    const specs = object(product.specs || product.specs_json);
    const options = object(specs._productOptions);
    const rows = product.variants || specs.variants || options.variants;
    if (Array.isArray(rows) && rows.length) return rows.map((row,index) => ({ ...row, id: text(row.id ?? row.sku ?? index), options: attributes(row.options || row.attributes) })).filter(row => Object.keys(row.options).length);
    const colors = product.colors?.length ? product.colors : (specs.colors || options.colors);
    return Array.isArray(colors) ? colors.map((color,index) => {
      const row = typeof color === 'string' ? { name:color } : color;
      return { ...row, id:text(row.id ?? `color-${index}`), options:{ color:text(row.name || row.value) } };
    }).filter(row => row.options.color) : [];
  }
  function groups(product) {
    const result = new Map();
    for (const variant of variants(product)) for (const [key,value] of Object.entries(variant.options)) {
      if (!result.has(key)) result.set(key,new Set());
      result.get(key).add(value);
    }
    const custom = object((product.specs || product.specs_json)?._productOptions?.labels);
    return [...result].map(([key,values]) => ({ key, label:text(custom[key]) || labels[key] || key, values:[...values] }));
  }
  function resolve(product, selection) {
    return variants(product).find(row => Object.entries(selection).every(([key,value]) => row.options[key] === value)) || null;
  }
  function inventory(product, variant = null) {
    const limits = [stock(product), stock(variant || {})].filter(value => value !== null);
    const limit = limits.length ? Math.min(...limits) : null;
    return { available: live(product) && (!variants(product).length || Boolean(variant && live(variant))) && limit !== 0, limit };
  }
  function specs(product) {
    return Object.entries(object(product.specs || product.specs_json)).filter(([key,value]) => !key.startsWith('_') && !['variants','colors','reviews','benefits','reviewUrl'].includes(key) && value != null && text(value) && (typeof value !== 'object' || (Array.isArray(value) && value.every(item => typeof item !== 'object')))).map(([key,value]) => [key,Array.isArray(value) ? value.join(' · ') : text(value)]);
  }
  const api = Object.freeze({ labels, stock, live, variants, groups, resolve, inventory, specs });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SwitchesProductOptions = api;
})(typeof window === 'object' ? window : globalThis);
