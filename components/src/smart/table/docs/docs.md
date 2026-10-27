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
