// The Framework's sf-pagination, loaded in node for behaviour checks.
//
// The pagination's source (src/smart/pagination/index.js and its default
// template, from the ui-source revision the overlay pins) is imported with its
// imports replaced: the element base is a small attribute store that records
// the events it is asked to send, and lit's html is a tag that keeps the
// template as a tree of strings and values. What is checked is what the
// pagination's own getters, actions and template do with an answer from a
// host, not how their source happens to be spelled.
import {Buffer} from 'node:buffer';
import {readFile} from 'node:fs/promises';
import {URL} from 'node:url';

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const asModule = (source) => import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const IMPORTS = /^import\s[\s\S]*?\sfrom\s+"[^"]+";\n/gmu;

function stripImports(source, expected, file) {
  const found = source.match(IMPORTS) ?? [];
  if (found.length !== expected) {
    throw new Error(`${file}: expected ${expected} import statements to replace, found ${found.length}`);
  }
  return source.replace(IMPORTS, '');
}

const kebab = (name) => String(name).replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`);

const BASE = `
const toAttributeName = (name) => String(name).replace(/[A-Z]/gu, (letter) => \`-\${letter.toLowerCase()}\`);
class SfBaseElement {}
class FakeElement {
  static get props() { return {}; }
  static define() {}
  constructor(attributes = {}) {
    this.attributes = new Map(Object.entries(attributes).map(([name, value]) => [name, String(value)]));
    this.events = [];
  }
  hasAttribute(name) { return this.attributes.has(name); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  attributeName(name) { return name; }
  getBooleanAttr(name, fallback = false) {
    if (!this.hasAttribute(name)) return fallback;
    const value = this.getAttribute(name);
    if (value === '' || value === 'true') return true;
    if (value === 'false') return false;
    return fallback;
  }
  getNumberAttr(name, fallback = 0) {
    if (!this.hasAttribute(name) || this.getAttribute(name) === '') return fallback;
    const value = Number(this.getAttribute(name));
    return Number.isFinite(value) ? value : fallback;
  }
  setState(state) {
    for (const [key, value] of Object.entries(state)) {
      const attr = toAttributeName(key);
      if (value === false || value === null || value === undefined) this.attributes.delete(attr);
      else if (value === true) this.attributes.set(attr, '');
      else this.attributes.set(attr, String(value));
    }
  }
  sfEmit(name, detail) { this.events.push({name, detail}); }
  sfWord(key) { return '{' + key + '}'; }
  // The settings the template reads from the element's props (smart-base).
  getPropsContext() { return {size: this.getAttribute('size') || '1', top: this.top, middle: this.middle, bottom: this.bottom}; }
  createTemplateContext(context) { return context; }
  getRootClass() { return ''; }
  querySelector() { return null; }
  addEventListener() {}
}
const elementFromManifest = () => FakeElement;
const renderPaginationTemplate = () => null;
`;

let loaded;

/** The pagination class and its template renderer, from the overlay's sources. */
export async function loadPagination() {
  loaded ??= (async () => {
    const [index, template, manifest] = await Promise.all([
      read('src/smart/pagination/index.js'),
      read('src/smart/pagination/js/templates/default.js'),
      read('src/smart/pagination/component.json'),
    ]);
    const element = stripImports(index, 7, 'src/smart/pagination/index.js')
      .replace(/^SfPagination\.define\("sf-pagination"\);$/mu, 'export default SfPagination;');
    if (!/export default SfPagination;/u.test(element)) {
      throw new Error('src/smart/pagination/index.js: SfPagination.define("sf-pagination") not found');
    }
    const {default: SfPagination} = await asModule(
      `${BASE}\nconst manifest = ${manifest};\nconst aliases = {};\nconst en = {};\nconst ru = {};\n${element}`,
    );
    const {renderPaginationTemplate} = await asModule(
      `const html = (strings, ...values) => ({strings, values});\nconst nothing = undefined;\n${stripImports(template, 1, 'src/smart/pagination/js/templates/default.js')}`,
    );
    return {SfPagination, renderPaginationTemplate};
  })();
  return loaded;
}

/**
 * A pagination with these settings, written as a host writes them: attribute
 * names, string values; true becomes the bare attribute and false the word
 * "false" (sf-data-view writes count-known and total-exact off that way).
 */
export async function pagination(settings = {}) {
  const {SfPagination} = await loadPagination();
  const attributes = {};
  for (const [name, value] of Object.entries(settings)) {
    attributes[kebab(name)] = value === true ? '' : String(value);
  }
  return new SfPagination(attributes);
}

/**
 * The template rendered for an element: its markup as text (bindings in
 * place, a function as `[fn N]`) and the functions by N, so a test can press
 * what a person would press.
 */
export async function render(element) {
  const {renderPaginationTemplate} = await loadPagination();
  const handlers = [];
  const text = (node) => {
    if (node === undefined || node === null || node === false) return '';
    if (Array.isArray(node)) return node.map(text).join('');
    if (typeof node === 'function') {
      handlers.push(node);
      return `[fn ${handlers.length - 1}]`;
    }
    if (typeof node === 'object' && Array.isArray(node.strings)) {
      return node.strings.reduce((out, part, index) => out + part + (index < node.values.length ? text(node.values[index]) : ''), '');
    }
    if (typeof node === 'object') return JSON.stringify(node);
    return String(node);
  };
  const markup = text(renderPaginationTemplate(element.templateContext())).replace(/<!--[\s\S]*?-->/gu, '');
  return {
    markup,
    handlers,
    /** Presses the @click of the first element whose markup matches. */
    press(selector) {
      const at = markup.search(selector);
      if (at < 0) throw new Error(`nothing matches ${selector}`);
      // The element's own opening tag: from the match to its closing `>`.
      const tag = markup.slice(at, markup.indexOf('>', at) + 1);
      const click = /@click=\[fn (\d+)\]/u.exec(tag);
      if (!click) throw new Error(`no @click on the element matching ${selector}`);
      return handlers[Number(click[1])]();
    },
  };
}
