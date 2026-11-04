import { WALLPAPERS, SOUND_PRESETS, FLIP_MS, WORLDLINE_LOREBOOK_NAME } from './constants.js';
import { createNavCursor } from './navCursor.js';
import { getSettings, saveSettings, toast } from './settings.js';
import {
    getInbox,
    getOutbox,
    getEmailById,
    markRead,
    getUnreadCount,
    getActiveCharacterName,
    clearAllMail,
    deleteEmail,
    listMailContacts,
    getEmails,
    getMemorySelection,
    setMemorySelection,
    listAutoMemoryEmails,
    toggleCharacterMemoryEmail,
    getEmailsForCharacterMemory,
} from './store.js';
import { playNotification, playRingtone, playPreset, stopNotificationSound } from './audio.js';
import { sendUserEmail, updateMailPrompt, scheduleForcedCharacterMail, clampDmailBody } from './email.js';
import {
    isPhoneWaveContact,
    PHONEWAVE_NAME,
    playDmailSequence,
    getDmailTiers,
    setDmailTier,
    acceptWorldlineFact,
    getWorldlineFacts,
    removeWorldlineFact,
    clearAllWorldlineFacts,
    listDmailChatContext,
    listDmailParticipants,
    applyWorldlineToCharacterCard,
    applyWorldlineToLorebook,
    rewriteCharacterCardForWorldline,
    listWorldInfoBookNames,
    getConfiguredLorebookName,
    getDivergence,
    setDivergence,
    getPhoneWaveContact,
} from './dmail.js';
import { drawStaticMeter, formatDivergence } from './divmeter.js';
import { showCutscenePrompt } from './cutscenePrompt.js';
import { renderTimeleapApp, resetTimeleapApp, timeleapSoftLeft, isTimeleapBusy, lockTimeleapLeaper } from './timeleapApp.js';
import { openMenu } from './menu.js';
import { getPhoneSpec, USER_OWNER } from './phoneSpec.js';
import { resolveOwner as resolvePhoneOwner } from './phoneData.js';
import {
    renderOtherPhone,
    startOtherPhone,
    stopOtherPhone,
    otherPhoneOwner,
    otherPhoneSoftLeft,
    otherPhoneBack,
    otherPhoneShortcut,
    otherPhoneCallKey,
} from './otherPhone.js';
import { chassisStyle, chassisAttrs, brandHtml, stickersHtml, charmHtml, specWallpaperCss, coverHtml, backHtml, decoHtml } from './chassis.js';
import {
    getCallMemories,
    removeCallMemory,
    clearCallMemories,
    summarizeCallRecord,
    updateCallMemoryPrompt,
    setCallMemoryInject,
    formatCallTranscript,
} from './callMemory.js';
import { createKeypadController, KEY_LABELS, LONG_PRESS_MS } from './keypad.js';
import {
    getCallSession,
    isCallActive,
    isCallConnected,
    isCallRinging,
    listCallContacts,
    startOutboundCall,
    answerIncomingCall,
    beginIncomingCall,
    endCall,
    sendCallLine,
    setCallChangeHandler,
    getPersonaLabel,
} from './call.js';
import { setCallInitiativeIncomingHandler } from './callInitiative.js';

/** @type {HTMLElement|null} */
let root = null;
/** @type {string} */
let screen = 'home';
/** @type {string|null} */
let activeMailId = null;
/** @type {string} */
let composeSubject = '';
/** @type {string} */
let composeBody = '';
/** @type {string|null} */
let composeReplyTo = null;
/** Selected compose To: contact key */
let composeToKey = '';
/** When true, outbound mail skips scheduling an AI reply */
let composeNoReply = false;
/** D-Mail cosmetic redirect: 'self' or contact key */
let composeDmailRedirectKey = 'self';
/** D-Mail cosmetic arrival datetime-local value */
let composeDmailWhen = '';
/** Discreet force-mail panel on inbox */
let forcePanelOpen = false;
/** @type {string} */
let forceFromKey = '';
/** @type {string} */
let forceGuidance = '';
/** @type {string} */
let forceSubject = '';
/** Guided incoming call panel on the Call screen (the signal bars, like the inbox's) */
let forceCallOpen = false;
let forceCallKey = '';
let forceCallGuidance = '';
/** @type {ReturnType<typeof setTimeout> | null} */
let forceCallTimer = null;
/** Character key selected on Memory screen */
let memoryCharKey = '';
/** When true, Memory list shows every mail (not only involving the character) */
let memoryShowAll = false;
/** Pending D-Mail propose draft */
let proposeFact = '';
let proposeSubject = '';
/** Divergence the pending Propose would land on (committed on Continue). */
let proposeDivergence = '';
/** Selected chat-context ids for D-Mail derive (compose) */
/** @type {Set<string>} */
let composeContextIds = new Set();
/** Snapshot of context candidates shown on compose */
/** @type {Array<{ id: string, name: string, text: string, index: number }>} */
let composeContextItems = [];
/** Pending character-card Apply confirmation (smooth rewrite) */
/** @type {{ characterName: string, base: string, next: string } | null} */
let pendingCardPreview = null;
/** After propose/accept, which hard writers still need confirm */
let pendingNeedLore = false;
let pendingNeedCard = false;
/** Selected lorebook name on the lore confirm screen */
let pendingLoreBookName = '';
let clockTimer = null;
let fitBound = false;
let overlayWired = false;
/** Prevent overlapping open/close animations */
let flipBusy = false;
let flipBusyAt = 0;
/** Bumped whenever the handset is rebuilt: a flip started before that must not touch the new one. */
let flipSeq = 0;

/**
 * True while the lid is moving. A flip never takes this long, so a flag left set by an
 * interrupted animation (the handset rebuilt mid-flip, a lost timer) is cleared here
 * instead of freezing the phone.
 */
function isFlipBusy() {
    if (flipBusy && Date.now() - flipBusyAt > FLIP_MS * 3) {
        flipBusy = false;
    }
    return flipBusy;
}

const KEYPAD = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['*', '0', '#'],
];

/** Kana printed on the SG001 keys (decorative; input stays Latin multi-tap). */
const KEY_KANA = Object.freeze({
    '1': 'あ', '2': 'か', '3': 'さ',
    '4': 'た', '5': 'な', '6': 'は',
    '7': 'ま', '8': 'や', '9': 'ら',
    '*': '゛', '0': 'わ', '#': '↲',
});

function keypadHtml() {
    return KEYPAD.map((row) => `
        <div class="pp-key-row">
            ${row.map((d) => `
                <button type="button" class="pp-key" data-digit="${d}" aria-label="${d} ${escapeHtml(KEY_LABELS[d])}">
                    <span class="pp-key-dash" aria-hidden="true"></span>
                    <span class="pp-key-kana" aria-hidden="true">${KEY_KANA[d]}</span>
                    <span class="pp-key-num">${d}</span>
                    <span class="pp-key-latin" aria-hidden="true">${escapeHtml(KEY_LABELS[d])}</span>
                </button>
            `).join('')}
        </div>
    `).join('');
}

/**
 * Navigation cluster of the SG001, traced from the reference photos.
 * Points live in a 200×124 box; each key's outline is drawn once in SVG and
 * reused as the clip-path of its transparent hit button.
 */
const NAV_BOX = { w: 200, h: 124 };
const NAV_KEYS = [
    { attrs: 'data-nav="up" aria-label="Up"', pts: [[62, 0], [138, 0], [128, 30], [72, 30]], mark: 'dash', at: [100, 14] },
    { attrs: 'id="pp-key-left" aria-label="Left soft key"', pts: [[4, 7], [60, 17], [74, 72], [6, 82]], mark: 'dash', at: [36, 45] },
    { attrs: 'id="pp-key-right" aria-label="Right soft key"', pts: [[196, 7], [140, 17], [126, 72], [194, 82]], mark: 'dash', at: [164, 45] },
    { attrs: 'id="pp-key-center" aria-label="OK"', pts: [[80, 36], [120, 36], [120, 70], [80, 70]], mark: '', at: [100, 53] },
    { attrs: 'class="pp-call-answer" aria-label="Call"', pts: [[6, 89], [78, 78], [70, 120], [8, 124]], mark: 'call', at: [40, 103] },
    { attrs: 'data-nav="down" aria-label="Down"', pts: [[82, 79], [118, 79], [126, 119], [74, 119]], mark: 'dash', at: [100, 100] },
    { attrs: 'class="pp-call-end" aria-label="End"', pts: [[194, 89], [122, 78], [130, 120], [192, 124]], mark: 'end', at: [160, 103] },
];

const HANDSET_PATH = 'M2 9.5C2 4 18 4 18 9.5L14.6 10.8L13.6 8.2C11.2 7.3 8.8 7.3 6.4 8.2L5.4 10.8Z';

function navMarkHtml(mark) {
    if (mark === 'dash') {
        return '<span class="pp-pad-dash"></span>';
    }
    if (mark === 'call') {
        return `<svg class="pp-pad-icon" viewBox="0 0 20 16"><path d="${HANDSET_PATH}" transform="rotate(-24 10 9)" /></svg>`;
    }
    if (mark === 'end') {
        return `<svg class="pp-pad-icon" viewBox="0 0 20 16"><path d="${HANDSET_PATH}" transform="translate(0 -2)" /><path d="M6 10.5h8l1.5 4h-11z" /></svg>`;
    }
    if (mark === 'arrow') {
        return '<span class="pp-pad-arrow"></span>';
    }
    if (mark === 'clear') {
        return '<span class="pp-pad-clear">C</span>';
    }
    return '';
}

/**
 * Round D-pad for candybar and slider bodies (Nokia / Sony Ericsson style):
 * soft keys up top, call and end below them, a four-way ring with OK in the middle
 * and a small clear key under the ring. Same ids and classes as the SG001 cluster.
 */
const DPAD_BOX = { w: 200, h: 122 };
const DPAD_C = [100, 50];

/** Points of a rounded rectangle. */
function roundRectPts(x, y, w, h, r, steps = 4) {
    const pts = [];
    const corners = [[x + w - r, y + r, -90], [x + w - r, y + h - r, 0], [x + r, y + h - r, 90], [x + r, y + r, 180]];
    for (const [cx, cy, a0] of corners) {
        for (let i = 0; i <= steps; i++) {
            const a = (a0 + (90 * i) / steps) * Math.PI / 180;
            pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
        }
    }
    return pts;
}

/** Points of a ring segment between two angles (degrees, 0 = right, clockwise). */
function ringPts(cx, cy, R, r, a1, a2, steps = 8) {
    const out = [];
    const inner = [];
    for (let i = 0; i <= steps; i++) {
        const a = (a1 + ((a2 - a1) * i) / steps) * Math.PI / 180;
        out.push([cx + R * Math.cos(a), cy + R * Math.sin(a)]);
        inner.unshift([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return out.concat(inner);
}

function circlePts(cx, cy, r, n = 20) {
    return Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    });
}

const DPAD_ARC = (mid) => ringPts(DPAD_C[0], DPAD_C[1], 46, 19, mid - 43, mid + 43);
const DPAD_KEYS = [
    { attrs: 'id="pp-key-left" aria-label="Left soft key"', pts: roundRectPts(4, 4, 46, 26, 11), mark: 'dash', at: [27, 17] },
    { attrs: 'id="pp-key-right" aria-label="Right soft key"', pts: roundRectPts(150, 4, 46, 26, 11), mark: 'dash', at: [173, 17] },
    { attrs: 'class="pp-call-answer" aria-label="Call"', pts: roundRectPts(4, 58, 44, 38, 14), mark: 'call', at: [26, 77] },
    { attrs: 'class="pp-call-end" aria-label="End"', pts: roundRectPts(152, 58, 44, 38, 14), mark: 'end', at: [174, 77] },
    { attrs: 'data-nav="up" aria-label="Up"', pts: DPAD_ARC(-90), mark: 'arrow', at: [100, 17], rot: 0 },
    { attrs: 'data-nav="right" aria-label="Right"', pts: DPAD_ARC(0), mark: 'arrow', at: [133, 50], rot: 90 },
    { attrs: 'data-nav="down" aria-label="Down"', pts: DPAD_ARC(90), mark: 'arrow', at: [100, 83], rot: 180 },
    { attrs: 'data-nav="left" aria-label="Left"', pts: DPAD_ARC(180), mark: 'arrow', at: [67, 50], rot: 270 },
    { attrs: 'id="pp-key-center" aria-label="OK"', pts: circlePts(DPAD_C[0], DPAD_C[1], 15), mark: '', at: DPAD_C },
    { attrs: 'data-nav="clear" aria-label="Clear"', pts: roundRectPts(82, 102, 36, 18, 8), mark: 'clear', at: [100, 111] },
];

const NAV_LAYOUTS = {
    wedge: { box: NAV_BOX, keys: NAV_KEYS, well: '' },
    // A recessed bezel around the ring
    dpad: { box: DPAD_BOX, keys: DPAD_KEYS, well: `<circle class="pp-nav-well" cx="${DPAD_C[0]}" cy="${DPAD_C[1]}" r="49" />` },
};

/** @param {'wedge' | 'dpad'} [layout] */
function navClusterHtml(layout = 'wedge') {
    const { box, keys, well } = NAV_LAYOUTS[layout];
    const pct = ([x, y]) => `${(x / box.w * 100).toFixed(2)}% ${(y / box.h * 100).toFixed(2)}%`;
    const pt = ([x, y]) => `${+x.toFixed(2)},${+y.toFixed(2)}`;
    const faces = keys.map((k) => `<polygon points="${k.pts.map(pt).join(' ')}" />`).join('');
    const buttons = keys.map((k) => {
        const attrs = k.attrs.includes('class="')
            ? k.attrs.replace('class="', 'class="pp-pad ')
            : `class="pp-pad" ${k.attrs}`;
        const rot = k.rot !== undefined ? ` --rot: ${k.rot}deg;` : '';
        const style = `clip-path: polygon(${k.pts.map(pct).join(', ')}); --cx: ${k.at[0] / box.w * 100}%; --cy: ${k.at[1] / box.h * 100}%;${rot}`;
        return `<button type="button" ${attrs} style="${style}"><span class="pp-pad-mark" aria-hidden="true">${navMarkHtml(k.mark)}</span></button>`;
    }).join('');
    return `
        <div class="pp-nav-cluster${layout === 'dpad' ? ' is-dpad' : ''}">
            <svg class="pp-nav-faces" viewBox="0 0 ${box.w} ${box.h}" aria-hidden="true">
                <defs>
                    <linearGradient id="pp-nav-sheen" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" style="stop-color: var(--pp-key-hi, #3a383b)" />
                        <stop offset="0.35" style="stop-color: var(--pp-key-face, #1d1b1e)" />
                        <stop offset="1" style="stop-color: var(--pp-key-lo, #0f0e10)" />
                    </linearGradient>
                </defs>
                ${well}
                ${faces}
            </svg>
            ${buttons}
        </div>
    `;
}

const SHORTCUT_ICONS = {
    mail: '<rect x="3" y="3" width="14" height="10" /><path d="M3 3L17 13M17 3L10 8.5" />',
    settings: '<path d="M10 6.5V13" /><circle cx="10" cy="3.8" r="0.9" class="pp-icon-fill" />',
    compose: '<path d="M2.5 4.5Q6.5 3 10 5Q13.5 3 17.5 4.5V12.5Q13.5 11 10 13Q6.5 11 2.5 12.5Z M10 5V13" />',
    wallpaper: '<rect x="3" y="4" width="14" height="9" /><circle cx="10" cy="8.5" r="2.2" />',
};

function shortcutHtml(goto, label) {
    return `<button type="button" class="pp-shortcut" data-goto="${goto}" title="${label}" aria-label="${label}"><svg class="pp-shortcut-icon" viewBox="0 0 20 16" aria-hidden="true">${SHORTCUT_ICONS[goto]}</svg></button>`;
}

const TRUSS_DIAGONALS = [
    [19, 9, 32, 31], [51, 31, 62, 9], [64, 9, 75, 31],
    [125, 31, 136, 9], [138, 9, 149, 31], [168, 31, 181, 9],
];

function trussHtml() {
    return `
        <svg class="pp-truss" viewBox="0 0 200 31" aria-hidden="true">
            <path class="pp-truss-frame" d="M3 31V7Q3 1 9 1H191Q197 1 197 7V31H190V9H10V31Z" />
            ${TRUSS_DIAGONALS.map(([x1, y1, x2, y2]) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />`).join('')}
        </svg>
    `;
}

/** @type {ReturnType<typeof createKeypadController> | null} */
let keypad = null;
/** The Time Leap Machine was opened from someone else's phone: keep their handset, return there. */
let tlmFromOther = false;
/** @type {HTMLInputElement | HTMLTextAreaElement | null} */
let lastFocusedField = null;

/** D-pad highlight: arrows move it through the screen, OK presses it. */
const navCursor = createNavCursor({
    getView: () => document.getElementById('pp-view'),
    onField: (el) => {
        lastFocusedField = el; // number keys type into the highlighted field
    },
});

/**
 * The spec of the handset being shown.
 * @returns {import('./phoneSpec.js').PhoneSpec}
 */
function activeSpec() {
    const other = screen === 'xphone' || (screen === 'timeleap' && tlmFromOther) ? otherPhoneOwner() : null;
    return other ? getPhoneSpec(other.key, other.name) : getPhoneSpec(USER_OWNER);
}

/**
 * Pick up someone else's phone (or be shown it). Opens the handset in their chassis.
 * @param {string} key owner key (avatar or npc:name)
 * @param {string} name
 * @param {{ mailId?: string }} [opts]
 */
export function openCharacterPhone(key, name, opts = {}) {
    startOtherPhone(key, name, opts);
    // Grabbing a phone shows its cover first; being shown a mail goes straight to the screen.
    const wantShut = !opts.mailId && getSettings().openShutFirst !== false;
    if (isPhoneOpen()) {
        screen = 'xphone';
        if (wantShut && !shut) {
            shut = true; // refreshChassis rebuilds straight into the shut state
        }
        refreshChassis();
        if (wantShut && !getOverlay()?.querySelector('.pp-phone.pp-shut')) {
            setFlipState('is-shut');
            setShut(true);
            requestAnimationFrame(measureShutShift);
        }
        render();
    } else {
        openPhone('xphone', { shut: wantShut });
    }
}

/** Off the Time Leap Machine: back to their phone if it was theirs, else your home screen. */
function leaveTimeleap() {
    screen = tlmFromOther && otherPhoneOwner() ? 'xphone' : 'home';
    tlmFromOther = false;
}

/** Hand their phone back: your own handset returns. */
function exitCharacterPhone() {
    stopOtherPhone();
    screen = 'home';
    refreshChassis();
    render();
}

/** @param {import('./phoneSpec.js').PhoneSpec} spec */
function specKey(spec) {
    return JSON.stringify(spec);
}

function shortcutsHtml() {
    return `
        <div class="pp-hinge" role="toolbar" aria-label="Shortcuts">
            <span class="pp-hinge-cap pp-hinge-cap-l" aria-hidden="true"></span>
            ${shortcutHtml('mail', 'Mail')}
            ${shortcutHtml('settings', 'Settings')}
            ${shortcutHtml('compose', 'New mail')}
            ${shortcutHtml('wallpaper', 'Wallpaper')}
            <span class="pp-hinge-cap pp-hinge-cap-r" aria-hidden="true"></span>
        </div>
    `;
}

/**
 * Where the parts sit depends on the body:
 * - flip: lid (screen) · hinge (shortcuts) · base (wedge keys + keypad)
 * - bar: one slab; the lower section (shortcuts, D-pad, keypad) lives inside the face
 * - slider: the sliding slab carries the screen and D-pad; the lower half hides the shortcuts and keypad
 * @param {import('./phoneSpec.js').PhoneSpec} spec
 */
function baseHtml(spec) {
    const body = spec.body;
    const nav = body === 'slider' ? '' : navClusterHtml(body === 'bar' ? 'dpad' : 'wedge');
    return `
        <div class="pp-base">
            ${stickersHtml(spec, 'base')}
            ${body === 'bar' ? shortcutsHtml() : ''}
            <div class="pp-keydeck">
                ${nav}
                <div class="pp-keypad" aria-label="Keypad">
                    ${keypadHtml()}
                </div>
            </div>
            ${body === 'bar' || body === 'slider' ? '<span class="pp-mic" aria-hidden="true"></span>' : ''}
        </div>
    `;
}

function buildPhoneInnerHtml(spec = activeSpec()) {
    const style = chassisStyle(spec);
    const bar = spec.body === 'bar';
    return `
        <div class="pp-scale-wrap" id="pp-scale-wrap">
            <div class="pp-phone" aria-label="Phone Trigger" ${chassisAttrs(spec)} ${style ? `style="${style}"` : ''}>
                <button type="button" id="pp-close-corner" class="pp-close-corner" title="Close" aria-label="Close"></button>
                ${charmHtml(spec)}
                <div class="pp-chassis" aria-label="Phone Trigger">
                    <div class="pp-flip is-closed" id="pp-flip">
                        <div class="pp-lid">
                            ${spec.crown === 'truss' ? trussHtml() : ''}
                            <div class="pp-lid-face">
                                ${decoHtml(spec, 'front')}
                                ${stickersHtml(spec, 'front')}
                                <div class="pp-ear-row" aria-hidden="true">
                                    <span class="pp-cam"></span>
                                    <span class="pp-earpiece"><span></span></span>
                                    ${brandHtml(spec)}
                                </div>
                                <div class="pp-screen">
                                    <div class="pp-lcd">
                                        <div class="pp-status">
                                            <span id="pp-signal" class="pp-signal" aria-hidden="true">▂▄▆█</span>
                                            <span id="pp-clock">--:--</span>
                                            <span id="pp-batt" class="pp-batt" aria-hidden="true">▮▮▮</span>
                                        </div>
                                        <div id="pp-view" class="pp-view"></div>
                                        <div class="pp-softbar" aria-hidden="true">
                                            <span id="pp-soft-left"></span>
                                            <span id="pp-soft-right"></span>
                                        </div>
                                    </div>
                                    <div class="pp-chin" aria-hidden="true">
                                        <i></i><i></i><b></b><i></i><i></i>
                                        <button type="button" class="pp-home-btn" id="pp-home-btn" tabindex="-1" aria-label="Home"></button>
                                    </div>
                                </div>
                                ${spec.body === 'slider' ? navClusterHtml('dpad') : ''}
                                ${bar ? baseHtml(spec) : ''}
                            </div>
                            <div class="pp-lid-back" aria-hidden="true">${spec.body === 'flip' ? coverHtml(spec) : ''}</div>
                        </div>
                        ${bar ? '' : shortcutsHtml()}
                        ${bar ? '' : baseHtml(spec)}
                    </div>
                    ${spec.body === 'flip' ? '' : backHtml(spec)}
                </div>
                <div class="pp-shut-hint" aria-hidden="true">tap or swipe up to open</div>
            </div>
        </div>
    `;
}

function getOverlay() {
    return document.getElementById('pp-overlay');
}

function isTouchBody() {
    return getOverlay()?.querySelector('.pp-phone')?.getAttribute('data-body') === 'touch';
}

export function isPhoneOpen() {
    const overlay = getOverlay();
    if (!overlay) {
        return false;
    }
    if (typeof overlay.open === 'boolean') {
        return overlay.open;
    }
    return !!root?.classList.contains('pp-open');
}

/**
 * Same approach as Killer-Within investigator hub on S25 Ultra:
 * size the shell to the live visual viewport and pin inset 0 / transform none.
 * Do NOT add visualViewport.offsetTop — Chrome/Samsung already treat fixed as VV-relative.
 */
function getViewportBox() {
    const vv = window.visualViewport;
    const vvWidth = Number(vv?.width);
    const vvHeight = Number(vv?.height);
    const layoutWidth = Math.min(
        Number(window.innerWidth) || Infinity,
        Number(document.documentElement?.clientWidth) || Infinity,
    );
    const layoutHeight = Math.min(
        Number(window.innerHeight) || Infinity,
        Number(document.documentElement?.clientHeight) || Infinity,
    );
    const width = Math.max(
        1,
        Math.round(
            Number.isFinite(vvWidth) && vvWidth > 0
                ? Math.min(vvWidth, layoutWidth || vvWidth)
                : (layoutWidth || window.innerWidth || 1),
        ),
    );
    const height = Math.max(
        1,
        Math.round(
            Number.isFinite(vvHeight) && vvHeight > 0
                ? Math.min(vvHeight, layoutHeight || vvHeight)
                : (layoutHeight || window.innerHeight || 1),
        ),
    );
    return { width, height };
}

function applyOverlayViewportBox(overlay) {
    if (!overlay) {
        return;
    }
    const box = getViewportBox();
    const set = (name, value) => {
        overlay.style.setProperty(name, value, 'important');
    };
    set('position', 'fixed');
    set('inset', '0');
    set('left', '0');
    set('top', '0');
    set('right', '0');
    set('bottom', '0');
    set('width', '100%');
    set('height', `${box.height}px`);
    set('max-width', '100%');
    set('max-height', `${box.height}px`);
    set('min-width', '0');
    set('min-height', '0');
    set('margin', '0');
    set('padding', '0');
    set('border', '0');
    set('transform', 'none');
    set('overflow', 'visible');
    set('box-sizing', 'border-box');
    // Do NOT set display here — dialog open/close owns visibility.
    // Inline display:!important was keeping the phone on screen after close().
    set('visibility', 'visible');
    set('opacity', '1');
    set('pointer-events', 'auto');
    set('z-index', '2147483646');
}

/** Scale chassis inside the top-layer dialog so the full handset fits. */
export function fitPhoneToViewport() {
    const scaleWrap = document.getElementById('pp-scale-wrap');
    const chassis = document.querySelector('.pp-chassis');
    const overlay = getOverlay();
    if (!scaleWrap || !chassis || !isPhoneOpen()) {
        return;
    }

    scaleWrap.style.transform = 'none';
    scaleWrap.style.setProperty('--pp-scale', '1');
    void chassis.offsetHeight;
    measureSlide();

    const box = getViewportBox();
    const pad = 16;
    const availW = Math.max(120, box.width - pad * 2);
    const availH = Math.max(160, box.height - pad * 2);

    const w = chassis.offsetWidth || 1;
    const h = (chassis.offsetHeight || 1) + 20;
    const scale = Math.min(1, availW / w, availH / h);
    scaleWrap.style.setProperty('--pp-scale', String(scale));
    scaleWrap.style.transform = `scale(${scale})`;

    if (overlay) {
        applyOverlayViewportBox(overlay);
    }
}

/** Slider: how far the slab travels to cover the keys (the whole lower half). */
function measureSlide() {
    const flip = /** @type {HTMLElement | null} */ (getFlip());
    if (!flip || flip.closest('.pp-phone')?.getAttribute('data-body') !== 'slider') {
        return;
    }
    const lid = /** @type {HTMLElement | null} */ (flip.querySelector('.pp-lid'));
    if (lid) {
        flip.style.setProperty('--pp-slide', `${Math.max(0, flip.offsetHeight - lid.offsetHeight)}px`);
    }
}

function presentOverlay(overlay) {
    if (!overlay) {
        return;
    }
    applyOverlayViewportBox(overlay);
    try {
        if (typeof overlay.showModal === 'function') {
            if (!overlay.open) {
                overlay.showModal();
            }
            return;
        }
    } catch (err) {
        console.warn('[Phone Trigger] dialog.showModal failed; using open attribute', err);
    }
    try {
        overlay.setAttribute('open', '');
        overlay.open = true;
    } catch (_err) {
        overlay.hidden = false;
    }
}

function clearOverlayInlineStyles(overlay) {
    if (!overlay?.style) {
        return;
    }
    // Remove every property we may have forced — especially display.
    const names = [
        'position', 'inset', 'left', 'top', 'right', 'bottom',
        'width', 'height', 'max-width', 'max-height', 'min-width', 'min-height',
        'margin', 'padding', 'border', 'transform', 'overflow', 'box-sizing',
        'display', 'visibility', 'opacity', 'pointer-events', 'z-index',
    ];
    for (const name of names) {
        overlay.style.removeProperty(name);
    }
}

function dismissOverlay(overlay) {
    if (!overlay) {
        return;
    }
    try {
        if (typeof overlay.close === 'function' && overlay.open) {
            overlay.close();
        }
    } catch (_err) {
        // ignore
    }
    try {
        overlay.removeAttribute('open');
        overlay.open = false;
    } catch (_err) {
        // ignore
    }
    overlay.hidden = true;
    clearOverlayInlineStyles(overlay);
}

function getFlip() {
    return document.getElementById('pp-flip');
}

function setFlipState(state) {
    const flip = getFlip();
    if (!flip) {
        return;
    }
    flip.classList.remove('is-closed', 'is-opening', 'is-open', 'is-closing', 'is-shut');
    if (state) {
        flip.classList.add(state);
    }
}

function waitFlipMs(ms = FLIP_MS) {
    return new Promise((resolve) => {
        const lid = getOverlay()?.querySelector('.pp-lid');
        let done = false;
        const finish = () => {
            if (done) {
                return;
            }
            done = true;
            lid?.removeEventListener('transitionend', onEnd);
            resolve();
        };
        const onEnd = (e) => {
            if (e.target === lid && e.propertyName === 'transform') {
                finish();
            }
        };
        lid?.addEventListener('transitionend', onEnd);
        setTimeout(finish, ms + 80);
    });
}

function bindFitListeners() {
    if (fitBound) {
        return;
    }
    fitBound = true;
    const refit = () => {
        if (isPhoneOpen()) {
            requestAnimationFrame(() => {
                applyOverlayViewportBox(getOverlay());
                fitPhoneToViewport();
            });
        }
        if (!chipDragActive) {
            const chip = document.getElementById('pp-mail-chip');
            if (chip && !chip.hidden) {
                applyChipPosition(chip);
            }
        }
    };
    window.addEventListener('resize', refit);
    window.addEventListener('orientationchange', refit);
    window.visualViewport?.addEventListener('resize', refit);
    // Do NOT listen to visualViewport scroll / offsetTop — that double-offsets on Samsung Chrome.
}

function wireOverlayHandlers(overlay) {
    if (!overlay || overlayWired) {
        return;
    }
    overlayWired = true;
    overlay.addEventListener('cancel', (e) => {
        e.preventDefault();
        closePhone();
    });
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closePhone();
        }
    });
}

function bindChromeControls(scope) {
    $(scope).find('#pp-close-corner').off('click.pp').on('click.pp', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closePhone();
    });
    $(scope).find('#pp-key-right').off('click.pp').on('click.pp', () => {
        if (typingField()) {
            keypad?.backspace();
            syncClearLabel();
            return;
        }
        navigateBack();
    });
    // Touch bodies have no keys: the on-screen soft captions and the home button take over.
    $(scope).find('#pp-soft-left').off('click.pp').on('click.pp', () => {
        if (isTouchBody()) {
            softLeft();
        }
    });
    $(scope).find('#pp-soft-right').off('click.pp').on('click.pp', () => {
        if (isTouchBody()) {
            navigateBack();
        }
    });
    $(scope).find('#pp-home-btn').off('click.pp').on('click.pp', () => {
        if (screen === 'call' || screen === 'timeleap') {
            return;
        }
        if (screen === 'xphone') {
            otherPhoneShortcut('home');
            render();
            return;
        }
        screen = 'home';
        render();
    });
    $(scope).find('#pp-key-left').off('click.pp').on('click.pp', () => softLeft());
    $(scope).find('#pp-key-center').off('click.pp').on('click.pp', () => softCenter());
    $(scope).find('.pp-call-answer').off('click.pp').on('click.pp', (e) => {
        e.preventDefault();
        e.stopPropagation();
        void onCallAnswerPress();
    });
    $(scope).find('.pp-call-end').off('click.pp').on('click.pp', (e) => {
        e.preventDefault();
        e.stopPropagation();
        onCallEndPress();
    });
    // Nav keys must not steal focus from a field being edited (left/right move its caret).
    scope.querySelectorAll('[data-nav], #pp-key-center, #pp-key-right').forEach((btn) => {
        btn.addEventListener('mousedown', (e) => e.preventDefault());
    });
    scope.querySelectorAll('[data-nav]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const dir = btn.getAttribute('data-nav');
            if (dir === 'clear') {
                keypad?.backspace();
            } else if (dir) {
                navCursor.move(dir);
            }
        });
    });
    scope.querySelectorAll('.pp-shortcut[data-goto]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const next = btn.getAttribute('data-goto') || 'home';
            if (screen === 'timeleap' && tlmFromOther && !isTimeleapBusy()) {
                resetTimeleapApp();
                leaveTimeleap(); // shortcuts on their phone stay on their phone
            }
            if (screen === 'xphone') {
                otherPhoneShortcut(next);
                render();
                return;
            }
            if (screen === 'inbox' && next !== 'inbox') {
                forcePanelOpen = false;
            }
            screen = next;
            if (screen === 'compose') {
                composeSubject = '';
                composeBody = '';
                composeReplyTo = null;
                composeToKey = '';
                composeNoReply = false;
            }
            render();
        });
    });

    wireKeypad(scope);
    wireFieldFocusTracking(scope);
    wireShutGestures(scope);
}

function wireFieldFocusTracking(scope) {
    const viewHost = scope.querySelector('#pp-view') || scope;
    // Touching the screen hands control back from the D-pad.
    viewHost.addEventListener('pointerdown', () => navCursor.clear());
    // The right soft key reads Clear while you type (phones without a C key).
    viewHost.addEventListener('input', syncClearLabel);
    viewHost.addEventListener('focusin', syncClearLabel);
    viewHost.addEventListener('focusout', () => setTimeout(syncClearLabel, 0));
    viewHost.addEventListener('focusin', (e) => {
        const t = e.target;
        if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) {
            lastFocusedField = t;
        }
    });
}

function getKeypadTarget() {
    if (lastFocusedField && document.contains(lastFocusedField)) {
        const tag = lastFocusedField.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') {
            return lastFocusedField;
        }
    }
    const view = document.getElementById('pp-view');
    if (!view) {
        return null;
    }
    return /** @type {HTMLInputElement | HTMLTextAreaElement | null} */ (
        view.querySelector('textarea:not([disabled]), input[type="text"]:not([disabled]), input:not([type]):not([disabled])')
    );
}

function wireKeypad(scope) {
    if (!keypad) {
        keypad = createKeypadController({ getTarget: getKeypadTarget });
    }
    scope.querySelectorAll('.pp-key[data-digit]').forEach((btn) => {
        if (btn.getAttribute('data-pp-keypad') === '1') {
            return;
        }
        btn.setAttribute('data-pp-keypad', '1');
        let pressTimer = 0;
        let longFired = false;

        const clearPress = () => {
            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = 0;
            }
        };

        btn.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            longFired = false;
            const digit = btn.getAttribute('data-digit') || '';
            clearPress();
            pressTimer = globalThis.setTimeout(() => {
                longFired = true;
                keypad?.longPress(digit);
            }, LONG_PRESS_MS);
        });
        btn.addEventListener('pointerup', (e) => {
            e.preventDefault();
            const digit = btn.getAttribute('data-digit') || '';
            clearPress();
            if (!longFired) {
                keypad?.tap(digit);
            }
        });
        btn.addEventListener('pointerleave', clearPress);
        btn.addEventListener('pointercancel', clearPress);
        // Prevent focus steal from text fields
        btn.addEventListener('mousedown', (e) => e.preventDefault());
    });
}

export function initPhoneChrome() {
    let wrap = document.getElementById('pp-phone-root');
    let overlay = getOverlay();

    const needsRebuild = overlay && (
        String(overlay.tagName || '').toUpperCase() !== 'DIALOG'
        || !overlay.querySelector('.pp-flip')
        || !overlay.querySelector('#pp-scale-wrap')
        || overlay.querySelector('#pp-close')
        || !overlay.querySelector('#pp-close-corner')
        || overlay.getAttribute('data-pp-chrome') !== '5'
    );
    if (needsRebuild) {
        dismissOverlay(overlay);
        overlay.remove();
        overlay = null;
        overlayWired = false;
    }

    if (!wrap) {
        wrap = document.createElement('div');
        wrap.id = 'pp-phone-root';
        document.body.appendChild(wrap);
    }

    // Remove legacy FAB if present
    document.getElementById('pp-fab')?.remove();

    // Chip lives on document.body (not inside #pp-phone-root) so position:fixed
    // is always viewport-relative — avoids % top collapsing to 0 in empty parents.
    let chip = document.getElementById('pp-mail-chip');
    if (!chip) {
        chip = document.createElement('button');
        chip.type = 'button';
        chip.id = 'pp-mail-chip';
        chip.className = 'pp-mail-chip';
        chip.title = 'Open Phone Trigger — drag to move';
        chip.setAttribute('aria-label', 'Open mail');
        chip.innerHTML = `
            <span class="pp-mail-chip-sig" aria-hidden="true">▂▄▆█</span>
            <span class="pp-mail-chip-label">MAIL</span>
            <span id="pp-mail-chip-count" class="pp-mail-chip-count" hidden>0</span>
        `;
        document.body.appendChild(chip);
    } else if (chip.parentElement !== document.body) {
        document.body.appendChild(chip);
    }

    root = wrap;
    wireMailChip(chip);

    if (!overlay) {
        overlay = document.createElement('dialog');
        overlay.id = 'pp-overlay';
        overlay.className = 'pp-overlay';
        overlay.setAttribute('aria-label', 'Phone Trigger');
        overlay.setAttribute('data-pp-chrome', '5');
        const spec = activeSpec();
        overlay.setAttribute('data-spec', specKey(spec));
        overlay.innerHTML = buildPhoneInnerHtml(spec);
        document.body.appendChild(overlay);
        bindChromeControls(overlay);
        wireOverlayHandlers(overlay);
    }

    bindFitListeners();
    updateFabVisibility();
    updateBadge();

    setCallChangeHandler(() => {
        updateOuter();
        if (!isPhoneOpen()) {
            return;
        }
        if (screen === 'call' || screen === 'home') {
            render();
        }
    });

    setCallInitiativeIncomingHandler(() => presentIncomingCall());
}

/** Put a freshly ringing call in front of the user. */
function presentIncomingCall() {
    if (isPhoneOpen()) {
        // Ringing takes over the screen, even from someone else's phone or TLM.EXE.
        if (screen === 'xphone' || screen === 'timeleap') {
            openPhone('call');
            return;
        }
        screen = 'call';
        render();
        return;
    }
    if (getSettings().callInitiativeAutoOpen !== false) {
        openPhone('call');
    }
}

/**
 * Make a character ring you shortly, about whatever you guide them to.
 * @param {import('./store.js').MailContact} contact
 * @param {string} guidance
 * @returns {number} seconds until it rings
 */
function scheduleForcedCall(contact, guidance) {
    if (forceCallTimer) {
        clearTimeout(forceCallTimer);
    }
    const secs = 2 + Math.random() * 4;
    forceCallTimer = setTimeout(() => {
        forceCallTimer = null;
        if (isCallActive()) {
            toast(`${contact.name} tried to call — line busy`, 'info', 'CALL');
            return;
        }
        try {
            beginIncomingCall(contact, { reason: guidance });
            presentIncomingCall();
        } catch (err) {
            toast(err?.message || 'Call failed', 'error', 'CALL');
        }
    }, secs * 1000);
    return Math.round(secs);
}

/** @type {WeakSet<HTMLElement>} */
const wiredChips = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
let chipWiredFlag = false;
/** Skip position re-apply while the user is dragging. */
let chipDragActive = false;

/**
 * @param {HTMLElement|null} chip
 */
function wireMailChip(chip) {
    if (!chip) {
        return;
    }
    if (wiredChips) {
        if (wiredChips.has(chip)) {
            if (!chipDragActive) {
                applyChipPosition(chip);
            }
            return;
        }
        wiredChips.add(chip);
    } else if (chipWiredFlag) {
        if (!chipDragActive) {
            applyChipPosition(chip);
        }
        return;
    } else {
        chipWiredFlag = true;
    }

    applyChipPosition(chip);

    let pointerId = null;
    let dragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let originLeft = 0;
    let originTop = 0;
    let chipW = 80;
    let chipH = 28;

    const onMove = (ev) => {
        if (!dragging || ev.pointerId !== pointerId) {
            return;
        }
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
            moved = true;
            chipDragActive = true;
            chip.classList.add('pp-mail-chip-dragging', 'pp-mail-chip-placed');
        }
        if (!moved) {
            return;
        }
        ev.preventDefault();
        const vw = window.innerWidth || 1;
        const vh = window.innerHeight || 1;
        let left = originLeft + dx;
        let top = originTop + dy;
        left = Math.max(4, Math.min(vw - chipW - 4, left));
        top = Math.max(4, Math.min(vh - chipH - 4, top));
        chip.style.setProperty('left', `${Math.round(left)}px`, 'important');
        chip.style.setProperty('top', `${Math.round(top)}px`, 'important');
        chip.style.setProperty('right', 'auto', 'important');
        chip.style.setProperty('bottom', 'auto', 'important');
        chip.style.setProperty('transform', 'none', 'important');
    };

    const onUp = (ev) => {
        if (ev.pointerId !== pointerId) {
            return;
        }
        try {
            chip.releasePointerCapture(pointerId);
        } catch {
            /* ignore */
        }
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        pointerId = null;
        dragging = false;
        chip.classList.remove('pp-mail-chip-dragging');

        if (moved) {
            const rect = chip.getBoundingClientRect();
            const vw = window.innerWidth || 1;
            const vh = window.innerHeight || 1;
            const s = getSettings();
            s.mailChipPlaced = true;
            s.mailChipX = Math.round((rect.left / vw) * 1000) / 10;
            s.mailChipY = Math.round((rect.top / vh) * 1000) / 10;
            saveSettings();
            chipDragActive = false;
            applyChipPosition(chip);
            return;
        }

        chipDragActive = false;
        // Tap — open phone / inbox
        const unread = getUnreadCount();
        if (unread > 0) {
            openInbox();
        } else {
            togglePhone();
        }
    };

    chip.addEventListener('pointerdown', (ev) => {
        if (ev.button != null && ev.button !== 0) {
            return;
        }
        pointerId = ev.pointerId;
        dragging = true;
        moved = false;
        startX = ev.clientX;
        startY = ev.clientY;
        const rect = chip.getBoundingClientRect();
        originLeft = rect.left;
        originTop = rect.top;
        chipW = rect.width || chip.offsetWidth || 80;
        chipH = rect.height || chip.offsetHeight || 28;
        try {
            chip.setPointerCapture(pointerId);
        } catch {
            /* ignore */
        }
        window.addEventListener('pointermove', onMove, { passive: false });
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    });
}

/**
 * @param {HTMLElement} chip
 */
function applyChipPosition(chip) {
    if (chipDragActive) {
        return;
    }
    const s = getSettings();
    const placed = s.mailChipPlaced === true
        || (s.mailChipX != null && s.mailChipY != null
            && Number.isFinite(Number(s.mailChipX))
            && Number.isFinite(Number(s.mailChipY)));

    if (!placed) {
        chip.classList.remove('pp-mail-chip-placed');
        chip.style.removeProperty('left');
        chip.style.removeProperty('top');
        chip.style.removeProperty('right');
        chip.style.removeProperty('bottom');
        chip.style.removeProperty('transform');
        return;
    }

    const vw = window.innerWidth || 1;
    const vh = window.innerHeight || 1;
    const w = chip.offsetWidth || 80;
    const h = chip.offsetHeight || 28;
    let left = (Number(s.mailChipX) / 100) * vw;
    let top = (Number(s.mailChipY) / 100) * vh;
    left = Math.max(4, Math.min(vw - w - 4, left));
    top = Math.max(4, Math.min(vh - h - 4, top));

    chip.classList.add('pp-mail-chip-placed');
    chip.style.setProperty('left', `${Math.round(left)}px`, 'important');
    chip.style.setProperty('top', `${Math.round(top)}px`, 'important');
    chip.style.setProperty('right', 'auto', 'important');
    chip.style.setProperty('bottom', 'auto', 'important');
    chip.style.setProperty('transform', 'none', 'important');
}

export function resetMailChipPosition() {
    const s = getSettings();
    s.mailChipPlaced = false;
    s.mailChipX = null;
    s.mailChipY = null;
    saveSettings();
    const chip = document.getElementById('pp-mail-chip');
    if (chip) {
        applyChipPosition(chip);
    }
}

export function updateFabVisibility() {
    const settings = getSettings();
    const chip = document.getElementById('pp-mail-chip');
    const showChip = settings.enabled && settings.showMailChip !== false;

    if (chip) {
        chip.hidden = !showChip;
        chip.style.display = showChip ? '' : 'none';
        if (showChip && !chipDragActive) {
            applyChipPosition(chip);
        }
    }
    document.getElementById('pp-fab')?.remove();
    updateBadge();
}

export function updateBadge() {
    const n = getUnreadCount();
    const label = n > 9 ? '9+' : String(n);

    const chip = document.getElementById('pp-mail-chip');
    const chipCount = document.getElementById('pp-mail-chip-count');
    if (chipCount) {
        if (n > 0) {
            chipCount.hidden = false;
            chipCount.textContent = label;
        } else {
            chipCount.hidden = true;
        }
    }
    chip?.classList.toggle('pp-mail-chip-alert', n > 0);
    updateOuter();
}

export function togglePhone() {
    if (isPhoneOpen()) {
        closePhone();
    } else {
        userOpenPhone();
    }
}

// —— Shut / unfold / fold ——

/** The phone is open in the dialog but folded shut (cover up). */
let shut = false;

export function isPhoneShut() {
    return shut;
}

/** @param {boolean} on */
function setShut(on) {
    shut = on;
    getOverlay()?.querySelector('.pp-phone')?.classList.toggle('pp-shut', on);
    updateOuter();
}

/**
 * Centre the folded flip phone: the lid folds down over the base, so shift the body up.
 */
function measureShutShift() {
    const flip = /** @type {HTMLElement | null} */ (getFlip());
    const lid = /** @type {HTMLElement | null} */ (flip?.querySelector('.pp-lid'));
    if (!flip || !lid) {
        return;
    }
    const lidH = lid.offsetHeight;
    const shift = flip.offsetHeight / 2 - 1.5 * lidH + lidH * 0.08;
    flip.style.setProperty('--pp-shut-shift', `${Math.round(shift)}px`);
    // The base is a little longer than the lid: hide what would peek out below it.
    const base = /** @type {HTMLElement | null} */ (flip.querySelector('.pp-base'));
    if (base) {
        // A truss crown is not drawn from behind, so the folded cover ends a truss short.
        const face = /** @type {HTMLElement | null} */ (lid.querySelector('.pp-lid-face'));
        const trussH = face?.offsetTop || 0; // the face starts below the crown (an SVG, so measure it this way)
        const below = base.offsetTop + base.offsetHeight - (2 * lidH - trussH);
        flip.style.setProperty('--pp-shut-clip', `${Math.max(0, Math.round(below + 2))}px`);
    }
}

/** Open a shut phone. */
export function unfoldPhone() {
    if (!shut || isFlipBusy()) {
        return;
    }
    flipBusy = true;
    flipBusyAt = Date.now();
    setShut(false);
    setFlipState('is-opening');
    const seq = flipSeq;
    waitFlipMs().then(() => {
        if (seq !== flipSeq) {
            return;
        }
        setFlipState('is-open');
        flipBusy = false;
        fitPhoneToViewport();
    });
}

/** Fold an open phone shut, keeping it in your hand. */
export function foldPhone() {
    if (shut || isFlipBusy() || !isPhoneOpen()) {
        return;
    }
    flipBusy = true;
    flipBusyAt = Date.now();
    measureShutShift();
    setFlipState('is-shut');
    setShut(true);
    const seq = flipSeq;
    waitFlipMs().then(() => {
        if (seq === flipSeq) {
            flipBusy = false;
        }
    });
}

/** Outer display on flip covers: clock, unread mail, a ringing caller. */
export function updateOuter() {
    const overlay = getOverlay();
    const clock = overlay?.querySelector('[data-outer="clock"]');
    if (!clock) {
        return;
    }
    const d = new Date();
    clock.textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const info = overlay.querySelector('[data-outer="info"]');
    const outer = overlay.querySelector('.pp-outer');
    const call = getCallSession();
    const ringing = call.status === 'ringing';
    let text = '';
    if (ringing) {
        text = `☎ ${call.contact?.name || ''}`;
    } else if (call.status === 'connected') {
        text = '☎ ●';
    } else if (screen !== 'xphone') {
        const n = getUnreadCount();
        text = n ? `✉ ${n > 9 ? '9+' : n}` : '';
    }
    if (info) {
        info.textContent = text;
    }
    outer?.classList.toggle('pp-outer-ringing', ringing);
}

/**
 * Tap or swipe up on a shut phone to open it; fold controls on an open one.
 * @param {HTMLElement} scope
 */
function wireShutGestures(scope) {
    const phoneEl = /** @type {HTMLElement | null} */ (scope.querySelector('.pp-phone'));
    if (!phoneEl || phoneEl.getAttribute('data-pp-gestures') === '1') {
        return;
    }
    phoneEl.setAttribute('data-pp-gestures', '1');

    // Any press on a shut phone opens it (the close corner still closes).
    phoneEl.addEventListener('click', (e) => {
        if (!shut) {
            return;
        }
        const t = /** @type {HTMLElement} */ (e.target);
        if (t.closest('#pp-close-corner')) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        if (!swipeConsumed) {
            unfoldPhone();
        }
        swipeConsumed = false;
    }, true);

    // Swipe up: the lid follows your finger.
    /** @type {{ id: number, y0: number, h: number, flip: boolean } | null} */
    let drag = null;
    let swipeConsumed = false;
    const lidEl = () => /** @type {HTMLElement | null} */ (phoneEl.querySelector('.pp-lid'));
    const chassisEl = () => /** @type {HTMLElement | null} */ (phoneEl.querySelector('.pp-chassis'));
    const flipEl = () => /** @type {HTMLElement | null} */ (phoneEl.querySelector('.pp-flip'));
    const clearInline = () => {
        for (const el of [lidEl(), chassisEl(), flipEl()]) {
            if (el) {
                el.style.transition = '';
                el.style.transform = '';
            }
        }
    };
    phoneEl.addEventListener('pointerdown', (e) => {
        if (!shut || isFlipBusy() || /** @type {HTMLElement} */ (e.target).closest('#pp-close-corner')) {
            return;
        }
        const isFlip = phoneEl.getAttribute('data-body') === 'flip';
        drag = { id: e.pointerId, y0: e.clientY, h: (lidEl()?.getBoundingClientRect().height || 300), flip: isFlip };
        swipeConsumed = false;
    });
    phoneEl.addEventListener('pointermove', (e) => {
        if (!drag || e.pointerId !== drag.id) {
            return;
        }
        const dy = drag.y0 - e.clientY;
        if (dy < 6 && !swipeConsumed) {
            return;
        }
        if (!swipeConsumed) {
            swipeConsumed = true;
            try {
                phoneEl.setPointerCapture(e.pointerId);
            } catch {
                /* ignore */
            }
        }
        const p = Math.max(0, Math.min(1, dy / (drag.h * 0.6)));
        if (drag.flip) {
            const lid = lidEl();
            const flip = flipEl();
            const shift = parseFloat(flip?.style.getPropertyValue('--pp-shut-shift') || '0') || 0;
            if (lid) {
                lid.style.transition = 'none';
                lid.style.transform = `translateZ(${20 * (1 - p)}px) rotateX(${-180 + 180 * p}deg)`;
            }
            if (flip) {
                flip.style.transition = 'none';
                flip.style.transform = `translateY(${shift * (1 - p)}px)`;
            }
        } else {
            const ch = chassisEl();
            if (ch) {
                ch.style.transition = 'none';
                ch.style.transform = `rotateY(${180 - 180 * p}deg)`;
            }
        }
        drag.p = p;
    });
    const end = (e) => {
        if (!drag || e.pointerId !== drag.id) {
            return;
        }
        const p = drag.p || 0;
        const moved = swipeConsumed;
        drag = null;
        if (!moved) {
            return; // a tap: the click handler opens it
        }
        // Let the class transitions take over from wherever the finger left the lid.
        requestAnimationFrame(() => {
            clearInline();
            if (p > 0.35) {
                unfoldPhone();
            }
        });
    };
    phoneEl.addEventListener('pointerup', end);
    phoneEl.addEventListener('pointercancel', end);

    // Fold shut: the earpiece edge, the truss, the hinge end caps, or a long press on the home button.
    const fold = (e) => {
        if (shut) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        foldPhone();
    };
    phoneEl.querySelectorAll('.pp-ear-row, .pp-truss, .pp-hinge-cap').forEach((el) => {
        el.addEventListener('click', fold);
    });
    const home = phoneEl.querySelector('#pp-home-btn');
    /** @type {ReturnType<typeof setTimeout> | null} */
    let hold = null;
    home?.addEventListener('pointerdown', () => {
        hold = setTimeout(() => {
            hold = null;
            foldPhone();
        }, 600);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => home?.addEventListener(ev, () => {
        if (hold) {
            clearTimeout(hold);
            hold = null;
        }
    }));
}

/**
 * Rebuild the handset when the active phone's spec changed (new design, another owner).
 * Safe while open: the new body appears already unfolded on the same screen.
 */
export function refreshChassis() {
    const overlay = getOverlay();
    if (!overlay) {
        return;
    }
    const spec = activeSpec();
    const key = specKey(spec);
    if (overlay.getAttribute('data-spec') === key) {
        return;
    }
    const open = isPhoneOpen();
    overlay.setAttribute('data-spec', key);
    overlay.innerHTML = buildPhoneInnerHtml(spec);
    if (open) {
        // Whatever flip was running belonged to the old handset; the new one is placed at rest below.
        flipSeq++;
        flipBusy = false;
    }
    bindChromeControls(overlay);
    tickClock();
    if (open) {
        if (shut) {
            setFlipState('is-shut');
            setShut(true);
            requestAnimationFrame(measureShutShift);
        } else {
            setFlipState('is-open');
        }
        render();
        requestAnimationFrame(fitPhoneToViewport);
    }
}

/**
 * Open the handset because the user asked to (chip, wand, /phone, grabbing a phone):
 * it starts shut, showing its cover, unless that is turned off.
 * @param {string} [targetScreen]
 */
export function userOpenPhone(targetScreen = 'home') {
    openPhone(targetScreen, { shut: getSettings().openShutFirst !== false });
}

/**
 * @param {string} [targetScreen]
 * @param {{ shut?: boolean }} [opts] shut = present the closed phone (cover up); tap or swipe to open
 */
export function openPhone(targetScreen = 'home', opts = {}) {
    const settings = getSettings();
    if (!settings.enabled) {
        toast('Phone Trigger is disabled', 'warning');
        return;
    }
    if (isFlipBusy() && isPhoneOpen()) {
        return;
    }
    // Opening the handset cuts mail notification audio — but never kill an incoming ringtone.
    if (!isCallRinging()) {
        stopNotificationSound();
    }
    initPhoneChrome();
    if (targetScreen !== 'xphone') {
        stopOtherPhone();
        tlmFromOther = false;
    }
    screen = targetScreen;
    refreshChassis();
    activeMailId = null;
    const overlay = getOverlay();
    root?.classList.add('pp-open');

    setFlipState('is-closed');
    setShut(false);
    presentOverlay(overlay);
    tickClock();
    if (clockTimer) {
        clearInterval(clockTimer);
    }
    clockTimer = setInterval(tickClock, 15000);
    render();

    if (opts.shut) {
        // Shut first: the cover faces you; tap, press or swipe up to open.
        setFlipState('is-shut');
        setShut(true);
        flipBusy = false;
        requestAnimationFrame(() => {
            applyOverlayViewportBox(overlay);
            fitPhoneToViewport();
            measureShutShift();
        });
        return;
    }

    flipBusy = true;
    flipBusyAt = Date.now();
    const seq = flipSeq;
    requestAnimationFrame(() => {
        if (seq !== flipSeq) {
            return;
        }
        applyOverlayViewportBox(overlay);
        fitPhoneToViewport();
        setFlipState('is-closed');
        void getFlip()?.offsetWidth;
        requestAnimationFrame(() => {
            if (seq !== flipSeq) {
                return;
            }
            setFlipState('is-opening');
            waitFlipMs().then(() => {
                if (seq !== flipSeq) {
                    return;
                }
                setFlipState('is-open');
                flipBusy = false;
                fitPhoneToViewport();
            });
        });
    });
}

/**
 * Close the flip phone. Resolves after the dialog top-layer is dismissed
 * so callers (D-Mail spectacle) can show FX above everything.
 *
 * Default matches prior behavior: ignore close while a flip is in progress
 * (prevents double-toggle / cancel from shutting the phone right after open).
 * Pass `{ force: true }` to wait out the animation and then close (D-Mail FX).
 *
 * @param {{ force?: boolean }} [opts]
 * @returns {Promise<void>}
 */
export function closePhone(opts = {}) {
    const force = opts === true || opts?.force === true;
    return new Promise((resolve) => {
        const finishClose = () => {
            if (shut) {
                setShut(false);
                getFlip()?.style.removeProperty('--pp-shut-shift');
            }
            const overlay = getOverlay();
            if (!overlay || (!overlay.open && !root?.classList.contains('pp-open'))) {
                dismissOverlay(overlay);
                root?.classList.remove('pp-open');
                resolve();
                return;
            }

            flipBusy = true;
            flipBusyAt = Date.now();
            setFlipState('is-closing');

            waitFlipMs().then(() => {
                root?.classList.remove('pp-open');
                dismissOverlay(getOverlay());
                setFlipState('is-closed');
                const scaleWrap = document.getElementById('pp-scale-wrap');
                if (scaleWrap) {
                    scaleWrap.style.transform = '';
                    scaleWrap.style.setProperty('--pp-scale', '1');
                }
                if (clockTimer) {
                    clearInterval(clockTimer);
                    clockTimer = null;
                }
                flipBusy = false;
                // Put their phone down: the next time the handset comes up it is yours.
                if (screen === 'xphone' || tlmFromOther) {
                    stopOtherPhone();
                    screen = 'home';
                    tlmFromOther = false;
                }
                resolve();
            });
        };

        if (isFlipBusy()) {
            if (!force) {
                // Incidental close during open/close animation — ignore.
                resolve();
                return;
            }
            // Forced close (D-Mail): wait out the in-flight flip, then dismiss.
            let tries = 0;
            const wait = () => {
                if (!isFlipBusy() || tries++ > 40) {
                    finishClose();
                    return;
                }
                window.setTimeout(wait, 40);
            };
            wait();
            return;
        }
        finishClose();
    });
}

function tickClock() {
    const el = document.getElementById('pp-clock');
    if (!el) {
        return;
    }
    const now = new Date();
    el.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    updateOuter();
}

function navigateBack() {
    if (screen === 'dmail-propose') {
        document.getElementById('pp-propose-skip')?.click();
        return;
    }
    if (screen === 'dmail-lore') {
        document.getElementById('pp-lore-skip')?.click();
        return;
    }
    if (screen === 'dmail-card') {
        document.getElementById('pp-card-skip')?.click();
        return;
    }
    if (screen === 'call') {
        // Back during a call hangs up
        onCallEndPress();
        return;
    }
    if (screen === 'call-dial' && isCallActive()) {
        onCallEndPress();
        return;
    }
    if (screen === 'timeleap') {
        onCallEndPress();
        return;
    }
    if (screen === 'grab') {
        screen = 'home';
        render();
        return;
    }
    if (screen === 'xphone') {
        if (otherPhoneBack() === 'exit') {
            exitCharacterPhone();
        } else {
            render();
        }
        return;
    }
    const stack = {
        home: null,
        mail: 'home',
        inbox: 'mail',
        outbox: 'mail',
        read: activeMailId && getEmailById(activeMailId)?.direction === 'out' ? 'outbox' : 'inbox',
        compose: composeReplyTo ? 'read' : 'mail',
        settings: 'home',
        wallpaper: 'settings',
        sounds: 'settings',
        memory: 'mail',
        dmail: 'settings',
        'dmail-propose': 'outbox',
        'dmail-lore': 'outbox',
        'dmail-card': 'outbox',
        'call-dial': 'home',
        call: 'home',
        'call-memory': 'settings',
    };
    const next = stack[screen];
    if (!next) {
        closePhone();
        return;
    }
    if (screen === 'inbox' && forcePanelOpen) {
        forcePanelOpen = false;
        render();
        return;
    }
    if (screen === 'call-dial' && forceCallOpen) {
        forceCallOpen = false;
        render();
        return;
    }
    if (screen === 'compose' && composeReplyTo) {
        // stay on same mail when backing from reply compose
    }
    if (screen === 'read') {
        // keep activeMailId for compose reply back
    } else if (next !== 'read') {
        // clear when leaving read branch
    }
    if (screen === 'inbox') {
        forcePanelOpen = false;
    }
    screen = next;
    if (screen === 'home' || screen === 'mail' || screen === 'settings') {
        activeMailId = null;
        composeReplyTo = null;
    }
    render();
}

function softLeft() {
    if (screen === 'home') {
        screen = 'mail';
        render();
    } else if (screen === 'mail' || screen === 'inbox' || screen === 'outbox') {
        forcePanelOpen = false;
        screen = 'compose';
        composeSubject = '';
        composeBody = '';
        composeReplyTo = null;
        composeToKey = '';
        composeNoReply = false;
        composeDmailRedirectKey = getSettings().dmailRedirectKey || 'self';
        composeDmailWhen = '';
        composeContextIds = new Set();
        composeContextItems = [];
        render();
    } else if (screen === 'read') {
        startReply();
    } else if (screen === 'compose') {
        document.getElementById('pp-send-btn')?.click();
    } else if (screen === 'dmail-propose') {
        document.getElementById('pp-propose-apply')?.click();
    } else if (screen === 'dmail-lore') {
        document.getElementById('pp-lore-confirm')?.click();
    } else if (screen === 'dmail-card') {
        document.getElementById('pp-card-confirm')?.click();
    } else if (screen === 'call-dial') {
        void onCallAnswerPress();
    } else if (screen === 'timeleap') {
        if (timeleapSoftLeft()) {
            render();
        }
    } else if (screen === 'xphone') {
        if (otherPhoneSoftLeft()) {
            render();
        }
    } else if (screen === 'grab') {
        document.getElementById('pp-grab-go')?.click();
    } else if (screen === 'call') {
        if (isCallRinging()) {
            answerIncomingCall();
            render();
        } else {
            document.getElementById('pp-call-send')?.click();
        }
    } else if (screen === 'settings' || screen === 'wallpaper' || screen === 'sounds' || screen === 'dmail' || screen === 'call-memory') {
        screen = 'home';
        render();
    } else if (screen === 'memory') {
        // soft-left: reset to auto for current character
        document.getElementById('pp-memory-auto')?.click();
    }
}

function softCenter() {
    navCursor.activate();
}

function startReply(optionText = '') {
    const mail = activeMailId ? getEmailById(activeMailId) : null;
    if (!mail) {
        return;
    }
    composeReplyTo = mail.id;
    composeSubject = mail.subject.startsWith('Re:') ? mail.subject : `Re: ${mail.subject}`;
    composeBody = optionText || '';
    composeToKey = mail.characterKey
        || listMailContacts().find((c) => c.name === mail.from || c.name === mail.to)?.key
        || '';
    composeNoReply = false;
    screen = 'compose';
    render();
}

function wallpaperCss() {
    const settings = getSettings();
    if (settings.wallpaperId === 'phone' && !settings.customWallpaperUrl) {
        return specWallpaperCss(activeSpec());
    }
    if (settings.customWallpaperUrl) {
        return `center / cover no-repeat url("${settings.customWallpaperUrl.replace(/"/g, '\\"')}")`;
    }
    const preset = WALLPAPERS.find((w) => w.id === settings.wallpaperId) || WALLPAPERS[0];
    return preset.css;
}

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatTime(ts) {
    try {
        const d = new Date(ts);
        const now = new Date();
        const opts = /** @type {Intl.DateTimeFormatOptions} */ ({
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
        if (d.getFullYear() !== now.getFullYear()) {
            opts.year = 'numeric';
        }
        return d.toLocaleString([], opts);
    } catch {
        return '';
    }
}

/** Soft-key captions sit on the LCD above the blank wedge keys, as on a real keitai. */
/** What the right soft key says when it is not clearing text. */
let softRightLabel = '';

/**
 * Phones without a C key (the flip) clear text with the right soft key while you type,
 * as real handsets do. Returns the field being typed in, if that applies now.
 */
function typingField() {
    const phone = getOverlay()?.querySelector('.pp-phone');
    if (!phone || phone.querySelector('[data-nav="clear"]') || phone.getAttribute('data-body') === 'touch') {
        return null;
    }
    const el = document.activeElement;
    const view = document.getElementById('pp-view');
    if (!view || !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) || !view.contains(el)) {
        return null;
    }
    if (el instanceof HTMLInputElement && !['text', 'search', ''].includes(el.type)) {
        return null;
    }
    return el.value ? el : null;
}

function syncClearLabel() {
    const label = document.getElementById('pp-soft-right');
    const key = document.getElementById('pp-key-right');
    const text = typingField() ? 'Clear' : softRightLabel;
    if (label && label.textContent !== text) {
        label.textContent = text;
    }
    key?.setAttribute('aria-label', text || 'Soft key');
}

function setSoftLabels(left, right) {
    softRightLabel = right || '';
    const pairs = [['pp-soft-left', 'pp-key-left', left], ['pp-soft-right', 'pp-key-right', right]];
    for (const [labelId, keyId, text] of pairs) {
        const label = document.getElementById(labelId);
        if (label) {
            label.textContent = text || '';
        }
        document.getElementById(keyId)?.setAttribute('aria-label', text || 'Soft key');
    }
    syncClearLabel();
}

export function render() {
    const view = document.getElementById('pp-view');
    if (!view) {
        return;
    }
    updateBadge();
    if (screen !== 'call') {
        view.removeAttribute('data-call');
    }

    switch (screen) {
        case 'home':
            renderHome(view);
            break;
        case 'mail':
            renderMailMenu(view);
            break;
        case 'inbox':
            renderList(view, 'inbox');
            break;
        case 'outbox':
            renderList(view, 'outbox');
            break;
        case 'read':
            renderRead(view);
            break;
        case 'compose':
            renderCompose(view);
            break;
        case 'settings':
            renderSettings(view);
            break;
        case 'dmail':
            renderDmailSettings(view);
            break;
        case 'dmail-propose':
            renderDmailPropose(view);
            break;
        case 'dmail-lore':
            renderDmailLoreConfirm(view);
            break;
        case 'dmail-card':
            renderDmailCardConfirm(view);
            break;
        case 'call-memory':
            renderCallMemory(view);
            break;
        case 'wallpaper':
            renderWallpaper(view);
            break;
        case 'sounds':
            renderSounds(view);
            break;
        case 'memory':
            renderMemory(view);
            break;
        case 'call-dial':
            renderCallDial(view);
            break;
        case 'call':
            renderCall(view);
            break;
        case 'grab':
            renderGrab(view);
            break;
        case 'xphone':
            if (!otherPhoneOwner()) {
                screen = 'home';
                refreshChassis();
                renderHome(view);
                break;
            }
            renderOtherPhone(view, {
                setSoftLabels,
                escapeHtml,
                render,
                exit: exitCharacterPhone,
                isActive: () => screen === 'xphone' && isPhoneOpen(),
                dmail: async (mail) => {
                    const owner = otherPhoneOwner();
                    if (!owner) {
                        return;
                    }
                    const { characterDmail } = await import('./worldActs.js');
                    await characterDmail({ key: owner.key, name: owner.name }, mail);
                },
                timeleap: () => {
                    const owner = otherPhoneOwner();
                    if (owner) {
                        openTimeleapMachine({ leaper: { type: 'character', key: owner.key, name: owner.name }, fromOther: true });
                    }
                },
            });
            break;
        case 'timeleap':
            renderTimeleapApp(view, {
                setSoftLabels,
                escapeHtml,
                render,
                hangUp: () => {
                    if (screen === 'timeleap') {
                        leaveTimeleap();
                    }
                },
                closePhone,
                isActive: () => screen === 'timeleap' && isPhoneOpen(),
            });
            break;
        default:
            renderHome(view);
    }

    if (isPhoneOpen()) {
        requestAnimationFrame(fitPhoneToViewport);
    }
}

function renderHome(view) {
    const callsOn = getSettings().callEnabled !== false;
    setSoftLabels(callsOn ? 'Mail' : 'Mail', 'Close');
    view.style.background = wallpaperCss();
    view.className = 'pp-view pp-view-home';
    const meterHtml = getSettings().homeDivergenceMeter !== false && activeSpec().meter !== false
        ? `<div class="pp-home-meter" title="Divergence ${escapeHtml(getDivergence())}"><canvas id="pp-home-meter-canvas" aria-label="Divergence ${escapeHtml(getDivergence())}"></canvas></div>`
        : '';
    const paintMeter = () => {
        const canvas = /** @type {HTMLCanvasElement | null} */ (view.querySelector('#pp-home-meter-canvas'));
        if (canvas) {
            requestAnimationFrame(() => drawStaticMeter(canvas, getDivergence()));
        }
    };
    const grabOn = getSettings().phoneGrab !== false;
    const grabHtml = grabOn
        ? `<button type="button" class="pp-row pp-home-call-btn" id="pp-home-grab"><span>Grab a phone</span><span class="pp-row-meta">◆</span></button>`
        : '';
    const active = isCallActive();
    view.innerHTML = `
        ${meterHtml}
        <div class="pp-home-call">
            ${grabHtml}
            ${callsOn ? `
            <button type="button" class="pp-row pp-home-call-btn" id="pp-home-call">
                <span>${active ? 'Return to call' : 'Call'}</span>
                <span class="pp-row-meta">${active ? '●' : '☎'}</span>
            </button>` : ''}
        </div>
    `;
    view.querySelector('#pp-home-call')?.addEventListener('click', () => {
        void onCallAnswerPress();
    });
    view.querySelector('#pp-home-grab')?.addEventListener('click', () => {
        screen = 'grab';
        render();
    });
    paintMeter();
}

/**
 * Green ☎ — answer incoming, return to active call, or open dialer.
 */
async function onCallAnswerPress() {
    if (screen === 'xphone' && !isCallRinging()) {
        otherPhoneCallKey();
        render();
        return;
    }
    const s = getSettings();
    if (s.callEnabled === false) {
        toast('Calls are disabled', 'warning');
        return;
    }
    if (isCallRinging()) {
        answerIncomingCall();
        screen = 'call';
        render();
        return;
    }
    if (isCallConnected() || getCallSession().status === 'dialing') {
        screen = 'call';
        render();
        return;
    }
    screen = 'call-dial';
    render();
}

/**
 * Red ☎ — hang up, decline, or leave dialer.
 */
function onCallEndPress() {
    if (screen === 'xphone' && !isCallActive()) {
        exitCharacterPhone();
        return;
    }
    if (isCallActive()) {
        endCall();
        screen = 'home';
        render();
        return;
    }
    if (screen === 'timeleap') {
        if (isTimeleapBusy()) {
            toast('The machine is busy', 'warning', 'TIME LEAP');
            return;
        }
        resetTimeleapApp();
        leaveTimeleap();
        render();
        return;
    }
    if (screen === 'call' || screen === 'call-dial') {
        screen = 'home';
        render();
    }
}

/**
 * After a D-Mail went out (yours or a character's): the meter, then any review screens.
 * @param {{ worldlineFact?: string, acceptResult?: any, divergenceFrom?: string, divergenceTo?: string }} result
 * @param {{ subject: string, body: string, cutscene?: boolean, sender?: string }} info
 */
export async function presentDmailResult(result, info) {
    const tiers = getDmailTiers();
    proposeFact = String(result.worldlineFact || info.body).trim();
    proposeSubject = info.subject;
    proposeDivergence = result.divergenceTo || '';
    const accept = result.acceptResult || null;
    pendingNeedLore = Boolean(accept?.needLoreConfirm);
    pendingNeedCard = Boolean(accept?.needCardConfirm);
    pendingCardPreview = null;
    pendingLoreBookName = getConfiguredLorebookName();
    // Await forced close so the phone dialog leaves the top layer before FX.
    await closePhone({ force: true });
    if (tiers.spectacle && info.cutscene !== false) {
        await playDmailSequence({ from: result.divergenceFrom, to: result.divergenceTo });
    }
    if (tiers.propose) {
        openPhone('dmail-propose');
        return;
    }
    if (pendingNeedLore || pendingNeedCard) {
        openPhone(pendingNeedLore ? 'dmail-lore' : 'dmail-card');
        return;
    }
    const shifted = tiers.worldline || tiers.apply;
    if (info.sender) {
        // Reading Steiner: only you notice.
        toast(shifted ? 'Reading Steiner — the worldline shifted' : 'Something feels different', 'success', 'D-MAIL');
    } else {
        toast(shifted ? 'Worldline shifted' : 'D-Mail sent', 'success', 'D-MAIL');
    }
}

/** PhoneWave answers calls with the Time Leap Machine (when enabled). */
function timeleapDialable() {
    const s = getSettings();
    return s.timeleapEnabled !== false && s.showPhoneWave !== false;
}

/** Open the handset straight into the Time Leap Machine (`/timeleap`). */
/**
 * @param {{ leaper?: import('./timeleap.js').Leaper, fromOther?: boolean }} [opts]
 *   leaper = only this person can leap (the machine on their phone)
 */
export function openTimeleapMachine(opts = {}) {
    if (getSettings().timeleapEnabled === false) {
        toast('Time Leap Machine is disabled', 'warning', 'TIME LEAP');
        return;
    }
    resetTimeleapApp();
    if (opts.leaper) {
        lockTimeleapLeaper(opts.leaper);
    }
    tlmFromOther = Boolean(opts.fromOther && otherPhoneOwner());
    if (isPhoneOpen()) {
        screen = 'timeleap';
        render();
    } else {
        openPhone('timeleap');
    }
}

/** Pick whose phone to take: a chat character, or anyone named in the story. */
function renderGrab(view) {
    setSoftLabels('Grab', 'Back');
    view.style.background = '';
    view.className = 'pp-view';
    const contacts = listCallContacts();
    view.innerHTML = `
        <div class="pp-title">Grab a phone</div>
        <div class="pp-scroll">
            ${contacts.map((c) => `
                <button type="button" class="pp-row" data-grab="${escapeHtml(c.key)}" data-grab-name="${escapeHtml(c.name)}">
                    <span>${escapeHtml(c.name)}</span><span class="pp-row-meta">◆ ▸</span>
                </button>
            `).join('')}
            <label class="pp-field">
                <span class="pp-label">Someone else in the story</span>
                <input type="text" id="pp-grab-name" placeholder="e.g. FB" maxlength="40" />
            </label>
            <button type="button" class="pp-btn" id="pp-grab-go">Grab their phone</button>
        </div>
    `;
    view.querySelectorAll('[data-grab]').forEach((btn) => {
        btn.addEventListener('click', () => {
            openCharacterPhone(btn.getAttribute('data-grab') || '', btn.getAttribute('data-grab-name') || '');
        });
    });
    view.querySelector('#pp-grab-go')?.addEventListener('click', () => {
        const name = /** @type {HTMLInputElement | null} */ (view.querySelector('#pp-grab-name'))?.value.trim() || '';
        const owner = name ? resolvePhoneOwner(name) : null;
        if (!owner) {
            toast('Whose phone?', 'warning', 'PHONE');
            return;
        }
        openCharacterPhone(owner.key, owner.name);
    });
}

/**
 * The Call screen's quiet signal bars: pick who calls you and why.
 * @param {HTMLElement} view
 * @param {import('./store.js').MailContact[]} callers
 */
function wireForceCallPanel(view, callers) {
    const toggle = () => {
        forceCallOpen = !forceCallOpen;
        render();
    };
    view.querySelector('#pp-force-call-toggle')?.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        toggle();
    });
    // Long-press the title as a second quiet entry (same as the inbox)
    const titleText = view.querySelector('.pp-title-text');
    /** @type {ReturnType<typeof setTimeout> | null} */
    let hold = null;
    const clearHold = () => {
        if (hold) {
            clearTimeout(hold);
            hold = null;
        }
    };
    titleText?.addEventListener('pointerdown', () => {
        clearHold();
        hold = setTimeout(() => {
            hold = null;
            if (!forceCallOpen) {
                toggle();
            }
        }, 650);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => titleText?.addEventListener(ev, clearHold));

    if (!forceCallOpen) {
        return;
    }
    mountContactPicker(view.querySelector('#pp-force-call-from'), {
        contacts: callers,
        selectedKey: forceCallKey,
        emptyLabel: '—',
        onChange: (key) => {
            forceCallKey = key;
        },
    });
    const guide = /** @type {HTMLTextAreaElement | null} */ (view.querySelector('#pp-force-call-guide'));
    guide?.addEventListener('input', () => {
        forceCallGuidance = guide.value || '';
    });
    view.querySelector('#pp-force-call-ring')?.addEventListener('click', () => {
        const contact = callers.find((c) => c.key === forceCallKey) || callers[0];
        if (!contact) {
            toast('No character in this chat', 'warning');
            return;
        }
        if (isCallActive()) {
            toast('Already on a call', 'warning');
            return;
        }
        forceCallGuidance = guide?.value || forceCallGuidance;
        const secs = scheduleForcedCall(contact, forceCallGuidance.trim());
        forceCallOpen = false;
        toast(`${contact.name} will call (~${secs}s)`, 'info', 'CALL');
        forceCallGuidance = '';
        screen = 'home';
        render();
    });
}

function renderCallDial(view) {
    setSoftLabels('Call', 'Back');
    view.style.background = '';
    view.className = 'pp-view';
    const contacts = timeleapDialable() ? [getPhoneWaveContact(), ...listCallContacts()] : listCallContacts();
    const callers = listCallContacts();
    if (!callers.some((c) => c.key === forceCallKey)) {
        forceCallKey = callers.find((c) => c.isActive)?.key || callers[0]?.key || '';
    }
    const forcePanel = forceCallOpen ? `
        <div class="pp-force-panel" id="pp-force-call-panel">
            <div class="pp-field">
                <span class="pp-label">Caller</span>
                <div id="pp-force-call-from"></div>
            </div>
            <label class="pp-field">
                <span class="pp-label">Guide</span>
                <textarea id="pp-force-call-guide" rows="2" placeholder="Why they call (optional)…">${escapeHtml(forceCallGuidance)}</textarea>
            </label>
            <button type="button" class="pp-btn" id="pp-force-call-ring" ${callers.length ? '' : 'disabled'}>Ring me</button>
        </div>
    ` : '';
    view.innerHTML = `
        <div class="pp-title pp-title-bar">
            <span class="pp-title-text">Call</span>
            <button type="button" class="pp-signal-hotspot" id="pp-force-call-toggle" title="" aria-label="Signal"></button>
        </div>
        <div class="pp-scroll pp-call-dial">
            ${forcePanel}
            <label class="pp-field">
                <span class="pp-label">To</span>
                <div id="pp-call-to-host"></div>
            </label>
            <button type="button" class="pp-btn" id="pp-call-start" ${contacts.length ? '' : 'disabled'}>
                Call
            </button>
        </div>
    `;

    wireForceCallPanel(view, callers);

    let selectedKey = contacts.find((c) => c.isActive)?.key || contacts[0]?.key || '';
    mountContactPicker(view.querySelector('#pp-call-to-host'), {
        contacts,
        selectedKey,
        emptyLabel: 'No contacts',
        onChange: (key) => {
            selectedKey = key;
        },
    });

    view.querySelector('#pp-call-start')?.addEventListener('click', async () => {
        const contact = contacts.find((c) => c.key === selectedKey) || contacts[0];
        if (!contact) {
            toast('No contacts', 'warning');
            return;
        }
        if (isPhoneWaveContact(contact.key)) {
            resetTimeleapApp();
            screen = 'timeleap';
            render();
            return;
        }
        try {
            // startOutboundCall flips the session to "dialing" synchronously; its change event draws the screen.
            screen = 'call';
            const pending = startOutboundCall(contact);
            render();
            await pending;
        } catch (err) {
            console.error(err);
            screen = 'call-dial';
            render();
        }
    });
}

/** @type {ReturnType<typeof setInterval> | null} */
let callTimer = null;

/** @param {number} ms */
function fmtCallClock(ms) {
    const sec = Math.max(0, Math.floor(ms / 1000));
    return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

/** @param {ReturnType<typeof getCallSession>} call */
function callStatusLabel(call) {
    if (call.status === 'ringing') {
        return 'Incoming…';
    }
    if (call.status === 'dialing') {
        return 'Calling…';
    }
    if (call.status === 'connected') {
        return fmtCallClock(Date.now() - (call.connectedAt || Date.now()));
    }
    return 'Call ended';
}

/** @param {ReturnType<typeof getCallSession>} call */
function callLogHtml(call) {
    const name = call.contact?.name || '…';
    const turns = (call.turns || []).map((t) => {
        if (t.role === 'system') {
            return `<div class="pp-call-sys">${escapeHtml(t.text)}</div>`;
        }
        const mine = t.role === 'user';
        const who = mine ? (getPersonaLabel() || 'You') : name;
        return `
            <div class="pp-call-bubble ${mine ? 'pp-call-me' : 'pp-call-them'}">
                <div class="pp-call-who">${escapeHtml(who)}</div>
                <div class="pp-call-text">${escapeHtml(t.text)}</div>
            </div>
        `;
    }).join('');
    const typing = call.busy
        ? `<div class="pp-call-bubble pp-call-them pp-call-typing" aria-label="${escapeHtml(name)} is speaking"><div class="pp-call-who">${escapeHtml(name)}</div><div class="pp-call-text"><i></i><i></i><i></i></div></div>`
        : '';
    return turns + typing || '<div class="pp-call-sys">…</div>';
}

/**
 * Call screen. While connected it updates in place, so a half-typed line,
 * the keyboard and the scroll position survive incoming replies.
 */
function renderCall(view) {
    const call = getCallSession();
    const name = call.contact?.name || '…';
    const mode = call.status;
    setSoftLabels(mode === 'connected' ? 'Say' : (mode === 'ringing' ? 'Answer' : ''), mode === 'idle' ? 'Back' : 'End');

    if (mode === 'idle' || mode === 'ended') {
        // The call is over (hung up, declined, missed): leave the dead screen.
        stopCallTimer();
        screen = 'home';
        render();
        return;
    }

    if (view.getAttribute('data-call') === `${call.id}:${mode}`) {
        patchCall(view, call);
        return;
    }
    view.setAttribute('data-call', `${call.id}:${mode}`);
    view.style.background = '';
    view.className = 'pp-view pp-view-call';

    if (mode === 'ringing') {
        stopCallTimer();
        view.innerHTML = `
            <div class="pp-call-header">
                <div class="pp-call-peer">${escapeHtml(name)}</div>
                <div class="pp-call-status pp-call-ringing">Incoming…</div>
            </div>
            <div class="pp-scroll pp-call-incoming">
                <div class="pp-call-avatar" aria-hidden="true">☎</div>
                <div class="pp-call-sys">${escapeHtml(name)} is calling</div>
                <button type="button" class="pp-btn" id="pp-call-answer-in">Answer</button>
                <button type="button" class="pp-btn pp-btn-ghost" id="pp-call-decline-in">Decline</button>
            </div>
        `;
        view.querySelector('#pp-call-answer-in')?.addEventListener('click', () => {
            answerIncomingCall();
            render();
        });
        view.querySelector('#pp-call-decline-in')?.addEventListener('click', () => onCallEndPress());
        return;
    }

    const connected = mode === 'connected';
    view.innerHTML = `
        <div class="pp-call-header">
            <div class="pp-call-peer">${escapeHtml(name)}</div>
            <div class="pp-call-status" id="pp-call-status">${escapeHtml(callStatusLabel(call))}</div>
        </div>
        <div class="pp-scroll pp-call-log" id="pp-call-log">${callLogHtml(call)}</div>
        ${connected ? `
            <div class="pp-call-compose">
                <textarea id="pp-call-input" rows="1" placeholder="Say something…" enterkeyhint="send"></textarea>
                <button type="button" class="pp-btn" id="pp-call-send">Say</button>
            </div>
        ` : `
            <div class="pp-call-compose pp-call-compose-idle">
                <button type="button" class="pp-btn pp-btn-ghost" id="pp-call-hang">Cancel</button>
            </div>
        `}
    `;
    const log = view.querySelector('#pp-call-log');
    if (log) {
        log.scrollTop = log.scrollHeight;
    }
    view.querySelector('#pp-call-hang')?.addEventListener('click', () => onCallEndPress());

    const input = /** @type {HTMLTextAreaElement | null} */ (view.querySelector('#pp-call-input'));
    const doSend = () => {
        if (!input) {
            return;
        }
        if (sendCallLine(input.value || '')) {
            input.value = '';
        }
        input.focus({ preventScroll: true });
    };
    view.querySelector('#pp-call-send')?.addEventListener('click', doSend);
    input?.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' && !ev.shiftKey) {
            ev.preventDefault();
            doSend();
        }
    });
    if (connected) {
        startCallTimer();
    }
}

/**
 * @param {HTMLElement} view
 * @param {ReturnType<typeof getCallSession>} call
 */
function patchCall(view, call) {
    const status = view.querySelector('#pp-call-status');
    if (status) {
        status.textContent = callStatusLabel(call);
    }
    const log = view.querySelector('#pp-call-log');
    if (log) {
        const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 24;
        log.innerHTML = callLogHtml(call);
        if (atBottom) {
            log.scrollTop = log.scrollHeight;
        }
    }
}

function startCallTimer() {
    if (callTimer) {
        return;
    }
    callTimer = setInterval(() => {
        const el = document.getElementById('pp-call-status');
        const call = getCallSession();
        if (!el || screen !== 'call' || call.status !== 'connected') {
            stopCallTimer();
            return;
        }
        el.textContent = callStatusLabel(call);
    }, 1000);
}

function stopCallTimer() {
    if (callTimer) {
        clearInterval(callTimer);
        callTimer = null;
    }
}

function renderMailMenu(view) {
    setSoftLabels('New', 'Back');
    view.style.background = '';
    view.className = 'pp-view';
    const unread = getUnreadCount();
    view.innerHTML = `
        <div class="pp-title">Mail</div>
        <button type="button" class="pp-row" data-goto="inbox">
            <span>Inbox</span>
            <span class="pp-row-meta">${unread ? `${unread} new` : getInbox().length}</span>
        </button>
        <button type="button" class="pp-row" data-goto="outbox">
            <span>Outbox</span>
            <span class="pp-row-meta">${getOutbox().length}</span>
        </button>
        <button type="button" class="pp-row" data-goto="compose">
            <span>New</span>
            <span class="pp-row-meta">→</span>
        </button>
        <button type="button" class="pp-row" data-goto="memory">
            <span>Memory</span>
            <span class="pp-row-meta">◎</span>
        </button>
    `;
    bindGoto(view);
}

function renderList(view, which) {
    setSoftLabels('New', 'Back');
    view.style.background = '';
    view.className = 'pp-view';
    const list = which === 'inbox' ? getInbox() : getOutbox();
    const title = which === 'inbox' ? 'Inbox' : 'Outbox';
    const rows = list.length
        ? list.map((e) => `
            <button type="button" class="pp-row pp-mail-row ${e.read ? '' : 'pp-unread'}" data-mail="${escapeHtml(e.id)}">
                <div class="pp-mail-top">
                    <span class="pp-mail-from">${escapeHtml(which === 'inbox' ? e.from : e.to)}</span>
                    <span class="pp-mail-time">${escapeHtml(formatTime(e.timestamp))}</span>
                </div>
                <div class="pp-mail-subj">${escapeHtml(e.subject)}</div>
                <div class="pp-mail-preview">${escapeHtml(e.body.replace(/\s+/g, ' ').slice(0, 64))}</div>
            </button>
        `).join('')
        : `<div class="pp-empty">No messages</div>`;

    const forceBlock = which === 'inbox' && forcePanelOpen ? renderForceMailPanelHtml() : '';

    view.innerHTML = `
        <div class="pp-title pp-title-bar">
            <span class="pp-title-text">${title}</span>
            ${which === 'inbox' ? '<button type="button" class="pp-signal-hotspot" id="pp-force-toggle" title="" aria-label="Signal"></button>' : ''}
        </div>
        <div class="pp-scroll">${forceBlock}${rows}</div>
    `;

    if (which === 'inbox') {
        wireForceMailPanel(view);
    }

    view.querySelectorAll('[data-mail]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            stopNotificationSound();
            activeMailId = btn.getAttribute('data-mail');
            await markRead(activeMailId);
            forcePanelOpen = false;
            screen = 'read';
            render();
        });
    });
}

function renderForceMailPanelHtml() {
    const contacts = listMailContacts().filter((c) => !isPhoneWaveContact(c.key));
    const active = contacts.find((c) => c.key === forceFromKey)
        || contacts.find((c) => c.isActive)
        || contacts[0];
    if (active && !forceFromKey) {
        forceFromKey = active.key;
    }

    return `
        <div class="pp-force-panel" id="pp-force-panel">
            <div class="pp-field">
                <span class="pp-label">From</span>
                <div id="pp-force-from-host"></div>
            </div>
            <label class="pp-field">
                <span class="pp-label">Subject</span>
                <input type="text" id="pp-force-subject" value="${escapeHtml(forceSubject)}" placeholder="optional" />
            </label>
            <label class="pp-field">
                <span class="pp-label">Guide</span>
                <textarea id="pp-force-guide" rows="2" placeholder="What they should write about…">${escapeHtml(forceGuidance)}</textarea>
            </label>
            <button type="button" class="pp-btn" id="pp-force-send">Receive</button>
        </div>
    `;
}

/**
 * @param {HTMLElement} view
 */
function wireForceMailPanel(view) {
    const hotspot = view.querySelector('#pp-force-toggle');
    let holdTimer = null;

    const toggle = () => {
        forcePanelOpen = !forcePanelOpen;
        render();
    };

    // Short tap on the signal glyph — discreet, looks like status chrome
    hotspot?.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        toggle();
    });

    // Long-press the title text as a second quiet entry
    const titleText = view.querySelector('.pp-title-text');
    const clearHold = () => {
        if (holdTimer) {
            clearTimeout(holdTimer);
            holdTimer = null;
        }
    };
    titleText?.addEventListener('pointerdown', () => {
        clearHold();
        holdTimer = setTimeout(() => {
            holdTimer = null;
            if (!forcePanelOpen) {
                forcePanelOpen = true;
                render();
            }
        }, 650);
    });
    titleText?.addEventListener('pointerup', clearHold);
    titleText?.addEventListener('pointerleave', clearHold);
    titleText?.addEventListener('pointercancel', clearHold);

    if (!forcePanelOpen) {
        return;
    }

    const subjectInput = /** @type {HTMLInputElement|null} */ (view.querySelector('#pp-force-subject'));
    const guideInput = /** @type {HTMLTextAreaElement|null} */ (view.querySelector('#pp-force-guide'));
    const sendBtn = /** @type {HTMLButtonElement|null} */ (view.querySelector('#pp-force-send'));
    const forceContacts = listMailContacts().filter((c) => !isPhoneWaveContact(c.key));

    mountContactPicker(view.querySelector('#pp-force-from-host'), {
        contacts: forceContacts,
        selectedKey: forceFromKey,
        emptyLabel: '—',
        onChange: (key) => {
            forceFromKey = key;
        },
    });

    subjectInput?.addEventListener('input', () => {
        forceSubject = subjectInput.value || '';
    });
    guideInput?.addEventListener('input', () => {
        forceGuidance = guideInput.value || '';
    });

    sendBtn?.addEventListener('click', () => {
        const contact = forceContacts.find((c) => c.key === forceFromKey)
            || forceContacts[0];
        if (!contact) {
            toast('No character in this chat', 'warning');
            return;
        }
        forceGuidance = guideInput?.value || forceGuidance;
        forceSubject = subjectInput?.value || forceSubject;
        forceFromKey = contact.key;

        sendBtn.disabled = true;
        sendBtn.textContent = '…';

        try {
            const { delayMs } = scheduleForcedCharacterMail(contact, {
                guidance: forceGuidance,
                subject: forceSubject,
                delay: true,
            });
            forcePanelOpen = false;
            const secs = Math.max(1, Math.round(delayMs / 1000));
            toast(`Incoming from ${contact.name} (~${secs}s)`, 'info');
            render();
        } catch (err) {
            sendBtn.disabled = false;
            sendBtn.textContent = 'Receive';
            toast(err?.message || 'Failed', 'error');
        }
    });
}

async function renderRead(view) {
    setSoftLabels('Reply', 'Back');
    view.style.background = '';
    view.className = 'pp-view';
    const mail = getEmailById(activeMailId);
    if (!mail) {
        view.innerHTML = `<div class="pp-empty">Message missing</div>`;
        return;
    }
    await markRead(mail.id);
    updateBadge();

    const options = (mail.replyOptions || []).map((opt) =>
        `<button type="button" class="pp-reply-chip" data-reply="${escapeHtml(opt)}">${escapeHtml(opt)}</button>`
    ).join('');

    view.innerHTML = `
        <div class="pp-title pp-title-row">
            <span class="pp-title-text">Mail</span>
            <button type="button" class="pp-icon-btn pp-trash-btn" id="pp-delete-mail" title="Delete" aria-label="Delete mail">🗑</button>
        </div>
        <div class="pp-scroll pp-read">
                <div class="pp-read-meta">
                <div><span class="pp-label">From</span> ${escapeHtml(mail.from)}</div>
                <div><span class="pp-label">To</span> ${escapeHtml(mail.to)}</div>
                <div><span class="pp-label">Subject</span> ${escapeHtml(mail.subject)}</div>
                <div class="pp-read-time">${escapeHtml(formatTime(mail.timestamp))}</div>
                ${mail.isDmail ? `<div class="pp-settings-note">D-Mail${mail.dmailRedirectName ? ` · → ${escapeHtml(mail.dmailRedirectName)}` : ''}</div>` : ''}
            </div>
            <div class="pp-read-body">${escapeHtml(mail.body).replace(/\n/g, '<br>')}</div>
            ${options ? `<div class="pp-reply-options"><div class="pp-label">Reply with</div>${options}</div>` : ''}
            <button type="button" class="pp-btn" id="pp-reply-btn">Reply</button>
        </div>
    `;
    view.querySelector('#pp-reply-btn')?.addEventListener('click', () => startReply());
    view.querySelectorAll('[data-reply]').forEach((btn) => {
        btn.addEventListener('click', () => startReply(btn.getAttribute('data-reply') || ''));
    });
    view.querySelector('#pp-delete-mail')?.addEventListener('click', async () => {
        if (!confirm('Delete this e-mail?')) {
            return;
        }
        const id = mail.id;
        const wentOut = mail.direction === 'out';
        await deleteEmail(id);
        updateMailPrompt();
        updateBadge();
        activeMailId = null;
        screen = wentOut ? 'outbox' : 'inbox';
        toast('Mail deleted', 'info');
        render();
    });
}

function renderCompose(view) {
    setSoftLabels('Send', 'Back');
    view.style.background = '';
    view.className = 'pp-view';
    const contacts = listMailContacts();
    // If PhoneWave was hidden while selected, fall back to a character
    if (composeToKey && isPhoneWaveContact(composeToKey) && getSettings().showPhoneWave === false) {
        composeToKey = '';
    }
    const active = contacts.find((c) => c.key === composeToKey)
        || contacts.find((c) => c.isActive && !isPhoneWaveContact(c.key))
        || contacts.find((c) => !isPhoneWaveContact(c.key))
        || contacts[0];
    if (active) {
        composeToKey = active.key;
    }

    const dmailSelected = isPhoneWaveContact(composeToKey);
    if (dmailSelected) {
        ensureComposeContext();
        if (!composeDmailRedirectKey) {
            composeDmailRedirectKey = getSettings().dmailRedirectKey || 'self';
        }
    }
    const settings = getSettings();
    const limit36 = Boolean(settings.dmailLimit36);
    const participants = dmailSelected ? listDmailParticipants() : [];
    const redirectContacts = listMailContacts().filter((c) => !isPhoneWaveContact(c.key));
    const bodyForCompose = dmailSelected && limit36
        ? clampDmailBody(composeBody, true)
        : composeBody;
    if (dmailSelected && limit36 && bodyForCompose !== composeBody) {
        composeBody = bodyForCompose;
    }

    const dmailOptionsHtml = dmailSelected
        ? `
            <div class="pp-section">D-Mail delivery</div>
            <label class="pp-field">
                <span class="pp-label">Redirect to phone</span>
                <select id="pp-dmail-redirect" class="pp-select">
                    <option value="self" ${composeDmailRedirectKey === 'self' ? 'selected' : ''}>Own phone (inbox)</option>
                    ${redirectContacts.map((c) => `
                        <option value="${escapeHtml(c.key)}" ${composeDmailRedirectKey === c.key ? 'selected' : ''}>
                            ${escapeHtml(c.name)}
                        </option>
                    `).join('')}
                </select>
            </label>
            <p class="pp-settings-note">Own phone → your inbox. Character → their mail memory (three parts).</p>
            <label class="pp-field">
                <span class="pp-label">Arrive at (optional)</span>
                <input type="datetime-local" id="pp-dmail-when" class="pp-select" value="${escapeHtml(composeDmailWhen)}" />
            </label>
            <p class="pp-settings-note">Optional timestamp for when the parts appear.</p>
        `
        : '';

    const contextHtml = dmailSelected
        ? `
            <div class="pp-section pp-ctx-section">Past context</div>
            <p class="pp-settings-note pp-ctx-note">
                Sender: <strong>${escapeHtml(getPersonaLabel() || 'You')}</strong>
                ${participants.length ? ` · Seeing: ${escapeHtml(participants.join(', '))}` : ''}
            </p>
            <p class="pp-settings-note">Tick chat lines the D-Mail may use when deriving the worldline fact.</p>
            <div class="pp-ctx-list" id="pp-ctx-list">
                ${composeContextItems.length
        ? composeContextItems.map((item) => `
                    <label class="pp-ctx-row">
                        <input type="checkbox" data-ctx-id="${escapeHtml(item.id)}" ${composeContextIds.has(item.id) ? 'checked' : ''} />
                        <span class="pp-ctx-copy">
                            <span class="pp-ctx-name">${escapeHtml(item.name)}</span>
                            <span class="pp-ctx-text">${escapeHtml(item.text)}</span>
                        </span>
                    </label>
                `).join('')
        : '<div class="pp-empty pp-fact-empty">No recent chat lines</div>'}
            </div>
            <div class="pp-ctx-actions">
                <button type="button" class="pp-btn pp-btn-ghost" id="pp-ctx-all">All</button>
                <button type="button" class="pp-btn pp-btn-ghost" id="pp-ctx-none">None</button>
                <button type="button" class="pp-btn pp-btn-ghost" id="pp-ctx-recent">Last 8</button>
            </div>
        `
        : '';

    view.innerHTML = `
        <div class="pp-title">New mail</div>
        <div class="pp-scroll pp-compose">
            <div class="pp-field">
                <span class="pp-label">To</span>
                <div id="pp-compose-to-host"></div>
            </div>
            <p class="pp-dmail-hint" id="pp-dmail-hint" ${dmailSelected ? '' : 'hidden'}>
                Sending to <strong>${escapeHtml(PHONEWAVE_NAME)}</strong> transmits a D-Mail.
                No reply arrives — the worldline shifts instead.
            </p>
            <label class="pp-field">
                <span class="pp-label">Subject</span>
                <input type="text" id="pp-compose-subject" value="${escapeHtml(composeSubject)}" />
            </label>
            <label class="pp-field">
                <span class="pp-label">Body${dmailSelected && limit36 ? ' <span id="pp-dmail-count" class="pp-dmail-count"></span>' : ''}</span>
                <textarea id="pp-compose-body" rows="${dmailSelected && limit36 ? 3 : 5}"
                    ${dmailSelected && limit36 ? 'maxlength="36"' : ''}
                >${escapeHtml(composeBody)}</textarea>
            </label>
            <div id="pp-dmail-options" ${dmailSelected ? '' : 'hidden'}>${dmailOptionsHtml}</div>
            <div id="pp-dmail-context" ${dmailSelected ? '' : 'hidden'}>${contextHtml}</div>
            <button type="button" class="pp-row pp-toggle-row ${composeNoReply ? 'pp-toggle-on' : ''}" id="pp-no-reply" ${dmailSelected ? 'hidden' : ''}>
                <span class="pp-toggle-copy">
                    <span class="pp-toggle-title">Do not reply</span>
                    <span class="pp-toggle-blurb">Send without scheduling an AI reply (stops reply chains).</span>
                </span>
                <span class="pp-row-meta pp-toggle-state">${composeNoReply ? 'ON' : 'OFF'}</span>
            </button>
            <button type="button" class="pp-btn" id="pp-send-btn">${dmailSelected ? 'Send D-Mail' : 'Send'}</button>
        </div>
    `;

    const hint = view.querySelector('#pp-dmail-hint');
    const sendBtn = /** @type {HTMLButtonElement | null} */ (view.querySelector('#pp-send-btn'));
    const noReplyBtn = /** @type {HTMLButtonElement | null} */ (view.querySelector('#pp-no-reply'));
    const ctxHost = view.querySelector('#pp-dmail-context');
    const optsHost = view.querySelector('#pp-dmail-options');

    const updateDmailCount = () => {
        const countEl = view.querySelector('#pp-dmail-count');
        const bodyEl = /** @type {HTMLTextAreaElement | null} */ (view.querySelector('#pp-compose-body'));
        if (!countEl || !bodyEl || !getSettings().dmailLimit36) {
            return;
        }
        const clamped = clampDmailBody(bodyEl.value, true);
        if (clamped !== bodyEl.value) {
            const pos = bodyEl.selectionStart;
            bodyEl.value = clamped;
            try {
                bodyEl.setSelectionRange(Math.min(pos, clamped.length), Math.min(pos, clamped.length));
            } catch (_err) {
                // ignore
            }
        }
        countEl.textContent = `(${clamped.length}/36)`;
    };

    const syncDmailUi = () => {
        const dmail = isPhoneWaveContact(composeToKey);
        if (hint) {
            hint.hidden = !dmail;
        }
        if (noReplyBtn) {
            noReplyBtn.hidden = dmail;
        }
        if (sendBtn) {
            sendBtn.textContent = dmail ? 'Send D-Mail' : 'Send';
        }
        setSoftLabels(dmail ? 'D-Mail' : 'Send', 'Back');
        if (optsHost) {
            optsHost.hidden = !dmail;
        }
        if (dmail) {
            ensureComposeContext();
            if (ctxHost) {
                ctxHost.hidden = false;
                if (!ctxHost.querySelector('#pp-ctx-list')) {
                    render();
                }
            }
            updateDmailCount();
        } else if (ctxHost) {
            ctxHost.hidden = true;
        }
    };

    const syncContextFromDom = () => {
        composeContextIds = new Set();
        view.querySelectorAll('[data-ctx-id]').forEach((el) => {
            const input = /** @type {HTMLInputElement} */ (el);
            if (input.checked) {
                composeContextIds.add(input.getAttribute('data-ctx-id') || '');
            }
        });
    };

    view.querySelectorAll('[data-ctx-id]').forEach((el) => {
        el.addEventListener('change', syncContextFromDom);
    });
    view.querySelector('#pp-ctx-all')?.addEventListener('click', () => {
        composeContextIds = new Set(composeContextItems.map((i) => i.id));
        render();
    });
    view.querySelector('#pp-ctx-none')?.addEventListener('click', () => {
        composeContextIds = new Set();
        render();
    });
    view.querySelector('#pp-ctx-recent')?.addEventListener('click', () => {
        const last = composeContextItems.slice(-8);
        composeContextIds = new Set(last.map((i) => i.id));
        render();
    });

    const syncNoReplyUi = () => {
        if (!noReplyBtn) {
            return;
        }
        noReplyBtn.classList.toggle('pp-toggle-on', composeNoReply);
        const state = noReplyBtn.querySelector('.pp-toggle-state');
        if (state) {
            state.textContent = composeNoReply ? 'ON' : 'OFF';
        }
    };
    noReplyBtn?.addEventListener('click', () => {
        composeNoReply = !composeNoReply;
        syncNoReplyUi();
    });

    mountContactPicker(view.querySelector('#pp-compose-to-host'), {
        contacts,
        selectedKey: composeToKey,
        emptyLabel: getActiveCharacterName(),
        optionLabel: (c) => {
            if (isPhoneWaveContact(c.key)) {
                return c.name;
            }
            return c.isActive ? `${c.name} ★` : c.name;
        },
        onChange: (key) => {
            composeToKey = key;
            if (isPhoneWaveContact(key)) {
                ensureComposeContext({ force: true });
            }
            syncDmailUi();
            if (isPhoneWaveContact(key) || ctxHost) {
                render();
            }
        },
    });
    syncDmailUi();
    syncNoReplyUi();

    const sync = () => {
        composeSubject = /** @type {HTMLInputElement} */ (view.querySelector('#pp-compose-subject'))?.value || '';
        let bodyVal = /** @type {HTMLTextAreaElement} */ (view.querySelector('#pp-compose-body'))?.value || '';
        if (isPhoneWaveContact(composeToKey) && getSettings().dmailLimit36) {
            bodyVal = clampDmailBody(bodyVal, true);
        }
        composeBody = bodyVal;
        composeDmailRedirectKey = /** @type {HTMLSelectElement | null} */ (view.querySelector('#pp-dmail-redirect'))?.value
            || composeDmailRedirectKey
            || 'self';
        composeDmailWhen = /** @type {HTMLInputElement | null} */ (view.querySelector('#pp-dmail-when'))?.value
            || '';
        updateDmailCount();
    };
    view.querySelector('#pp-compose-subject')?.addEventListener('input', sync);
    view.querySelector('#pp-compose-body')?.addEventListener('input', sync);
    view.querySelector('#pp-dmail-redirect')?.addEventListener('change', sync);
    view.querySelector('#pp-dmail-when')?.addEventListener('change', sync);
    view.querySelector('#pp-dmail-when')?.addEventListener('input', sync);
    updateDmailCount();

    const send = async () => {
        sync();
        syncContextFromDom();
        const contact = contacts.find((c) => c.key === composeToKey) || contacts[0];
        const toKey = contact?.key || '';
        const toName = contact?.name || '';
        const dmail = isPhoneWaveContact(toKey) || isPhoneWaveContact(toName);
        if (!composeBody.trim()) {
            toast('Empty message', 'warning');
            return;
        }
        const btn = view.querySelector('#pp-send-btn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = '…';
        }
        try {
            const subject = composeSubject || '(no subject)';
            const body = composeBody;
            if (dmail) {
                const dmailContextLines = composeContextItems
                    .filter((item) => composeContextIds.has(item.id))
                    .map((item) => `${item.name}: ${item.text}`);
                const result = await sendUserEmail({
                    to: toName,
                    toKey,
                    subject,
                    body,
                    inReplyTo: composeReplyTo || undefined,
                    requestReply: false,
                    dmailContextLines,
                    dmailRedirectKey: composeDmailRedirectKey || 'self',
                    dmailCosmeticTimestamp: composeDmailWhen || null,
                });
                composeSubject = '';
                composeBody = '';
                composeReplyTo = null;
                composeNoReply = false;
                composeDmailWhen = '';
                composeContextIds = new Set();
                composeContextItems = [];
                await presentDmailResult(result, { subject, body });
                return;
            }

            const wantReply = !composeNoReply;
            const animPromise = playSendAnimation(view, { to: toName, subject });
            await sendUserEmail({
                to: toName,
                toKey,
                subject,
                body,
                inReplyTo: composeReplyTo || undefined,
                requestReply: wantReply,
            });
            await animPromise;
            composeSubject = '';
            composeBody = '';
            composeReplyTo = null;
            const sentNoReply = composeNoReply;
            composeNoReply = false;
            screen = 'outbox';
            toast(
                sentNoReply ? `Sent → ${toName} (no reply)` : `Sent → ${toName}`,
                'success',
                'MAIL SENT',
            );
            render();
        } catch (err) {
            console.error(err);
            view.querySelector('.pp-send-overlay')?.remove();
            toast(dmail ? 'D-Mail failed' : 'Send failed', 'error');
            if (btn) {
                btn.disabled = false;
                btn.textContent = dmail ? 'Send D-Mail' : 'Send';
            }
        }
    };

    view.querySelector('#pp-send-btn')?.addEventListener('click', send);
}

/**
 * Build / refresh the selectable chat context list for D-Mail compose.
 * @param {{ force?: boolean }} [opts]
 */
function ensureComposeContext(opts = {}) {
    const items = listDmailChatContext(24);
    const same = !opts.force
        && items.length === composeContextItems.length
        && items.every((it, i) => it.id === composeContextItems[i]?.id);
    if (same) {
        return;
    }
    composeContextItems = items;
    if (!composeContextIds.size || opts.force) {
        const last = items.slice(-8);
        composeContextIds = new Set(last.map((i) => i.id));
    } else {
        // Drop ids that no longer exist
        const valid = new Set(items.map((i) => i.id));
        composeContextIds = new Set([...composeContextIds].filter((id) => valid.has(id)));
    }
}

/**
 * Email-client style send animation on the compose screen.
 * @param {HTMLElement} view
 * @param {{ to: string, subject: string }} meta
 */
function playSendAnimation(view, meta) {
    return new Promise((resolve) => {
        view.querySelector('.pp-send-overlay')?.remove();
        const overlay = document.createElement('div');
        overlay.className = 'pp-send-overlay';
        overlay.innerHTML = `
            <div class="pp-send-card">
                <div class="pp-send-envelope" aria-hidden="true">
                    <div class="pp-send-flap"></div>
                    <div class="pp-send-sheet"></div>
                </div>
                <div class="pp-send-meta">
                    <div class="pp-send-to">TO ${escapeHtml(meta.to || '')}</div>
                    <div class="pp-send-subj">${escapeHtml(meta.subject || '')}</div>
                </div>
                <div class="pp-send-status" id="pp-send-status">Connecting…</div>
                <div class="pp-send-track"><div class="pp-send-bar" id="pp-send-bar"></div></div>
            </div>
        `;
        view.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('pp-send-on'));

        const status = overlay.querySelector('#pp-send-status');
        const bar = overlay.querySelector('#pp-send-bar');
        const steps = [
            { t: 0, text: 'Connecting…', w: '18%' },
            { t: 320, text: 'Composing MIME…', w: '42%' },
            { t: 700, text: 'Uploading…', w: '78%' },
            { t: 1100, text: 'Sent', w: '100%' },
        ];
        for (const step of steps) {
            window.setTimeout(() => {
                if (status) {
                    status.textContent = step.text;
                }
                if (bar) {
                    bar.style.width = step.w;
                }
                if (step.text === 'Sent') {
                    overlay.classList.add('pp-send-done');
                }
            }, step.t);
        }
        window.setTimeout(() => {
            overlay.classList.add('pp-send-out');
            window.setTimeout(() => {
                overlay.remove();
                resolve();
            }, 260);
        }, 1500);
    });
}

function renderSettings(view) {
    setSoftLabels('Home', 'Back');
    view.style.background = '';
    view.className = 'pp-view';
    const tiers = getDmailTiers();
    const showPw = getSettings().showPhoneWave !== false;
    const dmailMeta = showPw
        ? ([
            tiers.spectacle ? 'Fx' : null,
            tiers.propose ? 'Ask' : null,
            tiers.worldline ? 'Soft' : null,
            tiers.apply ? 'Hard' : null,
        ].filter(Boolean).join('·') || 'On')
        : 'Hidden';

    view.innerHTML = `
        <div class="pp-title">Settings</div>
        <div class="pp-scroll">
            <button type="button" class="pp-row" id="pp-open-menu"><span>Full menu</span><span class="pp-row-meta">⚙ ▸</span></button>
            ${getSettings().callEnabled !== false ? `
            <button type="button" class="pp-row" data-goto="call-dial">
                <span>Call</span>
                <span class="pp-row-meta">☎ →</span>
            </button>` : ''}
            <button type="button" class="pp-row" data-goto="dmail">
                <span>D-Mail</span>
                <span class="pp-row-meta">${escapeHtml(dmailMeta)} →</span>
            </button>
            <button type="button" class="pp-row" data-goto="call-memory">
                <span>Call memory</span>
                <span class="pp-row-meta">${getSettings().injectCallMemory ? 'On' : 'Off'} →</span>
            </button>
            <button type="button" class="pp-row" data-goto="wallpaper"><span>Wallpaper</span><span class="pp-row-meta">→</span></button>
            <button type="button" class="pp-row" data-goto="sounds"><span>Sounds</span><span class="pp-row-meta">→</span></button>
            <button type="button" class="pp-row" data-goto="memory"><span>Mail memory</span><span class="pp-row-meta">◎</span></button>
            <button type="button" class="pp-row" id="pp-test-notify"><span>Test notification</span><span class="pp-row-meta">♪</span></button>
            <button type="button" class="pp-row" id="pp-test-ring"><span>Test ringtone</span><span class="pp-row-meta">♪</span></button>
            <button type="button" class="pp-row pp-danger" id="pp-clear-mail"><span>Clear all mail</span><span class="pp-row-meta">!</span></button>
        </div>
    `;
    bindGoto(view);
    view.querySelector('#pp-open-menu')?.addEventListener('click', () => openMenu());
    view.querySelector('#pp-test-notify')?.addEventListener('click', () => playNotification());
    view.querySelector('#pp-test-ring')?.addEventListener('click', () => playRingtone());
    view.querySelector('#pp-clear-mail')?.addEventListener('click', async () => {
        if (!confirm('Delete all e-mails in this chat?')) {
            return;
        }
        await clearAllMail();
        updateMailPrompt();
        updateBadge();
        toast('Mailbox cleared', 'info');
        render();
    });
}

function renderDmailSettings(view) {
    setSoftLabels('Home', 'Back');
    view.style.background = '';
    view.className = 'pp-view';
    const tiers = getDmailTiers();
    const showPw = getSettings().showPhoneWave !== false;
    const facts = getWorldlineFacts();
    const rows = [
        {
            key: 'showPhoneWave',
            on: showPw,
            title: 'Show PhoneWave',
            blurb: 'List PhoneWave (name subject to change) in To:. Off = mail-only mode.',
        },
        {
            key: 'dmailSpectacle',
            on: tiers.spectacle,
            title: 'Spectacle',
            blurb: 'Play the divergence-meter cutscene (video + audio). Does not change the worldline.',
        },
        {
            key: 'dmailPropose',
            on: tiers.propose,
            title: 'Propose',
            blurb: 'Ask first: open an edit screen before Worldline/Apply write anything.',
        },
        {
            key: 'dmailWorldline',
            on: tiers.worldline,
            title: 'Worldline (soft)',
            blurb: 'Quiet prompt inject — facts go into LLM context only, not chat history.',
        },
        {
            key: 'dmailApply',
            on: tiers.apply,
            title: 'Apply (hard)',
            blurb: 'After a D-Mail, offer optional lorebook + smooth character-card confirms (never pastes into chat).',
        },
    ];

    const s = getSettings();
    const loreOn = s.dmailApplyLorebook !== false;
    const cardOn = s.dmailApplyCard !== false;
    const loreName = getConfiguredLorebookName();
    const books = listWorldInfoBookNames();

    const factRows = facts.length
        ? facts.map((f) => `
            <div class="pp-fact-row">
                <span class="pp-fact-text">${escapeHtml(f.text)}</span>
                <button type="button" class="pp-icon-btn pp-trash-btn" data-del-fact="${escapeHtml(f.id)}" title="Remove" aria-label="Remove fact">🗑</button>
            </div>
        `).join('')
        : '<div class="pp-empty pp-fact-empty">No worldline facts yet</div>';

    view.innerHTML = `
        <div class="pp-title">D-Mail</div>
        <div class="pp-scroll">
            ${getSettings().timeleapEnabled !== false ? `
                <button type="button" class="pp-row" id="pp-open-tlm">
                    <span>Time Leap Machine</span>
                    <span class="pp-row-meta">☎ ▸</span>
                </button>
                <p class="pp-settings-note">Call <strong>${escapeHtml(PHONEWAVE_NAME)}</strong> to configure a time leap.</p>
            ` : ''}
            <p class="pp-settings-note">
                Mail to <strong>${escapeHtml(PHONEWAVE_NAME)}</strong> stacks these independently:
                <strong>Spectacle</strong> = cutscene;
                <strong>Propose</strong> = review gate for the fact;
                <strong>Worldline</strong> = soft prompt inject;
                <strong>Apply</strong> = optional lorebook + optional smooth card rewrite (each skippable).
            </p>
            ${rows.map((r) => `
                <button type="button" class="pp-row pp-toggle-row ${r.on ? 'pp-toggle-on' : ''}" data-tier="${r.key}">
                    <span class="pp-toggle-copy">
                        <span class="pp-toggle-title">${escapeHtml(r.title)}</span>
                        <span class="pp-toggle-blurb">${escapeHtml(r.blurb)}</span>
                    </span>
                    <span class="pp-row-meta pp-toggle-state">${r.on ? 'ON' : 'OFF'}</span>
                </button>
            `).join('')}
            <div class="pp-section">Apply writers</div>
            <button type="button" class="pp-row pp-toggle-row ${loreOn ? 'pp-toggle-on' : ''}" id="pp-apply-lore">
                <span class="pp-toggle-copy">
                    <span class="pp-toggle-title">Lorebook confirm</span>
                    <span class="pp-toggle-blurb">Offer lorebook write (pick which book).</span>
                </span>
                <span class="pp-row-meta pp-toggle-state">${loreOn ? 'ON' : 'OFF'}</span>
            </button>
            <button type="button" class="pp-row pp-toggle-row ${cardOn ? 'pp-toggle-on' : ''}" id="pp-apply-card">
                <span class="pp-toggle-copy">
                    <span class="pp-toggle-title">Card confirm</span>
                    <span class="pp-toggle-blurb">Offer smooth in-place character description rewrite.</span>
                </span>
                <span class="pp-row-meta pp-toggle-state">${cardOn ? 'ON' : 'OFF'}</span>
            </button>
            <div class="pp-section">D-Mail compose</div>
            <button type="button" class="pp-row pp-toggle-row ${s.dmailLimit36 ? 'pp-toggle-on' : ''}" id="pp-dmail-36">
                <span class="pp-toggle-copy">
                    <span class="pp-toggle-title">36-character limit</span>
                    <span class="pp-toggle-blurb">English/ASCII only, max 36 chars (classic phone limit). On by default.</span>
                </span>
                <span class="pp-row-meta pp-toggle-state">${s.dmailLimit36 ? 'ON' : 'OFF'}</span>
            </button>
            <button type="button" class="pp-row pp-toggle-row ${s.dmailShowInOutbox ? 'pp-toggle-on' : ''}" id="pp-dmail-outbox">
                <span class="pp-toggle-copy">
                    <span class="pp-toggle-title">Show in outbox</span>
                    <span class="pp-toggle-blurb">Debug: list D-Mails in Outbox. Off = transmissions only.</span>
                </span>
                <span class="pp-row-meta pp-toggle-state">${s.dmailShowInOutbox ? 'ON' : 'OFF'}</span>
            </button>
            <button type="button" class="pp-row pp-toggle-row ${s.dmailMemoryUnchecked !== false ? 'pp-toggle-on' : ''}" id="pp-dmail-mem-off">
                <span class="pp-toggle-copy">
                    <span class="pp-toggle-title">Leave unchecked in memory</span>
                    <span class="pp-toggle-blurb">Character-routed D-Mails appear in Mail memory but stay unchecked.</span>
                </span>
                <span class="pp-row-meta pp-toggle-state">${s.dmailMemoryUnchecked !== false ? 'ON' : 'OFF'}</span>
            </button>
            <label class="pp-field">
                <span class="pp-label">Default lorebook</span>
                <select id="pp-default-lore" class="pp-select">
                    ${[...new Set([loreName, WORLDLINE_LOREBOOK_NAME, ...books])].map((name) => `
                        <option value="${escapeHtml(name)}" ${name === loreName ? 'selected' : ''}>${escapeHtml(name)}</option>
                    `).join('')}
                </select>
            </label>
            <div class="pp-section">Divergence meter</div>
            <button type="button" class="pp-row pp-toggle-row ${s.dmailCutscene === 'progressive' ? 'pp-toggle-on' : ''}" id="pp-dmail-cutscene">
                <span class="pp-toggle-copy">
                    <span class="pp-toggle-title">Cutscene</span>
                    <span class="pp-toggle-blurb">Original clip (fixed numbers) or Progressive (lands on the new divergence).</span>
                </span>
                <span class="pp-row-meta pp-toggle-state">${s.dmailCutscene === 'progressive' ? 'PROG' : 'ORIG'}</span>
            </button>
            <button type="button" class="pp-btn pp-btn-ghost" id="pp-dmail-cutscene-compare">Compare cutscenes</button>
            <button type="button" class="pp-row pp-toggle-row ${s.homeDivergenceMeter !== false ? 'pp-toggle-on' : ''}" id="pp-home-meter-toggle">
                <span class="pp-toggle-copy">
                    <span class="pp-toggle-title">Home screen meter</span>
                    <span class="pp-toggle-blurb">Show this chat's divergence on the phone's home screen.</span>
                </span>
                <span class="pp-row-meta pp-toggle-state">${s.homeDivergenceMeter !== false ? 'ON' : 'OFF'}</span>
            </button>
            <label class="pp-field">
                <span class="pp-label">Current divergence</span>
                <input type="text" id="pp-div-value" inputmode="decimal" value="${escapeHtml(getDivergence())}" />
            </label>
            <button type="button" class="pp-btn pp-btn-ghost" id="pp-div-save">Set divergence</button>
            <div class="pp-section">Worldline facts</div>
            ${factRows}
            <button type="button" class="pp-btn pp-btn-ghost pp-danger-btn" id="pp-clear-worldline" ${facts.length ? '' : 'disabled'}>
                Clear worldline facts
            </button>
        </div>
    `;

    view.querySelectorAll('[data-tier]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const key = btn.getAttribute('data-tier') || '';
            const st = getSettings();
            if (key === 'showPhoneWave') {
                st.showPhoneWave = st.showPhoneWave === false;
                saveSettings();
                if (st.showPhoneWave === false && isPhoneWaveContact(composeToKey)) {
                    composeToKey = '';
                }
                toast(st.showPhoneWave !== false ? 'PhoneWave shown' : 'PhoneWave hidden', 'info');
                render();
                return;
            }
            const tierKey = /** @type {'dmailSpectacle'|'dmailWorldline'|'dmailPropose'|'dmailApply'} */ (key);
            setDmailTier(tierKey, !Boolean(st[tierKey]));
            render();
        });
    });

    view.querySelector('#pp-apply-lore')?.addEventListener('click', () => {
        const st = getSettings();
        st.dmailApplyLorebook = st.dmailApplyLorebook === false;
        saveSettings();
        render();
    });
    view.querySelector('#pp-apply-card')?.addEventListener('click', () => {
        const st = getSettings();
        st.dmailApplyCard = st.dmailApplyCard === false;
        saveSettings();
        render();
    });
    view.querySelector('#pp-dmail-36')?.addEventListener('click', () => {
        const st = getSettings();
        st.dmailLimit36 = !Boolean(st.dmailLimit36);
        saveSettings();
        render();
    });
    view.querySelector('#pp-dmail-cutscene')?.addEventListener('click', () => {
        const st = getSettings();
        st.dmailCutscene = st.dmailCutscene === 'progressive' ? 'original' : 'progressive';
        st.dmailCutsceneChosen = true;
        saveSettings();
        render();
    });
    view.querySelector('#pp-dmail-cutscene-compare')?.addEventListener('click', async () => {
        await showCutscenePrompt();
        render();
    });
    view.querySelector('#pp-home-meter-toggle')?.addEventListener('click', () => {
        const st = getSettings();
        st.homeDivergenceMeter = st.homeDivergenceMeter === false;
        saveSettings();
        render();
    });
    view.querySelector('#pp-div-save')?.addEventListener('click', async () => {
        const input = /** @type {HTMLInputElement | null} */ (view.querySelector('#pp-div-value'));
        const saved = await setDivergence(input?.value || '');
        toast(saved ? `Divergence ${saved}` : 'Use a number like 0.571024', saved ? 'success' : 'warning', 'D-MAIL');
        render();
    });
    view.querySelector('#pp-dmail-outbox')?.addEventListener('click', () => {
        const st = getSettings();
        st.dmailShowInOutbox = !Boolean(st.dmailShowInOutbox);
        saveSettings();
        render();
    });
    view.querySelector('#pp-dmail-mem-off')?.addEventListener('click', () => {
        const st = getSettings();
        st.dmailMemoryUnchecked = st.dmailMemoryUnchecked === false;
        saveSettings();
        render();
    });
    view.querySelector('#pp-default-lore')?.addEventListener('change', (ev) => {
        const st = getSettings();
        st.dmailLorebookName = /** @type {HTMLSelectElement} */ (ev.target).value || WORLDLINE_LOREBOOK_NAME;
        saveSettings();
    });

    view.querySelector('#pp-open-tlm')?.addEventListener('click', () => openTimeleapMachine());

    view.querySelectorAll('[data-del-fact]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-del-fact') || '';
            await removeWorldlineFact(id);
            toast('Fact removed', 'info');
            render();
        });
    });

    view.querySelector('#pp-clear-worldline')?.addEventListener('click', async () => {
        if (!facts.length) {
            return;
        }
        if (!confirm('Clear all worldline facts for this chat?')) {
            return;
        }
        await clearAllWorldlineFacts();
        toast('Worldline cleared', 'info');
        render();
    });
}

function renderDmailPropose(view) {
    setSoftLabels('Apply', 'Skip');
    view.style.background = '';
    view.className = 'pp-view';
    view.innerHTML = `
        <div class="pp-title">Worldline</div>
        <div class="pp-scroll pp-compose">
            <p class="pp-settings-note">Proposed shift${proposeSubject ? ` · ${escapeHtml(proposeSubject)}` : ''}</p>
            <label class="pp-field">
                <span class="pp-label">Fact</span>
                <textarea id="pp-propose-fact" rows="7">${escapeHtml(proposeFact)}</textarea>
            </label>
            <label class="pp-field">
                <span class="pp-label">Divergence · now ${escapeHtml(getDivergence())}</span>
                <input type="text" id="pp-propose-div" inputmode="decimal" value="${escapeHtml(proposeDivergence)}" placeholder="0.000000" />
            </label>
            <button type="button" class="pp-btn" id="pp-propose-apply">Continue</button>
            <button type="button" class="pp-btn pp-btn-ghost" id="pp-propose-skip">Skip</button>
        </div>
    `;

    const factInput = /** @type {HTMLTextAreaElement | null} */ (view.querySelector('#pp-propose-fact'));
    factInput?.addEventListener('input', () => {
        proposeFact = factInput.value || '';
    });

    const finish = async (accept) => {
        if (accept) {
            proposeFact = factInput?.value?.trim() || proposeFact;
            const result = await acceptWorldlineFact(proposeFact);
            const divInput = /** @type {HTMLInputElement | null} */ (view.querySelector('#pp-propose-div'));
            const typed = formatDivergence(divInput?.value);
            if (typed || proposeDivergence) {
                await setDivergence(typed || proposeDivergence);
            }
            proposeDivergence = '';
            pendingNeedLore = Boolean(result.needLoreConfirm);
            pendingNeedCard = Boolean(result.needCardConfirm);
            pendingLoreBookName = getConfiguredLorebookName();
            proposeFact = '';
            proposeSubject = '';
            const bits = [];
            if (result.worldline) {
                bits.push('overlay');
            }
            toast(bits.length ? `Saved · ${bits.join('+')}` : 'Fact saved', 'success', 'D-MAIL');
            if (pendingNeedLore || pendingNeedCard) {
                screen = pendingNeedLore ? 'dmail-lore' : 'dmail-card';
                render();
                return;
            }
        } else {
            toast('Proposal skipped', 'info', 'D-MAIL');
            proposeFact = '';
            proposeSubject = '';
            proposeDivergence = '';
            pendingNeedLore = false;
            pendingNeedCard = false;
            pendingCardPreview = null;
        }
        screen = 'outbox';
        render();
    };

    view.querySelector('#pp-propose-apply')?.addEventListener('click', () => void finish(true));
    view.querySelector('#pp-propose-skip')?.addEventListener('click', () => void finish(false));
}

/**
 * Optional lorebook confirm — pick which book Apply writes into.
 * @param {HTMLElement} view
 */
function renderDmailLoreConfirm(view) {
    setSoftLabels('Write', 'Skip');
    view.style.background = '';
    view.className = 'pp-view';
    const books = listWorldInfoBookNames();
    const selected = pendingLoreBookName || getConfiguredLorebookName();
    if (!pendingLoreBookName) {
        pendingLoreBookName = selected;
    }
    const options = [...new Set([selected, WORLDLINE_LOREBOOK_NAME, ...books].filter(Boolean))];
    const facts = getWorldlineFacts().slice(0, 6);
    const factPreview = facts.length
        ? facts.map((f, i) => `${i + 1}. ${escapeHtml(f.text)}`).join('<br>')
        : '<em>(no facts)</em>';

    view.innerHTML = `
        <div class="pp-title">Lorebook</div>
        <div class="pp-scroll pp-compose">
            <p class="pp-settings-note">
                Optional. Write an always-on worldline entry into a lorebook (skip to leave books alone).
            </p>
            <label class="pp-field">
                <span class="pp-label">Book</span>
                <select id="pp-lore-book" class="pp-select">
                    ${options.map((name) => `
                        <option value="${escapeHtml(name)}" ${name === selected ? 'selected' : ''}>
                            ${escapeHtml(name)}
                        </option>
                    `).join('')}
                </select>
            </label>
            <label class="pp-field">
                <span class="pp-label">Or new name</span>
                <input type="text" id="pp-lore-book-custom" placeholder="${escapeHtml(WORLDLINE_LOREBOOK_NAME)}" value="" />
            </label>
            <div class="pp-card-preview">${factPreview}</div>
            <button type="button" class="pp-btn" id="pp-lore-confirm">Write lorebook</button>
            <button type="button" class="pp-btn pp-btn-ghost" id="pp-lore-skip">Skip lorebook</button>
        </div>
    `;

    const bookSelect = /** @type {HTMLSelectElement | null} */ (view.querySelector('#pp-lore-book'));
    const customInput = /** @type {HTMLInputElement | null} */ (view.querySelector('#pp-lore-book-custom'));
    bookSelect?.addEventListener('change', () => {
        pendingLoreBookName = bookSelect.value || selected;
    });

    const resolveBook = () => {
        const custom = String(customInput?.value || '').trim();
        return custom || bookSelect?.value || pendingLoreBookName || WORLDLINE_LOREBOOK_NAME;
    };

    const goNext = () => {
        pendingNeedLore = false;
        if (pendingNeedCard) {
            screen = 'dmail-card';
            render();
            return;
        }
        screen = 'outbox';
        render();
    };

    view.querySelector('#pp-lore-confirm')?.addEventListener('click', async () => {
        const book = resolveBook();
        pendingLoreBookName = book;
        const ok = await applyWorldlineToLorebook({ bookName: book });
        toast(ok ? `Lorebook · ${book}` : 'Lorebook write failed', ok ? 'success' : 'error', 'D-MAIL');
        goNext();
    });
    view.querySelector('#pp-lore-skip')?.addEventListener('click', () => {
        toast('Lorebook skipped', 'info', 'D-MAIL');
        goNext();
    });
}

/**
 * Smooth character-card rewrite confirm (in-place edit of description).
 * @param {HTMLElement} view
 */
function renderDmailCardConfirm(view) {
    setSoftLabels('Write', 'Skip');
    view.style.background = '';
    view.className = 'pp-view';

    if (!pendingCardPreview) {
        view.innerHTML = `
            <div class="pp-title">Character card</div>
            <div class="pp-scroll pp-compose">
                <p class="pp-settings-note">Rewriting description to match the worldline…</p>
                <div class="pp-empty">Please wait</div>
            </div>
        `;
        void (async () => {
            try {
                pendingCardPreview = await rewriteCharacterCardForWorldline({ fact: proposeFact });
            } catch (err) {
                console.warn(err);
                pendingCardPreview = null;
            }
            if (screen === 'dmail-card') {
                render();
            }
        })();
        return;
    }

    const preview = pendingCardPreview;
    if (!preview) {
        view.innerHTML = `
            <div class="pp-title">Character card</div>
            <div class="pp-scroll pp-compose">
                <p class="pp-settings-note">No active character card to update.</p>
                <button type="button" class="pp-btn" id="pp-card-skip">OK</button>
            </div>
        `;
        view.querySelector('#pp-card-skip')?.addEventListener('click', () => {
            pendingCardPreview = null;
            pendingNeedCard = false;
            screen = 'outbox';
            render();
        });
        return;
    }

    view.innerHTML = `
        <div class="pp-title">Character card</div>
        <div class="pp-scroll pp-compose">
            <p class="pp-settings-note">
                Optional smooth rewrite of <strong>${escapeHtml(preview.characterName)}</strong>'s description
                (facts woven in-place — no worldline block).
            </p>
            <div class="pp-section">Proposed description</div>
            <textarea id="pp-card-next" class="pp-card-edit" rows="10">${escapeHtml(preview.next)}</textarea>
            <button type="button" class="pp-btn" id="pp-card-confirm">Write to card</button>
            <button type="button" class="pp-btn pp-btn-ghost" id="pp-card-skip">Skip card</button>
            <button type="button" class="pp-btn pp-btn-ghost" id="pp-card-regen">Regenerate</button>
        </div>
    `;

    const nextInput = /** @type {HTMLTextAreaElement | null} */ (view.querySelector('#pp-card-next'));

    view.querySelector('#pp-card-confirm')?.addEventListener('click', async () => {
        const text = nextInput?.value ?? preview.next;
        const ok = await applyWorldlineToCharacterCard(text);
        pendingCardPreview = null;
        pendingNeedCard = false;
        toast(ok ? 'Character card updated' : 'Card write failed', ok ? 'success' : 'error', 'D-MAIL');
        screen = 'outbox';
        render();
    });
    view.querySelector('#pp-card-skip')?.addEventListener('click', () => {
        pendingCardPreview = null;
        pendingNeedCard = false;
        toast('Card write skipped', 'info', 'D-MAIL');
        screen = 'outbox';
        render();
    });
    view.querySelector('#pp-card-regen')?.addEventListener('click', () => {
        pendingCardPreview = null;
        render();
    });
}

/**
 * Themed contact picker (replaces native &lt;select&gt;).
 * @param {Element | null} host
 * @param {{
 *   contacts: Array<{ key: string, name: string, isActive?: boolean }>,
 *   selectedKey?: string,
 *   emptyLabel?: string,
 *   optionLabel?: (c: { key: string, name: string, isActive?: boolean }) => string,
 *   onChange?: (key: string, contact: { key: string, name: string } | null) => void,
 * }} opts
 */
/**
 * Persist / inject / summarize phone calls.
 * @param {HTMLElement} view
 */
function renderCallMemory(view) {
    setSoftLabels('Home', 'Back');
    view.style.background = '';
    view.className = 'pp-view';
    const s = getSettings();
    const injectOn = Boolean(s.injectCallMemory);
    const summarizeOn = Boolean(s.callSummarizeOnEnd);
    const calls = getCallMemories();

    const rows = calls.length
        ? calls.map((c) => {
            const stamp = c.endedAt
                ? new Date(c.endedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                : '';
            const body = c.summary
                ? escapeHtml(c.summary)
                : escapeHtml(formatCallTranscript(c).replace(/\n/g, ' · ').slice(0, 160) || '(no lines)');
            return `
                <div class="pp-fact-row pp-call-mem-row">
                    <div class="pp-fact-text">
                        <strong>${escapeHtml(c.contactName)}</strong>
                        <span class="pp-mail-time"> ${escapeHtml(stamp)}</span>
                        <div>${body}</div>
                    </div>
                    <div class="pp-call-mem-actions">
                        ${c.summarized || c.summary ? '' : `<button type="button" class="pp-icon-btn" data-sum-call="${escapeHtml(c.id)}" title="Summarize">Σ</button>`}
                        <button type="button" class="pp-icon-btn pp-trash-btn" data-del-call="${escapeHtml(c.id)}" title="Remove">🗑</button>
                    </div>
                </div>
            `;
        }).join('')
        : '<div class="pp-empty pp-fact-empty">No saved calls yet</div>';

    view.innerHTML = `
        <div class="pp-title">Call memory</div>
        <div class="pp-scroll">
            <p class="pp-settings-note">
                Finished calls are saved here. Summarize to keep a short recollection instead of the full transcript (token-friendly).
            </p>
            <button type="button" class="pp-row pp-toggle-row ${injectOn ? 'pp-toggle-on' : ''}" id="pp-call-inject">
                <span class="pp-toggle-copy">
                    <span class="pp-toggle-title">Inject into chat</span>
                    <span class="pp-toggle-blurb">Add recent call memory to the main LLM prompt.</span>
                </span>
                <span class="pp-row-meta pp-toggle-state">${injectOn ? 'ON' : 'OFF'}</span>
            </button>
            <button type="button" class="pp-row pp-toggle-row ${summarizeOn ? 'pp-toggle-on' : ''}" id="pp-call-autosum">
                <span class="pp-toggle-copy">
                    <span class="pp-toggle-title">Summarize on hang-up</span>
                    <span class="pp-toggle-blurb">Auto-summarize and drop full turns after each call.</span>
                </span>
                <span class="pp-row-meta pp-toggle-state">${summarizeOn ? 'ON' : 'OFF'}</span>
            </button>
            <div class="pp-section">Saved calls</div>
            ${rows}
            <button type="button" class="pp-btn pp-btn-ghost pp-danger-btn" id="pp-clear-calls" ${calls.length ? '' : 'disabled'}>
                Clear call memory
            </button>
        </div>
    `;

    view.querySelector('#pp-call-inject')?.addEventListener('click', () => {
        setCallMemoryInject(!injectOn);
        render();
    });
    view.querySelector('#pp-call-autosum')?.addEventListener('click', () => {
        const st = getSettings();
        st.callSummarizeOnEnd = !Boolean(st.callSummarizeOnEnd);
        saveSettings();
        render();
    });
    view.querySelectorAll('[data-sum-call]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-sum-call') || '';
            btn.setAttribute('disabled', 'true');
            try {
                await summarizeCallRecord(id);
            } catch (_err) {
                /* toasted in helper */
            }
            render();
        });
    });
    view.querySelectorAll('[data-del-call]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            await removeCallMemory(btn.getAttribute('data-del-call') || '');
            toast('Call removed', 'info');
            render();
        });
    });
    view.querySelector('#pp-clear-calls')?.addEventListener('click', async () => {
        if (!calls.length) {
            return;
        }
        if (!confirm('Clear all saved calls for this chat?')) {
            return;
        }
        await clearCallMemories();
        toast('Call memory cleared', 'info');
        render();
    });
}

function mountContactPicker(host, opts) {
    if (!host) {
        return;
    }
    const contacts = opts.contacts || [];
    let selectedKey = opts.selectedKey || contacts[0]?.key || '';
    const labelOf = opts.optionLabel || ((c) => c.name);

    const selected = contacts.find((c) => c.key === selectedKey) || contacts[0] || null;
    if (selected) {
        selectedKey = selected.key;
    }

    host.innerHTML = `
        <div class="pp-picker" data-open="0">
            <button type="button" class="pp-picker-btn" aria-haspopup="listbox" aria-expanded="false">
                <span class="pp-picker-value">${escapeHtml(selected ? labelOf(selected) : (opts.emptyLabel || '—'))}</span>
                <span class="pp-picker-caret" aria-hidden="true">▾</span>
            </button>
            <div class="pp-picker-menu" role="listbox" hidden>
                ${contacts.length
        ? contacts.map((c) => `
                        <button type="button" class="pp-picker-option ${c.key === selectedKey ? 'pp-picker-active' : ''}"
                            role="option" data-key="${escapeHtml(c.key)}" ${c.key === selectedKey ? 'aria-selected="true"' : ''}>
                            ${escapeHtml(labelOf(c))}
                        </button>
                    `).join('')
        : `<div class="pp-picker-empty">${escapeHtml(opts.emptyLabel || '—')}</div>`}
            </div>
        </div>
    `;

    const rootEl = host.querySelector('.pp-picker');
    const btn = host.querySelector('.pp-picker-btn');
    const menu = host.querySelector('.pp-picker-menu');
    const valueEl = host.querySelector('.pp-picker-value');

    const setOpen = (open) => {
        if (!rootEl || !menu || !btn) {
            return;
        }
        rootEl.setAttribute('data-open', open ? '1' : '0');
        menu.hidden = !open;
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) {
            // Close other pickers in the same view
            host.closest('.pp-view')?.querySelectorAll('.pp-picker[data-open="1"]').forEach((other) => {
                if (other !== rootEl) {
                    other.setAttribute('data-open', '0');
                    const m = other.querySelector('.pp-picker-menu');
                    const b = other.querySelector('.pp-picker-btn');
                    if (m) {
                        m.hidden = true;
                    }
                    b?.setAttribute('aria-expanded', 'false');
                }
            });
        }
    };

    btn?.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        setOpen(rootEl?.getAttribute('data-open') !== '1');
    });

    host.querySelectorAll('.pp-picker-option').forEach((opt) => {
        opt.addEventListener('click', (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const key = opt.getAttribute('data-key') || '';
            const contact = contacts.find((c) => c.key === key) || null;
            selectedKey = key;
            if (valueEl) {
                valueEl.textContent = contact ? labelOf(contact) : (opts.emptyLabel || '—');
            }
            host.querySelectorAll('.pp-picker-option').forEach((o) => {
                const on = o.getAttribute('data-key') === key;
                o.classList.toggle('pp-picker-active', on);
                o.setAttribute('aria-selected', on ? 'true' : 'false');
            });
            setOpen(false);
            opts.onChange?.(key, contact);
        });
    });
}

function memoryScopeSetting() {
    return getSettings().mailMemoryScope === 'all' ? 'all' : 'speaker';
}

function renderMemory(view) {
    setSoftLabels('Auto', 'Back');
    view.style.background = '';
    view.className = 'pp-view';

    const contacts = listMailContacts().filter((c) => !isPhoneWaveContact(c.key));
    const scope = memoryScopeSetting();
    let contact = contacts.find((c) => c.key === memoryCharKey)
        || contacts.find((c) => c.isActive)
        || contacts[0]
        || null;
    if (contact) {
        memoryCharKey = contact.key;
    }

    const selection = contact ? getMemorySelection(contact.key) : { mode: 'auto', ids: [] };
    const activeIds = new Set(
        contact
            ? getEmailsForCharacterMemory(contact, { scope, max: 80 }).map((e) => e.id)
            : [],
    );
    const autoIds = new Set(
        contact ? listAutoMemoryEmails(contact, scope).map((e) => e.id) : [],
    );

    const listSource = (() => {
        const all = getEmails();
        if (!contact) {
            return all;
        }
        if (memoryShowAll) {
            return all;
        }
        return all.filter((e) => autoIds.has(e.id) || activeIds.has(e.id) || emailInvolvesLoose(e, contact));
    })();

    const options = contacts.length
        ? contacts.map((c) => {
            const selected = contact && c.key === contact.key ? ' selected' : '';
            const sel = getMemorySelection(c.key);
            const mark = sel.mode === 'manual' ? ' ●' : '';
            return `<option value="${escapeHtml(c.key)}"${selected}>${escapeHtml(c.name)}${mark}</option>`;
        }).join('')
        : '<option value="">—</option>';

    const modeLabel = selection.mode === 'manual'
        ? `Manual · ${activeIds.size}`
        : `Auto · ${activeIds.size}`;

    const rows = listSource.length
        ? listSource.map((e) => {
            const checked = activeIds.has(e.id);
            const involves = contact ? emailInvolvesLoose(e, contact) : false;
            const dir = e.direction === 'in' ? '←' : '→';
            const who = e.direction === 'in' ? e.from : e.to;
            return `
                <label class="pp-memory-row ${checked ? 'pp-memory-on' : ''} ${involves ? '' : 'pp-memory-extra'}">
                    <input type="checkbox" class="pp-memory-check" data-mail-id="${escapeHtml(e.id)}" ${checked ? 'checked' : ''} />
                    <span class="pp-memory-body">
                        <span class="pp-memory-line">
                            <span class="pp-memory-dir">${dir}</span>
                            <span class="pp-mail-from">${escapeHtml(who)}</span>
                            <span class="pp-mail-time">${escapeHtml(formatTime(e.timestamp))}</span>
                        </span>
                        <span class="pp-mail-subj">${escapeHtml(e.subject)}</span>
                        <span class="pp-mail-preview">${escapeHtml(e.body.replace(/\s+/g, ' ').slice(0, 48))}</span>
                    </span>
                </label>
            `;
        }).join('')
        : '<div class="pp-empty">No messages</div>';

    view.innerHTML = `
        <div class="pp-title">Memory</div>
        <div class="pp-memory-toolbar">
            <div class="pp-field pp-memory-char">
                <span class="pp-label">Character</span>
                <div id="pp-memory-char-host"></div>
            </div>
            <div class="pp-memory-meta">
                <span id="pp-memory-mode">${escapeHtml(modeLabel)}</span>
                <button type="button" class="pp-chip-btn" id="pp-memory-toggle-all">${memoryShowAll ? 'Involving' : 'All mail'}</button>
            </div>
            <div class="pp-memory-actions">
                <button type="button" class="pp-chip-btn" id="pp-memory-auto">Auto</button>
                <button type="button" class="pp-chip-btn" id="pp-memory-involving">To/From</button>
                <button type="button" class="pp-chip-btn" id="pp-memory-none">None</button>
            </div>
        </div>
        <div class="pp-scroll pp-memory-list">${rows}</div>
    `;

    mountContactPicker(view.querySelector('#pp-memory-char-host'), {
        contacts,
        selectedKey: memoryCharKey,
        emptyLabel: '—',
        optionLabel: (c) => {
            const sel = getMemorySelection(c.key);
            return sel.mode === 'manual' ? `${c.name} ●` : c.name;
        },
        onChange: (key) => {
            memoryCharKey = key;
            render();
        },
    });

    view.querySelector('#pp-memory-toggle-all')?.addEventListener('click', () => {
        memoryShowAll = !memoryShowAll;
        render();
    });

    view.querySelector('#pp-memory-auto')?.addEventListener('click', async () => {
        if (!contact) {
            return;
        }
        await setMemorySelection(contact.key, { mode: 'auto', ids: [] });
        updateMailPrompt(contact);
        toast(`Auto memory · ${contact.name}`, 'info');
        render();
    });

    view.querySelector('#pp-memory-involving')?.addEventListener('click', async () => {
        if (!contact) {
            return;
        }
        const ids = listAutoMemoryEmails(contact, scope).map((e) => e.id);
        await setMemorySelection(contact.key, { mode: 'manual', ids });
        updateMailPrompt(contact);
        toast(`To/From · ${ids.length}`, 'info');
        render();
    });

    view.querySelector('#pp-memory-none')?.addEventListener('click', async () => {
        if (!contact) {
            return;
        }
        await setMemorySelection(contact.key, { mode: 'manual', ids: [] });
        updateMailPrompt(contact);
        toast('Cleared picks', 'info');
        render();
    });

    view.querySelectorAll('.pp-memory-check').forEach((input) => {
        input.addEventListener('change', async () => {
            if (!contact) {
                return;
            }
            const id = input.getAttribute('data-mail-id') || '';
            const on = /** @type {HTMLInputElement} */ (input).checked;
            await toggleCharacterMemoryEmail(contact, id, on, scope);
            updateMailPrompt(contact);
            // Update mode label without full re-render to keep scroll position
            const sel = getMemorySelection(contact.key);
            const count = getEmailsForCharacterMemory(contact, { scope, max: 80 }).length;
            const modeEl = view.querySelector('#pp-memory-mode');
            if (modeEl) {
                modeEl.textContent = sel.mode === 'manual' ? `Manual · ${count}` : `Auto · ${count}`;
            }
            const row = input.closest('.pp-memory-row');
            row?.classList.toggle('pp-memory-on', on);
        });
    });
}

/** Loose involve check for Memory list filtering (same as store helper). */
function emailInvolvesLoose(email, contact) {
    if (!email || !contact) {
        return false;
    }
    const key = String(contact.key || '').trim();
    const name = String(contact.name || '').trim().toLowerCase();
    if (key && email.characterKey === key) {
        return true;
    }
    if (name) {
        if (String(email.from || '').trim().toLowerCase() === name) {
            return true;
        }
        if (String(email.to || '').trim().toLowerCase() === name) {
            return true;
        }
    }
    return false;
}

function renderWallpaper(view) {
    setSoftLabels('Apply', 'Back');
    view.style.background = '';
    view.className = 'pp-view';
    const settings = getSettings();
    const own = `
        <button type="button" class="pp-row ${settings.wallpaperId === 'phone' && !settings.customWallpaperUrl ? 'pp-selected' : ''}" data-wall="phone">
            <span>This phone's</span>
            <span class="pp-swatch" style="background:${escapeHtml(specWallpaperCss(activeSpec()))}"></span>
        </button>
    `;
    const presets = own + WALLPAPERS.map((w) => `
        <button type="button" class="pp-row ${settings.wallpaperId === w.id && !settings.customWallpaperUrl ? 'pp-selected' : ''}" data-wall="${w.id}">
            <span>${escapeHtml(w.name)}</span>
            <span class="pp-swatch" style="background:${escapeHtml(w.css)}"></span>
        </button>
    `).join('');

    view.innerHTML = `
        <div class="pp-title">Wallpaper</div>
        <div class="pp-scroll">
            ${presets}
            <label class="pp-field">
                <span class="pp-label">Custom image URL</span>
                <input type="url" id="pp-wall-url" value="${escapeHtml(settings.customWallpaperUrl)}" placeholder="https://…" />
            </label>
            <button type="button" class="pp-btn" id="pp-wall-apply">Use custom URL</button>
            <button type="button" class="pp-btn pp-btn-ghost" id="pp-wall-clear">Clear custom</button>
        </div>
    `;

    view.querySelectorAll('[data-wall]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const settingsNow = getSettings();
            settingsNow.wallpaperId = btn.getAttribute('data-wall');
            settingsNow.customWallpaperUrl = '';
            saveSettings();
            toast('Wallpaper changed', 'success');
            render();
        });
    });
    view.querySelector('#pp-wall-apply')?.addEventListener('click', () => {
        const url = /** @type {HTMLInputElement} */ (view.querySelector('#pp-wall-url'))?.value?.trim() || '';
        const settingsNow = getSettings();
        settingsNow.customWallpaperUrl = url;
        saveSettings();
        toast(url ? 'Custom wallpaper set' : 'Cleared', 'success');
        render();
    });
    view.querySelector('#pp-wall-clear')?.addEventListener('click', () => {
        const settingsNow = getSettings();
        settingsNow.customWallpaperUrl = '';
        saveSettings();
        render();
    });
}

function renderSounds(view) {
    setSoftLabels('Home', 'Back');
    view.style.background = '';
    view.className = 'pp-view';
    const settings = getSettings();
    const notifyPresets = SOUND_PRESETS.filter((p) => p.kind === 'notify' || p.kind === 'both');
    const ringPresets = SOUND_PRESETS.filter((p) => p.kind === 'ringtone' || p.kind === 'both');

    const notifyRows = notifyPresets.map((p) => `
        <button type="button" class="pp-row ${settings.notificationSoundId === p.id ? 'pp-selected' : ''}" data-notify="${p.id}">
            <span>${escapeHtml(p.name)}</span>
            <span class="pp-row-meta">♪</span>
        </button>
    `).join('');
    const ringRows = ringPresets.map((p) => `
        <button type="button" class="pp-row ${settings.ringtoneId === p.id ? 'pp-selected' : ''}" data-ring="${p.id}">
            <span>${escapeHtml(p.name)}</span>
            <span class="pp-row-meta">♪</span>
        </button>
    `).join('');

    view.innerHTML = `
        <div class="pp-title">Sounds</div>
        <div class="pp-scroll">
            <div class="pp-section">Notification</div>
            ${notifyRows}
            <label class="pp-field">
                <span class="pp-label">Custom notification URL</span>
                <input type="url" id="pp-notify-url" value="${escapeHtml(settings.customNotificationUrl)}" placeholder="https://…/notify.mp3" />
            </label>
            <div class="pp-section">Ringtone</div>
            ${ringRows}
            <label class="pp-field">
                <span class="pp-label">Custom ringtone URL</span>
                <input type="url" id="pp-ring-url" value="${escapeHtml(settings.customRingtoneUrl)}" placeholder="https://…/ring.mp3" />
            </label>
            <button type="button" class="pp-btn" id="pp-sound-urls">Save custom URLs</button>
        </div>
    `;

    view.querySelectorAll('[data-notify]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-notify');
            const s = getSettings();
            s.notificationSoundId = id;
            s.customNotificationUrl = '';
            saveSettings();
            await playPreset(id);
            render();
        });
    });
    view.querySelectorAll('[data-ring]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-ring');
            const s = getSettings();
            s.ringtoneId = id;
            s.customRingtoneUrl = '';
            saveSettings();
            await playPreset(id);
            render();
        });
    });
    view.querySelector('#pp-sound-urls')?.addEventListener('click', () => {
        const s = getSettings();
        s.customNotificationUrl = /** @type {HTMLInputElement} */ (view.querySelector('#pp-notify-url'))?.value?.trim() || '';
        s.customRingtoneUrl = /** @type {HTMLInputElement} */ (view.querySelector('#pp-ring-url'))?.value?.trim() || '';
        saveSettings();
        toast('Custom sound URLs saved', 'success');
    });
}

function bindGoto(view) {
    view.querySelectorAll('[data-goto]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const next = btn.getAttribute('data-goto') || 'home';
            if (screen === 'inbox' && next !== 'inbox') {
                forcePanelOpen = false;
            }
            screen = next;
            if (screen === 'compose') {
                composeSubject = '';
                composeBody = '';
                composeReplyTo = null;
                composeToKey = '';
                composeNoReply = false;
            }
            render();
        });
    });
}

export function refreshIfOpen() {
    updateBadge();
    if (isPhoneOpen()) {
        render();
    }
}

export function openInbox() {
    openPhone('inbox');
}
