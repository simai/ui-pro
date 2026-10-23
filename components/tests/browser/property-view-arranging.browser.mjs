#!/usr/bin/env node
// Usage: node this-file /absolute/path/to/output
// Arranging a record's view: the band that says the mode is on, the two controls
// a field carries while it is arranged, and the drop that moves a field to
// another section. What this measures is what a screenshot of the mode cannot
// say -- that the drop reached the layer, that Esc closed the surface and not the
// panel, and that a full-screen panel's own controls are on the screen.
import {resolve, join} from 'node:path';
import {existsSync} from 'node:fs';
import {chromium} from 'playwright';

if (!process.argv[2]) throw new Error('Build output root is required');
const out = resolve(process.argv[2]);
const styles = [
  'core/core/css/core.css', 'core/core/css/utility.full.css',
  'component/component/buttons/css/buttons.css',
  // Without these two a glyph has no colour rule of its own, so every icon read
  // as the initial black and a measurement of how pale the service glyphs are
  // measured nothing.
  'component/component/icon-buttons/css/icon-buttons.css',
  'component/component/icons/css/icons.css',
  'component/component/inputs/css/inputs.css',
  'component/component/tree/css/tree.css',
  'component/component/dropdown/css/dropdown.css',
  'smart/smart/drawer/css/drawer.css',
  'smart/smart/popover/css/popover.css',
  'smart/smart/property-view/css/property-view.css',
  'smart/smart/sortable/css/sortable.css',
].map((p) => join(out, p));
const modules = [
  'core/core/js/core.js', 'core/core/js/smart-base.js', 'smart/smart/icons/js/icons.js',
  'smart/smart/buttons/js/buttons.js', 'smart/smart/icon-buttons/js/icon-buttons.js',
  'smart/smart/inputs/js/inputs.js', 'smart/smart/switch/js/switch.js',
  'smart/smart/dropdown/js/dropdown.js', 'smart/smart/list-item/js/list-item.js',
  'smart/smart/button-group/js/button-group.js',
  'smart/smart/context-menu/js/context-menu.js',
  'smart/smart/tree/js/tree.js', 'smart/smart/tree-item/js/tree-item.js',
  'smart/smart/spinner/js/spinner.js', 'smart/smart/drawer/js/drawer.js',
  'smart/smart/field-renderers/js/field-renderers.js',
  'smart/smart/sortable/js/sortable.js',
  'smart/smart/popover/js/popover.js',
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

// Two sections, each one group of two fields, so a field has somewhere else to
// go and the section list is drawn at all -- a list of one is not.
const record = () => ({
  record_id: 'record-1', collection: 'pages', revision: '3',
  sections: [
    {key: 'one', label: 'Первый', icon: 'apartment', groups: [{key: 'g1', label: 'Группа 1', columns: 2, fields: [
      {key: 'a', label: 'А', propertyType: 'string', value: 'a'},
      {key: 'b', label: 'Б', propertyType: 'string', value: 'b'},
    ]}]},
    {key: 'two', label: 'Второй', icon: 'mail', rare: true, groups: [{key: 'g2', label: 'Группа 2', fields: [
      {key: 'c', label: 'В', propertyType: 'string', value: 'c'},
    ]}]},
  ],
  // One field the view places nowhere, so taking a field out and putting one
  // back can both be driven.
  unplaced: [{key: 'z', label: 'Z', propertyType: 'string', value: 'z'}],
  view: {
    target: 'personal',
    editable: ['personal', 'shared'],
    layers: {personal: {revision: 'p1', view: {schema_version: 1, sections: {}, groups: {}, fields: {}}}},
  },
});

try {
  const page = await browser.newPage({viewport: {width: 1200, height: 900}});
  await page.setContent(
    '<!doctype html><html class="theme-light" lang="ru"><body style="margin:0">'
    + '<sf-property-view id="pv" panel panel-width="40rem" record-id="record-1" collection="pages"></sf-property-view>'
    + '</body></html>',
  );
  for (const path of styles) await page.addStyleTag({path}).catch(() => {});
  for (const path of modules) await page.addScriptTag({path, type: 'module'}).catch(() => {});
  await page.waitForTimeout(1400);

  const unupgraded = await page.evaluate(() => ['sf-property-view', 'sf-drawer', 'sf-tree',
    'sf-tree-item', 'sf-button', 'sf-icon-button', 'sf-button-group', 'sf-context-menu',
    'sf-switch', 'sf-input', 'sf-sortable'].filter((tag) => !customElements.get(tag)));
  if (unupgraded.length) {
    console.error(JSON.stringify({unupgraded}, null, 2));
    throw new Error(
      `${unupgraded.length} element(s) this probe drives are not defined on the page: `
      + `${unupgraded.join(', ')}. An unupgraded element has no behaviour, so every measurement `
      + `of it is false in the same direction.`,
    );
  }

  const measured = await page.evaluate(async (payload) => {
    const settle = (ms) => new Promise((done) => setTimeout(done, ms));
    const view = document.getElementById('pv');
    const writes = [];
    view.setHostPort({
      version: '1.8.0',
      capabilities: ['view-settings'],
      // A host that keeps what it was told. Answering a read with the record as
      // it first was would undo every arrangement on the next load, and the
      // probe would be measuring its own forgetfulness.
      async raise(intent, body) {
        if (intent === 'record.load') return {answer: 'applied', record: payload};
        if (intent === 'view.save') {
          writes.push(JSON.parse(JSON.stringify(body ?? {})));
          globalThis.__viewWrites = writes.length;
          payload.view.layers.personal = {
            revision: `p${writes.length + 1}`,
            view: JSON.parse(JSON.stringify(body?.view ?? {})),
          };
          return {answer: 'applied', revision: `p${writes.length + 1}`};
        }
        return {answer: 'applied'};
      },
    });
    for (let tries = 0; tries < 60 && !view.sections?.length; tries += 1) await settle(50);
    view.startConfiguringView();
    await settle(300);

    const content = view.panelContent();
    const band = content?.querySelector('.sf-property-view-configure-bar');
    const where = (key) => {
      for (const section of view.sections ?? []) {
        for (const group of section.groups ?? []) {
          if ((group.fields ?? []).some((field) => String(field.key) === key)) {
            return `${section.key}/${group.key}`;
          }
        }
      }
      return null;
    };

    // The settings live in a popover under the field, so what matters is what is
    // shown rather than what is in the document: closed, a field's own controls
    // take no space in the arrangement being read.
    const shown = (node) => Boolean(node?.getClientRects?.().length);
    const settingsSurface = () => content
      ?.querySelector('sf-popover[data-settings-for] > [slot="content"]');
    const permanentInputs = Array
      .from(content?.querySelectorAll('.sf-property-view-field sf-input') ?? [])
      .filter((input) => shown(input)).length;

    // The gear opens the surface; Esc closes it and leaves the panel standing.
    const gear = content?.querySelector('[data-action="field-settings"]');
    gear?.click();
    await settle(250);
    const surfaceOpen = shown(settingsSurface());
    document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
    await settle(250);
    const afterEscape = {
      surface: shown(settingsSurface()),
      panel: Boolean(view.panelContent()),
    };

    // The list of fields an area can take. A collection has hundreds, so this
    // measures what makes a long list readable: rows that do not touch, a
    // heading over each stretch instead of the area's name after every name,
    // and a name too long for the surface wrapping rather than widening it.
    const plus = content?.querySelector('[data-action="add-field"]');
    plus?.click();
    await settle(300);
    // The list is sf-dropdown's own, opened from the «+» as its trigger, and the
    // dropdown moves its surface into a portal -- so it is looked for in the
    // document rather than inside the panel.
    const addSurface = [...document.querySelectorAll('.sf-list')].find((list) => (
      !list.hasAttribute('hidden')
      && list.querySelector('[role="option"].sf-list-item--checkbox')
      && !list.querySelector('.sf-list-container--grid')
    ));
    const addRows = [...(addSurface?.querySelectorAll('[role="option"]') ?? [])];
    // A row stands taller than the line it holds. Written as bare checkboxes the
    // rows were exactly their text and touched each other, which is what a list
    // of a hundred names must not be.
    let tightest = Infinity;
    for (const row of addRows.slice(0, 6)) {
      const text = row.querySelector('.sf-list-item-container');
      if (!text) continue;
      tightest = Math.min(tightest,
        row.getBoundingClientRect().height - text.getBoundingClientRect().height);
    }
    const longest = addRows
      .map((row) => ({row, text: row.textContent.replace(/\s+/gu, ' ').trim()}))
      .sort((one, two) => two.text.length - one.text.length)[0];
    const add = {
      shown: Boolean(addSurface?.getClientRects().length),
      headings: [...(addSurface?.querySelectorAll('.sf-list-heading') ?? [])].map(
        (heading) => heading.textContent.trim()),
      rows: addRows.length,
      tightestRow: Number.isFinite(tightest) ? Math.round(tightest) : -1,
      suffixed: addRows.filter((row) => row.textContent.includes(' · ')).length,
      surfaceWidth: Math.round(addSurface?.getBoundingClientRect().width ?? 0),
      longestWidth: Math.round(longest?.row.getBoundingClientRect().width ?? 0),
      longestLines: longest
        ? Math.round(longest.row.getBoundingClientRect().height
          / parseFloat(getComputedStyle(longest.row).lineHeight || '1'))
        : 0,
    };
    content?.querySelector('sf-dropdown[data-add-for]')?.closeDropdown?.();
    await settle(200);

    return {
      add,
      band: {
        present: Boolean(band),
        // The layer is the chosen view's own (owner, 2026-10-14): a shared view
        // is written for everyone, a personal one for its person -- no toggle.
        layers: Boolean(band?.querySelector('[data-action="view-profile"]')) && !band?.querySelector('[data-action="layer"]'),
        reset: Boolean(band?.querySelector('[data-action="reset-view"]')),
        done: Boolean(band?.querySelector('[data-action="done-configuring"]')),
        tinted: band ? getComputedStyle(band).backgroundColor : null,
      },
      field: {
        grip: Boolean(content?.querySelector('.sf-property-view-field .sf-property-view-grip')),
        eye: Boolean(content?.querySelector('[data-action="remove-field"]')),
        gear: Boolean(content?.querySelector('[data-action="field-settings"]')),
        permanentInputs,
      },
      surfaceOpen,
      afterEscape,
      writes: writes.length,
    };
  }, record());

  // One row of controls: the layer being written and the two ways out. It also
  // carried a title and a sentence, and read as three kinds of thing at once.
  if (!measured.band.present || !measured.band.layers || !measured.band.reset || !measured.band.done
    || /rgba\(0, 0, 0, 0\)|^transparent$/u.test(String(measured.band.tinted))) {
    note({case: 'arranging the view is drawn as a mode: a painted band of controls and nothing else',
      got: measured.band,
      expected: 'a painted band carrying one segmented chooser, reset and done'});
  }
  if (!measured.field.grip || !measured.field.eye || !measured.field.gear
    || measured.field.permanentInputs !== 0) {
    note({case: 'a field being arranged carries a handle, a way out of the area and settings -- and no permanent inputs',
      got: measured.field,
      expected: 'grip, remove and gear present; hint and width behind the gear, shown under no field'});
  }
  // Hundreds of fields are read by their stretches, not line by line.
  if (!measured.add.shown || measured.add.rows < 3 || measured.add.headings.length < 2
    || measured.add.tightestRow < 4 || measured.add.suffixed > 0) {
    note({case: 'the list of fields an area can take is grouped, and its rows do not touch',
      got: measured.add,
      expected: 'a heading over each stretch, no area name repeated in a row, and a row taller than its text'});
  }
  // A name longer than the surface wraps. Widening instead, the surface grew to
  // the longest name in the collection and stood over the arrangement.
  if (measured.add.longestWidth > measured.add.surfaceWidth) {
    note({case: 'a long field name wraps instead of widening the list',
      got: {surface: measured.add.surfaceWidth, row: measured.add.longestWidth},
      expected: 'the row stays inside the surface'});
  }
  if (!measured.surfaceOpen) {
    note({case: 'the gear opens the field settings', got: measured.surfaceOpen, expected: true});
  }
  // Moving a field to another section, driven through the pointer, because that
  // is the gesture the mockup asks for and the seam alone would not prove the
  // handle can be taken hold of or that the list resolves under a pointer.
  const place = (key) => page.evaluate((wanted) => {
    const view = document.getElementById('pv');
    for (const part of view.sections ?? []) {
      for (const group of part.groups ?? []) {
        if ((group.fields ?? []).some((field) => String(field.key) === wanted)) {
          return `${part.key}/${group.key}`;
        }
      }
    }
    return null;
  }, key);
  const points = await page.evaluate(() => {
    const view = document.getElementById('pv');
    const content = view.panelContent();
    const grip = content?.querySelector('.sf-property-view-field .sf-property-view-grip');
    // While the view is arranged the tabs are rows of the component's own, so a
    // section is found by the key it carries rather than by the tree row it had.
    const target = content?.querySelector('.sf-property-view-sections [data-section-tab="two"]');
    const shown = target;
    const centre = (element) => {
      const box = element.getBoundingClientRect();
      return [Math.round(box.left + box.width / 2), Math.round(box.top + box.height / 2)];
    };
    return grip && shown ? {from: centre(grip), to: centre(shown), bound: Boolean(view._releaseSectionTarget)} : null;
  });
  const section = {before: null, after: null, bound: points?.bound ?? false};
  if (points) {
    section.before = await place('a');
    await page.mouse.move(points.from[0], points.from[1]);
    await page.mouse.down();
    for (let step = 1; step <= 10; step += 1) {
      await page.mouse.move(
        Math.round(points.from[0] + ((points.to[0] - points.from[0]) * step) / 10),
        Math.round(points.from[1] + ((points.to[1] - points.from[1]) * step) / 10),
      );
      await page.waitForTimeout(30);
    }
    await page.mouse.up();
    await page.waitForTimeout(700);
    section.after = await place('a');
  }
  section.released = await page.evaluate(async () => {
    const view = document.getElementById('pv');
    view.stopConfiguringView();
    await new Promise((done) => setTimeout(done, 200));
    return !view._releaseSectionTarget;
  });
  if (!points || !section.bound || !section.released) {
    note({case: 'the section list takes drops only while the view is being arranged',
      got: {points: Boolean(points), ...section},
      expected: 'a drop target registered on entering the mode and released on leaving it'});
  }
  if (section.before !== 'one/g1' || section.after !== 'two/g2') {
    note({case: "a field dragged onto a section lands in that section's first group that takes fields",
      got: section,
      expected: 'one/g1 -> two/g2'});
  }

  // The column beside the fields holds the tabs and nothing else: the band of
  // the arranging mode stands over the fields instead (owner, 2026-10-07), and
  // the tabs can be put in another order by a drag.
  const rail = await page.evaluate(async () => {
    const settle = (ms) => new Promise((done) => setTimeout(done, ms));
    const view = document.getElementById('pv');
    view.startConfiguringView();
    await settle(300);
    const content = view.panelContent();
    const nav = content?.querySelector('.sf-property-view-sections');
    const before = [...(nav?.querySelectorAll('[data-section-tab]') ?? [])]
      .map((tab) => tab.getAttribute('data-section-tab'));
    const list = nav?.querySelector('sf-sortable[id="section:all"]');
    list?.dispatchEvent(new CustomEvent('sf-sortable-intent', {
      bubbles: true,
      composed: true,
      detail: {item: before[0], from: 'section:all', to: 'section:all', index: before.length - 1},
    }));
    await settle(500);
    return {
      before,
      after: [...(content?.querySelectorAll('.sf-property-view-sections [data-section-tab]') ?? [])]
        .map((tab) => tab.getAttribute('data-section-tab')),
      band: Boolean(nav?.querySelector('.sf-property-view-configure-bar')),
      // The mode's own controls live in the bar at the foot, where saving and
      // deleting live: a band of them under the head pushed the record down by
      // a row it did not need.
      bandInFoot: Boolean(content?.querySelector(
        '.sf-property-view-actions.sf-property-view-configure-bar')),
      bandInScroller: Boolean(content?.querySelector(
        '.sf-property-view-scroll .sf-property-view-configure-bar')),
      handles: [...(content?.querySelectorAll('.sf-property-view-sections [data-section-tab]') ?? [])]
        .every((tab) => Boolean(tab.querySelector('[data-sf-sortable-handle]'))),
      // The panel is laid out the way a page is: a head, a foot, and two
      // columns that scroll on their own. One scroller for both would take the
      // tabs off the screen while a long record was read to its end.
      scrollers: {
        between: content?.querySelector('.sf-property-view-scroll')
          ? getComputedStyle(content.querySelector('.sf-property-view-scroll')).overflowY
          : null,
        rail: nav ? getComputedStyle(nav).overflowY : null,
        frame: content?.querySelector('.sf-property-view-frame')
          ? getComputedStyle(content.querySelector('.sf-property-view-frame')).overflowY
          : null,
      },
      // The service glyphs of a card -- the handle, the cross, the gear, the bin
      // -- are read at the weight of a label, not of a value. On the value's
      // weight a row of controls was the loudest thing in a card of text, and
      // the controls read as the content (owner, 2026-10-08). Measured as a
      // colour rather than as a class, because a colour utility loses to the
      // icon component's own rule and says one thing while drawing another.
      weights: (() => {
        const colour = (el) => el ? getComputedStyle(el).color : null;
        const at = (selector) => colour(content?.querySelector(selector));
        return {
          value: at('.sf-property-view-field-value'),
          label: at('.sf-property-view-field-label'),
          grip: at('.sf-property-view-grip'),
          remove: at('[data-action="remove-field"] .sf-icon'),
          gear: at('[data-action="field-settings"] .sf-icon'),
          bin: at('[data-action="remove-group"] .sf-icon'),
        };
      })(),
      // A gesture that reaches the end of a column stays in the column. Left to
      // chain, the rest of it goes to the drawer, and the drawer moves the head
      // and the foot with it -- the panel flying off after one more scroll at
      // the bottom (owner, 2026-10-08).
      contained: [...(content?.querySelectorAll(
        '.sf-property-view-scroll, .sf-property-view-sections, .sf-property-view-frame') ?? [])]
        .filter((el) => getComputedStyle(el).overflowY !== 'hidden')
        .map((el) => getComputedStyle(el).overscrollBehaviorY),
      // Where the step above the first tab and the first card lives. On the box
      // that holds both columns it is a fixed gap: it never scrolls, it holds
      // the content off the head for ever, and it costs a row of the panel. It
      // belongs inside each column, where it moves with what it spaces -- so the
      // columns start against the head and their contents start a step down.
      steps: (() => {
        const top = (el) => el ? el.getBoundingClientRect().top : null;
        const head = content?.querySelector('.sf-property-view-head');
        const frame = content?.querySelector('.sf-property-view-frame');
        const round = (value) => value === null ? null : Math.round(value);
        // Read from the column's own padding rather than from where its first
        // row happens to sit: the mode scrolls both columns while it moves tabs
        // about, and a measurement taken from a scrolled row reads the scroll,
        // not the step.
        const inset = (el) => el
          ? {start: round(parseFloat(getComputedStyle(el).paddingBlockStart)),
            end: round(parseFloat(getComputedStyle(el).paddingBlockEnd))}
          : null;
        return {
          railFromHead: round(top(nav) - top(head) - (head?.getBoundingClientRect().height ?? 0)),
          frameFromHead: round(top(frame) - top(head) - (head?.getBoundingClientRect().height ?? 0)),
          railInset: inset(nav),
          frameInset: inset(frame),
          betweenInset: inset(content?.querySelector('.sf-property-view-scroll')),
          // The arranging bar standing on the host's floor, and the panel
          // reaching it by growing rather than by a percentage: a percentage
          // resolves against a host sized by its own content as no height at
          // all, and the bar then stops wherever the record stops.
          footFromFloor: (() => {
            const panel = content?.closest('.sf-property-view-panel')
              ?? content?.querySelector('.sf-property-view-panel');
            const bar = panel?.querySelector('.sf-property-view-configure-bar');
            if (!panel?.parentElement || !bar) return null;
            return round(panel.parentElement.getBoundingClientRect().bottom
              - bar.getBoundingClientRect().bottom);
          })(),
          // Nothing of the panel reaches past the panel. The drawer's own panel
          // is a scroller, so a band hanging over the edge is content it can
          // scroll -- and when it does it carries the head and the foot with
          // it, which is what the owner saw after adding sections.
          panelOverflow: (() => {
            const panel = content?.closest('.sf-property-view-panel')
              ?? content?.querySelector('.sf-property-view-panel');
            return panel ? round(panel.scrollHeight - panel.clientHeight) : null;
          })(),
          panelGrows: (() => {
            const panel = content?.closest('.sf-property-view-panel')
              ?? content?.querySelector('.sf-property-view-panel');
            return panel ? getComputedStyle(panel).flexGrow !== '0' : null;
          })(),
          // Nothing of a card or of «Добавить область» is cut by a box that
          // clips it, and the record keeps a step from the panel's end: in
          // the arranging mode the card «Фон» lost its right border and the
          // button ran to the edge (Larena, 2026-10-18, 1280 and 1600 wide).
          clipped: (() => {
            const scope = content?.closest('.sf-property-view-panel') ?? content;
            const parts = [...(scope?.querySelectorAll('.sf-property-view-group, .sf-property-view-add') ?? [])];
            const cut = [];
            for (const part of parts) {
              const box = part.getBoundingClientRect();
              if (!box.width) continue;
              for (let up = part.parentElement; up && up !== document.body; up = up.parentElement) {
                const style = getComputedStyle(up);
                if (style.overflowX === 'visible') continue;
                const edge = up.getBoundingClientRect().left + up.clientLeft + up.clientWidth;
                if (box.right > edge + 0.5) { cut.push({part: part.className.split(' ')[0], right: round(box.right), edge: round(edge), by: up.className.split(' ')[0]}); break; }
              }
            }
            return cut;
          })(),
          endGap: (() => {
            const panel = content?.closest('.sf-property-view-panel') ?? content?.querySelector('.sf-property-view-panel');
            const parts = [...(panel?.querySelectorAll('.sf-property-view-group') ?? [])].filter((part) => part.getBoundingClientRect().width);
            if (!panel || !parts.length) return null;
            return round(panel.getBoundingClientRect().right - Math.max(...parts.map((part) => part.getBoundingClientRect().right)));
          })(),
        };
      })(),
    };
  });
  if (rail.band || !rail.bandInFoot || rail.bandInScroller) {
    note({case: 'the column of tabs holds tabs, and the mode\'s controls hold the foot',
      got: rail,
      expected: 'the arranging controls in the bar at the foot, outside the scroller and outside the tabs'});
  }
  if (rail.scrollers.between !== 'hidden' || rail.scrollers.rail !== 'auto'
    || rail.scrollers.frame !== 'auto') {
    note({case: 'the tabs and the record scroll independently of each other',
      got: rail.scrollers,
      expected: 'the area between the bands scrolling nothing itself, each column its own scroller'});
  }
  const weights = rail.weights ?? {};
  const paler = ['grip', 'remove', 'gear', 'bin']
    .filter((key) => weights[key] && weights[key] !== weights.label);
  if (!weights.label || !weights.value || weights.label === weights.value || paler.length) {
    note({case: "a card's service glyphs are read at the weight of a label",
      got: weights,
      expected: "the handle, cross, gear and bin on the label's colour, with the value darker than all of them"});
  }
  const contained = rail.contained ?? [];
  if (!contained.length || contained.some((value) => value !== 'contain')) {
    note({case: 'a scroll that reaches the end of a column stays in the column',
      got: {contained},
      expected: 'every scrolling column containing its own overscroll'});
  }
  const steps = rail.steps ?? {};
  if (steps.railFromHead !== 0 || steps.frameFromHead !== 0
    || !(steps.railInset?.start > 0) || !(steps.railInset?.end > 0)
    || !(steps.frameInset?.start > 0) || !(steps.frameInset?.end > 0)
    || steps.betweenInset?.start !== 0 || steps.betweenInset?.end !== 0
    || steps.footFromFloor !== 0 || steps.panelGrows !== true
    || steps.panelOverflow !== 0 || steps.clipped?.length || !(steps.endGap >= 8)) {
    note({case: 'the step above the first tab and the first card is inside its column',
      got: steps,
      expected: 'each column against the head, its first row a step below the column\'s own top'});
  }
  if (!rail.handles || rail.before.length < 2
    || rail.after.join() === rail.before.join()
    || rail.after[rail.after.length - 1] !== rail.before[0]) {
    note({case: 'the tabs can be put in another order', got: rail,
      expected: 'each tab carrying a handle, and the first one ending up last'});
  }

  // Taking a field out of every group and putting one back. The area is drawn
  // even when it is empty, because a field dragged out has to have somewhere to
  // land -- and because an area that appears only once something is in it tells
  // a person nothing about what they can do.
  const unplaced = await page.evaluate(async () => {
    const settle = (ms) => new Promise((done) => setTimeout(done, ms));
    const view = document.getElementById('pv');
    view.startConfiguringView();
    await settle(300);
    const content = view.panelContent();
    const place = (key) => {
      for (const part of view.sections ?? []) {
        for (const group of part.groups ?? []) {
          if ((group.fields ?? []).some((field) => String(field.key) === key)) return `${part.key}/${group.key}`;
        }
      }
      return (view.unplaced ?? []).some((field) => String(field.key) === key) ? 'unplaced' : null;
    };
    const area = content?.querySelector('.sf-property-view-group--unplaced');
    const listed = [...(area?.querySelectorAll('[data-field]') ?? [])].map((node) => node.getAttribute('data-field'));
    const carriesValue = Boolean(area?.querySelector('.sf-property-view-field-value'));
    const start = place('z');
    view.moveField('z', 'g1', 0);
    await settle(400);
    const placed = place('z');
    view.moveFieldToUnplaced('b');
    await settle(400);
    return {area: Boolean(area), listed, carriesValue, start, placed, takenOut: place('b')};
  });
  if (!unplaced.area || unplaced.listed.join(',') !== 'z' || unplaced.carriesValue) {
    note({case: 'the fields a view places nowhere are listed while it is arranged, by name only',
      got: unplaced,
      expected: 'the area drawn, holding z, with no values in it -- an unplaced field is being arranged, not read'});
  }
  if (unplaced.start !== 'unplaced' || unplaced.placed !== 'one/g1' || unplaced.takenOut !== 'unplaced') {
    note({case: 'a field moves out of every group and back into one',
      got: unplaced,
      expected: 'unplaced -> one/g1, and a placed field taken out joins the unplaced'});
  }

  if (measured.afterEscape.surface || !measured.afterEscape.panel) {
    note({case: 'Escape closes the settings surface and leaves the panel open',
      got: measured.afterEscape,
      expected: 'surface closed, panel still open -- one press must not lose the arrangement'});
  }
  // Naming, making and taking out, measured last because each of them changes
  // the arrangement the cases above read.
  const changed = await page.evaluate(async () => {
    const settle = (ms) => new Promise((done) => setTimeout(done, ms));
    const view = document.getElementById('pv');
    const content = view.panelContent();
    const title = () => content?.querySelector('.sf-property-view-group-title')?.textContent.trim();
    const groupCount = () => content?.querySelectorAll('.sf-property-view-group[data-group]').length ?? 0;
    const namedBefore = title();
    // Scoped to the area: the section being arranged carries a pencil of its own
    // above them, and it stands first in the panel.
    const area = () => content?.querySelector('.sf-property-view-group');
    area()?.querySelector('[data-action="rename"]')?.click();
    await settle(250);
    const field = area()?.querySelector('[data-action="rename-input"] input');
    if (field) field.value = 'Названо иначе';
    area()?.querySelector('[data-action="rename-save"]')?.click();
    // The name goes to the layer and comes back through the host's answer, so
    // what is drawn is a round trip away rather than a render away.
    await settle(600);

    const groupsBefore = groupCount();
    content?.querySelector('[data-action="add-group"]')?.click();
    await settle(350);
    const made = {
      groups: groupCount() - groupsBefore,
      // A new area opens its own name for typing: among four real ones an area
      // called "New area" is a box nobody can tell from the others.
      naming: Boolean(content?.querySelector('.sf-property-view-group [data-action="rename-input"]')),
    };
    content?.querySelector('.sf-property-view-group [data-action="rename-cancel"]')?.click();
    await settle(250);

    // A field taken out of an area joins the unplaced rather than disappearing.
    const takenKey = content?.querySelector('[data-field]')?.getAttribute('data-field') ?? null;
    content?.querySelector('[data-action="remove-field"]')?.click();
    await settle(300);
    const taken = {
      key: takenKey,
      inUnplaced: (view.unplaced ?? []).some((entry) => String(entry.key) === String(takenKey)),
      gone: !content?.querySelector(`[data-group] [data-field="${takenKey}"]`),
    };

    return {
      renamed: {before: namedBefore, after: title()},
      made,
      taken,
    };
  });

  if (changed.renamed.after !== 'Названо иначе' || changed.renamed.before === changed.renamed.after) {
    note({case: 'an area can be renamed where it stands', got: changed.renamed,
      expected: 'the name typed into the field is the name the area carries'});
  }
  if (changed.made.groups !== 1 || !changed.made.naming) {
    note({case: 'a new area is made at the end of the arrangement, and names itself at once',
      got: changed.made, expected: 'one area more, with its name open for typing'});
  }
  if (!changed.taken.key || !changed.taken.inUnplaced || !changed.taken.gone) {
    note({case: 'a field taken out of an area joins the unplaced', got: changed.taken,
      expected: 'gone from the area and waiting among the unplaced, where the area offers it back'});
  }

  const saved = await page.evaluate(() => globalThis.__viewWrites ?? 0);
  if (!saved) {
    note({case: 'an arrangement a person made is written to the layer',
      got: saved, expected: 'at least one view.save'});
  }

  // A full-screen panel has no outside, so the strip that stands beyond the
  // panel's inline start has to come inside it.
  const phone = await page.evaluate(async () => {
    const settle = (ms) => new Promise((done) => setTimeout(done, ms));
    await settle(400);
    const view = document.getElementById('pv');
    const content = view.panelContent();
    // On a wide panel the strip stands beside the panel, in the drawer's edge
    // area; on a narrow one it comes inside, because a full-screen panel has no
    // outside. Either way it is within the drawer this panel belongs to.
    const shell = content?.closest('[data-sf-drawer-root]') ?? content;
    const buttons = [...(shell?.querySelectorAll('.sf-property-view-edge button') ?? [])];
    return {
      count: buttons.length,
      offscreen: buttons.filter((button) => button.getBoundingClientRect().left < 0).length,
      closes: (shell?.querySelectorAll('[data-action="close"]') ?? []).length,
    };
  });
  await page.setViewportSize({width: 390, height: 844});
  await page.waitForTimeout(600);
  const narrow = await page.evaluate(() => {
    const view = document.getElementById('pv');
    const content = view.panelContent();
    // On a wide panel the strip stands beside the panel, in the drawer's edge
    // area; on a narrow one it comes inside, because a full-screen panel has no
    // outside. Either way it is within the drawer this panel belongs to.
    const shell = content?.closest('[data-sf-drawer-root]') ?? content;
    const buttons = [...(shell?.querySelectorAll('.sf-property-view-edge button') ?? [])];
    return {
      count: buttons.length,
      offscreen: buttons.filter((button) => button.getBoundingClientRect().left < 0).length,
      closes: (shell?.querySelectorAll('[data-action="close"]') ?? []).length,
    };
  });
  // Close lives in the head, where a person looks for it; the edge carries the
  // two controls that are about the address, and this record has none. What has
  // to hold at both widths is that the panel can be closed and that nothing it
  // draws stands at a negative inline start.
  if (narrow.offscreen || phone.offscreen) {
    note({case: "a full-screen panel's own controls are on the screen",
      got: {wide: phone, narrow},
      expected: 'nothing at a negative x -- a record opened on a phone has to be closable'});
  }
  if (narrow.closes !== 1 || phone.closes !== 1) {
    note({case: 'a panel draws exactly one close', got: {wide: phone, narrow},
      expected: '1 at both widths'});
  }

  console.error(JSON.stringify({...measured, section, saved, phone, narrow}, null, 1));
  await page.close();
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log('PROPERTY_VIEW_ARRANGING_OK');
