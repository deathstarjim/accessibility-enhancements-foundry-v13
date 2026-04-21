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

