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
 * @typedef {{ kind: 'original' | 'progressive', el: HTMLMediaElement, sources: string[], take: () => HTMLMediaElement }} PreparedLeap
 */

/**
 * Get the cutscene's media ready ahead of time. Call it at the moment the leap starts, while
 * the click that started it still counts as a user gesture: the clip loads during the
 * discharge, and playing it once now (then pausing) lets it play with sound ~8 s later, which
 * stricter browsers would otherwise refuse.
 * @returns {PreparedLeap | null}
 */
export function prepareTimeleapSequence() {
    const progressive = getSettings().timeleapCutscene === 'progressive';
    const sound = wantSound();
    if (progressive && !sound) {
        return null; // the live scene needs no media
    }
    /** @type {HTMLMediaElement} */
    let el;
    if (progressive) {
        el = new Audio();
    } else {
        const video = document.createElement('video');
        video.className = 'pp-dmail-video';
        video.playsInline = true;
        video.setAttribute('playsinline', '');
        video.setAttribute('webkit-playsinline', '');
        el = video;
    }
    el.preload = 'auto';
    const sources = timeleapVideoSources();
    const onError = () => {
        sources.shift();
        if (sources.length) {
            el.src = sources[0];
            el.load();
        }
    };
    el.addEventListener('error', onError);
    el.src = sources[0];
    el.load();
    let taken = false;
    const settle = () => {
        if (!taken) {
            el.pause();
            try {
                el.currentTime = 0;
            } catch {
                /* ignore */
            }
        }
        el.volume = 1;
        el.muted = !sound;
    };
    // Unlock: a silent play inside the gesture, then back to the start.
    el.volume = 0;
    el.muted = !sound;
    el.play()?.then(settle).catch(() => {
        // Not allowed with sound right now: a muted play still preloads it.
        el.muted = true;
        el.play()?.then(settle).catch(() => settle());
    });
    return {
        kind: progressive ? 'progressive' : 'original',
        el,
        sources,
        take() {
            taken = true;
            el.removeEventListener('error', onError);
            el.pause();
            try {
                el.currentTime = 0;
            } catch {
                /* ignore */
            }
            el.volume = 1;
            el.muted = !sound;
            return el;
        },
    };
}

/**
 * @param {{ from?: string, to?: string, lines?: string[], prepared?: PreparedLeap | null }} [opts]
 * @returns {Promise<void>}
 */
export function playTimeleapSequence(opts = {}) {
    const progressive = getSettings().timeleapCutscene === 'progressive';
    const prepared = opts.prepared && opts.prepared.kind === (progressive ? 'progressive' : 'original') ? opts.prepared : null;
    if (progressive) {
        const from = fromLocalInput(opts.from || '') || new Date(2010, 7, 13, 19, 56);
        const to = fromLocalInput(opts.to || '') || new Date(from.getTime() - 3 * 3600000);
        return playProgressive(from, to, opts.lines || [], prepared);
    }
    return playOriginal(prepared);
}

/**
 * The clip as-is.
 * @param {PreparedLeap | null} prepared
 */
function playOriginal(prepared) {
    return new Promise((resolve) => {
        const root = openFx(prepared ? '' : '<video class="pp-dmail-video" playsinline preload="auto"></video>', 'Time leap');
        /** @type {HTMLVideoElement} */
        let video;
        if (prepared) {
            video = /** @type {HTMLVideoElement} */ (prepared.take());
            root.appendChild(video);
        } else {
            video = /** @type {HTMLVideoElement} */ (root.querySelector('video'));
        }
        const sound = wantSound();
        const sources = prepared ? prepared.sources : timeleapVideoSources();
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
        if (!prepared) {
            video.src = sources[0];
            video.load();
        }
        tryPlay();
        window.setTimeout(finish, 20000);
    });
}

/**
 * @param {Date} from
 * @param {Date} to
 * @param {string[]} lines
 * @param {PreparedLeap | null} prepared
 */
function playProgressive(from, to, lines, prepared) {
    return new Promise((resolve) => {
        const root = openFx('<canvas class="pp-divmeter-canvas" aria-hidden="true"></canvas>', 'Time leap');
        const canvas = /** @type {HTMLCanvasElement} */ (root.querySelector('canvas'));
        /** @type {HTMLMediaElement | null} */
        const audio = prepared ? prepared.take() : (wantSound() ? new Audio() : null);
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

        if (audio && prepared && audio.readyState >= 3) {
            // Loaded during the discharge: soundtrack and scene start together, now.
            audio.play()?.catch(() => { /* the scene still plays */ });
            start();
        } else if (audio) {
            const sources = prepared ? prepared.sources : timeleapVideoSources();
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
            if (!prepared) {
                audio.src = sources[0];
            }
            audio.play().catch((err) => {
                if (err?.name === 'NotAllowedError') {
                    start();
                }
            });
            // A slow load delays the scene a little rather than losing the soundtrack.
            window.setTimeout(start, 3000);
        } else {
            start();
        }
        window.setTimeout(finish, (TIMELEAP_DURATION + 10) * 1000);
    });
}
