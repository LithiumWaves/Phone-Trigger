/**
 * Menu music: while the Phone Trigger menu is open, Dynamic Audio plays a song you picked.
 *
 * Dynamic Audio (SillyTavern/Extension-Audio) keeps its songs in SillyTavern's `assets/bgm`
 * folder and plays them on its `#audio_bgm` player. Opening the menu hands that player the
 * chosen song (looping, at Dynamic Audio's music volume, with its mute); closing the menu
 * gives it back exactly what it was playing — same track, position, loop and volume.
 * If Dynamic Audio switches tracks on its own while the menu is open (dynamic music, a song
 * ending), the menu song is put back. Its ambient player is paused meanwhile.
 * Without Dynamic Audio installed this does nothing.
 */
import { getSettings, getContext } from './settings.js';

const FADE_MS = 700;

/**
 * What Dynamic Audio's players were doing before the menu took over.
 * @type {{ src: string, time: number, playing: boolean, loop: boolean, volume: number, ambientPlaying: boolean } | null}
 */
let saved = null;
/** The song the menu put on Dynamic Audio's player. */
let menuSrc = '';
/** @type {MutationObserver | null} */
let watcher = null;
/** @type {ReturnType<typeof setInterval> | null} */
let fadeTimer = null;
/** Our own src changes: the watcher ignores these. */
let switching = false;

/** @returns {HTMLAudioElement | null} */
function player() {
    return /** @type {HTMLAudioElement | null} */ (document.getElementById('audio_bgm'));
}

/** @returns {HTMLAudioElement | null} */
function ambientPlayer() {
    return /** @type {HTMLAudioElement | null} */ (document.getElementById('audio_ambient'));
}

/** Dynamic Audio is installed (its settings and its player exist). */
export function hasDynamicAudio() {
    const ctx = getContext();
    return Boolean(ctx?.extensionSettings?.audio) && Boolean(player());
}

/** Dynamic Audio's music volume (0–1). */
function dynamicAudioVolume() {
    const v = Number(getContext()?.extensionSettings?.audio?.bgm_volume);
    return Number.isFinite(v) ? Math.max(0, Math.min(1, v / 100)) : 0.5;
}

/**
 * Songs in Dynamic Audio's library (SillyTavern `assets/bgm`).
 * @returns {Promise<string[]>} asset paths
 */
export async function listSongs() {
    const ctx = getContext();
    try {
        const res = await fetch('/api/assets/get', {
            method: 'POST',
            headers: typeof ctx.getRequestHeaders === 'function' ? ctx.getRequestHeaders() : { 'Content-Type': 'application/json' },
        });
        if (!res.ok) {
            return [];
        }
        const assets = await res.json();
        return (Array.isArray(assets?.bgm) ? assets.bgm : [])
            .map((p) => String(p).replaceAll('\\', '/'))
            .filter((p) => !p.endsWith('.placeholder'));
    } catch (err) {
        console.warn('[Phone Trigger] could not list Dynamic Audio songs', err);
        return [];
    }
}

/** @param {string} path */
export function songLabel(path) {
    const file = String(path || '').split('/').pop() || '';
    try {
        return decodeURIComponent(file).replace(/\.[a-z0-9]+$/i, '');
    } catch {
        return file.replace(/\.[a-z0-9]+$/i, '');
    }
}

/** @param {HTMLAudioElement} el @param {number} to @param {() => void} [done] */
function fade(el, to, done) {
    if (fadeTimer) {
        clearInterval(fadeTimer);
    }
    const from = el.volume;
    const start = performance.now();
    fadeTimer = setInterval(() => {
        const t = Math.min(1, (performance.now() - start) / FADE_MS);
        el.volume = Math.max(0, Math.min(1, from + (to - from) * t));
        if (t >= 1) {
            clearInterval(/** @type {any} */ (fadeTimer));
            fadeTimer = null;
            done?.();
        }
    }, 30);
}

/**
 * Point Dynamic Audio's player at a track and play it.
 * @param {HTMLAudioElement} el
 * @param {string} src
 * @param {{ time?: number, volume: number, loop: boolean, play: boolean }} opts
 */
function load(el, src, opts) {
    switching = true;
    el.loop = opts.loop;
    if (src) {
        el.setAttribute('src', src);
    } else {
        el.removeAttribute('src');
    }
    el.load();
    switching = false;
    if (!src) {
        return;
    }
    if (opts.time) {
        const seek = () => {
            try {
                el.currentTime = /** @type {number} */ (opts.time);
            } catch {
                /* not seekable */
            }
        };
        if (el.readyState >= 1) {
            seek();
        } else {
            el.addEventListener('loadedmetadata', seek, { once: true });
        }
    }
    if (opts.play) {
        el.volume = 0;
        el.play()
            .then(() => fade(el, opts.volume))
            .catch((err) => console.warn('[Phone Trigger] Dynamic Audio could not play', err));
    } else {
        el.volume = opts.volume;
    }
}

/** Dynamic Audio swapped tracks while the menu is open: the menu song goes back on. */
function guard() {
    const el = player();
    if (!el || switching || !menuSrc) {
        return;
    }
    if (el.getAttribute('src') !== menuSrc) {
        load(el, menuSrc, { volume: dynamicAudioVolume(), loop: true, play: true });
    }
}

/** The menu opened (or its song changed): Dynamic Audio plays the chosen song. */
export function startMenuMusic() {
    const s = getSettings();
    const el = player();
    if (!s.menuSongEnabled || !s.menuSong || s.soundEnabled === false || !el || !hasDynamicAudio()) {
        return;
    }
    if (menuSrc === s.menuSong) {
        return;
    }
    if (!saved) {
        const ambient = ambientPlayer();
        saved = {
            src: el.getAttribute('src') || '',
            time: el.currentTime || 0,
            playing: !el.paused,
            loop: el.loop,
            volume: el.volume,
            ambientPlaying: Boolean(ambient && !ambient.paused),
        };
        ambient?.pause();
        watcher = new MutationObserver(guard);
        watcher.observe(el, { attributes: true, attributeFilter: ['src'] });
        el.addEventListener('ended', guard);
    }
    menuSrc = s.menuSong;
    const target = menuSrc;
    const swap = () => {
        if (menuSrc === target) {
            load(el, target, { volume: dynamicAudioVolume(), loop: true, play: true });
        }
    };
    if (!el.paused && el.volume > 0) {
        fade(el, 0, swap);
    } else {
        swap();
    }
}

/** The menu closed: Dynamic Audio goes back to what it was playing. */
export function stopMenuMusic() {
    const el = player();
    if (!saved || !el) {
        return;
    }
    const before = saved;
    saved = null;
    menuSrc = '';
    watcher?.disconnect();
    watcher = null;
    el.removeEventListener('ended', guard);
    const restore = () => {
        if (menuSrc) {
            return; // reopened during the fade
        }
        load(el, before.src, { time: before.time, volume: before.volume, loop: before.loop, play: before.playing });
        if (before.ambientPlaying) {
            ambientPlayer()?.play().catch(() => { /* Dynamic Audio will pick it up */ });
        }
    };
    if (!el.paused && el.volume > 0) {
        fade(el, 0, restore);
    } else {
        restore();
    }
}

/** Settings changed while the menu is open. */
export function refreshMenuMusic() {
    const s = getSettings();
    const dialog = /** @type {HTMLDialogElement | null} */ (document.getElementById('pp-menu'));
    if (!dialog?.open) {
        return;
    }
    if (!s.menuSongEnabled || !s.menuSong || s.soundEnabled === false) {
        stopMenuMusic();
    } else {
        startMenuMusic();
    }
}
