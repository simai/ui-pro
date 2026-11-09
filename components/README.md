# SIMAI Pro components — the component package `pro`

This folder is the source of the SIMAI Pro Smart components, the component
package `pro` (owner decision q-4ac7d07595, 2026-11-02; it was published as
`larena` from 2026-10-11, and that name is a dated alias until 2027-01-01 --
see «The package's name» below). Larena is one of its consumers. It lives in `simai/ui-pro`
(moved from `simai/larena-ui` to `simai/ui-admin` on 2026-10-22, and from
there to `simai/ui-pro` on 2026-10-23). Advanced components shared by several
products live here rather than in the free Framework (owner's decisions
2026-10-11 and 2026-10-22; standard `simai.component-package` 1.0.0).
`simai/ui-admin` is the reference admin application built on them.

Licence: free for small businesses (PolyForm Small Business 1.0.0) and for
non-commercial use (PolyForm Noncommercial 1.0.0); everyone else needs the
SIMAI Commercial License, available on request. Use as part of Larena is
covered by Larena's licence. See [`../LICENSE.md`](../LICENSE.md). Versions
published earlier from `simai/larena-ui` remain Apache-2.0.

| Folder | Element | Manifest id |
|:---|:---|:---|
| `src/smart/view-table` | `sf-view-table` | `smart.view-table` |
| `src/smart/view` | `sf-view` | `smart.view` |
| `src/smart/view-properties` | `sf-view-properties` | `smart.view-properties` |
| `src/smart/admin-menu` | `sf-admin-menu` | `smart.admin-menu` |
| `src/smart/message-log` | `sf-message-log` | `smart.message-log` |
| `src/smart/chat-threads` | `sf-chat-threads` | `smart.chat-threads` |
| `src/smart/chat-interlocutor` | `sf-chat-interlocutor` | `smart.chat-interlocutor` |
| `src/smart/chat-composer` | `sf-chat-composer` | `smart.chat-composer` |
| `src/smart/chat-message` | `sf-chat-message` | `smart.chat-message` |
| `src/smart/chat-window` | `sf-chat-window` | `smart.chat-window` |
| `src/smart/mail-library` | `sf-mail-library` | `smart.mail-library` |
| `src/smart/mail-letters` | `sf-mail-letters` | `smart.mail-letters` |
| `src/smart/mail-structure` | `sf-mail-structure` | `smart.mail-structure` |
| `src/smart/mail-inspector` | `sf-mail-inspector` | `smart.mail-inspector` |
| `src/smart/mail-canvas` | `sf-mail-canvas` | `smart.mail-canvas` |
| `src/smart/editor` | `sf-editor` | `smart.editor` |
| `src/smart/editor-content` | `sf-editor-content` | `smart.editor-content` |

Five of them took new tags on 2026-11-03 (rename plan R2): `sf-table`,
`sf-data-view`, `sf-property-view`, `sf-content-editor` and `sf-thread-list`
are dated aliases of the tags above until 2027-01-01. Old
markup upgrades, the former bundle names are forwarded by the Loader and every
event fires under its former name as well; the public CSS variables and class
names keep the former name. Each component's docs say so under «Former tag».
This needs the SIMAI Framework pair whose package reference lists the former
tags (core.runtime 1.22.0).

`sf-confirm-change` (former `sf-change-confirm`) moved to SIMAI Framework on
2026-11-03 (duplication audit A-5) with the same tag, API and a continuing
version (1.4.0); it needs the Framework pair with core.runtime 1.25.0.

The three conversation components came from `simai/ui-chat` (`sf-chat-message-list`,
`sf-chat-thread-list` and the proposal card) under neutral names (owner's decision
2026-10-25): they serve a conversation with an assistant and one between people
(simai.chat) alike, so what a message is, who wrote it and what a change means are
the host's. `sf-mail-structure` is the same editor's list of a letter's blocks, `sf-mail-inspector` its right panel, a form drawn from data, and `sf-mail-canvas` its middle pane, the rendered letter in a sandboxed frame. `sf-editor-content` is the Content mode of the SIMAI page editor: a page typed as one flow over a Composition Document of the structured-content profile (owner's decision 2026-11-01). `sf-editor` is the one block editor of the SIMAI page (owner's decision 2026-11-03): layout and text in one Document of the ui-layout profile, edited by depth, with one catalogue, a parameter panel that shows where each value comes from, data from the host's source port, the block builder and the site template as an explicit edit. Their documentation is in each folder's `docs.md`.

`sf-chat-interlocutor` moved from `simai/ui-chat` under its own name (D31, owner's
approval 2026-10-27): who a chat conversation is with, a thin element over the
Framework's `sf-menu-context`. `sf-chat-composer` followed it (the question field
and its files; the pieces of the chat's shared core it drew on are its own modules
now), then `sf-chat-message` (one message: an assistant's answer with its sources,
rating, proposal and task brief, a person's question, and the template `person`
for a conversation between people; a window places it in `sf-message-log`
through the log's `renderMessage`, so the log stays chat-agnostic), and last the
window, `sf-chat-window`: the whole chat on the host port `simai.chat-port` 1.0
(handed with `connect-port`), built from `sf-chat-threads`, `sf-message-log` and
the three chat components by tag, with «Мои файлы» and the window's own
capabilities (archive, paging, search, pinning, early upload, task brief) beside
the port.

`sf-mail-library` and `sf-mail-letters` moved from `simai/ui-mail` under their own
names (D31, owner's decision 2026-10-29: a product repository makes no component
set of its own). The first is the block library of SIMAI Email Editor (groups,
category chips, a search, and the header and footer variants with the current one
marked); the second its letters page (a search, an order, open, copy, rename,
delete and a new letter, the moment and the block count worded in the page's
language). Neither touches a letter: each says what the person chose and the host
does it. Their documentation is in each folder's `docs.md`.

Documentation (Russian): [sf-view-table and sf-view](https://ui.simai.io/ru/smart-components/content/table/),
[sf-view-properties](https://ui.simai.io/ru/smart-components/composite/property-view/),
[sf-admin-menu](https://ui.simai.io/ru/smart-components/composite/admin-menu/); the whole
Framework at https://ui.simai.io/.

The elements keep the Framework's `sf-` prefix: they came from the Framework
and pages already use them, which the standard allows with that reason stated.

Everything they are built on is the free SIMAI Framework (Apache-2.0), in `simai/ui-source`:
Core and the Loader, `smart-base`, `page-language`, `position`, the Smart
helpers, the typed renderer set `smart/field-renderers`, `component/admin-menu`,
the badges and clipboard components. So are the public contracts they answer
to: the host ports and their conformance kits (`src/core/contracts/ports/` in
ui-source, shipped in `ui` as `distr/core/contracts/ports/`) — the data view,
property view and admin navigation ports — the `sf-view-table` composition port and
the `layout.scope` routing contract.

The history of these files before the move is in `simai/ui-source-pro`
(archived), and before that in `simai/ui-source`.

The owner's decisions about the admin screens, and what each asks of a Larena
host, are kept in `simai/ui-admin`, `docs/developer/admin-decisions.md`.

## Built against a pinned ui-source

The components import the free Framework by relative path
(`../../core/js/smart-base`, `../helpers/dom`, `../field-renderers/index.js`).
They are built and tested in an **overlay**: ui-source at the revision
`framework.lock.json` pins, with this folder's `src/`, `tests/` and `docs/`
laid over it. Every relative import resolves unchanged, and the tests read the
same paths ui-source's tests do. A file here may not replace a ui-source file.

```bash
node scripts/test.mjs                 # the package's own suite in the overlay
node scripts/run-browser-probes.mjs <free build output> <package build output>
node scripts/run-manifest-probes.mjs <free build output> <package build output> [folder ...]
node scripts/run-first-paint.mjs snapshot|check|gate <free build output> <package build output> [folder ...]
```

The first paint (standard 1.3.8 §5.4, gate 24) is a build snapshot, as in
ui-source: `src/smart/<folder>/static/` holds each example's static markup,
the skeleton of an example with late data, and `static/sheets.json`.
`run-first-paint.mjs snapshot` writes them from the built bytes with
ui-source's `scripts/snapshot-first-paint.mjs`, `check` fails on a stale one,
and `gate` runs ui-source's gate 24 probe over them (1280 and 390 px). Run
`snapshot` after a change to a component's markup and commit what it wrote.

A component on standard `simai.smart-component` 1.3.8 holds its contract in
`component.json` (with `lang/`, `aliases.json`, `examples.json` and
`probe.json`); `run-manifest-probes.mjs` runs every `probe.json` through
ui-source's one manifest probe runner, on a page that declares the package. The
free output may be a product output root or the `distr` of the ui distribution.

`scripts/overlay.mjs` looks for ui-source beside the ui-pro checkout, or at
`UI_SOURCE_ROOT`, or wherever `--ui-source` says.

The probes drive Chromium through `playwright`, a pinned devDependency of
this folder at the version the pinned ui-source declares. Install it before the
first probe (about a second from the yarn cache; no browser is downloaded):

```bash
yarn install --frozen-lockfile --prefer-offline --ignore-scripts
```

Each probe runner links the overlay's `node_modules` to this folder's
(`scripts/playwright-local.mjs`), so a probe never reaches a copy above the
repository such as `~/node_modules`; an overlay that already holds a
`node_modules` is taken only at the declared version. A git worktree whose
`components/` has no `node_modules` borrows the main checkout's when that holds
the declared version. Browsers live in `PLAYWRIGHT_BROWSERS_PATH` (the release
route uses `<GitHub>/.playwright-browsers`).

## Building the package

ui-builder builds it over the pinned ui-source, from committed bytes, twice
(`docs/developer/product-packages.md` in ui-builder):

```bash
node <ui-builder>/scripts/verify-package-reproducibility.cjs \
  --package-source <ui-pro checkout> --package-path components \
  <ui-source checkout> <new workspace outside the checkout> --package pro --package-revision <ui-pro commit>
python3 <ui-builder>/scripts/write-package-receipt.py --report <workspace>/report.json --ui <ui checkout>
```

The output is `smart/<folder>/…` and `smart/rule.js`, one
`SF.RuleLoader.registerPackage("pro", {rules})` call, and a receipt that
names the ui-source revision and the free release `ui-<12>` it was built over.
Each package is published as a release `pro-<12>` of `simai/ui-pro` (the tar,
its sha256, the receipt and the unit inventory); the index of which package
goes with which Framework release is
`https://github.com/simai/ui-pro/releases/download/package-index/releases.json`.
A consumer serves it from its own distribution; a page declares it before the
Framework core starts:

```js
window.SF_BOOT_CONFIG = {packages: {pro: {base: '/assets/ui-pro/smart'}}};
```

### The package's name

The package is `pro`. Until 2027-01-01 its former name `larena` still works,
so no consumer has to move on the day of the rename:

- a SIMAI Framework pair from 2026-11-02 on (core.runtime 1.17.0) takes
  `SF_BOOT_CONFIG.packages.larena` as `packages.pro`, and a build under the
  old name (`--package larena`, `registerPackage("larena")`) as a build of
  `pro`, and notes either in `SF.deprecations`; an older pair knows only the
  name the page declares, so over it the page and the build must say the same;
- `framework.lock.json` names no package until then, so ui-builder builds this
  folder under either name; it says `"package": "pro"` again when the alias
  leaves;
- every package is published twice: `pro-<12>` on `simai/ui-pro` and the same
  bytes as `larena-<12>` on `simai/larena-ui` (`package-larena.tar`), and the
  index lists both;
- this repository's probe scripts declare the name the build registers.

Move a consumer by writing `pro` in its declaration and in its build's
`--package`, and by reading `pro-<12>` releases of `simai/ui-pro`.

## Moving to a newer Framework

Change `framework.lock.json` to the ui-source revision of a newer free release,
run the suite and the probes against it, and build. A package is built and
tested against exactly one Framework revision.
