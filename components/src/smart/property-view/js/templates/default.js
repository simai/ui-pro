import {html, nothing} from 'lit';
import "./default.css";
import {renderViewField, renderEditField} from '../../../field-renderers/index.js';
import {renderDateTimeEdit} from '../datetime-edit.js';

// The arrangement, drawn in the component's own light DOM. Not in a shadow root:
// the field controls are Smart elements whose stylesheets are document-level, and
// a document stylesheet does not cross a shadow boundary. sf-data-view slots its
// children for exactly this reason and says so beside the slot; the first version
// of this composite built them inside a shadow root and every control came out
// with its markup and none of its CSS.

function renderFieldValue(context, field, editing) {
    const key = String(field.key ?? '');
    const editHost = {
        setFieldValue: (target, value) => context.component.changeField(target, value),
        ...(context.canUploadFiles
            ? {
                getFieldUploads: (target) => context.component.getFieldUploads(target),
                startFieldUpload: (target, items) => context.component.startFieldUpload(target, items),
                retryFieldUpload: (target, index) => context.component.retryFieldUpload(target, index),
            }
            : {}),
        ...(context.canPickRecords
            ? {
                getFieldOptionsPage: (target) => context.component.getFieldOptionsPage(target),
                getFieldOptionSearch: (target) => context.component.getFieldOptionSearch(target),
                setFieldOptionSearch: (target, text) => context.component.setFieldOptionSearch(target, text),
                loadFieldOptions: (target, request) => context.component.loadFieldOptions(target, request),
            }
            : {}),
    };
    // A datetime is edited as a day and a time (../datetime-edit.js): the
    // shared set's control edits the day alone. A readonly one is shown, as the
    // set shows every readonly field.
    const type = field.propertyType || field.type || field.dataType;
    const content = editing && type === 'datetime' && field.readonly !== true
        ? renderDateTimeEdit(context, field, context.changed.has(key) ? context.changed.get(key) : field.value)
        : editing
        ? renderEditField(
            field,
            context.changed.has(key) ? context.changed.get(key) : field.value,
            editHost,
            {size: context.size},
        )
        : renderViewField(field, field.value, context.hostPort, {size: context.size});

    const reference = ['record', 'relation', 'user'].includes(field.propertyType || field.type)
        && field.value && typeof field.value === 'object';
    if (!editing && reference && content) {
        return html`<span
                class="sf-property-view-reference"
                @click=${(event) => {
                    event.preventDefault();
                    // And no further: the field in view is a button that opens
                    // the group for editing, so a press that reached it put the
                    // whole group into edit behind the record that had just
                    // opened (owner, 2026-10-08). Following a reference is one
                    // intent, not two.
                    event.stopPropagation();
                    context.component.openReference(field, field.value);
                }}
        >${content}</span>`;
    }

    // An edit control the set cannot build is not an empty value. record and
    // relation have no editor until the picker's host methods exist, and the
    // first version showed «не заполнено» over a field that had a value -- a
    // consumer read it as the value having been lost. Fall back to the view, so
    // the value is shown and plainly not editable yet.
    if (editing && (content === null || typeof content === 'undefined' || content === nothing)) {
        const shown = renderViewField(field, field.value, context.hostPort, {size: context.size});
        if (shown !== null && typeof shown !== 'undefined' && shown !== nothing) {
            return html`<span class="sf-property-view-readonly color-on-surface-variant" data-readonly="true">${shown}</span>`;
        }
    }

    if (content === null || typeof content === 'undefined' || content === nothing) {
        return html`<span class="sf-property-view-empty color-on-surface-variant">${context.emptyText}</span>`;
    }

    return content;
}

// While the view is being configured every entry is listed, hidden and rare ones
// included: a hidden field a person cannot see is a field they cannot show again,
// and «показать редкие поля» is a reading choice rather than part of the
// arrangement being edited.
function listed(context, entries) {
    return context.configuring ? (entries ?? []) : context.visible(entries);
}

// The chooser names the layers this person may write and nothing else. A layer
// they may not write is drawn disabled with the host's own reason on it rather
// than left out, because a «Для всех» that is simply absent reads as a feature
// the product does not have.
// The controls of the arranging mode live in the bar at the foot (owner,
// 2026-10-08), where saving, cancelling and deleting live when a group is being
// edited: the foot is where a mode's own answers belong, and a band of them
// under the head pushed the record down by a row it did not need.
function renderConfigureBar(context) {
    if (!context.canConfigureView) return nothing;
    // Not configuring: nothing is drawn. Entering is the «⋯» menu's, as the mockup
    // has it -- a standalone «Настроить вид» link stood as its own band under the
    // head and was one of the two empty-looking rows the owner saw.
    if (!context.configuring) return nothing;

    // One row of controls and nothing else: the view being arranged and the
    // way out. Whose copy is written follows from the view itself -- a view
    // for everyone is written for everyone, a personal one for its person --
    // so the «Персональный / Для всех» toggle that stood beside the chooser
    // said the same thing twice and is gone (owner, 2026-10-14).

    // Which named view is being arranged, chosen, made, renamed and removed in
    // the Framework's profile picker (owner, 2026-10-14) -- the one the admin
    // menu's profiles use.
    const writable = context.editableLayers ?? [];
    const chooser = html`
        <sf-profile-picker
                size=${context.size}
                data-action="view-profile"
                label=${context.viewProfileLabel}
                current=${context.viewProfile ?? ''}
                .profiles=${(context.viewProfiles ?? []).map((profile) => ({
                    id: profile.id, label: profile.label, shared: Boolean(profile.shared),
                    editable: writable.includes(profile.shared ? 'shared' : 'personal')
                        && (!profile.shared || context.canDeleteViewProfile(profile.id)),
                }))}
                .rights=${{create: {personal: writable.includes('personal'), shared: writable.includes('shared')}}}
                @sf-profile-select=${(event) => context.component.selectViewProfile(event.detail.id)}
                @sf-profile-create=${(event) => context.component.createViewProfile(event.detail.label, {shared: event.detail.shared})}
                @sf-profile-rename=${(event) => context.component.renameViewProfile(event.detail.id, event.detail.label)}
                @sf-profile-delete=${(event) => context.component.deleteViewProfile(event.detail.id)}
        ></sf-profile-picker>`;

    return html`
        <div class="sf-property-view-actions sf-property-view-configure-bar flex items-cross-center gap-2 flex-wrap"
             data-configuring="true" role="group"
             aria-label=${context.configureText}>
            ${chooser}
            <span class="grow"></span>
            ${context.resetAsked
                    ? html`
                        <span class="sf-property-view-reset-ask color-error">${context.resetViewAskText}</span>
                        <sf-button
                                appearance="link"
                                size=${context.size}
                                status="error"
                                text=${context.resetViewText}
                                data-action="reset-view-confirm"
                                @click=${() => context.component.resetView()}
                        ></sf-button>
                        <sf-button
                                appearance="outline"
                                size=${context.size}
                                text=${context.cancelConfiguringText}
                                data-action="reset-view-cancel"
                                @click=${() => context.component.cancelReset()}
                        ></sf-button>`
                    : html`
                        <!-- Reset, cancel, done: the further a control reaches, the
                             quieter it is drawn. Reset takes the whole layer away
                             and asks first; cancel puts back the arrangement this
                             mode was entered with; done keeps what is there. -->
                        <sf-button
                                appearance="link"
                                size=${context.size}
                                text=${context.resetViewText}
                                data-action="reset-view"
                                @click=${() => context.component.askReset()}
                        ></sf-button>
                        <sf-button
                                appearance="outline"
                                size=${context.size}
                                text=${context.cancelConfiguringText}
                                data-action="cancel-configuring"
                                @click=${() => context.component.cancelConfiguringView()}
                        ></sf-button>
                        <sf-button
                                appearance="default"
                                size=${context.size}
                                text=${context.doneConfiguringText}
                                data-action="done-configuring"
                                @click=${() => context.component.stopConfiguringView()}
                        ></sf-button>`}
        </div>
    `;
}

// Width, template variant and hint sit behind the field's own settings rather
// than under every field at once. Drawn under each field they were four controls
// per row, so a group of eight fields was thirty-two controls and the
// arrangement -- the thing being edited -- could no longer be read.
function renderFieldSettings(context, field, key) {
    const variants = Array.isArray(field.variantOptions) ? field.variantOptions : [];

    return html`
        <sf-popover placement="bottom-end" width="16rem" label=${context.fieldSettingsText}
                    data-settings-for=${key}>
            <sf-icon-button
                    slot="trigger"
                    size="1/2"
                    appearance="link"
                    scheme="secondary"
                    icon="settings"
                    data-action="field-settings"
                    title=${context.fieldSettingsText}
                    aria-label=${context.fieldSettingsText}
            ></sf-icon-button>
            <div slot="content" class="flex flex-col gap-1 p-1">
                <label class="sf-property-view-settings-row sf-property-view-settings-row--stacked flex flex-col gap-1/4">
                    <span class="sf-property-view-settings-label color-on-surface-variant">${context.fieldLabelText}</span>
                    <sf-input
                            size="1/2"
                            appearance="bordered"
                            data-action="field-label"
                            aria-label=${context.fieldLabelText}
                            placeholder=${String(field.label ?? key)}
                            value=${String(field.label ?? '')}
                            @change=${(event) => context.component.setFieldView(key, {
                                label: String(event.target?.value ?? '').trim() || null,
                            })}
                    ></sf-input>
                </label>
                <label class="sf-property-view-settings-row sf-property-view-settings-row--stacked flex flex-col gap-1/4">
                    <span class="sf-property-view-settings-label color-on-surface-variant">${context.hintText}</span>
                    <sf-input
                            size="1/2"
                            appearance="bordered"
                            data-action="hint"
                            aria-label=${context.hintText}
                            placeholder=${context.hintText}
                            value=${String(field.hint ?? '')}
                            @change=${(event) => context.component.setFieldView(key, {hint: event.target?.value ?? ''})}
                    ></sf-input>
                </label>
                ${variants.length
                        ? html`
                            <label class="sf-property-view-settings-row flex items-cross-center justify-between gap-1">
                                <span class="sf-property-view-settings-label color-on-surface-variant">${context.variantText}</span>
                                <sf-dropdown
                                        size="1/2"
                                        appearance="outlined"
                                        mode="select"
                                        search="false"
                                        data-action="variant"
                                        aria-label=${context.variantText}
                                        value=${String(field.variant ?? '')}
                                        .options=${variants.map((variant) => ({
                                            type: 'text',
                                            text: variant.label ?? variant.text ?? String(variant.value ?? variant),
                                            value: String(variant.value ?? variant),
                                            selected: String(field.variant ?? '') === String(variant.value ?? variant),
                                        }))}
                                        @change=${(event) => context.component.setFieldView(key, {variant: event.detail?.value ?? null})}
                                ></sf-dropdown>
                            </label>`
                        : nothing}
                <label class="sf-property-view-settings-row flex items-cross-center justify-between gap-1">
                    <span class="sf-property-view-settings-label color-on-surface-variant">${context.widthText}</span>
                    <sf-switch
                            size="1/2"
                            data-action="width"
                            ?checked=${field.width === 'full'}
                            @change=${(event) => context.component.setFieldView(key, {
                                width: event.target?.checked ? 'full' : 'half',
                            })}
                    ></sf-switch>
                </label>
            </div>
        </sf-popover>
    `;
}

// The two controls a field carries while the view is arranged: taking it out of
// this area and where everything else about it lives. They sit at the end of the
// field, on the ladder the rest of the panel uses.
//
// None of them is red (owner, 2026-10-08). Red is the record's own delete, in
// the bar at the foot; a mode whose rows each carry a red mark reads as a list
// of warnings, and taking a field out of an area is an ordinary act of
// arranging that the «+» beside it undoes.
//
// Taking out rather than hiding (owner, 2026-10-07): a field removed here joins
// the unplaced, where the list behind the «+» offers it back, so removing is
// visible and undoable in the same place. Hiding is still what the port carries
// and what a shared layer does to a field for everyone -- a field hidden above
// this layer is drawn with its reason and cannot be taken out from here.
function renderFieldActions(context, field, key) {
    const locked = !context.canChangeVisibility(field);

    return html`
        <div class="sf-property-view-field-actions flex items-cross-center gap-1/4">
            <sf-icon-button
                    size="1/2"
                    appearance="link"
                    scheme="secondary"
                    icon=${field.hidden ? 'visibility_off' : 'close'}
                    data-action="remove-field"
                    ?disabled=${locked}
                    title=${locked ? (context.layerDenied('shared') || context.hiddenText) : context.removeFieldText}
                    aria-label=${context.removeFieldText}
                    @click=${() => context.component.moveFieldToUnplaced(key)}
            ></sf-icon-button>
            ${renderFieldSettings(context, field, key)}
        </div>
    `;
}

// A name that can be changed, where it stands. In the arranging mode the title
// is the control: pressing it, or the pencil beside it, turns it into a field
// with a tick and a cross -- the two answers a person has to a name they are
// typing. Nothing is written until the tick, so an area keeps its name while
// somebody is still deciding on another.
function renderEntryName(context, kind, key, label, titleClass) {
    const renaming = context.renaming?.kind === kind && context.renaming?.key === String(key);

    if (!context.configuring) {
        return html`<h3 class=${titleClass}>${label}</h3>`;
    }

    if (!renaming) {
        // The pencil stands right after the name rather than at the end of the
        // row: at the end it read as another of the area's controls, and what
        // it edits is the name beside it (owner, 2026-10-08). The name takes
        // only the room it needs, and the space that was taken from it goes to
        // the spacer, which keeps the controls at the end of the row.
        return html`
            <h3 class=${titleClass}>
                <button type="button" class="sf-property-view-rename-trigger text-start cursor-pointer"
                        data-action="rename"
                        title=${context.renameText}
                        @click=${() => context.component.startRenaming(kind, key)}
                >${label}</button>
            </h3>
            <sf-icon-button
                    size="1/2"
                    appearance="link"
                    scheme="secondary"
                    icon="edit"
                    data-action="rename"
                    title=${context.renameText}
                    aria-label=${context.renameText}
                    @click=${() => context.component.startRenaming(kind, key)}
            ></sf-icon-button>
            <span class="grow"></span>
        `;
    }

    const commit = (event) => {
        const input = event.target?.closest?.('.sf-property-view-rename')?.querySelector('sf-input');
        context.component.renameEntry(kind, key, input?.value ?? label);
    };

    return html`
        <span class="sf-property-view-rename flex items-cross-center gap-1/4 grow min-w-0">
            <sf-input
                    size="1/2"
                    appearance="bordered"
                    autofocus
                    root-class="flex-auto min-w-0"
                    data-action="rename-input"
                    aria-label=${context.renameText}
                    value=${label}
                    @keydown=${(event) => {
                        if (event.key === 'Enter') commit(event);
                        if (event.key === 'Escape') context.component.cancelRenaming();
                    }}
            ></sf-input>
            <sf-icon-button
                    size="1/2"
                    appearance="link"
                    scheme="on-surface"
                    icon="check"
                    data-action="rename-save"
                    title=${context.saveNameText}
                    aria-label=${context.saveNameText}
                    @click=${commit}
            ></sf-icon-button>
            <sf-icon-button
                    size="1/2"
                    appearance="link"
                    scheme="on-surface"
                    icon="close"
                    data-action="rename-cancel"
                    title=${context.cancelNameText}
                    aria-label=${context.cancelNameText}
                    @click=${() => context.component.cancelRenaming()}
            ></sf-icon-button>
        </span>
    `;
}

// A value is a way in. Reading a record and changing it are the same screen in the
// mockup: a person presses the value and its group opens for editing, with a pen
// showing that it can be. Only a readonly field, a field already being edited and
// a field being arranged are not buttons -- each already means something else.
function renderField(context, field, editing, sectionKey = '', groupKey = '') {
    const key = String(field.key ?? '');
    const error = context.errors.get(key);

    const arrangementError = context.configuring ? context.entryError('field', key) : null;

    return html`
        <div class="sf-property-view-field flex flex-col gap-1 min-w-0 ${field.width === 'full' ? 'sf-property-view-field--full' : ''}"
             data-field=${key}
             data-sf-sortable-item=${context.configuring ? key : nothing}
             data-arranging=${context.configuring ? 'true' : nothing}
             data-hidden=${context.configuring && field.hidden ? 'true' : nothing}>
            ${context.configuring
                    ? html`<i class="sf-icon sf-property-view-grip items-cross-center" data-sf-sortable-handle
                              aria-hidden="true">drag_indicator</i>`
                    : nothing}
            <div class="sf-property-view-field-label flex items-cross-center gap-1/3 color-on-surface-variant">
                ${String(field.label ?? key)}
                ${field.required && editing
                        ? html`<span class="sf-property-view-required color-error" aria-hidden="true">*</span>`
                        : nothing}
                ${field.hint
                        // The hint is the Framework's own affordance for a hint,
                        // sf-help-mark: a button that opens a short explanation on
                        // a press, by touch, by pointer and by keyboard alike, and
                        // announces it politely. It was a glyph carrying the words
                        // in a native `title`, which needs a hover -- so on a touch
                        // device the hint could not be read at all (Larena storage
                        // QA, 2026-10-22). The accessible name stays the hint
                        // itself, as it was on the glyph's aria-label: `label` names
                        // the button, `text` is the explanation it opens.
                        ? html`<sf-help-mark class="sf-property-view-hint"
                                             label=${String(field.hint)}
                                             text=${String(field.hint)}></sf-help-mark>`
                        : nothing}
                ${field.rare ? html`<span class="sf-property-view-rare color-on-surface-variant">${context.rareText}</span>` : nothing}
                ${field.inherited && !editing
                        ? html`<span class="sf-property-view-inherited color-on-surface-variant">${context.inheritedText}</span>`
                        : nothing}
            </div>
            ${editing || context.configuring || field.readonly === true || !context.mayEdit || context.openAll
                    ? html`<div class="sf-property-view-field-value min-w-0 flex items-cross-center gap-2 flex-wrap">${renderFieldValue(context, field, editing)}</div>`
                    : html`
                        <button
                                type="button"
                                class="sf-property-view-field-value sf-property-view-field-open min-w-0 flex items-cross-center gap-1 text-start cursor-pointer"
                                data-open-group=${groupKey}
                                title=${context.editText}
                                @click=${() => context.component.editGroup(sectionKey, groupKey)}
                        >
                            ${renderFieldValue(context, field, editing)}
                            <i class="sf-icon sf-icon--size-1/2 sf-property-view-pen" aria-hidden="true">edit</i>
                        </button>`}
            ${context.configuring ? renderFieldActions(context, field, key) : nothing}
            ${error || arrangementError
                    ? html`<div class="sf-property-view-field-error color-error" role="alert">${error || arrangementError}</div>`
                    : nothing}
        </div>
    `;
}

// A group of related records: the component composes a data view in it and the
// view asks the host for its own port. The records never come through the
// property-view seam -- rows, columns, sorting and paging are the data-view
// port's vocabulary, and relaying them through this one would duplicate all of it.
//
// `chrome=""` leaves out the search box and the page row: the list stands inside a
// group that already has a heading, and a page row under four rows of a capped
// list would offer paging through records the cap is not showing anyway.
//
// The table is slotted in, which is how a data view is composed -- its own page
// markup slots one too. An earlier version left it out and relied on the fallback
// inside the data view's content slot instead, to satisfy a fence that said a
// component rendering another one has to fetch it. That traded one defect for a
// worse one: fallback content lives in the shadow tree, where the Framework's
// page-level stylesheets do not reach, so a consumer got a list whose sort buttons
// read «unfold_more» as text and whose reference cells read «arrow_forward». The
// fence was right and the clever fix was wrong: this component does render a table,
// so it fetches cl-table.
function renderRelatedList(context, group, groupKey) {
    return html`
        <sf-data-view
                class="sf-property-view-related"
                chrome=""
                row-cap=${String(group.rowCap ?? 5)}
                port-owner="property-view"
                port-record=${context.recordId || ''}
                port-group=${groupKey}
                aria-label=${String(group.label ?? groupKey)}
        >
            <sf-table
                    slot="content"
                    toolbar="false"
                    aria-label=${String(group.label ?? groupKey)}
            ></sf-table>
        </sf-data-view>
    `;
}

// Placing a field in this group without dragging it. Dragging is the gesture the
// mockup asks for and it stays, but it is a poor way to reach a field that is
// three screens away, and no way at all without a pointer -- and a collection
// can have hundreds of fields, which no list anybody scrolls will answer.
//
// So: a search and a set of ticks. What is ticked is what this area shows, which
// makes unticking the way a field leaves it, and each row says where the field
// is now, because a field lives in one place and taking it here takes it from
// there. The surface is anchored by hand because sf-dropdown brings its own
// trigger and the trigger here is the «+».
function renderAddField(context, groupKey) {
    const options = context.fieldChoices(groupKey).map((option) => ({
        type: 'checkbox',
        size: '1/2',
        text: option.label,
        value: option.key,
        group: option.group,
        selected: option.selected,
        checked: option.selected,
        ariaLabel: option.label,
    }));
    const placed = options.filter((option) => option.selected).map((option) => option.value);

    // The list is sf-dropdown's: it carries the search, the groups, the
    // multiple selection and the surface, and takes the «+» as its trigger.
    // What is acted on is the option the change names, not the whole value the
    // dropdown now holds: the component moves a field rather than setting a
    // list, and reading the whole list as the new truth once took five fields
    // out of an area because one was ticked.
    return html`
        <sf-dropdown
                class="sf-property-view-add"
                size="1/2"
                multiple
                search="true"
                search-placeholder=${context.addFieldText}
                aria-label=${context.addFieldText}
                data-add-for=${groupKey}
                value=${placed.join(',')}
                .options=${options}
                @change=${(event) => {
                    const key = String(event.detail?.value ?? '');
                    if (!key) return;
                    const values = Array.isArray(event.detail?.values)
                        ? event.detail.values.map(String)
                        : [];
                    context.component.toggleFieldInGroup(key, groupKey, values.includes(key));
                }}
        >
            <sf-icon-button
                    slot="trigger"
                    size="1/2"
                    appearance="link"
                    scheme="secondary"
                    icon="add"
                    data-action="add-field"
                    title=${context.addFieldText}
                    aria-label=${context.addFieldText}
            ></sf-icon-button>
        </sf-dropdown>
    `;
}

function renderGroup(context, section, group) {
    const groupKey = String(group.key ?? '');
    // On a surface open all at once (edit, create) every group is open; a
    // group the host keeps closed stays shown.
    const editing = (context.openAll && group.kind !== 'related' && group.editable !== false)
        || (context.editing?.group === groupKey
            && context.editing?.section === String(section.key ?? ''));
    const fields = listed(context, group.fields);
    const configuring = context.configuring;
    const groupError = configuring ? context.entryError('group', groupKey) : null;
    const groupLocked = configuring && !context.canChangeVisibility(group);
    // The field list is a sortable list and nothing more: the drop is reported by
    // sf-sortable and applied or refused by the component, which is the seam that
    // mechanism already publishes. Its id carries the kind and the container, so
    // one listener can tell a field dropped into a group from a group dropped into
    // a section.
    const rows = html`${fields.map((field) => renderField(context, field, editing, String(section.key ?? ''), groupKey))}`;

    return html`
        <section class="sf-property-view-group bg-surface-0 flex flex-col gap-2 ${editing ? 'sf-property-view-group--editing' : ''}"
                 data-group=${groupKey}
                 data-sf-sortable-item=${configuring ? groupKey : nothing}
                 data-hidden=${configuring && group.hidden ? 'true' : nothing}
                 data-columns=${group.columns === 2 ? '2' : '1'}>
            <header class="sf-property-view-group-header flex items-cross-center justify-between gap-2">
                ${configuring
                        ? html`<i class="sf-icon sf-property-view-grip items-cross-center" data-sf-sortable-handle
                                  aria-hidden="true">drag_indicator</i>`
                        : nothing}
                ${renderEntryName(context, 'group', groupKey, String(group.label ?? groupKey),
                        'sf-property-view-group-title')}
                ${group.rare ? html`<span class="sf-property-view-rare color-on-surface-variant">${context.rareText}</span>` : nothing}
                ${configuring
                        ? html`
                            <span class="flex items-cross-center gap-1/4">
                            ${renderAddField(context, groupKey)}
                            <sf-icon-button
                                    size="1/2"
                                    appearance="link"
                                    scheme="secondary"
                                    icon="keyboard_arrow_up"
                                    data-action="group-up"
                                    ?disabled=${context.groupAt(groupKey) === 0}
                                    title=${context.moveUpText}
                                    aria-label=${context.moveUpText}
                                    @click=${() => context.component.moveGroupBy(groupKey, -1)}
                            ></sf-icon-button>
                            <sf-icon-button
                                    size="1/2"
                                    appearance="link"
                                    scheme="secondary"
                                    icon="keyboard_arrow_down"
                                    data-action="group-down"
                                    ?disabled=${context.groupAt(groupKey) === context.groupCount - 1}
                                    title=${context.moveDownText}
                                    aria-label=${context.moveDownText}
                                    @click=${() => context.component.moveGroupBy(groupKey, 1)}
                            ></sf-icon-button>
                            <sf-icon-button
                                    size="1/2"
                                    appearance="link"
                                    scheme="secondary"
                                    icon=${group.hidden ? 'visibility_off' : 'delete'}
                                    data-action="remove-group"
                                    ?disabled=${groupLocked}
                                    title=${groupLocked ? (context.layerDenied('shared') || context.hiddenText) : context.removeGroupText}
                                    aria-label=${context.removeGroupText}
                                    @click=${() => context.component.removeGroup(groupKey)}
                            ></sf-icon-button>
                            </span>`
                        : nothing}
                ${!configuring && !editing && context.mayEdit && !context.openAll && group.kind !== 'related' && group.editable !== false
                        ? html`
                            <sf-button
                                    appearance="link"
                                    size=${context.size}
                                    text=${context.editText}
                                    data-action="edit"
                                    @click=${() => context.component.editGroup(String(section.key ?? ''), groupKey)}
                            ></sf-button>`
                        : nothing}
            </header>
            ${groupError
                    ? html`<div class="sf-property-view-group-error" role="alert">${groupError}</div>`
                    : nothing}
            ${group.kind === 'related'
                    ? html`<div class="sf-property-view-group-related">${renderRelatedList(context, group, groupKey)}</div>`
                    : configuring
                            ? html`
                                <sf-sortable
                                        class="sf-property-view-group-fields min-w-0"
                                        group="field"
                                        accepts="field"
                                        id=${`field:${groupKey}`}
                                        label=${String(group.label ?? groupKey)}
                                >${rows}</sf-sortable>`
                            : html`<div class="sf-property-view-group-fields min-w-0">${rows}</div>`}
        </section>
    `;
}

// The phone's first screen: the sections as a list, each one leading to its own
// screen. Drawn only when there is more than one, for the same reason the desktop
// list is: a list of one is a control nobody can use, and it would put a screen
// between a person and the only groups there are.
function renderPhoneSectionList(context, sections) {
    return html`
        <nav class="sf-property-view-phone-sections flex flex-col" aria-label=${context.sectionsLabel}>
            ${sections.map((section) => html`
                <button
                        type="button"
                        class="sf-property-view-phone-section flex items-cross-center justify-between gap-1"
                        data-phone-section=${String(section.key)}
                        @click=${() => context.component.openPhoneSection(String(section.key))}
                >
                    <span class="sf-property-view-phone-section-label">${String(section.label ?? section.key)}</span>
                    <i class="sf-icon" aria-hidden="true">chevron_right</i>
                </button>
            `)}
        </nav>
    `;
}

// The second screen's head: back to the list, and the name of where you are.
function renderPhoneSectionHead(context) {
    return html`
        <div class="sf-property-view-phone-head flex items-cross-center gap-2">
            <sf-icon-button
                    size=${context.size}
                    appearance="link"
                    icon="arrow_back"
                    data-action="phone-back"
                    aria-label=${context.backLabel}
                    @click=${() => context.component.closePhoneSection()}
            ></sf-icon-button>
            <h2 class="sf-property-view-phone-title">${context.phoneSectionLabel}</h2>
        </div>
    `;
}

function renderSectionList(context, sections) {
    // One section is drawn as its groups alone: a list of one is a control nobody
    // can use, and the consumer's request asks for the groups to stand alone.
    if (sections.length < 2 && !context.configuring) return nothing;

    return html`
        <nav class="sf-property-view-sections self-cross-stretch flex flex-col min-w-0" aria-label=${context.sectionsLabel}>
            ${context.configuring
                    ? html`
                        ${renderSectionTabsArranged(context, sections)}
                        <div class="sf-property-view-additions flex">${renderAddSection(context)}</div>`
                    : renderSectionTree(context, sections)}
        </nav>
    `;
}

// Reading: the sections are a tree, which carries the keyboard walk and the
// selection a list of destinations needs.
//
// The items are given as data rather than as children: sf-tree reads its child
// items once and removes them, so a section renamed while the view is being
// arranged kept its old name in this list.
function renderSectionTree(context, sections) {
    const items = sections.map((section) => ({
        label: sectionName(context, section),
        value: String(section.key),
        selected: String(section.key) === context.selectedSection,
        openIcon: section.icon ? String(section.icon) : '',
        closedIcon: section.icon ? String(section.icon) : '',
    }));

    return html`
        <sf-tree
                selection="single"
                .items=${items}
                @sf-tree-selection-change=${(event) => {
                    const value = event.detail?.value;
                    if (value) context.component.selectSection(String(value));
                }}
        ></sf-tree>
    `;
}

// Arranging: the same tabs, in an order a drag can change, and each one still a
// place to drop a field or an area. A tree cannot be reordered by a pointer --
// it takes its items once and owns their rows -- so while the view is arranged
// the tabs are rows of this component's own, which is also what lets a tab carry
// a handle.
function renderSectionTabsArranged(context, sections) {
    return html`
        <sf-sortable
                class="sf-property-view-section-tabs flex flex-col"
                group="section"
                accepts="section"
                id="section:all"
                label=${context.sectionsLabel}
        >
            ${sections.map((section) => html`
                <button
                        type="button"
                        class="sf-property-view-section-tab flex items-cross-center gap-1/3 min-w-0 text-start cursor-pointer"
                        data-section-tab=${String(section.key)}
                        data-sf-sortable-item=${String(section.key)}
                        aria-current=${String(section.key) === context.selectedSection ? 'true' : nothing}
                        @click=${() => context.component.selectSection(String(section.key))}
                >
                    <i class="sf-icon sf-property-view-section-grip color-on-surface-variant" data-sf-sortable-handle
                       aria-hidden="true">drag_indicator</i>
                    <i class="sf-icon" aria-hidden="true">${section.icon ? String(section.icon) : 'folder'}</i>
                    <span class="sf-property-view-section-tab-label flex-auto min-w-0">${sectionName(context, section)}</span>
                </button>
            `)}
        </sf-sortable>
    `;
}

// A rare section says so in its own name. sf-tree-item takes a label string and
// reads anything slotted into it as text -- markup put there printed lit's own
// markers into the list -- so a trailing mark of its own is a gap in that
// component rather than something to work around here.
function sectionName(context, section) {
    const label = String(section.label ?? section.key);
    return section.rare ? `${label} · ${context.rareText}` : label;
}

// The bar at the foot of the panel: what is being done to the record right now,
// and what can be done to the record itself. Arranging the view is neither, so
// while the view is being arranged there is no bar -- its own band carries that
// mode's actions, and two bars at once was the state the owner saw.
//
// The count of changed fields is gone. It named a number nobody acts on, while
// the two controls that matter stood after it; what is still said is what stops
// a save -- errors and a conflict.
// Sections as a row of tabs rather than a list beside the fields. The same
// sections either way -- what changes is where they are read, not what they are
// -- so a section is still selected the same way and a group still moves to one
// by being dropped on it.
// sf-tabs reads its set from an attribute, through a parser that splits on `|`
// and reads `::` as flags; it has no declarative way to take richer items, so a
// section's icon cannot travel with it here. A label carrying either sequence
// would be read as structure, so it is spelled out of the way.
function tabLabel(context, section) {
    return sectionName(context, section).replace(/\|/gu, '\u2502').replace(/::/gu, ':\u2236');
}

// The tab row only. The groups are drawn under it by the layout, as they are
// beside the list, so a section's content is in one place whichever way the
// sections are read. Slotting empty panels in here drew empty tabs: a slot for
// a tab replaces its label.
function renderSectionTabs(context, sections) {
    const at = Math.max(0, sections.findIndex((section) => String(section.key) === context.selectedSection));
    return html`
        <sf-tabs
                class="sf-property-view-tabs"
                size=${context.size}
                active-index=${String(at)}
                aria-label=${context.sectionsLabel}
                items=${sections.map((section) => tabLabel(context, section)).join('|')}
                @sf-tab-change=${(event) => {
                    const section = sections[Number(event.detail?.current)];
                    if (section) context.component.selectSection(String(section.key));
                }}
        ></sf-tabs>
    `;
}

// The type of a view at 1/2: a step down from 1 in every role, so the record
// reads at the table's size. Variables rather than a class: the panel is drawn
// in a drawer moved to the page's end, outside the element.
function sizeStyle(context) {
    if (context.size !== '1/2') return '';
    return ' --sf-property-view--title-size: var(--sf-heading-5--size); --sf-property-view--title-height: var(--sf-heading-5--height);'
        + ' --sf-property-view--group-size: var(--sf-text-medium--size); --sf-property-view--group-height: var(--sf-text-medium--height);'
        + ' --sf-property-view--label-size: var(--sf-label-medium--size); --sf-property-view--label-height: var(--sf-label-medium--height);'
        + ' --sf-property-view--value-size: var(--sf-text-small--size); --sf-property-view--value-height: var(--sf-text-small--height);';
}

// The foot of a surface open all at once: Create or Save, and Cancel, with
// what went wrong beside them.
function renderOpenAllBar(context) {
    const creating = context.mode === 'create';
    return html`
        <div class="sf-property-view-actions flex items-cross-center gap-2 flex-wrap" role="group">
            <sf-button
                    appearance="default"
                    size=${context.size}
                    text=${creating ? context.createText : context.saveText}
                    data-action=${creating ? 'create' : 'save'}
                    ?disabled=${!creating && context.changed.size === 0}
                    @click=${() => context.component.saveAll()}
            ></sf-button>
            <sf-button
                    appearance="outline"
                    size=${context.size}
                    text=${context.cancelText}
                    data-action="cancel"
                    @click=${() => context.component.cancelEdit()}
            ></sf-button>
            ${context.errors.size
                    ? html`<span class="sf-property-view-errors color-error">${context.errorsText}: ${context.errors.size}</span>`
                    : nothing}
            ${context.conflict
                    ? html`<span class="sf-property-view-conflict color-error" role="alert">${context.conflict}</span>`
                    : nothing}
        </div>
    `;
}

function renderActions(context, {panel = false} = {}) {
    // A surface placed to show the object has no footer of its own (owner,
    // 2026-10-14): a reader sees values, not controls that would refuse.
    if (context.mode === 'view') return nothing;
    if (context.openAll) return renderOpenAllBar(context);
    const removable = context.mode !== 'create' && context.recordActions.includes('record.delete');
    // While the view is arranged the foot carries that mode's controls instead:
    // saving a record and arranging the view it is read in are two modes, and a
    // bar holding both would offer a save for something nobody was editing.
    if (context.configuring) return renderConfigureBar(context);
    // A panel's foot holds every action on the record -- the host's own, slotted
    // as `footer`, and the delete -- in one bar under the fields (owner,
    // 2026-10-14). They were drawn in the scrolling body, the delete as one more
    // section of it.
    const hosted = panel && context.hasHostSlot('footer');
    if (!context.editing && !removable && !hosted) return nothing;

    return html`
        <div class="sf-property-view-actions flex items-cross-center gap-2 flex-wrap" role="group">
            ${context.editing
                    ? html`
                        <sf-button
                                appearance="default"
                                size=${context.size}
                                text=${context.saveText}
                                data-action="save"
                                ?disabled=${context.changed.size === 0}
                                @click=${() => context.component.saveGroup()}
                        ></sf-button>
                        <sf-button
                                appearance="outline"
                                size=${context.size}
                                text=${context.cancelText}
                                data-action="cancel"
                                @click=${() => context.component.cancelEdit()}
                        ></sf-button>`
                    : nothing}
            ${context.errors.size
                    ? html`<span class="sf-property-view-errors color-error">${context.errorsText}: ${context.errors.size}</span>`
                    : nothing}
            ${context.conflict
                    ? html`<span class="sf-property-view-conflict color-error" role="alert">${context.conflict}</span>`
                    : nothing}
            <span class="grow"></span>
            ${hosted ? html`<div class="sf-property-view-host-footer flex flex-wrap items-cross-center gap-2">${context.hostSlot('footer')}</div>` : nothing}
            ${removable
                    ? html`
                        <sf-icon-button
                                appearance="link"
                                status="error"
                                size=${context.size}
                                icon="delete"
                                data-action="delete"
                                title=${context.deleteText}
                                aria-label=${context.deleteText}
                                @click=${() => context.component.deleteRecord()}
                        ></sf-icon-button>`
                    : nothing}
        </div>
    `;
}

// An unplaced field is being arranged, not read: it shows its name and a handle
// and nothing else. Drawn like a placed one it carried its value, so the area
// read as a group of fields that happen to be last rather than as the fields
// this view does not show.
function renderUnplacedField(context, field) {
    const key = String(field.key ?? '');
    return html`
        <div class="sf-property-view-field sf-property-view-field--unplaced flex flex-col gap-1 min-w-0"
             data-field=${key}
             data-sf-sortable-item=${key}
             data-arranging="true">
            <i class="sf-icon sf-property-view-grip items-cross-center" data-sf-sortable-handle aria-hidden="true">drag_indicator</i>
            <div class="sf-property-view-field-label flex items-cross-center gap-1/3 color-on-surface-variant">
                ${String(field.label ?? key)}
                ${field.rare ? html`<span class="sf-property-view-rare color-on-surface-variant">${context.rareText}</span>` : nothing}
            </div>
        </div>
    `;
}

// Fields the view places nowhere. Drawn only while the view is being arranged,
// because they are not part of what a person reads -- and drawn even when there
// are none, so that dragging a field out of every group has somewhere to land
// and a person can see that taking a field out does not destroy it.
function renderUnplaced(context) {
    if (!context.configuring) return nothing;

    const fields = context.unplaced;
    // The Framework's own accordion rather than a fold built here: the owner
    // asked for it by name, and a second thing that opens and closes is a
    // second thing to keep looking right (owner, 2026-10-09).
    //
    // The accordion owns whether it is open -- its script claims any
    // .sf-accordion the document gains and remembers the state -- so the panel
    // does not bind it. What the panel does instead is press the trigger when a
    // drag starts, the way a person would, and press it back when the drag
    // ends. One controller, and a drop target that is visible exactly when
    // something is in the air.
    //
    // The hint paragraph is gone: it described in two lines what the «+» beside
    // every area does, under a heading that already says what the bin is.
    return html`
        <article
                class="sf-accordion sf-accordion--outline sf-property-view-group--unplaced"
                data-unplaced="true"
        >
            <h3 class="sf-accordion-heading">
                <button
                        type="button"
                        class="sf-accordion-trigger"
                        data-action="toggle-unplaced"
                        aria-expanded="false"
                >
                    <span class="sf-accordion-title flex items-cross-center gap-1/3">
                        ${context.unplacedTitle}
                        ${fields.length
                            ? html`<sf-tag
                                    kind="default"
                                    size="1/3"
                                    appearance="surface"
                                    text=${String(fields.length)}
                            ></sf-tag>`
                            : nothing}
                    </span>
                    <sf-icon icon="chevron_right" size="1/2"></sf-icon>
                </button>
            </h3>
            <div class="sf-accordion-content" role="region" hidden>
                <sf-sortable
                        class="sf-property-view-group-fields sf-property-view-unplaced"
                        group="field"
                        accepts="field"
                        id=${`unplaced:${context.recordId || 'record'}`}
                        label=${context.unplacedTitle}
                >${fields.map((field) => renderUnplacedField(context, field))}</sf-sortable>
            </div>
        </article>
    `;
}

// The three controls a panel carries, and none of them invents anything. Close is
// the component's own business; copying and opening need an address, and the
// address is the host's -- a composite that constructed a URL would be guessing at
// the consumer's routing and would be wrong in the first consumer whose routing
// did not match the guess. No address, no two controls.
// The panel's head, as the mockup draws it: the collection on its own line above,
// then the record's name with its favourite star, the host's own actions, and a
// «⋯» for what belongs to the view rather than to the record. One block, so there
// are no empty bands between the title and the first card -- the view this replaces
// had two of about sixty pixels, which is what the owner saw first.
// What belongs to the view rather than to the record: arranging it, resetting it
// and whether the rare entries are shown. It is a menu because there is more than
// one of them; pressing «⋯» used to run the first item straight away, so the
// second never had anywhere to be.
function renderMenuControl(context) {
    const items = context.panelMenuItems;
    const host = context.hasHostSlot('menu') ? context.hostSlot('menu') : null;
    // The views are chosen from this menu too, so more than one of them is a
    // reason for it to stand even with nothing else in it.
    const views = !context.configuring && (context.viewProfiles?.length ?? 0) > 1;
    if (!items.length && !host && !views) return nothing;

    // Always the menu, never the one item drawn in its place. The place is the
    // panel's own: what belongs in it depends on the task, and a consumer that
    // slots its items into `menu` finds the same «\u2026» wherever it looks --
    // which it could not when one item meant a different glyph in that corner
    // (owner, 2026-10-08).
    // The «⋯» opens the Framework's standard menu (owner, 2026-10-12), and so
    // do the items a host slots into `menu` (owner, 2026-10-14): they were a
    // popover of link buttons, the one menu of the panel drawn otherwise. The
    // slotted elements stay in the page, hidden, and a row of the menu stands
    // for each -- a link row for a link, a press on the element for the rest.
    return html`
        <sf-icon-button
                appearance="link"
                scheme="on-surface"
                size=${context.size}
                icon="more_horiz"
                data-action="menu"
                aria-haspopup="menu"
                aria-expanded="false"
                aria-label=${context.menuLabel}
                @click=${(event) => context.component.openPanelMenu(event.currentTarget.querySelector('button') ?? event.currentTarget)}
        ></sf-icon-button>
        ${host ? html`<div class="sf-property-view-host-menu" data-host-menu hidden>${host}</div>` : nothing}
    `;
}

function renderPanelHead(context) {
    return html`
        <header class="sf-property-view-head flex flex-col gap-1">
            <div class="sf-property-view-title-row flex items-cross-center gap-1 min-w-0">
                <h2 class="sf-property-view-title min-w-0 overflow-hidden">${context.panelLabel || context.recordId || ''}</h2>
                <!-- One glyph, filled when the record is a favourite and outlined
                     when it is not: a star that changes shape as well as fill
                     says two things where one will do (owner, 2026-10-08). The
                     press raises the component's own event; whether the record
                     is a favourite stays the host's to decide and to answer. -->
                <sf-icon-button
                        appearance="link"
                        size=${context.size}
                        icon="star"
                        ?filled=${context.favourite}
                        data-action="favourite"
                        aria-pressed=${context.favourite ? 'true' : 'false'}
                        aria-label=${context.favouriteLabel}
                        @click=${() => context.component.toggleFavourite()}
                ></sf-icon-button>
                <span class="grow"></span>
                ${context.hasHostSlot('actions') ? context.hostSlot('actions') : nothing}
                ${renderMenuControl(context)}
            </div>
        </header>
    `;
}

// The edge controls stand on a raised surface, elevation 3 as a menu does: its
// own fill and shadow, and the text role that goes with it. On --sf-surface-0
// they were the page's darkest colour on a dimmed page in the dark theme and
// could hardly be found (owner, 2026-10-13). Inline, because the button's own
// appearance rule outranks any selector this sheet could write.
const EDGE_SURFACE = '--sf-icon-button--background-color: var(--sf-elevation-3--surface); --sf-on-surface-variant: var(--sf-on-elevation-3--variant); box-shadow: var(--sf-elevation-3--shadow)';

// Round, and on the panel's outer edge rather than inside its head: in a stack
// each panel keeps its own set visible past the one above it, which is what the
// mockup shows and what a row inside the head cannot do.
//
// A panel filling the screen has no outside, and the drawer brings the strip in
// along the top of it, at its inline start. There the controls stand in a row,
// as the drawer lays its own edge out, and the head keeps their room
// (panelFills): a column there stood over the record's name and the first rows
// on a phone (docs review, round 4, 2026-10-20).
function panelFills(context) {
    return !context.wide || context.panelSize === 'full';
}

function renderPanelControls(context) {
    return html`
        <div class="sf-property-view-edge flex ${panelFills(context) ? 'flex-row' : 'flex-col'} gap-1/2" slot="edge"
             aria-label=${context.closeLabel}>
            <sf-icon-button
                    appearance="tonal"
                    scheme="on-surface"
                    root-style=${EDGE_SURFACE}
                    size=${context.size}
                    icon="close"
                    data-action="close"
                    aria-label=${context.closeLabel}
                    title=${context.closeLabel}
                    @click=${() => context.component.closePanel('close')}
            ></sf-icon-button>
            ${context.address
                    ? html`
                        <sf-copy-button
                                appearance="tonal"
                                root-style=${EDGE_SURFACE}
                                size=${context.size}
                                icon="link"
                                value=${context.addressUrl}
                                label=${context.copyLinkLabel}
                                success-text=${context.linkCopiedLabel}
                                duration=${String(context.copyFeedbackMs)}
                                data-action="copy-link"
                                .propertyView=${context.component}
                                @sf-copy=${() => context.component.announceAddressCopy(true)}
                                @sf-copy-error=${() => context.component.announceAddressCopy(false)}
                        ></sf-copy-button>`
                    : nothing}
            ${context.canOpenFullPage
                    ? html`
                        <sf-icon-button
                                appearance="tonal"
                                scheme="on-surface"
                                root-style=${EDGE_SURFACE}
                                size=${context.size}
                                icon="open_in_full"
                                aria-label=${context.openFullLabel}
                                title=${context.openFullLabel}
                                data-action="open-full"
                                @click=${() => context.component.openFullPage()}
                        ></sf-icon-button>`
                    : nothing}
        </div>
    `;
}

// The phone's list screen: below the breakpoint, with more than one section and
// none of them opened. Named once rather than written out at each of the three
// places that ask it -- the first version repeated the expression and the third
// copy was the one that forgot to suppress the groups, so the list screen drew the
// list with a section's groups underneath it.
function onPhoneSectionList(context, sections) {
    return !context.wide && sections.length > 1 && context.phoneSection === null;
}

// The section being arranged, named where its areas are. The section list is
// drawn with sf-tree-item, which takes a label as a string and reads anything
// slotted into it as text, so neither a pencil nor a field can stand in the list
// itself -- and a section shown as a tab has no list at all. The name of the
// place you are arranging belongs above the things you are arranging anyway.
function renderSectionBar(context, section, count) {
    if (!section) return nothing;

    return html`
        <div class="sf-property-view-section-bar flex items-cross-center gap-1/4"
             data-section=${String(section.key)}>
            ${context.configuring
                    ? renderSectionIcon(context, section)
                    : html`<i class="sf-icon" aria-hidden="true">${section.icon ? String(section.icon) : 'folder'}</i>`}
            ${renderEntryName(context, 'section', String(section.key),
                    String(section.label ?? section.key), 'sf-property-view-section-title min-w-0')}
            <sf-icon-button
                    size="1/2"
                    appearance="link"
                    scheme="secondary"
                    icon="delete"
                    data-action="remove-section"
                    ?disabled=${count < 2}
                    title=${context.removeSectionText}
                    aria-label=${context.removeSectionText}
                    @click=${() => context.component.removeSection(String(section.key))}
            ></sf-icon-button>
        </div>
    `;
}

// The glyph a section is marked with, chosen from a grid of them. A column of a
// hundred icons is a column nobody scrolls to the end of, so the dropdown lays
// its options out several to a row and searches by the name of the glyph, which
// is the only thing about an icon a person can type.
function renderSectionIcon(context, section) {
    const current = section.icon ? String(section.icon) : '';
    const options = context.sectionIconChoices.map((icon) => ({
        kind: 'icon',
        icon,
        text: icon,
        value: icon,
        ariaLabel: icon,
        selected: icon === current,
    }));

    // The chooser is the dropdown laid out as a grid: a hundred and twenty
    // glyphs in a column is a column nobody scrolls to the end of, and the
    // search is the only thing about a glyph a person can type. The trigger is
    // the glyph itself, because a field spelling out the name of what is drawn
    // beside it says the same thing twice.
    return html`
        <sf-dropdown
                class="sf-property-view-section-icon"
                size="1/2"
                layout="grid"
                columns="6"
                search="true"
                search-placeholder=${context.sectionIconText}
                aria-label=${context.sectionIconText}
                data-icon-for=${String(section.key)}
                value=${current}
                .options=${options}
                @change=${(event) => context.component.setSectionIcon(
                        String(section.key), event.detail?.value ?? '')}
        >
            <sf-icon-button
                    slot="trigger"
                    size="1/2"
                    appearance="link"
                    scheme="on-surface"
                    icon=${current || 'folder'}
                    data-action="section-icon"
                    title=${context.sectionIconText}
                    aria-label=${context.sectionIconText}
            ></sf-icon-button>
        </sf-dropdown>
    `;
}

// Making something new, at the end of the arrangement, where a person who has
// run out of places to put a field looks for one (owner, 2026-10-07). An area
// and a section are the two boxes this view has: one holds fields, the other
// holds areas. Both are named the moment they are made -- the new name opens
// for typing -- because an area called «Новая область» among four real ones is
// a box nobody can tell from the others.
//
// Both stand the width of what they add to, in the neutral scheme and with no
// glyph: making a box is not the primary act of this mode, and a full-width
// outlined button with a plus in it read as the main thing to do on the screen.
// «Add an area» takes the ladder's size 1, the size the panel's own controls
// use; «add a section» stays a step below it, which is where it sits in the
// rail (owner, 2026-10-09).
// Keeping the list of named views, under the arrangement they belong to --
// the same place a new area and a new section are made, because making a box is
// one act whatever the box is (owner, 2026-10-09).
//
// A view is named the moment it is made, like an area and a section: a view
// called «Новый вид» among four real ones is one nobody can tell from the
// others. Removing is offered per view and not at all for the last shared one:
// a scope with no shared view has nothing for a person who has made none of
// their own, and the host refuses it anyway.
function renderViewProfiles(context) {
    const profiles = context.viewProfiles ?? [];
    if (!profiles.length) return nothing;

    return html`
        <section class="sf-property-view-profiles flex flex-col gap-1/3">
            <h3 class="sf-property-view-profiles-title">${context.viewProfileLabel}</h3>
            ${profiles.map((profile) => html`
                <div class="sf-property-view-profile flex items-cross-center gap-1/3" data-profile=${profile.id}>
                    <sf-input
                            size="1/2"
                            appearance="bordered"
                            class="flex-auto min-w-0"
                            value=${profile.label}
                            aria-label=${profile.label}
                            data-action="rename-profile"
                            @change=${(event) => context.component.renameViewProfile(
                                    profile.id, event.detail?.value ?? event.target?.value ?? '')}
                    ></sf-input>
                    <span class="sf-property-view-profile-scope color-on-surface-variant">
                        ${profile.shared ? context.sharedLayerText : context.personalLayerText}
                    </span>
                    <sf-icon-button
                            size="1/2"
                            appearance="link"
                            scheme="secondary"
                            icon="close"
                            data-action="delete-profile"
                            ?disabled=${!context.canDeleteViewProfile(profile.id)}
                            title=${context.canDeleteViewProfile(profile.id)
                                    ? context.deleteViewText
                                    : context.lastSharedViewText}
                            aria-label=${context.deleteViewText}
                            @click=${() => context.component.deleteViewProfile(profile.id)}
                    ></sf-icon-button>
                </div>
            `)}
            <sf-button
                    appearance="outline"
                    scheme="on-surface"
                    size="1/2"
                    text=${context.addViewText}
                    data-action="add-profile"
                    @click=${() => context.component.createViewProfile(context.newViewText)}
            ></sf-button>
        </section>
    `;
}

function renderArrangementAdditions(context, section) {
    return html`
        <div class="sf-property-view-additions flex flex-col items-cross-stretch gap-1">
            <sf-button
                    appearance="outline"
                    scheme="on-surface"
                    size=${context.size}
                    text=${context.addGroupText}
                    data-action="add-group"
                    @click=${() => context.component.addGroup(section ? String(section.key) : '')}
            ></sf-button>
            ${sidebarDrawn(context) ? nothing : renderAddSection(context)}
            ${renderViewProfiles(context)}
        </div>
    `;
}

// A new section is made at the end of the sections (owner, 2026-10-08), which is
// where a person looks for one: under the list of them. Without a rail there is
// no list to put it under, so it stands beside «add an area» as before.
function renderAddSection(context) {
    return html`
        <sf-button
                appearance="outline"
                scheme="on-surface"
                size="1/2"
                text=${context.addSectionText}
                data-action="add-section"
                @click=${() => context.component.addSection()}
        ></sf-button>
    `;
}

// Whether the column of tabs is drawn beside the fields. It holds the tabs and
// nothing else (owner, 2026-10-07), so what used to stand above the whole panel
// -- the band of the arranging mode -- stands above the fields instead, and the
// column reaches the top of the panel the way a rail of tabs does.
function sidebarDrawn(context) {
    const sections = listed(context, context.sections);
    return Boolean(context.wide && context.sectionsAs === 'list'
        && (sections.length > 1 || context.configuring));
}

// The record on its way: three groups of field bars in the Framework's
// skeleton, the shape of what is coming -- a sentence in its place said
// nothing about it (owner, 2026-10-14).
const SKELETON_WIDTHS = ['w-1/3', 'w-2/3', 'w-1/2', 'w-3/4', 'w-2/5'];
function renderLoading(context) {
    const bar = (at, size) => html`<div class="sf-skeleton sf-skeleton--animation-pulse" aria-hidden="true">
        <div class="sf-skeleton-text sf-skeleton-text--size-${size} ${SKELETON_WIDTHS[at % SKELETON_WIDTHS.length]}"></div></div>`;
    return html`
        <div class="sf-property-view-loading flex flex-col gap-4" data-state="loading">
            ${[0, 1, 2].map((group) => html`<div class="flex flex-col gap-2">
                ${bar(group, '1')}
                ${[0, 1, 2].map((field) => html`<div class="flex flex-col gap-1/2">${bar(group + field + 1, '1/2')}${bar(group * 2 + field, '1')}</div>`)}
            </div>`)}
            <span class="sr-only" role="status">${context.message}</span>
        </div>`;
}

function renderLoadFailure(context) {
    const failure = context.loadFailure;
    return html`<sf-empty-state kind=${failure.kind} size=${context.size === '1/2' ? '1/2' : '1'} heading-level="2"
        text=${failure.text || nothing}
        .actions=${failure.kind === 'error' ? null : []}
        @sf-empty-state-action=${(event) => { if (event.detail?.id === 'retry') context.component.load('retry'); }}></sf-empty-state>`;
}

function renderBody(context, railOutside = false, withActions = true) {
    if (context.loading) return renderLoading(context);
    if (context.loadFailure) return renderLoadFailure(context);
    // Sections are listed the same way fields and groups are while the view is
    // being configured: a hidden section filtered out here would be a section
    // nobody could ever show again.
    const sections = listed(context, context.sections);
    const current = sections.find((section) => String(section.key) === context.selectedSection)
        ?? sections[0] ?? null;

    return html`
        <div class="sf-property-view-status" role="status" aria-live="polite" ?hidden=${!context.message}>
            ${context.message}
        </div>
        ${!context.panel && (context.hasHostSlot('actions') || context.hasHostSlot('menu') || context.panelMenuItems.length)
                ? html`
                    <div class="sf-property-view-host-actions flex flex-wrap items-cross-center justify-end gap-1">
                        ${context.hasHostSlot('actions') ? context.hostSlot('actions') : nothing}
                        ${renderMenuControl(context)}
                    </div>`
                : nothing}
        ${onPhoneSectionList(context, sections) ? renderPhoneSectionList(context, sections) : nothing}
        ${context.wide && context.sectionsAs === 'tabs' && sections.length > 1
                ? renderSectionTabs(context, sections)
                : nothing}
        <div class="sf-property-view-layout"
             style=${`--sf-property-view--sections-width: ${context.sectionsWidth};${context.panel ? '' : sizeStyle(context)}`}
             data-sections=${String(sections.length)}
             data-screen=${onPhoneSectionList(context, sections) ? 'sections' : 'groups'}>
            ${!context.wide && sections.length > 1 && context.phoneSection !== null
                    ? renderPhoneSectionHead(context)
                    : nothing}
            ${sidebarDrawn(context) && !railOutside ? renderSectionList(context, sections) : nothing}
            ${context.isEmptyRecord && !context.configuring
                    ? html`<p class="sf-property-view-empty-record color-on-surface-variant"
                              role="status">${context.emptyRecordText}</p>`
                    : nothing}
            ${onPhoneSectionList(context, sections) ? nothing : context.configuring
                    ? html`
                        <div class="sf-property-view-body flex-auto min-w-0 flex flex-col gap-4">
                            ${renderSectionBar(context, current, sections.length)}
                            <sf-sortable
                                    class="sf-property-view-groups flex flex-col gap-4"
                                    group="group"
                                    accepts="group"
                                    id=${`group:${current ? String(current.key) : ''}`}
                                    label=${String(current?.label ?? current?.key ?? '')}
                            >${listed(context, current?.groups).map((group) => renderGroup(context, current, group))}</sf-sortable>
                            ${renderArrangementAdditions(context, current)}
                            ${renderUnplaced(context)}
                        </div>`
                    : html`
                        <div class="sf-property-view-body flex-auto min-w-0 flex flex-col gap-4">
                            ${context.visible(current?.groups).map((group) => renderGroup(context, current, group))}
                        </div>`}
        </div>
        ${withActions && context.hasHostSlot('footer')
                ? html`<div class="sf-property-view-host-footer flex flex-wrap items-cross-center gap-2">${context.hostSlot('footer')}</div>`
                : nothing}
        ${withActions ? renderActions(context) : nothing}
    `;
}

// A deeper window is narrower by a step, so the one below shows along the
// inline-start edge. That is what makes a stack visible rather than merely true
// in the DOM, and `width` is a declared input on sf-drawer, so it reaches into
// none of that component's internals.
//
// A window above the stack takes no step in from the one below (owner,
// 2026-10-07): the step read as the panel having slipped rather than as a stack,
// and the page behind is already dimmed, which says there is something under
// this. sf-drawer keeps `stack-offset` for a consumer that wants the step; this
// one asks for none.
//
// The panel lies *over* the page: `overlay` is on, so the page behind is dimmed and
// keeps its own layout. It was off before, which is how a consumer's page came to
// be squeezed instead of covered -- the first thing the owner pointed at.
//
// `modal` is on because the drawer draws its overlay only when it is -- the
// element is marked hidden unless modal and overlay are both set, which was
// measured rather than assumed. Dimming the page is what the mockup asks for, and
// a panel that dims the page is modal in the sense that matters. Esc is still
// handled here rather than by the drawer, because in a stack it must close the top
// window and not every one of them.
//
// The drawer is given no `title`: the panel draws its own head, with the collection
// above the name and the star and the «⋯» beside it, and a drawer title as well
// would be the same words twice.
export function renderPropertyViewTemplate(context) {
    if (!context.panel) return renderBody(context);

    // The panel is laid out the way a page is (owner, 2026-10-08): a head across
    // the top, a foot across the bottom, and what is between them scrolling
    // under both. The bands were sticky inside the panel's own scroller before,
    // which held them only while their containing block was on screen -- so a
    // record scrolled far enough took its own head and foot with it.
    //
    // With a rail of tabs what is between them is two columns, each with its own
    // scrollbar: a long list of sections scrolls without moving the record, and
    // a long record scrolls without moving the list.
    const rail = sidebarDrawn(context);

    // `show-close` is off because the panel draws its own close, in the strip
    // beside copy-link and open-full. With both, a panel carried two close
    // buttons a step apart, and on a phone neither was reachable: the strip is
    // placed a gutter's width beyond the panel's inline start, which on a
    // full-screen drawer is off the screen.
    return html`
        <sf-drawer
                open
                placement="inline-end"
                modal="true"
                overlay="true"
                size=${context.wide ? context.panelSize : 'full'}
                width=${context.wide ? (context.drawerWidth || nothing) : nothing}
                gutter="var(--sf-space-1)"
                panel-style=${`--sf-drawer-background: var(--sf-surface-1); --sf-property-view--sections-width: ${context.sectionsWidth}; scrollbar-gutter: auto;${sizeStyle(context)}`}
                show-close="false"
                close-label=${context.closeLabel}
                close-on-esc="false"
                label=${context.panelLabel || context.recordId || ''}
        >
            ${renderPanelControls(context)}
            <div class="sf-property-view-panel relative flex flex-col gap-2${rail ? ' sf-property-view-panel--railed' : ''}${panelFills(context) ? ' sf-property-view-panel--fills' : ''}"
                 style=${panelFills(context)
                         ? `--sf-property-view--edge-room: calc(${context.edgeControlCount} * ${context.edgeControlWidth} + ${context.edgeControlCount - 1} * var(--sf-space-1\\/2));`
                         : nothing}
                 data-record-id=${context.recordId || ''}
                 data-stack-depth=${String(context.stackDepth)}
                 data-stacked=${context.isTopPanel ? 'false' : 'true'}
            >
                ${renderPanelHead(context)}
                <div class="sf-property-view-scroll flex-auto min-h-0 ${rail ? 'flex' : 'flex flex-col'}">
                    ${rail
                            ? html`
                                ${renderSectionList(context, listed(context, context.sections))}
                                <div class="sf-property-view-frame flex-auto min-w-0 flex flex-col gap-2">
                                    ${renderBody(context, true, false)}
                                </div>`
                            : renderBody(context, false, false)}
                </div>
                ${renderActions(context, {panel: true})}
            </div>
        </sf-drawer>
    `;
}
