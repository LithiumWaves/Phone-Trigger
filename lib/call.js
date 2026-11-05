import { getSettings, toast } from './settings.js';
import { listMailContacts, getPersonaName } from './store.js';
import { isPhoneWaveContact, PHONEWAVE_KEY } from './dmail.js';
import { buildCallPrompt, generateCallText } from './generate.js';
import { startRingtoneLoop, stopRingtoneLoop, stopNotificationSound } from './audio.js';
import { displayName } from './contacts.js';
import { recordCallMemory } from './callMemory.js';
import { logStory } from './storyClock.js';

/**
 * @typedef {{ key: string, name: string, description?: string, personality?: string, scenario?: string, characterIndex?: number }} CallContact
 * @typedef {{ id: string, role: 'user'|'char'|'system', text: string, timestamp: number }} CallTurn
 * @typedef {{
 *   id: string,
 *   status: 'idle'|'dialing'|'ringing'|'connected'|'ended',
 *   direction: 'out'|'in'|'',
 *   contact: CallContact | null,
 *   startedAt: number,
 *   connectedAt: number,
 *   endedAt: number,
 *   turns: CallTurn[],
 *   busy: boolean,
 *   reason: string,
 * }} CallSession
 */

/** @type {CallSession} */
let session = emptySession();

/** @type {((session: CallSession) => void) | null} */
let onCallChange = null;

/** @type {ReturnType<typeof setTimeout> | null} */
let ringTimeoutTimer = null;

function emptySession() {
    return {
        id: '',
        status: 'idle',
        direction: '',
        contact: null,
        startedAt: 0,
        connectedAt: 0,
        endedAt: 0,
        turns: [],
        busy: false,
        reason: '',
    };
}

/** A reply loop is running for this call id. */
let respondingFor = '';
/** @type {ReturnType<typeof setTimeout> | null} */
let hangupTimer = null;

function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function emit() {
    if (typeof onCallChange === 'function') {
        onCallChange(getCallSession());
    }
}

function clearRingTimeout() {
    if (ringTimeoutTimer) {
        clearTimeout(ringTimeoutTimer);
        ringTimeoutTimer = null;
    }
}

function contactPayload(who) {
    return {
        key: String(who.key),
        name: String(who.name),
        description: String(who.description || ''),
        personality: String(who.personality || ''),
        scenario: String(who.scenario || ''),
        characterIndex: Number.isFinite(Number(who.characterIndex)) ? Number(who.characterIndex) : undefined,
    };
}

/**
 * @param {(session: CallSession) => void} [fn]
 */
export function setCallChangeHandler(fn) {
    onCallChange = typeof fn === 'function' ? fn : null;
}

/** @returns {CallSession} */
export function getCallSession() {
    return {
        ...session,
        contact: session.contact ? { ...session.contact } : null,
        turns: session.turns.map((t) => ({ ...t })),
    };
}

export function isCallActive() {
    return session.status === 'dialing'
        || session.status === 'ringing'
        || session.status === 'connected';
}

export function isCallConnected() {
    return session.status === 'connected';
}

export function isCallRinging() {
    return session.status === 'ringing';
}

/**
 * Contacts that can be dialed / can call (never PhoneWave).
 * @returns {import('./store.js').MailContact[]}
 */
export function listCallContacts() {
    return listMailContacts().filter((c) => c && !isPhoneWaveContact(c.key) && c.key !== PHONEWAVE_KEY);
}

/**
 * Start an outbound call to a contact.
 * @param {CallContact | import('./store.js').MailContact | null} contact
 * @returns {Promise<CallSession>}
 */
export async function startOutboundCall(contact) {
    const s = getSettings();
    if (s.callEnabled === false) {
        toast('Calls are disabled', 'warning');
        throw new Error('Calls disabled');
    }
    if (isCallActive()) {
        toast('Already on a call', 'warning');
        throw new Error('Call already active');
    }
    const who = contact?.key
        ? listCallContacts().find((c) => c.key === contact.key) || contact
        : listCallContacts().find((c) => c.isActive) || listCallContacts()[0];
    if (!who?.name || isPhoneWaveContact(who.key)) {
        toast('No one to call', 'warning');
        throw new Error('No call contact');
    }

    stopRingtoneLoop();
    clearRingTimeout();

    session = {
        id: uid('call'),
        status: 'dialing',
        direction: 'out',
        contact: contactPayload(who),
        startedAt: Date.now(),
        connectedAt: 0,
        endedAt: 0,
        turns: [],
        busy: false,
        reason: '',
    };
    emit();

    let delay = Number(s.callDialDelayMs);
    if (!Number.isFinite(delay) || delay < 0) {
        delay = 900;
    }
    delay = Math.min(4000, delay);

    if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
    }

    if (session.status !== 'dialing') {
        return getCallSession();
    }

    session.status = 'connected';
    session.connectedAt = Date.now();
    session.turns.push({
        id: uid('turn'),
        role: 'system',
        text: `${session.contact.name} picked up`,
        timestamp: Date.now(),
    });
    emit();
    // They answer the phone: the character speaks first.
    void respond('answer');
    return getCallSession();
}

/**
 * Begin an incoming ring from a character (initiative / test).
 * @param {CallContact | import('./store.js').MailContact | null} contact
 * @param {{ ringTimeoutSec?: number, reason?: string }} [opts]
 * @returns {CallSession}
 */
export function beginIncomingCall(contact, opts = {}) {
    const s = getSettings();
    if (s.callEnabled === false) {
        throw new Error('Calls disabled');
    }
    if (isCallActive()) {
        throw new Error('Call already active');
    }
    const who = contact?.key
        ? listCallContacts().find((c) => c.key === contact.key) || contact
        : listCallContacts().find((c) => c.isActive) || listCallContacts()[0];
    if (!who?.name || isPhoneWaveContact(who.key)) {
        throw new Error('No call contact');
    }

    clearRingTimeout();
    stopNotificationSound();
    session = {
        id: uid('call'),
        status: 'ringing',
        direction: 'in',
        contact: contactPayload(who),
        startedAt: Date.now(),
        connectedAt: 0,
        endedAt: 0,
        turns: [],
        busy: false,
        reason: String(opts.reason || s.callInitiativeGuidance || '').trim(),
    };
    emit();

    // Continuous ring until answer / decline (startRingtoneLoop owns playback)
    startRingtoneLoop(who.key);

    let timeoutSec = Number(opts.ringTimeoutSec ?? s.callInitiativeRingTimeoutSec);
    if (!Number.isFinite(timeoutSec)) {
        timeoutSec = 45;
    }
    if (timeoutSec > 0) {
        ringTimeoutTimer = setTimeout(() => {
            if (session.status === 'ringing') {
                toast('Missed call', 'info', displayName(session.contact?.key, session.contact?.name || 'Call'));
                endCall({ silent: true, reason: 'missed' });
            }
        }, Math.round(timeoutSec * 1000));
    }

    toast(`Incoming call · ${displayName(who.key, who.name)}`, 'info', 'CALL');
    return getCallSession();
}

/**
 * Answer a ringing inbound call.
 * @returns {CallSession}
 */
export function answerIncomingCall() {
    if (session.status !== 'ringing' || !session.contact) {
        return getCallSession();
    }
    clearRingTimeout();
    stopRingtoneLoop();
    session.status = 'connected';
    session.connectedAt = Date.now();
    session.turns.push({
        id: uid('turn'),
        role: 'system',
        text: `Connected with ${session.contact.name}`,
        timestamp: Date.now(),
    });
    emit();
    // They called you: they speak first and say why.
    void respond('caller');
    return getCallSession();
}

/**
 * Hang up / cancel dialing / decline ring.
 * @param {{ silent?: boolean, reason?: string }} [opts]
 * @returns {CallSession}
 */
export function endCall(opts = {}) {
    clearRingTimeout();
    stopRingtoneLoop();
    if (hangupTimer) {
        clearTimeout(hangupTimer);
        hangupTimer = null;
    }
    if (session.status === 'idle' || session.status === 'ended') {
        session = emptySession();
        emit();
        return getCallSession();
    }
    const name = session.contact?.name || 'call';
    const wasRinging = session.status === 'ringing';
    session.status = 'ended';
    session.endedAt = Date.now();
    session.busy = false;
    session.turns.push({
        id: uid('turn'),
        role: 'system',
        text: wasRinging
            ? (opts.reason === 'missed' ? 'Missed call' : 'Declined')
            : (opts.reason === 'char' ? `${name} hung up` : 'Call ended'),
        timestamp: Date.now(),
    });
    emit();
    if (!opts.silent) {
        if (wasRinging) {
            toast(opts.reason === 'missed' ? 'Missed call' : 'Declined', 'info', displayName(session.contact?.key, name));
        } else {
            const durationMs = (session.connectedAt || session.startedAt)
                ? session.endedAt - (session.connectedAt || session.startedAt)
                : 0;
            const sec = Math.max(0, Math.round(durationMs / 1000));
            const what = opts.reason === 'char' ? 'Hung up' : 'Call ended';
            toast(sec ? `${what} · ${sec}s` : what, 'info', displayName(session.contact?.key, name));
        }
    }
    const ended = getCallSession();
    try {
        const key = session.contact?.key || '';
        if (key && !isPhoneWaveContact(key)) {
            if (wasRinging && session.direction === 'in') {
                logStory(opts.reason === 'missed' ? 'call-missed' : 'call-declined', `${opts.reason === 'missed' ? 'Missed' : 'Declined'} a call from ${name}`, key);
            } else if (!wasRinging && session.connectedAt) {
                logStory('call', `${session.direction === 'in' ? 'Call from' : 'Called'} ${name}`, key);
            }
        }
    } catch (err) {
        console.debug('[Phone Trigger] call log failed', err);
    }
    // Persist before wiping in-memory session (fire-and-forget summarize may continue)
    void recordCallMemory(ended).catch((err) => {
        console.warn('[Phone Trigger] recordCallMemory failed', err);
    });
    session = emptySession();
    emit();
    return ended;
}

/**
 * User speaks a line. Returns at once; the character's reply arrives through the change handler.
 * Lines spoken while the character is still talking are answered together afterwards.
 * @param {string} text
 * @returns {boolean} whether the line was said
 */
export function sendCallLine(text) {
    const line = String(text || '').trim();
    if (!line) {
        return false;
    }
    if (session.status !== 'connected' || !session.contact) {
        toast('Not on a call', 'warning');
        return false;
    }
    session.turns.push({
        id: uid('turn'),
        role: 'user',
        text: line,
        timestamp: Date.now(),
    });
    emit();
    void respond(null);
    return true;
}

/** @param {string} callId */
function onCall(callId) {
    return session.id === callId && session.status === 'connected';
}

/**
 * Generate the character's next line(s) until they've answered everything said.
 * @param {'answer' | 'caller' | null} opener
 */
async function respond(opener) {
    const callId = session.id;
    if (!onCall(callId) || respondingFor === callId) {
        return; // the running loop picks up new lines
    }
    respondingFor = callId;
    session.busy = true;
    emit();
    /** @type {'answer' | 'caller' | 'followup' | null} */
    let first = opener;
    let followup = '';
    try {
        for (let round = 0; round < 4; round++) {
            const userLines = session.turns.filter((t) => t.role === 'user').length;
            const lastUser = [...session.turns].reverse().find((t) => t.role === 'user')?.text || '';
            const prompt = buildCallPrompt({
                turns: session.turns,
                contact: session.contact,
                lastUser,
                opener: first,
                reason: first === 'followup' ? followup : session.reason,
            });
            let raw = '';
            try {
                raw = await generateCallText(prompt, {
                    contact: session.contact,
                    lastUser,
                    opener: first,
                    reason: first === 'followup' ? followup : session.reason,
                    turns: session.turns,
                });
            } catch (err) {
                console.error('[Phone Trigger] call reply failed', err);
                if (onCall(callId)) {
                    pushSystem('The line crackles — no reply.');
                    toast(err?.message || 'Call reply failed', 'error');
                }
                return;
            }
            if (!onCall(callId)) {
                return; // hung up meanwhile; never leak into another call
            }
            const { text, hangUp } = parseCallReply(raw, [session.contact?.name, getPersonaName()]);
            if (text) {
                session.turns.push({
                    id: uid('turn'),
                    role: 'char',
                    text,
                    timestamp: Date.now(),
                });
                emit();
            } else if (!hangUp) {
                pushSystem('…silence on the line.');
            }
            if (hangUp) {
                session.busy = false;
                emit();
                hangupTimer = setTimeout(() => {
                    hangupTimer = null;
                    if (onCall(callId)) {
                        endCall({ reason: 'char' });
                    }
                }, 1400);
                return;
            }
            // Answer anything said while this line was being generated.
            const late = session.turns.filter((t) => t.role === 'user').slice(userLines);
            if (!late.length) {
                return;
            }
            first = 'followup';
            followup = late.map((t) => t.text).join('\n');
        }
    } finally {
        if (respondingFor === callId) {
            respondingFor = '';
        }
        if (session.id === callId && session.busy) {
            session.busy = false;
            emit();
        }
    }
}

/** @param {string} text */
function pushSystem(text) {
    session.turns.push({ id: uid('turn'), role: 'system', text, timestamp: Date.now() });
    emit();
}

/**
 * Spoken text plus whether the character hangs up.
 * @param {string} raw
 */
export function parseCallReply(raw, names = []) {
    const s = String(raw || '');
    const hangUp = /\[\s*(hangs?\s*up|hung\s*up|end(s)?\s*(the\s*)?call|click)\s*\]/i.test(s);
    const text = cleanCallReply(s.replace(/\[\s*(hangs?\s*up|hung\s*up|end(s)?\s*(the\s*)?call|click)\s*\]/gi, ' '), names);
    return { text, hangUp };
}

/**
 * Strip common LLM wrappers from a spoken line.
 * @param {string} raw
 * @param {Array<string | undefined>} [names] speaker labels to drop ("Kurisu: …")
 */
export function cleanCallReply(raw, names = []) {
    let text = String(raw || '').trim();
    if (!text) {
        return '';
    }
    text = text.replace(/^\s*SUBJECT:\s*.+$/im, '').replace(/^\s*BODY:\s*/im, '').trim();
    // Stage directions: *sighs*, (pause), [static]
    text = text
        .replace(/\*[^*\n]{1,120}\*/g, ' ')
        .replace(/^\s*\([^)\n]{1,80}\)\s*/g, '')
        .replace(/\[[^\]\n]{1,40}\]/g, ' ')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
    if (
        (text.startsWith('"') && text.endsWith('"'))
        || (text.startsWith('“') && text.endsWith('”'))
    ) {
        text = text.slice(1, -1).trim();
    }
    for (const n of names) {
        const name = String(n || '').trim();
        if (name) {
            text = text.replace(new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*:\\s*`, 'i'), '').trim();
        }
    }
    if (
        (text.startsWith('"') && text.endsWith('"'))
        || (text.startsWith('“') && text.endsWith('”'))
    ) {
        text = text.slice(1, -1).trim();
    }
    return text.slice(0, 1200);
}

export function getPersonaLabel() {
    return getPersonaName();
}
