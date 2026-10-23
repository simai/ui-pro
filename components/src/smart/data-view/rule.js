// sf-data-view had no rule either, so its tag loaded nothing and every consumer
// added the script by hand. Found while fixing the same gap in sf-property-view.
// The relations are what the composite itself composes; the table brings its own
// through cl-table.
SF.RuleLoader["cl-data-view"] = {
  tags: ["sf-data-view"],
  type: "smart",
  mode: "smart",
  js: true,
  css: false,
  // lazy: a notice appears after an answer; fetched after the page is ready (2026-10-12).
  relation: [
    { name: "icons" },
    { name: "cl-table" },
    { name: "cl-pagination" },
    { name: "cl-toast", lazy: true },
    { name: "cl-buttons" },
    { name: "cl-checkbox" },
    { name: "cl-dropdown" },
    { name: "cl-icon-buttons" },
  ],
};
