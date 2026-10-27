// Without this the tag loads nothing: the loader derives a script path from a
// registered rule, and no Smart composite had one -- not this component and not
// sf-data-view, which is why a consumer was adding the script by hand. The
// relations are the components the field renderer set can emit, plus `icons`,
// because a reference link's arrow arrives as a glyph name and shows as the word
// `arrow_forward` when the icon font is not on the page.
SF.RuleLoader["cl-property-view"] = {
  tags: ["sf-property-view"],
  type: "smart",
  mode: "smart",
  js: true,
  css: true,
  // Lazy (standard 1.3.8 §7.2.1; stand 24 P3): what only an edit, a press or an
  // opened group draws -- the field editors, the drag of the arranging mode,
  // the anchored surfaces and a related group's data view -- is not fetched
  // with the panel. Opening a read-only record loads the reading parts; the
  // Loader brings an editor when its tag is drawn, and the rest in idle time.
  relation: [
    { name: "icons" },
    // The panel draws an <sf-icon> of its own now -- the chevron that folds the
    // not-placed bin -- and a tag the panel renders is a tag the panel has to
    // fetch, whatever else on the page may already have fetched it.
    { name: "cl-icon" },
    { name: "cl-button" },
    { name: "cl-icon-button" },
    { name: "cl-drawer" },
    { name: "cl-tree" },
    { name: "cl-tree-item" },
    { name: "cl-avatar" },
    { name: "cl-badge" },
    { name: "cl-tag" },
    // The not-placed bin is the Framework's accordion, and a component this one
    // renders is a component this one fetches.
    { name: "accordion" },
    { name: "cl-reference-link" },
    // The views are chosen, made, renamed and removed in the profile picker
    // (owner, 2026-10-14), drawn while the view is arranged.
    { name: "cl-profile-picker", lazy: true },
    // «Copy link» is sf-copy-button (owner, 2026-10-14).
    { name: "cl-copy-button" },
    // A record that could not load says why in sf-empty-state.
    { name: "cl-empty-state" },
    { name: "cl-progress-scale" },
    // A number with a range draws sf-range-slider, from the shared renderer set.
    { name: "cl-range-slider", lazy: true },
    { name: "cl-file-preview" },
    { name: "cl-file-upload", lazy: true },
    { name: "cl-progress-bar", lazy: true },
    { name: "cl-input", lazy: true },
    { name: "cl-textarea", lazy: true },
    { name: "cl-dropdown", lazy: true },
    { name: "cl-datepicker", lazy: true },
    { name: "cl-switch", lazy: true },
    { name: "cl-checkbox", lazy: true },
    { name: "cl-button-group", lazy: true },
    { name: "cl-list-item" },
    { name: "cl-spinner" },
    // Configuring the view drags fields between groups and groups between
    // sections, and the drag is sf-sortable's. Without the relation the lists
    // would render as undefined elements -- present in the DOM, inert to a
    // pointer, and indistinguishable from a feature that silently does nothing.
    { name: "cl-sortable", lazy: true },
    // A colour property draws sf-color, in a cell and in a card alike.
    { name: "cl-color" },
    // A string whose variant is a phone draws sf-country-code. The rule fence
    // reads a component's own templates, and this element comes from the shared
    // renderer set instead -- so nothing would have caught its absence until a
    // page showed an element that never upgraded.
    { name: "cl-country-code" },
    // A field's hint beside its label is sf-help-mark, a button that opens the
    // words on a press. It was a glyph carrying them in a native title, which
    // needs a hover and left a touch device with no way to read the hint at all
    // (Larena storage QA, 2026-10-22). sf-tooltip was tried first and is the
    // wrong half of the pair: it is the bubble itself rather than a wrapper
    // around a trigger, so wrapping the glyph in one printed the hint as text
    // beside the label.
    { name: "cl-help-mark" },
    // A group of related records composes a data view, which brings its own table
    // and page row through cl-data-view. Without the relation the group would hold
    // an undefined element: present, empty, and indistinguishable from a host that
    // answered with no records.
    { name: "cl-data-view", lazy: true },
    // The table the related group slots into that data view. Slotted rather than
    // left to the data view's own fallback, because fallback content lives in a
    // shadow tree where the page's stylesheets do not reach -- a consumer saw a
    // list with its icon ligatures showing as text.
    { name: "cl-table", lazy: true },
    // Every anchored surface this panel opens -- a field's settings, the list of
    // fields an area can take, the head's menu -- is an sf-popover.
    { name: "cl-popover", lazy: true },
    // Sections laid out as a row of tabs rather than a list beside the fields.
    { name: "cl-tabs" },
  ],
};
