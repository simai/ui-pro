#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// Step 3 of the renderer set: a cell for a column that names a property type is
// rendered by the Framework rather than by the host, and a host that passes its
// own component still wins. Measured on the built bytes, because the question is
// what a person sees in the row.
import {resolve, join} from 'node:path';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/badges/css/badges.css',
  'component/component/progress-scale/css/progress-scale.css',
  'component/component/avatars/css/avatars.css',
  'component/component/reference-link/css/reference-link.css',
  'component/component/tags/css/tags.css',
  'component/component/inputs/css/inputs.css',
  'smart/smart/table/css/table.css', 'smart/smart/resizer/css/resizer.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icon/js/icon.js', 'smart/smart/button/js/button.js',
  'smart/smart/icon-button/js/icon-button.js', 'smart/smart/checkbox/js/checkbox.js',
  'smart/smart/list-item/js/list-item.js', 'smart/smart/dropdown/js/dropdown.js',
  'smart/smart/input/js/input.js', 'smart/smart/spinner/js/spinner.js',
  'smart/smart/badge/js/badge.js', 'smart/smart/progress-scale/js/progress-scale.js',
  'smart/smart/avatar/js/avatar.js', 'smart/smart/reference-link/js/reference-link.js',
  'smart/smart/tag/js/tag.js',
  'smart/smart/pagination/js/pagination.js', 'smart/smart/resizer/js/resizer.js', 'smart/smart/table/js/table.js',
].map((p) => join(out, p));

const failures = [];
const note = (detail) => failures.push(detail);
const browser = await chromium.launch();

try {
  const page = await browser.newPage({viewport: {width: 1200, height: 800}});
  await page.setContent(
    '<!doctype html><html class="theme-light" lang="ru"><body style="margin:0">'
    + '<div style="width:1100px"><sf-table id="t"></sf-table></div></body></html>',
  );
  for (const path of styles) await page.addStyleTag({path}).catch(() => {});
  for (const path of modules) await page.addScriptTag({path, type: 'module'}).catch(() => {});
  await page.waitForTimeout(1300);

  await page.evaluate(() => {
    const table = document.getElementById('t');
    table.setColumns([
      // Columns that name their property type and leave the rendering to the
      // Framework. Every element the set uses here takes `line`, which is the
      // row's text line rather than a control height.
      {key: 'status', label: 'Статус', propertyType: 'choice', options: [
        {value: 'live', label: 'Опубликовано', color: '#1b8f4a'},
        {value: 'draft', label: 'Черновик'},
      ]},
      // The other colour path: a scheme name rather than a hex, so the tonal
      // appearance is measured against both. And a column asking for another
      // appearance, because the default has to be a default and not a rule.
      {key: 'scheme', label: 'Схема', propertyType: 'choice', options: [
        {value: 'ok', label: 'Готово', color: 'primary'},
      ]},
      {key: 'asked', label: 'Просили', propertyType: 'choice', badgeAppearance: 'outline', options: [
        {value: 'ok', label: 'Готово', color: 'primary'},
      ]},
      {key: 'progress', label: 'Прогресс', propertyType: 'integer', variant: 'scale'},
      {key: 'active', label: 'Активно', propertyType: 'boolean'},
      {key: 'author', label: 'Автор', propertyType: 'user'},
      {key: 'section', label: 'Раздел', propertyType: 'record'},
      {key: 'attachment', label: 'Файл', propertyType: 'file'},
      {key: 'modules', label: 'Модули', propertyType: 'choices', options: [
        {value: 'updates', label: 'Обновления'}, {value: 'billing', label: 'Оплата'},
      ]},
      {key: 'code', label: 'Код', propertyType: 'string'},
      // A column whose property type the set claims, but whose cells carry the
      // host's own component. That is the real escape hatch: a cell value with
      // a component in it. Measured rather than assumed -- a column-level
      // `component` with a plain value renders the value, which is what the
      // table did before the set existed and still does.
      {key: 'own', label: 'Своё', propertyType: 'choice', options: [{value: 'live', label: 'Опубликовано'}]},
    ]);
    // The value shapes are the consumer's: the host resolves an opaque
    // reference to a label, because resolving one needs an access check.
    table.setRows([{
      id: '1', status: 'live', progress: 42, active: true, code: 'C-1',
      scheme: 'ok', asked: 'ok',
      author: {value: 'user:admin_identity:2', label: 'Super User', avatarText: 'SU'},
      section: {value: 'record-1792d97a', label: 'Платежи', href: '/admin/cms/record-1792d97a'},
      attachment: {value: '0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0', label: 'Отчёт.pdf', mime: 'application/pdf',
        href: '/files/0f1e2d3c'},
      modules: ['updates', 'billing'],
      own: {component: {type: 'input', props: {size: '1', value: 'host', name: 'own_cell'}}},
    }]);
  });
  await page.waitForTimeout(700);

  const cells = await page.evaluate(() => {
    const read = (key) => {
      const cell = document.querySelector(`#t tbody td[data-key="${key}"]`);
      if (!cell) return null;
      const element = cell.querySelector('sf-badge, sf-progress-scale, sf-avatar, sf-reference-link, sf-input');
      // A shown badge or avatar is its component's markup now, not an element
      // (owner, 2026-10-15): the same facts are read from its classes.
      const markup = element ? null : cell.querySelector('.sf-badge, .sf-avatar');
      if (markup) {
        const kind = markup.classList.contains('sf-badge') ? 'badge' : 'avatar';
        const named = (prefix) => [...markup.classList].find((name) => name.startsWith(`sf-${kind}--${prefix}`))?.slice(`sf-${kind}--${prefix}`.length) ?? null;
        const modifiers = [...markup.classList].filter((name) => name.startsWith(`sf-${kind}--`) && !/--(size|line)-/u.test(name)).map((name) => name.slice(`sf-${kind}--`.length));
        return {
          text: cell.textContent.replace(/\s+/gu, ' ').trim(),
          element: `sf-${kind}`, size: named('size-'), line: named('line-'), icon: null, value: null,
          appearance: kind === 'badge' ? modifiers[0] ?? null : null,
          scheme: kind === 'badge' ? modifiers[1] ?? null : null,
          background: getComputedStyle(markup).backgroundColor,
        };
      }
      return {
        text: cell.textContent.replace(/\s+/gu, ' ').trim(),
        element: element ? element.tagName.toLowerCase() : null,
        size: element?.getAttribute('size') ?? null,
        line: element?.getAttribute('line') ?? null,
        icon: element?.getAttribute('icon') ?? null,
        value: element?.getAttribute('value') ?? null,
        appearance: element?.getAttribute('appearance') ?? null,
        scheme: element?.getAttribute('scheme') ?? null,
        // The painted result, not only the attribute: the consumer's owner asked
        // for the calm look, and an attribute that no CSS answers is not it.
        background: element ? getComputedStyle(element.querySelector('.sf-badge') || element).backgroundColor : null,
      };
    };
    return {
      status: read('status'),
      progress: read('progress'),
      active: read('active'),
      author: read('author'),
      section: read('section'),
      attachment: read('attachment'),
      modules: (() => {
        const cell = document.querySelector('#t tbody td[data-key="modules"]');
        const tags = [...(cell?.querySelectorAll('.sf-tag') ?? [])];
        return {count: tags.length, lines: tags.map((tag) => [...tag.classList].find((name) => name.startsWith('sf-tag--line-'))?.slice('sf-tag--line-'.length) ?? null),
          text: cell?.textContent.replace(/\s+/gu, ' ').trim() ?? ''};
      })(),
      code: read('code'),
      own: read('own'),
      scheme: read('scheme'),
      asked: read('asked'),
    };
  });

  // Each of these renders through an element that takes the row's line. The
  // elements were held out of the set until they had one: with control heights a
  // default row went from 57 to 61 on desktop and 45 to 51 on mobile.
  // The consumer's owner asked for the calm badge in a cell, so the default is
  // tonal on both colour paths -- a hex option and a scheme option alike.
  for (const key of ['status', 'scheme']) {
    if (cells[key]?.appearance !== 'tonal') {
      note({case: `a choice cell is tonal by default (${key})`, got: cells[key],
        expected: 'appearance tonal'});
    }
  }
  // A default that cannot be changed is a rule, which this is not.
  if (cells.asked?.appearance !== 'outline') {
    note({case: 'a column may ask for another appearance', got: cells.asked,
      expected: 'appearance outline'});
  }
  // And the hex tint survives the appearance: the option colour is still what
  // paints the badge, not the scheme's own tonal background.
  const hexBackground = cells.status?.background ?? '';
  if (!/0\.24/u.test(hexBackground) || hexBackground === cells.scheme?.background) {
    note({case: 'an option hex colour still paints the badge at its own 24%',
      got: {hex: hexBackground, scheme: cells.scheme?.background},
      expected: 'the option colour at 24 per cent, distinct from a scheme badge'});
  }
  if (cells.status?.element !== 'sf-badge' || !/Опубликовано/u.test(cells.status?.text ?? '')
      || cells.status?.line !== '1/2') {
    note({case: 'choice', got: cells.status, expected: 'a badge on the row line with the option label'});
  }
  if (cells.progress?.element !== 'sf-progress-scale' || cells.progress?.value !== '42'
      || cells.progress?.line !== '1/2') {
    note({case: 'scale', got: cells.progress, expected: 'a scale on the row line with the value'});
  }
  if (cells.author?.element !== 'sf-avatar' || cells.author?.line !== '1/2'
      || !/Super User/u.test(cells.author?.text ?? '')) {
    note({case: 'user', got: cells.author, expected: 'an avatar on the row line beside the name'});
  }
  if (cells.section?.element !== 'sf-reference-link' || cells.section?.line !== '1/2'
      || !/Платежи/u.test(cells.section?.text ?? '')) {
    note({case: 'record', got: cells.section, expected: 'a reference link on the row line with the label'});
  }
  // Several values: one tag per value, each on the row's line, labels resolved
  // from the column's options.
  if (cells.modules?.count !== 2 || cells.modules?.lines.some((line) => line !== '1/2')
      || !/Обновления/u.test(cells.modules?.text ?? '') || !/Оплата/u.test(cells.modules?.text ?? '')) {
    note({case: 'choices', got: cells.modules, expected: 'two tags on the row line with the option labels'});
  }
  // A file is the same link with an icon chosen from the mime type, which is the
  // narrow cell the consumer asked for: no size as text, no download button.
  if (cells.attachment?.element !== 'sf-reference-link' || cells.attachment?.line !== '1/2'
      || cells.attachment?.icon !== 'picture_as_pdf' || !/Отчёт\.pdf/u.test(cells.attachment?.text ?? '')) {
    note({case: 'file', got: cells.attachment, expected: 'a link on the row line, the pdf icon, the label'});
  }
  // And the row must not have grown. The two tables compared here differ in one
  // thing only -- whether the columns name their property types -- because a
  // first version of this case compared a table that also carried a cell with
  // the host's own 40px input against four string columns, and reported a row
  // grown by 16px that the set had nothing to do with.
  const rows = await page.evaluate(async () => {
    const table = document.getElementById('t');
    const height = () => Math.round(document.querySelector('#t tbody tr').getBoundingClientRect().height * 10) / 10;
    const row = {id: '1', status: 'live', progress: 42, active: true, code: 'C-1',
      author: {value: 'user:1', label: 'Super User', avatarText: 'SU'},
      section: {value: 'record-1', label: 'Платежи'},
      attachment: {value: 'f-1', label: 'Отчёт.pdf', mime: 'application/pdf'},
      modules: ['updates']};
    const columns = (typed) => [
      {key: 'status', label: 'Статус', ...(typed
        ? {propertyType: 'choice', options: [{value: 'live', label: 'Опубликовано', color: '#1b8f4a'}]}
        : {propertyType: 'string'})},
      {key: 'progress', label: 'Прогресс', ...(typed
        ? {propertyType: 'integer', variant: 'scale'}
        : {propertyType: 'string'})},
      {key: 'author', label: 'Автор', propertyType: typed ? 'user' : 'string'},
      {key: 'section', label: 'Раздел', propertyType: typed ? 'record' : 'string'},
      {key: 'attachment', label: 'Файл', propertyType: typed ? 'file' : 'string'},
      {key: 'modules', label: 'Модули', ...(typed
        ? {propertyType: 'choices', options: [{value: 'updates', label: 'Обновления'}]}
        : {propertyType: 'string'})},
      {key: 'active', label: 'Активно', propertyType: typed ? 'boolean' : 'string'},
      {key: 'code', label: 'Код', propertyType: 'string'},
    ];
    table.setColumns(columns(true));
    table.setRows([row]);
    await new Promise((done) => setTimeout(done, 400));
    const typed = height();
    table.setColumns(columns(false));
    table.setRows([row]);
    await new Promise((done) => setTimeout(done, 400));
    return {typed, plain: height()};
  });
  if (Math.abs(rows.typed - rows.plain) > 0.5) {
    note({case: 'the row does not grow', got: rows, expected: 'a typed row as tall as a plain one'});
  }
  // A boolean reads as a word, not as `true`.
  if (cells.active?.text !== 'Да' || cells.active?.element !== null) {
    note({case: 'boolean', got: cells.active, expected: 'Да, as text'});
  }
  // A string is left alone: the set claims no renderer and the value renders.
  if (cells.code?.text !== 'C-1' || cells.code?.element !== null) {
    note({case: 'string', got: cells.code, expected: 'the value itself, untouched'});
  }
  // A cell that carries the host's own component keeps it: the set is the
  // default for a typed column, not a seizure of it.
  if (cells.own?.element !== 'sf-input' || cells.own?.value !== 'host') {
    note({case: "the host's component wins", got: cells.own, expected: 'the component the host put in the cell'});
  }

  console.error(JSON.stringify(cells, null, 1));
  await page.close();
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log('TABLE_TYPED_CELLS_OK');
