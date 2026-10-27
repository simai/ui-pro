# sf-thread-list

Список разговоров человека, новые сверху. Перенесён из `simai/ui-chat`
(`sf-chat-thread-list`) под нейтральным именем (решение владельца 2026-10-25):
разговоры с ассистентом и чаты людей в simai.chat — один и тот же список.

## Что он делает и чего не делает

Разговор — это данные хоста: `id`, `title`, `updated-at` и, если нужно, `caption`
(с кем разговор, последнее сообщение), `unread` (сколько непрочитанных) и `avatar`.
Список рисует ровно это и ничего не толкует.

Он владеет только расположением: группы по дню последнего изменения в часовом поясе
человека («Сегодня», «Вчера», «Раньше») или без групп, отметка открытого разговора,
одна остановка Tab на весь список, переименование на месте, действия строки в меню
Фреймворка и просьба о следующей странице, когда конец списка показался. Он ничего не
загружает и сам не меняет `selected`: открытый разговор назначает хост.

## Подключение

```html
<sf-thread-list selected="t1">
  <div slot="footer">…</div>
</sf-thread-list>
```

```js
const list = document.querySelector('sf-thread-list');
list.loading = true;
list.setThreads(await api.threads(), {hasMore: true});
list.addEventListener('sf-thread-list-open', (event) => {
  openConversation(event.detail.id);
  list.selected = event.detail.id;
});
list.addEventListener('sf-thread-list-load-more', async () => {
  try {
    const page = await api.threads({after: cursor});
    list.appendThreads(page.items, {hasMore: page.hasMore});
  } catch {
    list.moreFailed();
  }
});
// свои действия строки — после «Переименовать» и «В архив»
list.actions = [{id: 'mute', text: 'Без звука', icon: 'notifications_off'}];
list.addEventListener('sf-thread-list-apply', (event) => {
  const {action, ids} = event.detail; // {action: 'mute', scope: 'entry', ids: ['t1']}
});
```

Для чата людей: `group-by="none"`, `caption` — последнее сообщение, `unread` —
счётчик, `avatar: {image-url, text}`, при необходимости `no-archive`.

Контракт — `component.json` (стандарт simai.smart-component 1.3.8): настройки,
события по глаголам словаря 1.1.5, действия с исходом
(`{outcome: 'applied'}` или `{outcome: 'refused', reason}`), слова в `lang/`.

## Attributes

| Attribute | Default | Meaning |
|:---|:---|:---|
| `selected` | `""` | The id of the open conversation. Controlled: a press asks `sf-thread-list-open`, the host writes it back. |
| `has-more` | `false` | A next page exists: reaching the end asks for it. |
| `archived` | `false` | Show the archive: a way back, Restore instead of Archive, no New conversation. |
| `no-create` | `false` | No New conversation. |
| `no-manage` | `false` | No row actions: no menu, no F2. |
| `no-archive` | `false` | No archive: no way to it, no Archive among the actions. |
| `group-by` | `day` | `day`: Today, Yesterday, Earlier. `none`: one list. |
| `label` | «Разговоры» / «Conversations» | The navigation's accessible name (in the archive: «Архив»). |
| `loading` | `false` | The shape of the list while the first page loads (was `setLoading()`). |
| `status` | `""` | A sentence in place of the list, an error; empty clears it (was `setStatus()`). |

## Properties

| Property | Meaning |
|:---|:---|
| `threads` | The conversations, newest first; written whole, read as copies. Rows are keyed by id. |
| `actions` | `[{id, text, icon?}]`: the host's own row actions. |
| `selected`, `archived`, `hasMore`, `loading`, `status` | The attributes, as properties. |

## The thread

`{id, title, updated-at, archived?, pinned?, caption?, unread?, avatar?: {image-url?, text?}}`.
A pinned conversation (`pinned: true`, Mirai24 API v1.1) leads the list under its own
heading «Закреплённые» (`pinned`) and carries a quiet «Закреплён» line
(`pinned-text`); without groups (`group-by="none"`) the pinned ones simply lead.
Pinning and unpinning are the host's row actions: it offers them in `actions`
(`{id: "pin", text: "Закрепить"}`), hears them as `sf-thread-list-apply` and
gives the list the entry with `pinned` changed.
The list keeps only the conversations of the shown view: with `archived` the
archived ones, without it the rest. A title is cut at 120 characters when renamed.
The 1.0 spellings `updated_at` and `avatar.image_url` are read until 2026-12-01 and
noted in `SF.deprecations`.

## Actions

Each answers an outcome.

| Action | Meaning |
|:---|:---|
| `setThreads(threads, {hasMore})` | Replace the list; ends a page request and `loading`. Also `setThreads({threads, 'has-more'})`. |
| `appendThreads(threads, {hasMore})` | The next page; what is listed is not repeated. |
| `upsert(thread)` | A new or changed conversation, placed by its date. |
| `removeThread(id)` | Take one off the list; refused `unknown`. |
| `moreFailed()` | The next page failed: reaching the end asks again. |
| `rename(id)` | Start renaming in place, as F2 does; refused `unknown`, `no-manage`. |
| `openMenu(id)` | Open a row's actions, as «⋯» does. |

`setLoading(loading)` and `setStatus(message)` are the settings `loading` and
`status` now; they work until 2026-12-01 and each call is noted.

## Events

| Event | Detail | When |
|:---|:---|:---|
| `sf-thread-list-create` | `{}` | New conversation. |
| `sf-thread-list-open` | `{id}` | A conversation is asked for. |
| `sf-thread-list-rename` | `{id, title}` | Renamed in place; shown at once. A host that cannot keep it upserts the old title. |
| `sf-thread-list-archive` | `{ids, id}` | Archive. |
| `sf-thread-list-restore` | `{ids, id}` | Restore. |
| `sf-thread-list-apply` | `{action, scope: 'entry', ids, id}` | One of `actions`. |
| `sf-thread-list-load-more` | `{direction: 'after'}` | The end came into view while `has-more`. |
| `sf-thread-list-toggle` | `{archived}` | The archive, or the way back. |

The 1.0 names follow until 2026-12-01 and each use is noted in `SF.deprecations`:
`sf-thread-list-select` (open), `sf-thread-list-unarchive` (restore),
`sf-thread-list-action` (apply) and `sf-thread-list-view` (toggle).

## Slots

| Slot | Meaning |
|:---|:---|
| `footer` | Under the list, after the way to the archive. |

## Keyboard

The list is one Tab stop. ArrowUp, ArrowDown, Home and End move between
conversations; Enter or Space opens one; F2 renames (Enter keeps, Escape gives up
and does not close a panel around the list, leaving the field keeps); Shift+F10 or
the menu key opens the row's actions. The «⋯» is not a Tab stop of its own.

## CSS variables

Public variables, set on the list or any ancestor; the component never sets them.

| Variable | Default |
|:---|:---|
| `--sf-thread-list-inset` | `var(--sf-space-1\/3)` |
| `--sf-thread-list-row-height` | `var(--sf-ui-1--control-height)` |
| `--sf-thread-list-radius` | `var(--sf-radius-1)` |
| `--sf-thread-list-hover-background-color` | `var(--sf-surface-transparent-hover)` |
| `--sf-thread-list-current-background-color` | `var(--sf-surface-transparent-select)` |

The 1.0 hooks `--sf-thread-list--inset`, `--row-height`, `--radius`, `--hover` and
`--current` stay the internal layer these feed.

## Words

English by default, the page's language otherwise (`lang/en.json`, `lang/ru.json`);
corrected through `SF.language.register('sf-thread-list', 'ru', {'create-text': 'Новый чат'})`.
Keys: `label`, `create-text`, `today`, `yesterday`, `earlier`, `actions-label`,
`rename-text`, `rename-label`, `archive-text`, `unarchive-text`, `archive-view`,
`back-text`, `empty-text`, `archive-empty-text`, `loading-text`, `untitled-text`,
`unread-label`, `pinned`, `pinned-text`.

Under a finger (`pointer: coarse`) every target is at least 44px (`--sf-d1`):
a row, «Новый разговор» and the other row-like commands, and a row's «⋯».
