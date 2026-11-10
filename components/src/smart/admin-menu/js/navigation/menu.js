// The navigation's menus are the Framework's standard menu (owner,
// 2026-10-12): one sf-menu-context beside the page, filled with the entries of
// whichever menu is asked for and opened for the control that asked. It lives
// outside the navigation's own rendering, so a re-render of the columns does
// not take an open menu away.

// The standard menu is a lazy relation: fetched after the page is ready, so a
// press that comes before it has arrived asks the Loader for it and waits.
async function standardMenuDefined() {
    await globalThis.SF?.Loader?.ensure?.(["sf-menu-context"]);
    return Boolean(customElements.get("sf-menu-context"));
}

export async function openMenu(controller, anchor, {label, entries, select, side = "block-end", align = "start", width = "content", search = null, onSearch = null, onClose = null}) {
    if (!(anchor instanceof Element)) return null;
    if (!(await standardMenuDefined())) return null;
    let menu = controller._menu;
    if (!menu?.isConnected) {
        menu = document.createElement("sf-menu-context");
        menu.setAttribute("popup", "");
        menu.dataset.sfAdminNavMenu = "";
        menu.addEventListener("sf-menu-context-select", (event) => controller._menuSelect?.(event.detail?.id, event));
        menu.addEventListener("sf-menu-context-search", (event) => controller._menuSearch?.(event.detail?.query ?? ""));
        // Closed, not asked to close: sf-menu-context-close is the cancelable
        // request sent before an owned menu closes (SIMAI Framework 1.3.8 §19.3).
        menu.addEventListener("sf-menu-context-closed", (event) => {
            if (event.target !== menu) return;
            const closed = controller._menuClose;
            controller._menuClose = null;
            closed?.();
        });
        (controller.element.closest("dialog[open]") || document.body).append(menu);
        controller._menu = menu;
    }
    if (menu.isOpen && controller._menuAnchor === anchor) {
        menu.close();
        return null;
    }
    // The menu that was open hears that it closed before another takes its place.
    if (menu.isOpen) menu.close({restoreFocus: false});
    menu.setAttribute("aria-label", label ?? "");
    menu.search = search;
    menu.entries = entries;
    controller._menuSelect = select;
    controller._menuSearch = onSearch;
    controller._menuClose = onClose;
    controller._menuAnchor = anchor;
    // "trigger" here is at least the button's width and wider when a line
    // needs it: exactly the button's width cut «Безопасность учётной записи»
    // and «Профиль меню» in the profile menu (Larena, 2026-10-14). That is the
    // Framework's "list" kind (decision C32, sf-menu-context 1.14.0): at least
    // the trigger, up to the list's step or the trigger, whichever is wider,
    // and both follow the page's density. The floor this menu used to write
    // itself (the trigger's px as --sf-context-menu--min-inline-size) is
    // removed, so a menu of the previous release's page does not keep it.
    menu.style.removeProperty("--sf-context-menu--min-inline-size");
    return menuOpened(await menu.openFor(anchor, {side, align, width: width === "trigger" ? "list" : "content"}));
}

// Whether the standard menu opened. sf-menu-context answered true or false
// before 1.12.2 and answers an outcome since ({outcome: "applied" | "refused"
// | "unavailable", ...}, SIMAI Framework fix/action-call-defects): a refused
// open is an object, truthy, and the site switcher read it as open and kept
// its list waiting for a menu that never showed. Both answers are read here,
// so the navigation works with the menu of either pair.
export function menuOpened(answer) {
    return answer === true || answer?.outcome === "applied";
}

// Whether the shared menu is open for this anchor now.
export function menuOpenFor(controller, anchor) {
    return Boolean(controller._menu?.isOpen && controller._menuAnchor === anchor);
}

// New entries for the menu -- a search answered, a page more. Set whether or
// not it has finished opening: the first answer can arrive before it has, and
// a menu that took it only when open stayed empty.
export function updateMenu(controller, entries) {
    if (controller._menu) controller._menu.entries = entries;
}

export function closeMenu(controller) {
    controller._menu?.close?.({restoreFocus: false});
}

export function removeMenu(controller) {
    closeMenu(controller);
    controller._menu?.remove();
    controller._menu = null;
}
