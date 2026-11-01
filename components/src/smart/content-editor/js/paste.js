// A paste becomes blocks through the html@1 subset (composition/html-subset in
// ui-source), the one rule sf-rich-text and content.html clean by: a word
// processor's or a site's markup keeps its paragraphs, headings, lists, quotes,
// bold, italic and safe links, and loses its styles. Plain text is read the
// same way, a blank line between paragraphs. Nothing here makes content.html.
import {cleanTree, parseHtml, richTextFromPlainText, treeFromDom} from "../../../core/js/composition/html-subset.mjs";
import {normalizeInline} from "../../../core/js/composition/inline-model.mjs";

const HEADINGS = {h2: 2, h3: 3, h4: 4};

function inline(leaves) {
    const out = [];
    for (const leaf of leaves) {
        const marks = [leaf.strong && "strong", leaf.em && "em"].filter(Boolean);
        const value = leaf.kind === "br" ? " " : leaf.value;
        const run = marks.length ? {type: "text", value, marks} : {type: "text", value};
        const last = out.at(-1);
        if (leaf.href && last?.type === "link" && last.href === leaf.href) last.children.push(run);
        else out.push(leaf.href ? {type: "link", href: leaf.href, children: [run]} : run);
    }
    return normalizeInline(out);
}

function list(block, next) {
    return {
        id: next(),
        type: "content.list",
        ...(block.type === "ol" ? {props: {ordered: true}} : {}),
        slots: {
            items: block.items.map((item) => {
                const words = item.children.filter((part) => part.type === "inline").flatMap((part, index) => [...(index ? [{kind: "text", value: " "}] : []), ...part.leaves]);
                const nested = item.children.filter((part) => part.type !== "inline").map((part) => list(part, next));
                return {id: next(), type: "content.list-item", data: {content: inline(words)}, ...(nested.length ? {slots: {default: nested}} : {})};
            }),
        },
    };
}

function nodes(blocks, next) {
    return blocks.map((block) => {
        if (block.type === "blockquote") {
            const inner = nodes(block.blocks, next);
            return {id: next(), type: "content.quote", slots: {default: inner.length ? inner : [{id: next(), type: "content.paragraph", data: {content: []}}]}};
        }
        if (block.type === "ul" || block.type === "ol") return list(block, next);
        if (HEADINGS[block.type]) return {id: next(), type: "content.heading", data: {level: HEADINGS[block.type], content: inline(block.leaves)}};
        return {id: next(), type: "content.paragraph", data: {content: inline(block.leaves)}};
    });
}

/**
 * What a clipboard holds, as Composition nodes: its HTML if it has any, else
 * its text. `next` makes the ids.
 */
export function nodesFromClipboard(data, next, documentRef = globalThis.document) {
    const html = data?.getData?.("text/html") ?? "";
    const text = data?.getData?.("text/plain") ?? "";
    let tree;
    if (html && documentRef?.createElement) {
        // Parsed by the browser in an inert template, never in a live element.
        const template = documentRef.createElement("template");
        template.innerHTML = html;
        tree = treeFromDom(template.content);
    } else {
        tree = parseHtml(html || richTextFromPlainText(text));
    }
    return nodes(cleanTree(tree, {mode: "value"}), next);
}

/** The words of a plain paste, one line: what a table cell or a caption takes. */
export const lineOf = (data) => String(data?.getData?.("text/plain") ?? "").replace(/\s+/gu, " ").trim();
