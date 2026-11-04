/**
 * Menu music: a song from the Dynamic Audio extension's library plays while the
 * Phone Trigger menu is open.
 *
 * Dynamic Audio (SillyTavern/Extension-Audio) keeps its songs in SillyTavern's `assets/bgm`
 * folder and plays them on `#audio_bgm` / `#audio_ambient`. While the menu is open its music
 * is held paused (and kept paused if it tries to start again), then handed back on close.
 * Without Dynamic Audio installed this does nothing.
 */
import { getSettings, getContext } from './settings.js';

const FADE_MS = 700;

/** @type {HTMLAudioElement | null} */
let song = null;
/** @type {Array<{ el: HTMLAudioElement, wasPlaying: boolean }>} */
let held = [];
/** @type {ReturnType<typeof setInterval> | null} */
let fadeTimer = null;

const keepPaused = (/** @type {Event} */ e) => {
    if (song) {
        /** @type {HTMLAudioElement} */ (e.target).pause();
    }
};

/** Dynamic Audio is installed (its settings and its players exist). */
export function hasDynamicAudio() {
    const ctx = getContext();
    return Boolean(ctx?.extensionSettings?.audio) && Boolean(document.getElementById('audio_bgm'));
}

/** Dynamic Audio's own music volume and mute, so the menu song sits at the same level. */
function dynamicAudioLevel() {
    const audio = getContext()?.extensionSettings?.audio;
    const v = Number(audio?.bgm_volume);
    const bgm = /** @type {HTMLAudioElement | null} */ (document.getElementById('audio_bgm'));
    return { volume: Number.isFinite(v) ? Math.max(0, Math.min(1, v / 100)) : 0.5, muted: Boolean(bgm?.muted) };
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
        return (Array.isArray(assets?.bgm) ? assets.bgm : []).map((p) => String(p).replaceAll('\\', '/'));
    } catch (err) {
        console.warn('[Phone Trigger] could not list Dynamic Audio songs', err);
        return [];
    }
}

/** @param {string} path */
export function songLabel(path) {
    const file = String(path || '').split('/').pop() || '';
    return decodeURIComponent(file).replace(/\.[a-z0-9]+$/i, '');
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

/** The menu opened (or its song changed): play the chosen song. */
export function startMenuMusic() {
    const s = getSettings();
    if (!s.menuSongEnabled || !s.menuSong || s.soundEnabled === false || !hasDynamicAudio()) {
        return;
    }
    if (song && song.dataset.src === s.menuSong) {
        return;
    }
    if (song) {
        dropSong();
    }
    if (!held.length) {
        for (const id of ['audio_bgm', 'audio_ambient']) {
            const el = /** @type {HTMLAudioElement | null} */ (document.getElementById(id));
            if (el) {
                held.push({ el, wasPlaying: !el.paused });
                el.pause();
                el.addEventListener('play', keepPaused);
            }
        }
    }
    const level = dynamicAudioLevel();
    song = new Audio(s.menuSong);
    song.dataset.src = s.menuSong;
    song.loop = true;
    song.muted = level.muted;
    song.volume = 0;
    const el = song;
    el.play()
        .then(() => {
            if (song === el) {
                fade(el, level.volume);
            }
        })
        .catch((err) => console.warn('[Phone Trigger] menu song could not play', err));
}

function dropSong() {
    if (!song) {
        return;
    }
    const el = song;
    song = null;
    fade(el, 0, () => {
        el.pause();
        el.removeAttribute('src');
        el.load();
    });
}

/** The menu closed: fade the song out and give Dynamic Audio its music back. */
export function stopMenuMusic() {
    if (!song && !held.length) {
        return;
    }
    dropSong();
    const resume = held;
    held = [];
    for (const { el, wasPlaying } of resume) {
        el.removeEventListener('play', keepPaused);
        if (wasPlaying) {
            el.play().catch(() => { /* autoplay may refuse; Dynamic Audio will pick it up */ });
        }
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
