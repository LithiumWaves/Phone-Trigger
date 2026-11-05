/**
 * Worldline vertigo — the dizzy spell as a D-Mail reshapes the past (Reading Steiner).
 *
 * The picture swims: a low-frequency displacement warp ripples through it and grows, the
 * view slowly drifts in and sways, a ghost of the frame splits away in a slower orbit
 * (double vision), colour drains and the edges close in, then everything sinks into a
 * pale wash. Runs on the cutscene's own picture (the clip's <video> or the live <canvas>).
 *
 * With Reduce flashing: a gentle wobble and fade, no wash and no fast motion.
 */
import { reduceFlashing } from './settings.js';

const FILTER_ID = 'pp-vertigo-warp';
export const VERTIGO_MS = 1900;

/** The warp filter (SVG turbulence → displacement), added once to the page. */
function ensureFilter() {
    let svg = /** @type {SVGSVGElement | null} */ (document.getElementById(`${FILTER_ID}-svg`));
    if (!svg) {
        const holder = document.createElement('div');
        holder.innerHTML = `
            <svg id="${FILTER_ID}-svg" width="0" height="0" style="position:absolute;width:0;height:0" aria-hidden="true">
                <filter id="${FILTER_ID}" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
                    <feTurbulence type="fractalNoise" baseFrequency="0.003 0.009" numOctaves="2" seed="7" result="n" />
                    <feDisplacementMap in="SourceGraphic" in2="n" scale="0" xChannelSelector="R" yChannelSelector="G" />
                </filter>
            </svg>`;
        svg = /** @type {SVGSVGElement} */ (holder.firstElementChild);
        document.body.appendChild(svg);
    }
    return {
        turb: /** @type {SVGElement} */ (svg.querySelector('feTurbulence')),
        disp: /** @type {SVGElement} */ (svg.querySelector('feDisplacementMap')),
    };
}

/** @param {number} x */
const ease = (x) => x * x * (3 - 2 * x);

/**
 * @param {HTMLElement} root the cutscene dialog (overlays go in here)
 * @param {HTMLVideoElement | HTMLCanvasElement | HTMLElement} target the picture to warp
 * @param {{ duration?: number }} [opts]
 * @returns {Promise<void>} resolves when the spell has run its course
 */
export function runVertigo(root, target, opts = {}) {
    const duration = Math.max(600, Number(opts.duration) || VERTIGO_MS);
    const calm = reduceFlashing();
    const { turb, disp } = ensureFilter();

    // Double vision: a copy of the frame that drifts on its own slower orbit.
    const ghost = document.createElement('canvas');
    ghost.className = 'pp-vertigo-ghost';
    ghost.setAttribute('aria-hidden', 'true');
    const veil = document.createElement('div');
    veil.className = 'pp-vertigo-veil';
    veil.setAttribute('aria-hidden', 'true');
    target.insertAdjacentElement('afterend', ghost);
    root.appendChild(veil);
    const gctx = ghost.getContext('2d');
    const drawable = target instanceof HTMLVideoElement || target instanceof HTMLCanvasElement;
    target.classList.add('pp-vertigo-target');

    return new Promise((resolve) => {
        const start = performance.now();
        const frame = (now) => {
            if (!root.isConnected) {
                resolve();
                return;
            }
            const t = Math.min(1, (now - start) / duration);
            const s = (now - start) / 1000;
            const p = ease(t);
            const amp = calm ? 0.35 : 1;

            // Swimming warp: grows, and its noise field slowly breathes.
            const warp = (calm ? 18 : 70) * p + (calm ? 0 : 12 * Math.sin(s * 7) * p);
            disp.setAttribute('scale', warp.toFixed(1));
            const fx = 0.003 + 0.002 * Math.sin(s * 1.7);
            const fy = 0.009 + 0.004 * Math.sin(s * 1.1 + 1);
            turb.setAttribute('baseFrequency', `${fx.toFixed(4)} ${fy.toFixed(4)}`);

            // Drift in and sway, like the floor tilting.
            const zoom = 1 + 0.1 * p * amp;
            const sway = Math.sin(s * 2.4) * 2.6 * p * amp;
            const dx = Math.sin(s * 1.6) * 1.2 * p * amp;
            const dy = Math.cos(s * 1.3) * 0.8 * p * amp;
            target.style.transform = `translate(${dx}%, ${dy}%) scale(${zoom}) rotate(${sway}deg)`;
            target.style.filter = calm
                ? `url(#${FILTER_ID}) brightness(0.72) saturate(${0.9 - 0.35 * p}) contrast(0.85) blur(${(1 * p * p).toFixed(2)}px)`
                : `url(#${FILTER_ID}) saturate(${1 - 0.45 * p}) contrast(${1 + 0.15 * p}) blur(${(1.4 * p * p).toFixed(2)}px)`;

            // The ghost: same frame, larger, on a counter-orbit.
            if (drawable && gctx) {
                const w = root.clientWidth;
                const h = root.clientHeight;
                if (ghost.width !== w || ghost.height !== h) {
                    ghost.width = w;
                    ghost.height = h;
                }
                gctx.clearRect(0, 0, w, h);
                gctx.save();
                gctx.globalAlpha = (calm ? 0.18 : 0.42) * Math.sin(Math.PI * Math.min(1, t * 1.15));
                gctx.translate(w / 2, h / 2);
                gctx.rotate((-sway * 1.6 * Math.PI) / 180);
                const gz = zoom * (1 + 0.05 * p * amp);
                gctx.scale(gz, gz);
                gctx.translate(-w / 2 + Math.sin(s * 3.1) * 14 * p * amp, -h / 2 + Math.cos(s * 2.3) * 8 * p * amp);
                try {
                    const src = /** @type {any} */ (target);
                    const sw = src.videoWidth || src.width || w;
                    const sh = src.videoHeight || src.height || h;
                    // Fit it the way the picture is shown (the clip is object-fit: contain).
                    const k = Math.min(w / sw, h / sh);
                    gctx.drawImage(src, (w - sw * k) / 2, (h - sh * k) / 2, sw * k, sh * k);
                } catch {
                    /* frame not ready */
                }
                gctx.restore();
                ghost.style.filter = `url(#${FILTER_ID})`;
            }

            // Edges close in; at the very end a pale wash (none with Reduce flashing).
            const close = ease(Math.max(0, (t - 0.15) / 0.85));
            const wash = calm ? 0 : Math.max(0, (t - 0.72) / 0.28);
            veil.style.background = `radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) ${Math.round(62 - 34 * close)}%, rgba(0,0,0,${(0.78 * close).toFixed(3)}) 100%)`;
            veil.style.boxShadow = wash ? `inset 0 0 0 100vmax rgba(225, 232, 245, ${(0.55 * wash * wash).toFixed(3)})` : 'none';

            if (t < 1) {
                requestAnimationFrame(frame);
                return;
            }
            resolve();
        };
        requestAnimationFrame(frame);
    });
}
