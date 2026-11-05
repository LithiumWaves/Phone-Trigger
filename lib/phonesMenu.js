/**
 * Menu → Phones: design, restyle, edit and decorate the handsets for the user and each
 * chat character — style gallery, shuffle, AI design, a full look editor and a sticker editor.
 */
import { getSettings, saveSettings, toast } from './settings.js';
import { registerMenuCategory } from './menu.js';
import {
    USER_OWNER,
    BODIES,
    FINISHES,
    LCD_FONTS,
    LCD_UIS,
    KEY_STYLES,
    RHINESTONES,
    OUTER_SHAPES,
    PATTERN_ON,
    PATTERNS,
    COVER_ARTS,
    WALL_KINDS,
    WALL_PRESETS,
    WALL_PATTERNS,
    CHARMS,
    STYLE_PACKS,
    getPhoneSpec,
    setPhoneSpec,
    hasPhoneSpec,
    validateSpec,
    generatePhoneSpec,
    rollPhone,
    isSG001,
    FREEFORM,
    applyOwnerDefaults,
    rememberCurrent,
    saveDesign,
    listWardrobe,
    applyDesign,
    deleteDesign,
    renameDesign,
} from './phoneSpec.js';
import { previewSvg } from './chassis.js';
import { stickerEditorHtml, bindStickerEditor } from './stickerEditor.js';
import { listMailContacts, getPersonaName } from './store.js';
import { isPhoneWaveContact } from './dmail.js';
import { refreshChassis } from './phone.js';

/** @type {Map<string, { tab: 'look' | 'stickers', surface: string, selected: number }>} open editors */
const editors = new Map();
/** @type {Set<string>} owners being designed by the model */
const designing = new Set();
/** @type {Map<string, string>} chosen AI style per owner ('' = let the model pick) */
const aiStyle = new Map();
/** @type {Map<string, (owner: string) => string>} extra action buttons per card */
const extraActions = new Map();
/** @type {Map<string, (owner: string, action: string) => void | Promise<void>>} */
const extraHandlers = new Map();

/**
 * Let other modules add buttons to character cards.
 * @param {string} id
 * @param {(owner: string) => string} html returns button HTML (use data-phone-action="<action>")
 * @param {(owner: string, action: string) => void | Promise<void>} onClick
 */
export function registerPhoneCardAction(id, html, onClick) {
    extraActions.set(id, html);
    extraHandlers.set(id, onClick);
}

/** @param {unknown} s */
function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function owners() {
    const list = [{ owner: USER_OWNER, name: getPersonaName(), you: true }];
    for (const c of listMailContacts()) {
        if (c && !isPhoneWaveContact(c.key)) {
            list.push({ owner: c.key, name: c.name, you: false });
        }
    }
    return list;
}

/** @param {string} owner */
function nameOf(owner) {
    return owners().find((o) => o.owner === owner)?.name || owner;
}

/**
 * Save a spec for an owner and redraw the handset if it is the one on screen.
 * @param {string} owner
 * @param {any} spec
 */
function save(owner, spec) {
    const name = nameOf(owner);
    setPhoneSpec(owner, validateSpec(spec, { seedName: name, base: getPhoneSpec(owner, name) }));
    refreshChassis();
}

/** A user phone that isn't the SG001 should show its own wallpaper. */
function adoptWallpaper(owner) {
    if (owner === USER_OWNER && !getSettings().customWallpaperUrl) {
        getSettings().wallpaperId = 'phone';
        saveSettings();
    }
}

// —— Field builders ——

/** @param {string} label @param {string} field @param {readonly string[]} options @param {string} value */
function selectHtml(label, field, options, value) {
    return `
        <label class="pp-pe-field"><span>${label}</span>
            <select data-pe="${field}">${options.map((o) => `<option value="${o}" ${o === value ? 'selected' : ''}>${o}</option>`).join('')}</select>
        </label>`;
}

/** @param {string} label @param {string} field @param {string} value */
function colorHtml(label, field, value) {
    return `<label class="pp-pe-field pp-pe-color"><span>${label}</span><input type="color" data-pe="${field}" value="${esc(value)}" /></label>`;
}

/** @param {string} label @param {string} field @param {string} value @param {number} max */
function textHtml(label, field, value, max) {
    return `<label class="pp-pe-field"><span>${label}</span><input type="text" data-pe="${field}" value="${esc(value)}" maxlength="${max}" /></label>`;
}

/** @param {string} label @param {string} field @param {boolean} on */
function checkHtml(label, field, on) {
    return `<label class="pp-pe-field pp-pe-check"><span>${label}</span><input type="checkbox" data-pe="${field}" ${on ? 'checked' : ''} /></label>`;
}

/** @param {string} label @param {string} field @param {number} value @param {number} min @param {number} max @param {number} step */
function rangeHtml(label, field, value, min, max, step) {
    return `<label class="pp-pe-field"><span>${label}</span><input type="range" data-pe="${field}" value="${value}" min="${min}" max="${max}" step="${step}" /></label>`;
}

/** @param {string} title @param {string} body */
function group(title, body) {
    return `<fieldset class="pp-pe-group"><legend>${title}</legend><div class="pp-pe-grid">${body}</div></fieldset>`;
}

/** @param {import('./phoneSpec.js').PhoneSpec} spec */
function lookHtml(spec) {
    const charmRows = spec.charms.map((ch, i) => `
        <div class="pp-pe-charm">
            ${selectHtml(`Charm ${i + 1}`, `charms.${i}.kind`, CHARMS.filter((k) => k !== 'none'), ch.kind)}
            ${colorHtml('Colour', `charms.${i}.color`, ch.color)}
            ${textHtml('Tag', `charms.${i}.label`, ch.label, 18)}
            <button type="button" class="pp-menu-btn pp-pe-x" data-charm-del="${i}" title="Remove charm">×</button>
        </div>`).join('');
    return `
        ${group('Body', `
            ${textHtml('Maker', 'maker', spec.maker, 24)}
            ${textHtml('Model', 'model', spec.model, 24)}
            ${selectHtml('Body', 'body', BODIES, spec.body)}
            ${selectHtml('Finish', 'finish', FINISHES, spec.finish)}
            ${spec.body === 'flip' ? selectHtml('Crown', 'crown', ['none', 'truss'], spec.crown) : ''}
        `)}
        ${group('Colours', `
            ${colorHtml('Shell', 'colors.shell', spec.colors.shell)}
            ${colorHtml('Panel', 'colors.panel', spec.colors.panel)}
            ${colorHtml('Keys', 'colors.keys', spec.colors.keys)}
            ${colorHtml('Key print', 'colors.keyPrint', spec.colors.keyPrint)}
            ${colorHtml('Accent', 'colors.accent', spec.colors.accent)}
        `)}
        ${group('Pattern', `
            ${selectHtml('Print', 'pattern.kind', PATTERNS, spec.pattern.kind)}
            ${spec.pattern.kind !== 'solid' ? `
                ${selectHtml('On', 'pattern.on', PATTERN_ON, spec.pattern.on)}
                ${colorHtml('Base', 'pattern.a', spec.pattern.a)}
                ${colorHtml('Print colour', 'pattern.b', spec.pattern.b)}
                ${rangeHtml('Scale', 'pattern.scale', spec.pattern.scale, 0.5, 2, 0.05)}` : ''}
        `)}
        ${group('Keys & deco', `
            ${selectHtml('Key style', 'keys.style', KEY_STYLES, spec.keys.style)}
            ${spec.keys.style === 'neon' ? checkHtml('Glow', 'keys.glow', spec.keys.glow) : ''}
            ${selectHtml('Rhinestones', 'deco.rhinestones', RHINESTONES, spec.deco.rhinestones)}
            ${colorHtml('Gem colour', 'deco.gem', spec.deco.gem)}
            ${checkHtml('Pearl trim', 'deco.pearls', spec.deco.pearls)}
            ${checkHtml('Studs', 'deco.studs', spec.deco.studs)}
        `)}
        ${group(spec.body === 'flip' ? 'Cover' : 'Back', `
            ${selectHtml('Print', 'cover.art', COVER_ARTS, spec.cover.art)}
            ${spec.cover.art !== 'none' ? colorHtml('Print colour', 'cover.color', spec.cover.color) : ''}
            ${spec.body === 'flip' ? selectHtml('Outer display', 'outer.shape', OUTER_SHAPES, spec.outer.shape) : ''}
            ${spec.body === 'flip' && spec.outer.shape !== 'none' ? colorHtml('Display glass', 'outer.tint', spec.outer.tint) : ''}
        `)}
        ${group('Screen', `
            ${colorHtml('Background', 'lcd.bg', spec.lcd.bg)}
            ${colorHtml('Text', 'lcd.fg', spec.lcd.fg)}
            ${colorHtml('Highlight', 'lcd.accent', spec.lcd.accent)}
            ${selectHtml('Font', 'lcd.font', LCD_FONTS, spec.lcd.font)}
            ${selectHtml('Style', 'lcd.ui', LCD_UIS, spec.lcd.ui)}
            ${checkHtml('Divergence meter', 'meter', spec.meter)}
            ${selectHtml('Wallpaper', 'wallpaper.kind', WALL_KINDS, spec.wallpaper.kind)}
            ${spec.wallpaper.kind === 'preset' ? selectHtml('Preset', 'wallpaper.preset', WALL_PRESETS, spec.wallpaper.preset) : ''}
            ${spec.wallpaper.kind === 'pattern' ? selectHtml('Pattern', 'wallpaper.pattern', WALL_PATTERNS, spec.wallpaper.pattern) : ''}
            ${spec.wallpaper.kind !== 'preset' ? colorHtml('Wall A', 'wallpaper.a', spec.wallpaper.a) + colorHtml('Wall B', 'wallpaper.b', spec.wallpaper.b) : ''}
        `)}
        <fieldset class="pp-pe-group"><legend>Charms</legend>
            ${charmRows || '<p class="pp-se-tip">No charms.</p>'}
            ${spec.charms.length < 3 ? '<button type="button" class="pp-menu-btn" data-charm-add>+ Add charm</button>' : ''}
        </fieldset>
    `;
}

/** @param {number} at */
function ago(at) {
    const m = Math.round((Date.now() - at) / 60000);
    return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
}

/**
 * Saved designs and recent looks for an owner.
 * @param {string} owner
 * @param {string} name
 * @param {import('./phoneSpec.js').PhoneSpec} current
 */
function wardrobeHtml(owner, name, current) {
    const { saved, recent } = listWardrobe(owner, name);
    const cur = JSON.stringify(current);
    const item = (e, isSaved) => `
        <div class="pp-wd-item ${JSON.stringify(e.spec) === cur ? 'pp-wd-on' : ''}" title="${isSaved ? esc(e.name) : 'Earlier look'} — click to wear it${isSaved ? ', double-click the name to rename' : ''}">
            <button type="button" class="pp-wd-apply" data-wd-apply="${esc(e.id)}">${previewSvg(e.spec, { uid: `w${e.id}`, view: 'both' })}</button>
            <span class="pp-wd-name" ${isSaved ? `data-wd-rename="${esc(e.id)}"` : ''}>${isSaved ? esc(e.name) : ago(e.at)}</span>
            <button type="button" class="pp-wd-del" data-wd-del="${esc(e.id)}" title="Delete" aria-label="Delete">×</button>
        </div>`;
    if (!saved.length && !recent.length) {
        return '<p class="pp-se-tip">Nothing saved yet. ★ Save design keeps the current look; every reroll also keeps the previous one under Recent.</p>';
    }
    return `
        ${saved.length ? `<div class="pp-wd-label">Saved</div><div class="pp-wd-row">${saved.map((e) => item(e, true)).join('')}</div>` : ''}
        ${recent.length ? `<div class="pp-wd-label">Recent</div><div class="pp-wd-row">${recent.map((e) => item(e, false)).join('')}</div>` : ''}
    `;
}

/** Style gallery chips. @param {import('./phoneSpec.js').PhoneSpec} spec */
function galleryHtml(spec) {
    return `
        <div class="pp-styles" role="list">
            ${STYLE_PACKS.map((p) => `
                <button type="button" class="pp-style-chip ${spec.aesthetic === p.id ? 'pp-style-on' : ''}" data-style="${p.id}" title="${esc(p.vibe)}" role="listitem">
                    <span class="pp-style-sw">${p.palettes[0].slice(0, 4).map((c) => `<i style="background:${c}"></i>`).join('')}</span>
                    ${esc(p.name)}
                </button>`).join('')}
        </div>`;
}

/**
 * @param {{ owner: string, name: string, you: boolean }} o
 */
function cardHtml(o) {
    const spec = getPhoneSpec(o.owner, o.name);
    const custom = hasPhoneSpec(o.owner);
    const busy = designing.has(o.owner);
    const ed = editors.get(o.owner);
    const pack = STYLE_PACKS.find((p) => p.id === spec.aesthetic);
    const title = o.you ? `${esc(o.name)} <em>(you)</em>` : esc(o.name);
    const model = `${spec.maker} ${spec.model}`.trim();
    const status = o.you && isSG001(spec)
        ? 'SG001 — the default handset'
        : `${model} · ${spec.body}${pack ? ` · ${pack.name}` : ''}${!custom && !o.you ? ' · not designed yet' : ''}`;
    const extras = [...extraActions.values()].map((fn) => fn(o.owner)).join('');
    const chosenStyle = aiStyle.has(o.owner) ? aiStyle.get(o.owner) : (getSettings().phoneAiMode === 'free' ? FREEFORM : '');
    return `
        <article class="pp-pcard ${busy ? 'pp-pcard-busy' : ''}" data-owner="${esc(o.owner)}">
            <div class="pp-pcard-top">
                <div class="pp-pcard-art">${previewSvg(spec)}</div>
                <div class="pp-pcard-body">
                    <h4>${title}</h4>
                    <div class="pp-pcard-model">${esc(status)}</div>
                    ${spec.blurb ? `<p class="pp-pcard-blurb">${esc(spec.blurb)}</p>` : ''}
                    <div class="pp-pcard-hint">
                        <select data-ai-style title="Style for the AI">
                            <option value="">AI picks a style</option>
                            <option value="${FREEFORM}" ${chosenStyle === FREEFORM ? 'selected' : ''}>Freeform — no style</option>
                            ${STYLE_PACKS.map((p) => `<option value="${p.id}" ${chosenStyle === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
                        </select>
                        <input type="text" data-hint placeholder="Optional hint, e.g. &quot;battered, covered in stickers&quot;" maxlength="200" />
                    </div>
                    <div class="pp-pcard-actions">
                        <button type="button" class="pp-menu-btn" data-act="design" ${busy ? 'disabled' : ''}>${busy ? 'Designing…' : '✦ Design with AI'}</button>
                        <button type="button" class="pp-menu-btn" data-act="shuffle" title="Another random phone in this style">🎲 Shuffle</button>
                        <button type="button" class="pp-menu-btn" data-act="save" title="Keep this look in the wardrobe">★ Save design</button>
                        <button type="button" class="pp-menu-btn" data-act="edit">${ed ? 'Close editor' : 'Edit'}</button>
                        ${custom ? `<button type="button" class="pp-menu-btn" data-act="reset">${o.you ? 'Back to SG001' : 'Forget design'}</button>` : ''}
                        ${extras}
                    </div>
                </div>
            </div>
            <div class="pp-pcard-styles-label">Styles</div>
            ${galleryHtml(spec)}
            <div class="pp-pcard-styles-label">Wardrobe</div>
            <div class="pp-wardrobe">${wardrobeHtml(o.owner, o.name, spec)}</div>
            ${ed ? `
                <div class="pp-pe">
                    <div class="pp-se-tabs">
                        <button type="button" class="pp-se-tab ${ed.tab === 'look' ? 'pp-se-tab-on' : ''}" data-ed-tab="look">Look</button>
                        <button type="button" class="pp-se-tab ${ed.tab === 'stickers' ? 'pp-se-tab-on' : ''}" data-ed-tab="stickers">Stickers</button>
                    </div>
                    ${ed.tab === 'look' ? lookHtml(spec) : stickerEditorHtml(spec, ed)}
                </div>` : ''}
        </article>`;
}

/**
 * @param {HTMLElement} section
 */
function renderPhones(section) {
    const host = section.querySelector('#pp-menu-phones');
    if (!host) {
        return;
    }
    const pane = section.closest('.pp-menu-pane');
    const top = pane?.scrollTop || 0;
    const styleScroll = [...host.querySelectorAll('.pp-styles')].map((el) => el.scrollLeft);
    const list = owners();
    host.innerHTML = `
        <h3 class="pp-menu-sub">Your phone</h3>
        ${cardHtml(list[0])}
        <h3 class="pp-menu-sub">Characters in this chat</h3>
        ${list.length > 1 ? list.slice(1).map(cardHtml).join('') : '<p class="pp-menu-lead">Open a chat to design its characters\' phones.</p>'}
    `;
    host.querySelectorAll('.pp-styles').forEach((el, i) => {
        el.scrollLeft = styleScroll[i] || 0;
    });
    if (pane) {
        pane.scrollTop = top;
    }
    bind(host, section);
}

/**
 * @param {HTMLElement} host
 * @param {HTMLElement} section
 */
function bind(host, section) {
    const rerender = () => {
        if (section.isConnected) {
            renderPhones(section);
        }
    };
    host.querySelectorAll('.pp-pcard').forEach((card) => {
        const owner = card.getAttribute('data-owner') || '';
        const name = nameOf(owner);

        card.querySelector('[data-ai-style]')?.addEventListener('change', (e) => {
            aiStyle.set(owner, /** @type {HTMLSelectElement} */ (e.target).value);
        });

        card.querySelectorAll('[data-act]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const act = btn.getAttribute('data-act');
                if (act === 'edit') {
                    if (editors.has(owner)) {
                        editors.delete(owner);
                    } else {
                        editors.set(owner, { tab: 'look', surface: '', selected: -1 });
                    }
                    rerender();
                } else if (act === 'save') {
                    const cur = getPhoneSpec(owner, name);
                    const label = prompt('Name this design', `${cur.maker} ${cur.model}`.trim() || 'My design');
                    if (label === null) {
                        return;
                    }
                    toast(`Saved “${saveDesign(owner, label, name)}”`, 'success', 'PHONES');
                    rerender();
                } else if (act === 'reset') {
                    rememberCurrent(owner, name);
                    setPhoneSpec(owner, null);
                    if (owner === USER_OWNER && getSettings().wallpaperId === 'phone') {
                        getSettings().wallpaperId = 'orbital';
                        saveSettings();
                    }
                    refreshChassis();
                    rerender();
                } else if (act === 'shuffle') {
                    const cur = getPhoneSpec(owner, name);
                    const pack = STYLE_PACKS.some((p) => p.id === cur.aesthetic) ? cur.aesthetic : 'plain';
                    rememberCurrent(owner, name);
                    setPhoneSpec(owner, applyOwnerDefaults(owner, rollPhone(pack)));
                    adoptWallpaper(owner);
                    refreshChassis();
                    rerender();
                } else if (act === 'design') {
                    const hint = /** @type {HTMLInputElement | null} */ (card.querySelector('[data-hint]'))?.value || '';
                    designing.add(owner);
                    rerender();
                    try {
                        const sel = /** @type {HTMLSelectElement | null} */ (card.querySelector('[data-ai-style]'))?.value ?? '';
                        const { spec, fromModel } = await generatePhoneSpec(owner, { hint, style: sel });
                        rememberCurrent(owner, name);
                        setPhoneSpec(owner, spec);
                        adoptWallpaper(owner);
                        const pack = STYLE_PACKS.find((p) => p.id === spec.aesthetic);
                        toast(fromModel ? `${name}'s phone: ${spec.maker} ${spec.model}${pack ? ` (${pack.name})` : ''}` : 'The model did not answer; rolled a phone for them instead', fromModel ? 'success' : 'warning', 'PHONES');
                        refreshChassis();
                    } finally {
                        designing.delete(owner);
                        rerender();
                    }
                }
            });
        });

        card.querySelectorAll('[data-style]').forEach((btn) => {
            btn.addEventListener('click', () => {
                rememberCurrent(owner, name);
                setPhoneSpec(owner, applyOwnerDefaults(owner, rollPhone(btn.getAttribute('data-style') || 'plain')));
                adoptWallpaper(owner);
                refreshChassis();
                rerender();
            });
        });

        card.querySelectorAll('[data-phone-action]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const action = btn.getAttribute('data-phone-action') || '';
                for (const fn of extraHandlers.values()) {
                    await fn(owner, action);
                }
                rerender();
            });
        });

        // Wardrobe
        card.querySelectorAll('[data-wd-apply]').forEach((btn) => {
            btn.addEventListener('click', () => {
                if (applyDesign(owner, btn.getAttribute('data-wd-apply') || '', name)) {
                    adoptWallpaper(owner);
                    refreshChassis();
                    rerender();
                }
            });
        });
        card.querySelectorAll('[data-wd-del]').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteDesign(owner, btn.getAttribute('data-wd-del') || '');
                rerender();
            });
        });
        card.querySelectorAll('[data-wd-rename]').forEach((el) => {
            el.addEventListener('dblclick', () => {
                const label = prompt('Rename design', el.textContent || '');
                if (label) {
                    renameDesign(owner, el.getAttribute('data-wd-rename') || '', label);
                    rerender();
                }
            });
        });

        // Editor tabs
        card.querySelectorAll('[data-ed-tab]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const ed = editors.get(owner);
                if (ed) {
                    ed.tab = /** @type {any} */ (btn.getAttribute('data-ed-tab'));
                    rerender();
                }
            });
        });

        // Look fields
        card.querySelectorAll('[data-pe]').forEach((input) => {
            input.addEventListener('change', () => {
                const spec = /** @type {any} */ (structuredClone(getPhoneSpec(owner, name)));
                const path = (input.getAttribute('data-pe') || '').split('.');
                let target = spec;
                for (let i = 0; i < path.length - 1; i++) {
                    target = target[path[i]];
                }
                const el = /** @type {HTMLInputElement} */ (input);
                target[path[path.length - 1]] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
                save(owner, spec);
                rerender();
            });
        });
        card.querySelector('[data-charm-add]')?.addEventListener('click', () => {
            const spec = /** @type {any} */ (structuredClone(getPhoneSpec(owner, name)));
            spec.charms.push({ kind: 'bow', color: spec.colors.accent, label: '' });
            save(owner, spec);
            rerender();
        });
        card.querySelectorAll('[data-charm-del]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const spec = /** @type {any} */ (structuredClone(getPhoneSpec(owner, name)));
                spec.charms.splice(Number(btn.getAttribute('data-charm-del')), 1);
                save(owner, spec);
                rerender();
            });
        });

        // Sticker editor
        const ed = editors.get(owner);
        if (ed && ed.tab === 'stickers') {
            const root = /** @type {HTMLElement | null} */ (card.querySelector('.pp-se'));
            if (root) {
                bindStickerEditor(root, {
                    getSpec: () => getPhoneSpec(owner, name),
                    save: (stickers) => {
                        const spec = /** @type {any} */ (structuredClone(getPhoneSpec(owner, name)));
                        spec.stickers = stickers;
                        save(owner, spec);
                    },
                    state: ed,
                    rerender,
                    warn: (msg) => toast(msg, 'warning', 'PHONES'),
                });
            }
        }
    });
}

export function registerPhonesMenu() {
    registerMenuCategory('phones', renderPhones);
}
