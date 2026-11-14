// A row's context menu (decision C164 (1)(2), defect TL-2): a right click on
// the row, the context-menu key and Shift+F10 open the same menu, with the
// same list, as the row's ⋯. The menu is SIMAI Framework's sf-menu-context; a
// right click opens it at the pointer through its point anchor
// (sf-menu-context 1.18.0: a fixed box of no size, removed when the menu
// closes). The core's one SF.menu.open (C184) is not in the pair this is built
// over; when it is, the rows open through it and these two helpers go.

/** Whether a keydown asks for a context menu: the menu key or Shift+F10. */
export const isMenuKey = (event) => event?.key === "ContextMenu" || (event?.shiftKey === true && event?.key === "F10");

/** A point anchor at the pointer of a right click, for sf-menu-context.openFor(). */
export function pointAnchor(event) {
    const point = document.createElement("span");
    point.style.cssText = `position: fixed; left: ${event.clientX}px; top: ${event.clientY}px`;
    document.body.append(point);
    return point;
}
