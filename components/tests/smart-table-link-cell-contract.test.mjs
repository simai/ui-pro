import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {URL} from 'node:url';

async function loadContract() {
  const source = await readFile(
    new URL('../src/smart/table/js/templates/link-cell-contract.js', import.meta.url),
    'utf8',
  );
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

test('Smart Table accepts relative and HTTP(S) link targets', async () => {
  const {normalizeTableLinkHref} = await loadContract();

  for (const href of ['/admin/users/1/edit', './edit', '../users', '#user', '?page=2', 'https://example.test/user', 'http://example.test/user']) {
    assert.equal(normalizeTableLinkHref(href), href);
  }
});

test('Smart Table rejects unsafe and ambiguous link targets', async () => {
  const {normalizeTableLinkHref} = await loadContract();

  for (const href of ['javascript:alert(1)', 'data:text/html,test', 'blob:https://example.test/id', '//example.test/user', 'admin/users/1', '', null]) {
    assert.equal(normalizeTableLinkHref(href), null);
  }
});

test('Smart Table normalizes structured link cell text without trusting objects', async () => {
  const {normalizeTableLinkCell} = await loadContract();

  assert.deepEqual(normalizeTableLinkCell({text: '<b>Alice</b>', subtext: 'alice@example.test', href: '/admin/users/1/edit'}), {
    text: '<b>Alice</b>',
    subtext: 'alice@example.test',
    href: '/admin/users/1/edit',
  });
  assert.deepEqual(normalizeTableLinkCell({text: 42, href: 'javascript:alert(1)'}), {
    text: '42',
    subtext: null,
    href: null,
  });
  assert.equal(normalizeTableLinkCell('Alice'), null);
});
