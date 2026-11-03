/**
 * Menu → Phones: design, edit and reset the handsets for the user and each chat character.
 */
import { getSettings, saveSettings, toast } from './settings.js';
import { registerMenuCategory } from './menu.js';
import {
    USER_OWNER,
    BODIES,
    FINISHES,
    LCD_FONTS,
    WALL_KINDS,
    WALL_PRESETS,
    WALL_PATTERNS,
    CHARMS,
    getPhoneSpec,
    setPhoneSpec,
    hasPhoneSpec,
    validateSpec,
    generatePhoneSpec,
    isSG001,
} from './phoneSpec.js';
import { previewSvg } from './chassis.js';
import { listMailContacts, getPersonaName } from './store.js';
import { isPhoneWaveContact } from './dmail.js';
import { refreshChassis } from './phone.js';

/** @type {Set<string>} owners whose editor is expanded */
const editing = new Set();
/** @type {Set<string>} owners being designed by the model */
const designing = new Set();
/** @type {Map<string, (owner: string) => string>} extra action buttons per card (Part 3 hooks) */
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

/**
 * Redraw the handset if the changed phone is the one on screen.
 * @param {string} _owner
 */
function afterChange(_owner) {
    refreshChassis();
}

/**
 * @param {string} label
 * @param {string} field
 * @param {readonly string[]} options
 * @param {string} value
 */
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

/** @param {import('./phoneSpec.js').PhoneSpec} spec */
function editorHtml(spec) {
    return `
        <div class="pp-pe">
            <div class="pp-pe-grid">
                ${textHtml('Maker', 'maker', spec.maker, 24)}
                ${textHtml('Model', 'model', spec.model, 24)}
                ${selectHtml('Body', 'body', BODIES, spec.body)}
                ${selectHtml('Finish', 'finish', FINISHES, spec.finish)}
                ${spec.body === 'flip' ? selectHtml('Crown', 'crown', ['none', 'truss'], spec.crown) : ''}
                ${selectHtml('Screen font', 'lcd.font', LCD_FONTS, spec.lcd.font)}
            </div>
            <div class="pp-pe-grid pp-pe-colors">
                ${colorHtml('Shell', 'colors.shell', spec.colors.shell)}
                ${colorHtml('Panel', 'colors.panel', spec.colors.panel)}
                ${colorHtml('Keys', 'colors.keys', spec.colors.keys)}
                ${colorHtml('Key print', 'colors.keyPrint', spec.colors.keyPrint)}
                ${colorHtml('Screen', 'lcd.bg', spec.lcd.bg)}
                ${colorHtml('Text', 'lcd.fg', spec.lcd.fg)}
                ${colorHtml('Accent', 'lcd.accent', spec.lcd.accent)}
            </div>
            <div class="pp-pe-grid">
                ${selectHtml('Wallpaper', 'wallpaper.kind', WALL_KINDS, spec.wallpaper.kind)}
                ${spec.wallpaper.kind === 'preset' ? selectHtml('Preset', 'wallpaper.preset', WALL_PRESETS, spec.wallpaper.preset) : ''}
                ${spec.wallpaper.kind === 'pattern' ? selectHtml('Pattern', 'wallpaper.pattern', WALL_PATTERNS, spec.wallpaper.pattern) : ''}
                ${spec.wallpaper.kind !== 'preset' ? colorHtml('Wall A', 'wallpaper.a', spec.wallpaper.a) + colorHtml('Wall B', 'wallpaper.b', spec.wallpaper.b) : ''}
                ${selectHtml('Charm', 'charms.0.kind', CHARMS, spec.charms[0]?.kind || 'none')}
                ${spec.charms[0] ? colorHtml('Charm colour', 'charms.0.color', spec.charms[0].color) + textHtml('Charm tag', 'charms.0.label', spec.charms[0].label, 18) : ''}
            </div>
        </div>`;
}

/**
 * @param {{ owner: string, name: string, you: boolean }} o
 */
function cardHtml(o) {
    const spec = getPhoneSpec(o.owner, o.name);
    const custom = hasPhoneSpec(o.owner);
    const busy = designing.has(o.owner);
    const title = o.you ? `${esc(o.name)} <em>(you)</em>` : esc(o.name);
    const model = `${spec.maker} ${spec.model}`.trim();
    const status = o.you
        ? (isSG001(spec) ? 'SG001 — the default handset' : `${model} · ${spec.body}`)
        : (custom ? `${model} · ${spec.body}` : `Not designed yet — placeholder ${spec.body}`);
    const extras = [...extraActions.values()].map((fn) => fn(o.owner)).join('');
    return `
        <article class="pp-pcard ${busy ? 'pp-pcard-busy' : ''}" data-owner="${esc(o.owner)}">
            <div class="pp-pcard-art">${previewSvg(spec)}</div>
            <div class="pp-pcard-body">
                <h4>${title}</h4>
                <div class="pp-pcard-model">${esc(status)}</div>
                ${spec.blurb ? `<p class="pp-pcard-blurb">${esc(spec.blurb)}</p>` : ''}
                <div class="pp-pcard-hint">
                    <input type="text" data-hint placeholder="Optional hint, e.g. &quot;battered, covered in stickers&quot;" maxlength="200" />
                </div>
                <div class="pp-pcard-actions">
                    <button type="button" class="pp-menu-btn" data-act="design" ${busy ? 'disabled' : ''}>${busy ? 'Designing…' : (custom || !o.you ? '✦ Design with AI' : '✦ Design my phone')}</button>
                    <button type="button" class="pp-menu-btn" data-act="edit">${editing.has(o.owner) ? 'Close editor' : 'Edit'}</button>
                    ${custom ? `<button type="button" class="pp-menu-btn" data-act="reset">${o.you ? 'Back to SG001' : 'Forget design'}</button>` : ''}
                    ${extras}
                </div>
                ${editing.has(o.owner) ? editorHtml(spec) : ''}
            </div>
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
    const list = owners();
    host.innerHTML = `
        <h3 class="pp-menu-sub">Your phone</h3>
        ${cardHtml(list[0])}
        <h3 class="pp-menu-sub">Characters in this chat</h3>
        ${list.length > 1 ? list.slice(1).map(cardHtml).join('') : '<p class="pp-menu-lead">Open a chat to design its characters\' phones.</p>'}
    `;
    bind(host, section);
}

/**
 * @param {HTMLElement} host
 * @param {HTMLElement} section
 */
function bind(host, section) {
    host.querySelectorAll('.pp-pcard').forEach((card) => {
        const owner = card.getAttribute('data-owner') || '';
        const name = owners().find((o) => o.owner === owner)?.name || owner;
        card.querySelectorAll('[data-act]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const act = btn.getAttribute('data-act');
                if (act === 'edit') {
                    if (editing.has(owner)) {
                        editing.delete(owner);
                    } else {
                        editing.add(owner);
                    }
                    renderPhones(section);
                } else if (act === 'reset') {
                    setPhoneSpec(owner, null);
                    if (owner === USER_OWNER && getSettings().wallpaperId === 'phone') {
                        getSettings().wallpaperId = 'orbital';
                        saveSettings();
                    }
                    afterChange(owner);
                    renderPhones(section);
                } else if (act === 'design') {
                    const hint = /** @type {HTMLInputElement | null} */ (card.querySelector('[data-hint]'))?.value || '';
                    designing.add(owner);
                    renderPhones(section);
                    try {
                        const { spec, fromModel } = await generatePhoneSpec(owner, { hint });
                        setPhoneSpec(owner, spec);
                        if (owner === USER_OWNER && !getSettings().customWallpaperUrl) {
                            getSettings().wallpaperId = 'phone';
                            saveSettings();
                        }
                        toast(fromModel ? `${name}'s phone: ${spec.maker} ${spec.model}` : 'The model did not answer; made a phone from their name instead', fromModel ? 'success' : 'warning', 'PHONES');
                        afterChange(owner);
                    } finally {
                        designing.delete(owner);
                        if (section.isConnected) {
                            renderPhones(section);
                        }
                    }
                }
            });
        });
        card.querySelectorAll('[data-phone-action]').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const action = btn.getAttribute('data-phone-action') || '';
                for (const fn of extraHandlers.values()) {
                    await fn(owner, action);
                }
                if (section.isConnected) {
                    renderPhones(section);
                }
            });
        });
        card.querySelectorAll('[data-pe]').forEach((input) => {
            input.addEventListener('change', () => {
                const spec = /** @type {any} */ (structuredClone(getPhoneSpec(owner, name)));
                const path = (input.getAttribute('data-pe') || '').split('.');
                if (path[0] === 'charms') {
                    spec.charms = spec.charms.length ? spec.charms : [{ kind: 'bow', color: spec.colors.accent, label: '' }];
                    if (path[2] === 'kind' && /** @type {HTMLInputElement} */ (input).value === 'none') {
                        spec.charms.shift();
                        setPhoneSpec(owner, validateSpec(spec, { seedName: name, base: getPhoneSpec(owner, name) }));
                        afterChange(owner);
                        renderPhones(section);
                        return;
                    }
                }
                let target = spec;
                for (let i = 0; i < path.length - 1; i++) {
                    target = target[path[i]];
                }
                target[path[path.length - 1]] = /** @type {HTMLInputElement} */ (input).value;
                setPhoneSpec(owner, validateSpec(spec, { seedName: name, base: getPhoneSpec(owner, name) }));
                afterChange(owner);
                const top = section.closest('.pp-menu-pane')?.scrollTop || 0;
                renderPhones(section);
                const pane = section.closest('.pp-menu-pane');
                if (pane) {
                    pane.scrollTop = top;
                }
            });
        });
    });
}

export function registerPhonesMenu() {
    registerMenuCategory('phones', renderPhones);
}
