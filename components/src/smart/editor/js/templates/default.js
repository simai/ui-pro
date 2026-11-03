import {html, nothing} from "lit";
import {repeat} from "lit/directives/repeat.js";
import "./default.css";

// The editor's frame: the bar (screens, undo, the template, output), the
// library and the structure on the left, the page in the middle with what
// only editing draws over it (the hover and chosen frames, the gutter with
// + and the grip, the drop line), the parameter and data panel on the right,
// and the path of the chosen block under the page. The page itself is drawn
// by the Framework's renderers into .sf-editor-page (index.js redraw), so
// Lit leaves that element's children alone; so it does the status line's,
// which index.js say() writes.
//
// Landmarks: the bar is in a region of its own, the panels are asides and the
// path a nav. The canvas is a named region when the page brings no landmarks;
// a page with its own (banner, main, contentinfo) keeps them top level, and
// the canvas is then an unnamed group that says its role. Every control is a Framework
// part: sf-button, sf-button-icon, sf-button-group, sf-tabs, sf-input,
// sf-dropdown, sf-switch, sf-menu-context, sf-modal, sf-skeleton, sf-icon.
/** The word for each reason a class of «Extra classes» is not taken. */
const REFUSED = {
    modifier_unknown: "modifiers-unknown",
    modifier_invalid: "modifiers-invalid",
    modifier_rules_unavailable: "modifiers-unchecked",
    modifier_limit: "modifiers-limit",
};

export function renderEditorTemplate(component) {
    const view = component.view();
    const w = (key, vars) => component.sfWord(key, vars ? {vars} : undefined);
    const stop = (event) => {
        if (event.target !== event.currentTarget) event.stopPropagation();
    };
    const classes = ["sf-editor", component.getRootClass?.() ?? "", component.builder ? "sf-editor--builder" : "", view.model.templateEditing ? "sf-editor--template" : ""].filter(Boolean).join(" ");
    return html`
        <div class=${classes} @input=${stop} @change=${stop}>
            <div class="sf-editor-top" role="region" aria-label=${component.label || w("label")}>
                ${bar(component, view, w)}
                ${component.builder ? builderBar(component, w) : nothing}
                <p id="sf-editor-help" class="sf-editor-visually-hidden">${w("help-text")}</p>
                <div class="sf-editor-live sf-editor-visually-hidden" role="status" aria-live="polite"></div>
            </div>
            <div class="sf-editor-body">
                ${left(component, view, w)}
                <div class="sf-editor-stage">
                    <div class="sf-editor-canvas" tabindex="0" role=${view.landmarks ? "group" : "region"} aria-roledescription=${w("canvas-role")}
                         aria-label=${view.landmarks ? nothing : component.label || w("label")} aria-describedby="sf-editor-help">
                        <div class="sf-editor-frame" data-screen=${component.screenName}>
                            <div class="sf-editor-page"></div>
                        </div>
                        <div class="sf-editor-hover" hidden aria-hidden="true"></div>
                        <div class="sf-editor-chosen" hidden aria-hidden="true"></div>
                        <div class="sf-editor-drop" hidden aria-hidden="true"></div>
                        <div class="sf-editor-gutter" role="region" aria-label=${w("gutter-label")} hidden>
                            <sf-button-icon class="sf-editor-plus" size="1/3" appearance="ghost" scheme="on-surface-variant" icon="add"
                                            aria-label=${w("plus-label")} title=${w("plus-label")}
                                            @click=${(event) => component.onPlus(event)}></sf-button-icon>
                            <sf-button-icon class="sf-editor-grip" size="1/3" appearance="ghost" scheme="on-surface-variant" icon="drag_indicator"
                                            aria-label=${w("grip-label")} title=${w("grip-label")} aria-haspopup="menu"
                                            @pointerdown=${(event) => component.onGripDown(event)}
                                            @keydown=${(event) => component.onGripKey(event)}></sf-button-icon>
                        </div>
                    </div>
                    ${pathBar(component, view, w)}
                </div>
                ${right(component, view, w)}
            </div>
            ${view.pop ? popover(component, view, w) : nothing}
            ${component.lockNote ? html`<div class="sf-editor-lock-note" role="status"
                    style=${`inset-block-start:${component.lockNote.y + 12}px;inset-inline-start:${component.lockNote.x}px`}>
                <sf-icon icon="lock" size="1/2"></sf-icon><span>${component.lockNote.text}</span></div>` : nothing}
            <sf-menu-context class="sf-editor-menu" size="1/2" @sf-menu-context-select=${(event) => component.onMenuSelect(event)}></sf-menu-context>
            <sf-editor-inline></sf-editor-inline>
            ${component.outputView ? outputModal(component, w) : nothing}
        </div>
    `;
}

function bar(component, view, w) {
    const model = view.model;
    const template = view.hasTemplate && component.main.rights.template && !component.builder;
    return html`
        <div class="sf-editor-bar" role="toolbar" aria-label=${w("bar-label")}>
            <div class="sf-editor-bar-start">
                <sf-button-icon size="1/2" appearance="ghost" scheme="on-surface" icon="undo" aria-label=${w("undo-label")} title=${`${w("undo-label")} (⌘Z)`}
                                ?disabled=${!model.canUndo} @click=${() => component.history("undo")}></sf-button-icon>
                <sf-button-icon size="1/2" appearance="ghost" scheme="on-surface" icon="redo" aria-label=${w("redo-label")} title=${`${w("redo-label")} (⇧⌘Z)`}
                                ?disabled=${!model.canRedo} @click=${() => component.history("redo")}></sf-button-icon>
                ${template ? html`<sf-button size="1/2" appearance=${model.templateEditing ? "tonal" : "outline"} scheme=${model.templateEditing ? "primary" : "on-surface"}
                        icon-start=${model.templateEditing ? "check" : "web"} text=${w(model.templateEditing ? "template-done" : "template-edit")}
                        @click=${() => component.toggleTemplate(!model.templateEditing)}></sf-button>` : nothing}
                ${model.templateEditing ? html`<span class="sf-editor-badge">${w("template-badge")}</span>` : nothing}
            </div>
            <sf-button-group class="sf-editor-screens" size="1/2" appearance="segmented" aria-label=${w("screen-label")}
                             .items=${view.screens} .value=${component.screenName}
                             @change=${(event) => {
                                 event.stopPropagation();
                                 component.setScreen(event.detail?.value ?? event.currentTarget.value);
                             }}></sf-button-group>
            <div class="sf-editor-bar-end">
                ${component.main.theme?.name || component.main.theme?.label ? html`<span class="sf-editor-theme" title=${w("theme-read-only")}>
                    <sf-icon icon="palette" size="1/2"></sf-icon>${component.main.theme.label ?? component.main.theme.name}</span>` : nothing}
                <sf-button size="1/2" appearance="outline" scheme="on-surface" icon-start="code" text=${w("output-open")}
                           @click=${() => component.openOutput("json")}></sf-button>
            </div>
        </div>
    `;
}

function builderBar(component, w) {
    const builder = component.builder;
    const groups = ["marketing", "page-parts", "structure", "media", "data", "text", "forms"];
    return html`
        <div class="sf-editor-builder-bar" role="region" aria-label=${w("builder-label")}>
            <sf-icon icon="dashboard_customize" size="1/2"></sf-icon>
            <strong>${w(builder.editing ? "builder-editing" : "builder-new")}</strong>
            <sf-input size="1/2" label=${w("builder-name")} .value=${builder.name ?? ""} ?readonly=${builder.editing}
                      @input=${(event) => {
                          event.stopPropagation();
                          builder.name = String(event.currentTarget.value ?? "");
                          component.refresh();
                      }}></sf-input>
            <sf-dropdown size="1/2" label=${w("builder-group")} .options=${groups.map((id) => ({value: id, text: component.word(`group-${id}`)}))}
                         .value=${builder.catalogue?.group ?? "marketing"}
                         @change=${(event) => {
                             event.stopPropagation();
                             const value = event.detail?.value ?? event.currentTarget.value;
                             builder.catalogue = {...(builder.catalogue ?? {}), group: String(Array.isArray(value) ? value[0] : value)};
                         }}></sf-dropdown>
            <span class="sf-editor-builder-note">${w("builder-note", {count: String(builder.exposed.length)})}</span>
            ${builder.diagnostics?.length ? html`<span class="sf-editor-error" role="alert">${w("builder-invalid")}: ${builder.diagnostics.map((entry) => entry.message ?? entry.code).join("; ")}</span>` : nothing}
            <span class="sf-editor-spacer"></span>
            <sf-button size="1/2" appearance="link" scheme="on-surface" text=${w("cancel")} @click=${() => component.closeBuilder()}></sf-button>
            <sf-button size="1/2" scheme="primary" icon-start="save" text=${w(builder.editing ? "builder-save-everywhere" : "builder-save")}
                       ?disabled=${!builder.editing && !String(builder.name ?? "").trim()} @click=${() => component.saveBuilder()}></sf-button>
        </div>
    `;
}

// ------------------------------------------------------------ the left panel

function left(component, view, w) {
    const tabs = [{id: "blocks", label: w("left-blocks")}, {id: "structure", label: w("left-structure")}];
    return html`
        <aside class="sf-editor-left" aria-label=${w("left-label")}>
            <h2 class="sf-editor-visually-hidden">${w("left-label")}</h2>
            <sf-tabs type="underline" size="1/2" .items=${tabs} active-index=${component.leftTab === "structure" ? 1 : 0}
                     @sf-tabs-change=${(event) => {
                         event.stopPropagation();
                         component.leftTab = event.detail?.selected === "structure" ? "structure" : "blocks";
                         component.refresh();
                     }}></sf-tabs>
            <div class="sf-editor-left-body">
                ${component.leftTab === "structure" ? structure(component, view, w) : library(component, view, w)}
            </div>
        </aside>
    `;
}

function library(component, view, w) {
    const lib = view.library;
    const searching = Boolean(component.libraryQuery);
    const tab = lib.tabs.find((entry) => entry.id === lib.tab);
    return html`
        <sf-input class="sf-editor-search" size="1/2" input-type="search" icon-start="search" placeholder=${w("search-placeholder")}
                  aria-label=${w("search-placeholder")} .value=${component.libraryQuery}
                  @input=${(event) => {
                      event.stopPropagation();
                      component.libraryQuery = String(event.currentTarget.value ?? "");
                      component.refresh();
                  }}></sf-input>
        ${searching ? html`
            <section class="sf-editor-group" aria-label=${w("search-results")}>
                ${lib.items.length ? items(component, lib.items, w) : html`<p class="sf-editor-quiet">${w("nothing-found")}</p>`}
            </section>` : html`
            ${lib.favourites.length ? html`<section class="sf-editor-group"><h3>${w("favourites")}</h3>${items(component, lib.favourites, w)}</section>` : nothing}
            ${lib.recent.length ? html`<section class="sf-editor-group"><h3>${w("recent")}</h3>${items(component, lib.recent, w)}</section>` : nothing}
            ${lib.tabs.length > 1 ? html`
                <sf-button-group class="sf-editor-kinds" size="1/2" appearance="segmented" full-width aria-label=${w("catalogue-tabs")}
                                 .items=${lib.tabs.map((entry) => ({value: entry.id, label: w(`tab-${entry.id}`), count: String(entry.count)}))}
                                 .value=${lib.tab}
                                 @change=${(event) => {
                                     event.stopPropagation();
                                     component.libraryTab = String(event.detail?.value ?? event.currentTarget.value);
                                     component.refresh();
                                 }}></sf-button-group>` : nothing}
            ${tab ? tab.groups.map((group) => html`
                <section class="sf-editor-group"><h3>${component.word(`group-${group.id}`)}</h3>${items(component, group.items, w)}</section>`) : html`<p class="sf-editor-quiet">${w("nothing-fits")}</p>`}
        `}
        ${component.main.rights.builder && !component.builder ? html`
            <sf-button class="sf-editor-make" size="1/2" appearance="outline" scheme="on-surface" icon-start="dashboard_customize" full-width
                       text=${w("builder-start")} @click=${() => component.openBuilder({from: null})}></sf-button>` : nothing}
    `;
}

function items(component, list, w) {
    return html`<ul class="sf-editor-items" role="list">${repeat(list, (item) => `${item.type}#${item.variant ?? ""}`, (item) => {
        const key = `${item.type}${item.variant ? `#${item.variant}` : ""}`;
        const favourite = component.favourites.includes(key);
        return html`
            <li class="sf-editor-item" data-item=${key} title=${w("item-drag-hint")}
                @pointerdown=${(event) => {
                    if (event.target.closest?.("sf-button-icon")) return;
                    component.onLibraryDown(event, item);
                }}>
                <div class="sf-editor-preview" aria-hidden="true">${skeleton(component.skeleton(item))}</div>
                <sf-button class="sf-editor-item-name" size="1/2" appearance="link" scheme="on-surface" text=${item.label}
                           @click=${(event) => {
                               if (event.detail === 0) component.insertChoice({type: item.type, ...(item.variant ? {variant: item.variant} : {})}, null, item);
                           }}></sf-button>
                ${item.site ? html`<span class="sf-editor-tag">${w("site-block")}</span>` : nothing}
                <sf-button-icon class="sf-editor-star" size="1/3" appearance="ghost" scheme=${favourite ? "primary" : "on-surface-variant"} icon="star"
                                ?filled=${favourite} aria-pressed=${favourite ? "true" : "false"}
                                aria-label=${w(favourite ? "unfavourite" : "favourite", {name: item.label})}
                                @click=${() => component.favourite(item)}></sf-button-icon>
            </li>`;
    })}</ul>`;
}

/** A variant's picture from its own tree: Framework skeleton bars and boxes. */
function skeleton(shapes) {
    const draw = (shape) => {
        switch (shape.kind) {
        case "heading": return html`<sf-skeleton kind="text" size="1/2" width=${shape.level <= 2 ? "70%" : "50%"} height="10px" animation="none"></sf-skeleton>`;
        case "text": return html`<sf-skeleton kind="text" size="1/3" width="90%" height="5px" animation="none"></sf-skeleton>`;
        case "list": return html`<div class="sf-editor-shape-stack">${(shape.children.length ? shape.children : [{kind: "text"}, {kind: "text"}]).slice(0, 3).map(draw)}</div>`;
        case "picture": return html`<sf-skeleton kind="rounded" width="100%" height="28px" animation="none"></sf-skeleton>`;
        case "line": return html`<sf-skeleton kind="text" width="100%" height="1px" animation="none"></sf-skeleton>`;
        case "button": return html`<sf-skeleton kind="rounded" width="36px" height="10px" animation="none" class="sf-editor-shape-accent"></sf-skeleton>`;
        case "card": return html`<div class="sf-editor-shape-card"><sf-skeleton kind="rounded" width="100%" height="16px" animation="none"></sf-skeleton><sf-skeleton kind="text" width="80%" height="5px" animation="none"></sf-skeleton></div>`;
        case "row": return html`<div class="sf-editor-shape-row" style=${`--sf-editor-shape-columns:${Math.max(1, shape.columns)}`}>${shape.children.slice(0, 4).map(draw)}</div>`;
        case "stack": return html`<div class="sf-editor-shape-stack">${shape.children.slice(0, 5).map(draw)}</div>`;
        default: return html`<sf-skeleton kind="rounded" width="100%" height="18px" animation="none"></sf-skeleton>`;
        }
    };
    return shapes.map(draw);
}

function structure(component, view, w) {
    if (!view.tree.length) return html`<p class="sf-editor-quiet">${w("structure-empty")}</p>`;
    return html`<ul class="sf-editor-tree" role="tree" aria-label=${w("left-structure")}>${repeat(view.tree, (row) => row.id, (row) => html`
        <li role="treeitem" aria-level=${row.depth + 1} aria-selected=${row.id === view.model.selected ? "true" : "false"}
            class="sf-editor-tree-row" style=${`--sf-editor-depth:${row.depth}`}>
            <sf-button size="1/2" appearance=${row.id === view.model.selected ? "tonal" : "link"} scheme="on-surface"
                       icon-start=${row.lock ? "lock" : ""} text=${row.excerpt ? `${row.label} · ${row.excerpt}` : row.label}
                       @click=${() => component.choose(row.id)}></sf-button>
        </li>`)}</ul>`;
}

// ------------------------------------------------------------ the path

function pathBar(component, view, w) {
    return html`
        <nav class="sf-editor-path" aria-label=${w("path-label")}>
            <sf-button size="1/3" appearance="link" scheme="on-surface-variant" text=${w("path-page")} @click=${() => component.choose(null)}></sf-button>
            ${view.path.filter((node) => view.model.choosable(node)).map((node) => html`
                <sf-icon icon="chevron_right" size="1/3" class="sf-editor-path-sep" aria-hidden="true"></sf-icon>
                <sf-button size="1/3" appearance="link" scheme=${node.id === view.model.selected ? "primary" : "on-surface-variant"}
                           text=${component.typeLabel(node.type)} aria-current=${node.id === view.model.selected ? "true" : "false"}
                           @click=${() => component.choose(node.id)}></sf-button>`)}
            <span class="sf-editor-spacer"></span>
            <span class="sf-editor-quiet sf-editor-keys">${w(view.model.typing ? "keys-typing" : view.selected ? "keys-chosen" : "keys-page")}</span>
        </nav>
    `;
}

// ------------------------------------------------------------ the right panel

function right(component, view, w) {
    const model = view.model;
    if (!view.selected) {
        const theme = component.main.theme;
        return html`
            <aside class="sf-editor-right" aria-label=${w("right-label")}>
                <h2 class="sf-editor-panel-title">${w(component.builder ? "builder-label" : "page-title")}</h2>
                <p class="sf-editor-quiet">${w("nothing-chosen")}</p>
                ${theme ? html`
                    <section class="sf-editor-group">
                        <h3>${w("theme-title")}</h3>
                        <p>${theme.label ?? theme.name ?? ""}</p>
                        <p class="sf-editor-quiet">${w("theme-read-only")}</p>
                        ${theme.settings_url ? html`<a class="sf-editor-link" href=${theme.settings_url} target="_top">${w("theme-settings")}</a>` : nothing}
                    </section>` : nothing}
                ${view.hasTemplate && !component.builder ? html`
                    <section class="sf-editor-group">
                        <h3>${w("template-title")}</h3>
                        <p class="sf-editor-quiet">${w(component.main.rights.template ? "template-help" : "template-no-rights")}</p>
                    </section>` : nothing}
            </aside>`;
    }
    const tabs = [{id: "parameters", label: w("tab-parameters")}, ...(view.hasData ? [{id: "data", label: w("tab-data")}] : [])];
    const tab = view.hasData && component.rightTab === "data" ? "data" : "parameters";
    return html`
        <aside class="sf-editor-right" aria-label=${w("right-label")}>
            <h2 class="sf-editor-panel-title">${component.typeLabel(view.selected.type)}</h2>
            ${view.lock ? html`
                <p class="sf-editor-locked-note" role="note"><sf-icon icon="lock" size="1/2"></sf-icon>${component.lockText(view.lock)}</p>
                ${view.lock === "template" && component.main.rights.template ? html`<sf-button size="1/2" appearance="outline" scheme="on-surface" text=${w("template-edit")}
                        @click=${() => component.toggleTemplate(true)}></sf-button>` : nothing}` : html`
                ${tabs.length > 1 ? html`<sf-tabs type="underline" size="1/2" .items=${tabs} active-index=${tab === "data" ? 1 : 0}
                         @sf-tabs-change=${(event) => {
                             event.stopPropagation();
                             component.rightTab = event.detail?.selected === "data" ? "data" : "parameters";
                             component.refresh();
                         }}></sf-tabs>` : nothing}
                ${tab === "data" ? dataPanel(component, view, w) : parameters(component, view, w)}
                ${blockActions(component, view, w)}
            `}
        </aside>
    `;
}

function parameters(component, view, w) {
    const screen = component.screenName;
    return html`
        <div class="sf-editor-screen-line">
            <span>${w("editing-for")}</span>
            <sf-button-group size="1/3" appearance="segmented" aria-label=${w("screen-label")} .items=${view.screens} .value=${screen}
                             @change=${(event) => {
                                 event.stopPropagation();
                                 component.setScreen(event.detail?.value ?? event.currentTarget.value);
                             }}></sf-button-group>
        </div>
        ${view.form.length ? html`<div class="sf-editor-fields">${view.form.map((field) => fieldRow(component, field, w))}</div>` : html`<p class="sf-editor-quiet">${w("no-parameters")}</p>`}
        ${component.main.rights.layout ? html`
            <section class="sf-editor-group">
                <sf-input size="1/2" label=${w("modifiers-label")} hint=${w("modifiers-hint")} .value=${view.modifiers}
                          @change=${(event) => component.onModifiers(event)}></sf-input>
                ${component.dropped?.id === view.selected.id ? component.dropped.groups.map((group) => html`<p class="sf-editor-error" role="alert">${w(REFUSED[group.reason] ?? "modifiers-dropped", {classes: group.classes.join(" ")})}</p>`) : nothing}
            </section>` : nothing}
        <dl class="sf-editor-origins" aria-label=${w("origins-label")}>
            ${view.origins.map((origin) => html`<div><dt><span class="sf-editor-origin" data-origin=${origin}>${w(`origin-${origin}`)}</span></dt><dd>${w(`origin-${origin}-help`)}</dd></div>`)}
        </dl>
    `;
}

function fieldRow(component, field, w) {
    const id = `sf-editor-field-${field.key}`;
    const builder = component.builder;
    const exposed = builder?.exposed?.some((entry) => entry.path === component.model.selected && entry.target === `${field.plane}.${field.target}`);
    const value = field.value === undefined || field.value === null ? "" : field.value;
    let control;
    if (field.kind === "toggle") {
        control = html`<sf-switch size="1/2" label=${field.label} .checked=${Boolean(field.value)} @change=${(event) => component.onField(event, field)}></sf-switch>`;
    } else if (field.choiceLabels.length) {
        control = html`<sf-dropdown size="1/2" label=${field.label} .options=${field.choiceLabels} .value=${String(value)}
                                    @change=${(event) => component.onField(event, field)}></sf-dropdown>`;
    } else {
        const numeric = field.kind === "number" || field.kind === "integer";
        control = html`<sf-input size="1/2" label=${field.label} inputmode=${numeric ? "numeric" : ""} .value=${String(value)}
                                 hint=${field.min !== undefined || field.max !== undefined ? w("range-hint", {min: String(field.min ?? ""), max: String(field.max ?? "")}) : ""}
                                 @change=${(event) => component.onField(event, field)}></sf-input>`;
    }
    return html`
        <div class="sf-editor-field" id=${id} data-key=${field.key} data-origin=${field.origin}>
            ${control}
            <div class="sf-editor-field-meta">
                <span class="sf-editor-origin" data-origin=${field.origin} title=${w(`origin-${field.origin}-help`)}>${field.originLabel}</span>
                ${field.responsive && field.screens.length ? html`<span class="sf-editor-quiet">${w("set-for", {screens: field.screensLabel})}</span>` : nothing}
                ${field.utility ? html`<code class="sf-editor-utility" title=${w("utility-help")}>${field.utility}</code>` : nothing}
                ${field.set ? html`<sf-button size="1/3" appearance="link" scheme="on-surface-variant" text=${w("reset")}
                        aria-label=${w("reset-field", {name: field.label})} @click=${() => component.onReset(field)}></sf-button>` : nothing}
            </div>
            ${builder ? html`<sf-switch size="1/2" class="sf-editor-expose" label=${w("expose")} .checked=${Boolean(exposed)}
                    @change=${(event) => {
                        event.stopPropagation();
                        component.toggleExposed(component.model.selected, field, Boolean(event.currentTarget.checked));
                    }}></sf-switch>` : nothing}
        </div>
    `;
}

function dataPanel(component, view, w) {
    const id = view.selected.id;
    const state = component.dataState.get(id) ?? "auto";
    const port = component.sourcePort();
    return html`
        ${!port ? html`<p class="sf-editor-quiet">${w("data-no-port")}</p>` : nothing}
        ${view.data.bindings.map((entry) => {
            const sources = component.answer(`sources:${entry.shape}`, (p) => p.sources(entry.shape)) ?? [];
            const ref = entry.binding?.ref ?? "";
            const source = sources.find((item) => item.id === ref);
            const fields = ref ? component.answer(`fields:${ref}`, (p) => p.fields(ref)) ?? [] : [];
            const shapeFields = component.shapeFields(entry.shape);
            return html`
                <section class="sf-editor-group" aria-label=${entry.target}>
                    <h3>${w("data-binding", {target: component.word(entry.target)})}</h3>
                    <sf-dropdown size="1/2" label=${w("data-source")} placeholder=${w("data-none")} ?disabled=${!port}
                                 .options=${[{value: "", text: w("data-none")}, ...sources.map((item) => ({value: item.id, text: item.label}))]} .value=${ref}
                                 @change=${(event) => component.onSource(event, entry)}></sf-dropdown>
                    ${source?.presets?.length ? html`<sf-dropdown size="1/2" label=${w("data-preset")}
                                 .options=${[{value: "", text: w("data-own-mapping")}, ...source.presets.map((preset) => ({value: preset.id, text: preset.label ?? preset.id}))]}
                                 .value=${entry.settings.preset ?? ""}
                                 @change=${(event) => component.onSetting(event, entry, "preset")}></sf-dropdown>` : nothing}
                    ${ref && !entry.settings.preset ? html`<div class="sf-editor-mapping">
                        <h4>${w("data-mapping")}</h4>
                        ${shapeFields.map((field) => html`<sf-dropdown size="1/2" label=${field}
                                 .options=${[{value: "", text: w("data-none")}, ...fields.map((item) => ({value: item.key, text: item.label}))]}
                                 .value=${entry.settings.mapping?.[field] ?? ""}
                                 @change=${(event) => component.onMapping(event, entry, field)}></sf-dropdown>`)}
                    </div>` : nothing}
                    ${ref && component.listShape(entry.shape) ? html`<sf-input size="1/2" label=${w("data-limit")} inputmode="numeric" .value=${String(entry.settings.limit ?? "")}
                            @change=${(event) => component.onSetting(event, entry, "limit", (value) => (value === "" ? undefined : Math.max(1, Math.min(500, Number.parseInt(value, 10) || 1))))}></sf-input>` : nothing}
                    <sf-input size="1/2" label=${w("data-empty-text")} placeholder=${entry.empty_key ? component.word(entry.empty_key) : ""} .value=${entry.settings.empty_text ?? ""}
                              @change=${(event) => component.onSetting(event, entry, "empty_text", (value) => String(value ?? "").slice(0, 500))}></sf-input>
                </section>`;
        })}
        ${view.data.runtime.map((entry) => html`
            <section class="sf-editor-group">
                <h3>${w("data-runtime", {target: component.word(entry.target)})}</h3>
                <sf-dropdown size="1/2" label=${w("data-follows")}
                             .options=${[{value: "", text: w("data-none")}, ...entry.publishers.map((item) => ({value: `${item.id}#${item.state}`, text: `${component.typeLabel(item.type)} · ${item.state}`}))]}
                             .value=${entry.binding?.ref ?? ""}
                             @change=${(event) => component.onRuntime(event, entry)}></sf-dropdown>
                ${entry.publishers.length ? nothing : html`<p class="sf-editor-quiet">${w("data-no-publishers")}</p>`}
            </section>`)}
        ${view.data.bindings.length ? html`
            <section class="sf-editor-group">
                <h3>${w("data-states")}</h3>
                <sf-button-group size="1/3" appearance="segmented" .items=${view.states} .value=${state}
                                 aria-label=${w("data-states")} @change=${(event) => component.onState(event)}></sf-button-group>
                <p class="sf-editor-quiet">${w("data-states-help")}</p>
            </section>` : nothing}
    `;
}

function blockActions(component, view, w) {
    const node = view.selected;
    const rights = component.model.rights;
    return html`
        <div class="sf-editor-actions">
            <sf-button size="1/2" appearance="outline" scheme="on-surface" icon-start="content_copy" text=${w("menu-duplicate")}
                       @click=${() => component.run(component.model.duplicate(node.id), "duplicated-text")}></sf-button>
            ${rights.layout ? html`<sf-button size="1/2" appearance="outline" scheme="on-surface" icon-start="view_column"
                       text=${w(node.type === "layout.columns" ? "menu-add-column" : "menu-columns")}
                       @click=${() => component.run(node.type === "layout.columns" ? component.model.addColumn(node.id) : component.model.splitColumns(node.id), "columns-text")}></sf-button>` : nothing}
            ${rights.builder && !component.builder ? html`<sf-button size="1/2" appearance="outline" scheme="on-surface" icon-start="dashboard_customize"
                       text=${w(view.typeManifest?.composed ? "menu-change-block" : "menu-make-block")}
                       @click=${() => component.openBuilder({from: node.id})}></sf-button>` : nothing}
            <sf-button size="1/2" appearance="outline" scheme="on-surface" status="error" icon-start="delete" text=${w("menu-remove")}
                       @click=${() => component.run(component.model.remove(node.id), "removed-text")}></sf-button>
        </div>
    `;
}

// ------------------------------------------------------------ the catalogue popover

function popover(component, view, w) {
    const pop = view.pop;
    const list = pop.items;
    return html`
        <div class="sf-editor-pop" role="dialog" aria-label=${w(pop.mode === "slash" ? "slash-label" : "catalogue-label")}
             style=${`inset-block-start:${pop.y}px;inset-inline-start:${pop.x}px`}>
            ${pop.mode === "slash" ? html`<p class="sf-editor-quiet">${component.popQuery ? w("slash-filter", {query: component.popQuery}) : w("slash-hint")}</p>` : html`
                <sf-input size="1/2" input-type="search" icon-start="search" placeholder=${w("search-placeholder")} aria-label=${w("search-placeholder")}
                          .value=${component.popQuery}
                          @input=${(event) => {
                              event.stopPropagation();
                              component.popQuery = String(event.currentTarget.value ?? "");
                              component.popActive = 0;
                              component.refresh();
                          }}></sf-input>`}
            ${!component.popQuery && pop.tabs.length > 1 ? html`
                <sf-button-group size="1/3" appearance="segmented" full-width .items=${pop.tabs.map((entry) => ({value: entry.id, label: w(`tab-${entry.id}`)}))}
                                 .value=${pop.tab} aria-label=${w("catalogue-tabs")}
                                 @change=${(event) => {
                                     event.stopPropagation();
                                     component.pop = {...component.pop, tab: String(event.detail?.value ?? event.currentTarget.value)};
                                     component.popActive = 0;
                                     component.refresh();
                                 }}></sf-button-group>` : nothing}
            <ul id="sf-editor-pop-list" class="sf-editor-pop-list" role="listbox" tabindex="0" aria-label=${w("catalogue-label")}>
                ${list.length ? list.map((item, index) => html`
                    <li role="option" id=${`sf-editor-pop-${index}`} aria-selected=${index === component.popActive ? "true" : "false"}
                        class=${index === component.popActive ? "is-active" : ""} data-item=${`${item.type}${item.variant ? `#${item.variant}` : ""}`}
                        @pointerenter=${() => {
                            if (component.popActive === index) return;
                            component.popActive = index;
                            component.refresh();
                        }}
                        @mousedown=${(event) => event.preventDefault()}
                        @click=${() => component.chooseItem(item)}>
                        <div class="sf-editor-preview sf-editor-preview--small" aria-hidden="true">${skeleton(component.skeleton(item))}</div>
                        <span class="sf-editor-option-name" data-label=${item.label}>${item.label}</span>
                        <span class="sf-editor-quiet sf-editor-option-note">${item.variant ? item.typeLabel : component.word(`group-${item.group}`)}</span>
                    </li>`) : html`<li class="sf-editor-quiet" role="presentation">${w("nothing-fits")}</li>`}
            </ul>
        </div>
    `;
}

function outputModal(component, w) {
    const tabs = ["json", "html", "markdown"].map((id) => ({id, label: w(`output-${id}`)}));
    const index = Math.max(0, ["json", "html", "markdown"].indexOf(component.outputView.format));
    return html`
        <sf-modal class="sf-editor-output" heading=${w("output-title")} width="min(960px, 92vw)"
                  @sf-modal-closed=${() => {
                      component.outputView = null;
                      component.refresh();
                  }}>
            <div slot="content" class="sf-editor-output-body">
                <sf-tabs type="underline" size="1/2" .items=${tabs} active-index=${index}
                         @sf-tabs-change=${(event) => {
                             event.stopPropagation();
                             component.openOutput(String(event.detail?.selected ?? "json"));
                         }}></sf-tabs>
                <pre class="sf-editor-output-text" tabindex="0" aria-label=${w(`output-${component.outputView.format}`)}>${component.outputView.text ?? ""}</pre>
            </div>
        </sf-modal>
    `;
}
