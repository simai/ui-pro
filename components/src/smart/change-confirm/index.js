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
// From its component.json (standard simai.smart-component 1.3.8 §3, §4, §8,
// §11, §19.4): the settings are attributes and properties made by
// core/js/element-manifest.js, its words are lang/<locale>.json, the actions
// answer outcomes, and the person's answer is the vocabulary's `answer {id,
// accepted}`; the old names sf-change-confirm-accept, -decline and -expire
// follow until 2026-12-01 (aliases.json). It is a confirm surface in the §19.4
// sense: an assembly's `ask` opens it and waits for the answer.
//
// It renders into its own light DOM, like every Smart component: a document
// stylesheet does not cross a shadow boundary.
import SfBaseElement from "../../core/js/smart-base";
import {elementFromManifest} from "../../core/js/element-manifest";
import {noteDeprecated} from "../../core/js/deprecations";
import {instancePath, partId} from "../../core/js/instance-path";
import {pageLocale} from "../../core/js/page-language";
import {renderChangeConfirmTemplate} from "./js/templates/default.js";
import manifest from "./component.json";
import aliases from "./aliases.json";
import en from "./lang/en.json";
import ru from "./lang/ru.json";

const STATES = manifest.settings.state.values;
const applied = () => ({outcome: "applied"});
const refused = (reason) => ({outcome: "refused", reason});

// A timer longer than this is not a timer setTimeout keeps: past 2^31-1 ms it
// fires at once. An offer valid for longer than 24 days is checked again daily.
const LONGEST_WAIT = 24 * 60 * 60 * 1000;

const ChangeConfirmElement = elementFromManifest(manifest, {
    base: SfBaseElement,
    lang: {en, ru},
    source: "ru",
    aliases,
});

class SfChangeConfirm extends ChangeConfirmElement {
    static get props() {
        return {
            ...super.props,
            templateName: {attribute: "template", default: "default"},
            // The list is a property (the usual case: a host has objects) or
            // the `changes` attribute in JSON (markup, the Studio).
            changes: {attribute: "changes", type: Array, default: []},
        };
    }

    constructor() {
        super();
        this._pressed = null;
        this._timer = null;
        this._expiredSaid = false;
        this._changes = null;
        this._asks = [];
        // A value set as a property before the element was defined is an own
        // property that would hide the accessor; it is taken through it.
        if (Object.prototype.hasOwnProperty.call(this, "changes")) {
            const early = this.changes;
            delete this.changes;
            this.changes = early;
        }
    }

    // A property wins over the attribute, which is read through the base's
    // declared prop.
    get changes() {
        const value = this._changes ?? this.getProp("changes");
        return Array.isArray(value) ? value : [];
    }

    set changes(value) {
        this._changes = Array.isArray(value) ? value.map((change) => ({...change})) : null;
        this.requestComponentUpdate("changes");
    }

    get state() {
        const value = this.getAttribute("state");
        return STATES.includes(value) ? value : "open";
    }

    set state(value) {
        this.setAttribute("state", STATES.includes(value) ? value : "open");
    }

    // An open offer past its time is expired whatever the attribute says: the
    // host may not have heard yet, and a button that can no longer work must
    // not be pressable in the meantime.
    get expired() {
        if (this.state === "expired") return true;
        if (this.state !== "open") return false;
        const until = Date.parse(this.getAttribute("expires-at") || "");
        return Number.isFinite(until) && Date.now() >= until;
    }

    get shownState() {
        return this.expired ? "expired" : this.state;
    }

    // The heading's id is the card's path (§7.1.1), never a counter.
    get headingId() {
        return partId(instancePath(this, {kind: "sf-change-confirm"}), "heading");
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
        if (shown === "pending") return this.sfWord(this._pressed === false ? "declining-text" : "accepting-text");
        if (shown === "accepted") return this.sfWord("accepted-text");
        if (shown === "declined") return this.sfWord("declined-text");
        if (shown === "expired") return this.sfWord("expired-text");
        const until = this.getAttribute("expires-at");
        const time = until ? this.formatTime(until) : "";
        return time ? this.sfWord("until-text", {vars: {time}}) : "";
    }

    templateContext() {
        const shown = this.shownState;
        return {
            component: this,
            state: shown,
            headingId: this.headingId,
            heading: this.getProp("heading"),
            headingLevel: this.getProp("headingLevel"),
            hasDescription: this.hasSlotContent("description"),
            description: this.hasSlotContent("description") ? this.getSlotContent("description") : null,
            changes: this.changes,
            changesLabel: this.sfWord("changes-label"),
            beforeText: this.sfWord("before-text"),
            afterText: this.sfWord("after-text"),
            emptyValueText: this.sfWord("empty-value-text"),
            acceptText: this.getProp("acceptText") || this.sfWord("accept-text"),
            declineText: this.getProp("declineText") || this.sfWord("decline-text"),
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
        const until = Date.parse(this.getAttribute("expires-at") || "");
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
        this.settleAsks({accepted: false, reason: "expired"});
        if (this._expiredSaid) return;
        this._expiredSaid = true;
        this.sfEmit("expired", {id: this.changeId});
    }

    // ── actions (§4.4) ──────────────────────────────────────────────────────

    /**
     * Puts the question again. Asked by an assembly -- a call that hands a
     * signal -- it answers when the person answers or the time runs out, with
     * {accepted, reason, value} (§19.4).
     */
    open(params = {}, {signal} = {}) {
        if (this.state !== "open") this.state = "open";
        return signal ? this.waitForAnswer(signal) : applied();
    }

    /** The person's answer as a call: {accepted: true} confirms, false declines. */
    answer(params = {}) {
        const accepted = this.readAnswer(params);
        if (accepted === null) return refused("unknown");
        if (this.shownState !== "open") return refused("closed");
        if (this.getProp("disabled")) return refused("disabled");
        const focusWasInside = this.contains(this.ownerDocument.activeElement);
        this._pressed = accepted;
        this.setAttribute("state", "pending");
        const delivered = this.sfEmit("answer", {id: this.changeId, accepted});
        // A cancelled event is a host that did not take the answer: the
        // question stands, and the person may answer again.
        if (!delivered) {
            this._pressed = null;
            this.setAttribute("state", "open");
        } else {
            this.settleAsks({accepted, reason: accepted ? "close" : "cancelled"});
        }
        // The pressed button is gone with the answers; focus moves to the
        // sentence that says what happened rather than falling to the page.
        if (focusWasInside) this.whenRendered(() => this.focusStatus(), {next: true});
        return delivered ? applied() : refused("prevented");
    }

    /** The acceptance (§19.4): data-sf-action="<id>.confirm". */
    confirm() {
        return this.answer({accepted: true});
    }

    /** The declining answer (vocabulary §5 cancel): data-sf-action="<id>.cancel". */
    cancel() {
        return this.answer({accepted: false});
    }

    // answer("accept") and answer("decline") were the 1.0 form; read until the
    // aliases' day and noted, so a host sees what it still leans on.
    readAnswer(params) {
        if (params && typeof params === "object" && typeof params.accepted === "boolean") return params.accepted;
        const kind = typeof params === "string" ? params : params?.accepted;
        if (kind === "accept" || kind === "decline") {
            noteDeprecated({
                component: "sf-change-confirm", tag: "sf-change-confirm", kind: "action",
                from: `answer("${kind}")`, to: `answer({accepted: ${kind === "accept"}})`,
                since: aliases.since, remove_after: aliases.remove_after,
            });
            return kind === "accept";
        }
        return null;
    }

    waitForAnswer(signal) {
        return new Promise((resolve) => {
            const ask = {resolve};
            this._asks.push(ask);
            signal?.addEventListener?.("abort", () => {
                this._asks = this._asks.filter((one) => one !== ask);
                resolve({outcome: "cancelled"});
            }, {once: true});
        });
    }

    settleAsks({accepted, reason}) {
        const asks = this._asks;
        this._asks = [];
        for (const ask of asks) ask.resolve({outcome: "applied", value: {accepted, reason, value: null}});
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
