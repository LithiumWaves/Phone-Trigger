/**
 * Re-date a chat's history by hand.
 *
 * Chats from before the story clock (or that ran on real time) carry real-world dates: mail
 * timestamps, story log entries stamped with the wall clock, leaps measured in real hours.
 * This editor puts them on the story calendar — shift everything at once, or move single
 * entries — and keeps linked records together (a mail and its log line, a leap and its
 * worldline event, both ends of a leap).
 *
 * Opened from one small button under the Clock screen's story log, or `/storytime history`.
 * Single chat messages are re-dated by clicking their story stamp; messages from before the
 * clock existed can be stamped all at once here or with `/storytime stamp`.
 */
import { toast, getContext, getSettings } from './settings.js';
import { parseSendDate } from './timeleap.js';
import { getMailStore } from './store.js';
import { esc, saveMeta, emit } from './ui.js';
import { toLocalInput, fromLocalInput, getStoryClock, formatStoryTime, updateStoryClockPrompt, afterMessageStampsChanged, followLastMessage } from './storyClock.js';

const DIALOG_ID = 'pp-redate';

/**
 * One date field somewhere in chat metadata.
 * @typedef {{ obj: Record<string, any>, field: string, fallback: number }} Slot
 * One row: the slots that move together. `slots[0]` is the date shown.
 * @typedef {{ key: string, kind: string, text: string, slots: Slot[], hidden?: boolean }} Row
 */

/** @param {number} ms */
function stampOf(ms) {
    return Number.isFinite(ms) && ms > 0 ? toLocalInput(new Date(ms)) : '';
}

/** @param {Slot} s */
function slotValue(s) {
    const v = String(s.obj[s.field] || '');
    return fromLocalInput(v) ? v : stampOf(s.fallback);
}

/** Still on real time: no story date, or one equal to when it really happened. @param {Slot} s */
function slotIsReal(s) {
    const v = String(s.obj[s.field] || '');
    if (!fromLocalInput(v)) {
        return true;
    }
    return Boolean(s.fallback) && v === stampOf(s.fallback);
}

/**
 * Move a slot by `delta` ms.
 * @param {Slot} s
 * @param {number} delta
 */
function shiftSlot(s, delta) {
    const from = fromLocalInput(slotValue(s));
    if (!from) {
        return;
    }
    s.obj[s.field] = toLocalInput(new Date(from.getTime() + delta));
}

/** @param {Row} row */
function rowValue(row) {
    return slotValue(row.slots[0]);
}

/** @param {Row} row */
function rowIsReal(row) {
    return slotIsReal(row.slots[0]);
}

/** Every dated thing in this chat, grouped into rows, oldest first. */
function collectRows() {
    const m = getMailStore();
    /** @type {Map<string, Row>} */
    const rows = new Map();
    /** @param {string} key @param {string} kind @param {string} text @param {boolean} [hidden] */
    const row = (key, kind, text, hidden = false) => {
        let r = rows.get(key);
        if (!r) {
            r = { key, kind, text, slots: [], hidden };
            rows.set(key, r);
        }
        return r;
    };
    const ref = (id) => `ref:${id}`;

    for (const e of Array.isArray(m.emails) ? m.emails : []) {
        if (!e?.id) {
            continue;
        }
        const kind = e.isDmail ? 'D-Mail' : e.direction === 'in' ? 'Mail in' : 'Mail out';
        const who = e.direction === 'in' ? e.from : e.to;
        row(ref(e.id), kind, `${who || ''}: ${e.subject || ''}`.replace(/^: /, ''))
            .slots.push({ obj: e, field: 'storyTime', fallback: Number(e.timestamp) || 0 });
    }
    for (const l of Array.isArray(m.leaps) ? m.leaps : []) {
        if (!l?.id) {
            continue;
        }
        const fallback = Number(l.timestamp) || 0;
        const r = row(ref(l.id), 'Leap', `${l.leaper?.name || 'Someone'} leapt back${(l.hops || 1) > 1 ? ` ×${l.hops}` : ''}`);
        r.slots.push({ obj: l, field: 'fromTime', fallback });
        // Arrival keeps its distance from departure: both ends move together.
        const span = (fromLocalInput(l.fromTime)?.getTime() ?? fallback) - (fromLocalInput(l.toTime)?.getTime() ?? fallback);
        r.slots.push({ obj: l, field: 'toTime', fallback: fallback - (Number.isFinite(span) ? span : 0) });
    }
    for (const c of Array.isArray(m.calls) ? m.calls : []) {
        if (!c?.id) {
            continue;
        }
        row(ref(c.id), 'Call', c.contactName || 'Call')
            .slots.push({ obj: c, field: 'storyTime', fallback: Number(c.startedAt || c.endedAt) || 0 });
    }
    for (const d of Array.isArray(m.dmails) ? m.dmails : []) {
        if (!d?.id) {
            continue;
        }
        row(ref(d.id), 'D-Mail', `${d.sender || 'D-Mail'}: ${String(d.body || d.subject || '').slice(0, 60)}`)
            .slots.push({ obj: d, field: 'storyTime', fallback: Number(d.timestamp) || 0 });
    }
    for (const f of Array.isArray(m.worldlineFacts) ? m.worldlineFacts : []) {
        if (!f) {
            continue;
        }
        const key = f.dmailId && rows.has(ref(f.dmailId)) ? ref(f.dmailId) : `fact:${f.id}`;
        row(key, 'Fact', String(f.text || '').slice(0, 80))
            .slots.push({ obj: f, field: 'storyTime', fallback: Number(f.timestamp) || 0 });
    }
    for (const ev of Array.isArray(m.worldlineLog) ? m.worldlineLog : []) {
        if (!ev) {
            continue;
        }
        const link = ev.leapId || ev.dmailId;
        const key = link && rows.has(ref(link)) ? ref(link) : `wl:${ev.id}`;
        const r = row(key, ev.type === 'leap' ? 'Leap' : ev.type === 'cancel' ? 'Undo' : 'Worldline', String(ev.text || `${ev.from} → ${ev.to}`).slice(0, 80));
        r.slots.push({ obj: ev, field: 'storyTime', fallback: Number(ev.at) || 0 });
        if (ev.type === 'leap' && ev.storyTo) {
            const span = (fromLocalInput(ev.storyTime)?.getTime() ?? 0) - (fromLocalInput(ev.storyTo)?.getTime() ?? 0);
            r.slots.push({ obj: ev, field: 'storyTo', fallback: (Number(ev.at) || 0) - span });
        }
    }
    for (const e of Array.isArray(m.storyLog) ? m.storyLog : []) {
        if (!e) {
            continue;
        }
        const key = e.ref && rows.has(ref(e.ref)) ? ref(e.ref) : `log:${e.at}:${e.type}:${e.text}`;
        row(key, logKind(e.type), String(e.text || ''))
            .slots.push({ obj: e, field: 't', fallback: Number(e.at) || 0 });
    }
    // Shifted with everything else, but not worth a row each.
    const chat = Array.isArray(getContext().chat) ? getContext().chat : [];
    chat.forEach((msg, i) => {
        const st = msg?.extra?.pt_story;
        if (st?.t) {
            row(`msg:${i}`, 'Message', String(msg.name || ''), true)
                .slots.push({ obj: st, field: 't', fallback: parseSendDate(msg.send_date) || 0 });
        }
    });
    const threads = m.board?.threads && typeof m.board.threads === 'object' ? Object.values(m.board.threads) : [];
    for (const th of threads) {
        const r = row(`board:${th?.id}`, 'Board', String(th?.title || ''), true);
        if (th?.storyTime) {
            r.slots.push({ obj: th, field: 'storyTime', fallback: Number(th.createdAt) || 0 });
        }
        for (const p of Array.isArray(th?.posts) ? th.posts : []) {
            if (p?.storyTime) {
                r.slots.push({ obj: p, field: 'storyTime', fallback: Number(p.at) || 0 });
            }
        }
    }
    for (const tip of Array.isArray(m.tips) ? m.tips : []) {
        if (tip?.storyTime) {
            row(`tip:${tip.id}`, 'TIP', String(tip.term || ''), true)
                .slots.push({ obj: tip, field: 'storyTime', fallback: Number(tip.at) || 0 });
        }
    }

    return [...rows.values()]
        .filter((r) => r.slots.length && rowValue(r))
        .sort((a, b) => rowValue(a).localeCompare(rowValue(b)));
}

/** @param {string} type */
function logKind(type) {
    return ({
        'mail-in': 'Mail in',
        'mail-out': 'Mail out',
        call: 'Call',
        'call-missed': 'Missed',
        'call-declined': 'Declined',
        dmail: 'D-Mail',
        cancel: 'Undo',
        leap: 'Leap',
        sleep: 'Sleep',
        pass: 'Time',
        clock: 'Clock',
        fakecall: 'Call',
    })[type] || 'Log';
}

/** Story log back in date order after moving entries around. */
function sortStoryLog() {
    const m = getMailStore();
    if (Array.isArray(m.storyLog)) {
        m.storyLog = m.storyLog
            .map((e, i) => ({ e, i }))
            .sort((a, b) => String(a.e?.t || '').localeCompare(String(b.e?.t || '')) || a.i - b.i)
            .map((x) => x.e);
    }
}

async function commit() {
    sortStoryLog();
    await saveMeta();
    updateStoryClockPrompt();
    emit('story-clock');
    emit('story-log', { type: 'redate' });
    emit('worldline');
    afterMessageStampsChanged();
}

/**
 * Shift rows (all of them, or only those still on real time) so the earliest lands on `target`.
 * @param {string} target datetime-local
 * @param {{ realOnly: boolean, moveClock: boolean }} opts
 * @returns {Promise<number>} rows moved
 */
export async function shiftHistory(target, opts) {
    const to = fromLocalInput(target);
    const rows = collectRows().filter((r) => !opts.realOnly || rowIsReal(r));
    if (!to || !rows.length) {
        return 0;
    }
    const delta = to.getTime() - (fromLocalInput(rowValue(rows[0]))?.getTime() ?? to.getTime());
    if (!delta) {
        return 0;
    }
    for (const r of rows) {
        r.slots.forEach((s) => shiftSlot(s, delta));
    }
    if (opts.moveClock) {
        const m = getMailStore();
        const now = fromLocalInput(getStoryClock());
        if (now) {
            m.storyClock = toLocalInput(new Date(now.getTime() + delta));
            m.storyCarryMs = 0;
        }
    }
    await commit();
    return rows.length;
}

// —— Chat message stamps ——

const MIN_MS = 60000;
const MAX_REAL_GAP_MS = 12 * 3600000;

function chatList() {
    const chat = getContext().chat;
    return Array.isArray(chat) ? chat : [];
}

/** @param {any} msg */
function stampable(msg) {
    return Boolean(msg) && !msg.is_system;
}

/** @param {any} msg @returns {number | null} */
function stampMs(msg) {
    const d = fromLocalInput(String(msg?.extra?.pt_story?.t || ''));
    return d ? d.getTime() : null;
}

/** @param {any} msg @param {number} ms */
function setStamp(msg, ms) {
    msg.extra = msg.extra && typeof msg.extra === 'object' ? msg.extra : {};
    msg.extra.pt_story = { t: toLocalInput(new Date(ms)) };
}

/** Story minutes per message under the Messages flow (the default fixed spacing). */
function defaultSpacingMinutes() {
    return Math.max(1, Math.round(60 / Math.max(1, Number(getSettings().storyClockMessages) || 4)));
}

/** Chat messages that have no story time. */
export function unstampedMessageCount() {
    return chatList().filter((m) => stampable(m) && stampMs(m) == null).length;
}

/**
 * Story-time gap between two messages.
 * @param {any} a earlier @param {any} b later
 * @param {{ spacing: 'real' | 'fixed', minutes?: number }} opts
 */
function gapMs(a, b, opts) {
    const fixed = Math.max(1, Number(opts.minutes) || defaultSpacingMinutes()) * MIN_MS;
    if (opts.spacing !== 'real') {
        return fixed;
    }
    const ra = parseSendDate(a?.send_date);
    const rb = parseSendDate(b?.send_date);
    if (!ra || !rb) {
        return fixed;
    }
    return Math.min(MAX_REAL_GAP_MS, Math.max(MIN_MS, rb - ra));
}

/**
 * Give every chat message without a story time one, spaced from its stamped neighbours:
 * messages before the first stamp count back from it, later ones count on from the previous
 * stamp (never past the next one). With no stamps at all the last message is "now".
 * @param {{ spacing: 'real' | 'fixed', minutes?: number }} opts
 * @returns {Promise<number>} messages stamped
 */
export async function fillMessageStamps(opts) {
    const msgs = chatList().filter(stampable);
    const orig = msgs.map(stampMs);
    const times = [...orig];
    if (!msgs.length || !times.some((t) => t == null)) {
        return 0;
    }
    let first = times.findIndex((t) => t != null);
    if (first < 0) {
        first = msgs.length - 1;
        times[first] = (fromLocalInput(getStoryClock()) || new Date()).getTime();
    }
    for (let k = first - 1; k >= 0; k--) {
        times[k] = /** @type {number} */ (times[k + 1]) - gapMs(msgs[k], msgs[k + 1], opts);
    }
    for (let k = first + 1; k < msgs.length; k++) {
        if (times[k] != null) {
            continue;
        }
        let t = /** @type {number} */ (times[k - 1]) + gapMs(msgs[k - 1], msgs[k], opts);
        const next = orig.slice(k + 1).find((x) => x != null);
        if (next != null && t > next) {
            t = next;
        }
        times[k] = t;
    }
    let n = 0;
    msgs.forEach((msg, k) => {
        if (orig[k] == null && times[k] != null) {
            setStamp(msg, /** @type {number} */ (times[k]));
            n++;
        }
    });
    if (n) {
        afterMessageStampsChanged();
    }
    return n;
}

/** A sensible time for an unstamped message: just after the stamp before it, else before the next one. */
function suggestMessageTime(index) {
    const chat = chatList();
    const step = defaultSpacingMinutes() * MIN_MS;
    for (let i = index - 1; i >= 0; i--) {
        const t = stampable(chat[i]) ? stampMs(chat[i]) : null;
        if (t != null) {
            return t + step;
        }
    }
    for (let i = index + 1; i < chat.length; i++) {
        const t = stampable(chat[i]) ? stampMs(chat[i]) : null;
        if (t != null) {
            return t - step;
        }
    }
    return (fromLocalInput(getStoryClock()) || new Date()).getTime();
}

/**
 * Set, move or clear one chat message's story time.
 * @param {number} index message id
 */
export function editMessageStoryTime(index) {
    const chat = chatList();
    const msg = chat[index];
    if (!stampable(msg)) {
        return;
    }
    const DLG = 'pp-msg-time';
    document.getElementById(DLG)?.remove();
    const current = stampMs(msg);
    const later = chat.slice(index + 1).filter((m) => stampable(m) && stampMs(m) != null).length;
    const dlg = document.createElement('dialog');
    dlg.id = DLG;
    dlg.className = 'pp-sg-prompt pp-redate';
    const preview = String(msg.mes || '').replace(/\s+/g, ' ').trim().slice(0, 90);
    dlg.innerHTML = `
        <div class="pp-sg-panel pp-redate-panel">
            <span class="pp-sg-corner pp-sg-tl"></span><span class="pp-sg-corner pp-sg-tr"></span>
            <span class="pp-sg-corner pp-sg-bl"></span><span class="pp-sg-corner pp-sg-br"></span>
            <div class="pp-wa-head">STORY CLOCK · MESSAGE #${index}</div>
            <p class="pp-wa-note"><b>${esc(msg.name || '')}</b>${preview ? ` — ${esc(preview)}${String(msg.mes || '').length > 90 ? '…' : ''}` : ''}</p>
            <label class="pp-redate-field">
                <span>Story time</span>
                <input type="datetime-local" data-mt-time value="${esc(toLocalInput(new Date(current ?? suggestMessageTime(index))))}">
            </label>
            ${current != null && later ? `<label class="pp-wa-quiet"><input type="checkbox" data-mt-later> Move the ${later} later stamped message${later === 1 ? '' : 's'} by the same amount</label>` : ''}
            <div class="pp-wa-actions">
                ${current != null ? '<button type="button" class="pp-wa-btn" data-mt-clear>Clear</button>' : ''}
                <button type="button" class="pp-wa-btn" data-mt-cancel>Cancel</button>
                <button type="button" class="pp-wa-btn pp-wa-go" data-mt-set>Set</button>
            </div>
        </div>`;
    document.body.appendChild(dlg);
    const close = () => {
        try {
            dlg.close();
        } catch {
            /* ignore */
        }
        dlg.remove();
    };
    dlg.addEventListener('cancel', (e) => {
        e.preventDefault();
        close();
    });
    dlg.querySelector('[data-mt-cancel]')?.addEventListener('click', close);
    dlg.querySelector('[data-mt-clear]')?.addEventListener('click', () => {
        if (msg.extra) {
            delete msg.extra.pt_story;
        }
        afterMessageStampsChanged();
        close();
    });
    dlg.querySelector('[data-mt-set]')?.addEventListener('click', () => {
        const to = fromLocalInput(/** @type {HTMLInputElement} */ (dlg.querySelector('[data-mt-time]')).value);
        if (!to) {
            toast('Pick a date and time', 'warning', 'STORY CLOCK');
            return;
        }
        const moveLater = Boolean(/** @type {HTMLInputElement | null} */ (dlg.querySelector('[data-mt-later]'))?.checked);
        if (moveLater && current != null) {
            const delta = to.getTime() - current;
            chat.slice(index + 1).forEach((m) => {
                const t = stampable(m) ? stampMs(m) : null;
                if (t != null) {
                    setStamp(m, t + delta);
                }
            });
        }
        setStamp(msg, to.getTime());
        afterMessageStampsChanged();
        // The latest message moved: the clock follows it and flows on from there.
        if (moveLater || !later) {
            void followLastMessage();
        }
        close();
    });
    try {
        dlg.showModal();
    } catch {
        dlg.setAttribute('open', '');
    }
}

// —— Dialog ——

/** Open the re-date editor for the current chat. */
export function openHistoryEditor() {
    document.getElementById(DIALOG_ID)?.remove();
    const dlg = document.createElement('dialog');
    dlg.id = DIALOG_ID;
    dlg.className = 'pp-sg-prompt pp-redate';
    document.body.appendChild(dlg);
    /** @type {Map<string, string>} */
    const edits = new Map();

    const close = () => {
        try {
            dlg.close();
        } catch {
            /* ignore */
        }
        dlg.remove();
    };

    const render = () => {
        const rows = collectRows();
        const shown = rows.filter((r) => !r.hidden);
        const real = rows.filter(rowIsReal);
        const shownReal = shown.filter(rowIsReal).length;
        const clockSet = Boolean(fromLocalInput(String(getMailStore().storyClock || '')));
        const realOnly = real.length > 0 && real.length < rows.length;
        const earliest = (realOnly ? real : rows)[0];
        const unstamped = unstampedMessageCount();
        dlg.innerHTML = `
            <div class="pp-sg-panel pp-redate-panel">
                <span class="pp-sg-corner pp-sg-tl"></span><span class="pp-sg-corner pp-sg-tr"></span>
                <span class="pp-sg-corner pp-sg-bl"></span><span class="pp-sg-corner pp-sg-br"></span>
                <div class="pp-wa-head">STORY CLOCK · RE-DATE HISTORY</div>
                <p class="pp-wa-note">${shown.length
                    ? `${shown.length} dated event${shown.length === 1 ? '' : 's'}${shownReal ? ` · ${shownReal} still on real time` : ''}.`
                    : 'Nothing in this chat has a date yet.'}</p>
                ${unstamped ? `
                <fieldset class="pp-redate-shift">
                    <legend>Older messages</legend>
                    <p class="pp-wa-note">${unstamped} chat message${unstamped === 1 ? ' has' : 's have'} no story time yet.</p>
                    <label class="pp-redate-field">
                        <span>Space them by</span>
                        <select data-rd-spacing>
                            <option value="real">their real gaps (up to 12 h each)</option>
                            <option value="fixed">a fixed amount</option>
                        </select>
                    </label>
                    <label class="pp-redate-field" data-rd-fixed hidden>
                        <span>Minutes between messages</span>
                        <input type="number" min="1" max="1440" data-rd-minutes value="${defaultSpacingMinutes()}">
                    </label>
                    <button type="button" class="pp-wa-btn pp-wa-go" data-rd-stamp>Stamp them</button>
                </fieldset>` : ''}
                ${rows.length ? `
                <fieldset class="pp-redate-shift">
                    <legend>Shift everything</legend>
                    <label class="pp-redate-field">
                        <span>Move the earliest ${realOnly ? 'real-time ' : ''}event to</span>
                        <input type="datetime-local" data-rd-target value="${esc(earliest ? rowValue(earliest) : '')}">
                    </label>
                    <label class="pp-wa-quiet"><input type="checkbox" data-rd-realonly ${realOnly ? 'checked' : ''} ${real.length ? '' : 'disabled'}> Only events still on real time</label>
                    <label class="pp-wa-quiet"><input type="checkbox" data-rd-clock ${clockSet ? '' : 'checked'}> Move the story clock with them${clockSet ? '' : ' (it is on real time too)'}</label>
                    <button type="button" class="pp-wa-btn pp-wa-go" data-rd-shift>Shift</button>
                </fieldset>
                <div class="pp-redate-sect">Or move single events — linked records follow</div>
                <div class="pp-redate-list">
                    ${shown.map((r) => `
                        <div class="pp-redate-row ${rowIsReal(r) ? 'pp-redate-real' : ''}">
                            <span class="pp-redate-kind">${esc(r.kind)}</span>
                            <span class="pp-redate-text" title="${esc(r.text)}">${esc(r.text || '—')}</span>
                            <input type="datetime-local" data-rd-row="${esc(r.key)}" value="${esc(edits.get(r.key) || rowValue(r))}" aria-label="${esc(`${r.kind}: ${r.text}`)}">
                        </div>
                    `).join('')}
                </div>` : ''}
                <div class="pp-wa-actions">
                    <button type="button" class="pp-wa-btn" data-rd-close>Close</button>
                    ${rows.length ? `<button type="button" class="pp-wa-btn pp-wa-go" data-rd-save ${edits.size ? '' : 'disabled'}>Save ${edits.size || ''} change${edits.size === 1 ? '' : 's'}</button>` : ''}
                </div>
            </div>
        `;
        bind(rows);
    };

    /** @param {Row[]} rows */
    const bind = (rows) => {
        dlg.querySelector('[data-rd-close]')?.addEventListener('click', close);
        const spacing = /** @type {HTMLSelectElement | null} */ (dlg.querySelector('[data-rd-spacing]'));
        spacing?.addEventListener('change', () => {
            const f = /** @type {HTMLElement | null} */ (dlg.querySelector('[data-rd-fixed]'));
            if (f) {
                f.hidden = spacing.value !== 'fixed';
            }
        });
        dlg.querySelector('[data-rd-stamp]')?.addEventListener('click', async () => {
            const minutes = Number(/** @type {HTMLInputElement | null} */ (dlg.querySelector('[data-rd-minutes]'))?.value);
            const n = await fillMessageStamps({ spacing: spacing?.value === 'fixed' ? 'fixed' : 'real', minutes });
            toast(n ? `Stamped ${n} message${n === 1 ? '' : 's'}` : 'Nothing to stamp', n ? 'success' : 'info', 'STORY CLOCK');
            render();
        });
        const realBox = /** @type {HTMLInputElement | null} */ (dlg.querySelector('[data-rd-realonly]'));
        const targetIn = /** @type {HTMLInputElement | null} */ (dlg.querySelector('[data-rd-target]'));
        realBox?.addEventListener('change', () => {
            const pool = realBox.checked ? rows.filter(rowIsReal) : rows;
            if (targetIn && pool[0]) {
                targetIn.value = rowValue(pool[0]);
            }
            const lead = targetIn?.previousElementSibling;
            if (lead) {
                lead.textContent = `Move the earliest ${realBox.checked ? 'real-time ' : ''}event to`;
            }
        });
        dlg.querySelector('[data-rd-shift]')?.addEventListener('click', async () => {
            const target = targetIn?.value || '';
            if (!fromLocalInput(target)) {
                toast('Pick a date and time', 'warning', 'STORY CLOCK');
                return;
            }
            const moveClock = Boolean(/** @type {HTMLInputElement | null} */ (dlg.querySelector('[data-rd-clock]'))?.checked);
            const n = await shiftHistory(target, { realOnly: Boolean(realBox?.checked), moveClock });
            edits.clear();
            toast(n ? `Re-dated ${n} event${n === 1 ? '' : 's'} · now ${formatStoryTime(getStoryClock())}` : 'Nothing to move', n ? 'success' : 'info', 'STORY CLOCK');
            render();
        });
        dlg.querySelectorAll('[data-rd-row]').forEach((el) => {
            const input = /** @type {HTMLInputElement} */ (el);
            input.addEventListener('change', () => {
                const key = input.getAttribute('data-rd-row') || '';
                const r = rows.find((x) => x.key === key);
                if (!r || !fromLocalInput(input.value) || input.value === rowValue(r)) {
                    edits.delete(key);
                } else {
                    edits.set(key, input.value);
                }
                const save = /** @type {HTMLButtonElement | null} */ (dlg.querySelector('[data-rd-save]'));
                if (save) {
                    save.disabled = !edits.size;
                    save.textContent = `Save ${edits.size || ''} change${edits.size === 1 ? '' : 's'}`;
                }
            });
        });
        dlg.querySelector('[data-rd-save]')?.addEventListener('click', async () => {
            let n = 0;
            for (const [key, value] of edits) {
                const r = rows.find((x) => x.key === key);
                const from = r && fromLocalInput(rowValue(r));
                const to = fromLocalInput(value);
                if (r && from && to) {
                    const delta = to.getTime() - from.getTime();
                    r.slots.forEach((s) => shiftSlot(s, delta));
                    n++;
                }
            }
            edits.clear();
            if (n) {
                await commit();
                toast(`Re-dated ${n} event${n === 1 ? '' : 's'}`, 'success', 'STORY CLOCK');
            }
            render();
        });
    };

    dlg.addEventListener('cancel', (e) => {
        e.preventDefault();
        close();
    });
    render();
    try {
        dlg.showModal();
    } catch {
        dlg.setAttribute('open', '');
    }
}
