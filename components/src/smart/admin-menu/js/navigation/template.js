import {html, nothing} from "lit";
import "./navigation.css";
import {getInitials} from "../../../helpers/text";
import {renderPalette, renderSearchRow} from "./palette";
import {counterOf, dotPhrase, nameWithCounter} from "../templates/default";
import {renderPersonButton} from "./account";
import {renderEditBanner, renderEditRoots, renderEditRows} from "./edit";

// The two columns, drawn in the element's own light DOM like every other Smart
// component, so the Framework's component stylesheets reach the icons, badges
// and fields inside it.
//
// First column: the site, the site's roots, the install apart from them, the
// favourites, and at the bottom only «who am I» -- notifications and the person.
// Second column: the open root's rows. There is no third: the page is the
// third, in the host's own area (assignment, section 3).

const icon = (name, rootClass = "flex-none") => (name
    ? html`<sf-icon root-class=${rootClass} aria-hidden="true" icon=${name}></sf-icon>`
    : nothing);

// «Требует внимания» is the only thing on the right of a row. The menu carries
// no totals; those belong in the page header.
const attention = (row) => {
    if (row.attention) {
        return html`<sf-badge class="sf-admin-nav-attention" appearance="tonal" size="1/3"
            status=${row.attention.tone} text=${row.attention.label}></sf-badge>`;
    }
    if (row.badge) {
        return html`<sf-badge class="sf-admin-nav-attention" size="1/3" status="error"
            text=${String(row.badge)}></sf-badge>`;
    }
    if (row.shortcut) return html`<kbd class="sf-admin-nav-kbd">${row.shortcut}</kbd>`;
    return nothing;
};

// In the rail a row's counter sits on its icon, the way chat apps put one on
// an avatar (simai/ui-source#12): the icon is wrapped in the SIMAI Framework's
// badge anchor at the icon's own step. The rail icon is a 1/2 step, and at 1/2
// the rule draws a dot: the number and the attention words go to the row's
// name («Задачи, 3 непрочитанных»), nothing at 0. Counters take the danger
// role, as in the expanded menu (owner, 2026-10-21). The
// menu draws the counter itself, with no data-count for the Framework's badge
// runtime to keep (counterOf in ../templates/default.js says why).
const railCounter = (row) => {
    if (row.attention) return {dot: true, text: "", phrase: row.attention.label || dotPhrase()};
    return counterOf(row.badge);
};

const railIcon = (name, counter) => html`<span class="sf-badge-anchor sf-badge-anchor--size-1/2 sf-badge-anchor--square sf-admin-nav-rail-anchor">${icon(name, "sf-admin-nav-row-icon")}${counter
    ? html`<span class="sf-badge sf-badge--anchored sf-badge--error sf-badge--dot" aria-hidden="true" title=${counter.phrase}></span>`
    : nothing}</span>`;

const mark = (site) => html`<span class="sf-admin-nav-mark" aria-hidden="true">${site?.mark || getInitials(site?.label ?? "")}</span>`;

function renderSite(context) {
    const {controller, navigation, compact} = context;
    const site = navigation?.site?.current;
    if (!site) return nothing;
    const switchable = controller.canSwitchSite();
    const trigger = html`
        <button type="button" class="sf-admin-nav-site-trigger"
            aria-haspopup=${switchable ? "menu" : nothing}
            aria-expanded=${switchable ? "false" : nothing}
            ?disabled=${!switchable}
            title=${compact ? site.label : nothing}
            @click=${(event) => controller.openSites(event.currentTarget)}>
            ${mark(site)}
            ${compact ? nothing : html`
                <span class="sf-admin-nav-site-text">
                    <span class="sf-admin-nav-site-label">${site.label}</span>
                    ${site.caption ? html`<span class="sf-admin-nav-site-caption">${site.caption}</span>` : nothing}
                </span>
                ${switchable ? icon("unfold_more", "sf-admin-nav-site-chevron") : nothing}`}
        </button>`;
    return html`<div class="sf-admin-nav-site">${trigger}</div>`;
}

// A row of the first column. A root with rows opens the second column and
// carries ›; a root with none is a page and opens it (assignment, section 1).
function renderFirstRow(context, row) {
    const {controller, compact, openRoot, text} = context;
    // A person's own rows at the top level: a line, a heading, a link, as in a
    // root's column. The top level had no add, so it never met them.
    if (row.kind === "divider") return html`<hr class="sf-admin-nav-divider">`;
    if (row.kind === "heading") return compact ? nothing : html`<div class="sf-admin-nav-heading">${row.label}</div>`;
    if (row.kind === "link") {
        return html`<a class="sf-admin-nav-row sf-admin-nav-row--first" href=${row.href ?? "#"} target="_blank" rel="noopener"
            title=${compact ? row.label : nothing} aria-label=${compact ? row.label : nothing}>
            ${icon(row.icon, "sf-admin-nav-row-icon")}
            ${compact ? nothing : html`<span class="sf-admin-nav-row-label">${row.label}</span>
                ${icon("north_east", "sf-admin-nav-row-chevron")}<span class="sr-only">, ${text("external")}</span>`}
        </a>`;
    }
    const opens = row.kind === "root";
    const open = opens && openRoot?.key === row.key;
    const current = opens ? controller.holdsCurrent(row) : controller.isCurrent(row.key);
    return html`<a class="sf-admin-nav-row sf-admin-nav-row--first"
        href=${row.href ?? "#"}
        role=${opens ? "button" : nothing}
        aria-expanded=${opens ? String(open) : nothing}
        aria-current=${current && !opens ? "page" : nothing}
        data-current=${current ? "true" : nothing}
        data-open=${open ? "true" : nothing}
        title=${compact ? row.label : nothing}
        aria-label=${compact ? nameWithCounter(row.label, railCounter(row)) : nothing}
        @click=${(event) => controller.openRow(row, event)}>
        ${compact ? railIcon(row.icon, railCounter(row)) : html`
            ${icon(row.icon, "sf-admin-nav-row-icon")}
            <span class="sf-admin-nav-row-label">${row.label}</span>
            ${attention(row)}
            ${opens ? icon("chevron_right", "sf-admin-nav-row-chevron") : nothing}`}
    </a>`;
}

function findRow(context, key) {
    for (const root of context.navigation?.items ?? []) {
        if (root.key === key) return root;
        for (const row of root.children ?? []) if (row.key === key) return row;
    }
    return null;
}

// «Уведомления» is a link when the host names its page (notifications.href),
// so it goes where every other row goes -- by region when the shell has it
// (larena.test, 2026-10-16: it was a block, and a host script loaded the page
// in full); without an address it stays the count it was.
function renderNotifications(context, notifications) {
    const {text, compact} = context;
    const content = html`
        ${compact
            ? html`${railIcon("notifications", counterOf(notifications.unread))}
                <span class="sr-only">${nameWithCounter(text("notifications"), counterOf(notifications.unread))}</span>`
            : html`${icon("notifications", "sf-admin-nav-row-icon")}
                <span class="sf-admin-nav-row-label">${text("notifications")}</span>
                ${notifications.unread ? html`<sf-badge class="sf-admin-nav-attention" size="1/3" status="error"
                    text=${String(notifications.unread)}></sf-badge>` : nothing}`}`;
    const href = typeof notifications.href === "string" && notifications.href ? notifications.href : null;
    if (!href) return html`<div class="sf-admin-nav-row sf-admin-nav-row--first" title=${compact ? text("notifications") : nothing}>${content}</div>`;
    let current = false;
    try {
        current = new URL(href, globalThis.location.href).pathname === globalThis.location.pathname;
    } catch {
        current = false;
    }
    return html`<a class="sf-admin-nav-row sf-admin-nav-row--first" href=${href}
        aria-current=${current ? "page" : nothing} data-current=${current ? "true" : nothing}
        title=${compact ? text("notifications") : nothing}>${content}</a>`;
}

function renderBottom(context) {
    const {navigation, text, compact, controller} = context;
    const notifications = navigation?.notifications;
    const favourites = controller.edit?.on ? null : controller.favouritesRoot();
    return html`<div class="sf-admin-nav-bottom">
        ${favourites ? renderFirstRow(context, favourites) : nothing}
        ${notifications ? renderNotifications(context, notifications) : nothing}
        <div class="sf-admin-nav-person-row">
            ${renderPersonButton(context)}
            ${renderCollapse(context)}
        </div>
    </div>`;
}

// Folding the first column to a rail: a small button beside the person, not
// a row of its own under it (owner, 2026-10-14). In the rail it stands under
// the picture.
function renderCollapse(context) {
    const {controller, text, compact} = context;
    if (!context.wide || controller.edit?.on) return nothing;
    return html`<sf-icon-button class="sf-admin-nav-collapse" size="1/2" appearance="ghost" scheme="on-surface"
        icon=${compact ? "chevron_right" : "chevron_left"}
        aria-label=${compact ? text("expand") : text("collapse")}
        title=${compact ? text("expand") : text("collapse")}
        @click=${() => controller.toggleCompact()}></sf-icon-button>`;
}

// The columns are widened and narrowed by their edges (owner, 2026-10-14),
// within limits, the width remembered in this browser; a double click on the
// edge gives the column its width back. Not in the rail or on a phone.
function renderResizer(context, column) {
    if (!context.wide || (column === "first" && context.compact)) return nothing;
    const limits = column === "first" ? {min: "13rem", max: "24rem"} : {min: "13rem", max: "28rem"};
    // The width the host keeps for the person, when it does.
    const kept = context.navigation?.person?.widths?.[column];
    return html`<sf-resizer min=${limits.min} max=${limits.max} value=${kept ? String(kept) : nothing}
        property=${`--sf-admin-nav-${column}--inline-size`} storage-key=${`admin-nav-${column}`}
        label=${context.text(column === "first" ? "menuWidth" : "columnWidth")}></sf-resizer>`;
}

function renderFirstColumn(context) {
    const {controller, text, compact, edit} = context;
    const site = controller.siteRoots();
    const install = controller.installRoots();
    if (edit.on && !compact) {
        return html`<div class="sf-admin-nav-first" data-editing="true">
            ${renderSite(context)}
            ${renderEditBanner(context)}
            <div class="sf-admin-nav-scroll">${renderEditRoots(context, site, install)}</div>
            ${renderBottom(context)}
            ${renderResizer(context, "first")}
        </div>`;
    }
    return html`<div class="sf-admin-nav-first" data-compact=${compact ? "true" : nothing}>
        ${renderSite(context)}
        <div class="sf-admin-nav-scroll">
            <div class="sf-admin-nav-rows">
                ${renderSearchRow(context)}
                ${site.map((row) => renderFirstRow(context, row))}
            </div>
            ${install.length ? html`<hr class="sf-admin-nav-divider">
                <div class="sf-admin-nav-rows">${install.map((row) => renderFirstRow(context, row))}</div>` : nothing}
        </div>
        ${renderBottom(context)}
        ${renderResizer(context, "first")}
    </div>`;
}

// A row of the second column: a heading, a divider, a page, a section that
// unfolds in place, or an external link.
function renderRow(context, row, depth = 0) {
    const {controller, text} = context;
    if (row.kind === "heading") return html`<div class="sf-admin-nav-heading">${row.label}</div>`;
    if (row.kind === "divider") return html`<hr class="sf-admin-nav-divider">`;
    const section = row.kind === "section";
    const unfolded = section && controller.unfolded.has(row.key);
    const external = row.kind === "link";
    return html`<div class="sf-admin-nav-item" data-depth=${depth}>
        <a class="sf-admin-nav-row"
            href=${row.href ?? "#"}
            target=${external ? "_blank" : nothing}
            rel=${external ? "noopener" : nothing}
            role=${section ? "button" : nothing}
            aria-expanded=${section ? String(unfolded) : nothing}
            aria-current=${controller.isCurrent(row.key) ? "page" : nothing}
            data-current=${controller.isCurrent(row.key) ? "true" : nothing}
            @click=${(event) => controller.openRow(row, event)}>
            ${icon(row.icon, "sf-admin-nav-row-icon")}
            <span class="sf-admin-nav-row-label">${row.label}</span>
            ${external ? html`${icon("north_east", "sf-admin-nav-row-chevron")}<span class="sr-only">, ${text("external")}</span>` : nothing}
            ${section ? icon(unfolded ? "expand_less" : "expand_more", "sf-admin-nav-row-chevron") : nothing}
        </a>
        <!-- No star on a row: a page is made a favourite on the page itself
             (the record's title, a list's header), not from the menu, where a
             star on every row was noise (owner, 2026-10-15). -->
        ${attention(row)}
    </div>
    ${unfolded ? html`<div class="sf-admin-nav-children">${(row.children ?? []).filter((child) => !child.hidden)
        .map((child) => renderRow(context, child, depth + 1))}</div>` : nothing}`;
}

function renderSecondColumn(context) {
    const {controller, navigation, text, openRoot, filter, wide} = context;
    if (!openRoot) return nothing;
    const install = openRoot.level === "install";
    const rows = controller.rowsOf(openRoot);
    return html`<div class="sf-admin-nav-second" aria-label=${openRoot.label}>
        <div class="sf-admin-nav-second-head">
            ${wide ? nothing : html`<sf-icon-button size="1/2" appearance="ghost" scheme="on-surface"
                icon="arrow_back" aria-label=${text("back")} @click=${() => controller.back()}></sf-icon-button>`}
            <div class="sf-admin-nav-second-title">
                <span class="sf-admin-nav-second-label">${openRoot.label}</span>
                <span class="sf-admin-nav-second-caption" data-install=${install ? "true" : nothing}>${install
                    ? text("allSites")
                    : navigation?.site?.current?.label ?? ""}</span>
            </div>
            ${wide ? html`<sf-icon-button size="1/2" appearance="ghost" scheme="on-surface"
                icon="left_panel_close" aria-label=${text("hideColumn")} title=${text("hideColumn")}
                @click=${() => controller.hideColumn()}></sf-icon-button>` : nothing}
        </div>
        ${context.edit.on ? html`<div class="sf-admin-nav-scroll">${renderEditRows(context, openRoot)}</div>` : nothing}
        ${!context.edit.on && controller.offersFind(openRoot) ? html`<div class="sf-admin-nav-find">
            <sf-input size="1/2" icon-start="search" placeholder=${text("findInSection")} value=${filter}
                @input=${(event) => controller.setFilter(event.target?.value ?? event.detail?.value ?? "")}></sf-input>
        </div>` : nothing}
        ${context.edit.on ? nothing : html`<div class="sf-admin-nav-scroll">
            ${rows.length
                ? rows.map((row) => renderRow(context, row))
                : html`<sf-empty-state class="sf-admin-nav-empty" layout="inline" kind="nothing-found" size="1/2"
                    text=${text("nothingFound")}></sf-empty-state>`}
        </div>`}
        ${openRoot.action ? html`<div class="sf-admin-nav-second-foot">
            <a class="sf-admin-nav-action" href=${openRoot.action.href ?? "#"}>
                ${icon(openRoot.action.icon || "add")}<span>${openRoot.action.label}</span></a>
        </div>` : nothing}
        ${renderResizer(context, "second")}
    </div>`;
}

// The menu until the host answers (and before a host is connected, for a menu
// whose entries come from the port): its own rows with bars where the icon and
// the name go (simai.interaction-rules, loading-is-a-skeleton), in the columns
// the answered menu takes -- on a wide screen the first column and the open
// root's, on a phone one column the whole width -- so the menu's box is the
// same before and after the answer. The column fills its region; its rows
// scroll inside it. The word is for a screen reader only.
export const SKELETON_ROWS = 6;
export function renderNavigationSkeleton({text}) {
    const widths = ["w-3/4", "w-1/2", "w-2/3", "w-1/2", "w-3/4", "w-2/5"];
    const row = (width) => html`<div class="sf-admin-nav-item"><div class="sf-admin-nav-row sf-admin-nav-row--first" aria-hidden="true">
        <div class="sf-skeleton sf-skeleton--animation-pulse"><div class="sf-skeleton-circle sf-skeleton-icon"></div></div>
        <div class="sf-skeleton sf-skeleton--animation-pulse" style="flex:1"><div class="sf-skeleton-text sf-skeleton-text--size-1/2 ${width}"></div></div></div></div>`;
    const column = (name) => html`<div class=${`sf-admin-nav-${name}`}><div class="sf-admin-nav-scroll">
        <div class="sf-admin-nav-rows">${Array.from({length: SKELETON_ROWS}, (_, at) => row(widths[at % widths.length]))}</div></div></div>`;
    // Both columns are printed; the stylesheet keeps one, the whole width,
    // below 48rem (navigation.css), since a printed skeleton knows no viewport.
    return html`<nav class="sf-admin-nav sf-admin-nav--skeleton" aria-busy="true">
        ${column("first")}${column("second")}
        <span class="sr-only" role="status">${text("loading")}</span></nav>`;
}

export function renderNavigationTemplate(context) {
    const {status, text, controller, wide, screen, compact} = context;
    if (status === "loading") return renderNavigationSkeleton(context);
    if (status !== "ready") {
        // A menu that could not load says so as every component does, with
        // «Повторить» asking again.
        return html`<nav class="sf-admin-nav"><div class="sf-admin-nav-first">
            <sf-empty-state kind="error" size="1/2" text=${context.message || text("unavailable")}
                @sf-empty-state-action=${(event) => { if (event.detail?.id === "retry") controller.load("requested"); }}></sf-empty-state>
        </div></nav>`;
    }
    // On a phone the two columns are two screens; the second has «←».
    const phoneSecond = !wide && screen === "second";
    return html`<nav class="sf-admin-nav" data-wide=${wide ? "true" : "false"} data-compact=${compact ? "true" : nothing}>
        ${phoneSecond ? nothing : renderFirstColumn(context)}
        ${wide || phoneSecond ? renderSecondColumn(context) : nothing}
        ${renderPalette(context)}
    </nav>`;
}
