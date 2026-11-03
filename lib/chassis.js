/**
 * Chassis styling: turn a validated PhoneSpec into CSS variables, data attributes and
 * decorations on the shared handset markup (lib/phone.js buildPhoneInnerHtml).
 * The SG001 gets no overrides at all, so its open face renders exactly as it always has.
 *
 * Every colour and kind here has been through validateSpec; numbers are clamped there too.
 */
import { shade, luminance, isSG001 } from './phoneSpec.js';
import { WALLPAPERS } from './constants.js';
import { stickerSvg, stickerInner, charmInner, patternCss, patternDef, coverArtSvg, coverArtInner } from './stickers.js';

/** @typedef {import('./phoneSpec.js').PhoneSpec} PhoneSpec */

/** @param {unknown} s */
function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Sticker size: this fraction of the phone width at scale 1. */
const STICKER_W = 0.13;

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
    const pat = patternCss(spec.pattern) || 'none';
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
        '--pp-gem': spec.deco.gem,
        '--pp-outer': spec.outer.tint,
        '--pp-pattern-shell': spec.pattern.on === 'cover' ? 'none' : pat,
        '--pp-pattern-cover': spec.pattern.on === 'shell' ? 'none' : pat,
        '--pp-cover-art': spec.cover.color,
    };
    return Object.entries(v).map(([k, val]) => `${k}:${val}`).join(';');
}

/**
 * Data attributes for `.pp-phone`.
 * @param {PhoneSpec} spec
 */
export function chassisAttrs(spec) {
    if (isSG001(spec)) {
        return 'data-body="flip"';
    }
    const d = spec.deco;
    return [
        `data-body="${spec.body}"`,
        `data-finish="${spec.finish}"`,
        `data-font="${spec.lcd.font}"`,
        `data-ui="${spec.lcd.ui}"`,
        `data-keys="${spec.keys.style}"`,
        spec.keys.glow ? 'data-glow="1"' : '',
        spec.crown === 'truss' ? 'data-crown="truss"' : '',
        d.rhinestones === 'border' ? 'data-gems="border"' : '',
        d.pearls ? 'data-pearls="1"' : '',
        d.studs ? 'data-studs="1"' : '',
        'data-custom="1"',
    ].filter(Boolean).join(' ');
}

/** @param {PhoneSpec} spec */
export function brandHtml(spec) {
    if (isSG001(spec) || !(spec.maker || spec.model)) {
        return '';
    }
    return `<span class="pp-brand" aria-hidden="true">${esc(spec.maker || spec.model)}</span>`;
}

/**
 * Stickers on one surface.
 * @param {PhoneSpec} spec
 * @param {'front' | 'base' | 'cover' | 'back'} side
 */
export function stickersHtml(spec, side) {
    if (isSG001(spec)) {
        return '';
    }
    return spec.stickers
        .filter((s) => s.side === side)
        .map((s) => stickerSvg(s, `class="pp-sticker" style="left:${s.x}%;top:${s.y}%;width:calc(var(--pp-phone-w) * ${(STICKER_W * s.scale).toFixed(3)});transform:translate(-50%,-50%) rotate(${s.rot}deg)"`))
        .join('');
}

/** @param {string} s */
function seedOf(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/**
 * Rhinestone heart / initial / scatter for a surface (borders are pure CSS).
 * @param {PhoneSpec} spec
 * @param {'front' | 'cover' | 'back'} surface
 */
export function decoHtml(spec, surface) {
    if (isSG001(spec)) {
        return '';
    }
    const d = spec.deco;
    const gem = d.gem;
    const dots = 'stroke-dasharray="0.1 5" stroke-linecap="round" fill="none"';
    if (d.rhinestones === 'heart' && surface !== 'front') {
        return `<svg class="pp-deco pp-deco-center" viewBox="0 0 100 100" aria-hidden="true"><path d="M50 86S14 63 14 37a18 18 0 0 1 36-9 18 18 0 0 1 36 9c0 26-36 49-36 49z" stroke="${gem}" stroke-width="4.2" ${dots}/></svg>`;
    }
    if (d.rhinestones === 'initial' && surface !== 'front') {
        const letter = (String(spec.maker || spec.model).match(/[A-Za-z0-9]/) || ['A'])[0].toUpperCase();
        return `<svg class="pp-deco pp-deco-center" viewBox="0 0 100 100" aria-hidden="true"><text x="50" y="74" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="76" stroke="${gem}" stroke-width="4" ${dots}>${letter}</text></svg>`;
    }
    if (d.rhinestones === 'scatter') {
        let s = seedOf(`${spec.model}:${surface}`);
        const rnd = () => {
            s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
            return s / 4294967296;
        };
        const n = surface === 'front' ? 10 : 22;
        // Separate round gems (an SVG stretched to the surface would squash them into ovals).
        return Array.from({ length: n }, () => {
            const edge = surface === 'front';
            const x = edge ? (rnd() < 0.5 ? 2 + rnd() * 5 : 93 + rnd() * 5) : 6 + rnd() * 88;
            const y = edge ? 4 + rnd() * 92 : 6 + rnd() * 88;
            const size = (0.018 + rnd() * 0.022).toFixed(3);
            return `<span class="pp-gem" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;width:calc(var(--pp-phone-w) * ${size})"></span>`;
        }).join('');
    }
    return '';
}

/**
 * Charms hanging off the strap hole.
 * @param {PhoneSpec} spec
 */
export function charmHtml(spec) {
    if (isSG001(spec) || !spec.charms.length) {
        return '';
    }
    return spec.charms.map((ch, i) => {
        const label = ch.label ? `<span class="pp-charm-label">${esc(ch.label)}</span>` : '';
        return `
            <div class="pp-charm pp-charm-${i}" style="--pp-charm:${ch.color}" aria-hidden="true">
                <span class="pp-charm-cord"></span>
                <svg class="pp-charm-ornament" viewBox="-1 -1 26 32">${charmInner(ch.kind, ch.color, shade(ch.color, luminance(ch.color) > 0.5 ? -0.35 : 0.45))}</svg>
                ${label}
            </div>
        `;
    }).join('');
}

/**
 * The outside of a flip lid: print, deco, stickers and the outer display.
 * (The SG001 gets just the outer display.)
 * @param {PhoneSpec} spec
 */
export function coverHtml(spec) {
    const outer = spec.outer.shape === 'none' ? '' : `
        <div class="pp-outer pp-outer-${spec.outer.shape}">
            <span class="pp-outer-clock" data-outer="clock">--:--</span>
            <span class="pp-outer-info" data-outer="info"></span>
        </div>`;
    if (isSG001(spec)) {
        return outer;
    }
    return `
        ${spec.cover.art !== 'none' ? coverArtSvg(spec.cover.art, spec.cover.color) : ''}
        ${decoHtml(spec, 'cover')}
        ${outer}
        ${stickersHtml(spec, 'cover')}
    `;
}

/**
 * The back of a candybar, slider or touchscreen phone.
 * @param {PhoneSpec} spec
 */
export function backHtml(spec) {
    return `
        <div class="pp-back" aria-hidden="true">
            <span class="pp-back-cam"></span>
            ${spec.cover.art !== 'none' ? coverArtSvg(spec.cover.art, spec.cover.color) : ''}
            ${decoHtml(spec, 'back')}
            ${spec.maker ? `<span class="pp-back-brand">${esc(spec.maker)}</span>` : ''}
            ${stickersHtml(spec, 'back')}
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
    const legacy = {
        dots: `radial-gradient(circle, ${w.b} 1.4px, transparent 1.6px) 0 0 / 12px 12px, ${w.a}`,
        grid: `linear-gradient(${w.b} 1px, transparent 1px) 0 0 / 14px 14px, linear-gradient(90deg, ${w.b} 1px, transparent 1px) 0 0 / 14px 14px, ${w.a}`,
    };
    if (legacy[w.pattern]) {
        return legacy[w.pattern];
    }
    // Wallpapers stay dark-ish behind text: tone the pattern down towards the base colour.
    const css = patternCss({ kind: w.pattern, a: w.a, b: shade(w.b, luminance(w.a) < 0.2 ? -0.35 : 0), scale: 1.1 });
    return css ? `${css}, ${w.a}` : w.a;
}

// —— Previews ——

/**
 * Stickers for one surface inside a preview SVG.
 * @param {PhoneSpec} spec
 * @param {string} side
 * @param {[number, number, number, number]} box x, y, w, h of the surface
 * @param {number} phoneW phone width in preview units
 */
function previewStickers(spec, side, box, phoneW) {
    const [bx, by, bw, bh] = box;
    const unit = (phoneW * STICKER_W) / 26;
    return spec.stickers.filter((s) => s.side === side).map((s) => {
        const x = bx + (s.x / 100) * bw;
        const y = by + (s.y / 100) * bh;
        return `<g transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${s.rot}) scale(${(unit * s.scale).toFixed(3)})"><g transform="translate(-12 -12)">${stickerInner(s.kind, s.color, s.color2)}</g></g>`;
    }).join('');
}

/**
 * Small standalone SVG drawing of a spec — front and cover/back side by side.
 * @param {PhoneSpec} spec
 * @param {{ uid?: string, view?: 'both' | 'front' | 'cover' }} [opts]
 */
export function previewSvg(spec, opts = {}) {
    const uid = typeof opts === 'string' ? opts : (opts.uid || Math.random().toString(36).slice(2, 8));
    const view = (typeof opts === 'object' && opts.view) || 'both';
    const c = spec.colors;
    const l = spec.lcd;
    const sheen = {
        gloss: '<stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".15"/>',
        matte: '<stop offset="0" stop-color="#fff" stop-opacity=".06"/><stop offset="1" stop-color="#000" stop-opacity=".1"/>',
        metallic: '<stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".3" stop-color="#fff" stop-opacity="0"/><stop offset=".6" stop-color="#fff" stop-opacity=".15"/><stop offset="1" stop-color="#000" stop-opacity=".25"/>',
        chrome: '<stop offset="0" stop-color="#fff" stop-opacity=".6"/><stop offset=".35" stop-color="#000" stop-opacity=".15"/><stop offset=".55" stop-color="#fff" stop-opacity=".45"/><stop offset="1" stop-color="#000" stop-opacity=".3"/>',
        pearl: '<stop offset="0" stop-color="#ffc8f0" stop-opacity=".35"/><stop offset=".5" stop-color="#c8f0ff" stop-opacity=".3"/><stop offset="1" stop-color="#fffad2" stop-opacity=".3"/>',
        holo: '<stop offset="0" stop-color="#ffb3e6" stop-opacity=".45"/><stop offset=".35" stop-color="#b3f0ff" stop-opacity=".4"/><stop offset=".65" stop-color="#fff6b3" stop-opacity=".4"/><stop offset="1" stop-color="#c9b3ff" stop-opacity=".45"/>',
        glitter: '<stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".5" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-color="#fff" stop-opacity=".35"/>',
        candy: '<stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".3" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#fff" stop-opacity=".25"/>',
        rubber: '<stop offset="0" stop-color="#000" stop-opacity=".05"/><stop offset="1" stop-color="#000" stop-opacity=".2"/>',
        velvet: '<stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset=".5" stop-color="#000" stop-opacity=".1"/><stop offset="1" stop-color="#fff" stop-opacity=".08"/>',
    }[spec.finish] || '';
    const custom = !isSG001(spec);
    const shellPat = custom && spec.pattern.kind !== 'solid' && spec.pattern.on !== 'cover';
    const coverPat = custom && spec.pattern.kind !== 'solid' && spec.pattern.on !== 'shell';
    const patDef = patternDef(`pp${uid}`, spec.pattern, 7);
    const shellFill = shellPat ? `url(#pp${uid})` : c.shell;
    const coverFill = coverPat ? `url(#pp${uid})` : c.shellDeep;
    const wall = spec.wallpaper.kind === 'preset' ? l.bg : spec.wallpaper.a;
    const wall2 = spec.wallpaper.kind === 'preset' ? shade(l.bg, 0.25) : spec.wallpaper.b;
    const keyFill = (r, k) => (spec.keys.style === 'rainbow' ? ['#ff5a6e', '#ffb340', '#ffe55c', '#5ad67d', '#5aa8ff', '#b06bff'][(r * 3 + k) % 6]
        : spec.keys.style === 'metal' ? '#c4cad2'
            : spec.keys.style === 'pearl' ? '#f6eef4' : c.keys);
    const keys = (x, y, w, h) => {
        const out = [];
        for (let r = 0; r < 4; r++) {
            for (let k = 0; k < 3; k++) {
                out.push(`<rect x="${x + k * (w / 3) + 1.5}" y="${y + r * (h / 4) + 1.5}" width="${w / 3 - 3}" height="${h / 4 - 3}" rx="${spec.keys.style === 'candy' ? 3 : 2}" fill="${keyFill(r, k)}" stroke="${spec.keys.style === 'neon' ? l.accent : shade(c.keys, luminance(c.keys) > 0.35 ? -0.3 : 0.3)}" stroke-width=".6"/>`);
            }
        }
        return out.join('');
    };
    const screen = (x, y, w, h, panel = c.panel) => `
        <rect x="${x - 2}" y="${y - 2}" width="${w + 4}" height="${h + 4}" rx="2" fill="${panel}"/>
        <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#pw${uid})"/>
        <rect x="${x}" y="${y}" width="${w}" height="4" fill="${shade(l.bg, -0.5)}"/>
        <rect x="${x + 4}" y="${y + h * 0.5}" width="${w * 0.5}" height="2" fill="${l.fg}" opacity=".7"/>
        <rect x="${x + 4}" y="${y + h * 0.5 + 5}" width="${w * 0.35}" height="2" fill="${l.accent}" opacity=".8"/>`;
    const gemBorder = (x, y, w, h, rx) => (custom && (spec.deco.rhinestones === 'border' || spec.deco.pearls || spec.deco.studs)
        ? `<rect x="${x + 1.6}" y="${y + 1.6}" width="${w - 3.2}" height="${h - 3.2}" rx="${rx}" fill="none" stroke="${spec.deco.pearls ? '#fbf6ee' : spec.deco.studs ? '#c8ccd2' : spec.deco.gem}" stroke-width="1.6" stroke-dasharray="0.1 2.6" stroke-linecap="round"/>`
        : '');
    const W = 60;
    let front = '';
    if (spec.body === 'flip') {
        front = `
            ${spec.crown === 'truss' ? `<path d="M6 10 V4 Q6 1 9 1 H51 Q54 1 54 4 V10 H50 V5 H10 V10Z" fill="${shade(c.shellEdge, -0.4)}"/>` : ''}
            <rect x="4" y="9" width="${W - 8}" height="54" rx="6" fill="${shellFill}" stroke="${c.shellEdge}"/>
            ${screen(9, 17, W - 18, 36)}
            <rect x="2" y="63" width="${W - 4}" height="7" rx="2" fill="${shade(c.panel, -0.1)}"/>
            <rect x="4" y="70" width="${W - 8}" height="56" rx="6" fill="${shellFill}" stroke="${c.shellEdge}"/>
            ${keys(10, 86, W - 20, 36)}
            <rect x="4" y="9" width="${W - 8}" height="54" rx="6" fill="url(#ps${uid})"/>
            <rect x="4" y="70" width="${W - 8}" height="56" rx="6" fill="url(#ps${uid})"/>
            ${gemBorder(4, 9, W - 8, 54, 5)}
            ${previewStickers(spec, 'front', [4, 9, W - 8, 54], W)}
            ${previewStickers(spec, 'base', [4, 70, W - 8, 56], W)}`;
    } else if (spec.body === 'touch') {
        front = `
            <rect x="5" y="6" width="${W - 10}" height="118" rx="10" fill="${shellFill}" stroke="${c.shellEdge}"/>
            ${screen(9, 18, W - 18, 88)}
            <circle cx="${W / 2}" cy="115" r="4.5" fill="${c.panel}" stroke="${shade(c.panel, -0.4)}"/>
            <rect x="5" y="6" width="${W - 10}" height="118" rx="10" fill="url(#ps${uid})"/>
            ${gemBorder(5, 6, W - 10, 118, 9)}
            ${previewStickers(spec, 'front', [5, 6, W - 10, 118], W)}`;
    } else {
        // Round D-pad flanked by soft keys and green / red call keys
        const dpad = (y) => `
            <rect x="9" y="${y}" width="10" height="4.5" rx="2.2" fill="${keyFill(0, 0)}"/>
            <rect x="${W - 19}" y="${y}" width="10" height="4.5" rx="2.2" fill="${keyFill(0, 2)}"/>
            <rect x="9" y="${y + 8}" width="10" height="6" rx="3" fill="${keyFill(1, 0)}"/>
            <rect x="${W - 19}" y="${y + 8}" width="10" height="6" rx="3" fill="${keyFill(1, 2)}"/>
            <rect x="12" y="${y + 10.2}" width="4" height="1.6" rx=".8" fill="#2fb455"/>
            <rect x="${W - 16}" y="${y + 10.2}" width="4" height="1.6" rx=".8" fill="#e0393e"/>
            <circle cx="${W / 2}" cy="${y + 7}" r="8.2" fill="${keyFill(0, 1)}" stroke="${shade(c.keys, luminance(c.keys) > 0.35 ? -0.3 : 0.3)}" stroke-width=".6"/>
            <circle cx="${W / 2}" cy="${y + 7}" r="3.2" fill="${shade(c.keys, luminance(c.keys) > 0.35 ? -0.12 : 0.12)}" stroke="${shade(c.keys, luminance(c.keys) > 0.35 ? -0.3 : 0.3)}" stroke-width=".5"/>`;
        const glass = (x, y, w, h) => `
            <rect x="${x - 3}" y="${y - 3}" width="${w + 6}" height="${h + 6}" rx="3.5" fill="#0d0e11"/>
            ${screen(x, y, w, h, '#0d0e11')}`;
        const ear = `<rect x="${W / 2 - 6}" y="7" width="12" height="1.6" rx=".8" fill="#0c0c0e"/>`;
        if (spec.body === 'bar') {
            front = `
                <rect x="5" y="2" width="${W - 10}" height="126" rx="11" fill="${shellFill}" stroke="${c.shellEdge}"/>
                ${ear}
                ${glass(11, 14, W - 22, 40)}
                ${[0, 1, 2, 3].map((i) => `<rect x="${12 + i * ((W - 24) / 4) + 1}" y="60" width="${(W - 24) / 4 - 2}" height="3" rx="1.5" fill="${c.keys}"/>`).join('')}
                ${dpad(67)}
                ${keys(10, 86, W - 20, 36)}
                <circle cx="${W / 2}" cy="125" r=".9" fill="#08080a"/>
                <rect x="5" y="2" width="${W - 10}" height="126" rx="11" fill="url(#ps${uid})"/>
                ${gemBorder(5, 2, W - 10, 126, 10)}
                ${previewStickers(spec, 'front', [5, 2, W - 10, 62], W)}
                ${previewStickers(spec, 'base', [5, 64, W - 10, 64], W)}`;
        } else {
            // Slider, drawn open: the slab sits over a darker lower half with rails
            const lower = shade(c.shellDeep, -0.45);
            front = `
                <rect x="5" y="56" width="${W - 10}" height="72" rx="10" fill="${lower}" stroke="${c.shellEdge}"/>
                <rect x="5.5" y="60" width="2" height="62" fill="#c9cdd3"/>
                <rect x="${W - 7.5}" y="60" width="2" height="62" fill="#c9cdd3"/>
                ${[0, 1, 2, 3].map((i) => `<rect x="${12 + i * ((W - 24) / 4) + 1}" y="82" width="${(W - 24) / 4 - 2}" height="3" rx="1.5" fill="${c.keys}"/>`).join('')}
                ${keys(11, 88, W - 22, 36)}
                <rect x="5" y="2" width="${W - 10}" height="76" rx="10" fill="#000" opacity=".35" transform="translate(0 2)"/>
                <rect x="5" y="2" width="${W - 10}" height="76" rx="10" fill="${shellFill}" stroke="${c.shellEdge}"/>
                ${ear}
                ${glass(11, 14, W - 22, 40)}
                ${dpad(60)}
                <rect x="5" y="2" width="${W - 10}" height="76" rx="10" fill="url(#ps${uid})"/>
                ${gemBorder(5, 2, W - 10, 76, 9)}
                ${previewStickers(spec, 'front', [5, 2, W - 10, 76], W)}
                ${previewStickers(spec, 'base', [5, 78, W - 10, 50], W)}`;
        }
    }
    const charms = custom ? spec.charms.map((ch, i) => {
        const x = W - 4 + i * 5;
        const y = 112 + i * 4;
        return `<line x1="${W - 7}" y1="${104 + i * 2}" x2="${x}" y2="${y}" stroke="#000" stroke-opacity=".6"/><g transform="translate(${x - 4} ${y}) scale(.34)">${charmInner(ch.kind, ch.color, shade(ch.color, -0.35))}</g>`;
    }).join('') : '';

    // Cover / back, drawn to the right of the front
    const flip = spec.body === 'flip';
    const [cx, cy, cw, ch] = flip ? [W + 14, 9, W - 8, 62] : [W + 13, 4, W - 10, 122];
    const outer = flip && spec.outer.shape !== 'none'
        ? (() => {
            const ox = cx + cw / 2;
            const oy = cy + 14;
            const shape = {
                rect: `<rect x="${ox - 11}" y="${oy - 6}" width="22" height="12" rx="2"/>`,
                round: `<circle cx="${ox}" cy="${oy}" r="8"/>`,
                heart: `<path transform="translate(${ox - 10} ${oy - 9}) scale(.84)" d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z"/>`,
                star: `<path transform="translate(${ox - 10} ${oy - 10}) scale(.84)" d="M12 2l3 6.5 7 .8-5.2 4.8 1.4 7L12 17.6 5.8 21.1l1.4-7L2 9.3l7-.8z"/>`,
            }[spec.outer.shape] || '';
            return `<g fill="${spec.outer.tint}" stroke="${shade(c.shell, -0.4)}" stroke-width=".8">${shape}</g>`;
        })()
        : '';
    const art = custom && spec.cover.art !== 'none'
        ? `<g transform="translate(${cx + cw * 0.15} ${cy + ch * 0.32}) scale(${(cw * 0.7) / 100})" opacity=".9">${coverArtInner(spec.cover.art, spec.cover.color)}</g>`
        : '';
    const cover = `
        <rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="7" fill="${coverFill}" stroke="${c.shellEdge}"/>
        <rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="7" fill="url(#ps${uid})"/>
        ${art}
        ${flip ? '' : `<circle cx="${cx + 9}" cy="${cy + 9}" r="3.4" fill="#151515" stroke="${c.panel}"/>`}
        ${spec.body === 'slider' ? `<rect x="${cx}" y="${cy + ch * 0.58}" width="${cw}" height=".8" fill="#000" opacity=".35"/>` : ''}
        ${outer}
        ${gemBorder(cx, cy, cw, ch, 6)}
        ${previewStickers(spec, flip ? 'cover' : 'back', [cx, cy, cw, ch], W)}`;

    const showFront = view !== 'cover';
    const showCover = view !== 'front';
    const vbX = showFront ? -2 : W + 10;
    const vbW = (showFront && showCover) ? W * 2 + 22 : W + 14;
    return `
        <svg class="pp-phone-preview pp-phone-preview-${view}" viewBox="${vbX} -2 ${vbW} 136" role="img" aria-label="${esc(`${spec.maker} ${spec.model}`.trim() || 'Phone')}">
            <defs>
                <linearGradient id="ps${uid}" x1="0" y1="0" x2="1" y2="1">${sheen}</linearGradient>
                <linearGradient id="pw${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${wall}"/><stop offset="1" stop-color="${wall2}"/></linearGradient>
                ${patDef}
            </defs>
            ${showFront ? front + charms : ''}
            ${showCover ? cover : ''}
        </svg>
    `;
}
