import {html, nothing} from "lit";
import {keyed} from "lit/directives/keyed.js";
import {repeat} from "lit/directives/repeat.js";
import {ref} from "lit/directives/ref.js";
import {isTemplateResult} from "lit/directive-helpers.js";
import "./default.css";
import {normalizeTableLinkCell} from "./link-cell-contract.js";

function getEventInputValue(event, fallback = '') {
    const pathTarget = event?.composedPath?.()?.[0];
    const candidates = [pathTarget, event?.target, event?.currentTarget];

    for (const candidate of candidates) {
        if (!candidate) continue;

        if (typeof candidate.value !== 'undefined') {
            return candidate.value;
        }

        const input = candidate.querySelector?.('input, textarea');
        if (input && typeof input.value !== 'undefined') {
            return input.value;
        }
    }

    return fallback;
}

// The toolbar of the compact list: one line, the search taking the room and the
// filter and create as icons beside it -- the table's toolbar wrapped to three
// lines on a phone and took a quarter of the screen. Active filters follow as a
// row of chips that scrolls sideways, each removable, and the filter itself
// opens as a sheet over the whole screen.
function renderListToolbar(context) {
    const {state} = context.component;
    const {value} = state.search;
    const filterTags = context.component.getCurrentFilterTags();
    const filterValues = context.component.getCurrentFilterValues();
    const active = Object.entries(filterTags || {}).filter(([, tag]) => tag?.active !== false);
    return html`
        <div class="sf-table-toolbar sf-table-toolbar--list flex flex-col gap-1/3 flex-none"
             data-sf-filter-tags="${active.length ? '1' : '0'}">
            <div class="flex items-cross-center gap-1/3 min-w-0">
                <sf-input
                        size=${context.size}
                        root-class="sf-search-input flex-1 min-w-0"
                        appearance="bordered"
                        value="${value}"
                        placeholder=${context.searchPlaceholder}
                        name="sf_table_search"
                        aria-label=${context.searchPlaceholder}
                        @input=${(e) => context.component.searchChange({value: getEventInputValue(e, value)})}
                        @keydown=${(e) => context.component.handleSearchKeyDown(e)}
                        @keyup=${(e) => context.component.handleSearchKeyUp(e)}
                        hint-icon="search"
                ></sf-input>
                ${context.component.offersFilter(active.length) ? html`<span class="sf-table-list-filter">
                    <sf-icon-button
                            size=${context.size}
                            appearance=${active.length ? 'default' : 'outline'}
                            scheme="primary"
                            icon="filter_list"
                            aria-label=${active.length
                                ? context.component.text('listFilterLabel').replace('{count}', String(active.length))
                                : context.filterText}
                            @click=${(e) => context.component.openContextMenu(e, {type: 'bottom', menu: 'filter-settings'})}
                    ></sf-icon-button>
                    ${active.length ? html`<span class="sf-table-list-filter-count" aria-hidden="true">${active.length}</span>` : nothing}
                </span>` : nothing}
                ${context.component.getColumns().some((column) => column?.sortable && !column.system) ? html`
                    <sf-icon-button
                            size=${context.size}
                            appearance=${state.sort?.key ? 'default' : 'outline'}
                            scheme=${state.sort?.key ? 'primary' : 'on-surface'}
                            icon="swap_vert"
                            aria-label=${context.component.text('sortLabel')}
                            aria-haspopup="menu"
                            @click=${(e) => context.component.openContextMenu(e, {type: 'bottom', menu: 'list-sort'})}
                    ></sf-icon-button>` : nothing}
                ${context.actions && context.creatable ? html`
                    <sf-icon-button
                            size=${context.size}
                            appearance="outline"
                            scheme="on-surface"
                            icon="add"
                            aria-label=${context.createText}
                            @click=${(e) => (state.createItems?.length
                                ? context.component.openContextMenu(e, {type: 'bottom', menu: 'create'})
                                : context.component.requestCreateIntent(null))}
                    ></sf-icon-button>` : nothing}
            </div>
            ${active.length ? html`
                <div class="sf-table-list-tags flex items-cross-center gap-1/3">
                    ${active.map(([k, tag]) => {
                        const filterValue = filterValues?.[k] || {};
                        const count = Array.isArray(filterValue.values) ? filterValue.values.length : tag.count || '';
                        return html`
                            <sf-tag type="default" size=${context.size} text='${tag.label}' interactive closable :key=${k}
                                    root-class="active" count='${count}'
                                    @close="${() => context.component.removeFilterTag(k)}"
                                    @click=${(e) => context.component.openContextMenu(e, {type: 'bottom', menu: 'tag-settings', fieldKey: k, anchorSelector: '.sf-tag'})}
                            ></sf-tag>`;
                    })}
                    <sf-button size=${context.size} appearance="link" scheme="on-surface" text=${context.clearText}
                               @click="${() => context.component.removeFilterTag()}"></sf-button>
                </div>` : nothing}
        </div>
    `;
}

function renderToolbar(context) {
    const {state} = context.component;
    const {value} = state.search;
    const filterTags = context.component.getCurrentFilterTags();
    const filterValues = context.component.getCurrentFilterValues();
    const hasUnsavedFilterDataChanges =
        context.component.hasUnsavedFilterDataChanges();
    const activeFilterTags = Object.entries(filterTags || {}).filter(
        ([, tag]) => tag?.active !== false,
    );
    return html`
        <div
                class="sf-table-toolbar flex gap-1/2 content-main-between flex-none"
                data-sf-filter-tags="${activeFilterTags.length ? '1' : '0'}"
        >
            <div class="sf-table-toolbar-start flex items-cross-center gap-1/3 flex-wrap min-w-0">
                ${context.component.offersFilter(activeFilterTags.length) ? html`<div class="flex items-cross-center">
                    <sf-button
                            size=${context.size}
                            appearance="default"
                            scheme="primary"
                            text=${context.filterText}
                            segment=${context.filterTemplates ? 'start' : nothing}
                            icon-start="filter_list"
                            @click=${(e) => {
                                context.component.openContextMenu(e, {
                                    type: 'bottom',
                                    menu: 'filter-settings',
                                })
                            }}
                    ></sf-button>
                    ${context.filterTemplates ? html`
                    <sf-icon-button
                            size=${context.size}
                            appearance="default"
                            scheme="primary"
                            aria-label="Сохранить шаблон фильтра"
                            ?disabled=${!activeFilterTags.length}
                            segment="end"
                            icon="bookmark_add"
                            @click=${(e) => {
                                context.component.openContextMenu(e, {
                                    type: 'bottom',
                                    menu: 'filter-favorites',
                                    parent: true
                                })
                            }}
                    ></sf-icon-button>` : nothing}
                </div>` : nothing}
                ${activeFilterTags.map(([k, tag]) => {
                    const filterValue = filterValues?.[k] || {};
                    const hasFilteredValues = Object.prototype.hasOwnProperty.call(
                            filterValues || {},
                            k,
                    );
                    const count = Array.isArray(filterValue.values)
                            ? filterValue.values.length
                            : tag.count || '';

                    return html`
                        <div class="sf-table-tags">
                            <sf-tag
                                    type="default"
                                    size=${context.size}
                                    text='${tag.label}'
                                    interactive
                                    closable
                                    :key=${k}
                                    root-class="${hasFilteredValues ? 'active' : ''}"
                                    @close="${() => {
                                        context.component.removeFilterTag(k);
                                    }}"
                                    @click=${(e) => {
                                        context.component.openContextMenu(e, {
                                            type: 'bottom',
                                            menu: 'tag-settings',
                                            fieldKey: k,
                                            anchorSelector: '.sf-tag',
                                        })
                                    }}
                                    count='${count}'
                            ></sf-tag>
                        </div>`
                })}
                ${activeFilterTags.length || hasUnsavedFilterDataChanges ? html`
                    ${hasUnsavedFilterDataChanges ? html`
                        <sf-button
                                size=${context.size}
                                appearance="default"
                                scheme="primary"
                                text="Сохранить"
                                @click="${() => context.component.saveCurrentFilterTemplateData()}"
                        ></sf-button>
                    ` : nothing}
                    ${activeFilterTags.length ? html`
                        <sf-button
                                size=${context.size}
                                appearance="outline"
                                scheme="on-surface"
                                text=${context.clearText}
                                @click="${() => context.component.removeFilterTag()}"
                        ></sf-button>
                    ` : nothing}
                ` : nothing}
            </div>

            <div class="sf-table-toolbar-end flex items-cross-center gap-1/3 flex-wrap flex-auto min-w-0">
                <sf-input
                        size=${context.size}
                        root-class="sf-search-input m-inline-start-auto"
                        appearance="bordered"
                        value="${value}"
                        placeholder=${context.searchPlaceholder}
                        name="sf_table_search"
                        @input=${(e) => {
                            context.component.searchChange({
                                value: getEventInputValue(e, value)
                            });
                        }}
                        @keydown=${(e) => {
                            context.component.handleSearchKeyDown(e);
                        }}
                        @keyup=${(e) => {
                            context.component.handleSearchKeyUp(e);
                        }}
                        hint-icon="search"
                >
          <span slot="right">
                <sf-icon-button
                        size=${context.size}
                        appearance="link"
                        scheme="on-surface"
                        icon=${value.length ? 'close' : 'search'}
                        aria-label=${value.length ? 'Очистить поиск' : 'Поиск'}
                        @click=${(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!value.length) return false;
                            context.component.updateSearchState({
                                value: '',
                            });
                        }}
                ></sf-icon-button>
            
          </span>
                </sf-input>

                ${context.actions && context.creatable
                        ? html`
                            <div class="flex items-cross-center">
                                <sf-button
                                        size=${context.size}
                                        appearance="outline"
                                        scheme="on-surface"
                                        text=${context.createText}
                                        segment=${state.createItems?.length ? 'start' : nothing}
                                        @click=${() => context.component.requestCreateIntent(null)}
                                ></sf-button>
                                ${state.createItems?.length ? html`
                                    <sf-icon-button
                                            size=${context.size}
                                            appearance="outline"
                                            scheme="primary"
                                            segment="end"
                                            icon="keyboard_arrow_down"
                                            aria-label="Дополнительные действия создания"
                                            aria-haspopup="menu"
                                            @click=${(e) => {
                                                context.component.openContextMenu(e, {
                                                    type: 'bottom',
                                                    menu: 'create',
                                                });
                                            }}
                                    ></sf-icon-button>
                                ` : nothing}
                            </div>
                        `
                        : nothing}

                <!-- The extra actions of the view, from the host. Column
                     settings are not here: they are the gear in the table's own
                     head, where they have always been. Without actions there is
                     no control, because an empty menu is a dead end. -->
                ${context.settings && state.toolbarActions?.length
                        ? html`
                            <sf-icon-button
                                    size=${context.size}
                                    appearance="outline"
                                    scheme="primary"
                                    icon="more_vert"
                                    aria-label="Действия с представлением"
                                    aria-haspopup="menu"
                                    @click=${e => {
                                        context.component.openContextMenu(e, { menu: 'toolbar-actions' });
                                    }}
                            ></sf-icon-button>
                        `
                        : nothing}
            </div>
        </div>
    `;
}


// The state the region is actually in: the author's data-state, or what the
// rows resolve to. It is declared on the region, not guessed from the markup.
// What the table says when it has no rows, one brick for every reason
// (owner, 2026-10-14): sf-empty-state at the table's size, the reason and its
// one action from what the table and its data view know -- no access, could
// not load (Повторить), nothing found (what the reset clears), no data
// (Создать when the table may create). A slot `empty` replaces it whole.
function renderEmptyState(context, dataState) {
    const component = context.component;
    if (component?.hasSlotContent?.('empty')) return component.getSlotContent('empty');
    const brick = component.emptyBrick(dataState);
    return html`<sf-empty-state kind=${brick.kind} size=${brick.size} heading-level=${brick.headingLevel}
                                title=${brick.title || nothing} text=${brick.text || nothing} live=${brick.live || nothing}
                                .actions=${brick.actions}></sf-empty-state>`;
}

export function resolvedDataState(context) {
    if (context.dataState !== 'auto') return context.dataState;
    const data = context.component?.getTableData?.() ?? {};
    if ((data.rows || []).length) return 'populated';
    // Nothing given yet -- no columns, no rows -- is a table waiting for its
    // first answer, drawn as its skeleton: «Пока ничего нет» stood there
    // before any answer came (owner, 2026-10-15, frame by frame).
    if (!(data.columns || []).length) return 'loading';
    return 'empty';
}

function renderHeadLabel(context, column) {
    // The actions column is as wide as its icons, and its heading broke in two
    // over them («Дей / ствия»): it is named for assistive technology only.
    if (column.key === 'actions' && !column.component) {
        return html`<span class="sf-table-visually-hidden">${column.label}</span>`;
    }
    // The gear opens the column settings; without them (settings-menu="false",
    // a host that saves no personal settings) the column keeps its row menus and
    // its heading is only a name.
    if (column.key === 'settings' && context.settingsMenu === false) {
        return html`<span class="sf-table-visually-hidden">${context.component.text('settingsColumnLabel')}</span>`;
    }
    const content = column.component
        ? context.component.renderSmartElement(column.component.type, column.component.props)
        : column.label;
    if (column.sortable !== true || column.system) {
        return content;
    }
    const sort = context.component.state.sort || {};
    const direction = sort.key === column.key ? sort.direction : null;
    const icon = direction === 'asc' ? 'arrow_upward' : direction === 'desc' ? 'arrow_downward' : 'unfold_more';

    return html`
        <button type="button" class="sf-table-sort-button flex items-cross-center gap-1/4 min-w-0"
                data-direction=${direction || nothing}>
            <span class="truncate">${content}</span>
            <i class="sf-icon sf-table-sort-icon" aria-hidden="true">${icon}</i>
        </button>
    `;
}

function ariaSort(context, column) {
    if (column.sortable !== true || column.system) return nothing;
    const sort = context.component.state.sort || {};
    if (sort.key !== column.key) return 'none';
    return sort.direction === 'asc' ? 'ascending' : 'descending';
}

function renderHead(context) {
    if (context.component?.hasSlotContent?.("head")) {
        return context.component.getSlotContent("head");
    }
    const columns = context.component?.getColumns?.() || [];

    return html`
        <thead class="sticky top-0 z-5">
        <tr>
            ${columns.map((column, k) => {
                        return keyed(`head:${column.key}`, html`
                            <th
                                    class="relative"
                                    data-key="${column.key}"
                                    data-label="${column.label || column.key || ''}"
                                    data-sf-pinned=${context.component.isPinnedColumn(column) ? '' : nothing}
                                    style=${context.component.getStickyCellStyle(columns, k) || nothing}
                                    aria-sort=${ariaSort(context, column)}
                                    @click=${column.sortable === true
                                            ? (event) => context.component.handleHeaderSortClick(event, column)
                                            : nothing}
                            >
                                ${column.system || k === columns.length - 1 ?
                                        renderHeadLabel(context, column) :
                                html`<div
                                        class="sidebar-resizer flex items-cross-center h-full select-none"
                                >
                                    ${renderHeadLabel(context, column)}
                                    <!-- The width is taken by the line between
                                         two headers. There is no handle to find
                                         first: this is the line's own hit strip,
                                         invisible, astride the separator, and
                                         still a button, so the keyboard keeps
                                         the name and the arrows it had. -->
                                    <button type="button"
                                            role="separator"
                                            aria-orientation="vertical"
                                            class="sf-table-column-resizer"
                                            id=${context.component.getColumnResizerId(column.key)}
                                            data-sf-column-resizer=${column.key}
                                            aria-label="Изменить ширину столбца: ${column.label || column.key}"
                                            aria-keyshortcuts="ArrowLeft ArrowRight Home End Enter"
                                    ></button>
                                </div>`}
                            </th>`
                        )
                    }
            )}
        </tr>
        </thead>
    `
}

function toColumnSize(value) {
    if (value === null || typeof value === "undefined" || value === "") {
        return "";
    }

    return typeof value === "number" ? `${value}px` : String(value);
}

// How narrow a data column may become before it stops being readable.
//
// A fixed-layout table divides whatever room it has between its columns and
// will divide it to nothing: at 620px with five columns they came out 61px
// each, which shreds «Код решения» over three lines and cannot hold a date at
// all. The consumer asked for a floor and for the table to scroll instead
// (Larena, 2026-10-06; measured on the admin reference, 2026-10-09).
//
// It is the table's own min-width rather than the columns', because
// `table-layout: fixed` ignores a minimum on a cell -- the widths come from
// the first row. So the floor is summed here and the table carries the total;
// the scroll box around it already scrolls, and starts doing so the moment the
// sum does not fit.
//
// System columns are not in it: select, settings and actions are sized for what
// they hold and are not text anyone reads.
// Field types whose values are prose rather than a name or a code: drawn on one
// line in a row (see renderCellValue).
const LONG_TEXT_TYPES = new Set(['text', 'textarea', 'markdown', 'html']);

const SYSTEM_COLUMNS = new Set(['select', 'settings', 'actions']);

// The first load draws the rows it is waiting for, in the Framework's skeleton
// (owner, 2026-10-12): the shape of the list is on screen before its records,
// instead of one spinner in an empty table. Widths vary by row and column so
// the placeholder reads as text, not as a grid of bars. The words are for a
// reader and stay in a status; the bars are hidden from one.
const SKELETON_ROWS = 6;
const SKELETON_WIDTHS = ['w-3/4', 'w-1/2', 'w-2/3', 'w-1/3', 'w-2/5', 'w-3/5'];
// Where a loaded row has a box, a menu or a gear, a loading row keeps a block
// as tall as that control, so the row is as tall before the data as after it
// (owner, 2026-10-14: the rows jumped when the data came).
const skeletonControl = html`<div class="sf-table-skeleton-control" aria-hidden="true"></div>`;
const skeletonBar = (row, column) => html`<div class="sf-skeleton sf-skeleton--animation-pulse" aria-hidden="true">
    <div class="sf-skeleton-text sf-skeleton-text--size-1/2 ${SKELETON_WIDTHS[(row + column * 2) % SKELETON_WIDTHS.length]}"></div>
</div>`;

// The floor is the component's measurement, not a declaration here: it is
// applied to a column only while there is not room for every column to be
// readable. Written always it would be the width rather than a minimum -- a
// cell that needs more would wrap and a typed row would grow, measured at 81px
// against 57 (owner, 2026-10-09).

// A column's width, floor and cap as its <col> style: the template draws it,
// and the table writes it straight onto the <col> after measuring its content,
// rather than rendering itself again for it (owner, 2026-10-15: a sort was five
// renders of four hundred elements).
export function columnStyle(component, column) {
    const width = toColumnSize(column.colWidth ?? column.width ?? column.size)
            || (column.key === 'actions' ? (component?.actionsColumnWidth || 'var(--sf-table--actions-column-width, var(--sf-f0))') : '')
            || component?.contentWidth?.(column)
            || (component?.columnsAreCramped
                    && component?.columnTakesFloor?.(column)
                ? 'var(--sf-table--column-min-inline-size)'
                : '');
    const minWidth = toColumnSize(column.min_width ?? column.minWidth);
    const maxWidth = toColumnSize(column.maxWidth);
    return [
        width ? `width: ${width}` : "",
        minWidth ? `min-width: ${minWidth}` : "",
        maxWidth ? `max-width: ${maxWidth}` : "",
    ].filter(Boolean).join("; ");
}

function renderColgroup(context) {
    const columns = context.component?.getColumns?.() || [];

    if (!columns.length) {
        return nothing;
    }

    return html`
        <colgroup>
            ${columns.map((column) => {
                // In a fixed layout the column widths come from here, and a
                // column with none is given whatever is left -- divided to
                // nothing when there is little. The floor is written as the
                // width: fixed layout shares any surplus between the columns
                // that have one, so they grow together above it and stop
                // shrinking below it, and the scroll box takes over.
                // `||` and not `??`: toColumnSize answers with an empty string
                // for a column nobody sized, and an empty string is neither
                // null nor undefined. The same shape cost sf-button its icon
                // shortcut for as long as that component existed.
                // The actions column is sized for its buttons. Without a width it
                // took whatever room was left -- a thousand pixels on a wide
                // page -- and the data columns were measured as cramped beside
                // it and held at their floor.
                const style = columnStyle(context.component, column);

                return keyed(`col:${column.key}`, html`
                    <col
                            data-key=${column.key || nothing}
                            style=${style || nothing}
                    />
                `);
            })}
        </colgroup>
    `;
}

// Several values in a cell -- tags for each choice, badges for each language --
// stay on one line: what does not fit folds into «+N», whose title names the
// rest (owner, 2026-10-13). Wrapped, three tags made a row three lines tall in
// a list of one-line rows. The folded values stay in the text, visually hidden,
// so a screen reader still reads them all; the table's afterRender does the
// folding (fitCellValues), because only the laid-out row knows what fits.
function renderCellValues(items, owner) {
    return html`
        <div class="sf-table-cell-values flex items-cross-center gap-1/3">
            ${items.map((item) => renderCellItem(item, owner))}
            <span class="sf-table-cell-more" aria-hidden="true" hidden></span>
        </div>
    `;
}

function renderComponent(component, owner) {
    if (!component?.type) {
        return nothing;
    }
    const props = {...(component.props || {})};
    return owner.renderCellElement ? owner.renderCellElement(component.type, props) : owner.renderSmartElement(component.type, props);
}

function renderCellItem(item, owner) {
    if (item === null || typeof item === "undefined") {
        return nothing;
    }

    // What the shared renderer set answers with is markup, not a descriptor.
    // Nine of its eleven cell renderers happen to answer with a descriptor --
    // a badge, a tag, an avatar, a reference link -- and the two that answer
    // with markup, the colour and the included block, fell through the object
    // branch below and were dropped: every colour cell and every code cell in
    // every table drew nothing at all. A unit calling the renderer saw correct
    // markup, so only a table could show it (admin polygon, 2026-10-10).
    if (isTemplateResult(item)) {
        return item;
    }

    if (typeof item === "object") {
        const {
            component,
            props: itemProps,
            ...itemMeta
        } = item;

        if (!component?.type) {
            return nothing;
        }

        return renderComponent({
            ...component,
            props: {
                ...itemMeta,
                ...(itemProps || {}),
                ...(component.props || {}),
            },
        }, owner);
    }

    return item;
}

function renderLinkCell(value) {
    const cell = normalizeTableLinkCell(value);
    if (!cell) {
        return nothing;
    }

    const content = html`
        <span class="sf-table-link-cell-content flex flex-col min-w-0">
            <span class="sf-table-link-cell-text">${cell.text}</span>
            ${cell.subtext === null ? nothing : html`
                <span class="sf-table-link-cell-subtext sf-text-1/2">${cell.subtext}</span>
            `}
        </span>
    `;

    return cell.href
        ? html`<a class="sf-table-link-cell" href=${cell.href}>${content}</a>`
        : html`<span class="sf-table-link-cell">${content}</span>`;
}


export function renderTableTemplate(context) {
    const {state} = context.component;

    function renderBody() {
        if (context.component?.hasSlotContent?.("body")) {
            return html`
                <tbody>
                ${context.component.getSlotContent("body")}
                </tbody>`;
        }

        const {state} = context.component;
        const columns = context.component?.getColumns?.() || [];
        const {rows = []} = state.data || {};
        const dataState = resolvedDataState(context);

        // A re-query over rows that are already on screen leaves them there,
        // dimmed, with one small spinner in the middle of what the person can
        // see. Replacing them with a loader — which is what happened before —
        // threw away the place they were reading and moved the answer to the top
        // left corner of an empty table.
        if (dataState === 'loading' && rows.length) {
            return renderRows(context, columns, rows, {busy: true});
        }

        if (dataState !== 'populated') {
            const stateContent = {
                // One indicator, the same one a re-query shows, centred in the
                // body rather than lined up at its start. The spinner paints its
                // own `label` as text and defaults it to "Loading...", so it is
                // given an empty one: the words are for a reader, in the
                // language the host set, and the circle is for everyone else.
                // Before this there were two indicators here, one of them in
                // English on a Russian page.
                loading: null,
                error: renderEmptyState(context, 'error'),
                empty: renderEmptyState(context, 'empty'),
            }[dataState] || renderEmptyState(context, 'empty');

            if (dataState === 'loading') {
                return html`
                    <tbody data-state="loading" class="sf-table-skeleton">
                        ${Array.from({length: SKELETON_ROWS}, (_, row) => html`<tr aria-hidden="true">
                            ${columns.some((column) => !SYSTEM_COLUMNS.has(column?.key))
                                    ? columns.map((column, at) => html`<td>${SYSTEM_COLUMNS.has(column?.key) ? skeletonControl : skeletonBar(row, at)}</td>`)
                                    // Before the host's first answer the columns are not
                                    // known yet: three bars across the whole row.
                                    : html`<td colspan=${String(Math.max(columns.length, 1))}>
                                        <div class="flex gap-2">${[0, 1, 2].map((at) => html`<div class="flex-1">${skeletonBar(row, at)}</div>`)}</div>
                                    </td>`}
                        </tr>`)}
                    </tbody>
                    <tbody><tr><td colspan=${String(Math.max(columns.length, 1))} class="sf-table-visually-hidden">
                        <span role="status">${context.loadingText}</span>
                    </td></tr></tbody>
                `;
            }
            return html`
                <tbody data-state=${dataState}>
                    <tr>
                        <td colspan=${String(Math.max(columns.length, 1))}>
                            <div class="sf-table-state">${stateContent}</div>
                        </td>
                    </tr>
                </tbody>
            `;
        }

        return renderRows(context, columns, rows);
    }

    // The compact list: each record as a block -- its box, its title (with the
    // tree's indent and button when it is a tree), the few fields the columns'
    // priority puts first, and its row menu. Opening and selecting are the
    // row's, so a record does in the list what it does in the table. The rest
    // of the record is the record panel's, opened the way a row opens it.
    function renderList() {
        const columns = context.component?.getColumns?.() || [];
        const {rows = []} = state.data || {};
        const dataState = resolvedDataState(context);
        if (dataState !== 'populated' && !(dataState === 'loading' && rows.length)) {
            if (dataState === 'loading') {
                return html`<div class="sf-table-list sf-table-skeleton flex flex-col" data-state="loading">
                    ${Array.from({length: SKELETON_ROWS}, (_, row) => html`<div class="sf-table-list-item flex flex-col gap-1/3 p-1" aria-hidden="true">
                        ${skeletonBar(row, 0)}${skeletonBar(row, 1)}
                    </div>`)}
                    <span class="sf-table-visually-hidden" role="status">${context.loadingText}</span>
                </div>`;
            }
            return html`<div class="sf-table-state" data-state=${dataState}>${renderEmptyState(context, dataState)}</div>`;
        }
        const select = columns.find((column) => column.key === 'select');
        const menu = columns.find((column) => column.key === 'settings');
        const data = columns.filter((column) => column?.key && !['select', 'settings', 'actions'].includes(column.key)
            && !column.system && column.visible !== false);
        const title = data.find((column) => column.role === 'title') ?? data[0];
        const limit = Math.max(0, Number(context.component.getProp?.('listFields') ?? 3) || 0);
        const fields = data.filter((column) => column !== title)
            .map((column, order) => ({column, order}))
            .sort((a, b) => ((a.column.priority ?? 1e6) - (b.column.priority ?? 1e6)) || (a.order - b.order))
            .slice(0, limit)
            .map(({column}) => column);
        const filled = (value) => !(value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length));
        return html`
            <ul class="sf-table-list" role="list" aria-label=${context.ariaLabel || nothing}
                aria-busy=${dataState === 'loading' ? 'true' : nothing}>
                ${rows.map((row, rowIndex) => row.__tree?.more
                    ? keyed(`item:${row.id}`, html`
                        <li class="sf-table-list-more" style=${`--sf-table-tree--level: ${row.__tree.level}`}>
                            <sf-button appearance="link" size="1/2" text=${context.component.text('treeMore')}
                                       @click=${() => context.component.requestTreeMore(row)}></sf-button>
                        </li>`)
                    : keyed(`item:${row.id ?? rowIndex}`, html`
                        <li class="sf-table-list-item"
                            data-row-id=${context.component.getRowKey(row, rowIndex)}
                            data-selected=${row.select?.component?.props?.checked === true ? '' : nothing}
                            data-current=${context.component.isCurrentRow(row, rowIndex) ? '' : nothing}
                            aria-level=${row.__tree ? String(row.__tree.level + 1) : nothing}
                            aria-expanded=${row.__tree?.hasChildren ? String(row.__tree.expanded === true) : nothing}
                            tabindex="-1"
                            @mousedown=${(event) => context.component.handleRowPointerDown(event)}
                            @click=${(event) => context.component.handleRowClick(event, row, rowIndex)}
                            @dblclick=${(event) => context.component.handleRowOpen(event, row)}
                            @keydown=${(event) => context.component.handleRowKeydown(event, row)}>
                            ${select ? html`<span class="sf-table-list-select">${renderCellValue(row, select)}</span>` : nothing}
                            <div class="sf-table-list-main">
                                <div class="sf-table-list-title">${title
                                    ? (row.__tree || row.path ? renderTreeCell(context, row, renderCellValue(row, title)) : renderCellValue(row, title))
                                    : nothing}</div>
                                ${fields.some((column) => filled(row[column.key])) ? html`
                                    <div class="sf-table-list-fields">
                                        ${fields.filter((column) => filled(row[column.key])).map((column) => html`
                                            <span class="sf-table-list-field">
                                                <span class="sf-table-list-label">${column.label ?? column.key}</span>
                                                <span class="sf-table-list-value">${renderCellValue(row, column)}</span>
                                            </span>`)}
                                    </div>` : nothing}
                            </div>
                            ${menu ? html`<span class="sf-table-list-menu">${renderCellValue(row, menu)}</span>` : nothing}
                        </li>`))}
            </ul>`;
    }

    // The title opens its record with one click (owner, 2026-10-14): the
    // column the host marked as the title is a link to the record's view when
    // the row offers it, so a record is a click away rather than a double
    // click or a trip through the row's menu.
    function renderTitleLink(context, row, value) {
        if (!context.component.canOpenRow?.(row) || row?.id == null) return value;
        return html`<a class="sf-table-title-link" href=${row.href ?? row.url ?? '#'}
                @click=${(event) => {
                    if (event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
                        if (row.href ?? row.url) return;
                    }
                    event.preventDefault();
                    event.stopPropagation();
                    // The second click of a double click is the same wish:
                    // opened once, not twice.
                    if (event.detail > 1) return;
                    context.component.requestActionIntent('view', [row.id]);
                }}>${value}</a>`;
    }

    // repeat, not keyed: a sort moves the rows it already drew. keyed at each
    // position redrew every row and every value in it when the order changed --
    // four hundred elements for one click (owner, 2026-10-15).
    function renderRows(context, columns, rows, {busy = false} = {}) {
        const treeColumn = context.component.treeColumnKey?.(columns);
        const titleColumn = columns.find((column) => column?.role === 'title' && !column.system)?.key ?? null;
        return html`
            <tbody data-busy=${busy ? '' : nothing}>
            ${repeat(rows, (row, rowIndex) => (row.__tree?.more ? `more:${row.id}` : `row:${row.id ?? row.value ?? rowIndex}`), (row, rowIndex) => row.__tree?.more ? renderMoreRow(context, columns, row) : html`
                <tr data-selected=${row.select?.component?.props?.checked === true ? '' : nothing}
                    draggable=${(context.component.hasAttribute('drag-rows') || context.component.getAttribute('row-reorder') === 'true') && !row.__tree?.more ? 'true' : nothing}
                    aria-level=${row.__tree ? String(row.__tree.level + 1) : nothing}
                    aria-expanded=${row.__tree?.hasChildren ? String(row.__tree.expanded === true) : nothing}
                    aria-setsize=${row.__tree ? String(row.__tree.setsize) : nothing}
                    aria-posinset=${row.__tree ? String(row.__tree.posinset) : nothing}
                    aria-busy=${row.__tree?.loading ? 'true' : nothing}
                    data-row-id=${context.component.getRowKey(row, rowIndex)}
                    data-current=${context.component.isCurrentRow(row, rowIndex) ? '' : nothing}
                    tabindex="-1"
                    @mousedown=${(event) => context.component.handleRowPointerDown(event)}
                    @click=${(event) => context.component.handleRowClick(event, row, rowIndex)}
                    @dblclick=${(event) => context.component.handleRowOpen(event, row)}
                    @keydown=${(event) => context.component.handleRowKeydown(event, row)}>
                    ${repeat(columns, (column) => `cell:${column.key}`, (column, index) => html`
                        <td data-key="${column.key}" data-item="${row.id}_${column.key}"
                            data-sf-pinned=${context.component.isPinnedColumn(column) ? '' : nothing}
                            style=${context.component.getStickyCellStyle(columns, index) || nothing}>${column.key === treeColumn
                                ? renderTreeCell(context, row, column.key === titleColumn ? renderTitleLink(context, row, renderCellValue(row, column)) : renderCellValue(row, column))
                                : column.key === titleColumn ? renderTitleLink(context, row, renderCellValue(row, column)) : renderCellValue(row, column)}</td>
                    `)}
                </tr>
            `)}
            </tbody>`;
    }

    // The first cell of a tree row: indented by its level, with the button that
    // opens or closes it when the host said it has children, and -- in a search
    // over a tree -- the path it lives under, so a found row says where it is.
    function renderTreeCell(context, row, value) {
        const tree = row.__tree;
        const path = Array.isArray(row.path) && row.path.length
            ? row.path.map((item) => item?.label ?? item).join(' / ')
            : '';
        if (!tree && !path) return value;
        const level = tree?.level ?? 0;
        const toggle = tree?.hasChildren
            ? html`<button type="button" class="sf-table-tree-toggle"
                           data-expanded=${tree.expanded ? '' : nothing}
                           aria-label=${context.component.text(tree.expanded ? 'treeCollapse' : 'treeExpand')}
                           @click=${(event) => {
                               event.stopPropagation();
                               context.component.toggleTreeRow(row);
                           }}><i class="sf-icon" aria-hidden="true">chevron_right</i></button>`
            : tree ? html`<span class="sf-table-tree-toggle" aria-hidden="true"></span>` : nothing;
        // The node's icon, the host's to choose (port 1.9.0): a page with pages
        // under it is still a page. Without one, a folder for a node with
        // children -- open when it is open -- and a document for a leaf.
        const icon = tree
            ? (tree.expanded ? (row.icon_expanded ?? row.icon) : row.icon)
                ?? (tree.hasChildren ? (tree.expanded ? 'folder_open' : 'folder') : 'description')
            : row.icon;
        return html`
            <span class="sf-table-tree-cell" style=${`--sf-table-tree--level: ${level}`}>
                ${toggle}
                ${icon ? html`<i class="sf-icon sf-table-tree-icon" aria-hidden="true">${icon}</i>` : nothing}
                <span class="sf-table-tree-value flex flex-col min-w-0">
                    <span class="min-w-0">${value}</span>
                    ${path ? html`<span class="sf-table-tree-path">${path}</span>` : nothing}
                </span>
            </span>`;
    }

    // The next page of one level, as a row of its own at that level.
    function renderMoreRow(context, columns, row) {
        return html`
            <tr class="sf-table-tree-more" aria-level=${String(row.__tree.level + 1)}>
                <td colspan=${String(columns.length)}>
                    <span class="sf-table-tree-cell" style=${`--sf-table-tree--level: ${row.__tree.level}`}>
                        <span class="sf-table-tree-toggle" aria-hidden="true"></span>
                        <sf-button appearance="link" size="1/2" text=${context.component.text('treeMore')}
                                   @click=${() => context.component.requestTreeMore(row)}></sf-button>
                    </span>
                </td>
            </tr>`;
    }

    function renderCellValue(row, column) {
        if (!column || !row) {
            return nothing;
        }

        let value = row[column.key];

        if (column.renderer === "link") {
            return renderLinkCell(value);
        }
        // `row.actions` is read here in two vocabularies. From a host it is ids
        // -- `["view"]`, the data view port's word for which of the list's
        // actions apply to this record -- and from a consumer that builds its
        // own controls it is the items themselves. Ids select from the table's
        // list; items are the list.
        //
        // Both went through the second branch before, so an array of ids was
        // handed to the filter AS the action list, where `action.id` is
        // undefined for a string: everything was filtered out and the
        // «Действия» column drew an empty container in every row of every list.
        // A consumer reported it on an embedded one, which is only where they
        // were looking (owner, 2026-10-09).
        // The cell is built from whichever vocabulary the row holds, and built
        // once. From a host `row.actions` is ids -- the data view port's word
        // for which of the list's actions apply to this record -- and after
        // normalizeRow it is the built items.
        //
        // Items are not rebuilt here. Passing them back through the builder
        // made new objects on every render, and a table that hands lit new
        // objects rebuilds the cells rather than keeping them, which costs
        // whatever the cells hold. The round-3 probe measures exactly that.
        // `row.actions` is the host's ids -- the data view port's word for which
        // of the list's actions apply to this record -- or, from a consumer that
        // builds its own controls, the items themselves. Ids select from the
        // list; items are the list. Handing ids to the builder AS the list was
        // the defect: `action.id` is undefined for a string, so everything was
        // filtered out and the «Действия» column drew an empty container in
        // every row of every list (owner, 2026-10-09).
        //
        // The built items are kept on the row, because a render that builds new
        // objects makes lit rebuild the cells rather than keep them, and the
        // cells hold things worth keeping. A re-query brings new row objects,
        // so the cache is fresh exactly when the data is.
        if (column.key === 'actions' && context.component?.getActionRowItems) {
            const built = Array.isArray(value) && value.length
                && value.every((item) => item && typeof item === 'object');
            if (!built) value = context.component.rowActionItems(row);
        }


        // A boolean the host lets this person write is a checkbox in the cell;
        // it is disabled while the host answers.
        if (context.component?.cellEditable?.(row, column)) {
            return html`<sf-checkbox size=${context.size === '1/2' ? '1/2' : '1'} data-cell-edit=${column.key}
                ?checked=${value === true} ?disabled=${context.component.cellPending(row, column)}
                aria-label=${column.label ?? column.key}
                @change=${(event) => context.component.setCellValue(row, column, Boolean(event.target?.checked ?? event.detail?.checked))}></sf-checkbox>`;
        }

        if (column.component) {
            if (
                value !== null &&
                typeof value !== "undefined" &&
                (!Array.isArray(value) || value.length)
            ) {
                return renderCellItem(value, context.component);
            }
            if (
                column.key === "settings" &&
                (!value || (Array.isArray(value) && !value.length))
            ) {
                return renderComponent({
                    type: "icon-button",
                    props: {
                        size: "1",
                        appearance: "link",
                        scheme: "on-surface",
                        icon: "menu",
                        ariaLabel: "Меню",
                        value: "menu",
                    },
                }, context.component);
            }

            return renderComponent(column.rowComponent || column.component, context.component);
        }

        if (value === null || typeof value === "undefined") {
            return nothing;
        }

        // A long text -- a description, a note -- is one line in a row, cut
        // with an ellipsis; the whole of it is in the title for the pointer and
        // in the text for a screen reader. Wrapped, one description made its row
        // three lines tall in a list of one-line rows (owner, 2026-10-13).
        if (LONG_TEXT_TYPES.has(column.propertyType ?? column.property_type ?? column.type)
                && (typeof value === "string" || typeof value === "number")) {
            const text = String(value);
            return html`<span class="sf-table-cell-clip" title=${text}>${text}</span>`;
        }

        // The renderer set is asked before the shapes below, because a typed
        // cell's value is often an object -- a user or a related record arrives
        // as {value, label, href} -- and the object branch would render nothing
        // for it: it looks for a component the host put there. A cell that does
        // carry the host's own component still wins, which is the check here.
        const carriesHostComponent = typeof value === "object" && !Array.isArray(value)
            && Boolean(value.component?.type);
        if (!carriesHostComponent) {
            const typed = context.component?.getTypedCellValue?.(column, value);
            if (typed !== null && typeof typed !== "undefined") {
                // Badges and tags from the renderer set wrap onto the next line,
                // as the host's own values do: this branch drew them in one
                // line that ran out of the cell (owner, 2026-10-12).
                if (Array.isArray(typed)) {
                    // A person -- the avatar, then the name -- stays on one
                    // line: wrapping put the avatar above a two-line name. The
                    // name wraps beside it instead.
                    if (typed[0]?.component?.type === 'avatar') {
                        return html`
                            <div class="flex flex-nowrap items-cross-center gap-1/3">
                                ${renderCellItem(typed[0], context.component)}
                                <span style="min-inline-size: 0">
                                    ${typed.slice(1).map((item) => renderCellItem(item, context.component))}
                                </span>
                            </div>
                        `;
                    }
                    return renderCellValues(typed, context.component);
                }

                return renderCellItem(typed, context.component);
            }
        }

        if (Array.isArray(value)) {
            if (column.key === 'actions') {
                value = value.filter(el => {
                    const {actions} = state;
                    const actionId = el.id || el.component?.props?.value;
                    const action = actions.find(action => action.id === actionId);
                    // The host's own actions (its row_actions) live in the row
                    // menu: a page has a dozen of them, which drawn in a row of
                    // buttons wrapped it to three lines.
                    if (el.inline === false) return false;

                    return action?.visible ?? true
                });
            }
            // Several values -- badges for each language, tags for each choice
            // -- wrap onto the next line when the column is narrower than
            // they are, instead of running out of the cell under the next one.
            // The row of actions stays on one line: it is sized for it.
            if (column.key === 'actions') {
                // A row's buttons stand in the row a person is on -- under the
                // pointer, with the focus, or current -- and the column keeps its
                // width in the others (owner, 2026-10-15): drawn in every row they
                // were most of a page's elements.
                if (!context.component.actionsShownFor?.(row)) {
                    return html`<div class="sf-table-row-actions" data-row-actions="idle"></div>`;
                }
                return html`
                    <div class="sf-table-row-actions flex items-cross-center gap-1/3">
                        ${value.map((item) => renderCellItem(item, context.component))}
                    </div>
                `;
            }
            return renderCellValues(value, context.component);
        }

        if (typeof value === "object") {
            return renderCellItem(value, context.component);
        }

        // Plain text stops at three lines with an ellipsis: a long description
        // in a list made one row as tall as the screen (owner, 2026-10-12). The
        // whole text is the record's, and a long one reads in full on hover.
        const text = String(value);
        return html`<span class="sf-table-cell-text" title=${text.length > 80 ? text : nothing}>${text}</span>`;
    }

    return html`
        <section
                class="sf-table ${context.list ? 'sf-table--list' : ''} min-w-0 flex flex-col gap-1/3 flex-1 min-h-0 ${context.rootClass ||
                ""}"
                style=${context.rootStyle || nothing}
                aria-label=${context.ariaLabel || nothing}
                data-sf-instance=${context.component.getInstanceId()}
                data-state=${resolvedDataState(context)}
                aria-busy=${resolvedDataState(context) === 'loading' ? 'true' : nothing}
        >
            ${context.toolbar ? (context.list ? renderListToolbar(context) : renderToolbar(context)) : nothing}
            ${context.component.renderBulkActions()}

            <div class="table-wrap min-w-0 max-w-full flex flex-col flex-1 min-h-0">
                <div class="sf-table-scroll min-h-0 min-w-0 overflow-auto flex-1 relative"
                     ${ref(context.component.refs.scroll)}
                     data-sf-vertical-scroll=${context.verticalScroll}>
                    <div class="sf-table-resize-guide" aria-hidden="true" hidden
                         ${ref(context.component.refs.resizeGuide)}></div>
                    ${resolvedDataState(context) === 'loading' && (context.component.getTableData()?.rows?.length ?? 0) > 0
                        ? html`
                            <div class="sf-table-busy" role="status">
                                <sf-spinner size=${context.size} label="" aria-label=${context.loadingText}></sf-spinner>
                            </div>
                        `
                        : nothing}
                    ${context.list ? renderList() : html`
                    <table
                            ${ref(context.component.refs.table)}
                            class="table border-separate border-spacing-0 min-w-full ${context.component?.hasContentWidths ? 'sf-table-content-sized' : 'w-max'} table-fixed transition"
                            role=${context.component.isTree?.() ? 'treegrid' : nothing}
                            aria-label=${context.ariaLabel || nothing}
                    >
                        ${renderColgroup(context)}
                        ${renderHead(context)}
                        ${renderBody(context)}
                    </table>`}
                </div>
                ${context.verticalScroll === 'page' && !context.list
                        ? html`<div class="sf-table-rail" aria-hidden="true" hidden ${ref(context.component.refs.rail)}>
                            <div class="sf-table-rail-track"></div></div>`
                        : nothing}

                ${context.pagin
                        ? html`
                            <sf-pagination
                                    current="1"
                                    total=${String(context.paginationTotal)}
                                    bottom="true"
                                    show-action-for-all
                                    page-size=${String(context.paginationPageSize)}
                                    page-sizes=${context.pageSizes}
                                    show-page-size
                                    top-class="content-main-center"
                                    main-class="items-cross-center content-main-between"
                                    bottom-class="items-cross-center gap-2"
                            ></sf-pagination>`
                        : nothing}
            </div>
        </section>
        ${state.contextMenu?.open ? context.component.renderContextMenu(context.state.contextMenu) : nothing}
        <!-- A demo panel used to stand here, open to nothing, titled after a
             ticket. Closed, it still took a box of its own, and in a card that
             spaces its parts that box became the gap above Show more: three
             spacings instead of one. -->
    `;
}
