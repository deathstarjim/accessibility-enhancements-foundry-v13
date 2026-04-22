const { test, expect } = require("@playwright/test");

test.beforeEach(async ({ page }) =>
{
    page.on("console", message =>
    {
        // Keep this simple and visible in the terminal for local smoke-test debugging.
        console.log(`[browser:${message.type()}] ${message.text()}`);
    });

    page.on("pageerror", error =>
    {
        console.log(`[pageerror] ${error?.message ?? error}`);
    });
});

async function joinAsTester(page)
{
    await page.goto("/join");

    const joinForm = page.locator("#join-game-form");
    await expect(joinForm).toBeVisible({ timeout: 15000 });

    const userSelect = joinForm.locator('select[name="userid"]');
    await expect(userSelect).toBeVisible();

    await userSelect.selectOption({ label: "Tester the Brave" });
    const joinButton = joinForm.locator('button[name="join"]');
    await expect(joinButton).toBeVisible();
    await joinButton.click();
    await page.waitForURL("**/game");
    await page.waitForFunction(() => Boolean(game.ready), null, { timeout: 15000 });
}

async function logUserCharacterDiagnostics(page, actorName = "Tester the Brave")
{
    const diagnostics = await page.evaluate((name) =>
    {
        const user = game.user;
        const assignedCharacter = user?.character ?? null;
        const namedActor = game.actors?.find(candidate => candidate?.type === "character" && candidate?.name === name) ?? null;
        const namedActorOwnership = namedActor && user ? namedActor.testUserPermission(user, "OWNER") : false;

        return {
            userName: user?.name ?? null,
            assignedCharacterName: assignedCharacter?.name ?? null,
            assignedCharacterId: assignedCharacter?.id ?? null,
            namedActorName: namedActor?.name ?? null,
            namedActorId: namedActor?.id ?? null,
            namedActorOwnership
        };
    }, actorName);

    if (!diagnostics.assignedCharacterId || !diagnostics.namedActorOwnership)
    {
        console.log("[playwright] user/actor diagnostics", diagnostics);
    }

    return diagnostics;
}

async function getOwnedCharacterActors(page)
{
    return page.evaluate(() =>
    {
        const user = game.user;
        return (game.actors?.contents ?? [])
            .filter(actor => actor?.type === "character" && user && actor.testUserPermission(user, "OWNER"))
            .map(actor => ({
                id: actor.id,
                name: actor.name,
                uuid: actor.uuid
            }));
    });
}

async function openCharacterSheet(page, actorName = "Tester the Brave")
{
    const actorId = await page.evaluate((name) =>
    {
        const actor = game.user?.character
            ?? game.actors?.find(candidate => candidate?.type === "character" && candidate?.name === name)
            ?? game.actors?.find(candidate => candidate?.type === "character" && candidate?.isOwner);
        if (!actor?.id)
        {
            return null;
        }

        actor.sheet?.render?.(true);
        return actor.id;
    }, actorName);

    expect(actorId).toBeTruthy();

    await page.waitForFunction((name) =>
    {
        const actor = game.user?.character
            ?? game.actors?.find(candidate => candidate?.type === "character" && candidate?.name === name)
            ?? game.actors?.find(candidate => candidate?.type === "character" && candidate?.isOwner);
        return Boolean(game.ready && actor?.sheet?.rendered);
    }, actorName, { timeout: 10000 });

    const sheetSelector = `.application.sheet.actor.character[id$="Actor-${actorId}"]`;
    await page.waitForFunction((selector) =>
    {
        return Array.from(document.querySelectorAll(selector)).some(element => element.offsetParent);
    }, sheetSelector, { timeout: 10000 });

    const sheet = page.locator(sheetSelector).filter({ visible: true }).last();
    await expect(sheet).toBeVisible({ timeout: 10000 });
    await expect(sheet).toHaveClass(/sheet/);
    await expect(sheet).toHaveClass(/actor/);
    await expect(sheet).toHaveClass(/character/);

    return sheet;
}

async function setCharacterSheetClass(page, actorName, sheetClass)
{
    const sheet = await openCharacterSheet(page, actorName);

    const toggleControlsButton = sheet.locator('[data-action="toggleControls"]');
    await expect(toggleControlsButton).toBeVisible();
    await toggleControlsButton.click({ force: true });

    const visibleControlsDropdown = sheet.locator(".controls-dropdown:visible");
    await expect(visibleControlsDropdown).toBeVisible();

    const configureSheetControl = visibleControlsDropdown.locator('[data-action="configureSheet"] button');
    await expect(configureSheetControl).toBeVisible();
    await configureSheetControl.click();

    const sheetClassSelect = page.locator('select[name="sheetClass"]').last();
    await expect(sheetClassSelect).toBeVisible();
    await sheetClassSelect.selectOption(sheetClass);

    const saveButton = page.getByRole("button", { name: /Save Sheet Configuration/i }).last();
    await expect(saveButton).toBeVisible();
    await saveButton.click();

    return openCharacterSheet(page, actorName);
}

async function focusShouldReturnToTab(page, sheet, tabName)
{
    const tab = sheet.getByRole("tab", { name: new RegExp(`^${tabName}$`, "i") });
    await expect(tab).toBeVisible();
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", /true/i);
    await tab.press("Enter");
    await expect(tab).not.toBeFocused();

    await page.keyboard.press("Alt+T");
    await expect(tab).toBeFocused();
}

test("Alt+T returns focus to the active tab well on the current character sheet", async ({ page }) =>
{
    await joinAsTester(page);
    await logUserCharacterDiagnostics(page, "Tester the Brave");
    const sheet = await openCharacterSheet(page, "Tester the Brave");

    // These tab labels are shared by the default and modern Tidy 5e sheets.
    await focusShouldReturnToTab(page, sheet, "Inventory");
    await focusShouldReturnToTab(page, sheet, "Features");
});

test("Alt+T still works after changing the actor between Tidy and default sheets", async ({ page }) =>
{
    await joinAsTester(page);

    const tidySheet = await setCharacterSheetClass(
        page,
        "Tester the Brave",
        "dnd5e.Tidy5eCharacterSheetQuadrone"
    );
    await focusShouldReturnToTab(page, tidySheet, "Inventory");

    const defaultSheet = await setCharacterSheetClass(
        page,
        "Tester the Brave",
        "dnd5e.CharacterActorSheet"
    );
    await focusShouldReturnToTab(page, defaultSheet, "Features");
});
