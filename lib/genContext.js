/**
 * Inject context: feed e-mails into calls, and past calls into mail replies and new calls.
 *
 * Each feed is Off / Auto / Manual (Menu → Inject context).
 * - Auto: only items with the same person (newest first, capped).
 * - Manual: exactly the items ticked in the menu, whoever they involve.
 * Picks are per chat (chat metadata, see store.getCtxPicks).
 */
import { getSettings } from './settings.js';
import { getEmails, getPersonaName, emailInvolvesContact, getCtxPicks } from './store.js';
import { getCallMemories, formatCallInjectLine } from './callMemory.js';
import { addMailContextProvider, addCallContextProvider } from './generate.js';
import { formatStoryTime } from './storyClock.js';

/** @typedef {import('./store.js').EmailMessage} EmailMessage */
/** @typedef {import('./callMemory.js').CallMemoryRecord} CallMemoryRecord */
/** @typedef {{ key?: string, name?: string } | null | undefined} Contact */
/** @typedef {'off' | 'auto' | 'manual'} FeedMode */

export const CTX_MODES = /** @type {const} */ (['off', 'auto', 'manual']);

/**
 * @param {'ctxMailToCall' | 'ctxCallToMail' | 'ctxCallToCall'} key
 * @returns {FeedMode}
 */
export function feedMode(key) {
    const v = String(getSettings()[key] || '');
    return /** @type {FeedMode} */ (CTX_MODES.includes(/** @type {any} */ (v)) ? v : 'auto');
}

/** @param {unknown} v @param {number} fallback @param {number} max */
function cap(v, fallback, max) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? Math.min(max, Math.floor(n)) : fallback;
}

export function mailCap() {
    return cap(getSettings().ctxMailToCallMax, 6, 30);
}

export function callCap() {
    return cap(getSettings().ctxCallMax, 3, 20);
}

/** Mails that can be fed at all (no D-Mails, nothing erased from this worldline). */
export function feedableMails() {
    return getEmails()
        .filter((e) => !e.isDmail && !e.vanished)
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

/** Calls that can be fed at all, newest first. */
export function feedableCalls() {
    return getCallMemories()
        .filter((c) => c.summary || (c.turns || []).some((t) => t.role === 'user' || t.role === 'char'))
        .sort((a, b) => (b.endedAt || b.startedAt || 0) - (a.endedAt || a.startedAt || 0));
}

/**
 * @param {CallMemoryRecord} call
 * @param {Contact} contact
 */
export function callInvolvesContact(call, contact) {
    if (!call || !contact) {
        return false;
    }
    const key = String(contact.key || '').trim();
    const name = String(contact.name || '').trim().toLowerCase();
    return Boolean((key && call.contactKey === key)
        || (name && String(call.contactName || '').trim().toLowerCase() === name));
}

/** @param {EmailMessage} e */
export function mailStamp(e) {
    if (e.storyTime) {
        return formatStoryTime(e.storyTime);
    }
    try {
        return new Date(e.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
        return '';
    }
}

/** @param {EmailMessage} e @param {string} user */
function mailLine(e, user) {
    const out = e.direction === 'out';
    const who = out ? `${user} → ${e.to}` : `${e.from} → ${user}`;
    const body = String(e.body || '').replace(/\[\[|\]\]/g, '').replace(/\s+/g, ' ').trim();
    const short = body.length > 280 ? `${body.slice(0, 277)}…` : body;
    return `- [${mailStamp(e)}] ${who} — "${e.subject || '(no subject)'}": ${short}`;
}

/**
 * Items one feed would use for this contact.
 * @template T
 * @param {FeedMode} mode
 * @param {T[]} all newest first
 * @param {(item: T) => boolean} mine
 * @param {'mailToCall' | 'callToMail' | 'callToCall'} kind
 * @param {number} n
 * @param {(item: T) => string} idOf
 * @returns {T[]}
 */
function pick(mode, all, mine, kind, n, idOf) {
    if (mode === 'off') {
        return [];
    }
    if (mode === 'manual') {
        const ids = new Set(getCtxPicks(kind));
        return all.filter((item) => ids.has(idOf(item)));
    }
    return all.filter(mine).slice(0, n);
}

/**
 * E-mails the character on this call knows about.
 * @param {Contact} contact
 */
export function mailContextForCall(contact) {
    const mode = feedMode('ctxMailToCall');
    const mails = pick(mode, feedableMails(), (e) => emailInvolvesContact(e, contact), 'mailToCall', mailCap(), (e) => e.id);
    if (!mails.length) {
        return '';
    }
    const user = getPersonaName() || 'User';
    const char = contact?.name || 'the character';
    return [
        `E-mails ${char} knows about (background for this call — remember them, don't read them out):`,
        ...[...mails].reverse().map((e) => mailLine(e, user)),
    ].join('\n');
}

/**
 * Past calls, for a mail reply or a new call.
 * @param {'ctxCallToMail' | 'ctxCallToCall'} key
 * @param {Contact} contact
 * @param {string} [skipId] the call in progress
 */
function callContext(key, contact, skipId = '') {
    const kind = key === 'ctxCallToMail' ? 'callToMail' : 'callToCall';
    const all = feedableCalls().filter((c) => c.id !== skipId);
    const calls = pick(feedMode(key), all, (c) => callInvolvesContact(c, contact), kind, callCap(), (c) => c.id);
    if (!calls.length) {
        return '';
    }
    const char = contact?.name || 'the character';
    const lead = key === 'ctxCallToMail'
        ? `Earlier phone calls ${char} remembers (background for this e-mail — don't recap them):`
        : `Earlier phone calls ${char} remembers (background for this call — don't recap them):`;
    return [lead, ...[...calls].reverse().map(formatCallInjectLine)].join('\n');
}

/** @param {Contact} character */
export function callContextForMail(character) {
    return callContext('ctxCallToMail', character);
}

/** @param {Contact} contact @param {string} [currentCallId] */
export function callContextForCall(contact, currentCallId) {
    return callContext('ctxCallToCall', contact, currentCallId);
}

let registered = false;

/** Hook the feeds into mail and call prompt building (once). */
export function initGenContext() {
    if (registered) {
        return;
    }
    registered = true;
    addMailContextProvider((character) => {
        if (!getSettings().enabled) {
            return '';
        }
        const block = callContextForMail(character);
        return block ? `\n${block}` : '';
    });
    addCallContextProvider((contact, info) => {
        if (!getSettings().enabled) {
            return {};
        }
        return {
            mail_context: mailContextForCall(contact),
            call_memory: callContextForCall(contact, info?.callId),
        };
    });
}
