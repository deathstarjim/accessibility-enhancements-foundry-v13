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
            focusActiveActorSheetTabFromHotkey(false);
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
    debugSheetMarkup(root, app);

    debugSheetTabs("enhanceActorSheetTabs complete", {
        appId: app?.id,
        constructorName: app?.constructor?.name,
        title: app?.title,
    });
}

