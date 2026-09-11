import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const integration = readFileSync(new URL('../components/TranslateJs.tsx', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');
const home = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
const docs = readFileSync(new URL('../app/docs/page.tsx', import.meta.url), 'utf8');

test('loads the documented pinned translate.js CDN in the browser', () => {
  assert.match(integration, /next\/script/);
  assert.match(integration, /https:\/\/cdn\.staticfile\.net\/translate\.js\/3\.18\.66\/translate\.js/);
  assert.match(integration, /strategy="afterInteractive"/);
  assert.match(integration, /setLocal\('english'\)/);
  assert.match(integration, /service\.use\('client\.edge'\)/);
});

test('loads translation only on public Home and Docs pages', () => {
  assert.match(integration, /pathname === '\/' \|\| pathname === '\/docs'/);
  assert.match(integration, /if \(!isPublicTranslationRoute\) return null/);
  assert.match(home, /data-translate-content="true"/);
  assert.match(docs, /data-translate-content="true"/);
  assert.match(layout, /<TranslateJs \/>/);
});

test('credits translate.js and its creator on public translated pages', () => {
  assert.match(home, /Guan Leiming \(xnx3\)/);
  assert.match(docs, /Guan Leiming \(xnx3\)/);
  assert.match(home, /https:\/\/github\.com\/xnx3\/translate/);
});
