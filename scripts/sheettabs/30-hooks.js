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
