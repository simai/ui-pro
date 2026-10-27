# SIMAI Pro components — the component package `larena`

This folder is the source of the SIMAI Pro Smart components, the component
package `larena` (the id Larena loads them by). It lives in `simai/ui-pro`
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
| `src/smart/table` | `sf-table` | `smart.data-view` |
| `src/smart/data-view` | `sf-data-view` | `smart.data-view-composite` |
| `src/smart/property-view` | `sf-property-view` | `smart.property-view` |
| `src/smart/admin-menu` | `sf-admin-menu` | `smart.admin-menu` |
| `src/smart/message-log` | `sf-message-log` | `smart.message-log` |
| `src/smart/thread-list` | `sf-thread-list` | `smart.thread-list` |
| `src/smart/change-confirm` | `sf-change-confirm` | `smart.change-confirm` |
| `src/smart/chat-interlocutor` | `sf-chat-interlocutor` | `smart.chat-interlocutor` |

The three conversation components came from `simai/ui-chat` (`sf-chat-message-list`,
`sf-chat-thread-list` and the proposal card) under neutral names (owner's decision
2026-10-25): they serve a conversation with an assistant and one between people
(simai.chat) alike, so what a message is, who wrote it and what a change means are
the host's. Their documentation is in each folder's `docs.md`.

`sf-chat-interlocutor` moved from `simai/ui-chat` under its own name (D31, owner's
approval 2026-10-27): who a chat conversation is with, a thin element over the
Framework's `sf-context-menu`. The rest of the chat (`sf-chat-composer`,
`sf-chat-message`, `sf-chat-window`) follows it.

Documentation (Russian): [sf-table and sf-data-view](https://ui.simai.io/ru/smart-components/content/table/),
[sf-property-view](https://ui.simai.io/ru/smart-components/composite/property-view/),
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
property view and admin navigation ports — the `sf-table` composition port and
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

## Building the package

ui-builder builds it over the pinned ui-source, from committed bytes, twice
(`docs/developer/product-packages.md` in ui-builder):

```bash
node <ui-builder>/scripts/verify-package-reproducibility.cjs \
  --package-source <ui-pro checkout> --package-path components \
  <ui-source checkout> <new workspace outside the checkout> --package larena --package-revision <ui-pro commit>
python3 <ui-builder>/scripts/write-package-receipt.py --report <workspace>/report.json --ui <ui checkout>
```

The output is `smart/<folder>/…` and `smart/rule.js`, one
`SF.RuleLoader.registerPackage("larena", {rules})` call, and a receipt that
names the ui-source revision and the free release `ui-<12>` it was built over.
Larena delivers it inside its own distribution; a page declares it before the
Framework core starts:

```js
window.SF_BOOT_CONFIG = {packages: {larena: {base: '/assets/larena/smart'}}};
```

## Moving to a newer Framework

Change `framework.lock.json` to the ui-source revision of a newer free release,
run the suite and the probes against it, and build. A package is built and
tested against exactly one Framework revision.
