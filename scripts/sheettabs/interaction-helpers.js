import { isRenderedElement } from "./tab-helpers.js";

export function showAccessibleTargetPicker({ app, itemName, candidates, debug = null })
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

        debug?.("opened accessible target picker", {
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

export function getFirstInteractiveDescendant(root)
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

export function getVisibleApplicationElements()
{
    return [...document.querySelectorAll("dialog.application, .window-app, .application")]
        .filter(element => element instanceof HTMLElement)
        .filter(element => isRenderedElement(element));
}

export function getApplicationIdentity(element)
{
    if (!(element instanceof HTMLElement)) return "";
    return element.id || `${element.tagName}:${element.className}`;
}

export function focusActivationResult(previousWindowIds, {
    originatingApp = null,
    debug = null,
    getApplicationElement,
} = {})
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
                debug?.("focused activation new window target", {
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
            const windowRoot = getApplicationElement?.(activeWindow, activeWindow?.element);
            const windowTarget = getFirstInteractiveDescendant(windowRoot);
            if (windowTarget)
            {
                windowTarget.focus({ preventScroll: false });
                debug?.("focused activation window target", {
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

export function focusDialogControl(dialog, selector)
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
