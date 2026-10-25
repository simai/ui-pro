# sf-thread-list

Список разговоров человека, новые сверху. Перенесён из `simai/ui-chat`
(`sf-chat-thread-list`) под нейтральным именем (решение владельца 2026-10-25):
разговоры с ассистентом и чаты людей в simai.chat — один и тот же список.

## Что он делает и чего не делает

Разговор — это данные хоста: `id`, `title`, `updated_at` и, если нужно, `caption`
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
list.setLoading(true);
list.setThreads(await api.threads(), {hasMore: true});
list.addEventListener('sf-thread-list-select', (event) => {
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
```

Для чата людей: `group-by="none"`, `caption` — последнее сообщение, `unread` —
счётчик, `avatar: {image_url, text}`, при необходимости `no-archive`.

## Attributes

| Attribute | Default | Meaning |
|:---|:---|:---|
| `selected` | `""` | The id of the open conversation. |
| `has-more` | `false` | A next page exists: reaching the end asks for it. |
| `archived` | `false` | Show the archive: a way back, Restore instead of Archive, no New conversation. |
| `no-create` | `false` | No New conversation. |
| `no-manage` | `false` | No row actions: no menu, no F2. |
| `no-archive` | `false` | No archive: no way to it, no Archive among the actions. |
| `group-by` | `day` | `day`: Today, Yesterday, Earlier. `none`: one list. |
| `label` | «Разговоры» / «Conversations» | The navigation's accessible name (in the archive: «Архив»). |

## Properties

| Property | Meaning |
|:---|:---|
| `threads` | Read-only: the conversations shown, newest first. |
| `actions` | `[{id, text, icon?}]`: the host's own row actions. |
| `selected`, `archived`, `hasMore` | The attributes, as properties. |

## The thread

`{id, title, updated_at, archived?, caption?, unread?, avatar?: {image_url?, text?}}`.
`setThreads` keeps only the conversations of the shown view: with `archived` the
archived ones, without it the rest. A title is cut at 120 characters when renamed.

## Methods

| Method | Meaning |
|:---|:---|
| `setThreads(threads, {hasMore})` | Replace the list. |
| `appendThreads(threads, {hasMore})` | The next page; what is listed is not repeated. |
| `upsert(thread)` | A new or changed conversation, placed by its date. |
| `removeThread(id)` | Take one off the list. |
| `setLoading(loading)` | The shape of the list while the first page loads. |
| `setStatus(message)` | A sentence in place of the list (an error); empty clears it. |
| `moreFailed()` | The next page failed: reaching the end asks again. |
| `rename(id)` | Start renaming in place, as F2 does. |
| `openMenu(id, anchor)` | Open a row's actions, as «⋯» does. |

## Events

| Event | Detail | When |
|:---|:---|:---|
| `sf-thread-list-create` | — | New conversation. |
| `sf-thread-list-select` | `{id}` | A conversation was opened. |
| `sf-thread-list-rename` | `{id, title}` | Renamed in place; shown at once. A host that cannot keep it upserts the old title. |
| `sf-thread-list-archive` | `{id}` | Archive. |
| `sf-thread-list-unarchive` | `{id}` | Restore. |
| `sf-thread-list-action` | `{id, action}` | One of `actions`. |
| `sf-thread-list-load-more` | — | The end came into view while `has-more`. |
| `sf-thread-list-view` | `{archived}` | The archive, or the way back. |

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

| Variable | Default |
|:---|:---|
| `--sf-thread-list--inset` | `var(--sf-space-1\/3)` |
| `--sf-thread-list--row-height` | `var(--sf-ui-1--control-height)` |
| `--sf-thread-list--radius` | `var(--sf-radius-1)` |
| `--sf-thread-list--hover` | `var(--sf-surface-transparent-hover)` |
| `--sf-thread-list--current` | `var(--sf-surface-transparent-select)` |

## Words

English by default, the page's language otherwise; corrected through
`SF.language.register('sf-thread-list', 'ru', {createText: 'Новый чат'})`. Keys:
`label`, `createText`, `today`, `yesterday`, `earlier`, `actionsLabel`, `renameText`,
`renameLabel`, `archiveText`, `unarchiveText`, `archiveView`, `backText`, `emptyText`,
`archiveEmptyText`, `loadingText`, `untitledText`, `unreadLabel`.
