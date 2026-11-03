/**
 * Character phones — what is on someone else's handset.
 *
 * Stored per chat in `phone_trigger.phones[ownerKey]` (so Time Leap branches carry and
 * prune it like your own mail). Their mail with you is never copied: it is mirrored live
 * from your mailbox with the direction flipped. Everything else (threads with other people,
 * call log) is generated once from their card and the story, then kept.
 */
import { getSettings, getContext, toast } from './settings.js';
import { getMailStore, persistMailStore, getPersonaName, listMailContacts, getEmails } from './store.js';
import { isPhoneWaveContact, getWorldlineFacts } from './dmail.js';
import { generateMailText, buildChatSummary, buildMailReplyPrompt } from './generate.js';
import { receiveEmail, parseGeneratedEmail } from './email.js';
import { extractJson } from './phoneSpec.js';

/**
 * @typedef {{
 *   id: string,
 *   direction: 'in' | 'out',
 *   from: string,
 *   to: string,
 *   subject: string,
 *   body: string,
 *   timestamp: number,
 *   read: boolean,
 *   mirror?: boolean,
 *   byUser?: boolean,
 *   shown?: boolean,
 * }} OwnerMail
 * @typedef {{ id: string, with: string, kind: 'in' | 'out' | 'missed', at: number, seconds: number, note: string }} OwnerCall
 * @typedef {{ t: number, kind: 'read' | 'sent' | 'shown' | 'opened', text: string }} SnoopEntry
 * @typedef {{ mails: OwnerMail[], calls: OwnerCall[], seededAt: number, log: SnoopEntry[] }} OwnerPhone
 */

export const SNOOP_PROMPT_KEY = 'phone_trigger_snoop';

/** @param {string} prefix */
function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** @param {unknown} v @param {number} max */
function clip(v, max) {
    return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/**
 * Key for someone who may not be a chat character (e.g. "FB").
 * @param {string} name
 */
export function npcKey(name) {
    return `npc:${String(name || '').trim().toLowerCase()}`;
}

/**
 * Resolve a name or key to a phone owner. Unknown names become story-only owners.
 * @param {string} nameOrKey
 * @returns {{ key: string, name: string } | null}
 */
export function resolveOwner(nameOrKey) {
    const needle = String(nameOrKey || '').trim();
    if (!needle || isPhoneWaveContact(needle)) {
        return null;
    }
    const persona = getPersonaName();
    if (needle.toLowerCase() === persona.toLowerCase()) {
        return null; // that's your own phone
    }
    const contacts = listMailContacts().filter((c) => !isPhoneWaveContact(c.key));
    const hit = contacts.find((c) => c.key === needle)
        || contacts.find((c) => c.name.toLowerCase() === needle.toLowerCase())
        || contacts.find((c) => c.name.toLowerCase().split(/\s+/)[0] === needle.toLowerCase());
    if (hit) {
        return { key: hit.key, name: hit.name };
    }
    if (needle.startsWith('npc:')) {
        return { key: needle, name: needle.slice(4).replace(/^\w/, (m) => m.toUpperCase()) };
    }
    return { key: npcKey(needle), name: needle.slice(0, 40) };
}

/**
 * @param {string} key
 * @returns {OwnerPhone}
 */
function book(key) {
    const meta = getMailStore();
    if (!meta.phones || typeof meta.phones !== 'object') {
        meta.phones = {};
    }
    if (!meta.phones[key]) {
        meta.phones[key] = { mails: [], calls: [], seededAt: 0, log: [] };
    }
    const b = meta.phones[key];
    b.mails = Array.isArray(b.mails) ? b.mails : [];
    b.calls = Array.isArray(b.calls) ? b.calls : [];
    b.log = Array.isArray(b.log) ? b.log : [];
    return b;
}

/** @param {string} key */
export function isSeeded(key) {
    return Boolean(book(key).seededAt);
}

/**
 * Your own mail with them, seen from their side.
 * @param {string} key
 * @param {string} name
 * @returns {OwnerMail[]}
 */
function mirrored(key, name) {
    const lower = name.toLowerCase();
    return getEmails()
        .filter((e) => !e.isDmail && (e.characterKey === key
            || String(e.from || '').toLowerCase() === lower
            || String(e.to || '').toLowerCase() === lower))
        .map((e) => ({
            id: `mirror:${e.id}`,
            direction: /** @type {'in' | 'out'} */ (e.direction === 'in' ? 'out' : 'in'),
            from: e.direction === 'in' ? name : e.from,
            to: e.direction === 'in' ? e.to : name,
            subject: e.subject,
            body: e.body,
            timestamp: e.timestamp,
            read: true,
            mirror: true,
        }));
}

/**
 * Everything in their mailbox, newest first.
 * @param {string} key
 * @param {string} name
 * @returns {OwnerMail[]}
 */
export function listOwnerMails(key, name) {
    return [...book(key).mails, ...mirrored(key, name)].sort((a, b) => b.timestamp - a.timestamp);
}

/** @param {string} key @param {string} name @param {string} id */
export function getOwnerMail(key, name, id) {
    return listOwnerMails(key, name).find((m) => m.id === id) || null;
}

/** @param {string} key */
export function listOwnerCalls(key) {
    return [...book(key).calls].sort((a, b) => b.at - a.at);
}

/**
 * Note what you did on their phone (feeds the main-chat inject).
 * @param {string} key
 * @param {SnoopEntry['kind']} kind
 * @param {string} text
 */
export async function logSnoop(key, kind, text) {
    const b = book(key);
    b.log.push({ t: Date.now(), kind, text: clip(text, 260) });
    if (b.log.length > 40) {
        b.log.splice(0, b.log.length - 40);
    }
    await persistMailStore();
    updateSnoopPrompt();
}

/**
 * Open a mail: mark it read and remember you saw it.
 * @param {string} key
 * @param {string} name
 * @param {string} id
 */
export async function readOwnerMail(key, name, id) {
    const mail = getOwnerMail(key, name, id);
    if (!mail) {
        return null;
    }
    const stored = book(key).mails.find((m) => m.id === id);
    if (stored && !stored.read) {
        stored.read = true;
    }
    if (!mail.mirror && !mail.byUser) {
        const who = mail.direction === 'in' ? `from ${mail.from}` : `${name} sent to ${mail.to}`;
        await logSnoop(key, 'read', `read mail ${who}: "${mail.subject}" — ${clip(mail.body, 160)}`);
    } else {
        await persistMailStore();
    }
    return mail;
}

/** Contacts their phone knows: chat cast, you, and anyone in their mail or call log. */
export function ownerContacts(key, name) {
    const names = new Set([getPersonaName()]);
    for (const c of listMailContacts()) {
        if (!isPhoneWaveContact(c.key) && c.name !== name) {
            names.add(c.name);
        }
    }
    for (const m of listOwnerMails(key, name)) {
        names.add(m.direction === 'in' ? m.from : m.to);
    }
    for (const c of book(key).calls) {
        names.add(c.with);
    }
    names.delete(name);
    return [...names].filter(Boolean);
}

// —— Generation ——

/** @param {string} key */
function ownerCard(key) {
    const c = listMailContacts().find((x) => x.key === key);
    if (!c) {
        return '';
    }
    return [c.description, c.personality ? `Personality: ${c.personality}` : '', c.scenario ? `Scenario: ${c.scenario}` : '']
        .filter(Boolean).join('\n').slice(0, 2000);
}

/**
 * Fill their phone with mail threads and calls that fit who they are.
 * @param {string} key
 * @param {string} name
 * @param {{ more?: boolean }} [opts] more = add new items on top of what is there
 * @returns {Promise<number>} items added
 */
export async function seedOwnerPhone(key, name, opts = {}) {
    const b = book(key);
    const persona = getPersonaName();
    const cast = listMailContacts().filter((c) => !isPhoneWaveContact(c.key) && c.key !== key).map((c) => c.name);
    const known = listOwnerMails(key, name).slice(0, 12)
        .map((m) => `- ${m.direction === 'in' ? `from ${m.from}` : `to ${m.to}`}: "${m.subject}"`);
    const facts = getWorldlineFacts().slice(0, 6).map((f) => `- ${f.text}`);
    const prompt = [
        `Fill ${name}'s mobile phone with what would really be on it right now.`,
        ownerCard(key) ? `About ${name}:\n${ownerCard(key)}` : `${name} is a person in this story.`,
        `People in the story: ${[persona, ...cast].join(', ')}. ${name} may also know people never seen in the story (family, coworkers, shops, mysterious senders).`,
        buildChatSummary(14) ? `Recent story:\n${buildChatSummary(14)}` : '',
        facts.length ? `Facts true on this worldline:\n${facts.join('\n')}` : '',
        known.length ? `Already on the phone (do not repeat):\n${known.join('\n')}` : '',
        `Do NOT write mail between ${name} and ${persona}; those already exist.`,
        '',
        `Write ${opts.more ? '2-4' : '6-9'} mails (mix of received and sent, some forming short threads) and ${opts.more ? '0-2' : '3-5'} call-log entries.`,
        `Mails are short, in ${name}'s and the sender's own voices, revealing personality, relationships and maybe a secret.`,
        'Reply with ONLY JSON:',
        '{"mails":[{"dir":"in"|"out","with":"other person","subject":"...","body":"...","hoursAgo":number}],',
        ' "calls":[{"with":"name","kind":"in"|"out"|"missed","hoursAgo":number,"seconds":number,"note":"few words"}]}',
    ].filter((l) => l !== '').join('\n');

    let data = null;
    try {
        data = extractJson(String(await generateMailText(prompt) || ''));
    } catch (err) {
        console.warn('[Phone Trigger] phone contents generation failed', err);
    }
    const now = Date.now();
    let added = 0;
    for (const m of Array.isArray(data?.mails) ? data.mails.slice(0, 12) : []) {
        const other = clip(m?.with, 40);
        const body = String(m?.body ?? '').trim().slice(0, 1600);
        if (!other || !body || other.toLowerCase() === persona.toLowerCase()) {
            continue;
        }
        const out = String(m?.dir).toLowerCase() === 'out';
        const hours = Math.max(0.05, Math.min(24 * 60, Number(m?.hoursAgo) || 1 + Math.random() * 48));
        b.mails.push({
            id: uid('om'),
            direction: out ? 'out' : 'in',
            from: out ? name : other,
            to: out ? other : name,
            subject: clip(m?.subject, 80) || '(no subject)',
            body,
            timestamp: now - hours * 3600000,
            read: out || Math.random() < 0.6,
        });
        added++;
    }
    for (const c of Array.isArray(data?.calls) ? data.calls.slice(0, 8) : []) {
        const other = clip(c?.with, 40);
        if (!other) {
            continue;
        }
        const kind = ['in', 'out', 'missed'].includes(String(c?.kind)) ? c.kind : 'in';
        b.calls.push({
            id: uid('oc'),
            with: other,
            kind,
            at: now - Math.max(0.05, Math.min(24 * 60, Number(c?.hoursAgo) || 2)) * 3600000,
            seconds: kind === 'missed' ? 0 : Math.max(0, Math.min(7200, Math.round(Number(c?.seconds) || 60))),
            note: clip(c?.note, 80),
        });
        added++;
    }
    b.seededAt = now;
    await persistMailStore();
    return added;
}

// —— Acting as them ——

/**
 * Send a mail from their phone, written by you.
 * To you → lands in your inbox as from them. To anyone else → stored in their Sent,
 * and the recipient's reply arrives in their inbox after the usual delay.
 * @param {string} key
 * @param {string} name
 * @param {{ to: string, subject: string, body: string }} mail
 * @param {{ onReply?: (m: OwnerMail) => void }} [hooks]
 */
export async function sendAsOwner(key, name, mail, hooks = {}) {
    const persona = getPersonaName();
    const to = clip(mail.to, 40);
    const subject = clip(mail.subject, 120) || '(no subject)';
    const body = String(mail.body || '').trim().slice(0, 4000);
    if (!to || !body) {
        return null;
    }
    if (to.toLowerCase() === persona.toLowerCase()) {
        await receiveEmail({ from: name, subject, body, characterKey: key.startsWith('npc:') ? undefined : key, silent: true });
        await logSnoop(key, 'sent', `used ${name}'s phone to mail themselves, posing as ${name}: "${subject}" — ${clip(body, 140)}`);
        return null; // it now lives in your mailbox and mirrors back here
    }
    const b = book(key);
    /** @type {OwnerMail} */
    const out = {
        id: uid('om'),
        direction: 'out',
        from: name,
        to,
        subject,
        body,
        timestamp: Date.now(),
        read: true,
        byUser: true,
    };
    b.mails.push(out);
    await persistMailStore();
    await logSnoop(key, 'sent', `sent ${to} a mail as ${name} from ${name}'s phone: "${subject}" — ${clip(body, 140)}`);
    scheduleOwnerReply(key, name, out, hooks.onReply);
    return out;
}

/**
 * @param {string} key
 * @param {string} name
 * @param {OwnerMail} out
 * @param {(m: OwnerMail) => void} [onReply]
 */
function scheduleOwnerReply(key, name, out, onReply) {
    const s = getSettings();
    const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
    const lo = Math.max(0, num(s.mailReplyDelayMin, 3));
    const hi = Math.max(lo, num(s.mailReplyDelayMax, 8));
    const delay = (lo + Math.random() * (hi - lo)) * 1000;
    const chatId = getContext().getCurrentChatId?.();
    setTimeout(async () => {
        if (getContext().getCurrentChatId?.() !== chatId) {
            return; // chat changed; the reply would land in the wrong place
        }
        const contact = listMailContacts().find((c) => c.name.toLowerCase() === out.to.toLowerCase()) || { name: out.to };
        const prompt = buildMailReplyPrompt({ subject: out.subject, body: out.body, from: name, to: out.to }, contact);
        try {
            const parsed = parseGeneratedEmail(await generateMailText(prompt), out.subject);
            if (!parsed.body) {
                return;
            }
            /** @type {OwnerMail} */
            const reply = {
                id: uid('om'),
                direction: 'in',
                from: out.to,
                to: name,
                subject: clip(parsed.subject, 120),
                body: String(parsed.body).slice(0, 4000),
                timestamp: Date.now(),
                read: false,
            };
            book(key).mails.push(reply);
            await persistMailStore();
            toast(`${name}'s phone: mail from ${out.to}`, 'info', 'PHONE');
            onReply?.(reply);
        } catch (err) {
            console.warn('[Phone Trigger] reply on character phone failed', err);
        }
    }, delay);
}

/**
 * A character shows you their phone (the <phone> tag): add any inline mails.
 * @param {string} key
 * @param {string} name
 * @param {Array<{ from?: string, to?: string, subject?: string, body?: string }>} mails
 * @returns {Promise<string[]>} ids of the added mails
 */
export async function addShownMails(key, name, mails) {
    const b = book(key);
    const ids = [];
    for (const m of mails.slice(0, 6)) {
        const body = String(m.body || '').trim().slice(0, 4000);
        if (!body) {
            continue;
        }
        const from = clip(m.from, 40) || 'Unknown';
        const out = from.toLowerCase() === name.toLowerCase();
        const id = uid('om');
        b.mails.push({
            id,
            direction: out ? 'out' : 'in',
            from: out ? name : from,
            to: out ? (clip(m.to, 40) || 'Unknown') : name,
            subject: clip(m.subject, 120) || '(no subject)',
            body,
            timestamp: Date.now(),
            read: false,
            shown: true,
        });
        ids.push(id);
    }
    await persistMailStore();
    return ids;
}

/** @param {string} key */
export async function clearOwnerPhone(key) {
    const meta = getMailStore();
    if (meta.phones) {
        delete meta.phones[key];
    }
    await persistMailStore();
    updateSnoopPrompt();
}

/**
 * Drop everything that had not happened yet at `anchorTs` (Time Leap).
 * @param {any} meta phone_trigger metadata
 * @param {number} anchorTs
 */
export function prunePhonesAfter(meta, anchorTs) {
    if (!meta?.phones || typeof meta.phones !== 'object') {
        return;
    }
    for (const b of Object.values(meta.phones)) {
        if (!b || typeof b !== 'object') {
            continue;
        }
        b.mails = (b.mails || []).filter((m) => (m.timestamp || 0) <= anchorTs);
        b.calls = (b.calls || []).filter((c) => (c.at || 0) <= anchorTs);
        b.log = (b.log || []).filter((l) => (l.t || 0) <= anchorTs);
    }
}

// —— Main-chat awareness ——

/**
 * What you have seen and done on other people's phones, plus how characters can show theirs.
 */
export function buildSnoopPrompt() {
    const s = getSettings();
    if (s.enabled === false) {
        return '';
    }
    const persona = getPersonaName();
    const blocks = [];
    if (s.snoopInject !== false) {
        const meta = getMailStore();
        const max = Math.max(1, Math.min(20, Number(s.snoopInjectMax) || 8));
        const lines = [];
        for (const [key, b] of Object.entries(meta.phones || {})) {
            const owner = resolveOwner(key)?.name || key;
            for (const e of (b?.log || []).slice(-max)) {
                lines.push({ t: e.t, text: `- ${owner}'s phone: ${persona} ${e.text}` });
            }
        }
        lines.sort((a, b) => a.t - b.t);
        if (lines.length) {
            blocks.push([
                `[Phone Trigger — other people's phones]`,
                `What ${persona} has seen or done on other characters' phones. The owners do not know unless they saw it happen, were shown it, or find out in the story.`,
                ...lines.slice(-max).map((l) => l.text),
            ].join('\n'));
        }
    }
    if (s.phoneShowTag !== false) {
        blocks.push([
            `[Phone Trigger — showing a phone]`,
            `When a character shows ${persona} their phone (or ${persona} sees its screen), you may add this tag after the narration:`,
            '<phone owner="Name"><mail from="Sender" subject="Subject">What the mail says</mail></phone>',
            'Use <phone owner="Name" show="latest"/> to open their newest mail instead. Only use it when the story actually shows the phone.',
        ].join('\n'));
    }
    return blocks.join('\n\n');
}

export function updateSnoopPrompt() {
    const ctx = getContext();
    if (typeof ctx.setExtensionPrompt !== 'function') {
        return;
    }
    const s = getSettings();
    const depth = Number.isFinite(Number(s.snoopPromptDepth)) ? Math.max(0, Math.floor(Number(s.snoopPromptDepth))) : 3;
    let value = '';
    try {
        value = buildSnoopPrompt();
    } catch (err) {
        console.warn('[Phone Trigger] snoop prompt failed', err);
    }
    try {
        ctx.setExtensionPrompt(SNOOP_PROMPT_KEY, value, ctx.extension_prompt_types?.IN_CHAT ?? 1, depth);
    } catch (err) {
        console.warn('[Phone Trigger] snoop setExtensionPrompt failed', err);
    }
}
