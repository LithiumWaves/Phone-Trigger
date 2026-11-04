/**
 * Small shared helpers for the newer features: settings bindings, prompt injection,
 * HTML escaping and quiet JSON generations. Each feature module binds its own menu
 * controls through these so index.js only has to call one init per feature.
 */
import { getSettings, saveSettings, getContext } from './settings.js';
import { generateMailText } from './generate.js';

/** @param {unknown} str */
export function esc(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Checkbox ↔ boolean setting.
 * @param {string} selector
 * @param {string} key
 * @param {(s: any) => void} [after]
 */
export function bindToggle(selector, key, after) {
    const el = /** @type {HTMLInputElement | null} */ (document.querySelector(selector));
    if (!el) {
        return;
    }
    el.checked = Boolean(getSettings()[key]);
    el.addEventListener('input', () => {
        const s = getSettings();
        s[key] = el.checked;
        saveSettings();
        after?.(s);
    });
}

/**
 * Number input ↔ clamped number setting.
 * @param {string} selector
 * @param {string} key
 * @param {{ min: number, max: number, fallback: number, int?: boolean }} range
 * @param {(s: any) => void} [after]
 */
export function bindNumber(selector, key, range, after) {
    const el = /** @type {HTMLInputElement | null} */ (document.querySelector(selector));
    if (!el) {
        return;
    }
    el.value = String(getSettings()[key] ?? range.fallback);
    el.addEventListener('change', () => {
        let n = Number(el.value);
        if (!Number.isFinite(n)) {
            n = range.fallback;
        }
        n = Math.max(range.min, Math.min(range.max, range.int === false ? n : Math.round(n)));
        const s = getSettings();
        s[key] = n;
        el.value = String(n);
        saveSettings();
        after?.(s);
    });
}

/**
 * Select / text input / textarea ↔ string setting.
 * @param {string} selector
 * @param {string} key
 * @param {(s: any) => void} [after]
 * @param {string[]} [allowed] for selects: the valid values (first is the fallback)
 */
export function bindValue(selector, key, after, allowed) {
    const el = /** @type {HTMLInputElement | HTMLSelectElement | null} */ (document.querySelector(selector));
    if (!el) {
        return;
    }
    el.value = String(getSettings()[key] ?? '');
    const evt = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(evt, () => {
        let v = String(el.value ?? '');
        if (allowed && !allowed.includes(v)) {
            v = allowed[0];
        }
        const s = getSettings();
        s[key] = v;
        saveSettings();
        after?.(s);
    });
}

/**
 * Put (or clear, with an empty value) an in-chat extension prompt.
 * @param {string} key
 * @param {string} value
 * @param {number} [depth]
 */
export function setPrompt(key, value, depth = 1) {
    const ctx = getContext();
    if (typeof ctx.setExtensionPrompt !== 'function') {
        return;
    }
    const pos = ctx.extension_prompt_types?.IN_CHAT ?? 1;
    try {
        ctx.setExtensionPrompt(key, String(value || ''), pos, Math.max(0, Number(depth) || 0));
    } catch (err) {
        console.warn('[Phone Trigger] setExtensionPrompt failed', key, err);
    }
}

/** Save chat metadata (debounced by SillyTavern where available). */
export async function saveMeta() {
    const ctx = getContext();
    const fn = ctx.saveMetadataDebounced || ctx.saveMetadata;
    if (typeof fn === 'function') {
        await fn();
    }
}

/** Display name of the user persona. */
export function personaName() {
    const ctx = getContext();
    return String(ctx.name1 || ctx.user?.name || 'User').trim() || 'User';
}

/**
 * Character card text for a name (description / personality / scenario), trimmed.
 * @param {string} name
 * @param {number} [max]
 */
export function characterCardText(name, max = 1600) {
    const ctx = getContext();
    const chars = Array.isArray(ctx.characters) ? ctx.characters : [];
    const needle = String(name || '').trim().toLowerCase();
    const ch = chars.find((c) => String(c?.name || '').trim().toLowerCase() === needle)
        || chars.find((c) => String(c?.name || '').trim().toLowerCase().split(/\s+/)[0] === needle.split(/\s+/)[0]);
    if (!ch) {
        return '';
    }
    const parts = [
        ch.description || ch.data?.description,
        ch.personality || ch.data?.personality ? `Personality: ${ch.personality || ch.data?.personality}` : '',
        ch.scenario || ch.data?.scenario ? `Scenario: ${ch.scenario || ch.data?.scenario}` : '',
    ].map((p) => String(p || '').trim()).filter(Boolean);
    const text = parts.join('\n').replace(/\{\{char\}\}/gi, ch.name).replace(/\{\{user\}\}/gi, personaName());
    return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * Last N chat lines as "Name: text" (system/hidden skipped).
 * @param {number} n
 * @param {number} [each] max chars per line
 */
export function recentChatLines(n = 12, each = 300) {
    const chat = getContext().chat || [];
    const out = [];
    for (let i = chat.length - 1; i >= 0 && out.length < n; i--) {
        const m = chat[i];
        if (!m || m.is_system || !m.mes) {
            continue;
        }
        const text = String(m.mes).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (text) {
            out.unshift(`${m.name}: ${text.length > each ? `${text.slice(0, each)}…` : text}`);
        }
    }
    return out;
}

/**
 * Pull the first JSON object/array out of a model answer.
 * @param {string} raw
 * @returns {any}
 */
export function parseJsonLoose(raw) {
    const text = String(raw || '').replace(/```(?:json)?/gi, '').trim();
    for (const [open, close] of [['{', '}'], ['[', ']']]) {
        const start = text.indexOf(open);
        const end = text.lastIndexOf(close);
        if (start >= 0 && end > start) {
            try {
                return JSON.parse(text.slice(start, end + 1));
            } catch {
                // try the other shape
            }
        }
    }
    return null;
}

/**
 * Quiet generation that doesn't touch the chat: the same backend as mail replies
 * (main API raw completion, or OpenRouter when chosen).
 * @param {string} prompt
 */
export async function quietGenerate(prompt) {
    return String(await generateMailText(prompt) ?? '');
}

/**
 * Run a slash command (STscript) and return its pipe.
 * @param {string} command
 */
export async function runSlashCommand(command) {
    const ctx = getContext();
    if (typeof ctx.executeSlashCommandsWithOptions === 'function') {
        const r = await ctx.executeSlashCommandsWithOptions(command, { handleParserErrors: true, handleExecutionErrors: true });
        return r?.pipe;
    }
    if (typeof ctx.executeSlashCommands === 'function') {
        const r = await ctx.executeSlashCommands(command);
        return r?.pipe;
    }
    throw new Error('Slash commands unavailable');
}

/** Fire a DOM event that open phone screens and menus can listen for. */
export function emit(name, detail = {}) {
    try {
        document.dispatchEvent(new CustomEvent(`pt:${name}`, { detail }));
    } catch {
        // no DOM
    }
}
