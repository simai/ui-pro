#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// sf-property-view, the first pair: one object read through its port and one
// group saved through it. What this measures is the seam, because that is where
// this composite can be wrong in ways a screenshot would not show -- a save that
// carries untouched fields, a value written on blur, a conflict that quietly
// becomes an overwrite, an error shown somewhere other than under its field.
import {resolve, join} from 'node:path';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/badges/css/badges.css', 'component/component/avatars/css/avatars.css',
  'component/component/reference-link/css/reference-link.css',
  'component/component/inputs/css/inputs.css', 'component/component/tree/css/tree.css',
  'component/component/progress-scale/css/progress-scale.css',
  'component/component/buttons/css/buttons.css',
  'component/component/dropdown/css/dropdown.css',
  'smart/smart/drawer/css/drawer.css',
  'component/component/datepicker/css/datepicker.css',
  'component/component/tags/css/tags.css',
  'component/component/textarea/css/textarea.css',
  'component/component/file-upload/css/file-upload.css',
  'component/component/file-preview/css/file-preview.css',
  'component/component/progress-bar/css/progress-bar.css',
  // The composite's own stylesheet, which it did not have at all in the first
  // pair -- the reason a consumer saw plain stacked text.
  'smart/smart/popover/css/popover.css',
  'component/component/icon-buttons/css/icon-buttons.css',
  'smart/smart/copy-button/css/copy-button.css',
  'smart/smart/property-view/css/property-view.css',
  'smart/smart/sortable/css/sortable.css',
  'smart/smart/table/css/table.css', 'smart/smart/resizer/css/resizer.css',
  'component/component/pagination/css/pagination.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icon/js/icon.js', 'smart/smart/badge/js/badge.js',
  'smart/smart/avatar/js/avatar.js', 'smart/smart/reference-link/js/reference-link.js',
  'smart/smart/input/js/input.js', 'smart/smart/tree/js/tree.js',
  'smart/smart/tree-item/js/tree-item.js', 'smart/smart/icon-button/js/icon-button.js',
  'smart/smart/button/js/button.js',
  'smart/smart/progress-scale/js/progress-scale.js',
  'smart/smart/dropdown/js/dropdown.js', 'smart/smart/list-item/js/list-item.js',
  'smart/smart/checkbox/js/checkbox.js', 'smart/smart/spinner/js/spinner.js',
  'smart/smart/drawer/js/drawer.js',
  'smart/smart/tag/js/tag.js',
  'smart/smart/datepicker/js/datepicker.js', 'smart/smart/textarea/js/textarea.js',
  'smart/smart/switch/js/switch.js', 'smart/smart/button-group/js/button-group.js',
  'smart/smart/file-upload/js/file-upload.js', 'smart/smart/file-preview/js/file-preview.js',
  'smart/smart/progress-bar/js/progress-bar.js',
  'smart/smart/field-renderers/js/field-renderers.js',
  'smart/smart/sortable/js/sortable.js',
  // A related group composes a data view, which brings a table and a page row.
  'smart/smart/context-menu/js/context-menu.js',
  'smart/smart/tabs/js/tabs.js',
  'smart/smart/pagination/js/pagination.js',
  'smart/smart/resizer/js/resizer.js', 'smart/smart/table/js/table.js',
  'smart/smart/data-view/js/data-view.js',
  'smart/smart/popover/js/popover.js',
  'smart/smart/copy-button/js/copy-button.js',
  'smart/smart/property-view/js/property-view.js',
].map((p) => join(out, p));

const absent = [...styles, ...modules].filter((path) => !existsSync(path));
if (absent.length) {
  console.error(JSON.stringify({missingAssets: absent, root: out}, null, 2));
  throw new Error(`${absent.length} build asset(s) not found under ${out}`);
}

const failures = [];
const note = (detail) => failures.push(detail);
const browser = await chromium.launch();

try {
  const page = await browser.newPage({viewport: {width: 1100, height: 900}});
  await page.setContent(
    '<!doctype html><html class="theme-light" lang="ru"><body style="margin:0">'
    // Listening before the modules define anything, because a nested list raises
    // its port request at connection: a listener added later would see nothing and
    // the measurement would read as «the list never asks».
    + '<script>window.__portAsks = [];'
    + "document.addEventListener('sf-host-port-request', (event) => {"
    + 'window.__portAsks.push({owner: event.detail.context.owner, record: event.detail.context.record,'
    + ' group: event.detail.context.group, tag: event.target.tagName.toLowerCase()});'
    + '});</script>'
    + '<sf-property-view id="many" record-id="record-1" collection="pages"></sf-property-view>'
    + '<sf-property-view id="one" record-id="record-2" collection="settings"></sf-property-view>'
    + '</body></html>',
  );
  for (const path of styles) await page.addStyleTag({path}).catch(() => {});
  for (const path of modules) await page.addScriptTag({path, type: 'module'}).catch(() => {});
  await page.waitForTimeout(1400);

  const unupgraded = await page.evaluate(() => {
    const tags = ['sf-property-view', 'sf-drawer', 'sf-input', 'sf-textarea', 'sf-dropdown',
      'sf-datepicker', 'sf-switch', 'sf-button-group', 'sf-checkbox', 'sf-file-upload',
      'sf-file-preview', 'sf-progress-bar', 'sf-progress-scale', 'sf-avatar', 'sf-badge',
      'sf-tag', 'sf-reference-link', 'sf-tree', 'sf-tree-item', 'sf-button', 'sf-icon-button',
      'sf-sortable', 'sf-data-view', 'sf-table', 'sf-pagination'];
    return tags.filter((tag) => !customElements.get(tag));
  });
  if (unupgraded.length) {
    console.error(JSON.stringify({unupgraded}, null, 2));
    throw new Error(
      `${unupgraded.length} element(s) this probe renders are not defined on the page: `
      + `${unupgraded.join(', ')}. An unupgraded element has no behaviour, so every measurement `
      + `of it is false in the same direction -- it reads as the composite being broken.`,
    );
  }

  const measured = await page.evaluate(async () => {
    const view = document.getElementById('many');
    const single = document.getElementById('one');
    if (!view || typeof view.setHostPort !== 'function') {
      return {missing: true, tag: view?.tagName, upgraded: Boolean(view?.shadowRoot)};
    }

    const raised = [];
    let revision = '7';
    const object = (rev) => ({
      record_id: 'record-1', collection: 'pages', revision: rev,
      sections: [
        {key: 'main', label: 'Основное', groups: [
          {key: 'about', label: 'О странице', fields: [
            {key: 'title', label: 'Заголовок', propertyType: 'string', required: true, value: 'Первая запись'},
            {key: 'modules', label: 'Модули', propertyType: 'choices',
             options: [{value: 'updates', label: 'Обновления'}, {value: 'billing', label: 'Оплата'},
                       {value: 'audit', label: 'Аудит'}],
             value: ['updates', 'billing']},
            {key: 'author', label: 'Автор', propertyType: 'user',
             value: {value: 'record-0005', label: 'Super User', avatarText: 'SU'}},
            {key: 'linked', label: 'Решение', propertyType: 'relation',
             value: {value: 'record-0100', label: 'Решение 101'}},
            {key: 'related', label: 'Связанное', propertyType: 'record',
             value: {value: 'record-0200', label: 'Решение 201'}},
            {key: 'note', label: 'Заметка', propertyType: 'string', value: null},
            // The four a consumer reported from their stand. A scale that
            // rendered nothing because its component was never loaded; a
            // reference link whose arrow showed as the word `arrow_forward` for
            // the same reason; and a date and a number that arrived raw because
            // the Framework has no locale -- the host sends {value, text} now.
            {key: 'progress', label: 'Прогресс', propertyType: 'integer', variant: 'scale', value: 69},
            {key: 'section', label: 'Раздел', propertyType: 'record',
             value: {value: 'record-0317', label: 'Платежи', href: '/admin/cms/record-1792d97a'}},
            {key: 'when', label: 'Дата', propertyType: 'date',
             value: {value: '2027-01-13', text: '13 января 2027'}},
            {key: 'sum', label: 'Сумма', propertyType: 'number', unit: '₽',
             value: {value: 25025.93, text: '25 025,93'}},
          ]},
          // Rare: declared and always sent, hidden by the component until asked.
          {key: 'expert', label: 'Экспертное', rare: true, fields: [
            {key: 'slug', label: 'Код', propertyType: 'string', value: 'first'},
          ]},
        ]},
        {key: 'seo', label: 'SEO', groups: [
          {key: 'meta', label: 'Метатеги', fields: [
            {key: 'description', label: 'Описание', propertyType: 'text', value: 'Описание страницы'},
          ]},
        ]},
      ],
    });

    let nextSave = 'applied';
    // 448 candidates in pages of 20, so paging and search are real rather than
    // decorative, and the record the field already holds is deliberately not on
    // the first page.
    const targets = Array.from({length: 448}, (unused, index) => ({
      value: `record-${String(index).padStart(4, '0')}`,
      label: `Решение ${index + 1}`,
    }));
    const asks = [];
    const host = {
      version: '1.1.0',
      capabilities: ['field-options'],
      async raise(intent, payload) {
        raised.push({intent, payload: JSON.parse(JSON.stringify(payload))});
        if (intent === 'record.load') return {answer: 'applied', record: object(revision)};
        if (intent === 'field.options') {
          asks.push({cursor: payload.cursor, search: payload.search, field: payload.field});
          const matching = payload.search
            ? targets.filter((item) => item.label.toLowerCase().includes(payload.search.toLowerCase()))
            : targets;
          const from = payload.cursor ? Number(payload.cursor) : 0;
          const page = matching.slice(from, from + 20);
          const next = from + 20 < matching.length ? String(from + 20) : null;
          return {answer: 'applied', options_page: {items: page, next_cursor: next, total: matching.length}};
        }
        if (intent === 'group.save') {
          if (nextSave === 'conflict') return {answer: 'conflict', reason: 'stale-revision'};
          if (nextSave === 'refused') {
            return {answer: 'refused', errors: {title: 'Заголовок не может быть пустым'}};
          }
          revision = '8';
          return {answer: 'applied', record: object(revision)};
        }
        return {answer: 'unavailable', reason: 'unknown-intent'};
      },
    };
    view.setHostPort(host);
    // The host's own content in the two declared slots, and the one thing that
    // makes a slot different from injecting into the DOM: the very same nodes
    // survive a render. A consumer's menu or history panel keeps its listeners
    // and its open state, which a re-created subtree would lose.
    const slotView = document.createElement('sf-property-view');
    slotView.setAttribute('record-id', 'record-5');
    const actions = document.createElement('div');
    actions.setAttribute('slot', 'actions');
    const actionsButton = document.createElement('button');
    actionsButton.textContent = 'Ещё действия';
    let actionClicks = 0;
    actionsButton.addEventListener('click', () => { actionClicks += 1; });
    actions.append(actionsButton);
    const footer = document.createElement('div');
    footer.setAttribute('slot', 'footer');
    const footerContent = document.createElement('span');
    footerContent.textContent = 'История';
    footer.append(footerContent);
    slotView.append(actions, footer);
    document.body.append(slotView);
    slotView.setHostPort({
      version: '1.3.0', capabilities: [],
      async raise(intent) {
        if (intent === 'record.load') {
          return {answer: 'applied', record: {record_id: 'record-5', revision: '1', sections: [
            {key: 'only', groups: [{key: 'g', label: 'Группа', fields: [
              {key: 'name', label: 'Имя', propertyType: 'string', value: 'Со слотами'},
            ]}]},
          ]}};
        }
        return {answer: 'unavailable', reason: 'unknown-intent'};
      },
    });
    await new Promise((done) => setTimeout(done, 600));
    const slotsFirst = {
      actionsPlaced: slotView.contains(actionsButton),
      footerPlaced: Boolean(slotView.querySelector('.sf-property-view-host-footer')?.contains(footerContent)),
    };
    actionsButton.click();
    // A render, and then the same nodes must still be the ones on the page.
    slotView.editGroup('only', 'g');
    await new Promise((done) => setTimeout(done, 300));
    slotView.cancelEdit();
    await new Promise((done) => setTimeout(done, 300));
    actionsButton.click();
    const slots = {
      ...slotsFirst,
      sameNodeAfterRender: slotView.contains(actionsButton),
      actionsParent: actionsButton.parentElement?.className
        || actionsButton.parentElement?.tagName || 'detached',
      footerParent: footerContent.parentElement?.className
        || footerContent.parentElement?.tagName || 'detached',
      // The base unwraps a carrier whose only attribute is `slot` and keeps its
      // children by reference. An earlier version of this put the listener on the
      // carrier itself, which is consumed, and then measured a node that had
      // never been placed at all.
      unwrapped: slotView.getSlotContent?.('footer') !== footer,
      // The identity test that matters: a copy would have lost the listener.
      listenerSurvived: actionClicks,
      footerStillThere: Boolean(slotView.querySelector('.sf-property-view-host-footer')
        ?.contains(footerContent)),
    };

    // A date arriving as {value, text}: the view reads the text and the editor must
    // take the value. A consumer had every date field editing as empty while its
    // view read correctly, which is the worst shape of this defect.
    const dateView = document.createElement('sf-property-view');
    dateView.setAttribute('record-id', 'record-dates');
    document.body.append(dateView);
    dateView.setHostPort({
      version: '1.5.0', capabilities: ['field-options'],
      async raise(intent, payload) {
        if (intent === 'record.load') {
          return {answer: 'applied', record: {record_id: 'record-dates', revision: '1', sections: [
            {key: 'only', groups: [{key: 'g', label: 'Группа', columns: 2, fields: [
              {key: 'due', label: 'Крайний срок', propertyType: 'date',
               value: {value: '2027-01-13', text: '13.01.2027'}},
              {key: 'startsAt', label: 'Начало', propertyType: 'datetime',
               value: {value: '2026-11-27T13:26:00', text: '27.11.2026 13:26:00'}},
              {key: 'about', label: 'Описание', propertyType: 'text', width: 'full',
               value: {value: 'Длинное описание', text: 'Длинное описание'}},
              {key: 'owner', label: 'Владелец', propertyType: 'relation',
               value: {value: 'rel-1', label: 'Пакет отсутствует'}},
            ]}]},
          ]}};
        }
        if (intent === 'field.options') {
          return {answer: 'refused', reason: 'field_has_no_options'};
        }
        return {answer: 'unavailable', reason: 'unknown-intent'};
      },
    });
    await new Promise((done) => setTimeout(done, 500));
    dateView.editGroup('only', 'g');
    await new Promise((done) => setTimeout(done, 700));
    // A datetime value carries a clock the date control has no input for. The
    // control must still show the day, and choosing another day must keep the
    // time the record already held -- writing it back without the clock looks
    // like it worked and quietly moves the value to midnight.
    const timePicker = dateView.querySelector('[data-field="startsAt"] sf-datepicker');
    const timeHeld = timePicker?.value ?? null;
    const timeShown = dateView.querySelector('[data-field="startsAt"] input')?.value ?? null;
    timePicker?.dispatchEvent(new CustomEvent('change', {detail: {value: '2026-11-28'}}));
    await new Promise((done) => setTimeout(done, 200));
    // `changed` is a Map, so a property read off it is always undefined --
    // which would report the clock as dropped whatever the code did.
    const timeWritten = dateView.changed?.get?.('startsAt') ?? null;
    const edits = (() => {
      const input = dateView.querySelector('[data-field="due"] input');
      const owner = dateView.querySelector('[data-field="owner"] .sf-property-view-field-value');
      const about = dateView.querySelector('[data-field="about"]');
      const control = about?.querySelector('textarea, .sf-textarea, .sf-input');
      return {
        dateShown: input?.value ?? null,
        timeHeld,
        timeShown,
        timeWritten,
        dateHeld: dateView.querySelector('[data-field="due"] sf-datepicker')?.value ?? null,
        // A refused field has no candidates now or ever, so a retry cannot help
        // and an empty picker over a real value reads as the value being gone.
        refusedPicker: Boolean(owner?.querySelector('sf-dropdown')),
        refusedRetry: (owner?.textContent ?? '').includes('Повторить'),
        refusedShowsValue: (owner?.textContent ?? '').includes('Пакет отсутствует'),
        fullWidthSpans: about ? getComputedStyle(about).gridColumnStart : null,
        controlWidth: control ? Math.round(control.getBoundingClientRect().width) : null,
        valueWidth: about ? Math.round(
          about.querySelector('.sf-property-view-field-value').getBoundingClientRect().width) : null,
      };
    })();
    dateView.remove();

    // A group of related records. The records never come through this port: the
    // group holds a data view, and that view asks the host for a data-view port of
    // its own. Measured through the composite, because the two failures worth
    // catching are a list that renders and never asks, and a list that asks with a
    // context a host cannot answer.
    const relatedView = document.createElement('sf-property-view');
    relatedView.setAttribute('record-id', 'record-related');
    relatedView.setAttribute('collection', 'pages');
    document.body.append(relatedView);
    const asksBefore = (window.__portAsks ?? []).length;
    relatedView.setHostPort({
      version: '1.7.0', capabilities: [],
      async raise(intent) {
        if (intent === 'record.load') {
          return {answer: 'applied', record: {record_id: 'record-related', revision: '1', sections: [
            {key: 'only', groups: [
              {key: 'about', label: 'Основное', columns: 1, fields: [
                {key: 'title', label: 'Заголовок', propertyType: 'string', value: 'Запись'},
              ]},
              {key: 'invoices', label: 'Счета', kind: 'related', rowCap: 3},
            ]},
          ]}};
        }
        return {answer: 'unavailable', reason: 'unknown-intent'};
      },
    });
    await new Promise((done) => setTimeout(done, 700));

    const relatedGroup = relatedView.querySelector('[data-group="invoices"]');
    const nested = relatedGroup?.querySelector('sf-data-view');
    // Before the nested host answers. A consumer found the chrome drawn until data
    // arrived, because the attributes were read once at connection -- and a
    // template sets them after the element is in the document.
    const beforeData = nested ? {
      toolbarHidden: nested.shadowRoot?.querySelector('[part="toolbar"]')?.hidden ?? null,
      pagesHidden: nested.shadowRoot?.querySelector('slot[name="pagination"]')?.hidden ?? null,
    } : null;
    // The host answers the nested list with the port it already has for
    // collections -- the whole point of the list asking rather than being handed
    // one through the property-view seam.
    if (nested) {
      nested.setHostPort({
        version: '1.6.0', capabilities: [],
        async raise(intent, payload) {
          if (intent !== 'query.change') return {answer: 'applied'};
          return {answer: 'applied', sequence: payload.sequence, data: {
            records: [{id: '1', number: 'A-1', revision: 'r1', actions: []},
              {id: '2', number: 'A-2', revision: 'r1', actions: []}],
            total: 2,
            columns: [{key: 'number', label: 'Номер', role: 'title', width: 200}],
            echo: {search: '', filters: {}, sort: [], page: 1, per_page: 10},
          }};
        },
      });
    }
    await new Promise((done) => setTimeout(done, 800));

    const relatedAsks = (window.__portAsks ?? []).slice(asksBefore);
    // The table resolved once, explicitly. The data view renders one as the
    // fallback of its content slot, and fallback content lives in the shadow tree,
    // so a light-DOM query from the data view never reaches it. The first draft
    // here was a chain of three fallbacks that happened to return the right row
    // count from the third -- a number that is right for a reason the reader cannot
    // see is a measurement waiting to lie.
    const contentSlot = nested?.shadowRoot?.querySelector('slot[name="content"]');
    const nestedTable = contentSlot
        ? (contentSlot.assignedElements?.()[0] ?? contentSlot.querySelector('sf-table'))
        : null;
    const related = {
      // The group holds a list rather than fields, and a list has nothing to edit
      // field by field.
      hasList: Boolean(nested),
      hasFieldRows: Boolean(relatedGroup?.querySelector('[data-field]')),
      editOffered: Boolean(relatedGroup?.querySelector('[data-action="edit"]')),
      chrome: nested?.getAttribute('chrome'),
      rowCap: nested?.getAttribute('row-cap'),
      // Who asked, and about what. A context a host cannot answer is worse than
      // no request: the list would sit empty and the host would never know why.
      asks: relatedAsks.filter((ask) => ask.tag === 'sf-data-view'),
      propertyViewAsked: relatedAsks.some((ask) => ask.tag === 'sf-property-view'),
      rows: nestedTable ? nestedTable.querySelectorAll('tbody tr').length : 0,
      // The frame: a card inside a card is what an embedded list must not look
      // like. The group draws the card; the list must not draw a second one.
      beforeData,
      // The table has to be a child of the data view, not the fallback inside its
      // shadow tree: fallback content is styled only by shadow-scoped rules, and
      // the Framework's component stylesheets are page level. A consumer got a list
      // whose sort buttons read «unfold_more» as text because of this.
      tableInLightDom: nested ? Boolean(nested.querySelector(':scope > sf-table')) : null,
      tableParentIsSlot: nestedTable ? nestedTable.parentElement?.tagName?.toLowerCase() === 'slot' : null,
      listBorder: nested ? getComputedStyle(nested).borderTopWidth : null,
      listPadding: nested ? getComputedStyle(nested).paddingTop : null,
      // The two chrome columns of a page table. An embedded list has no bulk band
      // for a checkbox to feed and no toolbar for a gear to lead to, so both read
      // as leftovers -- and they are what pushed the row text off the label axis.
      selectColumn: nestedTable
        ? nestedTable.querySelectorAll('thead input[type="checkbox"], thead sf-checkbox').length : null,
      settingsColumn: nestedTable
        ? nestedTable.querySelectorAll('thead [data-settings], thead [data-sf-table-settings]').length : null,
      // Row text on the same inline axis as the field labels in the group above.
      // Measured as painted positions, because the rule is about what a person
      // sees lining up and not about which padding token was used.
      labelAxis: (() => {
        const label = relatedView.querySelector('[data-group="about"] .sf-property-view-field-label');
        return label ? Math.round(label.getBoundingClientRect().left * 100) / 100 : null;
      })(),
      rowTextAxis: (() => {
        const cell = nestedTable?.querySelector('tbody tr td, tbody tr th');
        if (!cell) return null;
        const range = document.createRange();
        range.selectNodeContents(cell);
        const box = range.getBoundingClientRect();
        return box.width ? Math.round(box.left * 100) / 100 : Math.round(cell.getBoundingClientRect().left * 100) / 100;
      })(),
    };
    relatedView.remove();

    // Configuring the view. Three things the host decides and the component must
    // not: whether a view can be configured at all, which layers this person may
    // write, and which layer hid an entry. Measured through the composite, because
    // the interesting failures are a control that appears without the capability
    // and a hide button that is enabled over a decision made above it.
    const plainView = document.createElement('sf-property-view');
    plainView.setAttribute('record-id', 'record-plain');
    plainView.setAttribute('collection', 'pages');
    document.body.append(plainView);
    const arrangement = () => ({record_id: 'record-config', revision: '1', sections: [
      {key: 's1', label: 'Основное', groups: [
        {key: 'g1', label: 'Группа один', columns: 2, fields: [
          {key: 'a', label: 'Поле А', propertyType: 'string', value: 'А', width: 'half'},
          {key: 'b', label: 'Поле Б', propertyType: 'string', value: 'Б', width: 'half',
           variantOptions: [{value: 'plain', label: 'Обычный'}, {value: 'badge', label: 'Бейдж'}]},
          {key: 'c', label: 'Поле В', propertyType: 'string', value: 'В', hidden: true, hiddenBy: 'shared'},
        ]},
        {key: 'g2', label: 'Группа два', columns: 1, fields: [
          {key: 'd', label: 'Поле Г', propertyType: 'string', value: 'Г'},
        ]},
      ]},
      {key: 's2', label: 'Прочее', groups: [
        {key: 'g3', label: 'Группа три', columns: 1, fields: [
          {key: 'e', label: 'Поле Д', propertyType: 'string', value: 'Д'},
        ]},
      ]},
    ], view: {
      target: 'shared',
      layers: {personal: {revision: 'p1', view: {schema_version: 1, sections: {}, groups: {}, fields: {b: {order: 2}}}}},
      editable: ['personal'],
      denied: {shared: 'Нет права менять вид для всех'},
    }});
    // A host with no view-settings capability: the control must be absent, not
    // present and failing. A person offered a way to rearrange a view that cannot
    // be stored loses it on the next load with no way to know why.
    plainView.setHostPort({
      version: '1.6.0', capabilities: [],
      async raise(intent) {
        if (intent === 'record.load') return {answer: 'applied', record: arrangement()};
        return {answer: 'unavailable', reason: 'unknown-intent'};
      },
    });
    await new Promise((done) => setTimeout(done, 400));
    const configureWithoutCapability = Boolean(plainView.querySelector('[data-action="configure"]'));
    const startedWithoutCapability = plainView.startConfiguringView();
    plainView.remove();

    const configView = document.createElement('sf-property-view');
    configView.setAttribute('record-id', 'record-config');
    configView.setAttribute('collection', 'pages');
    document.body.append(configView);
    const viewAsks = [];
    let nextConflict = false;
    // One object, kept and answered with every time -- the way a host with a cache
    // behaves. If the component rearranges the answer it was handed instead of its
    // own copy, this record is rewritten by a drag the host never accepted, and
    // the next read hands the rewritten version back.
    const hostRecord = arrangement();
    let layerRevision = 1;
    configView.setHostPort({
      version: '1.6.0', capabilities: ['view-settings'],
      async raise(intent, payload) {
        viewAsks.push({intent, payload: JSON.parse(JSON.stringify(payload))});
        if (intent === 'record.load') return {answer: 'applied', record: hostRecord};
        if (intent === 'view.save') {
          if (nextConflict) {
            nextConflict = false;
            return {answer: 'conflict', revision: 'p9', view: {schema_version: 1, sections: {}, groups: {}, fields: {}}};
          }
          layerRevision += 1;
          return {answer: 'applied', revision: `p${layerRevision}`};
        }
        if (intent === 'view.reset') {
          return {answer: 'applied', revision: 'p0', view: {schema_version: 1, sections: {}, groups: {}, fields: {}}};
        }
        return {answer: 'unavailable', reason: 'unknown-intent'};
      },
    });
    await new Promise((done) => setTimeout(done, 400));
    const hiddenBeforeConfiguring = Boolean(configView.querySelector('[data-field="c"]'));
    // Entering the mode is the head's «⋯». A standalone «Настроить вид» control
    // stood as its own band under the head, which is one of the empty-looking
    // rows the owner saw, so what is offered is the menu that holds it.
    const configureOffered = Boolean(configView.querySelector('[data-action="menu"]'));
    configView.startConfiguringView();
    await new Promise((done) => setTimeout(done, 300));

    // The layers are one segmented control rather than two buttons standing
    // apart, so a layer is addressed by the value it carries and a refusal is
    // read from the name the control announces.
    const sharedButton = configView.querySelector('[data-sf-button-group-value="shared"]');
    // Taking a field out of an area is where hiding used to be, and the rule is
    // the same one: a field the shared layer hid cannot be taken out of the view
    // from a personal layer, because showing it again would be beyond that
    // layer's reach.
    const hideC = configView.querySelector('[data-field="c"] [data-action="remove-field"]');
    const configuringShape = {
      // The lists must be sf-sortable and not a div dressed as one: an undefined
      // element is inert to a pointer and looks exactly like a feature that
      // silently does nothing.
      fieldLists: [...configView.querySelectorAll('sf-sortable[id^="field:"]')].map((list) => list.id),
      groupList: configView.querySelector('sf-sortable[id^="group:"]')?.id ?? null,
      grips: configView.querySelectorAll('[data-sf-sortable-handle]').length,
      items: [...configView.querySelectorAll('[data-sf-sortable-item]')].map((node) => node.getAttribute('data-sf-sortable-item')),
      hiddenListed: Boolean(configView.querySelector('[data-field="c"]')),
      hiddenDimmed: configView.querySelector('[data-field="c"]')?.getAttribute('data-hidden') ?? null,
      // Hidden for everyone, and the target is the personal layer: this person
      // cannot show it again, and the host said so per entry.
      hideLockedByShared: hideC ? hideC.hasAttribute('disabled') : null,
      // A layer this person may not write: the view chooser makes no view of
      // that kind (owner, 2026-10-14 -- the layer toggle is gone; the chosen
      // view's kind is the layer).
      sharedCreatable: configView.querySelector('[data-action="view-profile"]')?.rights?.create?.shared ?? null,
      layerToggle: Boolean(configView.querySelector('[data-action="layer"]')),
      // Width, template and hint sit behind the field's gear. Drawn under every
      // field they were four controls a row, and the arrangement -- the thing
      // being edited -- could no longer be read.
      variantOffered: null,
      variantAbsentWithoutOptions: null,
    };

    const openSettings = async (field) => {
      const surface = configView.querySelector(`[data-field="${field}"] sf-popover[data-settings-for]`);
      configView.querySelector(`[data-field="${field}"] [data-action="field-settings"]`)?.click();
      await new Promise((done) => setTimeout(done, 200));
      // Shown, not merely present: the settings live in a popover whose content
      // stays in the document and is hidden while it is closed. The control
      // itself is a Smart element, which has no box of its own, so what is
      // measured is the surface holding it.
      const opened = Boolean(surface?.querySelector('[slot="content"]')?.getClientRects().length);
      const found = opened
        && Boolean(configView.querySelector(`[data-field="${field}"] [data-action="variant"]`));
      surface?.close();
      await new Promise((done) => setTimeout(done, 200));
      return found;
    };
    configuringShape.variantOffered = await openSettings('b');
    configuringShape.variantAbsentWithoutOptions = !(await openSettings('a'));

    // A field dragged into another group. The drop is reported the way sf-sortable
    // reports one, so this measures the component's reaction and not a method
    // nobody calls: the event is what a pointer would produce.
    const list = configView.querySelector('sf-sortable[id="field:g2"]');
    list?.dispatchEvent(new CustomEvent('sf-sortable-intent', {
      bubbles: true, detail: {item: 'b', from: 'field:g1', to: 'field:g2', index: 0, mode: 'move'},
    }));
    await new Promise((done) => setTimeout(done, 400));
    const afterMove = viewAsks.filter((ask) => ask.intent === 'view.save').at(-1) ?? null;
    const movedInDom = [...configView.querySelectorAll('sf-sortable[id="field:g2"] [data-sf-sortable-item]')]
      .map((node) => node.getAttribute('data-sf-sortable-item'));
    // The host's own record, after a move the host has accepted but never applied
    // to its own copy.
    const hostRecordUntouched = hostRecord.sections[0].groups[0].fields.map((field) => field.key).includes('b');

    // Two changes in a row with no wait between them. Each must be written against
    // the revision the one before it earned; both against the same old revision
    // would hand the person a conflict for being quick.
    const beforeRapid = viewAsks.filter((ask) => ask.intent === 'view.save').length;
    configView.setFieldView('d', {width: 'full'});
    configView.setFieldView('d', {hint: 'Быстро'});
    await new Promise((done) => setTimeout(done, 600));
    const rapidRevisions = viewAsks.filter((ask) => ask.intent === 'view.save')
      .slice(beforeRapid)
      .map((ask) => ask.payload?.target?.revision ?? null);

    configView.setFieldView('a', {width: 'full'});
    await new Promise((done) => setTimeout(done, 300));
    const afterWidth = viewAsks.filter((ask) => ask.intent === 'view.save').at(-1) ?? null;

    const loadsBeforeConflict = viewAsks.filter((ask) => ask.intent === 'record.load').length;
    nextConflict = true;
    configView.setFieldView('a', {hint: 'Подсказка'});
    await new Promise((done) => setTimeout(done, 500));
    const loadsAfterConflict = viewAsks.filter((ask) => ask.intent === 'record.load').length;

    configView.startConfiguringView();
    await new Promise((done) => setTimeout(done, 200));
    configView.resetView();
    await new Promise((done) => setTimeout(done, 500));
    const resetAsk = viewAsks.find((ask) => ask.intent === 'view.reset') ?? null;
    const loadsAfterReset = viewAsks.filter((ask) => ask.intent === 'record.load').length;
    const configure = {
      configureWithoutCapability,
      startedWithoutCapability,
      configureOffered,
      hiddenBeforeConfiguring,
      ...configuringShape,
      saveTarget: afterMove?.payload?.target ?? null,
      // The layer is sent whole, and the orders are dense for the two containers
      // the move touched -- a sparse single order cannot say «between B and C».
      movedFields: afterMove?.payload?.view?.fields ?? null,
      movedInDom,
      widthWritten: afterWidth?.payload?.view?.fields?.a?.width ?? null,
      hostRecordUntouched,
      rapidRevisions,
      reloadedOnConflict: loadsAfterConflict > loadsBeforeConflict,
      resetTarget: resetAsk?.payload?.target ?? null,
      resetSendsNoView: resetAsk ? !('view' in resetAsk.payload) : null,
      reloadedOnReset: loadsAfterReset > loadsAfterConflict,
    };
    configView.remove();

    // The file editor: the host takes the file, the component holds nothing but
    // what is in flight, and the stored file waits for the save button.
    const uploadView = document.createElement('sf-property-view');
    uploadView.setAttribute('record-id', 'record-6');
    uploadView.setAttribute('collection', 'pages');
    document.body.append(uploadView);
    const uploadAsks = [];
    uploadView.setHostPort({
      version: '1.3.0', capabilities: ['field-upload'],
      async raise(intent, payload) {
        if (intent === 'record.load') {
          return {answer: 'applied', record: {record_id: 'record-6', revision: '3', sections: [
            {key: 'only', groups: [{key: 'files', label: 'Файлы', fields: [
              {key: 'document', label: 'Документ', propertyType: 'file',
               value: [{value: 'f1', label: 'contract.pdf', size: '240 KB', mime: 'application/pdf', href: '/files/f1'}]},
            ]}]},
          ]}};
        }
        if (intent === 'field.upload') {
          uploadAsks.push({field: payload.field, isFile: payload.file instanceof File,
            name: payload.file?.name ?? null});
          if (payload.file?.name === 'too-big.bin') {
            return {answer: 'refused', reason: 'too-large', message: 'Файл слишком велик'};
          }
          return {answer: 'applied', file: {value: 'f2', label: payload.file.name,
            size: '12 KB', mime: payload.file.type, href: '/files/f2'}};
        }
        if (intent === 'group.save') {
          uploadAsks.push({save: payload.values});
          return {answer: 'applied', record: {record_id: 'record-6', revision: '4', sections: []}};
        }
        return {answer: 'unavailable', reason: 'unknown-intent'};
      },
    });
    await new Promise((done) => setTimeout(done, 600));
    uploadView.editGroup('only', 'files');
    await new Promise((done) => setTimeout(done, 400));
    const zone = uploadView.querySelector('[data-field="document"] sf-file-upload');
    const beforeUpload = uploadAsks.length;
    if (zone) {
      const input = zone.querySelector('input[type="file"]');
      const transfer = new DataTransfer();
      transfer.items.add(new File(['x'], 'new.pdf', {type: 'application/pdf'}));
      transfer.items.add(new File(['y'], 'too-big.bin', {type: 'application/octet-stream'}));
      if (input) {
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', {bubbles: true}));
      }
    }
    await new Promise((done) => setTimeout(done, 700));
    const upload = {
      zone: Boolean(zone),
      asked: uploadAsks.slice(beforeUpload).filter((entry) => !entry.save),
      // The stored file is a change waiting for the button, and nothing was saved.
      changed: JSON.stringify(uploadView.changed.get('document') ?? null),
      savedYet: uploadAsks.some((entry) => entry.save),
      errorShown: (uploadView.querySelector('[data-field="document"] .sf-property-view-field-error')
        ?.textContent ?? '').trim(),
      errorsHeld: Object.fromEntries([...uploadView.errors.entries()]),
      stillEditing: Boolean(uploadView.editing),
      fieldRendered: Boolean(uploadView.querySelector('[data-field="document"]')),
      uploadsHeld: (uploadView.getFieldUploads({key: 'document'}) ?? []).length,
    };

    // The modeless panel: the same component beside the list it was opened from.
    // What matters is that it is modeless -- a modal would take the list away,
    // which is the whole reason the consumer asked for a panel -- and that the
    // two controls needing an address appear only when the host gave one.
    const panelView = document.createElement('sf-property-view');
    panelView.setAttribute('record-id', 'record-7');
    panelView.setAttribute('collection', 'pages');
    panelView.setAttribute('panel', '');
    document.body.append(panelView);
    const panelEvents = [];
    for (const name of ['sf-property-view-close', 'sf-property-view-address-copy',
      'sf-property-view-open-full']) {
      panelView.addEventListener(name, (event) => panelEvents.push({name, detail: event.detail}));
    }
    panelView.setHostPort({
      // The control that opens the record away from the panel is the host's to
      // offer: an address is enough to copy and not enough to promise a page.
      version: '1.9.0', capabilities: ['record-open'],
      async raise(intent) {
        if (intent === 'record.load') {
          return {answer: 'applied', record: {record_id: 'record-7', revision: '1',
            address: '/admin/cms/pages/record-7', sections: [
              {key: 'only', groups: [{key: 'g', label: 'Группа', fields: [
                {key: 'name', label: 'Имя', propertyType: 'string', value: 'В панели'},
              ]}]},
            ]}};
        }
        return {answer: 'unavailable', reason: 'unknown-intent'};
      },
    });
    await new Promise((done) => setTimeout(done, 600));

    // What a consumer measured on their stand at a real size, each of it theirs
    // rather than invented here: a panel with no visible title, a body that did
    // not take the panel's height, one column where the group declared two, and a
    // full-width field rendering at half.
    panelView.setAttribute('panel-label', 'SIMAI: Платежи №178');
    panelView.requestComponentUpdate('probe');
    await new Promise((done) => setTimeout(done, 300));
    const look = (() => {
      const content = document.querySelector('.sf-property-view-panel[data-record-id="record-7"]');
      const body = content?.querySelector('.sf-property-view-layout');
      const scroll = content?.querySelector('.sf-property-view-scroll');
      const status = content?.querySelector('.sf-property-view-status');
      // The title is the panel's own again, and for a reason the drawer's head
      // could not carry: the mockup puts the collection above the record's name
      // and the star and «⋯» beside it, which is a head of three parts rather
      // than a string. The drawer draws none of its own now (`show-close` is off
      // and no `title` is passed), so this measures the one that is painted.
      const titleEl = content?.querySelector('.sf-property-view-title');
      const titleBox = titleEl?.getBoundingClientRect();
      return {
        title: titleEl?.textContent?.trim() ?? null,
        titlePainted: titleBox ? titleBox.height > 0 && titleBox.width > 0 : false,
        // One axis for three related parts: the drawer's title, this component's
        // control row and the field labels. The probe asserted the title was
        // painted and uncut and never that it lined up with anything, so a consumer
        // found three different inline starts -- a title on the drawer's own gutter
        // reading as having none beside a control row and labels on this
        // component's. Measured as painted positions, because the rule is about
        // what a person sees lining up.
        axes: (() => {
          const start = (node) => (node ? Math.round(node.getBoundingClientRect().left * 100) / 100 : null);
          const group = content?.querySelector('.sf-property-view-group');
          const groupStyle = group ? getComputedStyle(group) : null;
          return {
            title: start(titleEl),
            controls: start(content?.querySelector('[data-action="close"], .sf-property-view-panel-controls')),
            label: start(content?.querySelector('.sf-property-view-field-label')),
            group: start(group),
            // A field label is inside a card, so it is inset from the panel's
            // gutter by that card's own padding. That is a boundary a person sees,
            // not a drift -- the first version of this check required all three on
            // one axis and would have had the cards give up their padding to pass.
            groupInset: groupStyle
              ? Math.round((Number.parseFloat(groupStyle.paddingInlineStart) || 0)
                + (Number.parseFloat(groupStyle.borderInlineStartWidth) || 0))
              : null,
          };
        })(),
        // One scroller between the head and the foot, and the arrangement itself
        // scrolling nothing: a scroller of its own put a scrollbar inside the
        // panel's gutter, so the cards ended short of the right edge while the
        // head reached it.
        scrollGrows: scroll ? getComputedStyle(scroll).flexGrow : null,
        scrollOverflow: scroll ? getComputedStyle(scroll).overflowY : null,
        bodyScrolls: body ? getComputedStyle(body).overflow : null,
        // A hidden status line took sixty pixels because its rule was scoped to
        // the element and the panel is portalled out of it.
        statusHidden: status ? getComputedStyle(status).display : null,
      };
    })();

    // panel-width: an exact length, because the ladder step this consumer was
    // given measured 391px of a 1296px viewport -- two columns cramped and the
    // title cut. The length has to win over the ladder, or the input is
    // decoration. 40rem is what they asked for.
    panelView.setAttribute('panel-size', '1');
    panelView.setAttribute('panel-width', '40rem');
    panelView.requestComponentUpdate('probe');
    await new Promise((done) => setTimeout(done, 300));
    const width = (() => {
      const content = document.querySelector('.sf-property-view-panel[data-record-id="record-7"]');
      const shell = content?.closest('.sf-drawer-panel');
      const titleEl = content?.querySelector('.sf-property-view-title');
      return {
        painted: shell ? Math.round(shell.getBoundingClientRect().width) : null,
        titleClipped: titleEl ? titleEl.scrollWidth > titleEl.clientWidth + 1 : null,
      };
    })();
    panelView.removeAttribute('panel-width');

    // Esc is tested here, while this panel is the top one. The rule belongs to the
    // stack now -- the top window closes, wherever the focus is -- so a test run
    // after another panel had opened would be asking the wrong window.
    const panelOfEarly = (id) => document.querySelector(
      `.sf-property-view-panel[data-record-id="${id}"]`);
    panelOfEarly('record-7')?.querySelector('[data-action="close"]')?.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    await new Promise((done) => setTimeout(done, 200));

    // A second panel whose host sends no address, to read what the controls do
    // when there is nothing to copy or open.
    const addresslessView = document.createElement('sf-property-view');
    addresslessView.setAttribute('record-id', 'record-8');
    addresslessView.setAttribute('panel', '');
    document.body.append(addresslessView);
    addresslessView.setHostPort({
      version: '1.2.0', capabilities: [],
      async raise(intent) {
        if (intent === 'record.load') {
          return {answer: 'applied', record: {record_id: 'record-8', revision: '1', sections: [
            {key: 'only', groups: [{key: 'g', label: 'Группа', fields: [
              {key: 'name', label: 'Имя', propertyType: 'string', value: 'Без адреса'},
            ]}]},
          ]}};
        }
        return {answer: 'unavailable', reason: 'unknown-intent'};
      },
    });
    await new Promise((done) => setTimeout(done, 600));

    // sf-drawer portals its content out of the element, so the panel is not a
    // descendant of the view. The first version of this read looked inside the
    // view and found nothing -- and would have reported a working panel as empty.
    const panelOf = (recordId) => document.querySelector(
      `.sf-property-view-panel[data-record-id="${recordId}"]`);
    // The strip of controls stands beside the panel now, in the drawer's edge
    // area, so it is no longer inside the panel element: look in the drawer the
    // panel belongs to.
    const shellOf = (recordId) => panelOf(recordId)?.closest('[data-sf-drawer-root]')
      ?? panelOf(recordId)?.parentElement ?? null;
    const panel = (() => {
      const drawer = panelView.querySelector('sf-drawer');
      const content = panelOf('record-7');
      const controls = (node) => [...(node?.querySelectorAll('[data-action]') ?? [])]
        .map((item) => item.getAttribute('data-action'))
        .filter((name) => ['close', 'copy-link', 'open-full'].includes(name));
      return {
        drawer: Boolean(drawer),
        modal: drawer?.getAttribute('modal'),
        overlay: drawer?.getAttribute('overlay'),
        placement: drawer?.getAttribute('placement'),
        closeOnEsc: drawer?.getAttribute('close-on-esc'),
        portalled: Boolean(content) && !panelView.contains(content),
        controls: controls(shellOf('record-7')),
        withoutAddress: controls(shellOf('record-8')),
        body: Boolean(content?.querySelector('.sf-property-view-body')),
        painted: content ? getComputedStyle(content.closest('.sf-drawer-panel') ?? content).backgroundColor : null,
      };
    })();

    // Esc closes the panel by announcing it, and the announcement carries how many
    // fields were changed and not saved -- closing over unsaved work is the host's
    // decision, not the component's.
    panelOf('record-7')?.closest('[data-sf-drawer-root]')
      ?.querySelector('[data-action="open-full"]')?.click();
    await new Promise((done) => setTimeout(done, 250));
    const panelAnnounced = panelEvents.map((entry) => ({name: entry.name,
      address: entry.detail?.address ?? null, reason: entry.detail?.reason ?? null,
      unsaved: entry.detail?.unsaved_fields ?? null}));

    // Two panels, which is the smallest number at which a stack exists. What is
    // measured is what the request asks for: the one below stays visible and
    // dimmed, Esc closes the top and only the top, and a window left half-edited
    // underneath keeps its unsaved changes -- which is the whole reason each
    // window is its own element rather than a row in one shared state.
    const stackHost = (id) => ({
      version: '1.4.0', capabilities: [],
      async raise(intent) {
        if (intent === 'record.load') {
          return {answer: 'applied', record: {record_id: id, revision: '1',
            address: `/admin/cms/${id}`, sections: [
              {key: 'only', groups: [{key: 'g', label: 'Группа', fields: [
                {key: 'name', label: 'Имя', propertyType: 'string', value: `Запись ${id}`},
              ]}]},
            ]}};
        }
        return {answer: 'unavailable', reason: 'unknown-intent'};
      },
    });
    const lower = document.createElement('sf-property-view');
    lower.setAttribute('record-id', 'stack-1');
    lower.setAttribute('panel', '');
    document.body.append(lower);
    lower.setHostPort(stackHost('stack-1'));
    await new Promise((done) => setTimeout(done, 500));
    // Half-edit the lower window before covering it.
    lower.editGroup('only', 'g');
    await new Promise((done) => setTimeout(done, 300));
    lower.changeField({key: 'name'}, 'Набрано и не сохранено');
    await new Promise((done) => setTimeout(done, 200));

    const upper = document.createElement('sf-property-view');
    upper.setAttribute('record-id', 'stack-2');
    upper.setAttribute('panel', '');
    document.body.append(upper);
    upper.setHostPort(stackHost('stack-2'));
    await new Promise((done) => setTimeout(done, 500));

    const closes = [];
    lower.addEventListener('sf-property-view-close', (event) => closes.push(['lower', event.detail.reason]));
    upper.addEventListener('sf-property-view-close', (event) => closes.push(['upper', event.detail.reason]));
    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    await new Promise((done) => setTimeout(done, 250));

    const panelFor = (id) => document.querySelector(`.sf-property-view-panel[data-record-id="${id}"]`);
    const stack = {
      depths: [panelFor('stack-1')?.dataset.stackDepth, panelFor('stack-2')?.dataset.stackDepth],
      stacked: [panelFor('stack-1')?.dataset.stacked, panelFor('stack-2')?.dataset.stacked],
      lowerInteractive: panelFor('stack-1')
        ? getComputedStyle(panelFor('stack-1')).pointerEvents : null,
      upperInteractive: panelFor('stack-2')
        ? getComputedStyle(panelFor('stack-2')).pointerEvents : null,
      lowerVisible: panelFor('stack-1') ? getComputedStyle(panelFor('stack-1')).opacity : null,
      // The inset is the drawer's now, not an inline margin this component writes:
      // sf-drawer stands each window depth x stack-offset in from its edge and
      // keeps its width. Measured as painted geometry rather than as a style
      // string, because the component no longer writes one and a check for the
      // string it used to write would pass only while the old mechanism survived.
      inset: (() => {
        const upper = panelFor('stack-2')?.closest('.sf-drawer-panel');
        const lower = panelFor('stack-1')?.closest('.sf-drawer-panel');
        if (!upper || !lower) return null;
        const top = upper.getBoundingClientRect();
        const below = lower.getBoundingClientRect();
        return {
          insetBy: Math.round(below.right - top.right),
          sameWidth: Math.abs(Math.round(top.width) - Math.round(below.width)) <= 1,
        };
      })(),
      // The window below must be visibly beside the one above, not merely marked
      // as beneath it: a consumer measured two panels covering each other exactly
      // and the stack was true only in the DOM.
      widths: [
        Math.round(document.querySelector('sf-property-view[record-id=\'stack-1\'] .sf-drawer-panel')?.getBoundingClientRect().width ?? 0),
        Math.round(document.querySelector('sf-property-view[record-id=\'stack-2\'] .sf-drawer-panel')?.getBoundingClientRect().width ?? 0),
      ],
      drawerWidthAttr: document.querySelector('sf-property-view[record-id=\'stack-2\'] sf-drawer')?.getAttribute('width') ?? null,
      closedByEscape: closes,
      // The point of separate elements: the lower window still holds what was
      // typed into it while another window stands over it.
      lowerKeptItsEdit: lower.changed.get('name') ?? null,
      lowerStillEditing: Boolean(lower.editing),
    };
    upper.remove();
    await new Promise((done) => setTimeout(done, 200));
    stack.afterUpperClosed = {
      depth: panelFor('stack-1')?.dataset.stackDepth,
      stacked: panelFor('stack-1')?.dataset.stacked,
    };
    lower.remove();

    // A host still on 1.0.0, which cannot serve candidates. Its reference field
    // must show the value read-only rather than an empty control -- the promise
    // that an additive port version stays additive, measured instead of asserted
    // in a changelog.
    const oldHostView = document.createElement('sf-property-view');
    oldHostView.setAttribute('record-id', 'record-9');
    oldHostView.setAttribute('collection', 'pages');
    document.body.append(oldHostView);
    oldHostView.setHostPort({
      version: '1.0.0',
      capabilities: [],
      async raise(intent) {
        if (intent === 'record.load') {
          return {answer: 'applied', record: {record_id: 'record-9', revision: '1', sections: [
            {key: 'only', groups: [{key: 'g', label: 'Группа', fields: [
              {key: 'ref', label: 'Ссылка', propertyType: 'record',
               value: {value: 'record-1', label: 'Старое значение'}},
            ]}]},
          ]}};
        }
        return {answer: 'unavailable', reason: 'unknown-intent'};
      },
    });
    await new Promise((done) => setTimeout(done, 500));
    oldHostView.editGroup('only', 'g');
    await new Promise((done) => setTimeout(done, 400));
    const fallback = (() => {
      const box = oldHostView.querySelector('[data-field="ref"] .sf-property-view-field-value');
      return {empty: Boolean(box?.querySelector('.sf-property-view-empty')),
        readonly: Boolean(box?.querySelector('[data-readonly]')),
        picker: Boolean(box?.querySelector('sf-dropdown')),
        text: box?.textContent.replace(/\s+/gu, ' ').trim() ?? ''};
    })();

    // A record the host answered with that holds nothing visible says so. An
    // empty box reads as something still loading, which is the one thing it is
    // not: the host has answered.
    const bare = document.createElement('sf-property-view');
    document.body.append(bare);
    bare.setHostPort({
      version: '1.9.0', capabilities: [],
      async raise(intent) {
        if (intent === 'record.load') {
          return {answer: 'applied', record: {record_id: 'record-bare', revision: '1', sections: []}};
        }
        return {answer: 'unavailable', reason: 'unknown-intent'};
      },
    });
    await new Promise((done) => setTimeout(done, 600));
    const bareSeen = {
      state: bare.getAttribute('data-state'),
      said: bare.querySelector('.sf-property-view-empty-record')?.textContent.trim() ?? null,
    };
    bare.remove();

    // A second view whose object has one section, to read what a single section
    // does with the section list.
    single.setHostPort({
      version: '1.0.0', capabilities: [],
      async raise(intent) {
        if (intent === 'record.load') {
          return {answer: 'applied', record: {record_id: 'record-2', revision: '1', sections: [
            {key: 'only', label: 'Единственный', groups: [
              {key: 'g', label: 'Группа', fields: [
                {key: 'name', label: 'Имя', propertyType: 'string', value: 'Настройка'},
              ]},
            ]},
          ]}};
        }
        return {answer: 'unavailable', reason: 'unknown-intent'};
      },
    });
    await new Promise((done) => setTimeout(done, 600));

    // Light DOM: the composite renders into itself, which is what lets the
    // Framework's component stylesheets reach the field controls.
    const root = view;
    const read = () => ({
      sectionItems: root.querySelectorAll('.sf-property-view-sections .sf-tree-item[data-sf-entry]').length,
      groups: [...root.querySelectorAll('.sf-property-view-group')].map((node) => node.dataset.group),
      fields: [...root.querySelectorAll('.sf-property-view-field')].map((node) => node.dataset.field),
      // Which element drew each value: the renderer set's choice, not the host's.
      // The Smart element the set chose, not the wrapper it chose to put it in.
      // The first version of this read the first child and reported `span` for a
      // user field, whose view is an avatar and a name inside one wrapper.
      drawn: Object.fromEntries([...root.querySelectorAll('.sf-property-view-field')].map((node) => {
        const value = node.querySelector('.sf-property-view-field-value');
        if (value?.querySelector('.sf-property-view-empty')) return [node.dataset.field, 'empty'];
        const smart = value?.querySelector('[class*="sf-"], sf-avatar, sf-badge, sf-tag, sf-reference-link');
        const element = value?.querySelector('sf-avatar, sf-badge, sf-tag, sf-reference-link, sf-progress-scale, sf-file-preview');
        return [node.dataset.field, element?.tagName?.toLowerCase() ?? (smart ? 'span' : 'text')];
      })),
      actions: Boolean(root.querySelector('.sf-property-view-actions')),
      // The text as a person reads it, for the fields whose formatting is the
      // host's.
      text: Object.fromEntries([...root.querySelectorAll('.sf-property-view-field')].map((node) => [
        node.dataset.field,
        node.querySelector('.sf-property-view-field-value')?.textContent.replace(/\s+/gu, ' ').trim() ?? '',
      ])),
      // And the painted card, because «no group cards» was the consumer's words.
      card: (() => {
        const group = root.querySelector('.sf-property-view-group');
        if (!group) return null;
        const style = getComputedStyle(group);
        return {border: style.borderTopWidth, radius: style.borderTopLeftRadius,
          padding: style.paddingTop, background: style.backgroundColor};
      })(),
    });

    const before = read();
    // A tab answers a press. The rail is an sf-tree asked for a single
    // selection, and that tree moved only its tab stop on a click: the sections
    // could be walked with the arrows and chosen with the space bar, and
    // pressing one did nothing at all. sf-tree 2.0.0 draws its rows itself, flat,
    // as class markup (.sf-tree-item[data-sf-entry], the value in data-value)
    // rather than as sf-tree-item elements.
    const tabs = [...root.querySelectorAll('.sf-property-view-sections .sf-tree-item[data-sf-entry]')];
    const pressed = tabs[tabs.length - 1];
    (pressed?.querySelector('.sf-tree-item-container') ?? pressed)
      ?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}));
    await new Promise((done) => setTimeout(done, 400));
    const switched = {
      asked: pressed?.getAttribute('data-value') ?? null,
      showing: view.selectedSection ?? null,
      groups: [...root.querySelectorAll('.sf-property-view-group')].map((node) => node.dataset.group),
    };

    // Back to the first section, because everything measured below reads the
    // groups this record opens on.
    (tabs[0]?.querySelector('.sf-tree-item-container') ?? tabs[0])
      ?.dispatchEvent(new MouseEvent('click', {bubbles: true, composed: true}));
    await new Promise((done) => setTimeout(done, 400));

    const singleSections = single.querySelectorAll('.sf-property-view-sections .sf-tree-item[data-sf-entry]').length;
    const singleList = single.querySelector('.sf-property-view-sections');

    // Rare: hidden, then shown, and the host is not asked again -- showing rare
    // fields is a view decision and must not be a second read.
    const raisedBeforeRare = raised.length;
    view.setAttribute('show-rare', '');
    view.requestComponentUpdate('probe');
    await new Promise((done) => setTimeout(done, 200));
    const withRare = read();
    const raisedAfterRare = raised.length;
    view.removeAttribute('show-rare');
    view.requestComponentUpdate('probe');

    // Open one group and type into it. Nothing may be sent by typing alone.
    view.editGroup('main', 'about');
    await new Promise((done) => setTimeout(done, 300));
    const editing = read();
    const editControls = [...root.querySelectorAll('.sf-property-view-field-value *')]
      .map((node) => node.tagName.toLowerCase());
    // Exactly one required mark a person can see on a required field, not the
    // label's and the control's both. Counted as drawn rather than as present:
    // a control marks itself when it has no label of its own, and here the label
    // is the panel's, so that mark is in the DOM and not drawn.
    const requiredMarks = [...root.querySelectorAll('[data-field="title"] .sf-input-required, '
      + '[data-field="title"] .sf-property-view-required')]
      .filter((mark) => mark.getClientRects().length > 0).length;
    // A record with a value has no editor yet, and must read as its value rather
    // than as «не заполнено».
    const recordWhileEditing = (() => {
      const box = root.querySelector('[data-field="section"] .sf-property-view-field-value');
      return {empty: Boolean(box?.querySelector('.sf-property-view-empty')),
        readonly: Boolean(box?.querySelector('[data-readonly]')),
        text: box?.textContent.replace(/\s+/gu, ' ').trim() ?? ''};
    })();
    // Every reference field in the group is read at once when it opens, and every
    // one of them must end with its page. A single counter kept only the last
    // answer and left the rest at «Загрузка записей» for ever; one reference field
    // in a probe cannot show that.
    const concurrent = (() => {
      const keys = ['section', 'author', 'linked', 'related'];
      return Object.fromEntries(keys.map((key) => {
        const page = view.getFieldOptionsPage({key});
        return [key, page ? {status: page.status, items: page.items?.length ?? 0} : null];
      }));
    })();

    // The record picker: the three cases that break pickers, measured through the
    // composite rather than against the renderer set alone.
    const picker = await (async () => {
      const node = root.querySelector('[data-field="section"] sf-dropdown');
      if (!node) return {rendered: false};
      for (let attempt = 0; attempt < 40 && !Array.isArray(node.selectedValues); attempt += 1) {
        await new Promise((done) => setTimeout(done, 50));
      }
      const labels = () => [...node.querySelectorAll('[role="option"], sf-list-item')]
        .map((item) => (item.textContent ?? '').trim()).filter(Boolean);
      const firstPage = labels();
      // A chosen record the first page does not hold must still be in the list and
      // still be the selection -- the case that makes a picker look as if it has
      // forgotten the answer.
      const holdsChosen = firstPage.some((text) => /Платежи/u.test(text));
      const selected = (node.selectedValues ?? []).map(String);
      // Searching asks the host, with the paging reset.
      await view.loadFieldOptions({key: 'section'}, {cursor: null, search: 'Решение 400'});
      await new Promise((done) => setTimeout(done, 300));
      const afterSearch = labels();
      // Loading more continues the list rather than replacing it.
      await view.loadFieldOptions({key: 'section'}, {cursor: null, search: ''});
      await new Promise((done) => setTimeout(done, 300));
      const page = view.getFieldOptionsPage({key: 'section'});
      const beforeMore = page?.items?.length ?? 0;
      await view.loadFieldOptions({key: 'section'}, {cursor: page?.nextCursor, search: ''});
      await new Promise((done) => setTimeout(done, 300));
      const afterMore = view.getFieldOptionsPage({key: 'section'})?.items?.length ?? 0;
      return {rendered: true, firstPageCount: firstPage.length, holdsChosen, selected,
        searchPlaceholder: node.getAttribute('search-placeholder'),
        quietStatus: (root.querySelector('[data-field="related"] .sf-field-picker-state')
          ?.textContent ?? '').trim(),
        afterSearchCount: afterSearch.length, beforeMore, afterMore,
        asks: asks.map((ask) => ({cursor: ask.cursor, search: ask.search}))};
    })();

    // Several values, measured as behaviour and not as an attribute: the two the
    // field holds arrive selected, and choosing a third keeps them. The attribute
    // alone would have proved nothing -- the component's initial selection comes
    // from the options' own `selected`, not from a value attribute.
    const choices = await (async () => {
      const node = root.querySelector('[data-field="modules"] sf-dropdown');
      if (!node) return null;
      for (let attempt = 0; attempt < 40 && !Array.isArray(node.selectedValues); attempt += 1) {
        await new Promise((done) => setTimeout(done, 50));
      }
      if (!Array.isArray(node.selectedValues)) return {upgraded: false};
      const chosen = () => (node.selectedValues ?? []).map(String).sort().join(',');
      const before = chosen();
      node.selectOptionByValue?.('audit');
      if (!node.selectOptionByValue) {
        const option = [...node.querySelectorAll('[role="option"], .sf-list-item')]
          .find((item) => /Аудит/u.test(item.textContent ?? ''));
        option?.click();
      }
      await new Promise((done) => setTimeout(done, 250));
      return {multiple: node.hasAttribute('multiple'), before, after: chosen(),
        written: JSON.stringify(view.changed.get('modules') ?? null)};
    })();
    // The save button must read as the main action: a real appearance from the
    // component's own enum, not a name it does not have.

    const countOf = () => {
      const text = root.querySelector('.sf-property-view-changed')?.textContent ?? '';
      const match = text.match(/(\d+)\s*$/u);
      return match ? Number(match[1]) : null;
    };
    const countedChanges = () => view.changed?.size ?? null;
    const intentsBeforeSave = raised.map((entry) => entry.intent);
    const countedBeforeTyping = countedChanges();
    const input = root.querySelector('[data-field="title"] input');
    // Typing without blurring: the count has to follow the typing, because a save
    // pressed straight afterwards would otherwise carry nothing.
    if (input) {
      input.value = 'Новое название';
      input.dispatchEvent(new Event('input', {bubbles: true}));
    }
    await new Promise((done) => setTimeout(done, 200));
    const countedWhileTyping = countedChanges();
    if (input) {
      input.dispatchEvent(new Event('change', {bubbles: true}));
    }
    await new Promise((done) => setTimeout(done, 250));
    const buttons = (() => {
      const read = (action) => {
        const painted = root.querySelector(`[data-action="${action}"]`);
        const host = painted?.closest('sf-button') ?? null;
        return {
          appearance: host?.getAttribute('appearance') ?? null,
          disabled: painted ? painted.disabled === true : null,
          background: painted ? getComputedStyle(painted).backgroundColor : null,
        };
      };
      return {save: read('save'), cancel: read('cancel')};
    })();
    // A blur after a change: the request says data is saved by the button alone.
    input?.dispatchEvent(new Event('blur', {bubbles: true}));
    await new Promise((done) => setTimeout(done, 250));
    const raisedAfterTyping = raised.length;
    const changedCount = countedChanges();
    const saveDisabled = root.querySelector('[data-action="save"]')?.disabled ?? null;

    // A conflict first: what the person typed must survive it.
    nextSave = 'conflict';
    await view.saveGroup();
    await new Promise((done) => setTimeout(done, 250));
    const afterConflict = {
      conflict: root.querySelector('.sf-property-view-conflict')?.textContent?.trim() ?? null,
      stillEditing: root.querySelector('.sf-property-view-group--editing')?.dataset.group ?? null,
      stillTyped: root.querySelector('[data-field="title"] input')?.value ?? null,
      changedCount: view.changed?.size ?? null,
    };

    // Then a refusal with a field error.
    nextSave = 'refused';
    await view.saveGroup();
    await new Promise((done) => setTimeout(done, 250));
    const afterRefusal = {
      errorUnderField: (() => {
        const row = root.querySelector('[data-field="title"]');
        const error = row?.querySelector('.sf-property-view-field-error');
        return error && !error.hidden ? error.textContent.trim() : null;
      })(),
      errorCount: root.querySelector('.sf-property-view-errors')?.textContent?.trim() ?? null,
    };

    // And finally a save that applies.
    nextSave = 'applied';
    const saveCallsBefore = raised.filter((entry) => entry.intent === 'group.save').length;
    await view.saveGroup();
    await new Promise((done) => setTimeout(done, 300));
    const saves = raised.filter((entry) => entry.intent === 'group.save');
    const afterApplied = {
      actions: Boolean(root.querySelector('.sf-property-view-actions')),
      editing: root.querySelector('.sf-property-view-group--editing')?.dataset.group ?? null,
      saveCalls: saves.length - saveCallsBefore,
      lastPayload: saves[saves.length - 1]?.payload ?? null,
    };

    return {
      before, switched, bareSeen, withRare, editing, editControls, changedCount, saveDisabled,
      raisedBeforeRare, raisedAfterRare, raisedAfterTyping,
      afterConflict, afterRefusal, afterApplied,
      singleSections, singleList: Boolean(singleList),
      requiredMarks, recordWhileEditing, choices, buttons, picker, intentsBeforeSave, fallback,
      concurrent, panel, panelAnnounced, slots, upload, stack, look, width, edits, configure, related,
      countedBeforeTyping, countedWhileTyping,
      intents: raised.map((entry) => entry.intent),
      loadPayload: raised.find((entry) => entry.intent === 'record.load')?.payload ?? null,
    };
  });

  if (measured.missing) {
    note({case: 'the element upgrades and takes a port', got: measured,
      expected: 'sf-property-view with setHostPort'});
  } else {
    // The arrangement is the host's, and both sections arrive.
    if (!measured.switched?.asked || measured.switched.showing !== measured.switched.asked) {
      note({case: 'pressing a tab shows that section', got: measured.switched,
        expected: 'the section pressed is the section drawn -- a rail nobody can press is a list of names'});
    }
    if (measured.bareSeen?.state !== 'ready' || !measured.bareSeen?.said) {
      note({case: 'a record with nothing in it says so', got: measured.bareSeen,
        expected: 'the host answered, and the panel says there is nothing to show'});
    }
    if (measured.before?.sectionItems !== 2) {
      note({case: 'two sections render a section list', got: measured.before?.sectionItems, expected: 2});
    }
    // One section renders its groups alone: a list of one is a control nobody can use.
    // One section renders no list at all now, rather than a hidden one: the
    // template leaves it out, which is cheaper than drawing a control to hide.
    if (measured.singleSections !== 0 || measured.singleList !== false) {
      note({case: 'one section renders no section list',
        got: {items: measured.singleSections, list: measured.singleList},
        expected: {items: 0, list: false}});
    }
    // Every value is drawn by the renderer set, by type.
    const drawn = measured.before?.drawn ?? {};
    if (drawn.author !== 'sf-avatar' || drawn.note !== 'empty' || drawn.title !== 'span') {
      note({case: 'each value is drawn by the renderer set for its type', got: drawn,
        expected: {author: 'sf-avatar', note: 'empty', title: 'span'}});
    }
    // A read names the object too.
    if (measured.loadPayload?.record_id !== 'record-1' || measured.loadPayload?.collection !== 'pages') {
      note({case: 'a read names the object it is reading', got: measured.loadPayload,
        expected: {record_id: 'record-1', collection: 'pages'}});
    }

    // The four a consumer reported, each measured rather than eyeballed.
    const drawnNow = measured.before?.drawn ?? {};
    if (drawnNow.progress !== 'sf-progress-scale') {
      note({case: 'a scale renders, because its component is loaded with the composite',
        got: drawnNow.progress, expected: 'sf-progress-scale'});
    }
    if (drawnNow.section !== 'sf-reference-link') {
      note({case: 'a reference renders as a link', got: drawnNow.section,
        expected: 'sf-reference-link'});
    }
    // The host's formatting is what a person reads; the Framework formats nothing.
    // The pen is drawn inside the value's button and is decoration, so it is not
    // part of what the field reads as.
    const reads = (value) => String(value ?? '').replace(/\s*edit$/u, '').trim();
    if (reads(measured.before?.text?.when) !== '13 января 2027') {
      note({case: "a date reads as the host's text, not its stored value",
        got: measured.before?.text?.when, expected: '13 января 2027'});
    }
    if (reads(measured.before?.text?.sum) !== '25 025,93 ₽') {
      note({case: "a number reads as the host's text with the field's unit",
        got: measured.before?.text?.sum, expected: '25 025,93 ₽'});
    }
    // «No group cards» was the consumer's first complaint about the look. A card
    // is a painted box: a border, a radius, padding and a surface.
    const card = measured.before?.card ?? {};
    if (card.border === '0px' || card.radius === '0px' || card.padding === '0px'
      || !card.background || card.background === 'rgba(0, 0, 0, 0)') {
      note({case: 'a group is a painted card', got: card,
        expected: 'a border, a radius, padding and a surface colour'});
    }

    // Rare: hidden, shown on request, and no second read.
    if (measured.before?.groups?.includes('expert')) {
      note({case: 'a rare group is hidden until asked for', got: measured.before?.groups,
        expected: 'no expert group'});
    }
    if (!measured.withRare?.groups?.includes('expert')) {
      note({case: 'a rare group appears when asked for', got: measured.withRare?.groups,
        expected: 'the expert group'});
    }
    if (measured.raisedAfterRare !== measured.raisedBeforeRare) {
      note({case: 'showing rare fields asks the host nothing', 
        got: {before: measured.raisedBeforeRare, after: measured.raisedAfterRare},
        expected: 'the same number of intents'});
    }
    // Editing draws the edit template of the same set.
    if (!measured.editControls?.includes('sf-input')) {
      note({case: 'an open group is drawn by the edit template', got: measured.editControls,
        expected: 'sf-input among the controls'});
    }
    if (measured.editing?.actions !== true) {
      note({case: 'the action bar appears with the open group',
        got: measured.editing?.actions, expected: true});
    }
    // Neither typing, nor choosing, nor blurring WRITES. Reads are expected and
    // the picker makes them: counting every intent made this assertion claim
    // something it never meant, and the candidate pages tripped it.
    const writesBeforeButton = (measured.intentsBeforeSave ?? []).filter((name) => name === 'group.save').length;
    if (writesBeforeButton !== 0) {
      note({case: 'typing, choosing and blurring write nothing',
        got: measured.intentsBeforeSave, expected: 'no group.save before the button'});
    }
    // The bar no longer names the count -- it named a number nobody acts on, and
    // the two controls that matter stood after it. What the count was guarding is
    // that a change is registered at all before the button is pressed.
    if (!measured.changedCount) {
      note({case: 'a change is registered before the button is pressed',
        got: measured.changedCount, expected: 'at least one'});
    }
    if (measured.saveDisabled !== false) {
      note({case: 'save is available once something changed', got: measured.saveDisabled,
        expected: false});
    }
    // The four a consumer measured on their stand.
    const seen = measured.look ?? {};
    const wide = measured.width ?? {};
    // 40rem is 640px at the default root size. The ladder step must lose to it.
    if (wide.painted === null || Math.abs(Number(wide.painted) - 640) > 2) {
      note({case: 'panel-width sets an exact panel width and beats panel-size',
        got: wide.painted, expected: '640 -- 40rem at the default root size'});
    }
    if (wide.titleClipped !== false) {
      note({case: 'a title the consumer asked room for is not cut',
        got: wide.titleClipped, expected: 'false at 40rem'});
    }
    const axes = seen.axes ?? {};
    // The panel's own furniture stands on one axis: the record's name and the
    // cards under it. The close, copy-link and open-full controls are not on it
    // -- they stand on the panel's outer edge, outside it, which is where the
    // mockup puts them and why they are measured against the panel's start
    // rather than with it.
    if (typeof axes.title !== 'number' || typeof axes.group !== 'number'
      || Math.abs(axes.title - axes.group) > 1) {
      note({case: 'the panel title and the cards under it share one inline axis',
        got: {title: axes.title, group: axes.group},
        expected: 'equal within a pixel'});
    }
    // A field label is inset from that axis by its card, and by exactly its card:
    // any other distance means something between the panel and the card is adding
    // an inset nobody declared.
    if (typeof axes.label !== 'number' || typeof axes.group !== 'number'
      || Math.abs(axes.group - axes.title) > 1
      || Math.abs((axes.label - axes.group) - Number(axes.groupInset)) > 1) {
      note({case: 'a field label is inset from the panel axis by its own card and nothing else',
        got: axes,
        expected: "the card on the panel axis, and the label inset from it by the card's padding and border"});
    }
    if (!seen.titlePainted) {
      note({case: "the panel title is painted in the drawer's own head",
        got: {text: seen.title, painted: seen.titlePainted},
        expected: 'a box with width and height -- the head renders either way, so an unfilled one is an empty row'});
    }
    if (seen.title !== 'SIMAI: Платежи №178') {
      note({case: 'the panel shows which record is open', got: seen.title,
        expected: 'the title visible, not only as an accessible name'});
    }
    // What scrolls is the one area between the head and the foot. The
    // arrangement inside it scrolls nothing of its own, and the bands are rows
    // of the panel's column rather than things stuck to a scroller.
    if (seen.scrollGrows === '0' || seen.scrollOverflow !== 'auto'
      || seen.bodyScrolls !== 'visible') {
      note({case: 'one area scrolls, between a head and a foot that do not',
        got: {grow: seen.scrollGrows, scroller: seen.scrollOverflow, arrangement: seen.bodyScrolls},
        expected: 'the area between the bands taking the height left and scrolling it'});
    }
    if (seen.statusHidden !== 'none') {
      note({case: 'a hidden status line takes no space in the portalled panel',
        got: seen.statusHidden,
        expected: "none -- the rule must not be scoped to the element the panel left"});
    }

    // The stack.
    const stacked = measured.stack ?? {};
    const [lowerDepth, upperDepth] = (stacked.depths ?? []).map(Number);
    if (!Number.isFinite(lowerDepth) || upperDepth !== lowerDepth + 1) {
      note({case: 'the window opened later sits one step above the one before it',
        got: stacked.depths,
        expected: "consecutive depths -- the order is the page's, not this probe's"});
    }
    if (stacked.stacked?.join(',') !== 'true,false') {
      note({case: 'the one below is marked stacked and the top is not', got: stacked.stacked,
        expected: 'true for the lower, false for the top'});
    }
    if (stacked.lowerInteractive !== 'none' || stacked.upperInteractive === 'none') {
      note({case: 'only the top window answers a click',
        got: {lower: stacked.lowerInteractive, upper: stacked.upperInteractive},
        expected: 'the lower inert, the top live -- a dimmed window that still answered clicks would look disabled and not be'});
    }
    if (!stacked.lowerVisible || Number(stacked.lowerVisible) >= 1 || Number(stacked.lowerVisible) <= 0) {
      note({case: 'the one below stays visible and dimmed, not hidden',
        got: stacked.lowerVisible, expected: 'an opacity between 0 and 1'});
    }
    // The window above stands exactly over the one below, at the same width
    // (owner, 2026-10-07). The step in read as a panel that had slipped, and
    // what says there is something under this is the dimming, which is measured
    // two cases above. sf-drawer keeps `stack-offset` for a consumer that wants
    // the step; this one asks for none, so a step appearing here is a default
    // coming back rather than a choice.
    if (!stacked.inset || Number(stacked.inset.insetBy) !== 0 || stacked.inset.sameWidth !== true) {
      note({case: 'the top window stands over the one below, at the same width',
        got: stacked.inset,
        expected: 'no inset from the edge with both windows the same width'});
    }
    if (stacked.closedByEscape?.length !== 1 || stacked.closedByEscape[0]?.[0] !== 'upper') {
      note({case: 'Esc closes the top window and no other', got: stacked.closedByEscape,
        expected: 'one close, from the upper window'});
    }
    if (stacked.lowerKeptItsEdit !== 'Набрано и не сохранено' || !stacked.lowerStillEditing) {
      note({case: 'a window left half-edited underneath keeps what was typed',
        got: {kept: stacked.lowerKeptItsEdit, editing: stacked.lowerStillEditing},
        expected: 'the typed value and the open group intact'});
    }
    if (stacked.afterUpperClosed?.stacked !== 'false') {
      note({case: 'closing the top returns the one below to the top',
        got: stacked.afterUpperClosed, expected: 'stacked false at depth 0'});
    }

    // The host's slots, and the identity that makes them worth having.
    const hosted = measured.slots ?? {};
    if (!hosted.actionsPlaced || !hosted.footerPlaced) {
      note({case: "the host's slotted content is placed in both layouts", got: hosted,
        expected: 'actions above the body in full page, footer under it'});
    }
    if (!hosted.unwrapped) {
      note({case: 'a carrier whose only attribute is slot is unwrapped, and its content kept',
        got: hosted.unwrapped,
        expected: "true -- a host puts its elements inside the carrier, not on it"});
    }
    if (!hosted.sameNodeAfterRender || !hosted.footerStillThere) {
      note({case: "a render keeps the host's own nodes", got: hosted,
        expected: 'the same nodes still in place after an edit and a cancel'});
    }
    if (hosted.listenerSurvived !== 2) {
      note({case: "the host's listeners survive a render, which a copy would not",
        got: hosted.listenerSurvived, expected: 2});
    }

    // A group of related records.
    const rel = measured.related ?? {};
    if (!rel.hasList || rel.hasFieldRows !== false) {
      note({case: 'a related group holds a list rather than fields',
        got: {list: rel.hasList, fields: rel.hasFieldRows}, expected: 'a data view and no field rows'});
    }
    if (rel.editOffered !== false) {
      note({case: 'a related group offers no field editing',
        got: rel.editOffered,
        expected: 'no edit control -- there are no fields in it to put into an edit mode'});
    }
    if (rel.chrome !== '' || rel.rowCap !== '3') {
      note({case: "the list is embedded: no chrome of its own, and the host's row cap",
        got: {chrome: rel.chrome, rowCap: rel.rowCap}, expected: {chrome: '', rowCap: '3'}});
    }
    if (rel.asks?.length !== 1) {
      note({case: 'the nested list asks for a port exactly once',
        got: rel.asks, expected: 'one request from the data view'});
    }
    const ask = rel.asks?.[0];
    if (ask?.owner !== 'property-view' || ask?.record !== 'record-related' || ask?.group !== 'invoices') {
      note({case: 'the request says which composite is asking and about what',
        got: ask, expected: {owner: 'property-view', record: 'record-related', group: 'invoices'}});
    }
    if (rel.propertyViewAsked !== false) {
      note({case: 'a property view that was handed a port does not ask for one',
        got: rel.propertyViewAsked,
        expected: 'false -- this one had setHostPort called on it before it connected'});
    }
    if (!rel.rows) {
      note({case: "the records the nested host answered with are drawn in the group",
        got: rel.rows,
        expected: 'rows -- a list that asked, was answered and still shows nothing is the failure this whole seam exists to avoid'});
    }
    if (rel.tableInLightDom !== true || rel.tableParentIsSlot !== false) {
      note({case: "the embedded list's table is a child of it, not the fallback in its shadow tree",
        got: {inLightDom: rel.tableInLightDom, parentIsSlot: rel.tableParentIsSlot},
        expected: "a slotted table -- the Framework's stylesheets are page level and do not reach a shadow tree"});
    }
    if (rel.beforeData?.toolbarHidden !== true || rel.beforeData?.pagesHidden !== true) {
      note({case: 'an embedded list has no chrome from its first frame, not from its first answer',
        got: rel.beforeData,
        expected: 'both already out before the nested host answered -- the attributes have to be observed, not read once at connection'});
    }
    if (rel.selectColumn !== 0 || rel.settingsColumn !== 0) {
      note({case: 'an embedded list carries neither chrome column',
        got: {select: rel.selectColumn, settings: rel.settingsColumn},
        expected: 'none of either -- there is no bulk band for a checkbox to feed and no toolbar for a gear to lead to'});
    }
    if (rel.labelAxis === null || rel.rowTextAxis === null
      || Math.abs(Number(rel.rowTextAxis) - Number(rel.labelAxis)) > 1) {
      note({case: 'the row text of an embedded list sits on the field-label axis',
        got: {label: rel.labelAxis, row: rel.rowTextAxis},
        expected: 'the same inline start within a pixel -- a list indented from the fields above it reads as a different page'});
    }
    if (rel.listBorder !== '0px') {
      note({case: 'the embedded list draws no frame of its own inside the group card',
        got: rel.listBorder,
        expected: '0px -- the group draws the card, and a card inside a card is what an embedded list must not look like'});
    }

    // Configuring the view.
    const set = measured.configure ?? {};
    if (set.configureWithoutCapability || set.startedWithoutCapability !== false) {
      note({case: 'no control leads to configuring when the host cannot store a view',
        got: {offered: set.configureWithoutCapability, started: set.startedWithoutCapability},
        expected: 'absent and refused -- an arrangement that cannot be stored is lost on the next load'});
    }
    if (!set.configureOffered) {
      note({case: 'a host that declares view-settings is offered the control',
        got: set.configureOffered, expected: true});
    }
    if (set.hiddenBeforeConfiguring !== false || set.hiddenListed !== true || set.hiddenDimmed !== 'true') {
      note({case: 'a hidden field is out of the way until the view is being configured, then listed and dimmed',
        got: {before: set.hiddenBeforeConfiguring, listed: set.hiddenListed, dimmed: set.hiddenDimmed},
        expected: 'absent, then listed and marked -- a hidden field nobody can see is one nobody can show again'});
    }
    if (set.hideLockedByShared !== true) {
      note({case: 'what was hidden for everyone cannot be shown again from a personal layer',
        got: set.hideLockedByShared,
        expected: 'the control disabled -- the host names the layer that hid it, so the component does not reimplement the rule'});
    }
    if (set.sharedCreatable !== false || set.layerToggle) {
      note({case: 'a layer this person may not write is not offered',
        got: {sharedCreatable: set.sharedCreatable, layerToggle: set.layerToggle},
        expected: 'the view chooser makes no shared view, and no layer toggle stands beside it'});
    }
    if (!Array.isArray(set.fieldLists) || set.fieldLists.length !== 2 || !set.groupList) {
      note({case: 'the field lists and the group list are sortable lists naming their container',
        got: {fields: set.fieldLists, groups: set.groupList},
        expected: 'field:g1 and field:g2, and group:s1'});
    }
    if (!set.variantOffered || !set.variantAbsentWithoutOptions) {
      note({case: 'the variant chooser appears only for a field the host offers variants for',
        got: {offered: set.variantOffered, absentOtherwise: set.variantAbsentWithoutOptions},
        expected: 'present on the field with variantOptions and absent on the field without -- a variant the host cannot render would be a broken view'});
    }
    if (set.saveTarget?.kind !== 'personal' || set.saveTarget?.revision !== 'p1') {
      note({case: 'a save is against the layer being edited and its revision',
        got: set.saveTarget, expected: {kind: 'personal', revision: 'p1'}});
    }
    // Dense order for the two containers the move touched, and nothing written for
    // the section that was not involved.
    const moved = set.movedFields ?? {};
    const orders = Object.fromEntries(Object.entries(moved).map(([key, value]) => [key, [value.group, value.order]]));
    if (moved.b?.group !== 'g2' || moved.b?.order !== 1 || moved.d?.group !== 'g2' || moved.d?.order !== 2
      || moved.a?.group !== 'g1' || moved.c?.group !== 'g1' || 'e' in moved) {
      note({case: 'the layer carries dense order for the containers the move touched and nothing for the others',
        got: orders,
        expected: 'b and d ordered in g2, a and c ordered in g1, nothing written for e in the untouched section'});
    }
    if (set.movedInDom?.[0] !== 'b') {
      note({case: 'the field moves under the hand, before the host answers',
        got: set.movedInDom, expected: "b first in g2 -- «applied immediately» is what the request asks for"});
    }
    if (set.hostRecordUntouched !== true) {
      note({case: "a drag rearranges the component's copy and not the object the host handed it",
        got: set.hostRecordUntouched,
        expected: "b still in g1 in the host's own record -- a host that caches its answer would find it rewritten by a drag it had not accepted"});
    }
    if (set.rapidRevisions?.length !== 2 || set.rapidRevisions[0] === set.rapidRevisions[1]) {
      note({case: 'two changes in a row are written against moving revisions, not both against the old one',
        got: set.rapidRevisions,
        expected: 'two different revisions -- the second carries what the first earned, or being quick produces a conflict the person caused by nothing'});
    }
    if (set.widthWritten !== 'full') {
      note({case: 'a width change writes that field in the layer',
        got: set.widthWritten, expected: 'full'});
    }
    if (set.reloadedOnConflict !== true) {
      note({case: 'a conflict re-reads the record rather than leaving an arrangement nobody stored on screen',
        got: set.reloadedOnConflict, expected: true});
    }
    if (set.resetTarget?.kind !== 'personal' || set.resetSendsNoView !== true || set.reloadedOnReset !== true) {
      note({case: 'a reset is a write against the revision carrying no arrangement of its own',
        got: {target: set.resetTarget, noView: set.resetSendsNoView, reloaded: set.reloadedOnReset},
        expected: "the layer and its revision, no view, and a re-read -- the host owns the defaults and the component's idea of them would overwrite them"});
    }

    // The three from the second stand run.
    const edited = measured.edits ?? {};
    if (edited.timeHeld !== '2026-11-27' || !edited.timeShown) {
      note({case: 'a datetime field shows the day it holds',
        got: {held: edited.timeHeld, shown: edited.timeShown},
        expected: "2026-11-27 held and something shown -- the date control parses an anchored ISO date, so a value carrying a clock falls through to a loose digit scan and renders nothing"});
    }
    if (edited.timeWritten !== '2026-11-28T13:26:00') {
      note({case: 'editing the day of a datetime keeps the clock',
        got: edited.timeWritten,
        expected: "2026-11-28T13:26:00 -- the control returns a day, so the time the record held has to be put back, or the value silently moves to midnight"});
    }
    if (edited.dateHeld !== '2027-01-13' || !edited.dateShown) {
      note({case: "a date editor takes the value while the view reads the host's text",
        got: {held: edited.dateHeld, shown: edited.dateShown},
        expected: "the stored 2027-01-13 held, and something shown in the control's own format"});
    }
    if (edited.refusedPicker || edited.refusedRetry || !edited.refusedShowsValue) {
      note({case: 'a refused field falls back to its value, with no picker and no retry',
        got: edited,
        expected: 'the value shown, because a refusal cannot be retried into candidates'});
    }
    if (edited.controlWidth !== null && edited.valueWidth !== null
      && edited.controlWidth < edited.valueWidth - 2) {
      note({case: 'a full-width field has a control that fills its row',
        got: {control: edited.controlWidth, row: edited.valueWidth},
        expected: 'the control as wide as the row it spans'});
    }

    // The file editor.
    const files = measured.upload ?? {};
    if (!files.zone) {
      note({case: 'a file field has an upload zone when the host can take files',
        got: files, expected: 'sf-file-upload rendered'});
    }
    if (files.asked?.length !== 2 || !files.asked.every((ask) => ask.isFile)) {
      note({case: 'each chosen file is handed to the host as a File',
        got: files.asked, expected: 'two asks, each carrying the real File'});
    }
    if (!/f2/u.test(files.changed ?? '')) {
      note({case: 'a stored file joins what the person changed', got: files.changed,
        expected: 'the stored descriptor among the changed value'});
    }
    if (files.savedYet !== false) {
      note({case: 'taking a file saves nothing: the button still does that',
        got: files.savedYet, expected: false});
    }
    if (!/слишком велик/u.test(files.errorShown ?? '')) {
      note({case: "a refused file shows the host's reason under its field",
        got: files.errorShown, expected: "the host's message"});
    }

    // The modeless panel.
    const inPanel = measured.panel ?? {};
    if (!inPanel.drawer || !inPanel.body) {
      note({case: 'the panel renders the same view inside a drawer', got: inPanel,
        expected: 'a drawer carrying the view body'});
    }
    if (inPanel.modal !== 'true' || inPanel.overlay !== 'true') {
      note({case: 'the panel dims the page behind it rather than narrowing it',
        got: {modal: inPanel.modal, overlay: inPanel.overlay},
        expected: 'modal and overlay both on -- a drawer that narrows the page reflows the table behind it into letter-wide columns, which is the state the owner photographed'});
    }
    if (inPanel.closeOnEsc !== 'false') {
      note({case: "the drawer's own Esc is off, because a stack must close one window",
        got: inPanel.closeOnEsc, expected: 'false'});
    }
    if (!inPanel.portalled) {
      note({case: 'the panel is portalled out of the element, which the styles must follow',
        got: inPanel.portalled,
        expected: 'true -- and if this ever becomes false, the panel styles need rescoping'});
    }
    // The panel's own rules still reach it once portalled; the one measured is
    // the surface the drawer paints for it, because the panel pads nothing
    // itself any more -- the drawer's body carries the gutter.
    if (!inPanel.painted || /rgba\(0, 0, 0, 0\)|^transparent$/u.test(String(inPanel.painted))) {
      note({case: 'the portalled panel carries its own styles', got: inPanel.painted,
        expected: 'a painted surface from rules that are not scoped to the element'});
    }
    if (inPanel.controls?.join(',') !== 'close,copy-link,open-full') {
      note({case: 'a panel with an address carries all three controls', got: inPanel.controls,
        expected: 'close, copy-link, open-full'});
    }
    if (inPanel.withoutAddress?.join(',') !== 'close') {
      note({case: 'a panel with no address offers nothing to copy or open',
        got: inPanel.withoutAddress, expected: 'close alone'});
    }
    const announced = measured.panelAnnounced ?? [];
    const closed = announced.find((entry) => entry.name === 'sf-property-view-close');
    if (!closed || closed.reason !== 'escape' || closed.unsaved === null) {
      note({case: 'Esc announces the close, with the count of unsaved fields',
        got: announced, expected: 'a close carrying reason escape and a field count'});
    }
    const opened = announced.find((entry) => entry.name === 'sf-property-view-open-full');
    if (!opened || opened.address !== '/admin/cms/pages/record-7') {
      note({case: 'opening full page announces the address the host gave',
        got: announced, expected: "the host's own address"});
    }

    // Four reference fields read at once: all four end with a page, none stuck.
    const stuck = Object.entries(measured.concurrent ?? {})
      .filter(([, page]) => !page || page.status === 'loading');
    if (stuck.length) {
      note({case: 'every reference field read at once ends with its own page',
        got: measured.concurrent,
        expected: 'four pages, none left loading -- one counter per field, not one for all'});
    }

    // The record picker, the step that removes the consumer's fallback link.
    const picked = measured.picker ?? {};
    if (!picked.rendered) {
      note({case: 'a reference field is picked when the host can serve candidates',
        got: picked, expected: 'a picker rendered'});
    } else {
      if (picked.firstPageCount < 20) {
        note({case: 'the first page is asked for as the group opens, not on first keystroke',
          got: picked.firstPageCount, expected: 'at least the twenty of the first page'});
      }
      if (!picked.holdsChosen || picked.selected?.join(',') !== 'record-0317') {
        note({case: 'a chosen record the page does not hold is still shown and still chosen',
          got: {holdsChosen: picked.holdsChosen, selected: picked.selected},
          expected: 'Платежи in the list and record-0317 selected'});
      }
      if (picked.searchPlaceholder === 'Placeholder' || !picked.searchPlaceholder) {
        note({case: "the picker's search names what is searched",
          got: picked.searchPlaceholder,
          expected: "a real placeholder -- sf-dropdown's own default is the word Placeholder"});
      }
      const searched = (picked.asks ?? []).find((ask) => ask.search === 'Решение 400');
      if (!searched || searched.cursor !== null) {
        note({case: 'a search reaches the host and resets the paging',
          got: picked.asks, expected: 'an ask carrying the search with a null cursor'});
      }
      if (picked.afterMore !== picked.beforeMore + 20) {
        note({case: 'loading more continues the list rather than replacing it',
          got: {before: picked.beforeMore, after: picked.afterMore},
          expected: 'twenty more than before'});
      }
    }

    // The five a consumer reported from the edit mode.
    if (measured.requiredMarks !== 1) {
      note({case: 'a required field carries one mark, not two', got: measured.requiredMarks,
        expected: 1});
    }
    // With a host that can serve candidates the field is a picker carrying its
    // value; the read-only fallback is measured on the host that cannot, below.
    if (measured.recordWhileEditing?.empty
      || !/Платежи/u.test(measured.recordWhileEditing?.text ?? '')) {
      note({case: 'a reference field being edited still shows the value it holds',
        got: measured.recordWhileEditing,
        expected: 'the chosen label present and no empty text'});
    }
    if (measured.fallback?.empty || !measured.fallback?.readonly || measured.fallback?.picker
      || !/Старое значение/u.test(measured.fallback?.text ?? '')) {
      note({case: 'a host that cannot serve candidates shows the value read-only',
        got: measured.fallback,
        expected: 'the value, marked not editable, and no empty text'});
    }
    if (measured.choices?.multiple !== true || measured.choices?.before !== 'billing,updates') {
      note({case: 'several values arrive selected, all of them', got: measured.choices,
        expected: 'multiple set and both values already chosen'});
    }
    if (measured.choices?.after !== 'audit,billing,updates') {
      note({case: 'choosing a third value keeps the first two', got: measured.choices,
        expected: 'three values chosen, not one'});
    }
    if (measured.countedWhileTyping !== (measured.countedBeforeTyping ?? -1) + 1) {
      note({case: 'the count rises while typing, before any blur',
        got: {before: measured.countedBeforeTyping, while: measured.countedWhileTyping},
        expected: 'one more than before the first keystroke'});
    }
    const save = measured.buttons?.save ?? {};
    const cancel = measured.buttons?.cancel ?? {};
    const unpainted = (colour) => !colour || colour === 'rgba(0, 0, 0, 0)' || colour === 'transparent';
    if (save.appearance !== 'default' || cancel.appearance !== 'outline') {
      note({case: 'the buttons name appearances the component has', got: {save, cancel},
        expected: {save: 'default', cancel: 'outline'}});
    }
    if (unpainted(save.background) || save.background === cancel.background) {
      note({case: 'save is painted as the main action and the cancel is not',
        got: {save: save.background, cancel: cancel.background},
        expected: 'a filled save, a different and unfilled cancel'});
    }

    // A conflict keeps the person's work.
    if (!measured.afterConflict?.conflict || measured.afterConflict?.stillEditing !== 'about'
      || measured.afterConflict?.stillTyped !== 'Новое название') {
      note({case: 'a conflict is said and what was typed is kept', got: measured.afterConflict,
        expected: 'a conflict message, the group still open, the typed value intact'});
    }
    // A refusal places each error under its own field.
    if (measured.afterRefusal?.errorUnderField !== 'Заголовок не может быть пустым') {
      note({case: "the host's field error sits under that field", got: measured.afterRefusal,
        expected: 'the message under the title field'});
    }
    // And an applied save: exactly one intent, carrying only what changed, with
    // the revision the read carried.
    const payload = measured.afterApplied?.lastPayload ?? {};
    if (measured.afterApplied?.saveCalls !== 1) {
      note({case: 'one press raises one save', got: measured.afterApplied?.saveCalls, expected: 1});
    }
    const changedKeys = Object.keys(payload.values ?? {}).sort().join(',');
    if (changedKeys !== 'modules,title') {
      note({case: 'a save carries exactly the fields the person changed, and no others',
        got: payload.values, expected: 'the typed title and the edited list, nothing else'});
    }
    if (JSON.stringify(payload.values?.modules) !== JSON.stringify(['updates', 'billing', 'audit'])) {
      note({case: 'the edited list keeps the values it had and adds the chosen one',
        got: payload.values?.modules, expected: ['updates', 'billing', 'audit']});
    }
    if (payload.revision !== '7' || payload.section !== 'main' || payload.group !== 'about'
      || payload.record_id !== 'record-1' || payload.collection !== 'pages') {
      note({case: 'a save names the object, its group and the revision the read carried', got: payload,
        expected: {record_id: 'record-1', collection: 'pages', revision: '7',
          section: 'main', group: 'about'}});
    }
    if (measured.afterApplied?.actions !== false || measured.afterApplied?.editing !== null) {
      note({case: 'an applied save closes the group', got: measured.afterApplied,
        expected: 'no action bar and no open group'});
    }
  }

  // The phone arrangement, measured last because it resizes the page: below the
  // drawer's own breakpoint the panel is full screen, the sections are a list, and
  // a section is the screen behind it. Measured at 390px, the width the consumer
  // reported their own findings from.
  await page.setViewportSize({width: 390, height: 780});
  await page.waitForTimeout(400);
  const phone = await page.evaluate(async () => {
    const view = document.createElement('sf-property-view');
    view.setAttribute('record-id', 'record-phone');
    view.setAttribute('collection', 'pages');
    document.body.append(view);
    view.setHostPort({
      version: '1.7.0', capabilities: [],
      async raise(intent) {
        if (intent === 'record.load') {
          return {answer: 'applied', record: {record_id: 'record-phone', revision: '1', sections: [
            // Two columns, because that is what a consumer's real record has and
            // what the first version of this fixture did not: a phone measured
            // only against a one-column group says nothing about the thing that
            // actually wraps every label onto two lines.
            {key: 'main', label: 'Основное', groups: [{key: 'g1', label: 'Группа', columns: 2, fields: [
              {key: 'title', label: 'Заголовок', propertyType: 'string', value: 'Запись'},
              {key: 'code', label: 'Код', propertyType: 'string', value: 'A-1'},
            ]}]},
            {key: 'extra', label: 'Прочее', groups: [{key: 'g2', label: 'Ещё', columns: 1, fields: [
              {key: 'note', label: 'Заметка', propertyType: 'string', value: 'Текст'},
            ]}]},
          ]}};
        }
        return {answer: 'unavailable', reason: 'unknown-intent'};
      },
    });
    await new Promise((done) => setTimeout(done, 700));
    const screenOf = () => view.querySelector('.sf-property-view-layout')?.getAttribute('data-screen') ?? null;
    const first = {
      screen: screenOf(),
      listed: view.querySelectorAll('[data-phone-section]').length,
      groups: view.querySelectorAll('.sf-property-view-group').length,
      tree: Boolean(view.querySelector('sf-tree')),
    };
    view.querySelector('[data-phone-section="extra"]')?.click();
    await new Promise((done) => setTimeout(done, 400));
    const opened = {
      screen: screenOf(),
      title: view.querySelector('.sf-property-view-phone-title')?.textContent?.trim() ?? null,
      back: Boolean(view.querySelector('[data-action="phone-back"]')),
      group: view.querySelector('.sf-property-view-group')?.getAttribute('data-group') ?? null,
      listed: view.querySelectorAll('[data-phone-section]').length,
    };
    view.editGroup('extra', 'g2');
    await new Promise((done) => setTimeout(done, 400));
    const bar = view.querySelector('.sf-property-view-actions');
    const barStyle = bar ? getComputedStyle(bar) : null;
    const barSeen = {
      present: Boolean(bar),
      // The bar is the last row of a column that does not scroll, so it keeps
      // the floor without being positioned. What it must not be is the last
      // thing in a scroller, which is where it used to be.
      lastRow: bar?.parentElement?.lastElementChild === bar,
      inScroller: Boolean(bar?.closest('.sf-property-view-scroll')),
      // A bar with no background of its own lets the rows pass through the only
      // control that saves them.
      background: barStyle?.backgroundColor ?? null,
    };
    view.cancelEdit();
    await new Promise((done) => setTimeout(done, 200));
    view.querySelector('[data-action="phone-back"]')?.click();
    await new Promise((done) => setTimeout(done, 400));
    const back = {screen: screenOf(), listed: view.querySelectorAll('[data-phone-section]').length};
    // A two-column group on a phone: the container query has to collapse it, or
    // every label and every value wraps onto two lines in a 390px panel.
    view.querySelector('[data-phone-section="main"]')?.click();
    await new Promise((done) => setTimeout(done, 400));
    const fields = view.querySelector('[data-group="g1"] .sf-property-view-group-fields');
    const columns = fields ? getComputedStyle(fields).gridTemplateColumns : null;
    const layout = view.querySelector('.sf-property-view-layout');
    const layoutStyle = layout ? getComputedStyle(layout) : null;
    const containment = layout ? {
      type: layoutStyle.containerType,
      name: layoutStyle.containerName,
      width: Math.round(layout.getBoundingClientRect().width),
      display: layoutStyle.display,
      groupIsDescendant: layout.contains(fields),
    } : null;
    view.remove();
    return {first, opened, barSeen, back, columns, containment, columnCount: columns ? columns.split(/\s+/u).length : null};
  });
  if (phone.first.listed !== 2 || phone.first.groups !== 0 || phone.first.tree !== false
    || phone.first.screen !== 'sections') {
    note({case: 'on a phone the sections are a list and the groups are the screen behind it',
      got: phone.first,
      expected: 'two section rows, no groups drawn yet, and no desktop section tree'});
  }
  if (phone.opened.screen !== 'groups' || phone.opened.title !== 'Прочее' || !phone.opened.back
    || phone.opened.group !== 'g2' || phone.opened.listed !== 0) {
    note({case: 'a section is a screen of its own, named, with a way back',
      got: phone.opened,
      expected: {screen: 'groups', title: 'Прочее', back: true, group: 'g2', listed: 0}});
  }
  if (phone.back.screen !== 'sections' || phone.back.listed !== 2) {
    note({case: 'back returns to the list of sections', got: phone.back,
      expected: 'the list screen with both sections again'});
  }
  if (phone.columnCount !== 1) {
    note({case: 'a two-column group becomes one column in a phone-width panel',
      got: {columns: phone.columns, count: phone.columnCount},
      expected: 'a single track -- two columns in 390px wraps every label and every value onto two lines'});
  }
  if (!phone.barSeen.present || !phone.barSeen.lastRow || phone.barSeen.inScroller
    || /rgba\(0, 0, 0, 0\)|^transparent$/u.test(String(phone.barSeen.background))) {
    note({case: 'the action bar holds the bottom of a phone screen, opaquely',
      got: phone.barSeen,
      expected: 'sticky with a painted surface -- Save has to stay reachable without rows scrolling through it'});
  }

  // The head's three answers, measured on a panel of their own: the corner is a
  // menu whatever is in it, the copy says it copied, and a reference is read
  // without becoming an edit.
  await page.setViewportSize({width: 1100, height: 900});
  await page.waitForTimeout(300);
  const head = await page.evaluate(async () => {
    const view = document.createElement('sf-property-view');
    view.setAttribute('record-id', 'record-head');
    view.setAttribute('collection', 'pages');
    // As a panel, because the copy and the close stand on the drawer's outer
    // edge: read on a page layout there is no edge for them to stand on.
    view.setAttribute('panel', '');
    view.setAttribute('panel-width', '40rem');
    document.body.append(view);
    view.setHostPort({
      version: '1.7.0', capabilities: ['view-settings'],
      async raise(intent) {
        if (intent === 'record.load') {
          return {answer: 'applied', record: {
            record_id: 'record-head', revision: '1',
            // The copy control appears only when the host sent an address, and
            // the «…» only when a layer can be arranged.
            address: '/pages/record-head',
            sections: [
              {key: 'main', label: 'Основное', groups: [{key: 'g1', label: 'Группа', columns: 1, fields: [
                {key: 'owner', label: 'Раздел', propertyType: 'record',
                  value: {record_id: 'other-1', label: 'Платежи и биллинг', href: '/pages/other-1'}},
              ]}]},
            ],
            view: {
              target: 'personal',
              editable: ['personal', 'shared'],
              layers: {personal: {revision: 'p1', view: {schema_version: 1, sections: {}, groups: {}, fields: {}}}},
            },
          }};
        }
        if (intent === 'record.open') return {answer: 'applied'};
        return {answer: 'applied'};
      },
    });
    for (let tries = 0; tries < 60 && !view.sections?.length; tries += 1) {
      await new Promise((done) => window.setTimeout(done, 50));
    }
    const root = view.panelContent() ?? view;
    const trigger = root.querySelector('[data-action="menu"]');
    const menu = {
      items: (view.panelMenuItems ?? []).map((item) => item.id),
      glyph: trigger ? trigger.textContent.trim() : null,
    };

    const link = root.querySelector('.sf-reference-link');
    const reference = link ? {
      plain: link.classList.contains('sf-reference-link--plain'),
      arrow: Boolean(link.querySelector('.sf-reference-link__icon')),
      border: getComputedStyle(link).borderTopWidth,
      padding: getComputedStyle(link).paddingInlineStart,
    } : null;

    // Following a reference is one intent. It used to be two: the press reached
    // the field's own button and opened the group for editing behind the record
    // that had just opened.
    const anchor = root.querySelector('.sf-property-view-reference a')
      ?? root.querySelector('.sf-property-view-reference');
    anchor?.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}));
    await new Promise((done) => window.setTimeout(done, 300));
    const after = view.panelContent() ?? view;
    const edits = after.querySelectorAll('.sf-property-view-group sf-input, .sf-property-view-group sf-dropdown').length;

    view.copyAddress?.();
    await new Promise((done) => window.setTimeout(done, 200));
    // The copy stands on the drawer's outer edge, beside the panel rather than
    // inside it, so it is looked for in the document.
    const copies = [...document.querySelectorAll('[data-action="copy-link"]')];
    const copyControl = copies[copies.length - 1] ?? null;
    const copy = {
      copied: view.addressCopied === true,
      glyph: copyControl?.querySelector('.sf-icon')?.textContent.trim() ?? null,
    };

    const arranging = (() => {
      view.startConfiguringView?.();
      return (view.panelMenuItems ?? []).map((item) => item.id);
    })();
    view.cancelConfiguringView?.();
    view.remove();
    return {menu, reference, edits, copy, arranging};
  });
  // One item is still a menu. Drawn as itself, the corner of the head changed
  // glyph with what was in it, and a host slotting its own items found a
  // different control each time (owner, 2026-10-08).
  if (head.menu.items.length !== 1 || head.menu.glyph !== 'more_horiz') {
    note({case: 'the corner of the head is a menu, whatever is in it',
      got: head.menu, expected: "one item behind «more_horiz», not the item drawn in the menu's place"});
  }
  if (!head.reference || !head.reference.plain || head.reference.arrow
    || head.reference.border !== '0px' || head.reference.padding !== '0px') {
    note({case: "a reference inside a field is the link alone",
      got: head.reference,
      expected: 'plain: no card frame, no padding, no arrow beside a word that is already a link'});
  }
  if (head.edits !== 0) {
    note({case: 'following a reference does not put the group into edit',
      got: {editControls: head.edits},
      expected: 'the related record open and the group behind it still being read'});
  }
  if (!head.copy.copied || head.copy.glyph !== 'check') {
    note({case: 'the copy control says it copied', got: head.copy,
      expected: "a tick in place of the link glyph -- copying leaves nothing a person can see"});
  }
  // Reset lives in the bar at the foot, with its confirmation. The same act
  // behind the «…» as well is one destruction reachable two ways, one quietly.
  if (head.arranging.includes('reset')) {
    note({case: 'arranging offers no reset in the menu', got: head.arranging,
      expected: 'reset only in the bar at the foot, where it asks first'});
  }

  console.error(JSON.stringify({...measured, phone, head}, null, 1));
  await page.close();
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log('PROPERTY_VIEW_OK');
