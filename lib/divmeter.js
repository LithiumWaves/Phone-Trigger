/**
 * Live divergence meter — a canvas remake of divmeter.mp4 that can land on any value.
 *
 * Timeline (matches the 6.04 s clip so its soundtrack stays in sync):
 *   0.00–1.25  camera pulls back from a close-up of the starting value
 *   1.30–3.00  every unlocked tube ticks +1 per frame; decimals lock left → right,
 *              the integer tube spins until last
 *   3.00–3.35  settle flash
 *   3.35–4.40  hold
 *   4.40–6.04  tubes recede into the streaks, fade to black
 */

export const DIVMETER_DURATION = 6.04;

const T_ROLL = 1.3;
const T_LOCK_FIRST = 2.1;
const T_LOCK_STEP = 0.16;
const T_LOCK_INT = 3.0;
const T_OUT = 4.4;
const T_ARM_DISTORT = 5.2;
const TICK = 1 / 24;

/** Glyph box: x 0..1, y 0..1.6 */
const GLYPH_H = 1.6;

/** @type {Record<string, (p: Path2D) => void>} */
const GLYPHS = {
    '0': (p) => p.ellipse(0.5, 0.8, 0.42, 0.76, 0, 0, Math.PI * 2),
    '1': (p) => {
        p.moveTo(0.28, 0.32);
        p.lineTo(0.56, 0.04);
        p.lineTo(0.56, 1.56);
    },
    '2': (p) => {
        p.moveTo(0.1, 0.44);
        p.bezierCurveTo(0.1, -0.06, 0.9, -0.06, 0.9, 0.44);
        p.bezierCurveTo(0.9, 0.7, 0.6, 0.9, 0.08, 1.56);
        p.lineTo(0.95, 1.56);
    },
    '3': (p) => {
        p.moveTo(0.1, 0.04);
        p.lineTo(0.9, 0.04);
        p.lineTo(0.42, 0.68);
        p.bezierCurveTo(0.98, 0.6, 1.02, 1.56, 0.5, 1.56);
        p.bezierCurveTo(0.26, 1.56, 0.12, 1.42, 0.08, 1.26);
    },
    '4': (p) => {
        p.moveTo(0.72, 1.56);
        p.lineTo(0.72, 0.04);
        p.lineTo(0.04, 1.1);
        p.lineTo(0.98, 1.1);
    },
    '5': (p) => {
        p.moveTo(0.9, 0.04);
        p.lineTo(0.2, 0.04);
        p.lineTo(0.13, 0.7);
        p.bezierCurveTo(0.36, 0.55, 0.96, 0.56, 0.93, 1.1);
        p.bezierCurveTo(0.9, 1.62, 0.26, 1.66, 0.08, 1.34);
    },
    '6': (p) => {
        p.moveTo(0.84, 0.12);
        p.bezierCurveTo(0.5, -0.08, 0.08, 0.18, 0.1, 1.08);
        p.moveTo(0.9, 1.13);
        p.ellipse(0.5, 1.13, 0.4, 0.43, 0, 0, Math.PI * 2);
    },
    '7': (p) => {
        p.moveTo(0.04, 0.04);
        p.lineTo(0.96, 0.04);
        p.lineTo(0.36, 1.56);
    },
    '8': (p) => {
        p.moveTo(0.83, 0.42);
        p.ellipse(0.5, 0.42, 0.33, 0.38, 0, 0, Math.PI * 2);
        p.moveTo(0.92, 1.16);
        p.ellipse(0.5, 1.16, 0.42, 0.4, 0, 0, Math.PI * 2);
    },
    '9': (p) => {
        p.moveTo(0.9, 0.48);
        p.ellipse(0.5, 0.48, 0.4, 0.43, 0, 0, Math.PI * 2);
        p.moveTo(0.9, 0.5);
        p.bezierCurveTo(0.92, 1.3, 0.52, 1.66, 0.14, 1.44);
    },
};

/** @type {Map<string, Path2D>} */
const glyphCache = new Map();

function glyphPath(ch) {
    let p = glyphCache.get(ch);
    if (!p) {
        p = new Path2D();
        GLYPHS[ch]?.(p);
        glyphCache.set(ch, p);
    }
    return p;
}

/**
 * Normalise to "d.dddddd" or null.
 * @param {unknown} value
 * @returns {string | null}
 */
export function formatDivergence(value) {
    const n = Number.parseFloat(String(value ?? '').replace(',', '.'));
    if (!Number.isFinite(n)) {
        return null;
    }
    return Math.min(9.999999, Math.max(0, n)).toFixed(6);
}

/** "1.130426" → ['1', '.', '1', '3', '0', '4', '2', '6'] */
function tubeChars(value) {
    const v = formatDivergence(value) || '0.000000';
    return [v[0], '.', ...v.slice(2).split('')];
}

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const ramp = (t, a, b) => clamp01((t - a) / (b - a));

// —— Tubes ——

/**
 * Pre-render glass, mesh, ghost numerals and fittings for one tube.
 * @param {number} w tube width in device px
 * @param {number} h tube height in device px
 */
function buildTubeSprite(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(w);
    c.height = Math.ceil(h);
    const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    const capH = h * 0.07;
    const baseH = h * 0.2;
    const r = w * 0.12;

    // Glass body
    const glass = g.createLinearGradient(0, 0, w, 0);
    glass.addColorStop(0, 'rgba(70, 44, 36, 0.75)');
    glass.addColorStop(0.18, 'rgba(34, 20, 16, 0.55)');
    glass.addColorStop(0.5, 'rgba(18, 10, 8, 0.45)');
    glass.addColorStop(0.82, 'rgba(34, 20, 16, 0.55)');
    glass.addColorStop(1, 'rgba(70, 44, 36, 0.75)');
    g.fillStyle = glass;
    g.beginPath();
    g.roundRect(0, capH * 0.6, w, h - capH * 0.6 - baseH * 0.5, [r, r, 0, 0]);
    g.fill();

    // Glass edge highlights
    g.strokeStyle = 'rgba(255, 210, 180, 0.16)';
    g.lineWidth = Math.max(1, w * 0.012);
    g.beginPath();
    g.moveTo(w * 0.06, capH * 1.2);
    g.lineTo(w * 0.06, h - baseH);
    g.moveTo(w * 0.94, capH * 1.2);
    g.lineTo(w * 0.94, h - baseH);
    g.stroke();

    // Digit cage: mesh grid
    const box = tubeGlyphBox(w, h);
    g.save();
    g.strokeStyle = 'rgba(255, 120, 50, 0.13)';
    g.lineWidth = Math.max(0.6, w * 0.006);
    const step = w * 0.07;
    g.beginPath();
    for (let x = box.x - step; x <= box.x + box.w + step; x += step) {
        g.moveTo(x, box.y - step);
        g.lineTo(x, box.y + box.h + step);
    }
    for (let y = box.y - step; y <= box.y + box.h + step; y += step) {
        g.moveTo(box.x - step, y);
        g.lineTo(box.x + box.w + step, y);
    }
    g.stroke();
    g.restore();

    // Ghost cathodes: every numeral, faint
    g.save();
    g.translate(box.x, box.y);
    g.scale(box.w, box.w);
    g.strokeStyle = 'rgba(255, 120, 60, 0.16)';
    g.lineWidth = 0.025;
    for (const ch of Object.keys(GLYPHS)) {
        g.stroke(glyphPath(ch));
    }
    g.restore();

    // Top cap with orange getter ring
    const cap = g.createLinearGradient(0, 0, 0, capH);
    cap.addColorStop(0, '#2c2826');
    cap.addColorStop(1, '#0c0909');
    g.fillStyle = cap;
    g.beginPath();
    g.roundRect(w * 0.04, 0, w * 0.92, capH, capH * 0.4);
    g.fill();
    g.strokeStyle = 'rgba(255, 110, 40, 0.75)';
    g.lineWidth = Math.max(1, w * 0.02);
    g.beginPath();
    g.ellipse(w * 0.5, capH * 1.55, w * 0.2, capH * 0.35, 0, 0, Math.PI * 2);
    g.stroke();

    // Base: socket, pins, rim
    const by = h - baseH;
    const base = g.createLinearGradient(0, by, 0, h);
    base.addColorStop(0, 'rgba(30, 22, 20, 0.95)');
    base.addColorStop(0.6, 'rgba(14, 10, 10, 1)');
    base.addColorStop(1, 'rgba(46, 38, 36, 1)');
    g.fillStyle = base;
    g.fillRect(0, by, w, baseH);
    g.fillStyle = 'rgba(160, 140, 130, 0.12)';
    for (let i = 0; i < 5; i++) {
        g.fillRect(w * (0.2 + i * 0.15) - w * 0.015, by + baseH * 0.2, w * 0.03, baseH * 0.45);
    }
    g.strokeStyle = 'rgba(220, 200, 190, 0.18)';
    g.lineWidth = Math.max(1, w * 0.012);
    g.beginPath();
    g.ellipse(w * 0.5, h - baseH * 0.12, w * 0.46, baseH * 0.1, 0, 0, Math.PI * 2);
    g.stroke();
    return c;
}

function tubeGlyphBox(w, h) {
    const gw = w * 0.78;
    return { x: (w - gw) / 2, y: h * 0.14, w: gw, h: gw * GLYPH_H };
}

/**
 * Lit cathode with neon glow.
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} ch digit or '.'
 * @param {number} w
 * @param {number} h
 * @param {number} glow 1 = normal, >1 = flash
 */
function drawLit(ctx, ch, w, h, glow) {
    const box = tubeGlyphBox(w, h);
    ctx.save();
    ctx.translate(box.x, box.y);
    ctx.scale(box.w, box.w);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const passes = [
        { width: 0.13, color: `rgba(255, 90, 0, ${0.4 * glow})`, blur: w * 0.24 * glow },
        { width: 0.07, color: `rgba(255, 168, 40, ${Math.min(1, 0.9 * glow)})`, blur: w * 0.08 },
        { width: 0.034, color: `rgba(255, 222, 130, ${Math.min(1, 0.95 * glow)})`, blur: w * 0.02 },
    ];
    for (const pass of passes) {
        ctx.shadowColor = 'rgba(255, 96, 0, 0.95)';
        ctx.shadowBlur = pass.blur;
        if (ch === '.') {
            ctx.fillStyle = pass.color;
            ctx.beginPath();
            ctx.arc(0.86, 1.5, pass.width * 0.9, 0, Math.PI * 2);
            ctx.fill();
        } else if (ch === ':') {
            // Colon tube (Lab Radio clock): two neon dots
            ctx.fillStyle = pass.color;
            ctx.beginPath();
            ctx.arc(0.5, 0.52, pass.width * 1.1, 0, Math.PI * 2);
            ctx.arc(0.5, 1.12, pass.width * 1.1, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.strokeStyle = pass.color;
            ctx.lineWidth = pass.width;
            ctx.stroke(glyphPath(ch));
        }
    }
    ctx.restore();

    // Anode mesh sits in front of the cathodes and darkens the glow in a fine grid
    ctx.save();
    ctx.strokeStyle = 'rgba(10, 4, 2, 0.45)';
    ctx.lineWidth = Math.max(0.6, w * 0.01);
    const step = w * 0.07;
    ctx.beginPath();
    for (let x = box.x - step; x <= box.x + box.w + step; x += step) {
        ctx.moveTo(x, box.y - step);
        ctx.lineTo(x, box.y + box.h + step);
    }
    for (let y = box.y - step; y <= box.y + box.h + step; y += step) {
        ctx.moveTo(box.x - step, y);
        ctx.lineTo(box.x + box.w + step, y);
    }
    ctx.stroke();
    ctx.restore();
}

/**
 * Tube body plus every lit cathode, pre-rendered at one size so frames are plain blits
 * (neon shadow blur is far too slow to redo per frame on phones).
 * @param {number} w
 * @param {number} h
 */
function buildTubeSet(w, h) {
    const pad = Math.ceil(w * 0.4);
    /** @type {Map<string, HTMLCanvasElement>} */
    const lit = new Map();
    for (const ch of [...Object.keys(GLYPHS), '.', ':']) {
        const c = document.createElement('canvas');
        c.width = Math.ceil(w + pad * 2);
        c.height = Math.ceil(h + pad * 2);
        const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
        g.translate(pad, pad);
        drawLit(g, ch, w, h, 1);
        lit.set(ch, c);
    }
    return { w, h, pad, tube: buildTubeSprite(w, h), lit };
}

/**
 * Lay out and draw the 8-tube row centred on (cx, cy).
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ chars: string[], tubeW: number, tubeH: number, cx: number, cy: number, glow: number, set: ReturnType<typeof buildTubeSet> }} o
 */
function drawTubeRow(ctx, o) {
    const gap = o.tubeW * 0.14;
    const total = o.chars.length * o.tubeW + (o.chars.length - 1) * gap;
    const k = o.tubeW / o.set.w;
    const pad = o.set.pad * k;
    let x = o.cx - total / 2;
    const y = o.cy - o.tubeH / 2;
    for (const ch of o.chars) {
        ctx.drawImage(o.set.tube, x, y, o.tubeW, o.tubeH);
        const lit = o.set.lit.get(ch);
        if (lit) {
            const lw = lit.width * k;
            const lh = lit.height * k;
            ctx.drawImage(lit, x - pad, y - pad, lw, lh);
            if (o.glow > 1) {
                // Settle flash: add the cathode on top of itself
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                ctx.globalAlpha = Math.min(1, (o.glow - 1) * 0.7);
                ctx.drawImage(lit, x - pad, y - pad, lw, lh);
                ctx.restore();
            }
        }
        x += o.tubeW + gap;
    }
}

// —— Background ——

const EQUATIONS = [
    { text: 'ds² = −c²(1 − 2GM/c²r) dt² + …', x: 0.56, y: 0.13, size: 0.075, t0: 1.25, t1: 2.6, dx: -0.04 },
    { text: 'Rμν − ½ R gμν + Λ gμν = 8πG/c⁴ Tμν', x: 0.25, y: 0.86, size: 0.05, t0: 1.6, t1: 3.2, dx: 0.05 },
    { text: 'Σ/Δ dr² + Σ dθ² + (r² + a² + 2Mra² sin²θ/Σ) sin²θ dφ²', x: 0.45, y: 0.08, size: 0.07, t0: 2.4, t1: 4.6, dx: -0.06 },
    { text: '− 4Mra sin²θ/Σ dt dφ + Σ/Δ dr² + r²dθ²', x: 0.5, y: 0.9, size: 0.055, t0: 2.6, t1: 4.8, dx: 0.04 },
    { text: 'Rμν − ½ R gμν', x: 0.82, y: 0.78, size: 0.045, t0: 3.2, t1: 4.9, dx: -0.03 },
];

function seeded(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

function makeStreaks(count) {
    const rnd = seeded(20100610);
    return Array.from({ length: count }, () => {
        let bits = '';
        const len = 10 + Math.floor(rnd() * 22);
        for (let i = 0; i < len; i++) {
            bits += rnd() < 0.5 ? '0' : '1';
        }
        return {
            bits,
            y: rnd(),
            x: rnd() * 1.4 - 0.2,
            speed: (rnd() < 0.5 ? -1 : 1) * (0.03 + rnd() * 0.12),
            size: 0.012 + rnd() * 0.02,
            alpha: 0.12 + rnd() * 0.3,
        };
    });
}

/** Soft layers render at this fraction of full size; upscaling blurs them for free. */
const LOW_RES = 1 / 3;

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} W
 * @param {number} H
 * @param {number} t seconds
 * @param {ReturnType<typeof makeStreaks>} streaks
 * @param {HTMLCanvasElement} low scratch canvas for the soft layers
 */
function drawBackground(ctx, W, H, t, streaks, low) {
    const bg = ctx.createRadialGradient(W * 0.5, H * 0.55, 0, W * 0.5, H * 0.55, Math.max(W, H) * 0.75);
    bg.addColorStop(0, '#2c0705');
    bg.addColorStop(0.55, '#140302');
    bg.addColorStop(1, '#050101');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const lw = Math.max(1, Math.round(W * LOW_RES));
    const lh = Math.max(1, Math.round(H * LOW_RES));
    if (low.width !== lw || low.height !== lh) {
        low.width = lw;
        low.height = lh;
    }
    const g = /** @type {CanvasRenderingContext2D} */ (low.getContext('2d'));
    g.clearRect(0, 0, lw, lh);
    const S = Math.max(lw, lh);

    // Red tunnel rings (floor + ceiling), drifting outward
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const [cy, squash, strength] of [[lh * 0.78, 0.2, 1], [lh * 0.18, 0.14, 0.55]]) {
        for (let i = 0; i < 16; i++) {
            const phase = ((i + t * 0.6) % 16) / 16;
            const rx = S * (0.12 + phase * 0.9);
            g.strokeStyle = `rgba(210, 34, 18, ${(0.08 + 0.2 * Math.sin(phase * Math.PI)) * strength})`;
            g.lineWidth = S * (0.003 + phase * 0.02);
            g.beginPath();
            g.ellipse(lw * 0.5, cy, rx, rx * squash, 0, 0, Math.PI * 2);
            g.stroke();
        }
    }
    g.restore();

    // Darken behind the tube row
    const band = g.createLinearGradient(0, lh * 0.2, 0, lh * 0.8);
    band.addColorStop(0, 'rgba(0, 0, 0, 0)');
    band.addColorStop(0.5, 'rgba(0, 0, 0, 0.6)');
    band.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = band;
    g.fillRect(0, 0, lw, lh);
    g.globalCompositeOperation = 'source-over';

    // Binary text streaks
    g.textBaseline = 'middle';
    for (const st of streaks) {
        const x = (((st.x + st.speed * t) % 1.4) + 1.4) % 1.4 - 0.2;
        g.font = `600 ${Math.max(4, Math.round(st.size * lh))}px "Courier New", monospace`;
        g.fillStyle = `rgba(235, 225, 220, ${st.alpha})`;
        g.fillText(st.bits, x * lw, st.y * lh);
    }

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(low, 0, 0, W, H);
    ctx.restore();

    // Handwritten field equations
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(255, 70, 0, 0.8)';
    ctx.shadowBlur = Math.max(W, H) * 0.008;
    for (const e of EQUATIONS) {
        const a = Math.min(ramp(t, e.t0, e.t0 + 0.35), 1 - ramp(t, e.t1 - 0.5, e.t1));
        if (a <= 0) {
            continue;
        }
        ctx.globalAlpha = a * 0.9;
        ctx.fillStyle = '#ff5e1a';
        ctx.font = `italic ${Math.round(e.size * H)}px "Segoe Print", "Bradley Hand", "Comic Sans MS", cursive`;
        ctx.fillText(e.text, (e.x + e.dx * (t - e.t0)) * W, e.y * H);
    }
    ctx.restore();
}

// —— Scene ——

/**
 * Tube characters at time t: rolling from `from` and locking onto `to`.
 * @param {string[]} fromChars
 * @param {string[]} toChars
 * @param {number} t
 */
function charsAt(fromChars, toChars, t) {
    if (t < T_ROLL) {
        return fromChars;
    }
    const ticks = Math.floor((t - T_ROLL) / TICK) + 1;
    return toChars.map((target, i) => {
        if (i === 1) {
            return '.';
        }
        const lockAt = i === 0 ? T_LOCK_INT : T_LOCK_FIRST + (i - 2) * T_LOCK_STEP;
        if (t >= lockAt) {
            return target;
        }
        return String((Number(fromChars[i]) + ticks) % 10);
    });
}

/**
 * Draw one frame of the full-screen scene.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ W: number, H: number, t: number, fromChars: string[], toChars: string[], streaks: ReturnType<typeof makeStreaks>, low: HTMLCanvasElement, setFor: (w: number, h: number) => ReturnType<typeof buildTubeSet> }} o
 */
function drawScene(ctx, o) {
    const { W, H, t } = o;
    drawBackground(ctx, W, H, t, o.streaks, o.low);

    // Camera: pull back, hold, recede
    const pull = easeOutCubic(clamp01(t / 1.25));
    let scale = 2.3 - 1.3 * pull;
    scale *= 1 - 0.07 * ramp(t, 3.35, T_OUT);
    const out = easeInOut(ramp(t, T_OUT, 5.6));
    scale *= 1 - 0.25 * out;
    const rowAlpha = 1 - out;

    const tubeW = Math.min(W * 0.92 / (8 + 7 * 0.14), H * 0.5 / 2.6) * scale;
    const tubeH = tubeW * 2.6;
    const glow = 1 + 0.9 * (1 - ramp(t, T_LOCK_INT, 3.35)) * (t >= T_LOCK_INT ? 1 : 0);

    ctx.save();
    ctx.globalAlpha = rowAlpha;
    if (t < 0.5 && 'filter' in ctx) {
        ctx.filter = `blur(${(1 - t / 0.5) * 6}px)`;
    }
    drawTubeRow(ctx, {
        chars: charsAt(o.fromChars, o.toChars, t),
        tubeW,
        tubeH,
        cx: W * 0.5,
        cy: H * (0.5 - 0.04 * out),
        glow,
        set: o.setFor(tubeW, tubeH),
    });
    ctx.restore();

    // Fade in from / out to black
    const black = Math.max(1 - ramp(t, 0, 0.35), ramp(t, 5.6, DIVMETER_DURATION));
    if (black > 0) {
        ctx.fillStyle = `rgba(0, 0, 0, ${black})`;
        ctx.fillRect(0, 0, W, H);
    }
}

function tubeSetCache() {
    /** @type {ReturnType<typeof buildTubeSet> | null} */
    let cached = null;
    // Rebuild only when the size changes noticeably (the camera moves continuously).
    return (w, h) => {
        if (!cached || Math.abs(cached.w - w) / w > 0.12) {
            cached = buildTubeSet(w, h);
        }
        return cached;
    };
}

/**
 * Mount the animated meter on a canvas and run it once.
 * @param {HTMLCanvasElement} canvas
 * @param {{
 *   from: string,
 *   to: string,
 *   onArmDistort?: () => void,
 *   onDone?: () => void,
 * }} opts
 * @returns {() => void} stop
 */
export function runDivergenceScene(canvas, opts) {
    const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
    const fromChars = tubeChars(opts.from);
    const toChars = tubeChars(opts.to);
    const streaks = makeStreaks(46);
    const setFor = tubeSetCache();
    const low = document.createElement('canvas');
    const start = performance.now();
    let raf = 0;
    let armed = false;
    let stopped = false;

    const frame = () => {
        if (stopped) {
            return;
        }
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const W = Math.round(canvas.clientWidth * dpr);
        const H = Math.round(canvas.clientHeight * dpr);
        if (canvas.width !== W || canvas.height !== H) {
            canvas.width = W;
            canvas.height = H;
        }
        const t = (performance.now() - start) / 1000;
        drawScene(ctx, { W, H, t, fromChars, toChars, streaks, low, setFor });
        if (!armed && t >= T_ARM_DISTORT) {
            armed = true;
            opts.onArmDistort?.();
        }
        if (t >= DIVMETER_DURATION) {
            stopped = true;
            opts.onDone?.();
            return;
        }
        raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
        stopped = true;
        cancelAnimationFrame(raf);
    };
}

/**
 * Static meter (phone home screen): tubes only, on a transparent canvas.
 * @param {HTMLCanvasElement} canvas
 * @param {string} value
 */
export function drawStaticMeter(canvas, value) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const H = Math.max(1, Math.round(canvas.clientHeight * dpr));
    canvas.width = W;
    canvas.height = H;
    const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
    ctx.clearRect(0, 0, W, H);
    const tubeW = Math.min(W / (8 + 7 * 0.14), H / 2.6);
    const tubeH = tubeW * 2.6;
    drawTubeRow(ctx, {
        chars: tubeChars(value),
        tubeW,
        tubeH,
        cx: W / 2,
        cy: H / 2,
        glow: 1,
        set: buildTubeSet(tubeW, tubeH),
    });
}

/** @type {{ key: string, set: ReturnType<typeof buildTubeSet> } | null} */
let rowCache = null;

/**
 * A row of the meter's nixie tubes showing any characters (digits, '.', ':'; anything else
 * leaves that tube unlit, ghost cathodes only). Used by Lab Radio.
 * @param {HTMLCanvasElement} canvas sized by CSS; drawn at device resolution
 * @param {string[]} chars
 * @param {{ alpha?: number, pool?: boolean }} [opts] alpha = lit brightness (paused: dimmer);
 *   pool = orange glow spilling onto the board under each lit tube
 */
export function drawNixieRow(canvas, chars, opts = {}) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const H = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== W || canvas.height !== H) {
        canvas.width = W;
        canvas.height = H;
    }
    const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
    ctx.clearRect(0, 0, W, H);
    const n = chars.length;
    const gapK = 0.14;
    const tubeW = Math.min(W / (n + (n - 1) * gapK), (H * 0.94) / 2.6);
    const tubeH = tubeW * 2.6;
    const key = `${Math.round(tubeW)}x${Math.round(tubeH)}`;
    if (!rowCache || rowCache.key !== key) {
        rowCache = { key, set: buildTubeSet(tubeW, tubeH) };
    }
    const set = rowCache.set;
    const alpha = Math.max(0, Math.min(1, opts.alpha ?? 1));
    const gap = tubeW * gapK;
    const total = n * tubeW + (n - 1) * gap;
    const y = H - tubeH;
    let x = (W - total) / 2;
    const k = tubeW / set.w;
    const pad = set.pad * k;
    for (const ch of chars) {
        const lit = set.lit.get(ch);
        if (opts.pool && lit) {
            // Glow pooling on the board at the tube's foot
            const g = ctx.createRadialGradient(x + tubeW / 2, H - tubeH * 0.06, 0, x + tubeW / 2, H - tubeH * 0.06, tubeW * 1.1);
            g.addColorStop(0, `rgba(255, 120, 30, ${0.32 * alpha})`);
            g.addColorStop(1, 'rgba(255, 120, 30, 0)');
            ctx.fillStyle = g;
            ctx.fillRect(x - tubeW * 0.6, H - tubeH * 0.35, tubeW * 2.2, tubeH * 0.35);
        }
        ctx.drawImage(set.tube, x, y, tubeW, tubeH);
        if (lit && alpha > 0) {
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.drawImage(lit, x - pad, y - pad, lit.width * k, lit.height * k);
            ctx.restore();
        }
        x += tubeW + gap;
    }
}
