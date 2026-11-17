import {html, nothing} from "lit";
import {avatarPicture} from "../../../avatar/js/picture";
import {entriesFor} from "../../../settings/js/settings";
import {languageRows, matchLanguage, normalizeLanguages, useNames} from "../../../language/js/languages";
import languageNames from "../../../language/data/names.json";
import {openMenu} from "./menu";

// The profile menu at the bottom of the first column: who is signed in, the
// host's links, the theme and the language, the menu profile, and signing out
// apart (assignment, section 5).

const icon = (name, rootClass = "sf-admin-nav-row-icon") => (name
    ? html`<sf-icon root-class=${rootClass} aria-hidden="true" icon=${name}></sf-icon>`
    : nothing);

// The person's picture is SIMAI Framework's avatar drawing (K-06, C152; the
// avatar study AV-8): the photo filling the circle, else the initials of the
// name on the neutral plate, from the avatars sheet. It is the picture beside
// the button's own text, not an sf-avatar element: sf-avatar is a button, and
// a button inside the person button would be a second Tab stop with no action
// (AR-1). Size 1/2 is the 32 px mark the column's site mark has.
const avatar = (person) => avatarPicture({
    imageUrl: person.avatar, name: person.name ?? "", size: "1/2",
});

// The theme is a setting of the person menu (owner decision C176 (1), (2);
// K-11): SIMAI Framework's settings row, made by sf-settings' own entriesFor
// from one choice item -- «Тема» with its value under the name, the options a
// level deeper in the same panel (the drill look), «Как в системе» first as
// sf-settings writes it. The menu keeps the words and the person's value only.
const THEME_OPTIONS = [
    {id: "system", icon: "computer", label: "themeSystem"},
    {id: "light", icon: "light_mode", label: "themeLight"},
    {id: "dark", icon: "dark_mode", label: "themeDark"},
];

export function themeEntry(text, value) {
    const known = THEME_OPTIONS.some((option) => option.id === value) ? value : "system";
    return entriesFor([{
        id: "theme", type: "choice", text: text("theme"), icon: "contrast", value: known,
        options: THEME_OPTIONS.map((option) => ({id: option.id, text: text(option.label), icon: option.icon})),
    }], "drill")[0];
}

// The language row is the one SIMAI Framework's app menus take
// (SfLanguage.menuEntry, C142 (7); owner decision C176, SM-4): each language
// named in itself, its name in the page's language beside it when that
// differs, a radio row with the language's own lang, the current name the
// row's value, the rows at the panel width, and a search from eight
// languages on. It is built from sf-language's own module (language/js), so
// the rows are the Framework's, not a copy; the element itself is not
// loaded. The menu keeps its words and the note under the rows.
useNames(languageNames);

export function languageEntry(text, person) {
    const items = (person?.languages ?? []).map((entry) => ({code: entry.code, label: entry.native}));
    const list = normalizeLanguages([], items);
    const page = person?.language || globalThis.document?.documentElement?.getAttribute("lang") || "en";
    const current = matchLanguage(list, person?.language) ?? null;
    const entry = {
        id: "language", text: text("language"), icon: "translate", value: current?.label ?? person?.language,
        submenu: [...languageRows(list, current, {page, prefix: "language:"}), {type: "note", text: text("languageNote")}],
        width: "panel",
    };
    if (list.length >= 8) entry.search = {placeholder: text("findLanguage"), empty: text("nothingFound")};
    return entry;
}

// The profile menu is the Framework's standard menu (owner, 2026-10-12): who
// is signed in, the host's links, the theme as a choice row, the language and
// the menu profile as submenus -- the language as SIMAI Framework writes it -- and signing
// out apart. It opens above the person, start-aligned.
export function openAccountMenu(context, anchor) {
    const {controller, navigation, text} = context;
    const person = navigation?.person;
    if (!person) return null;
    const site = navigation.site?.current;
    const profiles = navigation.profiles;
    const currentProfile = profiles?.list?.find((entry) => entry.key === profiles.current);
    const entries = [{
        type: "header", text: person.name, avatar: person.avatar,
        caption: [person.email, person.role ? `${person.role}${site ? ` · ${site.label}` : ""}` : null].filter(Boolean),
    }];
    const links = person.links ?? [];
    if (links.length) {
        entries.push({type: "separator"}, ...links.map((link, at) => ({id: `link:${at}`, text: link.label, icon: link.icon, href: link.href})));
    }
    if (controller.offers("preferences")) {
        entries.push(
            {type: "separator"},
            // A row with its choice a level deeper, as the language and the
            // menu profile are (owner, 2026-10-14): three glyphs side by side
            // said less than the words.
            themeEntry(text, person.theme),
            languageEntry(text, person),
        );
    }
    // Configuring the menu sits with the menu profile, in the person's menu: a
    // bare pen under the person said nothing of what it edits (owner,
    // 2026-10-13).
    const canEdit = controller.canEdit?.() && !context.compact;
    const hasProfiles = controller.offers("menu-profiles") && profiles?.list?.length;
    if (canEdit || hasProfiles) entries.push({type: "separator"});
    if (canEdit) entries.push({id: "configure-menu", text: text("configureMenu"), icon: "edit"});
    if (hasProfiles) {
        entries.push({
            id: "profile", text: text("menuProfile"), icon: "view_sidebar", value: currentProfile?.label ?? "",
            submenu: profiles.list.map((entry) => ({
                id: `profile:${entry.key}`, text: entry.label, icon: entry.kind === "personal" ? "person" : "group",
                kind: "radio", checked: entry.key === profiles.current,
            })),
        });
    }
    // Signing out is last, after a separator, in the plain colour (owner
    // decisions C163 (6), C176; PP-10, SM-5): it ends a session, it destroys
    // nothing, so it is not a danger row.
    if (controller.offers("sign-out")) {
        entries.push({type: "separator"}, {id: "sign-out", text: text("signOut"), icon: "logout"});
    }
    return openMenu(controller, anchor, {
        label: text("account"), entries, submenu: "drill", side: "block-start", align: "start",
        // As wide as the person button (owner, 2026-10-14), and never cutting a
        // line: the profile picker's panel rule, max(trigger, the panel step)
        // (decision C32 "panel"; DEV 2026-11-10, G1 320/288/320). In the narrow
        // rail the button is a picture, and the menu is as wide as its lines.
        width: controller.compact ? "content" : "panel",
        select: (id) => {
            const [kind, value] = String(id ?? "").split(/:(.*)/su);
            if (kind === "language") return controller.chooseLanguage(value);
            if (kind === "profile" && value) return controller.chooseProfile(value);
            if (kind === "sign-out") return controller.signOut();
            if (kind === "configure-menu") return controller.startEdit();
            return null;
        },
        // The theme row's choice: the menu marks it and stays open, the page
        // takes the theme at once and the host keeps it (preference.theme).
        change: (id, value) => (id === "theme" ? controller.chooseTheme(value) : null),
    });
}

// The person at the bottom: a button that opens the menu above it.
export function renderPersonButton(context) {
    const {navigation, compact, text} = context;
    const person = navigation?.person;
    if (!person) return nothing;
    return html`<button type="button" class="sf-admin-nav-person"
        aria-haspopup="menu" aria-expanded="false"
        aria-label=${compact ? `${person.name}. ${text("account")}` : nothing}
        title=${compact ? person.name : nothing}
        @click=${(event) => openAccountMenu(context, event.currentTarget)}>
        ${avatar(person)}
        ${compact ? nothing : html`<span class="sf-admin-nav-person-text">
            <span class="sf-admin-nav-person-name">${person.name}</span>
            ${person.email ? html`<span class="sf-admin-nav-person-email">${person.email}</span>` : nothing}
        </span>
        ${icon("unfold_more", "sf-admin-nav-site-chevron")}`}
    </button>`;
}
