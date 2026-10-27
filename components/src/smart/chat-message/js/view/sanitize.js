// sf-chat-message's own copy of simai/ui-chat's sanitize.js (ui-chat 10d376b,
// components/src/component/chat/js/sanitize.js), unchanged but for this note:
// the fallback for SF.sanitizeHtml.
//
// The Framework has SF.sanitizeHtml(html, {elements?, codeLanguage?,
// document?}) -> DocumentFragment and SF.safeHref(value) since the pair
// ui-89834691fb9d (ui-source 4d711d2), made from this very file. ui-pro still
// pins ui-source 170d551 (ui-352b472995b1), which lacks them, so the message
// uses the Framework's when the page has it and this copy otherwise
// (js/view/message.js, sanitizer()). REMOVE this file, and the fallback, once
// framework.lock.json pins ui-89834691fb9d or later (component.json
// x-decisions, docs.md).
//
// The second line of defence for server HTML (Mirai24 HANDOFF §3.3, §5.2):
// Mirai24 already turns the model's markup into HTML and cleans it against
// the same list. This runs again in the browser because a server bug or a
// compromised answer must still not execute here: the result is built node by
// node from an allowlist, never by assigning a string to a live innerHTML.
// The rules:
//
//   - parsing happens in a <template>, which is inert: nothing runs, nothing
//     loads, no handler fires while the input is read;
//   - script, style, iframe, object, embed, svg, math, template (and the other
//     containers of code or foreign content below) are dropped with their
//     content; any other element off the list is unwrapped, its text kept;
//   - every attribute is dropped except href on <a> and colspan, rowspan and
//     scope on table cells (spans as numbers, scope from its four values);
//   - href is kept only for http, https, mailto, or a root-relative path,
//     judged after trimming and removing control characters; links always get
//     rel="noopener noreferrer nofollow" and target="_blank";
//   - no style, class, id, on* or data-* ever survives -- except, when a policy
//     asks for it, a single language-* class on <code> (for code highlighting).

export const DEFAULT_POLICY = Object.freeze({
  elements: Object.freeze([
    'p', 'br', 'strong', 'em', 'code', 'pre', 'ul', 'ol', 'li', 'blockquote', 'a',
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'h2', 'h3', 'h4', 'del',
  ]),
  // A <code class="language-js"> keeps that one class. Off by default.
  codeLanguage: false,
});

// Dropped together with everything inside: their content is not text meant
// for a reader.
const DROPPED = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'svg', 'math', 'template',
  'frame', 'frameset', 'applet', 'noscript', 'noembed', 'noframes', 'textarea',
  'select', 'option', 'button', 'input', 'form', 'head', 'title', 'meta', 'link',
  'base', 'img', 'video', 'audio', 'source', 'track', 'canvas', 'picture', 'xmp',
  'plaintext', 'portal', 'slot',
]);

const HTML_NS = 'http://www.w3.org/1999/xhtml';
const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);
const SCOPES = new Set(['row', 'col', 'rowgroup', 'colgroup']);
const LANGUAGE_CLASS = /^language-[a-z0-9+#-]{1,24}$/i;
// C0 controls, space, DEL and C1 controls: browsers ignore them inside a
// scheme («java\tscript:»), so the check ignores them too.
const CONTROLS = /[\u0000- \u007f-\u009f]/g;

/**
 * An href that is safe to keep, or null.
 * http, https and mailto URLs, and root-relative paths («/docs/a»).
 * @param {unknown} value
 * @returns {string|null}
 */
export function safeHref(value) {
  if (typeof value !== 'string') return null;
  const compact = value.trim().replace(CONTROLS, '');
  if (!compact) return null;
  // Root-relative, but not «//host» or «/\host», which leave the origin.
  if (compact.startsWith('/')) return /^\/[/\\]/.test(compact) ? null : value.trim();
  let url;
  try { url = new URL(compact); } catch { return null; }
  return SAFE_PROTOCOLS.has(url.protocol) ? url.href : null;
}

function copyChildren(from, to, documentRef, policy) {
  for (const child of from.childNodes) {
    const copied = copyNode(child, documentRef, policy);
    if (copied) to.append(copied);
  }
}

function unwrap(node, documentRef, policy) {
  const fragment = documentRef.createDocumentFragment();
  copyChildren(node, fragment, documentRef, policy);
  return fragment;
}

function copyNode(node, documentRef, policy) {
  if (node.nodeType === 3) return documentRef.createTextNode(node.data);
  if (node.nodeType !== 1) return null;
  const tag = node.localName;
  if (DROPPED.has(tag) || node.namespaceURI !== HTML_NS) return null;
  if (!policy.allowed.has(tag)) return unwrap(node, documentRef, policy);

  const element = documentRef.createElement(tag);
  if (tag === 'a') {
    const href = safeHref(node.getAttribute('href'));
    // A link that may not be followed is its text.
    if (!href) return unwrap(node, documentRef, policy);
    element.setAttribute('href', href);
    element.setAttribute('rel', 'noopener noreferrer nofollow');
    element.setAttribute('target', '_blank');
  }
  if (tag === 'th' || tag === 'td') {
    for (const name of ['colspan', 'rowspan']) {
      const raw = node.getAttribute(name);
      if (raw !== null && /^\d{1,2}$/.test(raw.trim())) {
        const span = Number(raw);
        if (span >= 1 && span <= 50) element.setAttribute(name, String(span));
      }
    }
    const scope = node.getAttribute('scope')?.trim().toLowerCase();
    if (scope && SCOPES.has(scope)) element.setAttribute('scope', scope);
  }
  if (tag === 'code' && policy.codeLanguage) {
    const language = [...node.classList].find((one) => LANGUAGE_CLASS.test(one));
    if (language) element.className = language;
  }
  copyChildren(node, element, documentRef, policy);
  return element;
}

/**
 * Clean untrusted HTML into a DocumentFragment.
 * @param {string|null|undefined} html
 * @param {{elements?: string[], codeLanguage?: boolean, document?: Document}} [policy]
 *        which elements to keep (default DEFAULT_POLICY.elements, never more
 *        than the attribute rules above allow), whether <code> keeps its
 *        language-* class, and the document the result belongs to.
 * @returns {DocumentFragment}
 */
export function sanitizeHtml(html, policy = {}) {
  const documentRef = policy.document ?? globalThis.document;
  const rules = {
    allowed: new Set((policy.elements ?? DEFAULT_POLICY.elements).map((one) => String(one).toLowerCase())),
    codeLanguage: policy.codeLanguage ?? DEFAULT_POLICY.codeLanguage,
  };
  for (const tag of DROPPED) rules.allowed.delete(tag);
  const fragment = documentRef.createDocumentFragment();
  if (typeof html !== 'string' || html === '') return fragment;
  const template = documentRef.createElement('template');
  template.innerHTML = html;
  copyChildren(template.content, fragment, documentRef, rules);
  return fragment;
}
