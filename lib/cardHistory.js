/**
 * Card history — every description Phone Trigger writes onto a character card is snapshotted
 * first, so a rewrite can be undone (and the original always restored).
 *
 * Where it lives: SillyTavern's extension settings (settings.json on your own SillyTavern
 * server). Never in the card file itself, so exporting or sharing a card doesn't carry old
 * versions; never sent anywhere else and never put in a prompt. Writes go to your
 * SillyTavern server only (same origin).
 *
 * settings.cardHistory = {
 *   [avatar]: { name, original, originalAt, entries: [{ id, at, before, after, reason, factId, factText, chatId }] }
 * }
 */
import { getSettings, saveSettings, getContext, toast } from './settings.js';
import { esc } from './ui.js';

const MAX_ENTRIES = 10;

function store() {
    const s = getSettings();
    if (!s.cardHistory || typeof s.cardHistory !== 'object' || Array.isArray(s.cardHistory)) {
        s.cardHistory = {};
    }
    return s.cardHistory;
}

/** @param {any} ch */
function descOf(ch) {
    return String(ch?.data?.description ?? ch?.description ?? '');
}

/** @param {string} avatar */
export function characterIndexByAvatar(avatar) {
    const chars = getContext().characters || [];
    return chars.findIndex((c) => c?.avatar === avatar);
}

/**
 * Write a description onto any character card, snapshotting the old one first.
 * @param {number} index into ctx.characters
 * @param {string} text
 * @param {{ reason?: 'rewrite' | 'restore', factId?: string, factText?: string }} [meta]
 * @returns {Promise<boolean>}
 */
export async function writeCharacterDescription(index, text, meta = {}) {
    const ctx = getContext();
    const ch = (ctx.characters || [])[index];
    if (!ch) {
        return false;
    }
    const before = descOf(ch);
    const after = String(text ?? '');
    if (before === after) {
        return true;
    }
    snapshot(ch, before, after, meta);
    try {
        if (ch.data && typeof ch.data === 'object') {
            ch.data.description = after;
        }
        ch.description = after;
        let saved = false;
        if (ch.avatar && typeof ctx.getRequestHeaders === 'function') {
            // Your SillyTavern server's own endpoint (same origin) — works for any character.
            const res = await fetch('/api/characters/merge-attributes', {
                method: 'POST',
                headers: ctx.getRequestHeaders(),
                body: JSON.stringify({ avatar: ch.avatar, description: after, data: { description: after } }),
            });
            saved = res.ok;
        }
        if (Number(ctx.characterId) === index) {
            // Keep the open character editor in step so a later save there doesn't revert it.
            const field = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('description_textarea'));
            if (field) {
                field.value = after;
            }
            if (!saved) {
                if (typeof ctx.saveCharacterDebounced === 'function') {
                    ctx.saveCharacterDebounced();
                    saved = true;
                } else if (typeof ctx.saveCharacter === 'function') {
                    await ctx.saveCharacter();
                    saved = true;
                }
            }
        }
        if (typeof ctx.writeExtensionField === 'function') {
            // Clear the legacy appended-block marker (older versions wrote one).
            try {
                await ctx.writeExtensionField(index, 'phone_trigger_worldline_block', '');
            } catch {
                // not important
            }
        }
        renderCardHistoryPanel();
        return saved;
    } catch (err) {
        console.warn('[Phone Trigger] card write failed', err);
        return false;
    }
}

function snapshot(ch, before, after, meta) {
    const all = store();
    const key = String(ch.avatar || ch.name);
    const rec = all[key] || (all[key] = { name: String(ch.name || 'Character'), original: before, originalAt: Date.now(), entries: [] });
    rec.name = String(ch.name || rec.name);
    rec.entries.push({
        id: `cv_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
        at: Date.now(),
        before,
        after,
        reason: meta.reason || 'rewrite',
        factId: meta.factId || undefined,
        factText: meta.factText ? String(meta.factText).slice(0, 300) : undefined,
        chatId: String(getContext().getCurrentChatId?.() || ''),
    });
    if (rec.entries.length > MAX_ENTRIES) {
        rec.entries.splice(0, rec.entries.length - MAX_ENTRIES);
    }
    saveSettings();
}

/**
 * Card rewrites made for these (now undone) facts, latest per character.
 * `untouched` = the card still holds exactly what Phone Trigger wrote.
 * @param {string[]} factIds
 * @returns {{ avatar: string, name: string, index: number, entry: any, untouched: boolean }[]}
 */
export function cardRewritesForFacts(factIds) {
    const out = [];
    const ids = new Set(factIds);
    for (const [avatar, rec] of Object.entries(store())) {
        const entry = [...rec.entries].reverse().find((e) => e.reason === 'rewrite' && e.factId && ids.has(e.factId));
        if (!entry) {
            continue;
        }
        const index = characterIndexByAvatar(avatar);
        if (index < 0) {
            continue;
        }
        const current = descOf(getContext().characters[index]);
        out.push({ avatar, name: rec.name, index, entry, untouched: current === entry.after });
    }
    return out;
}

/**
 * Put a character's card back to an earlier text (recorded as a restore, so it can be undone).
 * @param {string} avatar
 * @param {string} text
 */
export async function restoreCard(avatar, text) {
    const index = characterIndexByAvatar(avatar);
    if (index < 0) {
        toast('That character is not loaded', 'warning', 'CARD');
        return false;
    }
    const ok = await writeCharacterDescription(index, text, { reason: 'restore' });
    toast(ok ? `${store()[avatar]?.name || 'Card'} restored` : 'Could not save the card', ok ? 'success' : 'error', 'CARD');
    return ok;
}

/** `/cardundo [name]`: back to the version before Phone Trigger's last rewrite. */
export async function cardUndoCommand(text) {
    const needle = String(text || '').trim().toLowerCase();
    const ctx = getContext();
    const active = (ctx.characters || [])[Number(ctx.characterId)];
    const entries = Object.entries(store());
    const hit = needle
        ? entries.find(([, r]) => r.name.toLowerCase() === needle || r.name.toLowerCase().split(/\s+/)[0] === needle)
        : entries.find(([a]) => a === active?.avatar);
    if (!hit) {
        return needle ? `No card history for ${text}.` : 'No card history for this character.';
    }
    const [avatar, rec] = hit;
    const last = [...rec.entries].reverse().find((e) => e.reason === 'rewrite');
    if (!last) {
        return `${rec.name}: nothing to undo.`;
    }
    await restoreCard(avatar, last.before);
    return `${rec.name}: card restored to before the last rewrite.`;
}

// —— Diff ——

function sentences(text) {
    return String(text || '').split(/(?<=[.!?…])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
}

/** Sentence-level diff of two descriptions as HTML. */
export function diffHtml(before, after) {
    const a = sentences(before);
    const b = sentences(after);
    const inA = new Set(a);
    const inB = new Set(b);
    const removed = a.filter((x) => !inB.has(x)).map((x) => `<del>${esc(x)}</del>`);
    const added = b.filter((x) => !inA.has(x)).map((x) => `<ins>${esc(x)}</ins>`);
    if (!removed.length && !added.length) {
        return '<span class="pp-ch-same">No sentence changed (spacing only).</span>';
    }
    return `${removed.join(' ')}${removed.length && added.length ? '<span class="pp-ch-arrow"> → </span>' : ''}${added.join(' ')}`;
}

// —— Menu panel ——

function when(ts) {
    try {
        return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
        return '';
    }
}

export function renderCardHistoryPanel() {
    const host = document.getElementById('pp_card_history');
    if (!host) {
        return;
    }
    const all = Object.entries(store());
    if (!all.length) {
        host.innerHTML = '<p class="pp-ch-empty">No card rewrites yet. When D-Mail Apply rewrites a card, the previous text is kept here.</p>';
        return;
    }
    host.innerHTML = all.map(([avatar, rec]) => {
        const loaded = characterIndexByAvatar(avatar) >= 0;
        const current = loaded ? descOf(getContext().characters[characterIndexByAvatar(avatar)]) : '';
        return `
        <details class="pp-ch-char">
            <summary><b>${esc(rec.name)}</b> <small>${rec.entries.length} change${rec.entries.length === 1 ? '' : 's'}${loaded ? '' : ' · not loaded'}</small></summary>
            <div class="pp-ch-actions">
                <button type="button" class="menu_button" data-ch-original="${esc(avatar)}" ${loaded && current !== rec.original ? '' : 'disabled'}>Restore original</button>
                <button type="button" class="menu_button" data-ch-clear="${esc(avatar)}">Forget history</button>
            </div>
            <ol class="pp-ch-list">
                ${[...rec.entries].reverse().map((e) => `
                <li class="pp-ch-entry ${e.after === current ? 'pp-ch-current' : ''}">
                    <div class="pp-ch-head">
                        <span>${esc(when(e.at))} · ${e.reason === 'restore' ? 'restored' : 'D-Mail rewrite'}${e.after === current ? ' · <b>current</b>' : ''}</span>
                        <button type="button" class="menu_button" data-ch-restore="${esc(avatar)}" data-ch-entry="${esc(e.id)}" ${loaded && current !== e.before ? '' : 'disabled'} title="Put back the text from before this change">Undo this change</button>
                    </div>
                    ${e.factText ? `<div class="pp-ch-fact">${esc(e.factText)}</div>` : ''}
                    <div class="pp-ch-diff">${diffHtml(e.before, e.after)}</div>
                </li>`).join('')}
            </ol>
        </details>`;
    }).join('');
    host.querySelectorAll('[data-ch-original]').forEach((b) => b.addEventListener('click', async () => {
        const avatar = b.getAttribute('data-ch-original') || '';
        const rec = store()[avatar];
        if (rec && confirm(`Put ${rec.name}'s card back to the original description (before Phone Trigger changed it)?`)) {
            await restoreCard(avatar, rec.original);
        }
    }));
    host.querySelectorAll('[data-ch-restore]').forEach((b) => b.addEventListener('click', async () => {
        const avatar = b.getAttribute('data-ch-restore') || '';
        const rec = store()[avatar];
        const entry = rec?.entries.find((e) => e.id === b.getAttribute('data-ch-entry'));
        if (entry && confirm(`Put ${rec.name}'s card back to the text from before this change? (Any edits since will be replaced; this restore can itself be undone.)`)) {
            await restoreCard(avatar, entry.before);
        }
    }));
    host.querySelectorAll('[data-ch-clear]').forEach((b) => b.addEventListener('click', () => {
        const avatar = b.getAttribute('data-ch-clear') || '';
        const rec = store()[avatar];
        if (rec && confirm(`Forget ${rec.name}'s card history? The card itself is not changed, but you won't be able to restore earlier versions.`)) {
            delete store()[avatar];
            saveSettings();
            renderCardHistoryPanel();
        }
    }));
}

export function initCardHistoryUi() {
    renderCardHistoryPanel();
    document.addEventListener('pt:menu-category', (e) => {
        if (/** @type {CustomEvent} */ (e).detail?.cat === 'dmail') {
            renderCardHistoryPanel();
        }
    });
}
