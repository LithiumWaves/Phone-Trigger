/**
 * TLM.EXE — the Time Leap Machine's configuration app, reached by calling PhoneWave.
 * Styled as an old PC program running on the handset (the lab configured the machine
 * from a separate PC): title bar, tab strip, mini flip clock, range gauge, memory dump.
 */
import { getSettings, saveSettings, toast } from './settings.js';
import {
    listLeapers,
    resolveLeaper,
    listLeapAnchors,
    getStoryClock,
    setStoryClock,
    suggestDestination,
    leapSpanHours,
    leapClockParts,
    formatLeapTime,
    fromLocalInput,
    toLocalInput,
    compressMemories,
    executeLeap,
    getLeaps,
    removeLeap,
    clearLeaps,
    updateTimeleapPrompt,
} from './timeleap.js';
import { playTimeleapSequence } from './timeleapFx.js';
import { showCutscenePrompt } from './cutscenePrompt.js';
import { getDivergence } from './dmail.js';

/**
 * @typedef {{
 *   setSoftLabels: (left: string, right: string) => void,
 *   escapeHtml: (s: unknown) => string,
 *   render: () => void,
 *   hangUp: () => void,
 *   closePhone: (opts?: { force?: boolean }) => Promise<void>,
 *   isActive: () => boolean,
 * }} AppHost
 */

const app = {
    /** @type {'boot' | 'config' | 'memory' | 'log'} */
    tab: 'boot',
    leaperKey: '',
    anchorIndex: -1,
    now: '',
    dest: '',
    destTouched: false,
    memory: '',
    compressing: false,
    executing: false,
    /** memory was compressed for this exact config */
    memoryFor: '',
};

/** Fresh session each time PhoneWave answers. */
export function resetTimeleapApp() {
    app.tab = 'boot';
    app.leaperKey = '';
    app.anchorIndex = -1;
    app.now = '';
    app.dest = '';
    app.destTouched = false;
    app.memory = '';
    app.compressing = false;
    app.executing = false;
    app.memoryFor = '';
}

export function isTimeleapBusy() {
    return app.compressing || app.executing;
}

function configKey() {
    return `${app.leaperKey}|${app.anchorIndex}|${app.now}|${app.dest}`;
}

function ensureDefaults() {
    if (!app.leaperKey) {
        app.leaperKey = listLeapers()[0]?.key || 'persona';
    }
    const anchors = listLeapAnchors();
    if (!anchors.some((a) => a.index === app.anchorIndex)) {
        app.anchorIndex = anchors.length ? anchors[anchors.length - 1].index : -1;
        app.destTouched = false;
    }
    if (!fromLocalInput(app.now)) {
        app.now = getStoryClock();
    }
    if (!app.destTouched || !fromLocalInput(app.dest)) {
        app.dest = app.anchorIndex >= 0 ? suggestDestination(app.now, app.anchorIndex) : app.now;
    }
}

/** Soft-left: next step. */
export function timeleapSoftLeft() {
    if (app.tab === 'boot') {
        app.tab = 'config';
    } else if (app.tab === 'config') {
        app.tab = 'memory';
    } else if (app.tab === 'memory') {
        document.getElementById('pp-tlm-exec')?.click();
        return false;
    } else {
        app.tab = 'config';
    }
    return true;
}

/** @param {number} h */
function fmtSpan(h) {
    if (!Number.isFinite(h)) {
        return '--:--';
    }
    const sign = h > 0 ? '-' : '+';
    const mins = Math.round(Math.abs(h) * 60);
    return `${sign}${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

/**
 * Mini flip clock (the cutscene's clock in miniature).
 * @param {string} value
 * @param {string} cls
 */
function miniClock(value, cls = '') {
    const p = leapClockParts(value);
    if (!p) {
        return `<div class="pp-tlm-clock ${cls}"><b>-</b><i>月</i><b>--</b><i>日</i><s>---</s><b>--</b><i>時</i><b>--</b><i>分</i></div>`;
    }
    const pad = (n) => String(n).padStart(2, '0');
    return `<div class="pp-tlm-clock ${cls}"><b>${p.month}</b><i>月</i><b>${pad(p.day)}</b><i>日</i><s>${p.weekday}</s><b>${pad(p.hour)}</b><i>時</i><b>${pad(p.minute)}</b><i>分</i></div>`;
}

/**
 * Memory size readout: the lab's 3.24 TB of memories, squeezed to fit.
 * @param {string} text
 */
function memorySize(text) {
    const n = new TextEncoder().encode(text || '').length;
    return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(2)} KB`;
}

/**
 * @param {HTMLElement} view
 * @param {AppHost} host
 */
export function renderTimeleapApp(view, host) {
    const { escapeHtml: esc } = host;
    view.style.background = '';
    view.className = 'pp-view pp-view-tlm';

    if (app.tab === 'boot') {
        host.setSoftLabels('', 'Hang up');
        view.innerHTML = `
            <div class="pp-tlm-win">
                <div class="pp-tlm-titlebar"><span>TLM.EXE</span><span class="pp-tlm-wbtns">_ □ ×</span></div>
                <pre class="pp-tlm-boot" id="pp-tlm-boot"></pre>
            </div>
        `;
        const lines = [
            'FUTURE GADGET #08 TIME LEAP MACHINE',
            'PHONEWAVE LINK ........ OK',
            'HEADGEAR SYNC ......... OK',
            'LHC PROXY ............. STANDBY',
            `DIVERGENCE ${getDivergence()}`,
            'MEMORY CODEC 3.24TB>36B READY',
            '',
            'LIMIT: 48 HOURS. DO NOT EXCEED.',
        ];
        const pre = view.querySelector('#pp-tlm-boot');
        let i = 0;
        const tick = () => {
            if (app.tab !== 'boot' || !pre?.isConnected) {
                return;
            }
            if (i < lines.length) {
                pre.textContent += `${lines[i++]}\n`;
                window.setTimeout(tick, 110);
            } else {
                window.setTimeout(() => {
                    if (app.tab === 'boot' && pre.isConnected) {
                        app.tab = 'config';
                        host.render();
                    }
                }, 380);
            }
        };
        tick();
        // On the boot text, not the view: the Call click that opened us is still bubbling.
        pre?.addEventListener('click', () => {
            if (app.tab === 'boot') {
                app.tab = 'config';
                host.render();
            }
        }, { once: true });
        return;
    }

    ensureDefaults();
    const settings = getSettings();
    const limit = Number(settings.timeleapLimitHours) || 0;
    const span = leapSpanHours(app.now, app.dest);
    const over = limit > 0 && span > limit + 1e-9;
    const invalid = !Number.isFinite(span) || span <= 0;
    const leapers = listLeapers();
    const leaper = resolveLeaper(app.leaperKey);
    const anchors = listLeapAnchors();
    const anchor = anchors.find((a) => a.index === app.anchorIndex);
    const stale = app.memory && app.memoryFor !== configKey();

    const tabs = [['config', 'CONFIG'], ['memory', 'MEMORY'], ['log', 'LOG']];
    const tabHtml = tabs.map(([id, label]) => `
        <button type="button" class="pp-tlm-tab ${app.tab === id ? 'pp-tlm-tab-on' : ''}" data-tlm-tab="${id}">${label}</button>
    `).join('');

    let body = '';
    if (app.tab === 'config') {
        host.setSoftLabels('Next', 'Hang up');
        const gauge = limit > 0 && Number.isFinite(span) ? Math.max(0, Math.min(1, span / limit)) : 0;
        body = `
            <label class="pp-tlm-field">
                <span>LEAPER</span>
                <select id="pp-tlm-leaper" class="pp-tlm-input">
                    ${leapers.map((l) => `<option value="${esc(l.key)}" ${l.key === leaper.key ? 'selected' : ''}>${esc(l.type === 'persona' ? `${l.name} (you)` : l.name)}</option>`).join('')}
                </select>
            </label>
            <label class="pp-tlm-field">
                <span>ARRIVE AT</span>
                <select id="pp-tlm-anchor" class="pp-tlm-input" ${anchors.length ? '' : 'disabled'}>
                    ${anchors.length
                        ? anchors.map((a) => `<option value="${a.index}" ${a.index === app.anchorIndex ? 'selected' : ''}>#${a.index} ${esc(a.name)}: ${esc(a.text.slice(0, 60))}</option>`).join('')
                        : '<option>— chat too short —</option>'}
                </select>
            </label>
            ${anchor ? `<div class="pp-tlm-quote">${esc(anchor.name)}: ${esc(anchor.text)}</div>` : ''}
            <div class="pp-tlm-sect">NOW · story time</div>
            <input type="datetime-local" id="pp-tlm-now" class="pp-tlm-input" value="${esc(app.now)}" />
            ${miniClock(app.now)}
            <div class="pp-tlm-sect">DESTINATION</div>
            <input type="datetime-local" id="pp-tlm-dest" class="pp-tlm-input" value="${esc(app.dest)}" />
            <div class="pp-tlm-steps">
                ${[1, 3, 12, 24, 48].map((h) => `<button type="button" class="pp-tlm-step" data-tlm-back="${h}">-${h}h</button>`).join('')}
            </div>
            ${miniClock(app.dest, 'pp-tlm-clock-dest')}
            <div class="pp-tlm-range ${over || invalid ? 'pp-tlm-bad' : ''}">
                <span>ΔT ${fmtSpan(span)}</span>
                <span class="pp-tlm-gauge"><i style="width:${(gauge * 100).toFixed(1)}%"></i></span>
                <span>${limit > 0 ? `${limit}h` : '∞'}</span>
            </div>
            ${invalid ? '<div class="pp-tlm-warn">DESTINATION MUST BE IN THE PAST</div>' : ''}
            ${over ? `<div class="pp-tlm-warn">OUT OF RANGE — BRAIN DAMAGE RISK. LIMIT ${limit}H</div>` : ''}
            <div class="pp-tlm-sect">CUTSCENE</div>
            <div class="pp-tlm-steps">
                <button type="button" class="pp-tlm-step ${settings.timeleapCutscene !== 'progressive' ? 'pp-tlm-step-on' : ''}" data-tlm-cut="original">ORIGINAL</button>
                <button type="button" class="pp-tlm-step ${settings.timeleapCutscene === 'progressive' ? 'pp-tlm-step-on' : ''}" data-tlm-cut="progressive">PROGRESSIVE</button>
                <button type="button" class="pp-tlm-step" id="pp-tlm-compare">COMPARE</button>
            </div>
            <button type="button" class="pp-tlm-btn" data-tlm-tab="memory">NEXT ▸ MEMORY</button>
        `;
    } else if (app.tab === 'memory') {
        host.setSoftLabels('Leap', 'Hang up');
        const ready = Boolean(app.memory.trim()) && !over && !invalid && anchor && !app.compressing && !app.executing;
        body = `
            <div class="pp-tlm-summary">
                <div><span>LEAPER</span> ${esc(leaper.name)}</div>
                <div><span>FROM</span> ${esc(formatLeapTime(app.now))}</div>
                <div><span>TO</span> ${esc(formatLeapTime(app.dest))} <em>${fmtSpan(span)}</em></div>
                <div><span>ARRIVE</span> #${app.anchorIndex} ${esc(anchor?.name || '—')}</div>
            </div>
            <p class="pp-tlm-note">
                ${leaper.type === 'persona'
                    ? 'Only you will remember. Everyone else lives these hours again for the first time.'
                    : `Only ${esc(leaper.name)} will remember — not even you, unless they tell you.`}
            </p>
            <button type="button" class="pp-tlm-btn" id="pp-tlm-compress" ${app.compressing || !anchor ? 'disabled' : ''}>
                ${app.compressing ? 'COMPRESSING… 3.24TB ▸ 36B' : (app.memory ? 'RE-COMPRESS MEMORIES' : 'COMPRESS MEMORIES')}
            </button>
            <div class="pp-tlm-sect">MEMORY DUMP <em>${memorySize(app.memory)}</em></div>
            <textarea id="pp-tlm-memory" class="pp-tlm-input pp-tlm-mem" rows="6" placeholder="Compress to see what ${esc(leaper.name)} will remember. You can edit it.">${esc(app.memory)}</textarea>
            ${stale ? '<div class="pp-tlm-warn">CONFIG CHANGED SINCE COMPRESSION</div>' : ''}
            ${over || invalid ? '<div class="pp-tlm-warn">FIX DESTINATION IN CONFIG</div>' : ''}
            <button type="button" class="pp-tlm-btn pp-tlm-exec" id="pp-tlm-exec" ${ready ? '' : 'disabled'}>
                ${app.executing ? 'LEAPING…' : '▶ EXECUTE TIME LEAP'}
            </button>
        `;
    } else {
        host.setSoftLabels('Config', 'Hang up');
        const leaps = getLeaps();
        const toggles = [
            ['timeleapInject', settings.timeleapInject !== false, 'Inject memories', 'Leapers remember in the main chat prompt.'],
            ['timeleapArrivalMarker', settings.timeleapArrivalMarker !== false, 'Arrival marker', 'A /comment note on the new branch (not sent to the AI).'],
            ['timeleapKeepFuturePhone', Boolean(settings.timeleapKeepFuturePhone), 'Keep future phone', 'Keep mail and calls from after the arrival point.'],
            ['timeleapLimitHours', (Number(settings.timeleapLimitHours) || 0) > 0, '48-hour limit', 'Off = leap any distance.'],
        ];
        body = `
            <div class="pp-tlm-sect">LEAP LOG · this chat</div>
            ${leaps.length ? leaps.map((l) => `
                <div class="pp-tlm-log">
                    <div class="pp-tlm-log-head">
                        <span>${esc(l.leaper?.name || '?')} · ${esc(formatLeapTime(l.fromTime))} → ${esc(formatLeapTime(l.toTime))}</span>
                        <button type="button" class="pp-tlm-x" data-tlm-del="${esc(l.id)}" aria-label="Forget this leap">×</button>
                    </div>
                    <div class="pp-tlm-log-mem">${esc(l.memory || '(no memories)')}</div>
                </div>
            `).join('') : '<div class="pp-tlm-note">No leaps on this timeline.</div>'}
            ${leaps.length ? '<button type="button" class="pp-tlm-step" id="pp-tlm-clear">FORGET ALL</button>' : ''}
            <div class="pp-tlm-sect">MACHINE</div>
            ${toggles.map(([key, on, title, blurb]) => `
                <button type="button" class="pp-tlm-toggle ${on ? 'pp-tlm-toggle-on' : ''}" data-tlm-toggle="${key}">
                    <span><b>${esc(title)}</b><small>${esc(blurb)}</small></span><span>${on ? 'ON' : 'OFF'}</span>
                </button>
            `).join('')}
        `;
    }

    view.innerHTML = `
        <div class="pp-tlm-win">
            <div class="pp-tlm-titlebar"><span>TLM.EXE — ${esc(app.tab.toUpperCase())}</span><span class="pp-tlm-wbtns">_ □ ×</span></div>
            <div class="pp-tlm-tabs">${tabHtml}</div>
            <div class="pp-tlm-body" id="pp-tlm-body">${body}</div>
            <div class="pp-tlm-status">
                <span>● LINK</span>
                <span>${esc(getDivergence())}</span>
                <span>${app.executing ? 'LEAP' : app.compressing ? 'BUSY' : 'READY'}</span>
            </div>
        </div>
    `;
    bind(view, host);
}

/**
 * @param {HTMLElement} view
 * @param {AppHost} host
 */
function bind(view, host) {
    const rerender = () => {
        const body = view.querySelector('#pp-tlm-body');
        const top = body?.scrollTop || 0;
        host.render();
        const next = document.getElementById('pp-tlm-body');
        if (next) {
            next.scrollTop = top;
        }
    };

    view.querySelectorAll('[data-tlm-tab]').forEach((btn) => {
        btn.addEventListener('click', () => {
            app.tab = /** @type {any} */ (btn.getAttribute('data-tlm-tab'));
            host.render();
        });
    });

    view.querySelector('#pp-tlm-leaper')?.addEventListener('change', (e) => {
        app.leaperKey = /** @type {HTMLSelectElement} */ (e.target).value;
        rerender();
    });
    view.querySelector('#pp-tlm-anchor')?.addEventListener('change', (e) => {
        app.anchorIndex = Number(/** @type {HTMLSelectElement} */ (e.target).value);
        app.destTouched = false;
        rerender();
    });
    view.querySelector('#pp-tlm-now')?.addEventListener('change', (e) => {
        const v = /** @type {HTMLInputElement} */ (e.target).value;
        if (fromLocalInput(v)) {
            app.now = v;
            void setStoryClock(v);
        }
        rerender();
    });
    view.querySelector('#pp-tlm-dest')?.addEventListener('change', (e) => {
        const v = /** @type {HTMLInputElement} */ (e.target).value;
        if (fromLocalInput(v)) {
            app.dest = v;
            app.destTouched = true;
        }
        rerender();
    });
    view.querySelectorAll('[data-tlm-back]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const now = fromLocalInput(app.now);
            if (now) {
                app.dest = toLocalInput(new Date(now.getTime() - Number(btn.getAttribute('data-tlm-back')) * 3600000));
                app.destTouched = true;
                rerender();
            }
        });
    });
    view.querySelectorAll('[data-tlm-cut]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const s = getSettings();
            s.timeleapCutscene = btn.getAttribute('data-tlm-cut') === 'progressive' ? 'progressive' : 'original';
            s.timeleapCutsceneChosen = true;
            saveSettings();
            rerender();
        });
    });
    view.querySelector('#pp-tlm-compare')?.addEventListener('click', async () => {
        await showCutscenePrompt({ kind: 'timeleap' });
        rerender();
    });

    const memoryEl = /** @type {HTMLTextAreaElement | null} */ (view.querySelector('#pp-tlm-memory'));
    memoryEl?.addEventListener('input', () => {
        app.memory = memoryEl.value;
        const exec = /** @type {HTMLButtonElement | null} */ (view.querySelector('#pp-tlm-exec'));
        if (exec && !app.compressing && !app.executing) {
            const span = leapSpanHours(app.now, app.dest);
            const limit = Number(getSettings().timeleapLimitHours) || 0;
            exec.disabled = !app.memory.trim() || !(span > 0) || (limit > 0 && span > limit);
        }
    });

    view.querySelector('#pp-tlm-compress')?.addEventListener('click', async () => {
        if (app.compressing) {
            return;
        }
        app.compressing = true;
        rerender();
        const key = configKey();
        try {
            app.memory = await compressMemories({
                leaper: resolveLeaper(app.leaperKey),
                anchorIndex: app.anchorIndex,
                fromTime: app.now,
                toTime: app.dest,
            });
            app.memoryFor = key;
        } catch (err) {
            console.error('[Phone Trigger] compress failed', err);
            toast('Memory compression failed', 'error', 'TIME LEAP');
        } finally {
            app.compressing = false;
        }
        if (host.isActive()) {
            rerender();
        }
    });

    view.querySelector('#pp-tlm-exec')?.addEventListener('click', () => void execute(host));

    view.querySelectorAll('[data-tlm-del]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            await removeLeap(btn.getAttribute('data-tlm-del') || '');
            rerender();
        });
    });
    view.querySelector('#pp-tlm-clear')?.addEventListener('click', async () => {
        if (confirm('Forget every leap memory on this chat?')) {
            await clearLeaps();
            rerender();
        }
    });
    view.querySelectorAll('[data-tlm-toggle]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const key = btn.getAttribute('data-tlm-toggle') || '';
            const s = getSettings();
            if (key === 'timeleapLimitHours') {
                s.timeleapLimitHours = (Number(s.timeleapLimitHours) || 0) > 0 ? 0 : 48;
            } else if (key === 'timeleapKeepFuturePhone') {
                s.timeleapKeepFuturePhone = !s.timeleapKeepFuturePhone;
            } else {
                s[key] = s[key] === false;
            }
            saveSettings();
            if (key === 'timeleapInject') {
                updateTimeleapPrompt();
            }
            rerender();
        });
    });
}

/**
 * @param {AppHost} host
 */
async function execute(host) {
    if (app.executing || app.compressing) {
        return;
    }
    const leaper = resolveLeaper(app.leaperKey);
    const span = leapSpanHours(app.now, app.dest);
    const limit = Number(getSettings().timeleapLimitHours) || 0;
    if (!(span > 0) || (limit > 0 && span > limit)) {
        toast('Destination out of range', 'warning', 'TIME LEAP');
        return;
    }
    app.executing = true;
    host.render();

    const from = app.now;
    const to = app.dest;
    const lines = [
        `LEAPER  ${leaper.name.toUpperCase()}`,
        `FROM  ${formatLeapTime(from)}`,
        `DEST  ${formatLeapTime(to)}`,
        `SPAN  ${fmtSpan(span)}`,
        `MEM  ${memorySize(app.memory)}`,
    ];

    await host.closePhone({ force: true });
    const [, result] = await Promise.all([
        playTimeleapSequence({ from, to, lines }),
        executeLeap({ leaper, anchorIndex: app.anchorIndex, fromTime: from, toTime: to, memory: app.memory }),
    ]);
    app.executing = false;

    if (result.ok) {
        resetTimeleapApp();
        host.hangUp();
        toast(`${leaper.name} arrived · ${formatLeapTime(to)}`, 'success', 'TIME LEAP');
    } else {
        toast(result.error, 'error', 'TIME LEAP');
    }
}
