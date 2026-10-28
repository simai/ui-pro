# sf-chat-window

Окно чата целиком на порте хоста `simai.chat-port` 1.0: список разговоров,
открытый разговор, поле ввода, выбор собеседника и «Мои файлы». Перенесено из
`simai/ui-chat` (решение владельца D31: компоненты живут только в SIMAI Framework
или ui-pro; перенос одобрен 2026-10-27) последним из четырёх компонентов чата.

Окно собрано из частей по тегу: `sf-thread-list` и `sf-message-log` (пакет
`larena`), `sf-chat-composer`, `sf-chat-interlocutor` и `sf-chat-message` (шаги
3–5). Сообщение в ленте рисует `sf-chat-message` (окно ставит его через
`renderMessage` ленты), предложение — его карточка `sf-change-confirm`, что
сказать читателю экрана, решает окно (`announceMessage`). Загрузчик приносит
части сам (`rule.js`).

Окно в сеть не ходит. Хост даёт ему данные и отвечает на его намерения. Права,
деньги, память и доставка остаются у хоста. Окно держит у себя только то, что
видно одной странице: набранный текст по разговорам (в хранилище браузера не
пишется), какой неудачный ответ уже спросили заново, куда уходит фокус, строку
над полем и её «Вернуть».

## Порт и хост

Порт передаётся базовым действием `connect-port {port}` (`setHostPort` — его
старое имя). Порт — объект `{port: 'simai.chat-port', version: '1.0.0',
capabilities, raise(intent, payload)}`; `raise` отвечает на намерение
`{answer, reason, text, data}`, где `answer` — `applied`, `conflict`, `refused`
или `unavailable`. Данные применённого ответа окно применяет как данные.

Контракт — `src/core/contracts/ports/simai.chat-port/1.0.0/port.json` в
ui-source (с 4d711d2, пара `ui-89834691fb9d`), той ревизии, на которой закреплён
`framework.lock.json`. Своя копия контракта в `contracts/`, которую держала
1.0.0, убрана в 1.0.1: пакет закреплён на ui-source 465fbee (пара
`ui-194f75ac620f`), где контракт есть.

Хост без порта (Mirai24 до перевода: `chat-core/ports/mirai24.js` в ui-chat)
слушает события окна и отвечает действием `settle {request-id, result}` или
старым методом `answer(request_id, result)`. Отвечать одним путём: при
подключённом порте окно ответа через `settle` не ждёт.

## Настройки

| Настройка | Тип | По умолчанию | Что делает |
|:---|:---|:---|:---|
| `capabilities` | строка | `""` | Части порта, которые хост поддерживает (`assistant`, `people`, `files`, `edit`, `delete`, `feedback`, `proposals`, `conversation-create`, `conversation-manage`, `interlocutors`, `read`), и свои возможности окна (`x-…`, ниже), через пробел. Возможности подключённого порта добавляются к ним. Чего нет, того окно не предлагает и на его намерение само отвечает `unavailable`. Свойство принимает и массив. |
| `landmark` | `main` \| `section` | `main` | `section` внутри страницы со своим `main`. |
| `heading-level` | `1` \| `2` | `1` | Уровень заголовков окна; `2` внутри чужой страницы. |
| `embedded` | boolean | `false` | Встроено в страницу: высота от контейнера, своя рамка. |

Данные порта — тоже настройки (свойства или JSON-остров сервера): `me`,
`conversations`, `conversation` (`null`, если разговор не открыт), `messages`,
`history`, `feed-state` (`ready`, `loading`, `revoked`), `limits`,
`interlocutors`, `notice`. Свойства есть и под именами порта (`feed_state`), и
под именами настроек (`feedState`). Несколько сразу — действие `set-data {data}`
(старый метод `applyData(partial)` остался).

Свои данные окна: `conversation-list` (`{archived, has_more, loading, query}`),
`composer-files` (фишки файлов у поля в форме файла порта) и `my-files`
(`{files, used_bytes, quota_bytes}` для «Моих файлов»; `download_url` — адрес
хоста, окно его не составляет).

## Свои возможности окна (не порт)

В порте 1.0 для них слов нет; это возможности компонента, хост объявляет их в
`capabilities` и отвечает на них так же, как на намерения порта.

| Возможность | Что включает | Намерение → событие |
|:---|:---|:---|
| `x-archive-view` | архив отдельным списком | `conversations.view` → `open {kind: list}` |
| `x-conversations-paging` | следующая страница списка | `conversations.more` → `load-more {kind: conversations}` |
| `x-conversations-search` | поиск по заголовку над списком (пауза 300 мс, Enter, Esc очищает) | `conversations.search` → `query` |
| `x-conversation-pin` | «Закрепить» / «Открепить» среди действий строки | `conversation.pin` → `pin` |
| `x-early-upload` | файлы загружаются сразу при выборе | `file.attach` → `attach`, `file.detach` → `detach` |
| `x-my-files` | «Мои файлы» под списком, на месте разговора | `files.list` → `open {kind: files}`, `files.remove` → `delete {kind: file}` |
| `x-brief` | уточнение задачи в ответе (API.md v1.2) | ответ уходит обычным `message.send` |

## События

Каждое намерение сначала — событие окна `sf-chat-window-<глагол>` с `detail`
`{request-id, intent, kind, payload}`; `payload` — в полях порта
(`conversation_id`, `client_key` …). Событие отменяемое: страница, отменившая
его, отказывает намерению (`refused`, причина `prevented`), и порт не
спрашивается.

| Событие | Намерения | Было (до 2026-12-01) |
|:---|:---|:---|
| `open` | `conversation.open` (`kind: conversation`), `conversations.view` (`list`), `files.list` (`files`) | `chat-port:open`, `chat-window:view`, `chat-window:files` |
| `load-more` | `history.older` (`history`), `conversations.more` (`conversations`) | `chat-port:older`, `chat-window:more` |
| `submit` | `message.send` | `chat-port:send` |
| `retry` | `message.retry` (`message`), `file.retry` (`file`) | `chat-port:retry`, `chat-port:file-retry` |
| `save` | `message.edit` | `chat-port:edit` |
| `delete` | `message.delete` (`message`), `files.remove` (`file`) | `chat-port:delete`, `chat-window:file-remove` |
| `read`, `rate`, `check`, `stop`, `create`, `rename` | одноимённые намерения порта | `chat-port:<то же>` |
| `answer` | `proposal.decide` | `chat-port:decide` |
| `archive` / `restore` | `conversation.archive` с `archived: true` / `false` | `chat-port:archive` |
| `select` | `interlocutor.choose` | `chat-port:interlocutor` |
| `query`, `pin`, `attach`, `detach` | свои возможности окна | `chat-window:search`, `-pin`, `-attach`, `-detach` |
| `settled` | ответ хоста: `{request-id, intent, payload, answer, reason}` | `sf-chat-window-answer` |

Старые имена приходят следом за новыми с прежним `detail` `{request_id,
...payload}` и отмечаются в `SF.deprecations` (`aliases.json`). `settled`
приходит после применения данных ответа и до того, как окно само на него
отреагирует: по нему страница, например, закрывает боковую панель.

Окно слушает новые имена частей: `sf-thread-list-open`, `-apply`, `-restore`,
`-toggle`, `-load-more`, `-create`, `-rename`, `-archive`;
`sf-message-log-load-more`; `sf-change-confirm-answer`;
`sf-chat-composer-submit`, `-stop`, `-attach`, `-detach`;
`sf-chat-interlocutor-select`; `sf-chat-message-retry`, `-check`, `-rate`,
`-cancel {kind: rate}`, `-toggle {kind: sources}`, `-submit`.

Пока окно не рисует правку, удаление, отметку прочтения и группировку по
авторам: части `edit`, `delete`, `read` и `people` ничего не включают.

## Действия

| Действие | Что делает |
|:---|:---|
| `set-data {data}` | Несколько данных сразу; неизвестные ключи пропускаются. |
| `settle {request-id, result}` | Ответ хоста без порта; `refused unknown-request`, если такого запроса нет. |
| `start-conversation` | «Новый разговор» с кнопки страницы. |
| `open-conversation {id}` | Открыть разговор. |
| `focus-composer` | Фокус в поле (ссылка пропуска страницы). |
| `open-files` / `close-files {focus}` | «Мои файлы» на месте разговора / обратно. |
| `set-list-footer {node}` | Что показать под списком (у Mirai24 — расход). |

`parts` — узлы окна (`shell`, `side`, `sideHead`, `main`, `header`, …): в них
страница добавляет свои кнопки до подключения окна. Классы узлов остались от
0.3 (`chat-shell__*`, `chat-files__*`): по ним страницы ui-chat строят свою
раскладку. Боковую панель прячет и показывает страница
(`chat-shell--side-hidden`, `chat-shell--side-open` на `parts.shell`).

## Пример

```html
<sf-chat-window capabilities="assistant feedback proposals conversation-create"></sf-chat-window>
<script type="module">
  const chat = document.querySelector('sf-chat-window');
  chat.connectPort({
    port: 'simai.chat-port', version: '1.0.0', capabilities: ['conversation-manage'],
    raise: (intent, payload) => host.answer(intent, payload), // {answer, reason, data}
  });
  chat.setData({me, conversations, conversation: null, messages: [], history: {has_older: false}, feed_state: 'ready'});
</script>
```

## Вид

Окно приносит раскладку своих узлов: список сбоку и разговор в колонке чтения,
поиск над списком, заголовок, поле внизу, пустой разговор посередине, «Мои
файлы» на месте разговора, на телефоне — выезжающая панель. Мебель страницы
(ссылка пропуска, затемнение под панелью, кнопки, расход, окно истёкшей сессии)
остаётся у страницы. Открытые переменные: `--sf-chat-window-side-width`,
`--sf-chat-window-side-color`, `--sf-chat-window-width`,
`--sf-chat-window-text-color`, `--sf-chat-window-muted-color`,
`--sf-chat-window-border-color`.

Слова частей для чата («Новое название разговора», «Отменено», «Срок
подтверждения истёк. Попросите подготовить изменение заново.» и др.) окно
регистрирует само, один раз на страницу, на двух языках
(`js/part-words.js`).

## Доступность

Части сохраняют свою клавиатуру: у списка — перемещение стрелками, у поля —
Enter. Куда уходит фокус:
- после нового разговора или смены собеседника — в поле;
- когда закончилось последнее ожидание ответа — обратно в поле, без прокрутки;
- когда исчезло то, что держало фокус (строка ушла в архив), — на «Вернуть»
  над полем, а не на страницу;
- «Мои файлы»: при открытии — на заголовок вида, «Назад» и Esc возвращают в
  поле; «Удалить» спрашивает в строке и ставит фокус на «Отмена», Esc отменяет
  вопрос; после удаления фокус — на строку, вставшую на место удалённой, иначе
  на заголовок.

Строка над полем (`role=status`) не уходит из-под указателя или фокуса;
ошибка — `role=alert` с «Повторить».

## Временное

- Старые имена событий (`chat-port:*`, `chat-window:*`, `sf-chat-window-answer`)
  — до 2026-12-01.
- Классы `chat-shell__*` и `chat-files__*` — до следующей мажорной версии.
