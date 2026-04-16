const VALIDITEMS = ["ancestry", "class", "background", "heritage", "equipment", "action", "weapon", "treasure", "kit", "equipment", "container", "consumable", "armor", "feat", "effect"];
const INVALIDITEMS = ["spell"];

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
                } else if (entry.getAttribute("data-entry-uuid"))
                {
                    // PF2E compendium browser
                    itemUUID = entry.getAttribute("data-entry-uuid");
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
                const itemUUID = entry.getAttribute("data-uuid") || entry.getAttribute("data-entry-uuid");
                const myActor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
                if (!itemUUID || !myActor) return;
                addItemToActor(itemUUID, myActor);
            });
        }
    }
    root.setAttribute("data-ae-labelled", "true");
})

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
            console.log(event);
            if (event.code === "KeyX")
            {
                const myActor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
                let itemUUID = "";

                const hoveredElement = document.querySelectorAll("li:hover")[0];
                const activeElement = document.querySelectorAll("li:active")[0];
                console.log(hoveredElement, " is hovered")
                console.log(activeElement, " is active")
                let entry = document.querySelectorAll("li:active")[0] || document.querySelectorAll("li:hover")[0];
                console.log(entry);

                if (entry.getAttribute("data-entry-uuid"))
                {
                    // Compendium browser
                    itemUUID = entry.getAttribute("data-entry-uuid");
                } else if (entry.getAttribute("data-uuid"))
                {
                    // Compendium sidebar
                    itemUUID = entry.getAttribute("data-uuid");
                } else if (entry.getAttribute("data-document-id"))
                {
                    // Compendium window
                    const itemID = entry.getAttribute("data-document-id");
                    const sourceCompendium = entry.offsetParent.getAttribute("id").replace("compendium-", "Compendium.");       //Why use good code when bad code do trick
                    itemUUID = sourceCompendium + ".Item." + itemID;
                }
                addItemToActor(itemUUID, myActor);
                /* Attempt to exclude spells
                if (VALIDITEMS.includes(fromUuid(itemUUID).type)) {
                    ui.notifications.info("Item has been added to actor");
                    addItemToActor(itemUUID, myActor);
                } else if (INVALIDITEMS.includes(fromUuid(itemUUID).type)) {
                    ui.notifications.error("This feature does not support spells");
                } else {
                    return;
                }   
                */
            } else
            {
                return;
            }
        })
    }

})

// Add buttons to compendium popout window when it is opened
Hooks.on("renderCompendium", () =>
{

    if (game.settings.get('accessibility-enhancements', 'addItemButton') === true)
    {
        // Incredibly skillful way to check if the compendium's already been yassified
        for (const compendium of document.querySelectorAll("div.sidebar-popout.Compendium-sidebar"))
        {
            const compendiumID = compendium.getAttribute("id").replace("compendium-", "Compendium.");
            if (compendium.getAttribute("data-labelled"))
            {
                continue;
            } else
            {
                // Add label to entries in the list
                for (const entry of compendium.querySelectorAll(".compendium.directory li"))
                {
                    const labelText = entry.childNodes[3].innerText;
                    entry.setAttribute("aria-label", labelText);
                    entry.setAttribute("tabindex", 0);
                    // If the document is an item, also add a button to add it to selected actor (this likely only supports PF2E- should I add a setting to remove it for other systems?)
                    if (entry.classList.contains("item"))
                    {
                        //Create the button
                        const label = document.createElement("label");
                        label.innerHTML = `<button type="button">Add To Actor</button>`
                        label.setAttribute("style", "max-width: 6rem");
                        entry.appendChild(label);
                        label.firstChild.addEventListener("click", () =>
                        {
                            // Gather info
                            const itemID = entry.getAttribute("data-uuid") || entry.getAttribute("data-document-id");                   //This isn't standardised between item types, but checking both gives us coverage
                            const myActor = canvas.tokens.controlled[0]?.actor ?? game.user.character;
                            const sourceCompendium = entry.offsetParent.getAttribute("id").replace("compendium-", "Compendium.");       //Why use good code when bad code do trick
                            console.log(itemID + " button clicked in " + sourceCompendium + " by " + myActor.name);
                            const itemUUID = sourceCompendium + ".Item." + itemID;
                            addItemToActor(itemUUID, myActor);
                        })
                    }
                }
                compendium.setAttribute("data-labelled", true);
            }
        }
    }
})