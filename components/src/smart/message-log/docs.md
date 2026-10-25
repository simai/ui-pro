# sf-message-log

Переписка как прокручиваемая колонка сообщений — для любого разговора: человек
и ассистент или люди между собой. Компонент перенесён из `simai/ui-chat`
(`sf-chat-message-list`) под нейтральным именем (решение владельца 2026-10-25):
simai.chat нужен тот же порядок чтения для переписки людей.

## Что он делает и чего не делает

Он владеет **положением чтения** — и только им:

- более ранняя история добавляется сверху, а то, что человек читает, не сдвигается;
- новое сообщение тянет колонку вниз, только если человек уже был внизу или это его
  собственное сообщение;
- кнопка «К последнему сообщению» возвращает вниз и переносит туда фокус;
- верх колонки при `has-more` один раз просит предыдущие сообщения.

Он ничего не загружает и ничего не решает: каждая просьба уходит событием.

**Что такое сообщение — решает хост.** Сообщение рисует функция хоста
`renderMessage`; без неё — имя автора над первым сообщением серии и текст. Текст,
никогда не разметка: хост, у которого есть HTML, рисует его сам и сам его чистит.
Автор — это данные (`author`, `own`), а не роль: компонент только объединяет
подряд идущие сообщения одного автора в серию и говорит рисовальщику, где серия
начинается и кончается.

## Подключение

```html
<sf-message-log label="Переписка">
  <div slot="empty">Начните разговор</div>
</sf-message-log>
```

```js
const log = document.querySelector('sf-message-log');
log.renderMessage = (message, {first, own, view}) => {
  const node = document.createElement('article');
  node.setAttribute('aria-label', own ? 'Вы' : message.author_name);
  node.textContent = message.text;
  return node;
};
log.setMessages(await api.messages(threadId), {hasMore: true});
log.addEventListener('sf-message-log-load-earlier', async (event) => {
  const page = await api.messages(threadId, {before: event.detail.before});
  log.prependMessages(page.items, {hasMore: page.hasMore});
});
// новое или изменившееся сообщение
log.upsert(message);
// отправленное с локальным ключом получило номер сервера: место сохраняется
log.upsert(saved, undefined, {replaces: localKey});
```

Высоту колонке даёт контейнер: хост компонента — `display: contents`, а
`.sf-message-log` растягивается во flex-контейнере (`flex: 1`) и прокручивается
внутри.

## Attributes

| Attribute | Default | Meaning |
|:---|:---|:---|
| `has-more` | `false` | Earlier history exists: the earlier button shows, the top asks for it. |
| `label` | «Переписка» / «Conversation» | The region's accessible name. |
| `live` | `polite` | `polite`: a finished message from someone else is announced once. `off`: the host announces through `announce()`. |

## Properties

| Property | Meaning |
|:---|:---|
| `renderMessage(message, context)` | Returns a `Node`, a string (drawn as text) or `null`. `context`: `{view, previous, next, first, last, own, index, document, log}`. Setting it redraws every message. |
| `announceMessage(message, context)` | Returns what is said when the message is new or finished; the same words for one message are said once. Default: `author_name: text` for a finished message that is not `own`. |
| `messages` | Read-only: the messages in display order. |

## The message

Plain data. The log reads `id` (required, the stable key), `author`, `own`,
`pending`, and for the default renderer and announcement `author_name` and
`text`. Every other field is the renderer's.

A message is drawn again when its data or its `view` changes (compared as
sorted JSON), when its place in its author's run changes, or on `redraw(id)`.
Otherwise its node is kept — with focus inside it.

## Methods

| Method | Meaning |
|:---|:---|
| `setMessages(messages, {hasMore})` | Replace the conversation and show its end. Nothing it holds is announced. |
| `prependMessages(messages, {hasMore})` | Earlier history above, without moving what is read; ends the earlier request. |
| `upsert(message, view?, {replaces?})` | Add at the end or update in place. |
| `setView(id, view)` | Merge into a message's view. |
| `remove(id)` | Remove one message. |
| `redraw(id?)` | Draw one message, or all, again. |
| `setHasMore(value)` | Whether earlier history exists. |
| `requestEarlier()` | Ask for earlier history, as the button does. |
| `earlierFailed()` | The host could not load it: the button is pressable again. |
| `scrollToLatest({instant, focus})` | To the last message; with `focus`, focus goes there. |
| `isAtLatest()` | Whether the end is in view. |
| `announce(text)` | Say something once through the polite live region (cut at 240 characters). |

## Events

| Event | Detail | When |
|:---|:---|:---|
| `sf-message-log-load-earlier` | `{before}` — the id of the first message shown | The earlier button, ArrowUp on the first message, or the top reached while `has-more`. Cancelling it is `earlierFailed()`. |

What a person does inside a message (a rating, a retry) is the host renderer's
own events.

## Slots

| Slot | Meaning |
|:---|:---|
| `empty` | Shown instead of the column while there are no messages. |

## Keyboard

The scroller is a named, focusable region: it scrolls with the usual keys. «To the
latest» moves focus to the last message — the host's `article`, else the item.
From a focused message ArrowUp and ArrowDown move to the neighbour, Home and End to
the first and last loaded message; ArrowUp on the first asks for earlier history.
Keys pressed on a message's own controls stay theirs.

## CSS variables

| Variable | Default |
|:---|:---|
| `--sf-message-log--column` | `var(--sf-layout-reading-width)` |
| `--sf-message-log--inset` | `var(--sf-space-3)` |
| `--sf-message-log--gap-run` | `var(--sf-space-1\/4)` |
| `--sf-message-log--gap-turn` | `var(--sf-space-1\/2)` |
| `--sf-message-log--fade` | `var(--sf-space-1)` |

Classes a renderer can rely on: `.sf-message-log__item` with `--own`, `--first`,
`--last` (of a run) and `--end` (the last message of all).

## Words

English by default, the page's language otherwise. A product corrects a word
through `SF.language.register('sf-message-log', 'ru', {latestLabel: '…'})`. Keys:
`regionLabel`, `logLabel`, `earlierText`, `loadingEarlierText`, `latestLabel`,
`youText`.
