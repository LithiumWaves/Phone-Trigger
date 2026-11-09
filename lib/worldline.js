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
import { getMailStore, persistMailStore, getPersonaName, listMailContacts } from './store.js';
import { isPhoneWaveContact, getDivergence, setDivergence, updateWorldlinePrompt, removeWorldlineFact } from './dmail.js';
import { storyStamp, formatStoryTime } from './storyClock.js';
import { esc, quietGenerate, parseJsonLoose, emit, bindToggle, bindValue } from './ui.js';

/**
 * @typedef {{
 *   id: string,
 *   type: 'dmail' | 'cancel' | 'leap' | 'set',
 *   from: string,
 *   to: string,
 *   at: number,
 *   storyTime?: string,
 *   factId?: string,
 *   dmailId?: string,
 *   text?: string,
 *   sender?: string,
 *   cancels?: string[],
 *   storyTo?: string,
 *   leaper?: string,
 *   leapId?: string,
 *   legacy?: boolean,
 *   estimated?: boolean,
 *   unapplied?: boolean,
 *   manual?: boolean,
 * }} WorldlineEvent
 * `manual`: added by hand on the Worldline Map (a fact without a shift, or a shift without a fact).
 * `knownBy`: who knows the outcome is fated — character names, or USER_KNOWS for the persona.
 * Empty or missing: nobody in the story knows (narrator knowledge only).
 * @typedef {{ id: string, text: string, deadline?: string, active: boolean, field: number, reached: number, createdAt: number, knownBy?: string[] }} ConvergencePoint
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
        ...ev,
    });
    if (m.worldlineLog.length > 400) {
        m.worldlineLog.splice(0, m.worldlineLog.length - 400);
    }
    emit('worldline');
}

// —— Added by hand ——

/**
 * A D-Mail fact written by hand: it becomes true on this worldline (and goes into the prompt
 * like any other fact), but the divergence reading stays where it is.
 * @param {{ text: string, sender?: string }} input
 * @returns {Promise<string | null>} the fact id
 */
export async function addManualFact(input) {
    const text = String(input?.text || '').replace(/\s+/g, ' ').trim().slice(0, 600);
    if (!text) {
        return null;
    }
    const sender = String(input?.sender || '').replace(/\s+/g, ' ').trim().slice(0, 60) || undefined;
    const m = meta();
    if (!Array.isArray(m.worldlineFacts)) {
        m.worldlineFacts = [];
    }
    const id = uid('wlm');
    const reading = getDivergence();
    m.worldlineFacts.unshift({ id, text, timestamp: Date.now(), sender, storyTime: storyStamp(), manual: true });
    logWorldline({ type: 'dmail', from: reading, to: reading, factId: id, text, sender, manual: true });
    await persistMailStore();
    if (getSettings().dmailWorldline !== false) {
        updateWorldlinePrompt();
    }
    return id;
}

/**
 * A worldline shift entered by hand: the meter moves to a new reading. No fact is added.
 * @param {{ to: string, note?: string }} input
 * @returns {Promise<{ ok: true, from: string, to: string } | { ok: false, reason: string }>}
 */
export async function addManualShift(input) {
    const from = getDivergence();
    const next = String(input?.to || '').trim();
    const to = await setDivergence(next);
    if (!to) {
        return { ok: false, reason: 'Use a reading like 0.571024' };
    }
    if (to === from) {
        return { ok: false, reason: `The meter already reads ${to}` };
    }
    const note = String(input?.note || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    logWorldline({ type: 'set', from, to, text: note || 'Shift added by hand', manual: true });
    await persistMailStore();
    if (getSettings().dmailWorldline !== false) {
        updateWorldlinePrompt(); // convergence lines follow the field
    }
    return { ok: true, from, to };
}

/**
 * Take back something added by hand. A fact disappears from the worldline; a shift is dropped
 * from the log, and if the meter still shows where it went, the meter goes back.
 * @param {string} eventId
 * @returns {Promise<boolean>}
 */
export async function removeManualEntry(eventId) {
    const m = meta();
    const ev = m.worldlineLog.find((e) => e.id === eventId && e.manual);
    if (!ev) {
        return false;
    }
    if (ev.factId) {
        await removeWorldlineFact(ev.factId); // also drops it from the log
        return true;
    }
    m.worldlineLog = m.worldlineLog.filter((e) => e.id !== eventId);
    if (ev.type === 'set' && ev.from && getDivergence() === ev.to) {
        await setDivergence(ev.from);
    }
    await persistMailStore();
    if (getSettings().dmailWorldline !== false) {
        updateWorldlinePrompt();
    }
    emit('worldline');
    return true;
}

/** The reading every chat starts at (the clip's opening value). */
const ORIGIN_READING = '1.130426';
/** How close (ms) an unlinked fact must be to a D-Mail to be paired with it. */
const PAIR_WINDOW = 30 * 60 * 1000;

/** Your choices for older history: extra D-Mails shown, entries hidden, estimated readings. */
function legacyPrefs() {
    const m = meta();
    if (!m.worldlineLegacy || typeof m.worldlineLegacy !== 'object') {
        m.worldlineLegacy = { include: [], exclude: [], readings: {} };
    }
    const p = m.worldlineLegacy;
    p.include = Array.isArray(p.include) ? p.include : [];
    p.exclude = Array.isArray(p.exclude) ? p.exclude : [];
    p.readings = p.readings && typeof p.readings === 'object' ? p.readings : {};
    return p;
}

/**
 * Everything the chat kept about earlier D-Mails, paired up: each worldline fact with the
 * D-Mail that made it (by link, by matching text, or by time — older versions sometimes saved a
 * fact without its link), plus archived D-Mails with no fact (removed, skipped, or Spectacle).
 * @returns {{ id: string, at: number, text: string, sender?: string, subject?: string, body?: string, dmailId?: string, factId?: string, status: 'applied' | 'undone' | 'unapplied', logged: boolean, from?: string, to?: string }[]}
 */
export function scanEarlierDmails() {
    const m = meta();
    const facts = [...(m.worldlineFacts || [])];
    const dmails = [...(m.dmails || [])];
    const claimed = new Set();
    const loggedFacts = new Set(m.worldlineLog.map((e) => e.factId).filter(Boolean));
    const loggedDmails = new Set(m.worldlineLog.map((e) => e.dmailId).filter(Boolean));
    const out = [];
    for (const f of facts) {
        let d = f.dmailId ? dmails.find((x) => x.id === f.dmailId) : null;
        if (!d) {
            d = dmails.find((x) => !claimed.has(x.id) && x.fact && x.fact.trim() === String(f.text || '').trim());
        }
        if (!d && f.timestamp && !f.manual) {
            d = dmails
                .filter((x) => !claimed.has(x.id) && (x.timestamp || 0) <= f.timestamp && f.timestamp - (x.timestamp || 0) < PAIR_WINDOW)
                .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))[0] || null;
        }
        if (d) {
            claimed.add(d.id);
        }
        out.push({
            id: `lf_${f.id}`,
            at: d?.timestamp || f.timestamp || 0,
            text: String(f.text || ''),
            sender: f.sender || d?.sender,
            subject: d?.subject,
            body: d?.body,
            dmailId: d?.id,
            factId: f.id,
            status: f.cancelled ? 'undone' : 'applied',
            logged: loggedFacts.has(f.id) || Boolean(d && loggedDmails.has(d.id)),
            from: f.divergenceFrom,
            to: f.divergenceTo,
        });
    }
    for (const d of dmails) {
        if (claimed.has(d.id)) {
            continue;
        }
        out.push({
            id: `ld_${d.id}`,
            at: d.timestamp || 0,
            text: String(d.fact || d.body || ''),
            sender: d.sender,
            subject: d.subject,
            body: d.body,
            dmailId: d.id,
            status: 'unapplied',
            logged: loggedDmails.has(d.id),
        });
    }
    return out.sort((a, b) => a.at - b.at);
}

/**
 * Every shift on this timeline, oldest first: the log, plus D-Mails and leaps from before the
 * log existed. Applied facts show by default; D-Mails that changed nothing (removed, skipped)
 * only if you add them. Readings old D-Mails never recorded come from your saved estimates,
 * or are worked out from the readings that were recorded, and are marked `estimated`.
 * @returns {WorldlineEvent[]}
 */
export function getWorldlineLog() {
    const m = meta();
    const prefs = legacyPrefs();
    const logged = [...m.worldlineLog];
    const seenLeaps = new Set(logged.filter((e) => e.type === 'leap').map((e) => e.leapId || `${e.storyTime}|${e.storyTo}`));
    /** @type {any[]} */
    const old = [];
    for (const it of scanEarlierDmails()) {
        if (it.logged || prefs.exclude.includes(it.id)) {
            continue;
        }
        if (it.status === 'unapplied' && !prefs.include.includes(it.id)) {
            continue;
        }
        const saved = prefs.readings[it.id];
        old.push({
            id: it.id,
            type: 'dmail',
            from: it.from || saved?.from || '',
            to: it.to || saved?.to || '',
            at: it.at,
            dmailId: it.dmailId,
            factId: it.factId,
            text: it.text,
            sender: it.sender,
            legacy: true,
            estimated: Boolean(!it.to && saved?.to),
            unapplied: it.status === 'unapplied',
        });
    }
    for (const l of [...(m.leaps || [])].reverse()) {
        if (seenLeaps.has(l.id) || seenLeaps.has(`${l.fromTime}|${l.toTime}`) || prefs.exclude.includes(`bl_${l.id}`)) {
            continue;
        }
        old.push({
            id: `bl_${l.id}`,
            type: 'leap',
            from: l.divergence,
            to: l.divergence,
            at: l.timestamp || 0,
            storyTime: l.fromTime,
            storyTo: l.toTime,
            leaper: l.leaper?.name,
            text: `${l.leaper?.name || 'Someone'} leapt back`,
            legacy: true,
        });
    }
    const all = [...old, ...logged].sort((a, b) => (a.at || 0) - (b.at || 0));
    return estimateLegacyReadings(all, currentReading());
}

/** Show an older D-Mail on the map, or hide one. */
export async function setLegacyShown(id, shown) {
    const p = legacyPrefs();
    p.include = p.include.filter((x) => x !== id);
    p.exclude = p.exclude.filter((x) => x !== id);
    if (shown) {
        p.include.push(id);
    } else {
        p.exclude.push(id);
    }
    await persistMailStore();
    emit('worldline');
}

/**
 * Whether this chat's current reading was ever really set. Chats from before the meter (or
 * where Propose never stored one) just show the starting value, which says nothing about where
 * their D-Mails took them.
 */
export function currentReadingKnown() {
    const m = getMailStore();
    const now = String(m.divergence || '');
    if (!now) {
        return false;
    }
    if (now !== ORIGIN_READING) {
        return true;
    }
    const recorded = (m.worldlineLog || []).some((e) => e.type !== 'leap' && e.to && e.to !== e.from)
        || (m.worldlineFacts || []).some((f) => f.divergenceTo)
        || (m.leaps || []).some((l) => l.divergence && l.divergence !== ORIGIN_READING);
    return recorded;
}

/** A small, repeatable shift within the same attractor field (when the model gives nothing usable). */
function fallbackShift(from, seedText) {
    let h = 2166136261;
    for (let i = 0; i < seedText.length; i++) {
        h ^= seedText.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    const unit = (h >>> 0) / 4294967296;
    const base = Number(from) || Number(ORIGIN_READING);
    const field = Math.floor(base);
    const delta = (0.002 + unit * 0.09) * (unit < 0.5 ? -1 : 1);
    let next = base + delta;
    if (next < field || next >= field + 1) {
        next = base - delta;
    }
    return Math.min(9.999999, Math.max(0, next)).toFixed(6);
}

/**
 * Ask the model for plausible readings for older D-Mails that never recorded one. Recorded
 * readings are kept; when the chat's current reading is real, the history ends on it, and when
 * it was never set (still the starting value), the history decides it and the meter follows.
 * Saved per chat.
 * @returns {Promise<number>} how many readings were filled in
 */
export async function estimateLegacyWithAi() {
    const events = getWorldlineLog();
    const unknown = events.filter((e) => e.legacy && e.type === 'dmail' && (e.estimated || e.from === e.to) && !e.unapplied);
    if (!unknown.length) {
        return 0;
    }
    const nowKnown = currentReadingKnown();
    const now = currentReading();
    const rows = events.map((e, i) => {
        const fixed = !unknown.includes(e);
        const kind = e.type === 'leap' ? 'TIME LEAP (does not move the meter)' : e.type === 'cancel' ? 'UNDO of an earlier D-Mail' : 'D-MAIL';
        return `${i + 1}. ${kind}: ${String(e.text || '').slice(0, 200)}${fixed ? ` — recorded reading after: ${e.to}` : ' — reading after: ?'}`;
    });
    const prompt = [
        'You are the divergence meter from Steins;Gate, reconstructing a worldline history.',
        `Before the first change the reading was ${ORIGIN_READING}.`,
        nowKnown
            ? `After the last change the reading is ${now}.`
            : 'The reading after the last change was never recorded — decide it from the changes.',
        'Every D-MAIL below really changed the past, so each one moves the reading to a NEW value (never the same as before it).',
        'Size the move by the change: a small personal change moves only the last three or four digits, a meaningful one',
        '(e.g. someone lives who had died) moves the first decimal places, and only a drastic, history-altering one crosses into',
        'another attractor field (a different first digit). An UNDO moves the reading back toward where it was before the undone D-Mail.',
        'Keep every recorded reading exactly as given.',
        '',
        ...rows,
        '',
        'Answer with JSON only, one entry per "?" row: {"<row number>": "d.dddddd", …}. No explanation.',
    ].join('\n');
    let res = null;
    try {
        res = parseJsonLoose(await quietGenerate(prompt));
    } catch (err) {
        console.warn('[Phone Trigger] reading estimate failed', err);
    }
    const prefs = legacyPrefs();
    let n = 0;
    let reading = ORIGIN_READING;
    events.forEach((e, i) => {
        if (unknown.includes(e)) {
            let to = String(res?.[String(i + 1)] ?? res?.[i + 1] ?? '').match(/\d\.\d{6}/)?.[0] || '';
            const isLastShift = !events.slice(i + 1).some((x) => x.type !== 'leap' && (unknown.includes(x) || (x.to && x.to !== x.from)));
            if (isLastShift && nowKnown) {
                to = now;
            }
            if (!to || to === reading) {
                to = fallbackShift(reading, `${e.id}|${e.text}`);
            }
            prefs.readings[e.id] = { from: reading, to };
            reading = to;
            n++;
        } else if (e.to) {
            reading = e.to;
        }
    });
    if (!nowKnown && reading !== currentReading()) {
        // The meter had only ever shown the starting value: let it show where the history ends.
        getMailStore().divergence = reading;
        prefs.setMeter = reading;
    }
    await persistMailStore();
    emit('worldline');
    emit('divergence');
    return n;
}

/** Forget saved estimates (back to the automatic ones). */
export async function clearLegacyEstimates() {
    const prefs = legacyPrefs();
    prefs.readings = {};
    const m = getMailStore();
    if (prefs.setMeter && m.divergence === prefs.setMeter) {
        m.divergence = ORIGIN_READING;
    }
    delete prefs.setMeter;
    await persistMailStore();
    emit('worldline');
}

/**
 * Fill in readings old D-Mails never recorded. Walking forward, whenever a recorded reading
 * (a leap, a logged shift's starting point, or the current reading at the end) differs from
 * where we are, the change is credited to the latest unrecorded D-Mail before it.
 * @param {any[]} events oldest first
 * @param {string} now
 */
function estimateLegacyReadings(events, now) {
    const out = events.map((e) => ({ ...e }));
    const known = (e) => (e.type === 'leap' ? e.from : e.from) || '';
    let reading = '';
    let pending = null; // latest unrecorded D-Mail since the last known reading
    const settle = (target) => {
        if (!target) {
            return;
        }
        if (pending && target !== reading) {
            pending.to = target;
            pending.estimated = true;
        }
        reading = target;
        pending = null;
    };
    for (const e of out) {
        if (e.type === 'dmail' && e.legacy && !e.to) {
            // Before anything was recorded, the chat sat at its starting reading.
            e.from = reading || ORIGIN_READING;
            e.to = e.from;
            e.estimated = true;
            pending = e;
            if (!reading) {
                reading = e.from;
            }
            continue;
        }
        settle(known(e));
        if (e.to) {
            reading = e.to;
        }
    }
    if (currentReadingKnown()) {
        settle(now);
    }
    // Before the first known reading, chain the readings forward.
    let prev = '';
    for (const e of out) {
        if (!e.from) {
            e.from = prev || e.to;
        }
        if (!e.to) {
            e.to = e.from;
        }
        prev = e.to;
    }
    return out;
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
    const facts = getAllFacts().filter((f) => ids.includes(f.id));
    if (!facts.length) {
        return '';
    }
    facts.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    const first = facts[0];
    if (first.divergenceFrom) {
        return String(first.divergenceFrom);
    }
    // D-Mails from before readings were recorded: use the reading the log estimates.
    const ev = getWorldlineLog().find((e) => e.type === 'dmail' && (e.factId === first.id || (e.dmailId && e.dmailId === first.dmailId)));
    return ev?.from && ev.from !== ev.to ? String(ev.from) : '';
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

/**
 * A fact was removed by hand: it never happened, so drop it from the log too.
 * @param {string} factId
 */
export function forgetFactInLog(factId) {
    const m = meta();
    const fact = (m.worldlineFacts || []).find((f) => f.id === factId);
    m.worldlineLog = m.worldlineLog.filter((e) => e.factId !== factId && !(fact?.dmailId && e.dmailId === fact.dmailId && e.type === 'dmail'));
    for (const e of m.worldlineLog) {
        if (Array.isArray(e.cancels)) {
            e.cancels = e.cancels.filter((id) => id !== factId);
        }
    }
    emit('worldline');
}

/** All facts were cleared: keep the leaps, forget the shifts. */
export function forgetAllShiftsInLog() {
    const m = meta();
    m.worldlineLog = m.worldlineLog.filter((e) => e.type === 'leap');
    emit('worldline');
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

/** Stands for the persona in a point's `knownBy`. */
export const USER_KNOWS = '__user__';

/** @param {ConvergencePoint} c */
function knowers(c) {
    return Array.isArray(c.knownBy) ? c.knownBy.filter(Boolean) : [];
}

/** @param {string} k */
function knowerName(k) {
    return k === USER_KNOWS ? getPersonaName() : k;
}

/** Who can be marked as knowing: the persona, this chat's characters, and anyone already marked. */
function knowerChoices(c) {
    const out = [{ key: USER_KNOWS, name: getPersonaName() }];
    const seen = new Set([USER_KNOWS]);
    const add = (name) => {
        const n = String(name || '').trim();
        if (n && !seen.has(n)) {
            seen.add(n);
            out.push({ key: n, name: n });
        }
    };
    try {
        listMailContacts().filter((ct) => !isPhoneWaveContact(ct.key)).forEach((ct) => add(ct.name));
    } catch {
        /* no chat */
    }
    knowers(c).forEach(add);
    return out;
}

/** Lines for the worldline prompt (convergence + milestones). */
export function worldlinePromptExtras() {
    const lines = [];
    const binding = bindingConvergence();
    if (binding.length) {
        lines.push('', 'Convergence — fated on this worldline: these outcomes happen whatever anyone does; attempts to prevent them only change how they happen. This is narrator knowledge. A character knows an outcome is fated only if it says so below; nobody has tried to prevent it or lived through it before unless the chat shows it.');
        for (const c of binding) {
            const who = knowers(c).map(knowerName);
            lines.push(`- ${c.text}${c.deadline ? ` (by ${formatStoryTime(c.deadline)})` : ''} — ${who.length ? `known to: ${who.join(', ')}` : 'no one in the story knows'}`);
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
                        <div class="pp-cv-knows" title="Who knows this is fated">
                            <em>Knows:</em>
                            ${knowerChoices(c).map((k) => `<button type="button" class="pp-cv-knower ${knowers(c).includes(k.key) ? 'pp-on' : ''}" data-cv-know="${esc(c.id)}" data-who="${esc(k.key)}" aria-pressed="${knowers(c).includes(k.key)}">${esc(k.name)}</button>`).join('')}
                        </div>
                    </div>
                    ${logOn ? `<button type="button" class="pp-cv-btn" data-cv-plus="${esc(c.id)}" title="It happened again">+1</button>` : ''}
                    <button type="button" class="pp-cv-btn" data-cv-del="${esc(c.id)}" title="Remove" aria-label="Remove">×</button>
                </div>`;
    }).join('') : '<div class="pp-cv-empty">No convergence points. Add an outcome the worldline keeps reaching.</div>'}
            <div class="pp-cv-add">
                <input type="text" class="text_pole pp-input" data-cv-new placeholder="e.g. Mayuri is hurt on 8/15">
                ${opts.compact ? '' : `<input type="datetime-local" class="text_pole pp-input" data-cv-deadline title="By (story time, optional)">`}
                <button type="button" class="pp-btn" data-cv-add>Add</button>
            </div>
        </div>`;
    host.querySelectorAll('[data-cv-active]').forEach((el) => {
        el.addEventListener('change', () => void updateConvergence(el.getAttribute('data-cv-active') || '', { active: /** @type {HTMLInputElement} */ (el).checked }));
    });
    host.querySelectorAll('[data-cv-know]').forEach((el) => {
        el.addEventListener('click', () => {
            const c = getConvergence().find((x) => x.id === el.getAttribute('data-cv-know'));
            const who = el.getAttribute('data-who') || '';
            if (c && who) {
                const cur = knowers(c);
                void updateConvergence(c.id, { knownBy: cur.includes(who) ? cur.filter((k) => k !== who) : [...cur, who] });
            }
        });
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

