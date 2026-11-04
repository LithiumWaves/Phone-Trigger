/**
 * TIPS — the visual novel's glossary. As the story mentions terms (science, otaku culture and
 * internet slang by default), short entries are written for them and collected in the menu.
 * Reader-facing only: nothing here is sent to the roleplay.
 */
import { getSettings, saveSettings, toast } from './settings.js';
import { getMailStore, persistMailStore } from './store.js';
import { getDivergence } from './dmail.js';
import { storyStamp } from './storyClock.js';
import { esc, quietGenerate, parseJsonLoose, bindToggle, bindNumber, bindValue } from './ui.js';

export const TIPS_CATEGORIES = Object.freeze([
    { id: 'science', label: 'Science', hint: 'physics, neuroscience, computing, time-travel theory' },
    { id: 'otaku', label: 'Otaku', hint: 'anime, manga, games, idols, Akihabara culture, cosplay' },
    { id: 'internet', label: 'Internet', hint: 'textboard slang, memes, net culture' },
    { id: 'places', label: 'Places', hint: 'real or story locations' },
    { id: 'people', label: 'People', hint: 'historical or famous figures (not the cast)' },
    { id: 'orgs', label: 'Organizations', hint: 'companies, institutes, secret societies' },
    { id: 'story', label: 'Story', hint: 'the story\'s own gadgets, jargon and events' },
]);

/** @typedef {{ id: string, term: string, category: string, text: string, divergence: string, storyTime?: string, at: number, manual?: boolean }} Tip */

function tipsList() {
    const m = getMailStore();
    if (!Array.isArray(m.tips)) {
        m.tips = [];
    }
    return m.tips;
}

/** Enabled categories (built-in ids and custom labels). */
function enabledCategories() {
    const s = getSettings();
    const ids = Array.isArray(s.tipsCategories) ? s.tipsCategories : ['science', 'otaku', 'internet'];
    const builtIn = TIPS_CATEGORIES.filter((c) => ids.includes(c.id));
    const custom = String(s.tipsCustomCategories || '').split(',').map((x) => x.trim()).filter(Boolean)
        .map((label) => ({ id: `custom:${label.toLowerCase()}`, label, hint: label }));
    return [...builtIn, ...custom];
}

function categoryLabel(id) {
    return TIPS_CATEGORIES.find((c) => c.id === id)?.label
        || (String(id).startsWith('custom:') ? String(id).slice(7).replace(/^\w/, (x) => x.toUpperCase()) : id);
}

const STYLE = 'Write like the TIPS glossary of a visual novel: clear, informative, 2–4 sentences, a dry aside allowed. Real-world facts must be accurate; story-only terms are explained as the story uses them.';

let sinceCheck = 0;
let checking = false;
/** Index of the last chat message already scanned. */
function lastScanned() {
    return Number(getMailStore().tipsScanned) || 0;
}

/** Count a character message; every N, look for new terms. */
export function noteTipsMessage() {
    const s = getSettings();
    if (!s.tipsEnabled) {
        return;
    }
    sinceCheck += 1;
    if (sinceCheck >= Math.max(1, Number(s.tipsEvery) || 4)) {
        sinceCheck = 0;
        void scanForTips();
    }
}

/** Look through recent messages for new terms in the enabled categories. */
export async function scanForTips() {
    if (checking) {
        return 0;
    }
    const cats = enabledCategories();
    if (!cats.length) {
        return 0;
    }
    const ctx = (await import('./settings.js')).getContext();
    const chat = Array.isArray(ctx.chat) ? ctx.chat : [];
    const from = Math.max(lastScanned(), chat.length - 12);
    const text = chat.slice(from).filter((m) => m && !m.is_system && m.mes)
        .map((m) => `${m.name}: ${String(m.mes).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 600)}`).join('\n');
    if (!text.trim()) {
        return 0;
    }
    checking = true;
    try {
        const known = tipsList().map((t) => t.term.toLowerCase());
        const prompt = [
            'You keep the TIPS glossary for a story. Find terms in the passage below that a reader might want explained.',
            'Only these categories:',
            ...cats.map((c) => `- ${c.id}: ${c.label} (${c.hint})`),
            known.length ? `Already explained (skip): ${known.slice(-80).join(', ')}` : '',
            'Skip names of the main characters, everyday words, and anything you are unsure about. Pick at most 3 — often none.',
            STYLE,
            '',
            'Passage:',
            text,
            '',
            'Answer with JSON only: [{"term": "…", "category": "<id>", "text": "…"}] (or [] if nothing qualifies).',
        ].filter(Boolean).join('\n');
        const res = parseJsonLoose(await quietGenerate(prompt));
        const list = Array.isArray(res) ? res : [];
        const allowed = new Set(cats.map((c) => c.id));
        const added = [];
        for (const t of list.slice(0, 3)) {
            const term = String(t?.term || '').trim().slice(0, 60);
            const body = String(t?.text || '').trim().slice(0, 900);
            const category = allowed.has(t?.category) ? t.category : null;
            if (!term || !body || !category || known.includes(term.toLowerCase())) {
                continue;
            }
            added.push(addTip({ term, category, text: body }));
            known.push(term.toLowerCase());
        }
        getMailStore().tipsScanned = chat.length;
        await persistMailStore();
        if (added.length) {
            toast(`TIPS updated: ${added.map((t) => t.term).join(', ')}`, 'info', 'TIPS');
            renderTipsPanel();
        }
        return added.length;
    } catch (err) {
        console.debug('[Phone Trigger] TIPS scan failed', err);
        return 0;
    } finally {
        checking = false;
    }
}

/** @param {{ term: string, category: string, text: string, manual?: boolean }} t */
function addTip(t) {
    /** @type {Tip} */
    const tip = {
        id: `tip_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
        term: t.term,
        category: t.category,
        text: t.text,
        divergence: getDivergence(),
        storyTime: storyStamp(),
        at: Date.now(),
        manual: t.manual || undefined,
    };
    tipsList().push(tip);
    return tip;
}

/** "Explain a term…" from the menu. */
async function explainTerm(term, category) {
    const ctx = (await import('./settings.js')).getContext();
    const recent = (ctx.chat || []).slice(-8).map((m) => `${m.name}: ${String(m.mes || '').slice(0, 300)}`).join('\n');
    const cats = enabledCategories();
    const prompt = [
        `Write the TIPS glossary entry for "${term}".`,
        STYLE,
        category ? `Category: ${categoryLabel(category)}` : `Pick the best category id from: ${[...TIPS_CATEGORIES, ...cats].map((c) => c.id).join(', ')}`,
        recent ? `How the story mentions it (if at all):\n${recent}` : '',
        'Answer with JSON only: {"category": "<id>", "text": "…"}',
    ].filter(Boolean).join('\n');
    const res = parseJsonLoose(await quietGenerate(prompt));
    const text = String(res?.text || '').trim();
    if (!text) {
        throw new Error('empty');
    }
    const cat = category || String(res?.category || 'story');
    addTip({ term, category: cat, text, manual: true });
    await persistMailStore();
}

// —— Menu panel ——

let filter = '';

export function renderTipsPanel() {
    const host = document.getElementById('pp_tips_list');
    if (!host) {
        return;
    }
    const all = [...tipsList()].sort((a, b) => a.term.localeCompare(b.term));
    const q = filter.toLowerCase();
    const shown = q ? all.filter((t) => t.term.toLowerCase().includes(q) || t.text.toLowerCase().includes(q)) : all;
    const groups = new Map();
    for (const t of shown) {
        const g = groups.get(t.category) || [];
        g.push(t);
        groups.set(t.category, g);
    }
    host.innerHTML = `
        <div class="pp-tips-tools">
            <input type="search" class="text_pole" id="pp_tips_search" placeholder="Search ${all.length} entr${all.length === 1 ? 'y' : 'ies'}" value="${esc(filter)}">
        </div>
        ${groups.size ? [...groups.entries()].map(([cat, list]) => `
        <div class="pp-tips-group">
            <h4>${esc(categoryLabel(cat))} <small>${list.length}</small></h4>
            ${list.map((t) => `
            <details class="pp-tip" data-tip="${esc(t.id)}">
                <summary><span class="pp-tip-term">${esc(t.term)}</span><span class="pp-tip-meta">${esc(t.divergence || '')}</span></summary>
                <div class="pp-tip-text">${esc(t.text)}</div>
                <div class="pp-tip-actions">
                    <button type="button" class="menu_button" data-tip-edit="${esc(t.id)}">Edit</button>
                    <button type="button" class="menu_button" data-tip-del="${esc(t.id)}">Delete</button>
                </div>
            </details>`).join('')}
        </div>`).join('') : `<p class="pp-tips-empty">${all.length ? 'Nothing matches.' : 'No entries yet. They appear as the story mentions terms — or explain one below.'}</p>`}`;
    const search = /** @type {HTMLInputElement} */ (host.querySelector('#pp_tips_search'));
    search?.addEventListener('input', () => {
        filter = search.value;
        renderTipsPanel();
        const again = /** @type {HTMLInputElement | null} */ (document.getElementById('pp_tips_search'));
        again?.focus();
        again?.setSelectionRange(again.value.length, again.value.length);
    });
    host.querySelectorAll('[data-tip-del]').forEach((b) => b.addEventListener('click', async () => {
        const m = getMailStore();
        m.tips = tipsList().filter((t) => t.id !== b.getAttribute('data-tip-del'));
        await persistMailStore();
        renderTipsPanel();
    }));
    host.querySelectorAll('[data-tip-edit]').forEach((b) => b.addEventListener('click', () => {
        const tip = tipsList().find((t) => t.id === b.getAttribute('data-tip-edit'));
        const box = b.closest('.pp-tip')?.querySelector('.pp-tip-text');
        if (!tip || !box) {
            return;
        }
        box.innerHTML = `<textarea class="text_pole" rows="4">${esc(tip.text)}</textarea><button type="button" class="menu_button">Save</button>`;
        box.querySelector('button')?.addEventListener('click', async () => {
            tip.text = String(box.querySelector('textarea')?.value || '').trim() || tip.text;
            await persistMailStore();
            renderTipsPanel();
        });
    }));
}

function renderCategoryChecks() {
    const host = document.getElementById('pp_tips_cats');
    if (!host) {
        return;
    }
    const s = getSettings();
    const on = new Set(Array.isArray(s.tipsCategories) ? s.tipsCategories : []);
    host.innerHTML = TIPS_CATEGORIES.map((c) => `
        <label class="pp-tips-cat"><input type="checkbox" data-tips-cat="${c.id}" ${on.has(c.id) ? 'checked' : ''}><span>${esc(c.label)}</span><small>${esc(c.hint)}</small></label>`).join('');
    host.querySelectorAll('[data-tips-cat]').forEach((el) => el.addEventListener('change', () => {
        const ids = TIPS_CATEGORIES.map((c) => c.id).filter((id) => /** @type {HTMLInputElement | null} */ (host.querySelector(`[data-tips-cat="${id}"]`))?.checked);
        getSettings().tipsCategories = ids;
        saveSettings();
        renderExplainCats();
    }));
}

function renderExplainCats() {
    const sel = /** @type {HTMLSelectElement | null} */ (document.getElementById('pp_tips_explain_cat'));
    if (!sel) {
        return;
    }
    sel.innerHTML = `<option value="">Auto</option>${[...TIPS_CATEGORIES, ...enabledCategories().filter((c) => c.id.startsWith('custom:'))]
        .map((c) => `<option value="${esc(c.id)}">${esc(c.label)}</option>`).join('')}`;
}

/** Bind the TIPS menu category. */
export function initTipsUi() {
    bindToggle('#pp_tips_on', 'tipsEnabled');
    bindNumber('#pp_tips_every', 'tipsEvery', { min: 1, max: 50, fallback: 4 });
    bindValue('#pp_tips_custom', 'tipsCustomCategories', () => renderExplainCats());
    renderCategoryChecks();
    renderExplainCats();
    renderTipsPanel();
    const btn = /** @type {HTMLButtonElement | null} */ (document.getElementById('pp_tips_explain_go'));
    btn?.addEventListener('click', async () => {
        const input = /** @type {HTMLInputElement} */ (document.getElementById('pp_tips_explain'));
        const term = String(input?.value || '').trim();
        if (!term) {
            return;
        }
        btn.disabled = true;
        btn.textContent = 'Writing…';
        try {
            await explainTerm(term, /** @type {HTMLSelectElement} */ (document.getElementById('pp_tips_explain_cat')).value);
            input.value = '';
            renderTipsPanel();
        } catch {
            toast('Could not write that entry', 'warning', 'TIPS');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Explain';
        }
    });
    document.getElementById('pp_tips_scan')?.addEventListener('click', async () => {
        const n = await scanForTips();
        if (!n) {
            toast('No new terms in the recent chat', 'info', 'TIPS');
        }
    });
    document.addEventListener('pt:menu-category', (e) => {
        if (/** @type {CustomEvent} */ (e).detail?.cat === 'tips') {
            renderTipsPanel();
        }
    });
}

/** On chat change. */
export function refreshTips() {
    sinceCheck = 0;
    renderTipsPanel();
}

/** `/tips` opens the menu on TIPS. */
export async function openTips() {
    const { openMenu } = await import('./menu.js');
    openMenu('tips');
}
