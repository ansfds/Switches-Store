(function (root) {
  'use strict';
  const META_KEY = '_switchesDigital';
  const SECTIONS = Object.freeze({ PC_PART: 'PC PARTS', MINECRAFT: 'Minecraft', SUBSCRIPTION: 'الاشتراكات' });
  const TYPES = Object.freeze({ KEY: 'مفتاح', ACCOUNT: 'حساب', GIFT: 'هدية رقمية', SUBSCRIPTION: 'اشتراك', SERVICE: 'خدمة', BUNDLE: 'باقة' });
  const text = value => String(value ?? '').trim();
  const truth = value => value === true || value === 1 || value === 'true' || value === '1';
  const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

  function metadata(product = {}) {
    const specs = object(product.specs || product.specs_json);
    const stored = object(specs[META_KEY]);
    const data = { ...stored, ...object(product.digital) };
    const section = text(product.categoryType || product.category_type || data.categoryType).toUpperCase();
    const type = text(data.productType || product.product_type).toUpperCase();
    return {
      categoryType: Object.hasOwn(SECTIONS, section) ? section : 'PC_PART',
      productType: Object.hasOwn(TYPES, type) ? type : '',
      platform: text(data.platform), region: text(data.region), activationCountry: text(data.activationCountry),
      duration: section === 'SUBSCRIPTION' || type === 'SUBSCRIPTION' ? text(data.duration) : '',
      activationMethod: text(data.activationMethod), family: text(data.family), catalogCategory: text(data.catalogCategory),
      bundleServices: (Array.isArray(data.bundleServices) ? data.bundleServices : []).filter(item => item && item.name).map(item => ({ name: text(item.name), duration: text(item.duration) })),
      deliveryMethod: text(data.deliveryMethod), edition: text(data.edition),
      features: (Array.isArray(data.features) ? data.features : []).map(text).filter(Boolean).slice(0, 12),
      featured: truth(data.featured ?? product.featured),
    };
  }

  function isDigital(product) { return metadata(product).categoryType !== 'PC_PART'; }
  function isPcPart(product) { return !isDigital(product); }
  function route(product) {
    const section = metadata(product).categoryType;
    if (section === 'PC_PART') return `/?product=${encodeURIComponent(product.id)}`;
    return `/${section === 'MINECRAFT' ? 'minecraft' : 'subscriptions'}/${encodeURIComponent(product.slug || product.id)}`;
  }
  function compare(a, b) {
    return (Number(a.sortOrder ?? a.sort_order) || 0) - (Number(b.sortOrder ?? b.sort_order) || 0)
      || Number(metadata(b).featured) - Number(metadata(a).featured)
      || String(a.id).localeCompare(String(b.id), 'en', { numeric: true });
  }
  function inSection(products, section) {
    return products.filter(product => metadata(product).categoryType === section
      && product.isActive !== false && product.is_active !== false
      && !product.isDeleted && !product.is_deleted
      && String(product.availability || '').toLowerCase() !== 'hidden'
      && (!product.status || product.status === 'published')).sort(compare);
  }
  function discount(product) {
    const price = Number(product.price), oldPrice = Number(product.oldPrice ?? product.old_price);
    return Number.isFinite(price) && oldPrice > price && price >= 0 ? Math.round((1 - price / oldPrice) * 100) : 0;
  }
  function regionClass(region) {
    const normalized = text(region).toUpperCase();
    if (normalized === 'GLOBAL') return 'global';
    if (['UNITED STATES', 'US', 'USA'].includes(normalized)) return 'us';
    if (['EUROPE', 'EU'].includes(normalized)) return 'europe';
    if (['BRAZIL', 'BR'].includes(normalized)) return 'brazil';
    return 'other';
  }
  function specsWithoutMetadata(product) {
    const specs = { ...object(product.specs || product.specs_json) };
    delete specs[META_KEY];
    return specs;
  }
  function storeMetadata(specs, data) {
    const result = { ...object(specs) };
    delete result[META_KEY];
    if (data.categoryType !== 'PC_PART') result[META_KEY] = metadata({ digital: data });
    return result;
  }
  const api = Object.freeze({ META_KEY, SECTIONS, TYPES, metadata, isDigital, isPcPart, route, compare, inSection, discount, regionClass, specsWithoutMetadata, storeMetadata });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SwitchesProductSections = api;
})(typeof window === 'object' ? window : globalThis);
