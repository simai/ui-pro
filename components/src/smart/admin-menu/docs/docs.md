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

### CSS variables

Публичные переменные оболочки навигации; компонент их не задаёт.

| Variable | Default |
|:---|:---|
| `--sf-admin-menu-color` | `var(--sf-on-surface)` |
| `--sf-admin-menu-first-background-color` | `var(--sf-surface-1)` |
| `--sf-admin-menu-second-background-color` | `var(--sf-surface-0)` |
| `--sf-admin-menu-border-color` | `var(--sf-outline-variant)` |
| `--sf-admin-menu-padding` | `var(--sf-a4)` |
