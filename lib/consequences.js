/**
 * What your phone habits say about you:
 * - Ignored mail and calls (optional): mail left unread and calls missed for a while, measured
 *   in story hours from the story log, become a quiet note for the AI and for mail initiative
 *   ("Why aren't you answering?").
 * - Closeness (optional): a per-contact score nudged by the words you tap, your replies and the
 *   tone of their mail.
 */
import { getSettings } from './settings.js';
import { getMailStore, persistMailStore, getInbox, getPersonaName, listMailContacts } from './store.js';
import { getStoryLog, storyHoursSince, isStoryClockActive } from './storyClock.js';
import { addMailContextProvider } from './generate.js';
import { setPrompt, bindToggle, bindNumber } from './ui.js';
import { isPhoneWaveContact } from './dmail.js';

export const IGNORE_PROMPT_KEY = 'phone_trigger_ignored';
export const CLOSENESS_PROMPT_KEY = 'phone_trigger_closeness';

// —— Ignored mail & calls ——

/**
 * Per contact: unread mail hours and missed calls not yet answered (story time).
 * @returns {Map<string, { name: string, unreadHours: number, unread: number, missed: number, missedHours: number }>}
 */
export function ignoredByContact() {
    const out = new Map();
    if (!isStoryClockActive()) {
        return out;
    }
    const threshold = Math.max(0.25, Number(getSettings().ignoreThresholdHours) || 3);
    const get = (key, name) => {
        if (!out.has(key)) {
            out.set(key, { name, unreadHours: 0, unread: 0, missed: 0, missedHours: 0 });
        }
        return out.get(key);
    };
    for (const m of getInbox()) {
        if (m.read || m.isDmail || !m.storyTime) {
            continue;
        }
        const h = storyHoursSince(m.storyTime);
        if (Number.isFinite(h) && h >= threshold) {
            const row = get(m.characterKey || m.from, m.from);
            row.unread += 1;
            row.unreadHours = Math.max(row.unreadHours, h);
        }
    }
    // Missed/declined calls count until you call back, answer, or mail them.
    const log = getStoryLog();
    const contacts = listMailContacts();
    const nameOf = (key) => contacts.find((c) => c.key === key)?.name || key;
    /** @type {Map<string, { n: number, at: string }>} */
    const pending = new Map();
    for (const e of log) {
        if (!e.ref) {
            continue;
        }
        if (e.type === 'call-missed' || e.type === 'call-declined') {
            const p = pending.get(e.ref) || { n: 0, at: e.t };
            p.n += 1;
            p.at = e.t;
            pending.set(e.ref, p);
        } else if (e.type === 'call') {
            pending.delete(e.ref);
        }
    }
    // A mail you send to them also counts as getting back to them.
    const mails = getMailStore().emails || [];
    for (const [key, p] of pending) {
        const answered = mails.some((m) => m.direction === 'out' && m.characterKey === key && m.storyTime && m.storyTime > p.at);
        if (answered) {
            continue;
        }
        const h = storyHoursSince(p.at);
        if (Number.isFinite(h) && h >= threshold) {
            const row = get(key, nameOf(key));
            row.missed = p.n;
            row.missedHours = h;
        }
    }
    return out;
}

function hoursText(h) {
    if (h < 1.5) {
        return 'an hour';
    }
    if (h < 36) {
        return `${Math.round(h)} hours`;
    }
    return `${Math.round(h / 24)} days`;
}

/** One sentence per neglected contact. */
function ignoreLines(filterKey = null) {
    const user = getPersonaName();
    const lines = [];
    for (const [key, r] of ignoredByContact()) {
        if (filterKey && key !== filterKey) {
            continue;
        }
        const bits = [];
        if (r.unread) {
            bits.push(`has left ${r.unread === 1 ? 'a mail' : `${r.unread} mails`} from ${r.name} unread for ${hoursText(r.unreadHours)}`);
        }
        if (r.missed) {
            bits.push(`${r.unread ? 'and ' : ''}hasn't returned ${r.missed === 1 ? 'a missed call' : `${r.missed} missed calls`} from ${r.name} (${hoursText(r.missedHours)})`);
        }
        if (bits.length) {
            lines.push(`${user} ${bits.join(' ')}.`);
        }
    }
    return lines;
}

export function updateIgnorePrompt() {
    if (!getSettings().ignoreConsequences) {
        setPrompt(IGNORE_PROMPT_KEY, '');
        return;
    }
    const lines = ignoreLines();
    setPrompt(IGNORE_PROMPT_KEY, lines.length
        ? `[Phone — ${lines.join(' ')} The people concerned know this and may react if it fits.]`
        : '', 2);
}

// —— Closeness ——

function closenessMap() {
    const m = getMailStore();
    if (!m.closeness || typeof m.closeness !== 'object') {
        m.closeness = {};
    }
    return m.closeness;
}

/**
 * @param {string} key
 * @param {number} delta
 */
export async function nudgeCloseness(key, delta) {
    if (!getSettings().mailCloseness || !key || isPhoneWaveContact(key)) {
        return;
    }
    const map = closenessMap();
    map[key] = Math.max(-50, Math.min(50, (Number(map[key]) || 0) + delta));
    await persistMailStore();
    updateClosenessPrompt();
}

/** @param {string} key */
export function getCloseness(key) {
    return Number(closenessMap()[key]) || 0;
}

/** @param {number} score */
export function closenessLabel(score) {
    if (score <= -20) {
        return 'distant';
    }
    if (score <= -6) {
        return 'cool';
    }
    if (score < 6) {
        return 'neutral';
    }
    if (score < 20) {
        return 'friendly';
    }
    return 'close';
}

/** Small meter HTML for a contact (empty when closeness is off). */
export function closenessBadge(key) {
    if (!getSettings().mailCloseness || !key) {
        return '';
    }
    const score = getCloseness(key);
    const pct = Math.round(((score + 50) / 100) * 100);
    return `<span class="pp-close-meter" title="Closeness: ${closenessLabel(score)}" aria-label="Closeness ${closenessLabel(score)}"><i style="width:${pct}%"></i><b>${closenessLabel(score)}</b></span>`;
}

export function updateClosenessPrompt() {
    if (!getSettings().mailCloseness) {
        setPrompt(CLOSENESS_PROMPT_KEY, '');
        return;
    }
    const user = getPersonaName();
    const map = closenessMap();
    const rows = listMailContacts()
        .filter((c) => !isPhoneWaveContact(c.key) && Math.abs(Number(map[c.key]) || 0) >= 6)
        .map((c) => `${c.name} — ${closenessLabel(Number(map[c.key]) || 0)}`);
    setPrompt(CLOSENESS_PROMPT_KEY, rows.length
        ? `[How close each person feels to ${user}, judging by their messages: ${rows.join('; ')}.]`
        : '', 3);
}

// —— Wiring ——

let wired = false;

/** Bind settings and listen for phone events. */
export function initConsequences() {
    bindToggle('#pp_ignore_on', 'ignoreConsequences', updateIgnorePrompt);
    bindNumber('#pp_ignore_hours', 'ignoreThresholdHours', { min: 0.25, max: 240, fallback: 3, int: false }, updateIgnorePrompt);
    bindToggle('#pp_closeness_on', 'mailCloseness', updateClosenessPrompt);
    if (wired) {
        return;
    }
    wired = true;
    // Mail initiative hears about it too.
    addMailContextProvider((character) => {
        if (!getSettings().ignoreConsequences || !character?.key) {
            return '';
        }
        const lines = ignoreLines(character.key);
        return lines.length ? `Context: ${lines.join(' ')} You may bring it up.` : '';
    });
    document.addEventListener('pt:story-clock', updateIgnorePrompt);
    document.addEventListener('pt:story-log', updateIgnorePrompt);
    document.addEventListener('pt:mail-read', updateIgnorePrompt);
    document.addEventListener('pt:keyword-tap', (e) => {
        const mail = /** @type {CustomEvent} */ (e).detail?.mail;
        void nudgeCloseness(mail?.characterKey, 2);
    });
    document.addEventListener('pt:mail-added', (e) => {
        const mail = /** @type {CustomEvent} */ (e).detail?.email;
        if (!mail || mail.isDmail) {
            return;
        }
        if (mail.direction === 'out' && mail.inReplyTo) {
            void nudgeCloseness(mail.characterKey, 1);
        } else if (mail.direction === 'in' && mail.tone) {
            void nudgeCloseness(mail.characterKey, mail.tone === 'warm' ? 2 : mail.tone === 'cold' ? -2 : 0);
        }
    });
    updateIgnorePrompt();
    updateClosenessPrompt();
}

/** On chat change. */
export function refreshConsequences() {
    updateIgnorePrompt();
    updateClosenessPrompt();
}

