/**
 * The discharge phenomenon: the lightning that crawls over the room as a time leap charges,
 * building until a white-blue flash drops everything to black — where the cutscene takes over.
 *
 * Procedural canvas bolts over the chat screen. Sound: lib/audio/discharge.mp3 — its electricity
 * loops while the leap charges, the build plays out to the cut (8.0 s) where the flash lands, and
 * its tail plays once the chat has branched (playDischargeArrival). A synthesized build stands in
 * if the clip will not load.
 *
 * const d = startDischarge();          // starts at once
 * await somethingSlow();               // e.g. memory compression: the discharge keeps building
 * await d.finish();                    // climax; resolves on black
 * playTimeleapSequence(…); d.remove(); // cutscene dialog is up (black backdrop): drop ours
 * await executeLeap(…); playDischargeArrival(); // the chat has branched
 *
 * finish({ toBlack: false }) fades back to the chat instead (no cutscene follows).
 */
import { EXTENSION_FOLDER, LEGACY_EXTENSION_FOLDER } from './constants.js';
import { getSettings, reduceFlashing } from './settings.js';
import { getAudioContext } from './audio.js';

const DIALOG_ID = 'pp-discharge';
/** A full-screen wash at most this often (photosensitivity). */
const WASH_EVERY_MS = 3800;
const MAX_BOLTS = 18;

function wantSound() {
    const s = getSettings();
    return s.soundEnabled !== false && s.timeleapSound !== false;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// —— Bolts ——

/**
 * Jagged path from a to b by midpoint displacement.
 * @returns {Array<[number, number]>}
 */
function jag(ax, ay, bx, by, spread, depth) {
    /** @type {Array<[number, number]>} */
    let pts = [[ax, ay], [bx, by]];
    let off = spread;
    for (let d = 0; d < depth; d++) {
        /** @type {Array<[number, number]>} */
        const next = [pts[0]];
        for (let i = 1; i < pts.length; i++) {
            const [x1, y1] = pts[i - 1];
            const [x2, y2] = pts[i];
            const len = Math.hypot(x2 - x1, y2 - y1) || 1;
            const nx = -(y2 - y1) / len;
            const ny = (x2 - x1) / len;
            const k = (Math.random() * 2 - 1) * off;
            next.push([(x1 + x2) / 2 + nx * k, (y1 + y2) / 2 + ny * k], pts[i]);
        }
        pts = next;
        off *= 0.55;
    }
    return pts;
}

/**
 * A bolt crawling in from a screen edge, with a branch or two.
 * @param {number} w @param {number} h @param {number} p build progress 0..1
 */
function makeBolt(w, h, p) {
    const edge = Math.floor(Math.random() * 4);
    const r = Math.random();
    const [ax, ay] = edge === 0 ? [r * w, -10] : edge === 1 ? [w + 10, r * h] : edge === 2 ? [r * w, h + 10] : [-10, r * h];
    const diag = Math.hypot(w, h);
    const reach = diag * (0.22 + 0.45 * p) * (0.6 + Math.random() * 0.6);
    // Aim loosely across the screen, not always at the centre.
    const tx = w * (0.15 + Math.random() * 0.7);
    const ty = h * (0.15 + Math.random() * 0.7);
    const ang = Math.atan2(ty - ay, tx - ax) + (Math.random() - 0.5) * 0.9;
    const bx = ax + Math.cos(ang) * reach;
    const by = ay + Math.sin(ang) * reach;
    const main = jag(ax, ay, bx, by, reach * 0.2, 6);
    const paths = [main];
    const branches = Math.random() < 0.35 + 0.4 * p ? 1 + Math.floor(Math.random() * 2) : 0;
    for (let i = 0; i < branches; i++) {
        const [sx, sy] = main[Math.floor(main.length * (0.3 + Math.random() * 0.5))];
        const bang = ang + (Math.random() < 0.5 ? -1 : 1) * (0.4 + Math.random() * 0.7);
        const blen = reach * (0.2 + Math.random() * 0.35);
        paths.push(jag(sx, sy, sx + Math.cos(bang) * blen, sy + Math.sin(bang) * blen, blen * 0.22, 5));
    }
    return { paths, born: performance.now(), life: 70 + Math.random() * 160, width: 0.7 + Math.random() * 0.8 };
}

/** @param {CanvasRenderingContext2D} g @param {Array<[number, number]>} pts */
function stroke(g, pts) {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
        g.lineTo(pts[i][0], pts[i][1]);
    }
    g.stroke();
}

// —— Sound: the clip ——
//
// discharge.mp3: 0–3 s the electricity, 3–8 s the build to the flash, silence, then from 8.3 s
// the sound the VN plays once the leap has landed (the worldline has branched).

/** The electricity that repeats while the leap is still charging (s). */
const CLIP_LOOP = [0.5, 3.0];
/** Where the clip goes silent: the flash. */
const CLIP_CUT = 8.0;
/** The arrival sound, after the silence. */
const CLIP_TAIL = 8.25;
/** Crossfade between loop passes, so the seam does not click. */
const LOOP_XF = 0.12;
/** How early the next loop pass is scheduled (timers can be late in background tabs). */
const LOOKAHEAD = 0.4;

/** @type {Promise<AudioBuffer | null> | null} */
let clipBuffer = null;

function clipSources() {
    return [
        `/${EXTENSION_FOLDER}/lib/audio/discharge.mp3`,
        `/${LEGACY_EXTENSION_FOLDER}/lib/audio/discharge.mp3`,
    ];
}

/** Fetch and decode the clip once. @param {AudioContext} ac */
function loadClip(ac) {
    if (!clipBuffer) {
        clipBuffer = (async () => {
            for (const url of clipSources()) {
                try {
                    const res = await fetch(url);
                    if (res.ok) {
                        return await ac.decodeAudioData(await res.arrayBuffer());
                    }
                } catch {
                    /* next */
                }
            }
            return null;
        })();
    }
    return clipBuffer;
}

/**
 * Loop the clip's electricity until released; then the pass playing runs on into the build
 * and out to the cut, so the build is only heard when the leap is about to happen.
 * @param {AudioContext} ac @param {AudioBuffer} buffer
 */
function startClip(ac, buffer) {
    const master = ac.createGain();
    master.gain.value = 1;
    master.connect(ac.destination);
    /** @type {Array<{ src: AudioBufferSourceNode, gain: GainNode, at: number, offset: number }>} */
    const passes = [];
    /** @type {ReturnType<typeof setTimeout> | null} */
    let timer = null;
    let released = false;
    let stopped = false;

    /** Start a pass at clip offset `offset`, at context time `at`, fading in when it is a repeat. */
    const play = (at, offset) => {
        const gain = ac.createGain();
        gain.connect(master);
        const src = ac.createBufferSource();
        src.buffer = buffer;
        src.connect(gain);
        if (passes.length) {
            gain.gain.setValueAtTime(0, at);
            gain.gain.linearRampToValueAtTime(1, at + LOOP_XF);
        }
        src.start(at, offset);
        const pass = { src, gain, at, offset };
        passes.push(pass);
        plan(pass);
    };
    /** Before this pass reaches the loop end: fade it out under the next pass. */
    const plan = (pass) => {
        const end = pass.at + (CLIP_LOOP[1] - pass.offset);
        const xfAt = end - LOOP_XF;
        timer = setTimeout(() => {
            timer = null;
            if (released || stopped) {
                return;
            }
            const at = Math.max(ac.currentTime, xfAt);
            pass.gain.gain.setValueAtTime(1, at);
            pass.gain.gain.linearRampToValueAtTime(0, at + LOOP_XF);
            try {
                pass.src.stop(at + LOOP_XF + 0.02);
            } catch {
                /* ignore */
            }
            play(at, CLIP_LOOP[0] + (at - xfAt));
        }, Math.max(0, (xfAt - ac.currentTime - LOOKAHEAD) * 1000));
    };
    play(ac.currentTime, 0);

    return {
        crackle() {},
        zap() {},
        /** Stop looping: the current pass plays on through the build. ms until the cut. */
        untilCut() {
            released = true;
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            const last = passes[passes.length - 1];
            const cutAt = last.at + (CLIP_CUT - last.offset);
            try {
                last.src.stop(cutAt);
            } catch {
                /* ignore */
            }
            return Math.max(0, cutAt - ac.currentTime) * 1000;
        },
        stop() {
            if (stopped) {
                return;
            }
            stopped = true;
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            const now = ac.currentTime;
            try {
                master.gain.cancelScheduledValues(now);
                master.gain.setValueAtTime(master.gain.value, now);
                master.gain.linearRampToValueAtTime(0, now + 0.03);
            } catch {
                /* ignore */
            }
            for (const { src } of passes) {
                try {
                    src.stop(now + 0.05);
                } catch {
                    /* ignore */
                }
            }
        },
    };
}

/**
 * The sound after the flash: play it once the chat has branched, as the VN does on arrival.
 * Silent when sound is off or the clip will not load.
 */
export async function playDischargeArrival() {
    const ac = wantSound() ? getAudioContext() : null;
    if (!ac) {
        return;
    }
    const buffer = await loadClip(ac);
    if (!buffer || buffer.duration <= CLIP_TAIL) {
        return;
    }
    const src = ac.createBufferSource();
    src.buffer = buffer;
    src.connect(ac.destination);
    src.start(ac.currentTime, CLIP_TAIL);
}

// —— Sound: synthesized fallback ——

/** Rising hum, whine and hiss; crackles on each bolt; a zap at the flash, then silence. */
function startAudio(buildMs) {
    const ac = wantSound() ? getAudioContext() : null;
    if (!ac) {
        return null;
    }
    const t0 = ac.currentTime;
    const T = buildMs / 1000;
    const master = ac.createGain();
    master.gain.setValueAtTime(0.0001, t0);
    master.gain.exponentialRampToValueAtTime(0.8, t0 + 0.5);
    master.connect(ac.destination);
    const nodes = [];

    const osc = (type, f0, f1, g0, g1, filter) => {
        const o = ac.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(f0, t0);
        o.frequency.linearRampToValueAtTime(f1, t0 + T);
        const g = ac.createGain();
        g.gain.setValueAtTime(g0, t0);
        g.gain.linearRampToValueAtTime(g1, t0 + T);
        if (filter) {
            o.connect(filter);
            filter.connect(g);
        } else {
            o.connect(g);
        }
        g.connect(master);
        o.start(t0);
        nodes.push(o);
        return o;
    };
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(240, t0);
    lp.frequency.linearRampToValueAtTime(1100, t0 + T);
    osc('sawtooth', 48, 64, 0.02, 0.1, lp);
    osc('sawtooth', 96, 128, 0.006, 0.035, null);
    osc('sine', 600, 2600, 0.002, 0.018, null);

    const len = ac.sampleRate * 2;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    const noise = (filterType, freq, q) => {
        const src = ac.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const f = ac.createBiquadFilter();
        f.type = filterType;
        f.frequency.value = freq;
        f.Q.value = q;
        const g = ac.createGain();
        g.gain.value = 0;
        src.connect(f);
        f.connect(g);
        g.connect(master);
        src.start(t0);
        nodes.push(src);
        return g;
    };
    const hiss = noise('highpass', 5500, 0.7);
    hiss.gain.setValueAtTime(0.004, t0);
    hiss.gain.linearRampToValueAtTime(0.035, t0 + T);
    const crackle = noise('bandpass', 3200, 0.9);
    const burst = noise('lowpass', 2600, 0.5);

    let stopped = false;
    const stop = () => {
        if (stopped) {
            return;
        }
        stopped = true;
        const now = ac.currentTime;
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(master.gain.value, now);
        master.gain.linearRampToValueAtTime(0, now + 0.03);
        setTimeout(() => {
            nodes.forEach((n) => {
                try {
                    n.stop();
                } catch {
                    /* ignore */
                }
            });
            master.disconnect();
        }, 120);
    };
    return {
        /** @param {number} p build progress */
        crackle(p) {
            if (stopped) {
                return;
            }
            const now = ac.currentTime;
            const peak = 0.12 + 0.35 * p * Math.random() + 0.08 * Math.random();
            crackle.gain.cancelScheduledValues(now);
            crackle.gain.setValueAtTime(crackle.gain.value, now);
            crackle.gain.linearRampToValueAtTime(peak, now + 0.004);
            crackle.gain.exponentialRampToValueAtTime(0.0008, now + 0.04 + Math.random() * 0.12);
        },
        zap() {
            if (stopped) {
                return;
            }
            const now = ac.currentTime;
            burst.gain.setValueAtTime(0.9, now);
            burst.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
            const o = ac.createOscillator();
            o.type = 'sawtooth';
            o.frequency.setValueAtTime(1400, now);
            o.frequency.exponentialRampToValueAtTime(50, now + 0.4);
            const g = ac.createGain();
            g.gain.setValueAtTime(0.25, now);
            g.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
            o.connect(g);
            g.connect(master);
            o.start(now);
            o.stop(now + 0.45);
        },
        stop,
    };
}

// —— The effect ——

/**
 * Start the discharge over whatever is on screen.
 * @param {{ minMs?: number }} [opts]
 */
export function startDischarge(opts = {}) {
    const minMs = Math.max(1500, Number(opts.minMs) || CLIP_CUT * 1000);
    const calm = reduceFlashing();
    document.getElementById(DIALOG_ID)?.remove();
    const dlg = document.createElement('dialog');
    dlg.id = DIALOG_ID;
    dlg.className = 'pp-discharge';
    dlg.setAttribute('aria-label', 'Discharge');
    dlg.innerHTML = `
        <canvas class="pp-discharge-canvas" aria-hidden="true"></canvas>
        <div class="pp-discharge-wash" aria-hidden="true"></div>
        <div class="pp-discharge-black" aria-hidden="true"></div>
    `;
    document.body.appendChild(dlg);
    dlg.addEventListener('cancel', (e) => e.preventDefault());
    try {
        dlg.showModal();
    } catch {
        dlg.setAttribute('open', '');
    }
    const canvas = /** @type {HTMLCanvasElement} */ (dlg.querySelector('canvas'));
    const wash = /** @type {HTMLElement} */ (dlg.querySelector('.pp-discharge-wash'));
    const black = /** @type {HTMLElement} */ (dlg.querySelector('.pp-discharge-black'));
    const g = canvas.getContext('2d');
    /** @type {any} */
    let audio = null;
    let removed = false;
    // The clip if it loads in time; the synthesized build otherwise.
    const audioReady = (async () => {
        const ac = wantSound() ? getAudioContext() : null;
        if (!ac) {
            return;
        }
        const buffer = await Promise.race([loadClip(ac), wait(1200).then(() => null)]);
        if (removed) {
            return;
        }
        audio = buffer ? startClip(ac, buffer) : startAudio(minMs);
    })();
    const start = performance.now();
    let lastWash = -Infinity;
    let lastSpawn = 0;
    let running = true;
    /** @type {ReturnType<typeof makeBolt>[]} */
    let bolts = [];

    const size = () => {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(window.innerWidth * dpr);
        canvas.height = Math.round(window.innerHeight * dpr);
        return dpr;
    };
    let dpr = size();
    const onResize = () => {
        dpr = size();
    };
    window.addEventListener('resize', onResize);

    const doWash = (strength) => {
        if (calm) {
            return;
        }
        wash.style.transition = 'none';
        wash.style.opacity = String(strength);
        void wash.offsetWidth;
        wash.style.transition = 'opacity 0.32s ease-out';
        wash.style.opacity = '0';
    };

    const frame = (now) => {
        if (!running || !g) {
            return;
        }
        const elapsed = now - start;
        const p = Math.min(1, elapsed / minMs);
        const w = canvas.width;
        const h = canvas.height;
        if (elapsed - lastWash >= WASH_EVERY_MS) {
            lastWash = elapsed;
            doWash(0.45 + 0.2 * p);
        }
        // More bolts, and longer ones, as it charges.
        const perSec = (calm ? 4 : 9) + (calm ? 6 : 18) * p;
        if (now - lastSpawn > 1000 / perSec && bolts.length < MAX_BOLTS) {
            lastSpawn = now;
            bolts.push(makeBolt(w, h, p));
            if (Math.random() < 0.3 * p) {
                bolts.push(makeBolt(w, h, p));
            }
            audio?.crackle(p);
        }
        bolts = bolts.filter((b) => now - b.born < b.life);

        g.clearRect(0, 0, w, h);
        const vig = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.hypot(w, h) / 2);
        vig.addColorStop(0, 'rgba(60, 100, 230, 0)');
        vig.addColorStop(1, `rgba(60, 100, 230, ${(0.08 + 0.16 * p) * (0.85 + Math.random() * 0.15)})`);
        g.fillStyle = vig;
        g.fillRect(0, 0, w, h);

        g.globalCompositeOperation = 'lighter';
        g.lineJoin = 'round';
        g.lineCap = 'round';
        for (const b of bolts) {
            const age = (now - b.born) / b.life;
            // Reduce flashing: a steady fade, no flicker.
            const a = (calm ? 0.7 : 0.55 + Math.random() * 0.45) * Math.sqrt(Math.max(0, 1 - age));
            g.shadowColor = 'rgba(80, 130, 255, 0.9)';
            // A wide haze, then the glow, then a hot core.
            g.shadowBlur = 0;
            g.strokeStyle = `rgba(60, 110, 255, ${a * 0.12})`;
            b.paths.forEach((pts, i) => {
                g.lineWidth = (i ? 12 : 22) * dpr * b.width;
                stroke(g, pts);
            });
            g.shadowBlur = 22 * dpr;
            g.strokeStyle = `rgba(80, 135, 255, ${a * 0.5})`;
            b.paths.forEach((pts, i) => {
                g.lineWidth = (i ? 4 : 8) * dpr * b.width;
                stroke(g, pts);
            });
            g.shadowBlur = 5 * dpr;
            g.strokeStyle = `rgba(230, 238, 255, ${a})`;
            b.paths.forEach((pts, i) => {
                g.lineWidth = (i ? 1.2 : 2.2) * dpr * b.width;
                stroke(g, pts);
            });
        }
        g.globalCompositeOperation = 'source-over';
        g.shadowBlur = 0;
        requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);

    const remove = () => {
        if (removed) {
            return;
        }
        removed = true;
        running = false;
        audio?.stop();
        window.removeEventListener('resize', onResize);
        try {
            if (dlg.open) {
                dlg.close();
            }
        } catch {
            /* ignore */
        }
        dlg.remove();
    };

    let finishing = null;
    return {
        /**
         * Climax: once the build has run its course, a flash and a drop to black.
         * @param {{ toBlack?: boolean }} [o] toBlack false: fade back to the chat and remove
         * @returns {Promise<void>} resolves on black (call remove() once the cutscene is up)
         */
        finish(o = {}) {
            if (finishing) {
                return finishing;
            }
            finishing = (async () => {
                await audioReady;
                // The clip decides when the flash lands (its cut); otherwise the minimum build.
                const left = audio?.untilCut ? audio.untilCut() : minMs - (performance.now() - start);
                if (left > 0) {
                    await wait(left);
                }
                if (removed) {
                    return;
                }
                audio?.zap();
                wash.style.transition = calm ? 'opacity 0.3s ease-in' : 'none';
                wash.style.background = '#7088d4';
                wash.style.mixBlendMode = 'normal';
                wash.style.opacity = calm ? '0.35' : '1';
                await wait(calm ? 320 : 130);
                running = false;
                g?.clearRect(0, 0, canvas.width, canvas.height);
                black.style.transition = 'opacity 0.4s ease-in';
                black.style.opacity = '1';
                wash.style.transition = 'opacity 0.4s ease-in';
                wash.style.opacity = '0';
                await wait(420);
                audio?.stop();
                if (o.toBlack === false) {
                    dlg.classList.add('pp-discharge-out');
                    await wait(450);
                    remove();
                }
            })();
            return finishing;
        },
        /** Drop it now (the cutscene is up, or the leap failed). */
        remove,
        /** The leap failed: fade out quickly. */
        async abort() {
            if (removed) {
                return;
            }
            running = false;
            audio?.stop();
            dlg.classList.add('pp-discharge-out');
            await wait(350);
            remove();
        },
    };
}

/** Whether the discharge plays for this kind of leaper. @param {'persona' | 'character'} type */
export function wantDischarge(type) {
    const s = getSettings();
    return type === 'character' ? s.charLeapDischarge !== false : s.timeleapDischarge !== false;
}
