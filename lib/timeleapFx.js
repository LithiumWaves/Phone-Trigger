/**
 * Time leap cutscene players.
 * - original: lib/vid/timeleap.mp4 as-is (always 8/13 19:56 → 16:56)
 * - progressive: lib/timeleapScene.js, its clock counting back to the real destination,
 *   timed to the clip's soundtrack
 * Both open a <dialog> in the browser top layer (above the phone dialog — needed on mobile).
 */
import { EXTENSION_FOLDER, LEGACY_EXTENSION_FOLDER } from './constants.js';
import { getSettings, reduceFlashing } from './settings.js';
import { runTimeleapScene, TIMELEAP_DURATION } from './timeleapScene.js';
import { fromLocalInput } from './timeleap.js';

const FX_ID = 'pp-leap-fx';

export function timeleapVideoSources() {
    return [
        `/${EXTENSION_FOLDER}/lib/vid/timeleap.mp4`,
        `/${EXTENSION_FOLDER}/assets/timeleap.mp4`,
        `/${LEGACY_EXTENSION_FOLDER}/lib/vid/timeleap.mp4`,
    ];
}

function wantSound() {
    const s = getSettings();
    return s.soundEnabled !== false && s.timeleapSound !== false;
}

/**
 * @param {string} inner
 * @param {string} label
 */
function openFx(inner, label) {
    document.getElementById(FX_ID)?.remove();
    /** @type {HTMLDialogElement} */
    const root = document.createElement('dialog');
    root.id = FX_ID;
    root.className = `pp-dmail-fx pp-leap-fx${reduceFlashing() ? ' pp-calm' : ''}`;
    root.setAttribute('aria-label', label);
    root.innerHTML = inner;
    document.body.appendChild(root);
    try {
        root.showModal();
    } catch {
        root.setAttribute('open', '');
    }
    requestAnimationFrame(() => root.classList.add('pp-dmail-on'));
    // The leap cannot be cancelled halfway.
    root.addEventListener('cancel', (e) => e.preventDefault());
    return root;
}

/**
 * @param {HTMLDialogElement} root
 * @param {() => void} done
 */
function closeFx(root, done) {
    root.classList.add('pp-dmail-out');
    window.setTimeout(() => {
        try {
            if (root.open) {
                root.close();
            }
        } catch {
            /* ignore */
        }
        root.remove();
        done();
    }, 520);
}

/**
 * @param {{ from?: string, to?: string, lines?: string[] }} [opts]
 * @returns {Promise<void>}
 */
export function playTimeleapSequence(opts = {}) {
    if (getSettings().timeleapCutscene === 'progressive') {
        const from = fromLocalInput(opts.from || '') || new Date(2010, 7, 13, 19, 56);
        const to = fromLocalInput(opts.to || '') || new Date(from.getTime() - 3 * 3600000);
        return playProgressive(from, to, opts.lines || []);
    }
    return playOriginal();
}

/** The clip as-is. */
function playOriginal() {
    return new Promise((resolve) => {
        const root = openFx('<video class="pp-dmail-video" playsinline preload="auto"></video>', 'Time leap');
        const video = /** @type {HTMLVideoElement} */ (root.querySelector('video'));
        const sound = wantSound();
        const sources = timeleapVideoSources();
        let finished = false;
        const finish = () => {
            if (finished) {
                return;
            }
            finished = true;
            try {
                video.pause();
            } catch {
                /* ignore */
            }
            closeFx(root, resolve);
        };

        video.muted = !sound;
        video.playsInline = true;
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        let mutedRetry = false;
        const tryPlay = () => {
            video.play()?.catch((err) => {
                // Autoplay with sound blocked: keep the picture.
                if (err?.name === 'NotAllowedError' && !video.muted && !mutedRetry) {
                    mutedRetry = true;
                    video.muted = true;
                    tryPlay();
                }
            });
        };
        video.addEventListener('ended', () => window.setTimeout(finish, 120));
        video.addEventListener('error', () => {
            sources.shift();
            if (sources.length) {
                video.src = sources[0];
                video.load();
                tryPlay();
            } else {
                finish();
            }
        });
        video.src = sources[0];
        video.load();
        tryPlay();
        window.setTimeout(finish, 20000);
    });
}

/**
 * @param {Date} from
 * @param {Date} to
 * @param {string[]} lines
 */
function playProgressive(from, to, lines) {
    return new Promise((resolve) => {
        const root = openFx('<canvas class="pp-divmeter-canvas" aria-hidden="true"></canvas>', 'Time leap');
        const canvas = /** @type {HTMLCanvasElement} */ (root.querySelector('canvas'));
        /** @type {HTMLAudioElement | null} */
        const audio = wantSound() ? new Audio() : null;
        /** @type {(() => void) | null} */
        let stopScene = null;
        let finished = false;
        let started = false;

        const finish = () => {
            if (finished) {
                return;
            }
            finished = true;
            stopScene?.();
            audio?.pause();
            closeFx(root, resolve);
        };
        const start = () => {
            if (started || finished) {
                return;
            }
            started = true;
            stopScene = runTimeleapScene(canvas, { from, to, lines, onDone: finish });
        };

        if (audio) {
            const sources = timeleapVideoSources();
            audio.addEventListener('playing', () => {
                if (started) {
                    audio.pause(); // too late to sync
                } else {
                    start();
                }
            }, { once: true });
            audio.addEventListener('error', () => {
                sources.shift();
                if (sources.length) {
                    audio.src = sources[0];
                    audio.play().catch(() => start());
                } else {
                    start();
                }
            });
            audio.src = sources[0];
            audio.play().catch((err) => {
                if (err?.name === 'NotAllowedError') {
                    start();
                }
            });
            window.setTimeout(start, 1500);
        } else {
            start();
        }
        window.setTimeout(finish, (TIMELEAP_DURATION + 10) * 1000);
    });
}
