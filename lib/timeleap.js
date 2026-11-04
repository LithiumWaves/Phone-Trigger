/**
 * Time Leap Machine — send a leaper's memories back into their past self.
 *
 * A leap branches the chat at an anchor message (SillyTavern `/branch-create`), so the
 * abandoned future survives as its own chat file. Phone state (worldline, divergence,
 * D-Mails, earlier leaps) is carried across; the branch starts with fresh metadata otherwise.
 * The leaper — the user persona or a character — keeps a compressed memory of what happened
 * after the anchor, injected only where that leaper's knowledge belongs.
 */
import { META_KEY, LEGACY_META_KEY, TIMELEAP_PROMPT_KEY } from './constants.js';
import { getSettings, getContext } from './settings.js';
import { getMailStore, listMailContacts, getPersonaName } from './store.js';
import { isPhoneWaveContact, getDivergence } from './dmail.js';
import { generateMailText } from './generate.js';
import { prunePhonesAfter } from './phoneData.js';
import { logWorldline, noteConvergenceAfterLeap } from './worldline.js';
import { pruneBoardAfter } from './boardStore.js';
import { toLocalInput, fromLocalInput, getStoryClock, setStoryClock, pruneStoryLogAfter, getStoryDay, logStory } from './storyClock.js';

export { toLocalInput, fromLocalInput, getStoryClock, setStoryClock };

/**
 * @typedef {{ type: 'persona' | 'character', key: string, name: string }} Leaper
 * @typedef {{
 *   id: string,
 *   leaper: Leaper,
 *   anchorIndex: number,
 *   fromIndex: number,
 *   fromTime: string,
 *   toTime: string,
 *   memory: string,
 *   divergence: string,
 *   fromChat: string,
 *   timestamp: number,
 *   hops?: number,
 * }} LeapRecord
 * @typedef {{ index: number, name: string, text: string, isUser: boolean, sentAt: number | null }} LeapAnchor
 */

export const PERSONA_LEAPER_KEY = 'persona';
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function getMeta() {
    const meta = getMailStore();
    if (!Array.isArray(meta.leaps)) {
        meta.leaps = [];
    }
    return meta;
}

async function persist() {
    const { saveMetadata } = getContext();
    if (typeof saveMetadata === 'function') {
        await saveMetadata();
    }
}

// —— Story time ——

/** @param {number} n */
function pad2(n) {
    return String(n).padStart(2, '0');
}

/**
 * Clock-face parts for a story time (what the cutscene's flip clock shows).
 * @param {string | Date} value
 * @returns {{ month: number, day: number, weekday: string, hour: number, minute: number } | null}
 */
export function leapClockParts(value) {
    const d = value instanceof Date ? value : fromLocalInput(value);
    if (!d) {
        return null;
    }
    return {
        month: d.getMonth() + 1,
        day: d.getDate(),
        weekday: WEEKDAYS[d.getDay()],
        hour: d.getHours(),
        minute: d.getMinutes(),
    };
}

/**
 * "8/13 FRI 16:56"
 * @param {string | Date} value
 */
export function formatLeapTime(value) {
    const p = leapClockParts(value);
    if (!p) {
        return '--/-- --- --:--';
    }
    return `${p.month}/${p.day} ${p.weekday} ${pad2(p.hour)}:${pad2(p.minute)}`;
}

/**
 * Hours from `to` back to `from` (positive = into the past).
 * @param {string} from
 * @param {string} to
 */
export function leapSpanHours(from, to) {
    const a = fromLocalInput(from);
    const b = fromLocalInput(to);
    if (!a || !b) {
        return NaN;
    }
    return (a.getTime() - b.getTime()) / 3600000;
}

/**
 * Message `send_date` → epoch ms (SillyTavern stores numbers or human-readable strings).
 * @param {unknown} value
 * @returns {number | null}
 */
export function parseSendDate(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    const s = String(value || '').trim();
    if (!s) {
        return null;
    }
    if (/^\d{10,}$/.test(s)) {
        return Number(s);
    }
    // "November 2, 2026 3:45pm" → Date.parse needs a space before am/pm
    const t = Date.parse(s.replace(/(\d)(am|pm)$/i, '$1 $2'));
    return Number.isFinite(t) ? t : null;
}

/**
 * How many leaps a trip takes. Each leap reaches back at most `limit` hours, so a longer trip
 * is several leaps in a row (Okabe chaining 48-hour leaps; Nae going back 15 years).
 * @param {number} span hours into the past
 * @param {number} [limit] hours per leap (0 = one leap goes any distance)
 */
export function leapHops(span, limit = Number(getSettings().timeleapLimitHours) || 0) {
    if (!(span > 0) || !(limit > 0)) {
        return 1;
    }
    return Math.max(1, Math.ceil(span / limit - 1e-9));
}

/** " in 3 leaps" (nothing for a single leap). @param {number} hops */
export function hopsSuffix(hops) {
    return hops > 1 ? ` in ${hops} leaps` : '';
}

/** Total leaps on this chat: a chained trip counts every leap in it. */
export function countLeaps() {
    return getLeaps().reduce((n, l) => n + Math.max(1, Number(l.hops) || 1), 0);
}

// —— Leapers & anchors ——

/**
 * Who can leap: the persona, then the chat's characters (never PhoneWave).
 * @returns {Leaper[]}
 */
export function listLeapers() {
    /** @type {Leaper[]} */
    const out = [{ type: 'persona', key: PERSONA_LEAPER_KEY, name: getPersonaName() }];
    for (const c of listMailContacts()) {
        if (c && !isPhoneWaveContact(c.key)) {
            out.push({ type: 'character', key: c.key, name: c.name });
        }
    }
    return out;
}

/** @param {string} key */
export function resolveLeaper(key) {
    const all = listLeapers();
    return all.find((l) => l.key === key) || all[0];
}

/**
 * Messages a leap can land on, oldest first. The last message is excluded (nothing to rewind).
 * @param {number} [limit]
 * @returns {LeapAnchor[]}
 */
export function listLeapAnchors(limit = 60) {
    const ctx = getContext();
    const chat = Array.isArray(ctx.chat) ? ctx.chat : [];
    const persona = getPersonaName();
    /** @type {LeapAnchor[]} */
    const out = [];
    for (let i = chat.length - 2; i >= 0 && out.length < limit; i--) {
        const msg = chat[i];
        if (!msg || msg.is_system) {
            continue;
        }
        const text = cleanText(msg.mes).slice(0, 160);
        out.push({
            index: i,
            name: msg.name || (msg.is_user ? persona : 'Character'),
            text: text || '…',
            isUser: Boolean(msg.is_user),
            sentAt: parseSendDate(msg.send_date),
        });
    }
    return out.reverse();
}

/** @param {unknown} mes */
function cleanText(mes) {
    return String(mes || '')
        .replace(/<email\b[^>]*>[\s\S]*?<\/email>/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Suggest a destination: story now minus the real time elapsed since the anchor.
 * Falls back to 3 hours back (the clip's own leap) when timestamps are missing.
 * @param {string} now datetime-local
 * @param {number} anchorIndex
 * @returns {string}
 */
export function suggestDestination(now, anchorIndex) {
    const base = fromLocalInput(now) || new Date();
    const ctx = getContext();
    const chat = Array.isArray(ctx.chat) ? ctx.chat : [];
    const anchorTs = parseSendDate(chat[anchorIndex]?.send_date);
    const lastTs = parseSendDate(chat[chat.length - 1]?.send_date);
    let backMs = 3 * 3600000;
    if (anchorTs != null && lastTs != null && lastTs > anchorTs) {
        backMs = Math.max(60000, lastTs - anchorTs);
    }
    return toLocalInput(new Date(base.getTime() - backMs));
}

// —— Records ——

/** @returns {LeapRecord[]} newest first */
export function getLeaps() {
    return [...getMeta().leaps];
}

/** @param {string} id */
export async function removeLeap(id) {
    const meta = getMeta();
    meta.leaps = meta.leaps.filter((l) => l.id !== id);
    await persist();
    updateTimeleapPrompt();
}

export async function clearLeaps() {
    getMeta().leaps = [];
    await persist();
    updateTimeleapPrompt();
}

// —— Memory compression ——

/**
 * Transcript of everything after the anchor (the future being abandoned).
 * @param {number} anchorIndex
 */
function futureTranscript(anchorIndex) {
    const ctx = getContext();
    const chat = Array.isArray(ctx.chat) ? ctx.chat : [];
    const persona = getPersonaName();
    const lines = [];
    for (let i = anchorIndex + 1; i < chat.length; i++) {
        const msg = chat[i];
        if (!msg || msg.is_system) {
            continue;
        }
        const text = cleanText(msg.mes).slice(0, 600);
        if (text) {
            lines.push(`${msg.name || (msg.is_user ? persona : 'Character')}: ${text}`);
        }
    }
    const all = lines.join('\n');
    if (all.length <= 14000) {
        return all;
    }
    return `${all.slice(0, 4000)}\n[…]\n${all.slice(-10000)}`;
}

/**
 * Mail and calls that happened after the anchor.
 * @param {number | null} anchorTs
 */
function futurePhoneEvents(anchorTs) {
    if (anchorTs == null) {
        return [];
    }
    const store = getMailStore();
    const out = [];
    for (const e of store.emails || []) {
        if ((e.timestamp || 0) > anchorTs && !e.isDmail) {
            out.push(`Mail ${e.from} → ${e.to}: "${e.subject}" ${cleanText(e.body).slice(0, 160)}`);
        }
    }
    for (const c of store.calls || []) {
        if ((c.startedAt || c.timestamp || 0) > anchorTs) {
            const gist = c.summary || (c.turns || []).map((t) => t.text).join(' / ');
            out.push(`Call with ${c.contactName || c.contact?.name || 'someone'}: ${cleanText(gist).slice(0, 200)}`);
        }
    }
    return out.slice(0, 16);
}

/**
 * Compress the abandoned future into what the leaper will remember.
 * @param {{ leaper: Leaper, anchorIndex: number, fromTime: string, toTime: string }} opts
 * @returns {Promise<string>}
 */
export async function compressMemories({ leaper, anchorIndex, fromTime, toTime }) {
    const ctx = getContext();
    const chat = Array.isArray(ctx.chat) ? ctx.chat : [];
    const anchor = chat[anchorIndex];
    const transcript = futureTranscript(anchorIndex);
    const phone = futurePhoneEvents(parseSendDate(anchor?.send_date));
    const hops = leapHops(leapSpanHours(fromTime, toTime));
    const earlier = getLeaps()
        .filter((l) => l.leaper?.key === leaper.key)
        .slice(0, 3)
        .map((l) => l.memory);

    const prompt = [
        `${leaper.name} is about to time-leap: their consciousness travels from ${formatLeapTime(fromTime)} back to ${formatLeapTime(toTime)}, into their own past self.`,
        hops > 1 ? `It is too far for one leap: they leap ${hops} times in a row, each time back into an earlier self, until they reach it.` : '',
        `They will arrive at the moment of this message:`,
        `>> ${anchor ? `${anchor.name}: ${cleanText(anchor.mes).slice(0, 300)}` : '(start of the story)'}`,
        '',
        `Everything below happened AFTER that moment. On the new timeline it has not happened yet; only ${leaper.name} will remember it.`,
        '',
        '[Abandoned future]',
        transcript || '(nothing was said)',
        phone.length ? ['', '[Phone activity in that future]', ...phone].join('\n') : '',
        earlier.length ? ['', `[${leaper.name} already remembers from earlier leaps — do not repeat]`, ...earlier].join('\n') : '',
        '',
        `Write what ${leaper.name} remembers as 3–8 short bullet points starting with "- ".`,
        'Past tense, concrete: who did what, what was learned, how things ended, anything worth preventing or changing.',
        'No headings, no commentary, no mention of this instruction.',
    ].filter((l) => l !== '').join('\n');

    try {
        const raw = String(await generateMailText(prompt) || '').trim();
        const bullets = raw
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean)
            .map((l) => (/^[-*•]\s*/.test(l) ? `- ${l.replace(/^[-*•]\s*/, '')}` : l));
        const text = bullets.join('\n').slice(0, 1600);
        if (text) {
            return text;
        }
    } catch (err) {
        console.warn('[Phone Trigger] time leap memory compression failed', err);
    }
    return fallbackMemory(anchorIndex);
}

/** @param {number} anchorIndex */
function fallbackMemory(anchorIndex) {
    const ctx = getContext();
    const chat = Array.isArray(ctx.chat) ? ctx.chat : [];
    const persona = getPersonaName();
    const lines = [];
    for (let i = anchorIndex + 1; i < chat.length; i++) {
        const msg = chat[i];
        if (msg && !msg.is_system) {
            const text = cleanText(msg.mes).slice(0, 140);
            if (text) {
                lines.push(`- ${msg.name || (msg.is_user ? persona : 'Character')}: ${text}`);
            }
        }
    }
    if (lines.length <= 8) {
        return lines.join('\n');
    }
    return [...lines.slice(0, 3), '- …', ...lines.slice(-4)].join('\n');
}

// —— The leap ——

/**
 * Run a slash command (newer and older SillyTavern APIs).
 * @param {string} command
 */
async function runSlash(command) {
    const ctx = getContext();
    if (typeof ctx.executeSlashCommandsWithOptions === 'function') {
        const res = await ctx.executeSlashCommandsWithOptions(command, { handleParserErrors: true, handleExecutionErrors: true });
        return res?.pipe ?? '';
    }
    if (typeof ctx.executeSlashCommands === 'function') {
        const res = await ctx.executeSlashCommands(command);
        return res?.pipe ?? '';
    }
    throw new Error('Slash commands unavailable');
}

/**
 * Branch the chat at the anchor and land the leaper's memories on the new branch.
 * @param {{ leaper: Leaper, anchorIndex: number, fromTime: string, toTime: string, memory: string }} opts
 * @returns {Promise<{ ok: true, chat: string, record: LeapRecord } | { ok: false, error: string }>}
 */
export async function executeLeap({ leaper, anchorIndex, fromTime, toTime, memory }) {
    const ctx = getContext();
    const chat = Array.isArray(ctx.chat) ? ctx.chat : [];
    if (!Number.isInteger(anchorIndex) || anchorIndex < 0 || anchorIndex >= chat.length - 1) {
        return { ok: false, error: 'Pick a message before the latest one.' };
    }
    const settings = getSettings();
    const limit = Number(settings.timeleapLimitHours) || 0;
    const span = leapSpanHours(fromTime, toTime);
    if (!Number.isFinite(span) || span <= 0) {
        return { ok: false, error: 'Destination must be earlier than the current time.' };
    }
    // Past the limit the trip is chained: several leaps, each within range.
    const hops = leapHops(span, limit);

    const before = typeof ctx.getCurrentChatId === 'function' ? ctx.getCurrentChatId() : null;
    const anchorTs = parseSendDate(chat[anchorIndex]?.send_date);
    const snapshot = structuredClone(ctx.chatMetadata?.[META_KEY] || ctx.chatMetadata?.[LEGACY_META_KEY] || {});

    /** @type {LeapRecord} */
    const record = {
        id: `leap_${Date.now().toString(36)}`,
        leaper: { type: leaper.type, key: leaper.key, name: leaper.name },
        anchorIndex,
        fromIndex: chat.length - 1,
        fromTime,
        toTime,
        memory: String(memory || '').trim(),
        divergence: getDivergence(),
        fromChat: String(before || ''),
        timestamp: Date.now(),
        ...(hops > 1 ? { hops } : {}),
    };

    let branchName = '';
    try {
        branchName = String(await runSlash(`/branch-create ${anchorIndex}`) || '');
    } catch (err) {
        console.error('[Phone Trigger] branch failed', err);
        return { ok: false, error: 'Could not branch the chat.' };
    }
    const after = getContext();
    const now = typeof after.getCurrentChatId === 'function' ? after.getCurrentChatId() : null;
    if (!branchName && (now == null || now === before)) {
        return { ok: false, error: 'SillyTavern did not open a branch.' };
    }

    // The branch starts with fresh metadata: carry the phone across.
    const meta = snapshot;
    if (!settings.timeleapKeepFuturePhone && anchorTs != null) {
        meta.emails = (meta.emails || []).filter((e) => (e.timestamp || 0) <= anchorTs);
        meta.calls = (meta.calls || []).filter((c) => (c.startedAt || c.timestamp || 0) <= anchorTs);
        prunePhonesAfter(meta, anchorTs);
        pruneBoardAfter(meta, anchorTs, toTime);
    }
    meta.leaps = [record, ...(Array.isArray(meta.leaps) ? meta.leaps : [])];
    // The clock and its log go back with the leaper; the Day counter follows the calendar.
    const fromD = fromLocalInput(fromTime);
    const toD = fromLocalInput(toTime);
    if (fromD && toD) {
        const back = Math.round((Date.UTC(fromD.getFullYear(), fromD.getMonth(), fromD.getDate())
            - Date.UTC(toD.getFullYear(), toD.getMonth(), toD.getDate())) / 86400000);
        meta.storyDay = Math.max(1, (Number(meta.storyDay) || getStoryDay()) - back);
    }
    pruneStoryLogAfter(meta, toTime);
    meta.storyClock = toTime;
    meta.storyCarryMs = 0;
    after.chatMetadata[META_KEY] = meta;
    logStory('leap', `${leaper.name} leapt back from ${formatLeapTime(fromTime)}${hopsSuffix(hops)}`, record.id);
    logWorldline({
        type: 'leap',
        leapId: record.id,
        from: record.divergence,
        to: record.divergence,
        storyTime: fromTime,
        storyTo: toTime,
        leaper: leaper.name,
        text: `${leaper.name} leapt back ${span.toFixed(1)} h${hopsSuffix(hops)}`,
    });
    await persist();
    void noteConvergenceAfterLeap(record.memory);

    updateTimeleapPrompt();
    return { ok: true, chat: branchName || String(now || ''), record };
}

// —— Prompt inject ——

/**
 * Leap memories for the next generation.
 * The persona's memories are always present (only {{user}} knows them). A character's
 * memories are present only while that character is speaking.
 * @param {{ key?: string, name?: string } | null} [speaker]
 */
export function buildTimeleapPrompt(speaker = null) {
    const settings = getSettings();
    if (settings.enabled === false || settings.timeleapInject === false) {
        return '';
    }
    const max = Math.max(1, Math.min(20, Number(settings.timeleapMaxMemories) || 5));
    const leaps = getLeaps();
    if (!leaps.length) {
        return '';
    }
    const ctx = getContext();
    const persona = getPersonaName();
    let speakerKey = String(speaker?.key || '');
    if (!speakerKey && !ctx.groupId) {
        speakerKey = listMailContacts().find((c) => c.isActive && !isPhoneWaveContact(c.key))?.key || '';
    }

    const blocks = [];
    const mine = leaps.filter((l) => l.leaper?.type === 'persona').slice(0, max);
    if (mine.length) {
        blocks.push([
            `[Phone Trigger — Time Leap: ${persona}]`,
            `${persona} has time-leaped into their own past and remembers a future that has not happened on this timeline.`,
            `Only ${persona} has these memories. No one else remembers or knows them; never have other characters reference them unless ${persona} reveals them in the story.`,
            'Events may now unfold differently.',
            ...mine.map((l) => `• Leapt ${formatLeapTime(l.fromTime)} → ${formatLeapTime(l.toTime)}${hopsSuffix(l.hops || 1)}:\n${l.memory}`),
        ].join('\n'));
    }
    const theirs = speakerKey
        ? leaps.filter((l) => l.leaper?.type === 'character' && l.leaper.key === speakerKey).slice(0, max)
        : [];
    if (theirs.length) {
        const name = theirs[0].leaper.name;
        blocks.push([
            `[Phone Trigger — Time Leap: ${name}]`,
            `${name} has time-leaped into their own past and privately remembers a future that has not happened on this timeline.`,
            `Nobody else remembers it — not even ${persona}. ${name} may act on this knowledge, hide it, or reveal it, in character.`,
            ...theirs.map((l) => `• Leapt ${formatLeapTime(l.fromTime)} → ${formatLeapTime(l.toTime)}${hopsSuffix(l.hops || 1)}:\n${l.memory}`),
        ].join('\n'));
    }
    if (!blocks.length) {
        return '';
    }
    blocks.push('Do not narrate reading a system note.');
    return blocks.join('\n\n');
}

/**
 * @param {{ key?: string, name?: string } | null} [speaker]
 */
export function updateTimeleapPrompt(speaker = null) {
    const ctx = getContext();
    if (typeof ctx.setExtensionPrompt !== 'function') {
        return;
    }
    const settings = getSettings();
    const depth = Number.isFinite(Number(settings.timeleapPromptDepth))
        ? Math.max(0, Math.floor(Number(settings.timeleapPromptDepth)))
        : 2;
    let value = '';
    try {
        value = buildTimeleapPrompt(speaker);
    } catch (err) {
        console.warn('[Phone Trigger] time leap prompt failed', err);
    }
    try {
        ctx.setExtensionPrompt(TIMELEAP_PROMPT_KEY, value, ctx.extension_prompt_types?.IN_CHAT ?? 1, depth);
    } catch (err) {
        console.warn('[Phone Trigger] time leap setExtensionPrompt failed', err);
    }
}
