const NOTIFICATIONSOUND = new Audio("/modules/accessibility-enhancements/assets/open.wav");
const CREATEITEMSOUND = new Audio("/modules/accessibility-enhancements/assets/equip.wav");

Hooks.on("init", () =>
{
    game.settings.register('accessibility-enhancements', 'enableSoundEffects', {
        name: 'Enable Sound Effects',
        hint: 'Disable to stop the "pop" sound when rendering applications and the rustling sound when items are created.',
        scope: 'client',
        config: true,
        type: Boolean,
        default: false,
        onChange: value => { },
    });
})

// Application v1 windows (legacy)
Hooks.on("renderApplication", (app) =>
{
    // Exclude the PF2E effects panel which re-renders constantly
    if (app.constructor?.name === "EffectsPanel") return;
    if (game.settings.get('accessibility-enhancements', 'enableSoundEffects') === true)
    {
        NOTIFICATIONSOUND.play();
    }
})

// Application v2 windows (Foundry v13+)
Hooks.on("renderApplicationV2", (app, html, context, options) =>
{
    // Only play on first render, not on re-renders (e.g. tab switches, updates)
    if (!options?.isFirstRender) return;
    // Exclude the PF2E effects panel
    if (app.constructor?.name === "EffectsPanel") return;
    if (game.settings.get('accessibility-enhancements', 'enableSoundEffects') === true)
    {
        NOTIFICATIONSOUND.play();
    }
})

Hooks.on("createItem", () =>
{
    // Play a sound when an item is created
    if (game.settings.get('accessibility-enhancements', 'enableSoundEffects') === true)
    {
        CREATEITEMSOUND.play();
    }
})
