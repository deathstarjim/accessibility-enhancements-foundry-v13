# Accessibility Enhancements — Backlog

Items are grouped by theme. Priorities are relative to Michael's needs as a blind player.
All features should be `scope: 'client'` (per-player opt-in) unless noted.

---

## 🗺️ Grid Coordinate System
*Prerequisite for most canvas announcements — implement first.*

- [ ] **Grid label overlay** — PIXI canvas layer that draws letter (A, B, C…) column headers along the top of the scene and number (1, 2, 3…) row headers down the left side, in world-space so they pan/zoom with the map. Semi-transparent so they don't obscure the map for sighted players. Toggleable per-client.
- [x] **Coordinate helper function** — shared utility `getGridLabel(token)` → `"C3"` used by all announcement features below.
- [ ] **Persistent HUD readout** — small always-visible HTML overlay in a screen corner showing the controlled token's current grid position and HP (e.g. `Thorin — C3 — HP 22/30`). Useful for sighted players helping Michael navigate.

---

## 📢 Screen Reader Announcements (canvas / combat)
*Builds on the ARIA live region system already in `screenreader.js`.*

- [X] **Token move** — announce name + new grid coordinate when any owned token moves (e.g. "Thorin moves to C3").
- [x] **Token enter/leave scene** — announce when a token is added to or removed from the canvas (e.g. "Goblin King has entered the scene.").
- [ ] **HP / damage changes** — announce damage or healing on owned (and optionally targeted) tokens (e.g. "Thorin takes 8 damage. 22 of 30 HP remaining.").
- [ ] **Status effects / conditions** — announce when a condition is applied to or removed from an owned token (e.g. "Prone applied to Thorin." / "Frightened 1 removed.").
- [x] **Dice roll results** — announce the result and total of any roll in the chat (e.g. "Attack roll: 17."). Includes an `Alt+R` fallback to re-read the latest roll result from chat on demand.

---

## ⌨️ Keyboard & No-Mouse Navigation
*Reducing the need for click-and-drag is the highest-value area for Michael.*

- [x] **"Where am I" hotkey** — configurable keybind (default: `W`) that re-reads the controlled token's position, HP, and any active conditions via the assertive live region. Works on demand without any interaction.
- [ ] **Tab through nearby tokens** — Tab/Shift-Tab to cycle through tokens on the canvas; Enter to select/control, Shift+Enter to target. Replaces needing to click tokens.
- [ ] **Keyboard token targeting** — dedicated keybind to toggle targeting on the currently focused/controlled token. Avoids right-click dependency entirely.
- [ ] **Arrow key token movement** — move a controlled token one grid square at a time using arrow keys (Foundry has partial support; ensure it works and triggers our announcements).
- [ ] **Keyboard ruler / distance check** — announce walking distance from controlled token to the currently focused token (e.g. "Goblin Scout is 15 feet away, at B5.").

---

## 🔊 Audio Cues (non-speech)
*Supplementary to the screen reader for faster spatial feedback.*

- [ ] **Positional move sound** — short tick/click when your token moves, distinct from others' tokens.
- [ ] **Damage taken sound** — brief sound cue when HP drops.
- [ ] **Turn start chime** — distinctive sound when it becomes the player's turn (separate from/in addition to the combat announcement).

---

## 🪟 UI / Sheet Improvements

- [ ] **Actor sheet keyboard navigation audit** — verify all interactive elements on the PF2E character sheet are reachable and operable by keyboard alone (Tab order, Enter/Space activation).
- [ ] **Spell/action quick-cast hotkey** — numbered hotkeys (1–9) to trigger frequently used actions from the hotbar without opening the character sheet.
- [ ] **Compendium browser keyboard navigation** — verify Tab/Arrow/Enter work correctly in the PF2E compendium browser after our `additems.js` changes.
- [ ] **Tooltip / description readout** — pressing a key while focused on an item/spell/feat reads the full description text via the polite live region.

---

## 🔧 Infrastructure / Quality of Life

- [ ] **System-agnostic HP hook** — the HP announcement currently needs PF2E-specific attribute paths. Investigate a generic approach that works for any system (D&D 5e, PF2E, SWADE, etc.).
- [ ] **Setting profile / preset** — a single "Enable all screen reader features" toggle that turns on all the announcement settings at once, for ease of onboarding Michael.
- [x] **Accessibility settings shortcut** — dedicated hotkey opens Configure Settings to the Accessibility Enhancements module and moves focus into the first setting control so settings can be changed without hunting through the full settings UI.
- [ ] **Keyboard shortcut reference sheet** — in-game pop-up (hotkey: `?` or `F1`) listing all accessibility keybindings added by this module.
- [ ] **CHANGELOG / release workflow** — update `workflows/release.yml` and `CHANGELOG.md` for v0.4.0 and future releases.

---

## ✅ Completed (v0.4.0)

- [x] Update `module.json` compatibility to Foundry v13
- [x] Fix `mergeObject` → `foundry.utils.mergeObject` (removed in v13)
- [x] Fix `renderApplication` / add `renderApplicationV2` hooks
- [x] Fix `token._onClickRight()` → `canvas.hud.token.bind(token)`
- [x] Fix compendium browser CSS selectors (`div.app#` → `#`)
- [x] Rewrite `labeler.js` — `data-tooltip` support, alt text for images, icon-only button labels
- [x] Add `screenreader.js` — ARIA live regions, chat/combat/notification announcements
- [x] Add `.ae-sr-only` CSS utility and `:focus-visible` keyboard focus indicators
