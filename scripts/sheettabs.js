import { buildSheetAdapters } from "./sheettabs/adapters.js";
import { registerSheetTabBootstrap } from "./sheettabs/bootstrap.js";
import {
    clearUserTargets,
    getActivityTargetCandidates,
    getAttackTargetCandidates,
    getInventoryAttackActivity,
    getInventoryControlLabel,
    getInventoryItemDocument,
    getInventoryUsableActivity,
    getSceneActorToken,
    getTokenDispositionLabel,
    getTokenDistance,
    isConsumableItemControl,
    setSingleUserTarget,
    waitForTargetRegistration,
} from "./sheettabs/inventory-helpers.js";
import {
    focusActivationResult,
    focusDialogControl,
    getApplicationIdentity,
    getVisibleApplicationElements,
    showAccessibleTargetPicker,
} from "./sheettabs/interaction-helpers.js";
import {
    focusFirstVisibleMenuTarget,
    focusFirstVisibleMenuTargetWithRetry,
    getCurrentPanelKeyboardTarget,
    getFocusableElementsInPanel,
    getFocusableLikeElements,
    getInventoryPrimaryAction,
    getInventoryRowElement,
    getInventoryRowName,
    getPanelKeyboardTargets,
    getPreferredPanelEntryTarget,
    getVisibleMenuContainer,
    getVisibleMenuTargets,
    isExcludedPanelElement,
    isInventoryKeyboardActionTarget,
    isLikelyInventoryMenuTrigger,
    isOpenInventoryMenuTrigger,
    isTextEntryElement,
} from "./sheettabs/panel-navigation.js";
import {
    findTabPanel,
    getActiveTabControl,
    getFocusedSheetPanel,
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
import {
    AE_MODULE_SOCKET,
    AE_SHEET_HINTS_ANNOUNCED,
    AE_SHEET_TABS_STATE,
    AE_SOCKET_ACTIONS,
    AE_SOCKET_REQUESTS,
    debugSheetTabs,
    getActiveActorSheetState as getStoredActiveActorSheetState,
    getElementDebugSummary,
    registerSheetTabDebugHelpers as registerStoredSheetTabDebugHelpers,
    releaseSheetKeyboardCapture as releaseStoredSheetKeyboardCapture,
    setActiveActorSheet as setStoredActiveActorSheet,
} from "./sheettabs/state.js";

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

const AE_SHEET_ADAPTERS = buildSheetAdapters();

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

function debugSheetMarkup(root, app, requestedTabId = null)
{
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

    const selectedToken = await showAccessibleTargetPicker({ app, itemName, candidates, debug: debugSheetTabs });
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

    const selectedToken = await showAccessibleTargetPicker({ app, itemName, candidates, debug: debugSheetTabs });
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
            focusActivationResult(previousWindowIds, {
                originatingApp,
                debug: debugSheetTabs,
                getApplicationElement,
            });
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
                    focusActivationResult(previousWindowIds, {
                        originatingApp: app,
                        debug: debugSheetTabs,
                        getApplicationElement,
                    });
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
                    focusActivationResult(previousWindowIds, {
                        originatingApp: app,
                        debug: debugSheetTabs,
                        getApplicationElement,
                    });
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
                    focusActivationResult(attackWindowIds, {
                        originatingApp: app,
                        debug: debugSheetTabs,
                        getApplicationElement,
                    });
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
        focusActivationResult(previousWindowIds, {
            originatingApp: app,
            debug: debugSheetTabs,
            getApplicationElement,
        });
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
                focusActivationResult(previousWindowIds, {
                    originatingApp: AE_SHEET_TABS_STATE.activeApp,
                    debug: debugSheetTabs,
                    getApplicationElement,
                });
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
            focusActivationResult(previousWindowIds, {
                originatingApp: app,
                debug: debugSheetTabs,
                getApplicationElement,
            });
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
        focusActivationResult(previousWindowIds, {
            originatingApp: app,
            debug: debugSheetTabs,
            getApplicationElement,
        });
    }
    else
    {
        element.click();
    }
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
    return setStoredActiveActorSheet(app, root);
}

function releaseSheetKeyboardCapture(root, reason)
{
    return releaseStoredSheetKeyboardCapture(root, reason);
}

function getActiveActorSheetState()
{
    return getStoredActiveActorSheetState({
        getApplicationElement,
        isActorSheetApplication,
    });
}

registerStoredSheetTabDebugHelpers({
    debugSheetMarkup,
    getApplicationElement,
    isActorSheetApplication,
});

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
            focusActivationResult(previousWindowIds, {
                originatingApp: activeWindowBeforeClick,
                debug: debugSheetTabs,
                getApplicationElement,
            });
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

registerSheetTabBootstrap({
    focusActiveActorSheetTabFromHotkey,
    enhanceActorSheetTabs,
    handleModuleSocketMessage,
    getRollTotalValue,
    getTargetArmorClass,
    openAttackResultDialog,
    handleRollDamageHook,
});
