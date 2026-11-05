/**
 * Steins;Gate-style system menu — every Phone Trigger setting in one full-screen dialog.
 *
 * settings.html ships the drawer launcher plus `#pp-menu-sections` (one `<section
 * class="pp-menu-cat">` per category). mountMenu() moves those sections into the dialog
 * before index.js binds them, so every field keeps its ID and its existing binding.
 */
import { getSettings } from './settings.js';
import { drawStaticMeter } from './divmeter.js';
import { getDivergence } from './dmail.js';
import { getUnreadCount } from './store.js';
import { countLeaps } from './timeleap.js';
import { startMenuMusic, stopMenuMusic } from './menuMusic.js';
import { isStoryClockActive, getStoryDate } from './storyClock.js';

const MENU_ID = 'pp-menu';
const LAST_CAT_KEY = 'phone-trigger:menu-cat';

/** @type {Map<string, (pane: HTMLElement) => void>} */
const renderers = new Map();
/** @type {ReturnType<typeof setInterval> | null} */
let clockTimer = null;

/**
 * Run `fn` each time a category is shown (dynamic content such as the Phones list).
 * @param {string} cat
 * @param {(pane: HTMLElement) => void} fn
 */
export function registerMenuCategory(cat, fn) {
    renderers.set(cat, fn);
}

function getMenu() {
    return /** @type {HTMLDialogElement | null} */ (document.getElementById(MENU_ID));
}

/**
 * Build the dialog and move the settings sections into it. Safe to call twice.
 * Must run before the settings bindings so the fields are already in place.
 */
export function mountMenu() {
    if (getMenu()) {
        return;
    }
    const source = document.getElementById('pp-menu-sections');
    const sections = source ? [...source.querySelectorAll('section.pp-menu-cat')] : [];

    /** @type {HTMLDialogElement} */
    const dialog = document.createElement('dialog');
    dialog.id = MENU_ID;
    dialog.className = 'pp-menu';
    dialog.setAttribute('aria-label', 'Phone Trigger menu');
    dialog.innerHTML = `
        <div class="pp-menu-bg" aria-hidden="true">
            <svg class="pp-menu-gear pp-menu-gear-a" viewBox="0 0 100 100">${gearPath(18, 46, 38)}</svg>
            <svg class="pp-menu-gear pp-menu-gear-b" viewBox="0 0 100 100">${gearPath(12, 46, 36)}</svg>
            <svg class="pp-menu-dial" viewBox="0 0 100 100">${dialMarks()}</svg>
        </div>
        <div class="pp-menu-frame">
            <header class="pp-menu-head">
                <div class="pp-menu-brand">
                    <span class="pp-menu-kicker">Future Gadget Laboratory</span>
                    <span class="pp-menu-title" data-text="PHONE TRIGGER">PHONE TRIGGER</span>
                </div>
                <canvas class="pp-menu-meter" aria-label="Divergence"></canvas>
                <div class="pp-menu-clock" aria-hidden="true">--:--</div>
                <button type="button" class="pp-menu-close" aria-label="Close menu">✕</button>
            </header>
            <nav class="pp-menu-rail" aria-label="Categories">
                ${sections.map((sec, i) => `
                    <button type="button" class="pp-menu-tab" data-cat="${sec.dataset.cat}" style="--i:${i}">
                        <span class="pp-menu-tab-icon" aria-hidden="true">${sec.dataset.icon || '■'}</span>
                        <span class="pp-menu-tab-label">${sec.dataset.title || sec.dataset.cat}</span>
                    </button>
                `).join('')}
            </nav>
            <main class="pp-menu-pane" id="pp-menu-pane"></main>
            <footer class="pp-menu-foot">
                <span id="pp-menu-status"></span>
                <span class="pp-menu-sign">El Psy Kongroo.</span>
            </footer>
        </div>
        <div class="pp-menu-scan" aria-hidden="true"></div>
    `;
    document.body.appendChild(dialog);

    const pane = /** @type {HTMLElement} */ (dialog.querySelector('#pp-menu-pane'));
    for (const sec of sections) {
        sec.hidden = true;
        const head = document.createElement('h2');
        head.className = 'pp-menu-cat-title';
        head.innerHTML = `<span aria-hidden="true">${sec.dataset.icon || '■'}</span> ${sec.dataset.title || ''}`;
        sec.prepend(head);
        pane.appendChild(sec);
    }
    source?.remove();
    addEnableMirror(pane);

    dialog.querySelectorAll('.pp-menu-tab').forEach((tab) => {
        tab.addEventListener('click', () => showCategory(tab.getAttribute('data-cat') || ''));
    });
    dialog.querySelector('.pp-menu-close')?.addEventListener('click', () => closeMenu());
    dialog.addEventListener('cancel', (e) => {
        e.preventDefault();
        closeMenu();
    });
    // However the menu goes away, the menu song goes with it.
    dialog.addEventListener('close', () => stopMenuMusic());
    dialog.addEventListener('click', (e) => {
        if (e.target === dialog) {
            closeMenu();
        }
    });
}

/** The extension's Enable lives in the drawer; mirror it at the top of System. */
function addEnableMirror(pane) {
    const system = pane.querySelector('section[data-cat="system"]');
    if (!system) {
        return;
    }
    const block = document.createElement('div');
    block.className = 'pp-settings-block';
    block.innerHTML = `
        <label><input id="pp_enabled_mirror" type="checkbox" /><span>Enable Phone Trigger</span></label>
    `;
    system.querySelector('.pp-menu-lead')?.after(block);
    const mirror = /** @type {HTMLInputElement} */ (block.querySelector('input'));
    mirror.addEventListener('change', () => {
        const real = /** @type {HTMLInputElement | null} */ (document.getElementById('pp_enabled'));
        if (real) {
            real.checked = mirror.checked;
            // index.js onToggle listens for 'input'; jQuery handlers receive native events.
            real.dispatchEvent(new Event('input', { bubbles: true }));
            real.dispatchEvent(new Event('change', { bubbles: true }));
        }
    });
}

/** @param {string} cat */
function showCategory(cat) {
    const dialog = getMenu();
    if (!dialog) {
        return;
    }
    const sections = [...dialog.querySelectorAll('section.pp-menu-cat')];
    const target = sections.find((s) => s.getAttribute('data-cat') === cat) || sections[0];
    if (!target) {
        return;
    }
    for (const s of sections) {
        if (s !== target) {
            s.hidden = true;
            s.classList.remove('pp-menu-cat-in');
        }
    }
    target.hidden = false;
    target.classList.remove('pp-menu-cat-in');
    void target.offsetWidth; // restart the entrance animation
    target.classList.add('pp-menu-cat-in');
    dialog.querySelectorAll('.pp-menu-tab').forEach((tab) => {
        const on = tab.getAttribute('data-cat') === target.getAttribute('data-cat');
        tab.classList.toggle('pp-menu-tab-on', on);
        tab.setAttribute('aria-current', on ? 'page' : 'false');
        if (on) {
            tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
    });
    try {
        document.dispatchEvent(new CustomEvent('pt:menu-category', { detail: { cat: target.getAttribute('data-cat') } }));
    } catch {
        // ignore
    }
    const pane = dialog.querySelector('.pp-menu-pane');
    if (pane) {
        pane.scrollTop = 0;
    }
    const id = target.getAttribute('data-cat') || '';
    try {
        localStorage.setItem(LAST_CAT_KEY, id);
    } catch {
        /* ignore */
    }
    try {
        renderers.get(id)?.(/** @type {HTMLElement} */ (target));
    } catch (err) {
        console.warn('[Phone Trigger] menu category render failed', err);
    }
}

/**
 * @param {string} [cat] category to open on (defaults to the last one viewed)
 */
export function openMenu(cat) {
    mountMenu();
    const dialog = getMenu();
    if (!dialog) {
        return;
    }
    let last = '';
    try {
        last = localStorage.getItem(LAST_CAT_KEY) || '';
    } catch {
        /* ignore */
    }
    const mirror = /** @type {HTMLInputElement | null} */ (dialog.querySelector('#pp_enabled_mirror'));
    if (mirror) {
        mirror.checked = getSettings().enabled !== false;
    }
    dialog.classList.remove('pp-menu-out');
    if (!dialog.open) {
        try {
            dialog.showModal();
        } catch {
            dialog.setAttribute('open', '');
        }
    }
    dialog.classList.remove('pp-menu-in');
    void dialog.offsetWidth;
    dialog.classList.add('pp-menu-in');
    showCategory(cat || last || 'system');
    refreshHeader();
    startMenuMusic();
    if (!clockTimer) {
        clockTimer = setInterval(tickClock, 1000);
    }
}

export function closeMenu() {
    const dialog = getMenu();
    if (!dialog?.open) {
        return;
    }
    dialog.classList.remove('pp-menu-in');
    dialog.classList.add('pp-menu-out');
    stopMenuMusic();
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    window.setTimeout(() => {
        dialog.classList.remove('pp-menu-out');
        try {
            dialog.close();
        } catch {
            dialog.removeAttribute('open');
        }
    }, reduce ? 0 : 340);
    if (clockTimer) {
        clearInterval(clockTimer);
        clockTimer = null;
    }
    updateMenuStatus();
}

export function isMenuOpen() {
    return Boolean(getMenu()?.open);
}

function tickClock() {
    const el = getMenu()?.querySelector('.pp-menu-clock');
    if (el) {
        if (getSettings().storyClockOnPhone !== false && isStoryClockActive()) {
            // Story time has no seconds: show the date instead.
            const d = getStoryDate();
            el.textContent = `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
            return;
        }
        const d = new Date();
        el.textContent = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
    }
}

function refreshHeader() {
    tickClock();
    const canvas = /** @type {HTMLCanvasElement | null} */ (getMenu()?.querySelector('.pp-menu-meter'));
    if (canvas) {
        requestAnimationFrame(() => {
            try {
                drawStaticMeter(canvas, getDivergence());
            } catch {
                /* no chat yet */
            }
        });
    }
    updateMenuStatus();
}

/** One-line status for the drawer launcher and the menu footer. */
export function updateMenuStatus() {
    let text = '';
    try {
        const leaps = countLeaps();
        const unread = getUnreadCount();
        text = [
            `Divergence ${getDivergence()}`,
            `${unread} unread`,
            leaps ? `${leaps} leap${leaps === 1 ? '' : 's'}` : '',
        ].filter(Boolean).join(' · ');
    } catch {
        text = '';
    }
    const drawer = document.getElementById('pp_drawer_status');
    if (drawer) {
        drawer.textContent = text;
    }
    const foot = document.getElementById('pp-menu-status');
    if (foot) {
        foot.textContent = text;
    }
}

/**
 * Gear outline as an SVG path.
 * @param {number} teeth
 * @param {number} outer
 * @param {number} inner
 */
function gearPath(teeth, outer, inner) {
    const pts = [];
    const step = (Math.PI * 2) / teeth;
    for (let i = 0; i < teeth; i++) {
        const a = i * step;
        pts.push([a - step * 0.22, outer], [a + step * 0.22, outer], [a + step * 0.32, inner], [a + step * 0.68, inner]);
    }
    const d = pts.map(([a, r], i) => `${i ? 'L' : 'M'}${(50 + Math.cos(a) * r).toFixed(2)} ${(50 + Math.sin(a) * r).toFixed(2)}`).join(' ');
    return `<path d="${d} Z" /><circle cx="50" cy="50" r="${(inner * 0.45).toFixed(1)}" />`;
}

/** Clock-face tick ring. */
function dialMarks() {
    const out = ['<circle cx="50" cy="50" r="47" />'];
    for (let i = 0; i < 60; i++) {
        const a = (i / 60) * Math.PI * 2;
        const r1 = i % 5 === 0 ? 40 : 43;
        out.push(`<line x1="${(50 + Math.cos(a) * r1).toFixed(2)}" y1="${(50 + Math.sin(a) * r1).toFixed(2)}" x2="${(50 + Math.cos(a) * 46).toFixed(2)}" y2="${(50 + Math.sin(a) * 46).toFixed(2)}" />`);
    }
    out.push('<line class="pp-menu-hand" x1="50" y1="50" x2="50" y2="14" />');
    return out.join('');
}
