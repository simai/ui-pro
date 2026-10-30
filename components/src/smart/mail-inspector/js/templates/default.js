import {html, nothing} from "lit";
import {keyed} from "lit/directives/keyed.js";
import {repeat} from "lit/directives/repeat.js";
import "./default.css";

const ICONS = {duplicate: "content_copy", delete: "delete", replace: "swap_horiz"};

// A text-like field. `value` holds still while there is typed text (see
// index.js), and the same element stays under a redraw, so the focus and the
// caret stay in it.
function renderText(context, field) {
    const {component} = context;
    const error = component.errorOf(field);
    const onLeave = () => component.onFieldLeave(field.path);
    const onInput = (event) => component.onFieldInput(field.path, event.currentTarget);
    if (field.kind === "multiline") {
        return html`<sf-textarea class="sf-mail-inspector-field" size="1/2" auto-grow min-rows="2" max-rows="12" data-path=${field.path}
                                 label=${field.label || nothing} aria-label=${field.ariaLabel || nothing}
                                 value=${component.valueAttribute(field)} placeholder=${field.placeholder || nothing} hint=${field.hint || nothing}
                                 inherited-value=${field.inheritedValue || nothing} ?required=${field.required} ?disabled=${field.disabled}
                                 ?invalid=${Boolean(error)} error-message=${error || nothing} data-draft=${component.isDraft(field) ? "true" : nothing}
                                 @input=${onInput} @focusout=${onLeave}></sf-textarea>`;
    }
    return html`<sf-input class="sf-mail-inspector-field" size="1/2" data-path=${field.path}
                          label=${field.label || nothing} aria-label=${field.ariaLabel || nothing}
                          value=${component.valueAttribute(field)} placeholder=${field.placeholder || nothing} hint=${field.hint || nothing}
                          input-type=${field.kind === "link" ? "url" : nothing} inputmode=${field.inputmode || (field.kind === "number" ? "numeric" : nothing)}
                          inherited-value=${field.inheritedValue || nothing} ?required=${field.required} ?disabled=${field.disabled}
                          ?invalid=${Boolean(error)} error-message=${error || nothing} data-draft=${component.isDraft(field) ? "true" : nothing}
                          @input=${onInput} @focusout=${onLeave}></sf-input>`;
}

function renderSelect(context, field) {
    const {component} = context;
    const options = Array.isArray(field.options) ? field.options : [];
    // A value of nothing reads as the choice that means it.
    const none = options.find((option) => option.value === "")?.text;
    return html`<sf-dropdown class="sf-mail-inspector-field" size="1/2" mode="select" data-path=${field.path} label=${field.label || nothing}
                             value=${field.value ?? ""} placeholder=${field.placeholder || none || nothing} hint=${field.hint || nothing}
                             ?required=${field.required} ?disabled=${field.disabled} ?invalid=${Boolean(field.error)} error-message=${field.error || nothing}
                             .options=${options} @change=${(event) => component.onChoice(field.path, event)}></sf-dropdown>`;
}

function renderSwitch(context, field) {
    const {component} = context;
    return html`<sf-switch class="sf-mail-inspector-field" size="1/2" data-path=${field.path} label=${field.label || nothing}
                           ?checked=${field.value === true} ?disabled=${field.disabled}
                           @change=${(event) => component.onSwitch(field.path, event.currentTarget)}></sf-switch>`;
}

// A group of fields under one name, row by row: a price is its amount and old
// price, its currency and unit, then its note.
function renderGroup(context, field) {
    const rows = Array.isArray(field.rows) ? field.rows : [];
    return html`<div class="sf-mail-inspector-group" data-group=${field.path} role="group" aria-label=${field.label || nothing}>
        ${rows.map((row) => html`<div class=${row.length > 1 ? "sf-mail-inspector-pair" : "sf-mail-inspector-row"}>${row.map((part) => renderField(context, part))}</div>`)}
    </div>`;
}

// One image as sf-image-field: the picture, its name and size, «Заменить…» and
// «Убрать»; a file dropped on it replaces it. Under it, what the host offers to
// choose again. The field uploads nothing: the host stores the file.
function renderImage(context, field) {
    const {component} = context;
    const error = component.errorOf(field);
    const choices = Array.isArray(field.choices) ? field.choices : [];
    return html`<div class="sf-mail-inspector-image" data-path=${field.path}>
        <sf-image-field size="1/2" label=${field.label || nothing} aria-label=${field.label ? nothing : field.ariaLabel || nothing}
                        accept=${field.accept || nothing} empty-text=${field.emptyText || context.words.imageEmpty} hint=${field.hint || nothing}
                        value=${field.value ? JSON.stringify(field.value) : nothing} ?required=${field.required} ?disabled=${field.disabled}
                        ?invalid=${Boolean(error)} error-message=${error || nothing}
                        @sf-image-field-attach=${(event) => component.onAttach(field.path, event)}
                        @sf-image-field-detach=${(event) => component.onDetach(field.path, event)}
                        @sf-image-field-rejected=${(event) => component.onRejected(field.path, event)}></sf-image-field>
        ${choices.length
            ? html`<sf-dropdown class="sf-mail-inspector-choose" size="1/2" mode="select" data-choose=${field.path} label=${field.chooseLabel || nothing}
                                placeholder=${field.choosePlaceholder || nothing} value="" .options=${choices}
                                @change=${(event) => component.onImageChoice(field.path, event)}></sf-dropdown>`
            : nothing}
    </div>`;
}

// A row: its handle, a disclosure with the item's label, and ⋯. One item is open
// at a time and shows its fields. `slot` marks the row as the list's content, not
// as sf-sortable's own first paint: sf-sortable may arrive first and would drop it.
function renderItem(context, field, item, index) {
    const {component} = context;
    const isOpen = field.open === index;
    const label = String(item.label ?? "");
    const actions = context.itemActionsLabel(label);
    const bodyId = context.partOf(`${context.groupOf(field.path)}-item-${index}`);
    return html`
        <div slot="item" class=${["sf-mail-inspector-item", isOpen ? "is-open" : "", item.problem ? "has-problem" : ""].filter(Boolean).join(" ")}
             data-sf-sortable-item=${`item-${index}`} data-item=${index} tabindex="-1">
            <div class="sf-mail-inspector-item-head">
                <span class="sf-mail-inspector-handle" data-sf-sortable-handle aria-hidden="true"><sf-icon icon="drag_indicator" size="1"></sf-icon></span>
                <button type="button" class="sf-mail-inspector-toggle" aria-expanded=${isOpen ? "true" : "false"} aria-controls=${bodyId} data-toggle=${index}
                        @click=${() => component.itemToggle({path: field.path, index})}
                        @keydown=${(event) => component.onToggleKeydown(field.path, index, event)}>
                    <sf-icon icon=${isOpen ? "expand_more" : "chevron_right"} size="1" aria-hidden="true"></sf-icon>
                    <span class="sf-mail-inspector-item-label">${label}</span>
                </button>
                <sf-icon-button class="sf-mail-inspector-item-more" appearance="ghost" scheme="on-surface" size="1/2" icon="more_horiz"
                                aria-label=${actions} title=${actions} data-item-menu=${index}
                                @click=${(event) => component.openItemMenu(field.path, index, event.currentTarget)}></sf-icon-button>
            </div>
            <div id=${bodyId} class="sf-mail-inspector-item-body" role="group" aria-label=${label} data-item-body=${index} data-item-list=${field.path} ?hidden=${!isOpen}>
                ${isOpen ? renderFields(context, item.fields) : nothing}
            </div>
        </div>
    `;
}

function renderItems(context, field) {
    const {component} = context;
    const items = component.itemsOf(field);
    return html`<div class="sf-mail-inspector-items" data-items=${field.path}>
        <sf-sortable class="sf-mail-inspector-list" group=${context.groupOf(field.path)} label=${field.label || nothing}
                     @sf-sortable-move=${(event) => component.onSortableMove(field.path, event)}>
            ${repeat(items, (_, index) => index, (item, index) => renderItem(context, field, item, index))}
        </sf-sortable>
        <sf-button class="sf-mail-inspector-add" appearance="link" scheme="on-surface" size="1/2" icon-start="add" text=${context.words.add}
                   data-item-add=${field.path} ?disabled=${component.isFull(field)}
                   @click=${() => component.itemAdd({path: field.path})}></sf-button>
    </div>`;
}

function renderField(context, field) {
    switch (field?.kind) {
        case "text":
        case "multiline":
        case "link":
        case "number":
            return renderText(context, field);
        case "select":
            return renderSelect(context, field);
        case "switch":
            return renderSwitch(context, field);
        case "group":
            return renderGroup(context, field);
        case "image":
            return renderImage(context, field);
        case "items":
            return renderItems(context, field);
        default:
            return nothing;
    }
}

function renderFields(context, fields) {
    return html`<div class="sf-mail-inspector-fields">${repeat(Array.isArray(fields) ? fields : [], (field) => field.path, (field) => renderField(context, field))}</div>`;
}

// One flush section of the class accordion. The element owns its state, so the
// class runtime leaves it alone (data-sf-accordion-init).
function renderSection(context, section) {
    const {component} = context;
    return html`
        <article class=${["sf-accordion", "sf-accordion--flush", "sf-accordion--size-1/2", section.isOpen ? "active" : ""].filter(Boolean).join(" ")}
                 data-sf-accordion-init="1" data-section=${section.key}>
            <h3 class="sf-accordion-heading">
                <button class="sf-accordion-trigger" type="button" id=${section.triggerId} aria-expanded=${section.isOpen ? "true" : "false"} aria-controls=${section.panelId}
                        @click=${() => component.toggleSection({key: section.key})}>
                    <span class="sf-accordion-title">${section.title}</span>
                    <i class="sf-icon" aria-hidden="true">chevron_right</i>
                </button>
            </h3>
            <div class="sf-accordion-content" id=${section.panelId} role="region" aria-labelledby=${section.triggerId} ?hidden=${!section.isOpen}>${renderFields(context, section.fields)}</div>
        </article>
    `;
}

// One section needs no disclosure: its fields stand on their own.
function renderForm(context) {
    const {sections} = context;
    if (sections.length === 1) return renderFields(context, sections[0].fields);
    return html`<div class="sf-accordion-group sf-mail-inspector-sections">${repeat(sections, (section) => section.key, (section) => renderSection(context, section))}</div>`;
}

// The tabs: one panel per tab, the form in those without a slot, the host's own
// panel in those with one. sf-tabs takes the panels as it connects, so a new list
// of tabs is a new sf-tabs (keyed in the caller).
function renderTabs(context) {
    const {component} = context;
    return html`<sf-tabs class="sf-mail-inspector-tabs" type="underline" size="1/2" aria-label=${context.heading || nothing}
                         active-index=${context.tabIndex} items=${context.tabs.map((tab) => tab.label).join("|")}
                         @sf-tabs-change=${(event) => component.onTabChange(event)}>
        ${repeat(context.tabs, (tab) => tab.id, (tab, index) => html`
            <div slot=${`panel-${index}`} class="sf-mail-inspector-panel" data-tab=${tab.id}>
                ${tab.slot ? (component.hasSlotContent(tab.slot) ? component.getSlotContent(tab.slot) : nothing) : renderForm(context)}
            </div>`)}
    </sf-tabs>`;
}

function renderHead(context) {
    const {component} = context;
    return html`
        <div class="sf-mail-inspector-head">
            ${context.levels.length > 1
                ? html`<sf-breadcrumbs class="sf-mail-inspector-path" aria-label=${context.words.path}
                                       items=${JSON.stringify(context.levels.map((level, index) => (index === context.levels.length - 1 ? {text: level.text, current: true} : {text: level.text, href: `#level-${index}`})))}
                                       @sf-breadcrumbs-press=${(event) => component.onLevelPress(event)}
                                       @click=${(event) => event.preventDefault()}></sf-breadcrumbs>`
                : nothing}
            ${context.heading
                ? html`<div class="sf-mail-inspector-title-row">
                    ${context.headingIcon ? html`<sf-icon icon=${context.headingIcon} size="2" aria-hidden="true"></sf-icon>` : nothing}
                    <h2 class="sf-mail-inspector-title">${context.heading}</h2>
                    ${context.actions.map((name) => html`<sf-icon-button class="sf-mail-inspector-action" appearance="ghost" scheme="on-surface" size="1/2" icon=${ICONS[name] || "more_horiz"}
                                                                          aria-label=${context.words[name] || name} title=${context.words[name] || name} data-action=${name}
                                                                          @click=${() => component[name]?.()}></sf-icon-button>`)}
                </div>`
                : nothing}
        </div>
    `;
}

function renderNotice(context) {
    const {component, notice} = context;
    if (!notice) return nothing;
    return html`<div class="sf-mail-inspector-notice">
        <span class="sf-mail-inspector-notice-text">${notice.text}</span>
        ${notice.action
            ? html`<sf-button appearance="outline" size="1/2" text=${notice.action} data-notice-action @click=${() => component.sfEmit("notice-action", {})}></sf-button>`
            : nothing}
    </div>`;
}

// The panel: heading and path, what the host has to say, then the form -- in
// tabs when there are tabs -- and one ⋯ menu for every list. The fields' own
// input and change stop at the root: the change the host hears is the element's,
// sent on the host itself. A press on the path is a level, so its link goes nowhere.
export function renderMailInspectorTemplate(context) {
    const {component} = context;
    return html`
        <div class=${["sf-mail-inspector", context.rootClass].filter(Boolean).join(" ")} @keydown=${(event) => component.onKeydown(event)}
             @input=${(event) => event.stopPropagation()} @change=${(event) => event.stopPropagation()}>
            ${renderHead(context)}
            ${renderNotice(context)}
            ${keyed(`${context.formKey}\n${context.tabsKey}`, context.tabs.length ? renderTabs(context) : renderForm(context))}
            <span class="sf-mail-inspector-said sr-only" role="status">${context.said}</span>
            <sf-context-menu class="sf-mail-inspector-menu" popup size="1/2" aria-label=${context.words.itemMenu}
                             @sf-context-menu-select=${(event) => {
                                 event.stopPropagation();
                                 component.onMenuSelect(event.detail);
                             }}></sf-context-menu>
        </div>
    `;
}
