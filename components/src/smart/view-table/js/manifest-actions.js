// The actions a manifest declares, on a class that already has the methods
// (standard simai.smart-component 1.3.8 §4.4). elementFromManifest makes a
// method per action, but a component whose class predates its manifest keeps
// its own methods, which shadow the generated ones. This wraps those methods
// once per class so that, as the standard asks, each:
//
// - takes its `with` parameters as one object, as well as positionally;
// - answers an outcome: {outcome: applied | refused | conflict | unavailable
//   | cancelled, reason?, message?}. A host port's answer ({answer, reason,
//   message}, vocabulary §3.1) is read as the outcome it is; a method that
//   answered nothing, or the element itself, answered applied.
//
// Helpers the class calls internally go through the same wrapper; nothing in
// the package reads their old return value (the element, or the port's
// answer under `answer`), and `answer` stays on the outcome for one that does.

const camel = (name) => String(name).replace(/-([a-z0-9])/gu, (_, letter) => letter.toUpperCase());
const isPlain = (value) => value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;

export function outcomeOf(result, element) {
    if (result === undefined || result === null || result === true || result === element) return {outcome: "applied"};
    if (result === false) return {outcome: "refused", reason: "refused"};
    if (typeof result === "object" && typeof result.outcome === "string") return result;
    if (typeof result === "object" && typeof result.answer === "string") {
        const {answer, reason, message} = result;
        return {...result, outcome: answer, ...(reason ? {reason} : {}), ...(message ? {message} : {})};
    }
    return {outcome: "applied", value: result};
}

export function answerActions(Class, manifest) {
    const proto = Class.prototype;
    for (const [name, spec] of Object.entries(manifest.actions || {})) {
        const method = camel(name);
        const run = proto[method];
        if (typeof run !== "function" || run.sfAction) continue;
        const names = Object.keys(spec?.with || {});
        const wrapped = function manifestAction(...args) {
            // One object naming only declared parameters is the object form.
            if (args.length === 1 && isPlain(args[0])) {
                const given = Object.keys(args[0]);
                if (!names.length && !given.length) args = [];
                else if (names.length && given.length && given.every((key) => names.includes(key) || names.map(camel).includes(key))) {
                    args = names.map((key) => args[0][key] ?? args[0][camel(key)]);
                }
            }
            const result = run.apply(this, args);
            if (result && typeof result.then === "function") return result.then((value) => outcomeOf(value, this));
            return outcomeOf(result, this);
        };
        wrapped.sfAction = true;
        Object.defineProperty(proto, method, {configurable: true, writable: true, value: wrapped});
    }
    return Class;
}

// A setting the class reads through a getter of its own (an attribute read
// with its parsing) is writable as a property too, as §4 makes every setting:
// an assembly binds by property when the element has one (SF.Assembly's
// adaptElement), and a getter alone threw «has only a getter» at the first
// binding. The setter writes the attribute the getter reads.
export function settingSetters(Class, manifest) {
    const proto = Class.prototype;
    for (const [name, spec] of Object.entries(manifest.settings || {})) {
        if (["list", "object", "state"].includes(spec?.type)) continue;
        const property = camel(name);
        let owner = proto;
        let found = null;
        while (owner && owner !== globalThis.HTMLElement?.prototype && owner !== Object.prototype) {
            found = Object.getOwnPropertyDescriptor(owner, property);
            if (found) break;
            owner = Object.getPrototypeOf(owner);
        }
        if (!found || !found.get || found.set) continue;
        Object.defineProperty(owner, property, {
            configurable: true,
            get: found.get,
            set(value) {
                if (spec.type === "boolean") {
                    if (value === true || value === "" || value === "true") this.setAttribute(name, "");
                    else if (value === false && spec.default === true) this.setAttribute(name, "false");
                    else this.removeAttribute(name);
                } else if (value === null || value === undefined) {
                    this.removeAttribute(name);
                } else {
                    this.setAttribute(name, String(value));
                }
            },
        });
    }
    return Class;
}
