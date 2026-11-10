// The resources of the C31 list probes (tests/browser/table-resource-*):
// four sites with a status, a domain and kind, two facts and five actions.
export const COLUMNS = [
  {key: 'state', label: 'Состояние', list: 'status', options: [
    {value: 'ok', label: 'Работает'}, {value: 'warning', label: 'Есть замечания'}, {value: 'stopped', label: 'Остановлен'}]},
  {key: 'name', label: 'Сайт', role: 'title', list: 'title'},
  {key: 'domain', label: 'Домен', list: 'supporting'},
  {key: 'kind', label: 'Тип', list: 'supporting'},
  {key: 'ssl', label: 'SSL', list: 'fact'},
  {key: 'backup', label: 'Резервная копия', list: 'fact'},
  {key: 'owner', label: 'Владелец'},
];
const fine = (text, tip) => ({text, tip});
export const ROWS = [
  {id: 'simai', state: 'ok', name: 'SIMAI — сайт компании', domain: 'simai.ru', kind: 'Bitrix', ssl: fine('SSL', 'Сертификат действует ещё 84 дня'), backup: fine('Копия · 2 ч'), owner: 'Анна'},
  {id: 'shop', state: 'warning', name: 'Интернет-магазин', domain: 'shop.simai.ru', kind: 'Laravel', ssl: {text: 'SSL · 6 дн', status: 'warning', tip: 'Сертификат истекает через 6 дней'}, backup: fine('Копия · 5 ч'), owner: 'Борис'},
  {id: 'demo', state: 'stopped', name: 'Демо Larena', domain: 'demo.larena.ru', kind: 'Laravel', ssl: fine('SSL'), backup: {text: 'Копия · 12 дн', status: 'warning'}, owner: 'Анна'},
  {id: 'clinic', state: 'warning', name: 'Клиника «Здоровье»', domain: 'zdorovie-clinic.ru', kind: 'Bitrix', ssl: {text: 'SSL истёк', status: 'error'}, backup: {text: 'Нет копий', status: 'warning'}, owner: 'Вера'},
].map((row) => ({...row, actions: ['view', 'visit', 'restart', 'backup', 'delete']}));
export const ACTIONS = [
  {id: 'view', name: 'Открыть карточку', component: {type: 'button-icon', props: {icon: 'description'}}},
  {id: 'visit', name: 'Открыть сайт', component: {type: 'button-icon', props: {icon: 'open_in_new'}}},
  {id: 'restart', name: 'Перезапустить', component: {type: 'button-icon', props: {icon: 'restart_alt'}}},
  {id: 'backup', name: 'Сделать копию', component: {type: 'button-icon', props: {icon: 'backup'}}},
  {id: 'delete', name: 'Удалить сайт', danger: true, component: {type: 'button-icon', props: {icon: 'delete'}}},
];
