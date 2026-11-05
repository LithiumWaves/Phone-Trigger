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
 */
import { toast, getContext } from './settings.js';
import { parseSendDate } from './timeleap.js';
import { getMailStore } from './store.js';
import { esc, saveMeta, emit } from './ui.js';
import { toLocalInput, fromLocalInput, getStoryClock, formatStoryTime, updateStoryClockPrompt, afterMessageStampsChanged } from './storyClock.js';

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
        dlg.innerHTML = `
            <div class="pp-sg-panel pp-redate-panel">
                <span class="pp-sg-corner pp-sg-tl"></span><span class="pp-sg-corner pp-sg-tr"></span>
                <span class="pp-sg-corner pp-sg-bl"></span><span class="pp-sg-corner pp-sg-br"></span>
                <div class="pp-wa-head">STORY CLOCK · RE-DATE HISTORY</div>
                <p class="pp-wa-note">${shown.length
                    ? `${shown.length} dated event${shown.length === 1 ? '' : 's'}${shownReal ? ` · ${shownReal} still on real time` : ''}.`
                    : 'Nothing in this chat has a date yet.'}</p>
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
