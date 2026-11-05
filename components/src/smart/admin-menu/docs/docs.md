# sf-admin-menu

Smart-компонент административного меню: дерево разделов, поиск, компактный режим
и настройки видимости и порядка пунктов. Разметка, атрибуты и события описаны на
странице «Административное меню» в ui-doc.

## Сценарии соответствия

Раньше сценарии перечислялись в манифесте. После перехода манифеста на схему v2
они живут здесь: v2 хранит в манифесте только пути к артефактам Studio.

| Сценарий | Экран | Что должно выполняться |
|:---|:---|:---|
| `local-settings` | desktop | `divider-hide-show`, `item-hide-show`, `reorder`, `save-reload-reset`, `identity-scoped-storage`, `storage-failure-keeps-draft` |
| `external-conflict` | desktop | `draft-retained`, `base-revision-emitted`, `conflict-visible`, `refresh-carries-draft`, `localized-error`, `retry-action`, `success-commits-revision`, `system-scope-permission` |
| `nested-content` | desktop | `nested-panels`, `nested-badges-fit`, `scroll-footer-separation`, `inactive-panels-inert`, `forward-back-focus-return`, `localized-logical-direction` |
| `search-navigation` | responsive | `deterministic-ranking`, `disabled-hidden-exclusion`, `native-leaf-link`, `parent-result-drill-down`, `compact-search-focus`, `inline-direction-placement` |
| `mobile-geometry` | mobile | `no-blank-strip`, `popup-inside-viewport`, `compact-toggle` |
| `theme-locale` | desktop | `light-dark`, `ru-en`, `accessible-labels` |

Фикстура Studio — `studio.fixture.json` (`navigation-menu-reference`), дымовой
сценарий — `studio.scenario.json` (`smoke`).

## Интерфейс по стандарту simai.smart-component 1.3.8

Контракт — `component.json`; слова — `lang/en.json` и `lang/ru.json` (словари меню
собираются из них в `js/words.js`); старые имена с датами — `aliases.json`.

### Events

Что человек попросил у хоста через порт `simai.admin-navigation-port`, меню сообщает
глаголом словаря 1.1.5 (§5.1): `detail` — `{kind, …поля словаря, intent, payload}`,
где `intent` и `payload` — намерение порта и его данные как есть.

| Event | Intent порта | kind и поля |
|:---|:---|:---|
| `sf-admin-menu-refresh` | `navigation.load`, `notifications.load` | `navigation` `{reason, site}`, `notifications` |
| `sf-admin-menu-open` | `item.open`, `site.switch`, `view.profile`, `search.choose` | `item` `{id, href}`, `site` `{id}`, `view` `{id}`, `search` `{id, group}` |
| `sf-admin-menu-toggle` | `favourite.toggle` | `favourite` `{id, on}` |
| `sf-admin-menu-save` | `preference.*`, `view.save` | `preference` `{values}`, `view` `{id, revision}` |
| `sf-admin-menu-query` | `sites.search`, `search.query`; поиск меню без порта | `site`, `search` `{query}`; `menu` `{query, requestId}` |
| `sf-admin-menu-create` | `view.create` | `view` |
| `sf-admin-menu-rename` | `view.rename` | `view` `{id, title}` |
| `sf-admin-menu-delete` | `view.delete` | `view` `{ids}` |
| `sf-admin-menu-read` | `notifications.read` | `notifications` `{ids}` |
| `sf-admin-menu-reset` | `view.reset`; сброс настроек меню без порта | `view` `{id}`; `settings` `{target, baseRevision}` |
| `sf-admin-menu-sign-out` | `session.sign-out` | `session` |
| `sf-admin-menu-navigate` | — | хост ответил `applied` на открытие: `{id, key, href, region}` |
| `sf-admin-menu-compact-change` | — | `{compact, source}` |
| `sf-admin-menu-settings-save`, `-settings-refresh`, `-settings-cancel`, `-settings-mode-change` | — | `{target, base_revision, baseRevision, profile}` |

Старые имена работают до 2026-12-01, каждое использование записывается в
`SF.deprecations`: `sf-admin-menu-intent` `{intent, payload}` следует за каждым
событием, у которого есть `intent`; `sf-admin-menu-search` — за `query` с
`kind: menu`; `sf-admin-menu-settings-reset` — за `reset` с `kind: settings`.
`base_revision` остаётся в `detail` рядом с `baseRevision` до той же даты.

### Settings и actions

`recent-results` — настройка (группы недавних результатов панели поиска); прежний
`setRecentResults()` работает до 2026-12-01 и записывается. Порт вручается базовым
действием `connectPort({port})` (`setHostPort` — его прежнее имя); событие
`sf-host-port-request` ещё отправляется до 2026-12-01.

`expected-columns` (1 или 2, по умолчанию 2) — сколько колонок рисует заготовка
меню с `source="port"` на широком экране, пока хост не ответил. Сервер знает,
открыт ли у строки страницы корень: на главной его нет, и меню — одна колонка
(`expected-columns="1"`), в разделе — две. С верным числом меню до ответа такой
же ширины, как после, и страница рядом не сдвигается. Это форма заготовки, а не
ограничение: ответившее меню берёт столько колонок, сколько нужно его строкам.

### Вторая колонка — о том, где человек (1.7.0)

Решение владельца 2026-11-05 после UX-аудита Larena Panel: на экране не больше
двух меню, и второе всегда о том месте, где человек сейчас. Вторая колонка
показывает:

1. меню объекта, который открыт на странице (`context` в ответе хоста), если
   страница его дала;
2. иначе — пункты корня, в котором лежит строка страницы (`navigation.current`);
3. иначе — ничего: колонка закрыта. Чужой корень (открытый на прошлой странице)
   она больше не показывает; память открытого корня по сайтам (`openRoots`)
   удалена.

Корень, на который нажали в первой колонке, показывается во второй, пока
человек не откроет страницу; дальше колонка снова следует за страницей.
Открыта колонка или закрыта — один выбор человека на всех страницах и сайтах
(`SF.Preferences`, ключ `sf-admin-menu/main`, поле `second`), так что меню не
прыгает (правило 2026-10-13 остаётся). Если колонка закрыта, а странице есть
что в ней показать, рядом с кнопкой сворачивания стоит «Показать колонку».

#### Меню объекта: поле ответа `context`

Хост получает адрес страницы в `navigation.load` как `page` (путь и запрос,
без домена) и может ответить меню объекта этой страницы:

```json
{
  "context": {
    "title": "demo-owned.test",
    "subtitle": "PHP 8.3",
    "status": {"text": "Работает", "status": "success"},
    "back": {"label": "Все сайты", "href": "/panel/sites"},
    "groups": [
      {"label": null, "items": [
        {"key": "site.overview", "label": "Обзор", "href": "/panel/sites/demo", "icon": "dashboard"},
        {"key": "site.backups", "label": "Резервные копии", "href": "/panel/sites/demo/backups", "icon": "backup",
         "badge": {"text": "1", "status": "error"}}
      ]},
      {"label": "Дополнительно", "items": [
        {"key": "site.php", "label": "PHP и веб-сервер", "href": "/panel/sites/demo/php", "icon": "code"}
      ]}
    ],
    "current": "site.overview"
  }
}
```

- `status` — строка или `{text, status}` (`info`, `success`, `warning`, `error`);
  `badge` пункта — `{text, status}`.
- Первая колонка оставляет текущим корень страницы (`navigation.current`).
- Пункты — обычные ссылки: средний клик открывает вкладку; обычный клик идёт
  через region navigation, когда она включена, иначе браузер переходит сам.
  Меню сообщает `sf-admin-menu-navigate` `{id, key, href, region}` (у «назад»
  `id` — `sf:context-back`). Намерения порта нет, в избранное пункты не
  предлагаются, в режиме правки меню их нет.
- После мягкой смены содержимого (region navigation) меню снова спрашивает
  `navigation.load` с новым `page`; ответ заменяет `context` или убирает его.
  Хост отвечает `current` той страницы, о которой его спросили.
- На телефоне меню объекта — экран, который открыт по умолчанию: вверху
  «← Все сайты» (`back.label`), рядом с заголовком кнопка «Все разделы» к первой
  колонке.

Поля `page` (в запросе) и `context` (в ответе) — дополнения к порту
`simai.admin-navigation-port` 1.0.0; контракт порта в ui-source их ещё не
перечисляет (его схемы закрыты), их внесёт следующая минорная версия порта.

#### Первый ответ в странице: `first-answer`

Сервер, у которого меню уже есть, печатает первый ответ `navigation.load` в
островке настроек меню, и меню рисуется из него сразу, без заготовки и без
порта; порт, когда хост его подключит, отвечает за ним без состояния загрузки:

```html
<sf-admin-menu source="port" aria-label="Меню">
  <script type="application/json" data-sf-settings>
    {"first-answer": {"revision": "1", "current": "sites", "items": [...], "context": {...},
                      "capabilities": ["notifications", "search"]}}
  </script>
</sf-admin-menu>
```

`capabilities` — возможности порта, известные до порта, чтобы первая отрисовка
была окончательной. До подключения порта пункты страниц — обычные ссылки.
Это та же настройка `first-answer` в островке `data-sf-settings`, что у
`sf-view`.

### CSS variables

Ширина меню публикуется на `:root`, чтобы страница резервировала ровно его коробку
до отрисовки (переменные зарегистрированы как длины: из скрипта читаются в px,
`getComputedStyle(document.documentElement).getPropertyValue('--sf-admin-menu-two-columns-inline-size')`):

| Переменная | Что это | По умолчанию |
|---|---|---|
| `--sf-admin-menu-one-column-inline-size` | меню без открытого раздела (`expected-columns="1"`) | 256px |
| `--sf-admin-menu-two-columns-inline-size` | меню с открытым разделом | 496px |
| `--sf-admin-menu-compact-one-column-inline-size` | свёрнутое меню (рейка) | 56px |
| `--sf-admin-menu-compact-two-columns-inline-size` | рейка с открытым разделом | 296px |

Колонки — ширины из токенов (`--sf-f6`, `--sf-f5`, рейка `--sf-d4`) в любом разделе:
длинные подписи кончаются «…», поле «Найти в разделе» колонку не расширяет.
Ширина, которую человек задал ручкой колонки (её хранит хост — `person.widths` —
или браузер), остаётся его: резерв тогда — эта ширина.


Публичные переменные оболочки навигации; компонент их не задаёт.

| Variable | Default |
|:---|:---|
| `--sf-admin-menu-color` | `var(--sf-on-surface)` |
| `--sf-admin-menu-first-background-color` | `var(--sf-surface-1)` |
| `--sf-admin-menu-second-background-color` | `var(--sf-surface-0)` |
| `--sf-admin-menu-border-color` | `var(--sf-outline-variant)` |
| `--sf-admin-menu-padding` | `var(--sf-a4)` |
