import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync, readdirSync, existsSync} from 'node:fs';
import {resolve} from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');

const body = (source, signature) => {
  const start = source.search(signature);
  if (start < 0) return '';
  let depth = 0;
  for (let index = source.indexOf('{', start); index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  return '';
};

/* A component that takes a host port asks for one with sf-host-port-request,
   the shared convention (not the routing contract's ports, which are typed
   values between endpoints): bubbling and composed, detail {component,
   context: {owner, record, group}}, raised once per connection while it has
   no port, answered by setHostPort on the target. The once-per-connection
   flag is reset on disconnect, so an element moved in the DOM asks again;
   tests/browser/host-port-request.browser.mjs holds the behaviour. */
test('host port request: every component that takes a host port asks for one', () => {
  const owners = [];
  for (const name of readdirSync(resolve(root, 'src/smart'))) {
    const path = `src/smart/${name}/index.js`;
    if (!existsSync(resolve(root, path))) continue;
    const source = read(path);
    if (!/^\s+setHostPort\(\w+\)\s*\{/mu.test(source)) continue;
    owners.push(name);
    const events = JSON.parse(read(`src/smart/${name}/smart.manifest.json`)).events || {};
    assert.ok(events['sf-host-port-request'], `${name}: the manifest declares sf-host-port-request`);
    const ask = body(source, /^\s+_requestHostPort\(\)\s*\{/mu);
    assert.match(ask, /if \(this\.hostPort \|\| this\._portRequested\) return false;/u, `${name}: asks only without a port, once`);
    assert.match(ask, /new CustomEvent\("sf-host-port-request", \{\s*bubbles: true,\s*composed: true,/u, `${name}: bubbling and composed`);
    assert.match(ask, /context: \{owner: [^,]+, record: [^,]+, group: [^}]+\}/u, `${name}: context carries owner, record and group`);
    const disconnect = body(source, /^\s+(?:disconnectedCallback|onDisconnected)\(\)\s*\{/mu);
    assert.match(disconnect, /this\._portRequested = false;/u, `${name}: the flag resets on disconnect, not elsewhere`);
    const answer = body(source, /^\s+setHostPort\(\w+\)\s*\{/mu);
    assert.doesNotMatch(answer, /_portRequested/u, `${name}: setHostPort does not reset the flag`);
  }
  assert.ok(owners.length >= 2, `only ${owners.join(', ')} take a host port; the scan is not finding them`);
  assert.ok(read('docs/developer/smart-component-authoring.md').includes('sf-host-port-request'));
});
