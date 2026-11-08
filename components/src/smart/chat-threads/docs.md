# sf-chat-threads

Список разговоров человека, новые сверху. Перенесён из `simai/ui-chat`
(`sf-chat-thread-list`) под нейтральным именем (решение владельца 2026-10-25):
разговоры с ассистентом и чаты людей в simai.chat — один и тот же список.

## Что он делает и чего не делает

Разговор — это данные хоста: `id`, `title`, `updated-at` и, если нужно, `caption`
(с кем разговор, последнее сообщение), `unread` (сколько непрочитанных) и `avatar`.
Список рисует ровно это и ничего не толкует.

Строки — это `sf-list` Framework (с 2.0.0, решение владельца 06.11.2026): разговор
становится его строкой (`title` → `text`, `caption` → `supporting`, `updated-at` →
`date`, `unread` → `count`, `activity` → `badge`, `avatar` и `pinned` как есть). Группы
по дню последнего изменения в часовом поясе человека («Сегодня», «Вчера», день недели,
дата — `formatRelativeDay` ядра) или без групп, закреплённые первыми, отметка
открытого разговора, одна остановка Tab, переименование на месте, меню строки и
следующая страница — его. Вокруг строк остаётся своё: начать разговор, архив и путь
назад, фраза вместо списка, подвал. Список ничего не загружает и сам не меняет
`selected`: открытый разговор назначает хост.

## Подключение

```html
<sf-chat-threads selected="t1">
  <div slot="footer">…</div>
</sf-chat-threads>
```

```js
const list = document.querySelector('sf-chat-threads');
list.loading = true;
list.setThreads(await api.threads(), {hasMore: true});
list.addEventListener('sf-chat-threads-open', (event) => {
  openConversation(event.detail.id);
  list.selected = event.detail.id;
});
list.addEventListener('sf-chat-threads-load-more', async () => {
  try {
    const page = await api.threads({after: cursor});
    list.appendThreads(page.items, {hasMore: page.hasMore});
  } catch {
    list.moreFailed();
  }
});
// свои действия строки — после «Переименовать» и «В архив»
list.actions = [{id: 'mute', text: 'Без звука', icon: 'notifications_off'}];
list.addEventListener('sf-chat-threads-apply', (event) => {
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
| `selected` | `""` | The id of the open conversation. Controlled: a press asks `sf-chat-threads-open`, the host writes it back. |
| `has-more` | `false` | A next page exists: reaching the end asks for it. |
| `archived` | `false` | Show the archive: a way back, Restore instead of Archive, no New conversation. |
| `no-create` | `false` | No New conversation. |
| `create-commands` | `[]` | A property (`createCommands`): commands in the head in place of New conversation (below). |
| `no-manage` | `false` | No row actions: no menu, no F2. |
| `no-archive` | `false` | No archive: no way to it, no Archive among the actions. |
| `group-by` | `day` | `day`: Today, Yesterday, the weekday, the date (sf-list). `none`: one list. |
| `label` | «Разговоры» / «Conversations» | The navigation's accessible name (in the archive: «Архив»). |
| `loading` | `false` | The shape of the list while the first page loads (was `setLoading()`). |
| `status` | `""` | A sentence in place of the list, an error; empty clears it (was `setStatus()`). |

## Properties

| Property | Meaning |
|:---|:---|
| `threads` | The conversations, newest first; written whole, read as copies. Rows are keyed by id. |
| `actions` | `[{id, text, icon?}]`: the host's own row actions. |
| `createCommands` | `[{id, text, icon?}]` (1.5.0): commands in the head in place of New conversation, e.g. a dialogue and a group; empty is the one New conversation. `no-create` and the archive take them away as well. |
| `selected`, `archived`, `hasMore`, `loading`, `status` | The attributes, as properties. |

## The thread

`{id, title, updated-at, archived?, pinned?, caption?, activity?, unread?, avatar?: {image-url?, text?, shape?, icon?}}`.
`avatar` (1.6.0): `shape` — `circle` (по умолчанию, один человек) или `square` (группа,
канал); `icon` — знак вместо инициалов (канал, агент, бот; имя значка Framework),
картинка `image-url` важнее знака. Нет `avatar` — нет и колонки под него: в списке
только с ИИ-разговорами пустого места слева не остаётся. Тона инициалов компонент
не задаёт: у Framework для них пока нет средства (инициалы все одного цвета).
`activity` (`running`, `waiting`, `done`, `stopped`, `failed`) is where the work in the
conversation is: a tonal badge in the row with its word (sf-list `badge`).
A pinned conversation (`pinned: true`, Mirai24 API v1.1) leads the list under its own
heading «Закреплённые» (sf-list's `pinned-text`); without groups (`group-by="none"`) the pinned ones simply lead.
Pinning and unpinning are the host's row actions: it offers them in `actions`
(`{id: "pin", text: "Закрепить"}`), hears them as `sf-chat-threads-apply` and
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
| `sf-chat-threads-create` | `{}`, or `{kind}` | New conversation; from a command of `createCommands`, `kind` is its id (1.5.0). |
| `sf-chat-threads-open` | `{id}` | A conversation is asked for. |
| `sf-chat-threads-rename` | `{id, title}` | Renamed in place; shown at once. A host that cannot keep it upserts the old title. |
| `sf-chat-threads-archive` | `{ids, id}` | Archive. |
| `sf-chat-threads-restore` | `{ids, id}` | Restore. |
| `sf-chat-threads-apply` | `{action, scope: 'entry', ids, id}` | One of `actions`. |
| `sf-chat-threads-load-more` | `{direction: 'after'}` | The end came into view while `has-more`. |
| `sf-chat-threads-toggle` | `{archived}` | The archive, or the way back. |

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
| `--sf-thread-list-radius` | `var(--sf-radius-1)` — a command's corner |
| `--sf-thread-list-hover-background-color` | `var(--sf-surface-transparent-hover)` — a command under the pointer |
| `--sf-thread-list-current-background-color` | `var(--sf-surface-transparent-select)` — kept for 1.x pages; the open row is sf-list's (`--sf-list-current-background-color`) |

The 1.0 hooks `--sf-thread-list--inset`, `--row-height`, `--radius`, `--hover` and
`--current` stay the internal layer these feed.

## Words

English by default, the page's language otherwise (`lang/en.json`, `lang/ru.json`);
corrected through `SF.language.register('sf-chat-threads', 'ru', {'create-text': 'Новый чат'})`.
Keys: `label`, `create-text`, `archive-text`, `unarchive-text`, `archive-view`,
`back-text`, `empty-text`, `archive-empty-text`, `activity-running`, `activity-waiting`,
`activity-done`, `activity-stopped`, `activity-failed` (a badge's word, sf-badge's own).
A row's words (Rename, New name, the actions' label, Untitled, Loading, the
«Закреплённые» heading, the unread count) are sf-list's: `SF.language.register('sf-list', …)`.

Under a finger (`pointer: coarse`) every command is at least 44px (`--sf-d1`):
«Новый разговор» and the other row-like commands; the rows are sf-list's.

## 2.0.0

The rows are sf-list 1.1. Settings, actions, events and their details do not
change. What a page sees: the day headings are sf-list's (weekday and date past
yesterday, instead of «Раньше»); a pinned row has no «Закреплён» line of its own;
the running badge has no spinner; «Показать ещё» stands under a list with a next
page. The rows' markup is sf-list's (`.sf-list__row[data-id]`, `sf-list-item`, «⋯»
`.sf-list__actions`): the `.sf-thread-list__item`, `__link`, `__title`, `__caption`,
`__pinned`, `__avatar`, `__unread`, `__activity`, `__more` classes are gone. The head,
foot, commands and status keep theirs. Needs the Framework pair with sf-list 1.1.1
(ui-2a671352d67b or later).

What 1.x promised of its rows still holds: a title and a caption stay one line,
cut at the end, and under a finger a row and its «⋯» are at least 44px. sf-list 1.1
does neither by itself yet, so the list of conversations keeps both for its own
rows (scoped to `.sf-thread-list__rows`) until sf-list does.

## Former tag

Until 2027-01-01 the former tag `sf-thread-list` is a dated alias of `sf-chat-threads`
(rename plan R2, 2026-11-03): markup with the old tag upgrades as this element,
the Loader forwards the former rule name `cl-thread-list` to `cl-chat-threads`, and each
use is noted once in `SF.deprecations`. Write the new tag in new markup.

Every event keeps its former name beside the new one, with the same detail:
`sf-thread-list-create`, `sf-thread-list-open`, `sf-thread-list-rename`, `sf-thread-list-archive`, `sf-thread-list-restore`, `sf-thread-list-apply`, `sf-thread-list-load-more`, `sf-thread-list-toggle`.

The public CSS variables (`--sf-thread-list-*`) and the head's, foot's and commands' class names keep the former name.
