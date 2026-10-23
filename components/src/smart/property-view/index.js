// One object's fields, shown and edited. The pair to sf-data-view: that one is a
// set of records in any layout, this one is a single object -- a storage record,
// a related record, site settings, a profile. Named for the property rather than
// for the record because nothing in it knows what kind of object is behind a
// field; the renderer set it draws through is addressed by a property type, and a
// name saying `record` would narrow the component below its own contents.
//
// The host owns values, revisions, rights and addresses. This element owns the
// arrangement on screen and nothing else: it stores no value and no revision of
// its own, and every change leaves through the port.
//
// It renders into its own light DOM, like every other Smart component. The first
// version used a shadow root, and the field controls inside it came out with
// their markup and none of their CSS: a document stylesheet does not cross a
// shadow boundary. sf-data-view avoids this by slotting its children and says so
// beside the slot. A consumer found it on their stand.
import SfBaseElement from "../../core/js/smart-base";
import {ICON_CHOICES} from "./js/icon-choices.js";
import {pageText} from "../../core/js/page-language";
import {renderPropertyViewTemplate} from "./js/templates/default";
import {composeDateTime, normalizeTime, splitDateTime} from "./js/datetime-value.js";
import {fieldConditions} from "./js/conditions.js";

// Every port version this composite accepts, in one place, the way sf-data-view
// keeps its list -- a guard naming a narrower set than the published versions is
// a component refusing a host it asked to move. The contract test beside this
// file compares the list with the manifest.
const SUPPORTED_PORT_VERSIONS = ["1.0.0", "1.1.0", "1.2.0", "1.3.0", "1.4.0", "1.5.0", "1.6.0", "1.7.0", "1.8.0", "1.9.0", "1.10.0", "1.11.0", "1.12.0", "1.13.0", "1.14.0"];

// The surface's mode (owner, 2026-10-14). view: show the object, never offer
// a change. auto: show it and offer what this person may do. edit: every group
// open at once, one save. create: an empty object of the collection, every
// field open, one create.
const MODES = ["view", "auto", "edit", "create"];

// The most candidates a picker asks for at once, from a host on port 1.14.0 or
// later (an earlier port's field.options payload is closed and would refuse
// it). Twenty is the page the record picker was built and measured against
// with the consumer's 448 targets; the host may answer fewer, and says which
// page is the last by its cursor, not by a short page.
const OPTIONS_PAGE_LIMIT = 20;

// The property types picked from a list the host pages: the records and people,
// and since 1.14.0 a lookup whose list is not inline.
const PAGED_TYPES = ["record", "relation", "user", "lookup"];
const versionAtLeast = (version, minimum) => {
    const parts = (value) => String(value ?? "").split(".").map((part) => Number.parseInt(part, 10) || 0);
    const [a, b] = [parts(version), parts(minimum)];
    for (let index = 0; index < 3; index += 1) {
        if ((a[index] ?? 0) !== (b[index] ?? 0)) return (a[index] ?? 0) > (b[index] ?? 0);
    }
    return true;
};

// Every panel open on the page, in the order they were opened. A stack is not one
// state held for several records: each window is its own element with its own
// record, its own open group and its own unsaved changes -- which is what «такое
// же представление поверх» means, and what leaves a half-edited window intact
// underneath the one above it. What the Framework owns is the behaviour between
// them: which window Esc closes, which are dimmed, how far each is inset so the
// one below stays partly visible. That needs no shared state beyond the order.
// The same query sf-drawer docks on, written the same way so a reader grepping
// 48rem finds both. The Framework's own breakpoint array has no 48rem step -- its
// nearest is md at 720px -- but the panel *is* a drawer, and flipping the panel's
// arrangement 48px away from where the drawer changes its own behaviour would be
// visible in that gap. The split between the breakpoint array and the pixel values
// components use is reported rather than settled here.
const WIDE_MEDIA_QUERY = "(min-width: 48rem)";

// The column the list of sections takes. It is here rather than in the
// stylesheet because the panel's own width is computed from it, and the drawer
// that carries the panel is placed outside this component's subtree: a custom
// property declared on the element never reaches it. The stylesheet reads this
// through `--sf-property-view--sections-width`, which the component passes to
// the panel and sets on the layout it draws in place.
const SECTIONS_WIDTH = "14rem";

// How long the copy control shows its tick. The Framework's own clipboard holds
// its tick for this long, and two controls that say «copied» for two different
// lengths are two conventions where there is one act.
const COPY_FEEDBACK_MS = 5000;

const openPanels = [];

function topPanel() {
    return openPanels[openPanels.length - 1] ?? null;
}

function restackPanels() {
    openPanels.forEach((panel, index) => {
        panel.setAttribute("data-stack-depth", String(index));
        panel.toggleAttribute("data-stack-top", panel === topPanel());
        panel.requestComponentUpdate("stack");
    });
}

// A payload is copied so that a host cannot mutate what the component still
// holds. Copying it through JSON destroys anything that is not plain data, and
// the upload intent carries a File: it arrived at the host as an empty object,
// so its name was undefined, the host's own size check never matched, and a file
// it would have refused was accepted instead. Found by a probe asserting that
// what arrives is a File, which is the only reason it was not shipped.
//
// So the plain parts are copied and anything that is not plain is passed by
// reference. The protection was always about data; a File is not data the
// component can own a second copy of.
const isPlain = (value) => value === null
    || ["string", "number", "boolean", "undefined"].includes(typeof value)
    || (typeof value === "object" && (Array.isArray(value) || value.constructor === Object));

const copy = (value) => {
    if (value == null) return value;
    if (typeof value !== "object" || !isPlain(value)) return value;
    if (Array.isArray(value)) return value.map((item) => copy(item));
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
};

// The Framework speaks English by default and Russian on a Russian page, as
// src/core/js/page-language states for every component. This composite
// carried Russian defaults instead, so an English page drew a panel entirely
// in Russian -- beside an sf-color inside it that followed the rule and said
// «inherited». A product still overrides any of these by attribute.
const PROPERTY_VIEW_TEXT = {
    en: {
        emptyText: "not filled in",
        emptyRecordText: "This record has nothing to show",
        editText: "edit",
        saveText: "Save",
        cancelText: "Cancel",
        createText: "Create",
        readOnlyText: "You can only view this record",
        deleteText: "Delete",
        changedText: "Fields changed",
        errorsText: "Errors",
        dateTimeDateLabel: "{label}: date",
        dateTimeTimeLabel: "{label}: time",
        timePlaceholderText: "hh:mm",
        dateMissingText: "Enter the date",
        dateInvalidText: "The date is not a calendar date",
        timeMissingText: "Enter the time",
        timeInvalidText: "Enter the time as hh:mm, from 00:00 to 23:59",
        conflictText: "The record changed; read it again",
        confirmSaveText: "Confirm and save",
        keepEditingText: "Keep editing",
        sectionsLabel: "Sections",
        closeLabel: "Close",
        statePortNotConnected: "The record port is not connected",
        stateLoadFailed: "The record could not be read",
        stateLoading: "Reading the record",
        stateUnavailable: "The record is unavailable",
        saveFailedText: "The save failed",
        viewSaveFailedText: "The view could not be saved",
        viewResetFailedText: "The view could not be reset",
        copyLinkLabel: "Copy link",
        linkCopiedLabel: "Link copied",
        openFullLabel: "Open as a page",
        configureText: "Arrange the view",
        doneConfiguringText: "Done",
        resetViewText: "Reset",
        resetViewAskText: "Reset the whole view?",
        cancelConfiguringText: "Cancel",
        personalLayerText: "Personal",
        addViewText: "Add a view",
        newViewText: "New view",
        deleteViewText: "Remove the view",
        lastSharedViewText: "The only view everyone has",
        viewProfileLabel: "View",
        sharedLayerText: "Everyone's",
        widthText: "Full width",
        fieldLabelText: "Name",
        sectionIconText: "Section glyph",
        variantText: "Template",
        hintText: "Hint",
        hiddenText: "Hide",
        configureHintText: "Drag fields between groups and onto a section on the left. Applied at once.",
        configureHintNarrowText: "Drag fields between groups. Applied at once.",
        fieldSettingsText: "Field settings",
        shownText: "Shown",
        showRareText: "Show rare fields",
        hideRareText: "Hide rare fields",
        rareText: "rare",
        unplacedTitle: "Not placed",
        moveUpText: "Move up",
        moveDownText: "Move down",
        addFieldText: "Add a field",
        inThisGroupText: "In this area",
        renameText: "Rename",
        saveNameText: "Save the name",
        cancelNameText: "Leave the name",
        removeFieldText: "Remove from this area",
        removeGroupText: "Remove this area",
        removeSectionText: "Remove this section",
        addGroupText: "Add an area",
        addSectionText: "Add a section",
        newGroupTitle: "New area",
        newSectionTitle: "New section",
        noMatchText: "Nothing matches",
        unplacedHintText: "Fields this view does not show. Drag one into a group to place it, or drag a field here to take it out.",
        viewConflictText: "The view changed and was read again",
        viewDeniedText: "You may not change this layer",
        backLabel: "Back",
        favouriteLabel: "Favourite",
        menuLabel: "More",
        inheritedText: "by default",
    },
    ru: {
        emptyText: "не заполнено",
        emptyRecordText: "В этой записи нечего показать",
        editText: "изменить",
        saveText: "Сохранить",
        cancelText: "Отменить",
        createText: "Создать",
        readOnlyText: "Эту запись можно только смотреть",
        deleteText: "Удалить",
        changedText: "Изменено полей",
        errorsText: "Ошибок",
        dateTimeDateLabel: "{label}: дата",
        dateTimeTimeLabel: "{label}: время",
        timePlaceholderText: "чч:мм",
        dateMissingText: "Укажите дату",
        dateInvalidText: "Дата указана неверно",
        timeMissingText: "Укажите время",
        timeInvalidText: "Укажите время в виде чч:мм, от 00:00 до 23:59",
        conflictText: "Запись изменилась, обновите её",
        confirmSaveText: "Подтвердить и сохранить",
        keepEditingText: "Вернуться к правке",
        sectionsLabel: "Разделы",
        closeLabel: "Закрыть",
        statePortNotConnected: "Порт записи не подключён",
        stateLoadFailed: "Не удалось загрузить запись",
        stateLoading: "Загрузка записи",
        stateUnavailable: "Запись недоступна",
        saveFailedText: "Не удалось сохранить",
        viewSaveFailedText: "Не удалось сохранить вид",
        viewResetFailedText: "Не удалось сбросить вид",
        copyLinkLabel: "Копировать ссылку",
        linkCopiedLabel: "Ссылка скопирована",
        openFullLabel: "Открыть на всю страницу",
        configureText: "Настроить вид",
        doneConfiguringText: "Готово",
        resetViewText: "Сбросить",
        resetViewAskText: "Сбросить весь вид?",
        cancelConfiguringText: "Отменить",
        personalLayerText: "Персональный",
        addViewText: "Добавить вид",
        newViewText: "Новый вид",
        deleteViewText: "Удалить вид",
        lastSharedViewText: "Единственный общий вид",
        viewProfileLabel: "Вид",
        sharedLayerText: "Для всех",
        widthText: "На всю ширину",
        fieldLabelText: "Название",
        sectionIconText: "Значок раздела",
        variantText: "Вид",
        hintText: "Подсказка",
        hiddenText: "Скрыть",
        configureHintText: "Перетаскивайте поля между группами и на разделы слева. Применяется сразу.",
        configureHintNarrowText: "Перетаскивайте поля между группами. Применяется сразу.",
        fieldSettingsText: "Настройки поля",
        shownText: "Показывать",
        showRareText: "Показать редкие поля",
        hideRareText: "Скрыть редкие поля",
        rareText: "редкое",
        unplacedTitle: "Не размещённые",
        moveUpText: "Выше",
        moveDownText: "Ниже",
        addFieldText: "Добавить поле",
        inThisGroupText: "В этой области",
        renameText: "Переименовать",
        saveNameText: "Сохранить название",
        cancelNameText: "Оставить название",
        removeFieldText: "Убрать из области",
        removeGroupText: "Удалить область",
        removeSectionText: "Удалить раздел",
        addGroupText: "Добавить область",
        addSectionText: "Добавить раздел",
        newGroupTitle: "Новая область",
        newSectionTitle: "Новый раздел",
        noMatchText: "Ничего не найдено",
        unplacedHintText: "Поля, которых нет в этом виде. Перетащите поле в группу, чтобы разместить, или сюда, чтобы убрать.",
        viewConflictText: "Вид изменился, он перезагружен",
        viewDeniedText: "Нет права менять этот слой",
        backLabel: "Назад",
        favouriteLabel: "В избранное",
        menuLabel: "Ещё",
        inheritedText: "по умолчанию",
    },
};

const SECTION_ICONS = ICON_CHOICES;

class SfPropertyView extends SfBaseElement {
    static get props() {
        return {
            templateName: {attribute: "template", default: "default"},
            recordId: {attribute: "record-id", default: ""},
            collection: {default: ""},
            showRare: {attribute: "show-rare", type: Boolean, default: false},
            // 1, or 1/2 beside a table at 1/2: the record read a step larger
            // than the list it was opened from (owner, 2026-10-14).
            size: {default: "1"},
            // view | auto | edit | create: what the surface is placed to do
            // (owner, 2026-10-14). The person's rights narrow it.
            mode: {default: "auto"},
            emptyText: {attribute: "empty-text", default: "not filled in"},
            emptyRecordText: {attribute: "empty-record-text", default: "This record has nothing to show"},
            editText: {attribute: "edit-text", default: "edit"},
            saveText: {attribute: "save-text", default: "Save"},
            cancelText: {attribute: "cancel-text", default: "Cancel"},
            deleteText: {attribute: "delete-text", default: "Delete"},
            changedText: {attribute: "changed-text", default: "Fields changed"},
            errorsText: {attribute: "errors-text", default: "Errors"},
            conflictText: {attribute: "conflict-text", default: "The record changed; read it again"},
            sectionsLabel: {attribute: "sections-label", default: "Sections"},
            // How the sections are laid out. A list beside the groups is right
            // for a settings screen with many of them; a row of tabs is right
            // for a record with a few, and is what the mockup drew first.
            sectionsAs: {attribute: "sections-as", default: "list", values: ["list", "tabs"]},
            panel: {type: Boolean, default: false},
            panelSize: {attribute: "panel-size", default: "1", values: ["1/2", "1", "2", "full"]},
            panelLabel: {attribute: "panel-label", default: ""},
            panelWidth: {attribute: "panel-width", default: ""},
            closeLabel: {attribute: "close-label", default: "Close"},
            copyLinkLabel: {attribute: "copy-link-label", default: "Copy link"},
            linkCopiedLabel: {attribute: "link-copied-label", default: "Link copied"},
            openFullLabel: {attribute: "open-full-label", default: "Open as a page"},
            configureText: {attribute: "configure-text", default: "Arrange the view"},
            doneConfiguringText: {attribute: "done-configuring-text", default: "Done"},
            resetViewText: {attribute: "reset-view-text", default: "Reset"},
            resetViewAskText: {attribute: "reset-view-ask-text", default: "Reset the whole view?"},
            cancelConfiguringText: {attribute: "cancel-configuring-text", default: "Cancel"},
            personalLayerText: {attribute: "personal-layer-text", default: "Personal"},
            viewProfileLabel: {attribute: "view-profile-label", default: "View"},
            addViewText: {attribute: "add-view-text", default: "Add a view"},
            newViewText: {attribute: "new-view-text", default: "New view"},
            deleteViewText: {attribute: "delete-view-text", default: "Remove the view"},
            lastSharedViewText: {attribute: "last-shared-view-text", default: "The only view everyone has"},
            sharedLayerText: {attribute: "shared-layer-text", default: "Everyone's"},
            widthText: {attribute: "width-text", default: "Full width"},
            fieldLabelText: {attribute: "field-label-text", default: "Name"},
            sectionIconText: {attribute: "section-icon-text", default: "Section glyph"},
            sectionIcons: {attribute: "section-icons", default: ""},
            variantText: {attribute: "variant-text", default: "Template"},
            hintText: {attribute: "hint-text", default: "Hint"},
            hiddenText: {attribute: "hidden-text", default: "Hide"},
            configureHintText: {
                attribute: "configure-hint-text",
                default: "Drag fields between groups and onto a section on the left. Applied at once.",
            },
            configureHintNarrowText: {
                attribute: "configure-hint-narrow-text",
                default: "Drag fields between groups. Applied at once.",
            },
            fieldSettingsText: {attribute: "field-settings-text", default: "Field settings"},
            shownText: {attribute: "shown-text", default: "Shown"},
            showRareText: {attribute: "show-rare-text", default: "Show rare fields"},
            hideRareText: {attribute: "hide-rare-text", default: "Hide rare fields"},
            rareText: {attribute: "rare-text", default: "rare"},
            unplacedTitle: {attribute: "unplaced-title", default: "Not placed"},
            moveUpText: {attribute: "move-up-text", default: "Move up"},
            moveDownText: {attribute: "move-down-text", default: "Move down"},
            addFieldText: {attribute: "add-field-text", default: "Add a field"},
            inThisGroupText: {attribute: "in-this-group-text", default: "In this area"},
            renameText: {attribute: "rename-text", default: "Rename"},
            saveNameText: {attribute: "save-name-text", default: "Save the name"},
            cancelNameText: {attribute: "cancel-name-text", default: "Leave the name"},
            removeFieldText: {attribute: "remove-field-text", default: "Remove from this area"},
            removeGroupText: {attribute: "remove-group-text", default: "Remove this area"},
            removeSectionText: {attribute: "remove-section-text", default: "Remove this section"},
            addGroupText: {attribute: "add-group-text", default: "Add an area"},
            addSectionText: {attribute: "add-section-text", default: "Add a section"},
            newGroupTitle: {attribute: "new-group-title", default: "New area"},
            newSectionTitle: {attribute: "new-section-title", default: "New section"},
            noMatchText: {attribute: "no-match-text", default: "Nothing matches"},
            unplacedHintText: {
                attribute: "unplaced-hint-text",
                default: "Fields this view does not show. Drag one into a group to place it, or drag a field here to take it out.",
            },
            viewConflictText: {attribute: "view-conflict-text", default: "The view changed and was read again"},
            viewDeniedText: {attribute: "view-denied-text", default: "You may not change this layer"},
            backLabel: {attribute: "back-label", default: "Back"},
            collectionLabel: {attribute: "collection-label", default: ""},
            collectionIcon: {attribute: "collection-icon", default: ""},
            favourite: {type: Boolean, default: false},
            favouriteLabel: {attribute: "favourite-label", default: "Favourite"},
            menuLabel: {attribute: "menu-label", default: "More"},
            inheritedText: {attribute: "inherited-text", default: "by default"},
        };
    }

    constructor() {
        super();
        this.hostPort = null;
        // What the host last answered with, held for rendering only. Never written
        // to and never the source of a save: a save sends the fields the person
        // changed against the revision the host gave, and the host answers with
        // the object as it now is.
        this.record = null;
        this.sections = [];
        this.selectedSection = null;
        // Which name is being typed, while it is being typed. A rename is not
        // written until it is confirmed, so an area keeps its name while a
        // person is still deciding on another.
        this.renaming = null;
        // What the arrangement was when the mode was entered, and whether a
        // reset has been asked for and is waiting to be confirmed.
        this.arrangementEntered = null;
        this.resetAsked = false;
        this.epoch = 0;
        this.message = "";
        // Which group is open, and what has been changed in it. Only changed
        // fields are held: a save carries what was touched and nothing else, so it
        // cannot overwrite a field somebody else saved meanwhile.
        this.editing = null;
        this.changed = new Map();
        this.errors = new Map();
        // What a person has entered into a field that is not a value yet: a
        // datetime's day and time, held until both make one (inputDrafts), and
        // what is wrong with an entry that cannot be written (inputErrors).
        // The view's own, so a host's refusal does not replace them; a save
        // waits until they are put right.
        this.inputDrafts = new Map();
        this.inputErrors = new Map();
        this.conflict = null;
        // A save the host will make only once confirmed (port 1.14.0): what it
        // said the save will do and the digest it issued for it, held until the
        // person confirms or goes back to editing. Nothing is written meanwhile,
        // and what was entered stays.
        this.confirmation = null;
        // Candidate records for a reference field, per field: the page the host
        // last answered with and the search it was answered for. Held for
        // rendering only, and dropped when the search changes -- a page is not the
        // whole set, so keeping pages across searches would show stale matches.
        this.optionPages = new Map();
        this.optionSearches = new Map();
        // One counter per field, because every reference field in a group is read
        // at the same moment and a single counter kept only the last answer.
        this.optionEpochs = new Map();
        // Files in flight, per field, in the shape sf-file-upload reads. The host
        // stores them and reports what it reports; the component times nothing,
        // because a progress bar over a transfer it does not perform would be a
        // bar that lies.
        this.uploads = new Map();
        // How the arrangement resolved and what this person may change about it,
        // as the host stated it. Absent means the view cannot be configured, and
        // no control that would lead there is drawn.
        this.view = null;
        this.configuring = false;
        // True while this component opened the not-placed bin for a drag, so it
        // can close it again and leave a bin the person opened alone.
        this._openedForDrag = false;
        this.viewTarget = "personal";
        // The layer being edited, as a working copy of what the host sent for it.
        // A layer carries only the entries it decides; the component edits that
        // and writes it back, rather than writing the whole resolved arrangement
        // into it -- a personal layer restating every entry would pin the view and
        // stop any later change to the shared layer from showing through.
        this.layerDraft = null;
        this.entryErrors = new Map();
        // One counter for the view writes, for the same reason the field options
        // have one each: an answer that arrives after the next write began is not
        // about the arrangement on screen.
        this.viewEpoch = 0;
        // Wide until something says otherwise: a first render that assumed a phone
        // would draw the narrow arrangement on a desktop for one frame.
        this.wide = true;
        this.wideMedia = null;
        // On a phone the sections are a list and a section is the next screen.
        // Null is the list; a key is that section's screen.
        this.phoneSection = null;
    }

    // Declaring a prop does not create an accessor for it: `static get props()`
    // tells the template context and the manifest what the component takes, and
    // every component writes the getters it reads itself. Without these,
    // `this.recordId` and `this.collection` were undefined and both intents went
    // to the host with a null record, `this.showRare` was undefined so a rare
    // group never appeared, and `this.conflictText` was undefined so a conflict
    // with no message of its own said nothing at all. Found by the probe; the
    // same family as the raw-props work in the other Framework session, from the
    // other side of the same assumption.
    get recordId() {
        return this.getAttribute("record-id") || "";
    }

    get collection() {
        return this.getAttribute("collection") || "";
    }

    get showRare() {
        return this.getBooleanAttr("show-rare", false);
    }

    // A record the host answered with and that holds nothing visible is a state
    // of its own: without a word for it the panel is an empty box that reads as
    // something still loading.
    get emptyRecordText() {
        return this.getAttribute("empty-record-text") || pageText(PROPERTY_VIEW_TEXT, "emptyRecordText", this);
    }

    get isEmptyRecord() {
        if (!this.record) return false;
        const sections = this.sections ?? [];
        if (!sections.length) return true;
        return !sections.some((section) => (section.groups ?? []).some(
            (group) => group.kind === "related" || (group.fields ?? []).length > 0));
    }

    get emptyText() {
        return this.getAttribute("empty-text") || pageText(PROPERTY_VIEW_TEXT, "emptyText", this);
    }

    get editText() {
        return this.getAttribute("edit-text") || pageText(PROPERTY_VIEW_TEXT, "editText", this);
    }

    get saveText() {
        return this.getAttribute("save-text") || pageText(PROPERTY_VIEW_TEXT, "saveText", this);
    }

    get cancelText() {
        return this.getAttribute("cancel-text") || pageText(PROPERTY_VIEW_TEXT, "cancelText", this);
    }

    get deleteText() {
        return this.getAttribute("delete-text") || pageText(PROPERTY_VIEW_TEXT, "deleteText", this);
    }

    // What the host allows on the record itself, as it allows it per row in a
    // data view. The component offers nothing the host did not name: a delete
    // the host would refuse is a control that exists to fail.
    // Fields the collection has that this view places in no group. They are not
    // hidden: hiding keeps a field where it is and dims it, while these are out
    // of the arrangement altogether, and only the arranging mode draws them.
    get unplaced() {
        const fields = this.record?.unplaced;
        return Array.isArray(fields) ? fields : [];
    }

    // Taking a field out of every group, and putting one back. A field out of
    // the arrangement is the layer saying its group is nothing, which is what
    // the port means by a null group.
    moveFieldToUnplaced(fieldKey, index) {
        if (!this.configuring || !this.layerDraft) return false;
        let moved = null;
        let fromGroup = null;
        for (const section of this.sections) {
            for (const group of section.groups ?? []) {
                const at = (group.fields ?? []).findIndex((field) => String(field.key) === String(fieldKey));
                if (at >= 0) {
                    fromGroup = group;
                    [moved] = group.fields.splice(at, 1);
                    break;
                }
            }
            if (moved) break;
        }
        if (!moved) return false;
        const into = this.record.unplaced ?? (this.record.unplaced = []);
        const at = Math.max(0, Math.min(Number.isInteger(index) ? index : into.length, into.length));
        into.splice(at, 0, moved);
        this._writeOrder(this.layerDraft.fields, into, {group: null});
        if (fromGroup) this._writeOrder(this.layerDraft.fields, fromGroup.fields ?? [], {group: String(fromGroup.key)});
        this.requestComponentUpdate("view-move");
        return this.saveView();
    }

    get recordActions() {
        const actions = this.record?.actions;
        return Array.isArray(actions) ? actions.map((action) => String(action)) : [];
    }

    // Deleting is the host's, including whether to ask first. The component says
    // it was asked for and closes when the host says it is done; a host that
    // refuses sends its reason and the panel stays open with it on screen.
    async deleteRecord() {
        if (this.mode === "view" || this.mode === "create" || !this.recordActions.includes("record.delete")) return false;
        const answer = await this._raise("record.delete", {
            record_id: this.recordId || null,
            collection: this.collection || null,
            revision: this.record?.revision ?? null,
        });
        this.dispatchEvent(new CustomEvent("sf-property-view-delete-record", {
            bubbles: true,
            composed: true,
            detail: {
                record_id: this.recordId || null,
                collection: this.collection || null,
                revision: this.record?.revision ?? null,
                answer: answer?.answer ?? null,
            },
        }));
        if (!answer) return false;
        if (answer.answer === "applied") {
            this.closePanel("deleted");
            return true;
        }
        // The person said no to the host's question: nothing to report.
        if (answer.reason === "cancelled") {
            this._setState("ready");
            return false;
        }
        this.message = answer.message || answer.reason || this.viewDeniedText;
        this._setState("ready");
        this.requestComponentUpdate("delete-refused");
        return false;
    }

    get changedText() {
        return this.getAttribute("changed-text") || pageText(PROPERTY_VIEW_TEXT, "changedText", this);
    }

    get errorsText() {
        return this.getAttribute("errors-text") || pageText(PROPERTY_VIEW_TEXT, "errorsText", this);
    }

    get conflictText() {
        return this.getAttribute("conflict-text") || pageText(PROPERTY_VIEW_TEXT, "conflictText", this);
    }

    get sectionsAs() {
        return this.getEnumAttr("sections-as", ["list", "tabs"], "list");
    }

    get sectionsLabel() {
        return this.getAttribute("sections-label") || pageText(PROPERTY_VIEW_TEXT, "sectionsLabel", this);
    }

    get panel() {
        return this.getBooleanAttr("panel", false);
    }

    get panelSize() {
        return this.getAttribute("panel-size") || "1";
    }

    get panelLabel() {
        return this.getAttribute("panel-label") || "";
    }

    get panelWidth() {
        return this.getAttribute("panel-width") || "";
    }

    get size() {
        return this.getAttribute("size") === "1/2" ? "1/2" : "1";
    }

    get mode() {
        const value = this.getAttribute("mode");
        return MODES.includes(value) ? value : "auto";
    }

    // Whether this person may change the fields. A view surface never offers
    // it; since port 1.12.0 the host says so with record.edit among the
    // record's actions, and a reader is sent none. A host on an earlier port
    // never sent it, and for it a group is editable unless it says otherwise.
    get mayEdit() {
        if (this.mode === "view") return false;
        if (this.mode === "create") return true;
        if (!versionAtLeast(this.hostPort?.version, "1.12.0")) return true;
        return this.recordActions.includes("record.edit");
    }

    // Every group open at once: a full edit page, or a create.
    get openAll() {
        return this.mode === "create" || (this.mode === "edit" && this.mayEdit);
    }

    // What the drawer is told to be. `size` is a ladder and its widest step short
    // of full measured 391px on a consumer's screen, which is too narrow for two
    // columns -- labels wrapped and a record title broke over three lines. `width`
    // is a declared input on sf-drawer, so a consumer can ask for 40rem and get
    // it. A deeper window in the stack is a step narrower than whatever the base
    // is, so the one below shows along its leading edge.
    // The width a consumer asked for, and nothing else. A stacked panel used to be
    // narrowed from it here, by a step this component counted itself -- interim
    // work while sf-drawer had no way to express a stack. It does now: the drawer
    // insets each window by depth times `stack-offset` and keeps its width, so a
    // stack four deep no longer ends in a sliver. The two interim mechanisms this
    // replaced had drifted apart from each other as well -- the width subtracted a
    // space-5 step while the panel margin drew a space-4 one, so the window moved
    // one distance and shrank by another.
    //
    // A section list is added to the panel rather than taken out of it (owner,
    // 2026-10-07): the fields keep the width the consumer asked for and the
    // window grows by the column beside them. Taken out, a 40rem panel showing
    // sections gave its fields 26rem and the two-column arrangement collapsed --
    // the same record looked narrower for having more in it.
    //
    // Never wider than the window less the strip of controls beside it: the
    // close, copy-link and open-full controls stand on the drawer's edge,
    // outside the panel's inline start, and the drawer places them a step
    // beyond the panel's width without looking at the window. The cap used to
    // be the window less space-4 (32px at the default root size) while the
    // strip takes a control and a step on each side (64px), so in a frame
    // under ~1024px the controls stood half off the screen (docs review,
    // round 4, 2026-10-20). The cap holds for every width, not only for one
    // grown by the rail: a consumer's own panel-width meets the same edge.
    get drawerWidth() {
        const width = this.panelWidth;
        if (!width) return null;
        if (!this.wide) return width;
        // The rail is drawn while the view is arranged even with one section,
        // because that is where a second one is made.
        const railed = this.sectionsAs === "list" && ((this.sections ?? []).length >= 2 || this.configuring);
        const wanted = railed ? `calc(${width} + ${SECTIONS_WIDTH} + var(--sf-space-4))` : width;
        // Never wider than the window: grown by the rail, a 40rem panel ran past
        // the left edge and its sections were cut off (owner, 2026-10-14).
        return `min(${wanted}, calc(100vw - ${this.edgeRoom}))`;
    }

    // One edge control: an sf-icon-button of the panel's size is its text
    // height and the ladder's padding on each side, the same sum the button
    // draws itself with (40px at size 1 on a desktop, 36px on a phone).
    get edgeControlWidth() {
        const step = this.size === "1/2" ? "1\\/2" : "1";
        return `calc(var(--sf-text-height-${step}) + 2 * var(--sf-ui-${step}--space-y-tightness-default))`;
    }

    // What the strip beside a wide panel takes from the window: the drawer's
    // step between the panel and the strip (space-1/2), one control, and the
    // same step again to the window's edge.
    get edgeRoom() {
        return `calc(${this.edgeControlWidth} + 2 * var(--sf-space-1\\/2))`;
    }

    // How many controls the strip carries: close always, copy-link with an
    // address, open-full when the host can open the record as a page.
    get edgeControlCount() {
        return 1 + (this.address ? 1 : 0) + (this.canOpenFullPage ? 1 : 0);
    }

    get closeLabel() {
        return this.getAttribute("close-label") || pageText(PROPERTY_VIEW_TEXT, "closeLabel", this);
    }

    get linkCopiedLabel() {
        return this.getAttribute("link-copied-label") || pageText(PROPERTY_VIEW_TEXT, "linkCopiedLabel", this);
    }

    get copyLinkLabel() {
        return this.getAttribute("copy-link-label") || pageText(PROPERTY_VIEW_TEXT, "copyLinkLabel", this);
    }

    get configureText() {
        return this.getAttribute("configure-text") || pageText(PROPERTY_VIEW_TEXT, "configureText", this);
    }

    get resetViewAskText() {
        return this.getAttribute("reset-view-ask-text") || pageText(PROPERTY_VIEW_TEXT, "resetViewAskText", this);
    }

    get cancelConfiguringText() {
        return this.getAttribute("cancel-configuring-text") || pageText(PROPERTY_VIEW_TEXT, "cancelConfiguringText", this);
    }

    get doneConfiguringText() {
        return this.getAttribute("done-configuring-text") || pageText(PROPERTY_VIEW_TEXT, "doneConfiguringText", this);
    }

    get resetViewText() {
        return this.getAttribute("reset-view-text") || pageText(PROPERTY_VIEW_TEXT, "resetViewText", this);
    }

    get addViewText() {
        return this.getAttribute("add-view-text") || pageText(PROPERTY_VIEW_TEXT, "addViewText", this);
    }

    get newViewText() {
        return this.getAttribute("new-view-text") || pageText(PROPERTY_VIEW_TEXT, "newViewText", this);
    }

    get deleteViewText() {
        return this.getAttribute("delete-view-text") || pageText(PROPERTY_VIEW_TEXT, "deleteViewText", this);
    }

    get lastSharedViewText() {
        return this.getAttribute("last-shared-view-text") || pageText(PROPERTY_VIEW_TEXT, "lastSharedViewText", this);
    }

    get viewProfileLabel() {
        return this.getAttribute("view-profile-label") || pageText(PROPERTY_VIEW_TEXT, "viewProfileLabel", this);
    }

    get personalLayerText() {
        return this.getAttribute("personal-layer-text") || pageText(PROPERTY_VIEW_TEXT, "personalLayerText", this);
    }

    get sharedLayerText() {
        return this.getAttribute("shared-layer-text") || pageText(PROPERTY_VIEW_TEXT, "sharedLayerText", this);
    }

    get widthText() {
        return this.getAttribute("width-text") || pageText(PROPERTY_VIEW_TEXT, "widthText", this);
    }

    get variantText() {
        return this.getAttribute("variant-text") || pageText(PROPERTY_VIEW_TEXT, "variantText", this);
    }

    get hintText() {
        return this.getAttribute("hint-text") || pageText(PROPERTY_VIEW_TEXT, "hintText", this);
    }

    get hiddenText() {
        return this.getAttribute("hidden-text") || pageText(PROPERTY_VIEW_TEXT, "hiddenText", this);
    }

    get configureHintText() {
        return this.getAttribute("configure-hint-text")
            || pageText(PROPERTY_VIEW_TEXT, "configureHintText", this);
    }

    // On a narrow panel the section list is a screen of its own, so a field has
    // nowhere beside the fields to be dropped. The wide sentence names the list
    // on the left, and saying that where there is no list promises something a
    // person cannot do.
    get configureHintNarrowText() {
        return this.getAttribute("configure-hint-narrow-text")
            || pageText(PROPERTY_VIEW_TEXT, "configureHintNarrowText", this);
    }

    get fieldSettingsText() {
        return this.getAttribute("field-settings-text") || pageText(PROPERTY_VIEW_TEXT, "fieldSettingsText", this);
    }

    get shownText() {
        return this.getAttribute("shown-text") || pageText(PROPERTY_VIEW_TEXT, "shownText", this);
    }

    get showRareText() {
        return this.getAttribute("show-rare-text") || pageText(PROPERTY_VIEW_TEXT, "showRareText", this);
    }

    get hideRareText() {
        return this.getAttribute("hide-rare-text") || pageText(PROPERTY_VIEW_TEXT, "hideRareText", this);
    }

    get rareText() {
        return this.getAttribute("rare-text") || pageText(PROPERTY_VIEW_TEXT, "rareText", this);
    }

    get unplacedTitle() {
        return this.getAttribute("unplaced-title") || pageText(PROPERTY_VIEW_TEXT, "unplacedTitle", this);
    }

    get moveUpText() {
        return this.getAttribute("move-up-text") || pageText(PROPERTY_VIEW_TEXT, "moveUpText", this);
    }

    get moveDownText() {
        return this.getAttribute("move-down-text") || pageText(PROPERTY_VIEW_TEXT, "moveDownText", this);
    }

    get addFieldText() {
        return this.getAttribute("add-field-text") || pageText(PROPERTY_VIEW_TEXT, "addFieldText", this);
    }

    get renameText() {
        return this.getAttribute("rename-text") || pageText(PROPERTY_VIEW_TEXT, "renameText", this);
    }

    get saveNameText() {
        return this.getAttribute("save-name-text") || pageText(PROPERTY_VIEW_TEXT, "saveNameText", this);
    }

    get cancelNameText() {
        return this.getAttribute("cancel-name-text") || pageText(PROPERTY_VIEW_TEXT, "cancelNameText", this);
    }

    get removeFieldText() {
        return this.getAttribute("remove-field-text") || pageText(PROPERTY_VIEW_TEXT, "removeFieldText", this);
    }

    get removeGroupText() {
        return this.getAttribute("remove-group-text") || pageText(PROPERTY_VIEW_TEXT, "removeGroupText", this);
    }

    get removeSectionText() {
        return this.getAttribute("remove-section-text") || pageText(PROPERTY_VIEW_TEXT, "removeSectionText", this);
    }

    get addGroupText() {
        return this.getAttribute("add-group-text") || pageText(PROPERTY_VIEW_TEXT, "addGroupText", this);
    }

    get addSectionText() {
        return this.getAttribute("add-section-text") || pageText(PROPERTY_VIEW_TEXT, "addSectionText", this);
    }

    get newGroupTitle() {
        return this.getAttribute("new-group-title") || pageText(PROPERTY_VIEW_TEXT, "newGroupTitle", this);
    }

    get newSectionTitle() {
        return this.getAttribute("new-section-title") || pageText(PROPERTY_VIEW_TEXT, "newSectionTitle", this);
    }

    get sectionIconText() {
        return this.getAttribute("section-icon-text") || pageText(PROPERTY_VIEW_TEXT, "sectionIconText", this);
    }

    get fieldLabelText() {
        return this.getAttribute("field-label-text") || pageText(PROPERTY_VIEW_TEXT, "fieldLabelText", this);
    }

    get inThisGroupText() {
        return this.getAttribute("in-this-group-text") || pageText(PROPERTY_VIEW_TEXT, "inThisGroupText", this);
    }

    get noMatchText() {
        return this.getAttribute("no-match-text") || pageText(PROPERTY_VIEW_TEXT, "noMatchText", this);
    }

    // Where a group stands among the groups a person can see, and how many there
    // are, so the control that moves it knows when it has nowhere to go.
    get currentGroups() {
        const section = (this.sections ?? []).find((part) => String(part.key) === this.selectedSection)
            ?? (this.sections ?? [])[0] ?? null;
        return section?.groups ?? [];
    }

    groupAt(groupKey) {
        return this.currentGroups.findIndex((group) => String(group.key) === String(groupKey));
    }

    get groupCount() {
        return this.currentGroups.length;
    }

    // Moving a group one step, for a person who would rather press than drag --
    // and for anyone who cannot drag at all.
    moveGroupBy(groupKey, step) {
        const at = this.groupAt(groupKey);
        if (at < 0) return false;
        const to = at + step;
        if (to < 0 || to >= this.groupCount) return false;
        const section = (this.sections ?? []).find((part) => String(part.key) === this.selectedSection)
            ?? (this.sections ?? [])[0] ?? null;
        if (!section) return false;
        return this.moveGroup(groupKey, String(section.key), to);
    }

    // Every field this group could hold, with the ones it holds already marked.
    // A collection can have hundreds, so what a person needs is to find one and
    // tick it -- and the ticked set is exactly what this area shows, which makes
    // unticking the way a field leaves it.
    //
    // Where a field lives now is said once, as a heading over the stretch of
    // list that comes from there, rather than after every name in it: written
    // into the row, the area's name was repeated on every line and pushed the
    // name it mattered for off the end.
    //
    // The order and the headings are a snapshot taken when the list opens.
    // Ticking a field moves it into this area, so a live grouping would move the
    // row out from under the pointer at the moment it was pressed -- and a list
    // that rearranges itself as you tick is a list nobody can tick twice.
    fieldChoices(groupKey) {
        const key = String(groupKey);
        const session = this._addSession?.group === key
            ? this._addSession
            : this._buildAddSession(key);
        const here = new Set();
        for (const field of this._locateGroup(key)?.group?.fields ?? []) here.add(String(field.key));

        const search = this.addSearch.trim().toLowerCase();
        const options = [];
        for (const entry of session.order) {
            if (search && !entry.label.toLowerCase().includes(search)
                && !entry.key.toLowerCase().includes(search)) continue;
            options.push({...entry, selected: here.has(entry.key)});
        }
        return options;
    }

    _buildAddSession(groupKey) {
        const key = String(groupKey);
        const order = [];
        const seen = new Set();
        const take = (field, from) => {
            const fieldKey = String(field.key);
            if (seen.has(fieldKey)) return;
            seen.add(fieldKey);
            order.push({key: fieldKey, label: String(field.label ?? field.key), group: from});
        };

        for (const field of this._locateGroup(key)?.group?.fields ?? []) take(field, this.inThisGroupText);
        for (const field of this.unplaced ?? []) take(field, this.unplacedTitle);
        for (const section of this.sections ?? []) {
            for (const group of section.groups ?? []) {
                if (String(group.key) === key || group.kind === "related") continue;
                const from = String(group.label ?? group.key);
                for (const field of group.fields ?? []) take(field, from);
            }
        }
        return {group: key, order};
    }

    // The list opens on a snapshot of where every field is, and forgets it when
    // it closes, so the next opening is read against what the arrangement became.
    startAddSession(groupKey) {
        this._addSearch = "";
        this._addSession = this._buildAddSession(groupKey);
        this.requestComponentUpdate("add-session");
        return this._addSession;
    }

    endAddSession() {
        this._addSession = null;
        this._addSearch = "";
        this.requestComponentUpdate("add-session");
    }

    get addSearch() {
        return this._addSearch ?? "";
    }

    setAddSearch(value) {
        this._addSearch = String(value ?? "");
        this.requestComponentUpdate("add-search");
        return this._addSearch;
    }

    // Ticking places the field here; unticking takes it out of every area, which
    // is where a field goes when it belongs to none.
    toggleFieldInGroup(fieldKey, groupKey, wanted) {
        return wanted
            ? this.moveField(fieldKey, groupKey, Number.MAX_SAFE_INTEGER)
            : this.moveFieldToUnplaced(fieldKey);
    }

    get unplacedHintText() {
        return this.getAttribute("unplaced-hint-text") || pageText(PROPERTY_VIEW_TEXT, "unplacedHintText", this);
    }

    get viewConflictText() {
        return this.getAttribute("view-conflict-text") || pageText(PROPERTY_VIEW_TEXT, "viewConflictText", this);
    }

    // The head's own words. The port carries a collection *key* and no record
    // title, icon or favourite state, and the port is fixed at 1.7.0 for this
    // work -- so these are the component's inputs, set by the host the way
    // `panel-label` and `panel-width` already are, rather than a port change.
    get collectionLabel() {
        return this.getAttribute("collection-label") || "";
    }

    get collectionIcon() {
        return this.getAttribute("collection-icon") || "";
    }

    get favourite() {
        return this.hasAttribute("favourite");
    }

    get favouriteLabel() {
        return this.getAttribute("favourite-label") || pageText(PROPERTY_VIEW_TEXT, "favouriteLabel", this);
    }

    get menuLabel() {
        return this.getAttribute("menu-label") || pageText(PROPERTY_VIEW_TEXT, "menuLabel", this);
    }

    // What a value inherited from somewhere else is marked with. The prototype
    // writes «по умолчанию» beside it, so a person can see that the record has not
    // decided this and that changing the source will change it here.
    get inheritedText() {
        return this.getAttribute("inherited-text") || pageText(PROPERTY_VIEW_TEXT, "inheritedText", this);
    }

    // The star answers the press at once and reports it. Storing a favourite is
    // the host's, and a host that refuses sets the attribute back -- but a star
    // that does nothing until an answer arrives reads as a control that is
    // broken, which is what it read as on the stand.
    toggleFavourite() {
        const next = !this.favourite;
        this.toggleAttribute("favourite", next);
        this.requestComponentUpdate("favourite");
        this.dispatchEvent(new CustomEvent("sf-property-view-favourite", {
            bubbles: true,
            composed: true,
            detail: {record_id: this.recordId || null, collection: this.collection || null, favourite: next},
        }));
        return true;
    }

    // The «⋯» menu: what belongs to the view rather than to the record. Configure
    // and reset live here, as the mockup has them, so the panel head carries one
    // control instead of a row of words.
    get panelMenuItems() {
        const items = [];
        if (this.canConfigureView && !this.configuring) {
            items.push({id: "configure", name: this.configureText, icon: "tune"});
        }
        // Resetting is not offered here while the view is being arranged: the
        // bar at the foot carries «Сбросить» with a confirmation beside the
        // other two answers, and the same act behind a «⋯» as well is the same
        // destruction reachable two ways, one of them quietly (owner,
        // 2026-10-08).
        if (this.hasRare) {
            items.push({
                id: "show-rare",
                name: this.showRare ? this.hideRareText : this.showRareText,
                icon: this.showRare ? "unfold_less" : "unfold_more",
            });
        }
        return items;
    }

    // ─── the standard menu (owner, 2026-10-12) ──────────────────────────────
    // The «⋯» and the view chooser open the Framework's standard menu: one
    // sf-context-menu beside the page, filled for whichever control asked.
    async openStandardMenu(anchor, {label, entries, select, align = "end"}) {
        if (!(anchor instanceof Element)) return null;
        // The panel did not draw a menu before, so its rule does not fetch one;
        // the Loader is asked for it the first time it is wanted.
        if (!customElements.get("sf-context-menu")) {
            globalThis.SF?.Loader?.ensureSmartElementLoaded?.("sf-context-menu");
            await Promise.race([
                customElements.whenDefined("sf-context-menu"),
                new Promise((settle) => setTimeout(settle, 3000)),
            ]);
        }
        let menu = this._standardMenu;
        if (!menu?.isConnected) {
            menu = document.createElement("sf-context-menu");
            menu.setAttribute("popup", "");
            menu.dataset.sfPropertyViewMenu = "";
            menu.addEventListener("sf-context-menu-select", (event) => this._standardMenuSelect?.(event.detail?.id));
            (this.closest("dialog[open]") || document.body).append(menu);
            this._standardMenu = menu;
        }
        if (menu.isOpen && this._standardMenuAnchor === anchor) {
            menu.close();
            return null;
        }
        menu.setAttribute("aria-label", label ?? "");
        menu.entries = entries;
        this._standardMenuSelect = select;
        this._standardMenuAnchor = anchor;
        return menu.openFor(anchor, {align});
    }

    // The views as radio rows: which one is in use, and whose it is.
    viewProfileEntries() {
        const current = this.viewProfile;
        return this.viewProfiles.map((profile) => ({
            id: `view-profile:${profile.id}`, text: profile.label, kind: "radio", checked: profile.id === current,
            icon: profile.shared ? "group" : "person",
            caption: profile.shared ? this.sharedLayerText : this.personalLayerText,
        }));
    }

    openPanelMenu(anchor) {
        const entries = [];
        const profiles = this.viewProfiles;
        // The view is chosen from the menu as the admin menu's profile is: a
        // submenu of the views, beside what can be done to the view (owner,
        // 2026-10-12). While arranging, the bar at the foot carries the choice.
        if (profiles.length > 1 && !this.configuring) {
            const current = profiles.find((profile) => profile.id === this.viewProfile);
            entries.push({
                id: "view-profile", text: this.viewProfileLabel, icon: "view_sidebar",
                value: current?.label ?? "", submenu: this.viewProfileEntries(),
            });
        }
        const items = this.panelMenuItems;
        if (entries.length && items.length) entries.push({type: "separator"});
        entries.push(...items.map((item) => ({id: item.id, text: item.name, icon: item.icon})));
        const hosted = this.hostMenuEntries();
        if (entries.length && hosted.length) entries.push({type: "separator"});
        entries.push(...hosted);
        if (!entries.length) return null;
        return this.openStandardMenu(anchor, {
            label: this.menuLabel, entries,
            select: (id) => this._chooseStandardEntry(id),
        });
    }

    openViewProfileMenu(anchor) {
        return this.openStandardMenu(anchor, {
            label: this.viewProfileLabel, entries: this.viewProfileEntries(), align: "start",
            select: (id) => this._chooseStandardEntry(id),
        });
    }

    // The host's own menu items, as rows of the standard menu: its text, its
    // icon (icon, icon-start or data-icon), a link row for an address.
    hostMenuElements() {
        // In a panel the holder is in the drawer, which is moved to the page's end.
        const holder = this.querySelector("[data-host-menu]")
            ?? this.panelContent?.()?.querySelector?.("[data-host-menu]");
        return holder ? [...holder.children] : [];
    }

    hostMenuEntries() {
        return this.hostMenuElements().map((element, at) => {
            const control = element.matches("a[href], button") ? element : element.querySelector("a[href], button") ?? element;
            const text = (element.getAttribute("text") ?? element.getAttribute("aria-label") ?? control.textContent ?? "").trim();
            const href = control.matches?.("a[href]") ? control.getAttribute("href") : null;
            return {
                id: `host:${at}`, text,
                icon: element.getAttribute("icon") ?? element.getAttribute("icon-start") ?? element.dataset.icon ?? undefined,
                href: href || undefined,
                danger: element.getAttribute("scheme") === "error" || element.dataset.danger === "true",
                disabled: element.hasAttribute("disabled") || control.disabled === true,
            };
        }).filter((entry) => entry.text);
    }

    _chooseStandardEntry(id) {
        const value = String(id ?? "");
        if (value.startsWith("host:")) {
            const element = this.hostMenuElements()[Number(value.slice("host:".length))];
            const control = element?.matches("a[href], button") ? element : element?.querySelector("a[href], button") ?? element;
            if (!control?.matches?.("a[href]")) control?.click?.();
            return true;
        }
        if (value.startsWith("view-profile:")) return this.selectViewProfile(value.slice("view-profile:".length));
        return this.chooseMenuItem(value);
    }

    chooseMenuItem(id) {
        if (id === "configure") return this.startConfiguringView();
        if (id === "reset") return this.resetView();
        if (id === "show-rare") return this.toggleShowRare();
        return false;
    }

    get backLabel() {
        return this.getAttribute("back-label") || pageText(PROPERTY_VIEW_TEXT, "backLabel", this);
    }

    get viewDeniedText() {
        return this.getAttribute("view-denied-text") || pageText(PROPERTY_VIEW_TEXT, "viewDeniedText", this);
    }

    get openFullLabel() {
        return this.getAttribute("open-full-label") || pageText(PROPERTY_VIEW_TEXT, "openFullLabel", this);
    }

    // Where this object lives, as the host named it when it answered. Never
    // constructed here: a composite that built a URL would be guessing at the
    // consumer's routing.
    get address() {
        return this.record?.address ?? null;
    }

    // Opening the record as a page is the host's, and so is whether there is a
    // page at all: an address worth copying does not promise one. Drawn on the
    // address alone, the control stood in every panel and did nothing in the
    // hosts that route no further.
    get canOpenFullPage() {
        return Boolean(this.address) && Boolean(this.hostPort?.capabilities?.includes?.("record-open"));
    }

    static get observedAttributes() {
        return [...(super.observedAttributes ?? []), "record-id"];
    }

    attributeChangedCallback(name, previous, next) {
        super.attributeChangedCallback?.(name, previous, next);
        if (previous === next || !this.isConnected) return;
        if (name === "record-id") this.load("record-id-changed");
    }

    onConnected() {
        super.onConnected?.();
        // Born loading. The first render comes before the host is asked, and
        // drawn with no state it was the empty body -- one frame of «nothing
        // here» before the skeleton, the flash the table had (rules of the
        // road, rule 2: loading is drawn as the skeleton, from the first frame).
        if (!this.hasAttribute("data-state") && !this.record) {
            this.setAttribute("data-state", "loading");
            this.setAttribute("aria-busy", "true");
        }
        if (this.panel && !openPanels.includes(this)) {
            openPanels.push(this);
            restackPanels();
        }
        // The drawer's own close-on-esc is off, because in a stack Esc must close
        // the top window and not every one of them.
        //
        // The listener is on the document rather than on the element, and that is
        // not a preference: sf-drawer portals its content out, so an open panel is
        // not a descendant of this element at all. On the element the handler
        // would never have fired from a real keypress -- only from an event
        // dispatched at the element itself, which is exactly what the first probe
        // did, so it passed while the feature did not work.
        //
        // It acts only when the focus is inside this panel, or when nothing is
        // focused. With a stack the top window is the one holding focus, so the
        // same rule closes the right window then too.
        this._onKeyDown = (event) => {
            if (event.key !== "Escape" || !this.panel) return;
            // A surface opened inside this panel takes the press. Both listen on
            // the document in capture, where stopPropagation cannot reach a
            // listener on the same node, so the one that opened last says so on
            // the root and this one stands back.
            if (document.documentElement.dataset.sfPopoverOpen) return;
            // An open field-settings surface takes the first Esc. Both handlers
            // sit on the document in capture, where stopPropagation does not
            // reach a listener on the same node -- so the two share one.
            // The top window, and no other. The first version guessed from where
            // the focus happened to be, which was the best a single panel could
            // do; with the order known the guess is gone.
            if (topPanel() !== this) return;
            event.stopPropagation();
            this.closePanel("escape");
        };
        document.addEventListener("keydown", this._onKeyDown, true);
        // The drop is sf-sortable's to report and the component's to apply or
        // refuse -- that is the seam the mechanism already publishes, so no drag
        // is implemented here. The lists name themselves `field:<group>` and
        // `group:<section>`, which is what `to` carries.
        this._onSortableIntent = (event) => {
            if (!this.configuring) return;
            const detail = event.detail ?? {};
            const [kind, container] = String(detail.to ?? "").split(":");
            if (!container) return;
            if (kind === "section") this.moveSection(detail.item, detail.index);
            else if (kind === "field") this.moveField(detail.item, container, detail.index);
            else if (kind === "group") this.moveGroup(detail.item, container, detail.index);
            else if (kind === "unplaced") this.moveFieldToUnplaced(detail.item, detail.index);
        };
        this.addEventListener("sf-sortable-intent", this._onSortableIntent);
        // A panel is portalled out of this element, so an intent raised inside one
        // never bubbles to it. The document listener catches those, and checks the
        // list belongs to this record before acting -- two stacked panels are two
        // components, and the wrong one applying the move would rearrange a view
        // nobody was looking at.
        this._onDocumentSortableIntent = (event) => {
            if (!this.panel || !this.configuring) return;
            const panel = event.target?.closest?.(".sf-property-view-panel");
            if (!panel || panel.getAttribute("data-record-id") !== String(this.recordId)) return;
            this._onSortableIntent(event);
        };
        document.addEventListener("sf-sortable-intent", this._onDocumentSortableIntent);
        // The not-placed bin is an accordion, closed by default, and a drop
        // target nobody can see is a drop target nobody uses. So a drag opens
        // it -- by pressing its trigger, the way a person would, because the
        // accordion owns whether it is open and a second controller would
        // fight it. It is pressed back when the drag ends, and only if this is
        // what opened it: a person who opened it themselves keeps it open
        // (owner, 2026-10-09).
        this._onSortableState = (event) => {
            if (!this.configuring) return;
            const state = event.detail?.state;
            // The panel is portalled out of this element, so it is reached the
            // way the sortable intents are reached: by the record it carries.
            // `this.panel` is not an element and querying it found nothing,
            // which is why the bin stayed shut through a whole drag.
            const panel = globalThis.document?.querySelector?.(
                `.sf-property-view-panel[data-record-id="${this.recordId}"]`,
            );
            const trigger = panel?.querySelector?.('[data-action="toggle-unplaced"]');
            if (!trigger) return;
            const open = trigger.getAttribute("aria-expanded") === "true";
            if (state === "picked") {
                this._openedForDrag = !open;
                if (!open) trigger.click();
                return;
            }
            if (state !== "dropped" && state !== "cancelled") return;
            if (this._openedForDrag && trigger.getAttribute("aria-expanded") === "true") trigger.click();
            this._openedForDrag = false;
        };
        document.addEventListener("sf-sortable-state", this._onSortableState);
        this.wideMedia = typeof globalThis.matchMedia === "function"
            ? globalThis.matchMedia(WIDE_MEDIA_QUERY)
            : null;
        this.wide = this.wideMedia ? this.wideMedia.matches : true;
        this._onWideChange = (event) => {
            this.wide = event.matches;
            // Leaving the phone arrangement leaves its navigation behind: a section
            // screen is a phone idea, and keeping the state would show a desktop a
            // single section with a back arrow and no way to see the others.
            if (this.wide) this.phoneSection = null;
            this.requestComponentUpdate("viewport");
        };
        this.wideMedia?.addEventListener?.("change", this._onWideChange);
        if (this.hostPort) this.load("connected");
        else this._requestHostPort();
    }

    // The shared convention for a component that takes a host port: ask for one
    // rather than wait to be given it, so a consumer composing this inside
    // something else does not have to find the element and call a method on it.
    // Once per connection and only while there is no port; `setHostPort` answers,
    // at once or later. The same event every such component raises, so a host
    // answers them all the same way.
    _requestHostPort() {
        if (this.hostPort || this._portRequested) return false;
        this._portRequested = true;
        this.dispatchEvent(new CustomEvent("sf-host-port-request", {
            bubbles: true,
            composed: true,
            detail: {
                component: this,
                context: {owner: "property-view", record: this.recordId || null, group: null},
            },
        }));
        return true;
    }

    onDisconnected() {
        this._standardMenu?.close?.({restoreFocus: false});
        this._standardMenu?.remove();
        this._standardMenu = null;
        // Once per connection, so an element moved in the DOM asks again.
        this._portRequested = false;
        const at = openPanels.indexOf(this);
        if (at >= 0) {
            openPanels.splice(at, 1);
            restackPanels();
        }
        if (this._onKeyDown) document.removeEventListener("keydown", this._onKeyDown, true);
        this._onKeyDown = null;
        // The settings surface listens on the document, so a panel that goes away
        // while it is open takes that listener with it.
        this.configuring = false;
        this._bindSectionDropTarget();
        if (this._onSortableIntent) this.removeEventListener("sf-sortable-intent", this._onSortableIntent);
        this._onSortableIntent = null;
        // A document listener outliving its component would go on applying drops
        // and writing a layer for a record nobody has open.
        if (this._onDocumentSortableIntent) {
            document.removeEventListener("sf-sortable-intent", this._onDocumentSortableIntent);
        }
        if (this._onSortableState) {
            document.removeEventListener("sf-sortable-state", this._onSortableState);
        }
        this._onDocumentSortableIntent = null;
        if (this._onWideChange) this.wideMedia?.removeEventListener?.("change", this._onWideChange);
        this._onWideChange = null;
        this.wideMedia = null;
        super.onDisconnected?.();
    }

    // Where this panel's content actually lives. The drawer moves it out of the
    // element, so anything looking for the panel -- a key handler, a probe, a
    // stack deciding which window is on top -- has to ask rather than assume.
    panelContent() {
        const drawer = this.querySelector("sf-drawer") ?? this._panelDrawer ?? null;
        const inside = drawer?.querySelector?.(".sf-property-view-panel");
        if (inside) return inside;
        const instance = this.getAttribute("record-id") || "";
        const candidates = [...document.querySelectorAll(".sf-property-view-panel")];
        return candidates.find((node) => node.dataset.recordId === instance) ?? null;
    }

    // A host adapter exposes raise(intent, payload, {signal}); no transport is
    // implied, exactly as for sf-data-view.
    setHostPort(host) {
        if (!host || typeof host.raise !== "function" || !SUPPORTED_PORT_VERSIONS.includes(host.version)) {
            throw new TypeError(
                `sf-property-view requires a declared property-view host port: ${SUPPORTED_PORT_VERSIONS.join(", ")}`,
            );
        }
        this.hostPort = host;
        if (this.isConnected) this.load("host-connected");
        return this;
    }

    visible(entries, {conditions = true} = {}) {
        const values = conditions ? this.fieldValues() : null;
        return (Array.isArray(entries) ? entries : [])
            .filter((entry) => entry && entry.hidden !== true)
            .filter((entry) => this.showRare || entry.rare !== true)
            // A field its condition hides is not drawn (port 1.14.0). Not while
            // the view is arranged -- the template lists every entry then -- and
            // not by the view: `hidden` is the arrangement's, `when` the values'.
            .filter((entry) => !values || !entry.when || fieldConditions(entry, values).visible);
    }

    // Every field's value as it stands on screen: what the record holds, or what
    // the person changed it to and has not saved. The conditions read these, so
    // a field appears the moment the value it waits for is chosen, before any
    // save -- and a condition over a field in another group, closed, reads what
    // that field holds.
    fieldValues() {
        const values = new Map();
        const take = (field) => {
            if (!field || field.key === undefined || field.key === null) return;
            const key = String(field.key);
            values.set(key, this.changed.has(key) ? this.changed.get(key) : field.value);
        };
        for (const section of this.sections ?? []) {
            for (const group of section?.groups ?? []) (group?.fields ?? []).forEach(take);
        }
        this.unplaced.forEach(take);
        return values;
    }

    // A field as its conditions make it: required as `when.required` says, and
    // drawn disabled -- as `readonly` is -- while `when.enabled` does not hold.
    // The field itself is the host's and is not written to.
    conditionedField(field, values = this.fieldValues()) {
        if (!field?.when) return field;
        const decided = fieldConditions(field, values);
        return {
            ...field,
            required: decided.required,
            readonly: field.readonly === true || !decided.enabled,
        };
    }

    // The keys of the fields their conditions hide now.
    _hiddenByCondition() {
        const values = this.fieldValues();
        const hidden = new Set();
        const check = (field) => {
            if (field?.when && !fieldConditions(field, values).visible) hidden.add(String(field.key));
        };
        for (const section of this.sections ?? []) {
            for (const group of section?.groups ?? []) (group?.fields ?? []).forEach(check);
        }
        this.unplaced.forEach(check);
        return hidden;
    }

    // What a save carries: the changed fields, less every field its condition
    // hides (port 1.14.0). Such a field is left out, not emptied: it keeps what
    // it holds -- its own value or an inherited one -- because hidden by a
    // condition is not the same as cleared, and a contract type switched back
    // and forth must not lose the date it had. What the person typed into it
    // stays among the changes, unsent, and is sent if the field shows again.
    _savedValues() {
        const hidden = this._hiddenByCondition();
        return Object.fromEntries([...this.changed].filter(([key]) => !hidden.has(key)));
    }

    templateContext() {
        const props = this.getPropsContext();

        return this.createTemplateContext({
            ...props,
            component: this,
            hostPort: this.hostPort,
            size: this.size,
            mode: this.mode,
            mayEdit: this.mayEdit,
            openAll: this.openAll,
            createText: pageText(PROPERTY_VIEW_TEXT, "createText", this),
            emptyText: this.emptyText,
            emptyRecordText: this.emptyRecordText,
            isEmptyRecord: this.isEmptyRecord,
            // The first load draws the fields it waits for; a failed one says
            // why in sf-empty-state.
            loading: this.getAttribute("data-state") === "loading" && !this.record,
            loadFailure: this.record ? null : this.loadFailure ?? null,
            editText: this.editText,
            saveText: this.saveText,
            cancelText: this.cancelText,
            deleteText: this.deleteText,
            recordActions: this.recordActions,
            changedText: this.changedText,
            errorsText: this.errorsText,
            sectionsLabel: this.sectionsLabel,
            sectionsAs: this.sectionsAs,
            sections: this.sections,
            selectedSection: this.selectedSection,
            editing: this.editing,
            changed: this.changed,
            errors: this.inputErrors.size ? new Map([...this.errors, ...this.inputErrors]) : this.errors,
            dateTimeText: {
                dateLabel: pageText(PROPERTY_VIEW_TEXT, "dateTimeDateLabel", this),
                timeLabel: pageText(PROPERTY_VIEW_TEXT, "dateTimeTimeLabel", this),
                placeholder: pageText(PROPERTY_VIEW_TEXT, "timePlaceholderText", this),
            },
            canPickRecords: this.canPickRecords,
            canUploadFiles: this.canUploadFiles,
            // The base captures the host's slot content in connectedCallback,
            // before the first render, and returns live nodes by reference -- so a
            // consumer's listeners and open state survive every render. A second
            // mechanism was written here and deleted: it collected in onConnected,
            // which runs after lit has rendered into the element and cleared the
            // host's children, so it collected nothing at all.
            hostSlot: (name) => this.getSlotContent(name),
            hasHostSlot: (name) => this.hasSlotContent(name),
            address: this.address,
            stackDepth: this.stackDepth,
            drawerWidth: this.drawerWidth,
            sectionsWidth: SECTIONS_WIDTH,
            isTopPanel: this.isTopPanel,
            conflict: this.conflict,
            confirmation: this.confirmation,
            confirmSaveText: pageText(PROPERTY_VIEW_TEXT, "confirmSaveText", this),
            keepEditingText: pageText(PROPERTY_VIEW_TEXT, "keepEditingText", this),
            message: this.message,
            visible: (entries) => this.visible(entries),
            conditionedField: (field) => this.conditionedField(field),
            canConfigureView: this.canConfigureView,
            configuring: this.configuring,
            unplaced: this.unplaced,
            viewTarget: this.viewTarget,
            editableLayers: this.editableLayers,
            viewProfiles: this.viewProfiles,
            viewProfile: this.viewProfile,
            canDeleteViewProfile: (id) => this.canDeleteViewProfile(id),
            layerDenied: (kind) => this.layerDenied(kind),
            canChangeVisibility: (entry) => this.canChangeVisibility(entry),
            entryError: (kind, key) => this.entryError(kind, key),
            configureText: this.configureText,
            doneConfiguringText: this.doneConfiguringText,
            resetViewText: this.resetViewText,
            resetViewAskText: this.resetViewAskText,
            cancelConfiguringText: this.cancelConfiguringText,
            resetAsked: this.resetAsked,
            personalLayerText: this.personalLayerText,
            viewProfileLabel: this.viewProfileLabel,
            addViewText: this.addViewText,
            newViewText: this.newViewText,
            deleteViewText: this.deleteViewText,
            lastSharedViewText: this.lastSharedViewText,
            sharedLayerText: this.sharedLayerText,
            widthText: this.widthText,
            fieldLabelText: this.fieldLabelText,
            sectionIcons: this.sectionIcons,
            sectionIconChoices: this.sectionIconChoices,
            sectionIconText: this.sectionIconText,
            variantText: this.variantText,
            hintText: this.hintText,
            hiddenText: this.hiddenText,
            configureHintText: this.wide ? this.configureHintText : this.configureHintNarrowText,
            fieldSettingsText: this.fieldSettingsText,
            shownText: this.shownText,
            showRareText: this.showRareText,
            hideRareText: this.hideRareText,
            rareText: this.rareText,
            unplacedTitle: this.unplacedTitle,
            moveUpText: this.moveUpText,
            moveDownText: this.moveDownText,
            addFieldText: this.addFieldText,
            canOpenFullPage: this.canOpenFullPage,
            groupAt: (groupKey) => this.groupAt(groupKey),
            groupCount: this.groupCount,
            fieldChoices: (groupKey) => this.fieldChoices(groupKey),
            addSearch: this.addSearch,
            inThisGroupText: this.inThisGroupText,
            renameText: this.renameText,
            saveNameText: this.saveNameText,
            cancelNameText: this.cancelNameText,
            removeFieldText: this.removeFieldText,
            removeGroupText: this.removeGroupText,
            removeSectionText: this.removeSectionText,
            addGroupText: this.addGroupText,
            addSectionText: this.addSectionText,
            newGroupTitle: this.newGroupTitle,
            newSectionTitle: this.newSectionTitle,
            renaming: this.renaming,
            noMatchText: this.noMatchText,
            unplacedHintText: this.unplacedHintText,
            panelMenuItems: this.panelMenuItems,
            collectionLabel: this.collectionLabel,
            collectionIcon: this.collectionIcon,
            favourite: this.favourite,
            favouriteLabel: this.favouriteLabel,
            menuLabel: this.menuLabel,
            addressUrl: this.addressUrl ?? this.address,
            copyFeedbackMs: COPY_FEEDBACK_MS,
            linkCopiedLabel: this.linkCopiedLabel,
            // The three the head draws beside those, which were not here. Every
            // label the panel shows is resolved by a getter that reads the
            // page's language; a label left out of this context falls through
            // to the declared default instead, which is English. So on a
            // Russian page the panel's head read «В избранное», «Ещё» and
            // «Ссылка скопирована» beside «Close», «Copy link» and «Open as a
            // page» -- one header in two languages. `linkCopiedLabel` being
            // here while `copyLinkLabel` was not is the shape of a line added
            // one at a time (owner, 2026-10-10, on the admin polygon).
            closeLabel: this.closeLabel,
            copyLinkLabel: this.copyLinkLabel,
            openFullLabel: this.openFullLabel,
            inheritedText: this.inheritedText,
            wide: this.wide,
            edgeControlWidth: this.edgeControlWidth,
            edgeControlCount: this.edgeControlCount,
            phoneSection: this.phoneSection,
            phoneSectionLabel: this.phoneSectionLabel,
            backLabel: this.backLabel,
        });
    }

    template() {
        return renderPropertyViewTemplate(this.templateContext());
    }

    _setState(state, message = "") {
        // Loading again while loading draws nothing new: the skeleton is already
        // on screen (one action, one render).
        const unchanged = state === "loading" && this.getAttribute("data-state") === "loading" && !this.record;
        this.setAttribute("data-state", state);
        this.setAttribute("aria-busy", state === "loading" ? "true" : "false");
        this.message = message;
        if (!unchanged) this.requestComponentUpdate("state");
        this.dispatchEvent(new CustomEvent("sf-property-view-state", {
            bubbles: true, composed: true, detail: {state, message},
        }));
    }

    // Whether an answer still describes something on screen is the caller's
    // question, not this method's. One counter for every intent was wrong the
    // moment two reads could be in flight at once: opening a group asks for the
    // candidates of every reference field in it in the same tick, each ask bumped
    // the one counter, and only the last answer was kept -- the others were
    // dropped and their fields sat at «Загрузка записей» for ever. A consumer
    // found it with four reference fields in one group; the probe had one, and one
    // is a number at which concurrency does not exist.
    async _raise(intent, payload, {stale = () => false} = {}) {
        if (!this.hostPort) {
            this._setState("error", pageText(PROPERTY_VIEW_TEXT, "statePortNotConnected", this));
            return {answer: "unavailable", reason: "port-not-connected"};
        }
        try {
            const answer = await this.hostPort.raise(intent, copy(payload), {});
            // A late answer is dropped rather than rendered: what it describes is
            // not what is on screen any more.
            if (!this.isConnected || stale()) return null;
            if (!answer || !["applied", "conflict", "refused", "unavailable"].includes(answer.answer)) {
                throw new TypeError("Host answer is not a declared port answer");
            }
            // A saved record tells the rest of the page what changed, on the
            // page host's outputs (simai.interface-fragment, effects).
            if (answer.answer === "applied" && Array.isArray(answer.effects) && answer.effects.length) {
                globalThis.SF?.Composition?.publishEffects?.(answer.effects, {origin: this});
            }
            return answer;
        } catch (error) {
            if (!this.isConnected || stale()) return null;
            this._setState("error", pageText(PROPERTY_VIEW_TEXT, "stateLoadFailed", this));
            return {answer: "unavailable", reason: "host-threw", message: String(error?.message || error)};
        }
    }

    async load(reason = "requested") {
        this._setState("loading", pageText(PROPERTY_VIEW_TEXT, "stateLoading", this));
        this.loadFailure = null;
        const epoch = ++this.epoch;
        const creating = this.mode === "create";
        const answer = await this._raise("record.load", {
            record_id: creating ? null : this.recordId || null,
            collection: this.collection || null,
            reason,
            // An empty object of the collection, laid out by its arrangement
            // (port 1.12.0).
            ...(creating ? {mode: "create"} : {}),
        }, {stale: () => epoch !== this.epoch});
        if (!answer) return null;
        // A panel is placed before the host names its record: asked with no
        // record, the host answered «unavailable», and «Запись недоступна» stood
        // in the panel until the record's own answer came (owner, 2026-10-14).
        // Not having been told which record is not a failure: the panel waits,
        // loading, for its record.
        if (answer.answer !== "applied" && !creating && !this.recordId) return answer;
        if (answer.answer !== "applied") {
            // Said by the empty state, only once there is an answer: refused is
            // no access; anything else could not load, with «Повторить».
            this.loadFailure = {kind: answer.answer === "refused" ? "no-access" : "error", text: answer.message || ""};
            this._setState("error", answer.message || pageText(PROPERTY_VIEW_TEXT, "stateUnavailable", this));
            return answer;
        }
        this.record = answer.record ?? null;
        // Copied, not held by reference. Configuring moves a field between groups
        // in this array before the host answers -- «applied immediately» is what
        // the request asks for -- and a component that did that to the object the
        // host handed it would be rearranging the host's own data. A host that
        // caches its answer would find its record silently rewritten by a drag it
        // had not accepted yet.
        this.sections = Array.isArray(answer.record?.sections) ? copy(answer.record.sections) : [];
        this.view = answer.record?.view ?? null;
        // A target the person may no longer write cannot stay selected: the rights
        // travel with the answer, so they can change between two loads.
        const editable = this.editableLayers;
        if (!editable.includes(this.viewTarget)) this.viewTarget = editable[0] ?? "personal";
        if (!editable.length) this.configuring = false;
        this.layerDraft = this.configuring ? this._layerCopy(this.viewTarget) : null;
        this.entryErrors = new Map();
        const known = this.sections.some((section) => String(section.key) === this.selectedSection);
        if (!known) this.selectedSection = this.sections.length ? String(this.sections[0].key) : null;
        this._setState("ready");
        return answer;
    }

    // The two the file editor asks of a host, and the capability that decides
    // whether the editor exists at all. Without it a file field shows what it
    // already holds, read-only -- the same arrangement as the record picker.
    get canUploadFiles() {
        return Boolean(this.hostPort?.capabilities?.includes("field-upload"));
    }

    getFieldUploads(field) {
        return this.uploads.get(String(field.key ?? "")) ?? [];
    }

    async startFieldUpload(field, items) {
        const key = String(field.key ?? "");
        const chosen = Array.isArray(items) ? items : [];
        if (!chosen.length) return null;
        // Recorded before anything is sent, because the component is the only
        // thing that knows what the person chose: sf-file-upload fills its own
        // list and every render writes this one over it.
        this.uploads.set(key, [...this.getFieldUploads(field), ...chosen]);
        this.requestComponentUpdate("uploads");

        for (const item of chosen) {
            const answer = await this._raise("field.upload", {
                record_id: this.recordId || null,
                collection: this.collection || null,
                field: key,
                file: item.file ?? item,
            }, {stale: () => !this.uploads.has(key)});
            if (!answer) return null;
            const current = this.getFieldUploads(field);
            if (answer.answer === "applied" && answer.file) {
                // A stored file is a value change like any other: it joins what
                // the person has changed and waits for the save button. Nothing
                // about the record is written here.
                const held = this.changed.has(key) ? this.changed.get(key) : field.value;
                const list = Array.isArray(held) ? held : held ? [held] : [];
                this.changed.set(key, [...list, answer.file]);
                this.uploads.set(key, current.filter((entry) => entry !== item));
                this.errors.delete(key);
            } else {
                this.uploads.set(key, current.map((entry) => (entry === item
                    ? {...entry, state: "error", errorMessage: answer.message || answer.reason || ""}
                    : entry)));
                if (answer.answer === "refused" && answer.reason) {
                    this.errors.set(key, String(answer.message || answer.reason));
                }
            }
            this.requestComponentUpdate("uploads");
        }
        return this;
    }

    retryFieldUpload(field, index) {
        const key = String(field.key ?? "");
        const current = this.getFieldUploads(field);
        const item = current[Number(index)];
        if (!item) return null;
        this.uploads.set(key, current.filter((entry) => entry !== item));
        return this.startFieldUpload(field, [item]);
    }

    // A reference value was activated. The component asks and decides nothing:
    // following the href would be routing for the consumer, and opening a window
    // itself would be deciding whether a half-edited window may be covered.
    async openReference(field, value) {
        if (!value || typeof value !== "object") return null;
        const answer = await this._raise("record.open", {
            record_id: this.recordId || null,
            collection: this.collection || null,
            field: String(field.key ?? ""),
            value,
        }, {stale: () => !this.isConnected});
        this.dispatchEvent(new CustomEvent("sf-property-view-open-record", {
            bubbles: true, composed: true,
            detail: {field: String(field.key ?? ""), value, answer: answer?.answer ?? null},
        }));
        return answer;
    }

    get stackDepth() {
        const at = openPanels.indexOf(this);
        return at < 0 ? 0 : at;
    }

    get isTopPanel() {
        return topPanel() === this;
    }

    // What a panel's three controls do, and all three are the host's decisions
    // announced rather than carried out here. The component closes itself, says
    // what was copied, and says what should be opened; where a window goes, and
    // whether it may close over unsaved edits, belongs to whoever placed it.
    closePanel(reason = "close") {
        this._commitFocusedEntry();
        const unsaved = this.unsavedFields;
        this.dispatchEvent(new CustomEvent("sf-property-view-close", {
            bubbles: true, composed: true,
            detail: {reason, record_id: this.recordId || null, unsaved_fields: unsaved},
        }));
        return this;
    }

    // What would be lost by closing: every changed field, and every entry that
    // is not a value yet -- a day picked for a datetime whose time is still
    // empty is work the person did, though there is nothing to save (Larena
    // acceptance, 2026-10-22: Esc after picking a day closed without asking).
    get unsavedFields() {
        return new Set([...this.changed.keys(), ...this.inputErrors.keys()]).size;
    }

    // A field reports its value when it loses focus, so a time typed and left
    // focused is not counted until then. Closing takes the focus first, and the
    // field reports before the count is read.
    _commitFocusedEntry() {
        let active = document.activeElement;
        while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
        if (!active || typeof active.blur !== "function") return;
        const panel = this.panel ? this.panelContent() : null;
        if (this.contains(active) || panel?.contains(active)) active.blur();
    }

    // What a person pastes is a page they can open, so the host's address is
    // resolved against the page it is read on (owner, 2026-10-08). The event
    // still carries the host's own address, because that is what the host knows
    // the record by.
    get addressUrl() {
        const address = this.address;
        if (!address) return null;
        try {
            return new URL(String(address), globalThis.location?.href).href;
        } catch {
            return String(address);
        }
    }

    // Copying is sf-copy-button's (owner, 2026-10-14): one implementation of
    // the act, its tick and its spoken result, with the Framework's fallback
    // for a browser that refuses the clipboard. The view keeps only what it
    // says about it.
    // The control stands on the drawer's outer edge, which may be outside this
    // element, so it carries the view it belongs to.
    copyControl() {
        return [...document.querySelectorAll('sf-copy-button[data-action="copy-link"]')]
            .find((control) => control.propertyView === this) ?? null;
    }

    get addressCopied() {
        return this.copyControl()?.state?.phase === "success";
    }

    announceAddressCopy(copied) {
        const address = this.address;
        this.dispatchEvent(new CustomEvent("sf-property-view-address-copy", {
            bubbles: true, composed: true,
            detail: {address, url: this.addressUrl ?? address, copied, record_id: this.recordId || null},
        }));
        return copied;
    }

    async copyAddress() {
        if (!this.address) return null;
        const control = this.copyControl();
        if (!control?.copy) return null;
        return Boolean(await control.copy());
    }

    openFullPage() {
        const address = this.address;
        if (!address) return null;
        // An intent, not a navigation: the component does not know whether the
        // consumer routes by href, by a client router or by replacing a region.
        this.dispatchEvent(new CustomEvent("sf-property-view-open-full", {
            bubbles: true, composed: true, detail: {address, record_id: this.recordId || null},
        }));
        return this;
    }

    // The phone's two screens. Opening a section also selects it, so leaving the
    // phone arrangement lands on the section the person was last reading rather
    // than on the first one.
    openPhoneSection(key) {
        const name = String(key);
        if (!this.sections.some((section) => String(section.key) === name)) return false;
        this.phoneSection = name;
        this.selectSection(name);
        this.requestComponentUpdate("phone-section");
        return true;
    }

    closePhoneSection() {
        if (this.phoneSection === null) return false;
        this.phoneSection = null;
        this.requestComponentUpdate("phone-section");
        return true;
    }

    get phoneSectionLabel() {
        const current = this.sections.find((section) => String(section.key) === this.phoneSection);
        return current ? String(current.label ?? current.key) : "";
    }

    selectSection(key) {
        this.selectedSection = String(key);
        this.requestComponentUpdate("section");
        return this;
    }

    // The four the edit template asks for when it builds a record picker. The
    // picker renders only when a host can serve candidates; without them the
    // template returns nothing and the field falls back to its value read-only,
    // which is what a 1.0.0 host gets.
    get canPickRecords() {
        return Boolean(this.hostPort?.capabilities?.includes("field-options"));
    }

    getFieldOptionsPage(field) {
        return this.optionPages.get(String(field.key ?? "")) ?? null;
    }

    getFieldOptionSearch(field) {
        return this.optionSearches.get(String(field.key ?? "")) ?? "";
    }

    setFieldOptionSearch(field, text) {
        this.optionSearches.set(String(field.key ?? ""), String(text ?? ""));
        return this;
    }

    async loadFieldOptions(field, {cursor = null, search = "", quiet = false} = {}) {
        const key = String(field.key ?? "");
        const previous = this.optionPages.get(key);
        // A new search starts a new list; a cursor continues the one on screen.
        const items = cursor && Array.isArray(previous?.items) ? previous.items : [];
        // `quiet` is the page the group asks for as it opens. It is not announced,
        // because a consumer saw «Загрузка записей» standing under four closed
        // fields at once; an error always is.
        this.optionPages.set(key, {items, status: "loading", quiet,
            nextCursor: previous?.nextCursor ?? null});
        this.requestComponentUpdate("options");
        // Dropped when the record changes, or when a newer search or page for this
        // same field is in flight -- and not when another field is read.
        const recordEpoch = this.epoch;
        const fieldEpoch = (this.optionEpochs.get(key) ?? 0) + 1;
        this.optionEpochs.set(key, fieldEpoch);
        const answer = await this._raise("field.options", {
            record_id: this.recordId || null,
            collection: this.collection || null,
            field: key,
            cursor,
            search: String(search ?? ""),
            // The reference list a lookup chooses from, and how many to answer
            // with (port 1.14.0). Sent only to a host that reads them: the
            // payload of an earlier port is closed.
            ...(versionAtLeast(this.hostPort?.version, "1.14.0")
                ? {...(field.source ? {source: String(field.source)} : {}), limit: OPTIONS_PAGE_LIMIT}
                : {}),
        }, {stale: () => recordEpoch !== this.epoch || fieldEpoch !== this.optionEpochs.get(key)});
        if (!answer) return null;
        if (answer.answer !== "applied") {
            // A refusal and an unavailability are different answers and a person
            // can act on only one of them. «Refused» means this field has no
            // candidates to offer -- a relation whose owner package is absent --
            // so a retry would fail for ever and an empty picker over an existing
            // value reads as the value being gone. The field falls back to its
            // value, read-only. «Unavailable» means not now, so the retry stays.
            const refused = answer.answer === "refused";
            this.optionPages.set(key, {
                items,
                status: refused ? "unsupported" : "error",
                quiet: false,
                nextCursor: null,
            });
            this.requestComponentUpdate("options");
            return answer;
        }
        const page = answer.options_page ?? {};
        const arrived = Array.isArray(page.items) ? page.items : [];
        this.optionPages.set(key, {
            items: cursor ? [...items, ...arrived] : arrived,
            status: "ready",
            quiet: false,
            // Opaque: sent back exactly as it arrived, never constructed here.
            nextCursor: page.next_cursor ?? null,
            total: page.total ?? null,
        });
        this.requestComponentUpdate("options");
        return answer;
    }

    // `undefined` takes a change back: the person erased what they typed into a
    // write-only field (a password), and a save must carry nothing for it --
    // not an empty value that would clear what the host keeps.
    changeField(field, value) {
        const key = String(field.key ?? "");
        if (value === undefined) this.changed.delete(key);
        else this.changed.set(key, value);
        this.errors.delete(key);
        // A confirmation described the save as it stood; an entry changed after
        // it is a different save, and the question goes until save is pressed again.
        this.confirmation = null;
        this.requestComponentUpdate("changed");
        return this;
    }

    // A datetime's day or time, as the person entered it (js/datetime-edit.js).
    // The two make one value; until they do, the entry is held as a draft and
    // what is missing is said under the field, as a host's error would be.
    dateTimeDraft(key) {
        return this.inputDrafts.get(String(key)) ?? null;
    }

    changeDateTime(field, value, part, text) {
        const key = String(field.key ?? "");
        // What the record holds, and what the controls show now: the draft,
        // or the value the field is drawn with (a change not yet saved).
        const original = splitDateTime(field.value);
        const current = this.inputDrafts.get(key) ?? splitDateTime(value);
        // A time that reads as one is kept as hh:mm, so «0930» typed without
        // the mask shows as 09:30; anything else stays as typed, to be put right.
        const typed = String(text ?? "");
        const draft = {...current, [part]: part === "time" ? normalizeTime(typed) ?? typed : typed};
        this.inputDrafts.set(key, draft);
        const result = composeDateTime(original, draft);
        if (result.error) {
            this.changed.delete(key);
            this.errors.delete(key);
            this.inputErrors.set(key, pageText(PROPERTY_VIEW_TEXT, `${result.error}Text`, this));
            this.requestComponentUpdate("errors");
            return this;
        }
        this.inputErrors.delete(key);
        // Back to what the record holds is no change: nothing is written.
        const same = result.value === null ? original.known && !original.date : result.value === original.raw;
        return this.changeField(field, same ? undefined : result.value);
    }

    _clearInputs() {
        this.inputDrafts.clear();
        this.inputErrors.clear();
    }

    // An entry that is not a value yet stops a save, and says so where it is.
    _inputsInvalid() {
        if (!this.inputErrors.size) return null;
        this.requestComponentUpdate("errors");
        return {answer: "refused", reason: "input_invalid", errors: Object.fromEntries(this.inputErrors)};
    }

    // Which fields in a group are picked from a list the host pages rather than
    // typed. A lookup that brought its list inline is chosen from in place and
    // asks for nothing. A field its condition hides now still has its first page
    // asked for: the condition can change at any keystroke, and a picker that
    // appears empty is the broken-looking case this read exists to avoid.
    _referenceFields(section, group) {
        const current = this.sections.find((entry) => String(entry.key) === String(section));
        const found = this.visible(current?.groups).find((entry) => String(entry.key) === String(group));

        return this.visible(found?.fields, {conditions: false})
            .filter((field) => PAGED_TYPES.includes(field.propertyType || field.type))
            .filter((field) => !((field.propertyType || field.type) === "lookup"
                && Array.isArray(field.options) && field.options.length > 0));
    }

    editGroup(section, group) {
        if (!this.mayEdit) return this;
        this.editing = {section: String(section), group: String(group)};
        this.changed.clear();
        this._clearInputs();
        this.errors.clear();
        this.conflict = null;
        this.confirmation = null;
        this.requestComponentUpdate("editing");
        // The first page is asked for as the group opens, not when the person
        // first types: a picker that is empty until you search looks broken, and
        // the common case is choosing from the first page without searching at
        // all.
        if (this.canPickRecords) {
            for (const field of this._referenceFields(section, group)) {
                if (!this.optionPages.has(String(field.key ?? ""))) {
                    this.loadFieldOptions(field, {cursor: null, search: "", quiet: true});
                }
            }
        }
        return this;
    }

    cancelEdit() {
        // Cancel drops what was typed and writes nothing. Data is saved by the
        // button alone, so there is nothing to undo. On a surface open all at
        // once the host decides where cancelling leads (a panel closes).
        if (this.openAll) {
            this.dispatchEvent(new CustomEvent("sf-property-view-cancel", {bubbles: true, composed: true, detail: {mode: this.mode}}));
            // A panel asks to close with what is unsaved, as the cross and Esc
            // do, so the host asks the same question on every way out; the
            // entries stay until the host closes it, and survive a «no»
            // (Larena acceptance, 2026-10-22: «Отменить» discarded first and
            // then reported nothing unsaved).
            if (this.panel) {
                this.closePanel("cancelled");
                return this;
            }
            this.changed.clear();
            this._clearInputs();
            this.errors.clear();
            this.conflict = null;
            this.confirmation = null;
            this.requestComponentUpdate("editing");
            return this;
        }
        this.editing = null;
        this.changed.clear();
        this._clearInputs();
        this.errors.clear();
        this.conflict = null;
        this.confirmation = null;
        this.requestComponentUpdate("editing");
        return this;
    }

    // One press, one intent, one revision. Nothing is sent on blur and nothing
    // per field: a save carries the fields the person changed, against the
    // revision the read carried, and the host compares and sets.
    //
    // `confirm` is the digest of a confirmation the host asked for (port
    // 1.14.0): the same save raised again once the person has read what it does.
    async saveGroup({confirm = null} = {}) {
        if (this.openAll) return this.saveAll({confirm});
        if (this.editing && this.inputErrors.size) return this._inputsInvalid();
        if (!this.editing || this.changed.size === 0) return null;
        const values = this._savedValues();
        if (!Object.keys(values).length) return null;
        this.confirmation = null;
        const epoch = ++this.epoch;
        const answer = await this._raise("group.save", {
            record_id: this.recordId || null,
            collection: this.collection || null,
            section: this.editing.section,
            group: this.editing.group,
            values,
            revision: this.record?.revision ?? null,
            ...(confirm ? {confirm} : {}),
        }, {stale: () => epoch !== this.epoch});
        if (!answer) return null;
        if (this._askedToConfirm(answer)) return answer;
        if (answer.answer === "applied") {
            this.record = answer.record ?? this.record;
            this.sections = Array.isArray(answer.record?.sections) ? answer.record.sections : this.sections;
            this.editing = null;
            this.changed.clear();
        this._clearInputs();
            this.errors.clear();
            this.conflict = null;
            this._setState("ready");
            return answer;
        }
        if (answer.answer === "conflict") {
            // What the person typed is kept. The object moved underneath them and
            // saying so is the whole point of a conflict; discarding their work to
            // show the newer object would be the component deciding for them.
            this.conflict = answer.message || this.conflictText;
            this.requestComponentUpdate("conflict");
            return answer;
        }
        if (answer.answer === "refused") {
            this.errors = new Map(Object.entries(answer.errors ?? {}).map(([key, value]) => [key, String(value)]));
            this.requestComponentUpdate("errors");
            return answer;
        }
        this._setState("error", answer.message || pageText(PROPERTY_VIEW_TEXT, "saveFailedText", this));
        return answer;
    }

    // A surface open all at once saves the whole object: a create makes it
    // (record.create), an edit saves every changed field as one revision
    // (record.save), port 1.12.0.
    async saveAll({confirm = null} = {}) {
        if (this.inputErrors.size) return this._inputsInvalid();
        if (this.mode !== "create" && this.changed.size === 0) return null;
        const creating = this.mode === "create";
        const values = this._savedValues();
        if (!creating && !Object.keys(values).length) return null;
        this.confirmation = null;
        const epoch = ++this.epoch;
        const answer = creating
            ? await this._raise("record.create", {
                collection: this.collection || null,
                values,
            }, {stale: () => epoch !== this.epoch})
            : await this._raise("record.save", {
                record_id: this.recordId || null,
                collection: this.collection || null,
                values,
                revision: this.record?.revision ?? null,
                ...(confirm ? {confirm} : {}),
            }, {stale: () => epoch !== this.epoch});
        if (!answer) return null;
        // A create is not confirmed: record.create carries no digest.
        if (!creating && this._askedToConfirm(answer)) return answer;
        if (answer.answer === "applied") {
            this.changed.clear();
        this._clearInputs();
            this.errors.clear();
            this.conflict = null;
            if (creating) {
                const id = answer.record_id ?? answer.record?.record_id ?? null;
                this.dispatchEvent(new CustomEvent("sf-property-view-created", {
                    bubbles: true, composed: true, detail: {record_id: id, collection: this.collection || null},
                }));
                // The new object is shown as any object is: read, with what
                // this person may do with it.
                if (id !== null) {
                    this.setAttribute("record-id", String(id));
                    this.setAttribute("mode", "auto");
                    if (answer.record) {
                        this.record = answer.record;
                        this.sections = Array.isArray(answer.record.sections) ? copy(answer.record.sections) : this.sections;
                        this.view = answer.record.view ?? this.view;
                        this._setState("ready");
                    } else {
                        await this.load("created");
                    }
                }
                return answer;
            }
            this.record = answer.record ?? this.record;
            this.sections = Array.isArray(answer.record?.sections) ? copy(answer.record.sections) : this.sections;
            this._setState("ready");
            return answer;
        }
        if (answer.answer === "conflict") {
            this.conflict = answer.message || this.conflictText;
            this.requestComponentUpdate("conflict");
            return answer;
        }
        if (answer.answer === "refused") {
            this.errors = new Map(Object.entries(answer.errors ?? {}).map(([key, value]) => [key, String(value)]));
            if (!this.errors.size && answer.message) this.conflict = answer.message;
            this.requestComponentUpdate("errors");
            return answer;
        }
        this._setState("error", answer.message || pageText(PROPERTY_VIEW_TEXT, "saveFailedText", this));
        return answer;
    }

    // A save the host makes only once confirmed (port 1.14.0, the data view
    // port's shape since 1.8.0): refused with reason confirm_required, with what
    // the save will do and a digest of it. The person reads it in the bar where
    // they pressed save -- the component's own place for a question, as the
    // view's reset asks there -- and either confirms, which raises the same save
    // again with the digest, or goes back to editing, which sends nothing and
    // keeps every entry. A confirmation asked again -- the digest no longer
    // matched what the save would do -- is shown again with the host's new
    // words: a person confirms what will actually happen, never what was
    // described before something moved.
    _askedToConfirm(answer) {
        const confirm = answer?.confirm;
        if (answer?.answer !== "refused" || answer.reason !== "confirm_required"
            || !confirm || typeof confirm.digest !== "string" || !confirm.digest) return false;
        this.confirmation = {
            text: String(confirm.summary || answer.message || ""),
            digest: confirm.digest,
        };
        this.requestComponentUpdate("confirmation");
        return true;
    }

    confirmSave() {
        const digest = this.confirmation?.digest;
        if (!digest) return Promise.resolve(null);
        return this.openAll ? this.saveAll({confirm: digest}) : this.saveGroup({confirm: digest});
    }

    cancelConfirmation() {
        this.confirmation = null;
        this.requestComponentUpdate("confirmation");
        return this;
    }

    // Configuring the view. The host decides three separate things and the
    // component decides none of them: whether a view can be configured at all
    // (the capability), which layers this person may write (`editable`, per
    // person rather than per host, which is why it travels in the answer), and
    // which layer hid a given entry (`hiddenBy`, so the rule that hiding for
    // everyone cannot be undone in a personal view stays in one place).
    get canConfigureView() {
        // Arranging is offered where it can be saved, and not on a surface
        // placed only to show the object. A new record is laid out by the same
        // arrangement as an existing one, so the form is arranged where it is
        // filled in too (owner, 2026-10-16: «нет настройки формы» on create).
        if (this.mode === "view") return false;
        return Boolean(this.hostPort?.capabilities?.includes?.("view-settings"))
            && Boolean(this.view)
            && this.editableLayers.length > 0;
    }

    // The named views this person may choose between. A view is a whole
    // arrangement with a permanent id -- which is what makes renaming possible
    // -- and the layers still resolve inside whichever one is chosen. Larena
    // had already settled this shape for its lists before the panel needed it,
    // and one idea met twice is worth more than two ideas (owner, 2026-10-09).
    //
    // One view is not a choice, so the component draws no chooser for it.
    get viewProfiles() {
        const profiles = this.view?.profiles;
        if (!Array.isArray(profiles)) return [];
        return profiles.filter((profile) => profile && typeof profile.id === "string" && profile.id);
    }

    get viewProfile() {
        const current = this.view?.profile;
        if (typeof current === "string" && current) return current;
        return this.viewProfiles[0]?.id ?? null;
    }

    // Whether a view may be removed. The last shared one may not: a scope with
    // no shared view has nothing for a person who has made none of their own.
    // The host refuses it too -- it owns the list -- but a control that can
    // only be refused is not offered, which is the same rule the saved-view
    // controls answer to (owner, 2026-10-09).
    canDeleteViewProfile(id) {
        const profiles = this.viewProfiles;
        const profile = profiles.find((item) => item.id === String(id ?? ""));
        if (!profile) return false;
        if (!profile.shared) return true;
        return profiles.filter((item) => item.shared).length > 1;
    }

    // Making a view, from what is on screen. The host gives it an id and
    // answers with the record through it, because a person who has just made a
    // view is looking at it.
    createViewProfile(label, {shared = false} = {}) {
        const name = String(label ?? "").trim();
        if (!name) return null;
        return this._viewProfileIntent("view.create", {
            label: name,
            shared: Boolean(shared),
            view: this.layerDraft ?? this._layerCopy(this.viewTarget),
        });
    }

    // A rename changes the label. The id is permanent, so anything pointing at
    // the view keeps pointing at it.
    renameViewProfile(id, label) {
        const name = String(label ?? "").trim();
        const profile = String(id ?? "");
        if (!name || !profile) return null;
        if (!this.viewProfiles.some((item) => item.id === profile)) return null;
        return this._viewProfileIntent("view.rename", {profile, label: name});
    }

    deleteViewProfile(id) {
        const profile = String(id ?? "");
        if (!this.canDeleteViewProfile(profile)) return null;
        return this._viewProfileIntent("view.delete", {profile});
    }

    // The three acts answer the way a read answers, so they are taken the same
    // way: whatever the host sends back is the arrangement from now on.
    async _viewProfileIntent(intent, payload) {
        const epoch = ++this.epoch;
        const answer = await this._raise(intent, {
            record_id: this.recordId || null,
            collection: this.collection || null,
            ...payload,
        }, {stale: () => epoch !== this.epoch});
        if (!answer) return null;
        if (answer.answer !== "applied") {
            this._setState("error", answer.message || this.viewDeniedText);
            return answer;
        }
        this.record = answer.record ?? this.record;
        this.sections = Array.isArray(answer.record?.sections) ? copy(answer.record.sections) : this.sections;
        this.view = answer.record?.view ?? this.view;
        this.layerDraft = this.configuring ? this._layerCopy(this.viewTarget) : null;
        this._setState("ready");
        this.requestComponentUpdate("profiles");
        return answer;
    }

    // Asking for a different view. The host answers as it answers a read,
    // because reading a record through another arrangement is reading the
    // record. What a person chose is the host's to remember: a choice kept
    // here would live in one browser and vanish in the next, which looks
    // broken rather than absent.
    async selectViewProfile(id) {
        const wanted = String(id ?? "");
        if (!wanted || wanted === this.viewProfile) return null;
        if (!this.viewProfiles.some((profile) => profile.id === wanted)) return null;
        const epoch = ++this.epoch;
        const answer = await this._raise("view.profile", {
            record_id: this.recordId || null,
            collection: this.collection || null,
            profile: wanted,
        }, {stale: () => epoch !== this.epoch});
        if (!answer) return null;
        if (answer.answer !== "applied") {
            this._setState("error", answer.message || this.viewDeniedText);
            return answer;
        }
        this.record = answer.record ?? this.record;
        this.sections = Array.isArray(answer.record?.sections) ? copy(answer.record.sections) : this.sections;
        this.view = answer.record?.view ?? this.view;
        this.editing = null;
        this.changed.clear();
        this._clearInputs();
        this._setState("ready");
        if (this.configuring) this.setViewTarget(this._layerOfProfile());
        this.requestComponentUpdate("profile");
        return answer;
    }

    get editableLayers() {
        const editable = this.view?.editable;
        return Array.isArray(editable) ? editable.filter((kind) => kind === "personal" || kind === "shared") : [];
    }

    layerDenied(kind) {
        if (this.editableLayers.includes(kind)) return null;
        return this.view?.denied?.[kind] || this.viewDeniedText;
    }

    _emptyLayer() {
        return {schema_version: 1, sections: {}, groups: {}, fields: {}};
    }

    _layerCopy(kind) {
        const stored = this.view?.layers?.[kind]?.view;
        return stored ? copy(stored) : this._emptyLayer();
    }

    _layerRevision(kind) {
        const layer = this.view?.layers?.[kind];
        return layer ? layer.revision ?? null : null;
    }

    // Reading choice, not arrangement: a rare entry is declared rare by whoever
    // owns the collection, and showing it changes no value and writes no layer.
    // It was an attribute only, so nobody short of the host could ever see one.
    toggleShowRare() {
        this.toggleAttribute("show-rare", !this.showRare);
        this.requestComponentUpdate("show-rare");
        return this.showRare;
    }

    // Whether anything in this record is declared rare. Without one the menu does
    // not offer to show rare entries, because an item that changes nothing reads
    // as a feature that is broken.
    get hasRare() {
        const anyRare = (entries) => (entries ?? []).some((entry) => entry?.rare === true);
        return (this.sections ?? []).some((section) => section?.rare === true
            || anyRare(section?.groups)
            || (section?.groups ?? []).some((group) => anyRare(group?.fields)));
    }

    // The layer a view is written to is the view's own: a shared view is the
    // shared layer, a personal one the personal layer, when this person may
    // write it.
    _layerOfProfile() {
        const profile = this.viewProfiles.find((item) => item.id === this.viewProfile);
        const wanted = profile?.shared ? "shared" : "personal";
        return this.editableLayers.includes(wanted) ? wanted : this.viewTarget;
    }

    startConfiguringView() {
        if (!this.canConfigureView) return false;
        this.configuring = true;
        if (this.viewProfiles.length) this.viewTarget = this._layerOfProfile();
        // What the arrangement was when the mode was entered. Every change in
        // this mode is written at once, so «cancel» can only mean putting back
        // what a person started from -- which is what a person means by it.
        this.arrangementEntered = {
            kind: this.viewTarget,
            view: this._layerCopy(this.viewTarget),
        };
        this.resetAsked = false;
        this.layerDraft = this._layerCopy(this.viewTarget);
        this._bindSectionDropTarget();
        this.entryErrors = new Map();
        this.cancelEdit();
        this.requestComponentUpdate("configuring");
        return true;
    }

    stopConfiguringView() {
        this.configuring = false;
        this._bindSectionDropTarget();
        this.layerDraft = null;
        this.arrangementEntered = null;
        this.resetAsked = false;
        this.entryErrors = new Map();
        this.requestComponentUpdate("configuring");
    }

    // Leaving the mode with the arrangement a person started from. Not the same
    // as resetting: a reset takes the layer away and lets what lies beneath show
    // through, while this writes back the arrangement that was there when the
    // mode was entered, including one a person had made earlier.
    async cancelConfiguringView() {
        if (!this.configuring) return false;
        const entered = this.arrangementEntered;
        if (!entered || entered.kind !== this.viewTarget) {
            this.stopConfiguringView();
            return true;
        }
        this.layerDraft = copy(entered.view);
        const answer = await this.saveView();
        await this.load("view-cancel");
        this.stopConfiguringView();
        return answer;
    }

    // A reset asks first. It takes away everything a person arranged in this
    // layer, and a single press of a button next to «done» is too little for
    // that; the button says what it will do and the next press does it.
    askReset() {
        if (!this.configuring) return false;
        this.resetAsked = true;
        this.requestComponentUpdate("reset-ask");
        return true;
    }

    cancelReset() {
        this.resetAsked = false;
        this.requestComponentUpdate("reset-ask");
        return true;
    }

    setViewTarget(kind) {
        if (!this.editableLayers.includes(kind) || kind === this.viewTarget) return false;
        this.viewTarget = kind;
        this.layerDraft = this._layerCopy(kind);
        this.entryErrors = new Map();
        this.requestComponentUpdate("view-target");
        return true;
    }

    // A hidden entry can be shown again only from the layer that hid it or above
    // it. `package` is above both, `shared` above `personal`, so a personal view
    // cannot reveal what was hidden for everyone -- and the component is told
    // which layer decided rather than working it out.
    canChangeVisibility(entry) {
        const hiddenBy = entry?.hiddenBy ?? null;
        if (!hiddenBy) return true;
        if (hiddenBy === "package") return false;
        if (hiddenBy === "shared") return this.viewTarget === "shared";
        return true;
    }

    entryError(kind, key) {
        return this.entryErrors.get(`${kind}:${key}`) ?? null;
    }

    // The resolved siblings of a container, in the order they are drawn. The move
    // is computed against what a person sees, not against what the layer stores:
    // a layer is sparse, so the entry being dragged may have no order in it yet.
    _groupsOf(sectionKey) {
        const section = this.sections.find((item) => String(item.key) === String(sectionKey));
        return Array.isArray(section?.groups) ? section.groups : [];
    }

    _fieldsOf(groupKey) {
        for (const section of this.sections) {
            for (const group of section.groups ?? []) {
                if (String(group.key) === String(groupKey)) return Array.isArray(group.fields) ? group.fields : [];
            }
        }
        return [];
    }

    _locateGroup(groupKey) {
        for (const section of this.sections) {
            for (const group of section.groups ?? []) {
                if (String(group.key) === String(groupKey)) return {section, group};
            }
        }
        return null;
    }

    // Dense order for the containers a move touched, and only those. A single
    // sparse order cannot say «between B and C» -- two neighbours may share a
    // number, or have none -- so the layer takes over the order of the one or two
    // containers that changed and leaves every other container resolving as it did.
    _writeOrder(bucket, items, extra = {}) {
        items.forEach((item, index) => {
            const key = String(item.key);
            bucket[key] = {...(bucket[key] ?? {}), ...extra, order: index + 1};
        });
    }

    // A field dropped on a section in the list lands in that section's first
    // group that takes fields. A section is not itself a container of fields --
    // a group is -- so something has to choose, and the first group is the one a
    // person sees at the top of the section they aimed at. A section whose only
    // groups are related lists takes nothing, and the drop is refused rather
    // than landing somewhere invisible.
    moveFieldToSection(fieldKey, sectionKey) {
        if (!this.configuring || !this.layerDraft) return false;
        const section = (this.sections ?? []).find((candidate) => String(candidate.key) === String(sectionKey));
        if (!section) return false;
        const group = (section.groups ?? []).find((candidate) => candidate.kind !== "related");
        if (!group) return false;
        return this.moveField(fieldKey, String(group.key), (group.fields ?? []).length);
    }

    // The section list is a drop target of its own rather than a sortable list:
    // a list would name the whole column, and a field has to land on one section
    // in it. sf-sortable publishes exactly this seam for a target that is not a
    // list, and it resolves by pointer, so moving a field to another section with
    // the keyboard is still missing.
    _bindSectionDropTarget() {
        if (!this.configuring) {
            this._releaseSectionTarget?.();
            this._releaseSectionTarget = null;
            return;
        }
        if (this._releaseSectionTarget) return;
        const register = globalThis.SF?.Sortable?.registerSortableDropTarget;
        if (typeof register !== "function") return;
        const sectionAt = (x, y) => {
            const under = globalThis.document?.elementFromPoint?.(x, y);
            // While the view is arranged the sections are rows of their own, so a
            // field may be dropped on a tab the same way it is dropped on a group.
            const item = under?.closest?.("[data-section-tab], sf-tree-item[value]");
            // Another panel's list is not this panel's drop target. The drawer
            // moves the content out of the element, so asking `closest` for an
            // sf-property-view finds nothing at all -- which is why the first
            // version of this resolved on no section and a field dropped on the
            // list simply stayed where it was.
            const content = this.panelContent();
            if (!item || !content || !content.contains(item)) return null;
            return item;
        };
        this._releaseSectionTarget = register({
            resolve: (x, y, session) => {
                // A field lands in the section's first group; a whole area moves
                // to the section itself. Anything else is not ours.
                if (session?.group && !["field", "group"].includes(session.group)) return null;
                const item = sectionAt(x, y);
                if (!item) return null;
                const key = item.getAttribute("data-section-tab") ?? item.getAttribute("value");
                if (key === this.selectedSection) return null;
                // A Smart element is laid out as `display: contents`, so the
                // host's own rect is empty and the indicator would be drawn as a
                // line of no size. The rendered row inside it is what has a shape.
                const shown = item.matches("[data-section-tab]")
                    ? item
                    : item.querySelector(".sf-tree-item-container") || item.firstElementChild || item;
                return {
                    descriptor: {section: key},
                    rect: shown.getBoundingClientRect(),
                    label: item.getAttribute("label") || item.textContent?.trim() || key,
                };
            },
            drop: (session, descriptor) => {
                if (!descriptor?.section) return false;
                if (session?.group === "group") {
                    return this.moveGroup(session?.item, descriptor.section, Number.MAX_SAFE_INTEGER);
                }
                return this.moveFieldToSection(session?.item, descriptor.section);
            },
        });
    }

    moveField(fieldKey, toGroupKey, index) {
        if (!this.configuring || !this.layerDraft) return false;
        const target = this._locateGroup(toGroupKey);
        if (!target) return false;
        let moved = null;
        let fromGroup = null;
        for (const section of this.sections) {
            for (const group of section.groups ?? []) {
                const at = (group.fields ?? []).findIndex((field) => String(field.key) === String(fieldKey));
                if (at >= 0) {
                    fromGroup = group;
                    [moved] = group.fields.splice(at, 1);
                    break;
                }
            }
            if (moved) break;
        }
        // A field being placed may be coming back from outside the arrangement
        // rather than from another group.
        let fromUnplaced = false;
        if (!moved) {
            const waiting = this.record?.unplaced ?? [];
            const at = waiting.findIndex((field) => String(field.key) === String(fieldKey));
            if (at >= 0) {
                [moved] = waiting.splice(at, 1);
                fromUnplaced = true;
            }
        }
        if (!moved) return false;
        const into = target.group.fields ?? (target.group.fields = []);
        const at = Math.max(0, Math.min(Number.isInteger(index) ? index : into.length, into.length));
        into.splice(at, 0, moved);
        this._writeOrder(this.layerDraft.fields, into, {group: String(toGroupKey)});
        if (fromUnplaced) {
            this._writeOrder(this.layerDraft.fields, this.record?.unplaced ?? [], {group: null});
        }
        if (fromGroup && fromGroup !== target.group) {
            this._writeOrder(this.layerDraft.fields, fromGroup.fields ?? [], {group: String(fromGroup.key)});
        }
        this.requestComponentUpdate("view-move");
        return this.saveView();
    }

    moveGroup(groupKey, toSectionKey, index) {
        if (!this.configuring || !this.layerDraft) return false;
        const target = this.sections.find((item) => String(item.key) === String(toSectionKey));
        if (!target) return false;
        let moved = null;
        let fromSection = null;
        for (const section of this.sections) {
            const at = (section.groups ?? []).findIndex((group) => String(group.key) === String(groupKey));
            if (at >= 0) {
                fromSection = section;
                [moved] = section.groups.splice(at, 1);
                break;
            }
        }
        if (!moved) return false;
        const into = target.groups ?? (target.groups = []);
        const at = Math.max(0, Math.min(Number.isInteger(index) ? index : into.length, into.length));
        into.splice(at, 0, moved);
        this._writeOrder(this.layerDraft.groups, into, {section: String(toSectionKey)});
        if (fromSection && fromSection !== target) {
            this._writeOrder(this.layerDraft.groups, fromSection.groups ?? [], {section: String(fromSection.key)});
        }
        this.requestComponentUpdate("view-move");
        return this.saveView();
    }

    // Width, template variant and hint, one field at a time. The value is written
    // into the layer and onto the drawn entry together, so the view moves under
    // the person's hand and the layer is what gets stored.
    setFieldView(fieldKey, patch = {}) {
        if (!this.configuring || !this.layerDraft) return false;
        // `label` is this view's name for the field, the same way a section and
        // an area carry one: the collection keeps its own, and resetting the
        // layer gives it back.
        const allowed = ["width", "variant", "hint", "label"];
        const change = Object.fromEntries(Object.entries(patch).filter(([key]) => allowed.includes(key)));
        if (!Object.keys(change).length) return false;
        const key = String(fieldKey);
        this.layerDraft.fields[key] = {...(this.layerDraft.fields[key] ?? {}), ...change};
        for (const section of this.sections) {
            for (const group of section.groups ?? []) {
                for (const field of group.fields ?? []) {
                    if (String(field.key) === key) Object.assign(field, change);
                }
            }
        }
        this.requestComponentUpdate("view-field");
        return this.saveView();
    }

    // The glyphs a section may be marked with. A hundred and twenty names from
    // the Framework's own icon set, the ones products actually reach for, read
    // in rows of what a record's sections are usually about -- what a thing is,
    // who it belongs to, when it happens, what it costs, what it is made of. A
    // host with its own vocabulary passes `section-icons` and this is replaced
    // wholesale rather than added to, because a list nobody chose is a list that
    // grows until it is useless.
    // The input as it was given: a list of glyph names, or nothing for the
    // component's own. A declared input answers with what it was told, so the
    // resolved list is a second question rather than this one's answer.
    get sectionIcons() {
        return this.getAttribute("section-icons") || "";
    }

    get sectionIconChoices() {
        const given = this.sectionIcons;
        if (given) return given.split(/[\s,]+/u).filter(Boolean);
        return SECTION_ICONS;
    }

    // A section's glyph is this view's, like its name: the layer carries it and
    // resetting the layer gives the host's back.
    setSectionIcon(sectionKey, icon) {
        if (!this.configuring || !this.layerDraft) return false;
        const name = String(sectionKey);
        const section = this.sections.find((part) => String(part.key) === name);
        if (!section) return false;
        const next = String(icon ?? "").trim() || null;
        this.layerDraft.sections[name] = {...(this.layerDraft.sections[name] ?? {}), icon: next};
        section.icon = next;
        this.requestComponentUpdate("view-section-icon");
        return this.saveView();
    }

    // Naming what is on screen. A label is the layer's to set -- the port has
    // carried `label` for a section and a group since 1.6.0 -- so renaming is an
    // arrangement, not a change to the collection: what it renames is this
    // view's name for it, and resetting the layer gives the host's name back.
    renameEntry(kind, key, label) {
        if (!this.configuring || !this.layerDraft) return false;
        const buckets = {section: "sections", group: "groups"};
        const bucket = buckets[kind];
        if (!bucket) return false;
        const next = String(label ?? "").trim();
        if (!next) return false;
        const entry = this._findEntry(kind, key);
        if (!entry) return false;
        const name = String(key);
        this.layerDraft[bucket][name] = {...(this.layerDraft[bucket][name] ?? {}), label: next};
        entry.label = next;
        this.renaming = null;
        this.requestComponentUpdate("view-rename");
        return this.saveView();
    }

    startRenaming(kind, key) {
        if (!this.configuring) return false;
        this.renaming = {kind, key: String(key)};
        this.requestComponentUpdate("view-rename");
        return true;
    }

    cancelRenaming() {
        this.renaming = null;
        this.requestComponentUpdate("view-rename");
    }

    // Taking an area out of the view. Its fields are not destroyed with it: they
    // join the unplaced, which is where a field goes when it belongs to no area,
    // so nothing a person put in it is lost by removing the box around it.
    //
    // In the layer an area that is gone is an area that is hidden, because that
    // is what the port has a word for -- the collection still has it, this view
    // does not show it, and resetting the layer brings it back.
    removeGroup(groupKey) {
        if (!this.configuring || !this.layerDraft) return false;
        const target = this._locateGroup(groupKey);
        if (!target || !this.canChangeVisibility(target.group)) return false;
        for (const field of [...(target.group.fields ?? [])]) {
            this.moveFieldToUnplaced(String(field.key));
        }
        const name = String(groupKey);
        this.layerDraft.groups[name] = {...(this.layerDraft.groups[name] ?? {}), hidden: true};
        target.group.hidden = true;
        const section = this.sections.find((part) => (part.groups ?? []).includes(target.group));
        if (section) section.groups = (section.groups ?? []).filter((group) => group !== target.group);
        this.requestComponentUpdate("view-remove-group");
        return this.saveView();
    }

    // A section is removed the same way, and every area it held goes with it:
    // the areas are kept, moved to the section that remains, so an arrangement
    // is not thrown away by removing the tab it sat behind.
    removeSection(sectionKey) {
        if (!this.configuring || !this.layerDraft) return false;
        const name = String(sectionKey);
        const section = this.sections.find((part) => String(part.key) === name);
        if (!section || !this.canChangeVisibility(section)) return false;
        if (this.sections.length < 2) return false;
        const into = this.sections.find((part) => part !== section);
        for (const group of [...(section.groups ?? [])]) {
            this.moveGroup(String(group.key), String(into.key), Number.MAX_SAFE_INTEGER);
        }
        this.layerDraft.sections[name] = {...(this.layerDraft.sections[name] ?? {}), hidden: true};
        section.hidden = true;
        this.sections = this.sections.filter((part) => part !== section);
        if (this.selectedSection === name) this.selectedSection = String(into.key);
        this.requestComponentUpdate("view-remove-section");
        return this.saveView();
    }

    // The order of the sections, as a drag leaves them. A section is a tab in
    // this arrangement, and a tab nobody can move is an order the host chose
    // once and nobody since.
    moveSection(sectionKey, index) {
        if (!this.configuring || !this.layerDraft) return false;
        const name = String(sectionKey);
        const at = this.sections.findIndex((part) => String(part.key) === name);
        if (at < 0) return false;
        const next = [...this.sections];
        const [moved] = next.splice(at, 1);
        const to = Math.max(0, Math.min(Number.isInteger(index) ? index : next.length, next.length));
        next.splice(to, 0, moved);
        if (next.every((part, position) => part === this.sections[position])) return false;
        this.sections = next;
        this._writeOrder(this.layerDraft.sections, this.sections, {});
        this.requestComponentUpdate("view-move-section");
        return this.saveView();
    }

    // Making a new area, and a new section to hold areas. This is the one act in
    // arranging that does not rearrange what the host sent: it names something
    // the record does not carry yet, and the host decides whether to keep it --
    // the layer write says so, and the area survives the next read only if the
    // host returns it. Until then it is drawn from the layer, so a person sees
    // what they made straight away.
    addGroup(sectionKey) {
        if (!this.configuring || !this.layerDraft) return false;
        const section = this.sections.find((part) => String(part.key) === String(sectionKey))
            ?? this.sections[0];
        if (!section) return false;
        const key = this._newEntryKey("group");
        const group = {
            key,
            label: this.newGroupTitle,
            columns: 1,
            fields: [],
            hidden: false,
            rare: false,
            editable: true,
        };
        section.groups = [...(section.groups ?? []), group];
        this._writeOrder(this.layerDraft.groups, section.groups, {section: String(section.key)});
        this.layerDraft.groups[key] = {
            ...(this.layerDraft.groups[key] ?? {}),
            label: group.label,
            section: String(section.key),
            columns: 1,
            hidden: false,
        };
        this.renaming = {kind: "group", key};
        this.requestComponentUpdate("view-add-group");
        return this.saveView();
    }

    addSection() {
        if (!this.configuring || !this.layerDraft) return false;
        const key = this._newEntryKey("section");
        const section = {key, label: this.newSectionTitle, groups: [], hidden: false, rare: false};
        this.sections = [...this.sections, section];
        this._writeOrder(this.layerDraft.sections, this.sections, {});
        this.layerDraft.sections[key] = {
            ...(this.layerDraft.sections[key] ?? {}),
            label: section.label,
            hidden: false,
        };
        this.selectedSection = key;
        this.renaming = {kind: "section", key};
        this.requestComponentUpdate("view-add-section");
        return this.saveView();
    }

    // A key nobody else holds, said in the open so a host reading the layer can
    // tell a key this component made from one of its own.
    _newEntryKey(kind) {
        const stamp = Date.now().toString(36);
        const noise = Math.floor(Math.random() * 46655).toString(36).padStart(3, "0");
        return `view-${kind}-${stamp}${noise}`;
    }

    toggleEntryHidden(kind, key) {
        if (!this.configuring || !this.layerDraft) return false;
        const buckets = {section: "sections", group: "groups", field: "fields"};
        const bucket = buckets[kind];
        if (!bucket) return false;
        const entry = this._findEntry(kind, key);
        if (!entry || !this.canChangeVisibility(entry)) return false;
        const next = !entry.hidden;
        const name = String(key);
        this.layerDraft[bucket][name] = {...(this.layerDraft[bucket][name] ?? {}), hidden: next};
        entry.hidden = next;
        this.requestComponentUpdate("view-hidden");
        return this.saveView();
    }

    _findEntry(kind, key) {
        const name = String(key);
        for (const section of this.sections) {
            if (kind === "section" && String(section.key) === name) return section;
            for (const group of section.groups ?? []) {
                if (kind === "group" && String(group.key) === name) return group;
                for (const field of group.fields ?? []) {
                    if (kind === "field" && String(field.key) === name) return field;
                }
            }
        }
        return null;
    }

    // Applied immediately, the way column settings are, and against the layer
    // revision. A refusal or a conflict is not something to paper over: the
    // arrangement on screen is the component optimistic copy, so when the host
    // does not accept it the record is read again and the host resolution wins.
    async saveView() {
        if (!this.canConfigureView || !this.layerDraft) return null;
        // Serialized, one write at a time. Two drags in quick succession would
        // otherwise both be sent against the revision the layer had before either
        // of them, so the second would be answered with a conflict the person
        // caused by being quick -- correct by the contract and useless to them.
        // Waiting means the second write carries the revision the first earned.
        const queued = this._viewWriting ?? Promise.resolve();
        let release;
        this._viewWriting = new Promise((done) => {
            release = done;
        });
        try {
            await queued;
            return await this._saveViewNow();
        } finally {
            release();
        }
    }

    async _saveViewNow() {
        if (!this.canConfigureView || !this.layerDraft) return null;
        const kind = this.viewTarget;
        const epoch = ++this.viewEpoch;
        const answer = await this._raise("view.save", {
            record_id: null,
            collection: this.collection || null,
            target: {kind, revision: this._layerRevision(kind)},
            view: copy(this.layerDraft),
        }, {stale: () => epoch !== this.viewEpoch});
        if (!answer) return null;
        if (answer.answer === "applied") {
            this.entryErrors = new Map();
            this._storeLayer(kind, answer.revision ?? null, answer.view ?? this.layerDraft);
            // A host that normalised the layer is telling the component its copy
            // is not what was stored, so the arrangement is read again rather
            // than left as the component imagined it.
            // The port says a view write announces sf-property-view-state, so it
            // has to announce it when the write succeeds and not only when it
            // fails -- otherwise the declared event is a half-truth and a host
            // listening for it would hear only bad news.
            if (answer.view) await this.load("view-normalised");
            else {
                this._setState("ready");
                this.requestComponentUpdate("view-saved");
            }
            return answer;
        }
        if (answer.answer === "conflict") {
            this._storeLayer(kind, answer.revision ?? null, answer.view ?? null);
            this.message = answer.message || this.viewConflictText;
            await this.load("view-conflict");
            return answer;
        }
        if (answer.answer === "refused") {
            this.entryErrors = new Map(Object.entries(answer.entry_errors ?? {}).map(([key, value]) => [key, String(value)]));
            await this.load("view-refused");
            return answer;
        }
        this._setState("error", answer.message || pageText(PROPERTY_VIEW_TEXT, "viewSaveFailedText", this));
        return answer;
    }

    _storeLayer(kind, revision, view) {
        if (!this.view) return;
        this.view.layers = {...(this.view.layers ?? {})};
        this.view.layers[kind] = {revision, view: view ? copy(view) : null};
        this.layerDraft = this._layerCopy(kind);
    }

    // A reset writes nothing against the revision -- it never sends the component
    // idea of the defaults, because the host owns those and writing them would
    // overwrite them with a guess.
    async resetView() {
        if (!this.canConfigureView) return null;
        this.resetAsked = false;
        // Behind the same queue as a save: a reset racing a save in flight would
        // clear a layer and then store the save's revision over the cleared one.
        await (this._viewWriting ?? Promise.resolve());
        const kind = this.viewTarget;
        const epoch = ++this.viewEpoch;
        const answer = await this._raise("view.reset", {
            record_id: null,
            collection: this.collection || null,
            target: {kind, revision: this._layerRevision(kind)},
        }, {stale: () => epoch !== this.viewEpoch});
        if (!answer) return null;
        if (answer.answer === "applied" || answer.answer === "conflict") {
            if (answer.answer === "conflict") this.message = answer.message || this.viewConflictText;
            this._storeLayer(kind, answer.revision ?? null, null);
            this.entryErrors = new Map();
            await this.load("view-reset");
            return answer;
        }
        this._setState("error", answer.message || pageText(PROPERTY_VIEW_TEXT, "viewResetFailedText", this));
        return answer;
    }
}

SfPropertyView.define("sf-property-view");

export {SfPropertyView, SUPPORTED_PORT_VERSIONS};
