const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const model = require('../shared/product-sections.js');
const product = (id, categoryType, fields = {}) => ({ id, name: `Product ${id}`, specs: model.storeMetadata({}, { categoryType, ...fields }) });

test('existing products stay in PC Parts; names and categories never imply a digital section', () => {
  for (const row of [{}, { name: 'Minecraft', category: 'Minecraft' }, { categoryType: 'unknown' }]) assert.equal(model.metadata(row).categoryType, 'PC_PART');
});
test('only explicitly configured regions and product types are returned', () => {
  const data = model.metadata(product(1, 'MINECRAFT'));
  assert.equal(data.region, ''); assert.equal(data.productType, ''); assert.equal(data.featured, false);
  assert.equal(model.regionClass('GLOBAL'), 'global'); assert.equal(model.regionClass('EUROPE'), 'europe');
  assert.equal(model.regionClass('UNITED STATES'), 'us'); assert.equal(model.regionClass('Other'), 'other');
  for (const type of Object.keys(model.TYPES)) assert.equal(model.metadata(product(1, 'SUBSCRIPTION', { productType: type })).productType, type);
});
test('shared product table preserves metadata through the actual Supabase mapper', async () => {
  const row = { id: 7, name: 'Software', images_json: ['/image.webp'], specs_json: model.storeMetadata({ note: 'keep' }, { categoryType: 'SUBSCRIPTION', productType: 'SUBSCRIPTION', duration: '3 أشهر', region: 'EUROPE', featured: true }), price: 20, sort_order: 2, status: 'published', is_active: true };
  const context = vm.createContext({ window: { SWITCHES_SUPABASE_CONFIG: { url: 'https://example.supabase.co', publishableKey: 'test-key' }, supabase: { createClient: () => ({ from: table => ({ select() { return this; }, eq() { return this; }, order() { return this; }, then(resolve) { resolve({ data: table === 'products' ? [row] : [], error: null }); } }) }) } }, console, URL, FormData, setTimeout, clearTimeout, Date });
  vm.runInContext(fs.readFileSync(require.resolve('../shared/supabase-client.js'), 'utf8'), context);
  const result = await context.window.SwitchesSupabaseStore.loadProductHomepageBootstrap();
  assert.ok(result);
  const loaded = result.products[0];
  assert.equal(model.metadata(loaded).duration, '3 أشهر');
  assert.equal(model.metadata(loaded).region, 'EUROPE');
  assert.equal(model.metadata(loaded).featured, true);
  assert.equal(loaded.sortOrder, 2);
  assert.equal(model.specsWithoutMetadata(loaded).note, 'keep');
});
test('section filtering excludes drafts/deleted/inactive and respects sort_order before Featured', () => {
  const rows = [product(4, 'PC_PART'), product(3, 'MINECRAFT', { featured: true }), { ...product(2, 'MINECRAFT'), sortOrder: -1 }, { ...product(1, 'MINECRAFT'), status: 'draft' }, { ...product(5, 'MINECRAFT'), is_active: false }, { ...product(6, 'MINECRAFT'), is_deleted: true }, product(7, 'MINECRAFT')];
  assert.deepEqual(model.inSection(rows, 'MINECRAFT').map(row => row.id), [2, 3, 7]);
});
test('account and bundle durations are preserved; PC metadata can be removed', () => {
  assert.equal(model.metadata(product(1, 'SUBSCRIPTION', { productType: 'ACCOUNT', duration: '12 شهر' })).duration, '12 شهر');
  assert.equal(model.metadata(product(1, 'MINECRAFT', { productType: 'KEY', duration: '12 شهر' })).duration, '');
  const specs = model.storeMetadata({ preserve: 'yes', [model.META_KEY]: {} }, { categoryType: 'PC_PART' });
  assert.deepEqual(specs, { preserve: 'yes' });
});
test('discounts and encoded detail URLs use actual product values', () => {
  assert.equal(model.discount({ price: 80, oldPrice: 100 }), 20);
  assert.equal(model.discount({ price: 120, oldPrice: 100 }), 0);
  assert.equal(model.discount({ price: 20 }), 0);
  assert.equal(model.route({ ...product(3, 'MINECRAFT'), slug: 'java bedrock' }), '/minecraft/java%20bedrock');
  assert.equal(model.route(product(4, 'SUBSCRIPTION')), '/subscriptions/4');
  assert.equal(model.route(product(5, 'PC_PART')), '/?product=5');
});
