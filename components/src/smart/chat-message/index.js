// One chat message: an assistant's answer or its wait, a person's question
// (template `default`), or a message of a conversation between people
// (template `person`). It came from simai/ui-chat (D31: components live in the
// Framework or in ui-pro, owner 2026-10-26; the move approved 2026-10-27),
// where sf-chat-message showed one message by itself and the chat window drew
// the same view inside its sf-message-log.
//
// The view is plain DOM (js/view/message.js, js/view/person.js), built once
// per change of the message, its display or the features, and handed to Lit
// as one node: a list that keeps its scroll while history is prepended, an
// open «why» card and a brief's typed answer need nodes that stay put, and
// the site widget, which has no Framework runtime, calls the same view
// directly. A window places the element in sf-message-log through the log's
// renderMessage hook; the log stays chat-agnostic.
//
// From its component.json (standard simai.smart-component 1.3.9 §3, §4, §8,
// §11): the settings are properties made by core/js/element-manifest.js, its
// words are lang/<locale>.json, and the events are the vocabulary's retry,
// check, rate, cancel, toggle, submit, save and delete with the chat's
// drafted and copied; the 0.3 sf-chat-action {action, ...} follows them until
// 2026-12-01 (aliases.json), and so does the 0.3 property view (now display).
import SfBaseElement from "../../core/js/smart-base";
import {elementFromManifest} from "../../core/js/element-manifest";
import {pageLocale} from "../../core/js/page-language";
import {renderChatMessageTemplate} from "./js/templates/default.js";
import {renderChatPersonTemplate} from "./js/templates/person.js";
import {disposeRendering, renderMessage, resumeRendering} from "./js/view/message.js";
import {renderPersonMessage} from "./js/view/person.js";
import manifest from "./component.json";
import aliases from "./aliases.json";
import en from "./lang/en.json";
import ru from "./lang/ru.json";

/** The view's 0.3 keys (stage.queued, brief.otherLabel) as lang/ names (stage-queued, brief-other-label). */
export const wordName = (key) => String(key).replace(/[._]/gu, "-").replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`);

// What the message offers unless the host says otherwise; the brief (API.md
// v1.2) only where a surface asks for it.
export const DEFAULT_FEATURES = Object.freeze({feedback: true, proposals: true, memory: true, brief: false});

// API.md's proposal states, as sf-change-confirm's.
const PROPOSAL_STATE = {presented: "open", applied: "accepted", rejected: "declined", expired: "expired"};

// What redraws the view: the three settings, the template, the language.
const REDRAWN = new Set(["message", "display", "features", "template", "language"]);

// The 0.3 action of each new event, for the dated sf-chat-action alias.
function formerAction(detail, type) {
    if (!detail) return undefined;
    const verb = String(type).replace(/^sf-chat-message-/u, "");
    if (verb === "retry") return detail.kind ? undefined : {action: "retry", id: detail.id};
    if (verb === "check") return {action: "check", id: detail.id};
    if (verb === "rate") {
        return Object.prototype.hasOwnProperty.call(detail, "reason") || Object.prototype.hasOwnProperty.call(detail, "note")
            ? {action: "feedback-send", id: detail.id, reason: detail.reason ?? null, note: detail.note ?? ""}
            : {action: "feedback", id: detail.id, value: detail.value};
    }
    if (verb === "cancel") return detail.kind === "rate" ? {action: "feedback-skip", id: detail.id} : undefined;
    if (verb === "drafted") return {action: "feedback-draft", id: detail.id, reason: detail.reason, note: detail.note};
    if (verb === "toggle") return detail.kind === "sources" ? {action: "sources", id: detail.id, open: detail.open} : undefined;
    if (verb === "copied") return {action: "copy", id: detail.id, done: detail.done};
    if (verb === "submit") return {action: "brief-answer", id: detail.id, text: detail.text};
    return undefined;
}

const ChatMessageElement = elementFromManifest(manifest, {
    base: SfBaseElement,
    lang: {en, ru},
    source: "ru",
    aliases,
});

class SfChatMessage extends ChatMessageElement {
    constructor() {
        super();
        this._node = null;
        this._drawn = null;
        this._stale = true;
        // One sf-change-confirm per proposal code, kept across redraws, so a
        // card just pressed stays pending until the verdict comes.
        this._cards = new Map();
        // A value set as a property before the element was defined is an own
        // property that would hide the accessor; it is taken through it.
        for (const name of ["message", "display", "features"]) {
            if (!Object.prototype.hasOwnProperty.call(this, name)) continue;
            const early = this[name];
            delete this[name];
            this[name] = early;
        }
    }

    /** The template the attribute names: person, or the default. */
    get viewTemplate() {
        return this.componentTemplateName === "person" ? "person" : "default";
    }

    // Both templates are built in; neither is looked for as an external one.
    hasBuiltInTemplate(templateName = this.componentTemplateName) {
        return !templateName || templateName === "default" || templateName === "person";
    }

    requestComponentUpdate(reason) {
        if (REDRAWN.has(reason)) this._stale = true;
        return super.requestComponentUpdate(reason);
    }

    // The 0.3 detail of sf-chat-action, from each new event's.
    sfAliasAdapters() {
        return {"sf-chat-action": formerAction};
    }

    // --- the view's context -------------------------------------------------

    /** The context the view draws with (js/view/message.js ctx). */
    viewContext() {
        const documentRef = this.ownerDocument;
        const locale = pageLocale(this);
        const words = (key, values = {}) => this.sfWord(wordName(key), {vars: values});
        const features = this.features && typeof this.features === "object" ? this.features : {};
        return {
            document: documentRef,
            locale,
            words,
            // Smart sf-icon: the Loader styles a static icon only through the
            // subset service, which a chat page does not use.
            icon(name, {size = ""} = {}) {
                const icon = documentRef.createElement("sf-icon");
                icon.setAttribute("icon", name);
                if (size) icon.setAttribute("size", size);
                icon.setAttribute("aria-hidden", "true");
                return icon;
            },
            enhanceCode(pre) {
                const highlight = globalThis.SF?.Highlight;
                if (!highlight?.highlight) return;
                pre.setAttribute("data-copy-label", words("code.copy"));
                highlight.highlight(pre.querySelector("code") || pre);
            },
            onAction: (action, detail) => this.onViewAction(action, detail ?? {}),
            features: {...DEFAULT_FEATURES, ...features},
            renderProposal: (proposal, options) => this.placeProposal(proposal, options),
        };
    }

    /**
     * A proposal as sf-change-confirm. The card applies nothing: a press moves
     * it to pending and leaves as sf-change-confirm-answer {id: code,
     * accepted}, which the window answers with the proposal's command (port
     * proposal.decide); the server's next answer sets the outcome here.
     */
    placeProposal(proposal, {disabled = false} = {}) {
        const state = PROPOSAL_STATE[proposal.state] ?? "open";
        const code = String(proposal.code);
        const kept = this._cards.get(code);
        const same = kept && kept.dataset.state === state && kept.dataset.expiresAt === String(proposal.expires_at ?? "");
        const card = same ? kept : this.ownerDocument.createElement("sf-change-confirm");
        if (!same) {
            card.setAttribute("heading", proposal.title ?? "");
            card.setAttribute("heading-level", "2");
            card.setAttribute("change-id", code);
            // «Отменить», not the card's «Отклонить»: an assistant's offer is
            // called off, not turned down (the chat's word since R-07).
            card.setAttribute("decline-text", this.sfWord("proposal-cancel"));
            card.setAttribute("accept-text", this.sfWord("proposal-confirm"));
            if (proposal.expires_at) card.setAttribute("expires-at", String(proposal.expires_at));
            card.setAttribute("state", state);
            card.dataset.state = state;
            card.dataset.expiresAt = String(proposal.expires_at ?? "");
            // The attribute, not the property: the card may be made before
            // the Loader defined sf-change-confirm, and a property set on a
            // node not yet upgraded would shadow its accessor.
            card.setAttribute("changes", JSON.stringify((proposal.changes || []).map((change) => ({
                label: change.field,
                before: change.was,
                after: change.will_be,
            }))));
            this._cards.set(code, card);
        }
        card.toggleAttribute("disabled", Boolean(disabled));
        return card;
    }

    // --- what a person does -------------------------------------------------

    /** The view's 0.3 actions as the element's events. */
    onViewAction(action, detail) {
        const id = detail.id ?? detail.message?.id ?? null;
        switch (action) {
            case "retry":
                // An assistant's failed answer {id}; a person's unsent message {clientKey}.
                if (detail.clientKey !== undefined) this.sfEmit("retry", {key: detail.clientKey}, {cancelable: true});
                else this.sfEmit("retry", {id}, {cancelable: true});
                return;
            case "retry-file":
                this.sfEmit("retry", {id: detail.messageId, key: detail.fileKey, kind: "file"}, {cancelable: true});
                return;
            case "check":
                this.sfEmit("check", {id}, {cancelable: true});
                return;
            case "feedback":
                this.sfEmit("rate", {id, value: detail.value}, {cancelable: true});
                return;
            case "feedback-send":
                this.sfEmit("rate", {id, value: "down", reason: detail.reason ?? null, note: detail.note ?? ""}, {cancelable: true});
                return;
            case "feedback-skip":
                this.sfEmit("cancel", {id, kind: "rate"}, {cancelable: true});
                return;
            case "feedback-draft":
                this.sfEmit("drafted", {id, reason: detail.reason ?? null, note: detail.note ?? ""});
                return;
            case "sources":
                this.sfEmit("toggle", {id, kind: "sources", open: Boolean(detail.open)});
                return;
            case "steps":
                this.sfEmit("toggle", {id, kind: "steps", open: Boolean(detail.open)});
                return;
            // A source's or a file's preview (API.md v1.3): a host that shows
            // it cancels the event, and the view does nothing more; the
            // answer goes back to the view (false: taken).
            case "preview":
                return this.sfEmit("open", {id, kind: "preview", source: detail.source}, {cancelable: true});
            case "copy":
                this.sfEmit("copied", {id, done: Boolean(detail.done)});
                return;
            case "brief-answer":
                this.sfEmit("submit", {id, text: detail.text}, {cancelable: true});
                return;
            case "edit-start":
            case "edit-cancel":
                this.sfEmit("toggle", {id, kind: "edit", open: action === "edit-start"});
                return;
            case "delete-ask":
            case "delete-cancel":
                this.sfEmit("toggle", {id, kind: "delete", open: action === "delete-ask"});
                return;
            case "edit":
                this.sfEmit("save", {id, values: {body: detail.body}}, {cancelable: true});
                return;
            case "delete":
                this.sfEmit("delete", {ids: [id]}, {cancelable: true});
                return;
            default:
        }
    }

    // --- drawing ------------------------------------------------------------

    /** The view's node for the message as it is now; null without a message. */
    draw() {
        if (this._node) disposeRendering(this._node);
        this._away = false;
        const message = this.message;
        if (!message || typeof message !== "object") return null;
        const display = this.display && typeof this.display === "object" ? this.display : {};
        const ctx = this.viewContext();
        return this.viewTemplate === "person" ? renderPersonMessage(ctx, message, display) : renderMessage(ctx, message, display);
    }

    templateContext() {
        const drawn = [this.message, this.display, this.features, this.viewTemplate, pageLocale(this)];
        if (this._stale || !this._drawn || drawn.some((one, index) => one !== this._drawn[index])) {
            this._node = this.draw();
            this._drawn = drawn;
            this._stale = false;
        }
        const display = this.display && typeof this.display === "object" ? this.display : {};
        return {component: this, node: this._node, divider: display.divider === "unread" ? this.sfWord("divider-unread") : null};
    }

    template() {
        const context = this.templateContext();
        return this.viewTemplate === "person" ? renderChatPersonTemplate(context) : renderChatMessageTemplate(context);
    }

    // A message moved within its list comes back with its clock (a running
    // answer's steps), which leaving the page stopped.
    connectedCallback() {
        super.connectedCallback();
        if (this._node && this._away) resumeRendering(this._node);
        this._away = false;
    }

    disconnectedCallback() {
        if (this._node) disposeRendering(this._node);
        this._away = true;
        super.disconnectedCallback();
    }
}

SfChatMessage.define("sf-chat-message");

export {renderMessage, renderPersonMessage};
