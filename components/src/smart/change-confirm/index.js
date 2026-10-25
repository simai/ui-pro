// A change somebody prepared and nobody has applied yet, put to a person to
// confirm or decline: what each value was, what it will be, two answers of equal
// weight and, when the offer runs out, until when.
//
// It began in simai/ui-chat as the assistant's «proposal» card -- a function,
// renderProposal, and a set of .sf-chat-proposal rules -- and was promoted here
// as an element (owner, 2026-10-25), because the same question is asked outside
// an assistant: a colleague proposing an edit in a people's chat (simai.chat), a
// moderation queue, an import that wants a yes before it writes. What was
// assistant-only in it is gone: it knows no command text, no code format and no
// server. A press is reported as an event and the host decides what it means.
//
// The element never applies anything. A press moves it to `pending`, which
// takes both answers away so that nothing is pressed twice, and says what is
// happening; the host then sets the outcome -- `accepted`, `declined`, or back
// to `open` when the answer could not be delivered. Once settled, the card keeps
// only its outcome: no buttons that can no longer mean anything.
//
// It renders into its own light DOM, like every Smart component: a document
// stylesheet does not cross a shadow boundary.
import SfBaseElement from "../../core/js/smart-base";
import {pageLocale, pageText} from "../../core/js/page-language";
import {renderChangeConfirmTemplate} from "./js/templates/default.js";

const STATES = ["open", "pending", "accepted", "declined", "expired"];

// The Framework speaks English by default and the page's language otherwise. A
// product corrects one word through SF.language.register('sf-change-confirm', ...)
// or the two answers through accept-text / decline-text, which are the words a
// context most often wants its own of («Отменить» for an assistant's offer,
// «Отклонить» for a colleague's).
const CHANGE_CONFIRM_TEXT = {
    en: {
        changesLabel: "What will change",
        beforeText: "Was",
        afterText: "Will be",
        acceptText: "Confirm",
        declineText: "Decline",
        acceptingText: "Applying…",
        decliningText: "Declining…",
        acceptedText: "Applied",
        declinedText: "Declined",
        expiredText: "The time to confirm has passed",
        untilText: "Confirm by {time}",
        emptyValueText: "empty",
    },
    ru: {
        changesLabel: "Что изменится",
        beforeText: "Было",
        afterText: "Станет",
        acceptText: "Подтвердить",
        declineText: "Отклонить",
        acceptingText: "Применяется…",
        decliningText: "Отклоняется…",
        acceptedText: "Применено",
        declinedText: "Отклонено",
        expiredText: "Время подтверждения истекло",
        untilText: "Подтвердить можно до {time}",
        emptyValueText: "пусто",
    },
};

// A timer longer than this is not a timer setTimeout keeps: past 2^31-1 ms it
// fires at once. An offer valid for longer than 24 days is checked again daily.
const LONGEST_WAIT = 24 * 60 * 60 * 1000;

let headingIds = 0;

class SfChangeConfirm extends SfBaseElement {
    static get props() {
        return {
            templateName: {attribute: "template", default: "default"},
            heading: {default: ""},
            headingLevel: {attribute: "heading-level", default: "3", values: ["2", "3", "4", "5", "6"]},
            state: {default: "open", values: STATES},
            // ISO 8601. Past it an open offer reads as expired, and the element
            // says so once with sf-change-confirm-expire.
            expiresAt: {attribute: "expires-at", default: ""},
            // The host's name for this change, carried back in every event.
            changeId: {attribute: "change-id", default: ""},
            disabled: {type: Boolean, default: false},
            acceptText: {attribute: "accept-text", default: ""},
            declineText: {attribute: "decline-text", default: ""},
            changes: {type: Array, default: []},
        };
    }

    constructor() {
        super();
        this._pressed = null;
        this._timer = null;
        this._expiredSaid = false;
        this._headingId = `sf-change-confirm-heading-${(headingIds += 1)}`;
        this._changes = null;
    }

    text(key, values = {}) {
        const words = pageText(CHANGE_CONFIRM_TEXT, key, this);
        return words.replace(/\{(\w+)\}/g, (match, name) => (name in values ? String(values[name]) : match));
    }

    // The list may be given as a property (the usual case: a host has objects)
    // or as the `changes` attribute in JSON (markup, the Studio). A property
    // wins; the attribute is read through the base's declared prop.
    get changes() {
        const value = this._changes ?? this.getProp("changes");
        return Array.isArray(value) ? value : [];
    }

    set changes(value) {
        this._changes = Array.isArray(value) ? value.map((change) => ({...change})) : null;
        this.requestComponentUpdate("changes");
    }

    get state() {
        const value = this.getProp("state");
        return STATES.includes(value) ? value : "open";
    }

    set state(value) {
        this.setAttribute("state", STATES.includes(value) ? value : "open");
    }

    get changeId() {
        return this.getProp("changeId");
    }

    // An open offer past its time is expired whatever the attribute says: the
    // host may not have heard yet, and a button that can no longer work must
    // not be pressable in the meantime.
    get expired() {
        if (this.state === "expired") return true;
        if (this.state !== "open") return false;
        const until = Date.parse(this.getProp("expiresAt") || "");
        return Number.isFinite(until) && Date.now() >= until;
    }

    get shownState() {
        return this.expired ? "expired" : this.state;
    }

    formatTime(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "";
        const sameDay = date.toDateString() === new Date().toDateString();
        return new Intl.DateTimeFormat(pageLocale(this), sameDay
            ? {hour: "2-digit", minute: "2-digit"}
            : {day: "numeric", month: "long", hour: "2-digit", minute: "2-digit"}).format(date);
    }

    statusText(shown) {
        if (shown === "pending") return this.text(this._pressed === "decline" ? "decliningText" : "acceptingText");
        if (shown === "accepted") return this.text("acceptedText");
        if (shown === "declined") return this.text("declinedText");
        if (shown === "expired") return this.text("expiredText");
        const until = this.getProp("expiresAt");
        const time = until ? this.formatTime(until) : "";
        return time ? this.text("untilText", {time}) : "";
    }

    templateContext() {
        const shown = this.shownState;
        return {
            component: this,
            state: shown,
            headingId: this._headingId,
            heading: this.getProp("heading"),
            headingLevel: this.getProp("headingLevel"),
            hasDescription: this.hasSlotContent("description"),
            description: this.hasSlotContent("description") ? this.getSlotContent("description") : null,
            changes: this.changes,
            changesLabel: this.text("changesLabel"),
            beforeText: this.text("beforeText"),
            afterText: this.text("afterText"),
            emptyValueText: this.text("emptyValueText"),
            acceptText: this.getProp("acceptText") || this.text("acceptText"),
            declineText: this.getProp("declineText") || this.text("declineText"),
            statusText: this.statusText(shown),
            open: shown === "open",
            disabled: this.getProp("disabled") || shown !== "open",
        };
    }

    template() {
        return renderChangeConfirmTemplate(this.templateContext());
    }

    onConnected() {
        super.onConnected?.();
        this.schedule();
    }

    onDisconnected() {
        clearTimeout(this._timer);
        this._timer = null;
        super.onDisconnected?.();
    }

    attributeChangedCallback(name, oldValue, newValue) {
        super.attributeChangedCallback?.(name, oldValue, newValue);
        if (name === "state" && newValue !== "pending") this._pressed = null;
        if (name === "state" || name === "expires-at") {
            // A new time, or the host reopening the offer, is a new chance to
            // run out; the last expiry was about the last time.
            if (name === "expires-at" || newValue === "open") this._expiredSaid = false;
            this.schedule();
        }
    }

    // One timer, for the moment the offer runs out; nothing polls. When it
    // fires the card redraws as expired and the host hears it once.
    schedule() {
        clearTimeout(this._timer);
        this._timer = null;
        if (!this.isConnected || this.state !== "open") return;
        const until = Date.parse(this.getProp("expiresAt") || "");
        if (!Number.isFinite(until)) return;
        const wait = until - Date.now();
        if (wait <= 0) {
            this.expire();
            return;
        }
        this._timer = setTimeout(() => {
            this._timer = null;
            if (Date.now() >= until) this.expire();
            else this.schedule();
        }, Math.min(wait + 50, LONGEST_WAIT));
    }

    expire() {
        this.requestComponentUpdate("expired");
        if (this._expiredSaid) return;
        this._expiredSaid = true;
        this.dispatchEvent(new CustomEvent("sf-change-confirm-expire", {
            bubbles: true, composed: true, detail: {id: this.changeId},
        }));
    }

    /** Answer as the person would: kind is "accept" or "decline". */
    answer(kind) {
        if (kind !== "accept" && kind !== "decline") return false;
        if (this.shownState !== "open" || this.getProp("disabled")) return false;
        const focusWasInside = this.contains(this.ownerDocument.activeElement);
        this._pressed = kind;
        this.setAttribute("state", "pending");
        const event = new CustomEvent(`sf-change-confirm-${kind}`, {
            bubbles: true, composed: true, cancelable: true, detail: {id: this.changeId},
        });
        const delivered = this.dispatchEvent(event);
        // A cancelled event is a host that did not take the answer: the
        // question stands, and the person may answer again.
        if (!delivered) {
            this._pressed = null;
            this.setAttribute("state", "open");
        }
        // The pressed button is gone with the answers; focus moves to the
        // sentence that says what happened rather than falling to the page.
        if (focusWasInside) this.whenRendered(() => this.focusStatus(), {next: true});
        return delivered;
    }

    focusStatus() {
        const target = this.querySelector(".sf-change-confirm__status");
        if (!target) return;
        const buttons = this.querySelector(".sf-change-confirm__actions:not([hidden])");
        if (buttons && this.state === "open") {
            buttons.querySelector("button")?.focus();
            return;
        }
        target.focus({preventScroll: true});
    }
}

SfChangeConfirm.define("sf-change-confirm");
