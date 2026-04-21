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

function getPrimaryActiveGM()
{
    const activeGMs = game.users?.filter((user) => user.active && user.isGM) ?? [];
    if (!activeGMs.length) return null;
    return activeGMs.sort((left, right) => left.id.localeCompare(right.id))[0] ?? null;
}

function getTargetTokenUuid(targetToken)
{
    return targetToken?.document?.uuid ?? targetToken?.uuid ?? null;
}

function canCurrentUserApplyToTarget(targetToken)
{
    const tokenDocument = targetToken?.document ?? targetToken ?? null;
    if (tokenDocument?.isOwner) return true;
    const actor = targetToken?.actor ?? tokenDocument?.actor ?? null;
    return !!actor?.isOwner;
}

async function applyRollResultToTarget(targetToken, appliedAmount, options = {})
{
    if (typeof targetToken?.applyDamage === "function")
    {
        await targetToken.applyDamage(appliedAmount, options);
        return "token";
    }

    if (typeof targetToken?.object?.applyDamage === "function")
    {
        await targetToken.object.applyDamage(appliedAmount, options);
        return "token-object";
    }

    if (typeof targetToken?.actor?.applyDamage === "function")
    {
        await targetToken.actor.applyDamage(appliedAmount, options);
        return "actor";
    }

    throw new Error("Target does not support applyDamage.");
}

function emitModuleSocket(payload)
{
    game.socket?.emit(AE_MODULE_SOCKET, payload);
}

function requestGMApplyRollResult({
    targetToken,
    appliedAmount,
    originatingMessage,
    itemName,
    targetName,
    rollType,
    isHealingRoll,
    damageTotal,
})
{
    const activeGM = getPrimaryActiveGM();
    if (!activeGM)
    {
        return Promise.reject(new Error("No active GM is available to apply the roll result."));
    }

    const requestId = foundry.utils.randomID();
    const targetTokenUuid = getTargetTokenUuid(targetToken);
    if (!targetTokenUuid)
    {
        return Promise.reject(new Error("Target token UUID is unavailable."));
    }

    return new Promise((resolve, reject) =>
    {
        const timeoutId = window.setTimeout(() =>
        {
            AE_SOCKET_REQUESTS.delete(requestId);
            reject(new Error("Timed out waiting for GM roll application."));
        }, 10000);

        AE_SOCKET_REQUESTS.set(requestId, {
            resolve,
            reject,
            timeoutId,
        });

        debugSheetTabs("requested GM roll application", {
            requestId,
            targetTokenUuid,
            itemName,
            targetName,
            appliedAmount,
            gmId: activeGM.id,
        });

        emitModuleSocket({
            type: AE_SOCKET_ACTIONS.APPLY_ROLL_RESULT,
            requestId,
            requesterId: game.user.id,
            gmId: activeGM.id,
            targetTokenUuid,
            appliedAmount,
            originatingMessageId: originatingMessage?.id ?? null,
            itemName,
            targetName,
            rollType,
            isHealingRoll,
            damageTotal,
        });
    });
}

async function handleGMApplyRollResultRequest(payload)
{
    debugSheetTabs("received GM roll application request", {
        requestId: payload?.requestId,
        requesterId: payload?.requesterId,
        gmId: payload?.gmId,
        currentUserId: game.user?.id,
        isGM: game.user?.isGM,
        targetTokenUuid: payload?.targetTokenUuid,
        itemName: payload?.itemName,
        targetName: payload?.targetName,
    });

    if (!game.user?.isGM) return;
    if (payload?.gmId && payload.gmId !== game.user.id) return;

    const targetReference = fromUuidSync(payload.targetTokenUuid);
    const originatingMessage = payload.originatingMessageId ? game.messages?.get(payload.originatingMessageId) ?? null : null;

    try
    {
        const applyPath = await applyRollResultToTarget(targetReference, payload.appliedAmount, {
            isDelta: true,
            originatingMessage,
        });

        debugSheetTabs("GM applied roll result for player request", {
            requestId: payload.requestId,
            itemName: payload.itemName,
            targetName: payload.targetName,
            applyPath,
        });

        emitModuleSocket({
            type: AE_SOCKET_ACTIONS.APPLY_ROLL_RESULT_RESPONSE,
            requestId: payload.requestId,
            requesterId: payload.requesterId,
            ok: true,
            itemName: payload.itemName,
            targetName: payload.targetName,
            applyPath,
        });
    }
    catch (error)
    {
        emitModuleSocket({
            type: AE_SOCKET_ACTIONS.APPLY_ROLL_RESULT_RESPONSE,
            requestId: payload.requestId,
            requesterId: payload.requesterId,
            ok: false,
            itemName: payload.itemName,
            targetName: payload.targetName,
            error: error?.message ?? String(error),
        });
    }
}

function handleApplyRollResultResponse(payload)
{
    if (payload?.requesterId !== game.user.id) return;

    const pending = AE_SOCKET_REQUESTS.get(payload.requestId);
    if (!pending) return;

    window.clearTimeout(pending.timeoutId);
    AE_SOCKET_REQUESTS.delete(payload.requestId);

    debugSheetTabs("received GM roll application response", {
        requestId: payload.requestId,
        ok: payload.ok,
        itemName: payload.itemName,
        targetName: payload.targetName,
        applyPath: payload.applyPath,
        error: payload.error,
    });

    if (payload.ok) pending.resolve(payload);
    else pending.reject(new Error(payload.error ?? "GM roll application failed."));
}

function handleModuleSocketMessage(payload)
{
    debugSheetTabs("received module socket message", {
        type: payload?.type,
        requestId: payload?.requestId,
        requesterId: payload?.requesterId,
        gmId: payload?.gmId,
        currentUserId: game.user?.id,
        isGM: game.user?.isGM,
    });

    if (!payload?.type) return;

    if (payload.type === AE_SOCKET_ACTIONS.APPLY_ROLL_RESULT)
    {
        void handleGMApplyRollResultRequest(payload);
        return;
    }

    if (payload.type === AE_SOCKET_ACTIONS.APPLY_ROLL_RESULT_RESPONSE)
    {
        handleApplyRollResultResponse(payload);
    }
}

const AE_SHEET_TABS_STATE = {
    activeApp: null,
    activeRoot: null,
    pendingAttack: null,
    pendingRollApplication: null,
    pendingConsumableApplication: null,
    lastAttackControl: null,
    lastAttackControlDescriptor: null,
};

const AE_MODULE_ID = "accessibility-enhancements";
const AE_MODULE_SOCKET = `module.${AE_MODULE_ID}`;
const AE_SOCKET_ACTIONS = {
    APPLY_ROLL_RESULT: "applyRollResult",
    APPLY_ROLL_RESULT_RESPONSE: "applyRollResultResponse",
};
const AE_SHEET_TABS_DEBUG = true;
const AE_SHEET_HINTS_ANNOUNCED = new Set();
const AE_SOCKET_REQUESTS = new Map();
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

function resolveTidyPanelTargetRoot(panel)
{
    if (!(panel instanceof HTMLElement)) return null;

    const tabId = getPanelTabId(panel);
    if (tabId === "attributes") return panel;

    if (tabId === "inventory" || tabId === "spellbook")
    {
        return panel.querySelector(
            '[data-tidy-sheet-part="items-container"], [data-tidy-sheet-part="inventory"], [data-tidy-sheet-part="spellbook"], [data-tidy-sheet-part="item-table"], .tidy-table-container'
        ) || panel;
    }

    return null;
}

Hooks.on("init", () =>
{
    game.keybindings.register(AE_MODULE_ID, "focusCharacterSheetTabs", {
        name: "Focus Character Sheet Tabs",
        hint: "Moves focus back to the active tab button on the current character sheet. Default: Alt+T. You can change this in Configure Controls.",
        editable: [{ key: "KeyT", modifiers: ["Alt"] }],
        onDown: () =>
        {
            focusActiveActorSheetTabFromHotkey(false);
            return true;
        },
    });
});

const AE_SHEET_ADAPTERS = [
    {
        id: "tidy5e-classic",
        matches: (app, root) => root?.dataset?.sheetModule === "tidy5e-sheet" && root.classList.contains("classic"),
        useWholePanelForTargets: false,
        localTabReturnHotkey: true,
        preferRootClassTabIdForHotkey: false,
        resolveTargetRoot: resolveTidyPanelTargetRoot,
        contentRootSelectors: [
            '[data-tidy-sheet-part="abilities"]',
            '[data-tidy-sheet-part="ability-scores"]',
            '[data-tidy-sheet-part="saving-throws"]',
            '[data-tidy-sheet-part="inventory"]',
            '[data-tidy-sheet-part="spellbook"]',
            '[data-tidy-sheet-part="item-table"]',
            '[data-tidy-sheet-part="skills-list"]',
            '[data-tidy-sheet-part="tools-list"]',
            '.tidy-table-container',
            '[data-tidy-sheet-part="items-container"]',
            '.skills-list-container',
            '.skills.card',
            '.abilities.card',
            '.saves.card',
        ],
        entrySelectors: [
            '[data-tidy-sheet-part="skill-roller"]',
            '.use-ability-roll-button',
            '[data-tidy-sheet-part="ability-save-roller"]',
            '.ability-save-roller',
            '.item-name',
            '.quantity-tracker-input',
            '.command.decrementer',
            '.command.incrementer',
            '.item-toggle',
            '.tidy-table-row-use-button',
            '.tidy-table-button',
            '.tidy5e-skill-name',
            '.tool-roller',
            '.tool-check-roller',
            '.ability-mod',
            '.ability-save',
            '.trait-item',
            '.item-name[role="button"]',
        ],
        panelTargetSelectors: [
            '[data-tidy-sheet-part="skill-roller"]',
            '.use-ability-roll-button',
            '[data-tidy-sheet-part="ability-save-roller"]',
            '.ability-save-roller',
            '.item-name',
            '.quantity-tracker-input',
            '.command.decrementer',
            '.command.incrementer',
            '.item-toggle',
            '.tidy-table-row-use-button',
            '.tidy-table-button',
            '.tidy5e-skill-name',
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
            '.skill-ability',
            '.button-icon-only.proficiency',
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
        useWholePanelForTargets: false,
        localTabReturnHotkey: true,
        preferRootClassTabIdForHotkey: false,
        resolveTargetRoot: resolveTidyPanelTargetRoot,
        contentRootSelectors: [
            '[data-tidy-sheet-part="abilities"]',
            '[data-tidy-sheet-part="ability-scores"]',
            '[data-tidy-sheet-part="saving-throws"]',
            '[data-tidy-sheet-part="inventory"]',
            '[data-tidy-sheet-part="spellbook"]',
            '[data-tidy-sheet-part="item-table"]',
            '[data-tidy-sheet-part="skills-list"]',
            '[data-tidy-sheet-part="tools-list"]',
            '.tidy-table-container',
            '[data-tidy-sheet-part="items-container"]',
            '.skills-list-container',
            '.skills.card',
            '.abilities.card',
            '.saves.card',
        ],
        entrySelectors: [
            '[data-tidy-sheet-part="skill-roller"]',
            '.use-ability-roll-button',
            '[data-tidy-sheet-part="ability-save-roller"]',
            '.ability-save-roller',
            '.item-name',
            '.quantity-tracker-input',
            '.command.decrementer',
            '.command.incrementer',
            '.item-toggle',
            '.tidy-table-row-use-button',
            '.tidy-table-button',
            '.tidy5e-skill-name',
            '.tool-roller',
            '.tool-check-roller',
            '.ability-mod',
            '.ability-save',
            '.trait-item',
            '.item-name[role="button"]',
        ],
        panelTargetSelectors: [
            '[data-tidy-sheet-part="skill-roller"]',
            '.use-ability-roll-button',
            '[data-tidy-sheet-part="ability-save-roller"]',
            '.ability-save-roller',
            '.item-name',
            '.quantity-tracker-input',
            '.command.decrementer',
            '.command.incrementer',
            '.item-toggle',
            '.tidy-table-row-use-button',
            '.tidy-table-button',
            '.tidy5e-skill-name',
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
            '.skill-ability',
            '.button-icon-only.proficiency',
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
        localTabReturnHotkey: true,
        preferRootClassTabIdForHotkey: true,
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
            '.items-header',
            '.item-header',
            '.midi-info-icon',
            '[data-action="toggleExpand"]',
            '.activity-row',
            '.activity-row .item-name',
            '.activity-row .item-control',
            '.midi-activity-buttons button',
            '[data-midi-action]',
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

function getElementDebugSummary(element)
{
    if (!(element instanceof HTMLElement)) return null;

    return {
        tag: element.tagName,
        classes: element.className,
        tabIndex: element.tabIndex,
        role: element.getAttribute("role"),
        dataTab: element.dataset?.tab,
        dataAction: element.dataset?.action,
        text: element.textContent?.trim()?.replace(/\s+/g, " ")?.slice(0, 80) ?? "",
    };
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
    polite("Character sheet tabs. Tab moves between tabs. Press Enter to open a tab. Alt T returns to tabs. Escape leaves the sheet.");

    debugSheetTabs("announced sheet tabs hint", {
        appId,
        title: app?.title,
    });
}

function focusActiveActorSheetTabFromHotkey(shiftKey = false)
{
    const { app, root } = getActiveActorSheetState();
    if (!app || !root) return false;

    const adapter = getSheetAdapter(app, root);
    const rootClassTabId = adapter.preferRootClassTabIdForHotkey ? getRootActiveTabId(root) : "";
    const focusedPanel = getFocusedSheetPanel(root, document.activeElement);
    const focusedPanelTabId = getPanelTabId(focusedPanel);
    const activeTab = resolveSheetTabReturnControl(root, adapter, shiftKey, {
        rootClassTabId,
        focusedPanelTabId,
    });
    if (!(activeTab instanceof HTMLElement)) return false;

    setActiveActorSheet(app, root);
    activeTab.focus({ preventScroll: false });
    announceSheetTabsHint(app);

    debugSheetTabs("sheet tabs hotkey restored focus to active tab", {
        appId: app?.id,
        adapter: adapter.id,
        shiftKey,
        rootClassTabId,
        focusedPanelTabId,
        tabId: getTabId(activeTab),
        tabClasses: activeTab?.className,
    });
    return true;
}

function isActorSheetApplication(app, root)
{
    const result = app?.document?.documentName === "Actor"
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

function getRootActiveTabId(root)
{
    if (!(root instanceof HTMLElement)) return "";

    for (const className of root.classList)
    {
        if (!className.startsWith("tab-")) continue;
        const tabId = className.slice(4);
        if (tabId) return tabId;
    }

    return "";
}

function resolveSheetTabReturnControl(root, adapter, shiftKey = false, {
    rootClassTabId = "",
    focusedPanelTabId = "",
} = {})
{
    if (!(root instanceof HTMLElement)) return null;

    return getTabControlById(root, rootClassTabId)
        ?? getTabControlById(root, focusedPanelTabId)
        ?? getActiveTabControl(root)
        ?? getInitialSheetFocusTarget(root, shiftKey);
}

function getTabControlById(root, tabId)
{
    if (!(root instanceof HTMLElement) || !tabId) return null;

    const selector = [
        `[role='tab'][data-tab="${CSS.escape(tabId)}"]`,
        `[role='tab'][data-tab-id="${CSS.escape(tabId)}"]`,
        `nav.tabs [data-tab="${CSS.escape(tabId)}"]`,
        `nav.tabs [data-tab-id="${CSS.escape(tabId)}"]`,
    ].join(", ");

    const control = root.querySelector(selector);
    return control instanceof HTMLElement ? control : null;
}

function getTabId(control)
{
    return control.dataset.tabId || control.dataset.tab || "";
}

function getPanelTabId(panel)
{
    if (!(panel instanceof HTMLElement)) return "";

    return panel.dataset.tab
        || panel.dataset.tabId
        || panel.dataset.tabContentsFor
        || "";
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

function isRenderedElement(element)
{
    if (!(element instanceof HTMLElement)) return false;
    if (element.hidden) return false;
    if (element.matches("[disabled], [inert], [tabindex='-1']")) return false;
    if (element.closest("[hidden], [inert], .hidden")) return false;

    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
    if (element.getClientRects().length === 0 && style.position !== "fixed") return false;

    return true;
}

function isFocusableElement(element)
{
    return isRenderedElement(element);
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

    return [...root.querySelectorAll(selector)].filter(element => isRenderedElement(element));
}

function getPanelTargetRoot(panel, adapter)
{
    if (typeof adapter.resolveTargetRoot === "function")
    {
        const resolvedRoot = adapter.resolveTargetRoot(panel);
        if (resolvedRoot instanceof HTMLElement) return resolvedRoot;
    }

    if (adapter.useWholePanelForTargets) return panel;

    for (const selector of adapter.contentRootSelectors ?? [])
    {
        const match = panel.querySelector(selector);
        if (match instanceof HTMLElement) return match;
    }

    return panel;
}

function isExcludedPanelElement(element, adapter)
{
    if (!(element instanceof HTMLElement)) return false;

    const excludedSelectors = [...new Set(adapter.excludedPanelTargetSelectors ?? [])];
    return excludedSelectors.some(selector =>
    {
        try
        {
            return element.matches(selector) || !!element.closest(selector);
        }
        catch
        {
            return false;
        }
    });
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
            isRenderedElement(element) && !isExcludedPanelElement(element, adapter)
        );

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
        if (!isRenderedElement(element)) continue;
        if (isExcludedPanelElement(element, adapter)) continue;

        if (!element.hasAttribute("tabindex") && !element.matches("button, input, select, textarea, a[href]"))
        {
            element.tabIndex = 0;
        }

        targets.push(element);
    }

    return targets;
}

function debugSheetMarkup(root, app, requestedTabId = null)
{
    if (!AE_SHEET_TABS_DEBUG) return;
    if (!(root instanceof HTMLElement)) return;

    const activeTab = getActiveTabControl(root);
    const activePanel = activeTab ? findTabPanel(root, activeTab) : null;
    const requestedPanel = requestedTabId
        ? root.querySelector(`.tab[data-tab="${CSS.escape(requestedTabId)}"]`)
        : null;
    const detailsPanel = root.querySelector('[data-tab="details"]');
    const targetPanel = requestedPanel ?? activePanel ?? detailsPanel;
    if (!(targetPanel instanceof HTMLElement)) return;

    const adapter = getSheetAdapter(app, root);
    const panelTargets = getPanelKeyboardTargets(targetPanel, adapter).map(getElementDebugSummary);
    const normalizedMarkup = targetPanel.outerHTML?.replace(/\s+/g, " ");

    debugSheetTabs("sheet markup snapshot", {
        appId: app?.id,
        adapter: adapter.id,
        requestedTabId,
        activeTabId: getTabId(activeTab),
        activeTab: getElementDebugSummary(activeTab),
        panel: getElementDebugSummary(targetPanel),
        panelTargetCount: panelTargets.length,
        panelTargets: panelTargets.slice(0, 24),
        markupLength: normalizedMarkup?.length ?? 0,
    });

    console.log("[AE SheetTabs] sheet markup html");
    console.log(normalizedMarkup);

    return {
        appId: app?.id,
        adapter: adapter.id,
        requestedTabId,
        activeTabId: getTabId(activeTab),
        panelTargetCount: panelTargets.length,
        panelTargets,
        markup: normalizedMarkup,
    };
}

function getCurrentPanelKeyboardTarget(targets, activeElement)
{
    if (!(activeElement instanceof HTMLElement)) return null;
    return targets.find(target => target === activeElement || target.contains(activeElement)) ?? null;
}

function getFocusedSheetPanel(root, activeElement)
{
    if (!(root instanceof HTMLElement)) return null;
    if (!(activeElement instanceof HTMLElement)) return null;

    const focusedPanel = activeElement.closest(".tab[data-tab], [role='tabpanel']");
    if (focusedPanel instanceof HTMLElement && root.contains(focusedPanel)) return focusedPanel;

    const activeTab = getActiveTabControl(root);
    const activePanel = activeTab ? findTabPanel(root, activeTab) : null;
    if (activePanel instanceof HTMLElement) return activePanel;

    return null;
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

function getFocusableElementsInPanel(panel, adapter = null)
{
    return getFocusableElements(panel).filter(element =>
    {
        if (element === panel) return false;
        if (!adapter) return true;
        return !isExcludedPanelElement(element, adapter);
    });
}

function getPanelEntryTarget(panel)
{
    const sheetRoot = panel.closest(".window-app, .application, .actor");
    const adapter = getSheetAdapter(AE_SHEET_TABS_STATE.activeApp, sheetRoot);
    const focusables = getFocusableElementsInPanel(panel, adapter);
    if (focusables.length) return { target: focusables[0], usedFallback: false, source: "native-focusable" };

    const preferred = getPreferredPanelEntryTarget(panel, adapter);
    if (preferred) return preferred;

    const focusableLike = getFocusableLikeElements(panel).filter(element =>
        element !== panel && !isExcludedPanelElement(element, adapter)
    );
    const firstCandidate = focusableLike.find(element => !element.matches("[tabindex='-1'], [disabled], [inert]"));
    if (firstCandidate)
    {
        if (!firstCandidate.hasAttribute("tabindex")) firstCandidate.tabIndex = 0;
        return { target: firstCandidate, usedFallback: false, source: "promoted-focusable" };
    }

    return { target: panel, usedFallback: true, source: "panel" };
}

