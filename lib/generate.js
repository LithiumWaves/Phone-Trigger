import { DEFAULT_MAIL_REPLY_PROMPT, DEFAULT_MAIL_FORCE_PROMPT, DEFAULT_MAIL_INITIATIVE_PROMPT, DEFAULT_CALL_PROMPT } from './constants.js';
import { getSettings, getContext, toast } from './settings.js';
import { getPersonaName } from './store.js';

/**
 * Recent chat lines for optional mail-prompt story awareness.
 * @param {number} [limit]
 * @returns {string}
 */
export function buildChatSummary(limit) {
    const settings = getSettings();
    const max = Number.isFinite(limit) ? limit : Number(settings.chatSummaryMessages);
    const n = Number.isFinite(max) && max > 0 ? Math.min(Math.floor(max), 40) : 12;
    const ctx = getContext();
    const chat = Array.isArray(ctx.chat) ? ctx.chat : [];
    if (!chat.length) {
        return '';
    }

    const persona = getPersonaName();
    const slice = chat.slice(-n);
    const lines = [];
    for (const msg of slice) {
        if (!msg || msg.is_system) {
            continue;
        }
        const name = msg.name || (msg.is_user ? persona : 'Character');
        const text = String(msg.mes || '')
            .replace(/<email\b[^>]*>[\s\S]*?<\/email>/gi, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 220);
        if (!text) {
            continue;
        }
        lines.push(`${name}: ${text}`);
    }
    return lines.join('\n');
}

/**
 * @param {{ name?: string, description?: string, personality?: string, scenario?: string } | null} character
 * @param {string} charName
 */
function buildCharCard(character, charName) {
    const description = String(character?.description || '').trim();
    const personality = String(character?.personality || '').trim();
    const scenario = String(character?.scenario || '').trim();
    const cardParts = [];
    if (description) {
        cardParts.push(`Character description:\n${description}`);
    }
    if (personality) {
        cardParts.push(`Personality:\n${personality}`);
    }
    if (scenario) {
        cardParts.push(`Scenario:\n${scenario}`);
    }
    if (cardParts.length) {
        cardParts.push(`Stay in character as ${charName}.`);
    }
    return {
        description,
        personality,
        scenario,
        charCard: cardParts.join('\n\n'),
    };
}

function buildChatSummaryBlock() {
    const settings = getSettings();
    if (!settings.injectChatIntoMail) {
        return '';
    }
    const raw = buildChatSummary();
    if (!raw) {
        return '';
    }
    return [
        'Recent story / chat context (for awareness only — do not narrate this; write an e-mail):',
        raw,
    ].join('\n');
}

/**
 * @param {string} template
 * @param {Record<string, string>} vars
 * @param {{ appendChatSummary?: boolean, chatSummary?: string }} [opts]
 */
function applyTemplate(template, vars, opts = {}) {
    let prompt = template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
        const k = String(key || '').toLowerCase();
        return Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : '';
    });

    const chatSummary = opts.chatSummary || '';
    if (opts.appendChatSummary && chatSummary && !/\{\{\s*chat_summary\s*\}\}/i.test(template)) {
        if (!prompt.includes(chatSummary)) {
            prompt = `${prompt}\n\n${chatSummary}`;
        }
    }

    return prompt.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Extra format rules appended to every character-mail prompt (keywords, photos, tone),
 * plus context other features want mail to know about.
 * @param {{ name?: string, key?: string } | null} [character]
 */
export function mailExtrasBlock(character = null) {
    const s = getSettings();
    const lines = [];
    if (s.mailKeywords !== false) {
        lines.push('In the BODY, wrap 1–3 words or short phrases the reader might want to ask about in double brackets, like [[the van]] — hooks for a reply: a place, a person, an odd detail. Use each bracket pair once.');
    }
    if (s.charPhotos) {
        lines.push('Optionally (only when it fits — most mails have none), attach a photo by adding a line after the body: PHOTO: <what the photo shows, one sentence>.');
    }
    if (s.mailCloseness) {
        lines.push('End with one line: TONE: warm | neutral | cold — how the writer feels toward the reader in this mail.');
    }
    for (const fn of mailContextProviders) {
        try {
            const extra = fn(character);
            if (extra) {
                lines.push(extra);
            }
        } catch (err) {
            console.debug('[Phone Trigger] mail context provider failed', err);
        }
    }
    return lines.length ? `\n\n${lines.join('\n')}` : '';
}

/** @type {Array<(character: any) => string>} */
const mailContextProviders = [];

/** @type {Array<(contact: any, info: { callId?: string }) => Record<string, string>>} */
const callContextProviders = [];

/**
 * Let a feature add named context blocks to call prompts. Each block fills its
 * {{placeholder}} when the call template has one, and is appended otherwise.
 * @param {(contact: { name?: string, key?: string } | null, info: { callId?: string }) => Record<string, string>} fn
 */
export function addCallContextProvider(fn) {
    callContextProviders.push(fn);
}

/**
 * @param {{ name?: string, key?: string } | null} contact
 * @param {{ callId?: string }} info
 * @returns {Record<string, string>}
 */
function callContextVars(contact, info) {
    /** @type {Record<string, string>} */
    const out = {};
    for (const fn of callContextProviders) {
        try {
            for (const [k, v] of Object.entries(fn(contact, info) || {})) {
                const text = String(v || '').trim();
                if (text) {
                    out[k] = out[k] ? `${out[k]}\n\n${text}` : text;
                }
            }
        } catch (err) {
            console.debug('[Phone Trigger] call context provider failed', err);
        }
    }
    return out;
}

/**
 * Context blocks whose placeholder the template does not use (to append).
 * @param {string} template
 * @param {Record<string, string>} vars
 */
function unplacedBlocks(template, vars) {
    return Object.entries(vars)
        .filter(([k, v]) => v && !new RegExp(`\\{\\{\\s*${k}\\s*\\}\\}`, 'i').test(template))
        .map(([, v]) => v);
}

/**
 * Let a feature add a line of context to character-mail prompts.
 * @param {(character: { name?: string, key?: string } | null) => string} fn
 */
export function addMailContextProvider(fn) {
    mailContextProviders.push(fn);
}

/**
 * Build the mail-reply prompt from the editable template + contact card.
 * @param {{ subject: string, body: string, from: string, to: string }} outbound
 * @param {{ name?: string, description?: string, personality?: string, scenario?: string } | null} [character]
 * @returns {string}
 */
export function buildMailReplyPrompt(outbound, character = null) {
    const settings = getSettings();
    const template = String(settings.mailReplyPrompt || '').trim() || DEFAULT_MAIL_REPLY_PROMPT;
    const charName = character?.name || outbound.to || 'Character';
    const userName = outbound.from || getPersonaName();
    const { description, personality, scenario, charCard } = buildCharCard(character, charName);
    const chatSummary = buildChatSummaryBlock();

    return applyTemplate(template, {
        char: charName,
        char_name: charName,
        user: userName,
        persona: userName,
        subject: String(outbound.subject || ''),
        body: String(outbound.body || ''),
        from: String(outbound.from || userName),
        to: String(outbound.to || charName),
        guidance: '',
        description,
        personality,
        scenario,
        char_card: charCard,
        chat_summary: chatSummary,
    }, {
        appendChatSummary: Boolean(settings.injectChatIntoMail),
        chatSummary,
    }) + mailExtrasBlock(character);
}

/**
 * Build a guided unsolicited / forced inbound mail prompt.
 * @param {{ guidance?: string, subject?: string }} opts
 * @param {{ name?: string, description?: string, personality?: string, scenario?: string } | null} [character]
 * @returns {string}
 */
export function buildMailForcePrompt(opts = {}, character = null) {
    const settings = getSettings();
    const template = String(settings.mailForcePrompt || '').trim() || DEFAULT_MAIL_FORCE_PROMPT;
    const charName = character?.name || 'Character';
    const userName = getPersonaName();
    const guidance = String(opts.guidance || '').trim() || '(No special guidance — write a natural check-in e-mail that fits the current situation.)';
    const subject = String(opts.subject || '').trim();
    const { description, personality, scenario, charCard } = buildCharCard(character, charName);
    const chatSummary = buildChatSummaryBlock();

    let prompt = applyTemplate(template, {
        char: charName,
        char_name: charName,
        user: userName,
        persona: userName,
        subject: subject || '(choose a fitting subject)',
        body: '',
        from: charName,
        to: userName,
        guidance,
        description,
        personality,
        scenario,
        char_card: charCard,
        chat_summary: chatSummary,
    }, {
        appendChatSummary: Boolean(settings.injectChatIntoMail),
        chatSummary,
    });

    // If the custom template omitted {{guidance}}, append steering so it still applies.
    if (String(opts.guidance || '').trim() && !/\{\{\s*guidance\s*\}\}/i.test(template)) {
        const block = `Author guidance (follow this intent; stay in character; do not quote the guidance):\n${guidance}`;
        if (!prompt.includes(guidance)) {
            prompt = `${prompt}\n\n${block}`;
        }
    }

    return (prompt.replace(/\n{3,}/g, '\n\n').trim() + mailExtrasBlock(character));
}

/**
 * Build character-initiative inbound mail prompt.
 * Uses mailInitiativePrompt, or reuses the forced-mail template when configured.
 * @param {{ guidance?: string, subject?: string }} opts
 * @param {{ name?: string, description?: string, personality?: string, scenario?: string } | null} [character]
 * @returns {string}
 */
export function buildMailInitiativePrompt(opts = {}, character = null) {
    const settings = getSettings();
    if (settings.mailInitiativeUseForcePrompt) {
        return buildMailForcePrompt(opts, character);
    }

    const template = String(settings.mailInitiativePrompt || '').trim() || DEFAULT_MAIL_INITIATIVE_PROMPT;
    const charName = character?.name || 'Character';
    const userName = getPersonaName();
    const guidance = String(opts.guidance || '').trim()
        || '(No special guidance — spontaneously check in about something that fits the current situation.)';
    const subject = String(opts.subject || '').trim();
    const { description, personality, scenario, charCard } = buildCharCard(character, charName);
    const chatSummary = buildChatSummaryBlock();

    let prompt = applyTemplate(template, {
        char: charName,
        char_name: charName,
        user: userName,
        persona: userName,
        subject: subject || '(choose a fitting subject)',
        body: '',
        from: charName,
        to: userName,
        guidance,
        description,
        personality,
        scenario,
        char_card: charCard,
        chat_summary: chatSummary,
    }, {
        appendChatSummary: Boolean(settings.injectChatIntoMail),
        chatSummary,
    });

    if (String(opts.guidance || '').trim() && !/\{\{\s*guidance\s*\}\}/i.test(template)) {
        const block = `Optional mood / topic hint (follow if present; stay in character; do not quote it):\n${guidance}`;
        if (!prompt.includes(guidance)) {
            prompt = `${prompt}\n\n${block}`;
        }
    }

    return (prompt.replace(/\n{3,}/g, '\n\n').trim() + mailExtrasBlock(character));
}

/**
 * Build a live phone-call reply prompt (handset UI turns).
 * @param {{
 *   turns: Array<{ role: string, text: string }>,
 *   contact: { name?: string, description?: string, personality?: string, scenario?: string } | null,
 *   lastUser?: string,
 *   opener?: 'answer' | 'caller' | 'followup' | null,
 *   reason?: string,
 * }} opts
 * @returns {string}
 */
export function buildCallPrompt(opts = {}) {
    const settings = getSettings();
    const template = String(settings.callPrompt || '').trim() || DEFAULT_CALL_PROMPT;
    const contact = opts.contact || {};
    const charName = contact.name || 'Character';
    const userName = getPersonaName();
    const guidance = String(settings.callGuidance || '').trim()
        || '(No special guidance — stay in character on the call.)';
    const { description, personality, scenario, charCard } = buildCharCard(contact, charName);
    const ctxVars = callContextVars(contact, { callId: opts.callId });
    const ctxExtra = unplacedBlocks(template, ctxVars);
    let chatSummary = '';
    if (settings.injectChatIntoMail) {
        const raw = buildChatSummary();
        if (raw) {
            chatSummary = [
                'Recent story / chat context (for awareness only — do not narrate this; speak on the phone):',
                raw,
            ].join('\n');
        }
    }

    let maxTurns = Number(settings.callContextTurns);
    if (!Number.isFinite(maxTurns) || maxTurns < 2) {
        maxTurns = 16;
    }
    maxTurns = Math.min(40, Math.floor(maxTurns));

    const spoken = (opts.turns || []).filter((t) => t.role === 'user' || t.role === 'char');
    const slice = spoken.slice(-maxTurns);
    const transcript = slice.length
        ? slice.map((t) => {
            const who = t.role === 'user' ? userName : charName;
            return `${who}: ${String(t.text || '').trim()}`;
        }).join('\n')
        : '(Call just connected — no lines yet.)';

    const lastUser = String(opts.lastUser || '').trim()
        || [...spoken].reverse().find((t) => t.role === 'user')?.text
        || '(silence)';
    const cue = buildCallCue({ ...opts, charName, userName, lastUser, spoken });

    return applyTemplate(template, {
        char: charName,
        char_name: charName,
        user: userName,
        persona: userName,
        subject: '',
        body: '',
        from: charName,
        to: userName,
        guidance,
        transcript,
        last_user: opts.opener ? cue : lastUser,
        cue,
        description,
        personality,
        scenario,
        char_card: charCard,
        chat_summary: chatSummary,
        mail_context: ctxVars.mail_context || '',
        call_memory: ctxVars.call_memory || '',
    }, {
        appendChatSummary: Boolean(settings.injectChatIntoMail),
        chatSummary,
    }).replace(/\n{3,}/g, '\n\n').trim()
        + (ctxExtra.length ? `\n\n${ctxExtra.join('\n\n')}` : '')
        + '\n\n' + callHangupHint(charName);
}

/**
 * What {{char}} should respond to: the caller's latest line, or the opening of the call.
 * @param {{ opener?: string | null, reason?: string, charName: string, userName: string, lastUser: string, spoken: Array<{ role: string }> }} o
 */
function buildCallCue(o) {
    if (o.opener === 'answer') {
        return `${o.userName} just called ${o.charName}, and ${o.charName} has picked up. ${o.charName} speaks first — answer the phone the way ${o.charName} would.`;
    }
    if (o.opener === 'caller') {
        const reason = String(o.reason || '').trim();
        return [
            `${o.charName} called ${o.userName}, and ${o.userName} just picked up. ${o.charName} speaks first and gets to why they called.`,
            reason ? `Why ${o.charName} is calling (do not quote this): ${reason}` : `Pick a reason that fits the story so far.`,
        ].join('\n');
    }
    if (o.opener === 'followup') {
        return `While ${o.charName} was speaking, ${o.userName} also said:\n${o.reason}`;
    }
    const last = o.spoken[o.spoken.length - 1];
    if (last && last.role === 'char') {
        return `${o.userName} has gone quiet on the line. ${o.charName} continues.`;
    }
    return `${o.userName} just said:\n${o.lastUser}`;
}

/** @param {string} charName */
function callHangupHint(charName) {
    return `If ${charName} ends the call, finish the line with [hangs up].`;
}

/**
 * Generate a spoken call reply using the configured mode.
 * @param {string} uniquePrompt Full call-template prompt
 * @param {{
 *   contact?: { name?: string, characterIndex?: number } | null,
 *   lastUser?: string,
 *   shortMainPrompt?: string,
 *   turns?: Array<{ role: string, text: string }>,
 *   opener?: 'answer' | 'caller' | 'followup' | null,
 *   reason?: string,
 * }} [opts]
 * @returns {Promise<string>}
 */
export async function generateCallText(uniquePrompt, opts = {}) {
    const settings = getSettings();
    const mode = ['unique', 'main', 'both'].includes(settings.callGenerationMode)
        ? settings.callGenerationMode
        : 'unique';

    if (mode === 'unique') {
        return generateMailText(uniquePrompt);
    }

    const quietPrompt = mode === 'both'
        ? uniquePrompt
        : (opts.shortMainPrompt || buildShortCallQuietPrompt(opts));

    const viaChat = await generateViaChatQuiet(quietPrompt, opts.contact);
    if (viaChat && String(viaChat).trim()) {
        return String(viaChat);
    }

    // Fallback if quiet generation unavailable
    console.warn('[Phone Trigger] chat quiet generation empty; falling back to unique call prompt');
    return generateMailText(uniquePrompt);
}

/**
 * Main-preset prompt: the chat's own context plus the call so far.
 * @param {{
 *   contact?: { name?: string } | null,
 *   lastUser?: string,
 *   turns?: Array<{ role: string, text: string }>,
 *   opener?: 'answer' | 'caller' | 'followup' | null,
 *   reason?: string,
 * }} opts
 */
function buildShortCallQuietPrompt(opts = {}) {
    const charName = opts.contact?.name || 'Character';
    const userName = getPersonaName();
    const last = String(opts.lastUser || '').trim() || '(silence on the line)';
    const spoken = (opts.turns || []).filter((t) => t.role === 'user' || t.role === 'char').slice(-16);
    const transcript = spoken
        .map((t) => `${t.role === 'user' ? userName : charName}: ${String(t.text || '').trim()}`)
        .join('\n');
    const cue = buildCallCue({ opener: opts.opener, reason: opts.reason, charName, userName, lastUser: last, spoken });
    opts = { ...opts, transcript, cue };
    const ctxBlocks = Object.values(callContextVars(opts.contact || null, { callId: opts.callId }));
    return [
        `You are ${charName} on a live phone call with ${userName}.`,
        'Reply with ONLY what you say aloud on the phone — no narration, no asterisks, no quotes around the whole line.',
        'Keep it to 1–4 short spoken sentences.',
        '',
        ...ctxBlocks.flatMap((b) => [b, '']),
        'Call so far:',
        opts.transcript || '(Call just connected — no lines yet.)',
        '',
        opts.cue || `${userName} just said:\n${last}`,
        '',
        callHangupHint(charName),
        `Speak now as ${charName}:`,
    ].join('\n');
}

/**
 * Use SillyTavern chat completion presets / context via generateQuietPrompt.
 * @param {string} quietPrompt
 * @param {{ name?: string, characterIndex?: number } | null} [contact]
 * @returns {Promise<string>}
 */
async function generateViaChatQuiet(quietPrompt, contact = null) {
    const ctx = getContext();
    const prompt = String(quietPrompt || '').trim();
    if (!prompt) {
        return '';
    }

    const forceChId = Number.isFinite(Number(contact?.characterIndex))
        ? Number(contact.characterIndex)
        : null;

    if (typeof ctx.generateQuietPrompt === 'function') {
        try {
            // Modern object form
            const result = await ctx.generateQuietPrompt({
                quietPrompt: prompt,
                quietToLoud: false,
                forceChId,
            });
            if (result != null && String(result).trim()) {
                return String(result);
            }
        } catch (err) {
            console.debug('[Phone Trigger] generateQuietPrompt(object) failed, trying positional', err);
        }
        try {
            // Legacy positional: (quietPrompt, quietToLoud, skipWIAN, ...)
            const result = await ctx.generateQuietPrompt(prompt, false, false);
            if (result != null && String(result).trim()) {
                return String(result);
            }
        } catch (err) {
            console.debug('[Phone Trigger] generateQuietPrompt(positional) failed', err);
        }
    }

    return '';
}

/**
 * Generate a mail reply without using the main chat pipeline / active character.
 * @param {string} prompt
 * @returns {Promise<string>}
 */
export async function generateMailText(prompt) {
    const settings = getSettings();
    if (settings.mailBackend === 'openrouter') {
        return generateViaOpenRouter(prompt);
    }
    return generateViaMainApi(prompt);
}

/**
 * Main SillyTavern API — raw completion only (no quiet/chat character binding).
 * Retries once when the generation queue reports busy (common during force-initiative).
 * @param {string} prompt
 */
async function generateViaMainApi(prompt) {
    const ctx = getContext();
    if (typeof ctx.generateRaw !== 'function') {
        throw new Error('Main API generateRaw unavailable');
    }

    const tryOnce = async () => {
        try {
            const result = await ctx.generateRaw({ prompt, quietToLoud: false });
            if (result != null && String(result).trim()) {
                return String(result);
            }
        } catch (err) {
            console.debug('[Phone Trigger] generateRaw(object) failed, trying positional', err);
            const msg = String(err?.message || err || '');
            if (/busy|queue/i.test(msg)) {
                throw err;
            }
        }
        const result = await ctx.generateRaw(prompt);
        return String(result || '');
    };

    try {
        return await tryOnce();
    } catch (err) {
        const msg = String(err?.message || err || '');
        if (!/busy|queue/i.test(msg)) {
            throw err;
        }
        // Wait briefly for the chat generation lock to clear, then retry once.
        await new Promise((r) => setTimeout(r, 1200));
        try {
            return await tryOnce();
        } catch (err2) {
            const msg2 = String(err2?.message || err2 || '');
            if (/busy|queue/i.test(msg2) && typeof ctx.generateQuietPrompt === 'function') {
                // Last resort: quiet channel (may still bind character — better than failing force).
                try {
                    const quiet = await ctx.generateQuietPrompt(prompt, false, false);
                    if (quiet && String(quiet).trim()) {
                        return String(quiet).trim();
                    }
                } catch (err3) {
                    console.debug('[Phone Trigger] quiet fallback after busy failed', err3);
                }
            }
            throw err2;
        }
    }
}

/**
 * OpenRouter chat completions — fully independent of SillyTavern chat.
 * @param {string} prompt
 */
async function generateViaOpenRouter(prompt) {
    const settings = getSettings();
    const apiKey = String(settings.openRouterApiKey || '').trim();
    const model = String(settings.openRouterModel || '').trim() || 'openai/gpt-4o-mini';

    if (!apiKey) {
        toast('OpenRouter API key missing', 'error');
        throw new Error('OpenRouter API key missing');
    }

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': typeof location !== 'undefined' ? location.origin : 'https://github.com/LithiumWaves/Phone-Trigger',
            'X-Title': 'Phone Trigger',
        },
        body: JSON.stringify({
            model,
            temperature: 0.8,
            messages: [
                {
                    role: 'system',
                    content: 'You write short in-character e-mail replies. Output only the e-mail in the requested format.',
                },
                { role: 'user', content: prompt },
            ],
        }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const msg = data?.error?.message || data?.message || `HTTP ${res.status}`;
        throw new Error(`OpenRouter: ${msg}`);
    }

    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
        throw new Error('OpenRouter returned an empty response');
    }
    return String(content);
}
