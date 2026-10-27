// The log's frame draws two Smart controls -- «Show earlier messages» is an
// sf-button, «To the latest» an sf-icon-button -- and a tag the log renders is a
// tag it fetches. The announcer is visually hidden with the Framework's sr-only
// utility, which a class scan can miss on a node that starts empty, so it comes
// with the component. What a message looks like is the host's renderer; a host
// whose renderer draws other Smart elements fetches them itself.
SF.RuleLoader["cl-message-log"] = {
  tags: ["sf-message-log"],
  type: "smart",
  mode: "smart",
  js: true,
  css: true,
  relation: [
    { name: "cl-button" },
    { name: "cl-icon-button" },
    { name: "sr-only/default" },
  ],
};
