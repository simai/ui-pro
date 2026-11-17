import {html, nothing} from "lit";
import {repeat} from "lit/directives/repeat.js";
import {attachmentState, iconButton} from "./parts.js";
import "./default.css";

// Where a question is written and files are added: a form with the box (the
// chips over the line they go with, then attach, the field, the count, send
// or stop, or both while a typed message would be queued), the notice of
// refused files, the hint under the field, the hidden file picker and the
// polite line that speaks a threshold of the count.
//
// The field is the Framework's flush sf-textarea with its auto-grow (eight
// rows). Its value is never bound: a redraw keeps the text, the caret and an
// IME composition; the element reads and writes the field itself.
//
// The first paint is the box with its field and buttons, the chips the host
// gave, and the hint (§5.4).
// A file over the field is the Framework's sf-file-preview chip (owner
// decision C149 (1)): 48 high, at most 18rem, the glyph of its type, the name
// cut in the middle with its extension kept, «PDF · 2,4 МБ», «×» «Убрать
// <имя>»; while it uploads the bar with its per cent, after the server's
// refusal «Не загрузился: <причина>» and «Повторить». The preview only asks:
// «×» is the composer's detach, «Повторить» takes the refused file out and
// opens the picker to add it again (the composer holds no file to resend).
// Its own requests stop here, so a page hears the composer's events only.
function renderFile(file, component) {
    const state = attachmentState(file);
    const percent = state === "uploading" && file.progress !== undefined && file.progress !== null
        ? String(Math.round(Math.min(1, Math.max(0, Number(file.progress) || 0)) * 100))
        : nothing;
    const bytes = file.bytes === undefined || file.bytes === null || file.bytes === "" ? nothing : String(file.bytes);
    return html`<sf-file-preview
            class="sf-chat-composer__file"
            appearance="chip"
            file-name=${file.name}
            file-size=${bytes}
            mime-type=${file.mime || nothing}
            state=${state}
            value=${percent}
            error-text=${state === "error" ? String(file.error) : nothing}
            @sf-file-preview-detach=${(event) => { event.stopPropagation(); event.preventDefault(); component.removeFile(file); }}
            @sf-file-preview-retry=${(event) => { event.stopPropagation(); event.preventDefault(); component.retryFile(file); }}
    ></sf-file-preview>`;
}

export function renderChatComposerTemplate(context) {
    const {component} = context;
    const rootClass = [
        "sf-chat-composer",
        context.over ? "sf-chat-composer--over" : "",
        context.disabled ? "sf-chat-composer--disabled" : "",
        context.dragging ? "sf-chat-composer--dragging" : "",
    ].filter(Boolean).join(" ");
    return html`
        <form
                class=${rootClass}
                novalidate
                @submit=${(event) => { event.preventDefault(); component.send(); }}
                @dragenter=${(event) => component.onDragEnter(event)}
                @dragover=${(event) => component.onDragOver(event)}
                @dragleave=${() => component.onDragLeave()}
                @drop=${(event) => component.onDrop(event)}
        >
            <div class="sf-chat-composer__box${context.tall ? " sf-chat-composer__box--tall" : ""}">
                <div class="sf-chat-composer__files" ?hidden=${!context.files.length}>${repeat(
                    context.files,
                    (file, index) => file.localId ?? file.id ?? `#${index}`,
                    (file) => renderFile(file, component),
                )}</div>
                <div class="sf-chat-composer__row">
                    ${iconButton({
                        icon: "attach_file",
                        label: context.attachLabel,
                        size: "1",
                        className: "sf-chat-composer__attach",
                        hidden: !context.attachments,
                        disabled: context.attachDisabled,
                        onClick: () => component.pick(),
                    })}
                    <label class="sf-textarea sf-textarea--size-1 sf-textarea--flush sf-chat-composer__field"><textarea
                            class="sf-chat-composer__input"
                            rows="1"
                            data-auto-grow
                            data-max-rows="8"
                            id=${context.inputId}
                            aria-label=${context.fieldLabel}
                            aria-describedby=${context.statusId}
                            placeholder=${context.placeholder}
                            ?disabled=${context.disabled}
                            @input=${() => component.onInput()}
                            @keydown=${(event) => component.onKey(event)}
                            @paste=${(event) => component.onPaste(event)}
                    ></textarea></label>
                    <span class="sf-chat-composer__count" id=${context.statusId} ?hidden=${!context.near}>${context.countText}</span>
                    ${iconButton({
                        icon: "arrow_upward",
                        label: context.sendLabel,
                        appearance: context.ready ? "default" : "tonal",
                        scheme: context.ready ? "primary" : "on-surface",
                        size: "1",
                        className: "sf-chat-composer__send",
                        type: "submit",
                        // Busy, it stands beside stop only for a message the host queues.
                        hidden: context.busy && !(context.queueing && context.ready),
                        disabled: !context.ready,
                    })}
                    ${iconButton({
                        icon: "stop",
                        label: context.stopLabel,
                        appearance: "default",
                        scheme: "on-surface",
                        size: "1",
                        className: "sf-chat-composer__stop",
                        hidden: !context.busy || context.noStop,
                        onClick: () => component.stop(),
                    })}
                </div>
                <div class="sf-chat-composer__drop" aria-hidden="true">${context.dropText}</div>
            </div>
            <p class="sf-chat-composer__notice" role="alert" ?hidden=${!context.notice}>${context.notice}</p>
            <p
                    class="sf-chat-composer__hint${context.busyHint ? " sf-chat-composer__hint--busy" : ""}"
                    id=${context.hintId}
                    aria-live="polite"
            >${context.hint}</p>
            <input
                    class="sf-chat-composer__picker"
                    type="file"
                    multiple
                    hidden
                    accept=${context.accept || nothing}
                    @change=${(event) => component.onPicked(event.currentTarget)}
            >
            <span class="sf-chat-composer__said sr-only" aria-live="polite">${context.said}</span>
        </form>
    `;
}
