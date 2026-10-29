import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import test from 'node:test';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

// sf-property-view on simai.property-view-port 1.16.0 (consumer simai.main,
// agreed contract q-b0de123841): a masked string and a choice as buttons. The
// controls are the renderer set's; the view's part is to hear an incomplete
// masked entry (setFieldError), hold both saves while there is one -- Save
// disabled, the count beside it, the message under the field -- and to tell
// the set when a condition turns a field off. The behaviour is measured on the
// built bytes by tests/browser/property-view-mask-buttons.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const view = read('src/smart/property-view/index.js');
const template = read('src/smart/property-view/js/templates/default.js');
const body = (source, start, end = '\n    }\n') => {
  const at = source.indexOf(start);
  assert.ok(at >= 0, start);
  return source.slice(at, source.indexOf(end, at));
};

test('the view declares port 1.16.0 and keeps every earlier version', () => {
  const manifest = JSON.parse(read('src/smart/property-view/smart.manifest.json'));
  const port = manifest.composition.declarative.host_port;
  assert.equal(port.version, '1.16.0');
  assert.equal(port.path, 'src/core/contracts/ports/simai.property-view-port/1.16.0/port.json');
  assert.deepEqual(port.supported_versions.slice(-3), ['1.14.0', '1.15.0', '1.16.0']);
  assert.match(view, /const SUPPORTED_PORT_VERSIONS = \[[^\]]*"1\.15\.0", "1\.16\.0"\];/u);
  const component = JSON.parse(read('src/smart/property-view/component.json'));
  assert.equal(component.port.version, '1.16.0');
  assert.equal(manifest.version, component.version);
  assert.ok(manifest.compatibility.migrations.some((step) => step.from === '1.6.0' && step.to === '1.7.0'));
});

test('the port declares the keys the two read', () => {
  const port = JSON.parse(read('src/core/contracts/ports/simai.property-view-port/1.16.0/port.json'));
  const field = port.data.record.schema.properties.sections.items.properties.groups.items.properties.fields.items.properties;
  assert.deepEqual(field.mask.type, ['string', 'null']);
  assert.equal(field.nullable.type, 'boolean');
  assert.deepEqual(field.size.enum, ['1/2', '1', '2']);
});

test('an incomplete entry a control reports is held per field, and only that control clears it', () => {
  const report = body(view, '    reportFieldError(field, message) {');
  assert.match(report, /this\.inputErrors\.set\(key, String\(message\)\);\n\s+this\.controlErrors\.add\(key\);/u);
  // null releases only what the control itself reported: a datetime's
  // half-entered pair is the view's own and is not cleared from outside.
  assert.match(report, /\} else if \(this\.controlErrors\.has\(key\)\) \{\n\s+this\.inputErrors\.delete\(key\);\n\s+this\.controlErrors\.delete\(key\);/u);
  assert.match(body(view, '    _clearInputs() {'), /this\.controlErrors\.clear\(\);/u);
  // The edit host hands the set's setFieldError to it.
  assert.match(template, /setFieldError: \(target, message\) => context\.component\.reportFieldError\(target, message\),/u);
});

test('both saves stop while an entry is not a value, and Save says so by being disabled', () => {
  assert.match(view, /async saveGroup\(\{confirm = null\} = \{\}\) \{\n\s+if \(this\.openAll\) return this\.saveAll\(\{confirm\}\);\n\s+if \(this\.editing && this\.inputErrors\.size\) return this\._inputsInvalid\(\);/u);
  assert.match(view, /async saveAll\(\{confirm = null\} = \{\}\) \{\n\s+if \(this\.inputErrors\.size\) return this\._inputsInvalid\(\);/u);
  assert.match(view, /inputsInvalid: this\.inputErrors\.size > 0,/u);
  assert.match(template, /\?disabled=\$\{\(!creating && context\.changed\.size === 0\) \|\| context\.inputsInvalid\}/u);
  assert.match(template, /\?disabled=\$\{context\.changed\.size === 0 \|\| context\.inputsInvalid\}\n\s+@click=\$\{\(\) => context\.component\.saveGroup\(\)\}/u);
  // The reason: the count beside Save reads the merged errors.
  assert.match(view, /errors: this\.inputErrors\.size \? new Map\(\[\.\.\.this\.errors, \.\.\.this\.inputErrors\]\) : this\.errors/u);
  assert.equal((template.match(/\$\{context\.errorsText\}: \$\{context\.errors\.size\}/gu) ?? []).length, 2);
});

test('a message the control draws is not drawn twice', () => {
  assert.match(template, /const error = context\.controlErrors\?\.has\(key\) \? null : context\.errors\.get\(key\);/u);
});

test('a field its condition turns off reaches the set as disabled', () => {
  assert.match(body(view, '    fieldDisabled(field, values = this.fieldValues()) {'), /return Boolean\(field\?\.when\) && !fieldConditions\(field, values\)\.enabled;/u);
  assert.match(template, /const disabled = !context\.configuring && Boolean\(field\.when\) && context\.fieldDisabled\(field\);/u);
  assert.match(template, /\{size: context\.size, \.\.\.\(disabled \? \{disabled: true\} : \{\}\)\},/u);
});

test('the field editors the set draws for the two are fetched by the rule', () => {
  // rule.js is generated from component.json (standard 1.4): read as the rule
  // the Loader evaluates, not as text in one quoting style.
  const sandbox = {SF: {RuleLoader: {}}};
  vm.runInContext(read('src/smart/property-view/rule.js'), vm.createContext(sandbox));
  const relations = sandbox.SF.RuleLoader['cl-property-view'].relation;
  for (const name of ['cl-input', 'cl-button-group', 'cl-dropdown']) {
    assert.ok(relations.some((relation) => relation.name === name && relation.lazy === true), name);
  }
});
