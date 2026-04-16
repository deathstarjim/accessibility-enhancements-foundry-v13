Hooks.on("init", () => {

    game.settings.register('accessibility-enhancements', 'highContrastMode', {
        name: 'High Contrast Character Sheets',
        hint: 'Removes colours on character sheets to improve contrast & visibility. PF2E player character sheets only.',
        scope: 'client',
        config: true,
        type: String,
        choices: {
          "default": "Default",
          "light": "High Contrast (Light Mode)",
          "dark": "High Contrast (Dark Mode)"
        },
        default: "default",
        onChange: value => {},
    });
})

Hooks.on("renderActorSheet", () => {
    if ( game.settings.get('accessibility-enhancements', 'highContrastMode') !== "default" ) {
        for (const element of document.querySelectorAll(".sheet.character")) {
            let mode = game.settings.get('accessibility-enhancements', 'highContrastMode');
            element.classList.add("high-contrast");
            element.classList.add(mode);
        }
    }
})