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
log.renderMessage = (message, {first, own, view, growing}) => {
  const node = document.createElement('article');
  node.setAttribute('aria-label', own ? 'Вы' : message['author-name']);
  node.textContent = message.text;
  return node;
};
log.setMessages(await api.messages(threadId), {hasMore: true});
log.addEventListener('sf-message-log-load-more', async (event) => {
  // {direction: 'before', before}: before is the first message shown
  const page = await api.messages(threadId, {before: event.detail.before});
  log.prependMessages(page.items, {hasMore: page.hasMore});
});
// новое или изменившееся сообщение
log.upsert(message);
// отправленное с локальным ключом получило номер сервера: место сохраняется
log.upsert(saved, undefined, {replaces: localKey});
```

Ответ, который пишется по частям, — поток (стандарт 1.3.8 §10.8, словарь 1.1.5
§5.2): у сообщения `growing: true`, пока другая сторона его пишет; каждая часть —
новое `upsert` (или новый `messages`) с более длинным текстом. Лог сообщает
`sf-message-log-begun`, `-chunk` на каждую нарисованную часть и ровно одно из
`-completed`, `-failed`, `-cancelled`. Кнопка «Остановить» хоста вызывает
`log.cancel({id})`: рост больше не рисуется, поток кончается `cancelled` сразу, а
сказать серверу остановиться — дело хоста (`stop {conversation, id?}` порта чата).

```js
log.addEventListener('sf-message-log-begun', (event) => composer.busy = true);
for (const end of ['completed', 'failed', 'cancelled']) {
  log.addEventListener(`sf-message-log-${end}`, () => composer.busy = false);
}
stopButton.onclick = () => { log.cancel({id: streamingId}); port.raise('wait.stop', {conversation_id}); };
```

Изменившееся сообщение перерисовывается **на месте** (§18.4): элемент сообщения
остаётся тем же, а пока фокус или выделение внутри него, новый рисунок
накладывается на старые узлы — фокус на кнопке внутри растущего ответа не
сбрасывается.

Высоту колонке даёт контейнер: хост компонента — `display: contents`, а
`.sf-message-log` растягивается во flex-контейнере (`flex: 1`) и прокручивается
внутри.

## Attributes

| Attribute | Default | Meaning |
|:---|:---|:---|
| `has-more` | `false` | Earlier history exists: the earlier button shows, the top asks for it. |
| `changes` | `content` | How two writes of one message compare (§18.4): `content` (its fields and view) or `revision` (the host raises it with every change). |
| `label` | «Переписка» / «Conversation» | The region's accessible name. |
| `live` | `polite` | `polite`: a finished message from someone else is announced once. `off`: the host announces through `announce()`. |

## Properties

| Property | Meaning |
|:---|:---|
| `renderMessage(message, context)` | Returns a `Node`, a string (drawn as text) or `null`. `context`: `{view, previous, next, first, last, own, index, document, log}`. Setting it redraws every message. |
| `announceMessage(message, context)` | Returns what is said when the message is new or finished; the same words for one message are said once. Default: `author_name: text` for a finished message that is not `own`. |
| `messages` | The messages in display order. Written whole, it is compared by key with what is shown: a message that left is taken off, a new or changed one drawn in its place, the rest keep their nodes (§18.4). |

## The message

Plain data. The log reads `id` (required, the stable key), `author`, `own`,
`growing`, `revision`, `wait` (`delayed`, `stopped`, `network`, `none`; `null` is
`none`), `error` (`{reason, message}`), and for the default renderer and
announcement `author-name` and `text`. Every other field is the renderer's. The 1.0
spellings `author_name` and `pending` are read until 2026-12-01 and noted in
`SF.deprecations`.

A message is drawn again when its data or its `view` changes (by `changes`), when
its place in its author's run changes, or on `redraw(id)`. Its item element is kept
either way, and its drawing too while the focus or a selection is inside it.

## Actions

Each answers an outcome (`{outcome: 'applied'}` or `{outcome: 'refused', reason}`).

| Action | Meaning |
|:---|:---|
| `setMessages(messages, {hasMore})` | Replace the conversation and show its end. Nothing it holds is announced; a stream it held ends cancelled. |
| `prependMessages(messages, {hasMore})` | Earlier history above, without moving what is read; ends the earlier request. |
| `upsert(message, view?, {replaces?})` | Add at the end or redraw in place. Refused `cancelled` for a cancelled stream until its end. |
| `setView(id, view)` | Merge into a message's view. |
| `detach(id)` | Take one message off; a stream it was ends cancelled. `remove(id)`, its 1.0 name, works until 2026-12-01 and is noted; `remove()` without an id is the browser's own. |
| `cancel(id)` | Stop drawing a growing message now: its growth and its end; the busy mark goes and the stream ends cancelled. Refused `not-growing`, `unknown`. |
| `redraw(id?)` | Draw one message, or all, again. |
| `requestEarlier()` | Ask for earlier history, as the button does. Refused `loading`, `no-more`, `prevented`. |
| `earlierFailed()` | The host could not load it: the button is pressable again. |
| `scrollToLatest({instant, focus})` | To the last message; with `focus`, focus goes there. |
| `announce(text)` | Say something once through the polite live region (cut at 240 characters). |

`isAtLatest()` says whether the end is in view; `setHasMore(value)` is the
`has-more` setting.

## Events

| Event | Detail | When |
|:---|:---|:---|
| `sf-message-log-load-more` | `{direction: 'before', before}` — `before` is the id of the first message shown | The earlier button, ArrowUp on the first message, or the top reached while `has-more`. Cancelling it is `earlierFailed()`. |
| `sf-message-log-begun` | `{id}` | A growing message arrived. |
| `sf-message-log-chunk` | `{id, revision?}` | A growing message changed and was drawn again. |
| `sf-message-log-completed` | `{id}` | It stopped growing whole. |
| `sf-message-log-failed` | `{id, reason, message}` | It stopped growing with an error. |
| `sf-message-log-cancelled` | `{id}` | The stream was stopped: `cancel`, `wait: 'stopped'`, the message taken off or the conversation replaced. |

`sf-message-log-load-earlier`, the 1.0 name, follows `load-more` with the same
detail until 2026-12-01 (one cancel for both names); each use is noted in
`SF.deprecations`.

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

Public variables, set on the log or any ancestor; the component never sets them.

| Variable | Default |
|:---|:---|
| `--sf-message-log-column-width` | `var(--sf-layout-reading-width)` |
| `--sf-message-log-inset` | `var(--sf-space-3)` |
| `--sf-message-log-run-gap` | `var(--sf-space-1\/4)` |
| `--sf-message-log-turn-gap` | `var(--sf-space-1\/2)` |
| `--sf-message-log-fade-size` | `var(--sf-space-1)` |

The 1.0 hooks `--sf-message-log--column`, `--inset`, `--gap-run`, `--gap-turn` and
`--fade` stay the internal layer these feed.

Classes a renderer can rely on: `.sf-message-log__item` with `--own`, `--first`,
`--last` (of a run) and `--end` (the last message of all).

## Words

English by default, the page's language otherwise. A product corrects a word
through `SF.language.register('sf-message-log', 'ru', {'latest-label': '…'})`
(`lang/en.json`, `lang/ru.json`). Keys: `region-label`, `log-label`, `earlier-text`,
`loading-earlier-text`, `latest-label`, `you-text`.
