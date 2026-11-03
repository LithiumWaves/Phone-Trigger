/**
 * Phone specs — what a handset looks like.
 *
 * A spec is plain data the AI can write and the chassis renderer (lib/chassis.js) can draw.
 * Every value that reaches CSS or HTML comes out of validateSpec(): enums are whitelisted,
 * colours are #rrggbb, text is length-capped (and escaped where it is rendered).
 */
import { getSettings, saveSettings, getContext } from './settings.js';
import { getPersonaName, listMailContacts } from './store.js';
import { isPhoneWaveContact } from './dmail.js';
import { generateMailText, buildChatSummary } from './generate.js';

export const BODIES = ['flip', 'bar', 'slider', 'touch'];
export const FINISHES = ['gloss', 'matte', 'metallic', 'pearl'];
export const CROWNS = ['none', 'truss'];
export const LCD_FONTS = ['mono', 'round', 'pixel'];
export const WALL_KINDS = ['preset', 'gradient', 'pattern'];
export const WALL_PATTERNS = ['dots', 'stripes', 'grid', 'hearts', 'stars'];
export const WALL_PRESETS = ['orbital', 'divergence', 'labmem', 'night', 'solid'];
export const CHARMS = ['none', 'strap', 'plush', 'bell', 'beads', 'keychain'];
export const STICKERS = ['star', 'heart', 'skull', 'cat', 'bolt', 'flower'];
export const STICKER_SPOTS = ['lid-tl', 'lid-tr', 'base-bl', 'base-br'];

export const USER_OWNER = 'user';

/**
 * @typedef {{
 *   v: 1,
 *   maker: string,
 *   model: string,
 *   body: 'flip' | 'bar' | 'slider' | 'touch',
 *   colors: { shell: string, shellDeep: string, shellEdge: string, panel: string, keys: string, keyPrint: string, accent: string },
 *   finish: 'gloss' | 'matte' | 'metallic' | 'pearl',
 *   crown: 'none' | 'truss',
 *   lcd: { bg: string, fg: string, accent: string, font: 'mono' | 'round' | 'pixel' },
 *   wallpaper: { kind: 'preset' | 'gradient' | 'pattern', preset: string, a: string, b: string, pattern: string, angle: number },
 *   charm: { kind: string, color: string, label: string },
 *   stickers: Array<{ kind: string, color: string, at: string }>,
 *   blurb: string,
 * }} PhoneSpec
 */

/** Okabe's SG001 — the handset as it has always looked. */
export const SG001_SPEC = Object.freeze({
    v: 1,
    maker: '',
    model: 'SG001',
    body: 'flip',
    colors: Object.freeze({
        shell: '#d3232a',
        shellDeep: '#a0161b',
        shellEdge: '#5c0c0e',
        panel: '#67646a',
        keys: '#1d1b1e',
        keyPrint: '#eceaec',
        accent: '#9ec4ff',
    }),
    finish: 'gloss',
    crown: 'truss',
    lcd: Object.freeze({ bg: '#061530', fg: '#e8f0ff', accent: '#9ec4ff', font: 'mono' }),
    wallpaper: Object.freeze({ kind: 'preset', preset: 'orbital', a: '#061530', b: '#0a2a55', pattern: 'dots', angle: 160 }),
    charm: Object.freeze({ kind: 'none', color: '#ffffff', label: '' }),
    stickers: Object.freeze([]),
    blurb: 'Okabe Rintarou\'s red flip phone.',
});

// —— Colour helpers ——

/** @param {unknown} v */
function hex(v) {
    const s = String(v || '').trim().toLowerCase();
    const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/.exec(s);
    if (!m) {
        return null;
    }
    const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1];
    return `#${h}`;
}

/** @param {string} h */
function rgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** @param {number[]} c */
function toHex(c) {
    return `#${c.map((x) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Mix towards white (amt > 0) or black (amt < 0).
 * @param {string} h
 * @param {number} amt -1..1
 */
export function shade(h, amt) {
    const c = rgb(h);
    const t = amt < 0 ? 0 : 255;
    const p = Math.abs(amt);
    return toHex(c.map((x) => x + (t - x) * p));
}

/** @param {string} h */
export function luminance(h) {
    const [r, g, b] = rgb(h).map((x) => {
        const s = x / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** @param {string} a @param {string} b */
function contrast(a, b) {
    const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (l1 + 0.05) / (l2 + 0.05);
}

// —— Validation ——

/** @param {unknown} v @param {readonly string[]} list @param {string} dflt */
function pick(v, list, dflt) {
    const s = String(v || '').trim().toLowerCase();
    return list.includes(s) ? s : dflt;
}

/** @param {unknown} v @param {number} max */
function text(v, max) {
    return String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * Clamp anything (model output, saved data, editor input) into a valid spec.
 * Missing fields come from `base` (default: a deterministic fallback for `seedName`).
 * @param {any} raw
 * @param {{ seedName?: string, base?: PhoneSpec }} [opts]
 * @returns {PhoneSpec}
 */
export function validateSpec(raw, opts = {}) {
    const base = opts.base || fallbackSpec(opts.seedName || 'phone');
    const r = raw && typeof raw === 'object' ? raw : {};
    const c = r.colors && typeof r.colors === 'object' ? r.colors : {};
    const shell = hex(c.shell) || base.colors.shell;
    const keys = hex(c.keys) || base.colors.keys;
    let keyPrint = hex(c.keyPrint) || base.colors.keyPrint;
    if (contrast(keys, keyPrint) < 3) {
        keyPrint = luminance(keys) > 0.4 ? '#141414' : '#f2f2f2';
    }
    const lcdIn = r.lcd && typeof r.lcd === 'object' ? r.lcd : {};
    const lcdBg = hex(lcdIn.bg) || base.lcd.bg;
    let lcdFg = hex(lcdIn.fg) || base.lcd.fg;
    if (contrast(lcdBg, lcdFg) < 4.5) {
        lcdFg = luminance(lcdBg) > 0.35 ? '#101418' : '#eef3ff';
    }
    const w = r.wallpaper && typeof r.wallpaper === 'object' ? r.wallpaper : {};
    const ch = r.charm && typeof r.charm === 'object' ? r.charm : {};
    const body = pick(r.body, BODIES, base.body);
    const stickers = Array.isArray(r.stickers) ? r.stickers : base.stickers;
    const angle = Number(w.angle);
    return {
        v: 1,
        maker: text(r.maker ?? base.maker, 24),
        model: text(r.model ?? base.model, 24) || base.model,
        body: /** @type {PhoneSpec['body']} */ (body),
        colors: {
            shell,
            shellDeep: hex(c.shellDeep) || shade(shell, -0.25),
            shellEdge: hex(c.shellEdge) || shade(shell, -0.6),
            panel: hex(c.panel) || base.colors.panel,
            keys,
            keyPrint,
            accent: hex(c.accent) || base.colors.accent,
        },
        finish: /** @type {PhoneSpec['finish']} */ (pick(r.finish, FINISHES, base.finish)),
        // The truss crown is part of flip lids only.
        crown: body === 'flip' ? /** @type {PhoneSpec['crown']} */ (pick(r.crown, CROWNS, 'none')) : 'none',
        lcd: {
            bg: lcdBg,
            fg: lcdFg,
            accent: hex(lcdIn.accent) || base.lcd.accent,
            font: /** @type {PhoneSpec['lcd']['font']} */ (pick(lcdIn.font, LCD_FONTS, base.lcd.font)),
        },
        wallpaper: {
            kind: /** @type {PhoneSpec['wallpaper']['kind']} */ (pick(w.kind, WALL_KINDS, base.wallpaper.kind)),
            preset: pick(w.preset, WALL_PRESETS, base.wallpaper.preset),
            a: hex(w.a) || base.wallpaper.a,
            b: hex(w.b) || base.wallpaper.b,
            pattern: pick(w.pattern, WALL_PATTERNS, base.wallpaper.pattern),
            angle: Number.isFinite(angle) ? Math.round(((angle % 360) + 360) % 360) : base.wallpaper.angle,
        },
        charm: {
            kind: pick(ch.kind, CHARMS, base.charm.kind),
            color: hex(ch.color) || base.charm.color,
            label: text(ch.label ?? base.charm.label, 18),
        },
        stickers: stickers.slice(0, 4).map((s, i) => ({
            kind: pick(s?.kind, STICKERS, 'star'),
            color: hex(s?.color) || '#ffd23f',
            at: pick(s?.at, STICKER_SPOTS, STICKER_SPOTS[i % STICKER_SPOTS.length]),
        })),
        blurb: text(r.blurb ?? base.blurb, 160),
    };
}

/** @param {string} s */
function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/**
 * Deterministic phone for a name, used when the model is unavailable or returns junk.
 * @param {string} name
 * @returns {PhoneSpec}
 */
export function fallbackSpec(name) {
    let s = hash(String(name || 'phone').toLowerCase());
    const rnd = () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
    };
    const hue = Math.floor(rnd() * 360);
    const hsl = (h, sat, l) => {
        const a = sat * Math.min(l, 1 - l);
        const f = (n) => {
            const k = (n + h / 30) % 12;
            return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        };
        return toHex([f(0) * 255, f(8) * 255, f(4) * 255]);
    };
    const shell = hsl(hue, 0.55 + rnd() * 0.3, 0.38 + rnd() * 0.2);
    const pickOf = (list) => list[Math.floor(rnd() * list.length)];
    return {
        v: 1,
        maker: pickOf(['Kyorin', 'Sanyo-Denki', 'Hikari', 'Mirai', 'Raikou']),
        model: `${pickOf(['K', 'S', 'N', 'P', 'F'])}${Math.floor(100 + rnd() * 900)}${pickOf(['i', 'SH', 'X', ''])}`,
        body: /** @type {PhoneSpec['body']} */ (pickOf(['flip', 'flip', 'bar', 'slider', 'touch'])),
        colors: {
            shell,
            shellDeep: shade(shell, -0.25),
            shellEdge: shade(shell, -0.6),
            panel: hsl(hue, 0.08, 0.42),
            keys: hsl(hue, 0.1, 0.12),
            keyPrint: '#eeeeee',
            accent: hsl((hue + 180) % 360, 0.7, 0.7),
        },
        finish: /** @type {PhoneSpec['finish']} */ (pickOf(FINISHES)),
        crown: 'none',
        lcd: { bg: hsl(hue, 0.5, 0.09), fg: '#eef3ff', accent: hsl((hue + 180) % 360, 0.7, 0.72), font: 'mono' },
        wallpaper: {
            kind: 'gradient', preset: 'night', a: hsl(hue, 0.5, 0.12), b: hsl((hue + 40) % 360, 0.55, 0.3),
            pattern: pickOf(WALL_PATTERNS), angle: Math.floor(rnd() * 360),
        },
        charm: { kind: pickOf(CHARMS), color: hsl((hue + 120) % 360, 0.7, 0.6), label: '' },
        stickers: [],
        blurb: '',
    };
}

// —— Storage ——

/** @returns {Record<string, PhoneSpec>} */
function models() {
    const s = getSettings();
    if (!s.phoneModels || typeof s.phoneModels !== 'object') {
        s.phoneModels = {};
    }
    return s.phoneModels;
}

/**
 * Saved spec for an owner (USER_OWNER or a character avatar key), validated on read.
 * The user falls back to the SG001; characters to their deterministic phone.
 * @param {string} owner
 * @param {string} [name]
 * @returns {PhoneSpec}
 */
export function getPhoneSpec(owner, name = '') {
    const saved = models()[owner];
    if (owner === USER_OWNER) {
        return saved ? validateSpec(saved, { base: /** @type {PhoneSpec} */ (SG001_SPEC) }) : /** @type {PhoneSpec} */ (SG001_SPEC);
    }
    return saved ? validateSpec(saved, { seedName: name || owner }) : fallbackSpec(name || owner);
}

/** @param {string} owner */
export function hasPhoneSpec(owner) {
    return Boolean(models()[owner]);
}

/**
 * @param {string} owner
 * @param {PhoneSpec | null} spec null = forget (user → SG001)
 */
export function setPhoneSpec(owner, spec) {
    const all = models();
    if (spec) {
        all[owner] = spec;
    } else {
        delete all[owner];
    }
    saveSettings();
}

/** @param {PhoneSpec} spec */
export function isSG001(spec) {
    return JSON.stringify(validateSpec(spec, { base: /** @type {PhoneSpec} */ (SG001_SPEC) })) === JSON.stringify(validateSpec(SG001_SPEC, { base: /** @type {PhoneSpec} */ (SG001_SPEC) }));
}

// —— Generation ——

/**
 * Who a phone belongs to, with what the model should know about them.
 * @param {string} owner
 */
export function describeOwner(owner) {
    if (owner === USER_OWNER) {
        const ctx = getContext();
        const persona = getPersonaName();
        const desc = String(ctx.powerUserSettings?.persona_description || ctx.persona?.description || '').slice(0, 1200);
        return { name: persona, card: desc };
    }
    const c = listMailContacts().find((x) => x.key === owner && !isPhoneWaveContact(x.key));
    return {
        name: c?.name || owner,
        card: [c?.description, c?.personality ? `Personality: ${c.personality}` : '', c?.scenario ? `Scenario: ${c.scenario}` : '']
            .filter(Boolean).join('\n').slice(0, 2000),
    };
}

/**
 * Ask the model to design a phone that suits its owner.
 * @param {string} owner
 * @param {{ hint?: string }} [opts]
 * @returns {Promise<{ spec: PhoneSpec, fromModel: boolean }>}
 */
export async function generatePhoneSpec(owner, opts = {}) {
    const { name, card } = describeOwner(owner);
    const summary = buildChatSummary(10);
    const prompt = [
        `Design the mobile phone that ${name} carries, as it would exist around 2010 (Japanese keitai era, early smartphones).`,
        'Match it to their personality, age, taste, money and job. A tidy, practical person and a flashy one should own very different phones.',
        card ? `About ${name}:\n${card}` : '',
        summary ? `Recent story (for flavour only):\n${summary}` : '',
        opts.hint ? `Extra request: ${String(opts.hint).slice(0, 300)}` : '',
        '',
        'Reply with ONLY a JSON object, no commentary, using exactly these keys:',
        '{',
        '  "maker": "fictional brand, max 20 chars",',
        '  "model": "model name/number, max 20 chars",',
        `  "body": one of ${JSON.stringify(BODIES)},`,
        '  "colors": { "shell": "#rrggbb", "panel": "#rrggbb", "keys": "#rrggbb", "keyPrint": "#rrggbb", "accent": "#rrggbb" },',
        `  "finish": one of ${JSON.stringify(FINISHES)},`,
        `  "lcd": { "bg": "#rrggbb", "fg": "#rrggbb", "accent": "#rrggbb", "font": one of ${JSON.stringify(LCD_FONTS)} },`,
        `  "wallpaper": { "kind": one of ${JSON.stringify(WALL_KINDS)}, "preset": one of ${JSON.stringify(WALL_PRESETS)}, "a": "#rrggbb", "b": "#rrggbb", "pattern": one of ${JSON.stringify(WALL_PATTERNS)}, "angle": 0-359 },`,
        `  "charm": { "kind": one of ${JSON.stringify(CHARMS)}, "color": "#rrggbb", "label": "short text or empty" },`,
        `  "stickers": up to 3 of { "kind": one of ${JSON.stringify(STICKERS)}, "color": "#rrggbb", "at": one of ${JSON.stringify(STICKER_SPOTS)} },`,
        '  "blurb": "one sentence on why this phone suits them"',
        '}',
    ].filter((l) => l !== '').join('\n');
    try {
        const raw = String(await generateMailText(prompt) || '');
        const json = extractJson(raw);
        if (json) {
            return { spec: validateSpec(json, { seedName: name }), fromModel: true };
        }
    } catch (err) {
        console.warn('[Phone Trigger] phone design failed', err);
    }
    return { spec: fallbackSpec(name), fromModel: false };
}

/**
 * First balanced {...} block in model output, parsed leniently.
 * @param {string} raw
 * @returns {any | null}
 */
export function extractJson(raw) {
    const s = String(raw || '');
    const start = s.indexOf('{');
    if (start < 0) {
        return null;
    }
    let depth = 0;
    let inStr = false;
    for (let i = start; i < s.length; i++) {
        const ch = s[i];
        if (inStr) {
            if (ch === '\\') {
                i++;
            } else if (ch === '"') {
                inStr = false;
            }
            continue;
        }
        if (ch === '"') {
            inStr = true;
        } else if (ch === '{') {
            depth++;
        } else if (ch === '}') {
            depth--;
            if (depth === 0) {
                const body = s.slice(start, i + 1).replace(/,\s*([}\]])/g, '$1');
                try {
                    return JSON.parse(body);
                } catch {
                    return null;
                }
            }
        }
    }
    return null;
}
