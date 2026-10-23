import {html, nothing} from "lit";
import {getInitials} from "../../../helpers/text";
import {openMenu} from "./menu";

// The profile menu at the bottom of the first column: who is signed in, the
// host's links, the theme and the language, the menu profile, and signing out
// apart (assignment, section 5).

const icon = (name, rootClass = "sf-admin-nav-row-icon") => (name
    ? html`<sf-icon root-class=${rootClass} aria-hidden="true" icon=${name}></sf-icon>`
    : nothing);

const avatar = (person) => (person.avatar
    ? html`<img class="sf-admin-nav-avatar" src=${person.avatar} alt="">`
    : html`<span class="sf-admin-nav-avatar" aria-hidden="true">${getInitials(person.name ?? "")}</span>`);

const THEMES = [
    {value: "light", icon: "light_mode", label: "themeLight"},
    {value: "dark", icon: "dark_mode", label: "themeDark"},
    {value: "system", icon: "contrast", label: "themeSystem"},
];

// The profile menu is the Framework's standard menu (owner, 2026-10-12): who
// is signed in, the host's links, the theme as a choice row, the language and
// the menu profile as submenus -- the language with its search -- and signing
// out apart. It opens above the person, start-aligned.
export function openAccountMenu(context, anchor) {
    const {controller, navigation, text} = context;
    const person = navigation?.person;
    if (!person) return null;
    const site = navigation.site?.current;
    const profiles = navigation.profiles;
    const currentProfile = profiles?.list?.find((entry) => entry.key === profiles.current);
    const language = controller.currentLanguage();
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
            // A row with its choice in a submenu, as the language and the menu
            // profile are (owner, 2026-10-14): three glyphs side by side said
            // less than the words.
            {
                id: "theme", text: text("theme"),
                icon: (THEMES.find((theme) => theme.value === person.theme) ?? THEMES[2]).icon,
                value: text((THEMES.find((theme) => theme.value === person.theme) ?? THEMES[2]).label),
                submenu: THEMES.map((theme) => ({
                    id: `theme:${theme.value}`, text: text(theme.label), icon: theme.icon,
                    kind: "radio", checked: person.theme === theme.value,
                })),
            },
            {
                id: "language", text: text("language"), icon: "translate", value: language?.native ?? person.language,
                search: {placeholder: text("findLanguage"), empty: text("nothingFound")},
                submenu: [
                    ...(person.languages ?? []).map((entry) => ({
                        id: `language:${entry.code}`, text: entry.native, caption: entry.english, keywords: entry.code,
                        kind: "radio", checked: entry.code === person.language, lang: entry.code,
                    })),
                    {type: "note", text: text("languageNote")},
                ],
            },
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
    if (controller.offers("sign-out")) {
        entries.push({type: "separator"}, {id: "sign-out", text: text("signOut"), icon: "logout", danger: true});
    }
    return openMenu(controller, anchor, {
        label: text("account"), entries, side: "block-start", align: "start",
        // As wide as the person button (owner, 2026-10-14); in the narrow rail
        // the button is a picture, and the menu is as wide as its lines.
        width: controller.compact ? "content" : "trigger",
        select: (id) => {
            const [kind, value] = String(id ?? "").split(/:(.*)/su);
            if (kind === "theme") return controller.chooseTheme(value);
            if (kind === "language") return controller.chooseLanguage(value);
            if (kind === "profile" && value) return controller.chooseProfile(value);
            if (kind === "sign-out") return controller.signOut();
            if (kind === "configure-menu") return controller.startEdit();
            return null;
        },
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
