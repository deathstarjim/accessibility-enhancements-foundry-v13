// D&D 5e item types that can be added to an actor from a compendium
const VALIDITEMS = ["weapon", "equipment", "consumable", "tool", "loot", "backpack", "container", "spell", "feat", "class", "subclass", "background", "race", "feature"];

// Function that adds an item to an actor. Needs the actor's ID & the item's UUID.
async function addItemToActor(itemUUID, myActor)
{
    const itemData = (await fromUuid(itemUUID)).toObject();
    // foundry.utils.mergeObject replaces the deprecated global mergeObject (removed in v13)
    itemData.flags = foundry.utils.mergeObject(itemData.flags ?? {}, { core: { sourceId: itemUUID } });
    await myActor.createEmbeddedDocuments("Item", [itemData]);
}

Hooks.on("init", () =>
{

    // Allows the keybinding to be toggled on and off.
    game.settings.register('accessibility-enhancements', 'addItemHotkey', {
        name: 'Enable "Add Item" Hotkey',
        hint: 'Adds a hotkey (X) which can be pressed in the compendium browser, compendium window, or compendium sidebar tab to add the hovered item to your character.',
        scope: 'client',
        config: true,
        type: Boolean,
        default: false,
        onChange: value => { },
    });

    // Allows the keybinding to be toggled on and off.
    game.settings.register('accessibility-enhancements', 'addItemButton', {
        name: 'Enable "Add Item" Button',
        hint: 'Adds a button to the compendium window which can be pressed to add the item to your character',
        scope: 'client',
        config: true,
        type: Boolean,
        default: false,
        onChange: value => { },
    });

    // Adds a keybinding which can add hovered items to the character sheet.
    if (game.settings.get('accessibility-enhancements', 'addItemHotkey') === true)
    {
        window.addEventListener('keydown', event =>
        {
            if (event.code === "KeyX")
            {
                const myActor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
                let itemUUID = "";

                // Prefer active (focused) element, fall back to last hovered
                const entry = document.querySelector("li:focus") || document.querySelector("li:hover");
                if (!entry) return;

                // In v13 all compendium entries use data-uuid uniformly
                if (entry.getAttribute("data-uuid"))
                {
                    itemUUID = entry.getAttribute("data-uuid");
                } else if (entry.getAttribute("data-document-id"))
                {
                    // Legacy compendium window fallback
                    const itemID = entry.getAttribute("data-document-id");
                    const pack = entry.closest("[id^='compendium-']");
                    if (pack)
                    {
                        const sourceCompendium = pack.getAttribute("id").replace("compendium-", "Compendium.");
                        itemUUID = sourceCompendium + ".Item." + itemID;
                    }
                }
                if (itemUUID) addItemToActor(itemUUID, myActor);
            }
        })
    }

})

// Add buttons to compendium popout window when it is opened
Hooks.on("renderCompendium", (app, html) =>
{

    if (game.settings.get('accessibility-enhancements', 'addItemButton') !== true) return;

    // html may be an HTMLElement (AppV2) or a jQuery object (AppV1)
    const root = html instanceof HTMLElement ? html : html[0];
    if (!root) return;
    // Avoid double-processing
    if (root.getAttribute("data-ae-labelled")) return;

    for (const entry of root.querySelectorAll(".compendium.directory li, .document-list li"))
    {
        // Derive a readable label from the entry name element or data attribute
        const nameEl = entry.querySelector(".document-name, .entry-name, h3, h4, .name");
        const labelText = nameEl?.textContent?.trim() || entry.getAttribute("data-name") || "";
        if (labelText) entry.setAttribute("aria-label", labelText);
        entry.setAttribute("tabindex", "0");

        // Add "Add To Actor" button for item-type entries
        if (entry.classList.contains("item") || entry.classList.contains("document"))
        {
            const label = document.createElement("label");
            label.innerHTML = `<button type="button" aria-label="Add ${labelText || 'item'} to actor">Add To Actor</button>`;
            label.setAttribute("style", "max-width: 6rem");
            entry.appendChild(label);
            label.firstChild.addEventListener("click", () =>
            {
                // v13 uses data-uuid as the canonical attribute
                const itemUUID = entry.getAttribute("data-uuid");
                const myActor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
                if (!itemUUID || !myActor) return;
                addItemToActor(itemUUID, myActor);
            });
        }
    }
    root.setAttribute("data-ae-labelled", "true");
})