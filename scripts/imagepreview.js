Hooks.on("init", () => {

    game.settings.register('accessibility-enhancements', 'imagePreview', {
        name: 'Compendium Browser Portraits Preview',
        hint: 'Adds a tooltip to the character portrait previews in the compendium browser, expanding the artwork on hover to make it easier to see.',
        scope: 'client',
        config: true,
        type: String,
        choices: {
          "off": "No Preview (Default)",
          "tiny": "Tiny Preview (160px)",
          "small": "Small Preview (200px)",
          "medium": "Medium Preview (240px) <- Recommended",
          "large": "Large Preview (280px)",
          "huge": "Huge Preview (320px)"
        },
        default: "off",
        onChange: value => {},
    });
})

Hooks.on("renderCompendiumBrowser", () => {
    if ( game.settings.get('accessibility-enhancements', 'imagePreview') !== "off" ) {
        for (const element of document.querySelectorAll("#compendium-browser")) {
            let value = game.settings.get('accessibility-enhancements', 'imagePreview');
            element.setAttribute("imagePreview", value);
        }
    }
})