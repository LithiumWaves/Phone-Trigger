/**
 * Sticker editor for Menu → Phones: place, drag, rotate, resize, recolour and delete
 * stickers on each surface of a phone, and add new ones from a sticker sheet.
 *
 * Positions use the same % coordinates as the handset (lib/chassis.js stickersHtml),
 * so what you arrange here is where it lands on the phone.
 */
import { stickerSvg, STICKER_KINDS, STICKER_TEXT_KINDS, patternCss, coverArtSvg } from './stickers.js';
import { getStylePack, placeStickers, seeded } from './phoneStyles.js';
import { shade } from './phoneSpec.js';

/** @typedef {import('./phoneSpec.js').PhoneSpec} PhoneSpec */

const MAX = 16;
/** Sticker width on the stage per unit of scale (stage ≈ surface ≈ phone width). */
const STAGE_STICKER = 0.137;

/**
 * Surfaces a body has, with an approximate width:height for the stage.
 * @param {PhoneSpec} spec
 * @returns {Array<{ id: string, label: string, aspect: number }>}
 */
export function surfacesFor(spec) {
    if (spec.body === 'flip') {
        return [
            { id: 'cover', label: 'Cover', aspect: 0.76 },
            { id: 'front', label: 'Front', aspect: 0.69 },
            { id: 'base', label: 'Keypad', aspect: 0.77 },
        ];
    }
    if (spec.body === 'touch') {
        return [
            { id: 'back', label: 'Back', aspect: 0.52 },
            { id: 'front', label: 'Front', aspect: 0.52 },
        ];
    }
    return [
        { id: 'back', label: 'Back', aspect: 0.42 },
        { id: 'front', label: 'Front', aspect: 0.75 },
        { id: 'base', label: 'Keypad', aspect: 0.85 },
    ];
}

/**
 * @typedef {{ surface: string, selected: number }} EditorState
 */

/**
 * @param {PhoneSpec} spec
 * @param {EditorState} state
 */
function stageBackground(spec, state) {
    const c = spec.colors;
    const onCover = state.surface === 'cover' || state.surface === 'back';
    const pat = (onCover ? spec.pattern.on !== 'shell' : spec.pattern.on !== 'cover') ? patternCss(spec.pattern) : '';
    return `${pat ? `${pat}, ` : ''}linear-gradient(180deg, ${shade(c.shell, 0.12)}, ${c.shellDeep})`;
}

/**
 * @param {PhoneSpec} spec
 * @param {EditorState} state
 */
export function stickerEditorHtml(spec, state) {
    const surfaces = surfacesFor(spec);
    if (!surfaces.some((s) => s.id === state.surface)) {
        state.surface = surfaces[0].id;
        state.selected = -1;
    }
    const surf = surfaces.find((s) => s.id === state.surface) || surfaces[0];
    const sel = spec.stickers[state.selected];
    if (sel && sel.side !== state.surface) {
        state.selected = -1;
    }
    const pack = getStylePack(spec.aesthetic);
    const favourites = pack ? pack.stickers : [];
    const rest = STICKER_KINDS.filter((k) => !favourites.includes(k));
    const onSurface = spec.stickers.map((s, i) => ({ s, i })).filter(({ s }) => s.side === state.surface);
    const chosen = spec.stickers[state.selected];
    const cover = state.surface === 'cover' || state.surface === 'back';

    return `
        <div class="pp-se">
            <div class="pp-se-tabs">
                ${surfaces.map((s) => `<button type="button" class="pp-se-tab ${s.id === state.surface ? 'pp-se-tab-on' : ''}" data-se-surface="${s.id}">${s.label}</button>`).join('')}
                <span class="pp-se-count">${spec.stickers.length}/${MAX}</span>
            </div>
            <div class="pp-se-main">
                <div class="pp-se-stage" style="aspect-ratio:${surf.aspect};background:${stageBackground(spec, state)}" data-se-stage>
                    ${cover && spec.cover.art !== 'none' ? coverArtSvg(spec.cover.art, spec.cover.color) : ''}
                    ${state.surface === 'cover' && spec.outer.shape !== 'none' ? `<div class="pp-se-outer pp-outer-${spec.outer.shape}" style="background:${spec.outer.tint}">12:00</div>` : ''}
                    ${state.surface === 'back' ? '<span class="pp-se-cam"></span>' : ''}
                    ${state.surface === 'front' ? `<div class="pp-se-screen" style="background:${spec.lcd.bg}"></div>` : ''}
                    ${state.surface === 'base' ? '<div class="pp-se-keys"></div>' : ''}
                    ${onSurface.map(({ s, i }) => `
                        <div class="pp-se-sticker ${i === state.selected ? 'pp-se-sel' : ''}" data-se-i="${i}"
                            style="left:${s.x}%;top:${s.y}%;width:${(STAGE_STICKER * s.scale * 100).toFixed(2)}%;transform:translate(-50%,-50%) rotate(${s.rot}deg)">
                            ${stickerSvg(s)}
                            ${i === state.selected ? '<span class="pp-se-handle" data-se-handle title="Drag to rotate and resize"></span><span class="pp-se-del" data-se-del title="Remove">×</span>' : ''}
                        </div>
                    `).join('')}
                </div>
                <div class="pp-se-side">
                    ${chosen ? `
                        <div class="pp-se-props">
                            <span class="pp-se-props-title">Selected · ${chosen.kind}</span>
                            <label>Colour <input type="color" data-se-prop="color" value="${chosen.color}" /></label>
                            <label>Accent <input type="color" data-se-prop="color2" value="${chosen.color2}" /></label>
                            <label>Size <input type="range" min="0.4" max="2.5" step="0.05" data-se-prop="scale" value="${chosen.scale}" /></label>
                            <label>Angle <input type="range" min="-180" max="180" step="1" data-se-prop="rot" value="${chosen.rot}" /></label>
                            <div class="pp-se-row">
                                <button type="button" class="pp-menu-btn" data-se-act="front">Bring to front</button>
                                <button type="button" class="pp-menu-btn" data-se-act="delete">Remove</button>
                            </div>
                        </div>
                    ` : `<p class="pp-se-tip">Tap a sticker to select it. Drag to move, use the corner handle (or pinch, or the mouse wheel; Shift + wheel turns) to resize and rotate.</p>`}
                    <div class="pp-se-row">
                        <button type="button" class="pp-menu-btn" data-se-act="scatter">✦ Re-scatter in style</button>
                        <button type="button" class="pp-menu-btn" data-se-act="clear">Clear this side</button>
                    </div>
                </div>
            </div>
            <div class="pp-se-sheet-title">Sticker sheet${pack ? ` · ${pack.name} first` : ''}</div>
            <div class="pp-se-sheet">
                ${[...favourites, ...rest].map((k) => `<button type="button" class="pp-se-pick ${favourites.includes(k) ? 'pp-se-fav' : ''} ${STICKER_TEXT_KINDS.includes(k) ? 'pp-se-word' : ''}" data-se-add="${k}" title="${k}">${stickerSvg({ kind: k, color: spec.colors.accent, color2: '#ffffff' })}</button>`).join('')}
            </div>
        </div>
    `;
}

/**
 * Wire the editor. `save` receives the new sticker list (unvalidated) and persists it.
 * @param {HTMLElement} root
 * @param {{
 *   getSpec: () => PhoneSpec,
 *   save: (stickers: PhoneSpec['stickers']) => void,
 *   state: EditorState,
 *   rerender: () => void,
 *   warn: (msg: string) => void,
 * }} ctx
 */
export function bindStickerEditor(root, ctx) {
    const { state } = ctx;
    const stage = /** @type {HTMLElement | null} */ (root.querySelector('[data-se-stage]'));
    const list = () => structuredClone(ctx.getSpec().stickers);
    const commit = (stickers) => {
        ctx.save(stickers);
        ctx.rerender();
    };

    root.querySelectorAll('[data-se-surface]').forEach((b) => b.addEventListener('click', () => {
        state.surface = b.getAttribute('data-se-surface') || state.surface;
        state.selected = -1;
        ctx.rerender();
    }));

    root.querySelectorAll('[data-se-add]').forEach((b) => b.addEventListener('click', () => {
        const stickers = list();
        if (stickers.length >= MAX) {
            ctx.warn(`A phone holds ${MAX} stickers at most`);
            return;
        }
        const spec = ctx.getSpec();
        const palette = [spec.colors.accent, spec.colors.panel, '#ffffff', spec.colors.shell];
        const rnd = seeded(Date.now());
        stickers.push({
            kind: b.getAttribute('data-se-add') || 'star',
            color: palette[Math.floor(rnd() * 2)],
            color2: palette[2 + Math.floor(rnd() * 2)],
            side: state.surface,
            x: 50 + (rnd() - 0.5) * 30,
            y: state.surface === 'front' ? 5 : state.surface === 'base' ? 93 : 50 + (rnd() - 0.5) * 30,
            rot: Math.round((rnd() - 0.5) * 30),
            scale: 1,
        });
        state.selected = stickers.length - 1;
        commit(stickers);
    }));

    root.querySelectorAll('[data-se-act]').forEach((b) => b.addEventListener('click', () => {
        const act = b.getAttribute('data-se-act');
        let stickers = list();
        if (act === 'delete' && stickers[state.selected]) {
            stickers.splice(state.selected, 1);
            state.selected = -1;
        } else if (act === 'front' && stickers[state.selected]) {
            stickers.push(stickers.splice(state.selected, 1)[0]);
            state.selected = stickers.length - 1;
        } else if (act === 'clear') {
            stickers = stickers.filter((s) => s.side !== state.surface);
            state.selected = -1;
        } else if (act === 'scatter') {
            const spec = ctx.getSpec();
            const pack = getStylePack(spec.aesthetic);
            const kinds = pack?.stickers.length ? pack.stickers : ['star', 'heart', 'sparkle'];
            const keep = stickers.filter((s) => s.side !== state.surface);
            const room = Math.max(0, MAX - keep.length);
            const n = Math.min(room, Math.max(3, Math.round((pack ? (pack.density[0] + pack.density[1]) / 2 : 5) * (state.surface === 'cover' || state.surface === 'back' ? 0.7 : 0.3))));
            const colors = [spec.colors.accent, spec.colors.panel, '#ffffff', spec.colors.shell];
            stickers = [...keep, ...placeStickers(seeded(Date.now()), kinds, n, colors, [state.surface])];
            state.selected = -1;
        }
        commit(stickers);
    }));

    root.querySelectorAll('[data-se-prop]').forEach((input) => input.addEventListener('change', () => {
        const stickers = list();
        const s = stickers[state.selected];
        if (!s) {
            return;
        }
        const prop = input.getAttribute('data-se-prop') || '';
        const v = /** @type {HTMLInputElement} */ (input).value;
        s[prop] = prop === 'scale' || prop === 'rot' ? Number(v) : v;
        commit(stickers);
    }));

    if (!stage) {
        return;
    }

    // —— Direct manipulation ——
    /** @type {Map<number, { x: number, y: number }>} */
    const pointers = new Map();
    /** @type {null | { mode: 'move' | 'handle' | 'pinch', i: number, el: HTMLElement, start: any }} */
    let gesture = null;
    const rect = () => stage.getBoundingClientRect();
    const live = (el, s) => {
        el.style.left = `${s.x}%`;
        el.style.top = `${s.y}%`;
        el.style.width = `${(STAGE_STICKER * s.scale * 100).toFixed(2)}%`;
        el.style.transform = `translate(-50%,-50%) rotate(${s.rot}deg)`;
    };
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    let working = null;

    stage.addEventListener('pointerdown', (e) => {
        const target = /** @type {HTMLElement} */ (e.target);
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (target.closest('[data-se-del]')) {
            return;
        }
        const el = /** @type {HTMLElement | null} */ (target.closest('[data-se-i]'));
        if (pointers.size === 2 && gesture && state.selected >= 0) {
            const [a, b] = [...pointers.values()];
            const s = working[state.selected];
            gesture = { mode: 'pinch', i: state.selected, el: gesture.el, start: { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), scale: s.scale, rot: s.rot } };
            return;
        }
        if (!el) {
            if (state.selected >= 0) {
                state.selected = -1;
                ctx.rerender();
            }
            return;
        }
        e.preventDefault();
        const i = Number(el.getAttribute('data-se-i'));
        // Pressing a sticker selects it and starts moving it at once; handles appear on release.
        state.selected = i;
        stage.querySelectorAll('.pp-se-sel').forEach((n) => n.classList.remove('pp-se-sel'));
        el.classList.add('pp-se-sel');
        working = list();
        const s = working[i];
        try {
            stage.setPointerCapture(e.pointerId);
        } catch {
            /* ignore */
        }
        if (target.closest('[data-se-handle]')) {
            const r = rect();
            const cx = r.left + (s.x / 100) * r.width;
            const cy = r.top + (s.y / 100) * r.height;
            gesture = { mode: 'handle', i, el, start: { cx, cy, d: Math.hypot(e.clientX - cx, e.clientY - cy), ang: Math.atan2(e.clientY - cy, e.clientX - cx), scale: s.scale, rot: s.rot } };
        } else {
            gesture = { mode: 'move', i, el, start: { px: e.clientX, py: e.clientY, x: s.x, y: s.y } };
        }
    });

    stage.addEventListener('pointermove', (e) => {
        if (pointers.has(e.pointerId)) {
            pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        }
        if (!gesture || !working) {
            return;
        }
        const s = working[gesture.i];
        const r = rect();
        if (gesture.mode === 'move') {
            s.x = Math.round(clamp(gesture.start.x + ((e.clientX - gesture.start.px) / r.width) * 100, 0, 100) * 10) / 10;
            s.y = Math.round(clamp(gesture.start.y + ((e.clientY - gesture.start.py) / r.height) * 100, 0, 100) * 10) / 10;
        } else if (gesture.mode === 'handle') {
            const d = Math.hypot(e.clientX - gesture.start.cx, e.clientY - gesture.start.cy);
            const ang = Math.atan2(e.clientY - gesture.start.cy, e.clientX - gesture.start.cx);
            s.scale = Math.round(clamp(gesture.start.scale * (d / Math.max(4, gesture.start.d)), 0.4, 2.5) * 100) / 100;
            s.rot = Math.round(((gesture.start.rot + ((ang - gesture.start.ang) * 180) / Math.PI + 540) % 360) - 180);
        } else if (gesture.mode === 'pinch' && pointers.size >= 2) {
            const [a, b] = [...pointers.values()];
            const d = Math.hypot(a.x - b.x, a.y - b.y);
            const ang = Math.atan2(b.y - a.y, b.x - a.x);
            s.scale = Math.round(clamp(gesture.start.scale * (d / Math.max(4, gesture.start.d)), 0.4, 2.5) * 100) / 100;
            s.rot = Math.round(((gesture.start.rot + ((ang - gesture.start.ang) * 180) / Math.PI + 540) % 360) - 180);
        }
        live(gesture.el, s);
    });

    const end = (e) => {
        pointers.delete(e.pointerId);
        if (!gesture || pointers.size > 0) {
            return;
        }
        gesture = null;
        if (working) {
            const out = working;
            working = null;
            commit(out);
        }
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);

    stage.querySelector('[data-se-del]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const stickers = list();
        stickers.splice(state.selected, 1);
        state.selected = -1;
        commit(stickers);
    });

    stage.addEventListener('dblclick', (e) => {
        const el = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (e.target).closest('[data-se-i]'));
        if (!el) {
            return;
        }
        const stickers = list();
        stickers.splice(Number(el.getAttribute('data-se-i')), 1);
        state.selected = -1;
        commit(stickers);
    });

    /** @type {ReturnType<typeof setTimeout> | null} */
    let wheelSave = null;
    stage.addEventListener('wheel', (e) => {
        if (state.selected < 0) {
            return;
        }
        e.preventDefault();
        working = working || list();
        const s = working[state.selected];
        const el = /** @type {HTMLElement | null} */ (stage.querySelector(`[data-se-i="${state.selected}"]`));
        if (!s || !el) {
            return;
        }
        if (e.shiftKey) {
            s.rot = Math.round(((s.rot + Math.sign(e.deltaY || e.deltaX) * 5 + 540) % 360) - 180);
        } else {
            s.scale = Math.round(clamp(s.scale * (e.deltaY > 0 ? 0.93 : 1.07), 0.4, 2.5) * 100) / 100;
        }
        live(el, s);
        if (wheelSave) {
            clearTimeout(wheelSave);
        }
        wheelSave = setTimeout(() => {
            wheelSave = null;
            if (working) {
                const out = working;
                working = null;
                commit(out);
            }
        }, 350);
    }, { passive: false });
}
