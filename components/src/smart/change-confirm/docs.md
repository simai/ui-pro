# sf-change-confirm

Подготовленное изменение, которое ждёт «да» или «нет» человека: каждое значение как
было и как станет, два равноценных ответа, срок, до которого можно ответить, а после
ответа — только итог. Карточка родилась в `simai/ui-chat` как предложение ассистента
(`renderProposal`) и стала элементом (решение владельца 2026-10-25): тот же вопрос
задают и вне ассистента — правка коллеги в чате simai.chat, очередь модерации,
импорт, который ждёт согласия перед записью.

## Что она делает и чего не делает

Карточка **ничего не применяет**. Нажатие переводит её в `pending` — ответы
пропадают, чтобы ничего не нажали дважды, и строка состояния говорит, что
происходит — и отправляет событие. Итог ставит хост: `accepted`, `declined` или
снова `open`, если ответ не удалось доставить. Хост, отменивший событие
(`preventDefault()`), оставляет вопрос открытым.

Ответ человека — событие `sf-change-confirm-answer` с `{id, accepted}` (глагол
`answer` словаря 1.1.5). Сборка спрашивает карточку шагом `ask` (§19.4): `open`
ждёт ответа и отвечает `{accepted, reason, value}`.

Она не знает ни текста команды, ни формата кода, ни сервера: всё это осталось
в ui-chat.

## Подключение

```html
<sf-change-confirm heading="Переименовать раздел" change-id="c-17"
                   expires-at="2026-10-25T18:00:00+03:00">
  <span slot="description">Код 4821</span>
</sf-change-confirm>
```

```js
const card = document.querySelector('sf-change-confirm');
card.changes = [{label: 'Название', before: 'Новости', after: 'События'}];
card.addEventListener('sf-change-confirm-answer', async (event) => {
  const {id, accepted} = event.detail;
  try {
    await (accepted ? api.apply(id) : api.reject(id));
    card.state = accepted ? 'accepted' : 'declined';
  } catch {
    card.state = 'open';
  }
});
```

## Attributes

| Attribute | Default | Meaning |
|:---|:---|:---|
| `heading` | `""` | What the change is; without one the card is named «Что изменится». |
| `heading-level` | `3` | The heading's level, 2–6, where the card is placed. |
| `state` | `open` | `open`, `pending`, `accepted`, `declined`, `expired`. |
| `expires-at` | — | ISO 8601 date. Past it an open card reads as expired. |
| `change-id` | `""` | The host's name for the change, carried back in every event. |
| `disabled` | `false` | The answers are shown and cannot be pressed. |
| `accept-text` | «Подтвердить» / «Confirm» | The accepting answer. |
| `decline-text` | «Отклонить» / «Decline» | The declining answer («Отменить» for an assistant's offer). |
| `changes` | `[]` | The values as JSON, for markup; the `changes` property wins. |

## The change

`changes` is a list of `{label, before, after}`. A value is text; empty or `null`
reads as «пусто». Without a list the card still asks — a change with no values to
show (a deletion) is a heading and the answers.

## Actions

Each answers an outcome (`{outcome: 'applied'}` or `{outcome: 'refused', reason}`).

| Action | Meaning |
|:---|:---|
| `answer({accepted})` | As the person would: `true` confirms, `false` declines. Refused `closed`, `disabled` or `prevented` (the host cancelled the event). `answer('accept')` and `answer('decline')` are read until 2026-12-01 and noted in `SF.deprecations`. |
| `confirm()` | The acceptance; a page button reaches it as `data-sf-action="<id>.confirm"`. |
| `cancel()` | The declining answer; `data-sf-action="<id>.cancel"`. |
| `open()` | Puts the question again. Asked by an assembly (`ask`), it waits for the answer: `{accepted, reason: close \| cancelled \| expired, value: null}`. |

## Events

| Event | Detail | When |
|:---|:---|:---|
| `sf-change-confirm-answer` | `{id, accepted}` | The person answered. Cancelable: cancelled, the question stays open. |
| `sf-change-confirm-expired` | `{id}` | An open card passed `expires-at`; said once per time. |

The 1.0 names follow until 2026-12-01 and each use is noted in `SF.deprecations`:
`sf-change-confirm-accept` and `sf-change-confirm-decline` (the answer with
`accepted` true or false; one cancel for both names) and `sf-change-confirm-expire`.

## Slots

| Slot | Meaning |
|:---|:---|
| `description` | A line under the heading: a code, who proposed it. |

## Keyboard and reading

The two answers are native buttons (Tab, Enter, Space). The card is a section named
by its heading; the values are a description list, read as «Название: Было Новости,
Станет События». The status line is a polite live region that is in the page before
it speaks; when a press takes the answers away, focus moves to it instead of falling
to the page, and back to the first answer when the host cancels.

## CSS variables

Public variables, set on the card or any ancestor; the component never sets them.

| Variable | Default |
|:---|:---|
| `--sf-change-confirm-radius` | `var(--sf-radius-2)` |
| `--sf-change-confirm-inset` | `var(--sf-space-1\/2) var(--sf-space-1)` |
| `--sf-change-confirm-gap` | `var(--sf-space-1\/2)` |
| `--sf-change-confirm-before-background-color` | `var(--sf-surface-container)` |
| `--sf-change-confirm-after-background-color` | `var(--sf-primary-container)` |
| `--sf-change-confirm-after-color` | `var(--sf-on-primary-container)` |

The 1.0 hooks `--sf-change-confirm--radius`, `--inset`, `--gap`, `--before-fill`,
`--after-fill` and `--after-ink` stay the internal layer these feed.

## Words

English by default, the page's language otherwise (`lang/en.json`,
`lang/ru.json`); corrected through `SF.language.register('sf-change-confirm', 'ru', {…})`.
Keys: `changes-label`, `before-text`, `after-text`, `accept-text`, `decline-text`,
`accepting-text`, `declining-text`, `accepted-text`, `declined-text`,
`expired-text`, `until-text`, `empty-value-text`.
