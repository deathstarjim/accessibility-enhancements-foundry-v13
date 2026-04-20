function getAccessibilitySheetRoot(html)
{
    return html instanceof HTMLElement ? html : html?.[0] instanceof HTMLElement ? html[0] : null;
}

function getApplicationElement(app, html)
{
    const appElement = getAccessibilitySheetRoot(app?.element);
    if (appElement) return appElement;
    return getAccessibilitySheetRoot(html);
}

const AE_SHEET_TABS_STATE = {
    activeApp: null,
    activeRoot: null,
};

const AE_SHEET_TABS_DEBUG = true;
const AE_SHEET_HINTS_ANNOUNCED = new Set();
const AE_BASE_PANEL_ENTRY_SELECTORS = [
    '[data-action="roll"]',
    '.rollable',
    'button',
    'a',
];
const AE_BASE_PANEL_TARGET_SELECTORS = [
    '[data-action="roll"]',
    '.rollable',
    '[data-action]',
    'button',
    'a',
    'input',
    'select',
    'textarea',
];
const AE_SHEET_ADAPTERS = [
    {
        id: "tidy5e-classic",
        matches: (app, root) => root?.dataset?.sheetModule === "tidy5e-sheet" && root.classList.contains("classic"),
        useWholePanelForTargets: true,
        contentRootSelectors: [
            '[data-tidy-sheet-part="item-table"]',
            '[data-tidy-sheet-part="item-table-row"]',
            '[data-tidy-sheet-part="skills-list"]',
            '[data-tidy-sheet-part="tools-list"]',
            '.tidy-table-container',
            '[data-tidy-sheet-part="items-container"]',
            '.skills-list-container',
            '.skills.card',
        ],
        entrySelectors: [
            '.item-name',
            '.quantity-tracker-input',
            '.command.decrementer',
            '.command.incrementer',
            '.item-toggle',
            '.tidy-table-row-use-button',
            '.tidy-table-button',
            '.tidy5e-skill-name',
            '.use-ability-roll-button',
            '.ability-save-roller',
            '.tool-roller',
            '.tool-check-roller',
            '.ability-mod',
            '.ability-save',
            '.trait-item',
            '.item-name[role="button"]',
        ],
        panelTargetSelectors: [
            '.item-name',
            '.quantity-tracker-input',
            '.command.decrementer',
            '.command.incrementer',
            '.item-toggle',
            '.tidy-table-row-use-button',
            '.tidy-table-button',
            '.tidy5e-skill-name',
            '.use-ability-roll-button',
            '.ability-save-roller',
            '.tool-roller',
            '.tool-check-roller',
            '.ability-mod',
            '.ability-save',
            '.trait-item',
            '.item-name[role="button"]',
            '.button',
            '.inline-transparent-button',
        ],
        excludedPanelTargetSelectors: [
            '.skill-expand-button',
            '.button-icon-only.proficiency',
            '[data-tidy-sheet-part="skill-container"]',
            '.action-bar button',
            '.sort-menu-option',
            '.clear-all-filters',
            '.currency-conversion',
            '.item-create',
            '.expand-button.button-toggle',
        ],
    },
    {
        id: "tidy5e-default",
        matches: (app, root) => root?.dataset?.sheetModule === "tidy5e-sheet",
        useWholePanelForTargets: true,
        contentRootSelectors: [
            '[data-tidy-sheet-part="item-table"]',
            '[data-tidy-sheet-part="item-table-row"]',
            '[data-tidy-sheet-part="skills-list"]',
            '[data-tidy-sheet-part="tools-list"]',
            '.tidy-table-container',
            '[data-tidy-sheet-part="items-container"]',
            '.skills-list-container',
            '.skills.card',
        ],
        entrySelectors: [
            '.item-name',
            '.quantity-tracker-input',
            '.command.decrementer',
            '.command.incrementer',
            '.item-toggle',
            '.tidy-table-row-use-button',
            '.tidy-table-button',
            '.tidy5e-skill-name',
            '.use-ability-roll-button',
            '.ability-save-roller',
            '.tool-roller',
            '.tool-check-roller',
            '.ability-mod',
            '.ability-save',
            '.trait-item',
            '.item-name[role="button"]',
        ],
        panelTargetSelectors: [
            '.item-name',
            '.quantity-tracker-input',
            '.command.decrementer',
            '.command.incrementer',
            '.item-toggle',
            '.tidy-table-row-use-button',
            '.tidy-table-button',
            '.tidy5e-skill-name',
            '.use-ability-roll-button',
            '.ability-save-roller',
            '.tool-roller',
            '.tool-check-roller',
            '.ability-mod',
            '.ability-save',
            '.trait-item',
            '.item-name[role="button"]',
            '.button',
            '.inline-transparent-button',
        ],
        excludedPanelTargetSelectors: [
            '.skill-expand-button',
            '.button-icon-only.proficiency',
            '[data-tidy-sheet-part="skill-container"]',
            '.action-bar button',
            '.sort-menu-option',
            '.clear-all-filters',
            '.currency-conversion',
            '.item-create',
            '.expand-button.button-toggle',
        ],
    },
    {
        id: "dnd5e-default",
        matches: (app, root) => app?.document?.documentName === "Actor",
        useWholePanelForTargets: true,
        entrySelectors: [
            'li.item[data-item-id] .item-name.item-action.rollable',
            'li.item[data-item-id] .activity-name.item-name.item-action.rollable',
            'li.item[data-item-id] .item-control[data-action="equip"]',
            'li.item[data-item-id] .item-control[data-action="toggleExpand"]',
            'li.item[data-item-id] .item-control[data-context-menu]',
            'li.item[data-item-id] .item-toggle',
            '.skill-name',
            '.saving-throw',
            '.ability-check',
            '.item-name',
            '.item-action',
            '.item-control',
            '.rollable',
            '[data-action="roll"]',
            '[data-action]',
            'button',
            'a',
        ],
        panelTargetSelectors: [
            'li.item[data-item-id] .item-name.item-action.rollable',
            'li.item[data-item-id] .activity-name.item-name.item-action.rollable',
            'li.item[data-item-id] .item-control[data-action="equip"]',
            'li.item[data-item-id] .item-control[data-action="toggleExpand"]',
            'li.item[data-item-id] .item-control[data-context-menu]',
            'li.item[data-item-id] .item-toggle',
            '.skill-name',
            '.saving-throw',
            '.ability-check',
            '.item-control',
            '.item-action',
            '.item-name',
            '.rollable',
            '[data-action="roll"]',
            '[data-action]',
            'button',
            'a',
            'input',
            'select',
            'textarea',
        ],
        excludedPanelTargetSelectors: [
            '.filter-control',
            '.adjustment-button',
            '.item-detail.item-quantity input',
            '.item-detail.item-quantity',
            '.item-detail.item-price',
            '.item-detail.item-weight',
            '.item-detail.item-roll',
            '.item-detail.item-formula',
            '.item-detail.item-uses',
            '.pills-group',
            '.pills-group .pill',
            '.pills-group .label',
            '.pills-group h3',
            '.items-header',
            '.items-section > .item-name',
            '.inventory-element > .item-name',
        ],
    },
];

function debugSheetTabs(message, details)
{
    if (!AE_SHEET_TABS_DEBUG) return;
    if (details === undefined) console.log(`[AE SheetTabs] ${message}`);
    else console.log(`[AE SheetTabs] ${message}`, details);
}

function getSheetAdapter(app, root)
{
    return AE_SHEET_ADAPTERS.find(adapter => adapter.matches(app, root)) ?? {
        id: "generic-actor-sheet",
        contentRootSelectors: [],
        entrySelectors: [],
        panelTargetSelectors: [],
    };
}

function announceSheetTabsHint(app)
{
    const appId = app?.id;
    if (!appId) return;
    if (AE_SHEET_HINTS_ANNOUNCED.has(appId)) return;

    const polite = globalThis.AEAnnounce?.polite;
    if (typeof polite !== "function") return;

    AE_SHEET_HINTS_ANNOUNCED.add(appId);
    polite("Character sheet tabs. Tab moves between tabs. Press Enter to open a tab. Control Tab returns to tabs. Escape leaves the sheet.");

    debugSheetTabs("announced sheet tabs hint", {
        appId,
        title: app?.title,
    });
}

function isActorSheetApplication(app, root)
{
    const result = app?.document?.documentName === "Actor"
        || app?.actor?.documentName === "Actor"
        || root?.matches?.(".actor")
        || root?.querySelector?.(".actor-tabs, nav.tabs[data-group]");

    debugSheetTabs("isActorSheetApplication evaluated", {
        result,
        appId: app?.id,
        constructorName: app?.constructor?.name,
        documentName: app?.document?.documentName,
        actorDocumentName: app?.actor?.documentName,
        rootTag: root?.tagName,
        rootClasses: root?.className,
    });

    return result;
}

function getTabControls(tabList)
{
    return [...tabList.querySelectorAll(":scope > [data-tab], :scope > [data-tab-id], :scope > [role='tab']")];
}

function getSiblingTabControls(control)
{
    const tabList = control.closest("nav.tabs[data-group], [role='tablist']");
    if (!tabList) return [];
    return getTabControls(tabList).filter(candidate => getTabId(candidate) && isFocusableElement(candidate));
}

function getTabId(control)
{
    return control.dataset.tabId || control.dataset.tab || "";
}

function getTabControlFromTarget(target)
{
    const control = target.closest("[role='tab'], [data-tab], [data-tab-id]");
    if (!control) return null;
    if (!control.closest("nav.tabs[data-group], [role='tablist']")) return null;
    return control;
}

function getTabLabel(control)
{
    return control.getAttribute("aria-label")
        || control.getAttribute("title")
        || control.textContent?.trim()
        || getTabId(control);
}

function getSheetFocusContainer(root)
{
    return root.querySelector(".window-content, .sheet-body, .main-content") || root;
}

function isFocusableElement(element)
{
    if (!(element instanceof HTMLElement)) return false;
    if (element.hidden) return false;
    if (element.matches("[disabled], [inert], [tabindex='-1']")) return false;
    if (element.closest("[hidden], [inert], .hidden")) return false;
    return true;
}

function getFocusableElements(root)
{
    const selector = [
        "a[href]",
        "button",
        "input",
        "select",
        "textarea",
        "[tabindex]:not([tabindex='-1'])",
        "[contenteditable='true']",
        "[role='button']",
        "[role='tab']",
    ].join(", ");

    return [...root.querySelectorAll(selector)].filter(isFocusableElement);
}

function getFocusableLikeElements(root)
{
    const selector = [
        "a",
        "button",
        "input",
        "select",
        "textarea",
        "summary",
        "label",
        "[tabindex]",
        "[contenteditable='true']",
        "[role='button']",
        "[role='tab']",
        "[data-action]",
        ".rollable",
        ".control",
        ".item-name",
        ".item-control",
    ].join(", ");

    return [...root.querySelectorAll(selector)].filter(element =>
    {
        if (!(element instanceof HTMLElement)) return false;
        if (element.hidden) return false;
        if (element.closest("[hidden], [inert], .hidden")) return false;
        return true;
    });
}

function getPanelTargetRoot(panel, adapter)
{
    if (adapter.useWholePanelForTargets) return panel;

    for (const selector of adapter.contentRootSelectors ?? [])
    {
        const match = panel.querySelector(selector);
        if (match instanceof HTMLElement) return match;
    }

    return panel;
}

function getPreferredPanelEntryTarget(panel, adapter)
{
    const targetRoot = getPanelTargetRoot(panel, {
        ...adapter,
        useWholePanelForTargets: false,
    });
    const preferredSelectors = [...adapter.entrySelectors, ...AE_BASE_PANEL_ENTRY_SELECTORS];

    for (const selector of preferredSelectors)
    {
        const candidate = [...targetRoot.querySelectorAll(selector)].find(element =>
        {
            if (!(element instanceof HTMLElement)) return false;
            if (element.hidden) return false;
            if (element.closest("[hidden], [inert], .hidden")) return false;
            return true;
        });

        if (!candidate) continue;
        if (!candidate.hasAttribute("tabindex")) candidate.tabIndex = 0;
        return { target: candidate, usedFallback: false, source: `${adapter.id}:${selector}` };
    }

    return null;
}

function getPanelKeyboardTargets(panel, adapter)
{
    const targetRoot = getPanelTargetRoot(panel, adapter);
    const selectors = [...adapter.panelTargetSelectors, ...AE_BASE_PANEL_TARGET_SELECTORS];
    const selector = [...new Set(selectors)].join(", ");
    const excludedSelectors = [...new Set(adapter.excludedPanelTargetSelectors ?? [])];
    const targets = [];

    for (const element of targetRoot.querySelectorAll(selector))
    {
        if (!(element instanceof HTMLElement)) continue;
        if (element.hidden) continue;
        if (element.closest("[hidden], [inert], .hidden")) continue;
        if (excludedSelectors.some(excluded => element.matches(excluded))) continue;

        if (!element.hasAttribute("tabindex") && !element.matches("button, input, select, textarea, a[href]"))
        {
            element.tabIndex = 0;
        }

        targets.push(element);
    }

    return targets;
}

function getCurrentPanelKeyboardTarget(targets, activeElement)
{
    if (!(activeElement instanceof HTMLElement)) return null;
    return targets.find(target => target === activeElement || target.contains(activeElement)) ?? null;
}

function getInitialSheetFocusTarget(root, reverse = false)
{
    const activeTab = getActiveTabControl(root);
    if (activeTab) return activeTab;

    const focusables = getFocusableElements(root);
    if (!focusables.length) return getSheetFocusContainer(root);
    return reverse ? focusables.at(-1) : focusables[0];
}

function isTextEntryElement(element)
{
    if (!(element instanceof HTMLElement)) return false;
    if (element.isContentEditable) return true;
    return element.matches("input, textarea, select, [contenteditable='true']");
}

function getFocusableElementsInPanel(panel)
{
    return getFocusableElements(panel).filter(element => element !== panel);
}

function getPanelEntryTarget(panel)
{
    const sheetRoot = panel.closest(".window-app, .application, .actor");
    const adapter = getSheetAdapter(AE_SHEET_TABS_STATE.activeApp, sheetRoot);
    const focusables = getFocusableElementsInPanel(panel);
    if (focusables.length) return { target: focusables[0], usedFallback: false, source: "native-focusable" };

    const preferred = getPreferredPanelEntryTarget(panel, adapter);
    if (preferred) return preferred;

    const focusableLike = getFocusableLikeElements(panel).filter(element => element !== panel);
    const firstCandidate = focusableLike.find(element => !element.matches("[tabindex='-1'], [disabled], [inert]"));
    if (firstCandidate)
    {
        if (!firstCandidate.hasAttribute("tabindex")) firstCandidate.tabIndex = 0;
        return { target: firstCandidate, usedFallback: false, source: "promoted-focusable" };
    }

    return { target: panel, usedFallback: true, source: "panel" };
}

function getInventoryRowElement(element)
{
    if (!(element instanceof HTMLElement)) return null;
    return element.closest('.tidy-table-row, [data-tidy-sheet-part="item-table-row"], .item');
}

function getInventoryRowName(row)
{
    if (!(row instanceof HTMLElement)) return "";

    const nameElement = row.querySelector(".item-name, [data-tidy-sheet-part='table-cell'].item-label, .item-name h4");
    const text = nameElement?.textContent?.trim();
    if (text) return text;

    return row.getAttribute("aria-label") || row.dataset.itemName || "";
}

function getInventoryPrimaryAction(element)
{
    const row = getInventoryRowElement(element);
    if (!row) return null;

    return row.querySelector(".tidy-table-row-use-button, [data-action='use'], [data-action='roll'], .item-image, .rollable");
}

function isLikelyInventoryMenuTrigger(element)
{
    if (!(element instanceof HTMLElement)) return false;
    if (!element.matches(".tidy-table-button, .button-icon-only, .with-options")) return false;

    const icon = element.querySelector(".fa-ellipsis-vertical, .fa-ellipsis, .fa-bars");
    const text = element.textContent?.trim();

    return element.getAttribute("aria-haspopup") === "true"
        || !!icon
        || text === "..."
        || text === "⋮";
}

function isInventoryKeyboardActionTarget(element)
{
    if (!(element instanceof HTMLElement)) return false;

    return element.matches(
        ".item-name, .tidy-table-row-use-button, .item-toggle, .command.decrementer, .command.incrementer, .tidy-table-button, .button.button-icon-only"
    ) || isLikelyInventoryMenuTrigger(element);
}

function getInventoryItemDocument(element, app)
{
    if (!(element instanceof HTMLElement)) return null;

    const actor = app?.document?.documentName === "Actor"
        ? app.document
        : app?.actor?.documentName === "Actor"
            ? app.actor
            : null;

    const itemId = element.closest("[data-item-id]")?.dataset?.itemId;
    if (itemId && actor?.items?.get)
    {
        const item = actor.items.get(itemId);
        if (item) return item;
    }

    const uuid = element.closest("[data-info-card-entity-uuid]")?.dataset?.infoCardEntityUuid;
    if (uuid && typeof fromUuidSync === "function")
    {
        return fromUuidSync(uuid);
    }

    return null;
}

async function activateInventoryControl(element, app, event)
{
    if (!(element instanceof HTMLElement)) return;

    if (element.matches(".tidy-table-row-use-button"))
    {
        element.click();
        return;
    }

    if (isLikelyInventoryMenuTrigger(element))
    {
        element.click();
        return;
    }

    element.click();
}

function getInventoryControlLabel(element)
{
    if (!(element instanceof HTMLElement)) return "";

    const row = getInventoryRowElement(element);
    const itemName = getInventoryRowName(row);

    if (element.matches(".tidy-table-row-use-button"))
    {
        return itemName ? `Use or roll ${itemName}` : "Use or roll item";
    }

    if (element.matches(".item-name"))
    {
        return itemName ? `${itemName}. Press Enter to use or roll.` : "Item name. Press Enter to use or roll.";
    }

    if (element.matches(".item-toggle"))
    {
        return itemName ? `Toggle ${itemName}` : "Toggle item";
    }

    if (element.matches(".tidy-table-button"))
    {
        const explicitLabel = element.getAttribute("aria-label")
            || element.getAttribute("title")
            || element.dataset.tooltip;
        if (explicitLabel) return itemName ? `${explicitLabel} for ${itemName}` : explicitLabel;
        return itemName ? `Item action for ${itemName}` : "Item action";
    }

    if (element.matches(".command.decrementer"))
    {
        return itemName ? `Decrease quantity for ${itemName}` : "Decrease quantity";
    }

    if (element.matches(".command.incrementer"))
    {
        return itemName ? `Increase quantity for ${itemName}` : "Increase quantity";
    }

    if (element.matches(".quantity-tracker-input"))
    {
        return itemName ? `Quantity for ${itemName}` : "Item quantity";
    }

    return "";
}

function applyInventoryAccessibility(root)
{
    const controls = root.querySelectorAll(
        ".item-name, .tidy-table-row-use-button, .item-toggle, .command.decrementer, .command.incrementer, .tidy-table-button, .button.button-icon-only, .quantity-tracker-input"
    );

    for (const control of controls)
    {
        if (!(control instanceof HTMLElement)) continue;

        const label = getInventoryControlLabel(control);
        if (label && !control.getAttribute("aria-label")) control.setAttribute("aria-label", label);

        if (
            (control.matches(".item-name, .tidy-table-row-use-button, .item-toggle, .command.decrementer, .command.incrementer, .tidy-table-button, .button.button-icon-only")
                || isLikelyInventoryMenuTrigger(control))
            && !control.hasAttribute("tabindex")
            && !control.matches("button, input, select, textarea, a[href]")
        )
        {
            control.tabIndex = 0;
        }
    }
}

function isVisibleMenuContainer(element)
{
    if (!(element instanceof HTMLElement)) return false;
    if (element.hidden) return false;
    if (element.closest("[hidden], [inert], .hidden")) return false;
    if (element.offsetParent === null && getComputedStyle(element).position !== "fixed") return false;
    return true;
}

function getVisibleMenuContainer(root)
{
    const queryRoots = [
        root instanceof HTMLElement ? root : null,
        document.body,
    ].filter(queryRoot => queryRoot instanceof HTMLElement);

    const containers = queryRoots.flatMap(queryRoot =>
        [...queryRoot.querySelectorAll("menu, [role='menu'], .context-menu, .dropdown-menu, .item-context-menu, .controls-dropdown")]
    ).filter(isVisibleMenuContainer);

    return containers.at(-1) ?? null;
}

function getVisibleMenuTargets(root)
{
    const container = getVisibleMenuContainer(root);
    if (!container) return [];

    const contextItems = [...container.querySelectorAll(".context-item, [role='menuitem']")]
        .filter(element => element instanceof HTMLElement);
    const directChildren = [...container.children].filter(element => element instanceof HTMLElement);
    const candidatePool = contextItems.length
        ? contextItems
        : directChildren.length
            ? directChildren
            : [...container.querySelectorAll("*")];

    return candidatePool
        .filter(element => element instanceof HTMLElement)
        .filter(element => !element.hidden)
        .filter(element => !element.closest("[hidden], [inert], .hidden"))
        .filter(element => element !== container)
        .filter(element => {
            const text = element.textContent?.trim();
            return !!text || element.matches("button, a, [role='menuitem']");
        })
        .map(element => {
            if (!element.hasAttribute("tabindex") && !element.matches("button, input, select, textarea, a[href]"))
            {
                element.tabIndex = 0;
            }
            return element;
        });
}

function focusFirstVisibleMenuTarget(root)
{
    const container = getVisibleMenuContainer(root);
    const targets = getVisibleMenuTargets(root);
    const firstTarget = targets[0];
    if (!firstTarget)
    {
        if (container)
        {
            if (!container.hasAttribute("tabindex")) container.tabIndex = 0;
            container.focus({ preventScroll: false });
            return true;
        }
        return false;
    }

    if (!firstTarget.hasAttribute("tabindex") && !firstTarget.matches("button, input, select, textarea, a[href]"))
    {
        firstTarget.tabIndex = 0;
    }

    firstTarget.focus({ preventScroll: false });
    return true;
}

function isKeyboardActivatableElement(element)
{
    if (!(element instanceof HTMLElement)) return false;
    if (element.hidden) return false;
    if (element.closest("[hidden], [inert], .hidden")) return false;
    if (isTextEntryElement(element)) return false;

    return element.matches(
        "button, [role='button'], [role='menuitem'], a[data-action], .button, .dialog-button, .form-footer button, .form-footer a, .roll-action, .context-item"
    );
}

function getActiveTabControl(root)
{
    return root.querySelector("[role='tab'].active, [role='tab'][aria-selected='true']");
}

function setActiveActorSheet(app, root)
{
    AE_SHEET_TABS_STATE.activeApp = app;
    AE_SHEET_TABS_STATE.activeRoot = root;

    debugSheetTabs("setActiveActorSheet", {
        appId: app?.id,
        constructorName: app?.constructor?.name,
        documentName: app?.document?.documentName,
        title: app?.title,
        rootTag: root?.tagName,
        rootClasses: root?.className,
    });
}

function clearActiveActorSheet(reason)
{
    debugSheetTabs("clearActiveActorSheet", {
        reason,
        storedAppId: AE_SHEET_TABS_STATE.activeApp?.id,
        storedTitle: AE_SHEET_TABS_STATE.activeApp?.title,
    });

    AE_SHEET_TABS_STATE.activeApp = null;
    AE_SHEET_TABS_STATE.activeRoot = null;
}

function tryGetActorSheetWindow(app)
{
    if (!app) return { app: null, root: null };

    const root = getApplicationElement(app, app?.element);
    if (!root) return { app: null, root: null };
    if (!isActorSheetApplication(app, root)) return { app: null, root: null };

    return { app, root };
}

function releaseSheetKeyboardCapture(root, reason)
{
    const activeElement = document.activeElement;
    clearActiveActorSheet(reason);

    if (activeElement instanceof HTMLElement) activeElement.blur();
    if (root instanceof HTMLElement) root.blur?.();
    document.body?.focus?.();

    debugSheetTabs("releaseSheetKeyboardCapture", {
        reason,
        activeElementTag: activeElement?.tagName,
        activeElementClasses: activeElement?.className,
    });
}

function getActiveActorSheetState()
{
    const root = AE_SHEET_TABS_STATE.activeRoot;
    if (!root?.isConnected)
    {
        debugSheetTabs("getActiveActorSheetState bail: root missing or disconnected", {
            storedAppId: AE_SHEET_TABS_STATE.activeApp?.id,
        });
        return tryGetActorSheetWindow(ui?.activeWindow);
    }
    if (!root.matches(".window-app, .application, .actor"))
    {
        debugSheetTabs("getActiveActorSheetState bail: root shape mismatch", {
            storedAppId: AE_SHEET_TABS_STATE.activeApp?.id,
            rootTag: root?.tagName,
            rootClasses: root?.className,
        });
        return tryGetActorSheetWindow(ui?.activeWindow);
    }

    const activeWindow = ui?.activeWindow;
    if (activeWindow && activeWindow !== AE_SHEET_TABS_STATE.activeApp)
    {
        const activeWindowRoot = getApplicationElement(activeWindow, activeWindow?.element);
        if (activeWindowRoot && activeWindowRoot !== root && !root.contains(activeWindowRoot))
        {
            debugSheetTabs("getActiveActorSheetState bail: ui.activeWindow mismatch", {
                storedAppId: AE_SHEET_TABS_STATE.activeApp?.id,
                activeWindowId: activeWindow?.id,
                activeWindowConstructor: activeWindow?.constructor?.name,
                activeWindowTitle: activeWindow?.title,
            });
            return tryGetActorSheetWindow(activeWindow);
        }
    }

    debugSheetTabs("getActiveActorSheetState success", {
        storedAppId: AE_SHEET_TABS_STATE.activeApp?.id,
        activeWindowId: activeWindow?.id,
        activeWindowConstructor: activeWindow?.constructor?.name,
    });

    return {
        app: AE_SHEET_TABS_STATE.activeApp,
        root,
    };
}

function findTabPanel(root, control)
{
    const tabId = getTabId(control);
    if (!tabId) return null;

    const escapedId = CSS.escape(tabId);
    const candidates = [
        ...root.querySelectorAll(`[data-tab-contents-for="${escapedId}"]`),
        ...root.querySelectorAll(`.tab[data-tab="${escapedId}"]`),
    ];

    return candidates.find(panel => !panel.closest("nav.tabs, [role='tablist']")) ?? null;
}

function syncTabAccessibility(root, app)
{
    const tabLists = root.querySelectorAll("nav.tabs[data-group], [role='tablist']");
    let foundTabs = false;
    const appId = app?.id ?? root.dataset.appid ?? root.id ?? "sheet";
    const adapter = getSheetAdapter(app, root);

    const focusContainer = getSheetFocusContainer(root);
    if (!focusContainer.hasAttribute("tabindex")) focusContainer.tabIndex = -1;

    for (const tabList of tabLists)
    {
        const controls = getTabControls(tabList).filter(control => getTabId(control));
        if (!controls.length) continue;
        foundTabs = true;

        debugSheetTabs("syncTabAccessibility found tab list", {
            appId,
            adapter: adapter.id,
            controlCount: controls.length,
            tabListClasses: tabList.className,
            tabIds: controls.map(control => getTabId(control)),
        });

        if (!tabList.hasAttribute("role")) tabList.setAttribute("role", "tablist");

        for (const control of controls)
        {
            const tabId = getTabId(control);
            const label = getTabLabel(control);
            const panel = findTabPanel(root, control);
            const isActive = control.classList.contains("active") || control.getAttribute("aria-selected") === "true";
            const controlId = control.id || `ae-tab-${appId}-${tabId}`;

            control.id = controlId;
            control.setAttribute("role", "tab");
            control.setAttribute("tabindex", "0");
            control.setAttribute("aria-selected", isActive ? "true" : "false");
            if (label) control.setAttribute("aria-label", label);

            if (!panel) continue;

            const panelId = panel.id || `ae-panel-${appId}-${tabId}`;
            panel.id = panelId;
            panel.setAttribute("role", "tabpanel");
            panel.setAttribute("aria-labelledby", controlId);
            panel.setAttribute("tabindex", "-1");
            control.setAttribute("aria-controls", panelId);
        }
    }

    debugSheetTabs("syncTabAccessibility completed", {
        appId,
        adapter: adapter.id,
        foundTabs,
        tabListCount: tabLists.length,
    });

    return foundTabs;
}

function focusActivePanel(root, control)
{
    const panel = findTabPanel(root, control);
    if (!panel) return;
    const adapter = getSheetAdapter(AE_SHEET_TABS_STATE.activeApp, root);

    requestAnimationFrame(() =>
    {
        requestAnimationFrame(() =>
        {
            const activePanel = findTabPanel(root, control) ?? panel;
            const entry = activePanel ? getPanelEntryTarget(activePanel) : { target: panel, usedFallback: true, source: "panel" };
            entry.target?.focus({ preventScroll: false });

            debugSheetTabs("focusActivePanel resolved target", {
                tabId: getTabId(control),
                adapter: adapter.id,
                panelId: activePanel?.id,
                focusedTag: entry.target?.tagName,
                focusedClasses: entry.target?.className,
                usedPanelFallback: entry.usedFallback,
                source: entry.source,
            });
        });
    });
}

function activateTabFromKeyboard(root, control, app)
{
    const isAlreadyActive = control.classList.contains("active");

    debugSheetTabs("activateTabFromKeyboard", {
        appId: app?.id,
        tabId: getTabId(control),
        label: getTabLabel(control),
        isAlreadyActive,
        ariaSelected: control.getAttribute("aria-selected"),
        controlClasses: control.className,
    });

    control.click();
    syncTabAccessibility(root, app);
    focusActivePanel(root, control);
}

function attachSheetTabHandlers(root, app)
{
    if (root.dataset.aeSheetTabsBound === "true") return;
    root.dataset.aeSheetTabsBound = "true";

    const activateSheet = () => setActiveActorSheet(app, root);
    root.addEventListener("pointerdown", activateSheet, true);
    root.addEventListener("focusin", activateSheet);
    applyInventoryAccessibility(root);

    root.addEventListener("keydown", event =>
    {
        const control = getTabControlFromTarget(event.target);
        const activeTab = getActiveTabControl(root);
        const activeElement = document.activeElement;

        if (event.ctrlKey && event.key === "Tab")
        {
            event.preventDefault();
            event.stopPropagation();

            if (event.shiftKey)
            {
                releaseSheetKeyboardCapture(root, "ctrl+shift+tab");
                return;
            }

            if (activeTab)
            {
                activeTab.focus({ preventScroll: false });
                debugSheetTabs("Ctrl+Tab returned focus to active tab", {
                    appId: app?.id,
                    activeTabId: getTabId(activeTab),
                    activeElementTag: activeElement?.tagName,
                    activeElementClasses: activeElement?.className,
                });
            }
            return;
        }

        if (event.key === "Escape" && root.contains(activeElement))
        {
            event.preventDefault();
            event.stopPropagation();
            releaseSheetKeyboardCapture(root, "escape");
            return;
        }

        if (!control || !root.contains(control)) return;

        debugSheetTabs("sheet keydown", {
            appId: app?.id,
            key: event.key,
            code: event.code,
            targetTag: event.target?.tagName,
            tabId: getTabId(control),
            label: getTabLabel(control),
        });

        if (event.key === "Enter" || event.key === " ")
        {
            event.preventDefault();
            event.stopPropagation();
            activateTabFromKeyboard(root, control, app);
            return;
        }

        if (event.key === "Tab")
        {
            const controls = getSiblingTabControls(control);
            const index = controls.indexOf(control);
            if (index === -1 || controls.length < 2) return;

            const nextIndex = event.shiftKey
                ? (index - 1 + controls.length) % controls.length
                : (index + 1) % controls.length;
            const nextControl = controls[nextIndex];

            event.preventDefault();
            event.stopPropagation();
            nextControl.focus({ preventScroll: false });

            debugSheetTabs("sheet Tab cycled between tab controls", {
                appId: app?.id,
                fromTabId: getTabId(control),
                toTabId: getTabId(nextControl),
                shiftKey: event.shiftKey,
                tabCount: controls.length,
                tabIds: controls.map(candidate => getTabId(candidate)),
            });
        }
    }, true);

    root.addEventListener("keydown", event =>
    {
        if (event.key !== "Tab") return;
        if (event.ctrlKey || event.altKey || event.metaKey) return;

        const activeElement = document.activeElement;
        if (!(activeElement instanceof HTMLElement)) return;
        if (!root.contains(activeElement)) return;
        if (getTabControlFromTarget(activeElement)) return;

        const menuContainer = getVisibleMenuContainer(root);
        const menuTargets = getVisibleMenuTargets(root);
        if (
            menuTargets.length
            && (
                menuContainer === activeElement
                || menuContainer?.contains(activeElement)
                || menuTargets.some(target => target === activeElement || target.contains(activeElement))
                || isLikelyInventoryMenuTrigger(activeElement)
            )
        )
        {
            const focusTargets = isLikelyInventoryMenuTrigger(activeElement)
                ? [activeElement, ...menuTargets]
                : menuTargets;
            const currentTarget = focusTargets.find(target => target === activeElement || target.contains(activeElement))
                ?? (menuContainer === activeElement ? focusTargets[0] : null);
            const index = currentTarget ? focusTargets.indexOf(currentTarget) : -1;
            const nextIndex = index === -1
                ? 0
                : event.shiftKey
                    ? (index - 1 + focusTargets.length) % focusTargets.length
                    : (index + 1) % focusTargets.length;
            const nextTarget = focusTargets[nextIndex];

            event.preventDefault();
            event.stopPropagation();
            nextTarget.focus({ preventScroll: false });

            debugSheetTabs("panel Tab cycled through visible menu targets", {
                appId: app?.id,
                fromTag: activeElement.tagName,
                fromClasses: activeElement.className,
                toTag: nextTarget?.tagName,
                toClasses: nextTarget?.className,
                shiftKey: event.shiftKey,
                targetCount: focusTargets.length,
            });
            return;
        }

        const activeTab = getActiveTabControl(root);
        const activePanel = activeTab ? findTabPanel(root, activeTab) : null;
        if (!activePanel || !activePanel.contains(activeElement)) return;

        const adapter = getSheetAdapter(app, root);
        const targets = getPanelKeyboardTargets(activePanel, adapter);
        const index = targets.indexOf(activeElement);
        if (index === -1 || !targets.length) return;

        const nextIndex = event.shiftKey
            ? (index - 1 + targets.length) % targets.length
            : (index + 1) % targets.length;
        const nextTarget = targets[nextIndex];

        event.preventDefault();
        event.stopPropagation();
        nextTarget.focus({ preventScroll: false });

        debugSheetTabs("panel Tab cycled between panel targets", {
            appId: app?.id,
            adapter: adapter.id,
            activeTabId: getTabId(activeTab),
            fromTag: activeElement.tagName,
            fromClasses: activeElement.className,
            toTag: nextTarget?.tagName,
            toClasses: nextTarget?.className,
            shiftKey: event.shiftKey,
            targetCount: targets.length,
        });
    }, true);

    root.addEventListener("click", event =>
    {
        const control = getTabControlFromTarget(event.target);
        if (!control || !root.contains(control)) return;
        requestAnimationFrame(() => syncTabAccessibility(root, app));
    });

    root.addEventListener("keydown", event =>
    {
        if (event.ctrlKey || event.altKey || event.metaKey) return;
        if (event.key !== "Enter" && event.key !== " ") return;

        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        if (!root.contains(target)) return;
        if (!isInventoryKeyboardActionTarget(target)) return;

        const activationTarget = target.matches(".item-name")
            ? (getInventoryPrimaryAction(target) ?? target)
            : target;

        event.preventDefault();
        event.stopPropagation();
        void activateInventoryControl(activationTarget, app, event);

        if (isLikelyInventoryMenuTrigger(target))
        {
            requestAnimationFrame(() =>
            {
                requestAnimationFrame(() =>
                {
                    const focusedMenu = focusFirstVisibleMenuTarget(root);
                    debugSheetTabs("inventory menu trigger activated", {
                        appId: app?.id,
                        targetClasses: target.className,
                        focusedMenu,
                    });
                });
            });
        }

        debugSheetTabs("inventory keyboard action activated", {
            appId: app?.id,
            itemName: getInventoryRowName(getInventoryRowElement(target)),
            targetClasses: target.className,
            actionTag: activationTarget.tagName,
            actionClasses: activationTarget.className,
            key: event.key,
        });
    }, true);
}

function enhanceActorSheetTabs(app, html)
{
    const root = getApplicationElement(app, html);
    const adapter = root ? getSheetAdapter(app, root) : null;

    debugSheetTabs("renderApplicationV2 received", {
        appId: app?.id,
        constructorName: app?.constructor?.name,
        documentName: app?.document?.documentName,
        actorDocumentName: app?.actor?.documentName,
        adapter: adapter?.id,
        title: app?.title,
        hasElement: !!app?.element,
        rootTag: root?.tagName,
        rootClasses: root?.className,
    });

    if (!root)
    {
        debugSheetTabs("enhanceActorSheetTabs bail: no root", {
            appId: app?.id,
            constructorName: app?.constructor?.name,
        });
        return;
    }

    if (!isActorSheetApplication(app, root))
    {
        debugSheetTabs("enhanceActorSheetTabs bail: not actor sheet", {
            appId: app?.id,
            constructorName: app?.constructor?.name,
            documentName: app?.document?.documentName,
            actorDocumentName: app?.actor?.documentName,
        });
        return;
    }

    if (!syncTabAccessibility(root, app))
    {
        debugSheetTabs("enhanceActorSheetTabs bail: no sheet tabs found", {
            appId: app?.id,
            constructorName: app?.constructor?.name,
            title: app?.title,
        });
        return;
    }

    applyInventoryAccessibility(root);
    setActiveActorSheet(app, root);
    attachSheetTabHandlers(root, app);

    debugSheetTabs("enhanceActorSheetTabs complete", {
        appId: app?.id,
        constructorName: app?.constructor?.name,
        title: app?.title,
    });
}

window.addEventListener("keydown", event =>
{
    const activeElement = document.activeElement;
    if (
        (event.key === "Enter" || event.key === " ")
        && !event.ctrlKey
        && !event.altKey
        && !event.metaKey
        && !getTabControlFromTarget(activeElement)
        && isKeyboardActivatableElement(activeElement)
    )
    {
        event.preventDefault();
        event.stopPropagation();
        activeElement.click();

        debugSheetTabs("global keyboard activation clicked focused control", {
            key: event.key,
            activeElementTag: activeElement?.tagName,
            activeElementClasses: activeElement?.className,
            activeElementText: activeElement?.textContent?.trim()?.slice(0, 80),
        });
        return;
    }

    if (event.ctrlKey && event.key === "Tab")
    {
        const { app, root } = getActiveActorSheetState();
        if (!app || !root) return;

        const activeTab = getActiveTabControl(root) ?? getInitialSheetFocusTarget(root, event.shiftKey);
        if (!activeTab) return;

        event.preventDefault();
        setActiveActorSheet(app, root);
        activeTab.focus({ preventScroll: false });
        announceSheetTabsHint(app);

        debugSheetTabs("global Ctrl+Tab restored focus to sheet tab", {
            appId: app?.id,
            shiftKey: event.shiftKey,
            tabId: getTabId(activeTab),
            tabClasses: activeTab?.className,
        });
        return;
    }

    if (event.key !== "Tab") return;
    if (event.defaultPrevented) return;
    if (event.ctrlKey || event.altKey || event.metaKey) return;

    const { app, root } = getActiveActorSheetState();
    const menuContainer = getVisibleMenuContainer(root ?? document.body);
    const menuTargets = getVisibleMenuTargets(root ?? document.body);
    if (
        menuTargets.length
        && activeElement instanceof HTMLElement
        && (
            menuContainer === activeElement
            || menuContainer?.contains(activeElement)
            || menuTargets.some(target => target === activeElement || target.contains(activeElement))
            || isLikelyInventoryMenuTrigger(activeElement)
        )
    )
    {
        const focusTargets = isLikelyInventoryMenuTrigger(activeElement)
            ? [activeElement, ...menuTargets]
            : menuTargets;
        const currentTarget = focusTargets.find(target => target === activeElement || target.contains(activeElement))
            ?? (menuContainer === activeElement ? focusTargets[0] : null);
        const index = currentTarget ? focusTargets.indexOf(currentTarget) : -1;
        const nextIndex = index === -1
            ? 0
            : event.shiftKey
                ? (index - 1 + focusTargets.length) % focusTargets.length
                : (index + 1) % focusTargets.length;
        const nextTarget = focusTargets[nextIndex];

        event.preventDefault();
        event.stopPropagation();
        nextTarget.focus({ preventScroll: false });

        debugSheetTabs("global Tab cycled through visible menu targets", {
            appId: app?.id,
            fromTag: activeElement.tagName,
            fromClasses: activeElement.className,
            toTag: nextTarget?.tagName,
            toClasses: nextTarget?.className,
            shiftKey: event.shiftKey,
            targetCount: focusTargets.length,
        });
        return;
    }

    if (app && root && activeElement instanceof HTMLElement && root.contains(activeElement) && !isTextEntryElement(activeElement))
    {
        const activeTab = getActiveTabControl(root);
        const activePanel = activeTab ? findTabPanel(root, activeTab) : null;
        if (activePanel && activePanel.contains(activeElement))
        {
            const adapter = getSheetAdapter(app, root);
            const targets = getPanelKeyboardTargets(activePanel, adapter);
            if (targets.length)
            {
                const currentTarget = getCurrentPanelKeyboardTarget(targets, activeElement);
                const index = currentTarget ? targets.indexOf(currentTarget) : -1;
                const nextIndex = index === -1
                    ? (event.shiftKey ? targets.length - 1 : 0)
                    : event.shiftKey
                        ? (index - 1 + targets.length) % targets.length
                        : (index + 1) % targets.length;
                const nextTarget = targets[nextIndex];

                event.preventDefault();
                event.stopPropagation();
                nextTarget.focus({ preventScroll: false });

                debugSheetTabs("global Tab cycled between panel targets", {
                    appId: app?.id,
                    adapter: adapter.id,
                    activeTabId: getTabId(activeTab),
                    fromTag: activeElement.tagName,
                    fromClasses: activeElement.className,
                    toTag: nextTarget?.tagName,
                    toClasses: nextTarget?.className,
                    shiftKey: event.shiftKey,
                    targetCount: targets.length,
                });
                return;
            }
        }
    }

    if (app && root && root.contains(activeElement))
    {
        debugSheetTabs("global Tab ignored: focus already inside sheet after panel checks", {
            appId: app?.id,
            activeElementTag: activeElement?.tagName,
            activeElementClasses: activeElement?.className,
        });
        if (!isTextEntryElement(activeElement)) setActiveActorSheet(app, root);
        return;
    }

    if (!app || !root)
    {
        debugSheetTabs("global Tab ignored: no active actor sheet", {
            activeElementTag: document.activeElement?.tagName,
            activeElementClasses: document.activeElement?.className,
            activeWindowId: ui?.activeWindow?.id,
            activeWindowConstructor: ui?.activeWindow?.constructor?.name,
        });
        return;
    }

    const otherWindow = activeElement?.closest?.(".window-app, .application");
    if (otherWindow && !root.contains(otherWindow))
    {
        debugSheetTabs("global Tab ignored: focus is in another window", {
            appId: app?.id,
            otherWindowClasses: otherWindow?.className,
            activeElementTag: activeElement?.tagName,
        });
        return;
    }

    const target = getInitialSheetFocusTarget(root, event.shiftKey);
    if (!target)
    {
        debugSheetTabs("global Tab bail: no focus target inside sheet", {
            appId: app?.id,
            shiftKey: event.shiftKey,
        });
        return;
    }

    event.preventDefault();
    setActiveActorSheet(app, root);
    announceSheetTabsHint(app);
    debugSheetTabs("global Tab redirected into sheet", {
        appId: app?.id,
        shiftKey: event.shiftKey,
        targetTag: target?.tagName,
        targetClasses: target?.className,
        targetText: target?.textContent?.trim?.(),
    });
    target.focus({ preventScroll: false });
}, true);

Hooks.on("renderApplicationV2", (app, html) =>
{
    enhanceActorSheetTabs(app, html);
});

Hooks.on("closeApplicationV2", app =>
{
    debugSheetTabs("closeApplicationV2 received", {
        appId: app?.id,
        constructorName: app?.constructor?.name,
        documentName: app?.document?.documentName,
        actorDocumentName: app?.actor?.documentName,
        title: app?.title,
    });

    if (app !== AE_SHEET_TABS_STATE.activeApp) return;

    clearActiveActorSheet("closeApplicationV2");
    AE_SHEET_HINTS_ANNOUNCED.delete(app?.id);
});
