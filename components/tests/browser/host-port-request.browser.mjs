#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// sf-host-port-request as a behaviour, not a flag: a component without a port
// asks once when connected, asks again when it is moved (disconnected and
// connected), and stays quiet once a port has answered, moved or not. A test
// that only looked for the flag being cleared would pass a reset on
// setHostPort, which leaves a moved element portless and silent.
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const components = [
  {tag: 'sf-data-view', bundle: 'data-view', version: '1.6.0'},
  {tag: 'sf-property-view', bundle: 'property-view', version: '1.6.0'},
];
const browser = await chromium.launch();
const failures = [];
try {
  for (const {tag, bundle, version} of components) {
    const page = await browser.newPage();
    await page.goto('about:blank');
    await page.addScriptTag({path: join(out, 'core', 'core', 'js', 'smart-base.js')});
    await page.addScriptTag({path: join(out, 'smart', 'smart', bundle, 'js', `${bundle}.js`)});
    const steps = await page.evaluate(async ({tag, version}) => {
      let asked = 0;
      let detail = null;
      document.addEventListener('sf-host-port-request', (event) => { asked += 1; detail = event.detail; });
      const settle = () => new Promise((done) => setTimeout(done, 50));
      const element = document.createElement(tag);
      const first = document.createElement('div');
      const second = document.createElement('div');
      document.body.append(first, second);
      first.append(element); await settle();
      const connected = asked;
      second.append(element); await settle();
      const moved = asked;
      element.setHostPort({version, raise: () => new Promise(() => {})});
      first.append(element); await settle();
      const answered = asked;
      return {connected, moved, answered, bubbles: Boolean(detail), component: detail?.component === element, context: detail?.context};
    }, {tag, version});
    await page.close();
    if (steps.connected !== 1) failures.push(`${tag}: asked ${steps.connected} times when connected without a port, expected 1`);
    if (steps.moved !== 2) failures.push(`${tag}: asked ${steps.moved - steps.connected} times when moved without a port, expected 1`);
    if (steps.answered !== steps.moved) failures.push(`${tag}: asked again after setHostPort answered`);
    if (!steps.component) failures.push(`${tag}: detail.component is not the asking element`);
    const keys = Object.keys(steps.context || {}).sort().join(',');
    if (keys !== 'group,owner,record') failures.push(`${tag}: context keys ${keys}, expected owner, record and group`);
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify({components: components.length, failures}, null, 1));
process.exitCode = failures.length ? 1 : 0;
