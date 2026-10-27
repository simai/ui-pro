import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/smart/admin-menu/index.js", import.meta.url), "utf8");
const template = readFileSync(new URL("../src/smart/admin-menu/js/templates/default.js", import.meta.url), "utf8");
// The words are lang/<locale>.json (standard 1.3.8 §11); js/words.js makes the
// template's dictionary from them.
const ru = JSON.parse(readFileSync(new URL("../src/smart/admin-menu/lang/ru.json", import.meta.url), "utf8")).runtime;
const contextMenuTemplate = readFileSync(new URL("../src/smart/context-menu/js/templates/default.js", import.meta.url), "utf8");

test("admin menu supports backend-owned external persistence", () => {
    assert.match(source, /persistenceMode:\s*\{/);
    assert.match(source, /if \(!this\.isLocalPersistence\(\)\) return \{\};/);
    // The events by their verbs (§8): sf-admin-menu-settings-save, -cancel,
    // -compact-change keep their names; the reset is the vocabulary's reset
    // {kind: settings}, and sf-admin-menu-settings-reset follows it until
    // 2026-12-01 (aliases.json).
    assert.match(source, /emitSettingsEvent\("settings-save"/);
    assert.match(source, /emitSettingsEvent\("reset", \{\s*kind: "settings"/);
    assert.match(source, /emitSettingsEvent\("settings-cancel"/);
    assert.match(source, /emitSettingsEvent\("compact-change"/);
    assert.match(source, /base_revision:\s*this\.getSettingsRevision\(\)/);
    assert.match(source, /profile:\s*this\.buildSettingsProfile\(\)/);
    assert.match(source, /emitSettingsEvent\("settings-refresh"[\s\S]*?base_revision:\s*this\.getSettingsRevision\(\)[\s\S]*?profile:\s*this\.buildSettingsProfile\(\)/);
});

test("compact mode publishes a layout event for containing shells", () => {
    assert.match(source, /setCompact\(!this\.getProp\("compact"\), "toggle"\)/);
    assert.match(source, /this\.setCompact\(false, "panel-open"\)/);
    assert.match(source, /this\.emitCompactChange\("connected"\)/);
    assert.match(source, /compact:\s*Boolean\(this\.getProp\("compact"\)\)/);
});

test("admin menu uses stable IDs and only drafts changes before save", () => {
    assert.match(source, /node\.getAttribute\("item-id"\)/);
    assert.match(source, /if \(this\.state\.menuSettings\) \{\s*orderedPanelIds/s);
    assert.match(source, /options\.persist === true && this\.isLocalPersistence\(\)/);
    assert.match(source, /if \(Number\.isFinite\(delta\.order\)\) normalized\.order = delta\.order;/);
    assert.doesNotMatch(source, /Number\.isFinite\(delta\.order\) \? delta\.order : item\.order/);
    assert.doesNotMatch(source, /text:\s*"Удалить"/);
    assert.doesNotMatch(source, /text:\s*"Изменить"/);
});

test("settings UI exposes user and system modes with reset and cancel", () => {
    assert.match(template, /systemSettings: "system-settings"/);
    assert.equal(ru["system-settings"], "Настройки для всех");
    assert.match(template, /component\.resetMenuSettings\(\)/);
    assert.match(template, /component\.cancelMenuSettings\(\)/);
    assert.match(template, /settingsStatus === \"conflict\"/);
    assert.match(template, /context\.persistenceMode === "external" && context\.allowSystemSettings/);
    assert.match(template, /context\.persistenceMode === "external" \? \[\{/);
    assert.match(template, /settingsStatus === "conflict" \? menuText\("refreshState"\) : menuText\("save"\)/);
    assert.match(template, /<sf-button[\s\S]*?scheme="primary"[\s\S]*?settingsStatus === "conflict"/);
    assert.doesNotMatch(template, /<sf-button[\s\S]*?scheme="danger"/);
    assert.match(template, /context\.persistenceMode !== "external"/);
    assert.match(source, /this\._layoutSettings = structuredClone\(this\._layoutBaseline \|\| \{\}\);/);
    assert.match(source, /compact !== this\._compactBaseline/);
    assert.match(
        source,
        /resetMenuSettings\(\) \{[\s\S]*?this\.commitSettingsBaseline\(\);\s*this\.closeContextMenu\(\);/,
    );
});

test("local persistence fails safely and cannot enter backend-only states", () => {
    assert.match(source, /clearMenuSettingsStorage\(\)/);
    assert.match(source, /handleSettingsStorageError\(error, true\)/);
    assert.match(source, /browser settings storage is unavailable/);
    assert.match(source, /if \(this\._settingsStorageError\) return;/);
    assert.match(source, /selectSettingsMode\(mode\) \{\s*if \(this\.isLocalPersistence\(\)\) return;/);
    assert.match(source, /refreshSettings\(\) \{\s*if \(this\.isLocalPersistence\(\)\) return;/);
    assert.match(source, /typeof error\?\.message === "string"/);
    assert.doesNotMatch(source, /settingsError:\s*String\(error\?\.error/);
});

test("context menu binds button labels and actions through the public button ABI", () => {
    assert.match(contextMenuTemplate, /item\?\.component === "sf-button"/);
    assert.match(contextMenuTemplate, /text=\$\{props\.text \|\| ""\}/);
    assert.match(contextMenuTemplate, /@click=\$\{typeof click === "function" \? click : nothing\}/);
    assert.match(source, /this\.refs\.contextMenu\.value = portal\.querySelector\("sf-context-menu"\)/);
});

test("divider settings share visibility semantics with ordinary items", () => {
    assert.match(template, /function renderMenuDivider[\s\S]*?const isTempVisible = visible\[item\.panelId\]\?\.temp === true;/);
    assert.match(template, /\(item\.hidden && !isTempVisible\)/);
    assert.match(template, /renderMenuDivider[\s\S]*?component\.openContextMenu\(event, \{[\s\S]*?tempVisible: isTempVisible,/);
});

test("context menus stay inside narrow viewports", () => {
    assert.match(source, /const openTowardInlineStart = pos\.right > window\.innerWidth \/ 2;/);
    assert.match(source, /token !== this\._contextOpenToken[\s\S]*?this\.clampContextMenuToViewport\(\)/);
    assert.match(source, /if \(token === this\._contextOpenToken\) this\._contextReadyHandler\?\.\(\)/);
    assert.match(source, /surface\.style\.translate = `\$\{offsetX\}px \$\{offsetY\}px`/);
});

test("overflow measurement tolerates an unmounted or empty menu", () => {
    assert.match(source, /this\.updateOverflow\(\) \|\| \{\s*items: \{\},\s*hidden: false,/s);
});

test("menu-owned controls follow the document locale", () => {
    assert.match(source, /MENU_TRANSLATIONS/);
    assert.match(source, /this\.translate\(!tempVisible \? "hide" : "show"\)/);
    assert.match(template, /menuText\("favorites"\)/);
    assert.match(template, /menuText\("systemSettings"\)/);
    assert.match(template, /menuText\("resetSettings"\)/);
    assert.match(template, /menuText\("expand"\)/);
    assert.match(template, /menuText\("collapse"\)/);
});
