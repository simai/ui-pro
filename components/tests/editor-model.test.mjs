// sf-editor's model (src/smart/editor/js/model.mjs, catalogue.mjs): the one
// block editor of the owner's decision of 2026-11-03 (ui-control
// control/ui-editor/UNIFIED-BLOCK-EDITOR.md; Part B of ONE-EDITOR-ASSIGNMENT).
// Selection by depth, one history for typing and structure, insert, move,
// split into columns, the parameter origin, data bindings, rights and the
// template, site blocks, and the three outputs. Runs in the overlay, against
// the Part A contracts of the pinned ui-source.
import assert from "node:assert/strict";
import test from "node:test";
import Composition from "../src/core/js/composition/index.mjs";
import {EditorModel, VARIANT_EXTENSION, inlineToMarkdown, refusedClasses} from "../src/smart/editor/js/model.mjs";
import {catalogueAt, itemKey, pick, pushRecent, searchItems, sectionForPlace, sectionsOf, skeletonOf, tabForPlace, toggleFavourite} from "../src/smart/editor/js/catalogue.mjs";
import cardsType from "../src/core/kits/block/sample-cards/type.json" with {type: "json"};
import cardsEditor from "../src/core/kits/block/sample-cards/editor.json" with {type: "json"};
import renderCards from "../src/core/kits/block/sample-cards/renderer.mjs";

const t = (value) => [{type: "text", value}];
const DOC = {schema: "simai.composition.document", schema_version: 1};

function page() {
    return {
        ...DOC, id: "home", profile: "ui-layout", locale: "en",
        root: {id: "regs", type: "layout.regions", slots: {regions: [
            {id: "hd", type: "layout.region", props: {name: "header", landmark: "banner"}, slots: {default: [{id: "logo", type: "content.paragraph", data: {content: t("Site")}}]}},
            {id: "mn", type: "layout.region", props: {name: "main", landmark: "main"}, slots: {default: [
                {id: "s1", type: "layout.section", props: {width: "normal"}, slots: {default: [
                    {id: "a1", type: "layout.area", slots: {default: [
                        {id: "h1", type: "content.heading", data: {level: 1, content: t("Title")}},
                        {id: "p1", type: "content.paragraph", data: {content: t("Hello world")}},
                        {id: "p2", type: "content.paragraph", data: {content: t("Second")}},
                    ]}},
                ]}},
                {id: "s2", type: "layout.section", slots: {default: [
                    {id: "cards", type: "sample.cards", props: {cols: {xs: 1, md: 2}}},
                ]}},
            ]}},
            {id: "ft", type: "layout.region", props: {name: "footer", landmark: "contentinfo"}, slots: {default: [{id: "copy", type: "content.paragraph", data: {content: t("(c)")}}]}},
        ]}},
    };
}

const editor = (options = {}) => {
    let clock = 1000;
    const model = new EditorModel({document: page(), types: [cardsType], editorManifests: [cardsEditor], renderers: {"sample.cards": renderCards}, now: () => clock, ...options});
    model.tick = (ms) => { clock += ms; };
    return model;
};
const ids = (list) => list.map((node) => node.id);
const valid = (model) => assert.deepEqual(model.validate().diagnostics, []);

test("the page from the tests is a valid Document", () => {
    valid(editor());
});

test("selection by depth: Enter goes down, Esc goes up, text to block to container to section", () => {
    const model = editor();
    assert.equal(model.down().id, "logo");
    model.select("p1");
    assert.deepEqual(ids(model.pathOf("p1")), ["s1", "a1", "p1"]);
    assert.equal(model.down().typing, true);
    assert.deepEqual(model.typing, {id: "p1", key: "content"});
    assert.equal(model.up().id, "p1");
    assert.equal(model.typing, null);
    assert.equal(model.up().id, "a1");
    assert.equal(model.up().id, "s1");
    assert.equal(model.up().id, null);
    model.select("s1");
    assert.equal(model.down().id, "a1");
    assert.equal(model.down().id, "h1");
});

test("one history: a run of typing is one step, structure is one step each, and undo returns both", () => {
    const model = editor();
    model.startTyping("p1");
    model.setText("p1", "content", t("Hello world!"));
    model.tick(100);
    model.setText("p1", "content", t("Hello world!!"));
    assert.equal(model.undoStack.length, 1, "letters typed in one run are one step");
    model.tick(5000);
    model.setText("p1", "content", t("Hello world!!!"));
    assert.equal(model.undoStack.length, 2, "a pause starts a new step");
    model.insert({type: "content.paragraph"}, model.placeAfter("p1"));
    assert.equal(model.undoStack.length, 3);
    model.undo();
    assert.equal(model.node("p1").data.content[0].value, "Hello world!!!");
    assert.equal(model.node("a1").slots.default.length, 3);
    model.undo();
    model.undo();
    assert.equal(model.node("p1").data.content[0].value, "Hello world");
    model.redo();
    assert.equal(model.node("p1").data.content[0].value, "Hello world!!");
    assert.equal(model.canRedo, true);
});

test("Enter splits a paragraph at the caret, Backspace at its start joins it back, in one history", () => {
    const model = editor();
    const split = model.splitText("p1", 5);
    assert.equal(split.ok, true);
    assert.equal(model.node("p1").data.content[0].value, "Hello");
    assert.equal(model.node(split.id).data.content[0].value, " world");
    assert.deepEqual(model.typing, {id: split.id, key: "content"});
    const joined = model.joinBack(split.id);
    assert.deepEqual({id: joined.id, offset: joined.offset}, {id: "p1", offset: 5});
    assert.equal(model.node("p1").data.content[0].value, "Hello world");
    model.undo();
    model.undo();
    assert.equal(model.node("a1").slots.default.length, 3);
    valid(model);
});

test("Markdown habits at a paragraph's start turn it into a block; one undo returns the paragraph", () => {
    const model = editor();
    model.setText("p2", "content", t("- first"));
    const made = model.markdownShortcut("p2");
    assert.equal(made.ok, true);
    assert.equal(model.node("p2").type, "content.list");
    assert.equal(model.node(made.id).data.content[0].value, "first");
    model.undo();
    assert.equal(model.node("p2").type, "content.paragraph");
    model.setText("p2", "content", t("## Part"));
    model.markdownShortcut("p2");
    assert.equal(model.node("p2").data.level, 2);
    model.setText("p1", "content", t("1. one"));
    model.markdownShortcut("p1");
    assert.equal(model.node("p1").props.ordered, true);
    valid(model);
});

test("Enter on an empty last list item leaves the list", () => {
    const model = editor();
    model.setText("p2", "content", t("- a"));
    const made = model.markdownShortcut("p2");
    const second = model.splitText(made.id, 1);
    const left = model.splitText(second.id, 0);
    assert.equal(left.ok, true);
    assert.equal(model.node(left.id).type, "content.paragraph");
    assert.equal(model.node("p2").slots.items.length, 1);
    valid(model);
});

test("insert three ways reads one place rule: after a block, from / in an empty line, and the default place", () => {
    const model = editor();
    const after = model.insert({type: "content.quote"}, model.placeAfter("h1"));
    assert.equal(after.ok, true);
    assert.equal(model.node("a1").slots.default[1].id, after.id);
    assert.equal(model.typing.key, "content", "the caret goes into the new block's text");
    model.setText("p2", "content", t("/quo"));
    const slashed = model.insertFromSlash({type: "content.divider"}, "p2");
    assert.equal(slashed.ok, true);
    assert.equal(model.node("p2"), null, "the slash line is replaced");
    assert.equal(model.node(slashed.id).type, "content.divider");
    const refused = model.insert({type: "layout.section"}, model.placeAfter("p1"));
    assert.deepEqual(refused, {ok: false, reason: "place"}, "a text area takes no section");
    model.select("s2");
    const section = model.insert({type: "layout.section"});
    assert.equal(model.place(section.id).parent.id, "mn");
    valid(model);
});

test("a variant is inserted with its tree, new ids, and is remembered for the parameter origin", () => {
    const model = editor();
    const made = model.insert({type: "sample.cards", variant: "three-columns"}, model.placeInside("s2"));
    const node = model.node(made.id);
    assert.deepEqual(node.extensions[VARIANT_EXTENSION], {id: "three-columns"});
    assert.notEqual(node.slots.intro[0].id, "title");
    const cols = model.fields(made.id, "lg").find((field) => field.key === "cols");
    assert.equal(cols.origin, "variant");
    assert.equal(cols.value, 3);
    valid(model);
});

test("move: by drop line, by Alt+arrows, and nothing moves into itself", () => {
    const model = editor();
    assert.equal(model.moveBy("p2", -1).ok, true);
    assert.deepEqual(ids(model.node("a1").slots.default), ["h1", "p2", "p1"]);
    assert.equal(model.moveBy("h1", -1).reason, "edge");
    assert.equal(model.move("p1", {parent: "a1", slot: "default", index: 0}).ok, true);
    assert.deepEqual(ids(model.node("a1").slots.default), ["p1", "h1", "p2"]);
    assert.equal(model.move("s1", {parent: "a1", slot: "default", index: 0}).reason, "inside-itself");
    assert.equal(model.move("s2", {parent: "mn", slot: "default", index: 0}).ok, true);
    assert.deepEqual(ids(model.node("mn").slots.default), ["s2", "s1"]);
    model.startTyping("p2");
    model.moveBy("p2", -1);
    assert.deepEqual(model.typing, {id: "p2", key: "content"}, "Alt+Shift+arrows keep typing");
    valid(model);
});

test("split into columns from the menu: the block goes left, the right column is empty, one undo", () => {
    const model = editor();
    const split = model.splitColumns("p1");
    assert.equal(split.ok, true);
    const section = model.node("s1").slots.default;
    assert.deepEqual(section.map((node) => node.type), ["layout.area", "layout.columns", "layout.area"]);
    const columns = model.node(split.id);
    assert.deepEqual(columns.props.columns, {xs: 1, md: 2});
    assert.equal(columns.slots.columns[0].slots.default[0].id, "p1");
    assert.equal(columns.slots.columns[1].slots.default[0].type, "content.paragraph");
    valid(model);
    const html = Composition.render(model.toJSON(), {registry: model.registry});
    return html.then((result) => {
        // The Framework prints the base (grid-col-1) once a wider screen differs (G-36).
        assert.match(result.html, /class="sf-composition-columns grid gap-4 grid-col-1 md:grid-col-2"/u);
        model.undo();
        assert.deepEqual(ids(model.node("a1").slots.default), ["h1", "p1", "p2"]);
    });
});

test("a side drop adds a column beside a column, up to four, and splits elsewhere", () => {
    const model = editor();
    const split = model.dropBeside("p2", "h1", "left");
    assert.equal(split.ok, true);
    const columns = model.node(split.id);
    assert.equal(columns.slots.columns[0].slots.default[0].id, "p2");
    assert.equal(model.undoStack.length, 1, "the drop and the split are one step");
    const added = model.dropBeside("p1", "h1", "right");
    assert.equal(added.ok, true);
    assert.equal(model.node(split.id).slots.columns.length, 3);
    assert.deepEqual(model.node(split.id).props.columns, {xs: 1, md: 3});
    model.addColumn(split.id);
    assert.equal(model.addColumn(split.id).reason, "limit");
    valid(model);
    model.undo();
    model.undo();
    model.undo();
    assert.deepEqual(ids(model.node("a1").slots.default), ["h1", "p1", "p2"]);
});

test("parameters: origin type -> theme -> variant -> block -> screen, written mobile first, reset to inherited", () => {
    const model = editor({theme: {name: "compact", defaults: {"layout.section": {padding_y: 2}}}});
    let field = model.fields("s1", "xs").find((entry) => entry.key === "padding_y");
    assert.deepEqual([field.origin, field.value], ["theme", 2]);
    field = model.fields("s1", "xs").find((entry) => entry.key === "width");
    assert.deepEqual([field.origin, field.value], ["block", "normal"]);
    // The type's effective value: layout.section's parameter_defaults (width normal), not the schema's bare default.
    field = model.fields("s2", "xs").find((entry) => entry.key === "width");
    assert.deepEqual([field.origin, field.value], ["type", "normal"]);
    model.setParam("s1", "padding_y", 6, "lg");
    assert.deepEqual(model.node("s1").props.padding_y, {lg: 6}, "the phone keeps the theme");
    model.setParam("s1", "padding_y", 4, "xs");
    assert.deepEqual(model.node("s1").props.padding_y, {xs: 4, md: 2, lg: 6}, "the phone's value is the phone's only: the tablet keeps the theme's 2");
    field = model.fields("s1", "md").find((entry) => entry.key === "padding_y");
    assert.deepEqual([field.origin, field.value], ["screen", 2]);
    field = model.fields("s1", "lg").find((entry) => entry.key === "padding_y");
    assert.equal(field.origin, "screen");
    model.setParam("s1", "padding_y", 4, "md");
    assert.deepEqual(model.node("s1").props.padding_y, {xs: 4, lg: 6}, "a value equal to the narrower one is not written");
    field = model.fields("s1", "md").find((entry) => entry.key === "padding_y");
    assert.deepEqual([field.origin, field.value, field.screens], ["block", 4, ["lg"]]);
    model.setParam("s1", "padding_y", 4, "lg");
    assert.equal(model.node("s1").props.padding_y, 4, "one value on every screen is a plain value");
    model.setParam("s1", "padding_y", 2, "xs");
    assert.deepEqual(model.node("s1").props.padding_y, {xs: 2, md: 4}, "the theme's value on the phone keeps the wider screens' 4");
    model.setParam("s1", "padding_y", 2, "md");
    assert.deepEqual(model.node("s1").props.padding_y, {xs: 2, lg: 4}, "the tablet's value is the tablet's only");
    model.setParam("s1", "padding_y", 2, "lg");
    assert.equal(model.node("s1").props.padding_y, undefined, "a value equal to the theme on every screen is not written");
    model.setParam("s1", "width", "wide");
    model.resetParam("s1", "width");
    assert.equal(model.node("s1").props?.width, undefined);
    assert.equal(model.setParam("s1", "width", "huge").reason, "invalid");
    valid(model);
});

test("G-22: a phone value equal to the type's default is the phone's own; the wider screens keep theirs", async () => {
    const model = editor();
    const gap = (screen) => model.fields("cards", screen).find((entry) => entry.key === "gap");
    model.node("cards").props.gap = 5; // a block with gap 5 on every screen
    assert.deepEqual([gap("xs").origin, gap("lg").value], ["block", 5]);
    model.setParam("cards", "gap", 3, "xs");
    assert.deepEqual(model.node("cards").props.gap, {xs: 3, md: 5}, "the phone's 3 (the default) does not clear the desktop's 5");
    assert.deepEqual([gap("xs").origin, gap("xs").value], ["screen", 3]);
    assert.deepEqual([gap("lg").origin, gap("lg").value], ["screen", 5]);
    const {html} = await model.toHTML({resolveBinding: async () => Composition.demoData("cards")});
    assert.match(html, /md:gap-5/u);
    assert.doesNotMatch(html, /lg:gap/u);
    model.setParam("cards", "gap", 5, "xs");
    assert.equal(model.node("cards").props.gap, 5, "the same value on every screen is one plain value again");
    model.setParam("cards", "gap", 3, "lg");
    assert.deepEqual(model.node("cards").props.gap, {xs: 5, lg: 3}, "the desktop's value is the desktop's only");
    valid(model);
});

test("G-36: a phone value equal to the type's default is printed when a wider screen differs, mobile first", async () => {
    const model = editor();
    const split = model.splitColumns("p1");
    assert.deepEqual(model.node(split.id).props.columns, {xs: 1, md: 2});
    const classes = async () => {
        const {html} = await model.toHTML();
        return html.match(new RegExp(`class="([^"]*)" data-sf-composition-id="${split.id}"`, "u"))?.[1] ?? null;
    };
    assert.equal(await classes(), "sf-composition-columns grid gap-4 grid-col-1 md:grid-col-2", "the phone's grid-col-1 is printed, not the grid's implicit auto column");
    model.node(split.id).props.columns = {md: 3};
    assert.equal(await classes(), "sf-composition-columns grid gap-4 grid-col-1 md:grid-col-3", "a phone value left to the type's default is printed too");
    model.node(split.id).props.columns = 1;
    assert.equal(await classes(), "sf-composition-columns grid gap-4", "the default on every screen prints nothing");
    model.node(split.id).props.columns = {xs: 2, md: 2};
    assert.equal(await classes(), "sf-composition-columns grid gap-4 grid-col-2");
    // The canvas draws the phone as the site prints it.
    model.node(split.id).props.columns = {xs: 1, md: 2};
    const phone = model.canvasDocument("xs").document;
    const drawn = (await Composition.render(phone, {registry: model.canvasRegistry})).html;
    assert.match(drawn, new RegExp(`class="sf-composition-columns grid gap-4 grid-col-1" data-sf-composition-id="${split.id}"`, "u"));
    // The Document is not changed by printing it.
    assert.deepEqual(model.node(split.id).props.columns, {xs: 1, md: 2});
    valid(model);
});

test("G-38: a site block made of a section keeps the section, its parameters exposable", () => {
    const model = editor();
    const builder = model.startBuilder({from: "s1"}).builder;
    assert.equal(builder.root.type, "layout.section");
    assert.ok(model.exposable(builder).some((entry) => entry.path === "s1" && entry.target === "props.background"));
    const saved = model.saveBuilder({...builder, exposed: [{key: "background", path: "s1", target: "props.background"}]}, {name: "Hero"});
    assert.equal(saved.ok, true, JSON.stringify(saved.diagnostics));
    assert.equal(saved.manifest.composed.root.type, "layout.section");
    assert.deepEqual(Object.keys(saved.manifest.props_schema.properties), ["background"]);
});

test("the per-screen switch: columns 3/2/1 print grid-col-1 md:grid-col-2 lg:grid-col-3", async () => {
    const model = editor();
    model.setParam("cards", "cols", 3, "lg");
    model.setParam("cards", "cols", 2, "md");
    model.setParam("cards", "cols", 1, "xs");
    assert.deepEqual(model.node("cards").props.cols, {xs: 1, md: 2, lg: 3});
    const {html} = await model.toHTML({resolveBinding: async () => Composition.demoData("cards")});
    assert.match(html, /grid-col-1 md:grid-col-2 lg:grid-col-3/u);
    const canvas = model.canvasDocument("md").document;
    const flat = JSON.stringify(canvas);
    assert.match(flat, /"cols":2/u, "the canvas draws the tablet's value");
});

test("own modifiers: kept as values, unknown classes dropped from the HTML and reported", async () => {
    const model = editor();
    const rules = [/^p-x-\d$/u, /^md:p-x-\d$/u];
    const result = model.setModifiers("p1", "md:p-x-3 fancy", rules);
    assert.deepEqual(result.dropped.map((item) => item.class), ["fancy"]);
    assert.deepEqual(model.modifiersOf("p1"), ["md:p-x-3", "fancy"]);
    const {html, notices} = await model.toHTML({utilityRules: rules});
    assert.match(html, /<p class="md:p-x-3" data-sf-composition-id="p1">/u);
    assert.ok(notices.some((notice) => notice.code === "modifier_unknown"));
});

test("rights: an author writes only in text areas; the layout is locked with its reason; no role switch", () => {
    const model = editor({rights: {layout: false, template: false}});
    assert.equal(model.lockOf("s1"), "layout");
    assert.equal(model.lockOf("a1"), "layout");
    assert.equal(model.lockOf("p1"), null);
    assert.equal(model.lockOf("logo"), "template");
    assert.equal(model.insert({type: "content.paragraph"}, model.placeAfter("p1")).ok, true);
    assert.equal(model.insert({type: "layout.section"}, model.placeInside("mn")).reason, "layout");
    assert.equal(model.remove("s1").reason, "layout");
    assert.equal(model.setParam("s1", "width", "wide").reason, "layout");
    assert.equal(model.splitColumns("p1").reason, "layout");
    assert.equal(model.editTemplate(true).reason, "rights");
    assert.equal(model.startBuilder({from: "s1"}).reason, "rights");
    assert.equal(model.setText("logo", "content", t("x")).reason, "template");
});

test("the site template is a separate, explicit edit; the page is locked meanwhile", () => {
    const model = editor();
    assert.equal(model.lockOf("logo"), "template");
    assert.equal(model.lockOf("p1"), null);
    const events = [];
    model.subscribe((event) => events.push(event));
    assert.equal(model.editTemplate(true).ok, true);
    assert.equal(model.lockOf("logo"), null);
    assert.equal(model.lockOf("p1"), "page");
    model.setText("logo", "content", t("New site"));
    assert.equal(events.at(-1).scope, "template");
    model.editTemplate(false);
    assert.equal(model.lockOf("logo"), "template");
});

test("data: a source through the host's binding, the mapping and empty text, a runtime link in the same section", async () => {
    const pager = {
        schema: "simai.composition.type-manifest", schema_version: 1, type: "sample.pager", version: "1.0.0", category: "content", mode: "leaf",
        profiles: ["ui-layout", "structured-content"], data_schema: {type: "object", additionalProperties: false, properties: {}},
        props_schema: {type: "object", additionalProperties: false, properties: {}}, presentation: {views: ["default"], presets: [], modifiers: []},
        slots: {}, renderer: {kind: "registered", name: "sample.pager"}, assets: [], capabilities: ["html"],
        runtime: {accepts: {pagination: {shape: "pagination"}}},
    };
    const model = editor({types: [cardsType, pager], renderers: {"sample.cards": renderCards, "sample.pager": ({node, resolvedBindings}) => `<nav data-sf-composition-id="${node.id}">${resolvedBindings.pagination?.page ?? "-"}</nav>`}});
    const data = model.dataOf("cards");
    assert.deepEqual(data.bindings.map((entry) => [entry.target, entry.shape]), [["items", "cards"]]);
    model.setSource("cards", "items", "news");
    model.setSettings("cards", "items", {mapping: {image: "PREVIEW_PICTURE"}, limit: 6, empty_text: "No news"});
    const placed = model.insert({type: "sample.pager"}, model.placeAfter("cards"));
    const offered = model.dataOf(placed.id).runtime[0].publishers;
    assert.deepEqual(offered, [{id: "cards", type: "sample.cards", state: "pagination"}]);
    model.setRuntime(placed.id, "pagination", "cards", "pagination");
    valid(model);
    const answer = {items: [{title: "One"}], page: 2, pages: 5};
    const port = Composition.createSourcePort({sources: async () => [], fields: async () => [], preview: async () => answer});
    const {html} = await model.toHTML({resolveBinding: port.resolveBinding});
    assert.match(html, /<nav data-sf-composition-id="[^"]+">2<\/nav>/u);
    const empty = await model.toHTML({resolveBinding: async () => ({items: []})});
    assert.match(empty.html, /No news/u);
    model.setSource("cards", "items", "");
    assert.equal(model.node("cards").extensions, undefined, "no source, no settings");
});

test("the catalogue: tab by place, hidden what the place cannot take, search in both languages, favourites and recent", () => {
    const model = editor();
    const word = (key) => ({"type-content.paragraph": "Paragraph", "sample.cards.three_columns": "Three columns", "sample.cards.list": "List of cards", "group-data": "Data"}[key] ?? key);
    const inText = catalogueAt(model, model.placeAfter("p1"), {word});
    assert.equal(tabForPlace(model, model.placeAfter("p1")), "text");
    assert.equal(inText.tab, "text");
    assert.equal(inText.items.some((item) => item.type === "layout.section"), false, "a text area takes no section");
    const between = catalogueAt(model, model.placeAfter("s1"), {word});
    assert.equal(between.tab, "blocks");
    assert.ok(between.items.some((item) => item.type === "layout.section"));
    const cards = searchItems(between.items, "карточки", {word});
    assert.deepEqual(cards.map(itemKey), ["sample.cards#three-columns", "sample.cards#list"]);
    assert.deepEqual(searchItems(between.items, "data", {word}).map((item) => item.type).filter((type) => type === "sample.cards").length, 2);
    let recent = pushRecent([], cards[1]);
    recent = pushRecent(recent, cards[0]);
    recent = pushRecent(recent, cards[1]);
    assert.deepEqual(recent, ["sample.cards#list", "sample.cards#three-columns"]);
    const favourites = toggleFavourite(toggleFavourite([], "content.paragraph"), "layout.section");
    assert.deepEqual(pick(inText.items, favourites).map(itemKey), ["content.paragraph"], "a favourite the place cannot take is not offered");
    const author = editor({rights: {layout: false}});
    const authorItems = catalogueAt(author, author.placeAfter("p1"), {word}).items;
    assert.equal(authorItems.some((item) => item.type === "layout.columns"), false);
    const [columns] = skeletonOf(model, cards[0]);
    assert.deepEqual(columns.children.map((part) => part.kind), ["heading", "row"], "the intro, then the records");
    assert.equal(columns.children[1].children.length, 3, "three columns draw three cards");
    const [list] = skeletonOf(model, cards[1]);
    assert.deepEqual(list, {kind: "stack", children: [{kind: "card"}, {kind: "card"}]}, "one column draws the records one under another");
});

test("block builder: compose, expose a parameter, save a site block, change it everywhere with the texts kept", async () => {
    const model = editor();
    const started = model.startBuilder({from: "s1"});
    assert.equal(started.ok, true);
    const builder = started.builder;
    const exposable = model.exposable(builder);
    const background = exposable.find((entry) => entry.path === "s1" && entry.target === "props.background");
    assert.ok(background);
    builder.exposed = [{key: "background", path: background.path, target: background.target}];
    const saved = model.saveBuilder(builder, {name: "Наш промо", locale: "ru"});
    assert.equal(saved.ok, true, JSON.stringify(saved.diagnostics));
    assert.equal(saved.manifest.type, "site.nash-promo");
    assert.deepEqual(saved.words, {ru: {"site.nash-promo.name": "Наш промо"}});
    const instance = model.node("mn").slots.default[0];
    assert.equal(instance.type, "site.nash-promo");
    const form = model.fields(instance.id, "xs");
    assert.deepEqual(form.map((field) => field.key), ["background"]);
    model.setParam(instance.id, "background", "primary");
    model.startTyping(`${instance.id}:p1`);
    model.setText(`${instance.id}:p1`, "content", t("Our own words"));
    valid(model);
    let html = (await model.toHTML()).html;
    assert.match(html, /bg-primary-container/u);
    assert.match(html, /Our own words/u);
    // Change the block: a new version reaches the instance; the author's text and value stay.
    const again = model.startBuilder({type: "site.nash-promo"}).builder;
    again.root.slots.default[0].slots.default.unshift({id: "badge", type: "content.paragraph", data: {content: t("New!")}});
    const changed = model.saveBuilder(again);
    assert.equal(changed.ok, true, JSON.stringify(changed.diagnostics));
    assert.equal(changed.manifest.version, "1.1.0");
    assert.equal(changed.changes[0].to, "1.1.0");
    html = (await model.toHTML()).html;
    assert.match(html, /New!/u);
    assert.match(html, /Our own words/u);
    assert.match(html, /bg-primary-container/u);
    valid(model);
});

test("outputs: JSON is the Document, HTML prints utilities, Markdown is the text areas'", async () => {
    const model = editor();
    model.setText("p1", "content", [{type: "text", value: "Hello "}, {type: "text", value: "bold", marks: ["strong"]}, {type: "link", href: "https://simai.io", children: t("link")}]);
    model.setText("p2", "content", t("- a"));
    model.markdownShortcut("p2");
    assert.deepEqual(model.toJSON(), JSON.parse(JSON.stringify(model.doc)));
    const markdown = model.toMarkdown();
    assert.deepEqual(markdown.map((area) => area.id), ["a1"]);
    assert.equal(markdown[0].markdown, "# Title\n\nHello **bold**[link](https://simai.io)\n\n- a");
    assert.equal(inlineToMarkdown([{type: "text", value: "a*b", marks: ["em"]}]), "*a\\*b*");
    const {html} = await model.toHTML();
    assert.match(html, /<section class="p-y-8" data-sf-composition-id="s1"><div class="container m-inline-auto" data-sf-composition-part="frame">/u, "the type's parameter_defaults print (padding_y 8)");
    assert.doesNotMatch(html, /style=/u, "no inline styles");
});

test("remove and duplicate keep the slot rules and select a neighbour", () => {
    const model = editor();
    const copy = model.duplicate("p1");
    assert.deepEqual(ids(model.node("a1").slots.default), ["h1", "p1", copy.id, "p2"]);
    model.remove(copy.id);
    assert.equal(model.selected, "p2");
    valid(model);
});

test("G-30: the arrows with nothing chosen start at the first open block; neighbours cross regions, not a chosen parent's edge", () => {
    const plain = editor();
    assert.ok(plain.lockOf("logo") && plain.lockOf("copy"), "the header and the footer are the site template's");
    assert.equal(plain.neighbour(null, 1), "s1", "↓ starts at the first block a person can change");
    assert.equal(plain.neighbour(null, -1), "s2", "↑ at the last one");
    assert.equal(plain.neighbour("logo", 1), "s1", "from the header region into the main one");
    assert.equal(plain.neighbour("s1", 1), "s2");
    assert.equal(plain.neighbour("s2", 1), "copy");
    assert.equal(plain.neighbour("s1", -1), "logo");
    assert.equal(plain.neighbour("h1", -1), null, "a chosen parent's edge stops the arrows");
    assert.equal(plain.neighbour("p1", 1), "p2");
    assert.equal(plain.neighbour("copy", 1), null);
});

test("G-34: a library block dropped at a side splits, adds a column inside columns, up to four, one undo each", () => {
    const model = editor();
    const first = model.insertBeside({type: "content.quote"}, "p1", "right");
    assert.equal(first.ok, true);
    const columns = model.node(first.columns);
    assert.equal(columns.type, "layout.columns");
    assert.deepEqual(columns.props.columns, {xs: 1, md: 2});
    assert.deepEqual(ids(model.node(columns.slots.columns[0].id).slots.default), ["p1"]);
    assert.equal(model.selected, first.id);
    const inner = model.node(first.id).slots.default[0].id;
    const second = model.insertBeside({type: "content.alert"}, inner, "right");
    assert.equal(second.ok, true, "a block inside the quote gives its side to the quote");
    assert.equal(model.node(first.columns).slots.columns.length, 3);
    assert.equal(model.node(first.columns).slots.columns[2].slots.default[0].type, "content.alert");
    assert.deepEqual(model.node(first.columns).props.columns, {xs: 1, md: 3});
    assert.equal(model.insertBeside({type: "content.paragraph"}, "p1", "left").ok, true);
    assert.equal(model.node(first.columns).slots.columns[0].slots.default[0].type, "content.paragraph");
    assert.equal(model.insertBeside({type: "content.paragraph"}, "p1", "left").reason, "limit");
    assert.equal(model.insertBeside({type: "layout.section"}, "p2", "left").reason, "place");
    valid(model);
    model.undo();
    assert.equal(model.node(first.columns).slots.columns.length, 3);
    model.undo();
    assert.equal(model.node(first.columns).slots.columns.length, 2);
    model.undo();
    assert.equal(model.node(first.columns), null);
    assert.deepEqual(ids(model.node("a1").slots.default), ["h1", "p1", "p2"]);
});

test("G-29: refused classes are grouped by reason, by name", () => {
    assert.deepEqual(refusedClasses([
        {class: "bogus", reason: "modifier_unknown"},
        {class: "also-bogus", reason: "modifier_unknown"},
        {class: "p-x-99", reason: "modifier_invalid"},
        "plain-string",
    ]), [
        {reason: "modifier_unknown", classes: ["bogus", "also-bogus", "plain-string"]},
        {reason: "modifier_invalid", classes: ["p-x-99"]},
    ]);
    assert.deepEqual(refusedClasses([]), []);
    assert.deepEqual(refusedClasses(undefined), []);
});

test("1.2.0 G-20: + and / list the library's sections; a type stands in each of its groups, a search names it once", () => {
    const model = editor();
    const word = (key) => key;
    const between = catalogueAt(model, model.placeAfter("s1"), {word});
    const sections = sectionsOf(between.items);
    const ids = sections.map((section) => section.id);
    for (const id of ["text", "media", "forms"]) assert.ok(ids.includes(id), `section ${id}`);
    const button = between.items.find((item) => item.type === "element.button");
    assert.ok(button, "a button can stand between sections");
    assert.deepEqual(button.groups.slice(1), ["text"], "the button is also in Text (catalogue.also_in)");
    const inText = sections.find((section) => section.id === "text").types.map((type) => type.type);
    assert.ok(inText.includes("element.button"), "the button is listed under Text too");
    assert.equal(sections.find((section) => section.id === "text").count, sections.find((section) => section.id === "text").types.length, "the count is the types it lists");
    const forms = sections.find((section) => section.id === "forms").types.map((type) => type.type);
    for (const type of ["form.form", "form.input", "form.textarea", "form.checkbox", "form.switch", "form.select", "form.button-submit"]) assert.ok(forms.includes(type), type);
    const found = sectionsOf(searchItems(between.items, "button", {word}), {own: true}).flatMap((section) => section.types.map((type) => type.type));
    assert.equal(found.filter((type) => type === "element.button").length, 1, "found once");
    assert.equal(sectionForPlace(model, model.placeAfter("p1"), "slash"), "text", "/ opens Text first");
    assert.equal(sectionForPlace(model, model.placeAfter("s1"), "plus"), "", "+ between sections opens the list of sections");
});

test("1.2.0 G-21: reset after a change returns the variant's value, then the type's", () => {
    const model = editor();
    const made = model.insert({type: "layout.section", variant: "accent"}, model.placeAfter("s1"));
    assert.equal(made.ok, true, JSON.stringify(made));
    let field = model.fields(made.id, "xs").find((entry) => entry.key === "background");
    assert.deepEqual([field.origin, field.value], ["variant", "accent"]);
    model.setParam(made.id, "background", "primary");
    field = model.fields(made.id, "xs").find((entry) => entry.key === "background");
    assert.deepEqual([field.origin, field.value], ["block", "primary"]);
    assert.equal(field.resetTo, "accent", "the reset returns to the variant's value");
    model.setParam(made.id, "background", "accent");
    field = model.fields(made.id, "xs").find((entry) => entry.key === "background");
    assert.deepEqual([field.origin, field.value], ["variant", "accent"], "set back by hand, the variant's value is kept, not dropped");
    model.setParam(made.id, "background", "primary");
    model.resetParam(made.id, "background");
    field = model.fields(made.id, "xs").find((entry) => entry.key === "background");
    assert.deepEqual([field.origin, field.value], ["variant", "accent"], "back to the variant's value");
    model.resetParam(made.id, "background");
    field = model.fields(made.id, "xs").find((entry) => entry.key === "background");
    assert.equal(field.origin, "type", "a second reset leaves the type's value");
    valid(model);
});

test("1.2.0 G-42: a site block's instance takes only its exposed parameters, no own classes", () => {
    const model = editor();
    const builder = model.startBuilder({from: "s1"}).builder;
    builder.exposed = [{key: "background", path: "s1", target: "props.background"}];
    const saved = model.saveBuilder(builder, {name: "Promo"});
    assert.equal(saved.ok, true, JSON.stringify(saved.diagnostics));
    const instance = model.node("mn").slots.default[0];
    assert.deepEqual(model.fields(instance.id, "xs").map((field) => field.key), ["background"]);
    assert.equal(model.setModifiers(instance.id, "m-t-2").reason, "closed");
});

test("1.2.0: the accent section and the grid that holds three columns on the phone", async () => {
    const model = editor();
    const made = model.insert({type: "layout.section", variant: "accent"}, model.placeAfter("s1"));
    const html = (await model.toHTML()).html;
    assert.match(html, new RegExp(`<section class="bg-primary color-on-primary[^"]*" data-sf-composition-id="${made.id}"`, "u"));
    const grid = model.insert({type: "layout.grid"}, model.placeInside(made.id));
    assert.equal(grid.ok, true, JSON.stringify(grid));
    assert.match((await model.toHTML()).html, /class="grid grid-col-3 gap-5"/u);
});
