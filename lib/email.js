import { PROMPT_KEY, MAIL_SEND_PROMPT_KEY } from './constants.js';
import { getSettings, getContext, toast } from './settings.js';
import {
    addEmail,
    getActiveCharacterKey,
    getActiveCharacterName,
    getPersonaName,
    resolveMailContact,
    listMailContacts,
    getEmailsForCharacterMemory,
    getMemorySelection,
    listAutoMemoryEmails,
    setMemorySelection,
    getEmailById,
    persistMailStore,
} from './store.js';
import { playNotification } from './audio.js';
import { peerLabel, keyForName } from './contacts.js';
import { buildMailReplyPrompt, buildMailForcePrompt, buildMailInitiativePrompt, generateMailText } from './generate.js';
import { notifyIncomingMail } from './notify.js';
import { restoreReadingFor, cancelFacts, getAllFacts, logWorldline, rewriteRecordsForFact } from './worldline.js';
import { logStory } from './storyClock.js';
import {
    isPhoneWaveContact,
    PHONEWAVE_NAME,
    deriveWorldlineChange,
    applyWorldlineToLorebook,
    recordDmail,
    updateWorldlinePrompt,
    getDmailTiers,
    acceptWorldlineFact,
    getDivergence,
    pickDivergence,
    setDivergence,
} from './dmail.js';

/**
 * Steins;Gate-style D-Mail body: printable ASCII only, max 36 chars.
 * @param {string} text
 * @param {boolean} [limit36]
 */
export function clampDmailBody(text, limit36 = true) {
    let s = String(text || '');
    if (!limit36) {
        return s;
    }
    // Strip non-printable / non-ASCII so only "English" phone characters remain
    s = s.replace(/[^\x20-\x7E]/g, '');
    return s.slice(0, 36);
}

/**
 * Split a D-Mail body into exactly `parts` chunks (default 3).
 * A 36-char message → three 12-char parts; shorter/longer bodies divide as evenly as possible.
 * @param {string} text
 * @param {number} [parts]
 * @returns {string[]}
 */
export function splitDmailBody(text, parts = 3) {
    const s = String(text ?? '');
    const n = Math.max(1, Math.floor(Number(parts)) || 3);
    if (n === 1) {
        return [s];
    }
    if (!s.length) {
        return Array.from({ length: n }, () => '');
    }
    const base = Math.floor(s.length / n);
    const rem = s.length % n;
    /** @type {string[]} */
    const chunks = [];
    let i = 0;
    for (let p = 0; p < n; p++) {
        const len = base + (p < rem ? 1 : 0);
        chunks.push(s.slice(i, i + len));
        i += len;
    }
    return chunks;
}

/**
 * Parse a cosmetic datetime-local / ISO value into a timestamp.
 * @param {string|number|null|undefined} value
 * @returns {number|null}
 */
export function parseDmailCosmeticTimestamp(value) {
    if (value == null || value === '') {
        return null;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    const t = Date.parse(String(value));
    return Number.isFinite(t) ? t : null;
}

/**
 * Put a character’s Memory picker into manual mode with the given D-Mail ids unchecked
 * (so they exist in the list but are not injected until the user opts in).
 * @param {import('./store.js').MailContact | { key?: string, name?: string }} contact
 * @param {string[]} emailIds
 */
async function excludeDmailsFromCharacterMemory(contact, emailIds) {
    const key = String(contact?.key || '').trim();
    if (!key || !emailIds?.length) {
        return;
    }
    const settings = getSettings();
    const scope = settings.mailMemoryScope === 'all' ? 'all' : 'speaker';
    const exclude = new Set(emailIds.map(String));
    const current = getMemorySelection(key);
    /** @type {string[]} */
    let ids;
    if (current.mode === 'manual') {
        ids = current.ids.filter((id) => !exclude.has(String(id)));
    } else {
        ids = listAutoMemoryEmails(contact, scope)
            .map((e) => e.id)
            .filter((id) => !exclude.has(String(id)));
    }
    await setMemorySelection(key, { mode: 'manual', ids });
}

/** @type {((email: import('./store.js').EmailMessage) => void) | null} */
let onMailReceived = null;
/** @type {(() => void) | null} */
let onOpenInbox = null;

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const pendingReplyTimers = new Map();

export function setMailReceivedHandler(handler) {
    onMailReceived = handler;
}

export function setMailOpenHandler(handler) {
    onOpenInbox = handler;
}

const EMAIL_TAG_RE = /<email\b([^>]*)>([\s\S]*?)<\/email>/gi;
const PHONE_TAG_RE = /<phone\b([^>]*?)\/>|<phone\b([^>]*)>([\s\S]*?)<\/phone>/gi;
const PHONE_MAIL_RE = /<mail\b([^>]*)>([\s\S]*?)<\/mail>/gi;

/**
 * @typedef {{ owner: string, show: string, mails: Array<{ from?: string, to?: string, subject?: string, body: string }> }} PhoneShow
 */

/** @type {((shows: PhoneShow[]) => void | Promise<void>) | null} */
let onPhoneShown = null;

/** @param {(shows: PhoneShow[]) => void | Promise<void>} handler */
export function setPhoneShownHandler(handler) {
    onPhoneShown = handler;
}

/**
 * Strip <phone owner="…" show="…"/> and <phone owner="…"><mail …>…</mail></phone> tags.
 * @param {string} text
 * @returns {{ cleaned: string, shows: PhoneShow[] }}
 */
export function extractPhoneTags(text) {
    if (!text || typeof text !== 'string' || !/<phone\b/i.test(text)) {
        return { cleaned: text || '', shows: [] };
    }
    /** @type {PhoneShow[]} */
    const shows = [];
    const cleaned = text.replace(PHONE_TAG_RE, (_, selfAttrs, attrs, inner) => {
        const a = parseAttrs(selfAttrs ?? attrs ?? '');
        const owner = String(a.owner || a.of || a.name || '').trim();
        if (!owner) {
            return '';
        }
        const mails = [];
        String(inner || '').replace(PHONE_MAIL_RE, (__, mailAttrs, body) => {
            const m = parseAttrs(mailAttrs || '');
            mails.push({ from: m.from, to: m.to, subject: m.subject, body: String(body || '').trim() });
            return '';
        });
        shows.push({ owner, show: String(a.show || '').trim(), mails });
        return '';
    }).replace(/\n{3,}/g, '\n\n').trim();
    return { cleaned, shows };
}
const ATTR_RE = /(\w+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;

function parseAttrs(attrText) {
    /** @type {Record<string, string>} */
    const attrs = {};
    let m;
    ATTR_RE.lastIndex = 0;
    while ((m = ATTR_RE.exec(attrText)) !== null) {
        attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
    }
    return attrs;
}

/**
 * Strip and ingest <email> tags from character output.
 * @param {string} text
 * @returns {{ cleaned: string, emails: Array<{subject: string, body: string, from?: string, replyOptions?: string[]}> }}
 */
export function extractEmailTags(text) {
    if (!text || typeof text !== 'string') {
        return { cleaned: text || '', emails: [] };
    }
    const emails = [];
    const cleaned = text.replace(EMAIL_TAG_RE, (_, attrText, body) => {
        const attrs = parseAttrs(attrText || '');
        const replyRaw = attrs.replies || attrs.options || '';
        const replyOptions = replyRaw
            ? replyRaw.split('|').map((s) => s.trim()).filter(Boolean)
            : undefined;
        const image = String(attrs.image || '').trim();
        emails.push({
            subject: attrs.subject || '(no subject)',
            body: String(body || '').trim(),
            from: attrs.from || undefined,
            replyOptions,
            photo: /^(https?:|data:image\/|\/)/i.test(image) ? image : undefined,
            photoDesc: String(attrs.photo || '').trim() || undefined,
        });
        return '';
    }).replace(/\n{3,}/g, '\n\n').trim();
    return { cleaned, emails };
}

/**
 * Receive an inbound email from a character (or tool).
 */
export async function receiveEmail({
    from,
    subject,
    body,
    replyOptions,
    characterKey,
    silent = false,
    photo,
    photoDesc,
    tone,
    inReplyTo,
}) {
    const persona = getPersonaName();
    const sender = from || getActiveCharacterName();
    const email = await addEmail({
        direction: 'in',
        from: sender,
        to: persona,
        subject,
        body,
        replyOptions,
        characterKey: characterKey || getActiveCharacterKey(),
        read: false,
        photo: photo || undefined,
        photoDesc: photoDesc || undefined,
        tone: tone || undefined,
        inReplyTo: inReplyTo || undefined,
    });
    if (!email.photo && email.photoDesc && getSettings().charPhotos) {
        void developPhoto(email);
    }
    if (!silent && onMailArriving) {
        try {
            await onMailArriving(email);
        } catch {
            // the receiving animation is cosmetic
        }
    }

    if (!silent) {
        const phoneOpen = !!(document.getElementById('pp-root')?.classList.contains('pp-open')
            || document.getElementById('pp-overlay')?.open
            || document.getElementById('pp-overlay')?.hasAttribute('open'));
        if (!phoneOpen) {
            await playNotification(keyForName(email.from) || email.characterKey);
        }
        const settings = getSettings();
        if (settings.notifyInChat) {
            notifyIncomingMail({
                from: peerLabel(email.from),
                subject: email.subject,
                onOpen: () => {
                    if (typeof onOpenInbox === 'function') {
                        onOpenInbox();
                    }
                },
            });
        }
    }

    if (typeof onMailReceived === 'function') {
        onMailReceived(email);
    }

    updateMailPrompt();
    return email;
}

/**
 * A D-Mail reaches the past: work out what changed, archive it and (per the D-Mail tiers)
 * make it true. Shared by your own D-Mails and those characters send.
 * @param {{ id?: string, subject: string, body: string }} mail
 * @param {{ sender: string, contextLines?: string[] }} opts
 * @returns {Promise<{
 *   worldlineFact: string,
 *   acceptResult: Awaited<ReturnType<typeof acceptWorldlineFact>> | undefined,
 *   divergenceFrom: string,
 *   divergenceTo: string,
 * }>}
 */
export async function shiftWorldline(mail, opts) {
    const tiers = getDmailTiers();
    const needsFact = tiers.worldline || tiers.propose || tiers.apply;
    let fact = '';
    /** @type {string[]} */
    let cancels = [];
    /** @type {Awaited<ReturnType<typeof acceptWorldlineFact>> | undefined} */
    let acceptResult;
    if (needsFact) {
        const change = await deriveWorldlineChange(
            { subject: mail.subject, body: mail.body },
            { sender: opts.sender, contextLines: opts.contextLines || [] },
        );
        fact = change.fact;
        cancels = change.cancels;
    }
    // The meter only moves when reality does; Spectacle alone rolls back to the same reading.
    // Undoing an earlier D-Mail puts it back where it was before that one.
    const divergenceFrom = getDivergence();
    const restored = cancels.length ? restoreReadingFor(cancels) : '';
    const base = restored || divergenceFrom;
    let divergenceTo = base;
    if (fact) {
        divergenceTo = await pickDivergence({ subject: mail.subject, body: mail.body }, fact, base);
    } else if (cancels.length && !restored) {
        const undoneText = getAllFacts().filter((f) => cancels.includes(f.id)).map((f) => f.text).join(' / ');
        divergenceTo = await pickDivergence({ subject: mail.subject, body: mail.body }, `Undone: ${undoneText}`, divergenceFrom);
    }
    const commit = !tiers.propose && (tiers.worldline || tiers.apply);
    const entry = await recordDmail(mail, fact, {
        recordWorldline: Boolean(fact) && commit,
        sender: opts.sender,
        divergenceFrom: base,
        divergenceTo,
    });
    /** @type {{ id: string, text: string }[]} */
    let undone = [];
    if (commit && (fact || cancels.length)) {
        if (cancels.length) {
            undone = await cancelFacts(cancels, entry.id);
        }
        if (fact) {
            acceptResult = await acceptWorldlineFact(fact, { ...tiers, dmailId: entry.id, divergenceFrom: base, divergenceTo });
        }
        await setDivergence(divergenceTo);
        await commitWorldlineShift({ entry, fact, undone, divergenceFrom, divergenceTo, sender: opts.sender });
    }
    return {
        worldlineFact: fact,
        acceptResult,
        divergenceFrom,
        divergenceTo,
        divergenceBase: base,
        dmailId: entry.id,
        undone,
        pendingCancels: commit ? [] : cancels,
    };
}

/**
 * After a D-Mail is accepted: log it, refresh the prompt (and lorebook when undoing),
 * and let the phone's records follow the new worldline.
 * @param {{ entry: { id: string }, fact: string, undone: { id: string, text: string }[], divergenceFrom: string, divergenceTo: string, sender?: string }} info
 */
export async function commitWorldlineShift({ entry, fact, undone, divergenceFrom, divergenceTo, sender }) {
    logWorldline({
        type: fact ? 'dmail' : 'cancel',
        from: divergenceFrom,
        to: divergenceTo,
        dmailId: entry.id,
        factId: fact ? `wl_${entry.id}` : undefined,
        text: fact || `Undid: ${undone.map((u) => u.text).join(' / ')}`,
        sender: sender || getPersonaName(),
        cancels: undone.map((u) => u.id),
    });
    if (undone.length) {
        logStory('cancel', `Undid an earlier D-Mail: ${undone[0].text.slice(0, 60)}`, entry.id);
    }
    await persistMailStore();
    if (getSettings().dmailWorldline !== false) {
        updateWorldlinePrompt();
    }
    if (undone.length) {
        const s = getSettings();
        if (s.dmailApply && s.dmailApplyLorebook !== false) {
            await applyWorldlineToLorebook();
        }
    }
    if (fact && getSettings().dmailRewriteRecords) {
        void rewriteRecordsForFact({ id: `wl_${entry.id}`, text: fact }).then((n) => {
            if (n) {
                updateMailPrompt();
                toast(`${n} mail${n === 1 ? '' : 's'} on your phone changed`, 'info', 'READING STEINER');
            }
        });
    }
}

/**
 * User sends an outbound email.
 * Reply generation is scheduled independently (does not await / does not bind to main chat).
 * Sending to PhoneWave (name subject to change) records a D-Mail and updates the worldline overlay — no AI reply.
 * @param {{
 *   to?: string,
 *   toKey?: string,
 *   subject: string,
 *   body: string,
 *   inReplyTo?: string,
 *   requestReply?: boolean,
 *   dmailContextLines?: string[],
 *   dmailRedirectKey?: string,
 *   dmailCosmeticTimestamp?: string|number|null,
 * }} args
 * @returns {Promise<import('./store.js').EmailMessage & {
 *   isDmail?: boolean,
 *   worldlineFact?: string,
 *   acceptResult?: Awaited<ReturnType<typeof acceptWorldlineFact>>,
 *   divergenceFrom?: string,
 *   divergenceTo?: string,
 * }>}
 */
export async function sendUserEmail({
    to,
    toKey,
    subject,
    body,
    inReplyTo,
    requestReply = true,
    dmailContextLines,
    dmailRedirectKey,
    dmailCosmeticTimestamp,
    photo,
    photoDesc,
}) {
    const persona = getPersonaName();
    const contact = resolveMailContact(toKey || to) || {
        key: toKey || to || getActiveCharacterKey(),
        name: to || getActiveCharacterName(),
    };
    const dmail = isPhoneWaveContact(contact.key) || isPhoneWaveContact(contact.name);
    const settings = getSettings();

    let finalBody = String(body || '');
    if (dmail && settings.dmailLimit36) {
        finalBody = clampDmailBody(finalBody, true);
    }

    /** @type {import('./store.js').EmailMessage | null} */
    let outbound = null;

    if (dmail) {
        const redirectKey = String(
            dmailRedirectKey != null ? dmailRedirectKey : (settings.dmailRedirectKey || 'self'),
        ).trim() || 'self';
        const redirectSelf = redirectKey === 'self' || redirectKey === 'own' || redirectKey === '';
        const redirectContact = redirectSelf
            ? null
            : (resolveMailContact(redirectKey) || listMailContacts().find((c) => c.key === redirectKey) || null);
        const redirectName = redirectSelf
            ? (persona || 'You')
            : (redirectContact?.name || redirectKey);
        const cosmeticTs = parseDmailCosmeticTimestamp(dmailCosmeticTimestamp);

        const showOutbox = settings.dmailShowInOutbox === true;
        const mailBase = {
            subject,
            body: finalBody,
            inReplyTo,
            isDmail: true,
            dmailRedirectKey: redirectSelf ? 'self' : (redirectContact?.key || redirectKey),
            dmailRedirectName: redirectName,
        };

        // Full outbox copy only for own-phone debug; character routes store split parts instead.
        if (showOutbox && redirectSelf) {
            outbound = await addEmail({
                direction: 'out',
                from: persona,
                to: contact.name,
                ...mailBase,
                characterKey: contact.key,
                read: true,
                timestamp: Date.now(),
            });
        } else {
            outbound = {
                id: `dmail_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
                direction: 'out',
                from: persona,
                to: contact.name,
                subject: String(subject || '').trim() || '(no subject)',
                body: finalBody,
                timestamp: Date.now(),
                read: true,
                characterKey: contact.key,
                inReplyTo,
                isDmail: true,
                dmailRedirectKey: mailBase.dmailRedirectKey,
                dmailRedirectName: redirectName,
            };
        }

        if (redirectSelf) {
            // Delivery to the user’s own phone — always three split parts (e.g. 36 → 12+12+12).
            const parts = splitDmailBody(outbound.body, 3);
            const baseTs = cosmeticTs != null ? cosmeticTs : Date.now();
            const groupId = outbound.id || `dmail_${Date.now().toString(36)}`;
            const baseSubject = outbound.subject || '(no subject)';
            // Insert part 3 → 2 → 1 so inbox (unshift) lists parts in order from the top.
            for (let i = parts.length - 1; i >= 0; i--) {
                const partNum = i + 1;
                await addEmail({
                    direction: 'in',
                    from: PHONEWAVE_NAME,
                    to: persona,
                    subject: baseSubject,
                    body: parts[i],
                    preserveBody: true,
                    characterKey: contact.key,
                    isDmail: true,
                    dmailRedirectKey: 'self',
                    dmailRedirectName: persona,
                    dmailPart: partNum,
                    dmailPartTotal: 3,
                    dmailGroupId: groupId,
                    read: false,
                    timestamp: baseTs + i,
                });
            }
        } else if (redirectContact) {
            // Route to a character’s phone — stored for their mail memory (3 parts).
            const parts = splitDmailBody(outbound.body, 3);
            const baseTs = cosmeticTs != null ? cosmeticTs : Date.now();
            const groupId = outbound.id || `dmail_${Date.now().toString(36)}`;
            const baseSubject = outbound.subject || '(no subject)';
            /** @type {string[]} */
            const partIds = [];
            for (let i = parts.length - 1; i >= 0; i--) {
                const partNum = i + 1;
                const stored = await addEmail({
                    direction: 'out',
                    from: persona,
                    to: redirectContact.name,
                    subject: baseSubject,
                    body: parts[i],
                    preserveBody: true,
                    characterKey: redirectContact.key,
                    isDmail: true,
                    dmailRedirectKey: redirectContact.key,
                    dmailRedirectName: redirectContact.name,
                    dmailPart: partNum,
                    dmailPartTotal: 3,
                    dmailGroupId: groupId,
                    read: true,
                    timestamp: baseTs + i,
                });
                partIds.push(stored.id);
            }
            if (settings.dmailMemoryUnchecked !== false) {
                await excludeDmailsFromCharacterMemory(redirectContact, partIds);
            }
        }

        updateMailPrompt();

        const shift = await shiftWorldline(
            { id: outbound.id, subject: outbound.subject, body: outbound.body },
            { sender: persona, contextLines: Array.isArray(dmailContextLines) ? dmailContextLines : [] },
        );
        const fact = shift.worldlineFact || '';
        const { acceptResult, divergenceFrom, divergenceTo, divergenceBase, dmailId, undone, pendingCancels } = shift;
        return Object.assign(outbound, {
            isDmail: true,
            worldlineFact: fact || undefined,
            acceptResult,
            divergenceFrom,
            divergenceTo,
            divergenceBase,
            dmailId,
            undone,
            pendingCancels,
        });
    }

    outbound = await addEmail({
        direction: 'out',
        from: persona,
        to: contact.name,
        subject,
        body: finalBody,
        inReplyTo,
        characterKey: contact.key,
        read: true,
        photo: photo || undefined,
        photoDesc: photoDesc || undefined,
    });

    updateMailPrompt();

    if (requestReply) {
        scheduleCharacterEmailReply(outbound, contact);
    }

    return outbound;
}

/**
 * Pick a delay in ms from settings (min–max seconds, immersion gap).
 */
function pickReplyDelayMs() {
    const settings = getSettings();
    let min = Number(settings.mailReplyDelayMin);
    let max = Number(settings.mailReplyDelayMax);
    if (!Number.isFinite(min) || min < 0) {
        min = 3;
    }
    if (!Number.isFinite(max) || max < min) {
        max = Math.max(min, 8);
    }
    const sec = min + Math.random() * (max - min);
    return Math.round(sec * 1000);
}

/**
 * Schedule an independent mail reply after a short delay.
 * Does not block send; does not wait on the main chat turn.
 * @param {import('./store.js').EmailMessage} outbound
 * @param {import('./store.js').MailContact | null} [contact]
 */
export function scheduleCharacterEmailReply(outbound, contact = null) {
    if (!outbound?.id) {
        return;
    }

    const existing = pendingReplyTimers.get(outbound.id);
    if (existing) {
        clearTimeout(existing);
    }

    const delayMs = pickReplyDelayMs();
    const timer = setTimeout(() => {
        pendingReplyTimers.delete(outbound.id);
        void requestCharacterEmailReply(outbound, contact);
    }, delayMs);
    pendingReplyTimers.set(outbound.id, timer);
}

/**
 * Ask the selected mail contact to reply — independent of the main chat character.
 * Uses the editable prompt template + raw/OpenRouter generation.
 * @param {import('./store.js').EmailMessage} outbound
 * @param {import('./store.js').MailContact | null} [contact]
 */
export async function requestCharacterEmailReply(outbound, contact = null) {
    const who = contact || resolveMailContact(outbound.characterKey) || resolveMailContact(outbound.to) || {
        key: outbound.characterKey,
        name: outbound.to,
    };

    const photoNote = outbound.photoDesc
        ? `\n[Attached photo: ${outbound.photoDesc}]`
        : outbound.photo ? '\n[Attached a photo]' : '';
    const prompt = buildMailReplyPrompt({
        subject: outbound.subject,
        body: `${outbound.body}${photoNote}`,
        from: outbound.from,
        to: outbound.to,
    }, who);

    try {
        const raw = await generateMailText(prompt);
        const parsed = parseGeneratedEmail(raw, outbound.subject);
        if (!parsed.body) {
            return null;
        }
        return await receiveEmail({
            inReplyTo: outbound.id,
            from: outbound.to,
            subject: parsed.subject,
            body: parsed.body,
            replyOptions: parsed.replyOptions,
            photoDesc: parsed.photoDesc,
            tone: parsed.tone,
            characterKey: outbound.characterKey || who?.key,
        });
    } catch (err) {
        console.error('[Phone Trigger] Email reply generation failed:', err);
        toast(err?.message || 'Failed to generate email reply', 'error');
        return null;
    }
}

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const pendingForceTimers = new Map();

/** How many guided / initiative force jobs are waiting. */
export function countPendingForceJobs() {
    return pendingForceTimers.size;
}

/**
 * Schedule a guided unsolicited inbound mail from a character (independent of chat).
 * @param {import('./store.js').MailContact | null} contact
 * @param {{ guidance?: string, subject?: string, delay?: boolean }} [opts]
 * @returns {{ jobId: string, delayMs: number }}
 */
export function scheduleForcedCharacterMail(contact, opts = {}) {
    const who = contact || resolveMailContact(null) || listMailContacts()[0];
    if (!who?.name) {
        toast('No character available', 'warning');
        throw new Error('No character available for forced mail');
    }

    const jobId = `force_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const delayMs = opts.delay === false ? 0 : pickReplyDelayMs();

    const existing = pendingForceTimers.get(jobId);
    if (existing) {
        clearTimeout(existing);
    }

    const run = () => {
        pendingForceTimers.delete(jobId);
        void requestForcedCharacterMail(who, opts);
    };

    if (delayMs <= 0) {
        run();
    } else {
        const timer = setTimeout(run, delayMs);
        pendingForceTimers.set(jobId, timer);
    }

    return { jobId, delayMs };
}

/**
 * Immediately generate a guided inbound mail from a character.
 * @param {import('./store.js').MailContact | null} contact
 * @param {{ guidance?: string, subject?: string }} [opts]
 */
export async function requestForcedCharacterMail(contact, opts = {}) {
    const who = contact || resolveMailContact(null) || listMailContacts()[0];
    if (!who?.name) {
        toast('No character available', 'warning');
        return null;
    }

    const prompt = buildMailForcePrompt({
        guidance: opts.guidance,
        subject: opts.subject,
    }, who);

    try {
        const raw = await generateMailText(prompt);
        const parsed = parseGeneratedEmail(raw, opts.subject || 'Message');
        if (!parsed.body) {
            toast('Empty mail generated', 'warning');
            return null;
        }
        return await receiveEmail({
            from: who.name,
            subject: parsed.subject,
            body: parsed.body,
            replyOptions: parsed.replyOptions,
            photoDesc: parsed.photoDesc,
            tone: parsed.tone,
            characterKey: who.key,
        });
    } catch (err) {
        console.error('[Phone Trigger] Forced mail generation failed:', err);
        toast(err?.message || 'Failed to generate mail', 'error');
        return null;
    }
}

/**
 * Character-initiative inbound mail (uses initiative prompt / settings).
 * @param {import('./store.js').MailContact | null} contact
 * @param {{ guidance?: string, subject?: string }} [opts]
 */
export async function deliverInitiativeMail(contact, opts = {}) {
    const who = contact || resolveMailContact(null) || listMailContacts().find((c) => !isPhoneWaveContact(c.key));
    if (!who?.name) {
        toast('No character available', 'warning');
        return null;
    }

    const prompt = buildMailInitiativePrompt({
        guidance: opts.guidance,
        subject: opts.subject,
    }, who);

    try {
        const raw = await generateMailText(prompt);
        const parsed = parseGeneratedEmail(raw, opts.subject || 'Message');
        if (!parsed.body) {
            console.warn('[Phone Trigger] Empty initiative mail');
            return null;
        }
        return await receiveEmail({
            from: who.name,
            subject: parsed.subject,
            body: parsed.body,
            replyOptions: parsed.replyOptions,
            photoDesc: parsed.photoDesc,
            tone: parsed.tone,
            characterKey: who.key,
        });
    } catch (err) {
        console.error('[Phone Trigger] Initiative mail generation failed:', err);
        throw err;
    }
}

export function parseGeneratedEmail(raw, fallbackSubject) {
    const text = String(raw || '').trim();
    let subject = fallbackSubject?.startsWith('Re:') ? fallbackSubject : `Re: ${fallbackSubject || ''}`;
    let body = text;
    let replyOptions;

    const subjectMatch = text.match(/^\s*SUBJECT:\s*(.+)$/im);
    if (subjectMatch) {
        subject = subjectMatch[1].trim();
    }

    const bodyMatch = text.match(/BODY:\s*([\s\S]*?)(?:(?:^|\n)\s*REPLIES:\s*|$)/i);
    if (bodyMatch) {
        body = bodyMatch[1].trim();
    } else if (subjectMatch) {
        body = text.replace(subjectMatch[0], '').replace(/^\s*BODY:\s*/i, '').trim();
    }

    const repliesMatch = text.match(/REPLIES:\s*(.+)$/im);
    if (repliesMatch) {
        replyOptions = repliesMatch[1].split('|').map((s) => s.trim()).filter(Boolean);
        body = body.replace(/\n?\s*REPLIES:\s*.+$/im, '').trim();
    }

    // Optional trailer lines (photo, tone) — anywhere after the body.
    let photoDesc;
    let tone;
    const photoMatch = text.match(/^\s*PHOTO:\s*(.+)$/im);
    if (photoMatch) {
        photoDesc = photoMatch[1].trim().slice(0, 300);
    }
    const toneMatch = text.match(/^\s*TONE:\s*(warm|neutral|cold)\b/im);
    if (toneMatch) {
        tone = toneMatch[1].toLowerCase();
    }
    body = body.replace(/^\s*(?:PHOTO|TONE):.*$/gim, '').replace(/\n{3,}/g, '\n\n').trim();

    return { subject, body, replyOptions, photoDesc, tone };
}

/**
 * Format one mail for chat-memory injection.
 * @param {import('./store.js').EmailMessage} email
 * @param {string} entryTemplate
 * @param {number} previewLen
 */
function formatMailMemoryEntry(email, entryTemplate, previewLen) {
    const preview = String(email.body || '').replace(/\s+/g, ' ').trim().slice(0, previewLen);
    const vars = {
        status: email.read ? 'read' : 'NEW',
        direction: email.direction === 'in' ? 'in' : 'out',
        from: email.from || '',
        to: email.to || '',
        subject: email.subject || '(no subject)',
        preview,
        body: String(email.body || '').trim(),
        id: email.id || '',
    };
    return String(entryTemplate || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
        const k = String(key || '').toLowerCase();
        return Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : '';
    });
}

/**
 * Build per-speaker mail memory for the main chat prompt.
 * Uses the phone Memory picker's manual set when present; otherwise auto to/from (or all).
 * @param {import('./store.js').MailContact | { key?: string, name?: string } | null} [forContact]
 */
export function buildMailSystemPrompt(forContact = null) {
    const settings = getSettings();
    if (!settings.enabled || !settings.injectPrompt) {
        return '';
    }

    const ctx = getContext();
    const scope = settings.mailMemoryScope === 'all' ? 'all' : 'speaker';
    /** @type {import('./store.js').MailContact | { key?: string, name?: string } | null} */
    let contact = forContact;

    if (!contact) {
        contact = resolveSpeakingContact();
    }
    if (scope === 'speaker') {
        if (ctx.groupId && !contact) {
            return '';
        }
        if (!contact) {
            contact = resolveMailContact(getActiveCharacterKey()) || resolveMailContact(getActiveCharacterName());
        }
        if (!contact) {
            return '';
        }
    }

    const max = Math.max(1, Math.min(40, Number(settings.mailMemoryMax) || 6));
    const previewLen = Math.max(20, Math.min(500, Number(settings.mailMemoryPreviewLength) || 140));
    const entryTemplate = String(settings.mailMemoryEntryTemplate || '').trim()
        || '- [{{status}}] {{from}} → {{to}} | {{subject}}: {{preview}}';

    const selected = getEmailsForCharacterMemory(contact, { scope, max: max * 2 });
    const recentIn = selected.filter((e) => e.direction === 'in').slice(0, max);
    const recentOut = selected.filter((e) => e.direction === 'out').slice(0, max);
    const combined = selected.slice(0, max * 2);
    const unread = selected.filter((e) => e.direction === 'in' && !e.read).length;
    const memoryMode = contact?.key ? getMemorySelection(contact.key).mode : 'auto';

    const formatList = (list) => {
        if (!list.length) {
            return '(none)';
        }
        return list.map((e) => formatMailMemoryEntry(e, entryTemplate, previewLen)).join('\n');
    };

    const persona = getPersonaName();
    const charName = contact?.name || getActiveCharacterName() || 'Character';
    const template = String(settings.mailMemoryPrompt || '').trim()
        || [
            '[Phone Trigger — {{char}}\'s mail]',
            '{{inbox}}',
            '{{outbox}}',
        ].join('\n');
    const sendInstructions = String(settings.mailMemorySendInstructions || '').trim();

    /** @type {Record<string, string>} */
    const vars = {
        char: charName,
        char_name: charName,
        user: persona,
        persona,
        inbox: formatList(recentIn),
        outbox: formatList(recentOut),
        mail_list: formatList(combined),
        unread_count: String(unread),
        mail_count: String(selected.length),
        // Said once in its own note when "characters can e-mail you" is on.
        send_instructions: settings.charMailInChat !== false ? '' : sendInstructions,
        scope: memoryMode === 'manual' ? 'manual' : scope,
        mode: memoryMode,
    };

    return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
        const k = String(key || '').toLowerCase();
        return Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : '';
    }).replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * @param {import('./store.js').MailContact | { key?: string, name?: string } | null} [forContact]
 */
export function updateMailPrompt(forContact = null) {
    const ctx = getContext();
    if (typeof ctx.setExtensionPrompt !== 'function') {
        return;
    }
    const settings = getSettings();
    const value = settings.enabled && settings.injectPrompt ? buildMailSystemPrompt(forContact) : '';
    const position = Number.isFinite(Number(settings.mailMemoryPromptPosition))
        ? Number(settings.mailMemoryPromptPosition)
        : 1;
    const depth = Number.isFinite(Number(settings.mailMemoryPromptDepth))
        ? Number(settings.mailMemoryPromptDepth)
        : 0;
    try {
        ctx.setExtensionPrompt(MAIL_SEND_PROMPT_KEY, buildMailSendPrompt(), ctx.extension_prompt_types?.IN_CHAT ?? 1, 4);
    } catch (err) {
        console.warn('[Phone Trigger] mail send prompt failed:', err);
    }
    try {
        ctx.setExtensionPrompt(PROMPT_KEY, value, position, depth);
    } catch (err) {
        try {
            ctx.setExtensionPrompt(PROMPT_KEY, value, ctx.extension_prompt_types?.IN_CHAT ?? position, depth);
        } catch (err2) {
            console.warn('[Phone Trigger] setExtensionPrompt failed:', err2);
        }
    }
}

/**
 * Characters can e-mail {{user}} straight from the chat, any time it fits — not only through
 * initiative. Independent of mail memory (which is off by default).
 */
export function buildMailSendPrompt() {
    const settings = getSettings();
    if (!settings.enabled || settings.charMailInChat === false) {
        return '';
    }
    const persona = getPersonaName();
    const how = String(settings.mailMemorySendInstructions || '').trim()
        || 'Include: <email subject="Subject">Body</email>';
    return [
        `[Phone Trigger — e-mail] Characters in this story have phones and can e-mail ${persona} at any time, whenever it fits: to reply, check in, warn, share something, or because e-mail is simply how they talk.`,
        `A character who mostly communicates by e-mail should do so here. Only send mail when the character really would; most replies need none.`,
        how,
        `Put the tag inside the reply (add from="Name" if someone other than the speaker sends it). It is delivered to ${persona}'s phone and removed from the visible message, so do not also narrate its text.`,
    ].join('\n');
}

/** Last resolved speaker for mail memory (group generations). */
let lastSpeakingContact = null;

/**
 * Best-effort resolve of who is about to speak (for per-character mail injection).
 * @param {any} [hint]
 */
export function resolveSpeakingContact(hint) {
    if (hint && typeof hint === 'object') {
        const key = hint.characterKey || hint.avatar || hint.key || hint.character_avatar;
        const name = hint.name || hint.character_name || hint.characterName || hint.original;
        const resolved = resolveMailContact(key) || resolveMailContact(name);
        if (resolved) {
            lastSpeakingContact = resolved;
            return resolved;
        }
        // Nested payloads some ST versions pass
        if (hint.character) {
            return resolveSpeakingContact(hint.character);
        }
    }
    if (typeof hint === 'string' || typeof hint === 'number') {
        const resolved = resolveMailContact(hint);
        if (resolved) {
            lastSpeakingContact = resolved;
            return resolved;
        }
    }

    const fromActive = resolveMailContact(getActiveCharacterKey())
        || resolveMailContact(getActiveCharacterName())
        || listMailContacts().find((c) => c.isActive)
        || null;
    if (fromActive) {
        lastSpeakingContact = fromActive;
        return fromActive;
    }
    return lastSpeakingContact;
}

/** Called before a mail lands with the phone open (the receiving bar). */
let onMailArriving = null;

/** @param {(email: any) => Promise<void> | void} fn */
export function setMailArrivingHandler(fn) {
    onMailArriving = fn;
}

/**
 * Turn a mail's PHOTO description into an image with SillyTavern's image generation
 * (the /sd command) when it's installed. The mail keeps its description either way.
 * @param {import('./store.js').EmailMessage} email
 */
export async function developPhoto(email) {
    const ctx = getContext();
    const has = ctx.SlashCommandParser?.commands?.sd || ctx.SlashCommandParser?.commands?.imagine;
    if (!has) {
        return;
    }
    try {
        const desc = String(email.photoDesc || '').replace(/[|{}]/g, ' ').trim();
        let url = '';
        const cmd = `/sd quiet=true ${desc}`;
        if (typeof ctx.executeSlashCommandsWithOptions === 'function') {
            url = String((await ctx.executeSlashCommandsWithOptions(cmd, { handleParserErrors: true, handleExecutionErrors: true }))?.pipe || '');
        } else if (typeof ctx.executeSlashCommands === 'function') {
            url = String((await ctx.executeSlashCommands(cmd))?.pipe || '');
        }
        url = url.trim();
        if (!url || !/^(https?:|data:image\/|\/|user\/|[\w-]+\/)/i.test(url)) {
            return;
        }
        const live = getEmailById(email.id);
        if (live) {
            live.photo = url;
            await persistMailStore();
            onMailReceived?.(live);
        }
    } catch (err) {
        console.debug('[Phone Trigger] photo generation failed', err);
    }
}

export function registerEmailTool() {
    const ctx = getContext();
    if (typeof ctx.registerFunctionTool !== 'function') {
        console.warn('[Phone Trigger] registerFunctionTool unavailable');
        return;
    }

    try {
        ctx.registerFunctionTool({
            name: 'send_email',
            displayName: 'Send E-mail',
            description:
                'Send a short dialogue-focused e-mail to the user\'s phone inbox. Use for personal messages, not narration.',
            parameters: {
                $schema: 'http://json-schema.org/draft-04/schema#',
                type: 'object',
                properties: {
                    subject: {
                        type: 'string',
                        description: 'E-mail subject line',
                    },
                    body: {
                        type: 'string',
                        description: 'E-mail body — dialogue style, no prose narration',
                    },
                    from: {
                        type: 'string',
                        description: 'Optional sender display name (defaults to current character)',
                    },
                    replies: {
                        type: 'string',
                        description: 'Optional pipe-separated reply phrases the user can tap, e.g. "Upa|Mayushii|Okabe"',
                    },
                    photo: {
                        type: 'string',
                        description: 'Optional: describe a photo attached to the mail (one sentence)',
                    },
                },
                required: ['subject', 'body'],
            },
            action: async ({ subject, body, from, replies, photo }) => {
                const replyOptions = replies
                    ? String(replies).split('|').map((s) => s.trim()).filter(Boolean)
                    : undefined;
                const email = await receiveEmail({
                    from,
                    subject,
                    body,
                    replyOptions,
                    photoDesc: photo ? String(photo) : undefined,
                });
                return JSON.stringify({
                    ok: true,
                    id: email.id,
                    delivered: true,
                    message: `E-mail "${email.subject}" delivered to phone inbox.`,
                });
            },
            formatMessage: ({ subject }) => `Sending e-mail: ${subject || '...'}`,
            shouldRegister: () => getSettings().enabled,
        });
    } catch (err) {
        console.warn('[Phone Trigger] Could not register send_email tool:', err);
    }
}

/**
 * Process a character message for embedded email tags.
 * Mutates the chat message text if tags are found.
 * @param {number} messageId
 */
export async function ingestEmailsFromMessage(messageId) {
    const ctx = getContext();
    const msg = ctx.chat?.[messageId];
    if (!msg || msg.is_user) {
        return;
    }
    const phone = extractPhoneTags(msg.mes || '');
    if (phone.shows.length) {
        msg.mes = phone.cleaned;
        try {
            await onPhoneShown?.(phone.shows);
        } catch (err) {
            console.warn('[Phone Trigger] phone tag failed', err);
        }
    }
    const { cleaned, emails } = extractEmailTags(msg.mes || '');
    if (!emails.length) {
        return phone.shows.length > 0;
    }
    msg.mes = cleaned;
    for (const em of emails) {
        await receiveEmail({
            from: em.from || msg.name || getActiveCharacterName(),
            subject: em.subject,
            body: em.body,
            replyOptions: em.replyOptions,
            photo: em.photo,
            photoDesc: em.photoDesc,
        });
    }
}
