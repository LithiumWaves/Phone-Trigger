/**
 * Fake call — you talk into a phone with nobody on the line (the Organization is always
 * listening). Afterwards the people around you hear about it: as a hidden note for the next
 * reply, or as a visible narrator line.
 */
import { getSettings, toast } from './settings.js';
import { registerPhoneApp } from './phone.js';
import { logStory } from './storyClock.js';
import { esc, setPrompt, runSlashCommand, personaName, bindToggle, bindValue } from './ui.js';

export const FAKE_CALL_PROMPT_KEY = 'phone_trigger_fakecall';

/** @type {{ to: string, lines: string[], startedAt: number, state: 'idle' | 'connecting' | 'live' | 'ended' }} */
let call = { to: '', lines: [], startedAt: 0, state: 'idle' };
let timer = null;

function elapsed() {
    const s = Math.max(0, Math.round((Date.now() - call.startedAt) / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** Start a fake call (opens the phone on it). */
export function startFakeCall(to = '') {
    call = { to: String(to || '').trim(), lines: [], startedAt: Date.now(), state: 'connecting' };
    import('./phone.js').then((m) => m.openPhoneApp('fakecall'));
    setTimeout(() => {
        if (call.state === 'connecting') {
            call.state = 'live';
            call.startedAt = Date.now();
            rerender();
        }
    }, 1300);
}

let api = null;

function rerender() {
    if (api?.isActive()) {
        api.render();
    }
}

/**
 * @param {HTMLElement} view
 * @param {import('./phone.js').PhoneAppApi} a
 */
function renderFakeCall(view, a) {
    api = a;
    if (call.state === 'idle') {
        a.setSoftLabels('', 'Back');
        view.innerHTML = `
            <div class="pp-title">Fake call</div>
            <div class="pp-scroll pp-fc-setup">
                <p class="pp-settings-note">Nobody will be on the line. Talk anyway — the people around you will hear your side.</p>
                <label class="pp-field">
                    <span class="pp-label">Talking to</span>
                    <input type="text" id="pp-fc-to" placeholder="(optional) e.g. the Organization">
                </label>
                <button type="button" class="pp-btn" id="pp-fc-go">☎ Start</button>
            </div>`;
        view.querySelector('#pp-fc-go')?.addEventListener('click', () => {
            startFakeCall(/** @type {HTMLInputElement} */ (view.querySelector('#pp-fc-to')).value);
            rerender();
        });
        return;
    }
    if (call.state === 'ended') {
        a.setSoftLabels('', 'Done');
        const mode = getSettings().fakeCallNote === 'visible' ? 'visible' : 'hidden';
        view.innerHTML = `
            <div class="pp-call-header pp-fc-head">
                <div class="pp-call-peer">${esc(call.to || 'Unknown')}</div>
                <div class="pp-call-status">Call ended · ${call.lines.length} line${call.lines.length === 1 ? '' : 's'}</div>
            </div>
            <div class="pp-scroll pp-fc-after">
                <p class="pp-settings-note">${call.lines.length
        ? (mode === 'visible' ? 'Your side of the call is now in the chat.' : 'The people nearby heard you; their next reply knows.')
        : 'You said nothing.'}</p>
                ${call.lines.length ? '<button type="button" class="pp-btn" id="pp-fc-react">Let them react</button>' : ''}
                <button type="button" class="pp-btn pp-btn-ghost" id="pp-fc-done">Done</button>
            </div>`;
        view.querySelector('#pp-fc-react')?.addEventListener('click', async () => {
            reset();
            a.closePhone();
            try {
                await runSlashCommand('/trigger');
            } catch (err) {
                console.warn('[Phone Trigger] trigger failed', err);
            }
        });
        view.querySelector('#pp-fc-done')?.addEventListener('click', () => {
            reset();
            a.goHome();
        });
        return;
    }
    a.setSoftLabels('', 'End');
    const live = call.state === 'live';
    view.innerHTML = `
        <div class="pp-call-header pp-fc-head">
            <div class="pp-fc-noise" aria-hidden="true">${'<i></i>'.repeat(14)}</div>
            <div class="pp-call-peer">${esc(call.to || 'Unknown number')}</div>
            <div class="pp-call-status" id="pp-fc-status">${live ? elapsed() : 'Connecting…'}</div>
        </div>
        <div class="pp-scroll pp-call-log pp-fc-log" id="pp-fc-log">
            ${call.lines.map((l) => `<div class="pp-call-bubble pp-call-me"><div class="pp-call-who">${esc(personaName())}</div><div class="pp-call-text">${esc(l)}</div></div>`).join('')}
            ${live && !call.lines.length ? '<div class="pp-fc-silence">…static…</div>' : ''}
        </div>
        <div class="pp-call-compose">
            <textarea id="pp-fc-input" rows="1" placeholder="${live ? 'Say something…' : 'Connecting…'}" ${live ? '' : 'disabled'} enterkeyhint="send"></textarea>
            <button type="button" class="pp-btn" id="pp-fc-send" ${live ? '' : 'disabled'}>Say</button>
        </div>
        <button type="button" class="pp-btn pp-call-end pp-fc-end" id="pp-fc-end">End call</button>`;
    const log = view.querySelector('#pp-fc-log');
    if (log) {
        log.scrollTop = log.scrollHeight;
    }
    const input = /** @type {HTMLTextAreaElement | null} */ (view.querySelector('#pp-fc-input'));
    const say = () => {
        const text = String(input?.value || '').trim();
        if (!text) {
            return;
        }
        call.lines.push(text.slice(0, 400));
        rerender();
        requestAnimationFrame(() => /** @type {HTMLInputElement | null} */ (document.getElementById('pp-fc-input'))?.focus({ preventScroll: true }));
    };
    view.querySelector('#pp-fc-send')?.addEventListener('click', say);
    input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            say();
        }
    });
    view.querySelector('#pp-fc-end')?.addEventListener('click', () => void hangUp());
    if (live && input) {
        input.focus({ preventScroll: true });
    }
    clearInterval(timer);
    if (live) {
        timer = setInterval(() => {
            const el = document.getElementById('pp-fc-status');
            if (!el || call.state !== 'live') {
                clearInterval(timer);
                return;
            }
            el.textContent = elapsed();
        }, 1000);
    }
}

function reset() {
    clearInterval(timer);
    call = { to: '', lines: [], startedAt: 0, state: 'idle' };
}

/** End the call and let the chat hear it. */
export async function hangUp() {
    if (call.state === 'idle' || call.state === 'ended') {
        return;
    }
    clearInterval(timer);
    const wasLive = call.state === 'live';
    call.state = 'ended';
    const user = personaName();
    const lines = call.lines;
    if (wasLive && lines.length) {
        const said = lines.map((l) => `"${l}"`).join(' … ');
        const who = call.to ? ` to "${call.to}"` : '';
        logStory('fakecall', `Took a call${who}: ${lines[0].slice(0, 60)}`);
        if (getSettings().fakeCallNote === 'visible') {
            try {
                const line = `*${user} answers a call${who}, turning away:* ${said}`;
                await runSlashCommand(`/sys ${line.replace(/\|/g, '¦')}`);
            } catch (err) {
                console.warn('[Phone Trigger] fake call note failed', err);
                toast('Could not post the call to the chat', 'warning');
            }
        } else {
            setPrompt(FAKE_CALL_PROMPT_KEY,
                `[Just now, within earshot of everyone present, ${user} had a phone call${who}, saying: ${said}. ${user}'s phone may not actually have been connected to anyone. React only if it fits the scene.]`,
                0);
            pendingClear = true;
        }
    }
    rerender();
}

let pendingClear = false;

/** The hidden note is for one reply only: clear it after the next message. */
export function onFakeCallMessage() {
    if (pendingClear) {
        pendingClear = false;
        setPrompt(FAKE_CALL_PROMPT_KEY, '');
    }
}

registerPhoneApp('fakecall', {
    title: 'Fake call',
    icon: '☏',
    render: renderFakeCall,
    back: () => {
        if (call.state === 'live' || call.state === 'connecting') {
            void hangUp();
            return 'stay';
        }
        reset();
        return undefined;
    },
});

/** Bind the Calls category's fake call settings. */
export function initFakeCallUi() {
    bindToggle('#pp_fakecall_on', 'fakeCallEnabled');
    bindValue('#pp_fakecall_note', 'fakeCallNote', undefined, ['hidden', 'visible']);
}

/** Opened from the dial screen / `/fakecall`. */
export function openFakeCall(to = '') {
    if (getSettings().fakeCallEnabled === false) {
        toast('Fake calls are off (Calls settings)', 'warning');
        return;
    }
    if (to) {
        startFakeCall(to);
        return;
    }
    reset();
    import('./phone.js').then((m) => m.openPhoneApp('fakecall'));
}
