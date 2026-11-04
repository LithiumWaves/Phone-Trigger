/**
 * Characters reaching into the past: a character sends a D-Mail or time-leaps.
 *
 * Three ways in:
 * - You do it for them, from their phone (lib/otherPhone.js hands off to phone.js).
 * - You force them (settings panel, /chardmail, /charleap) with optional guidance.
 * - Initiative: after characters speak, now and then a short check asks whether the story
 *   gives one of them a real reason to. The answer is almost always no.
 *
 * Reading Steiner: when a character's D-Mail changes the worldline, only {{user}} notices.
 * The sender does not remember sending it; the change is still recorded and injected.
 */
import { getSettings, saveSettings, toast, getContext } from './settings.js';
import { listMailContacts, getPersonaName } from './store.js';
import { isPhoneWaveContact, listDmailChatContext, getWorldlineFacts } from './dmail.js';
import { shiftWorldline, clampDmailBody } from './email.js';
import { generateMailText } from './generate.js';
import { extractJson } from './phoneSpec.js';
import {
    listLeapAnchors,
    suggestDestination,
    getStoryClock,
    compressMemories,
    executeLeap,
    formatLeapTime,
    leapSpanHours,
    getLeaps,
    leapHops,
    hopsSuffix,
} from './timeleap.js';
import { playTimeleapSequence } from './timeleapFx.js';
import { closePhone, presentDmailResult } from './phone.js';

/** @typedef {import('./store.js').MailContact} MailContact */
/** @typedef {{ act: 'none' } | { act: 'dmail', why: string, subject: string, body: string } | { act: 'leap', why: string, anchorIndex: number }} WorldPlan */

const LOG = '[Phone Trigger]';

/** Characters who could act (the chat's cast, never PhoneWave). */
export function listActors() {
    return listMailContacts().filter((c) => c && !isPhoneWaveContact(c.key));
}

/** @param {string} keyOrName */
export function resolveActor(keyOrName) {
    const needle = String(keyOrName || '').trim().toLowerCase();
    if (!needle) {
        return null;
    }
    const all = listActors();
    return all.find((c) => c.key.toLowerCase() === needle)
        || all.find((c) => c.name.toLowerCase() === needle)
        || all.find((c) => c.name.toLowerCase().split(/\s+/)[0] === needle)
        || null;
}

// —— Doing it ——

/**
 * A character sends a D-Mail. Only you will notice the shift.
 * @param {MailContact} contact
 * @param {{ subject?: string, body: string }} mail
 */
export async function characterDmail(contact, mail) {
    const s = getSettings();
    const body = s.dmailLimit36 ? clampDmailBody(mail.body, true) : String(mail.body || '').trim();
    const subject = String(mail.subject || '').trim().slice(0, 60) || '(no subject)';
    if (!body.trim()) {
        return null;
    }
    const contextLines = listDmailChatContext(12).map((l) => `${l.name}: ${l.text}`);
    const result = await shiftWorldline(
        { id: `dmail_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`, subject, body },
        { sender: contact.name, contextLines },
    );
    await presentDmailResult(result, { subject, body, sender: contact.name, cutscene: s.charDmailCutscene !== false });
    return result;
}

/**
 * A character time-leaps back to an earlier message.
 * @param {MailContact} contact
 * @param {{ anchorIndex: number, why?: string, ask?: boolean }} opts ask = their own decision (may prompt you)
 * @returns {Promise<boolean>} leapt
 */
export async function characterLeap(contact, opts) {
    const s = getSettings();
    if (s.timeleapEnabled === false) {
        toast('Time Leap Machine is disabled', 'warning', 'TIME LEAP');
        return false;
    }
    const anchors = listLeapAnchors(60);
    const anchor = anchors.find((a) => a.index === opts.anchorIndex);
    if (!anchor) {
        toast('There is no earlier moment to leap to', 'warning', 'TIME LEAP');
        return false;
    }
    const from = getStoryClock();
    // Past the range limit they chain leaps until they reach the moment.
    const to = suggestDestination(from, anchor.index);
    const hops = leapHops(leapSpanHours(from, to));
    if (opts.ask && s.charLeapAsk !== false) {
        const allowed = await askLeap({ name: contact.name, from, to, hops, why: opts.why || '', arrival: `${anchor.name}: ${anchor.text}` });
        if (!allowed) {
            toast(`${contact.name} did not leap`, 'info', 'TIME LEAP');
            return false;
        }
    }
    await waitForIdle();
    const leaper = { type: /** @type {'character'} */ ('character'), key: contact.key, name: contact.name };
    toast(`${contact.name} is leaping…`, 'info', 'TIME LEAP');
    const memory = await compressMemories({ leaper, anchorIndex: anchor.index, fromTime: from, toTime: to });
    await closePhone({ force: true });
    const lines = [
        `LEAPER  ${contact.name.toUpperCase()}`,
        `FROM  ${formatLeapTime(from)}`,
        `DEST  ${formatLeapTime(to)}`,
        ...(hops > 1 ? [`LEAPS  ×${hops}`] : []),
    ];
    const leap = executeLeap({ leaper, anchorIndex: anchor.index, fromTime: from, toTime: to, memory });
    const [result] = await Promise.all([
        leap,
        s.charLeapCutscene !== false ? playTimeleapSequence({ from, to, lines }) : Promise.resolve(),
    ]);
    if (!result.ok) {
        toast(result.error, 'error', 'TIME LEAP');
        return false;
    }
    toast(`${contact.name} leapt · ${formatLeapTime(to)}${hopsSuffix(hops)}`, 'success', 'TIME LEAP');
    return true;
}

// —— Deciding ——

/** @param {MailContact} contact */
function aboutBlock(contact) {
    const card = [contact.description, contact.personality ? `Personality: ${contact.personality}` : '', contact.scenario ? `Scenario: ${contact.scenario}` : '']
        .filter(Boolean).join('\n').slice(0, 1800);
    const facts = getWorldlineFacts().slice(0, 6).map((f) => `- ${f.text}`);
    const memories = getLeaps().filter((l) => l.leaper?.key === contact.key).slice(0, 2).map((l) => l.memory);
    const anchors = listLeapAnchors(24);
    const chat = Array.isArray(getContext().chat) ? getContext().chat : [];
    // The last few messages go in whole: what just happened is the reason to act, and a
    // death at the end of a long message was being cut off. Older ones stay one line each.
    const fullFrom = recentIndexes(chat, RECENT_FULL)[0] ?? chat.length;
    let budget = RECENT_BUDGET;
    const line = (a) => {
        if (a.index < fullFrom) {
            return `#${a.index} ${a.name}: ${a.text}`;
        }
        const whole = messageText(chat[a.index]).slice(0, Math.max(400, budget));
        budget -= whole.length;
        return `#${a.index} ${a.name}: ${whole}`;
    };
    // Newest first so the budget favours what just happened, then back into order.
    const recent = anchors.filter((a) => a.index >= fullFrom).reverse().map(line).reverse();
    const older = anchors.filter((a) => a.index < fullFrom).map(line);
    const last = chat.length - 1;
    const lastMsg = chat[last];
    const latest = lastMsg && !lastMsg.is_system
        ? [`#${last} ${lastMsg.name || (lastMsg.is_user ? getPersonaName() : 'Character')}: ${messageText(lastMsg).slice(0, RECENT_BUDGET)} (latest)`]
        : lastLine();
    return {
        anchors,
        text: [
            card ? `About ${contact.name}:\n${card}` : `${contact.name} is a character in this story.`,
            facts.length ? `True on the current worldline:\n${facts.join('\n')}` : '',
            memories.length ? `${contact.name} remembers from an earlier time leap:\n${memories.join('\n')}` : '',
            'Recent story (numbered messages, oldest first):',
            ...older,
            ...recent,
            ...latest,
        ].filter(Boolean).join('\n'),
    };
}

/** Messages shown whole in a decision (before the latest), and their shared length budget. */
const RECENT_FULL = 5;
const RECENT_BUDGET = 9000;

/** @param {any} msg */
function messageText(msg) {
    return String(msg?.mes || '')
        .replace(/<email\b[^>]*>[\s\S]*?<\/email>/gi, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/** Indexes of the last `n` real messages before the latest, oldest first. */
function recentIndexes(chat, n) {
    const out = [];
    for (let i = chat.length - 2; i >= 0 && out.length < n; i--) {
        if (chat[i] && !chat[i].is_system) {
            out.unshift(i);
        }
    }
    return out;
}

/** The newest message (anchors leave it out: there is nothing after it to rewind). */
function lastLine() {
    const last = listDmailChatContext(1)[0];
    return last ? [`#${last.index} ${last.name}: ${last.text} (latest)`] : [];
}

// —— Urgency ——

/**
 * Words that mean something terrible just happened. Only a trigger for asking now: the
 * character (the model) still decides whether it is a reason to act.
 */
const URGENT_RE = new RegExp([
    '\\b(died|dies|dying|dead|death|killed|kills?|murder(?:ed|s)?|slain|corpse|body bag)\\b',
    '\\b(shot|stabbed|bleeding(?: out)?|blood(?:ied|y)?|wounded|fatal(?:ly)?|lifeless|motionless|not breathing|no pulse|flatlin\\w*|heart stopped)\\b',
    '\\b(hit by (?:a |the )?(?:car|truck|train|bus)|run over|crash(?:ed)?|explo(?:ded|sion)|on fire|burn(?:ed|ing) (?:down|alive)|collaps(?:ed|es))\\b',
    '\\b(kidnapp?ed|abducted|taken hostage|suicide|overdos\\w*|executed|gone forever|too late)\\b',
].join('|'), 'i');

/** @param {string} text */
export function soundsUrgent(text) {
    return URGENT_RE.test(String(text || ''));
}

/** The newest character message, and the one before it (often where it happened). */
function latestText() {
    const chat = Array.isArray(getContext().chat) ? getContext().chat : [];
    return chat.slice(-2).filter((m) => m && !m.is_system).map(messageText).join('\n');
}

function techBlock(name) {
    const s = getSettings();
    const limit = Number(s.timeleapLimitHours) || 0;
    return [
        'The two ways to reach the past:',
        `- D-Mail: a short text (${s.dmailLimit36 ? 'at most 36 characters' : 'a sentence or two'}) sent into the past through PhoneWave. It changes what happened; afterwards nobody remembers the old version — not even the sender — except ${getPersonaName()}.`,
        `- Time Leap: ${name}'s memories travel back into their own past self${limit > 0 ? ` (at most ${limit} hours per leap; further back means several leaps in a row)` : ''}, arriving at an earlier moment of the story. Only ${name} remembers the future they left.`,
    ].join('\n');
}

/**
 * @param {string} raw
 * @param {{ anchors: Array<{ index: number }> }} about
 * @returns {WorldPlan}
 */
function parsePlan(raw, about) {
    const text = String(raw || '');
    // A reply cut off mid-JSON still says what they chose: read the fields one by one.
    const data = extractJson(text) || looseFields(text);
    const act = String(data?.act || '').toLowerCase();
    if (act === 'dmail') {
        const body = String(data?.body || '').trim();
        if (body) {
            return { act: 'dmail', why: String(data?.why || ''), subject: String(data?.subject || '').trim(), body };
        }
    }
    if (act === 'leap') {
        const n = Number(String(data?.to ?? '').replace(/^#/, ''));
        const valid = about.anchors.map((a) => a.index);
        const anchorIndex = valid.includes(n) ? n : valid[valid.length - 1];
        if (Number.isInteger(anchorIndex)) {
            return { act: 'leap', why: String(data?.why || ''), anchorIndex };
        }
    }
    return { act: 'none' };
}

/** Fields from JSON that never closed (the reply hit its length limit). @param {string} text */
function looseFields(text) {
    const field = (k) => {
        const m = new RegExp(`"${k}"\\s*:\\s*(?:"((?:[^"\\\\]|\\\\.)*)"?|#?(\\d+))`, 'i').exec(text);
        return m ? (m[1] ?? m[2] ?? '').replace(/\\"/g, '"') : undefined;
    };
    const act = field('act');
    return act ? { act, to: field('to'), why: field('why'), subject: field('subject'), body: field('body') } : null;
}

/**
 * Their own decision. Almost always "none".
 * @param {MailContact} contact
 * @param {{ dmail: boolean, leap: boolean }} allow
 * @returns {Promise<WorldPlan>}
 */
export async function considerActing(contact, allow, opts = {}) {
    const about = aboutBlock(contact);
    if (allow.leap && !about.anchors.length) {
        allow = { ...allow, leap: false };
    }
    if (!allow.dmail && !allow.leap) {
        return { act: 'none' };
    }
    const options = [allow.dmail ? 'dmail' : '', allow.leap ? 'leap' : ''].filter(Boolean);
    const prompt = [
        `Decide whether ${contact.name}, at this exact point in the story, would reach into the past.`,
        about.text,
        '',
        techBlock(contact.name),
        '',
        opts.urgent
            ? `Something terrible may have just happened in the latest messages. Read them closely. If ${contact.name} can use this technology and would want to undo it, this is the moment — someone in their place acts at once, not later. Choose ${options.map((o) => `"${o}"`).join(' or ')} if ALL of these are true:`
            : `The answer is "none" almost every time. Choose ${options.map((o) => `"${o}"`).join(' or ')} ONLY if ALL of these are true:`,
        `1. The story has clearly established that ${contact.name} knows this technology exists and can use it right now. If it was never shown or told to them, answer none.`,
        `2. Something concrete in the recent story gives ${contact.name} an urgent, personal reason: a death, injury or disaster to prevent, a terrible mistake or loss to undo, or knowledge of something bad that is coming.`,
        `3. Doing it now is in character for ${contact.name} and proportionate — never on a whim, for small things, or just because it is possible.`,
        'If you are unsure, answer none.',
        '',
        'Reply with ONLY JSON, one of:',
        '{"act":"none"}',
        allow.dmail ? '{"act":"dmail","why":"one sentence","subject":"few words","body":"the D-Mail text"}' : '',
        allow.leap ? `{"act":"leap","to":<number of the message to arrive at — before it happened>,"why":"one sentence"}` : '',
    ].filter((l) => l !== '').join('\n');
    try {
        return parsePlan(await generateMailText(prompt), about);
    } catch (err) {
        console.warn(LOG, 'world initiative check failed', err);
        return { act: 'none' };
    }
}

/**
 * You make them do it: they choose how, following your guidance.
 * @param {MailContact} contact
 * @param {'dmail' | 'leap'} act
 * @param {string} [guidance]
 * @returns {Promise<WorldPlan>}
 */
export async function planForced(contact, act, guidance = '') {
    const about = aboutBlock(contact);
    if (act === 'leap' && !about.anchors.length) {
        return { act: 'none' };
    }
    const prompt = [
        act === 'dmail'
            ? `${contact.name} is sending a D-Mail into the past right now. Decide what it says.`
            : `${contact.name} is time-leaping right now. Decide which moment they go back to.`,
        about.text,
        '',
        techBlock(contact.name),
        '',
        guidance ? `Direction for this ${act === 'dmail' ? 'D-Mail' : 'leap'} (follow it): ${guidance}` : `Choose what ${contact.name} would most want to change, in character.`,
        '',
        'Reply with ONLY JSON:',
        act === 'dmail'
            ? '{"act":"dmail","why":"one sentence","subject":"few words","body":"the D-Mail text"}'
            : '{"act":"leap","to":<number of the message to arrive at>,"why":"one sentence"}',
    ].join('\n');
    try {
        const plan = parsePlan(await generateMailText(prompt), about);
        if (plan.act === act) {
            return plan;
        }
    } catch (err) {
        console.warn(LOG, 'forced plan failed', err);
    }
    // The model would not cooperate: fall back to something sensible.
    if (act === 'leap') {
        return { act: 'leap', why: guidance, anchorIndex: about.anchors[Math.max(0, about.anchors.length - 4)].index };
    }
    return guidance ? { act: 'dmail', why: '', subject: '', body: guidance } : { act: 'none' };
}

/**
 * Make a character send a D-Mail or time leap now.
 * @param {MailContact} contact
 * @param {'dmail' | 'leap'} act
 * @param {string} [guidance]
 * @returns {Promise<string>} what happened
 */
export async function forceAct(contact, act, guidance = '') {
    if (busy) {
        return 'Busy — something is already reaching into the past.';
    }
    busy = true;
    try {
        toast(`${contact.name} is ${act === 'dmail' ? 'writing a D-Mail' : 'preparing to leap'}…`, 'info', act === 'dmail' ? 'D-MAIL' : 'TIME LEAP');
        const plan = await planForced(contact, act, guidance);
        if (plan.act === 'dmail') {
            await characterDmail(contact, plan);
            return `${contact.name} sent a D-Mail`;
        }
        if (plan.act === 'leap') {
            const ok = await characterLeap(contact, { anchorIndex: plan.anchorIndex, why: plan.why, ask: false });
            return ok ? `${contact.name} time-leapt` : `${contact.name} did not leap`;
        }
        return 'Nothing to do';
    } catch (err) {
        console.error(LOG, 'forced act failed', err);
        toast('That did not work', 'error', 'PHONEWAVE');
        return 'Failed';
    } finally {
        busy = false;
    }
}

// —— Initiative ——

let busy = false;
let generationBusy = false;
let messagesSince = 0;
let lastCheckAt = 0;

/** @param {boolean} on */
export function setWorldGenerationBusy(on) {
    generationBusy = Boolean(on);
}

/** Wait (up to a minute) for SillyTavern to stop generating before branching or rewriting reality. */
async function waitForIdle() {
    for (let i = 0; i < 120 && generationBusy; i++) {
        await new Promise((r) => setTimeout(r, 500));
    }
}

/**
 * A character just spoke. Every so often, ask whether anyone has reason to reach into the past.
 * @param {MailContact | null} speaker
 */
export function noteCharacterMessage(speaker) {
    const s = getSettings();
    if (s.enabled === false) {
        return;
    }
    if (s.worldUrgentAct && !busy && noteUrgent(speaker)) {
        return;
    }
    if (!s.worldInitiativeEnabled) {
        return;
    }
    messagesSince++;
    const every = Math.max(1, Math.floor(Number(s.worldInitiativeEveryMessages) || 4));
    const cooldown = Math.max(0, Number(s.worldInitiativeCooldownSec) || 0) * 1000;
    if (busy || messagesSince < every || Date.now() - lastCheckAt < cooldown) {
        return;
    }
    const allow = {
        dmail: s.worldInitiativeDmail !== false,
        leap: s.worldInitiativeLeap !== false && s.timeleapEnabled !== false,
    };
    if (!allow.dmail && !allow.leap) {
        return;
    }
    const actors = listActors();
    if (!actors.length) {
        return;
    }
    const speaking = (speaker && actors.find((c) => c.key === speaker.key)) || actors.find((c) => c.isActive) || actors[0];
    const others = actors.filter((c) => c.key !== speaking.key);
    const othersChance = Math.max(0, Math.min(1, Number(s.worldInitiativeOthersChance ?? 0.3)));
    const who = others.length && Math.random() < othersChance
        ? others[Math.floor(Math.random() * others.length)]
        : speaking;
    messagesSince = 0;
    lastCheckAt = Date.now();
    // Let the message settle (and any follow-up generation start) before thinking it over.
    setTimeout(() => void runCheck(who, allow), 2000);
}

/** Last message an urgent check ran for (one check per message, even if it is swiped). */
let urgentAt = -1;

/**
 * Something terrible just happened: ask now, skipping the message count and cooldown.
 * Whoever is speaking is considered (they were there).
 * @param {MailContact | null} speaker
 * @returns {boolean} a check was started
 */
function noteUrgent(speaker) {
    const s = getSettings();
    const chat = Array.isArray(getContext().chat) ? getContext().chat : [];
    const at = chat.length - 1;
    if (at <= urgentAt || !soundsUrgent(latestText())) {
        return false;
    }
    const allow = {
        dmail: s.worldInitiativeDmail !== false,
        leap: s.worldInitiativeLeap !== false && s.timeleapEnabled !== false,
    };
    if (!allow.dmail && !allow.leap) {
        allow.leap = s.timeleapEnabled !== false;
    }
    const actors = listActors();
    const who = (speaker && actors.find((c) => c.key === speaker.key)) || actors.find((c) => c.isActive) || actors[0];
    if (!who || (!allow.dmail && !allow.leap)) {
        return false;
    }
    urgentAt = at;
    messagesSince = 0;
    lastCheckAt = Date.now();
    console.debug(LOG, 'urgent world check', who.name);
    setTimeout(() => void runCheck(who, allow, { urgent: true, noAsk: true }), 1500);
    return true;
}

/**
 * @param {MailContact} contact
 * @param {{ dmail: boolean, leap: boolean }} allow
 * @param {{ urgent?: boolean, noAsk?: boolean }} [opts] urgent: weigh what just happened; noAsk: leap without asking
 * @returns {Promise<string>} what happened
 */
async function runCheck(contact, allow, opts = {}) {
    if (busy) {
        return 'Busy — something is already reaching into the past.';
    }
    busy = true;
    try {
        await waitForIdle();
        const plan = await considerActing(contact, allow, { urgent: opts.urgent });
        console.debug(LOG, 'world initiative', contact.name, plan);
        if (plan.act === 'dmail') {
            await characterDmail(contact, plan);
            return `${contact.name} sent a D-Mail`;
        }
        if (plan.act === 'leap') {
            const ok = await characterLeap(contact, { anchorIndex: plan.anchorIndex, why: plan.why, ask: !opts.noAsk });
            return ok ? `${contact.name} time-leapt` : `${contact.name} did not leap`;
        }
        return `${contact.name} has no reason to reach into the past`;
    } catch (err) {
        console.warn(LOG, 'world initiative failed', err);
        return 'The check failed';
    } finally {
        busy = false;
    }
}

/**
 * Run the "would they reach into the past?" check right now, skipping the cooldown and
 * message count. It is still their decision: usually the answer is no, and a leap still asks.
 * @param {MailContact | null} [contact] who to consider (default: whoever is speaking)
 * @returns {Promise<string>} what happened
 */
export async function checkNow(contact = null) {
    const s = getSettings();
    const who = contact || listActors().find((c) => c.isActive) || listActors()[0];
    if (!who) {
        return 'No character in this chat';
    }
    let allow = {
        dmail: s.worldInitiativeDmail !== false,
        leap: s.worldInitiativeLeap !== false && s.timeleapEnabled !== false,
    };
    if (!allow.dmail && !allow.leap) {
        // Both switched off for initiative: a check you ask for still considers both.
        allow = { dmail: true, leap: s.timeleapEnabled !== false };
    }
    toast(`Checking whether ${who.name} would reach into the past…`, 'info', 'PHONEWAVE');
    lastCheckAt = Date.now();
    messagesSince = 0;
    // You asked because something happened: weigh it as urgent, and with the urgent
    // setting on, a leap they choose happens without asking.
    const urgent = soundsUrgent(latestText());
    const result = await runCheck(who, allow, { urgent, noAsk: urgent && s.worldUrgentAct });
    toast(result, 'info', 'PHONEWAVE');
    return result;
}

// —— Asking you ——

/** @param {unknown} v */
function esc(v) {
    return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Stylized "they want to leap" prompt.
 * @param {{ name: string, from: string, to: string, hops?: number, why: string, arrival: string }} info
 * @returns {Promise<boolean>}
 */
export function askLeap(info) {
    return new Promise((resolve) => {
        document.getElementById('pp-wa-ask')?.remove();
        const dlg = document.createElement('dialog');
        dlg.id = 'pp-wa-ask';
        dlg.className = 'pp-sg-prompt pp-wa-ask';
        dlg.innerHTML = `
            <div class="pp-sg-panel pp-wa-frame">
                <span class="pp-sg-corner pp-sg-tl"></span><span class="pp-sg-corner pp-sg-tr"></span>
                <span class="pp-sg-corner pp-sg-bl"></span><span class="pp-sg-corner pp-sg-br"></span>
                <div class="pp-wa-head"><span class="pp-wa-blink">●</span> TIME LEAP · INCOMING</div>
                <div class="pp-wa-name">${esc(info.name)}</div>
                <div class="pp-wa-sub">wants to leap into their past self</div>
                <div class="pp-wa-clock">
                    <span>${esc(formatLeapTime(info.from))}</span>
                    <span class="pp-wa-arrow">⟶</span>
                    <span>${esc(formatLeapTime(info.to))}</span>
                </div>
                ${(info.hops || 1) > 1 ? `<div class="pp-wa-sub">too far for one leap · ${info.hops} leaps in a row</div>` : ''}
                ${info.why ? `<p class="pp-wa-why">“${esc(info.why)}”</p>` : ''}
                <p class="pp-wa-arrive"><span>ARRIVES AT</span> ${esc(info.arrival.slice(0, 140))}</p>
                <p class="pp-wa-note">The chat branches there. Only ${esc(info.name)} will remember what came after.</p>
                <div class="pp-wa-actions">
                    <button type="button" class="pp-wa-btn pp-wa-stop" data-wa="no">Stop them</button>
                    <button type="button" class="pp-wa-btn pp-wa-go" data-wa="yes">Let them leap</button>
                </div>
                <label class="pp-wa-quiet"><input type="checkbox" id="pp-wa-noask" /> Don't ask again</label>
            </div>
        `;
        document.body.appendChild(dlg);
        const done = (yes) => {
            const noAsk = /** @type {HTMLInputElement | null} */ (dlg.querySelector('#pp-wa-noask'))?.checked;
            if (noAsk && yes) {
                getSettings().charLeapAsk = false;
                saveSettings();
            }
            try {
                dlg.close();
            } catch {
                /* ignore */
            }
            dlg.remove();
            resolve(yes);
        };
        dlg.querySelector('[data-wa="yes"]')?.addEventListener('click', () => done(true));
        dlg.querySelector('[data-wa="no"]')?.addEventListener('click', () => done(false));
        dlg.addEventListener('cancel', (e) => {
            e.preventDefault();
            done(false);
        });
        try {
            dlg.showModal();
        } catch {
            dlg.setAttribute('open', '');
        }
    });
}
