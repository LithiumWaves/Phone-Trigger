/**
 * Menu → Inject context: the three feed modes and, in Manual, the item picker.
 */
import { getCtxPicks, setCtxPicks, toggleCtxPick } from './store.js';
import { registerMenuCategory } from './menu.js';
import { esc, bindValue, bindNumber } from './ui.js';
import {
    feedMode, feedableMails, feedableCalls, mailStamp, mailCap, callCap, initGenContext,
} from './genContext.js';
import { formatStoryTime } from './storyClock.js';

/** @typedef {'mailToCall' | 'callToMail' | 'callToCall'} Kind */

const FEEDS = /** @type {const} */ ([
    { kind: 'mailToCall', key: 'ctxMailToCall', title: 'E-mails → calls', what: 'mail' },
    { kind: 'callToMail', key: 'ctxCallToMail', title: 'Past calls → mail replies', what: 'call' },
    { kind: 'callToCall', key: 'ctxCallToCall', title: 'Past calls → new calls', what: 'call' },
]);

/** @type {HTMLElement | null} */
let pane = null;

function hasChat() {
    try {
        const ctx = SillyTavern.getContext();
        return Boolean(ctx?.chatMetadata) && (ctx.characterId !== undefined || ctx.groupId);
    } catch {
        return false;
    }
}

/** @param {import('./callMemory.js').CallMemoryRecord} c */
function callStamp(c) {
    if (c.storyTime) {
        return formatStoryTime(c.storyTime);
    }
    const when = c.endedAt || c.startedAt;
    return when ? new Date(when).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
}

/** @param {import('./callMemory.js').CallMemoryRecord} c */
function callText(c) {
    if (c.summary) {
        return c.summary;
    }
    return (c.turns || []).filter((t) => t.role === 'user' || t.role === 'char').map((t) => t.text).join(' · ');
}

/** @param {typeof FEEDS[number]} feed */
function autoNote(feed) {
    if (feed.what === 'mail') {
        return `Uses the last ${mailCap()} mails with whoever you're on the call with.`;
    }
    return feed.kind === 'callToMail'
        ? `Uses the last ${callCap()} calls with whoever is writing the mail.`
        : `Uses the last ${callCap()} earlier calls with whoever you're on the call with.`;
}

/** @param {typeof FEEDS[number]} feed */
function itemsFor(feed) {
    if (feed.what === 'mail') {
        return feedableMails().map((e) => ({
            id: e.id,
            meta: `${mailStamp(e)} · ${e.direction === 'out' ? `to ${e.to}` : e.from}`,
            text: e.subject || '(no subject)',
        }));
    }
    return feedableCalls().map((c) => ({
        id: c.id,
        meta: `${callStamp(c)} · ${c.direction === 'in' ? 'from' : c.direction === 'out' ? 'to' : ''} ${c.contactName}`,
        text: callText(c).slice(0, 120),
    }));
}

/** @param {typeof FEEDS[number]} feed */
function feedHtml(feed) {
    const mode = feedMode(feed.key);
    if (mode === 'off') {
        return '';
    }
    if (mode === 'auto') {
        return `<p class="pp-ctx-note">${esc(autoNote(feed))}</p>`;
    }
    if (!hasChat()) {
        return '<p class="pp-ctx-note">Open a chat to pick items.</p>';
    }
    const items = itemsFor(feed);
    if (!items.length) {
        return `<p class="pp-ctx-note">No ${feed.what === 'mail' ? 'e-mails' : 'calls'} in this chat yet.</p>`;
    }
    const picked = new Set(getCtxPicks(feed.kind));
    return `
        <div class="pp-ctx-tools">
            <span>${picked.size ? `${[...picked].filter((id) => items.some((i) => i.id === id)).length} picked` : 'None picked'} — ticked items are used for everyone</span>
            <button type="button" class="menu_button" data-ctx-all="${feed.kind}">All</button>
            <button type="button" class="menu_button" data-ctx-none="${feed.kind}">None</button>
            <button type="button" class="menu_button" data-ctx-recent="${feed.kind}">Last 5</button>
        </div>
        <div class="pp-ctx-list">
            ${items.map((it) => `
            <label class="pp-ctx-pick">
                <input type="checkbox" data-ctx-kind="${feed.kind}" data-ctx-id="${esc(it.id)}" ${picked.has(it.id) ? 'checked' : ''}>
                <span class="pp-ctx-meta">${esc(it.meta)}</span>
                <span class="pp-ctx-text">${esc(it.text)}</span>
            </label>`).join('')}
        </div>`;
}

function renderPicker() {
    const host = pane?.querySelector('#pp-ctx-picker') || document.getElementById('pp-ctx-picker');
    if (!host) {
        return;
    }
    host.innerHTML = FEEDS.map((feed) => {
        const body = feedHtml(feed);
        return body ? `<div class="pp-ctx-feed"><h4 class="pp-ctx-feed-title">${esc(feed.title)}</h4>${body}</div>` : '';
    }).join('');
    host.querySelectorAll('input[data-ctx-kind]').forEach((box) => box.addEventListener('change', () => {
        const el = /** @type {HTMLInputElement} */ (box);
        void toggleCtxPick(/** @type {Kind} */ (el.dataset.ctxKind), el.dataset.ctxId || '', el.checked).then(renderPicker);
    }));
    const bulk = (attr, ids) => host.querySelectorAll(`[${attr}]`).forEach((btn) => btn.addEventListener('click', () => {
        const kind = /** @type {Kind} */ (btn.getAttribute(attr));
        const feed = FEEDS.find((f) => f.kind === kind);
        if (feed) {
            void setCtxPicks(kind, ids(itemsFor(feed))).then(renderPicker);
        }
    }));
    bulk('data-ctx-all', (items) => items.map((i) => i.id));
    bulk('data-ctx-none', () => []);
    bulk('data-ctx-recent', (items) => items.slice(0, 5).map((i) => i.id));
}

/** Bind Menu → Inject context and hook the feeds into generation. */
export function initContextMenu() {
    initGenContext();
    for (const feed of FEEDS) {
        bindValue(`#pp_${feed.key.toLowerCase()}`, feed.key, () => renderPicker(), ['auto', 'off', 'manual']);
    }
    bindNumber('#pp_ctx_mail_max', 'ctxMailToCallMax', { min: 1, max: 30, fallback: 6 }, () => renderPicker());
    bindNumber('#pp_ctx_call_max', 'ctxCallMax', { min: 1, max: 20, fallback: 3 }, () => renderPicker());
    registerMenuCategory('context', (p) => {
        pane = p;
        // Settings may have changed elsewhere (another device, a reset).
        for (const feed of FEEDS) {
            const sel = /** @type {HTMLSelectElement | null} */ (document.getElementById(`pp_${feed.key.toLowerCase()}`));
            if (sel) {
                sel.value = feedMode(feed.key);
            }
        }
        renderPicker();
    });
    document.addEventListener('pt:mail-rewritten', () => renderPicker());
}
