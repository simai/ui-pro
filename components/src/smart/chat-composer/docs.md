# sf-chat-composer

Поле вопроса и файлов чата. Перенесён из `simai/ui-chat` (решение владельца D31:
компоненты живут только в SIMAI Framework или ui-pro; перенос одобрен 2026-10-27).
Поле — плоский textarea Фреймворка (растёт до восьми строк), рамку и фокус рисует
коробка композера. Файлы композер только проверяет и сообщает о них — загружает их
хост (окно чата) и возвращает чипы настройкой `files`, так что принят ли файл,
решает сервер.

## Что он делает и чего не делает

- **Enter** отправляет, **Shift+Enter** переносит строку, Enter внутри IME-набора не
  отправляет.
- Пока ждётся ответ (`busy`), кнопка «Отправить» становится «Остановить ожидание»;
  Enter с текстом ничего не отправляет, а подсказка под полем объясняет почему.
  «Остановить ожидание» возвращает фокус в поле.
- Отправить нельзя, пока поле пустое и нет готового файла, пока файл загружается,
  при `disabled` и сверх `maxlength`. Тогда кнопка тихая (tonal, on-surface), а не
  выключенная главная.
- После 80 % `maxlength` появляется счётчик знаков; сверх предела рамка и счётчик
  красные.
- Файлы — кнопкой, перетаскиванием или вставкой. Проверка: расширение по `accept`,
  размер по `max-bytes`, число по `max-files` за вычетом уже добавленных. Отказы
  перечисляются под полем (`role="alert"`), принятые уходят в событие `attach`.
- Чипы файлов: имя, размер, ход загрузки, отказ сервера второй строкой, «Убрать
  файл».

Он ничего не загружает и сам себя после отправки не очищает: хост вызывает `clear()`,
когда принял сообщение.

## Подключение

```html
<sf-chat-composer maxlength="4000" attachments accept=".pdf,.docx" max-files="5" max-bytes="10485760"></sf-chat-composer>
```

```js
const composer = document.querySelector('sf-chat-composer');
composer.addEventListener('sf-chat-composer-submit', async (event) => {
  event.preventDefault(); // своё сообщение хост показывает сам
  if (await send(event.detail.text, event.detail['attachment-ids'])) composer.clear();
});
composer.addEventListener('sf-chat-composer-attach', (event) => upload(event.detail.files));
composer.addEventListener('sf-chat-composer-detach', (event) => remove(event.detail.id));
composer.files = [{id: 'att_1', name: 'Договор.pdf', bytes: 48213}];
```

## Настройки и значение

| Имя | Тип | По умолчанию | Что делает |
|:---|:---|:---|:---|
| `placeholder` | строка | «Спросите что-нибудь» | Подсказка в пустом поле. |
| `maxlength` | число | `4000` | Предел длины (`bootstrap.limits.message_chars`). |
| `max-files` | число | `5` | Сколько файлов можно добавить. |
| `max-bytes` | число | `0` | Предел размера файла; `0` — без проверки. |
| `accept` | строка | `""` | Расширения через запятую: `.pdf,.docx`. |
| `attachments` | boolean | `false` | Можно ли добавлять файлы. |
| `busy` | boolean | `false` | Ждётся ответ. |
| `disabled` | boolean | `false` | Писать нельзя (например, нет согласия). |
| `files` | список (свойство) | `[]` | Чипы: `[{id, localId, name, bytes, progress, error}]`; `progress` 0..1 при загрузке, `error` — отказ сервера. |
| `value` | строка | `""` | Текст поля (черновик). Атрибут даёт начальный текст, свойство читает и пишет поле; запись — как будто набрали. |

## Действия

Каждое отвечает исходом (`{outcome: 'applied'}`).

| Действие | Что делает |
|:---|:---|
| `setFiles(files)` (`set-files`) | То же, что свойство `files`; вызов версии 0.3 работает как был. |
| `clear()` | Очищает поле и предупреждение. |

`focus(options)` — фокус Smart base, передаётся полю.

## События

Все всплывают, проходят границу shadow DOM и отменяемы.

| Событие | `detail` | Когда |
|:---|:---|:---|
| `sf-chat-composer-submit` | `{text, attachment-ids}` | Отправка (глагол `submit`). Отменили — предупреждение остаётся. |
| `sf-chat-composer-stop` | `{}` | «Остановить ожидание» (`stop` словаря чата). |
| `sf-chat-composer-attach` | `{files, rejected}` | Добавлены файлы; `rejected` — `[{file, reason}]`. |
| `sf-chat-composer-detach` | `{id, name}` | «Убрать файл» на чипе. |

Старые имена ui-chat 0.3 приходят вместе с новыми до 2026-12-01 (`aliases.json`),
каждое использование отмечается в `SF.deprecations`, отмена общая:

| Старое | Новое | `detail` старого |
|:---|:---|:---|
| `sf-chat-send` | `sf-chat-composer-submit` | `{text, attachmentIds}` |
| `sf-chat-stop` | `sf-chat-composer-stop` | тот же |
| `sf-chat-files` | `sf-chat-composer-attach` | тот же |
| `sf-chat-action` | `sf-chat-composer-detach` | `{action: 'remove-attachment', id, name}` |

## Доступность

Корень — `form`. У поля есть имя «Сообщение»; его описывает счётчик знаков. Живая
строка (`sr-only`) говорит только о переходе порога, не о каждой клавише. Отказ по
файлам — `role="alert"`, отказ сервера в чипе — тоже. Подсказка под полем —
`aria-live="polite"`. Кольцо фокуса рисует коробка, только для клавиатуры; страница,
которая отмечает ввод указателем (`data-chat-input="pointer"`), после щелчка получает
тёмную рамку вместо кольца. На сенсорном экране кнопки 44 px, подсказка про Enter
скрыта.

## Вид

Открытые переменные (задаются на элементе или выше, компонент их не ставит):

| Переменная | Что | По умолчанию |
|:---|:---|:---|
| `--sf-chat-composer-background-color` | фон коробки | `--sf-elevation-1--surface` |
| `--sf-chat-composer-border-color` | рамка коробки | `--sf-outline` |
| `--sf-chat-composer-hint-color` | подсказка, счётчик, размер файла | `--sf-on-surface-variant` |
| `--sf-chat-composer-height` | высота кнопок и строки | `--sf-ui-1--control-height`, под пальцем `--sf-ui-2--control-height` |

Чипы файлов — классы `sf-chat-attachment…` семейства чата, те же, что в ui-chat.

## Начальный вид

Поздних данных нет: чипы, черновик и `busy` приходят вместе с состоянием хоста.
Начальный вид — коробка с полем и кнопками, снимки в `static/` снимает
`scripts/run-first-paint.mjs snapshot`. Элемент не читает часы.

Фикстура Studio — `studio.fixture.json`, дымовой сценарий — `studio.scenario.json`
(чип передаётся вызовом `setFiles`). Проверки по манифесту — `probe.json`.
