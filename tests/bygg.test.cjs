const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('A15 price totals match linked, unique, selected parts', () => {
  const bom = JSON.parse(fs.readFileSync('dist/bygg/bom.json', 'utf8'));
  const page = fs.readFileSync('dist/bygg/index.html', 'utf8');
  const routes = JSON.parse(fs.readFileSync('vercel.json', 'utf8')).rewrites;
  assert.equal(bom.items.length, 12);
  assert.equal(new Set(bom.items.map(item => item.id)).size, bom.items.length);
  assert.equal(Math.round(bom.items.reduce((sum, item) => sum + item.qty * item.unit_price, 0) * 100) / 100, bom.published_item_subtotal);
  assert.equal(bom.norway_comparison.items.reduce((sum, item) => sum + item.unit_price, 0), bom.norway_comparison.published_item_subtotal);
  assert.ok(bom.items.every(item => item.qty === 1 && item.unit_price > 0 && item.url.startsWith('https://')));
  assert.ok(bom.unpriced_product_parts.every(item => item.gate));
  assert.match(page, /USD 3 883,52/);
  assert.match(page, /kr 54 161/);
  assert.ok(routes.some(route => route.source === '/bygg' && route.destination === '/bygg/index.html'));
});
