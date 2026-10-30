import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

// sf-property-view on simai.property-view-port 1.17.0 (consumer Larena,
// msg-4208ef91ae5442ceb44b): a field of propertyType html is formatted text,
// drawn by the Framework's field renderers with sf-rich-text. The view only
// declares the port; the renderer set does the drawing.
test('the view declares port 1.17.0 and says what html is', () => {
  const manifest = JSON.parse(read('src/smart/property-view/smart.manifest.json'));
  assert.equal(manifest.composition.declarative.host_port.version, '1.17.0');
  assert.ok(manifest.compatibility.migrations.some((step) => step.from === '1.7.9' && step.to === '1.8.0'));
  const port = JSON.parse(read('src/core/contracts/ports/simai.property-view-port/1.17.0/port.json'));
  assert.equal(port.version, '1.17.0');
  assert.match(JSON.stringify(port), /`html`/u);
});
