const SAFE_RELATIVE_PREFIXES = ["/", "./", "../", "#", "?"];

export function normalizeTableLinkHref(value) {
    if (typeof value !== "string") {
        return null;
    }

    const href = value.trim();
    if (!href) {
        return null;
    }

    if (href.startsWith("//")) {
        return null;
    }

    if (SAFE_RELATIVE_PREFIXES.some((prefix) => href.startsWith(prefix))) {
        return href;
    }

    try {
        const url = new URL(href);
        return url.protocol === "http:" || url.protocol === "https:"
            ? href
            : null;
    } catch {
        return null;
    }
}

export function normalizeTableLinkCell(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return null;
    }

    const text = value.text === null || typeof value.text === "undefined"
        ? ""
        : String(value.text);
    const subtext = value.subtext === null || typeof value.subtext === "undefined"
        ? null
        : String(value.subtext);

    return {
        href: normalizeTableLinkHref(value.href),
        subtext,
        text,
    };
}
