# sf-property-view

One object's fields, shown and edited. The pair to `sf-data-view`: that one is a
set of records in any layout, this one is a single object — a storage record, a
related record, site settings, a profile.

The name is the property and not the record on purpose. Nothing in the component
knows what kind of object is behind a field; the renderer set it draws through is
addressed by a property **type** and a template. A name saying `record` would
narrow the component below its own contents, and the first consumer showing site
settings through it would be using a misnamed thing.

## What it owns, and what it does not

It owns the browser lifecycle and the arrangement on screen: sections, groups,
fields, which of them are hidden, which section is open.

It owns no data. Values, revisions, rights and addresses are the host's, reached
through `simai.property-view-port`. The component holds the host's last answer for
rendering and never writes to it — so a save, when the port can write, sends the
fields a person changed against the revision the read carried, and the host
answers with the object as it now is.

It chooses no component for a value. Every field is drawn by the published field
renderer set, addressed by the field's `propertyType`. A host that sends a
component name has moved a decision across the seam, and the next consumer will
have a different name for the same field.

## Connecting a host

```js
const view = document.querySelector('sf-property-view');
view.setHostPort({
  version: '1.0.0',
  capabilities: [],
  async raise(intent, payload) {
    if (intent === 'record.load') {
      return {answer: 'applied', record: await readObject(payload)};
    }
    return {answer: 'unavailable', reason: 'unknown-intent'};
  },
});
```

An answer is one of `applied`, `conflict`, `refused`, `unavailable`. Anything else
is a programming error and is thrown rather than drawn.

## The answer's shape

```json
{
  "answer": "applied",
  "record": {
    "record_id": "record-1",
    "collection": "pages",
    "revision": "7",
    "sections": [
      {"key": "main", "label": "Основное", "groups": [
        {"key": "about", "label": "О странице", "fields": [
          {"key": "title", "label": "Заголовок", "propertyType": "string", "value": "Первая запись"},
          {"key": "author", "label": "Автор", "propertyType": "user",
           "value": {"label": "Super User", "avatarText": "SU"}}
        ]}
      ]}
    ]
  }
}
```

`sections` is required even when there is one section: the arrangement belongs to
the host, and a flat list of values would make the component invent one. One
section renders as its groups alone, with no section list — a list of one is a
control that cannot be used.

## Password fields

A `string` field with `variant: "password"` is write-only. The host never sends
the password: its `value` is `{"set": true}` or `{"set": false}` (`null` reads as
not set), and the field reads «задан» or «не задан». In edit the control starts
empty; a save carries the field only when the person typed a new password, and
erasing what they typed takes the change back. An untouched password field is
never in `values`, so a save neither clears nor echoes one.

## Rare fields

A host marks a section, group or field `rare: true` and **sends it every time**.
The component hides it until `show-rare` is set. Filtering rare fields out of the
answer instead would make showing them a second read, and a person toggling the
view twice would see two different objects.

Showing them changes no value. It is a view decision, not a write.

## Field hints

A field's `hint` is drawn beside its label as `sf-help-mark`: a «?» that opens
the words on a press — by pointer, by finger and by Enter or space — and
announces them politely. It was a glyph carrying the words in a native `title`,
which needs a hover, so a touch device had no way to read a hint at all. The
button's accessible name is the hint itself, so what a screen reader says on
focus is what the mark opens.

## Date and time fields

A `datetime` field is edited as a day and a time on one row: `sf-datepicker`
for the day and `sf-input`, masked to hh:mm, for the time, both at the view's
size and each named for assistive technology («Начало: дата», «Начало: время»).
The value is the host's text in the site's time zone, read as ISO 8601 (a day, or
a day and a time after `T` or a space, with optional seconds, fraction and zone)
and written back as ISO 8601 with a time: a changed day keeps the record's
clock and zone, a typed time is `hh:mm:00` with the record's zone, and a new value
has no zone. An untouched field is not written, and a field brought back to what
it held writes nothing either. Clearing both clears the value. A day without a
time, a time without a day or a time that is not hh:mm is said under the field
like a host's error, and the save waits until it is put right. A `readonly`
datetime is shown, not edited.

## Lookup fields

A field with `propertyType: "lookup"` holds a value chosen from a reference list
the host keeps — a country, a status, a contract type (port 1.14.0). Its value
is `{"value": "RU", "label": "Россия"}`, or a list of such objects when the field
is `multiple`, and a save writes the same shape back. The label travels with the
value, so the field reads «Россия» without a second read; several values read as
a row of tags. Nothing opens from a lookup: it is not a reference to a record.

A short list arrives inline as the field's `options` and is chosen from in
place, searched in the dropdown itself, because the list in hand is the whole
list. A longer one is the host's: the field names it by `source`, and the
picker pages it through `field.options`, whose payload carries that `source` and
a `limit` of 20. The search is the host's too, over the whole list — the
component never filters a page it holds. Without the `field-options` capability
a lookup that is not inline is shown read-only, as a record is.

```json
{"key": "country", "label": "Страна", "propertyType": "lookup", "source": "countries",
 "value": {"value": "RU", "label": "Россия"}}
```

## Reading one group at a time

A host on port 1.15.0 that announces the capability `group-load` is read a
group at a time. The first read is `group.load` with `group: null`: the host
answers the record's head, the whole arrangement — every section and group,
each group not read yet with `fields: []` and its `field_count` — and the
fields of the group the panel opens on, naming it in `group`. When a section
starts (it is selected, the view is arranged, or every group is open), each of
its groups not read at the record's revision is asked for with `group.load`
and `reason: "started"`. A group still on its way is drawn as `field_count`
skeleton lines, never as an empty group.

The record has one revision, never one per group. Every group read answers it,
and `group.save` sends it. A read that answers a newer revision leaves the
groups read earlier to be read again the next time they are shown. A
`conflict` keeps what the person typed and reads what is shown again at the
revision the answer carries; `refused` with `reason: "unknown-group"` reads
the arrangement again.

A host without `group-load` is never asked for a group: `record.load` is asked
once per revision and every section is served from that one answer, as before.

## A save the host confirms first

A save that reaches past the object — one that moves every record of a type —
may be confirmed first (port 1.14.0, the same shape as the data view port's).
The host answers the save `refused` with `reason: "confirm_required"` and
`confirm: {summary, digest}`. The panel shows the summary in the bar where save
was pressed, with «Подтвердить и сохранить» and «Вернуться к правке». Confirming
raises the same `group.save` or `record.save` again with `confirm` set to the
digest; going back sends nothing and keeps every entry. A host whose digest no
longer matches what the save would do asks again, and the new summary is shown:
a person confirms what will actually happen. A create is never confirmed.

## Conditional fields

A field's `when` says when it is shown, required and enabled (port 1.14.0):

```json
{"key": "valid_until", "propertyType": "date",
 "when": {"visible": {"field": "type", "op": "eq", "value": "framework"},
          "required": {"all": [{"field": "type", "op": "eq", "value": "framework"},
                               {"field": "status", "op": "ne", "value": "draft"}]},
          "enabled": {"not": {"field": "status", "op": "in", "value": ["signed", "closed"]}}}}
```

A leaf is `{field, op, value}` with `op` one of `eq`, `ne`, `in`, `not_in`
(`value` a list), `empty`, `not_empty`; `all`, `any` and `not` combine them. The
conditions read the values on screen — what the record holds, or what the
person changed it to and has not saved — so a field appears the moment the value
it waits for is chosen. An object carrying `value` (a lookup) is compared by it,
a list matches `eq` and `in` when any item does, and values compare as text. A
condition the component cannot read leaves the field as declared.

A field its condition hides is not drawn and not sent in a save, and it is **not
cleared**: it keeps what it holds, its own value or an inherited one. Hidden by a
condition is not the same as emptied — switching a contract's type back and
forth must not lose the date it had. `required` decides the required mark and
the control's own required state; the host validates as it always has.
`enabled` that does not hold draws the control disabled, as `readonly` does.
While the view is arranged every field is listed, whatever its condition.

## Closing a panel over unsaved work

A panel never closes itself: the cross, Esc and «Отменить» each raise
`sf-property-view-close` (`reason` `close`, `escape` or `cancelled`) with
`unsaved_fields`, and whether to ask «Закрыть? Введённое не будет сохранено.»
is the host's decision. The count is the same on every way out: the changed
fields, plus every entry that is not a value yet (a day picked for a datetime
whose time is still empty). A field still holding the focus reports first, so
a time typed and not yet left is counted. «Отменить» keeps what was entered
until the host removes the panel, so a «no» to the host's question loses
nothing.

## Inputs

| input | what it does |
|:---|:---|
| `record-id` | which object to read; changing it re-reads and keeps nothing from the previous one |
| `collection` | what kind of object, in the host's vocabulary; passed back, never interpreted |
| `show-rare` | show what the host marked rare |
| `empty-text` | what an empty value reads as; the host translates it |

## What is not here yet

This is the reading half. Editing a group, the modeless panel and its stack, the
field's own affordances, the related-records group and configuring the view each
arrive as their own published pair, in that order. The port version rises with
them, and the accepted versions live in one list in `index.js` that a contract
test compares with the manifest.

## С версии 1.5.0 (стандарт simai.smart-component 1.3.8)

- Интерфейс описан в `component.json`, слова — в `lang/ru.json` и `lang/en.json`.
- После применённого сохранения приходит `sf-property-view-saved {id, revision}`; запись, которую хост не смог отдать
  (например, по устаревшей ссылке), — `sf-property-view-failed {reason, message}`.
- Панель (`panel`) открыта, пока элемент не скрыт: `hidden` или `open="false"` закрывают её, снятие — открывает тот же
  элемент снова. `full` показывает запись на месте, без выезжающей панели.
- `sf-property-view-close` — отменяемый запрос: страница решает, закрывать ли.
- `sf-property-view-open` и `sf-property-view-delete` заменили `-open-record` и `-delete-record`; старые имена приходят
  следом до 2026-12-01.
- Пока запись загружается, скелетон рисует и полосу вкладок разделов (`sections-as="tabs"`).
