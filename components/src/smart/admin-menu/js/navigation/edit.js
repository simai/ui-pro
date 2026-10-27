import {html, nothing} from "lit";
import {ICON_CHOICES} from "../../../property-view/js/icon-choices.js";
import {LIST_ID} from "./controller";
import {openMenu} from "./menu";

// The edit mode (assignment, section 7): both columns at once, a banner with
// the profile being edited and what that means, and on every row a handle, an
// eye and a ⋯. Rows are moved with sf-sortable -- a mouse, a finger on the
// handle, or the keyboard -- and only here: a drag outside the edit mode is
// not an edit (owner, 2026-10-11). Everything applies at once.

const icon = (name, rootClass = "sf-admin-nav-row-icon") => (name
    ? html`<sf-icon root-class=${rootClass} aria-hidden="true" icon=${name}></sf-icon>`
    : nothing);

// What a new profile can be. A person has one personal profile, so with one
// already made a new profile is shared -- offered only to whoever may make
// shared ones; without one, it is theirs unless they may and choose otherwise.
export function newProfileKinds(controller) {
    const navigation = controller.navigation;
    const hasPersonal = (navigation?.profiles?.list ?? []).some((entry) => entry.kind === "personal");
    const mayShare = Boolean(navigation?.rights?.create_shared);
    return {personal: !hasPersonal && Boolean(navigation?.rights?.edit_personal), shared: mayShare};
}

// The profile being edited is chosen, made, renamed, removed and reset in the
// Framework's profile picker (owner, 2026-10-14): one place for all of it,
// rather than a button opening a menu and a form opening under the banner.
function profilePickerEntries(controller) {
    return (controller.navigation?.profiles?.list ?? []).map((entry) => ({
        id: entry.key, label: entry.label, shared: entry.kind === "shared",
        builtin: !entry.renamable && !entry.removable && entry.kind === "shared",
        editable: controller.mayEdit(entry) && (entry.renamable || entry.removable),
    }));
}

export function renderEditBanner(context) {
    const {controller, text, edit} = context;
    const current = controller.currentProfile();
    const shared = current?.kind === "shared";
    const kinds = newProfileKinds(controller);
    return html`<div class="sf-admin-nav-edit-banner" role="region" aria-label=${text("editMenu")}>
        <div class="sf-admin-nav-edit-title">
            ${icon("edit", "")}
            <span class="sf-admin-nav-row-label">${text("editMenu")}</span>
            <sf-button size="1/2" @click=${() => controller.stopEdit()} text=${text("done")}></sf-button>
        </div>
        <sf-profile-picker size="1/2" label=${text("profileLabel").replace(/:\s*$/u, "")} current=${controller.navigation?.profiles?.current ?? ""}
            resettable message=${edit.message || ""}
            .profiles=${profilePickerEntries(controller)}
            .rights=${{create: {personal: kinds.personal, shared: kinds.shared}}}
            @sf-profile-picker-select=${(event) => controller.editProfile(event.detail.id)}
            @sf-profile-picker-create=${(event) => controller.createProfile(event.detail.label, event.detail.shared)}
            @sf-profile-picker-rename=${(event) => controller.renameProfile(event.detail.label, event.detail.id)}
            @sf-profile-picker-delete=${(event) => controller.deleteProfile(event.detail.id)}
            @sf-profile-picker-reset=${() => controller.resetProfile()}></sf-profile-picker>
        <p class="sf-admin-nav-edit-note">${shared ? text("noteShared") : text("notePersonal")}</p>
    </div>`;
}

function openRowMenu(context, row, anchor) {
    const {controller, text} = context;
    const renamed = row.package_label && row.label !== row.package_label;
    // Every row's menu says something: a divider's had nothing to offer that was
    // not its own (a package's line cannot be renamed or deleted), so its ⋯ did
    // nothing at all. Showing and hiding is in it for every row, and a line of
    // one's own can be deleted; it moves by its handle like any row.
    const entries = [
        row.kind !== "divider" ? {id: "rename", text: text("rename"), icon: "edit"} : null,
        renamed ? {id: "package-name", text: text("packageName"), icon: "undo"} : null,
        {id: "visibility", text: row.hidden ? text("show") : text("hide"), icon: row.hidden ? "visibility" : "visibility_off"},
        row.own ? {id: "delete", text: text("deleteRow"), icon: "delete", danger: true} : null,
    ].filter(Boolean);
    if (!entries.length) return null;
    return openMenu(controller, anchor, {
        label: `${text("more")}: ${row.label ?? ""}`, entries,
        select: (id) => {
            if (id === "rename") {
                controller.edit = {...controller.edit, renaming: row.key};
                return controller.update("edit");
            }
            if (id === "package-name") return controller.returnPackageName(row.key);
            if (id === "visibility") return controller.toggleHidden(row.key);
            if (id === "delete") return controller.removeOwnRow(row.key);
            return null;
        },
    });
}

function renderRenaming(context, row) {
    const {controller} = context;
    let value = row.label ?? "";
    return html`<form class="sf-admin-nav-edit-rename" @submit=${(event) => { event.preventDefault(); controller.renameRow(row.key, value); }}
        @keydown=${(event) => { if (event.key === "Escape") { event.stopPropagation(); controller.renameRow(row.key, ""); } }}>
        <sf-input size="1/2" value=${value} autofocus
            @input=${(event) => { value = event.target?.value ?? event.detail?.value ?? ""; }}></sf-input>
    </form>`;
}

// The row's glyph as a chooser: the glyph itself opens a grid of the admin's
// icons with a search, the dropdown a record section's glyph is chosen with.
function renderIconChooser(context, row) {
    const {controller, text} = context;
    const current = row.icon ? String(row.icon) : "";
    const options = ICON_CHOICES.map((name) => ({kind: "icon", icon: name, text: name, value: name,
        ariaLabel: name, selected: name === current}));
    return html`<sf-dropdown class="sf-admin-nav-edit-icon" size="1/2" layout="grid" columns="6" search="true"
        search-placeholder=${text("chooseIcon")} aria-label=${`${text("chooseIcon")}: ${row.label ?? ""}`}
        value=${current} .options=${options}
        @change=${(event) => controller.setRowIcon(row.key, event.detail?.value ?? "")}>
        <sf-icon-button slot="trigger" size="1/2" appearance="link" scheme="on-surface" icon=${current || "add_photo_alternate"}
            title=${text("chooseIcon")} aria-label=${`${text("chooseIcon")}: ${row.label ?? ""}`}></sf-icon-button>
    </sf-dropdown>`;
}

// One editable row: the handle, what it is, and its eye and ⋯. A divider is a
// line with the same controls, so it can be moved and hidden like a row.
function renderEditRow(context, row, {draggable = true} = {}) {
    const {controller, text, edit, openRoot} = context;
    const name = row.kind === "divider" ? text("addDivider") : row.label;
    // A root still opens its column in the edit mode: its rows are edited there.
    const label = row.kind === "root"
        ? html`${renderIconChooser(context, row)}<button type="button" class="sf-admin-nav-edit-open" aria-expanded=${String(openRoot?.key === row.key)}
            data-open=${openRoot?.key === row.key ? "true" : nothing}
            @click=${() => controller.openRootColumn(row.key)}>
            <span class="sf-admin-nav-row-label">${row.label}</span>
            ${icon("chevron_right", "sf-admin-nav-row-chevron")}</button>`
        : html`${row.kind === "heading" ? nothing : renderIconChooser(context, row)}
            <span class="sf-admin-nav-row-label" data-heading=${row.kind === "heading" ? "true" : nothing}>${row.label}</span>`;
    return html`<div class="sf-admin-nav-edit-row" data-sf-sortable-item=${draggable ? row.key : nothing}
        data-hidden=${row.hidden ? "true" : nothing} data-kind=${row.kind}>
        ${draggable ? html`<span class="sf-admin-nav-edit-handle" data-sf-sortable-handle aria-hidden="true"
            title=${text("drag")}>${icon("drag_indicator", "")}</span>` : html`<span class="sf-admin-nav-edit-handle"></span>`}
        ${edit.renaming === row.key ? renderRenaming(context, row) : row.kind === "divider"
            ? html`<hr class="sf-admin-nav-divider sf-admin-nav-edit-line" aria-label=${name}>`
            : label}
        <!-- Showing and hiding is in the row's ⋯ (owner, 2026-10-14): an eye on
             every row was a second way to the same thing, and a hidden row
             already reads as hidden, struck through. -->
        <button type="button" class="sf-admin-nav-edit-button" aria-haspopup="menu" aria-expanded="false"
            aria-label=${`${text("more")}: ${name}`} title=${text("more")}
            @click=${(event) => openRowMenu(context, row, event.currentTarget)}>
            ${icon("more_horiz", "")}</button>
    </div>`;
}

// The site's roots are one list to reorder; the install stays apart, as it is
// outside the edit mode, because it is not the site's.
export function renderEditRoots(context, siteRoots, installRoots) {
    const {text} = context;
    // The top level takes a line, a heading or a link of one's own, as a
    // root's column does: it had no add, so its first line had no way back once
    // it was deleted (owner, 2026-10-13).
    // Rows move between the top level and the open section's column (owner,
    // 2026-10-14); a section stays at the top level -- the menu is two deep.
    return html`<sf-sortable id=${`${LIST_ID}roots`} group="admin-nav-roots" accepts="admin-nav-rows" label=${text("editMenu")}
        class="sf-admin-nav-edit-list">
        ${siteRoots.map((row) => renderEditRow(context, row))}
    </sf-sortable>
    ${renderAdd(context, {key: "roots"})}
    ${installRoots.length ? html`<hr class="sf-admin-nav-divider">
        ${installRoots.map((row) => renderEditRow(context, row, {draggable: false}))}` : nothing}`;
}

function renderAdd(context, root) {
    const {controller, text, edit} = context;
    // The link form opens in the list it was asked for: one flag for both
    // columns showed it in the top level and in the open root at once.
    if (edit.adding === `link:${root.key}`) {
        // Kept by the controller, so a refusal or a render leaves the form as
        // it was typed; the address is checked before it is sent.
        const draft = edit.draft ?? {};
        const keep = (patch) => { controller.edit = {...controller.edit, draft: {...controller.edit.draft, ...patch}}; };
        return html`<form class="sf-admin-nav-edit-form" @submit=${(event) => {
            event.preventDefault();
            const [labelField, hrefField] = event.currentTarget.querySelectorAll("sf-input");
            controller.addLink(root.key, labelField?.value ?? draft.label ?? "", hrefField?.value ?? draft.href ?? "");
        }}>
            <sf-input size="1/2" placeholder=${text("linkLabel")} .value=${draft.label ?? ""}
                @input=${(event) => keep({label: event.target?.value ?? ""})}></sf-input>
            <sf-input size="1/2" placeholder=${text("linkHref")} .value=${draft.href ?? ""}
                @input=${(event) => keep({href: event.target?.value ?? ""})}></sf-input>
            ${edit.linkError ? html`<p class="sf-admin-nav-edit-message" role="alert">${edit.linkError}</p>` : nothing}
            <div class="sf-admin-nav-edit-actions">
                <sf-button size="1/2" @click=${(event) => event.target.closest("form")?.requestSubmit()} text=${text("add")}></sf-button>
                <sf-button size="1/2" appearance="link" scheme="on-surface"
                    @click=${() => { controller.edit = {...controller.edit, adding: null, draft: null, linkError: ""}; controller.update("edit"); }} text=${text("cancel")}></sf-button>
            </div>
        </form>`;
    }
    const choose = (anchor) => openMenu(controller, anchor, {
        label: text("add"),
        entries: [
            // A section of one's own, at the top level only: a row with its
            // own column, where links, headings and lines are added as in any
            // root's (owner, 2026-10-13).
            ...(root.key === "roots" ? [{id: "root", text: text("addSection"), icon: "folder"}] : []),
            {id: "divider", text: text("addDivider"), icon: "horizontal_rule"},
            {id: "heading", text: text("addHeading"), icon: "title"},
            {id: "link", text: text("addLink"), icon: "link"},
        ],
        select: (id) => {
            if (id === "link") {
                controller.edit = {...controller.edit, adding: `link:${root.key}`, draft: null, linkError: ""};
                return controller.update("edit");
            }
            return controller.addOwnRow(root.key, id);
        },
    });
    return html`<button type="button" class="sf-admin-nav-row sf-admin-nav-add" aria-haspopup="menu" aria-expanded="false"
        @click=${(event) => choose(event.currentTarget)}>
        ${icon("add")}<span class="sf-admin-nav-row-label">${text("add")}</span></button>`;
}

export function renderEditRows(context, root) {
    const {text} = context;
    return html`<sf-sortable id=${`${LIST_ID}${root.key}`} group="admin-nav-rows" accepts="admin-nav-roots" label=${root.label ?? text("editMenu")}
        class="sf-admin-nav-edit-list">
        ${(root.children ?? []).map((row) => renderEditRow(context, row))}
    </sf-sortable>
    ${renderAdd(context, root)}`;
}
