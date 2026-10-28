const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const dist = path.join(root, 'dist');
// Only the resolved build output directly inside this checkout can be cleaned.
if (path.dirname(dist) !== root || path.basename(dist) !== 'dist' || fs.lstatSync(root).isSymbolicLink()) throw new Error('Invalid build directory');
if (fs.existsSync(dist) && fs.lstatSync(dist).isSymbolicLink()) throw new Error('Build directory must not be a symlink');
if (fs.existsSync(dist)) {
  if (path.relative(fs.realpathSync(root), fs.realpathSync(dist)) !== 'dist') throw new Error('Build output is outside the checkout');
  fs.rmSync(dist, { recursive: true, force: true });
}
fs.mkdirSync(dist, { recursive: true });
function copyDirectory(source,target) {
  fs.mkdirSync(target,{recursive:true});
  for(const item of fs.readdirSync(source,{withFileTypes:true})) {
    const from=path.join(source,item.name),to=path.join(target,item.name);
    if(item.isDirectory())copyDirectory(from,to);else if(item.isFile())fs.copyFileSync(from,to);
  }
}
for (const dir of ['assets', 'images', 'shared', 'admin']) copyDirectory(path.join(root, dir), path.join(dist, dir));
for (const file of fs.readdirSync(root)) {
  if (fs.statSync(path.join(root, file)).isFile() && (/\.(?:js|css)$/.test(file) || ['index.html','robots.txt','sitemap.xml','schema.sql','products-original.json','google673219dd9b8ad415.html','local-server.py','database.py','catalog.py','unified_catalog_bridge.py','store_catalog.py','fulfillment.py','gift_card_provider.py'].includes(file))) fs.copyFileSync(path.join(root, file), path.join(dist, file));
}
fs.mkdirSync(path.join(dist, 'data'), { recursive: true });
for (const file of ['store-visuals.json', 'gift-cards.json', 'subscriptions-seed.json']) fs.copyFileSync(path.join(root, 'data', file), path.join(dist, 'data', file));
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const sections = [
  ['minecraft', 'Minecraft | Switches Store', 'ألعاب Minecraft وإصداراتها لدى سويتشز ستور. تصفح تفاصيل المنصة والنسخة ومنطقة التفعيل.'],
  ['subscriptions', 'الاشتراكات والمنتجات الرقمية | Switches Store', 'مفاتيح البرامج والاشتراكات والخدمات الرقمية لدى سويتشز ستور.'],
];
const images = JSON.parse(fs.readFileSync(path.join(root, 'data/store-visuals.json'), 'utf8'));
const attr = value => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
for (const [slug, title, description] of sections) {
  const canonical = `https://www.switches-store.ly/${slug}`;
  const image = new URL(images[slug].heroBackground, canonical).href;
  let content = html.replace(/<title>([^<]*)<\/title>/, (_, homeTitle) => `<title data-home-title="${attr(homeTitle)}">${title}</title>`);
  for (const [keys, value] of [['description',description],['og:title|twitter:title',title],['og:description|twitter:description',description],['og:url',canonical],['og:image|og:image:secure_url|twitter:image',image]]) {
    const pattern = new RegExp(`(<meta\\s+(?:name|property)="(?:${keys})"\\s+)content="([^"]*)"`, 'g');
    content = content.replace(pattern, (_, prefix, homeValue) => `${prefix}data-home-content="${attr(homeValue)}" content="${attr(value)}"`);
  }
  content = content.replace(/<meta\s+property="og:image:(?:width|height)"[^>]*>/g, '');
  content = content.replace('</head>', `<link rel="canonical" href="${canonical}" data-section-entry>\n</head>`);
  fs.mkdirSync(path.join(dist, slug), { recursive: true });
  fs.writeFileSync(path.join(dist, slug, 'index.html'), content);
}
fs.writeFileSync(path.join(dist, '_redirects'), '/minecraft/* /minecraft/index.html 200\n/subscriptions/* /subscriptions/index.html 200\n/gift-cards/* /index.html 200\n/checkout/* /index.html 200\n/account/* /index.html 200\n/favorites /index.html 200\n');
fs.writeFileSync(path.join(dist, 'LOCAL-README.txt'), 'Run: python local-server.py 8000\nKeep .env and runtime databases outside build artifacts. Catalog: start the local FastAPI admin on 8001 and configure SWITCHES_CATALOG_API_URL plus SWITCHES_CATALOG_DB. Catalog files are seed inputs only. No deployment was performed.\n');
console.log(`PASS: production files generated at ${dist}; both section entry pages and detail-route fallbacks included. No .env, database, or test fixtures copied.`);
