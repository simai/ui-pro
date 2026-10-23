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
