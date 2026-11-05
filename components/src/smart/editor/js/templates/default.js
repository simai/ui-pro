import {html, nothing} from "lit";
import {repeat} from "lit/directives/repeat.js";
import "./default.css";
import {groupWordKey} from "../catalogue.mjs";

// The editor's frame: the bar (screens, undo, the template, output), the
// library and the structure on the left, the page in the middle with what
// only editing draws over it (the hover and chosen frames, the gutter with
// + and the grip, the drop line), the parameter and data panel on the right,
// and the path of the chosen block under the page.
//
// 1.1.0 (visual parity with the accepted prototype, 2026-11-04): one bar row
// (undo and redo, the screens in the centre, help, output and the theme as
// icon buttons, the host's own controls in the slots start and actions);
// the library as sections with icons and counts that open in place; the
// page as a sheet on a quiet background; a frame and a floating bar over
// the chosen block; the parameter panel with the block's icon, name and
// section, tabs Parameters / JSON / HTML, fields under Content, Layout and
// More, each with where its value comes from and its Framework binding. The page itself is drawn
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
                        <div class="sf-editor-gutter-hint" aria-hidden="true" hidden>${w("gutter-hint")}</div>
                        ${toolbar(component, view, w)}
                    </div>
                    ${pathBar(component, view, w)}
                </div>
                ${right(component, view, w)}
            </div>
            ${view.pop ? popover(component, view, w) : nothing}
            ${component.helpOpen ? helpPop(component, w) : nothing}
            ${component.lockNote ? html`<div class="sf-editor-lock-note" role="status"
                    style=${`inset-block-start:${component.lockNote.y + 12}px;inset-inline-start:${component.lockNote.x}px`}>
                <sf-icon icon="lock" size="1/3"></sf-icon><span>${component.lockNote.text}</span></div>` : nothing}
            <sf-menu-context class="sf-editor-menu" size="1/2" @sf-menu-context-select=${(event) => component.onMenuSelect(event)}></sf-menu-context>
            <sf-editor-inline></sf-editor-inline>
            ${component.outputView ? outputModal(component, w) : nothing}
        </div>
    `;
}

/** A host's own controls in a slot of the bar (the page list toggle, the language switch): one row, not two. */
function slotted(component, name) {
    return component.hasSlotContent?.(name) ? html`<div class="sf-editor-slot" data-slot=${name}>${component.getSlotContent(name)}</div>` : nothing;
}

function bar(component, view, w) {
    const model = view.model;
    const template = view.hasTemplate && component.main.rights.template && !component.builder;
    const theme = component.main.theme;
    const themeName = theme?.label ?? theme?.name ?? "";
    return html`
        <div class="sf-editor-bar" role="toolbar" aria-label=${w("bar-label")}>
            <div class="sf-editor-bar-start">
                ${slotted(component, "start")}
                ${view.heading ? html`<span class="sf-editor-title"><strong class="sf-editor-title-name">${view.heading}</strong>${view.caption ? html`<span class="sf-editor-title-caption">${view.caption}</span>` : nothing}</span>` : nothing}
                <sf-button-icon size="1/2" appearance="ghost" scheme="on-surface-variant" icon="undo" aria-label=${w("undo-label")} title=${`${w("undo-label")} (⌘Z)`}
                                ?disabled=${!model.canUndo} @click=${() => component.history("undo")}></sf-button-icon>
                <sf-button-icon size="1/2" appearance="ghost" scheme="on-surface-variant" icon="redo" aria-label=${w("redo-label")} title=${`${w("redo-label")} (⇧⌘Z)`}
                                ?disabled=${!model.canRedo} @click=${() => component.history("redo")}></sf-button-icon>
                ${template ? html`<sf-button class="sf-editor-template-toggle" size="1/3" appearance=${model.templateEditing ? "tonal" : "link"} scheme=${model.templateEditing ? "primary" : "on-surface-variant"}
                        icon-start=${model.templateEditing ? "check" : ""} text=${w(model.templateEditing ? "template-done" : "template-edit")}
                        @click=${() => component.toggleTemplate(!model.templateEditing)}></sf-button>` : nothing}
                ${model.templateEditing ? html`<span class="sf-editor-badge">${w("template-badge")}</span>` : nothing}
            </div>
            <sf-button-group class="sf-editor-screens" size="1/2" appearance="segmented" plate="raised" aria-label=${w("screen-label")}
                             .items=${view.screens} .value=${component.screenName}
                             @change=${(event) => {
                                 event.stopPropagation();
                                 component.setScreen(event.detail?.value ?? event.currentTarget.value);
                             }}></sf-button-group>
            <div class="sf-editor-bar-end">
                ${slotted(component, "actions")}
                <sf-button-icon class="sf-editor-help-open" size="1/2" appearance="ghost" scheme="on-surface-variant" icon="help"
                                aria-label=${w("help-label")} title=${w("help-label")} aria-haspopup="dialog" aria-expanded=${component.helpOpen ? "true" : "false"}
                                @click=${(event) => component.toggleHelp(event)}></sf-button-icon>
                <sf-button-icon class="sf-editor-output-open" size="1/2" appearance="ghost" scheme="on-surface-variant" icon="data_object"
                                aria-label=${w("output-open")} title=${w("output-open")} aria-haspopup="dialog"
                                @click=${() => component.openOutput("json")}></sf-button-icon>
                ${themeName ? html`<sf-button-icon class="sf-editor-theme-open" size="1/2" appearance="ghost" scheme="on-surface-variant" icon="palette"
                                aria-label=${w("theme-label", {name: themeName})} title=${`${w("theme-label", {name: themeName})}. ${w("theme-read-only")}`}
                                @click=${() => component.showTheme()}></sf-button-icon>` : nothing}
            </div>
        </div>
    `;
}

function helpPop(component, w) {
    return html`
        <div class="sf-editor-help-pop" role="dialog" aria-label=${w("help-label")} style=${`inset-block-start:${component.helpOpen.y}px;inset-inline-end:${component.helpOpen.x}px`}>
            <h2 class="sf-editor-help-title">${w("help-title")}</h2>
            <ol class="sf-editor-help-list">
                ${["help-1", "help-2", "help-3", "help-4"].map((key) => html`<li>${w(key)}</li>`)}
            </ol>
        </div>
    `;
}

function builderBar(component, w) {
    const builder = component.builder;
    return html`
        <div class="sf-editor-builder-bar" role="region" aria-label=${w("builder-label")}>
            <sf-icon icon="dashboard_customize" size="1/3"></sf-icon>
            <strong>${w(builder.editing ? "builder-editing" : "builder-new")}</strong>
            <sf-input size="1/2" label=${w("builder-name")} .value=${builder.name ?? ""} ?readonly=${builder.editing}
                      @input=${(event) => {
                          event.stopPropagation();
                          builder.name = String(event.currentTarget.value ?? "");
                          component.refresh();
                      }}></sf-input>
            <sf-dropdown size="1/2" label=${w("builder-group")} .options=${component.builderGroups().map((id) => ({value: id, text: component.word(groupWordKey(id))}))}
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

const heading = (icon, text, id = undefined) => html`<h3 class="sf-editor-heading" id=${id ?? nothing}><sf-icon icon=${icon} size="1/3" aria-hidden="true"></sf-icon><span>${text}</span></h3>`;

/**
 * The library: a search; Favourites and Recent; the sections, each with its
 * icon, word and count, opening in place with «Back»; a type with variants
 * shows them as cards with a picture drawn from each variant's tree. A
 * search lists what it found under the section each belongs to.
 */
function library(component, view, w) {
    const lib = view.library;
    const searching = Boolean(component.libraryQuery);
    const open = !searching && lib.section ? lib.sections.find((section) => section.id === lib.section) : null;
    return html`
        <sf-input class="sf-editor-search" size="1/2" appearance="filled" input-type="search" icon-start="search" placeholder=${w("search-placeholder")}
                  aria-label=${w("search-placeholder")} .value=${component.libraryQuery}
                  @input=${(event) => {
                      event.stopPropagation();
                      component.libraryQuery = String(event.currentTarget.value ?? "");
                      component.refresh();
                  }}></sf-input>
        ${searching ? html`
            <div class="sf-editor-found" role="region" aria-label=${w("search-results")}>
                ${lib.found.length ? lib.found.map((section) => html`
                    <section class="sf-editor-group" aria-labelledby=${`sf-editor-h-found-${section.id}`}>
                        ${heading(section.icon, component.word(section.labelKey), `sf-editor-h-found-${section.id}`)}
                        ${rows(component, section.types.flatMap((type) => type.items), w, {note: (item) => (item.variant ? item.typeLabel : "")})}
                    </section>`) : html`<p class="sf-editor-quiet">${w("nothing-found")}</p>`}
            </div>` : open ? html`
            <section class="sf-editor-group sf-editor-open-section" aria-labelledby="sf-editor-h-open">
                <div class="sf-editor-back">
                    <sf-button size="1/2" appearance="link" scheme="on-surface" icon-start="arrow_back" text-position="start" text=${component.word(open.labelKey)}
                               aria-label=${`${w("back")}: ${component.word(open.labelKey)}`}
                               @click=${() => component.openSection("")}></sf-button>
                </div>
                <h3 id="sf-editor-h-open" class="sf-editor-visually-hidden">${component.word(open.labelKey)}</h3>
                ${open.types.map((type) => typeEntry(component, type, w, type.items[0]?.group !== open.id ? w("from-section", {name: component.word(groupWordKey(type.items[0].group))}) : ""))}
            </section>` : html`
            <section class="sf-editor-group" aria-labelledby="sf-editor-h-favourites">${heading("star", w("favourites"), "sf-editor-h-favourites")}${lib.favourites.length ? rows(component, lib.favourites, w) : html`<p class="sf-editor-hint sf-editor-empty-list">${w("favourites-empty")}</p>`}</section>
            ${lib.recent.length ? html`<section class="sf-editor-group" aria-labelledby="sf-editor-h-recent">${heading("history", w("recent"), "sf-editor-h-recent")}${rows(component, lib.recent, w)}</section>` : nothing}
            ${component.main.rights.builder && !component.builder ? html`
                <sf-button class="sf-editor-make" size="1/3" appearance="link" scheme="on-surface-variant" icon-start="add"
                           text=${w("builder-start")} @click=${() => component.openBuilder({from: null})}></sf-button>` : nothing}
            <section class="sf-editor-group" aria-labelledby="sf-editor-h-sections">
                ${heading("category", w("sections"), "sf-editor-h-sections")}
                ${lib.sections.length ? html`<ul class="sf-editor-sections" role="list">${lib.sections.map((section) => html`
                    <li class="sf-editor-section-row" data-section=${section.id} @click=${(event) => {
                        if (event.target.closest?.("sf-button")) return;
                        component.openSection(section.id);
                    }}>
                        <sf-icon icon=${section.icon} size="1/2" aria-hidden="true"></sf-icon>
                        <sf-button class="sf-editor-section-name" size="1/2" appearance="link" scheme="on-surface" text-position="start" text=${component.word(section.labelKey)}
                                   aria-label=${w("section-open", {name: component.word(section.labelKey), count: String(section.count)})}
                                   @click=${() => component.openSection(section.id)}></sf-button>
                        <span class="sf-editor-count" aria-hidden="true">${section.count}</span>
                        <sf-icon class="sf-editor-chevron" icon="chevron_right" size="1/2" aria-hidden="true"></sf-icon>
                    </li>`)}</ul>` : html`<p class="sf-editor-quiet">${w("nothing-fits")}</p>`}
            </section>
        `}
        <p class="sf-editor-hint sf-editor-library-hint">${w("item-drag-hint")}</p>
    `;
}

/** A type in an open section: its row, and under it its variants as cards (open unless the person closed them). */
function typeEntry(component, type, w, from = "") {
    const variants = type.items.filter((item) => item.variant);
    if (!variants.length) return rows(component, type.items, w, from ? {note: () => from} : undefined);
    const closed = component.libraryClosed.has(type.type);
    const first = variants[0];
    return html`
        ${rows(component, [{...first, label: type.label, variant: first.variant}], w, {
            note: () => [w("variants-count", {count: String(variants.length)}), from].filter(Boolean).join(" · "),
            toggle: {open: !closed, onToggle: () => component.toggleVariants(type.type)},
            favourite: false,
        })}
        ${closed ? nothing : html`<ul class="sf-editor-variants" role="list" aria-label=${type.label}>${repeat(variants, (item) => item.variant, (item) => html`
            <li class="sf-editor-item sf-editor-variant" data-item=${`${item.type}#${item.variant}`} title=${w("item-drag-hint")}
                @pointerdown=${(event) => component.onLibraryDown(event, item)}>
                <div class="sf-editor-preview" aria-hidden="true">${skeleton(component.skeleton(item))}</div>
                <sf-button class="sf-editor-item-name" size="1/3" appearance="link" scheme="on-surface" text-position="start" text=${item.label}
                           @click=${(event) => {
                               if (event.detail === 0) component.insertChoice({type: item.type, variant: item.variant}, null, item);
                           }}></sf-button>
            </li>`)}</ul>`}
    `;
}

/** Library rows: the type's icon, its name (a press inserts it), a note, the star. */
function rows(component, list, w, {note = (item) => (item.variant ? item.typeLabel : ""), toggle = null, favourite = true} = {}) {
    return html`<ul class="sf-editor-items" role="list">${repeat(list, (item) => `${item.type}#${item.variant ?? ""}`, (item) => {
        const key = `${item.type}${item.variant ? `#${item.variant}` : ""}`;
        const starred = component.favourites.includes(key);
        const said = [note(item), item.site ? w("site-block") : ""].filter(Boolean).join(" · ");
        return html`
            <li class="sf-editor-item" data-item=${key} title=${w("item-drag-hint")}
                @pointerdown=${(event) => {
                    if (event.target.closest?.("sf-button-icon")) return;
                    component.onLibraryDown(event, item);
                }}>
                <sf-icon class="sf-editor-item-icon" icon=${item.icon ?? "widgets"} size="1/2" aria-hidden="true"></sf-icon>
                <span class="sf-editor-item-text">
                    <sf-button class="sf-editor-item-name" size="1/2" appearance="link" scheme="on-surface" text-position="start" text=${item.label}
                               @click=${(event) => {
                                   if (event.detail === 0) component.insertChoice({type: item.type, ...(item.variant ? {variant: item.variant} : {})}, null, item);
                               }}></sf-button>
                    ${said ? html`<span class="sf-editor-item-note">${said}</span>` : nothing}
                </span>
                ${favourite ? html`<sf-button-icon class="sf-editor-star" size="1/3" appearance="ghost" scheme="on-surface-variant" icon="star"
                                ?filled=${starred} data-on=${starred ? "true" : "false"} aria-pressed=${starred ? "true" : "false"}
                                aria-label=${w(starred ? "unfavourite" : "favourite", {name: item.label})}
                                @click=${() => component.favourite(item)}></sf-button-icon>` : nothing}
                ${toggle ? html`<sf-button-icon class="sf-editor-variants-toggle" size="1/3" appearance="ghost" scheme="on-surface-variant" icon=${toggle.open ? "expand_less" : "expand_more"}
                                aria-expanded=${toggle.open ? "true" : "false"} aria-label=${w("variants-label", {name: item.label})}
                                @click=${() => toggle.onToggle()}></sf-button-icon>` : nothing}
            </li>`;
    })}</ul>`;
}

/**
 * A variant's picture from its own tree (skeletonOf): Framework skeleton
 * bars and boxes; a section draws its background and width, a grid its
 * columns, a button an accent pill (outlined when it is), an icon a dot, a
 * spacer a gap.
 */
function skeleton(shapes) {
    const draw = (shape) => {
        switch (shape.kind) {
        case "heading": return html`<sf-skeleton kind="text" size="1/2" width=${shape.level <= 1 ? "75%" : shape.level === 2 ? "60%" : "45%"} height=${shape.level <= 2 ? "8px" : "6px"} animation="none"></sf-skeleton>`;
        case "text": return html`<sf-skeleton kind="text" size="1/3" width="90%" height="4px" animation="none"></sf-skeleton>`;
        case "list": return html`<div class="sf-editor-shape-stack">${(shape.children.length ? shape.children : [{kind: "text"}, {kind: "text"}]).slice(0, 3).map(draw)}</div>`;
        case "picture": return html`<sf-skeleton kind="rounded" width="100%" height="20px" animation="none" class="sf-editor-shape-accent"></sf-skeleton>`;
        case "line": return html`<span class="sf-editor-shape-line"></span>`;
        case "button": return html`<span class="sf-editor-shape-button" data-look=${shape.look ?? "fill"}><span class="sf-editor-shape-pill"></span>${shape.icon ? html`<span class="sf-editor-shape-dot"></span>` : nothing}</span>`;
        case "dot": return html`<span class="sf-editor-shape-dot sf-editor-shape-dot--large"></span>`;
        case "badge": return html`<span class="sf-editor-shape-pill sf-editor-shape-pill--short"></span>`;
        case "gap": return html`<span class="sf-editor-shape-gap"></span>`;
        case "field": return html`<span class="sf-editor-shape-field" ?data-tall=${shape.tall}></span>`;
        case "cell": return html`<span class="sf-editor-shape-cell"></span>`;
        case "card": return html`<div class="sf-editor-shape-card"><sf-skeleton kind="rounded" width="100%" height="12px" animation="none" class="sf-editor-shape-accent"></sf-skeleton><sf-skeleton kind="text" width="80%" height="4px" animation="none"></sf-skeleton></div>`;
        case "row": return html`<div class="sf-editor-shape-row" style=${`--sf-editor-shape-columns:${Math.max(1, shape.columns)}`}>${shape.children.slice(0, 4).map(draw)}</div>`;
        case "stack": return html`<div class="sf-editor-shape-stack">${shape.children.slice(0, 5).map(draw)}</div>`;
        case "section": return html`<div class="sf-editor-shape-section" data-background=${shape.background} data-width=${shape.width}><div class="sf-editor-shape-box">${shape.children.slice(0, 4).map(draw)}</div></div>`;
        default: return html`<sf-skeleton kind="rounded" width="100%" height="14px" animation="none"></sf-skeleton>`;
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
                       icon-start=${row.icon} icon-end=${row.lock ? "lock" : ""} text=${row.excerpt ? `${row.label} · ${row.excerpt}` : row.label}
                       @click=${() => component.choose(row.id)}></sf-button>
        </li>`)}</ul>`;
}

// ------------------------------------------------------------ the floating bar over the chosen block

/** The chosen block's bar: where it stands (the last three steps of its path), the grip, up, down, duplicate, more. */
function toolbar(component, view, w) {
    const node = view.selected;
    const show = node && !view.lock && !view.model.typing && !component.drag;
    const crumbs = node ? view.path.filter((entry) => view.model.choosable(entry)).slice(-3) : [];
    const at = node ? view.position : null;
    return html`
        <div class="sf-editor-toolbar" role="region" aria-label=${w("toolbar-label")} ?hidden=${!show}>
            ${show ? html`<div class="sf-editor-toolbar-row" role="toolbar" aria-label=${w("toolbar-label")}>
                <span class="sf-editor-crumbs">${crumbs.map((entry, index) => index === crumbs.length - 1
                    ? html`<strong class="sf-editor-crumb-here">${component.typeLabel(entry.type)}</strong>`
                    : html`<sf-button size="1/3" appearance="link" scheme="on-surface-variant" text=${component.typeLabel(entry.type)} @click=${() => component.choose(entry.id)}></sf-button>
                        <sf-icon class="sf-editor-path-sep" icon="chevron_right" size="1/3" aria-hidden="true"></sf-icon>`)}</span>
                <sf-button-icon class="sf-editor-toolbar-grip" size="1/3" appearance="ghost" scheme="on-surface-variant" icon="drag_indicator"
                                aria-label=${w("grip-label")} title=${w("grip-label")} aria-haspopup="menu"
                                @pointerdown=${(event) => component.onToolbarGrip(event)}
                                @keydown=${(event) => component.onGripKey(event, node.id)}></sf-button-icon>
                <sf-button-icon size="1/3" appearance="ghost" scheme="on-surface-variant" icon="arrow_upward" aria-label=${w("menu-up")} title=${`${w("menu-up")} (Alt+↑)`}
                                ?disabled=${!at || at.first} @click=${() => component.moveBy(node.id, -1)}></sf-button-icon>
                <sf-button-icon size="1/3" appearance="ghost" scheme="on-surface-variant" icon="arrow_downward" aria-label=${w("menu-down")} title=${`${w("menu-down")} (Alt+↓)`}
                                ?disabled=${!at || at.last} @click=${() => component.moveBy(node.id, 1)}></sf-button-icon>
                <sf-button-icon size="1/3" appearance="ghost" scheme="on-surface-variant" icon="content_copy" aria-label=${w("menu-duplicate")} title=${`${w("menu-duplicate")} (⌘D)`}
                                @click=${() => component.run(component.model.duplicate(node.id), "duplicated-text")}></sf-button-icon>
                <sf-button-icon class="sf-editor-toolbar-more" size="1/3" appearance="ghost" scheme="on-surface-variant" icon="more_horiz" aria-label=${w("menu-more")} title=${w("menu-more")} aria-haspopup="menu"
                                @click=${(event) => component.openGripMenu(node.id, event.currentTarget)}></sf-button-icon></div>` : nothing}
        </div>
    `;
}

// ------------------------------------------------------------ the path

function pathBar(component, view, w) {
    return html`
        <nav class="sf-editor-path" aria-label=${w("path-label")}>
            <sf-button size="1/3" appearance="link" scheme="on-surface-variant" text=${w("path-page")} @click=${() => component.choose(null)}></sf-button>
            ${view.path.filter((node) => view.model.choosable(node)).map((node) => html`
                <sf-icon icon="chevron_right" size="1/3" class="sf-editor-path-sep" aria-hidden="true"></sf-icon>
                <sf-button size="1/3" appearance="link" scheme="on-surface-variant" class=${node.id === view.model.selected ? "sf-editor-path-here" : ""}
                           text=${component.typeLabel(node.type)} aria-current=${node.id === view.model.selected ? "true" : "false"}
                           @click=${() => component.choose(node.id)}></sf-button>`)}
            <span class="sf-editor-spacer"></span>
            <span class="sf-editor-keys">${w(view.model.typing ? "keys-typing" : view.selected ? "keys-chosen" : "keys-page")}</span>
        </nav>
    `;
}

// ------------------------------------------------------------ the right panel

/** The panel's head: the block's (or the page's) icon, its name and the section it belongs to. */
function panelHead(icon, title, sub) {
    return html`
        <div class="sf-editor-panel-head">
            <span class="sf-editor-panel-icon" aria-hidden="true"><sf-icon icon=${icon} size="1/2"></sf-icon></span>
            <div class="sf-editor-panel-names">
                <h2 class="sf-editor-panel-title">${title}</h2>
                ${sub ? html`<p class="sf-editor-panel-sub">${sub}</p>` : nothing}
            </div>
        </div>
    `;
}

function right(component, view, w) {
    if (!view.selected && !component.builder && (view.page || component.hasSlotContent?.("page"))) return pagePanel(component, view, w);
    if (!view.selected) {
        const theme = component.main.theme;
        return html`
            <aside class="sf-editor-right" aria-label=${w("right-label")}>
                ${panelHead(component.builder ? "dashboard_customize" : "article", w(component.builder ? "builder-label" : "page-title"), "")}
                <p class="sf-editor-empty-state"><sf-icon icon="arrow_selector_tool" size="1/3" aria-hidden="true"></sf-icon><span>${w("nothing-chosen")}</span></p>
                <dl class="sf-editor-facts">
                    ${theme ? html`
                        <div><dt>${w("theme-title")}</dt><dd><span>${theme.label ?? theme.name ?? ""}</span><span class="sf-editor-hint">${w("theme-read-only")}</span>
                            ${theme.settings_url ? html`<a class="sf-editor-link" href=${theme.settings_url} target="_top">${w("theme-settings")}</a>` : nothing}</dd></div>` : nothing}
                    ${view.hasTemplate && !component.builder ? html`
                        <div><dt>${w("template-title")}</dt><dd class="sf-editor-hint">${w(component.main.rights.template ? "template-help" : "template-no-rights")}</dd></div>` : nothing}
                </dl>
            </aside>`;
    }
    const tabs = [
        {id: "parameters", label: w("tab-parameters")},
        ...(view.hasData ? [{id: "data", label: w("tab-data")}] : []),
        {id: "json", label: w("tab-json")},
        {id: "html", label: w("tab-html")},
    ];
    const tab = tabs.some((entry) => entry.id === component.rightTab) ? component.rightTab : "parameters";
    const sub = [view.sectionLabel, view.typeManifest?.composed ? w("site-block") : "", view.lock ? w("locked") : ""].filter(Boolean).join(" · ");
    return html`
        <aside class="sf-editor-right" aria-label=${w("right-label")}>
            ${panelHead(view.typeIcon, component.typeLabel(view.selected.type), sub)}
            <sf-tabs class="sf-editor-right-tabs" type="underline" size="1/2" .items=${tabs} active-index=${Math.max(0, tabs.findIndex((entry) => entry.id === tab))}
                     @sf-tabs-change=${(event) => {
                         event.stopPropagation();
                         component.setRightTab(String(event.detail?.selected ?? "parameters"));
                     }}></sf-tabs>
            ${tab === "json" ? codeView(component, view, "json", w) : tab === "html" ? codeView(component, view, "html", w) : view.lock ? html`
                <p class="sf-editor-locked-note" role="note"><sf-icon icon="lock" size="1/3"></sf-icon>${component.lockText(view.lock)}</p>
                ${view.lock === "template" && component.main.rights.template ? html`<sf-button size="1/2" appearance="outline" scheme="on-surface" text=${w("template-edit")}
                        @click=${() => component.toggleTemplate(true)}></sf-button>` : nothing}` : tab === "data" ? dataPanel(component, view, w) : parameters(component, view, w)}
        </aside>
    `;
}

/**
 * Nothing chosen, and the host gave the page's settings (page-settings) or
 * markup in the slot page (1.2.0, the prototype's page panel): name and
 * address, the site template, the theme with the way to its settings,
 * publishing and history. The editor keeps none of it; every change and press
 * goes out as page-change or page-action and the host sets page-settings again.
 */
function pagePanel(component, view, w) {
    const page = view.page ?? {};
    const theme = page.theme ?? component.main.theme;
    const template = page.template;
    const options = Array.isArray(template?.options) ? template.options.map((option) => ({value: String(option.value), text: String(option.text ?? option.label ?? option.value)})) : [];
    const change = (key) => (event) => {
        event.stopPropagation();
        const value = event.detail?.value ?? event.currentTarget.value ?? "";
        component.sfEmit("page-change", {key, value: String(Array.isArray(value) ? value[0] ?? "" : value)});
    };
    const action = (name) => () => component.sfEmit("page-action", {action: name});
    const history = page.history;
    return html`
        <aside class="sf-editor-right" aria-label=${w("right-label")}>
            ${panelHead("article", page.name || w("page-title"), page.status ?? "")}
            <div class="sf-editor-page">
                ${"name" in page ? html`<sf-input class="sf-editor-page-field" data-key="name" size="1/2" label=${w("page-name")} .value=${String(page.name ?? "")}
                        @change=${change("name")}></sf-input>` : nothing}
                ${"address" in page ? html`<sf-input class="sf-editor-page-field" data-key="address" size="1/2" label=${w("page-address")} .value=${String(page.address ?? "")}
                        @change=${change("address")}></sf-input>` : nothing}
                ${template ? html`
                    <div class="sf-editor-page-field" data-key="template">
                        ${options.length ? html`<sf-dropdown size="1/2" label=${w("template-title")} .options=${options} .value=${String(template.value ?? "")}
                                @change=${change("template")}></sf-dropdown>` : html`
                            <span class="sf-editor-page-label">${w("template-title")}</span><span class="sf-editor-page-value">${template.label ?? template.value ?? ""}</span>`}
                        <span class="sf-editor-hint">${template.note ?? w(component.main.rights.template ? "template-help" : "template-no-rights")}</span>
                    </div>` : nothing}
                ${theme ? html`
                    <div class="sf-editor-page-field" data-key="theme">
                        <span class="sf-editor-page-label">${w("page-theme")}</span>
                        <div class="sf-editor-page-row">
                            <span class="sf-editor-page-value">${theme.label ?? theme.name ?? ""}</span>
                            ${theme.settings_url ? html`<a class="sf-editor-page-link" href=${theme.settings_url} target="_top">${w("theme-settings")}<sf-icon icon="open_in_new" size="1/3" aria-hidden="true"></sf-icon></a>` : nothing}
                        </div>
                        <span class="sf-editor-hint">${w("theme-read-only")}</span>
                    </div>` : nothing}
                ${page.publish || history ? html`
                    <div class="sf-editor-page-field" data-key="publish">
                        <span class="sf-editor-page-label">${w("page-publishing")}</span>
                        <div class="sf-editor-page-row">
                            ${page.publish ? html`<sf-button size="1/2" scheme="primary" text=${page.publish.label ?? w("page-publish")}
                                    ?disabled=${Boolean(page.publish.disabled)} @click=${action("publish")}></sf-button>` : nothing}
                            ${history ? html`<sf-button size="1/2" appearance="outline" scheme="on-surface" icon-start="history"
                                    text=${history.label ?? (Number.isFinite(history.count) ? w("page-history", {count: String(history.count)}) : w("page-history-plain"))}
                                    @click=${action("history")}></sf-button>` : nothing}
                        </div>
                        ${page.publish?.note ? html`<span class="sf-editor-hint">${page.publish.note}</span>` : nothing}
                    </div>` : nothing}
                ${slotted(component, "page")}
                <p class="sf-editor-card"><sf-icon icon="arrow_selector_tool" size="1/3" aria-hidden="true"></sf-icon><span>${w("page-hint")}</span></p>
            </div>
        </aside>`;
}

/** The chosen block as the Document holds it (JSON) or as the site prints it (HTML). */
function codeView(component, view, format, w) {
    const text = component.codeOf(view.selected.id, format);
    return html`
        <pre class="sf-editor-code" tabindex="0" aria-label=${w(`tab-${format}`)}>${text ?? "…"}</pre>
        <p class="sf-editor-hint">${w(`${format}-note`)}</p>
    `;
}

const SECTIONS = ["content", "layout", "extra"];

function parameters(component, view, w) {
    const bySection = Object.fromEntries(SECTIONS.map((id) => [id, view.form.filter((field) => field.section === id)]));
    // A site block's instance shows its author the exposed parameters only
    // (1.2.0, the ui-editor host's G-42): no own classes, nothing else.
    const instance = Boolean(view.typeManifest?.composed);
    const modifiers = component.main.rights.layout && !instance;
    if (!view.form.length && !modifiers) return html`<p class="sf-editor-hint">${w("no-parameters")}</p>`;
    const sets = [...new Set(view.form.map((field) => /^sf\.composition\.set_([a-z_]+)\./u.exec(String(field.label_key ?? ""))?.[1]).filter(Boolean))];
    return html`
        <p class="sf-editor-card sf-editor-sets"><sf-icon icon="link" size="1/3" aria-hidden="true"></sf-icon><span>${sets.length
            ? w("sets-note", {sets: sets.map((set) => w(`set-${set.replace(/_/gu, "-")}`)).join(" · ")})
            : w("sets-none")}</span></p>
        ${SECTIONS.map((id) => (bySection[id].length || (id === "extra" && modifiers)) ? html`
            <section class="sf-editor-group sf-editor-fields" aria-labelledby=${`sf-editor-h-${id}`}>
                <h3 class="sf-editor-heading" id=${`sf-editor-h-${id}`}>${w(`section-${id}`)}</h3>
                ${bySection[id].map((field) => fieldRow(component, field, w))}
                ${id === "extra" && modifiers ? modifiersRow(component, view, w) : nothing}
            </section>` : nothing)}
        ${view.form.some((field) => field.responsive) ? html`<p class="sf-editor-card"><sf-icon icon="devices" size="1/3" aria-hidden="true"></sf-icon><span>${w("screens-note", {screen: w(`screen-${component.screenName}`)})}</span></p>` : nothing}
        <p class="sf-editor-card sf-editor-origins" aria-label=${w("origins-label")}>${w("origins-note")}</p>
    `;
}

function modifiersRow(component, view, w) {
    return html`
        <div class="sf-editor-modifiers-row">
            <div class="sf-editor-field-head"><span class="sf-editor-field-label">${w("modifiers-label")}</span></div>
            <sf-input class="sf-editor-modifiers" size="1/2" aria-label=${w("modifiers-label")} placeholder=${w("modifiers-placeholder")} .value=${view.modifiers}
                      @change=${(event) => component.onModifiers(event)}></sf-input>
            <span class="sf-editor-hint">${w("modifiers-hint")}</span>
            ${component.dropped?.id === view.selected.id ? component.dropped.groups.map((group) => html`<p class="sf-editor-error" role="alert">${w(REFUSED[group.reason] ?? "modifiers-dropped", {classes: group.classes.join(" ")})}</p>`) : nothing}
        </div>
    `;
}

/** A short choice draws as a segmented switch, as the prototype does; a long one as a list. */
const segmented = (field) => field.choiceLabels.length >= 2 && field.choiceLabels.length <= 3 && field.choiceLabels.every((choice) => String(choice.text).length <= 12);

/** A whole number of at most six steps (a heading's level) draws as a segmented switch too. */
const steps = (field) => (field.kind === "integer" && Number.isInteger(field.min) && Number.isInteger(field.max) && field.max > field.min && field.max - field.min <= 5
    ? Array.from({length: field.max - field.min + 1}, (_, index) => ({value: String(field.min + index), label: field.target === "level" ? `H${field.min + index}` : String(field.min + index)}))
    : null);

const ALIGN_ICONS = {start: "format_align_left", center: "format_align_center", end: "format_align_right"};

/** The light segmented look of the prototype: a quiet track, the chosen segment a raised surface, not a primary fill. */
const segmentedSwitch = (field, items, value, component, extra = nothing) => html`
    <div class="sf-editor-control sf-editor-switch-row">
        <sf-button-group class="sf-editor-segmented" size="1/2" appearance="segmented" plate="raised" full-width aria-label=${field.label}
                         .items=${items} .value=${String(value)}
                         @change=${(event) => component.onField(event, field)}></sf-button-group>
        ${extra}
    </div>`;

function fieldRow(component, field, w) {
    const id = `sf-editor-field-${field.key}`;
    const builder = component.builder;
    const exposed = builder?.exposed?.some((entry) => entry.path === component.model.selected && entry.target === `${field.plane}.${field.target}`);
    const value = field.value === undefined || field.value === null ? "" : field.value;
    let control;
    if (field.kind === "toggle") {
        control = segmentedSwitch(field, [{value: "false", label: w("no")}, {value: "true", label: w("yes")}], (field.shown ? !field.value : field.value) ? "true" : "false", component);
    } else if (steps(field)) {
        // The first three steps as a switch, the rest behind «More» (a heading: H1–H3, then H4–H6).
        const all = steps(field);
        const shown = all.slice(0, 3);
        const rest = all.slice(3);
        const inRest = rest.some((item) => item.value === String(value));
        control = segmentedSwitch(field, shown, inRest ? "" : value, component, rest.length ? html`
            <sf-dropdown class="sf-editor-more-steps" size="1/2" aria-label=${w("more-steps", {name: field.label})} placeholder=${w("more")}
                         .options=${rest.map((item) => ({value: item.value, text: item.label}))} .value=${inRest ? String(value) : ""}
                         @change=${(event) => component.onField(event, field)}></sf-dropdown>` : nothing);
    } else if (field.choiceLabels.length && segmented(field)) {
        // Alignment draws as the prototype's three icons; the words stay their names.
        const icon = field.target === "align" ? ALIGN_ICONS : null;
        control = segmentedSwitch(field, field.choiceLabels.map((choice) => (icon?.[choice.value]
            ? {value: choice.value, label: choice.text, icon: icon[choice.value], "icon-only": true}
            : {value: choice.value, label: choice.text})), value, component);
    } else if (field.choiceLabels.length) {
        control = html`<sf-dropdown class="sf-editor-control" size="1/2" aria-label=${field.label} .options=${field.choiceLabels} .value=${String(value)}
                                    @change=${(event) => component.onField(event, field)}></sf-dropdown>`;
    } else {
        const numeric = field.kind === "number" || field.kind === "integer";
        control = html`<sf-input class="sf-editor-control" size="1/2" aria-label=${field.label} inputmode=${numeric ? "numeric" : ""} .value=${String(value)}
                                 @change=${(event) => component.onField(event, field)}></sf-input>`;
    }
    const own = field.origin === "block" || field.origin === "screen";
    return html`
        <div class="sf-editor-field" id=${id} data-key=${field.key} data-origin=${field.origin}>
            <div class="sf-editor-field-head">
                <span class="sf-editor-field-label">${field.label}</span>
                ${field.responsive ? html`<sf-icon class="sf-editor-field-screen" icon=${SCREEN_ICON[component.screenName]} size="1/3" title=${w("per-screen")} aria-label=${w("per-screen")}></sf-icon>` : nothing}
                <span class="sf-editor-origin" data-origin=${field.origin} data-own=${own ? "true" : "false"} title=${w(`origin-${field.origin}-help`)}><span class="sf-editor-origin-dot" aria-hidden="true"></span>${field.originLabel}</span>
                ${field.set ? html`<sf-button class="sf-editor-reset" size="1/3" appearance="link" scheme="on-surface-variant" text=${w("reset")}
                        aria-label=${w("reset-field", {name: field.label})} @click=${() => component.onReset(field)}></sf-button>` : nothing}
            </div>
            ${control}
            ${(field.min !== undefined || field.max !== undefined) && !steps(field) ? html`<span class="sf-editor-hint">${w("range-hint", {min: String(field.min ?? ""), max: String(field.max ?? "")})}</span>` : nothing}
            ${field.responsive && field.screens.length ? html`<span class="sf-editor-hint">${w("set-for", {screens: field.screensLabel})}</span>` : nothing}
            ${field.utility ? html`<code class="sf-editor-utility" title=${w("utility-help")}>${w("binding", {classes: field.utility})}</code>` : nothing}
            ${builder ? html`<sf-switch size="1/2" class="sf-editor-expose" label=${w("expose")} .checked=${Boolean(exposed)}
                    @change=${(event) => {
                        event.stopPropagation();
                        component.toggleExposed(component.model.selected, field, Boolean(event.currentTarget.checked));
                    }}></sf-switch>` : nothing}
        </div>
    `;
}

const SCREEN_ICON = {desktop: "desktop_windows", tablet: "tablet_mac", phone: "smartphone"};

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
                <sf-button-group size="1/3" appearance="segmented" plate="raised" .items=${view.states} .value=${state}
                                 aria-label=${w("data-states")} @change=${(event) => component.onState(event)}></sf-button-group>
                <p class="sf-editor-quiet">${w("data-states-help")}</p>
            </section>` : nothing}
    `;
}

// ------------------------------------------------------------ the catalogue popover

function popover(component, view, w) {
    const pop = view.pop;
    const list = pop.items;
    // The one list of sections (1.2.0): the sections with their icons and
    // counts, a section opened in place with «Back», or what a search found,
    // each block naming its section.
    const listing = component.popQuery ? "found" : pop.section ? "section" : "sections";
    const open = listing === "section" ? pop.sections.find((section) => section.id === pop.section) : null;
    const openName = open ? component.word(open.labelKey) : "";
    const option = (index, attributes, content) => html`
        <li role="option" id=${`sf-editor-pop-${index}`} aria-selected=${index === component.popActive ? "true" : "false"}
            class=${index === component.popActive ? "is-active" : ""} data-item=${attributes.item ?? nothing} data-section=${attributes.section ?? nothing}
            @pointerenter=${() => {
                if (component.popActive === index) return;
                component.popActive = index;
                component.refresh();
            }}
            @mousedown=${(event) => event.preventDefault()}
            @click=${attributes.click}>${content}</li>`;
    return html`
        <div class="sf-editor-pop" role="dialog" aria-label=${w(pop.mode === "slash" ? "slash-label" : "catalogue-label")} data-listing=${listing} data-section=${pop.section || ""}
             style=${`inset-block-start:${pop.y}px;inset-inline-start:${pop.x}px${pop.height ? `;max-block-size:${pop.height}px` : ""}`}>
            ${pop.mode === "slash" ? html`<p class="sf-editor-quiet">${component.popQuery ? w("slash-filter", {query: component.popQuery}) : w("slash-hint")}</p>` : html`
                <sf-input size="1/2" appearance="filled" input-type="search" icon-start="search" placeholder=${w("search-placeholder")} aria-label=${w("search-placeholder")}
                          .value=${component.popQuery}
                          @input=${(event) => {
                              event.stopPropagation();
                              component.popQuery = String(event.currentTarget.value ?? "");
                              component.popActive = 0;
                              component.refresh();
                          }}></sf-input>`}
            ${open ? html`
                <div class="sf-editor-back sf-editor-pop-back">
                    <sf-button size="1/2" appearance="link" scheme="on-surface" icon-start="arrow_back" text-position="start" text=${openName}
                               aria-label=${`${w("back")}: ${openName}`} @mousedown=${(event) => event.preventDefault()}
                               @click=${() => component.openPopSection("")}></sf-button>
                </div>` : nothing}
            <ul id="sf-editor-pop-list" class="sf-editor-pop-list" role="listbox" tabindex="0" aria-label=${open ? openName : w("catalogue-label")}>
                ${listing === "sections" ? (pop.sections.length ? pop.sections.map((section, index) => option(index, {section: section.id, click: () => component.openPopSection(section.id)}, html`
                    <sf-icon class="sf-editor-option-icon" icon=${section.icon} size="1/2" aria-hidden="true"></sf-icon>
                    <span class="sf-editor-option-name" data-label=${component.word(section.labelKey)}>${component.word(section.labelKey)}</span>
                    <span class="sf-editor-count" aria-label=${w("section-count", {count: String(section.count)})}>${section.count}</span>
                    <sf-icon class="sf-editor-chevron" icon="chevron_right" size="1/2" aria-hidden="true"></sf-icon>`))
                    : html`<li class="sf-editor-quiet" role="presentation">${w("nothing-fits")}</li>`)
                : list.length ? list.map((item, index) => {
                    // In an open section every block names it; one that stands
                    // there from another section says which (also_in).
                    const from = open && item.group !== open.id ? w("from-section", {name: component.word(groupWordKey(item.group))}) : "";
                    return option(index, {item: `${item.type}${item.variant ? `#${item.variant}` : ""}`, click: () => component.chooseItem(item)}, html`
                        <div class="sf-editor-preview sf-editor-preview--small" aria-hidden="true">${skeleton(component.skeleton(item))}</div>
                        <span class="sf-editor-option-text">
                            <span class="sf-editor-option-name" data-label=${item.label}>${item.label}</span>
                            ${item.variant || from ? html`<span class="sf-editor-option-sub">${[item.variant ? item.typeLabel : "", from].filter(Boolean).join(" · ")}</span>` : nothing}
                        </span>
                        <span class="sf-editor-quiet sf-editor-option-note">${open ? openName : component.word(groupWordKey(item.group))}</span>`);
                }) : html`<li class="sf-editor-quiet" role="presentation">${w(component.popQuery ? "nothing-found" : "nothing-fits")}</li>`}
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
