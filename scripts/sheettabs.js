function getAccessibilitySheetRoot(html)
{
    return html instanceof HTMLElement ? html : html?.[0];
}

function getApplicationElement(app, html)
{
    const appElement = app?.element;
    if (appElement instanceof HTMLElement) return appElement;
    return getAccessibilitySheetRoot(html);
}

const AE_SHEET_TABS_STATE = {
    activeApp: null,
    activeRoot: null,
};

const AE_SHEET_TABS_DEBUG = true;
const AE_SHEET_HINTS_ANNOUNCED = new Set();

function debugSheetTabs(message, details)
{
    if (!AE_SHEET_TABS_DEBUG) return;
    if (details === undefined) console.log(`[AE SheetTabs] ${message}`);
    else console.log(`[AE SheetTabs] ${message}`, details);
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

function getPreferredPanelEntryTarget(panel)
{
    const preferredSelectors = [
        '[data-action="roll"]',
        '.skill-name',
        '.saving-throw',
        '.ability-check',
        '.rollable',
        '.use-ability-roll-button',
        '.tidy5e-skill-name',
        '.tool-check-roller',
        'button',
        'a',
    ];

    for (const selector of preferredSelectors)
    {
        const candidate = [...panel.querySelectorAll(selector)].find(element =>
        {
            if (!(element instanceof HTMLElement)) return false;
            if (element.hidden) return false;
            if (element.closest("[hidden], [inert], .hidden")) return false;
            return true;
        });

        if (!candidate) continue;
        if (!candidate.hasAttribute("tabindex")) candidate.tabIndex = 0;
        return { target: candidate, usedFallback: false, source: `preferred:${selector}` };
    }

    return null;
}

function getPanelKeyboardTargets(panel)
{
    const selectors = [
        '[data-action="roll"]',
        '.skill-name',
        '.saving-throw',
        '.ability-check',
        '.rollable',
        '.use-ability-roll-button',
        '.tidy5e-skill-name',
        '.tool-check-roller',
        '[data-action]',
        'button',
        'a',
        'input',
        'select',
        'textarea',
    ];

    const seen = new Set();
    const targets = [];

    for (const selector of selectors)
    {
        for (const element of panel.querySelectorAll(selector))
        {
            if (!(element instanceof HTMLElement)) continue;
            if (element.hidden) continue;
            if (element.closest("[hidden], [inert], .hidden")) continue;
            if (seen.has(element)) continue;

            if (!element.hasAttribute("tabindex") && !element.matches("button, input, select, textarea, a[href]"))
            {
                element.tabIndex = 0;
            }

            seen.add(element);
            targets.push(element);
        }
    }

    return targets;
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
    const focusables = getFocusableElementsInPanel(panel);
    if (focusables.length) return { target: focusables[0], usedFallback: false, source: "native-focusable" };

    const preferred = getPreferredPanelEntryTarget(panel);
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

    const root = app.element instanceof HTMLElement ? app.element : null;
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
        const activeWindowRoot = activeWindow.element;
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

    const focusContainer = getSheetFocusContainer(root);
    if (!focusContainer.hasAttribute("tabindex")) focusContainer.tabIndex = -1;

    for (const tabList of tabLists)
    {
        const controls = getTabControls(tabList).filter(control => getTabId(control));
        if (!controls.length) continue;
        foundTabs = true;

        debugSheetTabs("syncTabAccessibility found tab list", {
            appId,
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
        foundTabs,
        tabListCount: tabLists.length,
    });

    return foundTabs;
}

function focusActivePanel(root, control)
{
    const panel = findTabPanel(root, control);
    if (!panel) return;

    requestAnimationFrame(() =>
    {
        requestAnimationFrame(() =>
        {
            const activePanel = findTabPanel(root, control) ?? panel;
            const entry = activePanel ? getPanelEntryTarget(activePanel) : { target: panel, usedFallback: true, source: "panel" };
            entry.target?.focus({ preventScroll: false });

            debugSheetTabs("focusActivePanel resolved target", {
                tabId: getTabId(control),
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

        const activeTab = getActiveTabControl(root);
        const activePanel = activeTab ? findTabPanel(root, activeTab) : null;
        if (!activePanel || !activePanel.contains(activeElement)) return;

        const targets = getPanelKeyboardTargets(activePanel);
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
}

function enhanceActorSheetTabs(app, html)
{
    const root = getApplicationElement(app, html);

    debugSheetTabs("renderApplicationV2 received", {
        appId: app?.id,
        constructorName: app?.constructor?.name,
        documentName: app?.document?.documentName,
        actorDocumentName: app?.actor?.documentName,
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

    const activeElement = document.activeElement;
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

    if (root.contains(activeElement))
    {
        debugSheetTabs("global Tab ignored: focus already inside sheet", {
            appId: app?.id,
            activeElementTag: activeElement?.tagName,
            activeElementClasses: activeElement?.className,
        });
        if (!isTextEntryElement(activeElement)) setActiveActorSheet(app, root);
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
