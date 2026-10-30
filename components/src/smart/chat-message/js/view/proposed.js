// The fields proposed to Mirai24 as API.md v1.3 (2026-10-30), read in one
// place. Mirai24 has accepted the names, all optional; until the version is
// published they may still change, so nothing else in the chat reads them
// raw: the message view, the window's toView and its preview panel ask here.
//
//   message.steps        [{code, label, state: running|done|failed, started_at, finished_at}]
//   sources[].preview_url  a same-origin address of the source's text (text/html)
//   sources[].locator      {from, to} characters of that text (line_from, line_to aside)
//   sources[].mime         the preview's type
//   message.attachments  an answer's files: [{id, name, bytes, mime, href, preview_url}]
//
// Without them a message draws as before: each reader answers null or [].
// A plain module with no imports, so the window and the site widget read the
// same table.

/** The message fields a window passes through to the view as they come. */
export const PROPOSED_MESSAGE_FIELDS = ['steps'];

export const STEP_STATES = ['running', 'done', 'failed'];

const line = (value) => (typeof value === 'string' ? value.trim() : '');

/** A time in milliseconds, or null for what is not a time. */
export function timeOf(value) {
  if (value == null || value === '') return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

/**
 * An address on the page's own origin, or null: root-relative («/x», not
 * «//host», kept as given), or absolute with the page's origin over
 * http(s). Only such an address is ever loaded into a preview or offered
 * for download.
 */
export function sameOriginHref(value, documentRef = globalThis.document) {
  if (typeof value !== 'string') return null;
  const compact = value.trim();
  if (!compact || /[\u0000-\u001f\u007f]/u.test(compact)) return null;
  if (compact.startsWith('/') && /^\/[/\\]/u.test(compact)) return null;
  const base = documentRef?.baseURI || documentRef?.defaultView?.location?.href;
  const origin = documentRef?.defaultView?.location?.origin;
  if (!base || !origin || origin === 'null') return null;
  let url;
  try { url = new URL(compact, base); } catch { return null; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.origin !== origin) return null;
  // A root-relative address is kept as given: the same on every origin.
  return compact.startsWith('/') ? compact : url.href;
}

/** The steps of an answer as they can be drawn, in their order; [] without them. */
export function stepsOf(message) {
  const list = Array.isArray(message?.steps) ? message.steps : [];
  return list
    .filter((one) => one && typeof one === 'object' && line(one.label))
    .map((one, index) => ({
      code: line(one.code) || String(index),
      label: line(one.label),
      state: STEP_STATES.includes(one.state) ? one.state : 'done',
      started: timeOf(one.started_at),
      finished: timeOf(one.finished_at),
    }));
}

/**
 * Where a source's preview is, or null: its same-origin preview_url, what
 * part of its text the answer leans on ({from, to} characters, when both are
 * whole numbers and from < to; a PDF's {page}), and its type.
 */
export function previewOf(source, documentRef) {
  if (!source || typeof source !== 'object') return null;
  const url = sameOriginHref(source.preview_url, documentRef);
  if (!url) return null;
  const at = source.locator && typeof source.locator === 'object' ? source.locator : {};
  const locator = {};
  if (Number.isInteger(at.from) && Number.isInteger(at.to) && at.from >= 0 && at.to > at.from) Object.assign(locator, {from: at.from, to: at.to});
  if (Number.isInteger(at.page) && at.page > 0) locator.page = at.page;
  return {url, locator: Object.keys(locator).length ? locator : null, mime: line(source.mime).toLowerCase()};
}

/**
 * What a preview panel shows of a source or a file: {n?, title, kind,
 * preview_url, locator, mime, href?}. The source's own fields, cleaned, so
 * the event that asks for it carries data, never a node.
 */
export function previewTarget(item, {n = null, kind = '', title = '', href = null} = {}, documentRef) {
  const preview = previewOf(item, documentRef);
  if (!preview) return null;
  return {
    ...(n == null ? {} : {n}),
    title: line(title) || line(item.title) || line(item.name),
    kind: kind || line(item.kind),
    preview_url: preview.url,
    locator: preview.locator,
    mime: preview.mime,
    ...(href ? {href} : {}),
  };
}

/** An answer's files (the deliverables), as they can be drawn; [] without them. */
export function deliverablesOf(message, documentRef) {
  const list = Array.isArray(message?.attachments) ? message.attachments : [];
  return list
    .filter((one) => one && typeof one === 'object' && line(one.name))
    .map((one, index) => ({
      id: one.id ?? `file-${index}`,
      name: line(one.name),
      bytes: Number.isFinite(Number(one.bytes)) && one.bytes !== null && one.bytes !== '' ? Number(one.bytes) : null,
      mime: line(one.mime).toLowerCase(),
      href: sameOriginHref(one.href, documentRef),
      preview: previewTarget(one, {kind: 'file', title: one.name, href: sameOriginHref(one.href, documentRef)}, documentRef),
    }));
}
