# Conformance kit — chat host port 1.0.0

Fourteen cases a host runs to show it speaks this port. Transport-neutral: the
kit describes intents, payloads and answers, not HTTP, not a framework. The
port is the seam of `sf-chat-window` (ui-pro), shared by an AI assistant's
window (Mirai24) and people writing to each other (simai.chat); it was proven
in ui-chat (0304327) and moved here when the second consumer came (D31).

Each case is a plain document: `given` is the state the host is put in, `when`
is the intent the component raises with its payload, `then` is the answer the
host owes:

- `answer` — one of `applied`, `conflict`, `refused`, `unavailable`;
- `answer_must_include` — fields the answer carries beside `answer`, such as
  `current` on a conflict or `reason` on a refusal;
- `data_must_include` — keys of the answer's `data`;
- `note` — what else the case checks, in words, with the exact values and the
  reason codes a host answers (`idempotency-conflict`, `access-revoked`,
  `not-found`, `capability-not-provided`).

A case with a `capability` applies only to a host that announces it; a host
that does not passes the case by never receiving the intent.

## Digest

`conformance.sha256` in `port.json` is over the listing of this directory: for
every file, sorted by path, the line `<path relative to the kit> <sha256 of
the bytes>\n`, then the sha256 of that listing
(`tests/host-port-kits.contract.test.mjs` checks it).

## History

| version | cases | what changed |
|:---|:---|:---|
| 1.0.0 | 14 | The first edition: ui-chat's kit at 0304327, the same given, when and answer, each `then` written in the kit vocabulary of the other ports. |

## 1.0.0

| case | what it holds the host to |
|:---|:---|
| `open-carries-state-and-messages` | one answer opens a conversation: its rights, its last messages and whether there are older ones |
| `older-keeps-live-cursors` | reading history never moves the live cursors, so no live update is skipped |
| `send-same-key-is-one-message` | the same `client_key` with the same body is the same message |
| `send-changed-body-same-key-conflict` | a changed body under a stored key is `idempotency-conflict`, never a second message |
| `edit-stale-revision-conflict` | an edit against an older revision is a conflict carrying the current message; the typed text stays |
| `delete-leaves-tombstone` | a deleted message keeps its place, its text and files gone |
| `rights-from-flags-not-author` | `can_edit` and `can_delete` decide, never who wrote it |
| `revoked-clears-everything` | `access-revoked` clears the feed, the draft and anything unsent; `conversation` becomes null |
| `late-file-joins-message` | a late file joins its message and leaves its revision alone |
| `file-retry-by-local-key` | a failed upload is retried by its local key, which never reaches download or delete |
| `no-selection-is-null` | nothing open is `conversation: null`, never an invented id or `can_send` |
| `retry-keeps-original-revision` | a retried edit keeps its first revision and gets the stored result of its key |
| `capability-absent-is-unavailable` | a capability not announced is never offered; asked anyway, the host answers `unavailable` |
| `proposal-sends-exact-command` | confirming a proposal sends its `confirm_command` exactly |

The vocabulary is the standard's (simai.smart-component 1.3.9 §4.9, smart
vocabulary 1.1.5): the four answers, `revision` on every edit and delete, and
one `client_key` per write, so a repeat is the same write (vocabulary
`client-key`; `retry {key}` maps to `message.retry` and `file.retry`).

What the port leaves to the window, not to the core edition: the archive as a
list of its own, paging and searching the list of conversations, pinning,
uploading a file when it is picked, the person's own files and an assistant's
brief. `sf-chat-window` declares these as its own `x-*` capabilities
(`x-archive-view`, `x-conversations-paging`, `x-conversations-search`,
`x-conversation-pin`, `x-early-upload`, `x-my-files`, `x-brief`) under the
`chat-window:` event prefix; they are not part of this port and a host passes
this kit without them. Message discussions, participants and roles, typing,
presence, read receipts and a streamed reply are candidates for 1.1.0.

An assistant's `html` is sanitized again by the component, with Core's
`SF.sanitizeHtml` (docs/developer/sanitize-html.md): a host's own cleaning is
the first line, never the only one.
