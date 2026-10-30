// sf-mail-canvas: the middle pane of SIMAI Email Editor -- a rendered letter in
// a frame that runs nothing, the width switch over it, the two notes about it
// (out of date, heavy) and sf-composition-overlay on top: the frames, the
// toolbar and the keyboard tree.
//
// It knows no letter, no block manifest and no renderer. The host passes the
// HTML it rendered and the data about it, and hears what the person did: chose
// a block, hovered one, switched the width, asked for an action or an insertion.
// The HTML is untrusted content: the frame's sandbox is allow-same-origin and
// nothing else, so a script in it never runs and never reaches the page; the
// page reads the frame, the frame cannot read the page.
//
// Written for ui-mail's editor by the owner's decision D31 (2026-10-29): a
// product keeps no component set of its own. From its component.json (standard
// simai.smart-component 1.4 §3, §4, §8, §11): the settings are attributes and
// properties made by core/js/element-manifest.js, its words are
// lang/<locale>.json, and the actions answer outcomes.
import SfBaseElement from "../../core/js/smart-base";
import {elementFromManifest} from "../../core/js/element-manifest";
import {renderMailCanvasTemplate} from "./js/templates/default.js";
import manifest from "./component.json";
import en from "./lang/en.json";
import ru from "./lang/ru.json";

const applied = () => ({outcome: "applied"});
const refused = (reason) => ({outcome: "refused", reason});

const MARK = /^data-[a-z0-9-]+$/u;
const OVERLAY = "sf-composition-overlay";

const MailCanvasElement = elementFromManifest(manifest, {
    base: SfBaseElement,
    lang: {en, ru},
    source: "ru",
    actions: {
        select({id} = {}) {
            const wanted = String(id ?? "");
            if (wanted && !this.itemOf(wanted)) return refused("unknown");
            this.sayChosen(wanted);
            return applied();
        },
        "set-width"({value} = {}) {
            const wanted = String(value ?? "");
            if (!this.widthList().some((item) => String(item.value) === wanted)) return refused("unknown");
            if (String(this.currentWidth()?.value ?? "") === wanted) return refused("unchanged");
            this.takeWidth(wanted);
            return applied();
        },
        reveal({id} = {}) {
            const wanted = String(id ?? this.selected ?? "");
            const target = wanted && this.itemOf(wanted) ? this.markedElement(wanted) : null;
            if (!target) return refused("unknown");
            const scroller = this.scroller;
            const box = target.getBoundingClientRect();
            const top = this.frame.getBoundingClientRect().top + box.top;
            const view = scroller.getBoundingClientRect();
            if (top >= view.top && top + Math.min(box.height, view.height) <= view.bottom) return refused("unchanged");
            const room = parseFloat(getComputedStyle(scroller).scrollPaddingBlockStart) || 0;
            const calm = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
            scroller.scrollBy({top: top - view.top - room, behavior: calm ? "auto" : "smooth"});
            return applied();
        },
        refresh() {
            this.drawTints();
            this.nodesFor = null;
            this.syncOverlay();
            this.fitFrame();
            this.boundOverlay?.refresh?.();
            return applied();
        },
    },
});

class SfMailCanvas extends MailCanvasElement {
    static get props() {
        return {...super.props, templateName: {attribute: "template", default: "default"}};
    }

    constructor() {
        super();
        // A value set as a property before the element was defined is an own
        // property that would hide the accessor; it is taken through it.
        for (const name of ["html", "widths", "items", "actions", "weight"]) {
            if (Object.prototype.hasOwnProperty.call(this, name)) {
                const early = this[name];
                delete this[name];
                this[name] = early;
            }
        }
        this.written = "";
        this.waitingForLoad = false;
        this.sheet = null;
        this.hovered = "";
        this.saidThisTurn = undefined;
        this.nodesFor = null;
        this.boundOverlay = null;
        this.overlayWatch = null;
        this.quiet = false;
        this.warnedTarget = "";
    }

    // The letter can be far longer than an attribute should hold, so `html` is
    // kept as a property; an attribute (a printed page, an example) is read
    // until one is written.
    get html() {
        return this.letterHtml ?? this.getAttribute("html") ?? "";
    }

    set html(value) {
        this.letterHtml = value === null || value === undefined ? "" : String(value);
        this.requestComponentUpdate("html");
    }

    get scroller() {
        return this.querySelector(".sf-mail-canvas-scroll");
    }

    /** The iframe that shows the letter. */
    get frame() {
        return this.querySelector(".sf-mail-canvas-frame");
    }

    /** The document in the frame, for a host that adjusts the picture on `draw`. */
    get frameDocument() {
        return this.frame?.contentDocument ?? null;
    }

    /** The sf-composition-overlay in use: the one at overlay-target, else the element's own. */
    get overlay() {
        const target = String(this.overlayTarget ?? "");
        if (target) {
            const found = this.ownerDocument.getElementById(target);
            return found?.localName === OVERLAY ? found : null;
        }
        return this.querySelector(`.sf-mail-canvas-layer ${OVERLAY}`);
    }

    widthList() {
        return Array.isArray(this.widths) ? this.widths.filter((item) => item && item.value !== undefined && item.value !== null && item.value !== "") : [];
    }

    /** The width shown: the one named by `width`, else the first. */
    currentWidth() {
        const list = this.widthList();
        return list.find((item) => String(item.value) === String(this.width ?? "")) ?? list[0] ?? null;
    }

    /** How wide the frame is: the item's own `frame`, else its value when that is a number. */
    frameWidth(item = this.currentWidth()) {
        const wide = Number(item?.frame ?? item?.value);
        return Number.isFinite(wide) && wide > 0 ? wide : 0;
    }

    /**
     * A frame wider than the letter's own width shows the letter's paper inside
     * it, and that paper casts the shadow; otherwise the frame is the paper.
     */
    frameIsPaper(item = this.currentWidth()) {
        return Boolean(item) && this.frameWidth(item) === Number(item.value);
    }

    itemList() {
        return Array.isArray(this.items) ? this.items.filter((item) => item && typeof item.id === "string" && item.id) : [];
    }

    itemOf(id) {
        return this.itemList().find((item) => item.id === String(id ?? ""));
    }

    markAttributeName() {
        const name = String(this.markAttribute ?? "");
        return MARK.test(name) ? name : "data-block";
    }

    boxAttributeName() {
        const name = String(this.boxAttribute ?? "");
        return MARK.test(name) ? name : "";
    }

    /** The marked element of a block, its box when the letter marks one. */
    markedElement(id, boxed = false) {
        const letter = this.frameDocument;
        if (!letter) return null;
        const mark = `[${this.markAttributeName()}="${CSS.escape(id)}"]`;
        const box = this.boxAttributeName();
        return (boxed && box ? letter.querySelector(`${mark} [${box}]`) : null) ?? letter.querySelector(mark);
    }

    /**
     * The block under a node of the frame. The letter's markup is untrusted, so
     * a mark counts only when its id is one the host gave: an unknown mark is
     * not a block, whatever it says, and the search goes on outward.
     */
    blockAt(node) {
        const mark = this.markAttributeName();
        let element = node?.nodeType === 1 ? node : node?.parentElement;
        while (element) {
            const id = element.getAttribute(mark);
            if (id && this.itemOf(id)) return id;
            element = element.parentElement;
        }
        return "";
    }

    // One press is one choice: the overlay and the frame's own click can both
    // report it in one dispatch, with the page's microtasks run between them.
    sayChosen(id) {
        if (this.saidThisTurn === id) return;
        this.saidThisTurn = id;
        setTimeout(() => { this.saidThisTurn = undefined; });
        this.sfEmit("select", {ids: id ? [id] : [], id});
    }

    takeWidth(value) {
        const previous = String(this.currentWidth()?.value ?? "");
        this.width = value;
        this.sfEmit("change", {value, previous});
    }

    onWidthChange(event) {
        // The group's own change stops here: the element's says the same, once.
        event.stopPropagation();
        const value = String(event.detail?.value ?? "");
        if (!value || value === String(this.currentWidth()?.value ?? "")) return;
        if (this.widthList().some((item) => String(item.value) === value)) this.takeWidth(value);
    }

    afterUpdate(...args) {
        super.afterUpdate?.(...args);
        this.bindOverlay();
        this.drawFrame();
        this.drawTints();
        this.syncOverlay();
    }

    disconnectedCallback() {
        super.disconnectedCallback?.();
        this.overlayWatch?.abort();
        this.overlayWatch = null;
        this.boundOverlay = null;
    }

    /**
     * Writes the letter. The last good picture stays until a new one has loaded:
     * an empty `html` changes nothing, and the frame is not cleared or shrunk
     * while the next document is on its way.
     */
    drawFrame() {
        const frame = this.frame;
        if (!frame) return;
        const wide = this.frameWidth();
        const letter = this.html;
        if (letter && letter !== this.written) {
            this.written = letter;
            this.waitingForLoad = true;
            this.toggleAttribute("data-sf-drawing", true);
            frame.srcdoc = letter;
        }
        // A new width lays the letter out anew, and it gets another height.
        if (wide !== this.drawnWidth) {
            this.drawnWidth = wide;
            this.fitFrame();
        }
    }

    onFrameLoad() {
        // The blank document a frame has before its first letter is no picture.
        if (!this.written) return;
        this.waitingForLoad = false;
        this.toggleAttribute("data-sf-drawing", false);
        const letter = this.frameDocument;
        if (!letter) return;
        this.sheet = null;
        this.hovered = "";
        this.nodesFor = null;
        // Links in a letter take no tab stop.
        for (const link of letter.querySelectorAll("a")) link.tabIndex = -1;
        // A click on a block the overlay does not claim, or beside every block.
        // It never follows a link: the frame shows a picture of a letter.
        letter.addEventListener("click", (event) => {
            event.preventDefault();
            this.sayChosen(this.blockAt(event.target));
        });
        letter.addEventListener("mouseover", (event) => this.sayHovered(this.blockAt(event.target)));
        letter.addEventListener("mouseout", (event) => {
            if (!event.relatedTarget) this.sayHovered("");
        });
        // Before the measure, so what a host adjusts counts in the frame's height.
        this.sfEmit("draw", {});
        // Measured before the overlay hears of the letter, so its toolbar is
        // placed once, in the frame's real height.
        this.measureFrame();
        this.drawTints();
        this.syncOverlay();
    }

    sayHovered(id) {
        if (id === this.hovered) return;
        this.hovered = id;
        this.sfEmit("hover", {id});
    }

    /** Measures on the next frame, after a change the page has not laid out yet. */
    fitFrame() {
        requestAnimationFrame(() => this.measureFrame());
    }

    /**
     * The frame is as tall as the letter. The height is measured from nothing,
     * because scrollHeight never drops below the frame; the scroll position the
     * person had is put back at once, in the same task and not animated, so no
     * paint sees the difference.
     */
    measureFrame() {
        const frame = this.frame;
        const scroller = this.scroller;
        const letter = this.frameDocument?.documentElement;
        if (!frame || !scroller || !letter || !this.written) return;
        const top = scroller.scrollTop;
        frame.style.height = "0";
        let height = letter.scrollHeight;
        // A letter whose height follows its frame settles in a step or two.
        for (let step = 0; step < 4; step += 1) {
            frame.style.height = `${height}px`;
            if (letter.scrollHeight <= letter.clientHeight) break;
            height = letter.scrollHeight + (letter.scrollHeight - letter.clientHeight);
        }
        scroller.scrollTo({top, behavior: "instant"});
    }

    /** A Framework value as the frame needs it: the frame has no Framework tokens. */
    resolved(property, value) {
        const host = this.scroller ?? this;
        const probe = this.ownerDocument.createElement("span");
        probe.hidden = true;
        probe.style.colorScheme = "light";
        probe.style[property] = value;
        host.append(probe);
        const computed = getComputedStyle(probe)[property];
        probe.remove();
        return computed;
    }

    /**
     * What the canvas adds to the letter: a tint on hover and on the chosen
     * block. They are the paper roles (--sf-paper-*), the light theme's values
     * in both themes, because a letter is always light. A sheet in the frame's
     * document, so choosing a block never reloads the letter.
     */
    drawTints() {
        const letter = this.frameDocument;
        if (!letter?.documentElement || !this.written || this.waitingForLoad) return;
        const mark = this.markAttributeName();
        const box = this.boxAttributeName();
        const inner = box ? ` [${box}]` : "";
        const id = String(this.selected ?? "");
        const hover = this.resolved("color", "var(--sf-paper-hover)");
        const chosen = this.resolved("color", "var(--sf-paper-select)");
        const move = this.resolved("transition", "background-color var(--sf-duration-fast) var(--sf-ease-move)");
        const rules = [
            `[${mark}]{cursor:pointer}`,
            `[${box || mark}]{transition:${move}}`,
            `[${mark}]:hover${inner}{background:${hover}}`,
        ];
        if (id) rules.push(`[${mark}="${CSS.escape(id)}"]${inner}{background:${chosen}}`);
        const paper = String(this.paper ?? "");
        if (paper && !this.frameIsPaper() && CSS.supports(`selector(${paper})`)) {
            rules.push(`${paper}{box-shadow:${this.resolved("boxShadow", "var(--sf-elevation-1--shadow)")}}`);
        }
        if (!this.sheet || this.sheet.ownerDocument !== letter) {
            this.sheet = letter.createElement("style");
            (letter.head ?? letter.documentElement).append(this.sheet);
        }
        const text = rules.join("");
        if (this.sheet.textContent !== text) this.sheet.textContent = text;
    }

    /** Finds the overlay in use and listens to it; a later one is taken on the next draw. */
    bindOverlay() {
        const overlay = this.overlay;
        if (overlay === this.boundOverlay) return;
        this.overlayWatch?.abort();
        this.overlayWatch = null;
        this.boundOverlay = overlay;
        this.nodesFor = null;
        const target = String(this.overlayTarget ?? "");
        if (!overlay) {
            if (target && this.warnedTarget !== target) {
                this.warnedTarget = target;
                globalThis.console?.warn?.(`[SIMAI Framework] sf-mail-canvas: overlay-target "${target}" names no ${OVERLAY} on this page`);
            }
            return;
        }
        const watch = new AbortController();
        this.overlayWatch = watch;
        const on = (verb, listener) => overlay.addEventListener(`${OVERLAY}-${verb}`, listener, {signal: watch.signal});
        on("select", (event) => this.onOverlaySelect(event.detail ?? {}));
        on("apply", ({detail = {}}) => this.sfEmit("apply", {action: detail.action, scope: detail.scope, ids: detail.ids}));
        on("insert", ({detail = {}}) => this.sfEmit("insert", {
            parent: detail.parent ?? "",
            slot: detail.slot,
            index: detail.index,
            ...(detail.item === undefined ? {} : {item: detail.item, from: detail.from, mode: detail.mode}),
        }));
        on("move", ({detail = {}}) => this.sfEmit("move", {ids: detail.ids, id: detail.id, parent: detail.parent ?? "", position: detail.position, slot: detail.slot}));
        on("change", (event) => {
            const {id, value, previous} = event.detail ?? {};
            if (!this.sfEmit("edit", {id, value, previous}, {cancelable: true})) event.preventDefault();
        });
        // The frame colour stays the paper's own in both themes, as the tints do.
        overlay.style.setProperty("--sf-composition-overlay-frame-color", "var(--sf-paper-primary)");
        customElements.whenDefined(OVERLAY).then(() => {
            if (this.boundOverlay !== overlay || !this.frame) return;
            overlay.attachFrame(this.frame);
            this.nodesFor = null;
            this.syncOverlay();
        });
    }

    onOverlaySelect({id}) {
        if (this.quiet) return;
        const wanted = String(id ?? "");
        // What the host has already chosen comes back from the overlay as news.
        if (wanted === String(this.selected ?? "")) return;
        this.sayChosen(wanted);
    }

    /**
     * Tells the overlay what the letter holds: one node per item, the element
     * being the block's own box in the frame, so the line it draws is the box
     * the tint fills. The next letter's items wait for the next letter.
     */
    syncOverlay() {
        const overlay = this.boundOverlay;
        if (!overlay?.setNodes || !this.written || this.waitingForLoad || !this.frameDocument) return;
        this.quiet = true;
        try {
            const items = this.items;
            if (this.nodesFor?.items !== items || this.nodesFor?.letter !== this.frameDocument) {
                overlay.setNodes(this.nodes());
                this.nodesFor = {items, letter: this.frameDocument};
            }
            overlay.setActions(Array.isArray(this.actions) ? this.actions : []);
            overlay.select(String(this.selected ?? "") || null, {emit: false});
        } finally {
            this.quiet = false;
        }
        const accepts = String(this.accepts ?? "");
        if (accepts) overlay.setAttribute("accepts", accepts);
        else if (overlay.hasAttribute("accepts") && !this.overlayTarget) overlay.removeAttribute("accepts");
    }

    /** The items the letter really holds; a child of an item it does not hold goes with it. */
    nodes() {
        const kept = new Set();
        const nodes = [];
        for (const item of this.itemList()) {
            const element = this.markedElement(item.id, true);
            const hasRect = item.rect && typeof item.rect === "object";
            if (!element && !hasRect) continue;
            if (item.parent && !kept.has(item.parent)) continue;
            kept.add(item.id);
            nodes.push({
                id: item.id,
                kind: item.kind || "block",
                ...(element ? {element} : {rect: item.rect}),
                ...(item.label ? {label: String(item.label)} : {}),
                ...(item.parent ? {parent: item.parent} : {}),
                ...(item.editable && element ? {editable: true} : {}),
            });
        }
        return nodes;
    }

    templateContext() {
        const current = this.currentWidth();
        const weight = this.weight && typeof this.weight === "object" && Number.isFinite(Number(this.weight.bytes)) && this.weight.bytes !== null ? this.weight : null;
        const wide = this.frameWidth(current);
        return {
            component: this,
            choices: this.widthList().map((item) => ({...item, value: String(item.value)})),
            chosenWidth: String(current?.value ?? ""),
            frameSize: wide || "",
            frameCastsShadow: this.frameIsPaper(current),
            ownOverlay: !String(this.overlayTarget ?? ""),
            overlayAccepts: String(this.accepts ?? ""),
            isStale: Boolean(this.stale),
            staleText: this.sfWord("stale-text"),
            weightText: weight ? this.sfWord("weight-text", {vars: {bytes: String(weight.bytes), max: String(weight.max ?? "")}}) : "",
            previewLabel: this.sfWord("preview-label"),
            layerLabel: this.sfWord("layer-label"),
            frameLabel: this.sfWord("frame-label"),
            widthsLabel: this.sfWord("widths-label"),
            rootClass: this.getRootClass?.() ?? "",
        };
    }

    template() {
        return renderMailCanvasTemplate(this.templateContext());
    }
}

SfMailCanvas.define("sf-mail-canvas");
