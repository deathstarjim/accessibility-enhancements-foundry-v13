import { buildSheetAdapters } from "./sheettabs/adapters.js";
import {
    findTabPanel,
    getActiveTabControl,
    getFocusedSheetPanel,
    getFocusableElements,
    getInitialSheetFocusTarget,
    getPanelTabId,
    getRootActiveTabId,
    getSheetFocusContainer,
    getSiblingTabControls,
    getTabControlById,
    getTabControlFromTarget,
    getTabControls,
    getTabId,
    getTabLabel,
    isFocusableElement,
    isRenderedElement,
    resolveSheetTabReturnControl,
} from "./sheettabs/tab-helpers.js";

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

const AE_SHEET_ADAPTERS = buildSheetAdapters();

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

function resolveSheetTabReturnTarget(app, root, shiftKey = false, activeElement = document.activeElement)
{
    if (!(root instanceof HTMLElement)) return null;

    const adapter = getSheetAdapter(app, root);
    const rootClassTabId = adapter.preferRootClassTabIdForHotkey ? getRootActiveTabId(root) : "";
    const focusedPanel = getFocusedSheetPanel(root, activeElement);
    const focusedPanelTabId = getPanelTabId(focusedPanel);
    const activeTab = resolveSheetTabReturnControl(root, adapter, shiftKey, {
        rootClassTabId,
        focusedPanelTabId,
    });

    return {
        adapter,
        rootClassTabId,
        focusedPanelTabId,
        activeTab,
    };
}

function focusSheetTabReturnTarget(app, root, shiftKey = false, activeElement = document.activeElement)
{
    if (!app || !(root instanceof HTMLElement)) return false;

    const {
        adapter,
        rootClassTabId,
        focusedPanelTabId,
        activeTab,
    } = resolveSheetTabReturnTarget(app, root, shiftKey, activeElement);

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

function focusActiveActorSheetTabFromHotkey(shiftKey = false)
{
    const { app, root } = getActiveActorSheetState();
    if (!app || !root) return false;
    return focusSheetTabReturnTarget(app, root, shiftKey, document.activeElement);
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
    if (!element.matches(".tidy-table-button, .button-icon-only, .with-options, [data-context-menu], .item-control")) return false;

    const icon = element.querySelector(".fa-ellipsis-vertical, .fa-ellipsis, .fa-bars");
    const text = element.textContent?.trim();

    return element.getAttribute("aria-haspopup") === "true"
        || element.hasAttribute("data-context-menu")
        || !!icon
        || text === "..."
        || text === "⋮";
}

function isOpenInventoryMenuTrigger(element)
{
    if (!isLikelyInventoryMenuTrigger(element)) return false;

    const expanded = element.getAttribute("aria-expanded");
    if (expanded === "true") return true;

    return element.matches(".active, .open, .opened, .menu-open, [data-state='open']");
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

function getInventoryAttackActivity(element, app)
{
    const item = getInventoryItemDocument(element, app);
    const activities = item?.system?.activities;
    if (!activities?.filter) return null;

    return activities.filter(activity => activity?.type === "attack" && activity?.canUse)?.[0] ?? null;
}

function getInventoryUsableActivity(element, app)
{
    const item = getInventoryItemDocument(element, app);
    const activities = item?.system?.activities;
    if (!activities?.filter) return null;

    return activities.filter(activity => activity?.canUse)?.[0] ?? null;
}

function isConsumableItemControl(element, app)
{
    const item = getInventoryItemDocument(element, app);
    return item?.type === "consumable";
}

function getSceneActorToken(app)
{
    const actor = app?.document?.documentName === "Actor"
        ? app.document
        : app?.actor?.documentName === "Actor"
            ? app.actor
            : null;
    if (!actor || !canvas?.tokens?.placeables) return null;

    return canvas.tokens.controlled.find(token => token?.actor?.id === actor.id)
        ?? canvas.tokens.placeables.find(token => token?.actor?.id === actor.id && (token.isOwner || token.actor?.isOwner))
        ?? actor.getActiveTokens?.(true, true)?.[0]
        ?? null;
}

function getTokenDispositionLabel(sourceToken, candidateToken)
{
    if (!candidateToken) return "unknown";
    if (sourceToken && candidateToken.id === sourceToken.id) return "self";

    const sourceDisposition = Number(sourceToken?.document?.disposition ?? 0);
    const candidateDisposition = Number(candidateToken?.document?.disposition ?? 0);

    if (candidateDisposition === 0 || sourceDisposition === 0) return "neutral";
    return sourceDisposition === candidateDisposition ? "ally" : "enemy";
}

function getTokenDistance(sourceToken, candidateToken)
{
    if (!sourceToken || !candidateToken) return null;

    try
    {
        if (typeof canvas?.grid?.measurePath === "function")
        {
            const measurement = canvas.grid.measurePath([sourceToken.center, candidateToken.center]);
            const distance = Number(measurement?.distance);
            return Number.isFinite(distance) ? distance : null;
        }
    }
    catch
    {
        // Fall through to a simple center-to-center estimate below.
    }

    const sourceCenter = sourceToken.center;
    const candidateCenter = candidateToken.center;
    if (!sourceCenter || !candidateCenter) return null;

    const dx = Number(candidateCenter.x) - Number(sourceCenter.x);
    const dy = Number(candidateCenter.y) - Number(sourceCenter.y);
    const pixels = Math.hypot(dx, dy);
    const size = Number(canvas?.grid?.size) || 100;
    const distancePerGrid = Number(canvas?.scene?.grid?.distance) || 5;
    return Number.isFinite(pixels) ? Math.round((pixels / size) * distancePerGrid) : null;
}

function getAttackTargetCandidates(app)
{
    if (!canvas?.tokens?.placeables?.length) return [];

    const sourceToken = getSceneActorToken(app);
    const candidates = canvas.tokens.placeables
        .filter(token => token?.document && token.actor)
        .filter(token => !token.document.hidden)
        .map(token => ({
            token,
            disposition: getTokenDispositionLabel(sourceToken, token),
            distance: getTokenDistance(sourceToken, token),
            sortOrder: getTokenDispositionLabel(sourceToken, token) === "enemy"
                ? 0
                : getTokenDispositionLabel(sourceToken, token) === "ally"
                    ? 1
                    : getTokenDispositionLabel(sourceToken, token) === "neutral"
                        ? 2
                        : 3,
        }))
        .sort((left, right) =>
        {
            if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
            const leftDistance = Number.isFinite(left.distance) ? left.distance : Number.POSITIVE_INFINITY;
            const rightDistance = Number.isFinite(right.distance) ? right.distance : Number.POSITIVE_INFINITY;
            if (leftDistance !== rightDistance) return leftDistance - rightDistance;
            return (left.token.name ?? "").localeCompare(right.token.name ?? "");
        });

    return candidates;
}

function getActivityTargetCandidates(app, { preferSelf = false } = {})
{
    if (!canvas?.tokens?.placeables?.length) return [];

    const sourceToken = getSceneActorToken(app);
    return canvas.tokens.placeables
        .filter(token => token?.document && token.actor)
        .filter(token => !token.document.hidden)
        .map(token =>
        {
            const disposition = getTokenDispositionLabel(sourceToken, token);
            const distance = getTokenDistance(sourceToken, token);
            const isSelf = !!sourceToken && token.id === sourceToken.id;

            let sortOrder = 0;
            if (preferSelf)
            {
                sortOrder = isSelf
                    ? 0
                    : disposition === "ally"
                        ? 1
                        : disposition === "neutral"
                            ? 2
                            : 3;
            }
            else
            {
                sortOrder = disposition === "enemy"
                    ? 0
                    : disposition === "ally"
                        ? 1
                        : disposition === "neutral"
                            ? 2
                            : 3;
            }

            return { token, disposition, distance, sortOrder };
        })
        .sort((left, right) =>
        {
            if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
            const leftDistance = Number.isFinite(left.distance) ? left.distance : Number.POSITIVE_INFINITY;
            const rightDistance = Number.isFinite(right.distance) ? right.distance : Number.POSITIVE_INFINITY;
            if (leftDistance !== rightDistance) return leftDistance - rightDistance;
            return (left.token.name ?? "").localeCompare(right.token.name ?? "");
        });
}

function clearUserTargets()
{
    for (const token of game.user?.targets ?? [])
    {
        token?.setTarget?.(false, { releaseOthers: false, user: game.user, groupSelection: false });
    }
}

function setSingleUserTarget(token)
{
    if (!token) return false;

    clearUserTargets();
    token.setTarget?.(true, { releaseOthers: true, user: game.user, groupSelection: false });
    return true;
}

async function waitForTargetRegistration(token, tries = 8)
{
    if (!token) return;

    while (tries-- > 0)
    {
        if (game.user?.targets?.has(token)) return;
        await new Promise(resolve => setTimeout(resolve, 25));
    }
}

function showAccessibleTargetPicker({ app, itemName, candidates })
{
    return new Promise(resolve =>
    {
        const dialog = document.createElement("dialog");
        dialog.className = "application ae-target-picker";
        dialog.setAttribute("aria-label", itemName ? `Choose target for ${itemName}` : "Choose target");

        const candidateMarkup = candidates.map((candidate, index) =>
        {
            const checked = index === 0 ? ' checked="checked"' : "";
            const safeName = foundry.utils.escapeHTML(candidate.token.name ?? "Unknown");
            const safeDisposition = foundry.utils.escapeHTML(candidate.disposition);
            const distanceText = Number.isFinite(candidate.distance)
                ? `${Math.round(candidate.distance)} ft`
                : "distance unknown";
            return `
                <label class="ae-target-picker__option">
                    <input type="radio" name="ae-target-choice" value="${candidate.token.id}"${checked}>
                    <span>${safeName}, ${safeDisposition}, ${foundry.utils.escapeHTML(distanceText)}</span>
                </label>
            `;
        }).join("");

        dialog.innerHTML = `
            <header class="window-header">
                <h1 class="window-title">Choose Target</h1>
                <button type="button" class="header-control icon fa-solid fa-xmark" data-action="close" aria-label="Close Window"></button>
            </header>
            <form class="window-content standard-form ae-target-picker__form" method="dialog">
                <p>Select one target for ${foundry.utils.escapeHTML(itemName || "this attack")}.</p>
                <fieldset class="ae-target-picker__list">
                    ${candidateMarkup}
                </fieldset>
                <footer class="form-footer">
                    <button type="submit" value="continue" class="default">Continue</button>
                    <button type="button" data-action="cancel">Cancel</button>
                </footer>
            </form>
        `;

        const cleanup = result =>
        {
            dialog.remove();
            resolve(result);
        };

        dialog.addEventListener("close", () =>
        {
            if (dialog.dataset.aeResolved === "true") return;
            dialog.dataset.aeResolved = "true";

            if (dialog.returnValue !== "continue")
            {
                cleanup(null);
                return;
            }

            const selectedId = dialog.querySelector('input[name="ae-target-choice"]:checked')?.value;
            const selected = candidates.find(candidate => candidate.token.id === selectedId)?.token ?? null;
            cleanup(selected);
        });

        dialog.querySelector('[data-action="close"]')?.addEventListener("click", () => dialog.close("cancel"));
        dialog.querySelector('[data-action="cancel"]')?.addEventListener("click", () => dialog.close("cancel"));
        dialog.addEventListener("cancel", event =>
        {
            event.preventDefault();
            dialog.close("cancel");
        });

        document.body.append(dialog);
        dialog.showModal();

        requestAnimationFrame(() =>
        {
            const firstChoice = dialog.querySelector('input[name="ae-target-choice"]');
            if (firstChoice instanceof HTMLElement) firstChoice.focus({ preventScroll: false });
        });

        debugSheetTabs("opened accessible target picker", {
            appId: app?.id,
            itemName,
            candidateCount: candidates.length,
            candidates: candidates.map(candidate => ({
                tokenId: candidate.token.id,
                tokenName: candidate.token.name,
                disposition: candidate.disposition,
            })),
        });
    });
}

async function chooseAttackTarget(app, element)
{
    const itemName = getInventoryRowName(getInventoryRowElement(element));
    const candidates = getActivityTargetCandidates(app);

    if (!candidates.length)
    {
        debugSheetTabs("attack target picker skipped: no candidates", {
            appId: app?.id,
            itemName,
        });
        return true;
    }

    const selectedToken = await showAccessibleTargetPicker({ app, itemName, candidates });
    if (!selectedToken)
    {
        debugSheetTabs("attack target picker cancelled", {
            appId: app?.id,
            itemName,
        });
        return false;
    }

    setSingleUserTarget(selectedToken);
    await waitForTargetRegistration(selectedToken);
    AE_SHEET_TABS_STATE.pendingAttack = {
        app,
        activity: getInventoryAttackActivity(element, app),
        targetToken: selectedToken,
        itemName,
    };
    debugSheetTabs("attack target selected", {
        appId: app?.id,
        itemName,
        targetId: selectedToken.id,
        targetName: selectedToken.name,
    });
    return true;
}

async function chooseConsumableTarget(app, element)
{
    const itemName = getInventoryRowName(getInventoryRowElement(element));
    const candidates = getActivityTargetCandidates(app, { preferSelf: true });
    const usableActivity = getInventoryUsableActivity(element, app);

    if (!candidates.length)
    {
        debugSheetTabs("consumable target picker skipped: no candidates", {
            appId: app?.id,
            itemName,
        });
        return true;
    }

    const selectedToken = await showAccessibleTargetPicker({ app, itemName, candidates });
    if (!selectedToken)
    {
        debugSheetTabs("consumable target picker cancelled", {
            appId: app?.id,
            itemName,
        });
        return false;
    }

    setSingleUserTarget(selectedToken);
    await waitForTargetRegistration(selectedToken);
    stageConsumableTargetApplication({
        app,
        activity: usableActivity,
        targetToken: selectedToken,
        itemName,
    });
    debugSheetTabs("consumable target selected", {
        appId: app?.id,
        itemName,
        targetId: selectedToken.id,
        targetName: selectedToken.name,
        activityType: usableActivity?.type,
    });
    return true;
}

function getFirstInteractiveDescendant(root)
{
    if (!(root instanceof HTMLElement)) return null;

    if (root.matches("dialog, .application"))
    {
        const titleText = root.querySelector(".window-title")?.textContent?.trim()?.toLowerCase?.() ?? "";
        if (titleText === "attack roll" || titleText === "damage roll" || titleText === "healing roll")
        {
            const normalButton = [...root.querySelectorAll("button")]
                .find(button => isRenderedElement(button) && /normal/i.test(button.textContent ?? ""));
            if (normalButton instanceof HTMLElement)
            {
                if (!normalButton.hasAttribute("tabindex")) normalButton.tabIndex = 0;
                return normalButton;
            }
        }
    }

    const selectorGroups = root.matches(".activity-usage, dialog.activity-usage")
        ? [
            [
                '.form-footer [data-action="use"]',
                '.form-footer button',
                '.window-content [data-action="use"]',
                '.window-content button',
            ].join(", "),
            [
                "dnd5e-checkbox",
                "input",
                "select",
                "textarea",
            ].join(", "),
            [
                "[data-midi-action]",
                ".dialog-button",
                ".roll-link-group",
                ".roll-action",
                "button",
                "a[href]",
                "a[data-action]",
                "[role='button']",
                "[tabindex]:not([tabindex='-1'])",
            ].join(", "),
        ]
        : root.matches("dialog, .application")
            ? [
                [
                    '.form-footer [data-action]',
                    '.form-footer button',
                    'footer [data-action]',
                    'footer button',
                    '.window-content [data-action]',
                    '.window-content button',
                    '.window-content .dialog-button',
                ].join(", "),
                [
                    "input",
                    "select",
                    "textarea",
                    "dnd5e-checkbox",
                    "[role='button']",
                    "[tabindex]:not([tabindex='-1'])",
                ].join(", "),
                [
                    "[data-midi-action]",
                    ".roll-link-group",
                    ".roll-action",
                    "button",
                    "a[href]",
                    "a[data-action]",
                ].join(", "),
            ]
            : [[
                "[data-midi-action]",
                ".dialog-button",
                ".roll-link-group",
                ".roll-action",
                "button",
                "a[href]",
                "a[data-action]",
                "[role='button']",
                "input",
                "select",
                "textarea",
                "[tabindex]:not([tabindex='-1'])",
            ].join(", ")];

    for (const selector of selectorGroups)
    {
        for (const element of root.querySelectorAll(selector))
        {
            if (!isRenderedElement(element)) continue;
            if (!element.hasAttribute("tabindex") && !element.matches("button, input, select, textarea, a[href]"))
            {
                element.tabIndex = 0;
            }
            return element;
        }
    }

    return null;
}

function getVisibleApplicationElements()
{
    return [...document.querySelectorAll("dialog.application, .window-app, .application")]
        .filter(element => element instanceof HTMLElement)
        .filter(element => isRenderedElement(element));
}

function getApplicationIdentity(element)
{
    if (!(element instanceof HTMLElement)) return "";
    return element.id || `${element.tagName}:${element.className}`;
}

function focusActivationResult(previousWindowIds, originatingApp = null)
{
    let tries = 12;

    const attemptFocus = () =>
    {
        const newWindow = getVisibleApplicationElements().find(element =>
        {
            const id = getApplicationIdentity(element);
            return id && !previousWindowIds.has(id);
        });
        if (newWindow)
        {
            const windowTarget = getFirstInteractiveDescendant(newWindow);
            if (windowTarget)
            {
                windowTarget.focus({ preventScroll: false });
                debugSheetTabs("focused activation new window target", {
                    sourceWindowId: getApplicationIdentity(newWindow),
                    targetTag: windowTarget.tagName,
                    targetClasses: windowTarget.className,
                });
                return;
            }
        }

        const activeWindow = ui?.activeWindow;
        if (activeWindow && activeWindow !== originatingApp && !previousWindowIds.has(activeWindow.id))
        {
            const windowRoot = getApplicationElement(activeWindow, activeWindow?.element);
            const windowTarget = getFirstInteractiveDescendant(windowRoot);
            if (windowTarget)
            {
                windowTarget.focus({ preventScroll: false });
                debugSheetTabs("focused activation window target", {
                    sourceWindowId: activeWindow.id,
                    sourceWindowClass: activeWindow.constructor?.name,
                    targetTag: windowTarget.tagName,
                    targetClasses: windowTarget.className,
                });
                return;
            }
        }

        if (--tries > 0) setTimeout(attemptFocus, 100);
    };

    setTimeout(attemptFocus, 50);
}

function triggerRollDialogFromActivity(activity, originatingApp = null, event = null)
{
    let tries = 12;
    const previousWindowIds = new Set(getVisibleApplicationElements().map(getApplicationIdentity).filter(Boolean));

    const attemptRoll = () =>
    {
        if (typeof activity?.rollDamage === "function")
        {
            promoteConsumableTargetToRollApplication(activity);
            void activity.rollDamage({ event });
            debugSheetTabs("triggered heal roll dialog directly from usage dialog", {
                activityType: activity.type,
                itemName: activity.item?.name,
            });
            focusActivationResult(previousWindowIds, originatingApp);
            return;
        }

        if (--tries > 0) setTimeout(attemptRoll, 100);
    };

    setTimeout(attemptRoll, 50);
}

function triggerAttackActivityFlow(activity, app, event)
{
    const previousWindowIds = new Set(getVisibleApplicationElements().map(getApplicationIdentity).filter(Boolean));

    if (typeof activity?.use === "function")
    {
        void activity.use({ event }, { options: { sheet: app } }).then(results =>
        {
            debugSheetTabs("triggered attack activity use flow", {
                activityType: activity?.type,
                itemName: activity?.item?.name,
                messageId: results?.message?.id,
            });

            // Preserve the richer usage card/target metadata, then manually kick off the
            // roll dialog if no module/system path opened it for us.
            let tries = 8;
            const attemptAttackRoll = () =>
            {
                const newWindow = getVisibleApplicationElements().find(element =>
                {
                    const id = getApplicationIdentity(element);
                    return id && !previousWindowIds.has(id);
                });

                if (newWindow)
                {
                    focusActivationResult(previousWindowIds, app);
                    return;
                }

                const activeWindow = ui?.activeWindow;
                const activeWindowId = activeWindow?.id;
                const activeWindowRoot = activeWindow
                    ? getApplicationElement(activeWindow, activeWindow?.element)
                    : null;
                const activeWindowVisible = activeWindowRoot instanceof HTMLElement
                    && document.contains(activeWindowRoot)
                    && isRenderedElement(activeWindowRoot);
                const hasNewActiveWindow = activeWindow
                    && activeWindow !== app
                    && activeWindowId
                    && activeWindowVisible
                    && !previousWindowIds.has(activeWindowId);

                if ((tries-- > 0) && hasNewActiveWindow)
                {
                    focusActivationResult(previousWindowIds, app);
                    return;
                }

                if (tries <= 0 && typeof activity?.rollAttack === "function")
                {
                    const attackWindowIds = new Set(getVisibleApplicationElements().map(getApplicationIdentity).filter(Boolean));
                    void activity.rollAttack(
                        { event },
                        {},
                        { data: { "flags.dnd5e.originatingMessage": results?.message?.id } }
                    );
                    debugSheetTabs("triggered attack roll after activity use flow", {
                        activityType: activity?.type,
                        itemName: activity?.item?.name,
                        messageId: results?.message?.id,
                    });
                    focusActivationResult(attackWindowIds, app);
                    return;
                }

                setTimeout(attemptAttackRoll, 75);
            };

            setTimeout(attemptAttackRoll, 75);
        });
        return true;
    }

    if (typeof activity?.rollAttack === "function")
    {
        void activity.rollAttack({ event });
        debugSheetTabs("triggered attack roll fallback flow", {
            activityType: activity?.type,
            itemName: activity?.item?.name,
        });
        focusActivationResult(previousWindowIds, app);
        return true;
    }

    return false;
}

function getTargetArmorClass(token)
{
    return Number(token?.actor?.system?.attributes?.ac?.value ?? token?.actor?.system?.attributes?.ac?.flat ?? NaN);
}

function getRollTotalValue(roll)
{
    if (!roll) return NaN;

    const directTotal = Number(roll.total);
    if (Number.isFinite(directTotal)) return directTotal;

    const resultTotal = Number(roll.result?.total);
    if (Number.isFinite(resultTotal)) return resultTotal;

    const termsTotal = Number(roll._total);
    if (Number.isFinite(termsTotal)) return termsTotal;

    return NaN;
}

function stageConsumableTargetApplication({ app, activity, targetToken, itemName })
{
    AE_SHEET_TABS_STATE.pendingConsumableApplication = {
        app,
        activity,
        targetToken,
        itemName,
    };
}

function activitiesReferToSameThing(left, right)
{
    if (!left || !right) return false;
    if (left === right) return true;
    if (left.uuid && right.uuid && left.uuid === right.uuid) return true;

    return !!(
        left.id
        && right.id
        && left.id === right.id
        && left.type === right.type
        && left.item?.id === right.item?.id
    );
}

function setPendingRollApplication({ activity, targetToken, itemName })
{
    AE_SHEET_TABS_STATE.pendingRollApplication = {
        activity,
        targetToken,
        itemName,
    };
}

function promoteConsumableTargetToRollApplication(activity)
{
    const pendingConsumable = AE_SHEET_TABS_STATE.pendingConsumableApplication;
    const pendingActivity = pendingConsumable?.activity;
    const sameActivity = !pendingActivity || activitiesReferToSameThing(pendingActivity, activity);

    if (pendingConsumable?.targetToken && sameActivity)
    {
        setPendingRollApplication({
            activity,
            targetToken: pendingConsumable.targetToken,
            itemName: pendingConsumable.itemName ?? activity.item?.name ?? "",
        });
        debugSheetTabs("promoted consumable target to pending roll application", {
            itemName: pendingConsumable.itemName ?? activity.item?.name,
            targetName: pendingConsumable.targetToken.name,
            activityType: activity.type,
        });
        return true;
    }

    debugSheetTabs("failed to promote consumable target before healing roll", {
        pendingItemName: pendingConsumable?.itemName,
        pendingTargetName: pendingConsumable?.targetToken?.name,
        pendingActivityId: pendingActivity?.id,
        pendingActivityUuid: pendingActivity?.uuid,
        pendingActivityType: pendingActivity?.type,
        currentActivityId: activity?.id,
        currentActivityUuid: activity?.uuid,
        currentActivityType: activity?.type,
        currentItemId: activity?.item?.id,
    });
    return false;
}

function restoreLastAttackControlFocus()
{
    let tries = 10;

    const resolveTarget = () =>
    {
        const control = AE_SHEET_TABS_STATE.lastAttackControl;
        if (control instanceof HTMLElement && document.contains(control)) return control;

        const descriptor = AE_SHEET_TABS_STATE.lastAttackControlDescriptor;
        const root = AE_SHEET_TABS_STATE.activeRoot;
        if (!(descriptor && root instanceof HTMLElement)) return null;

        const row = descriptor.itemId
            ? root.querySelector(`[data-item-id="${CSS.escape(descriptor.itemId)}"]`)
            : null;
        if (!(row instanceof HTMLElement)) return null;

        return row.querySelector(descriptor.selector ?? "")
            ?? row.querySelector(".item-name, .item-action, .rollable, button, a");
    };

    const attemptRestore = () =>
    {
        const root = AE_SHEET_TABS_STATE.activeRoot;
        const app = AE_SHEET_TABS_STATE.activeApp;
        const target = resolveTarget();
        if (!(target instanceof HTMLElement))
        {
            if (--tries > 0) setTimeout(attemptRestore, 75);
            return;
        }

        if (app && root instanceof HTMLElement) setActiveActorSheet(app, root);
        target.focus({ preventScroll: false });

        if (document.activeElement !== target && --tries > 0)
        {
            setTimeout(attemptRestore, 75);
            return;
        }

        debugSheetTabs("restored focus to last attack control", {
            tag: target.tagName,
            classes: target.className,
            text: target.textContent?.trim()?.slice(0, 80),
        });
    };

    requestAnimationFrame(() =>
    {
        requestAnimationFrame(attemptRestore);
    });
}

function getAttackControlDescriptor(element)
{
    if (!(element instanceof HTMLElement)) return null;

    const row = getInventoryRowElement(element);
    const itemId = row?.dataset?.itemId ?? "";
    const selector = element.matches(".item-name, .item-action, .rollable")
        ? ".item-name.item-action.rollable, .item-name, .item-action, .rollable"
        : element.matches('[data-action="equip"]')
            ? '[data-action="equip"]'
            : element.matches('[data-context-menu]')
                ? '[data-context-menu]'
                : element.matches(".item-control")
                    ? ".item-control"
                    : element.matches("button, a")
                        ? element.tagName.toLowerCase()
                        : "";

    return itemId ? { itemId, selector } : null;
}

function focusDialogControl(dialog, selector)
{
    if (!(dialog instanceof HTMLElement)) return;

    let tries = 8;
    const attemptFocus = () =>
    {
        if (!document.contains(dialog)) return;

        dialog.focus?.({ preventScroll: true });
        const target = dialog.querySelector(selector);
        if (target instanceof HTMLElement)
        {
            target.focus({ preventScroll: false });
            if (document.activeElement === target) return;
        }

        if (--tries > 0) setTimeout(attemptFocus, 50);
    };

    requestAnimationFrame(() =>
    {
        requestAnimationFrame(attemptFocus);
    });
}

function openAttackResultDialog({ activity, targetToken, hit, rollTotal })
{
    const targetName = targetToken?.name ?? "Target";
    const ac = getTargetArmorClass(targetToken);
    const dialog = document.createElement("dialog");
    dialog.className = "application ae-attack-result";
    dialog.setAttribute("aria-label", hit ? `Hit ${targetName}` : `Missed ${targetName}`);

    const summary = hit
        ? `Hit ${foundry.utils.escapeHTML(targetName)} with ${rollTotal} against AC ${Number.isFinite(ac) ? ac : "unknown"}.`
        : `Missed ${foundry.utils.escapeHTML(targetName)} with ${rollTotal} against AC ${Number.isFinite(ac) ? ac : "unknown"}.`;

    dialog.innerHTML = `
        <header class="window-header">
            <h1 class="window-title">${hit ? "Attack Hit" : "Attack Missed"}</h1>
            <button type="button" class="header-control icon fa-solid fa-xmark" data-action="close" aria-label="Close Window"></button>
        </header>
        <form class="window-content standard-form" method="dialog">
            <p>${summary}</p>
            <footer class="form-footer">
                ${hit ? '<button type="button" class="default" data-action="roll-damage" autofocus>Roll Damage</button>' : ""}
                <button type="button" data-action="close"${hit ? "" : " autofocus"}>${hit ? "Cancel" : "Close"}</button>
            </footer>
        </form>
    `;

    const close = () => dialog.close("close");

    for (const button of dialog.querySelectorAll('[data-action="close"]'))
    {
        button.addEventListener("click", close);
    }
    dialog.addEventListener("cancel", event =>
    {
        event.preventDefault();
        close();
    });

    if (hit)
    {
        dialog.querySelector('[data-action="roll-damage"]')?.addEventListener("click", () =>
        {
            const previousWindowIds = new Set(getVisibleApplicationElements().map(getApplicationIdentity).filter(Boolean));
            dialog.close("roll-damage");
            if (typeof activity?.rollDamage === "function")
            {
                setPendingRollApplication({
                    activity,
                    targetToken,
                    itemName: activity?.item?.name ?? "",
                });
                void activity.rollDamage({});
                focusActivationResult(previousWindowIds, AE_SHEET_TABS_STATE.activeApp);
                debugSheetTabs("attack result dialog triggered damage roll", {
                    itemName: activity?.item?.name,
                    targetName,
                });
            }
        });
    }

    dialog.addEventListener("close", () =>
    {
        dialog.remove();
        if (!hit) restoreLastAttackControlFocus();
    });
    document.body.append(dialog);
    dialog.showModal();
    focusDialogControl(
        dialog,
        hit
            ? '.form-footer [data-action="roll-damage"]'
            : '.form-footer [data-action="close"]'
    );
}

async function activateInventoryControl(element, app, event)
{
    if (!(element instanceof HTMLElement)) return;
    AE_SHEET_TABS_STATE.lastAttackControl = element;
    AE_SHEET_TABS_STATE.lastAttackControlDescriptor = getAttackControlDescriptor(element);
    const attackActivity = getInventoryAttackActivity(element, app);
    const usableActivity = getInventoryUsableActivity(element, app);

    if (element.matches(".tidy-table-row-use-button"))
    {
        if (attackActivity?.rollAttack)
        {
            const targetChosen = await chooseAttackTarget(app, element);
            if (!targetChosen) return;
            if (triggerAttackActivityFlow(attackActivity, app, event)) return;
        }
        else if (usableActivity?.use)
        {
            if (isConsumableItemControl(element, app))
            {
                const targetChosen = await chooseConsumableTarget(app, element);
                if (!targetChosen) return;
            }
            const previousWindowIds = new Set(getVisibleApplicationElements().map(getApplicationIdentity).filter(Boolean));
            void usableActivity.use({ event }, { options: { sheet: app } });
            focusActivationResult(previousWindowIds, app);
        }
        else
        {
            element.click();
        }
        return;
    }

    if (isLikelyInventoryMenuTrigger(element))
    {
        element.click();
        return;
    }

    if (
        attackActivity?.rollAttack
        && (element.matches(".item-name, .item-action, .rollable, [data-action='use']") || element.closest(".item-name, .item-action, .rollable, [data-action='use']"))
    )
    {
        const targetChosen = await chooseAttackTarget(app, element);
        if (!targetChosen) return;
        if (triggerAttackActivityFlow(attackActivity, app, event)) return;
    }
    else if (
        usableActivity?.use
        && (element.matches(".item-name, .item-action, .rollable, [data-action='use']") || element.closest(".item-name, .item-action, .rollable, [data-action='use']"))
    )
    {
        if (isConsumableItemControl(element, app))
        {
            const targetChosen = await chooseConsumableTarget(app, element);
            if (!targetChosen) return;
        }
        const previousWindowIds = new Set(getVisibleApplicationElements().map(getApplicationIdentity).filter(Boolean));
        void usableActivity.use({ event }, { options: { sheet: app } });
        focusActivationResult(previousWindowIds, app);
    }
    else
    {
        element.click();
    }
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
    for (const header of root.querySelectorAll(".items-header, .items-header .item-name, .items-header .item-header"))
    {
        if (!(header instanceof HTMLElement)) continue;
        if (header.getAttribute("tabindex") === "0") header.removeAttribute("tabindex");
    }

    const controls = root.querySelectorAll(
        ".item-name, .tidy-table-row-use-button, .item-toggle, .command.decrementer, .command.incrementer, .tidy-table-button, .button.button-icon-only, .quantity-tracker-input"
    );

    for (const control of controls)
    {
        if (!(control instanceof HTMLElement)) continue;
        if (control.closest(".items-header")) continue;

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

function getMenuContainerForTrigger(trigger, root)
{
    if (!(trigger instanceof HTMLElement)) return getVisibleMenuContainer(root);

    const controlsId = trigger.getAttribute("aria-controls");
    if (controlsId)
    {
        const controlled = document.getElementById(controlsId);
        if (isVisibleMenuContainer(controlled)) return controlled;
    }

    const describedById = trigger.getAttribute("aria-describedby");
    if (describedById)
    {
        const described = document.getElementById(describedById);
        if (isVisibleMenuContainer(described)) return described;
    }

    const row = getInventoryRowElement(trigger);
    const localMenu = row?.querySelector?.("menu, [role='menu'], .context-menu, .dropdown-menu, .item-context-menu, .controls-dropdown");
    if (isVisibleMenuContainer(localMenu)) return localMenu;

    return getVisibleMenuContainer(root);
}

function getVisibleMenuTargets(root, containerOverride = null)
{
    const container = containerOverride instanceof HTMLElement ? containerOverride : getVisibleMenuContainer(root);
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

function focusFirstVisibleMenuTarget(root, containerOverride = null)
{
    const container = containerOverride instanceof HTMLElement ? containerOverride : getVisibleMenuContainer(root);
    const targets = getVisibleMenuTargets(root, container);
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

function focusFirstVisibleMenuTargetWithRetry(root, trigger = null, tries = 8)
{
    const attemptFocus = () =>
    {
        const container = getMenuContainerForTrigger(trigger, root);
        if (focusFirstVisibleMenuTarget(root, container)) return;
        if (tries-- <= 0) return;
        window.setTimeout(attemptFocus, 25);
    };

    attemptFocus();
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

globalThis.AESheetTabsDebug ??= {};
globalThis.AESheetTabsDebug.dumpActiveSheetMarkup = function dumpActiveSheetMarkup()
{
    const { app, root } = getActiveActorSheetState();
    if (!app || !root) return null;
    return debugSheetMarkup(root, app) ?? null;
};
globalThis.AESheetTabsDebug.dumpSheetMarkup = function dumpSheetMarkup(tabId)
{
    const { app, root } = getActiveActorSheetState();
    if (!app || !root) return null;
    return debugSheetMarkup(root, app, tabId) ?? null;
};

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
    requestAnimationFrame(() => debugSheetMarkup(root, app));
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
        const adapter = getSheetAdapter(app, root);

        if (adapter.localTabReturnHotkey && event.altKey && !event.ctrlKey && !event.metaKey && event.key.toLowerCase() === "t")
        {
            event.preventDefault();
            event.stopPropagation();
            focusSheetTabReturnTarget(app, root, false, event.target);
            return;
        }

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
                || isOpenInventoryMenuTrigger(activeElement)
            )
        )
        {
            const focusTargets = isOpenInventoryMenuTrigger(activeElement)
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
        const activePanel = getFocusedSheetPanel(root, activeElement);
        if (!activePanel || !activePanel.contains(activeElement)) return;

        const adapter = getSheetAdapter(app, root);
        const targets = getPanelKeyboardTargets(activePanel, adapter);
        if (!targets.length) return;

        const currentTarget = getCurrentPanelKeyboardTarget(targets, activeElement);
        const index = currentTarget ? targets.indexOf(currentTarget) : -1;
        if (index === -1) return;

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
                fromTag: currentTarget?.tagName ?? activeElement.tagName,
                fromClasses: currentTarget?.className ?? activeElement.className,
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
                    focusFirstVisibleMenuTargetWithRetry(root, target);
                    debugSheetTabs("inventory menu trigger activated", {
                        appId: app?.id,
                        targetClasses: target.className,
                        focusedMenu: true,
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
    debugSheetMarkup(root, app);

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
        const { root } = getActiveActorSheetState();
        const previousWindowIds = new Set(getVisibleApplicationElements().map(getApplicationIdentity).filter(Boolean));
        const activeWindowBeforeClick = ui?.activeWindow ?? null;
        if (
            activeElement instanceof HTMLElement
            && root instanceof HTMLElement
            && root.contains(activeElement)
            && (
                isInventoryKeyboardActionTarget(activeElement)
                || !!activeElement.closest(".item, .activity-row, .inventory-list, [data-item-list='inventory']")
            )
        )
        {
            debugSheetTabs("global keyboard activation skipped for sheet inventory target", {
                activeElementTag: activeElement?.tagName,
                activeElementClasses: activeElement?.className,
                activeElementText: activeElement?.textContent?.trim()?.slice(0, 80),
            });
            return;
        }

        event.preventDefault();
        event.stopPropagation();
        activeElement.click();
        if (
            activeElement instanceof HTMLElement
            && activeElement.matches(".activity-usage [data-action='use'], dialog.activity-usage [data-action='use'], .application.activity-usage [data-action='use']")
        )
        {
            focusActivationResult(previousWindowIds, activeWindowBeforeClick);
            const activity = activeWindowBeforeClick?.activity;
            if (activity?.type === "heal")
            {
                triggerRollDialogFromActivity(activity, activeWindowBeforeClick, event);
            }
        }

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
            || isOpenInventoryMenuTrigger(activeElement)
        )
    )
    {
        const focusTargets = isOpenInventoryMenuTrigger(activeElement)
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
        const activePanel = getFocusedSheetPanel(root, activeElement);
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

Hooks.once("ready", () =>
{
    game.socket?.on(AE_MODULE_SOCKET, handleModuleSocketMessage);
    debugSheetTabs("registered module socket listener", {
        socket: AE_MODULE_SOCKET,
        userId: game.user?.id,
        isGM: game.user?.isGM,
        hasSocket: !!game.socket,
    });
});

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

Hooks.on("dnd5e.postRollAttack", (rolls, data = {}) =>
{
    const pending = AE_SHEET_TABS_STATE.pendingAttack;
    if (!pending?.targetToken) return;
    if (pending.activity && data.subject && pending.activity !== data.subject) return;

    const roll = Array.isArray(rolls) ? rolls[0] : null;
    const rollTotal = getRollTotalValue(roll);
    const ac = getTargetArmorClass(pending.targetToken);
    const hit = Number.isFinite(rollTotal) && Number.isFinite(ac) ? rollTotal >= ac : false;

    debugSheetTabs("evaluated attack result", {
        itemName: pending.itemName,
        targetName: pending.targetToken.name,
        rollTotal,
        armorClass: ac,
        hit,
    });

    openAttackResultDialog({
        activity: data.subject ?? pending.activity,
        targetToken: pending.targetToken,
        hit,
        rollTotal,
    });

    AE_SHEET_TABS_STATE.pendingAttack = null;
});

async function handleRollDamageHook(rolls, data = {}, hookName = "dnd5e.rollDamage")
{
    const pending = AE_SHEET_TABS_STATE.pendingRollApplication;
    debugSheetTabs("received damage roll hook", {
        hookName,
        hasPending: !!pending,
        pendingItemName: pending?.itemName,
        pendingTargetName: pending?.targetToken?.name,
        subjectType: data?.subject?.type,
        subjectItemName: data?.subject?.item?.name,
    });

    if (!pending?.targetToken?.actor) return;
    if (pending.activity && data.subject && pending.activity !== data.subject)
    {
        debugSheetTabs("ignored damage roll hook due to subject mismatch", {
            hookName,
            pendingItemName: pending.itemName,
            pendingActivityType: pending.activity?.type,
            subjectType: data.subject?.type,
            subjectItemName: data.subject?.item?.name,
        });
        return;
    }

    const roll = Array.isArray(rolls) ? rolls[0] : null;
    const damageTotal = getRollTotalValue(roll);
    const rollType = roll?.parent?.flags?.dnd5e?.roll?.type;
    const isHealingRoll = rollType === "healing" || data?.subject?.type === "heal";
    const appliedAmount = isHealingRoll ? -Math.abs(damageTotal) : damageTotal;
    debugSheetTabs("damage roll payload snapshot", {
        itemName: pending.itemName,
        targetName: pending.targetToken.name,
        rollCount: Array.isArray(rolls) ? rolls.length : 0,
        damageTotal,
        appliedAmount,
        rollType,
        isHealingRoll,
        rollSummary: roll
            ? {
                constructorName: roll.constructor?.name,
                total: roll.total,
                _total: roll._total,
                resultTotal: roll.result?.total,
                formula: roll.formula,
            }
            : null,
    });
    if (!Number.isFinite(damageTotal)) return;

    AE_SHEET_TABS_STATE.pendingRollApplication = null;
    AE_SHEET_TABS_STATE.pendingConsumableApplication = null;

    try
    {
        const applyOptions = {
            isDelta: true,
            originatingMessage: roll?.parent ?? null,
        };
        let applyPath = "actor";

        if (!game.user.isGM && !canCurrentUserApplyToTarget(pending.targetToken))
        {
            const response = await requestGMApplyRollResult({
                targetToken: pending.targetToken,
                appliedAmount,
                originatingMessage: roll?.parent ?? null,
                itemName: pending.itemName,
                targetName: pending.targetToken.name,
                rollType,
                isHealingRoll,
                damageTotal,
            });
            applyPath = `gm:${response.applyPath ?? "unknown"}`;
        }
        else
        {
            applyPath = await applyRollResultToTarget(pending.targetToken, appliedAmount, applyOptions);
        }

        debugSheetTabs("applied roll result to selected target", {
            itemName: pending.itemName,
            targetName: pending.targetToken.name,
            damageTotal,
            appliedAmount,
            rollType,
            isHealingRoll,
            applyPath,
        });
        restoreLastAttackControlFocus();
    }
    catch (error)
    {
        debugSheetTabs("failed to apply damage to selected target", {
            itemName: pending.itemName,
            targetName: pending.targetToken.name,
            damageTotal,
            error: error?.message ?? String(error),
        });
        restoreLastAttackControlFocus();
    }
}

Hooks.on("dnd5e.rollDamage", (rolls, data = {}) => void handleRollDamageHook(rolls, data, "dnd5e.rollDamage"));
Hooks.on("dnd5e.rollDamageV2", (rolls, data = {}) => void handleRollDamageHook(rolls, data, "dnd5e.rollDamageV2"));
