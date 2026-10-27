# Smart-компонент `sf-table`

`sf-table` - smart-компонент таблицы для административных интерфейсов. Компонент отвечает за отображение toolbar, тегов фильтра, таблицы, системных колонок, контекстных меню, пагинационной зоны и пользовательских настроек колонок. Данные, сохранение и серверная фильтрация остаются на стороне приложения.

## Быстрый старт

Минимальная разметка:

```html
<sf-table table-settings-key="admin_table"></sf-table>
```

Если пагинация используется отдельно, как в текущей админ-панели, она ставится рядом:

```html
<sf-table table-settings-key="admin_table"></sf-table>

<sf-pagination
  current="1"
  total="10"
  bottom="true"
  show-action-for-all
  page-size="10"
  page-sizes="10,20,30,40"
  show-page-size>
</sf-pagination>
```

Встроенная пагинация внутри `sf-table` по умолчанию выключена. Ее можно включить атрибутом `pagin="true"`.

## Основные атрибуты

- `table-settings-key` - ключ таблицы для загрузки и сохранения настроек, например `admin_table`.
- `selectable` - добавляет системную колонку с checkbox. По умолчанию включено.
- `settings` - добавляет системную колонку настроек строки. По умолчанию включено.
- `actions` - добавляет колонку действий и кнопку «Создать» в панели инструментов. По умолчанию включено.
- `row-actions` - показывает колонку действий строки; `row-actions="false"` убирает только её, кнопка «Создать» остаётся. Нужен, когда действия строки открываются из меню строки (колонка `settings`). По умолчанию включено.
- `pagin` - включает встроенный `sf-pagination`. По умолчанию выключено.
- `filter-text` - текст кнопки фильтра.
- `clear-text` - текст кнопки очистки фильтра.
- `search-placeholder` - placeholder поиска.
- `create-text` - текст кнопки создания.
- `pagination-total` - total для встроенной пагинации.
- `pagination-page-size` - page size для встроенной пагинации.
- `page-sizes` - список размеров страницы, например `10,20,30,40`.
- `context-menu-columns` - количество колонок в контекстных меню настроек.
- `data-state` - состояние данных: `auto`, `loading`, `populated`, `empty` или `error`.
- `loading-text`, `empty-text`, `error-text`, `retry-text` - локализуемые подписи состояний.

В `auto` таблица показывает строки, если они переданы, и пустое состояние — если строк нет. Приложение явно включает `loading` перед запросом и `error` при ошибке; кнопка повторной попытки отправляет `sf-table-retry`. Состояния не выполняют сетевой запрос сами.

## Формат колонок

Колонки передаются через `setColumns(columns)`.

```js
table.setColumns([
  { key: 'id', label: 'ID', width: 'var(--sf-d1)' },
  { key: 'name', label: 'Название', minWidth: 'var(--sf-f2)' },
  { key: 'code', label: 'Код решения' },
  { key: 'version', label: 'Последняя версия' },
  { key: 'author', label: 'Автор' },
]);
```

Основные поля колонки:

- `key` - ключ ячейки в объекте строки.
- `label` - заголовок.
- `visible` - если `false`, колонка скрыта.
- `order` - порядок пользовательских колонок.
- `width` / `colWidth` / `size` - ширина колонки для `colgroup`.
- `minWidth`, `maxWidth` - ограничения ресайза.
- `component` - smart-компонент для заголовка или дефолтной ячейки.
- `rowComponent` - smart-компонент для ячеек строк.
- `renderer` - публичный рендерер значения. Для ссылки используйте `"link"`.
- `sortable` - если `true`, заголовок становится кнопкой сортировки (см. «Сортировка»).

## Два представления на одной странице

Экземпляры изолированы. Идентификаторы ручек изменения ширины содержат
идентификатор экземпляра (`<экземпляр>--column-resizer--<колонка>`),
portal-контейнер помечен `data-sf-instance`, а таблица без `table-settings-key`
и без `id` использует собственный идентификатор экземпляра, а не общий ключ.
Задавайте `id` или `table-settings-key`, если настройки должны переживать
перезагрузку.

Область таблицы объявляет своё состояние данных: на элементе `.sf-table` есть
`data-state` (`loading`, `populated`, `empty`, `error`) и `aria-busy` во время
загрузки. Это контракт, на который можно опираться в тестах и стилях.

Системные колонки `select`, `settings`, `actions` добавляются компонентом автоматически в зависимости от атрибутов `selectable`, `settings`, `actions` и `row-actions`. Их нельзя растянуть или перетащить, и они не попадают в `columnSettings`.

### Сортировка

Колонка с `sortable: true` получает в заголовке кнопку и `aria-sort`. Нажатие по
заголовку переключает направление по кругу: `asc` → `desc` → без сортировки — и
отправляет `sf-table-sort-change` с `{key, direction}` (`direction` равен `null`,
когда сортировка снята). Таблица только отмечает заголовок: строки она не
переставляет, их порядок задаёт приложение, как и остальные серверные параметры.

```js
table.addEventListener('sf-table-sort-change', ({detail}) => {
  loadRows({sort: detail.direction ? [{key: detail.key, direction: detail.direction}] : []});
});
// Показать сортировку из URL без события:
table.setSort('name', 'desc');
```

`getSort()` возвращает текущее `{key, direction}`, `setSort(null, null)` снимает отметку.

## Формат строк

Строки передаются через `setRows(rows)` или добавляются через `addRows(rows)`.

```js
table.setRows([
  {
    id: 1,
    name: 'SIMAI: Бекап файлов',
    code: 'simai.filebackup',
    version: {
      component: {
        type: 'tag',
        props: {
          type: 'success',
          text: 'Success',
          size: '1/2',
        },
      },
    },
    author: {
      component: {
        type: 'avatar',
        props: {
          title: 'Тест Тестович',
          imageUrl: 'https://example.com/avatar.jpg',
          size: 1,
        },
      },
    },
  },
]);
```

Значение ячейки может быть:

- строкой или числом;
- объектом с `component`;
- массивом объектов с `component`, если в одной ячейке нужно несколько компонентов;
- объектом с дополнительными props, которые будут объединены с `component.props`.

Для колонки с `renderer: "link"` значение имеет контракт
`{ text, subtext?, href }`. Относительные ссылки и ссылки HTTP(S) отображаются
как обычный доступный с клавиатуры `<a>`. Пустой адрес и небезопасные схемы
(`javascript:`, `data:` и другие) отображаются как простой текст. Текст и
подпись выводятся через безопасное экранирование Lit.

```js
table.setColumns([
  { key: 'name', label: 'Пользователь', renderer: 'link' },
]);

table.setRows([{
  id: 10,
  name: {
    text: 'Иван Иванов',
    subtext: 'ivan@example.test',
    href: '/admin/users/10/edit',
  },
}]);
```

Пример массива действий:

```js
actions: [
  {
    component: {
      type: 'icon-button',
      props: {
        icon: 'edit',
        type: 'link',
        scheme: 'on-surface',
        ariaLabel: 'Редактировать',
        value: 'edit',
      },
    },
  },
  {
    component: {
      type: 'icon-button',
      props: {
        icon: 'delete',
        type: 'link',
        scheme: 'on-surface',
        ariaLabel: 'Удалить',
        value: 'delete',
      },
    },
  },
]
```

## Методы данных

### `getTableData()`

Возвращает текущий объект данных таблицы: `columns`, `rows`, `columnSettings` и дополнительные поля.

### `setTableData(patch, reason = "data")`

Обновляет часть данных таблицы.

```js
table.setTableData({
  columns,
  rows,
});
```

Можно передать функцию:

```js
table.setTableData((current) => ({
  rows: [...(current.rows || []), ...nextRows],
}));
```

### `setColumns(columns, reason = "columns")`

Полностью заменяет колонки.

### `addColumns(columns)`

Добавляет одну или несколько колонок к текущему списку.

### `updateColumn(columnKey, patch, reason = "columns")`

Меняет свойства одной колонки.

```js
table.updateColumn('code', {
  visible: false,
});
```

### `setRows(rows, reason = "rows")`

Полностью заменяет строки. При установке строк компонент автоматически добавляет системные ячейки для `select`, `settings`, `actions`, если они включены.

### `addRows(rows, reason = "rows")`

Добавляет строки к текущим. Используется для "Показать еще".

### `updateRowsByKey(key, value, patch, reason = "rows")`

Обновляет все строки, у которых `row[key] === value`.

```js
table.updateRowsByKey('id', 10, {
  selected: true,
});
```

### `updateRowByKey(key, value, patch, reason = "row")`

Алиас для обновления строки по ключу.

### `updateRows(patch, reason = "rows")`

Обновляет все строки.

```js
table.updateRows((row) => ({
  ...row,
  selected: true,
}));
```

### `updateRowCell(rowKey, rowValue, cellKey, patch, reason = "cell")`

Обновляет объект конкретной ячейки.

### `updateRowCellProps(rowKey, rowValue, cellKey, props, reason = "cell-props")`

Обновляет `component.props` конкретной ячейки.

```js
table.updateRowCellProps('id', 10, 'select', {
  checked: true,
});
```

## Настройки колонок

Настройки колонок живут отдельно от исходного списка колонок. Это позволяет серверу отдавать стабильные `columns`, а пользовательские настройки хранить отдельно.

Поддерживаемые настройки:

- `order` - порядок колонки;
- `width` / `colWidth` - ширина;
- `visible` - видимость;
- `pinned` - закрепление, если сценарий использует закрепленные элементы.

### `getColumnSettings()`

Возвращает карту настроек колонок.

```js
const settings = table.getColumnSettings();
```

### `getColumnSetting(columnKey)`

Возвращает настройки одной колонки.

### `setColumnSettings(settings, reason = "column-settings", emit = true)`

Полностью задает настройки колонок. Если `emit !== false`, компонент вызовет событие изменения настроек.

```js
table.setColumnSettings({
  code: { order: 10, width: 'var(--sf-f2)' },
  name: { order: 20, visible: true },
});
```

### `patchColumnSettings(columnKey, patch, reason = "column-settings")`

Точечно обновляет настройки одной колонки.

```js
table.patchColumnSettings('code', {
  width: 'var(--sf-g1)',
});
```

### `patchColumnSettingsBatch(patch, reason = "column-settings")`

Обновляет несколько колонок за один рендер.

```js
table.patchColumnSettingsBatch({
  name: { order: 10 },
  code: { order: 20 },
});
```

### `setTableSettings(data, reason = "table-settings-load")`

Загружает настройки таблицы из ответа сервера. Метод нормализует разные формы ответа и применяет `columnSettings` без события сохранения.

```js
table.setTableSettings({
  key: 'admin_table',
  columnSettings: {
    name: { order: 10, width: 'var(--sf-f4)' },
  },
});
```

Метод также понимает ответы вида:

```js
{
  item: {
    key: 'admin_table',
    columnSettings: {}
  }
}
```

и:

```js
{
  tableSettings: {
    admin_table: {
      key: 'admin_table',
      columnSettings: {}
    }
  }
}
```

## Фильтры и шаблоны

Фильтры состоят из двух частей:

- `fields` - доступные поля фильтра;
- `templates` - пользовательские шаблоны фильтра со своими `tags` и `values`.

### `setFilterFields(fields, reason = "filter-fields")`

Задает список доступных полей фильтра.

```js
table.setFilterFields([
  {
    key: 'author',
    label: 'Поставщик',
    filter: {
      enabled: true,
      control: 'entity-multi-select',
      operators: ['in'],
      defaultOperator: 'in',
      optionsSource: {
        type: 'endpoint',
        url: '/api/users/filter-options/author',
      },
      optionSearchKeys: ['title', 'label', 'name'],
    },
  },
  {
    key: 'id',
    label: 'ID',
    filter: {
      enabled: true,
      control: 'number',
      operators: ['eq', 'between', 'gt', 'lt'],
      defaultOperator: 'eq',
    },
  },
]);
```

`optionsSource.type: 'endpoint'` для `multi-select` и `entity-multi-select`
загружает варианты с того же origin при открытии фильтра. Таблица передаёт
`limit=50`, `sequence`, выбранные значения как повторяющиеся
`selected_values[]`, а для следующих страниц — `cursor`. Если ответ содержит
`searchable: true`, поиск отправляет `search`; иначе поиск по неполной странице
не показывается. Ответ должен иметь вид:

```js
{
  status: 'ok',
  sequence: 1, // то же значение, что было в запросе
  items: [{value: 'user-1', label: 'Иван Иванов'}],
  selected: [{value: 'user-99', label: 'Ольга Петрова'}],
  next_cursor: 'cursor-for-next-page', // null для последней страницы
  searchable: false,
}
```

`selected` позволяет показывать подписи выбранных значений, которых нет на
текущей странице. При ошибке ранее загруженные варианты остаются видимыми,
и появляется кнопка повторной загрузки. Запросы к другому origin отклоняются.

Для `multi-select` и `single-select` можно задать вид вариантов через
`filter.optionRenderer`:

- `'avatar-checkbox'` - аватар по `option.imageUrl` или `option.avatarText`;
- `'badge'` - вариант показывается тональной меткой `sf-badge`, как в ячейках.
  Цвет берётся из `option.color`: схема Framework (`success`, `danger`, `info`,
  `warning`, `primary`…) или hex-цвет (`#16a34a`); иконка — из `option.icon`.

```js
filter: {
  control: 'multi-select',
  optionRenderer: 'badge',
  options: [
    {value: 'done', label: 'Готово', color: 'success', icon: 'check'},
    {value: 'cancelled', label: 'Отменено', color: 'danger'},
  ],
}
```

Поддерживаемые controls в текущей реализации:

- `text`;
- `number`;
- `date`;
- `date-range`;
- `range`;
- `multi-select`;
- `single-select`;
- `entity-multi-select`;
- `entity-single-select`.

### `setTemplates(templates)`

Загружает шаблоны фильтра.

```js
table.setTemplates([
  {
    key: 'default',
    label: 'По умолчанию',
    selected: true,
    default: true,
    data: {
      tags: {
        author: {
          label: 'Поставщик',
          active: true,
          control: 'entity-multi-select',
        },
      },
      values: {
        author: {
          operator: 'in',
          values: [1, 2],
        },
      },
    },
  },
]);
```

### `getSelectedFilterTemplate()`

Возвращает текущий выбранный шаблон.

### `getFilterTemplateByKey(key)`

Возвращает шаблон по ключу.

### `getCurrentFilterTags()`

Возвращает теги активного шаблона.

### `getCurrentFilterValues()`

Возвращает значения фильтра активного шаблона.

### `getFilterPayload()`

Возвращает payload для серверной фильтрации:

```js
{
  selectedTemplateKey: 'default',
  values: {},
  tags: {},
}
```

### `removeFilterTag(id = null)`

Удаляет один тег фильтра или очищает все теги, если `id` не передан. После изменения отправляет `sf-table-filter-change`.

### `saveCurrentFilterTemplateData()`

Сохраняет текущие изменения `tags` и `values` в выбранный шаблон и отправляет `sf-table-template-save`.

## События

### `sf-after-render`

Событие базового smart-компонента после рендера. В админке используется один раз для первичной загрузки данных:

```js
table.addEventListener('sf-after-render', async () => {
  const settings = await fetchSettings();
  table.setTemplates(settings.templates || []);
  table.setTableSettings(settings.tableSettings);
  await updateTable();
}, { once: true });
```

### `sf-table-search-change`

Срабатывает после debounce поиска.

`event.detail` - строка поиска.

### `sf-table-filter-change`

Срабатывает после применения фильтра или очистки тегов.

`event.detail` - payload фильтра. Для серверной фильтрации обычно используется `event.detail.values`.

### `sf-table-template-save`

Срабатывает при сохранении шаблона фильтра. `event.detail` может быть одним шаблоном или массивом шаблонов, если изменилось несколько шаблонов. Среди них бывают изменения порядка, закрепления, удаления и флага `selected`; чтобы загрузить выбранный вид, слушайте `sf-table-template-select`.

### `sf-table-template-select`

Срабатывает, когда пользователь выбрал другой шаблон на вкладке «Шаблоны» и нажал «Применить». `event.detail` — `{key}`. Это намерение: приложение загружает сохранённый вид. Вызов `selectFilterTemplate(key)` из кода события не отправляет.

### `sf-table-template-delete`

Срабатывает, когда пользователь удалил сохранённые шаблоны на вкладке
«Шаблоны» и нажал «Применить»: по одному событию на каждый удалённый шаблон,
`event.detail` — `{key}`. Компонент убирает шаблон из своего списка, но
сохранённый вид удаляет приложение.

### `sf-table-create-intent`

Кнопка «Создать» (`create-text`) отправляет `{item: null}`. Если передать пункты через `setCreateItems([{id, name}])`, рядом появится стрелка с меню, и выбор пункта отправит `{item: id}`. Без пунктов стрелки нет. Таблица форму не открывает — это делает приложение.

### `sf-table-sort-change`

Срабатывает по нажатию на заголовок колонки с `sortable: true`. `event.detail` — `{key, direction}`, где `direction` — `asc`, `desc` или `null`. Строки таблица не переставляет.

### `sf-table-column-settings-change`

Срабатывает при изменении пользовательских настроек колонок: resize, reorder, видимость.

`event.detail`:

```js
{
  reason: 'column-resize',
  tableSettingsKey: 'admin_table',
  columnSettings: {
    code: {
      order: 20,
      width: 'var(--sf-f4)',
    },
  },
}
```

Для совместимости пока также отправляются прежние события `onSearchEnd`, `onFilterUpdate`, `onTemplateSave`, `onColumnSettingsChange` и технический `sf-table:column-settings-change`. В новой интеграции используйте только имена `sf-table-*`.

### `sf-table-retry`

Срабатывает по кнопке повторной попытки в состоянии `error`. Событие не содержит сетевого адреса: приложение повторяет собственный безопасный запрос и затем меняет состояние таблицы.

## Действия представления в панели

Кнопка справа от «Создать» открывает меню действий представления. Пункты задаёт
хост; без пунктов кнопки нет:

```js
table.setToolbarActions([
  {id: 'list-settings', label: 'Настройки списка', icon: 'tune'},
  {id: 'removed', label: 'Удалённые элементы', href: '/admin/cms/removed'},
]);

table.addEventListener('sf-table-toolbar-action', (event) => {
  // event.detail = {action, href}
  if (event.detail.action === 'list-settings') {
    event.preventDefault();   // хост сам открывает свой экран
    openListSettings();
  }
});
```

`href` разрешён только для адресов этого же сайта. Если хост не отменил событие,
компонент переходит по `href` сам. Настройки колонок остаются на шестерёнке в
шапке таблицы (`table-settings`), а не здесь.

## Ширина столбца

Ширину тянут за линию между заголовками: вокруг неё невидимая полоса захвата
(`.sf-table-column-resizer`, около 8–12px), курсор `col-resize`, линия по
строкам видна при наведении на полосу и во время перетаскивания и движется
вместе с краем столбца. Полоса — кнопка: с клавиатуры она фокусируется, ←/→
меняют ширину, доступное имя «Изменить ширину столбца: …».

## Перерисовки и стабильность ячеек

Компонент, объявленный в данных (`{type, props}` в колонке, строке или пункте
меню), рендерится директивой: элемент принадлежит своему месту в шаблоне и
переживает перерисовку. Перерисовка пишет в него только то, что изменилось —
атрибут, если значение другое; обработчик, если другая функция; атрибут, которого
в props больше нет, снимается.

Что это значит для хоста:

- состояние и фокус внутри ячейки не теряются при обновлении данных: отмеченная
  строка остаётся отмеченной, фокус остаётся в контроле ячейки;
- полная перезагрузка страницы данных (`query.change`) не пересоздаёт DOM ячеек —
  раньше заменялись все ячейки всех строк, изменившихся и нет;
- обновление одной записи (`view.updateRecord(id, patch)` или ответ хоста
  `data: {records: [record]}`) пишет только её строку.

Если нужен именно отдельный элемент, а не место в шаблоне (портал, измерение,
тест), есть `createSmartElement(type, props)` из `core/js/smart-base`.

## Сброс стилей хоста и `@layer`

Все стили Framework объявлены в слоях (`sf.reset`, `sf.tokens`, `sf.base`,
`sf.utilities`, `sf.components`, `sf.overrides`, `sf.states`). Любое правило
хоста **вне слоёв** перебивает любое правило Framework независимо от
специфичности — так устроен каскад слоёв. Обычный глобальный сброс в админке

```css
* { box-sizing: border-box; }
```

поэтому переопределяет `box-sizing` у внутренних элементов компонентов. На поле
номера страницы это приводило к обрезанному числу, пока ширина считалась от
content box.

Что делать хосту: объявить свой сброс в собственном слое перед слоями
Framework, например

```css
@layer larena-reset, sf.reset, sf.tokens, sf.base, sf.utilities, sf.components, sf.overrides, sf.states;

@layer larena-reset {
  * { box-sizing: border-box; }
}
```

Тогда сброс остаётся сбросом, а компоненты сохраняют свои значения. Framework со
своей стороны не рассчитывает на `box-sizing` там, где от него зависит читаемость:
ширина поля номера страницы считается с учётом внутренних отступов и при любом
`box-sizing` не обрезает число.

## Контекстные меню

Компонент сам рендерит контекстные меню в portal-контейнер:

- `filter-settings` - выбор шаблона и полей фильтра;
- `filter-favorites` - сохранение текущего фильтра как шаблона;
- `tag-settings` - настройка значения конкретного тега фильтра;
- `table-settings` - настройка колонок таблицы;
- `row-settings` - меню строки;
- `create` - пункты кнопки «Создать» из `setCreateItems`;
- `toolbar-actions` - действия представления из `setToolbarActions`;
- submenu для действий шаблона.

Меню привязаны к элементу, который их открыл, через общее позиционирование
Framework (`SF.Position`): у края экрана меню переворачивается на другую сторону
и сдвигается внутрь, при прокрутке следует за своим элементом. Меню строки и
действий шаблона открываются сбоку со стрелкой, остальные — под элементом.

Внешнему коду обычно не нужно напрямую вызывать `renderContextMenu`. Для пользовательских сценариев достаточно слушать события и передавать данные через публичные методы.

## Тип для декларативной раскладки

Таблица объявлена как тип композиции `smart.data-view`. В проекцию типа теперь
попадает всё, что о ней знает манифест:

- **свойства** (`props_schema`) — то, что задаёт документ раскладки: подписи,
  пагинация, `table-settings-key`, `data-state` и прочие атрибуты;
- **данные** (`data_schema`) — то, что присылает приложение: `columns` и `rows`
  по контрактам `contracts.columns` и `contracts.rows`. Структура и данные идут
  разными каналами и обе схемы закрытые;
- **намерения** (`events`) — события, которые поднимает таблица, с их
  содержимым: поиск, фильтр, сортировка, создание, шаблоны (сохранение, выбор,
  удаление), настройки колонок, действия, запрос по контексту, повтор;
- **хранение** (`persistence`) — режим, владелец сети и свойство, в котором
  лежит ключ настроек.

Привязка данных описывается в манифесте компонента:

```json
"declarative": {
  "type": "smart.data-view",
  "data": {"columns": {"contract": "columns"}, "rows": {"contract": "rows"}},
  "events": ["sf-table-sort-change", "sf-table-query-intent"],
  "persistence": {"settings_key_prop": "table-settings-key", "revision_prop": null}
}
```

Если названного контракта в манифесте нет, проекция отказывает с
`composition_data_contract_missing`, а не молча отдаёт пустую схему.

## Сценарии соответствия

Эти сценарии раньше перечислялись в манифесте. С переходом манифеста на схему
v2 они живут здесь: v2 хранит в манифесте только пути к артефактам Studio.
Каждый сценарий — набор утверждений, которые проверяются приёмкой компонента.

| Сценарий | Экран | Что должно выполняться |
|:---|:---|:---|
| `desktop-populated` | desktop | `search-filter-toolbar`, `wide-columns-local-scroll`, `sticky-header`, `row-and-bulk-actions` |
| `server-query` | desktop | `search-intent`, `filter-intent`, `sort-intent`, `access-filtered-response` |
| `preferences` | desktop | `column-resize`, `keyboard-column-resize`, `column-reorder`, `column-visibility`, `delta-save`, `conflict-retains-draft` |
| `pagination` | desktop | `page-change`, `page-size-change`, `show-more-append`, `query-state-preserved` |
| `empty-error` | desktop | `loading`, `empty`, `error`, `retry-intent`, `aria-busy` |
| `mobile-geometry` | mobile | `stacked-controls`, `local-horizontal-scroll`, `no-document-horizontal-overflow`, `overlay-inside-viewport`, `actions-reachable` |
| `theme-locale` | desktop | `light-dark`, `ru-en`, `accessible-labels`, `ltr-rtl` |

Фикстура Studio — `studio.fixture.json` (`reference`), дымовой сценарий —
`studio.scenario.json` (`smoke`).
## Как это связано с админ-панелью

Текущая админ-панель находится в `C:\Applications\SIMAI\Admin`.

### Разметка

В `C:\Applications\SIMAI\Admin\index.html` таблица подключена так:

```html
<sf-table table-settings-key="admin_table"></sf-table>
```

Рядом стоит внешний `sf-pagination`. Поэтому у самой таблицы `pagin` не включен.

### Bootstrap

В `C:\Applications\SIMAI\Admin\src\main.ts` создается `AdminManager`.

Инициализация ждет готовности loader-а:

```js
if (window.SF?.Loader) {
  bootstrapAdmin();
} else {
  window.addEventListener('sf-loader-init', bootstrapAdmin, { once: true });
}
```

Затем менеджер находит таблицу:

```ts
this.table = document.querySelector('sf-table');
```

### Первичная загрузка

После первого рендера таблицы админка загружает настройки:

```ts
this.table.addEventListener('sf-after-render', async () => {
  const key = this.table?.getTableSettingsKey() || 'default';
  const data = await fetchTemplate(key);

  const activeTemplate = this.table
    ?.setTemplates(data.templates || [])
    .getSelectedFilterTemplate?.();

  this.table?.setTableSettings(data.tableSettings);
  this.filters = activeTemplate?.data?.values || {};

  this.updateTable();
}, { once: true });
```

Здесь важно:

- `setTemplates()` загружает шаблоны фильтра;
- `setTableSettings()` применяет сохраненные ширины, порядок и видимость колонок;
- `filters` берутся из выбранного шаблона;
- `updateTable()` загружает строки с сервера.

### Загрузка данных таблицы

`updateTable()` вызывает `fetchMockSolutions()`:

```ts
const { rows, columns, fields, meta, users } = await fetchMockSolutions({
  page,
  limit: this.pageSize,
  search: this.searchText,
  filters: this.filters,
});
```

После ответа:

```ts
this.applyServerColumns(columns);
this.applyServerFilterFields(fields);

if (update) {
  this.table?.addRows(rows);
} else {
  this.table?.setRows(rows);
}
```

Колонки и поля фильтра применяются один раз:

```ts
applyServerColumns(columns) {
  if (this.columnsLoaded || !columns?.length) return;
  this.table?.setColumns(columns);
  this.columnsLoaded = true;
}

applyServerFilterFields(fields) {
  if (this.filterFieldsLoaded || !fields?.length) return;
  this.table?.setFilterFields?.(fields);
  this.filterFieldsLoaded = true;
}
```

Так таблица не перезатирает пользовательский порядок и ширины при каждой загрузке строк.

### Mock API

Mock-сервер находится в `C:\Applications\Mock\server.js`.

Основные endpoints:

- `GET /api/settings/get?tableId=admin_table` - возвращает шаблоны фильтра и настройки таблицы.
- `POST /api/template/save` - сохраняет один или несколько шаблонов фильтра.
- `GET /api/users` - возвращает `columns`, `fields`, `items`, `meta`, `users`.
- `GET /api/users/filter-options/:field` - возвращает options для фильтров.
- `GET /api/table-settings/:tableId` - возвращает настройки таблицы.
- `POST /api/table-settings/:tableId` - сохраняет настройки колонок.

`GET /api/users` принимает:

- `page`;
- `limit`;
- `search`;
- `filters` как JSON-строку.

Пример:

```text
/api/users?page=1&limit=10&search=test&filters={"author":{"operator":"in","values":[1,2]}}
```

### Поиск

Таблица сама управляет input-ом поиска и отправляет `sf-table-search-change`.

Админка слушает событие:

```ts
this.table.addEventListener('sf-table-search-change', async (event) => {
  const e = event as CustomEvent<string>;
  this.searchText = e.detail;
  this.loadedBatchCount = 1;
  await this.updateTable();
});
```

### Фильтры

Когда пользователь применяет фильтр, таблица отправляет `sf-table-filter-change`.

```ts
this.table.addEventListener('sf-table-filter-change', async (event: Event) => {
  const e = event as CustomEvent<{ [key: string]: any }>;
  this.loadedBatchCount = 1;
  this.filters = e.detail.values;
  await this.updateTable();
});
```

Серверная фильтрация находится вне компонента. Таблица только собирает payload и сообщает приложению, что фильтр изменился.

### Сохранение шаблонов

Когда пользователь сохраняет шаблон, таблица отправляет `sf-table-template-save`.

```ts
this.table.addEventListener('sf-table-template-save', async (event: Event) => {
  const e = event as CustomEvent<Record<string, unknown> | Record<string, unknown>[]>;
  await saveTemplate(e.detail);
});
```

В mock это уходит в `POST /api/template/save`.

### Сохранение настроек колонок

Когда пользователь меняет ширину, порядок или видимость колонок, таблица отправляет `sf-table-column-settings-change`.

```ts
this.table.addEventListener('sf-table-column-settings-change', async (event: Event) => {
  const e = event as CustomEvent<{
    columnSettings: any;
    tableSettingsKey: string;
  }>;

  await fetch(`http://localhost:5001/api/table-settings/${e.detail.tableSettingsKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      columnSettings: e.detail.columnSettings,
    }),
  });
});
```

При первичной загрузке используется `setTableSettings(..., emit = false внутри метода)`, поэтому событие сохранения не вызывается повторно.

### Пагинация

В текущей админке пагинация внешняя. После загрузки строк админка обновляет pagination:

```ts
this.pagination?.setState({
  current: page,
  total: meta?.total || 0,
});
```

Обработчики (имена событий `sf-pagination` по стандарту 1.3.8; прежние
`sf-page-change`, `sf-page-size-change` и `sf-show-more` SIMAI Framework ещё
отправляет следом со старым `detail` до 2026-12-01):

- `sf-pagination-change` - загрузить конкретную страницу (`detail.current`);
- `sf-pagination-size-change` - изменить page size (`detail["page-size"]`), сбросить кеш колонок и полей;
- `sf-pagination-load-more` - загрузить следующую страницу и добавить строки через `addRows()`.

## Рекомендуемый pipeline для админки

1. Дождаться `sf-loader-init` или готового `window.SF.Loader`.
2. Найти `sf-table`.
3. Навесить события:
   - `sf-table-template-save`;
   - `sf-table-filter-change`;
   - `sf-table-search-change`;
   - `sf-table-column-settings-change`;
   - `sf-table-retry`.
4. На первом `sf-after-render` загрузить:
   - templates;
   - table settings;
   - первую страницу данных.
5. Один раз применить `setColumns(columns)` и `setFilterFields(fields)`.
6. Для обычной перезагрузки данных использовать `setRows(rows)`.
7. Для "Показать еще" использовать `addRows(rows)`.
8. Для пользовательских настроек колонок хранить только `columnSettings`, а не переписывать исходные `columns`.

## Что пока важно помнить

- `sf-table` не ходит на сервер сам. Все запросы делает приложение.
- `setTableSettings()` нужен для загрузки сохраненных настроек; он не должен вызывать `sf-table-column-settings-change`.
- `setColumns()` лучше не дергать при каждой загрузке строк, иначе можно перезатереть пользовательский порядок и ширины.
- В ячейках лучше передавать smart-компоненты через `{ component: { type, props } }`.
- Для нескольких компонентов в одной ячейке передается массив.
- Фильтры и теги живут в выбранном шаблоне. Поэтому сохранение фильтра - это сохранение шаблона или нескольких шаблонов.
