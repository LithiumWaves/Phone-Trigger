import { DEFAULT_SETTINGS, MODULE_NAME, LEGACY_MODULE_NAME, DEFAULT_CALL_PROMPT, LEGACY_CALL_PROMPT } from './constants.js';

export function getContext() {
    return SillyTavern.getContext();
}

export function getSettingsStore() {
    const ctx = getContext();
    return ctx?.extensionSettings ?? window.extension_settings ?? {};
}

export function getSettings() {
    const store = getSettingsStore();

    if (!store[MODULE_NAME] && store[LEGACY_MODULE_NAME]) {
        store[MODULE_NAME] = structuredClone(store[LEGACY_MODULE_NAME]);
    }

    if (!store[MODULE_NAME]) {
        store[MODULE_NAME] = structuredClone(DEFAULT_SETTINGS);
    }

    // Migrate old "own only" checkbox → scope before filling new defaults
    if (!Object.hasOwn(store[MODULE_NAME], 'mailMemoryScope')
        && Object.hasOwn(store[MODULE_NAME], 'injectMailOwnOnly')) {
        store[MODULE_NAME].mailMemoryScope = store[MODULE_NAME].injectMailOwnOnly === false ? 'all' : 'speaker';
    }

    for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (!Object.hasOwn(store[MODULE_NAME], key)) {
            store[MODULE_NAME][key] = DEFAULT_SETTINGS[key];
        }
    }

    // Untouched old default call prompt → current default (adds {{cue}})
    if (String(store[MODULE_NAME].callPrompt || '').trim() === LEGACY_CALL_PROMPT.trim()) {
        store[MODULE_NAME].callPrompt = DEFAULT_CALL_PROMPT;
    }

    // Prefer orbital standby if still on removed teal preset
    if (store[MODULE_NAME].wallpaperId === 'solid-teal' || store[MODULE_NAME].wallpaperId === 'crt') {
        store[MODULE_NAME].wallpaperId = 'orbital';
    }

    // Keep legacy injectWorldline in sync with dmailWorldline
    if (!Object.hasOwn(store[MODULE_NAME], 'dmailWorldline')
        && Object.hasOwn(store[MODULE_NAME], 'injectWorldline')) {
        store[MODULE_NAME].dmailWorldline = store[MODULE_NAME].injectWorldline !== false;
    }
    store[MODULE_NAME].injectWorldline = store[MODULE_NAME].dmailWorldline !== false;

    return store[MODULE_NAME];
}

export function saveSettings() {
    const ctx = getContext();
    const fn = ctx?.saveSettingsDebounced ?? window.saveSettingsDebounced;
    if (typeof fn === 'function') {
        fn();
    }
}

/** Time travel as a whole (D-Mail, Time Leap, divergence, worldlines) is switched on. */
export function timeTravelOn() {
    try {
        return getSettings().timeTravelEnabled !== false;
    } catch {
        return true;
    }
}

/** D-Mail through PhoneWave is available. */
export function dmailOn() {
    return timeTravelOn() && getSettings().showPhoneWave !== false;
}

/** The Time Leap Machine is available (calling PhoneWave opens it). */
export function timeleapOn() {
    return timeTravelOn() && getSettings().timeleapEnabled !== false;
}

/** PhoneWave is on the phone at all: as a mail address (D-Mail) and/or a number (Time Leap). */
export function phoneWaveOn() {
    return dmailOn() || timeleapOn();
}

/**
 * Photosensitivity: soften flashes and flicker (the Reduce flashing setting, or the system's
 * reduced-motion preference).
 */
export function reduceFlashing() {
    try {
        if (getSettings().reduceFlashing) {
            return true;
        }
    } catch {
        /* settings not ready */
    }
    try {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
        return false;
    }
}

export { toast, notifyIncomingMail, ensureNotifyHost } from './notify.js';
