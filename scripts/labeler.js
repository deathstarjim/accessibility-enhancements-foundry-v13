// Maps common Font Awesome icon classes to human-readable action labels.
const ICON_LABELS = {
    "fa-trash": "Delete",
    "fa-edit": "Edit",
    "fa-pencil": "Edit",
    "fa-pen": "Edit",
    "fa-eye": "View",
    "fa-eye-slash": "Hide",
    "fa-plus": "Add",
    "fa-minus": "Remove",
    "fa-times": "Close",
    "fa-xmark": "Close",
    "fa-check": "Confirm",
    "fa-cog": "Settings",
    "fa-gear": "Settings",
    "fa-search": "Search",
    "fa-magnifying-glass": "Search",
    "fa-arrows-alt": "Move",
    "fa-up-down-left-right": "Move",
    "fa-copy": "Duplicate",
    "fa-clone": "Duplicate",
    "fa-share-alt": "Share",
    "fa-share-nodes": "Share",
    "fa-lock": "Lock",
    "fa-unlock": "Unlock",
    "fa-chevron-up": "Collapse",
    "fa-chevron-down": "Expand",
    "fa-chevron-left": "Previous",
    "fa-chevron-right": "Next",
    "fa-user": "Actor",
    "fa-suitcase": "Inventory",
    "fa-dice-d20": "Roll",
    "fa-fist-raised": "Actions",
    "fa-hand-fist": "Actions",
    "fa-compress": "Shrink",
    "fa-expand": "Expand",
    "fa-link": "Link",
    "fa-unlink": "Unlink",
    "fa-link-slash": "Unlink",
    "fa-upload": "Upload",
    "fa-download": "Download",
    "fa-rotate": "Refresh",
    "fa-arrows-rotate": "Refresh",
    "fa-star": "Favourite",
    "fa-bookmark": "Bookmark",
    "fa-crosshairs": "Target",
    "fa-map": "Map",
    "fa-music": "Sound",
    "fa-volume-up": "Volume Up",
    "fa-volume-down": "Volume Down",
    "fa-volume-xmark": "Mute",
    "fa-volume-mute": "Mute",
};

function getIconLabel(className)
{
    for (const [iconClass, label] of Object.entries(ICON_LABELS))
    {
        if (className.includes(iconClass)) return label;
    }
    return "";
}

function applyAccessibilityLabels(root)
{
    const scope = root instanceof HTMLElement ? root : document;

    // 1. Copy title → aria-label (original behaviour, preserved)
    for (const element of scope.querySelectorAll("[title]:not([aria-label])"))
    {
        element.setAttribute("aria-label", element.getAttribute("title"));
    }

    // 2. In v13, Foundry replaced most title attributes with data-tooltip.
    //    Copy data-tooltip → aria-label so screen readers still have a label.
    for (const element of scope.querySelectorAll("[data-tooltip]:not([aria-label])"))
    {
        element.setAttribute("aria-label", element.getAttribute("data-tooltip"));
    }

    // 3. Add alt text to <img> elements that are missing it entirely.
    //    A missing alt attribute means the image is completely silent to screen readers;
    //    an empty alt="" signals a decorative image.  We prefer a meaningful string
    //    derived from nearby context, falling back to "" (decorative).
    for (const img of scope.querySelectorAll("img:not([alt])"))
    {
        const tooltip = img.getAttribute("data-tooltip") || img.getAttribute("title") || "";
        const dataName = img.getAttribute("data-name") || "";
        // Walk up the DOM for a label already established on an ancestor
        const ancestorLabel = img.closest("[aria-label]")?.getAttribute("aria-label") || "";
        // Look for a sibling/descendant name element inside the nearest list item or header
        const nearbyText = img.closest("li, header, .window-header")
            ?.querySelector(".name, .item-name, .document-name, h3, h4, h5")
            ?.textContent?.trim() || "";
        img.setAttribute("alt", tooltip || dataName || nearbyText || ancestorLabel || "");
    }

    // 4. Label icon-only buttons and action anchors that have no text content.
    //    These are extremely common in Foundry (e.g. control bars, item controls).
    for (const btn of scope.querySelectorAll(
        "button:not([aria-label]), a[data-action]:not([aria-label]), a.control:not([aria-label])"
    ))
    {
        // Skip if already handled via title/tooltip above
        if (btn.getAttribute("aria-label")) continue;

        // Prefer explicit tooltip attributes
        const tooltip = btn.getAttribute("data-tooltip") || btn.getAttribute("title") || "";
        if (tooltip)
        {
            btn.setAttribute("aria-label", tooltip);
            continue;
        }

        // Fall back to deriving a label from the icon class
        const visibleText = btn.textContent?.trim() || "";
        if (!visibleText)
        {
            const icon = btn.querySelector("i[class], span[class*='fa']");
            if (icon)
            {
                const iconLabel = getIconLabel(icon.className);
                if (iconLabel) btn.setAttribute("aria-label", iconLabel);
            }
        }
    }
}

// Run after any Application v1 window renders (actor sheets, item sheets, etc.)
Hooks.on("renderApplication", (app, html) =>
{
    const root = html instanceof HTMLElement ? html : html[0];
    applyAccessibilityLabels(root);
});

// Run after any Application v2 window renders (Foundry v13+)
Hooks.on("renderApplicationV2", (app, html) =>
{
    applyAccessibilityLabels(html);
});

// Also re-run when the sidebar re-renders (chat, compendium tab, etc.)
Hooks.on("renderSidebar", (app, html) =>
{
    const root = html instanceof HTMLElement ? html : html[0];
    applyAccessibilityLabels(root);
});
