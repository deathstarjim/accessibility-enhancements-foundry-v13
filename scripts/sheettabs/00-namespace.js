(() =>
{
    const AE = globalThis.AESheetTabs ??= {};

    AE.moduleId ??= "accessibility-enhancements";
    AE.moduleSocket ??= `module.${AE.moduleId}`;
    AE.socketActions ??= {
        APPLY_ROLL_RESULT: "applyRollResult",
        APPLY_ROLL_RESULT_RESPONSE: "applyRollResultResponse",
    };
    AE.debug ??= true;
    AE.state ??= {
        activeApp: null,
        activeRoot: null,
        pendingAttack: null,
        pendingRollApplication: null,
        pendingConsumableApplication: null,
        lastAttackControl: null,
        lastAttackControlDescriptor: null,
    };
    AE.announcedHints ??= new Set();
    AE.socketRequests ??= new Map();
    AE.basePanelEntrySelectors ??= [
        '[data-action="roll"]',
        '.rollable',
        'button',
        'a',
    ];
    AE.basePanelTargetSelectors ??= [
        '[data-action="roll"]',
        '.rollable',
        '[data-action]',
        'button',
        'a',
        'input',
        'select',
        'textarea',
    ];
    AE.adapters ??= [];
})();
