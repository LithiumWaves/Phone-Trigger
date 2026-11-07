/**
 * Phone specs — what a handset looks like.
 *
 * A spec is plain data the AI can write and the chassis renderer (lib/chassis.js) can draw.
 * Every value that reaches CSS or HTML comes out of validateSpec(): enums are whitelisted,
 * colours are #rrggbb, numbers are clamped, text is length-capped (and escaped where shown).
 *
 * v2 adds style packs (lib/phoneStyles.js), shell patterns, key styles, rhinestone deco,
 * a decorated cover with an outer display, several charms and freely placed stickers.
 */
import { getSettings, saveSettings, getContext } from './settings.js';
import { getPersonaName, listMailContacts, getMailStore, persistMailStore } from './store.js';
import { isPhoneWaveContact } from './dmail.js';
import { generateMailText, buildChatSummary } from './generate.js';
import { STICKER_KINDS, CHARM_KINDS, PATTERN_KINDS, COVER_ARTS } from './stickers.js';
import { STYLE_PACKS, STYLE_IDS, rollStyle, hashSeed } from './phoneStyles.js';

export const BODIES = ['flip', 'bar', 'slider', 'touch'];
export const FINISHES = ['gloss', 'matte', 'metallic', 'pearl', 'glitter', 'holo', 'candy', 'rubber', 'chrome', 'velvet'];
export const CROWNS = ['none', 'truss'];
export const LCD_FONTS = ['mono', 'round', 'pixel', 'serif', 'hand', 'bubble'];
export const LCD_UIS = ['standard', 'cute', 'terminal', 'neon', 'lace', 'bubble'];
export const KEY_STYLES = ['standard', 'candy', 'metal', 'rainbow', 'pearl', 'neon', 'gem'];
export const RHINESTONES = ['none', 'border', 'scatter', 'heart', 'initial'];
export const OUTER_SHAPES = ['none', 'rect', 'round', 'heart', 'star'];
export const PATTERN_ON = ['shell', 'cover', 'both'];
export const STICKER_SIDES = ['cover', 'front', 'base', 'back'];
export const WALL_KINDS = ['preset', 'gradient', 'pattern'];
export const WALL_PATTERNS = ['dots', 'grid', ...PATTERN_KINDS.filter((k) => k !== 'solid')];
export const WALL_PRESETS = ['orbital', 'divergence', 'labmem', 'night', 'solid'];
export const CHARMS = CHARM_KINDS;
export const STICKERS = STICKER_KINDS;
export const PATTERNS = PATTERN_KINDS;
export { COVER_ARTS, STYLE_PACKS, STYLE_IDS };

export const USER_OWNER = 'user';
/** generatePhoneSpec style value: design without any style pack. */
export const FREEFORM = '__free';
const MAX_STICKERS = 16;
const MAX_CHARMS = 3;

/**
 * @typedef {{ kind: string, color: string, color2: string, side: string, x: number, y: number, rot: number, scale: number }} Sticker
 * @typedef {{
 *   v: 2,
 *   aesthetic: string,
 *   maker: string,
 *   model: string,
 *   body: 'flip' | 'bar' | 'slider' | 'touch',
 *   colors: { shell: string, shellDeep: string, shellEdge: string, panel: string, keys: string, keyPrint: string, accent: string },
 *   finish: string,
 *   crown: 'none' | 'truss',
 *   pattern: { kind: string, a: string, b: string, scale: number, on: string },
 *   keys: { style: string, glow: boolean },
 *   deco: { rhinestones: string, gem: string, pearls: boolean, studs: boolean },
 *   outer: { shape: string, tint: string },
 *   cover: { art: string, color: string },
 *   lcd: { bg: string, fg: string, accent: string, font: string, ui: string },
 *   wallpaper: { kind: 'preset' | 'gradient' | 'pattern', preset: string, a: string, b: string, pattern: string, angle: number },
 *   charms: Array<{ kind: string, color: string, label: string }>,
 *   stickers: Sticker[],
 *   blurb: string,
 *   meter: boolean,
 * }} PhoneSpec
 */

/** Okabe's SG001 — the handset as it has always looked. */
export const SG001_SPEC = Object.freeze({
    v: 2,
    aesthetic: 'plain',
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
    pattern: Object.freeze({ kind: 'solid', a: '#d3232a', b: '#a0161b', scale: 1, on: 'shell' }),
    keys: Object.freeze({ style: 'standard', glow: false }),
    deco: Object.freeze({ rhinestones: 'none', gem: '#ffffff', pearls: false, studs: false }),
    outer: Object.freeze({ shape: 'rect', tint: '#0a0f14' }),
    cover: Object.freeze({ art: 'none', color: '#ffffff' }),
    lcd: Object.freeze({ bg: '#061530', fg: '#e8f0ff', accent: '#9ec4ff', font: 'mono', ui: 'standard' }),
    wallpaper: Object.freeze({ kind: 'preset', preset: 'orbital', a: '#061530', b: '#0a2a55', pattern: 'dots', angle: 160 }),
    charms: Object.freeze([]),
    stickers: Object.freeze([]),
    blurb: 'Okabe Rintarou\'s red flip phone.',
    meter: true,
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
    const s = String(v ?? '').trim().toLowerCase();
    return list.includes(s) ? s : dflt;
}

/** @param {unknown} v @param {number} max */
function text(v, max) {
    return String(v ?? '').replace(/[\u0000-\u001f<>"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** @param {unknown} v @param {number} lo @param {number} hi @param {number} dflt */
function num(v, lo, hi, dflt) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n * 100) / 100)) : dflt;
}

/** @param {unknown} v @param {boolean} dflt */
function bool(v, dflt) {
    return typeof v === 'boolean' ? v : dflt;
}

/** @param {unknown} v */
function obj(v) {
    return v && typeof v === 'object' && !Array.isArray(v) ? /** @type {any} */ (v) : {};
}

/** v1 fixed sticker slots → v2 positions. */
const V1_SPOTS = {
    'lid-tl': ['front', 12, 5],
    'lid-tr': ['front', 88, 5],
    'base-bl': ['base', 10, 93],
    'base-br': ['base', 90, 93],
};

/**
 * Sticker side that exists on this body.
 * @param {string} side
 * @param {string} body
 */
function sideFor(side, body) {
    if (side === 'cover' || side === 'back') {
        return body === 'flip' ? 'cover' : 'back';
    }
    if (side === 'base' && body === 'touch') {
        return 'back';
    }
    return side;
}

/**
 * Normalise against a complete base spec.
 * @param {any} raw
 * @param {PhoneSpec} base
 * @returns {PhoneSpec}
 */
function normalize(raw, base) {
    const r = obj(raw);
    const c = obj(r.colors);
    const body = /** @type {PhoneSpec['body']} */ (pick(r.body, BODIES, base.body));
    const shell = hex(c.shell) || base.colors.shell;
    const keys = hex(c.keys) || base.colors.keys;
    let keyPrint = hex(c.keyPrint) || (r.colors ? '' : base.colors.keyPrint);
    if (!keyPrint || contrast(keys, keyPrint) < 3) {
        keyPrint = luminance(keys) > 0.4 ? '#141414' : '#f2f2f2';
    }
    const lcdIn = obj(r.lcd);
    const lcdBg = hex(lcdIn.bg) || base.lcd.bg;
    let lcdFg = hex(lcdIn.fg) || (r.lcd ? '' : base.lcd.fg);
    if (!lcdFg || contrast(lcdBg, lcdFg) < 4.5) {
        lcdFg = luminance(lcdBg) > 0.35 ? '#101418' : '#eef3ff';
    }
    const accent = hex(c.accent) || hex(lcdIn.accent) || base.colors.accent;
    const p = obj(r.pattern);
    const k = obj(r.keys);
    const d = obj(r.deco);
    const o = obj(r.outer);
    const cv = obj(r.cover);
    const w = obj(r.wallpaper);
    const angle = Number(w.angle);

    // Charms: v1 single `charm` → list
    let charmsIn = Array.isArray(r.charms) ? r.charms : null;
    if (!charmsIn && r.charm && typeof r.charm === 'object') {
        charmsIn = r.charm.kind && r.charm.kind !== 'none' ? [r.charm] : [];
    }
    const charms = (charmsIn ?? base.charms)
        .map((ch) => obj(ch))
        .filter((ch) => CHARM_KINDS.includes(String(ch.kind || '').toLowerCase()) && String(ch.kind).toLowerCase() !== 'none')
        .slice(0, MAX_CHARMS)
        .map((ch) => ({ kind: String(ch.kind).toLowerCase(), color: hex(ch.color) || accent, label: text(ch.label, 18) }));

    // Stickers: v1 `at` slots → positions
    const stickersIn = Array.isArray(r.stickers) ? r.stickers : base.stickers;
    const stickers = stickersIn.slice(0, MAX_STICKERS).map((raw2) => {
        const st = obj(raw2);
        const spot = V1_SPOTS[st.at];
        return {
            kind: pick(st.kind, STICKER_KINDS, 'star'),
            color: hex(st.color) || accent,
            color2: hex(st.color2) || '#ffffff',
            side: sideFor(pick(spot ? spot[0] : st.side, STICKER_SIDES, 'cover'), body),
            x: num(spot ? spot[1] : st.x, 0, 100, 50),
            y: num(spot ? spot[2] : st.y, 0, 100, 50),
            rot: num(st.rot, -180, 180, 0),
            scale: num(st.scale, 0.4, 2.5, 1),
        };
    });

    return {
        v: 2,
        aesthetic: pick(r.aesthetic, [...STYLE_IDS, 'custom'], base.aesthetic || 'custom'),
        maker: text(r.maker ?? base.maker, 24),
        model: text(r.model ?? base.model, 24) || base.model,
        body,
        colors: {
            shell,
            shellDeep: hex(c.shellDeep) || (c.shell ? shade(shell, -0.25) : base.colors.shellDeep),
            shellEdge: hex(c.shellEdge) || (c.shell ? shade(shell, -0.6) : base.colors.shellEdge),
            panel: hex(c.panel) || base.colors.panel,
            keys,
            keyPrint,
            accent,
        },
        finish: pick(r.finish, FINISHES, base.finish),
        // The truss crown belongs to flip lids only.
        crown: body === 'flip' ? /** @type {PhoneSpec['crown']} */ (pick(r.crown, CROWNS, r.crown === undefined ? base.crown : 'none')) : 'none',
        pattern: {
            kind: pick(p.kind, PATTERN_KINDS, base.pattern.kind),
            a: hex(p.a) || (r.pattern ? shell : base.pattern.a),
            b: hex(p.b) || base.pattern.b,
            scale: num(p.scale, 0.5, 2, base.pattern.scale),
            on: pick(p.on, PATTERN_ON, base.pattern.on),
        },
        keys: { style: pick(k.style, KEY_STYLES, base.keys.style), glow: bool(k.glow, base.keys.glow) },
        deco: {
            rhinestones: pick(d.rhinestones, RHINESTONES, base.deco.rhinestones),
            gem: hex(d.gem) || base.deco.gem,
            pearls: bool(d.pearls, base.deco.pearls),
            studs: bool(d.studs, base.deco.studs),
        },
        outer: { shape: pick(o.shape, OUTER_SHAPES, base.outer.shape), tint: hex(o.tint) || base.outer.tint },
        cover: { art: pick(cv.art, COVER_ARTS, base.cover.art), color: hex(cv.color) || base.cover.color },
        lcd: {
            bg: lcdBg,
            fg: lcdFg,
            accent: hex(lcdIn.accent) || accent,
            font: pick(lcdIn.font, LCD_FONTS, base.lcd.font),
            ui: pick(lcdIn.ui, LCD_UIS, base.lcd.ui),
        },
        wallpaper: {
            kind: /** @type {PhoneSpec['wallpaper']['kind']} */ (pick(w.kind, WALL_KINDS, base.wallpaper.kind)),
            preset: pick(w.preset, WALL_PRESETS, base.wallpaper.preset),
            a: hex(w.a) || base.wallpaper.a,
            b: hex(w.b) || base.wallpaper.b,
            pattern: pick(w.pattern, WALL_PATTERNS, base.wallpaper.pattern),
            angle: Number.isFinite(angle) ? Math.round(((angle % 360) + 360) % 360) : base.wallpaper.angle,
        },
        charms,
        stickers,
        blurb: text(r.blurb ?? base.blurb, 200),
        // Divergence meter on the home screen (yours on, other people's off by default).
        meter: bool(r.meter, typeof base.meter === 'boolean' ? base.meter : true),
    };
}

/**
 * Clamp anything (model output, saved data, editor input) into a valid spec.
 * Missing fields come from `base` (default: a deterministic styled phone for `seedName`).
 * @param {any} raw
 * @param {{ seedName?: string, base?: PhoneSpec }} [opts]
 * @returns {PhoneSpec}
 */
export function validateSpec(raw, opts = {}) {
    const base = opts.base ? normalize(opts.base, /** @type {PhoneSpec} */ (SG001_SPEC)) : fallbackSpec(opts.seedName || 'phone');
    return normalize(raw, base);
}

/**
 * Deterministic phone for a name, used when the model is unavailable or returns junk.
 * Picks a style pack from the name, so different people get different looks.
 * @param {string} name
 * @param {string} [packId]
 * @returns {PhoneSpec}
 */
export function fallbackSpec(name, packId) {
    const seed = hashSeed(String(name || 'phone').toLowerCase());
    const pack = packId || STYLE_IDS[seed % STYLE_IDS.length];
    return normalize(rollStyle(pack, seed), /** @type {PhoneSpec} */ (SG001_SPEC));
}

/**
 * A fresh random phone in a style (the menu's style gallery / shuffle).
 * @param {string} packId
 * @param {{ body?: string, seed?: number }} [opts]
 */
export function rollPhone(packId, opts = {}) {
    const seed = opts.seed ?? ((Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0);
    return normalize(rollStyle(packId, seed, { body: opts.body }), /** @type {PhoneSpec} */ (SG001_SPEC));
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
 * This chat's own looks (`phone_trigger.phoneLooks[owner]`), or null with no chat open.
 * A chat look overrides the default every chat starts with (`phoneModels[owner]`).
 * @returns {Record<string, PhoneSpec> | null}
 */
function chatLooks() {
    try {
        const ctx = getContext();
        if (!ctx?.chatMetadata || !ctx.getCurrentChatId?.()) {
            return null;
        }
        const meta = getMailStore();
        if (!meta.phoneLooks || typeof meta.phoneLooks !== 'object') {
            meta.phoneLooks = {};
        }
        return meta.phoneLooks;
    } catch {
        return null;
    }
}

/**
 * Where an owner's current look comes from.
 * @param {string} owner
 * @returns {'chat' | 'global' | 'none'} chat = this chat only; global = the default for every chat
 */
export function lookScope(owner) {
    if (chatLooks()?.[owner]) {
        return 'chat';
    }
    return models()[owner] ? 'global' : 'none';
}

/** @param {string} owner */
function savedLook(owner) {
    return chatLooks()?.[owner] || models()[owner] || null;
}

/**
 * Make the look on screen the default for every chat (this chat's own copy is dropped).
 * @param {string} owner
 * @param {string} [name]
 */
export function makeLookGlobal(owner, name = '') {
    const spec = getPhoneSpec(owner, name);
    models()[owner] = spec;
    const looks = chatLooks();
    if (looks?.[owner]) {
        delete looks[owner];
        void persistMailStore();
    }
    saveSettings();
}

/**
 * Saved spec for an owner (USER_OWNER or a character avatar key), validated on read:
 * this chat's look, else the default for every chat. The user falls back to the SG001;
 * characters to their deterministic phone.
 * @param {string} owner
 * @param {string} [name]
 * @returns {PhoneSpec}
 */
export function getPhoneSpec(owner, name = '') {
    const saved = savedLook(owner);
    if (owner === USER_OWNER) {
        return saved ? validateSpec(saved, { base: /** @type {PhoneSpec} */ (SG001_SPEC) }) : /** @type {PhoneSpec} */ (SG001_SPEC);
    }
    const spec = saved ? validateSpec(saved, { seedName: name || owner }) : fallbackSpec(name || owner);
    if (!saved || typeof saved.meter !== 'boolean') {
        spec.meter = false; // other people's phones don't show the divergence meter unless you turn it on
    }
    return spec;
}

/**
 * A freshly rolled or designed look takes the owner's default for owner-specific bits.
 * @param {string} owner
 * @param {PhoneSpec} spec
 */
export function applyOwnerDefaults(owner, spec) {
    return { ...spec, meter: owner === USER_OWNER };
}

// —— Wardrobe: saved designs and recent history ——

const MAX_SAVED = 30;
const MAX_RECENT = 10;

/** @param {string} owner */
function wardrobeOf(owner) {
    const s = getSettings();
    if (!s.phoneWardrobe || typeof s.phoneWardrobe !== 'object') {
        s.phoneWardrobe = {};
    }
    const w = s.phoneWardrobe[owner] && typeof s.phoneWardrobe[owner] === 'object' ? s.phoneWardrobe[owner] : { saved: [], recent: [] };
    w.saved = Array.isArray(w.saved) ? w.saved : [];
    w.recent = Array.isArray(w.recent) ? w.recent : [];
    s.phoneWardrobe[owner] = w;
    return w;
}

/** @param {any} spec */
function key(spec) {
    return JSON.stringify(spec);
}

/**
 * The owner's current look, or null when there is nothing worth keeping (an undesigned character).
 * @param {string} owner
 * @param {string} [name]
 */
function currentLook(owner, name = '') {
    if (!savedLook(owner) && owner !== USER_OWNER) {
        return null;
    }
    return getPhoneSpec(owner, name);
}

/**
 * Push the current look onto the Recent list before it gets replaced.
 * @param {string} owner
 * @param {string} [name]
 */
export function rememberCurrent(owner, name = '') {
    const cur = currentLook(owner, name);
    if (!cur) {
        return;
    }
    const w = wardrobeOf(owner);
    const k = key(cur);
    w.recent = w.recent.filter((e) => key(e.spec) !== k);
    w.recent.unshift({ id: `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, spec: cur, at: Date.now() });
    w.recent = w.recent.slice(0, MAX_RECENT);
    saveSettings();
}

/**
 * Save the current look under a name.
 * @param {string} owner
 * @param {string} [name] design name
 * @param {string} [ownerName]
 */
export function saveDesign(owner, name = '', ownerName = '') {
    const cur = getPhoneSpec(owner, ownerName);
    const w = wardrobeOf(owner);
    const label = text(name, 40) || `${cur.maker} ${cur.model}`.trim() || 'Design';
    w.saved.unshift({ id: `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, name: label, spec: cur, at: Date.now() });
    w.saved = w.saved.slice(0, MAX_SAVED);
    saveSettings();
    return label;
}

/**
 * @param {string} owner
 * @param {string} [ownerName]
 * @returns {{ saved: Array<{ id: string, name: string, spec: PhoneSpec, at: number }>, recent: Array<{ id: string, spec: PhoneSpec, at: number }> }}
 */
export function listWardrobe(owner, ownerName = '') {
    const w = wardrobeOf(owner);
    const fix = (e) => ({ ...e, spec: validateSpec(e.spec, { seedName: ownerName || owner }) });
    return { saved: w.saved.map(fix), recent: w.recent.map(fix) };
}

/**
 * Wear a saved or recent design (the current look goes to Recent first).
 * @param {string} owner
 * @param {string} id
 * @param {string} [ownerName]
 */
export function applyDesign(owner, id, ownerName = '') {
    const w = wardrobeOf(owner);
    const entry = w.saved.find((e) => e.id === id) || w.recent.find((e) => e.id === id);
    if (!entry) {
        return false;
    }
    const spec = validateSpec(entry.spec, { seedName: ownerName || owner });
    rememberCurrent(owner, ownerName);
    setPhoneSpec(owner, spec);
    return true;
}

/** @param {string} owner @param {string} id */
export function deleteDesign(owner, id) {
    const w = wardrobeOf(owner);
    w.saved = w.saved.filter((e) => e.id !== id);
    w.recent = w.recent.filter((e) => e.id !== id);
    saveSettings();
}

/** @param {string} owner @param {string} id @param {string} name */
export function renameDesign(owner, id, name) {
    const e = wardrobeOf(owner).saved.find((x) => x.id === id);
    if (e && text(name, 40)) {
        e.name = text(name, 40);
        saveSettings();
    }
}

/** @param {string} owner */
export function hasPhoneSpec(owner) {
    return Boolean(savedLook(owner));
}

/**
 * Change an owner's look. In a chat it changes for this chat only (the default stays for the
 * rest, until "Use in every chat"); with no chat open it changes the default.
 * @param {string} owner
 * @param {PhoneSpec | null} spec null = forget: this chat's look first (back to the default),
 *   else the default itself (user → SG001)
 * @param {{ scope?: 'chat' | 'global' }} [opts]
 */
export function setPhoneSpec(owner, spec, opts = {}) {
    const looks = chatLooks();
    const scope = opts.scope || (looks ? 'chat' : 'global');
    if (scope === 'chat' && looks) {
        if (spec) {
            looks[owner] = spec;
            void persistMailStore();
            return;
        }
        if (looks[owner]) {
            delete looks[owner];
            void persistMailStore();
            return;
        }
    }
    const all = models();
    if (spec) {
        all[owner] = spec;
    } else {
        delete all[owner];
    }
    saveSettings();
}

// —— Share codes ——
// A design travels as text: "PT1." + base64url(deflate(JSON)) + "." + checksum. Only the look
// is in it (no names, chat or settings), and an imported code is run through the same strict
// validation as everything else: only known values and #rrggbb colours survive, text is
// stripped of markup, and sizes are capped before and after decompressing.

const CODE_V1 = 'PT1';
const CODE_PLAIN = 'PT0';
const MAX_CODE_CHARS = 20000;
const MAX_JSON_BYTES = 64 * 1024;

/** @param {Uint8Array} bytes */
function toB64url(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
        bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** @param {string} s */
function fromB64url(s) {
    const b = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b + '='.repeat((4 - (b.length % 4)) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
        out[i] = bin.charCodeAt(i);
    }
    return out;
}

/** @param {string} s */
function checksum(s) {
    return (hashSeed(`pt-design:${s}`) >>> 0).toString(36).slice(-4).padStart(4, '0');
}

/**
 * Run bytes through a (de)compression stream, stopping past `limit` output bytes.
 * @param {Uint8Array} bytes
 * @param {CompressionStream | DecompressionStream} stream
 * @param {number} limit
 */
async function pipeBytes(bytes, stream, limit) {
    const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader();
    const parts = [];
    let size = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }
        size += value.length;
        if (size > limit) {
            await reader.cancel();
            throw new Error('That code is too large to be a phone design');
        }
        parts.push(value);
    }
    const out = new Uint8Array(size);
    let at = 0;
    for (const p of parts) {
        out.set(p, at);
        at += p.length;
    }
    return out;
}

/**
 * A share code for a design.
 * @param {PhoneSpec} spec
 * @returns {Promise<string>}
 */
export async function exportDesignCode(spec) {
    const clean = validateSpec(spec, { base: /** @type {PhoneSpec} */ (SG001_SPEC) });
    const json = new TextEncoder().encode(JSON.stringify(clean));
    let tag = CODE_PLAIN;
    let payload = json;
    if (typeof CompressionStream === 'function') {
        try {
            payload = await pipeBytes(json, new CompressionStream('deflate-raw'), MAX_JSON_BYTES);
            tag = CODE_V1;
        } catch {
            payload = json;
        }
    }
    const body = toB64url(payload);
    return `${tag}.${body}.${checksum(body)}`;
}

/**
 * Read a share code back into a valid design. Throws with a readable message.
 * @param {string} code
 * @returns {Promise<PhoneSpec>}
 */
export async function importDesignCode(code) {
    const raw = String(code || '').replace(/\s+/g, '');
    if (!raw) {
        throw new Error('Paste a design code first');
    }
    if (raw.length > MAX_CODE_CHARS) {
        throw new Error('That code is too long to be a phone design');
    }
    const m = /^(PT[01])\.([A-Za-z0-9_-]+)\.([0-9a-z]{4})$/.exec(raw);
    if (!m) {
        throw new Error('That is not a Phone Trigger design code');
    }
    const [, tag, body, sum] = m;
    if (checksum(body) !== sum) {
        throw new Error('That code is incomplete or was changed — copy it again');
    }
    let bytes;
    try {
        bytes = fromB64url(body);
    } catch {
        throw new Error('That code is damaged');
    }
    if (tag === CODE_V1) {
        if (typeof DecompressionStream !== 'function') {
            throw new Error('This browser cannot read compressed codes');
        }
        try {
            bytes = await pipeBytes(bytes, new DecompressionStream('deflate-raw'), MAX_JSON_BYTES);
        } catch (err) {
            throw new Error(/too large/.test(String(err?.message)) ? err.message : 'That code is damaged');
        }
    } else if (bytes.length > MAX_JSON_BYTES) {
        throw new Error('That code is too large to be a phone design');
    }
    let data;
    try {
        data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch {
        throw new Error('That code is damaged');
    }
    if (!data || typeof data !== 'object' || Array.isArray(data) || data.v !== 2) {
        throw new Error('That code does not hold a phone design');
    }
    return validateSpec(data, { base: /** @type {PhoneSpec} */ (SG001_SPEC) });
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
 * Ask the model to design a phone that suits its owner. It picks a style pack and overrides
 * what it wants; everything else is rolled from that pack, then validated.
 * @param {string} owner
 * @param {{ hint?: string, style?: string }} [opts] style = a pack id to force, FREEFORM for no style, '' = model picks
 * @returns {Promise<{ spec: PhoneSpec, fromModel: boolean }>}
 */
export async function generatePhoneSpec(owner, opts = {}) {
    const { name, card } = describeOwner(owner);
    const summary = buildChatSummary(10);
    const free = opts.style === FREEFORM;
    const forced = STYLE_IDS.includes(String(opts.style || '')) ? String(opts.style) : '';
    const styleLine = free
        ? 'Design it freely from scratch — you are not limited to any named style or subculture. Choose every colour, print, finish, key style, charm and sticker yourself so the phone is unmistakably theirs.'
        : forced
            ? `Use the style "${forced}".`
            : `Style packs (pick the one that fits best, or "custom" if none fits and design it freely):\n${STYLE_PACKS.map((p) => `- ${p.id}: ${p.name} — ${p.vibe}`).join('\n')}`;
    const prompt = [
        `Design the mobile phone that ${name} carries, as it would exist around 2010 (Japanese keitai era, early smartphones).`,
        'Match it to their personality, age, taste, money, job and fashion subculture. A tidy salaryman, a scene kid and a jirai-kei girl should own wildly different phones, decorated the way real 2010 owners decorated them.',
        card ? `About ${name}:\n${card}` : '',
        summary ? `Recent story (for flavour only):\n${summary}` : '',
        opts.hint ? `Extra request: ${String(opts.hint).slice(0, 300)}` : '',
        styleLine,
        '',
        free
            ? 'Reply with ONLY a JSON object. Fill in as much as you can; anything omitted falls back to plain defaults.'
            : 'Reply with ONLY a JSON object. Required: "aesthetic". Everything else is optional — omitted fields are filled in from the style.',
        '{',
        free ? '' : `  "aesthetic": one of ${JSON.stringify([...STYLE_IDS, 'custom'])},`,
        '  "maker": "fictional brand, max 20 chars", "model": "max 20 chars",',
        `  "body": one of ${JSON.stringify(BODIES)},`,
        '  "colors": { "shell": "#rrggbb", "panel": "#rrggbb", "keys": "#rrggbb", "keyPrint": "#rrggbb", "accent": "#rrggbb" },',
        `  "finish": one of ${JSON.stringify(FINISHES)},`,
        `  "pattern": { "kind": one of ${JSON.stringify(PATTERN_KINDS)}, "a": "#rrggbb", "b": "#rrggbb", "on": one of ${JSON.stringify(PATTERN_ON)} },`,
        `  "keys": { "style": one of ${JSON.stringify(KEY_STYLES)}, "glow": true|false },`,
        `  "deco": { "rhinestones": one of ${JSON.stringify(RHINESTONES)}, "gem": "#rrggbb", "pearls": bool, "studs": bool },`,
        `  "cover": { "art": one of ${JSON.stringify(COVER_ARTS)}, "color": "#rrggbb" },`,
        `  "outer": { "shape": one of ${JSON.stringify(OUTER_SHAPES)} },`,
        `  "lcd": { "bg": "#rrggbb", "fg": "#rrggbb", "accent": "#rrggbb", "font": one of ${JSON.stringify(LCD_FONTS)}, "ui": one of ${JSON.stringify(LCD_UIS)} },`,
        `  "charms": up to 3 of { "kind": one of ${JSON.stringify(CHARM_KINDS.filter((k) => k !== 'none'))}, "color": "#rrggbb" },`,
        `  "stickers": up to 16 of { "kind": one of ${JSON.stringify(STICKER_KINDS)}, "color": "#rrggbb", "color2": "#rrggbb", "side": "cover"|"front"|"base", "x": 0-100, "y": 0-100, "rot": -45..45, "scale": 0.6-1.8 },`,
        '  "blurb": "one sentence on why this phone suits them"',
        '}',
        'Stickers on "cover" go anywhere on the outside of the lid; "front" ones must stay near the edges around the screen.',
    ].filter((l) => l !== '').join('\n');
    const seed = hashSeed(`${name}:${Date.now()}:${Math.random()}`);
    try {
        const raw = String(await generateMailText(prompt) || '');
        const json = extractJson(raw);
        if (json) {
            // Freeform / "custom": only a plain base fills gaps, so no themed pack overrides the model.
            const custom = free || (!forced && String(json.aesthetic) === 'custom');
            const pack = custom ? 'plain' : forced || (STYLE_IDS.includes(String(json.aesthetic)) ? String(json.aesthetic) : STYLE_IDS[seed % STYLE_IDS.length]);
            const rolled = normalize(rollStyle(pack, seed, { body: BODIES.includes(json.body) ? json.body : undefined }), /** @type {PhoneSpec} */ (SG001_SPEC));
            if (custom) {
                rolled.stickers = [];
                rolled.charms = [];
            }
            const merged = { ...json, aesthetic: custom ? 'custom' : pack };
            if (!custom && (!Array.isArray(json.stickers) || !json.stickers.length)) {
                delete merged.stickers;
            }
            if (!Array.isArray(json.charms)) {
                delete merged.charms;
            }
            return { spec: applyOwnerDefaults(owner, normalize(merged, rolled)), fromModel: true };
        }
    } catch (err) {
        console.warn('[Phone Trigger] phone design failed', err);
    }
    return { spec: applyOwnerDefaults(owner, forced ? rollPhone(forced) : fallbackSpec(`${name}:${seed}`)), fromModel: false };
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
