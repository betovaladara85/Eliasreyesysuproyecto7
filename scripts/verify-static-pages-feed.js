'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const script = fs.readFileSync('public/p7-publicaciones.js', 'utf8');
new vm.Script(script, { filename: 'p7-publicaciones.js' });

const pages = [
  ['index.html', './public/p7-publicaciones.js'],
  ['public/index.html', './p7-publicaciones.js'],
];
const publicKeys = new Set();
for (const [file, src] of pages) {
  const page = fs.readFileSync(file, 'utf8');
  assert.ok(page.includes('src="' + src + '"'), 'Missing browser script in ' + file);
  const match = page.match(/<meta name="p7-supabase-public-key" content="([^"]+)">/);
  assert.ok(match, 'Missing browser public key in ' + file);
  assert.match(match[1], /^sb_publishable_[a-zA-Z0-9_-]+$/, 'Only public keys allowed');
  assert.ok(!page.includes('sb_secret_'), 'Never expose secret keys');
  assert.ok(!page.includes('service_role'), 'Never expose service role');
  publicKeys.add(match[1]);
}
assert.equal(publicKeys.size, 1, 'Both public web pages must use the same project');

function createElement(tagName) {
  return {
    tagName: tagName.toLowerCase(),
    children: [], hidden: true, style: {}, textContent: '',
    append(...items) { this.children.push(...items); },
    setAttribute(name, value) { this[name] = value; },
  };
}

async function runScenario({ media, agenda, status = 200 }) {
  const elements = Object.fromEntries([
    'p7-web-contenido', 'p7-web-multimedia',
    'p7-web-calendario', 'p7-web-fechas',
  ].map(id => [id, createElement('div')]));
  const called = [];
  const document = {
    getElementById: id => elements[id] || null,
    querySelector: selector => selector.includes('p7-supabase-public-key') ? { content: Array.from(publicKeys)[0] } : null,
    createElement,
  };
  async function fetch(url, options) {
    called.push({ url, options });
    if (url.includes('/rest/v1/p7_web_media')) return { ok: status === 200, json: async () => media };
    if (url.includes('/rest/v1/p7_web_agenda')) return { ok: status === 200, json: async () => agenda };
    if (url.includes('/storage/v1/object/sign/p7-web-media/')) {
      return { ok: true, json: async () => ({
        signedURL: '/object/sign/p7-web-media/fotos/a85c0c7d-580d-41fb-a0f6-5a967d9e99c1.jpg?token=publicapproved',
      }) };
    }
    throw Error('Unexpected request ' + url);
  }
  vm.runInNewContext(script, { document, fetch, Intl, Date, Object, String, Promise, console }, { filename: 'p7-publicaciones.js' });
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));
  return { elements, called };
}

(async () => {
  const empty = await runScenario({ media: [], agenda: [] });
  assert.equal(empty.elements['p7-web-contenido'].hidden, true, 'No public content means no public section');

  const media = [{
    kind: 'foto', storage_path: 'fotos/a85c0c7d-580d-41fb-a0f6-5a967d9e99c1.jpg',
    title: 'Concierto Proyecto 7', alt: 'Integrantes tocando', category: 'eventos',
  }];
  const agenda = [{
    title: 'Presentación del grupo', place_public: 'Mérida',
    date_public: '2099-02-03', time_public: '20:00:00',
  }];
  const withData = await runScenario({ media, agenda });
  assert.equal(withData.elements['p7-web-contenido'].hidden, false);
  assert.equal(withData.elements['p7-web-calendario'].hidden, false);
  assert.equal(withData.elements['p7-web-multimedia'].children.length, 1);
  assert.equal(withData.elements['p7-web-fechas'].children.length, 1);
  const figure = withData.elements['p7-web-multimedia'].children[0];
  assert.equal(figure.children[0].tagName, 'img');
  assert.ok(figure.children[0].src.includes('/storage/v1/object/sign/p7-web-media/'));
  assert.equal(figure.children[1].textContent, 'Concierto Proyecto 7');
  assert.ok(withData.called.some(c => c.url.includes('p7_web_media?') && c.url.includes('published=eq.true')));
  assert.ok(withData.called.some(c => c.url.includes('p7_web_agenda?') && c.url.includes('published=eq.true')));
  assert.ok(withData.called.every(c => c.options.headers.apikey.startsWith('sb_publishable_')));
  assert.ok(withData.called.every(c => !c.options.headers.Authorization));
  const failed = await runScenario({ media: [], agenda: [], status: 503 });
  assert.equal(failed.elements['p7-web-contenido'].hidden, true, 'API errors do not leak content');

  console.log('GitHub Pages + Supabase public feed: syntax, public-only key, privacy and rendering checks passed.');
})().catch(e => { console.error(e); process.exitCode = 1; });
