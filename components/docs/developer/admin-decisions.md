# Admin decisions for Larena

The owner's decisions about the admin screens, as they were made on the ui-admin
polygon (`ui-admin.test`), and what each one asks of a Larena host. The polygon
is the reference host: when a line here says "the polygon does", its source is
in `simai/ui-admin` under `src/` and `src/ports/`.

Newest first. Framework pair and package revision in brackets where a decision
shipped in one.

## 2026-10-12 — speed (ui-e26fc47c16d6, larena-87b345c3cf0c)

**Pages include the minified core:** `core.min.js` and `core.min.css`. The
Framework's Loader fetches minified bundles by itself; a page being debugged
asks for the readable ones with `?sf-debug` or `data-sf-debug` on `<html>`.

**Versioned paths are cached for good.** Every Framework pair and package build
has a directory of its own (`/distr/ui-<id>/`, `/distr-larena/larena-<id>/`),
so their files never change. Serve them with
`Cache-Control: public, max-age=31536000, immutable`; HTML pages keep no long
cache. Without it a warm load revalidates about a hundred files. The polygon
does this in its Caddy site block:

```
@versioned path /distr/ui-* /distr-larena/* /assets/*
header @versioned Cache-Control "public, max-age=31536000, immutable"
```

**A list's first load shows skeleton rows** -- the Framework's `sf-skeleton` --
until the host answers; a re-query over rows on screen dims them as before.

## 2026-10-12 — the quick-fix round (ui-e25d2bda02e6, larena-312e698ce941)

**No count beside the page heading.** The table's footer already reports the
total; the badge on `sf-page-header` repeated it. Do not set `count` on the
page header of a list page.

**Text density: compact.** Admin pages put `data-sf-density="compact"` on
`<html>`: body text is 14px on a 20px line on desktop, the same step a phone
reads. Do not override `--sf-text--size` with a pixel value; the attribute
keeps every ladder step in rem and does not move the root font size.

**The record panel offers "open as a page" only to a host that has one.** The
control appears when the host lists the `record-open` capability and the
record has an `address`. Larena lists it only where a record really has a page
of its own; the admin reads records in the panel and does not.

**A notice is a sentence, not a code.** When the host refuses or reports a
conflict, the data view shows the host's `message` (or its own sentence) in a
toast in the corner of the window. The reason code is kept in the toast's
`data-sf-code` attribute for the inspector and is not displayed. Send a
`message` a person can act on — for example a pinning refusal reads
«Закреплять колонки может только администратор: закрепление видят все». The
toast stands on the raised surface and above the table's menus.

**Bulk actions.** The band appears when rows are ticked and the pagination
carries an action list, set by the host:

```html
<sf-pagination slot="pagination"
  actions="publish:Опубликовать|unpublish:Снять с публикации|delete:Удалить"></sf-pagination>
```

A colon separates the id from its label in that attribute, so a bulk action has
its own id in the host (`publish-ru`, not the row action `publish:ru`). Apply
raises `bulk.apply_selected` with `action_id`, `record_ids` and `revisions`;
answer all or nothing, and name stale records in `conflicts`. «Для всех» is
shown only when the pagination has `show-action-for-all` and the host has the
`bulk-under-filter` capability; a tree page has neither.

**The navigation stays on screen.** The page body scrolls, so the shell's
`aside` is `position: sticky; inset-block-start: 0; block-size: 100dvh`.
Without it a long list carried the menu up and left an empty column.

**Menu edit mode** paints rows in their column's own colour; only hover marks a
row.

**`hidden` hides a Smart element.** A Smart host carries an inline
`display: contents`; the Framework's base layer now makes `[hidden]` win over
it. Hiding a Smart element by attribute works; no inline style is needed.

## 2026-10-12 — the tree (data view host port 1.8.0 and 1.9.0)

**Pages are a tree.** A host answers `tree: {mode: 'tree'}` with root records
and `has_children`; the view asks `tree.expand` for a node's children and
`tree.more` for the next part of a long level. Move goes through
`tree.move_targets` and a dialog of the places the host offers; create under a
node raises `view.create_record` with `parent`. Pagination is hidden in tree
mode.

**A node's icon is the host's choice** (1.9.0): `icon`, and `icon_expanded`
for an open node that looks different. A host that names none gets a folder
for a node with children and a document for a leaf. The polygon uses
`library_books` / `article` for pages.

**Row actions are named once.** `row_actions` in the answer labels the host's
action ids and groups them into submenus (`group`, `group_label`); a record's
own `actions` list still decides which apply to it. Destructive ones carry
`danger`.

**A write the host wants confirmed** answers `refused` with
`reason: 'confirm_required'` and `data.confirm: {summary, digest}`. The view
shows the summary; on confirmation it sends the same intent again with
`confirm: <digest>`. The host-port standard is unchanged.

## 2026-10-11/12 — reading a list

**Compact list on a narrow container.** A page's data view becomes a list of
records below 600px of its own width: the first three fields per record, sort
from a menu, filters in a sheet. A host that sets `layout` on its `sf-table`
keeps that layout. Search and filters stay the same controls.

**Long cell text stops at three lines** (`--sf-table-cell--line-clamp`, default
3); the full text is in the cell's `title`.

**Several tags in a cell wrap** rather than overflowing the column.
