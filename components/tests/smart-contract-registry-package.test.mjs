import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {readFileSync} from "node:fs";
import test from "node:test";

// The package part of ui-source tests/smart-contract-registry.test.mjs. It runs in
// the overlay (ui-source at the pinned revision with this repository laid over
// it): sf-contract walks every smart.manifest.json under src, so the registry it
// builds there holds the free components and the four package ones together.
const root = new URL("..", import.meta.url);
const run = (...args) => execFileSync(process.execPath, ["scripts/sf-contract.mjs", ...args], {cwd: root, encoding: "utf8"});

test("the package composites are generated into the searchable registry beside the free ones", () => {
  run("build");
  const registry = JSON.parse(readFileSync(new URL("../contracts/generated/smart-component-contract-registry.json", import.meta.url), "utf8"));
  assert.equal(registry.schema, "simai.smart-component-contract-registry.v2");
  // The free registry's Smart components (sf-settings-menu folded into
  // sf-menu-context the latest) and the package's own make 82: 66
  // free, the four admin composites, the three conversation components
  // promoted from simai/ui-chat (2026-10-25), sf-chat-interlocutor,
  // sf-chat-composer, sf-chat-message and sf-chat-window, moved from it (D31,
  // 2026-10-28), and sf-mail-library, sf-mail-letters, sf-mail-structure,
  // sf-mail-inspector and sf-mail-canvas, moved from simai/ui-mail (D31, 2026-10-29),
  // sf-editor-content, written for simai/ui-editor (2026-11-01), and sf-editor,
  // the one block editor (owner 2026-11-03), make 84. sf-confirm-change moved to
  // the Framework with the new sf-confirm (block confirm, stage 1 of the
  // component sets, 2026-11-03): 68 free and 17 of the package make 85.
  // sf-alert-bar, sf-list and sf-list-feed (wave 2, ui-62b1d9b6dc8d): 71 free
  // and 17 of the package make 88. sf-language (ui-1ec283e856cd): 72 free and
  // 17 of the package make 89. sf-settings (ui-d1abe5f216c9): 73 free and 17
  // of the package make 90. sf-wizard and sf-wizard-step (ui-b58b5dec35e4):
  // 75 free and 17 of the package make 92. sf-tile-metric, sf-list-attention
  // and sf-progress-run (ui-5edc71bd6936): 78 free and 17 of the package make 95.
  // sf-input-choice, sf-list-description and sf-list-timeline
  // (ui-0c23f6a0af12): 81 free and 17 of the package make 98. sf-time and
  // sf-change (ui-7f1d29b02919): 83 free and 17 of the package make 100.
  // sf-display-settings, sf-form and sf-tag-group (ui-078a4b4c6f6e): 86 free
  // and 17 of the package make 103. Since View 1.8.2 the package ships 15
  // (sf-view-table and sf-view-properties come from the view set, D31): 101.
  assert.equal(registry.entries.length, 101);
  assert.ok(registry.entries.some((entry) => entry.id === "smart.confirm-change"), "sf-confirm-change, now the Framework's");
  for (const id of ["smart.admin-menu", "smart.view",
    "smart.message-log", "smart.chat-threads", "smart.chat-interlocutor", "smart.chat-composer", "smart.chat-message", "smart.chat-window",
    "smart.mail-library", "smart.mail-letters", "smart.mail-structure", "smart.mail-inspector", "smart.mail-canvas", "smart.editor-content", "smart.editor"]) {
    assert.ok(registry.entries.some((entry) => entry.id === id), id);
  }
  assert.ok(registry.entries.find(({id}) => id === "smart.admin-menu").capabilities.includes("navigation"));
  assert.ok(registry.entries.every(({contract_schema}) => contract_schema.version === 2));
});

test("CLI discovers, describes and verifies the whole composite", () => {
  const listed = JSON.parse(run("list", "--kind", "smart", "--capability", "navigation"));
  // The free sf-contents, sf-menu, sf-pager, sf-search, sf-header-site and
  // sf-language (site navigation) and the package's admin menu.
  assert.deepEqual(listed.map(({id}) => id), ["smart.admin-menu", "smart.contents", "smart.header-site", "smart.language", "smart.menu", "smart.pager", "smart.search"]);
  const packet = JSON.parse(run("describe", "smart.admin-menu", "--format", "ai"));
  assert.equal(packet.decision.reuse_mode, "whole");
  assert.equal(packet.public_abi.custom_element, "sf-admin-menu");
  assert.equal(packet.conformance.compatibility.contract_schema.version, 2);
  assert.equal(packet.conformance.compatibility.migrations.at(-1).to, '1.7.1');
  assert.match(packet.backend.integration_examples.larena_php, /Smart::render\('ui\.admin_menu'/);
  assert.deepEqual(JSON.parse(run("verify", "smart.admin-menu")), {ok: true, verified: ["smart.admin-menu"]});
});
