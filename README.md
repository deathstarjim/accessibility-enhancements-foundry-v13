This module provides several minor modifications to the Foundry interface in order to improve accessibility.

It's far from perfect - there are a lot of places with obvious paths for improvement that I have not taken due to a lack of time or skill. About the best I can say is that I did better than I had expected - this module's goal is more about getting the player experience closer to serviceable by patching obvious holes while we wait for core improvements. My hope is that others will see the terrible job I've done and be inspired to outdo me. To that end, I've listed some of the known issues and limitations in this readme file- perhaps they can serve as inspiration to someone.

**Code contributions are very, very welcome. I do not personally use a screen reader, so any support that can be offered is appreciated.**

# Features

Note: All features can be toggled per-client in the module settings.

## Drag & Drop Alternatives

The module provides two new ways to add items to a character that do not require drag and drop.

(Note: A Foundry Item is a document which is added to an Actor. It encompasses the Pathfinder concepts of feats, actions, effects, ancestries, equipment, etc, not only physical objects.)

  - probably only works in Pathfinder 2e
  - requires the core "create new items" permission to be enabled for the user
  - uses the controlled token, and will fall back to the assigned actor if the former is not found. This means that you can theoretically now add items to familiars and animal companions too, if you are able to select their token. This hasn't been tested yet. 
    - it'd be better if there was some kind of drop-down, maybe one that could check which sheet it had been opened from or which sheets are open
  - doesn't ask which feat slot to place a feat in, nor which spell list, which means it can't be used for spells at all and always puts feats in the "bonus feats" slot.

### Button

If a compendium of items is open, the module adds a button beside each displayed item. Clicking on the button adds a copy of that item to your character.

- I'd like to add the button to the compendium browser and the compendium sidebar tab too.

### Hotkey

Registers a hotkey (currently 'X') which checks every element beneath the mouse cursor. If any of them correspond to an item document, it tries to add it to the actor in the same way as the above. Unlike the dedicated button, this hotkey supports the compendium browser and the compendium sidebar.

The hotkey cannot be rebound but it can be disabled in the module settings.

- It'd be neat if this would prioritise the screen reader's "focused" element over the hovered one if one was present, but I'm not sure what selector to use for that.

## Audio Feedback

Adds sound cues for certain actions to provide non-visual feedback that they were executed successfully.

### Create Item

Plays a "rummaging" sound on the "createItem" hook. Helps to provide feedback that you successfully added an item to your sheet.

### Render Application

Plays a "ding" sound effect on the "renderApplication" hook. That doesn't cover every time a new window is opened but it does cover a lot, including cases like choiceset popups which were previously not signposted to screen readers at all.

- It would be better if we drew the screenreader's focus to new applications instead, but that's more difficult.
  - Apparently the "sell all treasure" button does this correctly - copy whatever it's doing? Something to do with web dialogs.

## Alternate Token Interactions

Some users use trackpads or touch interfaces or other control schemas that don't support right click. Some people don't want to relearn their existing muscle memory. Some people just irrationally hate right clicks. For good or for ill, we want to empower you.

The module adds a setting (disabled by default) which give an alternate way to open the Token HUD.

- Seems to behave kind of strangely sometimes, not extensively tested yet
- I'd love to support clicking on an unowned token to target it, but I haven't spent much time on getting it working yet

## High Contrast Character Sheets

**PF2E Player character sheet only**

Adds an optional override (configured in module settings) which takes a hatchet to the PC character sheet to offer a "high-contrast" option. Both a dark and a light mode are offered. 

- The setting is clientside and applies to all character sheets. It doesn't affect how other users see the sheets.
- Though I would be happy if they enjoyed it, this setting was not primarily intended to appeal to users who are seeking a "conventional" dark mode character sheet. The goal was to maximise contrast, not prioritise aesthetics.
- This setting may make the sheets harder to use for many users, especially in places where the colours were used to convey information. There may be some places (like the proficiency dropdown selector) which look objectively worse. 
- There were several fields which sadly did not use variables to set their colours, requiring me to use gross overrides or important tags which are not best practice ordinarily. I would prefer to do this inside the system, but that will take additional investigation.

Preview images:

![image](https://github.com/silvative/accessibility-enhancements/assets/66365038/29aea8d5-128d-48ac-baa3-a29b36d56e6e)
![image](https://github.com/silvative/accessibility-enhancements/assets/66365038/cebe67b5-b10a-4323-90f8-079c227117bb)

(Pictures of the high-contrast character sheets, which remove all coloured elements from the character sheets and maximise contrast, prioritising readability over aesthetics. There is a dark and light mode option.)

## Compendium Browser Image Preview

**PF2E system only** (obviously)

Displays a creature's portrait artwork in an enlarged thumbnail (5 size options) when its icon is hovered in the compendium browser. Useful if you find the default icon size too small to make out any detail.

![gif](https://github.com/silvative/accessibility-enhancements/assets/66365038/c1e7edaf-8656-42c2-b18b-f0971d2b7a34)



(A brief video clip of the portrait preview, using the artwork from the Token Pack: Bestaries module for demonstrative purposes.)

# Removed Features

These features appeared in older versions of the module but are no longer active.

## Labelled fields (Rendered unnecessary by core change as of build 11.306)

Several static UI elements have been given a label which allows screen readers to determine their function. This mostly affects buttons like the sidebar tab buttons or the scene controls, which don't have any inner text to fall back on and so weren't very accessible.

Uses manually chosen labels for some and attempts to fallback automatically generated labels for others. I welcome feedback on labels which are unclear or too long, and any buttons which are missing labels.

(Note: *IN THEORY*, this should work with modules that add new buttons to these locations, since I didn't hardcode any of the values. No guarantees though.)
