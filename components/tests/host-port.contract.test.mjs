import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

// The seam with a product host is a declared, separately versioned contract.
// These checks keep the declaration, the component that raises the intents and
// the conformance kit a host runs from drifting apart.

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const json = (path) => JSON.parse(read(path));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

const schema = json('src/core/contracts/composite-host-port.v1.schema.json');
const manifestPaths = [
  'src/smart/view-table/smart.manifest.json',
  'src/smart/view/smart.manifest.json',
  'src/smart/view-properties/smart.manifest.json',
];
const declared = manifestPaths
  .map((path) => ({ path, manifest: json(path) }))
  .map(({ path, manifest }) => ({ path, manifest, port: manifest.composition?.declarative?.host_port }))
  .filter((entry) => entry.port);

const answerKinds = new Set(['applied', 'conflict', 'refused', 'unavailable']);
const namePattern = /^[a-z][a-z0-9-]*(?:\.[a-z][a-z0-9-]*)+$/u;
const versionPattern = /^[0-9]+\.[0-9]+\.[0-9]+$/u;
const digestPattern = /^[a-f0-9]{64}$/u;

const kitDigest = (directory) => {
  const lines = [];
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else lines.push(`${relative(directory, full)} ${sha256(readFileSync(full))}\n`);
    }
  };
  walk(directory);
  lines.sort();
  return { digest: sha256(lines.join('')), files: lines.length };
};

test('a component declares its port by exact bytes', () => {
  assert.ok(declared.length > 0, 'at least one component declares a host port');
  for (const { path, port } of declared) {
    assert.ok(namePattern.test(port.port), `${path}: port name`);
    assert.ok(versionPattern.test(port.version), `${path}: port version`);
    assert.equal(sha256(readFileSync(resolve(root, port.path))), port.sha256, `${path}: the pinned bytes are the ones on disk`);
    const document = json(port.path);
    assert.equal(document.port, port.port, `${path}: the port names itself the same way`);
    assert.equal(document.version, port.version, `${path}: the port declares the pinned version`);
    assert.equal(port.path, `${dirname(port.path)}/port.json`);
    assert.ok(dirname(port.path).endsWith(`/${port.version}`), `${path}: a port lives at its version`);
    for (const supported of port.supported_versions ?? []) {
      assert.ok(versionPattern.test(supported), `${path}: supported version ${supported}`);
    }
  }
});

test('the port is shaped the way the schema says', () => {
  for (const { port } of declared) {
    const document = json(port.path);
    assert.deepEqual(
      Object.keys(document).filter((key) => !Object.keys(schema.properties).includes(key)),
      [],
      'no keys outside the schema',
    );
    for (const required of schema.required) {
      assert.ok(required in document, `the port declares ${required}`);
    }
    assert.equal(document.schema, 'simai.composite.host-port.v1');
    for (const [key, entry] of Object.entries(document.data)) {
      assert.ok(entry.summary, `data ${key}: summary`);
      assert.equal(typeof entry.schema, 'object', `data ${key}: closed schema`);
      assert.equal(entry.schema.additionalProperties ?? false, false, `data ${key}: object schemas are closed`);
    }
    for (const [key, intent] of Object.entries(document.intents)) {
      assert.ok(intent.summary, `intent ${key}: summary`);
      assert.ok(intent.event, `intent ${key}: event`);
      assert.equal(typeof intent.carries_revision, 'boolean', `intent ${key}: carries_revision`);
      assert.ok(intent.answers.length > 0, `intent ${key}: answers`);
      for (const answer of intent.answers) assert.ok(answerKinds.has(answer), `intent ${key}: answer ${answer}`);
      assert.ok(intent.answers.includes('refused'), `intent ${key}: a host may always refuse`);
      assert.ok(intent.answers.includes('unavailable'), `intent ${key}: a host may always be unreachable`);
      if (intent.carries_revision) {
        assert.ok(intent.answers.includes('conflict'), `intent ${key}: a write against a revision can conflict`);
      }
      if (intent.capability) {
        assert.ok(intent.capability in document.capabilities, `intent ${key}: capability ${intent.capability}`);
      }
    }
    for (const [name, capability] of Object.entries(document.capabilities)) {
      for (const intent of capability.intents ?? []) {
        assert.ok(intent in document.intents, `capability ${name}: intent ${intent}`);
        assert.equal(document.intents[intent].capability, name, `capability ${name}: ${intent} points back`);
      }
      for (const key of capability.data ?? []) assert.ok(key in document.data, `capability ${name}: data ${key}`);
    }
    assert.ok(document.settings.layers.includes('personal'), 'settings have a personal layer');
    assert.equal(document.settings.reset.semantics, 'compare-and-set', 'a reset is a write against a revision');
  }
});

test('every intent the port declares is an event the component announces', () => {
  for (const { path, manifest, port } of declared) {
    const document = json(port.path);
    const announced = new Set([
      ...(manifest.composition?.declarative?.events ?? []),
      ...Object.keys(manifest.events ?? {}),
    ]);
    // A published port version is frozen: one published before rename plan R2
    // (2026-11-03) names the element by its former tag, a dated alias of it.
    const renderer = manifest.composition?.declarative?.renderer?.name;
    const aliases = resolve(root, dirname(path), 'aliases.json');
    const former = existsSync(aliases) ? json(relative(root, aliases)).aliases.filter((row) => row.kind === 'tag').map((row) => row.from) : [];
    assert.ok([renderer, ...former].includes(document.element), `${path}: the port names the element (${document.element}, not ${renderer} or a former tag of it)`);
    for (const [key, intent] of Object.entries(document.intents)) {
      assert.ok(announced.has(intent.event), `${path}: ${key} raises ${intent.event}, which the manifest does not announce`);
    }
  }
});

test('the conformance kit is published and pinned', () => {
  for (const { port } of declared) {
    const document = json(port.path);
    const directory = resolve(root, dirname(port.path), document.conformance.kit);
    assert.ok(statSync(directory).isDirectory(), 'the kit is published beside the port');
    const { digest } = kitDigest(directory);
    assert.ok(digestPattern.test(document.conformance.sha256), 'the kit digest is pinned');
    assert.equal(digest, document.conformance.sha256, 'the kit on disk is the kit the port pins');
    const kit = json(`${dirname(port.path)}/${document.conformance.kit}/manifest.json`);
    assert.equal(kit.port, document.port);
    assert.equal(kit.version, document.version);
    assert.equal(kit.transport, 'neutral', 'the kit names no transport');
    assert.equal(kit.cases.length, document.conformance.cases, 'the port pins how many cases a host passes');
    const seen = new Set();
    for (const id of kit.cases) {
      const testCase = json(`${dirname(port.path)}/${document.conformance.kit}/cases/${id}.json`);
      assert.equal(testCase.id, id, `case ${id}: identity`);
      assert.ok(!seen.has(id), `case ${id}: listed once`);
      seen.add(id);
      assert.ok(testCase.intent in document.intents, `case ${id}: intent ${testCase.intent}`);
      // A case may name the answers either of which is right (simai.property-view-port
      // 1.22.1: a save over a moved revision is refused or conflict).
      const answers = [testCase.then.answer].flat();
      assert.ok(answers.length > 0, `case ${id}: answer`);
      for (const answer of answers) {
        assert.ok(answerKinds.has(answer), `case ${id}: answer ${answer}`);
        assert.ok(
          document.intents[testCase.intent].answers.includes(answer),
          `case ${id}: ${testCase.intent} cannot answer ${answer}`,
        );
      }
      if (testCase.capability) assert.ok(testCase.capability in document.capabilities, `case ${id}: capability`);
      for (const key of testCase.then.data_must_include ?? []) assert.ok(key in document.data, `case ${id}: data ${key}`);
    }
  }
});

// The newest edition a component accepts may be newer than the one it is checked
// against (sf-view-properties: 1.18.0, accepting up to 1.22.1). Where the overlay
// carries that edition, its kit must read too: a case's answer is one kind or a
// list of kinds either of which is right, each one the intent can give.
test('the kit of the newest accepted edition reads, a list of answers included', (t) => {
  let read = 0;
  for (const { port } of declared) {
    const newest = port.supported_versions?.at(-1);
    if (!newest || newest === port.version) continue;
    const path = port.path.replace(`/${port.version}/port.json`, `/${newest}/port.json`);
    if (!existsSync(resolve(root, path))) continue;
    const document = json(path);
    assert.equal(document.version, newest, `${path}: version`);
    const kit = json(`${dirname(path)}/${document.conformance.kit}/manifest.json`);
    assert.equal(kit.cases.length, document.conformance.cases, `${path}: case count`);
    for (const id of kit.cases) {
      const testCase = json(`${dirname(path)}/${document.conformance.kit}/cases/${id}.json`);
      const answers = [testCase.then.answer].flat();
      assert.ok(answers.length > 0, `${newest} case ${id}: answer`);
      for (const answer of answers) {
        assert.ok(answerKinds.has(answer), `${newest} case ${id}: answer ${answer}`);
        assert.ok(document.intents[testCase.intent].answers.includes(answer), `${newest} case ${id}: ${testCase.intent} cannot answer ${answer}`);
      }
    }
    read += 1;
  }
  if (!read) t.skip('the overlay carries no edition newer than the declared ones');
});

test('the kit exercises every answer a host can owe', () => {
  for (const { port } of declared) {
    const document = json(port.path);
    const kit = json(`${dirname(port.path)}/${document.conformance.kit}/manifest.json`);
    const covered = new Set();
    for (const id of kit.cases) {
      for (const answer of [json(`${dirname(port.path)}/${document.conformance.kit}/cases/${id}.json`).then.answer].flat()) covered.add(answer);
    }
    for (const answer of answerKinds) {
      assert.ok(covered.has(answer), `the kit has no case answering ${answer}`);
    }
    for (const name of Object.keys(document.capabilities)) {
      const cases = kit.cases
        .map((id) => json(`${dirname(port.path)}/${document.conformance.kit}/cases/${id}.json`))
        .filter((entry) => entry.capability === name);
      assert.ok(cases.length > 0, `capability ${name} has no case`);
    }
  }
});

test('a port that names no previous major says so out loud', () => {
  for (const { port } of declared) {
    const document = json(port.path);
    if (!document.compatibility) continue;
    assert.ok('previous_major' in document.compatibility, 'previous_major is stated, even as null');
    assert.ok(document.compatibility.recheck.length > 0, 'a version says what a host rechecks');
    if (document.compatibility.previous_major) {
      assert.ok(document.compatibility.supported_until, 'a dropped major names a date');
    }
  }
});

// The component and its manifest have to agree about which hosts it will take.
// They drifted once: two port versions were published while the guard inside the
// component still refused anything newer than 1.2.0, so a host that moved when
// asked to would have been turned away by the component that asked.
test('the composite accepts exactly the versions its manifest supports', () => {
  const source = readFileSync(resolve(root, 'src/smart/view/index.js'), 'utf8');
  const listed = source.match(/const SUPPORTED_PORT_VERSIONS = \[([^\]]*)\]/u);
  assert.ok(listed, 'the accepted versions are declared in one place');
  const accepted = listed[1].split(',').map((entry) => entry.trim().replace(/"/gu, '')).filter(Boolean);
  const manifest = json('src/smart/view/smart.manifest.json');
  const declared = manifest.composition.declarative.host_port;

  assert.deepEqual(accepted, declared.supported_versions);
  assert.ok(accepted.includes(declared.version), 'including the one it declares as current');
  assert.match(source, /!SUPPORTED_PORT_VERSIONS\.includes\(host\.version\)/u, 'and the guard reads that list');
});

