/**
 * Story clock — the chat's own date and time, and a log of what happened when.
 *
 * Flow modes (setting `storyClockFlow`):
 * - manual   — the clock only moves when you set it, pass time, sleep, or leap.
 * - realtime — X real minutes = 1 story hour, ticking only while this chat is open.
 * - messages — X chat messages = 1 story hour.
 *
 * The story log records mail, calls, D-Mails, leaps, sleeps and time skips with their story
 * time, so other features can measure story hours (ignored mail, the worldline map…).
 *
 * State lives in chat metadata: storyClock ("YYYY-MM-DDTHH:MM"), storyCarryMs,
 * storyLog[].
 */
import { getSettings, getContext, toast } from './settings.js';
import { getMailStore } from './store.js';
import { esc, setPrompt, saveMeta, emit, bindToggle, bindNumber, bindValue } from './ui.js';

export const STORY_CLOCK_PROMPT_KEY = 'phone_trigger_clock';
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const LOG_MAX = 500;
const HOUR_MS = 3600000;

/**
 * @typedef {{ t: string, type: string, text: string, ref?: string, at: number }} StoryLogEntry
 */

/** @param {number} n */
function pad2(n) {
    return String(n).padStart(2, '0');
}

/**
 * `<input type="datetime-local">` value for a Date (local time, minute precision).
 * @param {Date} d
 */
export function toLocalInput(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/**
 * @param {string} value datetime-local string
 * @returns {Date | null}
 */
export function fromLocalInput(value) {
    const m = /^(\d{4,})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(value || '').trim());
    if (!m) {
        return null;
    }
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
    return Number.isNaN(d.getTime()) ? null : d;
}

function meta() {
    const m = getMailStore();
    if (!Array.isArray(m.storyLog)) {
        m.storyLog = [];
    }
    return m;
}

/** True when this chat keeps its own time (a flow mode is on, or a time has been set). */
export function isStoryClockActive() {
    const s = getSettings();
    if (s.storyClockFlow && s.storyClockFlow !== 'manual') {
        return true;
    }
    try {
        return Boolean(fromLocalInput(String(getMailStore().storyClock || '')));
    } catch {
        return false;
    }
}

/** Story "now" for this chat (last leap's arrival, what you set, or real time). */
export function getStoryClock() {
    try {
        const v = String(getMailStore().storyClock || '');
        return fromLocalInput(v) ? v : toLocalInput(new Date());
    } catch {
        return toLocalInput(new Date());
    }
}

/** Story now as a Date. */
export function getStoryDate() {
    return fromLocalInput(getStoryClock()) || new Date();
}

/** Story now in epoch ms (for story-hour durations). */
export function storyNowMs() {
    return getStoryDate().getTime() + (Number(meta().storyCarryMs) || 0);
}

/** Story time to stamp on new records, or undefined while the chat has no clock. */
export function storyStamp() {
    return isStoryClockActive() ? getStoryClock() : undefined;
}

/**
 * Set the story clock directly.
 * @param {string} value datetime-local
 * @param {{ log?: boolean }} [opts]
 */
export async function setStoryClock(value, opts = {}) {
    const next = fromLocalInput(value);
    if (!next) {
        return;
    }
    const m = meta();
    m.storyClock = toLocalInput(next);
    m.storyCarryMs = 0;
    if (opts.log) {
        logStory('clock', `Clock set to ${formatStoryTime(m.storyClock)}`);
    }
    await saveMeta();
    afterClockChange();
}

/**
 * Move the story clock forward.
 * @param {number} minutes
 * @param {{ log?: string | false, type?: string, quiet?: boolean }} [opts]
 */
export async function passStoryTime(minutes, opts = {}) {
    const mins = Number(minutes);
    if (!Number.isFinite(mins) || mins <= 0) {
        return;
    }
    const m = meta();
    const prev = getStoryDate();
    const next = new Date(prev.getTime() + mins * 60000);
    m.storyClock = toLocalInput(next);
    if (opts.log !== false) {
        logStory(opts.type || 'pass', typeof opts.log === 'string' ? opts.log : `${formatDuration(mins)} passed`);
    }
    await saveMeta();
    afterClockChange();
}

/** Sleep until the next wake hour. */
export async function sleepUntilMorning() {
    const wake = Math.max(0, Math.min(23, Math.floor(Number(getSettings().storyClockWakeHour) || 7)));
    const now = getStoryDate();
    const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), wake, 0);
    if (target.getTime() <= now.getTime() + 60000) {
        target.setDate(target.getDate() + 1);
    }
    const mins = Math.round((target.getTime() - now.getTime()) / 60000);
    await passStoryTime(mins, { type: 'sleep', log: `Slept until ${pad2(wake)}:00` });
    toast(formatStoryTime(getStoryClock()), 'info', 'MORNING');
}

/**
 * Add an entry to the story log.
 * @param {string} type mail-in | mail-out | call | call-missed | call-declined | dmail | cancel | leap | sleep | pass | clock | fakecall …
 * @param {string} text
 * @param {string} [ref]
 */
export function logStory(type, text, ref) {
    try {
        const m = meta();
        m.storyLog.push({
            t: getStoryClock(),
            type: String(type),
            text: String(text || '').slice(0, 240),
            ref: ref ? String(ref) : undefined,
            at: Date.now(),
        });
        if (m.storyLog.length > LOG_MAX) {
            m.storyLog.splice(0, m.storyLog.length - LOG_MAX);
        }
        emit('story-log', { type });
    } catch (err) {
        console.debug('[Phone Trigger] story log failed', err);
    }
}

/** @returns {StoryLogEntry[]} */
export function getStoryLog() {
    return [...meta().storyLog];
}

/**
 * Drop story log entries after a story time (time leaps land before them).
 * @param {Record<string, any>} metaObj chat metadata object being carried to a branch
 * @param {string} toTime
 */
export function pruneStoryLogAfter(metaObj, toTime) {
    if (!metaObj || !Array.isArray(metaObj.storyLog) || !fromLocalInput(toTime)) {
        return;
    }
    metaObj.storyLog = metaObj.storyLog.filter((e) => !e?.t || String(e.t) <= toTime);
}

// —— Formatting ——

/** "WED 8/13 19:56" */
export function formatStoryTime(value) {
    const d = value instanceof Date ? value : fromLocalInput(value);
    if (!d) {
        return '--/-- --:--';
    }
    return `${WEEKDAYS[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** "8/13" */
export function formatStoryMD(value) {
    const d = value instanceof Date ? value : fromLocalInput(value);
    return d ? `${d.getMonth() + 1}/${d.getDate()}` : '--/--';
}

/** "19:56" */
export function formatStoryHM(value) {
    const d = value instanceof Date ? value : fromLocalInput(value);
    return d ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}` : '--:--';
}

/** @param {number} mins */
export function formatDuration(mins) {
    const m = Math.round(mins);
    if (m < 60) {
        return `${m} min`;
    }
    const h = Math.floor(m / 60);
    const r = m % 60;
    if (h < 48) {
        return r ? `${h} h ${r} min` : `${h} h`;
    }
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return rh ? `${d} d ${rh} h` : `${d} d`;
}

/**
 * Hours of story time since a stamp ("YYYY-MM-DDTHH:MM"), or NaN.
 * @param {string | undefined} stamp
 */
export function storyHoursSince(stamp) {
    const d = fromLocalInput(String(stamp || ''));
    if (!d) {
        return NaN;
    }
    return (storyNowMs() - d.getTime()) / HOUR_MS;
}

// —— Chat messages ——

let saveChatTimer = null;

function saveChatSoon() {
    clearTimeout(saveChatTimer);
    saveChatTimer = setTimeout(() => {
        const ctx = getContext();
        try {
            (ctx.saveChatDebounced || ctx.saveChat)?.();
        } catch (err) {
            console.debug('[Phone Trigger] saveChat failed', err);
        }
    }, 400);
}

/**
 * Give a chat message its story time (once: swipes and edits keep it).
 * @param {number} [index] default: the latest message
 */
export function stampMessage(index) {
    const s = getSettings();
    if (s.storyClockOnMessages === false || !isStoryClockActive()) {
        return;
    }
    const chat = Array.isArray(getContext().chat) ? getContext().chat : [];
    const i = Number.isInteger(Number(index)) && Number(index) >= 0 ? Number(index) : chat.length - 1;
    const msg = chat[i];
    if (!msg || msg.is_system) {
        return;
    }
    msg.extra = msg.extra && typeof msg.extra === 'object' ? msg.extra : {};
    if (msg.extra.pt_story?.t) {
        return;
    }
    msg.extra.pt_story = { t: getStoryClock() };
    saveChatSoon();
    renderMessageStamps();
}

/** "FRI 8/13 19:56" @param {{ t: string }} st */
function messageStampText(st) {
    return formatStoryTime(st.t);
}

/**
 * Show each message's story time beside SillyTavern's own timestamp.
 * @param {ParentNode} [root]
 */
export function renderMessageStamps(root = document) {
    const s = getSettings();
    document.body.classList.toggle('pt-no-msg-stamps', s.storyClockOnMessages === false);
    if (s.storyClockOnMessages === false) {
        return;
    }
    const chat = Array.isArray(getContext().chat) ? getContext().chat : [];
    root.querySelectorAll('#chat .mes[mesid]').forEach((el) => {
        const msg = chat[Number(el.getAttribute('mesid'))];
        const st = msg?.extra?.pt_story;
        let tag = /** @type {HTMLElement | null} */ (el.querySelector('.pt-story-stamp'));
        if (!st?.t || !fromLocalInput(st.t)) {
            tag?.remove();
            return;
        }
        const text = messageStampText(st);
        if (!tag) {
            tag = document.createElement('small');
            tag.className = 'pt-story-stamp';
            tag.title = 'Story time';
            const real = el.querySelector('.timestamp');
            if (real) {
                real.insertAdjacentElement('afterend', tag);
            } else {
                (el.querySelector('.ch_name') || el).appendChild(tag);
            }
        }
        if (tag.textContent !== text) {
            tag.textContent = text;
        }
    });
}

/** After a re-date: save message stamps and redraw them. */
export function afterMessageStampsChanged() {
    saveChatSoon();
    renderMessageStamps();
}

// —— Flow ——

let realTimer = null;
let lastRealTick = 0;
let lastPersist = 0;
let unsavedMinutes = false;

/** Real-time flow: called every few seconds while the chat is open. */
function realTick() {
    const s = getSettings();
    const now = Date.now();
    const elapsed = Math.min(60000, Math.max(0, now - (lastRealTick || now)));
    lastRealTick = now;
    if (s.storyClockFlow !== 'realtime' || document.hidden || !getContext().chatId && !getContext().getCurrentChatId?.()) {
        return;
    }
    const realMinutesPerHour = Math.max(0.1, Number(s.storyClockRealMinutes) || 10);
    const storyMs = elapsed * (60 / realMinutesPerHour);
    const m = meta();
    let carry = (Number(m.storyCarryMs) || 0) + storyMs;
    if (carry >= 60000) {
        const mins = Math.floor(carry / 60000);
        carry -= mins * 60000;
        const prev = getStoryDate();
        const next = new Date(prev.getTime() + mins * 60000);
        m.storyClock = toLocalInput(next);
        unsavedMinutes = true;
        afterClockChange();
    }
    m.storyCarryMs = carry;
    if (unsavedMinutes && now - lastPersist > 60000) {
        lastPersist = now;
        unsavedMinutes = false;
        void saveMeta();
    }
}

/** Messages flow: each message moves the clock 60/X minutes. */
export function noteStoryMessage() {
    const s = getSettings();
    if (s.storyClockFlow !== 'messages') {
        return;
    }
    const perHour = Math.max(1, Number(s.storyClockMessages) || 4);
    const m = meta();
    const carry = (Number(m.storyCarryMs) || 0) + HOUR_MS / perHour;
    const mins = Math.floor(carry / 60000);
    m.storyCarryMs = carry - mins * 60000;
    if (mins > 0) {
        void passStoryTime(mins, { log: false });
    } else {
        void saveMeta();
    }
}

/** Start/stop the real-time ticker to match settings. */
export function syncStoryClockFlow() {
    const flow = getSettings().storyClockFlow;
    if (flow === 'realtime' && !realTimer) {
        lastRealTick = Date.now();
        realTimer = setInterval(realTick, 5000);
    } else if (flow !== 'realtime' && realTimer) {
        clearInterval(realTimer);
        realTimer = null;
    }
}

/** On chat change: reset the tick baseline so another chat's open time doesn't count. */
export function onStoryChatChanged() {
    lastRealTick = Date.now();
    unsavedMinutes = false;
    updateStoryClockPrompt();
    renderMenuClockPanel();
}

function afterClockChange() {
    updateStoryClockPrompt();
    emit('story-clock');
}

// —— Prompt ——

export function updateStoryClockPrompt() {
    const s = getSettings();
    if (!s.storyClockInject || !isStoryClockActive()) {
        setPrompt(STORY_CLOCK_PROMPT_KEY, '');
        return;
    }
    const d = getStoryDate();
    const long = d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    setPrompt(
        STORY_CLOCK_PROMPT_KEY,
        `[Story time: ${long}, ${d.getFullYear()}, ${formatStoryHM(d)}. Keep the scene consistent with this time of day.]`,
        Number(s.storyClockInjectDepth ?? 1),
    );
}

// —— Shared controls (phone Clock screen + menu Clock panel) ——

/**
 * Clock controls inside a container. Re-renders itself after each change.
 * @param {HTMLElement} host
 * @param {{ compact?: boolean }} [opts]
 */
export function renderClockControls(host, opts = {}) {
    if (!host) {
        return;
    }
    const s = getSettings();
    const d = getStoryDate();
    const flowLabel = s.storyClockFlow === 'realtime'
        ? `${s.storyClockRealMinutes ?? 10} real min = 1 h`
        : s.storyClockFlow === 'messages'
            ? `${s.storyClockMessages ?? 4} messages = 1 h`
            : 'Manual';
    const log = getStoryLog().slice(-6).reverse();
    host.innerHTML = `
        <div class="pp-sclock ${opts.compact ? 'pp-sclock-compact' : ''}">
            <div class="pp-sclock-face" aria-live="polite">
                <div class="pp-sclock-time">${esc(formatStoryHM(d))}</div>
                <div class="pp-sclock-date">${esc(WEEKDAYS[d.getDay()])} ${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}</div>
                <div class="pp-sclock-flow">${esc(flowLabel)}${isStoryClockActive() ? '' : ' · not set (real time)'}</div>
            </div>
            <div class="pp-sclock-row">
                <button type="button" class="pp-btn pp-sclock-btn" data-pass="15">+15m</button>
                <button type="button" class="pp-btn pp-sclock-btn" data-pass="60">+1h</button>
                <button type="button" class="pp-btn pp-sclock-btn" data-pass="180">+3h</button>
                <button type="button" class="pp-btn pp-sclock-btn" data-pass="custom">+…</button>
            </div>
            <button type="button" class="pp-btn pp-sclock-sleep" data-sleep>☾ Sleep until ${pad2(Math.floor(Number(s.storyClockWakeHour) || 7))}:00</button>
            <div class="pp-sclock-set">
                <label class="pp-label">Date &amp; time</label>
                <input type="datetime-local" class="text_pole pp-input" data-set-time value="${esc(toLocalInput(d))}">
                <button type="button" class="pp-btn" data-apply>Set</button>
            </div>
            ${log.length ? `
            <div class="pp-sclock-log">
                <div class="pp-label">Story log</div>
                ${log.map((e) => `<div class="pp-sclock-log-row"><span>${esc(formatStoryMD(e.t))} ${esc(formatStoryHM(e.t))}</span><span>${esc(e.text)}</span></div>`).join('')}
            </div>` : ''}
            <button type="button" class="pp-sclock-redate" data-redate title="Put this chat's mail, calls, leaps and log on the story calendar">Re-date history…</button>
        </div>
    `;
    const rerender = () => renderClockControls(host, opts);
    host.querySelectorAll('[data-pass]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            let mins = Number(btn.getAttribute('data-pass'));
            if (!Number.isFinite(mins)) {
                const raw = prompt('Pass how much time? (e.g. 45m, 2h, 1d)', '30m');
                mins = parseDurationMinutes(raw);
                if (!mins) {
                    return;
                }
            }
            await ensureClockStarted();
            await passStoryTime(mins);
            rerender();
        });
    });
    host.querySelector('[data-sleep]')?.addEventListener('click', async () => {
        await ensureClockStarted();
        await sleepUntilMorning();
        rerender();
    });
    host.querySelector('[data-redate]')?.addEventListener('click', () => void openRedate());
    host.querySelector('[data-apply]')?.addEventListener('click', async () => {
        const t = /** @type {HTMLInputElement} */ (host.querySelector('[data-set-time]')).value;
        if (!fromLocalInput(t)) {
            toast('Pick a date and time', 'warning');
            return;
        }
        await setStoryClock(t, { log: true });
        rerender();
    });
}

/** The re-date editor (loaded on demand; it imports this module). */
async function openRedate() {
    const { openHistoryEditor } = await import('./storyHistory.js');
    openHistoryEditor();
}

/** First use in a chat: pin the clock to now so passing time has a base. */
async function ensureClockStarted() {
    const m = meta();
    if (!fromLocalInput(String(m.storyClock || ''))) {
        m.storyClock = toLocalInput(new Date());
    }
}

/** "45m" / "2h" / "1d 3h" / "90" (minutes) → minutes. */
export function parseDurationMinutes(raw) {
    const s = String(raw || '').trim().toLowerCase();
    if (!s) {
        return 0;
    }
    if (/^\d+(\.\d+)?$/.test(s)) {
        return Math.round(Number(s));
    }
    let total = 0;
    for (const m of s.matchAll(/(\d+(?:\.\d+)?)\s*(d|h|m)/g)) {
        const n = Number(m[1]);
        total += m[2] === 'd' ? n * 1440 : m[2] === 'h' ? n * 60 : n;
    }
    return Math.round(total);
}

function renderMenuClockPanel() {
    const host = document.getElementById('pp_clock_panel');
    if (host) {
        renderClockControls(host);
    }
}

/** Bind the menu's Clock category. Called once after settings.html is mounted. */
export function initStoryClockUi() {
    const onFlow = () => {
        syncStoryClockFlow();
        updateStoryClockPrompt();
        renderMenuClockPanel();
        syncFlowFields();
    };
    bindValue('#pp_clock_flow', 'storyClockFlow', onFlow, ['manual', 'realtime', 'messages']);
    bindNumber('#pp_clock_real_min', 'storyClockRealMinutes', { min: 0.1, max: 1440, fallback: 10, int: false }, onFlow);
    bindNumber('#pp_clock_msgs', 'storyClockMessages', { min: 1, max: 500, fallback: 4 }, onFlow);
    bindNumber('#pp_clock_wake', 'storyClockWakeHour', { min: 0, max: 23, fallback: 7 }, renderMenuClockPanel);
    bindToggle('#pp_clock_inject', 'storyClockInject', updateStoryClockPrompt);
    bindNumber('#pp_clock_depth', 'storyClockInjectDepth', { min: 0, max: 99, fallback: 1 }, updateStoryClockPrompt);
    bindToggle('#pp_clock_phone', 'storyClockOnPhone', () => emit('story-clock'));
    bindToggle('#pp_clock_messages_stamp', 'storyClockOnMessages', () => renderMessageStamps());
    syncFlowFields();
    renderMenuClockPanel();
    document.addEventListener('pt:story-clock', () => {
        const host = document.getElementById('pp_clock_panel');
        if (host && host.offsetParent !== null && !host.contains(document.activeElement)) {
            renderClockControls(host);
        }
    });
    document.addEventListener('pt:menu-category', (e) => {
        if (/** @type {CustomEvent} */ (e).detail?.cat === 'clock') {
            renderMenuClockPanel();
        }
    });
}

function syncFlowFields() {
    const flow = getSettings().storyClockFlow;
    document.querySelectorAll('.pp-clock-real').forEach((el) => { /** @type {HTMLElement} */ (el).hidden = flow !== 'realtime'; });
    document.querySelectorAll('.pp-clock-msg').forEach((el) => { /** @type {HTMLElement} */ (el).hidden = flow !== 'messages'; });
}

/**
 * `/storytime` handler: no args → report; `set <datetime>`, `pass <dur>`, `sleep`,
 * `history` (re-date this chat's history).
 * @param {string} text
 */
export async function storyTimeCommand(text) {
    const [cmd, ...rest] = String(text || '').trim().split(/\s+/);
    const arg = rest.join(' ');
    switch ((cmd || '').toLowerCase()) {
        case 'pass': {
            const mins = parseDurationMinutes(arg || '1h');
            await ensureClockStarted();
            await passStoryTime(mins);
            break;
        }
        case 'sleep':
            await ensureClockStarted();
            await sleepUntilMorning();
            break;
        case 'set': {
            const v = arg.replace(' ', 'T');
            if (!fromLocalInput(v)) {
                toast('Use /storytime set YYYY-MM-DD HH:MM', 'warning');
                return '';
            }
            await setStoryClock(v, { log: true });
            break;
        }
        case 'history':
        case 'redate':
            await openRedate();
            break;
        default:
            break;
    }
    return formatStoryTime(getStoryClock());
}

