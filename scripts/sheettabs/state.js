export const AE_SHEET_TABS_STATE = {
    activeApp: null,
    activeRoot: null,
    pendingAttack: null,
    pendingRollApplication: null,
    pendingConsumableApplication: null,
    lastAttackControl: null,
    lastAttackControlDescriptor: null,
};

export const AE_MODULE_ID = "accessibility-enhancements";
export const AE_MODULE_SOCKET = `module.${AE_MODULE_ID}`;
export const AE_SOCKET_ACTIONS = {
    APPLY_ROLL_RESULT: "applyRollResult",
    APPLY_ROLL_RESULT_RESPONSE: "applyRollResultResponse",
};
export const AE_SHEET_TABS_DEBUG = true;
export const AE_SHEET_HINTS_ANNOUNCED = new Set();
export const AE_SOCKET_REQUESTS = new Map();

export function debugSheetTabs(message, details)
{
    if (!AE_SHEET_TABS_DEBUG) return;
    if (details === undefined) console.log(`[AE SheetTabs] ${message}`);
    else console.log(`[AE SheetTabs] ${message}`, details);
}

export function getElementDebugSummary(element)
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

export function setActiveActorSheet(app, root)
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

export function clearActiveActorSheet(reason)
{
    debugSheetTabs("clearActiveActorSheet", {
        reason,
        storedAppId: AE_SHEET_TABS_STATE.activeApp?.id,
        storedTitle: AE_SHEET_TABS_STATE.activeApp?.title,
    });

    AE_SHEET_TABS_STATE.activeApp = null;
    AE_SHEET_TABS_STATE.activeRoot = null;
}

export function tryGetActorSheetWindow(app, { getApplicationElement, isActorSheetApplication })
{
    if (!app) return { app: null, root: null };

    const root = getApplicationElement(app, app?.element);
    if (!root) return { app: null, root: null };
    if (!isActorSheetApplication(app, root)) return { app: null, root: null };

    return { app, root };
}

export function releaseSheetKeyboardCapture(root, reason)
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

export function getActiveActorSheetState({ getApplicationElement, isActorSheetApplication })
{
    const root = AE_SHEET_TABS_STATE.activeRoot;
    if (!root?.isConnected)
    {
        debugSheetTabs("getActiveActorSheetState bail: root missing or disconnected", {
            storedAppId: AE_SHEET_TABS_STATE.activeApp?.id,
        });
        return tryGetActorSheetWindow(ui?.activeWindow, { getApplicationElement, isActorSheetApplication });
    }
    if (!root.matches(".window-app, .application, .actor"))
    {
        debugSheetTabs("getActiveActorSheetState bail: root shape mismatch", {
            storedAppId: AE_SHEET_TABS_STATE.activeApp?.id,
            rootTag: root?.tagName,
            rootClasses: root?.className,
        });
        return tryGetActorSheetWindow(ui?.activeWindow, { getApplicationElement, isActorSheetApplication });
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
            return tryGetActorSheetWindow(activeWindow, { getApplicationElement, isActorSheetApplication });
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

export function registerSheetTabDebugHelpers({ debugSheetMarkup, getApplicationElement, isActorSheetApplication })
{
    globalThis.AESheetTabsDebug ??= {};
    globalThis.AESheetTabsDebug.dumpActiveSheetMarkup = function dumpActiveSheetMarkup()
    {
        const { app, root } = getActiveActorSheetState({ getApplicationElement, isActorSheetApplication });
        if (!app || !root) return null;
        return debugSheetMarkup(root, app) ?? null;
    };
    globalThis.AESheetTabsDebug.dumpSheetMarkup = function dumpSheetMarkup(tabId)
    {
        const { app, root } = getActiveActorSheetState({ getApplicationElement, isActorSheetApplication });
        if (!app || !root) return null;
        return debugSheetMarkup(root, app, tabId) ?? null;
    };
}
