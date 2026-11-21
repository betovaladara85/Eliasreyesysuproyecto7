'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const server = fs.readFileSync('server.js', 'utf8');
new vm.Script(server, { filename: 'server.js' });
assert.ok(server.includes("app.get('/api/web/publicaciones'"), 'Missing public Manager API endpoint');
assert.ok(server.includes('p7_web_agenda?select=title,place_public,date_public,time_public'), 'Missing public event projection');
assert.ok(server.includes('p7_web_media?select=kind,storage_path,title,alt,category,sort_order'), 'Missing approved media projection');
assert.ok(server.includes('MANAGER_SUPABASE_PUBLIC_KEY'), 'Missing publishable API credential configuration');
assert.ok(!server.includes('SUPABASE_SERVICE_ROLE_KEY'), 'Public web must not use service role');
let count = 0;
for (const filename of ['index.html', 'public/index.html']) {
  const html = fs.readFileSync(filename, 'utf8');
  assert.ok(html.includes('id="p7-web-multimedia"'), filename + ' missing multimedia gallery');
  assert.ok(html.includes('id="p7-web-fechas"'), filename + ' missing public schedule');
  assert.ok(html.includes('/api/web/publicaciones'), filename + ' missing public endpoint connection');
  let local = 0;
  const re = new RegExp('<script>([\\s\\S]*?)<\\/script>', 'g');
  for (const match of html.matchAll(re)) {
    new vm.Script(match[1], { filename: filename + ' inline script ' + (++local) });
  }
  assert.ok(local > 0, filename + ' missing browser scripts');
  count += local;
}
console.log('Verified Manager public content in both homepages and ' + count + ' browser scripts.');
