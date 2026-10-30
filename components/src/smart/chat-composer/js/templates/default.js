import {html, nothing} from "lit";
import {repeat} from "lit/directives/repeat.js";
import {iconButton, renderAttachment} from "./parts.js";
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
                    (file) => renderAttachment(file, {words: context.fileWords, removable: true, onRemove: (one) => component.removeFile(one)}),
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
