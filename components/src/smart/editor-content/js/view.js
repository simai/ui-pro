// How sf-editor-content draws a Document while it is edited: one element per
// block, the block's own fields where the person types, and its slots as
// flows of blocks again. The look follows the published page (the
// Framework's renderers in composition/index.mjs) so the page reads the same
// in both; what only editing needs (a placeholder, a picture's drop zone, a
// fold that is the editor's own) is added here.
//
// The drawing is plain DOM, not a Lit template: an inline field is handed to
// sf-editor-inline while it is typed in, and that session owns its children.
// Text from the Document is set as text and inline content through
// renderInlineDom, never as markup.
import {fileIcon, fileNameFromAddress, fileSizeUnits, formatFileSize} from "../../../core/js/composition/file-size.mjs";
import {renderInlineDom} from "../../../core/js/composition/inline-editor.mjs";
import {ALERT_ICONS} from "./catalog.js";
import {FIELDS, FLOWS, ITEMS, KNOWN, inlineOf} from "./model.js";

const make = (doc, tag, className, attributes = {}) => {
    const element = doc.createElement(tag);
    if (className) element.className = className;
    for (const [name, value] of Object.entries(attributes)) {
        if (value !== undefined && value !== null && value !== false) element.setAttribute(name, value === true ? "" : String(value));
    }
    return element;
};

const icon = (doc, name, className = "") => make(doc, "sf-icon", className, {icon: name, size: "1", "aria-hidden": "true"});

/**
 * A field the person types in. `kind` is inline (the inline model through
 * sf-editor-inline), plain (text as it is) or cell (a table cell, inline).
 */
function field(context, tag, node, key, {kind = "inline", placeholder = "", label = "", row, column, className = ""} = {}) {
    const {doc, word} = context;
    const optional = FIELDS[node.type]?.find((entry) => entry.key === key)?.optional;
    const element = make(doc, tag, ["sf-content-editor-field", className].filter(Boolean).join(" "), {
        "data-sf-node": node.id,
        "data-sf-field": key,
        "data-sf-kind": kind,
        "data-sf-row": row,
        "data-sf-column": column,
        "data-placeholder": placeholder ? word(placeholder) : undefined,
        "data-optional": optional ? "true" : undefined,
        "aria-label": label ? word(label) : undefined,
        tabindex: "-1",
    });
    if (kind === "plain") {
        element.setAttribute("contenteditable", "plaintext-only");
        element.setAttribute("role", "textbox");
        element.setAttribute("aria-multiline", "true");
        element.setAttribute("spellcheck", "false");
        element.textContent = String(node.data?.[key] ?? "");
    } else {
        const content = kind === "cell" ? node.data.rows[row][column] : inlineOf(node, key);
        element.append(renderInlineDom(doc, content));
    }
    return element;
}

/** Draws inline content into a field again, after its session ended. */
export function refill(element, content) {
    element.replaceChildren(renderInlineDom(element.ownerDocument, content));
}

function flow(context, node, slot, className = "") {
    const element = make(context.doc, "div", ["sf-content-editor-flow", className].filter(Boolean).join(" "), {"data-sf-flow": node.id, "data-sf-slot": slot});
    for (const child of node.slots?.[slot] ?? []) element.append(block(context, child));
    return element;
}

function heading(context, node) {
    const level = Math.min(6, Math.max(1, Number(node.data?.level) || 2));
    return field(context, `h${level}`, node, "content", {placeholder: "heading-placeholder", label: "heading-label", className: `sf-content-editor-heading sf-content-editor-heading--${level}`});
}

function list(context, node) {
    const element = make(context.doc, node.props?.ordered ? "ol" : "ul", "sf-content-editor-list", {start: node.props?.ordered && node.props?.start > 1 ? node.props.start : undefined});
    for (const item of node.slots?.items ?? []) {
        const li = make(context.doc, "li", "sf-content-editor-item", {"data-sf-node": item.id});
        li.append(field(context, "div", item, "content", {placeholder: "item-placeholder", label: "item-label"}));
        if (item.slots?.default?.length) li.append(flow(context, item, "default", "sf-content-editor-nested"));
        element.append(li);
    }
    return element;
}

function alert(context, node) {
    const {doc} = context;
    const status = node.props?.status ?? "neutral";
    const element = make(doc, "div", "sf-content-editor-alert", {"data-status": status, "data-appearance": node.props?.appearance ?? "default"});
    const body = make(doc, "div", "sf-content-editor-alert-body");
    body.append(field(context, "div", node, "title", {placeholder: "alert-title-placeholder", label: "alert-title-label", className: "sf-content-editor-alert-title"}), flow(context, node, "default"));
    element.append(icon(doc, ALERT_ICONS[status] ?? "info", "sf-content-editor-alert-icon"), body);
    return element;
}

function details(context, node) {
    const {doc, word, isOpen} = context;
    const open = isOpen(node);
    const element = make(doc, "div", "sf-content-editor-details", {"data-layout": node.props?.layout ?? "surface", "data-open": open ? "true" : "false"});
    const head = make(doc, "div", "sf-content-editor-details-head");
    const fold = make(doc, "button", "sf-content-editor-fold", {type: "button", "data-sf-fold": node.id, "aria-expanded": open ? "true" : "false", "aria-label": word("fold-label"), title: word("fold-label")});
    fold.append(icon(doc, "expand_more"));
    head.append(fold, field(context, "div", node, "summary", {placeholder: "summary-placeholder", label: "summary-label", className: "sf-content-editor-summary"}));
    element.append(head);
    if (open) element.append(flow(context, node, "default", "sf-content-editor-details-body"));
    return element;
}

function steps(context, node) {
    const {doc} = context;
    const current = Number.isInteger(node.props?.current) ? node.props.current : null;
    const element = make(doc, "ol", "sf-content-editor-steps", {"data-layout": node.props?.layout ?? "timeline"});
    (node.slots?.steps ?? []).forEach((step, index) => {
        const number = index + 1;
        const state = current === null ? "" : number < current ? "complete" : number === current ? "current" : "";
        const li = make(doc, "li", "sf-content-editor-step", {"data-sf-node": step.id, "data-state": state || undefined, "aria-current": state === "current" ? "step" : undefined});
        li.append(field(context, "div", step, "title", {placeholder: "step-placeholder", label: "step-label", className: "sf-content-editor-step-title"}));
        if (step.slots?.default?.length) li.append(flow(context, step, "default"));
        element.append(li);
    });
    return element;
}

function code(context, node) {
    const {doc} = context;
    const element = make(doc, "div", "sf-content-editor-code");
    const lang = node.props?.lang;
    if (node.props?.title || (lang && lang !== "text")) {
        const head = make(doc, "div", "sf-content-editor-code-head");
        const title = make(doc, "span");
        title.textContent = node.props?.title ?? "";
        const language = make(doc, "span");
        language.textContent = lang && lang !== "text" ? lang : "";
        head.append(title, language);
        element.append(head);
    }
    element.append(field(context, "pre", node, "code", {kind: "plain", placeholder: "code-placeholder", label: "code-label", className: "sf-content-editor-code-text"}));
    return element;
}

function table(context, node) {
    const {doc} = context;
    const header = node.props?.header ?? "row";
    const element = make(doc, "div", "sf-content-editor-table", {"data-header": header});
    const grid = make(doc, "table");
    const body = make(doc, "tbody");
    node.data.rows.forEach((cells, row) => {
        const tr = make(doc, "tr");
        cells.forEach((_, column) => {
            const head = ((header === "row" || header === "both") && row === 0) || ((header === "column" || header === "both") && column === 0);
            const cell = make(doc, head ? "th" : "td");
            cell.append(field(context, "div", node, "rows", {kind: "cell", row, column, label: "cell-label"}));
            tr.append(cell);
        });
        body.append(tr);
    });
    grid.append(body);
    element.append(grid, field(context, "div", node, "caption", {placeholder: "caption-placeholder", label: "caption-label", className: "sf-content-editor-caption"}));
    return element;
}

// A picture: the image as the page shows it, from where the host keeps it.
// An empty one is a drop zone on the page (sf-file-upload: drop, pick,
// paste) with a quiet «Link» that turns it into one address field; a file on
// its way to the host shows at once, from its object URL, with progress, and
// a refusal shows its reason with a retry.
function picture(context, node, ratio, fit) {
    const {doc, word} = context;
    const data = node.data;
    const frame = make(doc, "div", "sf-content-editor-frame", {"data-ratio": ratio && ratio !== "auto" ? ratio : undefined, "data-fit": fit === "contain" ? "contain" : undefined});
    const upload = context.upload(node);
    const src = upload?.href ?? context.source(data?.src);
    if (src) {
        frame.append(make(doc, "img", "", {src, alt: data?.alt ?? "", width: data?.width, height: data?.height, draggable: "false"}));
        if (upload) frame.append(progress(context, node, upload));
        return frame;
    }
    frame.dataset.empty = "true";
    frame.append(zone(context, node));
    return frame;
}

function progress(context, node, upload) {
    const {doc, word} = context;
    const element = make(doc, "div", "sf-content-editor-upload", {"data-sf-zone": node.id, "data-state": upload.state, contenteditable: "false"});
    if (upload.state === "error") {
        const reason = make(doc, "span", "sf-content-editor-upload-reason", {role: "alert"});
        reason.textContent = upload.reason;
        element.append(icon(doc, "error"), reason,
            make(doc, "sf-button", "", {size: "1/2", appearance: "tonal", text: word("file-retry"), "data-sf-zone-action": "retry"}),
            make(doc, "sf-button", "", {size: "1/2", appearance: "link", text: word("file-cancel"), "data-sf-zone-action": "cancel"}));
    } else {
        element.append(make(doc, "sf-progress-bar", "", {size: "1/3", value: String(upload.progress ?? 0), label: word("file-sending", {vars: {name: upload.name}})}));
    }
    return element;
}

// An empty picture's or file's place on the page: sf-file-upload takes a
// drop, a pick or a paste (a picture takes images, a file any type), and a
// quiet «Link» turns it into one address field.
function zone(context, node) {
    const {doc, word} = context;
    const file = node.type === "content.file";
    const element = make(doc, "div", "sf-content-editor-zone", {"data-sf-zone": node.id, contenteditable: "false"});
    if (context.linking(node)) {
        const address = make(doc, "sf-input", "sf-content-editor-zone-address", {size: "1/2", label: word(file ? "param-href" : "param-src"), "input-type": "url", "data-sf-zone-src": node.id, placeholder: "https://"});
        element.append(address, make(doc, "sf-button", "", {size: "1/2", appearance: "link", icon: "upload", text: word("zone-upload"), "data-sf-zone-action": "upload"}));
        return element;
    }
    element.append(
        file
            ? make(doc, "sf-file-upload", "sf-content-editor-zone-files", {icon: "upload_file", "link-text": word("zone-pick"), text: word("zone-file-text"), "supporting-text": word("zone-file-formats")})
            : make(doc, "sf-file-upload", "sf-content-editor-zone-files", {accept: "image/*", icon: "add_photo_alternate", "link-text": word("zone-pick"), text: word("zone-text"), "supporting-text": word("zone-formats")}),
        make(doc, "sf-button", "sf-content-editor-zone-link", {size: "1/2", appearance: "link", icon: "link", text: word("zone-link"), "data-sf-zone-action": "link"}),
    );
    return element;
}

function figure(context, node) {
    const element = make(context.doc, "figure", "sf-content-editor-figure");
    element.append(picture(context, node, node.props?.ratio, node.props?.fit), field(context, "figcaption", node, "caption", {placeholder: "caption-placeholder", label: "caption-label", className: "sf-content-editor-caption"}));
    return element;
}

// A file to download: sf-file-download's row as the page draws it (the icon
// of its kind, its name, its size), the name typed in place. An empty one is
// a drop zone for any file; a file on its way shows its row at once, with
// progress, and a refusal its reason with a retry.
function fileRow(context, node) {
    const {doc, word} = context;
    const data = node.data ?? {};
    const upload = context.upload(node);
    const element = make(doc, "div", "sf-editor-content-file");
    if (!upload && !data.href) {
        element.dataset.empty = "true";
        element.append(zone(context, node));
        return element;
    }
    const href = context.source(data.value) || data.href || "";
    const mime = upload?.file?.type || data.mime;
    const size = upload?.file ? upload.file.size : data.size;
    const row = make(doc, "div", "sf-content-editor-file-row", {"data-href": href || undefined});
    const name = field(context, "span", node, "label", {kind: "plain", label: "file-label", className: "sf-content-editor-file-name"});
    name.dataset.placeholder = upload?.name || fileNameFromAddress(data.href ?? "") || word("file-label");
    const sizeText = Number.isInteger(size) ? formatFileSize(size, fileSizeUnits(context.locale), context.locale) : "";
    row.append(icon(doc, fileIcon(mime), "sf-content-editor-file-icon"), name);
    if (sizeText) {
        const amount = make(doc, "span", "sf-content-editor-file-size", {contenteditable: "false"});
        amount.textContent = sizeText;
        row.append(amount);
    }
    element.append(row);
    if (upload) element.append(progress(context, node, upload));
    return element;
}

function tabs(context, node) {
    const element = make(context.doc, "div", "sf-content-editor-tabs");
    for (const tab of node.slots?.tabs ?? []) {
        const section = make(context.doc, "section", "sf-content-editor-tab", {"data-sf-node": tab.id});
        section.append(field(context, "div", tab, "label", {kind: "plain", placeholder: "tab-placeholder", label: "tab-label", className: "sf-content-editor-tab-label"}), flow(context, tab, "default"));
        element.append(section);
    }
    return element;
}

function raw(context, node, key, title) {
    const {doc, word} = context;
    const element = make(doc, "div", "sf-content-editor-raw");
    const head = make(doc, "div", "sf-content-editor-raw-head");
    head.append(icon(doc, node.type === "content.html" ? "html" : "functions"), doc.createTextNode(word(title)));
    element.append(head, field(context, "pre", node, key, {kind: "plain", label: title, className: "sf-content-editor-raw-text"}));
    return element;
}

// A type the editor does not know is shown, never opened: its data and its
// slots stay exactly as they came, and it can only be moved or removed whole.
function opaque(context, node) {
    const {doc, word} = context;
    const element = make(doc, "div", "sf-content-editor-opaque", {contenteditable: "false"});
    const head = make(doc, "div", "sf-content-editor-raw-head");
    const name = make(doc, "code");
    name.textContent = node.type;
    head.append(icon(doc, "extension"), doc.createTextNode(word("unknown-text")), doc.createTextNode(" "), name);
    element.append(head);
    return element;
}

function body(context, node) {
    const {doc} = context;
    switch (node.type) {
    case "content.paragraph": return field(context, "p", node, "content", {placeholder: context.placeholderFor(node), label: "paragraph-label", className: "sf-content-editor-paragraph"});
    case "content.heading": return heading(context, node);
    case "content.list": return list(context, node);
    case "content.quote": {
        const element = make(doc, "blockquote", "sf-content-editor-quote");
        element.append(flow(context, node, "default"));
        return element;
    }
    case "content.alert": return alert(context, node);
    case "content.details": return details(context, node);
    case "content.steps": return steps(context, node);
    case "content.code": return code(context, node);
    case "content.divider": return make(doc, "hr", "sf-content-editor-divider");
    case "content.table": return table(context, node);
    case "content.figure": return figure(context, node);
    case "content.file": return fileRow(context, node);
    case "content.tabs": return tabs(context, node);
    case "content.grid": {
        const element = flow(context, node, "default", "sf-content-editor-grid");
        element.style.setProperty("--sf-content-editor-columns", String(node.props?.columns ?? 3));
        return element;
    }
    case "content.card": {
        const element = make(doc, "div", "sf-content-editor-card", {"data-variant": node.props?.variant ?? "default"});
        element.append(flow(context, node, "default"));
        return element;
    }
    case "content.media": {
        const element = make(doc, "div", "sf-content-editor-media", {"data-side": node.props?.side ?? "right"});
        element.append(picture(context, node, node.props?.ratio ?? "16/9"), flow(context, node, "default"));
        return element;
    }
    case "content.html": return raw(context, node, "markup", "html-text");
    case "content.diagram":
    case "content.math": return raw(context, node, "source", node.type === "content.math" ? "math-text" : "diagram-text");
    default: return opaque(context, node);
    }
}

/** One block of a flow: its body; its parameters are over it when it is chosen. */
export function block(context, node) {
    const {doc} = context;
    const element = make(doc, "div", "sf-content-editor-block", {"data-sf-node": node.id, "data-sf-block": node.type, "data-known": KNOWN.has(node.type) ? undefined : "false"});
    element.append(body(context, node));
    return element;
}

/** The blocks of a Document's root, for the sheet. */
export function blocks(context, root) {
    const fragment = context.doc.createDocumentFragment();
    for (const child of root.slots?.[FLOWS[root.type] ?? "default"] ?? []) fragment.append(block(context, child));
    return fragment;
}

/** Every field of the sheet in reading order: where ↑ and ↓ go. */
export const fieldsIn = (root) => [...root.querySelectorAll(".sf-content-editor-field")];

export {FIELDS, ITEMS};
