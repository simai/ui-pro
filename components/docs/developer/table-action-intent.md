# Smart Table action intent

Status: owner contract frozen for the isolated delivery candidate; acceptance
requires runtime, manifest, generated-distribution and browser evidence.

## Public port

`sf-table-action-intent` is an additive, bubbling, composed CustomEvent emitted
by the exact `sf-table` instance that owns the action. Its `detail` has exactly
two fields: `action_id` (nonempty opaque string) and `record_ids` (nonempty
array of opaque strings or safe integers). String identities, including
underscores and Unicode, and integer identities including zero are preserved.
No endpoint, callback, permission grant or executable expression belongs in
this payload. Create without an existing record identity is outside this port.

```js
table.addEventListener('sf-table-action-intent', event => {
  if (event.target !== table) return; // Ignore nested table intents.
  const instanceId = table.id;
  const {action_id, record_ids} = event.detail;
  // The project resolves the action, checks access and performs the operation.
});
```

`requestActionIntent(action_id, record_ids)` is the public command shared by
row, context and bulk controls. Invalid inputs throw TypeError before emitting
anything. Valid inputs emit one event and return the table. Each activation
uses a copied immutable payload; changing the caller's input later cannot
change an emitted intent. The event indicates a request, never operation success.

## Controls and ownership

Standard row controls use the action definition's opaque `id` and the complete
row `id`, captured from data. Never parse `data-item` or inspect a rendered cell
to obtain identities. A context-menu trigger only opens a menu; selecting its
action emits one intent. Native button activation owns pointer and keyboard
semantics; do not emit a second intent from a key handler or a parent click.

Bulk actions receive the explicit instance-owned selection of record identities;
an empty selection emits nothing. Selection does not grant access. Arbitrary
trusted legacy click callbacks remain an explicit compatibility path and must
not also execute the standard intent path implicitly. The demonstration View
handler is not a product operation and is replaced by the standard row intent.

The project owns registered action resolution, cancellation, pending/result/error
state, ACL, concurrency and persistent readback. Framework owns emission,
identity preservation, per-instance isolation, activation and disposal.

## Candidate acceptance matrix

| Scenario | Required evidence |
|---|---|
| Unicode/underscore string ID, integer 0 | Unchanged typed payload |
| Pointer click on a nested icon | Exactly one intent |
| Enter/Space on native action control | Exactly one intent |
| Context action | Complete identity, menu closes correctly |
| Bulk action | Full explicit selection, no empty-ID intent |
| Two instances and nested tables | Exact event source, no sibling routing |
| Invalid action/IDs and extra executable fields | No emitted intent |
| Disconnect/remount | No duplicate listeners or retained transient selection |
| Search, filters, columns, structured cells | Existing behavior preserved |
| SSR/hydration, wide/narrow browser | Real controls work, clean console |

No Recipe schema or Document grammar change is required for this event port.
Publishing this contract document alone is not evidence of implementation or
Larena acceptance.
