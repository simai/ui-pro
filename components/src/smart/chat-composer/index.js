// Where a question is written and files are added. It came from simai/ui-chat
// (D31: components live in the Framework or in ui-pro, owner 2026-10-26; the
// move approved 2026-10-27), where the chat window placed it under the feed.
//
// The field is the Framework's flush textarea (component/textarea, surface
// `flush`, auto-grow up to eight rows); the composer's box draws its border,
// fill and focus. Enter sends, Shift+Enter breaks the line, and an IME
// composition is never cut short by its own Enter. While an answer is awaited
// (busy) the send button becomes «Остановить ожидание» and Enter says why it
// sent nothing -- unless the host queues (`queue`, 1.1.0): then a message of
// text still goes out as submit while busy, and the host keeps it until the
// answer is over. A message with files is not queued. Files come from the
// button, a drop or a paste; the composer only reports them (attach) -- the
// host uploads them and hands back their chips as `files`, so whether a file
// is accepted is always the server's word.
//
// From its component.json (standard simai.smart-component 1.3.9 §3, §4, §8,
// §11): the settings and the value are attributes and properties made by
// core/js/element-manifest.js, its words are lang/<locale>.json, the actions
// answer outcomes, and the events are the vocabulary's submit, stop, attach
// and detach; the 0.3 names sf-chat-send, sf-chat-stop, sf-chat-files and
// sf-chat-action follow until 2026-12-01 (aliases.json).
import SfBaseElement from "../../core/js/smart-base";
import {elementFromManifest} from "../../core/js/element-manifest";
import {instancePath, partId} from "../../core/js/instance-path";
import {pageLocale} from "../../core/js/page-language";
import {renderChatComposerTemplate} from "./js/templates/default.js";
import manifest from "./component.json";
import aliases from "./aliases.json";
import en from "./lang/en.json";
import ru from "./lang/ru.json";

// The 0.3 limits when a number attribute says nothing usable.
const MAX_CHARS = 4000;
const MAX_FILES = 5;

const applied = () => ({outcome: "applied"});

const ChatComposerElement = elementFromManifest(manifest, {
    base: SfBaseElement,
    lang: {en, ru},
    source: "ru",
    aliases,
    actions: {
        "set-files"({files}) {
            this.files = files;
            return applied();
        },
        clear() {
            this.value = "";
            this.notice = "";
            return applied();
        },
    },
});

class SfChatComposer extends ChatComposerElement {
    static get props() {
        return {...super.props, templateName: {attribute: "template", default: "default"}};
    }

    constructor() {
        super();
        this._notice = "";
        this._busyHint = false;
        this._level = "";
        this._said = "";
        this._tallText = false;
        this._dragging = false;
        this._depth = 0;
        this._draft = undefined;
        this._observer = null;
        this._observed = null;
        // A value set as a property before the element was defined is an own
        // property that would hide the accessor; it is taken through it.
        for (const name of ["files", "value", "busy", "queue", "disabled"]) {
            if (!Object.prototype.hasOwnProperty.call(this, name)) continue;
            const early = this[name];
            delete this[name];
            this[name] = early;
        }
    }

    // --- what the element holds -------------------------------------------

    /** The field, once the element has drawn it (not the printed one). */
    get field() {
        return this._hasRendered ? this.querySelector("textarea.sf-chat-composer__input") : null;
    }

    /** The text in the field; before the field is drawn, the draft it will get. */
    get value() {
        const field = this.field;
        if (field) return field.value;
        return this._draft ?? this.getAttribute("value") ?? "";
    }

    /** As if typed: the Framework's auto-grow fits the field to the text. */
    set value(next) {
        const text = next === null || next === undefined ? "" : String(next);
        const field = this.field;
        if (!field) {
            this._draft = text;
            return;
        }
        field.value = text;
        field.dispatchEvent(new Event("input"));
    }

    /** The chips as given: objects only, a name as text. */
    get chips() {
        const files = this.files;
        return Array.isArray(files)
            ? files.filter((one) => one && typeof one === "object").map((one) => ({...one, name: String(one.name ?? "")}))
            : [];
    }

    get limit() {
        return this.maxlength > 0 ? this.maxlength : MAX_CHARS;
    }

    get fileLimit() {
        return this.maxFiles > 0 ? this.maxFiles : MAX_FILES;
    }

    get notice() {
        return this._notice;
    }

    set notice(message) {
        const next = message ? String(message) : "";
        if (next === this._notice) return;
        this._notice = next;
        this.requestComponentUpdate("notice");
    }

    // The field the base's focus() and blur() go to (focusDelegate).
    focusDelegate() {
        return this.field;
    }

    // The 0.3 details of the two renamed events whose detail changed.
    sfAliasAdapters() {
        return {
            "sf-chat-send": (detail) => (detail ? {text: detail.text, attachmentIds: detail.attachmentIds} : undefined),
            "sf-chat-action": (detail) => (detail ? {action: "remove-attachment", id: detail.id, name: detail.name} : undefined),
        };
    }

    // --- drawing ------------------------------------------------------------

    get basePath() {
        return instancePath(this, {kind: "sf-chat-composer"});
    }

    /** 48213 → «47 КБ»: sizes are for reading, in plain units. */
    formatBytes(bytes) {
        const number = Number(bytes) || 0;
        const locale = pageLocale(this);
        const format = (value) => new Intl.NumberFormat(locale, {maximumFractionDigits: value < 10 ? 1 : 0}).format(value);
        if (number < 1024) return this.sfWord("size-b-text", {vars: {n: number}});
        if (number < 1024 * 1024) return this.sfWord("size-kb-text", {vars: {n: format(number / 1024)}});
        if (number < 1024 ** 3) return this.sfWord("size-mb-text", {vars: {n: format(number / 1024 / 1024)}});
        return this.sfWord("size-gb-text", {vars: {n: format(number / 1024 ** 3)}});
    }

    /** Busy, and a message of text may still go out: the host queues it. */
    get queueing() {
        return this.busy && this.queue && this.chips.length === 0;
    }

    templateContext() {
        const files = this.chips;
        const busy = this.busy;
        const queueing = this.queueing;
        const disabled = this.disabled;
        const length = this.value.length;
        const limit = this.limit;
        const near = length > limit * 0.8;
        const over = length > limit;
        const countText = near
            ? (over ? this.sfWord("too-long-text", {vars: {max: limit}}) : this.sfWord("count-text", {vars: {count: length, max: limit}}))
            : "";
        // The live line speaks only when a threshold is crossed, not on every key.
        const level = over ? "over" : near ? "near" : "";
        if (level !== this._level) {
            this._level = level;
            this._said = level ? countText : "";
        }
        if (!busy) this._busyHint = false;
        // Busy: what Enter does now -- go after the answer, or nothing and why
        // (a message with files waits with the field).
        const hint = this._busyHint ? (this.queue ? "busy-files-text" : "busy-text") : queueing ? "queue-hint-text" : "hint-text";
        const path = this.basePath;
        return {
            component: this,
            files,
            busy,
            disabled,
            attachments: this.attachments,
            accept: this.accept,
            attachDisabled: disabled || files.length >= this.fileLimit,
            ready: this.canSend(),
            near,
            over,
            countText,
            said: this._said,
            notice: this._notice,
            busyHint: this._busyHint,
            hint: this.sfWord(hint),
            queueing,
            tall: files.length > 0 || this._tallText,
            dragging: this._dragging,
            placeholder: this.placeholder || this.sfWord("placeholder-text"),
            fieldLabel: this.sfWord("field-label"),
            attachLabel: this.sfWord("attach-label"),
            sendLabel: this.sfWord(queueing ? "queue-label" : "send-label"),
            stopLabel: this.sfWord("stop-label"),
            dropText: this.sfWord("drop-text"),
            inputId: partId(path, "input"),
            statusId: partId(path, "status"),
            hintId: partId(path, "hint"),
            fileWords: {
                file: (name, size) => this.sfWord("file-label", {vars: {name, size}}),
                uploading: (percent) => this.sfWord("uploading-text", {vars: {percent}}),
                remove: (name) => this.sfWord("remove-label", {vars: {name}}),
                size: (bytes) => this.formatBytes(bytes),
            },
        };
    }

    template() {
        return renderChatComposerTemplate(this.templateContext());
    }

    afterRender(changedAttributes) {
        super.afterRender?.(changedAttributes);
        const field = this.field;
        if (!field) return;
        if (this._draft !== undefined || !this._started) {
            // The first text: a draft set before the field was drawn, else
            // the attribute's.
            this._started = true;
            const text = this._draft ?? this.getAttribute("value") ?? "";
            this._draft = undefined;
            if (text && field.value !== text) this.value = text;
        }
        if (this._observed !== field) {
            this._observer?.disconnect();
            this._observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => this.shape());
            this._observer?.observe(field.closest(".sf-chat-composer__field") ?? field);
            this._observed = field;
        }
        this.shape();
    }

    disconnectedCallback() {
        this._observer?.disconnect();
        this._observer = null;
        this._observed = null;
        super.disconnectedCallback();
    }

    // One line and no files: a capsule. More: the box takes its own radius,
    // and what is inside follows it (nested radii).
    shape() {
        const field = this.field;
        if (!field) return;
        const style = getComputedStyle(field);
        const line = parseFloat(style.lineHeight) || 24;
        const text = field.scrollHeight - parseFloat(style.paddingBlockStart || 0) - parseFloat(style.paddingBlockEnd || 0);
        const tall = text > line * 1.5;
        if (tall === this._tallText) return;
        this._tallText = tall;
        this.requestComponentUpdate("shape");
    }

    // --- what a person does -------------------------------------------------

    onInput() {
        this.requestComponentUpdate("input");
    }

    onKey(event) {
        if (event.key !== "Enter" || event.shiftKey || event.isComposing || event.keyCode === 229) return;
        event.preventDefault();
        if (this.busy && !this.queueing && this.value.trim()) {
            this._busyHint = true;
            this.requestComponentUpdate("busy-hint");
            return;
        }
        this.send();
    }

    onPaste(event) {
        const files = [...(event.clipboardData?.files || [])];
        if (files.length && this.attachments) {
            event.preventDefault();
            this.offerFiles(files);
        }
    }

    pick() {
        this.querySelector(".sf-chat-composer__picker")?.click();
    }

    onPicked(picker) {
        this.offerFiles([...(picker.files || [])]);
        picker.value = "";
    }

    canAttach() {
        return this.attachments && !this.disabled;
    }

    onDragEnter(event) {
        if (!this.canAttach() || !event.dataTransfer?.types?.includes("Files")) return;
        event.preventDefault();
        this._depth += 1;
        this.setDragging(true);
    }

    onDragOver(event) {
        if (this.canAttach()) event.preventDefault();
    }

    onDragLeave() {
        this._depth = Math.max(0, this._depth - 1);
        if (!this._depth) this.setDragging(false);
    }

    onDrop(event) {
        this._depth = 0;
        this.setDragging(false);
        if (!this.canAttach()) return;
        event.preventDefault();
        this.offerFiles([...(event.dataTransfer?.files || [])]);
    }

    setDragging(on) {
        if (this._dragging === on) return;
        this._dragging = on;
        this.requestComponentUpdate("dragging");
    }

    /** Checks the files by type, size and count, says the refusals and reports the rest. */
    offerFiles(files) {
        if (!files.length) return;
        const allowed = String(this.accept || "").split(",").map((one) => one.trim().toLowerCase()).filter(Boolean);
        const room = Math.max(0, this.fileLimit - this.chips.length);
        const maxBytes = this.maxBytes > 0 ? this.maxBytes : 0;
        const accepted = [];
        const rejected = [];
        for (const file of files) {
            const extension = `.${(String(file.name).split(".").pop() || "").toLowerCase()}`;
            if (allowed.length && !allowed.includes(extension)) rejected.push({file, reason: this.sfWord("bad-type-text")});
            else if (maxBytes && file.size > maxBytes) rejected.push({file, reason: this.sfWord("too-big-text", {vars: {size: this.formatBytes(maxBytes)}})});
            else if (accepted.length >= room) rejected.push({file, reason: this.sfWord("too-many-text", {count: this.fileLimit, vars: {max: this.fileLimit}})});
            else accepted.push(file);
        }
        this.notice = rejected.map((one) => `${one.file.name}: ${one.reason}`).join("; ");
        this.sfEmit("attach", {files: accepted, rejected}, {cancelable: true});
    }

    removeFile(file) {
        this.sfEmit("detach", {id: file.id, name: file.name}, {cancelable: true});
    }

    canSend() {
        const text = this.value.trim();
        const files = this.chips;
        const uploading = files.some((file) => file.progress !== undefined && file.progress !== null && file.progress < 1 && !file.error);
        const ready = files.some((file) => file.id && !file.error);
        return (!this.busy || this.queueing) && !this.disabled && !uploading && (text.length > 0 || ready) && this.value.length <= this.limit;
    }

    send() {
        if (!this.canSend()) return;
        const text = this.value.trim();
        const ids = this.chips.filter((file) => file.id && !file.error).map((file) => file.id);
        if (this.sfEmit("submit", {text, attachmentIds: ids, "attachment-ids": ids}, {cancelable: true})) this.notice = "";
    }

    stop() {
        this.sfEmit("stop", {}, {cancelable: true});
        this.field?.focus();
    }
}

SfChatComposer.define("sf-chat-composer");
