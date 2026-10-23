import assert from 'node:assert/strict';
import test from 'node:test';
import {acceptLevel, collapse, createTree, expandKnown, hasLevel, knownRecords, markLoading, visibleRows} from '../src/smart/data-view/js/tree.js';

// The data view port 1.8.0 tree, as the view keeps it: levels the host
// answered, which nodes are open, and the rows that walk produces.

const node = (id, parent, hasChildren = false) => ({id, parent, has_children: hasChildren, revision: 'r1', actions: ['view']});

test('the roots are one level; a closed node draws no children', () => {
  const tree = acceptLevel(createTree(), {records: [node('site', null, true), node('blog', null)]});
  const rows = visibleRows(tree);
  assert.deepEqual(rows.map((row) => [row.id, row.__tree.level, row.__tree.hasChildren, row.__tree.expanded]),
    [['site', 0, true, false], ['blog', 0, false, false]]);
  assert.deepEqual(rows.map((row) => [row.__tree.posinset, row.__tree.setsize]), [[1, 2], [2, 2]]);
});

test('an answered level opens its node and nests under it, in order', () => {
  const tree = acceptLevel(createTree(), {records: [node('site', null, true), node('blog', null)]});
  markLoading(tree, 'site');
  assert.equal(visibleRows(tree)[0].__tree.loading, true);
  acceptLevel(tree, {parent: 'site', records: [node('about', 'site', true), node('contacts', 'site')]});
  assert.deepEqual(visibleRows(tree).map((row) => `${row.id}:${row.__tree.level}`), ['site:0', 'about:1', 'contacts:1', 'blog:0']);
  assert.equal(visibleRows(tree)[0].__tree.loading, false);
});

test('collapsing hides the branch and opening it again needs no host', () => {
  const tree = acceptLevel(createTree(), {records: [node('site', null, true)]});
  acceptLevel(tree, {parent: 'site', records: [node('about', 'site')]});
  collapse(tree, 'site');
  assert.deepEqual(visibleRows(tree).map((row) => row.id), ['site']);
  assert.equal(hasLevel(tree, 'site'), true);
  expandKnown(tree, 'site');
  assert.deepEqual(visibleRows(tree).map((row) => row.id), ['site', 'about']);
});

test('a level with more to come ends in a row that asks for it, and the next page appends', () => {
  const tree = acceptLevel(createTree(), {records: [node('site', null, true)]});
  acceptLevel(tree, {parent: 'site', records: [node('a', 'site')], hasNext: true, cursor: 'c1'});
  const more = visibleRows(tree).at(-1);
  assert.deepEqual(more.__tree, {level: 1, more: true, parent: 'site', cursor: 'c1'});
  acceptLevel(tree, {parent: 'site', records: [node('a', 'site'), node('b', 'site')], append: true});
  assert.deepEqual(visibleRows(tree).map((row) => row.id), ['site', 'a', 'b']);
});

test('a re-read of the roots keeps open branches open, and every known record can be acted on', () => {
  const tree = acceptLevel(createTree(), {records: [node('site', null, true)]});
  acceptLevel(tree, {parent: 'site', records: [node('about', 'site')]});
  acceptLevel(tree, {records: [node('site', null, true)]});
  assert.equal(tree.expanded.has('site'), true);
  assert.deepEqual(visibleRows(tree).map((row) => row.id), ['site'], 'its children are asked for again');
  assert.deepEqual(knownRecords(tree).map((record) => record.id), ['site']);
});
