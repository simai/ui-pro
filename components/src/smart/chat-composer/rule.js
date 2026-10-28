// The field is the Framework's flush textarea markup with its auto-grow; attach,
// send, stop and a chip's remove are plain icon-button markup; every glyph is a
// Smart sf-icon, and a tag it renders is a tag it fetches. The line that speaks
// a threshold of the count is visually hidden with the sr-only utility, which a
// class scan can miss on a node drawn later, so it comes with the component.
SF.RuleLoader["cl-chat-composer"] = {
  tags: ["sf-chat-composer"],
  type: "smart",
  mode: "smart",
  js: true,
  css: true,
  relation: [
    { name: "textarea" },
    { name: "icon-buttons" },
    { name: "cl-icon" },
    { name: "sr-only/default" },
  ],
};
