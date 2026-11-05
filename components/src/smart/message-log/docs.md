# sf-message-log

**С 2.0.0 — устаревшее имя `sf-list-feed` SIMAI Framework, до 2027-01-01.**
Поведение ленты (положение чтения, серии, потоки, перерисовка на месте,
объявления, клавиатура) перешло во Framework как `sf-list-feed` (план разделения
наборов 2026-11-05, §3 S2; аудит дублирования 2026-11-03, A-6). Пишите
`<sf-list-feed>`; его документация — во Framework, раздел «Списки».

`<sf-message-log>` продолжает работать: это наследник `sf-list-feed` под прежним
тегом. Он рисует разметку и лист ленты, отправляет её события и отвечает на
прежние имена. Каждое прежнее имя записывается в `SF.deprecations`, а первый
`<sf-message-log>` на странице один раз называется в консоли.

## Подключение

Правило `cl-message-log` связано с `cl-list-feed`: Loader загружает ленту вместе
с элементом, а элемент определяется, как только определена лента. Пакет не несёт
кода ленты.

```html
<sf-list-feed label="Переписка">
  <div slot="empty">Начните разговор</div>
</sf-list-feed>
```

## Old names

| Former (until 2027-01-01) | Now |
|:---|:---|
| `<sf-message-log>` | `<sf-list-feed>` |
| `messages` | `items` |
| `setMessages(messages, {hasMore})` | `setItems(items, {hasMore})` |
| `prependMessages(messages, {hasMore})` | `prependItems(items, {hasMore})` |
| `renderMessage(message, context)` | `renderItem(entry, context)`; the context carries `feed` instead of `log` |
| `announceMessage(message, context)` | `announceItem(entry, context)` |
| `sf-message-log-load-more` | `sf-list-feed-load-more` |
| `sf-message-log-begun` | `sf-list-feed-begun` |
| `sf-message-log-chunk` | `sf-list-feed-chunk` |
| `sf-message-log-completed` | `sf-list-feed-completed` |
| `sf-message-log-failed` | `sf-list-feed-failed` |
| `sf-message-log-cancelled` | `sf-list-feed-cancelled` |
| `setHasMore(value)` | the `has-more` setting (`hasMore`) |
| `isNearBottom()` | `isAtLatest()` |
| `cl-message-log` | `cl-list-feed` |
| `--sf-message-log-column-width` | `--sf-list-feed-column-width` |
| `--sf-message-log-inset` | `--sf-list-feed-inset` |
| `--sf-message-log-run-gap` | `--sf-list-feed-run-gap` |
| `--sf-message-log-turn-gap` | `--sf-list-feed-turn-gap` |
| `--sf-message-log-fade-size` | `--sf-list-feed-fade-size` |

Every event the feed sends also goes out under its former name with the same
detail; one `preventDefault()` cancels both. The five former public variables
still feed the feed's, before them.

Until 2026-12-01, as in 1.x: `sf-message-log-load-earlier` (the 1.0 name of
`load-more`), the entry fields `pending` (now `growing`) and `author_name` (now
`author-name`), and `remove(id)` (now `detach(id)`; `remove()` without an id is the
browser's own).

## What changes for a page (major)

The markup and the internal layer are the feed's. A page that styled
`.sf-message-log`, `.sf-message-log__item` (`--own`, `--first`, `--last`, `--end`),
`.sf-message-log__column`, `__earlier`, `__empty` or `__jump`, or set the internal
`--sf-message-log--column`, `--inset`, `--gap-run`, `--gap-turn`, `--fade`, moves to
`.sf-list-feed`, `.sf-list-feed__*` and `--sf-list-feed--*`.

## Settings, actions and events

Those of `sf-list-feed`, under their former names above: `has-more`, `changes`,
`label`, `live`; `upsert`, `setView`, `detach`, `cancel`, `redraw`,
`requestEarlier`, `earlierFailed`, `scrollToLatest`, `announce`; the events
`load-more`, `begun`, `chunk`, `completed`, `failed`, `cancelled`.

## Words

The conversation's own words stay (`lang/en.json`, `lang/ru.json`: «Переписка»,
«Сообщения»), under the feed's keys `region-label`, `log-label`, `earlier-text`,
`loading-earlier-text`, `latest-label`, `you-text`. The two tags share one entry
in `SF.language`: a word registered for `sf-message-log` or `sf-list-feed` wins.
