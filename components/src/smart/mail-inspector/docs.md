# sf-mail-inspector

Правая панель SIMAI — редактора писем: заголовок с действиями, путь, вкладки,
разделы и все виды полей редактора. Написан для `simai/ui-mail` по решению
владельца D31 от 2026-10-29: продуктовые репозитории не делают своих наборов
компонентов, общие компоненты живут в ui-pro.

Это форма, нарисованная из данных. Элемент не знает ни письма, ни манифеста
блоков, ни хранилища, ни правил адресов и ничего не проверяет. Хост передаёт всё
на языке человека — значение, ошибку, подсказку и заполнитель каждого поля, —
слушает, что человек сделал, и передаёт форму обратно.

## Данные

```js
panel.setAttribute('heading', 'Кнопка');
panel.setAttribute('heading-icon', 'smart_button');
panel.setAttribute('form-key', 'b7');        // чья это форма: id блока
panel.headActions = ['duplicate', 'delete']; // или ['replace'] у шапки и подвала
panel.levels = [{text: 'Кнопка'}, {text: 'Расширенный'}];
panel.notice = {text: 'Причина получения и ссылка отписки — в параметрах письма.', action: 'Открыть параметры письма'};
panel.sections = [
  {key: 'button:content', title: 'Содержимое', fields: [
    {kind: 'text', path: '/text', label: 'Текст', value: 'Подробнее', required: true},
    {kind: 'link', path: '/url', label: 'Ссылка', value: 'htt', placeholder: 'https://', error: 'Нужен адрес https://'},
  ]},
  {key: 'button:look', title: 'Оформление', fields: [
    {kind: 'select', path: '/tone', label: 'Тон', value: '', options: [{value: '', text: '— нет —'}, {value: 'accent', text: 'Акцент'}]},
  ]},
];
```

Путь `path` — адрес поля, его несут события; элемент его не разбирает. Форму
передают новым массивом: так элемент узнаёт, что хост ответил.

## Поля

Общее: `kind`, `path`, `label`, `value`, `error`, `hint`, `placeholder`,
`required`, `disabled`.

| `kind` | Что это | Своё |
|:---|:---|:---|
| `text` | `sf-input` | `inputmode`, `inheritedValue`, `ariaLabel` |
| `multiline` | `sf-textarea`, растёт от двух строк до двенадцати | `inheritedValue`, `ariaLabel` |
| `link` | `sf-input` для адреса | как у `text` |
| `number` | `sf-input` с цифровой клавиатурой | как у `text`; `inputmode: 'decimal'` для цены |
| `select` | `sf-dropdown` | `options: [{value, text}]`; `value: ''` — выбор «ничего» |
| `switch` | `sf-switch` | `value` — логическое |
| `group` | поля под одним именем, цена например | `rows: [[поле, поле], [поле]]`; ряд из двух стоит парой |
| `image` | `sf-image-field` | `value: {value, label, mime, size, href}` или `null`, `accept`, `emptyText`, `ariaLabel`, `choices: [{value, text}]`, `chooseLabel`, `choosePlaceholder` |
| `items` | список на `sf-sortable` | `items: [{label, problem, fields}]`, `open`, `min`, `max` |

`hint` — настоящий текст под полем: так значение из бренда слышит и читатель
экрана. Значение из бренда у пустого поля — `inheritedValue`.

## Набранный текст

Значение элемент не проверяет: `change` несёт сырой текст. Если хост его не
принял, он передаёт в этом поле `error`, и поле хранит то, что набрал человек,
пока `error` не снят. Перерисовка не трогает поле, в котором человек печатает:
фокус и курсор остаются на месте, а поле, держащее фокус, не записывается вовсе.
Когда человек уходит из поля без ошибки, поле показывает значение хоста. Ожидать
набранное в `value` не нужно: хост, который хранит черновик дольше, чем живёт
форма (другой блок и обратно), передаёт его как `value` вместе с `error`.

`form-key` — чья это форма. Когда он меняется, форма рисуется заново, а набранное
для прежней пропадает, поэтому поле `/title` одного блока не достаётся другому.

## Разделы

Один раздел — это просто поля, без заголовка. У нескольких раскрытие — состояние
вида: элемент делает его сам, сообщает `toggle` и держит список закрытых в
`closedSections`. Память — по ключу раздела, поэтому ключ вроде `button:look`
помнит закрытие у всех кнопок; хост, который помнит дольше, передаёт список
обратно.

## Вкладки и панели хоста

`tabs: [{id, label, slot}]`, показанная — `tab`; выбор человека элемент записывает в `tab` сам и сообщает событием, а хост может назвать другую. Вкладка без `slot` показывает
форму (`sections`). Вкладка со `slot` показывает панель хоста: содержимое вкладок
«Бренд», «Картинки» и «Версии» — это не поля этого элемента, а панели редактора.

```html
<sf-mail-inspector id="panel">
  <div slot="brand" class="brand-panel">…</div>
</sf-mail-inspector>
```

Новую панель взамен передают через `panel.setSlot('brand', node)`.

## События

| Событие | Когда | `detail` |
|:---|:---|:---|
| `change` | поле; `typed` — набрано с клавиатуры. Имя родное, отправляется на самом элементе; собственные `input` и `change` полей наружу не выходят | `{path, value, typed}` |
| `sf-mail-inspector-attach` | файл выбран или брошен на изображение | `{path, files}` |
| `sf-mail-inspector-detach` | «Убрать» у необязательного изображения | `{path}` |
| `sf-mail-inspector-toggle` | раздел открыт или закрыт | `{key, open}` |
| `sf-mail-inspector-level` | нажатие на пути, Escape | `{index}` |
| `sf-mail-inspector-tab` | выбрана вкладка | `{id}` |
| `sf-mail-inspector-notice-action` | кнопка сообщения | `{}` |
| `sf-mail-inspector-duplicate` | «Дублировать» у заголовка | `{}` |
| `sf-mail-inspector-delete` | «Удалить» у заголовка | `{}` |
| `sf-mail-inspector-replace` | «Сменить вариант…» у заголовка | `{}` |
| `sf-mail-inspector-item-toggle` | раскрытие элемента; хост передаёт `open` обратно | `{path, index, open}` |
| `sf-mail-inspector-item-add` | «Добавить элемент» | `{path}` |
| `sf-mail-inspector-item-move` | перетаскивание, Alt+стрелки, ⋯ | `{path, from, to}` |
| `sf-mail-inspector-item-duplicate` | «Дублировать» под ⋯ | `{path, index}` |
| `sf-mail-inspector-item-delete` | «Удалить» под ⋯ | `{path, index}` |

## Путь и Escape

`levels` — путь сверху вниз, последний уровень — где человек сейчас. Два уровня и
больше рисуются путём; один не рисуется, у него есть заголовок. Escape в форме
просит уровень выше последнего: при одном уровне `index` равен `-1`, «выше того,
что нарисовано» (из блока — к параметрам письма). Без уровней Escape не
обрабатывается. Открытый список, меню, окно и перетаскивание забирают Escape себе.

## Изображение

Поле ничего не загружает. На `attach` хост сохраняет файл и передаёт сохранённый
`value`; если файл не подошёл — прежний `value` и `error`, и поле снова покажет
прежнее изображение. Обязательное изображение нельзя убрать: кнопка в поле есть,
поэтому элемент возвращает картинку и говорит почему, а события не шлёт.
Неподходящий формат элемент тоже объясняет сам. Выбор из `choices` — это `change`
со значением выбранного.

## Действия

| Действие | Что делает | Ответ |
|:---|:---|:---|
| `duplicate`, `delete`, `replace` | как кнопка у заголовка | `applied`; `refused unknown` |
| `level-up` | как Escape | `applied`; `refused top` |
| `go-to-level {index}` | как нажатие на пути | `applied`; `refused unknown` |
| `open-tab {id}` | просит вкладку | `applied`; `refused unknown` |
| `toggle-section {key}` | как заголовок раздела | `applied`; `refused unknown` |
| `item-toggle {path, index}` | как раскрытие элемента | `applied`; `refused unknown` |
| `item-add {path}` | как «Добавить элемент» | `applied`; `refused unknown`, `full` |
| `item-move {path, index, to}` или `{path, index, by}` | просит переместить | `applied`; `refused unknown`, `unchanged` |
| `item-duplicate {path, index}` | просит копию | `applied`; `refused unknown`, `full` |
| `item-delete {path, index}` | просит удалить | `applied`; `refused unknown`, `least` |
| `focus-item {path, index}` | ставит фокус на элемент после отрисовки | `applied`; `refused unknown` |

## Клавиатура и доступность

На раскрытии элемента Enter и пробел открывают его, Alt+стрелки двигают (и говорят
позицию строкой состояния), Shift+F10 открывает ⋯. После действия со списком фокус
встаёт на изменившийся элемент, когда хост передал список обратно. У ⋯ имя
«Действия с элементом: <название>», поэтому два элемента не звучат одинаково.
