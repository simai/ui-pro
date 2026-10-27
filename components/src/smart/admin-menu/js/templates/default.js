import { html, nothing } from "lit";
import { getInitials } from "../../../helpers/text";
import {wordsOf} from "../words.js";

const MENU_TRANSLATIONS = wordsOf({
  empty: "empty",
  favorites: "favorites",
  saving: "saving",
  save: "save",
  personalSettings: "personal-settings",
  systemSettings: "system-settings",
  hiddenItems: "hidden-items",
  addDivider: "menu-translations-add-divider",
  refreshState: "refresh-state",
  resetSettings: "reset-settings",
  cancel: "cancel",
  conflict: "menu-translations-conflict",
  saveError: "save-error",
  collapse: "collapse",
  expand: "expand",
  search: "search",
  sections: "sections",
  nothingFound: "menu-translations-nothing-found",
  back: "menu-translations-back",
});

function menuText(key) {
  const locale = String(document.documentElement?.lang || "en")
    .toLowerCase()
    .split("-")[0];
  return MENU_TRANSLATIONS[locale]?.[key] || MENU_TRANSLATIONS.en[key] || key;
}

function joinClasses(...tokens) {
  return tokens.flat().filter(Boolean).join(" ");
}

function isIconSource(value = "") {
  const source = String(value || "").trim();

  if (!source) return false;

  return (
    /^(https?:)?\/\//i.test(source) ||
    /^(data:image\/|blob:)/i.test(source) ||
    source.startsWith("/") ||
    source.startsWith("./") ||
    source.startsWith("../") ||
    /\.(svg|png|jpe?g|webp|gif|avif)(\?.*)?(#.*)?$/i.test(source)
  );
}

function renderPlaceholder(label) {
  const letters = getInitials(label);

  return html`<span
    class="sf-admin-menu-item-placeholder flex items-cross-center content-main-center flex-none"
    >${letters}</span
  >`;
}

function renderIcon(icon, alt = "", rootClass = "flex-none") {
  if (!icon) return nothing;

  if (isIconSource(icon)) {
    return html`<span class="sf-admin-menu-item-icon flex-none">
      <img
        src=${icon}
        class="w-full h-full object-contain"
        alt=${alt}
        aria-hidden=${alt ? nothing : "true"}
      />
    </span> `;
  }

  return html` <sf-icon
    root-class=${rootClass}
    aria-hidden="true"
    icon="${icon}"
  ></sf-icon>`;
}

// An item's counter (simai/ui-source#12). The menu draws it itself, with the
// SIMAI Framework's anchored-badge classes and its rules: a number capped at
// 99+, nothing at 0, the digits hidden from assistive technology and the
// phrase («8 непрочитанных») in the item's name. It is the last thing in the
// item's container, so it stands at the row's end, and in the compact menu the
// free admin-menu sheet puts it on the item's icon or avatar, the way chat apps
// do. A word that is not a number stays a label at the row's end, and is a dot
// on the icon when compact, the word in the name.
//
// It carries no data-count, so the Framework's badge runtime leaves it alone.
// The loader injects the badges component's script once per plugin that names
// it as a relation -- four times on ui-admin's mock-api page -- and each copy
// boots its own observer and its own record of the names it wrote; on a count
// whose phrase the runtime joins to an aria-label, the copies took each other's
// names for the author's and appended the phrase without end, and the page
// never settled (2026-10-21). Drawn here, the counter follows the item's data
// on every render and does not depend on how many copies there are.
const COUNTER_CAP = 99;
const COUNTER_TEXT = wordsOf({
  count: "count",
  dot: "dot",
});
const PLURAL_CATEGORIES = ["zero", "one", "two", "few", "many", "other"];

function pageLocale() {
  return String(document.documentElement?.lang || "en").toLowerCase().split("-")[0];
}

function countPhrase(count) {
  // The Framework's own phrase when its badge runtime is on the page (it knows
  // the languages registered with SF.language); the same words otherwise.
  try {
    const phrase = globalThis.SF?.AnchoredBadge?.state?.({count}, document.documentElement)?.phrase;
    if (phrase) return phrase;
  } catch {
    // The menu's own words below.
  }
  const locale = pageLocale();
  const forms = (COUNTER_TEXT[locale] || COUNTER_TEXT.en).count.split("|");
  let form = forms[forms.length - 1];
  try {
    const rules = new Intl.PluralRules(locale);
    const has = new Set(rules.resolvedOptions().pluralCategories);
    const index = PLURAL_CATEGORIES.filter((category) => has.has(category)).indexOf(rules.select(count));
    form = forms[Math.min(Math.max(index, 0), forms.length - 1)];
  } catch {
    // The last form.
  }
  return form.replaceAll("{count}", String(count));
}

/**
 * What a counter shows and says: null when it shows nothing (empty, 0 or
 * less); else {dot, text, phrase} -- `text` the figures drawn (capped), empty
 * for a dot; `phrase` what joins the name.
 */
export function counterOf(value, dotPhrase = "") {
  const source = String(value ?? "").trim();
  if (!source) return null;
  const number = Number(source);
  if (Number.isFinite(number)) {
    const count = Math.trunc(number);
    if (count <= 0) return null;
    return {dot: false, text: count > COUNTER_CAP ? `${COUNTER_CAP}+` : String(count), phrase: countPhrase(count)};
  }
  return {dot: true, text: "", phrase: dotPhrase || source};
}

/** A name with a counter's phrase after it: «Входящие, 8 непрочитанных». */
export function nameWithCounter(name, counter) {
  const words = String(name ?? "").trim();
  if (!counter?.phrase) return words;
  return words ? `${words}, ${counter.phrase}` : counter.phrase;
}

/** The dot phrase of the page language, for a dot that names nothing. */
export function dotPhrase() {
  return (COUNTER_TEXT[pageLocale()] || COUNTER_TEXT.en).dot;
}

function badgeShows(item) {
  return Boolean(counterOf(item.badge));
}

function renderCounter(item, compact) {
  const counter = counterOf(item.badge);
  if (!counter) return nothing;
  if (counter.dot && !compact) {
    return html`<sf-badge
      class="sf-admin-menu-item-counter"
      aria-hidden="true"
      size="1/3"
      appearance="main"
      status="error"
      text="${String(item.badge).trim()}"
    ></sf-badge>`;
  }
  return html`<span
    class="sf-badge sf-badge--main sf-badge--error sf-badge--size-1/3 sf-admin-menu-item-counter inline-flex flex-nowrap justify-center items-center${counter.dot ? " sf-badge--dot" : ""}"
    aria-hidden="true"
    title=${counter.phrase}
  >${counter.text}</span>`;
}

// The item's name: its words, which the compact item does not show, and the
// counter's phrase.
function itemName(item) {
  const name = nameWithCounter(item.label, counterOf(item.badge));
  return name || nothing;
}

function renderBadge(item) {
  if (!item.badge) return nothing;

  return html` <sf-badge
    size="1/3"
    appearance="main"
    status="error"
    text="${item.badge}"
  ></sf-badge>`;
}

export function renderAdminMenuTemplate(context) {
  const component = context.component;
  const {
    panels,
    hasHidden,
    visible,
    open,
    menuSettings,
    searchQuery,
    searchResults,
    searchGroups,
    searchRecent,
    searchPending,
    searchActiveId,
    settingsStatus,
    settingsError,
  } = component.state;

  // The counter is the container's last child in both modes (renderCounter).
  // Compact, the container holds the icon alone in the flow, so it is as big as
  // the icon -- the counter's anchor -- and the item's words are its
  // aria-label (renderMenuButton, renderMenuLink).
  function renderItemContent(item, trailing = nothing, showSettings = false) {
    return !context.compact
      ? html`
          <span
            class="sf-admin-menu-item-container max-w-full wrap-none flex items-cross-center flex-1"
          >
            ${item.leftIcon
              ? renderIcon(item.leftIcon)
              : item.placeholder
                ? renderPlaceholder(item.label)
                : nothing}
            <span class="sf-admin-menu-item-label overflow-hidden whitespace-nowrap t-ellipsis"
              >${item.label}</span
            >
            ${showSettings ? nothing : renderCounter(item, false)}
          </span>
          ${showSettings || badgeShows(item) ? nothing : trailing}
        `
      : html`<span
          class="sf-admin-menu-item-container flex items-cross-center"
        >
              ${item.leftIcon
                  ? renderIcon(item.leftIcon)
                  : item.placeholder
                      ? renderPlaceholder(item.label)
                      : nothing}
              ${showSettings ? nothing : renderCounter(item, true)}
        </span> `;
  }

  function renderMenuButton(item, className, showSettings = false) {
    const trailing = renderIcon(
      "chevron_right",
      "",
      "sf-admin-menu-direction-icon flex-none",
    );

    return html`
      <button
        type="button"
        class=${className}
        aria-label=${itemName(item)}
        title=${context.compact && item.label ? item.label : nothing}
        aria-expanded=${panels[item.panelId]?.open ? "true" : "false"}
        @click=${(event) => {
          event.preventDefault();
          event.stopPropagation();
          component.togglePanel(item.panelId, true, event.currentTarget);
        }}
        ?disabled=${Boolean(item.disabled)}
      >
        ${renderItemContent(item, trailing, showSettings)}
      </button>
    `;
  }

  function renderMenuLink(item, className, showSettings = false) {
    if (item.disabled) {
      return html`
        <span class=${className} aria-disabled="true">
          ${renderItemContent(item, nothing, showSettings)}
        </span>
      `;
    }

    return html`
      <a
        class=${className}
        aria-label=${itemName(item)}
        title=${context.compact && item.label ? item.label : nothing}
        href=${item.href || "#"}
        target=${item.target || nothing}
        rel=${item.rel || nothing}
        aria-current=${item.current ? "page" : nothing}
      >
        ${renderItemContent(item, nothing, showSettings)}
      </a>
    `;
  }

  function renderSearchResultPath(item) {
    const parentPath = (item.path || []).slice(0, -1);
    if (!parentPath.length) return nothing;

    return html`
      <span
        class="sf-admin-menu-search-result-path sf-text-1/3 color-on-surface-variant overflow-hidden whitespace-nowrap t-ellipsis"
        >${parentPath.join(" / ")}</span
      >
    `;
  }

  function renderSearchResult(item) {
    const content = html`
      <span
        class="sf-admin-menu-item-container max-w-full wrap-none flex items-cross-center flex-1"
      >
        ${item.leftIcon
          ? renderIcon(item.leftIcon)
          : item.placeholder
            ? renderPlaceholder(item.label)
            : nothing}
        <span class="flex flex-col min-w-0">
          <span class="overflow-hidden whitespace-nowrap t-ellipsis"
            >${item.label}</span
          >
          ${renderSearchResultPath(item)}
        </span>
      </span>
      ${item.badge ? renderBadge(item) : nothing}
    `;

    if (item.href && item.href !== "#") {
      return html`
        <li class="sf-admin-menu-item-wrap flex items-cross-center">
          <a
            class="sf-admin-menu-item flex items-cross-center flex-1 max-w-full min-w-0"
            href=${item.href}
            target=${item.target || nothing}
            rel=${item.rel || nothing}
            @click=${(event) => component.openSearchResult(item, event)}
          >
            ${content}
          </a>
        </li>
      `;
    }

    return html`
      <li class="sf-admin-menu-item-wrap flex items-cross-center">
        <button
          type="button"
          class="sf-admin-menu-item flex items-cross-center flex-1 max-w-full min-w-0"
          @click=${(event) => component.openSearchResult(item, event)}
        >
          ${content}
        </button>
      </li>
    `;
  }

  // The matched part of a label, marked. The parts come from the component, which
  // did the comparing; the template only puts a <mark> around them.
  function renderMatch(label, match) {
    const text = String(label ?? "");
    if (!match || match.start < 0) return text;
    const start = text.slice(0, match.start);
    const middle = text.slice(match.start, match.start + match.length);
    const end = text.slice(match.start + match.length);

    return html`${start}<mark class="sf-admin-menu-search-mark">${middle}</mark>${end}`;
  }

  function renderSearchRow({id, kind, item}) {
    const selected = searchActiveId === id;
    const rowClass = joinClasses(
      "sf-admin-menu-item sf-admin-menu-search-row flex items-cross-center flex-1 max-w-full min-w-0",
      selected ? "selected" : "",
    );
    const body = html`
      <span class="sf-admin-menu-item-container max-w-full wrap-none flex items-cross-center flex-1">
        ${kind === "host"
          ? item.icon
            ? renderIcon(item.icon)
            : renderPlaceholder(item.text)
          : item.leftIcon
            ? renderIcon(item.leftIcon)
            : renderPlaceholder(item.label)}
        <span class="flex flex-col min-w-0">
          <span class="overflow-hidden whitespace-nowrap t-ellipsis">
            ${kind === "host" ? item.text : renderMatch(item.label, item.match)}
          </span>
          ${kind === "host"
            ? item.subtext
              ? html`<span
                  class="sf-admin-menu-search-result-path sf-text-1/3 color-on-surface-variant overflow-hidden whitespace-nowrap t-ellipsis"
                  >${item.subtext}</span
                >`
              : nothing
            : item.parentLabel
              ? html`<span
                  class="sf-admin-menu-search-result-path sf-text-1/3 color-on-surface-variant overflow-hidden whitespace-nowrap t-ellipsis"
                  >${item.parentLabel}</span
                >`
              : nothing}
        </span>
      </span>
    `;

    return html`
      <li class="sf-admin-menu-item-wrap flex items-cross-center" role="presentation">
        ${kind === "host"
          ? html`<a id=${id} role="option" aria-selected=${selected ? "true" : "false"}
                class=${rowClass} href=${item.href}>${body}</a>`
          : html`<button id=${id} role="option" aria-selected=${selected ? "true" : "false"}
                type="button" class=${rowClass}
                @click=${(event) => component.openSearchResult(item, event)}>${body}</button>`}
      </li>
    `;
  }

  function renderSearchGroup(label, rows, more = null) {
    if (!rows.length) return nothing;

    return html`
      <div class="sf-admin-menu-search-group flex flex-col">
        <div class="sf-admin-menu-search-group-head flex items-cross-center content-main-between">
          <span>${label}</span>
          ${more ? html`<a href=${more.href}>${more.text}</a>` : nothing}
        </div>
        <ul class="p-0 m-0 gap-1/3 flex flex-col" role="presentation">
          ${rows.map((row) => renderSearchRow(row))}
        </ul>
      </div>
    `;
  }

  // Two rows of nothing while the host is answering. They are not results, so
  // they carry no role and the list below stays the list the keyboard reads.
  function renderSearchSkeletons() {
    return html`
      <div class="sf-admin-menu-search-group flex flex-col" aria-hidden="true">
        <span class="sf-admin-menu-search-skeleton"></span>
        <span class="sf-admin-menu-search-skeleton"></span>
      </div>
    `;
  }

  function renderSearchPanelBody() {
    const rows = component.getSearchSelectables();
    const sections = rows.filter((row) => row.kind === "section");
    // An empty field shows what the host offers standing -- a recent list --
    // and a typed one shows the answer to that query.
    const groups = searchQuery ? searchGroups || [] : searchRecent || [];
    const hosted = [];
    let index = sections.length;
    for (const group of groups) {
      hosted.push({group, rows: group.items.map((item, position) => rows[index + position])});
      index += group.items.length;
    }

    return html`
      <div class="sf-admin-menu-search-field flex-none">
        <span class="sf-input sf-input--size-1 sf-input--filled flex flex-col">
          <span class="sf-input-field items-cross-center transition flex">
            <span class="sf-input-left flex"><sf-icon icon="search"></sf-icon></span>
            <input
              type="search"
              role="combobox"
              aria-expanded="true"
              aria-controls="sf-admin-search-list"
              aria-activedescendant=${searchActiveId || nothing}
              aria-label=${context.searchPlaceholder || menuText("search")}
              placeholder=${context.searchPlaceholder || nothing}
              name="sf_admin_search_input"
              .value=${searchQuery || ""}
              @input=${(event) => component.search(event.target.value)}
              @keydown=${(event) => component.handleSearchKeydown(event)}
            />
            <span class="sf-input-right"><kbd class="sf-admin-menu-search-kbd">Esc</kbd></span>
          </span>
        </span>
      </div>
      <div id="sf-admin-search-list" role="listbox" aria-label=${menuText("search")}
           class="sf-admin-menu-search-results-area flex-auto min-h-0 overflow-auto flex flex-col">
        ${searchQuery ? renderSearchGroup(menuText("sections"), sections) : nothing}
        ${hosted.map((entry) => renderSearchGroup(entry.group.label, entry.rows, entry.group.more))}
        ${searchQuery && searchPending ? renderSearchSkeletons() : nothing}
        ${searchQuery && !rows.length && !searchPending
          ? html`<div class="sf-admin-menu-search-empty p-2 color-on-surface-variant">
              ${menuText("nothingFound")} «${searchQuery}»
            </div>`
          : nothing}
        ${!searchQuery && context.searchHint
          ? html`<div class="sf-admin-menu-search-hint p-2 color-on-surface-variant">
              ${context.searchHint}
            </div>`
          : nothing}
      </div>
      <div class="sf-admin-menu-search-keys flex-none">${context.searchKeysHint}</div>
    `;
  }

  function renderSearchResults() {
    if (!searchQuery) return nothing;

    if (!searchResults?.length) {
      return html`
        <div class="sf-admin-menu-search-empty p-2 color-on-surface-variant">
          ${menuText("empty")}
        </div>
      `;
    }

    return html`
      <ul class="sf-admin-menu-search-results p-0 m-0 gap-1/3 flex flex-col">
        ${searchResults.map(renderSearchResult)}
      </ul>
    `;
  }

  function renderSettings() {
    if (!context.collapsible && !context.settings) return nothing;
    return html`
      <li class="sf-admin-menu-item-wrap flex flex-col">
        <button
          type="button"
          class="sf-admin-menu-item flex-1 flex items-cross-center"
        >
          <span
            class="sf-admin-menu-item-container flex items-cross-center flex-1"
          >
            <i class="sf-icon sf-icon-loaded" aria-hidden="true">star</i>
            <span>${menuText("favorites")}</span>
          </span>
        </button>
      </li>
      <li class="sf-admin-menu-item-wrap flex flex-col">
        ${!menuSettings
          ? html` <div
              class="sf-admin-menu-item${context.collapsible && context.settings
                ? "-segment"
                : ""} flex items-cross-center"
            >
              ${context.settings && !context.compact
                ? html` <button
                    type="button"
                    @click="${() => component.toggleMenuSettings()}"
                    data-action="settings"
                    aria-label=${context.settingsTitle}
                    class="sf-admin-menu-item flex-1${context.collapsible
                      ? " segment-start "
                      : " "}flex items-cross-center"
                  >
                    <span
                      class="sf-admin-menu-item-container flex items-cross-center flex-1"
                    >
                      <i class="sf-icon sf-icon-loaded">settings</i>
                      <span>${context.settingsTitle}</span>
                    </span>
                  </button>`
                : nothing}
              ${context.collapsible
                ? html`
                    <button
                      @click=${() => component.toggleCompact()}
                      type="button"
                      class="sf-admin-menu-item${context.settings
                        ? " segment-end "
                        : " "}flex items-cross-center"
                      data-admin-menu-toggle
                      aria-label=${context.compact
                        ? menuText("expand")
                        : menuText("collapse")}
                    >
                      <span
                        class="sf-admin-menu-item-container flex items-cross-center flex-1"
                      >
                        <sf-icon
                          icon="keyboard_double_arrow_${context.compact
                            ? "right"
                            : "left"}"
                          root-class="sf-admin-menu-direction-icon"
                        ></sf-icon>
                      </span>
                    </button>
                  `
                : nothing}
            </div>`
          : html` <div
              class="sf-admin-menu-item-segment flex items-cross-center"
            >
              <button
                type="button"
                @click="${() => component.saveMenuSettings()}"
                class="sf-admin-menu-item segment-start flex-1 flex items-cross-center"
                ?disabled=${settingsStatus === "saving"}
              >
                <span
                  class="sf-admin-menu-item-container flex items-cross-center flex-1"
                >
                  <i class="sf-icon sf-icon-loaded">save</i>
                  <span>${settingsStatus === "saving" ? menuText("saving") : menuText("save")}</span>
                </span>
              </button>
              <button
                @click=${(event) =>
                  component.openContextMenu(event, {
                    position: "left-bottom",
                    items: [
                      {
                        component: "sf-button",
                        props: {
                          appearance: "link",
                          scheme: "on-surface",
                          iconStart: "save",
                          text: menuText("save"),
                          "@click": () => {
                            component.saveMenuSettings();
                          },
                        },
                      },
                      ...(context.persistenceMode === "external" && context.allowSystemSettings
                        ? [{
                            component: "sf-button",
                            props: {
                              appearance: "link",
                              scheme: "on-surface",
                              iconStart: context.settingsMode === "system" ? "person" : "groups",
                              text: context.settingsMode === "system"
                                ? menuText("personalSettings")
                                : menuText("systemSettings"),
                              "@click": () => component.selectSettingsMode(
                                context.settingsMode === "system" ? "user" : "system",
                              ),
                            },
                          }]
                        : []),
                      ...(context.persistenceMode === "external" ? [{
                        component: "sf-button",
                        props: {
                          appearance: "link",
                          scheme: "on-surface",
                          iconStart: "visibility",
                          text: menuText("hiddenItems"),
                          "@click": () => {
                            component.toggleHidden();
                          },
                        },
                      },
                      ...(context.persistenceMode !== "external"
                        ? [{
                        component: "sf-button",
                        props: {
                          appearance: "link",
                          scheme: "on-surface",
                          iconStart: "horizontal_rule",
                          text: menuText("addDivider"),
                          "@click": () => {
                            component.createDivider();
                          },
                        },
                      }]
                        : []),
                      {
                        component: "sf-button",
                        props: {
                          appearance: "link",
                          scheme: "on-surface",
                          iconStart: "refresh",
                          text: menuText("refreshState"),
                          "@click": () => component.refreshSettings(),
                        },
                      }] : []),
                      {
                        component: "sf-button",
                        props: {
                          appearance: "link",
                          scheme: "on-surface",
                          iconStart: "restart_alt",
                          text: menuText("resetSettings"),
                          "@click": () => component.resetMenuSettings(),
                        },
                      },
                      {
                        component: "sf-button",
                        props: {
                          appearance: "link",
                          scheme: "on-surface",
                          iconStart: "close",
                          text: menuText("cancel"),
                          "@click": () => component.cancelMenuSettings(),
                        },
                      },
                    ],
                  })}
                type="button"
                class="sf-admin-menu-item segment-end flex items-cross-center"
                data-admin-menu-settings
                aria-label=${menuText("personalSettings")}
                aria-haspopup="menu"
                aria-expanded="false"
                ?disabled=${settingsStatus === "saving"}
              >
                <span
                  class="sf-admin-menu-item-container pointer-event-none flex items-cross-center flex-1"
                >
                  <sf-icon icon="settings"></sf-icon>
                </span>
              </button>
            </div>`}
        ${settingsStatus === "conflict" || settingsStatus === "error"
          ? html`<div class="sf-admin-menu-settings-status color-danger p-1/2 flex flex-col gap-1/3" role="alert">
              <span>${settingsStatus === "conflict"
                ? menuText("conflict")
                : settingsError || menuText("saveError")}</span>
              <sf-button
                appearance="link"
                scheme="primary"
                size="1/2"
                text=${settingsStatus === "conflict" ? menuText("refreshState") : menuText("save")}
                @click=${settingsStatus === "conflict"
                  ? () => component.refreshSettings()
                  : () => component.saveMenuSettings()}
              ></sf-button>
            </div>`
          : nothing}
      </li>
    `;
  }

  function renderBottom() {
    if (!context.bottomItems?.length && !context.collapsible) return nothing;

    return html`
      <div class="sf-admin-menu-bottom flex-none">
        <nav>
          <ul class="p-0 m-0 gap-1/3 flex flex-col">
            ${(context.bottomItems || []).map((item) => {
              return renderMenuItem(item);
            })}
            ${renderSettings(context)}
          </ul>
        </nav>
      </div>
    `;
  }

  function renderSearch() {
    if (!context.searchable) return nothing;
    // In panel mode there is no row to render: the magnifier in the header
    // opens the panel, and a collapsed menu shows the magnifier first in the
    // icon column and expands straight into the panel.
    if (context.searchMode === "panel" && !context.compact) return nothing;

    return html`
      <div class="sf-admin-menu-search flex-none">
        ${context.compact
          ? html` <button
              id="search_toggle_menu"
              data-sf-admin-search-toggle
              @click=${() => {
                if (context.searchMode === "panel") {
                  component.openSearchPanel();
                  return;
                }
                component.setCompact(false, "search");
                component.focusSearchInput();
              }}
              type="button"
              class="sf-admin-menu-item flex items-cross-center"
              aria-label=${context.searchPlaceholder || menuText("search")}
            >
              <span
                class="sf-admin-menu-item-container flex items-cross-center flex-1"
              >
                <i class="sf-icon sf-icon-loaded">search</i>
              </span>
            </button>`
          : nothing}
        ${!context.compact
          ? html` <sf-input
              size="1"
              appearance="filled"
              @input=${(event) => {
                component.search(event.target.value);
              }}
              placeholder="${context.searchPlaceholder || nothing}"
              name="sf_admin_search_input"
              left-icon="search"
            ></sf-input>`
          : nothing}
      </div>
    `;
  }

  function renderHeader(main = true, item = null) {
    if (main) {
      if (!context.logo && !context.brand) return nothing;

      return html`
        <div class="sf-admin-menu-head flex flex-none">
          <div class="sf-admin-menu-head-container flex items-cross-center">
            ${context.logo
              ? html`<a
                  class="sf-admin-menu-head-logo flex"
                  href=${context.logoHref || "#"}
                >
                  <img
                    class="sf-admin-menu-logo"
                    src=${context.logo}
                    alt=${context.brand || ""}
                  />
                </a>`
              : nothing}
            ${context.brand ? html`<span>${context.brand}</span>` : nothing}
          </div>
          ${context.searchMode === "panel" && !context.compact
            ? html`<sf-icon-button
                data-sf-admin-search-toggle
                root-class="sf-admin-menu-search-toggle"
                appearance="link"
                scheme="on-surface"
                icon="search"
                title=${context.searchLabel}
                aria-label=${context.searchLabel}
                @click=${() => component.openSearchPanel()}
              ></sf-icon-button>`
            : nothing}
        </div>
      `;
    } else {
      // The back row is an item, not an icon button in a padded header: that is
      // what puts the arrow in the column the item icons are in and the section's
      // name where an item's label would be. Aligning a bare button by
      // arithmetic worked out to the same place and would have drifted the moment
      // either padding changed.
      return html` <div
        class="sf-admin-menu-head items-cross-center flex content-main-between flex-none"
      >
        <button
          type="button"
          class="sf-admin-menu-item sf-admin-menu-back flex items-cross-center flex-1 min-w-0"
          aria-label=${menuText("back")}
          @click=${(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (item.panelId === "search_panel") {
              component.closeSearchPanel();
              return;
            }
            component.togglePanel(item.panelId, false);
          }}
        >
          <span
            class="sf-admin-menu-item-container sf-admin-menu-head-container flex items-cross-center flex-1 min-w-0"
          >
            <i class="sf-icon sf-icon-loaded sf-admin-menu-back-button">chevron_left</i>
            <span class="overflow-hidden whitespace-nowrap t-ellipsis">${item.label}</span>
          </span>
        </button>
      </div>`;
    }
  }

  function renderMenuDivider(item, main = false) {
    const showSettings = main && menuSettings;
    const isTempVisible = visible[item.panelId]?.temp === true;
    const hidden =
      (item.hidden && !isTempVisible) ||
      (!menuSettings &&
        !open &&
        main &&
        visible[item.panelId] &&
        !visible[item.panelId].visible);

    return html`
      <li
        :key=${item.panelId}
        data-order="${item.order}"
        data-panel-id="${item.panelId}"
        :ref=${main ? component.getItemRef(item.panelId) : nothing}
        class="sf-admin-menu-item-wrap sf-admin-menu-divider-wrap flex items-cross-center${hidden
          ? " hidden"
          : ""}${showSettings ? " settings-on relative" : ""}"
        role="presentation"
      >
        ${showSettings
          ? html` <sf-icon-button
              id="${item.panelId}_move"
              appearance="link"
              data-move
              scheme="on-surface"
              aria-label="Set order"
              icon="drag_indicator"
              root-class="cursor-move"
            ></sf-icon-button>`
          : nothing}
        <span
          class="sf-admin-menu-divider flex-1${showSettings
            ? " settings-active"
            : ""}"
        >
          <span
            class="flex flex-1"
            role="separator"
            aria-orientation="horizontal"
          ></span>
        </span>
        ${showSettings
          ? html` <sf-icon-button
              id="${item.panelId}_settings"
              appearance="link"
              @click=${(event) =>
                component.openContextMenu(event, {
                  tempVisible: isTempVisible,
                })}
              data-settings
              scheme="on-surface"
              aria-label="Item Settings"
              root-class="absolute sf-admin-menu-item-settings"
              icon="more_vert"
            ></sf-icon-button>`
          : nothing}
      </li>
    `;
  }

  function renderMenuItem(item, main = false) {
    if (item.type === "divider") {
      return renderMenuDivider(item, main);
    }
    const panelVisibility = visible[item.panelId];

    const isTempVisible = panelVisibility?.temp === true;
    const showSettings = main && menuSettings;
    const isOverflowHidden =
      !menuSettings &&
      !open &&
      main &&
      !isTempVisible &&
      panelVisibility?.visible === false;
    const itemClass = joinClasses(
      `sf-admin-menu-item flex items-cross-center flex flex-1 max-w-full min-w-0`,
      item.active || item.current ? "active" : "",
      isTempVisible ? " opacity-5" : "",
      item.disabled ? "disabled" : "",
      showSettings ? "settings-active" : "",
    );
    const hidden = (item.hidden && !isTempVisible) || isOverflowHidden;
    return html`
      <li
        :key=${item.panelId}
        data-order="${item.order}"
        data-panel-id="${item.panelId}"
        :ref=${main ? component.getItemRef(item.panelId) : nothing}
        class="sf-admin-menu-item-wrap flex items-cross-center${hidden
          ? " hidden"
          : ""}${showSettings ? " settings-on relative" : ""}"
      >
        <!-- Продумать touch-action: none;-->
        ${showSettings
          ? html` <sf-icon-button
              id="${item.panelId}_move"
              appearance="link"
              data-move
              scheme="on-surface"
              aria-label="Set order"
              icon="drag_indicator"
              root-class="cursor-move"
            ></sf-icon-button>`
          : nothing}
        ${item.children?.length
          ? renderMenuButton(item, itemClass, showSettings)
          : renderMenuLink(item, itemClass, showSettings)}
        ${showSettings
          ? html` <sf-icon-button
              id="${item.panelId}_settings"
              appearance="link"
              @click=${(event) =>
                component.openContextMenu(event, {
                  tempVisible: isTempVisible,
                })}
              data-settings
              scheme="on-surface"
              aria-label="Item Settings"
              root-class="absolute sf-admin-menu-item-settings"
              icon="more_vert"
            ></sf-icon-button>`
          : nothing}
      </li>
    `;
  }

  function renderPanel(item, level = 1) {
    if (!item.children?.length) return nothing;
    const isOpen = Boolean(panels[item.panelId]?.open);
    const hasOpenChild = item.children.some(
      (child) => child.children?.length && panels[child.panelId]?.open,
    );
    const isInteractive = isOpen && !hasOpenChild;
    return html`
      <section
        class=${joinClasses(
          "sf-admin-menu-panel sf-admin-menu-panel-sub flex flex-col transition-all top-0 bottom-0 absolute overflow-hidden z-7",
          isOpen ? "open" : "",
        )}
        data-panel=${item.panelId}
        data-level=${level}
        aria-label=${item.label || nothing}
        aria-hidden=${isInteractive ? nothing : "true"}
        ?inert=${!isInteractive}
      >
        ${renderHeader(false, item)}
        <nav
          class="sf-admin-menu-section sf-admin-menu-main-sub flex-auto min-h-0"
        >
          <ul class="p-0 m-0 gap-1/3 flex flex-col">
            ${item.children.map((item) => {
              return renderMenuItem(item);
            })}
          </ul>
        </nav>
      </section>
      ${item.children.map((child) => renderPanel(child, level + 1))}
    `;
  }

  const panelClass = joinClasses(
    "sf-admin-menu-panel flex flex-col h-full overflow-hidden z-6",
    context.compact ? "small" : "",
    context.panelClass,
  );
  const hasOpenNestedPanel = [
    ...(context.items || []),
    ...(context.bottomItems || []),
  ].some((item) => item.children?.length && panels[item.panelId]?.open);

  return html`
    <aside
      :ref=${component.refs.mainPanel}
      class=${joinClasses(
        "sf-admin-menu flex h-full relative z-6",
        context.rootClass,
      )}
      style=${context.rootStyle || nothing}
      aria-label=${context.ariaLabel || nothing}
    >
      <section
        class=${panelClass}
        aria-hidden=${hasOpenNestedPanel ? "true" : nothing}
        ?inert=${hasOpenNestedPanel}
      >
        ${renderHeader()} ${renderSearch()}
        <nav
          :ref=${component.refs.menuPanel}
          class="sf-admin-menu-section sf-admin-menu-main flex-auto min-h-0 ${open ||
          menuSettings
            ? "overflow-auto open"
            : ""}"
        >
          <ul class="p-0 m-0 gap-1/3 flex flex-col">
            ${(context.items || []).map((item) => {
              return renderMenuItem(item, true);
            })}
            ${hasHidden && !menuSettings
              ? html` <li class="sf-admin-menu-item-wrap flex flex-col more">
                  <button
                    type="button"
                    @click=${() => component.toggleOpen()}
                    class="sf-admin-menu-item flex items-cross-center"
                  >
                    <span
                      class="sf-admin-menu-item-container flex items-cross-center flex-1"
                      ><i class="sf-icon sf-icon-loaded"
                        >keyboard_arrow_${open ? "up" : "down"}</i
                      ><span class="sf-admin-menu-more-text"
                        >${open ? menuText("collapse") : menuText("expand")}</span
                      ></span
                    >
                  </button>
                </li>`
              : nothing}
          </ul>
        </nav>
        ${renderBottom(context)}
      </section>
      ${(context.items || []).map((item) => renderPanel(item))}
      ${(context.bottomItems || []).map((item) => renderPanel(item))}
      ${!context.searchable
        ? nothing
        : html` <section
            class=${joinClasses(
              "sf-admin-menu-panel sf-admin-menu-panel-search w-full flex flex-col transition-all top-0 bottom-0 bg-surface-1 absolute overflow-hidden",
              panels["search_panel"]?.open ? "open z-7" : "z-5",
            )}
            data-panel="search_panel"
            aria-label=${menuText("search")}
            aria-hidden=${panels["search_panel"]?.open ? nothing : "true"}
            ?inert=${!panels["search_panel"]?.open}
          >
            ${renderHeader(false, {
              label: context.searchTitle || menuText("search"),
              panelId: "search_panel",
            })}
            ${context.searchMode === "panel"
              ? renderSearchPanelBody()
              : html`<nav
                  class="sf-admin-menu-section sf-admin-menu-search-section flex-auto min-h-0 overflow-auto"
                >
                  ${renderSearchResults()}
                </nav>`}
          </section>`}
    </aside>
  `;
}
