/**
 * Worldline mechanics on top of D-Mails:
 * - a log of every shift (D-Mail, cancel, leap) for the Worldline Map;
 * - cancelling: a D-Mail that contradicts an earlier one undoes it and the meter goes back;
 * - phone records follow the worldline (rewritten mail keeps its old version as a Reading
 *   Steiner ghost only you can see);
 * - convergence points: outcomes the worldline reaches whatever anyone does, until the
 *   divergence crosses into another attractor field;
 * - milestones: a quiet note when the field changes or a target reading is reached.
 */
import { getSettings } from './settings.js';
import { getMailStore, persistMailStore, getPersonaName } from './store.js';
import { getStoryDay, storyStamp, formatStoryTime } from './storyClock.js';
import { esc, quietGenerate, parseJsonLoose, emit, bindToggle, bindValue } from './ui.js';

/**
 * @typedef {{
 *   id: string,
 *   type: 'dmail' | 'cancel' | 'leap' | 'set',
 *   from: string,
 *   to: string,
 *   at: number,
 *   storyTime?: string,
 *   day?: number,
 *   factId?: string,
 *   dmailId?: string,
 *   text?: string,
 *   sender?: string,
 *   cancels?: string[],
 *   storyTo?: string,
 *   leaper?: string,
 * }} WorldlineEvent
 * @typedef {{ id: string, text: string, deadline?: string, active: boolean, field: number, reached: number, createdAt: number }} ConvergencePoint
 */

function meta() {
    const m = getMailStore();
    if (!Array.isArray(m.worldlineLog)) {
        m.worldlineLog = [];
    }
    if (!Array.isArray(m.convergence)) {
        m.convergence = [];
    }
    return m;
}

function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

/** Leading digit of a reading = its attractor field. */
export function fieldOf(reading) {
    const n = Number(reading);
    return Number.isFinite(n) ? Math.floor(n) : 0;
}

// —— Log ——

/**
 * @param {Omit<WorldlineEvent, 'id' | 'at'> & { id?: string }} ev
 */
export function logWorldline(ev) {
    const m = meta();
    m.worldlineLog.push({
        id: ev.id || uid('wle'),
        at: Date.now(),
        storyTime: ev.storyTime ?? storyStamp(),
        day: ev.day ?? getStoryDay(),
        ...ev,
    });
    if (m.worldlineLog.length > 400) {
        m.worldlineLog.splice(0, m.worldlineLog.length - 400);
    }
    emit('worldline');
}

/**
 * Every shift on this timeline, oldest first. Chats from before the log existed are
 * rebuilt from their D-Mails and leaps.
 * @returns {WorldlineEvent[]}
 */
export function getWorldlineLog() {
    const m = meta();
    if (m.worldlineLog.length) {
        return [...m.worldlineLog];
    }
    /** @type {WorldlineEvent[]} */
    const out = [];
    const dmails = [...(m.dmails || [])].reverse();
    for (const d of dmails) {
        if (!d.fact) {
            continue;
        }
        const f = (m.worldlineFacts || []).find((x) => x.dmailId === d.id);
        out.push({
            id: `bf_${d.id}`,
            type: 'dmail',
            from: f?.divergenceFrom || '',
            to: f?.divergenceTo || '',
            at: d.timestamp || 0,
            dmailId: d.id,
            factId: f?.id,
            text: d.fact,
            sender: d.sender,
        });
    }
    for (const l of [...(m.leaps || [])].reverse()) {
        out.push({
            id: `bl_${l.id}`,
            type: 'leap',
            from: l.divergence,
            to: l.divergence,
            at: l.timestamp || 0,
            storyTime: l.fromTime,
            storyTo: l.toTime,
            leaper: l.leaper?.name,
            text: `${l.leaper?.name || 'Someone'} leapt back`,
        });
    }
    return out.sort((a, b) => a.at - b.at);
}

// —— Cancelling ——

/** All facts including cancelled ones (newest first). */
export function getAllFacts() {
    return [...(getMailStore().worldlineFacts || [])];
}

/** Active facts with ids, for the "does this undo anything?" check. */
export function activeFactsForPrompt() {
    return getAllFacts().filter((f) => !f.cancelled).slice(0, 12);
}

/**
 * Where the meter goes back to when these facts are undone: the oldest one's reading
 * from before it happened.
 * @param {string[]} ids
 * @returns {string} empty when unknown
 */
export function restoreReadingFor(ids) {
    const facts = getAllFacts().filter((f) => ids.includes(f.id) && f.divergenceFrom);
    if (!facts.length) {
        return '';
    }
    facts.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    return String(facts[0].divergenceFrom);
}

/**
 * Mark facts cancelled by a D-Mail and put back the mail they rewrote.
 * @param {string[]} ids
 * @param {string} byDmailId
 * @returns {Promise<{ id: string, text: string }[]>} the facts undone
 */
export async function cancelFacts(ids, byDmailId) {
    const m = getMailStore();
    const undone = [];
    for (const f of m.worldlineFacts || []) {
        if (!ids.includes(f.id) || f.cancelled) {
            continue;
        }
        f.cancelled = true;
        f.cancelledBy = byDmailId;
        f.cancelledAt = Date.now();
        undone.push({ id: f.id, text: f.text });
        restoreRewrites(f);
    }
    if (undone.length) {
        await persistMailStore();
    }
    return undone;
}

// —— Phone records follow the worldline ——

/**
 * Rewrite recent mail to fit a new worldline fact. The old versions stay as ghosts.
 * @param {{ id: string, text: string }} fact
 * @returns {Promise<number>} mails changed
 */
export async function rewriteRecordsForFact(fact) {
    if (!getSettings().dmailRewriteRecords || !fact?.text) {
        return 0;
    }
    const m = getMailStore();
    const recent = (m.emails || []).filter((e) => !e.isDmail && !e.vanished).slice(0, 30);
    if (!recent.length) {
        return 0;
    }
    const user = getPersonaName();
    const prompt = [
        'A D-Mail changed the past. On the new worldline this is now true:',
        fact.text,
        '',
        `Below are recent e-mails on ${user}'s phone as they were on the OLD worldline.`,
        'Decide which ones would read differently (or never have been sent) on the NEW worldline.',
        'Most mails stay exactly the same — only change those the fact directly touches.',
        'Return JSON only: {"edit":[{"id":"…","subject":"…","body":"…"}],"vanish":["id", …]}',
        'Edits keep the same people and roughly the same length, rewritten to fit the new worldline.',
        '',
        ...recent.map((e) => `[${e.id}] ${e.direction === 'in' ? `from ${e.from}` : `to ${e.to}`} · "${e.subject}": ${String(e.body).replace(/\s+/g, ' ').slice(0, 280)}`),
    ].join('\n');
    let plan;
    try {
        plan = parseJsonLoose(await quietGenerate(prompt));
    } catch (err) {
        console.warn('[Phone Trigger] record rewrite failed', err);
        return 0;
    }
    if (!plan || typeof plan !== 'object') {
        return 0;
    }
    const live = m.worldlineFacts.find((f) => f.id === fact.id);
    const rewrites = [];
    for (const ed of Array.isArray(plan.edit) ? plan.edit : []) {
        const mail = recent.find((e) => e.id === ed?.id);
        if (!mail || !String(ed.body || '').trim()) {
            continue;
        }
        rewrites.push({ mailId: mail.id, subject: mail.subject, body: mail.body, hadGhost: Boolean(mail.ghostOf), prevGhost: mail.ghostOf });
        if (!mail.ghostOf) {
            mail.ghostOf = { subject: mail.subject, body: mail.body };
        }
        mail.subject = String(ed.subject || mail.subject).slice(0, 120);
        mail.body = String(ed.body).slice(0, 4000);
        mail.keywords = undefined;
        mail.shiftedBy = fact.id;
    }
    for (const id of Array.isArray(plan.vanish) ? plan.vanish : []) {
        const mail = recent.find((e) => e.id === id);
        if (!mail || mail.vanished) {
            continue;
        }
        rewrites.push({ mailId: mail.id, vanished: true });
        mail.vanished = true;
        mail.shiftedBy = fact.id;
    }
    if (live) {
        live.rewrites = rewrites;
    }
    await persistMailStore();
    emit('mail-rewritten', { count: rewrites.length });
    return rewrites.length;
}

/** Undo one fact's rewrites (when its D-Mail is cancelled). */
function restoreRewrites(fact) {
    const m = getMailStore();
    for (const r of [...(fact.rewrites || [])].reverse()) {
        const mail = (m.emails || []).find((e) => e.id === r.mailId);
        if (!mail) {
            continue;
        }
        if (r.vanished) {
            mail.vanished = false;
        } else {
            mail.subject = r.subject;
            mail.body = r.body;
            mail.ghostOf = r.hadGhost ? r.prevGhost : undefined;
        }
        mail.shiftedBy = undefined;
    }
    fact.rewrites = [];
}

/** Mail that vanished on this worldline (you still remember it). */
export function vanishedMail() {
    return (getMailStore().emails || []).filter((e) => e.vanished);
}

// —— Convergence ——

/** @returns {ConvergencePoint[]} */
export function getConvergence() {
    return [...meta().convergence];
}

/**
 * @param {string} text
 * @param {string} [deadline] story time
 */
export async function addConvergence(text, deadline) {
    const t = String(text || '').trim();
    if (!t) {
        return;
    }
    meta().convergence.push({
        id: uid('cv'),
        text: t.slice(0, 300),
        deadline: deadline || undefined,
        active: true,
        field: fieldOf(currentReading()),
        reached: 0,
        createdAt: Date.now(),
    });
    await persistMailStore();
    afterConvergenceChange();
}

export async function updateConvergence(id, patch) {
    const p = meta().convergence.find((c) => c.id === id);
    if (!p) {
        return;
    }
    Object.assign(p, patch);
    await persistMailStore();
    afterConvergenceChange();
}

export async function removeConvergence(id) {
    const m = meta();
    m.convergence = m.convergence.filter((c) => c.id !== id);
    await persistMailStore();
    afterConvergenceChange();
}

function currentReading() {
    return String(getMailStore().divergence || '1.130426');
}

/** Points that still bind: active, and the worldline is still in the field they were set in. */
export function bindingConvergence() {
    const field = fieldOf(currentReading());
    return getConvergence().filter((c) => c.active && c.field === field);
}

let onConvergenceChange = null;
/** @param {() => void} fn */
export function setConvergenceChangeHandler(fn) {
    onConvergenceChange = fn;
}

function afterConvergenceChange() {
    onConvergenceChange?.();
    emit('convergence');
    renderConvergencePanels();
}

/** Lines for the worldline prompt (convergence + milestones). */
export function worldlinePromptExtras() {
    const lines = [];
    const binding = bindingConvergence();
    if (binding.length) {
        lines.push('', 'Convergence — on this worldline these outcomes happen no matter what anyone does; attempts to prevent them only change how they happen:');
        for (const c of binding) {
            lines.push(`- ${c.text}${c.deadline ? ` (by ${formatStoryTime(c.deadline)})` : ''}`);
        }
    }
    const s = getSettings();
    if (s.divergenceMilestones) {
        const log = getWorldlineLog().filter((e) => e.type !== 'leap');
        const last = log[log.length - 1];
        if (last && last.from && last.to && fieldOf(last.from) !== fieldOf(last.to)) {
            lines.push('', `The worldline recently crossed into a different attractor field (${fieldOf(last.from)}.x → ${fieldOf(last.to)}.x). Things fixed before may no longer be.`);
        }
        if (targetReached()) {
            lines.push('', `The divergence has reached ${s.divergenceTarget}.`);
        }
    }
    return lines;
}

/** The user's target reading is the current one. */
export function targetReached() {
    const s = getSettings();
    const target = String(s.divergenceTarget || '').trim();
    return Boolean(s.divergenceMilestones && /^\d\.\d{6}$/.test(target) && target === currentReading());
}

/**
 * After a leap: did the abandoned future reach any convergence point? (optional log)
 * @param {string} futureText what happened after the arrival point
 */
export async function noteConvergenceAfterLeap(futureText) {
    const points = bindingConvergence();
    if (!getSettings().convergenceLog || !points.length || !String(futureText || '').trim()) {
        return;
    }
    const prompt = [
        'These outcomes are fated on this worldline:',
        ...points.map((c) => `[${c.id}] ${c.text}`),
        '',
        'This is what happened in the timeline that was just abandoned:',
        String(futureText).slice(0, 4000),
        '',
        'Which fated outcomes actually happened there? JSON only: {"reached":["id", …]}',
    ].join('\n');
    try {
        const res = parseJsonLoose(await quietGenerate(prompt));
        const ids = Array.isArray(res?.reached) ? res.reached : [];
        let any = false;
        for (const c of meta().convergence) {
            if (ids.includes(c.id)) {
                c.reached = (c.reached || 0) + 1;
                any = true;
            }
        }
        if (any) {
            await persistMailStore();
            afterConvergenceChange();
        }
    } catch (err) {
        console.debug('[Phone Trigger] convergence check failed', err);
    }
}

// —— Convergence panel (phone D-Mail screen + menu) ——

/**
 * @param {HTMLElement} host
 * @param {{ compact?: boolean }} [opts]
 */
export function renderConvergencePanel(host, opts = {}) {
    if (!host) {
        return;
    }
    host.dataset.ptConvergence = opts.compact ? 'compact' : 'full';
    const field = fieldOf(currentReading());
    const logOn = Boolean(getSettings().convergenceLog);
    const list = getConvergence();
    host.innerHTML = `
        <div class="pp-cv">
            ${list.length ? list.map((c) => {
        const escaped = c.field !== field;
        return `
                <div class="pp-cv-row ${c.active ? '' : 'pp-cv-off'} ${escaped ? 'pp-cv-escaped' : ''}">
                    <label class="pp-cv-check" title="${c.active ? 'Binding' : 'Off'}">
                        <input type="checkbox" data-cv-active="${esc(c.id)}" ${c.active ? 'checked' : ''}>
                    </label>
                    <div class="pp-cv-text">
                        <span>${esc(c.text)}</span>
                        <small>${c.deadline ? `by ${esc(formatStoryTime(c.deadline))} · ` : ''}${escaped ? `escaped (field ${c.field}.x)` : `field ${c.field}.x`}${logOn ? ` · reached ×${c.reached || 0}` : ''}</small>
                    </div>
                    ${logOn ? `<button type="button" class="pp-cv-btn" data-cv-plus="${esc(c.id)}" title="It happened again">+1</button>` : ''}
                    <button type="button" class="pp-cv-btn" data-cv-del="${esc(c.id)}" title="Remove" aria-label="Remove">×</button>
                </div>`;
    }).join('') : '<div class="pp-cv-empty">No convergence points. Add an outcome the worldline keeps reaching.</div>'}
            <div class="pp-cv-add">
                <input type="text" class="text_pole pp-input" data-cv-new placeholder="e.g. Mayuri is hurt on Day 5">
                ${opts.compact ? '' : `<input type="datetime-local" class="text_pole pp-input" data-cv-deadline title="By (story time, optional)">`}
                <button type="button" class="pp-btn" data-cv-add>Add</button>
            </div>
        </div>`;
    host.querySelectorAll('[data-cv-active]').forEach((el) => {
        el.addEventListener('change', () => void updateConvergence(el.getAttribute('data-cv-active') || '', { active: /** @type {HTMLInputElement} */ (el).checked }));
    });
    host.querySelectorAll('[data-cv-plus]').forEach((el) => {
        el.addEventListener('click', () => {
            const c = getConvergence().find((x) => x.id === el.getAttribute('data-cv-plus'));
            if (c) {
                void updateConvergence(c.id, { reached: (c.reached || 0) + 1 });
            }
        });
    });
    host.querySelectorAll('[data-cv-del]').forEach((el) => {
        el.addEventListener('click', () => void removeConvergence(el.getAttribute('data-cv-del') || ''));
    });
    const add = () => {
        const input = /** @type {HTMLInputElement} */ (host.querySelector('[data-cv-new]'));
        const when = /** @type {HTMLInputElement | null} */ (host.querySelector('[data-cv-deadline]'));
        if (input?.value.trim()) {
            void addConvergence(input.value, when?.value || undefined);
        }
    };
    host.querySelector('[data-cv-add]')?.addEventListener('click', add);
    host.querySelector('[data-cv-new]')?.addEventListener('keydown', (e) => {
        if (/** @type {KeyboardEvent} */ (e).key === 'Enter') {
            e.preventDefault();
            add();
        }
    });
}

function renderConvergencePanels() {
    document.querySelectorAll('[data-pt-convergence]').forEach((el) => {
        renderConvergencePanel(/** @type {HTMLElement} */ (el), { compact: /** @type {HTMLElement} */ (el).dataset.ptConvergence === 'compact' });
    });
}

/** Bind the D-Mail category's worldline settings. */
export function initWorldlineUi(onPromptChange) {
    bindToggle('#pp_dmail_cancels', 'dmailCancels');
    bindToggle('#pp_dmail_rewrite', 'dmailRewriteRecords');
    bindToggle('#pp_convergence_log', 'convergenceLog', () => renderConvergencePanels());
    bindToggle('#pp_div_milestones', 'divergenceMilestones', () => onPromptChange?.());
    bindValue('#pp_div_target', 'divergenceTarget', () => onPromptChange?.());
    const host = document.getElementById('pp_convergence_panel');
    if (host) {
        renderConvergencePanel(host);
    }
    document.addEventListener('pt:menu-category', (e) => {
        if (/** @type {CustomEvent} */ (e).detail?.cat === 'dmail') {
            renderConvergencePanels();
        }
    });
}

/** Called on chat change so open panels show this chat's points. */
export function refreshWorldlinePanels() {
    renderConvergencePanels();
}

