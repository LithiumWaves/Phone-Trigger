/**
 * Live time leap — a canvas remake of timeleap.mp4 whose flip clock counts back
 * from the leap's start to its destination.
 *
 * Timeline (matches the 5.02 s clip so its soundtrack stays in sync):
 *   0.00–0.07  warp tunnel, clock on the start time
 *   0.07–0.60  white flash fades out
 *   0.57–3.57  the clock flips back in 90 even steps (one per clip frame), landing on the destination
 *   0.90–1.60  HUD panels open
 *   3.60–4.10  second white flash
 *   4.10–5.02  clock fades, tunnel sinks to black
 */
import { reduceFlashing } from './settings.js';

/** Reduce flashing, read once per scene. */
let calmFx = false;

export const TIMELEAP_DURATION = 5.02;

const T_COUNT_START = 0.55;
const T_COUNT_END = 3.55;
const COUNT_STEPS = 90;
const FLIP_S = 0.045;
const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** Reference stage: the clip's 640×360 frame. */
const STAGE_W = 640;
const STAGE_H = 360;

const RAY_COLORS = [
    [123, 60, 255],
    [166, 77, 255],
    [79, 214, 255],
    [58, 123, 255],
    [208, 70, 255],
    [230, 90, 220],
    [94, 240, 224],
    [140, 90, 255],
];

function clamp01(x) {
    return x < 0 ? 0 : x > 1 ? 1 : x;
}

function ramp(t, a, b) {
    return clamp01((t - a) / (b - a));
}

function easeOutCubic(x) {
    return 1 - (1 - x) ** 3;
}

function seeded(seed) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

function pad2(n) {
    return String(n).padStart(2, '0');
}

// —— Clock ——

/**
 * Tile strings for a moment: month (1–2 tiles), day, weekday, hour, minute.
 * @param {Date} d
 * @param {number} monthTiles
 */
function clockFace(d, monthTiles) {
    const month = String(d.getMonth() + 1).padStart(monthTiles, ' ');
    return {
        month: month.split(''),
        day: pad2(d.getDate()).split(''),
        weekday: WEEKDAYS[d.getDay()],
        hour: pad2(d.getHours()).split(''),
        minute: pad2(d.getMinutes()).split(''),
    };
}

/**
 * Clock layout in stage units, centred. Mirrors the clip: tiles 50 wide, 3 apart,
 * a green kanji label after each group, a wide weekday tile.
 * @param {number} monthTiles
 */
function clockLayout(monthTiles) {
    const TW = 50;
    const GAP = 3;
    const LABEL = 25;
    const DOW = 70;
    /** @type {Array<{ kind: 'digit' | 'dow' | 'label', key: string, x: number, w: number, text?: string }>} */
    const items = [];
    let x = 0;
    const group = (key, n, label) => {
        for (let i = 0; i < n; i++) {
            items.push({ kind: 'digit', key: `${key}${i}`, x, w: TW });
            x += TW + (i < n - 1 ? GAP : 0);
        }
        if (label) {
            items.push({ kind: 'label', key: `${key}L`, x: x + 2, w: LABEL - 4, text: label });
            x += LABEL;
        }
    };
    group('mo', monthTiles, '月');
    group('d', 2, '日');
    items.push({ kind: 'dow', key: 'dow', x, w: DOW });
    x += DOW + 8;
    group('h', 2, '時');
    group('mi', 2, '分');
    const width = x;
    const offset = (STAGE_W - width) / 2 + 4;
    for (const it of items) {
        it.x += offset;
    }
    return items;
}

const BAR_Y = 128;
const BAR_H = 100;
const TILE_Y = 143;
const TILE_H = 74;

/**
 * Pre-rendered tile faces at the current scale.
 * @param {number} u px per stage unit
 */
function makeTileCache(u) {
    /** @type {Map<string, HTMLCanvasElement>} */
    const cache = new Map();
    const w = Math.ceil(50 * u);
    const h = Math.ceil(TILE_H * u);
    return {
        u,
        w,
        h,
        /** @param {string} ch */
        get(ch) {
            let c = cache.get(ch);
            if (c) {
                return c;
            }
            c = document.createElement('canvas');
            c.width = w;
            c.height = h;
            const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
            drawTileBase(g, w, h, u);
            if (ch.trim()) {
                g.fillStyle = '#f4f4f4';
                g.font = `700 ${Math.round(80 * u)}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
                g.textAlign = 'center';
                g.textBaseline = 'middle';
                g.shadowColor = 'rgba(0,0,0,0.6)';
                g.shadowBlur = 2 * u;
                g.fillText(ch, w / 2, h / 2 + 5 * u);
                g.shadowBlur = 0;
            }
            // Hinge line
            g.fillStyle = 'rgba(0,0,0,0.9)';
            g.fillRect(0, h / 2 - 1.2 * u, w, 2.4 * u);
            g.fillStyle = 'rgba(255,255,255,0.12)';
            g.fillRect(0, h / 2 + 1.2 * u, w, 0.8 * u);
            cache.set(ch, c);
            return c;
        },
    };
}

/**
 * @param {CanvasRenderingContext2D} g
 * @param {number} w
 * @param {number} h
 * @param {number} u
 */
function drawTileBase(g, w, h, u) {
    const r = 4 * u;
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#1b1b1d');
    grad.addColorStop(0.49, '#0e0e10');
    grad.addColorStop(0.51, '#121214');
    grad.addColorStop(1, '#060607');
    g.fillStyle = grad;
    g.beginPath();
    g.roundRect ? g.roundRect(0, 0, w, h, r) : g.rect(0, 0, w, h);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.06)';
    g.lineWidth = Math.max(1, u);
    g.stroke();
}

/**
 * One split-flap tile, mid-flip when `p` < 1.
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLCanvasElement} from
 * @param {HTMLCanvasElement} to
 * @param {number} p 0..1 flip progress
 * @param {number} x
 * @param {number} y
 */
function drawFlap(ctx, from, to, p, x, y) {
    const w = to.width;
    const h = to.height;
    const half = h / 2;
    if (p >= 1) {
        ctx.drawImage(to, x, y);
        return;
    }
    // Static halves: new top, old bottom
    ctx.drawImage(to, 0, 0, w, half, x, y, w, half);
    ctx.drawImage(from, 0, half, w, half, x, y + half, w, half);
    if (p < 0.5) {
        // Old top half folds down over the hinge
        const s = 1 - p * 2;
        ctx.save();
        ctx.translate(x, y + half);
        ctx.scale(1, s);
        ctx.drawImage(from, 0, 0, w, half, 0, -half, w, half);
        ctx.fillStyle = `rgba(0,0,0,${0.5 * (1 - s)})`;
        ctx.fillRect(0, -half, w, half);
        ctx.restore();
    } else {
        // New bottom half unfolds
        const s = (p - 0.5) * 2;
        ctx.save();
        ctx.translate(x, y + half);
        ctx.scale(1, s);
        ctx.drawImage(to, 0, half, w, half, 0, 0, w, half);
        ctx.fillStyle = `rgba(0,0,0,${0.4 * (1 - s)})`;
        ctx.fillRect(0, 0, w, half);
        ctx.restore();
    }
}

// —— Background ——

function makeRays(count) {
    const rnd = seeded(20100813);
    return Array.from({ length: count }, () => ({
        a: rnd() * Math.PI * 2,
        w: 0.06 + rnd() * 0.22,
        color: RAY_COLORS[Math.floor(rnd() * RAY_COLORS.length)],
        alpha: 0.16 + rnd() * 0.3,
        phase: rnd(),
        speed: 0.5 + rnd() * 1.1,
        flicker: 2 + rnd() * 6,
    }));
}

/**
 * Purple/cyan warp tunnel, drawn small and upscaled so it blurs for free.
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLCanvasElement} low
 * @param {number} W
 * @param {number} H
 * @param {number} t
 * @param {ReturnType<typeof makeRays>} rays
 */
function drawTunnel(ctx, low, W, H, t, rays) {
    const lw = Math.max(1, Math.round(W / 10));
    const lh = Math.max(1, Math.round(H / 10));
    if (low.width !== lw || low.height !== lh) {
        low.width = lw;
        low.height = lh;
    }
    const g = /** @type {CanvasRenderingContext2D} */ (low.getContext('2d'));
    const cx = lw * 0.5;
    const cy = lh * 0.47;
    const R = Math.hypot(lw, lh) * 0.62;

    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#16073a';
    g.fillRect(0, 0, lw, lh);

    const spin = t * 0.12;
    g.globalCompositeOperation = 'lighter';
    for (const r of rays) {
        const a = r.a + spin;
        const flick = 0.7 + 0.3 * Math.sin(t * r.flicker + r.phase * 6.28);
        const [cr, cg, cb] = r.color;
        const band = (r.phase + t * r.speed * 0.6) % 1;
        const grad = g.createLinearGradient(cx, cy, cx + Math.cos(a) * R, cy + Math.sin(a) * R);
        const al = r.alpha * flick;
        grad.addColorStop(0, `rgba(${cr},${cg},${cb},0)`);
        grad.addColorStop(0.08, `rgba(${cr},${cg},${cb},${al * 0.4})`);
        grad.addColorStop(Math.max(0.1, Math.min(0.85, band)), `rgba(${Math.min(255, cr + 45)},${Math.min(255, cg + 40)},${Math.min(255, cb + 20)},${al})`);
        grad.addColorStop(1, `rgba(${cr},${cg},${cb},${al * 0.8})`);
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(cx + Math.cos(a - r.w / 2) * R, cy + Math.sin(a - r.w / 2) * R);
        g.lineTo(cx + Math.cos(a + r.w / 2) * R, cy + Math.sin(a + r.w / 2) * R);
        g.closePath();
        g.fill();
    }

    // Dark gaps between streaks
    g.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 14; i++) {
        const a = i * 0.449 + 0.3 - spin * 0.7;
        const w = 0.12 + (i % 3) * 0.06;
        g.fillStyle = 'rgba(8, 3, 26, 0.32)';
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(cx + Math.cos(a - w) * R, cy + Math.sin(a - w) * R);
        g.lineTo(cx + Math.cos(a + w) * R, cy + Math.sin(a + w) * R);
        g.closePath();
        g.fill();
    }
    g.globalCompositeOperation = 'lighter';

    // Hot core
    const pulse = 0.85 + 0.15 * Math.sin(t * 5);
    const core = g.createRadialGradient(cx, cy, 0, cx, cy, R * 0.42);
    core.addColorStop(0, `rgba(225, 215, 255, ${0.85 * pulse})`);
    core.addColorStop(0.2, `rgba(160, 110, 255, ${0.45 * pulse})`);
    core.addColorStop(0.6, 'rgba(90, 40, 200, 0.12)');
    core.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = core;
    g.fillRect(0, 0, lw, lh);

    // Vignette
    g.globalCompositeOperation = 'source-over';
    const vig = g.createRadialGradient(cx, cy, R * 0.35, cx, cy, R);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(6,2,20,0.7)');
    g.fillStyle = vig;
    g.fillRect(0, 0, lw, lh);

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if ('filter' in ctx) {
        ctx.filter = `blur(${Math.round(Math.max(W, H) / 220)}px)`;
    }
    ctx.drawImage(low, -W * 0.02, -H * 0.02, W * 1.04, H * 1.04);
    ctx.restore();
}

// —— HUD ——

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} t
 * @param {(x: number, y: number) => [number, number]} P stage → px
 * @param {number} u
 * @param {{ lines: string[] }} info
 */
function drawHud(ctx, t, P, u, info) {
    const panels = [
        { x: 474, y: 236, w: 96, h: 96, t0: 0.9, kind: 'object' },
        { x: 20, y: 22, w: 313, h: 100, t0: 1.25, kind: 'blank' },
        { x: 470, y: 20, w: 97, h: 102, t0: 1.35, kind: 'stripes' },
        { x: 20, y: 232, w: 313, h: 108, t0: 1.5, kind: 'data' },
    ];
    const fade = 1 - ramp(t, 4.55, 5.0);
    /** @type {Array<[number, number, number, number]>} open left panels, px — the code stream's window */
    const streamWindow = [];
    let streamAlpha = 0;
    for (const p of panels) {
        const open = easeOutCubic(ramp(t, p.t0, p.t0 + 0.3));
        if (open <= 0) {
            continue;
        }
        const h = Math.max(4, p.h * open);
        const y = p.y + (p.h - h) / 2;
        const [x0, y0] = P(p.x, y);
        const pw = p.w * u;
        const ph = h * u;
        const alpha = (0.55 + 0.25 * ramp(t, 3.6, 4.4)) * fade;
        ctx.save();
        ctx.globalAlpha = alpha;
        const grad = ctx.createLinearGradient(x0, y0, x0, y0 + ph);
        grad.addColorStop(0, 'rgba(18, 26, 64, 0.85)');
        grad.addColorStop(1, 'rgba(10, 16, 44, 0.85)');
        ctx.fillStyle = grad;
        ctx.fillRect(x0, y0, pw, ph);
        ctx.strokeStyle = 'rgba(130, 160, 230, 0.35)';
        ctx.lineWidth = Math.max(1, u * 0.8);
        ctx.strokeRect(x0 + 0.5, y0 + 0.5, pw - 1, ph - 1);
        if ((p.kind === 'blank' || p.kind === 'data') && open > 0.6) {
            streamWindow.push([x0, y0, pw, ph]);
            streamAlpha = Math.max(streamAlpha, alpha);
        }
        ctx.beginPath();
        ctx.rect(x0, y0, pw, ph);
        ctx.clip();
        if (open > 0.6) {
            if (p.kind === 'object') {
                drawWireObject(ctx, x0 + pw / 2, y0 + ph * 0.45, pw * 0.36, t);
                drawStripes(ctx, x0 + pw * 0.06, y0 + ph * 0.82, pw * 0.45, ph * 0.1, u);
            } else if (p.kind === 'stripes') {
                drawStripes(ctx, x0 + pw * 0.04, y0 + ph * 0.75, pw * 0.45, ph * 0.12, u);
            }
        }
        ctx.restore();
    }
    if (streamWindow.length) {
        // Both left panels are windows onto one column: it scrolls up from the lower
        // panel, behind the clock bar, into the upper one (as in the clip).
        ctx.save();
        ctx.globalAlpha = streamAlpha;
        ctx.beginPath();
        for (const [x, y, w, h] of streamWindow) {
            ctx.rect(x, y, w, h);
        }
        ctx.clip();
        drawCodeStream(ctx, t, P, u, info);
        ctx.restore();
    }
}

/**
 * @param {CanvasRenderingContext2D} ctx
 */
function drawStripes(ctx, x, y, w, h, u) {
    ctx.fillStyle = 'rgba(170, 210, 255, 0.55)';
    const n = 5;
    for (let i = 0; i < n; i++) {
        ctx.fillRect(x, y + (h / n) * i, w, Math.max(1, u * 0.7));
    }
}

/**
 * Blue wireframe dish spinning on a grid — the machine's headgear readout.
 * @param {CanvasRenderingContext2D} ctx
 */
function drawWireObject(ctx, cx, cy, r, t) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(70, 160, 255, 0.9)';
    ctx.shadowColor = 'rgba(60, 150, 255, 0.9)';
    ctx.shadowBlur = r * 0.25;
    ctx.lineWidth = Math.max(1, r * 0.03);
    const tilt = 0.42;
    // Grid plane
    for (let i = -3; i <= 3; i++) {
        const k = i / 3;
        ctx.globalAlpha = 0.35;
        ctx.beginPath();
        ctx.moveTo(cx - r * 1.2 + k * r * 0.3, cy + r * 0.35 + k * r * 0.25);
        ctx.lineTo(cx + r * 1.2 + k * r * 0.3, cy + r * 0.35 + k * r * 0.25 - r * 0.2);
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // Rim + spokes
    const spin = t * 1.6;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * tilt, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx, cy, r * 0.55, r * 0.55 * tilt, 0, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 10; i++) {
        const a = spin + (i / 10) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55 * tilt);
        ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r * tilt);
        ctx.stroke();
    }
    // Dome
    ctx.beginPath();
    ctx.ellipse(cx, cy - r * 0.05, r * 0.55, r * 0.5, 0, Math.PI, Math.PI * 2);
    ctx.stroke();
    for (let i = 1; i < 4; i++) {
        const a = spin * 0.5 + i * 0.8;
        ctx.beginPath();
        ctx.ellipse(cx, cy - r * 0.05, Math.abs(Math.cos(a)) * r * 0.55, r * 0.5, 0, Math.PI, Math.PI * 2);
        ctx.stroke();
    }
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    glow.addColorStop(0, 'rgba(80, 170, 255, 0.35)');
    glow.addColorStop(1, 'rgba(80, 170, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
}

const STREAM_T0 = 1.75;
const STREAM_TOP = 268;
const STREAM_SPEED = 65; // stage units per second: reaches the upper panel as the clock fades
const STREAM_X = 26;
const LINE_H = 9;

/**
 * Pseudo machine log for the stream, deterministic per index.
 * @param {number} i
 */
function codeLine(i) {
    const rnd = seeded(0x51e9 + i * 7919);
    const hex = (n) => Math.floor(rnd() * 16 ** n).toString(16).toUpperCase().padStart(n, '0');
    const ops = ['MOV', 'CMP', 'XOR', 'JNZ', 'LDR', 'STR', 'ADD', 'SUB', 'SHL', 'PUSH'];
    const tags = ['LTM.cmp', 'SEQ', 'HDR', 'DMT', 'PHW', 'CRC', 'BUF', 'SYN', 'ECC', 'LHC'];
    const kind = i % 7;
    if (kind === 3) {
        return { bars: Array.from({ length: 14 + Math.floor(rnd() * 22) }, () => rnd()) };
    }
    if (kind === 6) {
        return { text: `${tags[Math.floor(rnd() * tags.length)]} ${hex(4)} ${'|'.repeat(4 + Math.floor(rnd() * 18))} ${Math.floor(rnd() * 99)}B` };
    }
    return { text: `0x${hex(4)}  ${ops[Math.floor(rnd() * ops.length)]}  R${Math.floor(rnd() * 8)},#${hex(2)}${rnd() < 0.4 ? `  ; ${tags[Math.floor(rnd() * tags.length)]}` : ''}` };
}

/**
 * The scrolling column: bar graphs, the leap's own readout, then an endless machine log.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} t
 * @param {(x: number, y: number) => [number, number]} P
 * @param {number} u
 * @param {{ lines: string[] }} info
 */
function drawCodeStream(ctx, t, P, u, info) {
    const lt = Math.max(0, t - STREAM_T0);
    const top = STREAM_TOP - lt * STREAM_SPEED;
    ctx.fillStyle = 'rgba(220, 230, 255, 0.6)';
    ctx.font = `${Math.max(6, Math.round(6.5 * u))}px "Share Tech Mono", "Courier New", monospace`;
    ctx.textBaseline = 'top';
    const visible = (y, h) => y + h > 14 && y < 348;

    // Bar-graph block
    const graphH = 26;
    if (visible(top, graphH)) {
        const rnd = seeded(813);
        let x = STREAM_X;
        for (let col = 0; col < 7; col++) {
            for (let b = 0; b < 4; b++) {
                const hh = (0.25 + rnd() * 0.75) * graphH * (0.7 + 0.3 * Math.sin(lt * 7 + col + b));
                const [px, py] = P(x, top + graphH - hh);
                ctx.fillRect(px, py, Math.max(1, u * 1.4), hh * u);
                x += 2.6;
            }
            x += 4;
        }
        const [tx, ty] = P(STREAM_X + 132, top + 2);
        ctx.fillText('T  ' + '|'.repeat(6), tx, ty);
    }

    // The leap's readout, then the log
    let y = top + graphH + 8;
    const rows = [...info.lines.map((text) => ({ text })), { text: '' }];
    for (let i = 0; y < 348 + LINE_H; i++) {
        const row = i < rows.length ? rows[i] : codeLine(i - rows.length);
        if (visible(y, LINE_H)) {
            const [px, py] = P(STREAM_X, y);
            if (row.bars) {
                for (let b = 0; b < row.bars.length; b++) {
                    const [bx] = P(STREAM_X + b * 2.2, y);
                    ctx.fillRect(bx, py + (1 - row.bars[b]) * LINE_H * 0.7 * u, Math.max(1, u), row.bars[b] * LINE_H * 0.7 * u);
                }
            } else if (row.text) {
                ctx.fillText(row.text, px, py);
            }
        }
        y += LINE_H;
    }
}

// —— Scene ——

/**
 * Mount the animated leap on a canvas and run it once.
 * @param {HTMLCanvasElement} canvas
 * @param {{
 *   from: Date,
 *   to: Date,
 *   lines?: string[],
 *   onDone?: () => void,
 * }} opts
 * @returns {() => void} stop
 */
export function runTimeleapScene(canvas, opts) {
    calmFx = reduceFlashing();
    const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
    const fromMs = opts.from.getTime();
    const spanMin = Math.max(0, Math.round((fromMs - opts.to.getTime()) / 60000));
    const monthTiles = (opts.from.getMonth() >= 9 || opts.to.getMonth() >= 9) ? 2 : 1;
    const layout = clockLayout(monthTiles);
    const rays = makeRays(96);
    const low = document.createElement('canvas');
    const info = { lines: opts.lines || [] };
    /** @type {ReturnType<typeof makeTileCache> | null} */
    let tiles = null;
    /** @type {Map<string, { ch: string, prev: string, at: number }>} */
    const flaps = new Map();
    const start = performance.now();
    let raf = 0;
    let stopped = false;

    const faceAt = (t) => {
        const step = Math.floor(clamp01((t - T_COUNT_START) / (T_COUNT_END - T_COUNT_START)) * COUNT_STEPS);
        const minutes = Math.round((spanMin * step) / COUNT_STEPS);
        return clockFace(new Date(fromMs - minutes * 60000), monthTiles);
    };

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

        drawTunnel(ctx, low, W, H, t, rays);

        // Stage: the clip's 16:9 frame, fit inside the viewport (clock must fit the width).
        const u = Math.min(W / STAGE_W, H / STAGE_H);
        const ox = (W - STAGE_W * u) / 2;
        const oy = (H - STAGE_H * u) / 2;
        /** @type {(x: number, y: number) => [number, number]} */
        const P = (x, y) => [ox + x * u, oy + y * u];

        drawHud(ctx, t, P, u, info);

        // Clock bar
        const clockAlpha = 1 - ramp(t, 4.2, 4.6);
        if (clockAlpha > 0) {
            if (!tiles || Math.abs(tiles.u - u) > 0.001) {
                tiles = makeTileCache(u);
            }
            ctx.save();
            ctx.globalAlpha = clockAlpha;
            const [, by] = P(0, BAR_Y);
            const bh = BAR_H * u;
            const bar = ctx.createLinearGradient(0, by, 0, by + bh);
            bar.addColorStop(0, 'rgba(22, 22, 26, 0.95)');
            bar.addColorStop(0.5, 'rgba(4, 4, 6, 0.97)');
            bar.addColorStop(1, 'rgba(18, 18, 22, 0.95)');
            ctx.fillStyle = bar;
            ctx.fillRect(0, by, W, bh);
            ctx.fillStyle = 'rgba(150, 150, 175, 0.55)';
            ctx.fillRect(0, by, W, Math.max(1, u * 1.2));
            ctx.fillRect(0, by + bh - Math.max(1, u * 1.2), W, Math.max(1, u * 1.2));
            ctx.fillStyle = 'rgba(255,255,255,0.025)';
            for (let sx = 0; sx < W; sx += Math.max(2, Math.round(u * 3))) {
                ctx.fillRect(sx, by, 1, bh);
            }

            const face = faceAt(t);
            const chars = {
                mo0: face.month[0], mo1: face.month[1],
                d0: face.day[0], d1: face.day[1],
                h0: face.hour[0], h1: face.hour[1],
                mi0: face.minute[0], mi1: face.minute[1],
            };
            for (const it of layout) {
                const [x, y] = P(it.x, TILE_Y);
                if (it.kind === 'digit') {
                    const ch = chars[it.key] ?? ' ';
                    let f = flaps.get(it.key);
                    if (!f) {
                        f = { ch, prev: ch, at: -1 };
                        flaps.set(it.key, f);
                    } else if (f.ch !== ch) {
                        f.prev = f.ch;
                        f.ch = ch;
                        f.at = t;
                    }
                    const p = f.at < 0 ? 1 : clamp01((t - f.at) / FLIP_S);
                    drawFlap(ctx, tiles.get(f.prev), tiles.get(f.ch), p, Math.round(x), Math.round(y));
                } else if (it.kind === 'dow') {
                    const w = it.w * u;
                    const h = TILE_H * u;
                    ctx.save();
                    ctx.translate(Math.round(x), Math.round(y));
                    drawTileBase(ctx, w, h, u);
                    ctx.fillStyle = 'rgba(0,0,0,0.9)';
                    ctx.fillRect(0, h / 2 - 1.2 * u, w, 2.4 * u);
                    ctx.fillStyle = '#f2f2f2';
                    ctx.font = `700 ${Math.round(25 * u)}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'alphabetic';
                    ctx.fillText(face.weekday, w / 2, h - 8 * u);
                    ctx.restore();
                } else if (it.kind === 'label') {
                    ctx.save();
                    ctx.fillStyle = '#4cf04c';
                    ctx.shadowColor = 'rgba(60, 255, 60, 0.6)';
                    ctx.shadowBlur = 3 * u;
                    ctx.font = `700 ${Math.round(19 * u)}px "Hiragino Sans", "Yu Gothic", "Noto Sans JP", "MS Gothic", sans-serif`;
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'top';
                    ctx.fillText(it.text || '', x, y + 4 * u);
                    ctx.restore();
                }
            }
            ctx.restore();
        }

        // Flashes
        // Reduce flashing: a third as bright.
        const peak = calmFx ? 0.3 : 0.96;
        const flash = Math.max(
            t >= 0.067 ? peak * (1 - ramp(t, 0.067, 0.6)) : 0,
            t >= 3.6 ? peak * (1 - ramp(t, 3.6, 4.1)) : 0,
        );
        if (flash > 0) {
            ctx.fillStyle = `rgba(250, 248, 255, ${flash})`;
            ctx.fillRect(0, 0, W, H);
        }

        // Sink to black
        const dark = 0.82 * ramp(t, 4.1, 4.75) + 0.18 * ramp(t, 4.75, TIMELEAP_DURATION);
        if (dark > 0) {
            ctx.fillStyle = `rgba(0, 0, 0, ${dark})`;
            ctx.fillRect(0, 0, W, H);
        }

        if (t >= TIMELEAP_DURATION) {
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
