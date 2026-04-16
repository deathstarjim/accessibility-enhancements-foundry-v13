/**
 * screenreader.js — Screen reader support for Accessibility Enhancements
 *
 * Creates two off-screen ARIA live regions and announces:
 *   • Chat messages (polite — reads after the user finishes what they're doing)
 *   • Combat turn changes (polite for others, assertive for your own turn)
 *   • Foundry UI notifications — info/warning (polite), error (assertive)
 *
 * All features are off by default and can be enabled per-client in module settings.
 */

// ---------------------------------------------------------------------------
// Settings registration
// ---------------------------------------------------------------------------

Hooks.on("init", () =>
{

    game.settings.register('accessibility-enhancements', 'announceChatMessages', {
        name: 'Announce Chat Messages',
        hint: 'Screen reader will announce incoming chat messages as they arrive.',
        scope: 'client',
        config: true,
        type: Boolean,
        default: false,
        onChange: () => { },
    });

    game.settings.register('accessibility-enhancements', 'announceCombatTurns', {
        name: 'Announce Combat Turns',
        hint: 'Screen reader announces when the active combatant changes. You will get a louder alert when it is your own turn.',
        scope: 'client',
        config: true,
        type: Boolean,
        default: false,
        onChange: () => { },
    });

    game.settings.register('accessibility-enhancements', 'announceNotifications', {
        name: 'Announce UI Notifications',
        hint: 'Screen reader announces Foundry info/warning/error pop-up notifications.',
        scope: 'client',
        config: true,
        type: Boolean,
        default: false,
        onChange: () => { },
    });

});

// ---------------------------------------------------------------------------
// Create ARIA live regions once the UI is ready
// ---------------------------------------------------------------------------

Hooks.on("ready", () =>
{
    if (!document.getElementById("ae-aria-live-polite"))
    {
        const polite = document.createElement("div");
        polite.id = "ae-aria-live-polite";
        polite.setAttribute("role", "status");
        polite.setAttribute("aria-live", "polite");
        polite.setAttribute("aria-atomic", "true");
        polite.className = "ae-sr-only";
        document.body.appendChild(polite);
    }

    if (!document.getElementById("ae-aria-live-assertive"))
    {
        const assertive = document.createElement("div");
        assertive.id = "ae-aria-live-assertive";
        assertive.setAttribute("role", "alert");
        assertive.setAttribute("aria-live", "assertive");
        assertive.setAttribute("aria-atomic", "true");
        assertive.className = "ae-sr-only";
        document.body.appendChild(assertive);
    }
});

// ---------------------------------------------------------------------------
// Announcement helpers
// ---------------------------------------------------------------------------

/**
 * Announce a message politely — the screen reader will finish the current
 * sentence before reading this out.
 * @param {string} message
 */
function announcePolite(message)
{
    const region = document.getElementById("ae-aria-live-polite");
    if (!region) return;
    // Clear first, then set — forces re-announcement even of identical strings
    region.textContent = "";
    requestAnimationFrame(() => { region.textContent = message; });
}

/**
 * Announce a message assertively — the screen reader interrupts its current
 * speech to read this immediately.  Use sparingly.
 * @param {string} message
 */
function announceAssertive(message)
{
    const region = document.getElementById("ae-aria-live-assertive");
    if (!region) return;
    region.textContent = "";
    requestAnimationFrame(() => { region.textContent = message; });
}

// Expose so other scripts or macros can piggyback on these regions.
globalThis.AEAnnounce = { polite: announcePolite, assertive: announceAssertive };

// ---------------------------------------------------------------------------
// Feature: announce incoming chat messages
// ---------------------------------------------------------------------------

Hooks.on("createChatMessage", (message) =>
{
    if (!game.settings.get('accessibility-enhancements', 'announceChatMessages')) return;

    const speaker = message.speaker?.alias || message.author?.name || game.i18n.localize("Unknown");

    // Strip HTML so the screen reader hears plain text, not tag soup
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = message.content ?? "";
    const content = tempDiv.textContent?.trim() || "";

    if (content) announcePolite(`${speaker}: ${content}`);
});

// ---------------------------------------------------------------------------
// Feature: announce combat turn changes
// ---------------------------------------------------------------------------

Hooks.on("updateCombat", (combat, changed) =>
{
    if (!game.settings.get('accessibility-enhancements', 'announceCombatTurns')) return;

    // Only act when the active turn or round actually changed
    if (!("turn" in changed) && !("round" in changed)) return;

    const combatant = combat.combatant;
    if (!combatant) return;

    const name = combatant.name ?? game.i18n.localize("Unknown");
    let announcement = "";

    if ("round" in changed)
    {
        announcement = `Round ${combat.round} begins. ${name}'s turn.`;
    } else
    {
        announcement = `${name}'s turn.`;
    }

    announcePolite(announcement);

    // If it is now the local player's turn, use an assertive (interrupting) alert
    if (combatant.isOwner)
    {
        announceAssertive(`It is your turn, ${name}.`);
    }
});

// ---------------------------------------------------------------------------
// Feature: announce UI notifications
// ---------------------------------------------------------------------------

// Track the last count we saw so we only announce newly added notifications
let _lastNotificationCount = 0;

Hooks.on("renderNotifications", (app, html) =>
{
    if (!game.settings.get('accessibility-enhancements', 'announceNotifications')) return;

    // html may be HTMLElement (AppV2) or jQuery (AppV1)
    const root = html instanceof HTMLElement ? html : html[0];
    if (!root) return;

    const unannounced = root.querySelectorAll("li.notification:not([data-ae-announced])");
    for (const notification of unannounced)
    {
        notification.setAttribute("data-ae-announced", "true");
        const text = notification.textContent?.trim() || "";
        if (!text) continue;

        if (notification.classList.contains("error"))
        {
            announceAssertive(text);
        } else
        {
            announcePolite(text);
        }
    }
});
