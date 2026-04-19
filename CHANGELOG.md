### v0.5.0

New features:
- Added keyboard navigation support for the default D&D 5e actor sheets in Foundry v13.
- Added keyboard navigation support for Tidy 5e Sheets in Foundry v13, including the default modern sheet layout.
- Added support for tab-strip navigation with `Tab` / `Shift+Tab` and tab activation with `Enter`.
- Added keyboard entry into active tab content and keyboard cycling through interactive controls inside the active panel.
- Added shortcuts to recover or leave sheet focus: `Ctrl+Tab` returns focus to the active sheet tab, while `Escape` and `Ctrl+Shift+Tab` release sheet focus.
- Added spoken screen reader guidance when keyboard focus enters a character sheet.
- Added keyboard activation for common row actions on Tidy 5e inventory and spell rows, including use/roll buttons, item and spell action buttons, and roll configuration dialogs.
- Added keyboard support for Tidy 5e item context menus so menu items can receive focus and be activated without the mouse.
- Added automatic screen reader roll-result announcements and an `Alt+R` shortcut to re-read the latest roll result from chat.
- Added `Enter` / `Shift+Enter` canvas token actions so the current keyboard token can open its actor sheet or be targeted without the mouse.
- Added an `Alt+Shift+A` shortcut to open Configure Settings directly to Accessibility Enhancements and move focus into the first setting control for keyboard-only configuration.

### v0.3.1

- Updated CSS to keep up with system updates

### v0.3.0

- Improved CSS structure
- Replaced audio files

New feature:
- Added a "Portrait preview" feature to the Compendium Browser. If the setting is enabled (default is off), you can hover a creature's icon in the bestiary tab of the compendium browser to display its portrait artwork in an enlarged thumbnail (5 size options). Useful if you find the default icon size too small to make out any detail.

### v0.2.2

- Updated high contrast (dark and light mode) CSS so that it looks better on the current character sheets

### v0.2.1

- Removed the old labeling feature. It's no longer necessary since my PR to the core codebase was merged and released in v11 build 306!
- All features now default to off. I wasn't expecting anyone to actually use this module and made some short-sighted decisions by letting them start enabled.
- Added a changelog (you're reading it!)

### v0.2.0

New features:
- Refactor
- High contrast sheets
- Left click token HUD

### v0.1.0

New features:
- "Add item" hotkey
- Sound cues

### v0.0.1

Initial release

New features:
- Labeling
- "Add item" button
