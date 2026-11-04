/**
 * Worldline Map — every shift on this timeline, drawn like a lab oscilloscope.
 *
 * X is the order you lived it in (your Reading Steiner timeline); Y is the divergence,
 * split into attractor-field bands (0.x, 1.x, …). D-Mails are lightning jumps between
 * worldlines, undone D-Mails leave ghost branches, time leaps curl back on the line with the
 * abandoned future trailing off, and convergence points lie across their field as fate lines.
 */
import { getSettings } from './settings.js';
import { getDivergence, DEFAULT_DIVERGENCE } from './dmail.js';
import { renderMeterImage, drawStaticMeter } from './divmeter.js';
import { getWorldlineLog, getAllFacts, getConvergence, bindingConvergence, fieldOf } from './worldline.js';
import { formatStoryTime } from './storyClock.js';
import { esc } from './ui.js';

const GREEK = ['α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ', 'ι', 'κ'];
/** Field palettes: hue for the band and its trace. */
const FIELD_HUES = [18, 196, 280, 140, 48, 330, 90, 220, 0, 170];

/**
 * @typedef {{
 *   id: string, kind: 'origin' | 'dmail' | 'cancel' | 'leap' | 'now',
 *   x: number, from: string, to: string, ev?: any, cancelled?: boolean,
 * }} MapNode
 */

let dialog = null;
let raf = 0;

/** Open the map (top layer, above the phone and menu). */
export function openWorldlineMap() {
    closeWorldlineMap();
    const model = buildModel();
    dialog = document.createElement('dialog');
    dialog.className = 'pt-wm';
    dialog.setAttribute('aria-label', 'Worldline map');
    dialog.innerHTML = shellHtml(model);
    document.body.appendChild(dialog);
    dialog.addEventListener('cancel', (e) => {
        e.preventDefault();
        closeWorldlineMap();
    });
    dialog.querySelector('[data-wm-close]')?.addEventListener('click', closeWorldlineMap);
    dialog.showModal();
    const headMeter = /** @type {HTMLCanvasElement} */ (dialog.querySelector('.pt-wm-meter'));
    requestAnimationFrame(() => drawStaticMeter(headMeter, model.current));
    startScene(dialog, model);
    hum();
}

export function closeWorldlineMap() {
    cancelAnimationFrame(raf);
    raf = 0;
    if (dialog) {
        try {
            dialog.close();
        } catch {
            // already closed
        }
        dialog.remove();
        dialog = null;
    }
}

// —— Model ——

function buildModel() {
    const log = getWorldlineLog();
    const current = getDivergence();
    const facts = getAllFacts();
    const cancelledDmails = new Set(facts.filter((f) => f.cancelled).map((f) => f.dmailId));
    /** @type {MapNode[]} */
    const nodes = [];
    const first = log.find((e) => e.from)?.from || (log.length ? DEFAULT_DIVERGENCE : current);
    nodes.push({ id: 'origin', kind: 'origin', x: 0, from: first, to: first });
    let reading = first;
    let x = 0;
    for (const ev of log) {
        x += 1;
        const from = ev.from || reading;
        const to = ev.type === 'leap' ? from : (ev.to || from);
        nodes.push({
            id: ev.id,
            kind: ev.type === 'leap' ? 'leap' : ev.type === 'cancel' ? 'cancel' : 'dmail',
            x,
            from,
            to,
            ev,
            cancelled: ev.type === 'dmail' && cancelledDmails.has(ev.dmailId),
        });
        reading = to;
    }
    if (current !== reading) {
        x += 1;
        nodes.push({ id: 'set', kind: 'dmail', x, from: reading, to: current, ev: { type: 'set', text: 'Reading set by hand' } });
        reading = current;
    }
    nodes.push({ id: 'now', kind: 'now', x: x + 0.75, from: current, to: current });

    // Fields present, highest on top.
    const readings = new Set(nodes.flatMap((n) => [n.from, n.to]).filter(Boolean));
    const fields = [...new Set([...readings].map(fieldOf))].sort((a, b) => b - a);
    /** distinct readings per field, ascending, for rank spacing */
    const perField = new Map(fields.map((f) => [f, [...readings].filter((r) => fieldOf(r) === f).map(Number).sort((a, b) => a - b)]));

    // Ghost links: a cancel points back to the D-Mails it undid.
    const links = [];
    for (const n of nodes) {
        if (n.kind === 'cancel' && Array.isArray(n.ev?.cancels)) {
            for (const fid of n.ev.cancels) {
                const fact = facts.find((f) => f.id === fid);
                const target = nodes.find((m) => m.kind === 'dmail' && (m.ev?.factId === fid || (fact && m.ev?.dmailId === fact.dmailId)));
                if (target) {
                    links.push({ from: n, to: target });
                }
            }
        }
    }
    const stats = {
        dmails: nodes.filter((n) => n.kind === 'dmail' && n.id !== 'set').length,
        undone: nodes.filter((n) => n.cancelled).length + nodes.filter((n) => n.kind === 'cancel').length,
        leaps: nodes.filter((n) => n.kind === 'leap').length,
    };
    return { nodes, fields, perField, links, current, maxX: x + 0.75, stats, convergence: getConvergence(), binding: bindingConvergence() };
}

// —— Shell ——

function fieldName(f) {
    return `${GREEK[f] || f} · ${f}.x`;
}

function nodeTitle(n) {
    switch (n.kind) {
        case 'origin':
            return 'Origin';
        case 'now':
            return 'You are here';
        case 'leap':
            return `Time leap${n.ev?.leaper ? ` · ${n.ev.leaper}` : ''}`;
        case 'cancel':
            return 'D-Mail undone';
        default:
            return n.ev?.type === 'set' ? 'Reading set' : `D-Mail${n.ev?.sender ? ` · ${n.ev.sender}` : ''}`;
    }
}

function shellHtml(model) {
    const events = model.nodes.filter((n) => n.kind !== 'now');
    return `
        <div class="pt-wm-frame">
            <header class="pt-wm-head">
                <div class="pt-wm-title">
                    <span class="pt-wm-kicker">FUTURE GADGET LAB · READING STEINER LOG</span>
                    <h2>WORLDLINE MAP</h2>
                </div>
                <canvas class="pt-wm-meter" aria-label="Current divergence ${esc(model.current)}"></canvas>
                <div class="pt-wm-stats">
                    <span><b>${model.stats.dmails}</b> D-Mail${model.stats.dmails === 1 ? '' : 's'}</span>
                    <span><b>${model.stats.undone}</b> undone</span>
                    <span><b>${model.stats.leaps}</b> leap${model.stats.leaps === 1 ? '' : 's'}</span>
                </div>
                <button type="button" class="pt-wm-rail-toggle" data-wm-rail aria-label="Show the log">LOG</button>
                <button type="button" class="pt-wm-close" data-wm-close aria-label="Close">×</button>
            </header>
            <div class="pt-wm-body">
                <div class="pt-wm-stage">
                    <canvas class="pt-wm-canvas" tabindex="0" aria-label="Worldline chart. Arrow keys step through events."></canvas>
                    <div class="pt-wm-card" hidden></div>
                    <div class="pt-wm-hint">drag to pan · scroll or pinch to zoom · ← → step · 0 reset</div>
                    ${events.length <= 1 ? '<div class="pt-wm-empty">No D-Mails on this timeline yet.<br><small>Send one to PhoneWave and the worldline will move.</small></div>' : ''}
                </div>
                <aside class="pt-wm-rail">
                    <section>
                        <h3>Timeline</h3>
                        <ol class="pt-wm-events">
                            ${events.map((n) => `
                            <li><button type="button" data-wm-node="${esc(n.id)}" class="pt-wm-ev pt-wm-ev-${n.kind} ${n.cancelled ? 'pt-wm-ev-ghost' : ''}">
                                <span class="pt-wm-ev-k">${esc(nodeTitle(n))}</span>
                                <span class="pt-wm-ev-r">${n.from !== n.to ? `${esc(n.from)} → ${esc(n.to)}` : esc(n.to)}${n.ev?.estimated ? ' <small>(est.)</small>' : ''}</span>
                                ${n.ev?.text ? `<span class="pt-wm-ev-t">${esc(n.ev.text)}</span>` : ''}
                            </button></li>`).join('')}
                        </ol>
                    </section>
                    <section>
                        <h3>Convergence</h3>
                        ${model.convergence.length ? `<ul class="pt-wm-cv">${model.convergence.map((c) => `
                            <li class="${model.binding.some((b) => b.id === c.id) ? 'pt-wm-cv-bind' : 'pt-wm-cv-free'}">
                                <span>${esc(c.text)}</span>
                                <small>${esc(fieldName(c.field))}${c.deadline ? ` · by ${esc(formatStoryTime(c.deadline))}` : ''}${c.reached ? ` · reached ×${c.reached}` : ''}${model.binding.some((b) => b.id === c.id) ? '' : ' · escaped'}</small>
                            </li>`).join('')}</ul>` : '<p class="pt-wm-muted">None set. Add them under D-Mail → Convergence.</p>'}
                    </section>
                </aside>
            </div>
        </div>`;
}

// —— Scene ——

/**
 * @param {HTMLDialogElement} root
 * @param {ReturnType<typeof buildModel>} model
 */
function startScene(root, model) {
    const canvas = /** @type {HTMLCanvasElement} */ (root.querySelector('.pt-wm-canvas'));
    const card = /** @type {HTMLElement} */ (root.querySelector('.pt-wm-card'));
    const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    const start = performance.now();
    const grain = makeGrain();
    const threads = makeThreads(model.fields);
    /** @type {{ x: number, y: number, vx: number, vy: number, life: number, hue: number }[]} */
    const sparks = [];
    let lastT = 0;
    const sparked = new Set();
    const view = { x0: -0.6, x1: model.maxX + 0.6 };
    const fullView = { ...view };
    {
        // Narrow screens open on the most recent events (pan left for the rest).
        const plotCss = canvas.clientWidth * 0.8;
        const fits = Math.max(3, Math.floor(plotCss / 95));
        if (model.maxX + 1.2 > fits) {
            view.x1 = model.maxX + 0.6;
            view.x0 = view.x1 - fits;
        }
    }
    let hover = null;
    let selected = null;
    let W = 0;
    let H = 0;
    let dpr = 1;

    const layout = () => {
        const pad = { l: Math.min(150, W * 0.17), r: 40 * dpr, t: 40 * dpr, b: 46 * dpr };
        return { pad, plotW: W - pad.l - pad.r, plotH: H - pad.t - pad.b };
    };
    const sx = (x) => {
        const { pad, plotW } = layout();
        return pad.l + ((x - view.x0) / (view.x1 - view.x0)) * plotW;
    };
    /** Band geometry per field. */
    const bands = () => {
        const { pad, plotH } = layout();
        const n = model.fields.length;
        const gap = n > 1 ? Math.min(46 * dpr, plotH * 0.12) : 0;
        const bh = (plotH - gap * (n - 1)) / n;
        return model.fields.map((f, i) => ({ f, top: pad.t + i * (bh + gap), h: bh }));
    };
    const sy = (reading) => {
        const r = Number(reading);
        const f = fieldOf(reading);
        const band = bands().find((b) => b.f === f) || bands()[0];
        const list = model.perField.get(f) || [r];
        const rank = (list.indexOf(r) + 1) / (list.length + 1);
        const lin = r - f;
        const t = list.length > 1 ? 0.55 * rank + 0.45 * lin : 0.5;
        return band.top + band.h * (0.9 - 0.8 * t);
    };

    // Path through the nodes: horizontal runs, vertical jumps.
    const pathPoints = () => {
        const pts = [];
        const nodes = model.nodes;
        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            const x = sx(n.x);
            if (i === 0) {
                pts.push({ x, y: sy(n.to), node: n });
                continue;
            }
            pts.push({ x, y: sy(n.from), node: null });
            if (n.from !== n.to) {
                pts.push({ x, y: sy(n.to), node: n, jump: true });
            } else {
                pts.push({ x, y: sy(n.to), node: n });
            }
        }
        return pts;
    };

    const resize = () => {
        dpr = Math.min(2, window.devicePixelRatio || 1);
        W = Math.max(1, Math.round(canvas.clientWidth * dpr));
        H = Math.max(1, Math.round(canvas.clientHeight * dpr));
        if (canvas.width !== W || canvas.height !== H) {
            canvas.width = W;
            canvas.height = H;
        }
    };

    const frame = () => {
        if (!dialog) {
            return;
        }
        resize();
        const t = (performance.now() - start) / 1000;
        const intro = reduce ? 1 : Math.min(1, t / 2.4);
        drawBackdrop(ctx, W, H, t, dpr);
        drawBands(ctx, bands(), layout(), t, dpr, model, threads, reduce);
        drawFateLines(ctx, bands(), layout(), model, t, dpr);
        const pts = pathPoints();
        const lay = layout();
        ctx.save();
        ctx.beginPath();
        ctx.rect(lay.pad.l - 6 * dpr, 0, W - lay.pad.l + 6 * dpr, H);
        ctx.clip();
        drawGhostLinks(ctx, model.links, sx, sy, t, dpr);
        const head = drawTrace(ctx, pts, intro, t, dpr, reduce);
        // Sparks when the trace reaches a jump.
        if (!reduce) {
            for (const p of pts) {
                if (p.jump && p.node && !sparked.has(p.node.id) && head.passed.has(p.node.id)) {
                    sparked.add(p.node.id);
                    burst(sparks, p.x, p.y, hueFor(p.node.to), dpr);
                }
            }
            stepSparks(ctx, sparks, dpr, Math.min(0.05, Math.max(0.001, t - lastT)));
        }
        drawNodes(ctx, model, pts, sx, sy, intro, t, dpr, hover, selected, head);
        drawAxis(ctx, model, sx, layout(), dpr);
        ctx.restore();
        drawOverlay(ctx, W, H, t, grain, dpr);
        lastT = t;
        raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // —— Interaction ——
    const nodeAt = (px, py) => {
        let best = null;
        let bestD = 22 * dpr;
        for (const n of model.nodes) {
            const d = Math.hypot(sx(n.x) - px, sy(n.to) - py);
            if (d < bestD) {
                bestD = d;
                best = n;
            }
        }
        return best;
    };
    const showCard = (n, pin = false) => {
        if (!n) {
            card.hidden = true;
            return;
        }
        const ev = n.ev || {};
        const field = fieldOf(n.from) !== fieldOf(n.to) ? `<div class="pt-wm-card-cross">crossed ${esc(fieldName(fieldOf(n.from)))} → ${esc(fieldName(fieldOf(n.to)))}</div>` : '';
        card.innerHTML = `
            <div class="pt-wm-card-k">${esc(nodeTitle(n))}${n.cancelled ? ' · <span class="pt-wm-card-ghost">undone</span>' : ''}</div>
            <div class="pt-wm-card-r">${n.from !== n.to ? `${esc(n.from)} <span>→</span> ${esc(n.to)}` : esc(n.to)}</div>
            ${field}
            ${ev.estimated ? '<div class="pt-wm-card-m">Reading estimated — sent before readings were recorded.</div>' : ''}
            ${ev.text ? `<div class="pt-wm-card-t">${esc(ev.text)}</div>` : n.kind === 'now' ? '<div class="pt-wm-card-t">The worldline you are on.</div>' : ''}
            ${ev.storyTime ? `<div class="pt-wm-card-m">${esc(formatStoryTime(ev.storyTime))}${ev.storyTo ? ` → ${esc(formatStoryTime(ev.storyTo))}` : ''}${ev.day ? ` · Day ${ev.day}` : ''}</div>` : ''}
            ${pin ? '' : ''}`;
        card.hidden = false;
        const rect = canvas.getBoundingClientRect();
        const cx = sx(n.x) / dpr;
        const cy = sy(n.to) / dpr;
        const cw = card.offsetWidth || 240;
        const ch = card.offsetHeight || 100;
        let left = cx + 18;
        if (left + cw > rect.width - 8) {
            left = cx - cw - 18;
        }
        let top = cy - ch - 16;
        if (top < 8) {
            top = cy + 18;
        }
        card.style.left = `${Math.max(8, left)}px`;
        card.style.top = `${Math.max(8, Math.min(rect.height - ch - 8, top))}px`;
    };
    const select = (n) => {
        selected = n;
        showCard(n, true);
        root.querySelectorAll('[data-wm-node]').forEach((b) => b.classList.toggle('pt-wm-ev-on', b.getAttribute('data-wm-node') === n?.id));
        if (n) {
            // Keep it in view.
            const span = view.x1 - view.x0;
            if (n.x < view.x0 + span * 0.1 || n.x > view.x1 - span * 0.1) {
                view.x0 = n.x - span / 2;
                view.x1 = n.x + span / 2;
            }
            root.querySelector(`[data-wm-node="${CSS.escape(n.id)}"]`)?.scrollIntoView({ block: 'nearest' });
        }
    };

    /** @type {Map<number, { x: number, y: number }>} */
    const pointers = new Map();
    let drag = null;
    let pinch = null;
    canvas.addEventListener('pointerdown', (e) => {
        canvas.setPointerCapture(e.pointerId);
        pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
        if (pointers.size === 2) {
            const [a, b] = [...pointers.values()];
            pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), v: { ...view }, mid: (a.x + b.x) / 2 };
            drag = null;
        } else {
            drag = { x: e.offsetX, v: { ...view }, moved: false };
        }
    });
    canvas.addEventListener('pointermove', (e) => {
        if (pointers.has(e.pointerId)) {
            pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
        }
        if (pinch && pointers.size === 2) {
            const [a, b] = [...pointers.values()];
            const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
            zoomAt(pinch.mid, pinch.d / d, pinch.v);
            return;
        }
        if (drag) {
            const { plotW } = layout();
            const dx = ((e.offsetX - drag.x) * dpr / plotW) * (drag.v.x1 - drag.v.x0);
            if (Math.abs(e.offsetX - drag.x) > 3) {
                drag.moved = true;
            }
            view.x0 = drag.v.x0 - dx;
            view.x1 = drag.v.x1 - dx;
            return;
        }
        const n = nodeAt(e.offsetX * dpr, e.offsetY * dpr);
        hover = n;
        canvas.style.cursor = n ? 'pointer' : 'grab';
        if (!selected) {
            showCard(n);
        }
    });
    const end = (e) => {
        pointers.delete(e.pointerId);
        if (pointers.size < 2) {
            pinch = null;
        }
        if (drag && !drag.moved) {
            const n = nodeAt(e.offsetX * dpr, e.offsetY * dpr);
            select(n);
        }
        drag = null;
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', () => {
        hover = null;
        if (!selected) {
            card.hidden = true;
        }
    });
    const zoomAt = (px, factor, base = view) => {
        const { pad, plotW } = layout();
        const span = base.x1 - base.x0;
        const at = base.x0 + ((px * dpr - pad.l) / plotW) * span;
        const next = Math.max(1.2, Math.min((fullView.x1 - fullView.x0) * 1.6, span * factor));
        view.x0 = at - ((at - base.x0) / span) * next;
        view.x1 = view.x0 + next;
    };
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        zoomAt(e.offsetX, Math.exp(e.deltaY * 0.0015));
    }, { passive: false });
    canvas.addEventListener('keydown', (e) => {
        const order = model.nodes;
        const i = selected ? order.indexOf(selected) : -1;
        if (e.key === 'ArrowRight') {
            select(order[Math.min(order.length - 1, i + 1)]);
        } else if (e.key === 'ArrowLeft') {
            select(order[Math.max(0, i - 1)]);
        } else if (e.key === '0' || e.key === 'Home') {
            Object.assign(view, fullView);
        } else {
            return;
        }
        e.preventDefault();
    });
    root.querySelectorAll('[data-wm-node]').forEach((btn) => {
        btn.addEventListener('click', () => {
            select(model.nodes.find((n) => n.id === btn.getAttribute('data-wm-node')) || null);
            root.classList.remove('pt-wm-rail-open');
        });
    });
    root.querySelector('[data-wm-rail]')?.addEventListener('click', () => root.classList.toggle('pt-wm-rail-open'));
    canvas.focus({ preventScroll: true });
}

function hueFor(reading) {
    return FIELD_HUES[fieldOf(reading) % FIELD_HUES.length];
}

// —— Drawing ——

function drawBackdrop(ctx, W, H, t, dpr) {
    const g = ctx.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.5, Math.max(W, H) * 0.75);
    g.addColorStop(0, '#0b1a2e');
    g.addColorStop(0.55, '#06101e');
    g.addColorStop(1, '#020509');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Oscilloscope graticule
    const step = 26 * dpr;
    const drift = (t * 6 * dpr) % step;
    ctx.lineWidth = 1;
    for (let x = -drift; x < W; x += step) {
        const major = Math.round((x + drift) / step) % 5 === 0;
        ctx.strokeStyle = major ? 'rgba(120,170,255,0.085)' : 'rgba(120,170,255,0.035)';
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, 0);
        ctx.lineTo(Math.round(x) + 0.5, H);
        ctx.stroke();
    }
    for (let y = 0; y < H; y += step) {
        const major = Math.round(y / step) % 5 === 0;
        ctx.strokeStyle = major ? 'rgba(120,170,255,0.085)' : 'rgba(120,170,255,0.035)';
        ctx.beginPath();
        ctx.moveTo(0, Math.round(y) + 0.5);
        ctx.lineTo(W, Math.round(y) + 0.5);
        ctx.stroke();
    }
}

function makeThreads(fields) {
    const out = [];
    let seed = 1337;
    const rnd = () => {
        seed = (seed * 16807) % 2147483647;
        return seed / 2147483647;
    };
    for (const f of fields) {
        for (let i = 0; i < 16; i++) {
            out.push({ f, y: 0.06 + rnd() * 0.88, speed: 0.15 + rnd() * 0.6, dash: 4 + rnd() * 30, gap: 6 + rnd() * 40, alpha: 0.04 + rnd() * 0.08, phase: rnd() * 100 });
        }
    }
    return out;
}

function drawBands(ctx, bands, layout, t, dpr, model, threads, reduce) {
    const { pad, plotW } = layout;
    const curField = fieldOf(model.current);
    for (const b of bands) {
        const hue = FIELD_HUES[b.f % FIELD_HUES.length];
        const on = b.f === curField;
        const g = ctx.createLinearGradient(0, b.top, 0, b.top + b.h);
        g.addColorStop(0, `hsla(${hue},70%,45%,${on ? 0.11 : 0.05})`);
        g.addColorStop(0.5, `hsla(${hue},70%,40%,${on ? 0.05 : 0.025})`);
        g.addColorStop(1, `hsla(${hue},70%,45%,${on ? 0.11 : 0.05})`);
        ctx.fillStyle = g;
        ctx.fillRect(pad.l, b.top, plotW, b.h);
        // Edges
        ctx.strokeStyle = `hsla(${hue},80%,60%,${on ? 0.4 : 0.18})`;
        ctx.lineWidth = 1 * dpr;
        ctx.setLineDash([2 * dpr, 6 * dpr]);
        ctx.beginPath();
        ctx.moveTo(pad.l, b.top);
        ctx.lineTo(pad.l + plotW, b.top);
        ctx.moveTo(pad.l, b.top + b.h);
        ctx.lineTo(pad.l + plotW, b.top + b.h);
        ctx.stroke();
        ctx.setLineDash([]);
        // Other worldlines in this field: faint threads drifting past
        ctx.save();
        ctx.beginPath();
        ctx.rect(pad.l, b.top, plotW, b.h);
        ctx.clip();
        for (const th of threads) {
            if (th.f !== b.f) {
                continue;
            }
            const y = b.top + th.y * b.h;
            ctx.strokeStyle = `hsla(${hue},80%,72%,${th.alpha * (on ? 1.3 : 0.8)})`;
            ctx.lineWidth = 1 * dpr;
            ctx.setLineDash([th.dash * dpr, th.gap * dpr]);
            ctx.lineDashOffset = reduce ? 0 : -(t * th.speed * 40 + th.phase) * dpr;
            ctx.beginPath();
            ctx.moveTo(pad.l, y);
            ctx.lineTo(pad.l + plotW, y);
            ctx.stroke();
        }
        ctx.setLineDash([]);
        // Scanline sweeping down the band
        if (!reduce) {
            const sy = b.top + ((t * 0.12 + b.f * 0.37) % 1) * b.h;
            const sg = ctx.createLinearGradient(0, sy - 18 * dpr, 0, sy);
            sg.addColorStop(0, `hsla(${hue},90%,70%,0)`);
            sg.addColorStop(1, `hsla(${hue},90%,70%,${on ? 0.09 : 0.04})`);
            ctx.fillStyle = sg;
            ctx.fillRect(pad.l, sy - 18 * dpr, plotW, 18 * dpr);
        }
        ctx.restore();
        // Label: big faint letter + caption
        ctx.save();
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'right';
        ctx.fillStyle = `hsla(${hue},85%,70%,${on ? 0.85 : 0.45})`;
        ctx.font = `${Math.round(Math.min(64 * dpr, b.h * 0.42))}px "Times New Roman", serif`;
        ctx.shadowColor = `hsla(${hue},90%,60%,0.6)`;
        ctx.shadowBlur = 16 * dpr;
        ctx.fillText(GREEK[b.f] || String(b.f), pad.l - 18 * dpr, b.top + b.h * 0.45);
        ctx.shadowBlur = 0;
        ctx.font = `600 ${Math.round(9.5 * dpr)}px "IBM Plex Mono", Consolas, monospace`;
        ctx.fillStyle = `hsla(${hue},40%,80%,${on ? 0.8 : 0.45})`;
        ctx.fillText(`FIELD ${b.f}.x`, pad.l - 18 * dpr, b.top + b.h * 0.45 + Math.min(40 * dpr, b.h * 0.3));
        ctx.restore();
    }
}

function drawFateLines(ctx, bands, layout, model, t, dpr) {
    const { pad, plotW } = layout;
    const byField = new Map();
    for (const c of model.convergence) {
        if (!c.active) {
            continue;
        }
        const list = byField.get(c.field) || [];
        list.push(c);
        byField.set(c.field, list);
    }
    for (const b of bands) {
        const list = byField.get(b.f) || [];
        list.forEach((c, i) => {
            const y = b.top + b.h - (10 + i * 15) * dpr;
            const binding = model.binding.some((x) => x.id === c.id);
            ctx.strokeStyle = binding ? `rgba(201,160,255,${0.45 + 0.15 * Math.sin(t * 2 + i)})` : 'rgba(201,160,255,0.18)';
            ctx.lineWidth = 1.2 * dpr;
            ctx.setLineDash([1 * dpr, 5 * dpr]);
            ctx.beginPath();
            ctx.moveTo(pad.l, y);
            ctx.lineTo(pad.l + plotW, y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.font = `500 ${Math.round(9 * dpr)}px "IBM Plex Mono", Consolas, monospace`;
            ctx.fillStyle = binding ? 'rgba(220,195,255,0.85)' : 'rgba(220,195,255,0.35)';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'bottom';
            const label = `⟡ ${c.text}${c.reached ? `  ×${c.reached}` : ''}`;
            ctx.fillText(label.length > 70 ? `${label.slice(0, 69)}…` : label, pad.l + plotW - 6 * dpr, y - 2 * dpr);
        });
    }
}

function drawGhostLinks(ctx, links, sx, sy, t, dpr) {
    for (const { from, to } of links) {
        const x1 = sx(from.x);
        const y1 = sy(from.to);
        const x2 = sx(to.x);
        const y2 = sy(to.to);
        const lift = Math.max(40 * dpr, Math.abs(x1 - x2) * 0.25);
        ctx.strokeStyle = 'rgba(255,150,90,0.38)';
        ctx.lineWidth = 1.3 * dpr;
        ctx.setLineDash([5 * dpr, 6 * dpr]);
        ctx.lineDashOffset = -t * 18 * dpr;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.bezierCurveTo(x1, Math.min(y1, y2) - lift, x2, Math.min(y1, y2) - lift, x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);
    }
}

/** Seeded jitter for lightning so it flickers but keeps its shape. */
function bolt(x, y1, y2, seed, t, dpr) {
    const pts = [];
    const steps = Math.max(4, Math.round(Math.abs(y2 - y1) / (14 * dpr)));
    let s = seed;
    for (let i = 0; i <= steps; i++) {
        s = (s * 9301 + 49297) % 233280;
        const base = (s / 233280 - 0.5) * 2;
        const flick = Math.sin(t * 23 + i * 1.7 + seed) * 0.35;
        const amp = i === 0 || i === steps ? 0 : (7 * dpr) * (base + flick);
        pts.push({ x: x + amp, y: y1 + ((y2 - y1) * i) / steps });
    }
    return pts;
}

function seedOf(id) {
    let h = 7;
    for (let i = 0; i < id.length; i++) {
        h = (h * 31 + id.charCodeAt(i)) % 100000;
    }
    return h;
}

/**
 * The worldline you lived: glowing runs, lightning jumps; revealed by `intro` (0..1).
 * @returns {{ x: number, y: number, passed: Set<string> }}
 */
function drawTrace(ctx, pts, intro, t, dpr, reduce) {
    // Total length for the reveal
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
        total += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
    const limit = total * intro;
    const passed = new Set();
    const segs = [];
    let acc = 0;
    let head = { x: pts[0]?.x || 0, y: pts[0]?.y || 0 };
    for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (acc >= limit) {
            break;
        }
        const frac = Math.min(1, (limit - acc) / (len || 1));
        const end = { x: a.x + (b.x - a.x) * frac, y: a.y + (b.y - a.y) * frac };
        segs.push({ a, b: end, jump: Boolean(b.jump), full: frac >= 1, node: b.node, reading: b.node?.to });
        if (frac >= 1 && b.node) {
            passed.add(b.node.id);
        }
        head = end;
        acc += len;
    }
    if (pts[0]?.node) {
        passed.add(pts[0].node.id);
    }
    const passes = [
        { w: 9, a: 0.07, blur: 22 },
        { w: 4, a: 0.22, blur: 10 },
        { w: 1.6, a: 0.95, blur: 0 },
    ];
    for (const pass of passes) {
        for (const s of segs) {
            const hue = hueFor(s.reading || '0');
            const ghost = s.node?.cancelled;
            ctx.strokeStyle = pass.blur === 0
                ? `hsla(${hue},100%,${ghost ? 70 : 82}%,${pass.a * (ghost ? 0.55 : 1)})`
                : `hsla(${hue},100%,60%,${pass.a})`;
            ctx.lineWidth = pass.w * dpr;
            ctx.shadowColor = `hsla(${hue},100%,60%,0.9)`;
            ctx.shadowBlur = pass.blur * dpr;
            ctx.lineCap = 'round';
            ctx.beginPath();
            if (s.jump) {
                const seed = seedOf(s.node?.id || 'x');
                const bp = bolt(s.a.x, s.a.y, s.b.y, seed, reduce ? 0 : t, dpr);
                ctx.moveTo(bp[0].x, bp[0].y);
                for (const p of bp.slice(1)) {
                    ctx.lineTo(p.x, p.y);
                }
            } else {
                ctx.moveTo(s.a.x, s.a.y);
                ctx.lineTo(s.b.x, s.b.y);
            }
            ctx.stroke();
        }
    }
    ctx.shadowBlur = 0;
    // Chromatic fringe on the core for the CRT feel
    ctx.globalCompositeOperation = 'lighter';
    for (const [dx, col] of [[-1.2, 'rgba(255,40,60,0.10)'], [1.2, 'rgba(40,160,255,0.10)']]) {
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.4 * dpr;
        ctx.beginPath();
        for (const s of segs) {
            if (s.jump) {
                continue;
            }
            ctx.moveTo(s.a.x + dx * dpr, s.a.y);
            ctx.lineTo(s.b.x + dx * dpr, s.b.y);
        }
        ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    // Writing head while the trace draws
    if (intro < 1) {
        ctx.fillStyle = '#fff';
        ctx.shadowColor = '#9cf';
        ctx.shadowBlur = 18 * dpr;
        ctx.beginPath();
        ctx.arc(head.x, head.y, 3 * dpr, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
    }
    return { ...head, passed };
}

function burst(sparks, x, y, hue, dpr) {
    for (let i = 0; i < 34; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = (1.5 + Math.random() * 4.5) * dpr;
        sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5 * dpr, life: 1, hue });
    }
}

function stepSparks(ctx, sparks, dpr, dt) {
    const k = dt * 60; // frames' worth at 60 fps
    ctx.globalCompositeOperation = 'lighter';
    for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.x += s.vx * k;
        s.y += s.vy * k;
        s.vy += 0.12 * dpr * k;
        s.vx *= Math.pow(0.97, k);
        s.life -= 0.022 * k;
        if (s.life <= 0) {
            sparks.splice(i, 1);
            continue;
        }
        ctx.strokeStyle = `hsla(${s.hue},100%,${70 + 25 * s.life}%,${s.life})`;
        ctx.lineWidth = 1.4 * dpr;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * 2, s.y - s.vy * 2);
        ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
}

function drawNodes(ctx, model, pts, sx, sy, intro, t, dpr, hover, selected, head) {
    const labelW = 96 * dpr;
    const labelH = 30 * dpr;
    let flip = false;
    /** @type {{ x: number, y: number, w: number, h: number }[]} */
    const placed = [];
    const free = (r) => !placed.some((q) => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y);
    // The "you are here" readout claims its spot first.
    const nowNode = model.nodes.find((n) => n.kind === 'now');
    if (nowNode && intro >= 1) {
        const nx = sx(nowNode.x);
        const ny = sy(nowNode.to);
        placed.push({ x: nx - labelW * 0.6, y: ny - 40 * dpr - labelH * 0.6, w: labelW * 1.2, h: labelH * 1.2 + 70 * dpr });
    }
    for (const n of model.nodes) {
        if (!head.passed.has(n.id) && n.kind !== 'now') {
            continue;
        }
        if (n.kind === 'now' && intro < 1) {
            continue;
        }
        const x = sx(n.x);
        const y = sy(n.to);
        const hue = hueFor(n.to);
        const hot = n === hover || n === selected;
        ctx.save();
        if (n.kind === 'now') {
            // Pulsing marker with a radar sweep
            for (let k = 0; k < 3; k++) {
                const ph = ((t * 0.6 + k / 3) % 1);
                ctx.strokeStyle = `hsla(${hue},100%,70%,${0.5 * (1 - ph)})`;
                ctx.lineWidth = 1.2 * dpr;
                ctx.beginPath();
                ctx.arc(x, y, (6 + ph * 30) * dpr, 0, Math.PI * 2);
                ctx.stroke();
            }
            const a = t * 1.6;
            const sweep = ctx.createConicGradient ? ctx.createConicGradient(a, x, y) : null;
            if (sweep) {
                sweep.addColorStop(0, `hsla(${hue},100%,70%,0.35)`);
                sweep.addColorStop(0.12, `hsla(${hue},100%,70%,0)`);
                sweep.addColorStop(1, `hsla(${hue},100%,70%,0)`);
                ctx.fillStyle = sweep;
                ctx.beginPath();
                ctx.arc(x, y, 34 * dpr, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.fillStyle = '#fff';
            ctx.shadowColor = `hsl(${hue},100%,65%)`;
            ctx.shadowBlur = 20 * dpr;
            ctx.beginPath();
            ctx.arc(x, y, 4.5 * dpr, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.font = `600 ${Math.round(9 * dpr)}px "IBM Plex Mono", Consolas, monospace`;
            ctx.fillStyle = `hsla(${hue},80%,85%,0.9)`;
            ctx.textAlign = 'center';
            ctx.fillText('YOU ARE HERE', x, y + 26 * dpr);
            const img = renderMeterImage(n.to, labelW * 1.2, labelH * 1.2);
            ctx.drawImage(img, x - img.width / 2, y - 40 * dpr - img.height / 2);
            ctx.restore();
            continue;
        }
        if (n.kind === 'leap') {
            // The leaper curls back; the abandoned future trails off ahead.
            ctx.strokeStyle = `hsla(${hue},100%,75%,0.9)`;
            ctx.lineWidth = 1.6 * dpr;
            ctx.shadowColor = `hsl(${hue},100%,60%)`;
            ctx.shadowBlur = 10 * dpr;
            ctx.beginPath();
            const r = 13 * dpr;
            ctx.arc(x - r * 0.2, y - r, r, Math.PI * 0.5, Math.PI * 2.25, false);
            ctx.stroke();
            // arrow head
            const ax = x - r * 0.2 + Math.cos(Math.PI * 2.25) * r;
            const ay = y - r + Math.sin(Math.PI * 2.25) * r;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(ax - 5 * dpr, ay - 3 * dpr);
            ctx.moveTo(ax, ay);
            ctx.lineTo(ax - 1 * dpr, ay - 6 * dpr);
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = `hsla(${hue},80%,70%,0.25)`;
            ctx.setLineDash([3 * dpr, 5 * dpr]);
            ctx.beginPath();
            ctx.moveTo(x, y + 9 * dpr);
            ctx.quadraticCurveTo(x + 40 * dpr, y + 16 * dpr, x + 70 * dpr, y + 34 * dpr);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.font = `500 ${Math.round(8.5 * dpr)}px "IBM Plex Mono", Consolas, monospace`;
            const lt = `⟲ ${n.ev?.leaper || 'leap'}`;
            const lw = ctx.measureText(lt).width;
            const lr = { x: x - lw / 2, y: y - 42 * dpr, w: lw, h: 12 * dpr };
            if (free(lr) || hot) {
                placed.push(lr);
                ctx.fillStyle = `hsla(${hue},70%,85%,0.75)`;
                ctx.textAlign = 'center';
                ctx.fillText(lt, x, y - 32 * dpr);
            }
            ctx.restore();
            continue;
        }
        // D-Mail / cancel / origin: diamonds and squares with a nixie readout
        const size = (hot ? 7.5 : 5.5) * dpr;
        ctx.translate(x, y);
        ctx.shadowColor = `hsl(${hue},100%,60%)`;
        ctx.shadowBlur = (hot ? 22 : 12) * dpr;
        ctx.fillStyle = n.cancelled ? 'rgba(10,14,24,0.9)' : '#061220';
        ctx.strokeStyle = n.kind === 'cancel' ? 'rgba(255,160,100,0.95)' : `hsla(${hue},100%,${n.cancelled ? 60 : 75}%,${n.cancelled ? 0.5 : 1})`;
        ctx.lineWidth = 1.6 * dpr;
        ctx.beginPath();
        if (n.kind === 'origin') {
            ctx.rect(-size, -size, size * 2, size * 2);
        } else {
            ctx.rotate(Math.PI / 4);
            ctx.rect(-size, -size, size * 2, size * 2);
        }
        ctx.fill();
        ctx.stroke();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.shadowBlur = 0;
        if (n.cancelled || n.kind === 'cancel') {
            ctx.strokeStyle = n.kind === 'cancel' ? 'rgba(255,170,110,0.95)' : 'rgba(255,150,90,0.7)';
            ctx.lineWidth = 1.4 * dpr;
            ctx.beginPath();
            ctx.moveTo(x - size * 0.7, y - size * 0.7);
            ctx.lineTo(x + size * 0.7, y + size * 0.7);
            ctx.moveTo(x + size * 0.7, y - size * 0.7);
            ctx.lineTo(x - size * 0.7, y + size * 0.7);
            ctx.stroke();
        }
        const img = renderMeterImage(n.to, labelW, labelH);
        const tryOrder = flip ? [false, true] : [true, false];
        flip = !flip;
        let ly = null;
        for (const above of tryOrder) {
            const cand = above ? y - 14 * dpr - img.height : y + 14 * dpr;
            const r = { x: x - img.width / 2 - 4 * dpr, y: cand - 3 * dpr, w: img.width + 8 * dpr, h: img.height + 6 * dpr };
            if (free(r)) {
                placed.push(r);
                ly = cand;
                break;
            }
        }
        if (ly === null) {
            if (!hot) {
                ctx.restore();
                continue; // no room: hover or select it to read the value
            }
            ly = y - 14 * dpr - img.height;
        }
        ctx.globalAlpha = n.cancelled ? 0.4 : (hot ? 1 : 0.88);
        ctx.fillStyle = 'rgba(8,2,2,0.72)';
        roundRect(ctx, x - img.width / 2 - 4 * dpr, ly - 3 * dpr, img.width + 8 * dpr, img.height + 6 * dpr, 4 * dpr);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,110,40,0.22)';
        ctx.lineWidth = 1 * dpr;
        ctx.stroke();
        ctx.drawImage(img, x - img.width / 2, ly);
        ctx.globalAlpha = 1;
        ctx.restore();
    }
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function drawAxis(ctx, model, sx, layout, dpr) {
    const { pad, plotH } = layout;
    const y = pad.t + plotH + 18 * dpr;
    ctx.font = `500 ${Math.round(8.5 * dpr)}px "IBM Plex Mono", Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    let lastX = -Infinity;
    for (const n of model.nodes) {
        if (n.kind === 'now' || n.kind === 'origin') {
            continue;
        }
        const x = sx(n.x);
        if (x - lastX < 64 * dpr) {
            continue;
        }
        lastX = x;
        ctx.strokeStyle = 'rgba(120,170,255,0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y - 8 * dpr);
        ctx.lineTo(x, y - 3 * dpr);
        ctx.stroke();
        const st = n.ev?.storyTime;
        ctx.fillStyle = 'rgba(160,190,230,0.55)';
        ctx.fillText(st ? formatStoryTime(st).replace(/^\w+ /, '') : `#${n.x}`, x, y);
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(160,190,230,0.35)';
    ctx.fillText('YOUR TIMELINE →', pad.l, y + 14 * dpr);
}

function makeGrain() {
    const c = document.createElement('canvas');
    c.width = 160;
    c.height = 160;
    const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    const img = g.createImageData(160, 160);
    for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = v;
        img.data[i + 1] = v;
        img.data[i + 2] = v;
        img.data[i + 3] = 18;
    }
    g.putImageData(img, 0, 0);
    return c;
}

function drawOverlay(ctx, W, H, t, grain, dpr) {
    // Scanlines
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    for (let y = 0; y < H; y += 3 * dpr) {
        ctx.fillRect(0, y, W, 1 * dpr);
    }
    // Grain
    const pat = ctx.createPattern(grain, 'repeat');
    if (pat) {
        ctx.save();
        ctx.translate((t * 977) % 160, (t * 613) % 160);
        ctx.fillStyle = pat;
        ctx.fillRect(-160, -160, W + 320, H + 320);
        ctx.restore();
    }
    // Vignette
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
}

/** A soft power-on hum (respects the Sounds setting). */
function hum() {
    if (!getSettings().soundEnabled) {
        return;
    }
    try {
        const AC = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
        const ac = new AC();
        const now = ac.currentTime;
        const gain = ac.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.06, now + 0.25);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);
        gain.connect(ac.destination);
        for (const [f, type] of [[55, 'sine'], [110, 'triangle'], [440, 'sine']]) {
            const o = ac.createOscillator();
            o.type = /** @type {OscillatorType} */ (type);
            o.frequency.setValueAtTime(f, now);
            o.frequency.exponentialRampToValueAtTime(f * 1.02, now + 1.4);
            const g = ac.createGain();
            g.gain.value = f === 440 ? 0.08 : 0.5;
            o.connect(g).connect(gain);
            o.start(now);
            o.stop(now + 1.7);
        }
        setTimeout(() => ac.close(), 2000);
    } catch {
        // no audio
    }
}
