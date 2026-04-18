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

    game.settings.register('accessibility-enhancements', 'announceRollResults', {
        name: 'Announce Roll Results',
        hint: 'Screen reader announces dice roll flavor and totals when roll cards appear in chat.',
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

    game.settings.register('accessibility-enhancements', 'announceTokenMove', {
        name: 'Announce Token Movement',
        hint: 'Screen reader announces when your owned tokens move, including their new grid coordinate.',
        scope: 'client',
        config: true,
        type: Boolean,
        default: false,
        onChange: () => { },
    });

    game.settings.register('accessibility-enhancements', 'announceTokenCreateDelete', {
        name: 'Announce Tokens Entering/Leaving Scene',
        hint: 'Screen reader announces when tokens are added to or removed from the current scene.',
        scope: 'client',
        config: true,
        type: Boolean,
        default: false,
        onChange: () => { },
    });

    game.keybindings.register('accessibility-enhancements', 'whereAmI', {
        name: 'Where Am I — Read Position & Status',
        hint: "Announces the controlled token's grid position, HP, and active conditions via the screen reader.",
        editable: [{ key: 'KeyW' }],
        onDown: () =>
        {
            const token = canvas?.tokens?.controlled?.[0];
            if (!token)
            {
                announceAssertive("No token controlled.");
                return true;
            }
            const parts = [token.name ?? "Token"];
            const pos = getGridLabel(token);
            if (pos) parts.push(pos);
            const hp = getHPString(token);
            if (hp) parts.push(hp);
            const cond = getConditionsString(token);
            if (cond) parts.push(`Conditions: ${cond}`);
            announceAssertive(parts.join(" \u2014 "));
            return true;
        },
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
        polite.setAttribute("aria-relevant", "additions text");
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
        assertive.setAttribute("aria-relevant", "additions text");
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
globalThis.AEAnnounce = {
    polite: announcePolite,
    assertive: announceAssertive,
    testPolite: (message = "Accessibility Enhancements polite announcement test.") => announcePolite(message),
    testAssertive: (message = "Accessibility Enhancements assertive announcement test.") => announceAssertive(message),
};

const AE_ANNOUNCED_ROLL_MESSAGES = new Map();

function getRenderedApplicationRoot(html)
{
    return html instanceof HTMLElement ? html : html?.[0] instanceof HTMLElement ? html[0] : null;
}

function stripHtmlToText(html)
{
    if (!html) return "";
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = html;
    return tempDiv.textContent?.trim() || "";
}

function normalizeAnnouncementText(text)
{
    return text?.replace(/\s+/g, " ").trim() || "";
}

function getSpeakerName(message)
{
    return message.speaker?.alias || message.author?.name || game.i18n.localize("Unknown");
}

function getRollAnnouncement(message, root)
{
    const speaker = getSpeakerName(message);
    const flavor = normalizeAnnouncementText(
        root?.querySelector(".dice-flavor")?.textContent
        || message.flavor
        || ""
    );

    const totals = [
        ...new Set(
            [
                ...root?.querySelectorAll?.(".dice-total") ?? [],
            ]
                .map(element => normalizeAnnouncementText(element.textContent))
                .filter(Boolean)
        ),
    ];

    if (!totals.length && Array.isArray(message.rolls))
    {
        for (const roll of message.rolls)
        {
            const total = roll?.total;
            if (total === undefined || total === null) continue;
            totals.push(String(total));
        }
    }

    if (!totals.length) return null;

    const parts = [speaker];
    if (flavor) parts.push(flavor);

    if (totals.length === 1)
    {
        parts.push(`Total ${totals[0]}.`);
    } else
    {
        parts.push(`Totals ${totals.join(", ")}.`);
    }

    return parts.join(". ").replace(/\.\s+\./g, ". ");
}

function shouldAnnounceRollMessage(message, announcement)
{
    if (!message?.id || !announcement) return !!announcement;

    const previousAnnouncement = AE_ANNOUNCED_ROLL_MESSAGES.get(message.id);
    if (previousAnnouncement === announcement) return false;

    AE_ANNOUNCED_ROLL_MESSAGES.set(message.id, announcement);

    if (AE_ANNOUNCED_ROLL_MESSAGES.size > 100)
    {
        const oldestKey = AE_ANNOUNCED_ROLL_MESSAGES.keys().next().value;
        if (oldestKey) AE_ANNOUNCED_ROLL_MESSAGES.delete(oldestKey);
    }

    return true;
}

function announceRollResult(message, root = null)
{
    if (!game.settings.get('accessibility-enhancements', 'announceRollResults')) return;

    const announcement = getRollAnnouncement(message, root);
    if (!shouldAnnounceRollMessage(message, announcement)) return;

    announcePolite(announcement);
}

// ---------------------------------------------------------------------------
// Grid coordinate helpers
// ---------------------------------------------------------------------------

/**
 * Convert a token's canvas position to a human-readable grid label, e.g. "C3".
 * Columns are A–Z, then AA–AZ, BA–BZ, etc.  Rows are 1-based integers.
 * Returns an empty string when the grid or canvas is unavailable.
 * @param {Token} token
 * @returns {string}
 */
function getGridLabel(token)
{
    if (!canvas?.grid) return "";
    try
    {
        const { i, j } = canvas.grid.getOffset({ x: token.document.x, y: token.document.y });
        // Convert 0-based column index to spreadsheet-style letters (A, B, …, Z, AA, …)
        let col = "";
        let n = j;
        do
        {
            col = String.fromCharCode(65 + (n % 26)) + col;
            n = Math.floor(n / 26) - 1;
        } while (n >= 0);
        return `${col}${i + 1}`;
    } catch
    {
        return "";
    }
}

/**
 * Return a formatted HP string for a token's actor, e.g. "HP 22 of 30".
 * Returns null when HP data is unavailable.
 * @param {Token} token
 * @returns {string|null}
 */
function getHPString(token)
{
    const hp = token.actor?.system?.attributes?.hp;
    if (hp == null || hp.max == null) return null;
    return `HP ${hp.value} of ${hp.max}`;
}

/**
 * Return a comma-separated list of active conditions/effects on a token.
 * Checks PF2E-specific conditions first, then falls back to generic statuses.
 * Returns null when no conditions are found.
 * @param {Token} token
 * @returns {string|null}
 */
function getConditionsString(token)
{
    const pf2eConditions = token.actor?.itemTypes?.condition;
    if (pf2eConditions?.length) return pf2eConditions.map(c => c.name).join(", ");
    const statuses = token.actor?.statuses;
    if (statuses?.size) return [...statuses].join(", ");
    return null;
}

// Expose helpers for use in other scripts or macros.
globalThis.AEGrid = { getGridLabel, getHPString, getConditionsString };

// ---------------------------------------------------------------------------
// Feature: announce incoming chat messages
// ---------------------------------------------------------------------------

Hooks.on("createChatMessage", (message) =>
{
    if (game.settings.get('accessibility-enhancements', 'announceRollResults') && (message.isRoll || message.rolls?.length))
    {
        announceRollResult(message);
        return;
    }

    if (!game.settings.get('accessibility-enhancements', 'announceChatMessages')) return;

    const speaker = getSpeakerName(message);
    const content = stripHtmlToText(message.content ?? "");

    if (content) announcePolite(`${speaker}: ${content}`);
});

Hooks.on("updateChatMessage", (message, changed) =>
{
    if (!game.settings.get('accessibility-enhancements', 'announceRollResults')) return;
    if (!("rolls" in changed) && !("content" in changed) && !("flavor" in changed)) return;
    if (!(message.isRoll || message.rolls?.length)) return;

    announceRollResult(message);
});

Hooks.on("renderChatMessageHTML", (message, html) =>
{
    const root = getRenderedApplicationRoot(html);
    if (!root) return;
    if (!(message.isRoll || message.rolls?.length || root.querySelector(".dice-roll, .dice-result, .dice-total"))) return;

    announceRollResult(message, root);
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

// ---------------------------------------------------------------------------
// Feature: announce token movement
// ---------------------------------------------------------------------------

Hooks.on("updateToken", (tokenDoc, changes) =>
{
    if (!game.settings.get('accessibility-enhancements', 'announceTokenMove')) return;
    if (!("x" in changes) && !("y" in changes)) return;

    // Only announce for tokens the local player owns
    const token = tokenDoc.object;
    if (!token?.isOwner) return;

    const name = tokenDoc.name ?? game.i18n.localize("Unknown");
    const label = getGridLabel(token);
    const message = label
        ? `${name} moves to ${label}.`
        : `${name} moves.`;
    announcePolite(message);
});

// ---------------------------------------------------------------------------
// Feature: announce tokens entering or leaving the scene
// ---------------------------------------------------------------------------

Hooks.on("createToken", (tokenDoc) =>
{
    if (!game.settings.get('accessibility-enhancements', 'announceTokenCreateDelete')) return;
    const name = tokenDoc.name ?? game.i18n.localize("Unknown");
    announcePolite(`${name} has entered the scene.`);
});

Hooks.on("deleteToken", (tokenDoc) =>
{
    if (!game.settings.get('accessibility-enhancements', 'announceTokenCreateDelete')) return;
    const name = tokenDoc.name ?? game.i18n.localize("Unknown");
    announcePolite(`${name} has left the scene.`);
});
