// Some changes that make it easier to interact with tokens without right clicks

Hooks.on("init", () =>
{

    /* WIP
    game.settings.register('accessibility-enhancements', 'leftClickTarget', {
        name: 'Left Click Target',
        hint: 'Left Click on unowned tokens to target them',
        scope: 'client',
        config: true,
        type: Boolean,
        default: false,
        onChange: value => {},
    });
    */

    game.settings.register('accessibility-enhancements', 'leftClickTokenHUD', {
        name: 'Left Click TokenHUD',
        hint: 'Left Click on owned tokens opens the Token HUD (Core requires right click). Added to help a user who was playing on Ipad. Experimental, works but causes some odd behaviour if clicking rapidly',
        scope: 'client',
        config: true,
        type: Boolean,
        default: false,
        onChange: value => { },
    });
})

Hooks.on("controlToken", (token, controlled) =>
{
    if (game.settings.get('accessibility-enhancements', 'leftClickTokenHUD') === true)
    {
        if (controlled === true) canvas.hud.token.bind(token);
    }
})

function isEditableHtmlTarget(target)
{
    if (!(target instanceof HTMLElement)) return false;

    if (target.isContentEditable) return true;

    const editableSelector = "input, textarea, select, button, [contenteditable='true'], [role='textbox']";
    return !!target.closest(editableSelector);
}

function isCanvasKeyboardContext(target)
{
    if (target instanceof HTMLElement)
    {
        if (target.closest(".window-app, .application")) return false;
        if (target.closest("input, textarea, select, button, a, [contenteditable='true'], [role='textbox'], [role='tab']")) return false;
    }

    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && activeElement.closest(".window-app, .application")) return false;

    return true;
}

function getKeyboardActiveToken()
{
    const hoveredToken = canvas?.tokens?.hover;
    if (hoveredToken) return hoveredToken;

    const hoveredPlaceable = canvas?.activeLayer?.hover;
    if (hoveredPlaceable?.documentName === "Token") return hoveredPlaceable;

    const hoveredByFlag = canvas?.tokens?.placeables?.find(token => token.hover);
    if (hoveredByFlag) return hoveredByFlag;

    const controlledTokens = canvas?.tokens?.controlled ?? [];
    if (controlledTokens.length === 1) return controlledTokens[0];

    return null;
}

async function openTokenActorSheet(token)
{
    if (!token?.actor?.sheet) return false;
    if (!(token.isOwner || token.actor?.isOwner)) return false;

    if (token.isOwner)
    {
        try
        {
            token.control({ releaseOthers: true });
        } catch
        {
            token.control?.();
        }
    }

    await token.actor.sheet.render(true);
    return true;
}

function toggleTokenTarget(token)
{
    if (!token) return false;

    const nextTargetState = !token.isTargeted;
    token.setTarget?.(nextTargetState, { releaseOthers: false, user: game.user, groupSelection: false });
    return true;
}

window.addEventListener("keydown", event =>
{
    if (event.key !== "Enter") return;
    if (event.repeat) return;
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    if (isEditableHtmlTarget(event.target)) return;
    if (!isCanvasKeyboardContext(event.target)) return;

    const token = getKeyboardActiveToken();
    if (!token) return;

    event.preventDefault();
    event.stopPropagation();

    if (event.shiftKey)
    {
        toggleTokenTarget(token);
        return;
    }

    void openTokenActorSheet(token);
}, true);

/* WIP
window.addEventListener('click', event => {
    if ( game.settings.get('accessibility-enhancements', 'leftClickTarget') === true ) {
            console.log(event);
    }
})
*/
