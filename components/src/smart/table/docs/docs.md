# sf-table

Основная документация по работе со smart-компонентом таблицы вынесена в отдельный файл:

- [smart-table-guide.md](smart-table-guide.md)

## С версии 1.10.0 (стандарт simai.smart-component 1.3.8)

- Интерфейс компонента описан в `component.json`, слова — в `lang/ru.json` и `lang/en.json`.
- События называются глаголами словаря: `sf-table-select {ids}`, `sf-table-apply {action, scope, ids, revisions}`,
  `sf-table-save {kind: columns, …}`, `sf-table-create`, `sf-table-query`, `sf-table-refresh`, `sf-table-expand`,
  `sf-table-load-more`, `sf-table-move`. Старые имена (`sf-table-action-intent`, `sf-port-output`,
  `sf-table-column-settings-change`, `onSearchEnd`, `onTemplateSave`, `onFilterUpdate`, `onColumnSettingsChange` и
  другие из `aliases.json`) приходят следом один раз до 2026-12-01 и отмечаются в `SF.deprecations`.
- `sf-table-search-change` несёт `{search}`; `onSearchEnd` по-прежнему получает сам текст.
- Длинный список (от 300 строк) рисует только видимые строки и запас вокруг них; какие строки нарисованы, сообщает
  `sf-table-window {first, last}`. Стрелки, Home и End переходят и к ненарисованной строке.
- Открытая запись отмечается настройкой `current` (`aria-current` у строки).

## Коробка списка до его отрисовки

Чтобы страница держала место списка до того, как он нарисован (без сдвига, когда
приходят строки), таблица публикует свою геометрию на `:root` — из тех же токенов,
которыми рисует строки, без чисел в странице. По одному значению на шаг лестницы
(`size="1/2"` и `size="1"`; в CSS косая черта экранируется: `1\/2`):

| Переменная | Что это | 1/2 | 1 |
|---|---|---|---|
| `--sf-table-row-block-size-<шаг>` | строка в одну строку текста | 45px | 73px |
| `--sf-table-row-2-lines-block-size-<шаг>` | строка, где текст в две строки | 53px | 81px |
| `--sf-table-head-block-size-<шаг>` | строка заголовков | 33px | 57px |
| `--sf-table-toolbar-block-size-<шаг>` | панель (поиск, настройки, выгрузка) в одну строку | 32px | 40px |
| `--sf-table-toolbar-gap` | зазор между панелью и заголовками | 8px | 8px |

Строка — отступы ячейки на шаге, самое высокое в ней (контрол шага — флажок и
меню строки — или текст, одна или две строки) и линия под строкой:
`2 × отступ шага + max(высота контрола шага, N × высота строки текста) + 1px`.
Текст ячеек — текст своего шага (`--sf-text-size-1\/2` и `--sf-text-height-1\/2`
на шаге 1/2, `-1` на шаге 1), а не текст страницы, поэтому значения верны на любой
странице. Числа в таблице — значения при теме по умолчанию; страница читает
переменные, не числа.

Таблица из N строк:

```css
.list-room {
  min-block-size: calc(var(--sf-table-toolbar-block-size-1\/2) + var(--sf-table-toolbar-gap)
    + var(--sf-table-head-block-size-1\/2) + 20 * var(--sf-table-row-block-size-1\/2));
}
```

В `sf-data-view` под таблицей стоит строка страниц, через зазор
`--sf-data-view-gap` (по умолчанию `--sf-space-3`, 24px); её высота — высота
`sf-pagination`, которую Framework пока не публикует.
