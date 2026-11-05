/**
 * PhoneWave setup — short VN-style minigames when YOU send a D-Mail or time leap.
 * Off by default (Settings → D-Mail / Time Leap → Set up the machine yourself).
 *
 * D-Mail:    Braun tube (lifter) → microwave timer → call the PhoneWave → send in the discharge
 * Time leap: Braun tube (lifter) → headgear → ENTER at the discharge peak
 *
 * Every rig has Skip (go straight on) and Cancel (nothing is sent; the draft stays).
 */
import { getSettings, saveSettings, reduceFlashing } from './settings.js';
import { getStoryDate, passStoryTime, toLocalInput, formatStoryTime } from './storyClock.js';
import { getAudioContext } from './audio.js';
import { bindToggle, bindValue } from './ui.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** @param {'dmail' | 'leap'} kind */
export function setupWanted(kind) {
    const s = getSettings();
    if (!s.machineSetup) {
        return false;
    }
    return kind === 'dmail' ? s.machineSetupDmail !== false : s.machineSetupLeap !== false;
}

// —— Sounds (tiny, synth; silent when sounds are off) ——

function beep(freq = 1200, dur = 0.06, type = 'square', gain = 0.05) {
    if (!getSettings().soundEnabled) {
        return;
    }
    const ac = getAudioContext();
    if (!ac) {
        return;
    }
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = /** @type {OscillatorType} */ (type);
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
    osc.connect(g);
    g.connect(ac.destination);
    osc.start();
    osc.stop(ac.currentTime + dur + 0.02);
}

// —— Braun tube hours ——

/** @returns {{ open: number, close: number }} minutes after midnight */
export function braunHours() {
    const m = /^\s*(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s*$/.exec(String(getSettings().braunTubeHours || ''));
    if (!m) {
        return { open: 600, close: 1200 };
    }
    return { open: (+m[1] % 24) * 60 + Math.min(59, +m[2]), close: (+m[3] % 24) * 60 + Math.min(59, +m[4]) };
}

/** Whether Mr. Braun's 42-inch is on at this story time. */
export function braunTubeOn(date = getStoryDate()) {
    const { open, close } = braunHours();
    const t = date.getHours() * 60 + date.getMinutes();
    return open <= close ? t >= open && t < close : t >= open || t < close;
}

function minutesUntilOpen(date = getStoryDate()) {
    const { open } = braunHours();
    const t = date.getHours() * 60 + date.getMinutes();
    return ((open - t) % 1440 + 1440) % 1440 || 1440;
}

const hm = (mins) => `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

// —— The rig (one dialog, several stages) ——

/**
 * @typedef {{
 *   dlg: HTMLDialogElement,
 *   stage: HTMLElement,
 *   calm: boolean,
 *   step: (i: number, status?: string) => void,
 *   status: (text: string, tone?: 'ok' | 'bad' | '') => void,
 *   onKey: (fn: ((e: KeyboardEvent) => boolean | void) | null) => void,
 *   later: (fn: () => void, ms: number) => void,
 *   every: (fn: (t: number) => void) => void,
 *   clear: () => void,
 *   interrupt: Promise<'skip' | 'cancel'>,
 *   close: () => void,
 * }} Rig
 */

/**
 * @param {string} title
 * @param {string[]} steps
 * @returns {Rig}
 */
function openRig(title, steps) {
    document.getElementById('pp-ms')?.remove();
    const calm = reduceFlashing();
    const dlg = document.createElement('dialog');
    dlg.id = 'pp-ms';
    dlg.className = `pp-sg-prompt pp-ms ${calm ? 'pp-ms-calm' : ''}`;
    dlg.innerHTML = `
        <div class="pp-sg-panel pp-ms-panel">
            <span class="pp-sg-corner pp-sg-tl"></span><span class="pp-sg-corner pp-sg-tr"></span>
            <span class="pp-sg-corner pp-sg-bl"></span><span class="pp-sg-corner pp-sg-br"></span>
            <div class="pp-ms-head">${esc(title)}</div>
            <ol class="pp-ms-steps">${steps.map((s, i) => `<li data-step="${i}">${esc(s)}</li>`).join('')}</ol>
            <div class="pp-ms-stage" id="pp-ms-stage"></div>
            <div class="pp-ms-status" id="pp-ms-status" aria-live="polite"></div>
            <div class="pp-ms-foot">
                <button type="button" class="pp-wa-btn" data-ms="cancel">Cancel</button>
                <button type="button" class="pp-wa-btn" data-ms="skip">Skip setup</button>
            </div>
        </div>`;
    document.body.appendChild(dlg);
    const stage = /** @type {HTMLElement} */ (dlg.querySelector('#pp-ms-stage'));
    const statusEl = /** @type {HTMLElement} */ (dlg.querySelector('#pp-ms-status'));
    /** @type {((e: KeyboardEvent) => boolean | void) | null} */
    let keyFn = null;
    /** @type {(() => void)[]} */
    let cleanups = [];
    /** @type {(v: 'skip' | 'cancel') => void} */
    let interruptResolve = () => {};
    const interrupt = new Promise((r) => {
        interruptResolve = r;
    });
    dlg.querySelector('[data-ms="cancel"]')?.addEventListener('click', () => interruptResolve('cancel'));
    dlg.querySelector('[data-ms="skip"]')?.addEventListener('click', () => interruptResolve('skip'));
    dlg.addEventListener('cancel', (e) => {
        e.preventDefault();
        interruptResolve('cancel');
    });
    // Keys go to the rig while it's open, wherever focus ended up (a clicked button may be gone).
    const onKeyDown = (e) => {
        if (!dlg.isConnected) {
            return;
        }
        const target = /** @type {HTMLElement} */ (e.target);
        if (target?.matches?.('input, textarea, select')) {
            return;
        }
        if (keyFn?.(e)) {
            e.preventDefault();
            e.stopPropagation();
        }
    };
    document.addEventListener('keydown', onKeyDown, true);
    const rig = {
        dlg,
        stage,
        calm,
        step(i, status = '') {
            dlg.querySelectorAll('.pp-ms-steps li').forEach((li) => {
                const n = Number(li.getAttribute('data-step'));
                li.classList.toggle('pp-ms-done', n < i);
                li.classList.toggle('pp-ms-now', n === i);
            });
            rig.status(status);
        },
        status(text, tone = '') {
            statusEl.textContent = text;
            statusEl.className = `pp-ms-status ${tone ? `pp-ms-${tone}` : ''}`;
        },
        onKey(fn) {
            keyFn = fn;
        },
        later(fn, ms) {
            const id = setTimeout(fn, ms);
            cleanups.push(() => clearTimeout(id));
        },
        every(fn) {
            let raf = 0;
            let stopped = false;
            const start = performance.now();
            const loop = (now) => {
                fn(now - start);
                if (!stopped) {
                    raf = requestAnimationFrame(loop);
                }
            };
            raf = requestAnimationFrame(loop);
            cleanups.push(() => {
                stopped = true;
                cancelAnimationFrame(raf);
            });
        },
        clear() {
            cleanups.forEach((f) => f());
            cleanups = [];
            keyFn = null;
        },
        interrupt,
        close() {
            rig.clear();
            document.removeEventListener('keydown', onKeyDown, true);
            try {
                dlg.close();
            } catch {
                /* ignore */
            }
            dlg.remove();
        },
    };
    try {
        dlg.showModal();
    } catch {
        dlg.setAttribute('open', '');
    }
    return rig;
}

/**
 * Run stages in order; each resolves to true (next) or a value for the result.
 * @param {Rig} rig
 * @param {((rig: Rig) => Promise<any>)[]} stages
 * @returns {Promise<'done' | 'skip' | 'cancel'>}
 */
async function runStages(rig, stages) {
    for (let i = 0; i < stages.length; i++) {
        rig.step(i);
        const out = await Promise.race([stages[i](rig), rig.interrupt]);
        rig.clear();
        if (out === 'skip' || out === 'cancel') {
            return out;
        }
        if (out === false) {
            return 'cancel';
        }
    }
    return 'done';
}

// —— Stage: the Braun tube (lifter) ——

/** @param {Rig} rig */
function stageBraun(rig) {
    return new Promise((resolve) => {
        if (getSettings().braunTubeRequired === false) {
            resolve(true);
            return;
        }
        const now = getStoryDate();
        const on = braunTubeOn(now);
        const { open, close } = braunHours();
        rig.stage.innerHTML = `
            <div class="pp-ms-crt ${on ? 'pp-ms-crt-on' : ''}" aria-hidden="true"><i></i></div>
            <p class="pp-ms-text">${on
        ? 'Mr. Braun\'s 42-inch Braun tube is on downstairs. Without it the lifter doesn\'t work.'
        : `Mr. Braun's shop is closed (${hm(open)}–${hm(close)}): the 42-inch Braun tube is off, so the lifter won't work.`}</p>
            <p class="pp-ms-small">Story time ${esc(formatStoryTime(toLocalInput(now)))}</p>
            <div class="pp-ms-row">
                ${on
        ? '<button type="button" class="pp-wa-btn pp-wa-go" data-go>Go upstairs ▸</button>'
        : `<button type="button" class="pp-wa-btn pp-wa-go" data-wait>Wait until ${hm(open)}</button>`}
            </div>`;
        if (on) {
            rig.status('The tube hums and warms up…');
            const go = () => {
                beep(660, 0.05, 'sine');
                resolve(true);
            };
            rig.stage.querySelector('[data-go]')?.addEventListener('click', go);
            rig.onKey((e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    go();
                    return true;
                }
            });
            /** @type {HTMLElement | null} */ (rig.stage.querySelector('[data-go]'))?.focus();
            return;
        }
        rig.status('');
        const wait = async () => {
            await passStoryTime(minutesUntilOpen(now), { log: 'Waited for the Braun tube' });
            rig.clear();
            resolve(await stageBraun(rig));
        };
        rig.stage.querySelector('[data-wait]')?.addEventListener('click', () => void wait());
        rig.onKey((e) => {
            if (e.key === 'Enter') {
                void wait();
                return true;
            }
        });
    });
}

// —— Stage: the microwave timer (D-Mail) ——

/**
 * The timer decides how far back: each second on the timer is an hour into the past.
 * @param {Rig} rig
 * @param {{ arriveAt: string }} draft  arriveAt (datetime-local) is read and written
 */
function stageTimer(rig, draft) {
    return new Promise((resolve) => {
        const now = getStoryDate();
        const target = draft.arriveAt ? Date.parse(draft.arriveAt) : NaN;
        const targetHours = Number.isFinite(target) && target < now.getTime() ? Math.max(1, Math.round((now.getTime() - target) / 3600000)) : 0;
        const asTimer = (secs) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
        let digits = '';
        const seconds = () => {
            const d = digits.padStart(4, '0');
            return Number(d.slice(0, 2)) * 60 + Math.min(59, Number(d.slice(2)));
        };
        rig.stage.innerHTML = `
            <div class="pp-ms-oven">
                <div class="pp-ms-oven-door"><div class="pp-ms-plate" id="pp-ms-plate"></div></div>
                <div class="pp-ms-oven-side">
                    <div class="pp-ms-lcd" id="pp-ms-lcd">0:00</div>
                    <div class="pp-ms-pad">
                        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button type="button" class="pp-ms-key" data-k="${n}">${n}</button>`).join('')}
                        <button type="button" class="pp-ms-key" data-k="clr">CLR</button>
                        <button type="button" class="pp-ms-key" data-k="0">0</button>
                        <button type="button" class="pp-ms-key pp-ms-key-go" data-k="start">START</button>
                    </div>
                </div>
            </div>
            <p class="pp-ms-text" id="pp-ms-arrive"></p>
            <p class="pp-ms-small">${targetHours ? `For your arrival time, set <b>${asTimer(Math.min(5999, targetHours))}</b>.` : 'Each second on the timer sends it one hour back.'}</p>`;
        const lcd = /** @type {HTMLElement} */ (rig.stage.querySelector('#pp-ms-lcd'));
        const arrive = /** @type {HTMLElement} */ (rig.stage.querySelector('#pp-ms-arrive'));
        const draw = () => {
            const secs = seconds();
            lcd.textContent = asTimer(secs);
            arrive.textContent = secs ? `→ arrives about ${formatStoryTime(toLocalInput(new Date(now.getTime() - secs * 3600000)))}` : '';
        };
        const press = (k) => {
            if (k === 'clr') {
                digits = '';
                beep(500);
            } else if (k === 'start') {
                const secs = seconds();
                if (!secs) {
                    rig.status('Set the timer first.', 'bad');
                    beep(220, 0.15);
                    return;
                }
                draft.arriveAt = toLocalInput(new Date(now.getTime() - secs * 3600000));
                beep(1500, 0.25, 'sine', 0.06);
                resolve(true);
                return;
            } else if (/^\d$/.test(k) && digits.length < 4) {
                digits = (digits + k).replace(/^0+/, '');
                beep(1250);
            }
            rig.status('');
            draw();
        };
        rig.stage.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => press(b.getAttribute('data-k') || '')));
        rig.onKey((e) => {
            if (/^\d$/.test(e.key)) {
                press(e.key);
                return true;
            }
            if (e.key === 'Backspace' || e.key === 'Delete') {
                digits = digits.slice(0, -1);
                draw();
                return true;
            }
            if (e.key === 'Enter') {
                press('start');
                return true;
            }
        });
        draw();
    });
}

// —— Stage: call the PhoneWave to start it ——

/** The PhoneWave's own phone number (the one wired into the microwave). */
function phoneWaveNumber() {
    const s = getSettings();
    if (!/^\d{3}-\d{4}-\d{4}$/.test(String(s.phoneWaveNumber || ''))) {
        const r = () => String(Math.floor(Math.random() * 10));
        s.phoneWaveNumber = `090-${r()}${r()}${r()}${r()}-${r()}${r()}${r()}${r()}`;
        saveSettings();
    }
    return String(s.phoneWaveNumber);
}

/** @param {Rig} rig */
function stageDial(rig) {
    return new Promise((resolve) => {
        const number = phoneWaveNumber();
        const want = number.replace(/\D/g, '');
        let got = '';
        rig.stage.innerHTML = `
            <p class="pp-ms-text">The PhoneWave starts when its phone is called. Dial it.</p>
            <div class="pp-ms-dial" id="pp-ms-dial" aria-label="Dialled number"></div>
            <div class="pp-ms-pad pp-ms-pad-phone">
                ${[1, 2, 3, 4, 5, 6, 7, 8, 9, '*', 0, '#'].map((n) => `<button type="button" class="pp-ms-key" data-k="${n}">${n}</button>`).join('')}
            </div>
            <p class="pp-ms-small">PhoneWave · ${esc(number)}</p>`;
        const dial = /** @type {HTMLElement} */ (rig.stage.querySelector('#pp-ms-dial'));
        let ringing = false;
        const draw = () => {
            let out = '';
            let i = 0;
            for (const ch of number) {
                if (ch === '-') {
                    out += '<span class="pp-ms-dash">-</span>';
                    continue;
                }
                out += i < got.length ? `<b>${esc(got[i])}</b>` : '<i>_</i>';
                i += 1;
            }
            dial.innerHTML = out;
        };
        const press = (k) => {
            if (ringing) {
                return;
            }
            if (want[got.length] !== String(k)) {
                beep(240, 0.12);
                rig.status('Wrong number — start over.', 'bad');
                got = '';
                draw();
                return;
            }
            got += String(k);
            beep(900 + Number(k) * 40, 0.07, 'sine');
            rig.status('');
            draw();
            if (got.length === want.length) {
                ringing = true;
                rig.status('Ringing…');
                rig.later(() => beep(440, 0.4, 'sine', 0.04), 300);
                rig.later(() => beep(440, 0.4, 'sine', 0.04), 1100);
                rig.later(() => {
                    rig.status('Click. The turntable spins backwards.', 'ok');
                    resolve(true);
                }, 1900);
            }
        };
        rig.stage.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => press(b.getAttribute('data-k') || '')));
        rig.onKey((e) => {
            if (/^[\d*#]$/.test(e.key)) {
                press(e.key);
                return true;
            }
        });
        draw();
    });
}

// —— Stage: timing the discharge ——

/**
 * A gauge that surges and jitters; hit the button while it's in the band.
 * @param {Rig} rig
 * @param {{ label: string, intro: string, band?: [number, number], forgiving?: boolean, onHit?: () => void }} opts
 *   forgiving = time leap: overshooting only falls back for another rise
 */
function stageDischarge(rig, opts) {
    return new Promise((resolve) => {
        const [lo, hi] = opts.band || [72, 86];
        rig.stage.innerHTML = `
            <p class="pp-ms-text">${esc(opts.intro)}</p>
            <div class="pp-ms-gauge" aria-hidden="true">
                <div class="pp-ms-band" style="left:${lo}%;width:${hi - lo}%"></div>
                <div class="pp-ms-needle" id="pp-ms-needle"></div>
            </div>
            <div class="pp-ms-plate pp-ms-plate-spin" aria-hidden="true"></div>
            <button type="button" class="pp-ms-big" id="pp-ms-hit">${esc(opts.label)}</button>
            <p class="pp-ms-small">Press it (or Space / Enter) while the needle is in the band.</p>`;
        const needle = /** @type {HTMLElement} */ (rig.stage.querySelector('#pp-ms-needle'));
        const hitBtn = /** @type {HTMLButtonElement} */ (rig.stage.querySelector('#pp-ms-hit'));
        hitBtn.focus();
        let level = 0;
        let base = 0;
        let cool = 0;
        let overloads = 0;
        let lastT = 0;
        let over = false;
        rig.every((t) => {
            const dt = Math.min(0.05, (t - lastT) / 1000);
            lastT = t;
            if (cool > 0) {
                cool -= dt;
                level = Math.max(0, level - dt * 120);
                needle.style.left = `${level}%`;
                return;
            }
            base += dt * 17;
            const jitter = Math.sin(t / 90) * 4 + Math.sin(t / 37) * 2.5;
            level = Math.max(0, Math.min(100, base + jitter));
            needle.style.left = `${level}%`;
            rig.stage.classList.toggle('pp-ms-hot', level >= lo);
            if (level >= 99.5) {
                if (opts.forgiving) {
                    base = 30;
                    rig.status('The peak passed — it\'s building again…');
                } else {
                    overloads += 1;
                    beep(160, 0.4, 'sawtooth', 0.05);
                    if (overloads >= 3) {
                        over = true;
                        rig.status('Overheated. The PhoneWave needs to cool down — try again later.', 'bad');
                        hitBtn.disabled = true;
                        rig.clear();
                        rig.later(() => resolve(false), 2200);
                        return;
                    }
                    rig.status(overloads === 1
                        ? 'Overload! Something in there turned into gel. Cooling down…'
                        : 'Overload again — careful. Cooling down…', 'bad');
                    base = 0;
                    cool = 1.6;
                }
            }
        });
        const hit = () => {
            if (over || cool > 0) {
                return;
            }
            if (level >= lo && level <= hi) {
                beep(1800, 0.3, 'sine', 0.06);
                rig.status('Now!', 'ok');
                rig.stage.classList.add('pp-ms-flash');
                opts.onHit?.();
                rig.later(() => resolve(true), rig.calm ? 120 : 380);
                over = true;
                return;
            }
            if (level < lo) {
                beep(300, 0.1);
                rig.status(opts.forgiving ? 'Not yet — still charging.' : 'Fizzle. The charge drops — wait for it.', 'bad');
                if (!opts.forgiving) {
                    base = Math.max(0, base - 35);
                }
                return;
            }
            beep(220, 0.15);
            rig.status('Too late — wait for the next surge.', 'bad');
            base = 20;
        };
        hitBtn.addEventListener('click', hit);
        rig.onKey((e) => {
            if (e.key === ' ' || e.key === 'Enter') {
                hit();
                return true;
            }
        });
    });
}

// —— Stage: headgear ——

/** @param {Rig} rig */
function stageHeadgear(rig) {
    return new Promise((resolve) => {
        const targets = [
            { x: 50, y: 20, name: 'forehead' },
            { x: 22, y: 42, name: 'left temple' },
            { x: 78, y: 42, name: 'right temple' },
        ];
        const placed = new Set();
        rig.stage.innerHTML = `
            <p class="pp-ms-text">Put on the headgear: place the three electrodes. Tap a marked point (or drag a pad onto it).</p>
            <div class="pp-ms-head-wrap">
                <svg class="pp-ms-headsvg" viewBox="0 0 100 100" aria-hidden="true">
                    <path d="M50 8 C24 8 14 28 16 48 C17 62 24 70 30 74 L30 92 L70 92 L70 74 C76 70 83 62 84 48 C86 28 76 8 50 8 Z" />
                    <path class="pp-ms-band-arc" d="M14 44 C16 10 84 10 86 44" />
                </svg>
                ${targets.map((t, i) => `<button type="button" class="pp-ms-pt" data-pt="${i}" style="left:${t.x}%;top:${t.y}%" aria-label="Electrode on the ${t.name}"></button>`).join('')}
            </div>
            <div class="pp-ms-tray">${targets.map((_, i) => `<span class="pp-ms-pad-el" data-pad="${i}" aria-hidden="true"></span>`).join('')}</div>`;
        const wrap = /** @type {HTMLElement} */ (rig.stage.querySelector('.pp-ms-head-wrap'));
        const place = (i) => {
            if (placed.has(i)) {
                return;
            }
            placed.add(i);
            wrap.querySelector(`[data-pt="${i}"]`)?.classList.add('pp-ms-on');
            const pad = rig.stage.querySelector('.pp-ms-tray .pp-ms-pad-el:not(.pp-ms-used)');
            pad?.classList.add('pp-ms-used');
            beep(700 + placed.size * 120, 0.08, 'sine');
            rig.status(placed.size < 3 ? `${placed.size}/3 attached` : 'Headgear on.', placed.size < 3 ? '' : 'ok');
            if (placed.size === 3) {
                rig.later(() => resolve(true), 500);
            }
        };
        wrap.querySelectorAll('[data-pt]').forEach((b) => b.addEventListener('click', () => place(Number(b.getAttribute('data-pt')))));
        // Drag a pad from the tray onto a point.
        rig.stage.querySelectorAll('.pp-ms-pad-el').forEach((pad) => {
            pad.addEventListener('pointerdown', (e) => {
                const ev = /** @type {PointerEvent} */ (e);
                if (pad.classList.contains('pp-ms-used')) {
                    return;
                }
                const ghost = /** @type {HTMLElement} */ (pad.cloneNode());
                ghost.classList.add('pp-ms-ghost');
                rig.dlg.appendChild(ghost);
                const move = (m) => {
                    ghost.style.left = `${m.clientX}px`;
                    ghost.style.top = `${m.clientY}px`;
                };
                move(ev);
                const up = (u) => {
                    window.removeEventListener('pointermove', move);
                    window.removeEventListener('pointerup', up);
                    ghost.remove();
                    const hitEl = /** @type {HTMLElement | null} */ (document.elementFromPoint(u.clientX, u.clientY)?.closest?.('[data-pt]') || null);
                    let best = hitEl ? Number(hitEl.getAttribute('data-pt')) : -1;
                    if (best < 0) {
                        const r = wrap.getBoundingClientRect();
                        let bestD = 34;
                        targets.forEach((t, i) => {
                            const d = Math.hypot(r.left + (t.x / 100) * r.width - u.clientX, r.top + (t.y / 100) * r.height - u.clientY);
                            if (d < bestD && !placed.has(i)) {
                                bestD = d;
                                best = i;
                            }
                        });
                    }
                    if (best >= 0) {
                        place(best);
                    }
                };
                window.addEventListener('pointermove', move);
                window.addEventListener('pointerup', up);
            });
        });
        rig.onKey((e) => {
            if (e.key === ' ' || e.key === 'Enter') {
                const next = targets.findIndex((_, i) => !placed.has(i));
                if (next >= 0) {
                    place(next);
                }
                return true;
            }
            if (/^[1-3]$/.test(e.key)) {
                place(Number(e.key) - 1);
                return true;
            }
        });
        /** @type {HTMLElement | null} */ (wrap.querySelector('[data-pt]'))?.focus();
    });
}

// —— Public ——

/**
 * Set up the PhoneWave before your D-Mail.
 * @param {{ arriveAt?: string }} [opts] arrival from compose (datetime-local)
 * @returns {Promise<{ ok: boolean, arriveAt: string }>} ok=false: cancelled, nothing sent
 */
export async function runDmailSetup(opts = {}) {
    const draft = { arriveAt: String(opts.arriveAt || '') };
    const rig = openRig('PHONEWAVE (NAME SUBJECT TO CHANGE) · D-MAIL', ['Braun tube', 'Timer', 'Call it', 'Send']);
    try {
        const out = await runStages(rig, [
            stageBraun,
            (r) => stageTimer(r, draft),
            stageDial,
            (r) => stageDischarge(r, { label: 'SEND', intro: 'The discharge is building. Send the mail while it peaks.' }),
        ]);
        return { ok: out !== 'cancel', arriveAt: draft.arriveAt };
    } finally {
        rig.close();
    }
}

/**
 * Set up the Time Leap Machine before your leap.
 * @param {{ onEnter?: () => void }} [opts] runs inside the final click (audio unlock)
 * @returns {Promise<boolean>} false = cancelled
 */
export async function runLeapSetup(opts = {}) {
    const rig = openRig('TIME LEAP MACHINE · TLM.EXE', ['Braun tube', 'Headgear', 'Enter']);
    let entered = false;
    try {
        const out = await runStages(rig, [
            stageBraun,
            stageHeadgear,
            (r) => stageDischarge(r, {
                label: 'ENTER',
                intro: 'The PhoneWave is on the line and charging. Hit Enter at the peak.',
                band: [80, 94],
                forgiving: true,
                onHit: () => {
                    entered = true;
                    opts.onEnter?.();
                },
            }),
        ]);
        if (out === 'skip' && !entered) {
            opts.onEnter?.();
        }
        return out !== 'cancel';
    } finally {
        rig.close();
    }
}

export function initMachineSetupUi() {
    bindToggle('#pp_ms_enabled', 'machineSetup');
    bindToggle('#pp_ms_dmail', 'machineSetupDmail');
    bindToggle('#pp_ms_leap', 'machineSetupLeap');
    bindToggle('#pp_ms_braun', 'braunTubeRequired');
    bindValue('#pp_ms_hours', 'braunTubeHours');
}
