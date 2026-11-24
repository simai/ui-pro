import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// A closed field schema and a renderer set that reads whatever it likes are two
// halves of one seam that can drift silently: the component keeps working,
// because a key it reads is simply undefined, while a host that validates its
// own answers against the port is refused for sending it. That is how
// `uploadText`, `formats` and `accept` reached a consumer stand -- read by the
// file renderer since 1.3.0, declared by no port until 1.5.0. This check reads
// the keys out of the sources rather than from a list someone maintains, so a
// renderer that starts reading a new key fails here until the port declares it.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const json = (path) => JSON.parse(read(path));

const sources = [
  'src/smart/field-renderers/index.js',
  'src/smart/view-properties/index.js',
  'src/smart/view-properties/js/templates/default.js',
  'src/smart/view-properties/js/field-value.js',
  'src/smart/view-properties/js/set-fields.js',
  'src/smart/view-properties/js/money.js',
  'src/smart/view-properties/js/rows.js',
];

// Keys a property-view host never sends, each with the reason it is not part of
// this port. An entry here is a decision, not a silence.
const notInThisPort = new Map([
  ['filter', 'the filter-row descriptor a data view builds for a column; a property-view field has no filter'],
  ['type', 'a legacy alias of propertyType, read as a fallback for older hosts; propertyType is the name this port declares'],
  ['dataType', 'a second legacy alias of propertyType, kept for the same reason and declared under neither name'],
  // Over the pair ui-dc9fc39aeb26 (ui-source 1dd18375c) the Framework renderers
  // read two keys port 1.18.0 does not carry (2026-11-18):
  ['currencies', 'the money field\'s currency list, declared by simai.property-view-port 1.19.0 (C294); the component accepts a 1.19.0 host, whose schema carries it, while the contract it is checked against stays 1.18.0'],
  ['defaultCountry', 'the phone renderer\'s first country, read by the pair\'s field renderers but declared by no simai.property-view-port edition up to 1.22.0; a property-view host does not send it until the port declares it (reported to the Framework, 2026-11-18)'],
  // Over the pair ui-97a0ebb762eb (group build 13, ui-source c570a557b) the
  // renderers read three keys simai.property-view-port 1.20.0 declares (type
  // templates, 2026-11-19); the component accepts a 1.20.0..1.22.0 host, whose
  // schema carries them, while its contract stays 1.18.0:
  ['template', 'the field\'s look within its type, declared by simai.property-view-port 1.20.0 (type templates); a template only draws, never changes a value, and the contract this component is checked against stays 1.18.0'],
  ['templateParams', 'the parameters of that template, declared by simai.property-view-port 1.20.0 with template; the contract stays 1.18.0'],
  ['decimals', 'the decimal places a number draws, declared by simai.property-view-port 1.20.0; the contract stays 1.18.0'],
  // Over the pair ui-3963bfe39302 (group build 18, ui-source 96234dd71) the
  // email renderer (sf-form 1.15.0, C422) reads one more key:
  ['autocomplete', 'the email edit\'s browser address-book hint ("username" for a sign-in, "off"), read by the pair\'s field renderers with "email" as the default; declared by no simai.property-view-port edition up to 1.22.1, so a property-view host does not send it and the field keeps the default (2026-11-25)'],
  // min, max, step and precision (the stepper's bounds and decimals) and the
  // settings of the property types the set draws itself (currency, columns,
  // minRows, maxRows, parts) were excused here until simai.property-view-port
  // 1.18.0 declared them.
]);

const portPath = json('src/smart/view-properties/smart.manifest.json')
  .composition.declarative.host_port.path;
const fieldSchema = json(portPath)
  .data.record.schema.properties.sections.items.properties.groups.items.properties.fields.items;

test('the port declares every field key the renderers read', () => {
  assert.equal(fieldSchema.additionalProperties, false, 'the field schema is closed, which is what makes an undeclared key a refusal');

  const declared = new Set(Object.keys(fieldSchema.properties));
  const found = new Map();
  for (const path of sources) {
    for (const [, key] of read(path).matchAll(/(?<!["'`])\bfield\.([A-Za-z][A-Za-z0-9]*)\b/gu)) {
      if (!found.has(key)) found.set(key, path);
    }
  }

  assert.ok(found.size > 10, 'the sweep found the field reads rather than nothing');

  const undeclared = [...found]
    .filter(([key]) => !declared.has(key) && !notInThisPort.has(key))
    .map(([key, path]) => `${key} (read in ${path})`);

  assert.deepEqual(undeclared, [], `undeclared field keys: a host sending one of these is refused by a schema that closed itself. Declare it in ${portPath} or record why this port does not carry it.`);
});

test('every key excused from the port is still absent from it', () => {
  // An excuse that outlives the reason for it is worse than no excuse: the next
  // person reads the list and believes a declared key is undeclared.
  for (const [key, reason] of notInThisPort) {
    assert.ok(reason.length > 20, `${key}: the reason is written out`);
    assert.ok(!Object.hasOwn(fieldSchema.properties, key), `${key} is declared in the port now, so remove it from the excused list`);
  }
});
