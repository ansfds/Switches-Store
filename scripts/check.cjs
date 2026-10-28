const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
let count = 0;
for (const dir of ['', 'shared', 'admin', 'scripts', 'tests']) {
  for (const file of fs.readdirSync(path.join(root, dir))) {
    if (!/\.(?:js|cjs)$/.test(file)) continue;
    new vm.Script(fs.readFileSync(path.join(root, dir, file), 'utf8'), { filename: path.join(dir, file) });
    count++;
  }
}
for (const file of ['index.html', 'admin/index.html']) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/type=["']application\/ld\+json/.test(match[1])) JSON.parse(match[2]);
    else if (!/src=/.test(match[1])) { new vm.Script(match[2], { filename: `${file}:inline` }); count++; }
  }
  for (const match of html.matchAll(/(?:src|href)=["'](\/[^"'?#]+\.(?:js|css))["']/g)) {
    if (!fs.existsSync(path.join(root, match[1]))) throw new Error(`Missing asset: ${match[1]}`);
  }
}
const images = JSON.parse(fs.readFileSync(path.join(root, 'data/store-visuals.json'), 'utf8'));
for (const value of [...Object.values(images.sections), images.minecraft.heroBackground, images.subscriptions.heroBackground]) {
  if (value.startsWith('/') && !fs.existsSync(path.join(root, value))) throw new Error(`Missing image: ${value}`);
}
console.log(`PASS: ${count} JavaScript files/inline scripts, structured metadata, local script/style references, and section images.`);
