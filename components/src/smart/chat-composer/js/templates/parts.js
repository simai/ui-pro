import {html, nothing} from "lit";

// The two small pieces the composer draws more than once, as Lit templates:
// the Framework's icon button and a file chip. In simai/ui-chat they were the
// base Component's iconButton and renderAttachment (component/chat/js/render.js),
// plain DOM shared with the site widget; here they are the chat family's
// markup with the same classes, so a page styled for one reads the same.

// The icon step that sits in a button of each step: 16 in 32, 20 in 40.
const ICON_IN_BUTTON = {"1/3": "1", "1/2": "1", "1": "2", "2": "2", "3": "3"};

/**
 * A Framework icon button: one native button, a decorative Smart sf-icon, a
 * required name. The variant classes are the Framework's (appearance, scheme).
 */
export function iconButton({
    icon,
    label,
    appearance = "link",
    scheme = "on-surface",
    size = "1/2",
    className = "",
    type = "button",
    disabled = false,
    hidden = false,
    onClick = null,
}) {
    return html`<button
            type=${type}
            class="sf-icon-button sf-icon-button--size-${size} sf-icon-button--icon sf-icon-button--${appearance} sf-icon-button--${scheme} flex items-cross-center content-main-center ${className}"
            aria-label=${label}
            title=${label}
            ?disabled=${disabled}
            ?hidden=${hidden}
            @click=${onClick ?? nothing}
    ><sf-icon icon=${icon} size=${ICON_IN_BUTTON[size] || "1"} aria-hidden="true"></sf-icon></button>`;
}

/** Where a chip stands: refused, still uploading, or ready. */
export function attachmentState(file) {
    if (file.error) return "error";
    const progress = file.progress;
    return progress !== undefined && progress !== null && progress < 1 ? "uploading" : "ready";
}

/**
 * A file chip: name, size, upload progress, the server's refusal, remove.
 * The refusal's text is the chip's second line; the chip keeps one height.
 *
 * words: {file(name, size), uploading(percent), remove(name), size(bytes)}
 * @param {{id?: string, name: string, bytes: number, progress?: number|null, error?: string|null}} file
 */
export function renderAttachment(file, {words, removable = false, onRemove = null} = {}) {
    const state = attachmentState(file);
    const name = String(file.name ?? "");
    const size = words.size(file.bytes);
    const percent = Math.round((file.progress || 0) * 100);
    const meta = state === "uploading" ? words.uploading(percent) : (file.error || size);
    return html`<div class="sf-chat-attachment sf-chat-attachment--${state}" role="group" aria-label=${words.file(name, size)}>
        <span class="sf-chat-attachment__icon" aria-hidden="true"><sf-icon icon=${state === "error" ? "error" : "description"} size="2" aria-hidden="true"></sf-icon></span>
        <span class="sf-chat-attachment__body">
            <span class="sf-chat-attachment__name" title=${name}>${name}</span>
            <span class="sf-chat-attachment__meta" title=${file.error || nothing} role=${file.error ? "alert" : nothing}>${meta}</span>
        </span>
        ${state === "uploading" ? html`<span
                class="sf-chat-attachment__progress"
                role="progressbar"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow=${String(percent)}
                aria-label=${name}
                style="--sf-chat-attachment--progress: ${file.progress || 0}"
        ></span>` : nothing}
        ${removable ? iconButton({
            icon: "close",
            label: words.remove(name),
            size: "1/2",
            className: "sf-chat-attachment__remove",
            onClick: () => onRemove?.(file),
        }) : nothing}
    </div>`;
}
