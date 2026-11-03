/**
 * Chassis styling: turn a validated PhoneSpec into CSS variables, data attributes and
 * decorations on the shared handset markup (lib/phone.js buildPhoneInnerHtml).
 * The SG001 gets no overrides at all, so it renders exactly as it always has.
 */
import { shade, luminance, isSG001 } from './phoneSpec.js';
import { WALLPAPERS } from './constants.js';

/** @typedef {import('./phoneSpec.js').PhoneSpec} PhoneSpec */

/** @param {unknown} s */
function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Inline `style` for `.pp-phone` (empty for the SG001).
 * @param {PhoneSpec} spec
 */
export function chassisStyle(spec) {
    if (isSG001(spec)) {
        return '';
    }
    const c = spec.colors;
    const l = spec.lcd;
    const lightKeys = luminance(c.keys) > 0.35;
    /** @type {Record<string, string>} */
    const v = {
        '--pp-red': c.shell,
        '--pp-red-deep': c.shellDeep,
        '--pp-red-bright': shade(c.shell, 0.16),
        '--pp-red-edge': c.shellEdge,
        '--pp-truss': shade(c.shellEdge, -0.4),
        '--pp-panel': c.panel,
        '--pp-panel-dark': shade(c.panel, -0.22),
        '--pp-chin': shade(c.panel, 0.1),
        '--pp-gun': shade(c.panel, -0.08),
        '--pp-gun-light': shade(c.panel, 0.14),
        '--pp-gun-dark': shade(c.panel, -0.42),
        '--pp-deck': lightKeys ? shade(c.keys, -0.12) : shade(c.keys, 0.06),
        '--pp-deck-lo': lightKeys ? shade(c.keys, -0.22) : shade(c.keys, -0.3),
        '--pp-key-face': c.keys,
        '--pp-key-hi': shade(c.keys, lightKeys ? 0.3 : 0.14),
        '--pp-key-lo': shade(c.keys, lightKeys ? -0.12 : -0.45),
        '--pp-key-rim': shade(c.keys, lightKeys ? -0.3 : 0.32),
        '--pp-key-print': c.keyPrint,
        '--pp-ear-a': shade(c.shell, -0.18),
        '--pp-ear-b': shade(c.shell, 0.1),
        '--pp-cam-ring': shade(c.shell, -0.28),
        '--pp-lcd-bg': l.bg,
        '--pp-lcd-fg': l.fg,
        '--pp-lcd-dim': shade(l.fg, luminance(l.fg) > 0.5 ? -0.42 : 0.42),
        '--pp-accent': l.accent,
        '--pp-status-bg': shade(l.bg, -0.5),
        '--pp-soft-a': shade(l.bg, 0.06),
        '--pp-brand-ink': luminance(c.shell) > 0.4 ? shade(c.shell, -0.65) : shade(c.shell, 0.7),
        '--pp-charm': spec.charm.color,
    };
    return Object.entries(v).map(([k, val]) => `${k}:${val}`).join(';');
}

/**
 * Data attributes for `.pp-phone` (empty for the SG001).
 * @param {PhoneSpec} spec
 */
export function chassisAttrs(spec) {
    if (isSG001(spec)) {
        return 'data-body="flip"';
    }
    return `data-body="${spec.body}" data-finish="${spec.finish}" data-font="${spec.lcd.font}" data-custom="1"`;
}

/** @param {PhoneSpec} spec */
export function brandHtml(spec) {
    if (isSG001(spec) || !(spec.maker || spec.model)) {
        return '';
    }
    return `<span class="pp-brand" aria-hidden="true">${esc(spec.maker || spec.model)}</span>`;
}

const STICKER_PATHS = {
    star: 'M12 2l3 6.5 7 .8-5.2 4.8 1.4 7L12 17.6 5.8 21.1l1.4-7L2 9.3l7-.8z',
    heart: 'M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z',
    skull: 'M12 3c-4.4 0-8 3.2-8 7.4 0 2.4 1.2 4.4 3 5.6V19h2v2h2v-2h2v2h2v-2h2v-3c1.8-1.2 3-3.2 3-5.6C20 6.2 16.4 3 12 3zm-3 9.5a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6zm6 0a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6z',
    cat: 'M4 3l4 4h8l4-4v9c0 5-3.6 9-8 9s-8-4-8-9zm5 9a1.3 1.3 0 1 0 0 2.6A1.3 1.3 0 0 0 9 12zm6 0a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6z',
    bolt: 'M13 2L4 14h6l-1 8 9-12h-6z',
    flower: 'M12 8a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm0 14a3 3 0 1 1 0-6 3 3 0 0 1 0 6zM5 15a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm14 0a3 3 0 1 1 0-6 3 3 0 0 1 0 6zm-7-.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z',
};

/**
 * Stickers for one region of the body.
 * @param {PhoneSpec} spec
 * @param {'lid' | 'base'} region
 */
export function stickersHtml(spec, region) {
    if (isSG001(spec)) {
        return '';
    }
    return spec.stickers
        .filter((s) => (region === 'lid' ? s.at.startsWith('lid') : s.at.startsWith('base')))
        .map((s) => `<svg class="pp-sticker pp-sticker-${s.at}" viewBox="0 0 24 24" aria-hidden="true"><path d="${STICKER_PATHS[s.kind] || STICKER_PATHS.star}" fill="${s.color}" /></svg>`)
        .join('');
}

/**
 * Strap charm hanging off the body.
 * @param {PhoneSpec} spec
 */
export function charmHtml(spec) {
    if (isSG001(spec) || spec.charm.kind === 'none') {
        return '';
    }
    const k = spec.charm.kind;
    const ornament = {
        strap: '<rect x="7" y="6" width="10" height="22" rx="3" />',
        plush: '<circle cx="12" cy="18" r="8" /><circle cx="6" cy="10" r="3.4" /><circle cx="18" cy="10" r="3.4" /><circle cx="9.3" cy="17" r="1.1" class="pp-charm-ink" /><circle cx="14.7" cy="17" r="1.1" class="pp-charm-ink" />',
        bell: '<path d="M12 8c-4 0-6 3-6 8v4h12v-4c0-5-2-8-6-8z" /><circle cx="12" cy="23" r="2" />',
        beads: '<circle cx="12" cy="9" r="3" /><circle cx="12" cy="16" r="3.4" /><circle cx="12" cy="23.5" r="3.8" />',
        keychain: '<circle cx="12" cy="10" r="4" fill="none" stroke-width="2" class="pp-charm-ring" /><rect x="8" y="14" width="8" height="12" rx="2" />',
    }[k] || '';
    const label = spec.charm.label ? `<span class="pp-charm-label">${esc(spec.charm.label)}</span>` : '';
    return `
        <div class="pp-charm pp-charm-${k}" aria-hidden="true">
            <span class="pp-charm-cord"></span>
            <svg class="pp-charm-ornament" viewBox="0 0 24 30">${ornament}</svg>
            ${label}
        </div>
    `;
}

/**
 * Home-screen wallpaper for a spec.
 * @param {PhoneSpec} spec
 */
export function specWallpaperCss(spec) {
    const w = spec.wallpaper;
    if (w.kind === 'preset') {
        const preset = WALLPAPERS.find((p) => p.id === w.preset) || WALLPAPERS[0];
        return preset.css;
    }
    if (w.kind === 'gradient') {
        return `linear-gradient(${w.angle}deg, ${w.a}, ${w.b})`;
    }
    const patterns = {
        dots: `radial-gradient(circle, ${w.b} 1.4px, transparent 1.6px) 0 0 / 12px 12px, ${w.a}`,
        stripes: `repeating-linear-gradient(${w.angle}deg, ${w.a} 0 9px, ${w.b} 9px 14px)`,
        grid: `linear-gradient(${w.b} 1px, transparent 1px) 0 0 / 14px 14px, linear-gradient(90deg, ${w.b} 1px, transparent 1px) 0 0 / 14px 14px, ${w.a}`,
        hearts: `radial-gradient(circle at 35% 40%, ${w.b} 2px, transparent 2.5px) 0 0 / 16px 16px, radial-gradient(circle at 65% 40%, ${w.b} 2px, transparent 2.5px) 0 0 / 16px 16px, ${w.a}`,
        stars: `radial-gradient(circle, ${w.b} 1px, transparent 1.5px) 0 0 / 23px 23px, radial-gradient(circle, ${w.b} 0.8px, transparent 1.2px) 7px 11px / 17px 17px, ${w.a}`,
    };
    return patterns[w.pattern] || w.a;
}

/**
 * Small standalone SVG drawing of a spec, for menus and pickers (no shared IDs with the real handset).
 * @param {PhoneSpec} spec
 * @param {string} [uid] unique suffix for gradient ids
 */
export function previewSvg(spec, uid = Math.random().toString(36).slice(2, 8)) {
    const c = spec.colors;
    const l = spec.lcd;
    const sheen = {
        gloss: '<stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".15"/>',
        matte: '<stop offset="0" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#000" stop-opacity=".1"/>',
        metallic: '<stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".3" stop-color="#fff" stop-opacity="0"/><stop offset=".6" stop-color="#fff" stop-opacity=".15"/><stop offset="1" stop-color="#000" stop-opacity=".25"/>',
        pearl: '<stop offset="0" stop-color="#ffc8f0" stop-opacity=".35"/><stop offset=".5" stop-color="#c8f0ff" stop-opacity=".3"/><stop offset="1" stop-color="#fffad2" stop-opacity=".3"/>',
    }[spec.finish];
    const wall = spec.wallpaper.kind === 'preset' ? l.bg : spec.wallpaper.a;
    const wall2 = spec.wallpaper.kind === 'preset' ? shade(l.bg, 0.25) : spec.wallpaper.b;
    const keys = (x, y, w, h) => {
        const out = [];
        for (let r = 0; r < 4; r++) {
            for (let k = 0; k < 3; k++) {
                out.push(`<rect x="${x + k * (w / 3) + 1.5}" y="${y + r * (h / 4) + 1.5}" width="${w / 3 - 3}" height="${h / 4 - 3}" rx="2" fill="${c.keys}" stroke="${shade(c.keys, luminance(c.keys) > 0.35 ? -0.3 : 0.3)}" stroke-width=".6"/>`);
            }
        }
        return out.join('');
    };
    const screen = (x, y, w, h) => `
        <rect x="${x - 2}" y="${y - 2}" width="${w + 4}" height="${h + 4}" rx="2" fill="${c.panel}"/>
        <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#pw${uid})"/>
        <rect x="${x}" y="${y}" width="${w}" height="4" fill="${shade(l.bg, -0.5)}"/>
        <rect x="${x + 4}" y="${y + h * 0.5}" width="${w * 0.5}" height="2" fill="${l.fg}" opacity=".7"/>
        <rect x="${x + 4}" y="${y + h * 0.5 + 5}" width="${w * 0.35}" height="2" fill="${l.accent}" opacity=".8"/>`;
    let body = '';
    const W = 60;
    if (spec.body === 'flip') {
        body = `
            ${spec.crown === 'truss' ? `<path d="M6 10 V4 Q6 1 9 1 H51 Q54 1 54 4 V10 H50 V5 H10 V10Z" fill="${shade(c.shellEdge, -0.4)}"/>` : ''}
            <rect x="4" y="9" width="${W - 8}" height="54" rx="6" fill="${c.shell}" stroke="${c.shellEdge}"/>
            ${screen(9, 17, W - 18, 36)}
            <rect x="2" y="63" width="${W - 4}" height="7" rx="2" fill="${shade(c.panel, -0.1)}"/>
            <rect x="4" y="70" width="${W - 8}" height="56" rx="6" fill="${c.shellDeep}" stroke="${c.shellEdge}"/>
            ${keys(10, 86, W - 20, 36)}
            <rect x="4" y="9" width="${W - 8}" height="54" rx="6" fill="url(#ps${uid})"/>
            <rect x="4" y="70" width="${W - 8}" height="56" rx="6" fill="url(#ps${uid})"/>`;
    } else if (spec.body === 'touch') {
        body = `
            <rect x="5" y="6" width="${W - 10}" height="118" rx="10" fill="${c.shell}" stroke="${c.shellEdge}"/>
            ${screen(9, 18, W - 18, 88)}
            <circle cx="${W / 2}" cy="115" r="4.5" fill="${c.panel}" stroke="${shade(c.panel, -0.4)}"/>
            <rect x="5" y="6" width="${W - 10}" height="118" rx="10" fill="url(#ps${uid})"/>`;
    } else {
        const seam = spec.body === 'slider' ? `<rect x="5" y="66" width="${W - 10}" height="3" fill="${shade(c.shell, -0.45)}" opacity=".7"/>` : '';
        body = `
            <rect x="5" y="4" width="${W - 10}" height="122" rx="9" fill="${c.shell}" stroke="${c.shellEdge}"/>
            ${screen(10, 14, W - 20, 44)}
            ${seam}
            <rect x="10" y="72" width="${W - 20}" height="6" rx="2" fill="${c.keys}"/>
            ${keys(10, 82, W - 20, 38)}
            <rect x="5" y="4" width="${W - 10}" height="122" rx="9" fill="url(#ps${uid})"/>`;
    }
    const charm = spec.charm.kind !== 'none'
        ? `<line x1="${W - 6}" y1="110" x2="${W + 2}" y2="122" stroke="#000" stroke-opacity=".6"/><circle cx="${W + 3}" cy="125" r="4" fill="${spec.charm.color}"/>`
        : '';
    return `
        <svg class="pp-phone-preview" viewBox="-2 -2 ${W + 12} 136" role="img" aria-label="${esc(`${spec.maker} ${spec.model}`.trim() || 'Phone')}">
            <defs>
                <linearGradient id="ps${uid}" x1="0" y1="0" x2="1" y2="1">${sheen}</linearGradient>
                <linearGradient id="pw${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${wall}"/><stop offset="1" stop-color="${wall2}"/></linearGradient>
            </defs>
            ${body}
            ${charm}
        </svg>
    `;
}
