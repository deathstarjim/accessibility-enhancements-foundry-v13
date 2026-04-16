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

/* WIP
window.addEventListener('click', event => {
    if ( game.settings.get('accessibility-enhancements', 'leftClickTarget') === true ) {
            console.log(event);
    }
})
*/