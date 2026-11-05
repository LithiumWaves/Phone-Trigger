/**
 * Lab Radio — a Steins;Gate-styled music player that drives Dynamic Audio.
 *
 * Songs come from Dynamic Audio's library (assets/bgm, plus any character songs it lists) and
 * play on Dynamic Audio's own player: picking a song goes through its song dropdown
 * (#audio_bgm_select), which makes Dynamic Audio load it at its own volume, with its lock on
 * so it stays on your pick instead of switching by expression.
 *
 * The panel is the Divergence Meter's sibling: the meter's own nixie tubes on a perfboard
 * (track number . MM : SS), the title in an amber VFD tube, a neon bargraph to jump through
 * the song, and an aluminium chassis with push buttons, a mode toggle switch and a trimmer
 * knob for Dynamic Audio's volume. A song list holds your own playlists.
 */
import { getSettings, saveSettings, getContext } from './settings.js';
import { hasDynamicAudio, listSongs, songLabel, releaseMenuMusic } from './menuMusic.js';
import { drawNixieRow } from './divmeter.js';

const ROOT_ID = 'pp-radio';
const MODES = ['order', 'shuffle', 'loop'];
const MODE_LABEL = { order: 'Play in order', shuffle: 'Shuffle', loop: 'Repeat this song' };

/** Engraved key legends. */
const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" aria-hidden="true" ${extra}>${d}</svg>`;
const ICON = {
    play: svg('<path d="M8 5.5v13l10.5-6.5z"/>'),
    pause: svg('<rect x="6.5" y="5.5" width="4" height="13" rx="1"/><rect x="13.5" y="5.5" width="4" height="13" rx="1"/>'),
    prev: svg('<rect x="5" y="6" width="2.6" height="12" rx="1"/><path d="M19 6v12l-9.5-6z"/>'),
    next: svg('<rect x="16.4" y="6" width="2.6" height="12" rx="1"/><path d="M5 6v12l9.5-6z"/>'),
    list: svg('<rect x="4" y="6" width="16" height="2.4" rx="1.2"/><rect x="4" y="10.8" width="16" height="2.4" rx="1.2"/><rect x="4" y="15.6" width="10" height="2.4" rx="1.2"/>'),
    order: svg('<path d="M4 10.8h11.5V7.5L21 12l-5.5 4.5v-3.3H4z"/>'),
    shuffle: svg('<path d="M3.5 7h4.2l7.6 10H18v-2.6l3.5 3.6-3.5 3.6V19h-3.6L6.8 9H3.5zM3.5 17h3.3l2.2-2.9 1.3 1.7L7.7 19H3.5zM14.4 5H18V2.4l3.5 3.6L18 9.6V7h-2.7l-2.1 2.8-1.3-1.7z"/>'),
    loop: svg('<path d="M6 9.5A2.5 2.5 0 0 1 8.5 7H17V4.5l4 3.8-4 3.7V9.5H8.5v3H6zM18 14.5a2.5 2.5 0 0 1-2.5 2.5H7v2.5l-4-3.8 4-3.7v2.5h8.5v-3H18z"/><text x="12" y="14.6" font-size="6.5" text-anchor="middle" font-weight="700">1</text>'),
    min: svg('<rect x="5" y="11" width="14" height="2.6" rx="1.3"/>'),
    close: svg('<path d="M6.3 4.5 12 10.2l5.7-5.7 1.8 1.8-5.7 5.7 5.7 5.7-1.8 1.8-5.7-5.7-5.7 5.7-1.8-1.8 5.7-5.7-5.7-5.7z"/>'),
};

/** @type {HTMLElement | null} */
let root = null;
/** @type {ReturnType<typeof setInterval> | null} */
let pollTimer = null;
/** The player started the current song (so it handles "ended"). */
let controlled = false;
/** Shown on purpose (Open music player) even with nothing loaded. */
let pinnedOpen = false;
let seeking = false;
/** @type {string[]} */
let library = [];

// —— Settings ——

function prefs() {
    const s = getSettings();
    if (!Array.isArray(s.musicPlaylists)) {
        s.musicPlaylists = [];
    }
    if (!MODES.includes(s.musicPlayMode)) {
        s.musicPlayMode = 'order';
    }
    if (typeof s.musicPlaylist !== 'string') {
        s.musicPlaylist = 'all';
    }
    return s;
}

/** @returns {Array<{ id: string, name: string, tracks: string[] }>} */
export function getPlaylists() {
    return prefs().musicPlaylists;
}

function currentPlaylistId() {
    const s = prefs();
    return s.musicPlaylist === 'all' || getPlaylists().some((p) => p.id === s.musicPlaylist) ? s.musicPlaylist : 'all';
}

function playlistName(id) {
    return id === 'all' ? 'All songs' : (getPlaylists().find((p) => p.id === id)?.name || 'All songs');
}

/** @param {string} id */
function tracksOf(id) {
    if (id === 'all') {
        return library;
    }
    return getPlaylists().find((p) => p.id === id)?.tracks || [];
}

// —— Dynamic Audio ——

/** @returns {HTMLAudioElement | null} */
function player() {
    return /** @type {HTMLAudioElement | null} */ (document.getElementById('audio_bgm'));
}

/** Everything Dynamic Audio can play: its assets/bgm library plus character songs in its list. */
export async function refreshLibrary() {
    const songs = new Set(await listSongs());
    document.querySelectorAll('#audio_bgm_select option').forEach((o) => {
        const v = /** @type {HTMLOptionElement} */ (o).value;
        if (v) {
            songs.add(v);
        }
    });
    library = [...songs].sort((a, b) => songLabel(a).localeCompare(songLabel(b)));
    return library;
}

/** The song Dynamic Audio has loaded, as a library path when it is one. */
function currentPath() {
    const el = player();
    const src = el?.getAttribute('src') || '';
    if (!src) {
        return '';
    }
    const decoded = safeDecode(src);
    return library.find((p) => p === src || safeDecode(p) === decoded || decoded.endsWith(`/${safeDecode(p)}`)) || src;
}

/** @param {string} s */
function safeDecode(s) {
    try {
        return decodeURIComponent(s);
    } catch {
        return s;
    }
}

/**
 * Play a song through Dynamic Audio.
 * @param {string} path
 */
export function playTrack(path) {
    const el = player();
    const ctx = getContext();
    const da = ctx?.extensionSettings?.audio;
    if (!el || !da || !path) {
        return;
    }
    releaseMenuMusic();
    // Lock Dynamic Audio onto the pick (no switching by expression), and show it in its panel.
    da.bgm_locked = true;
    document.getElementById('audio_bgm_lock')?.classList.add('redOverlayGlow');
    const select = /** @type {HTMLSelectElement | null} */ (document.getElementById('audio_bgm_select'));
    if (select && window.jQuery) {
        if (![...select.options].some((o) => o.value === path)) {
            select.append(new Option(`asset: ${songLabel(path)}`, path));
        }
        // Dynamic Audio's own handler loads and plays it at its volume.
        window.jQuery(select).val(path).trigger('change');
    } else {
        da.bgm_selected = path;
        el.setAttribute('src', path);
        el.load();
        el.volume = Math.max(0, Math.min(1, Number(da.bgm_volume ?? 50) / 100));
        el.play().catch(() => { /* needs a click first */ });
    }
    ctx.saveSettingsDebounced?.();
    controlled = true;
    el.loop = prefs().musicPlayMode === 'loop';
    pinnedOpen = true;
    show(true);
    render();
}

/** @param {1 | -1} dir */
function step(dir) {
    const list = tracksOf(currentPlaylistId());
    if (!list.length) {
        return;
    }
    const el = player();
    if (dir < 0 && el && el.currentTime > 3) {
        el.currentTime = 0; // first press restarts the song, like a CD player
        return;
    }
    if (prefs().musicPlayMode === 'shuffle' && list.length > 1) {
        const now = currentPath();
        let pick = now;
        for (let i = 0; i < 6 && pick === now; i++) {
            pick = list[Math.floor(Math.random() * list.length)];
        }
        playTrack(pick);
        return;
    }
    const at = list.indexOf(currentPath());
    playTrack(list[at < 0 ? 0 : (at + dir + list.length) % list.length]);
}

export function nextTrack() {
    step(1);
}

export function prevTrack() {
    step(-1);
}

export function togglePause() {
    const el = player();
    if (!el) {
        return;
    }
    if (!el.getAttribute('src')) {
        const list = tracksOf(currentPlaylistId());
        if (list.length) {
            playTrack(list[0]);
        } else {
            openSongList();
        }
        return;
    }
    if (el.paused) {
        el.play().catch(() => { /* needs a click first */ });
    } else {
        el.pause();
    }
    render();
}

function cycleMode() {
    const s = prefs();
    s.musicPlayMode = MODES[(MODES.indexOf(s.musicPlayMode) + 1) % MODES.length];
    saveSettings();
    const el = player();
    if (el && controlled) {
        el.loop = s.musicPlayMode === 'loop';
    }
    render();
}

// —— Panel ——

/** @param {number} sec */
function clock(sec) {
    if (!Number.isFinite(sec) || sec < 0) {
        return '--:--';
    }
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** @param {unknown} v */
function esc(v) {
    return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function build() {
    if (root) {
        return;
    }
    root = document.createElement('div');
    root.id = ROOT_ID;
    root.className = 'pp-radio';
    root.setAttribute('aria-label', 'Lab Radio — now playing');
    root.innerHTML = `
        <div class="pp-radio-stage">
            <div class="pp-radio-deck" aria-hidden="true"><div class="pp-radio-deck-top"></div></div>
            <span class="pp-radio-part pp-radio-cap-el pp-radio-cap-a" aria-hidden="true"></span>
            <span class="pp-radio-part pp-radio-cap-el pp-radio-cap-b" aria-hidden="true"></span>
            <span class="pp-radio-part pp-radio-ceramic" aria-hidden="true"></span>
            <span class="pp-radio-part pp-radio-res" aria-hidden="true"></span>
            <canvas class="pp-radio-nixies" aria-label="Track and time"></canvas>
        </div>
        <div class="pp-radio-chassis">
            <div class="pp-radio-tape" data-radio-drag title="Drag to move">Future Gadget No.204 · Lab Radio</div>
            <div class="pp-radio-window">
                <div class="pp-radio-vfd">
                    <span class="pp-radio-vfd-cap pp-radio-vfd-cap-l" aria-hidden="true"></span>
                    <div class="pp-radio-vfd-top"><span class="pp-radio-list-name"></span><span class="pp-radio-bar-len"></span></div>
                    <div class="pp-radio-title"><span class="pp-radio-title-text"></span></div>
                    <span class="pp-radio-vfd-cap pp-radio-vfd-cap-r" aria-hidden="true"></span>
                </div>
                <div class="pp-radio-bar" role="slider" tabindex="0" aria-label="Position" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
                    <span class="pp-radio-bar-glow"></span>
                </div>
            </div>
            <div class="pp-radio-controls">
                <span class="pp-radio-screw pp-radio-screw-l" aria-hidden="true"></span>
                <button type="button" class="pp-radio-key" data-radio="list" aria-label="Songs">LIST</button>
                <button type="button" class="pp-radio-toggle" data-radio="mode" aria-label="Play mode">
                    <span class="pp-radio-toggle-lever"></span>
                    <span class="pp-radio-toggle-labels"><i>ORD</i><i>SHF</i><i>RPT</i></span>
                </button>
                <button type="button" class="pp-radio-push" data-radio="prev" aria-label="Previous">${ICON.prev}</button>
                <span class="pp-radio-neon" aria-hidden="true"></span>
                <button type="button" class="pp-radio-push pp-radio-push-big pp-radio-play" data-radio="play" aria-label="Play">${ICON.play}</button>
                <button type="button" class="pp-radio-push" data-radio="next" aria-label="Next">${ICON.next}</button>
                <span class="pp-radio-trim" role="slider" tabindex="0" aria-label="Volume (Dynamic Audio)" aria-valuemin="0" aria-valuemax="100"><span class="pp-radio-trim-cap"></span></span>
                <span class="pp-radio-edge">
                    <button type="button" class="pp-radio-mini-sw" data-radio="min" aria-label="Fold down" title="Fold down"></button>
                    <button type="button" class="pp-radio-mini-sw pp-radio-mini-sw-off" data-radio="close" aria-label="Hide player" title="Hide"></button>
                </span>
                <span class="pp-radio-screw pp-radio-screw-r" aria-hidden="true"></span>
            </div>
            <span class="pp-radio-foot pp-radio-foot-l" aria-hidden="true"></span>
            <span class="pp-radio-foot pp-radio-foot-r" aria-hidden="true"></span>
        </div>
        <button type="button" class="pp-radio-mini" data-radio="restore" aria-label="Show player">
            <span class="pp-radio-mini-stage">
                <span class="pp-radio-deck" aria-hidden="true"><span class="pp-radio-deck-top"></span></span>
                <canvas class="pp-radio-mini-nixies" aria-hidden="true"></canvas>
            </span>
            <span class="pp-radio-mini-box"><span class="pp-radio-mini-text"></span></span>
        </button>
    `;
    document.body.appendChild(root);

    root.addEventListener('click', (e) => {
        const btn = /** @type {HTMLElement} */ (e.target).closest('[data-radio]');
        if (!btn) {
            return;
        }
        const what = btn.getAttribute('data-radio');
        if (what === 'play') {
            togglePause();
        } else if (what === 'next') {
            nextTrack();
        } else if (what === 'prev') {
            prevTrack();
        } else if (what === 'mode') {
            cycleMode();
        } else if (what === 'list') {
            openSongList();
        } else if (what === 'min' || what === 'restore') {
            const s = prefs();
            s.musicPlayerCollapsed = what === 'min';
            saveSettings();
            nixieKey = '';
            render();
        } else if (what === 'close') {
            pinnedOpen = false;
            if (root) {
                root.dataset.dismissedSrc = player()?.getAttribute('src') || '';
            }
            root?.classList.add('pp-radio-dismissed');
            show(false);
        }
    });

    wireBargraph();
    wireTrimmer();
    makeDraggable();
    placeFromSettings();
    window.addEventListener('resize', placeFromSettings);
}

/** IN-13-style neon bargraph: click or drag along it to jump; arrow keys step 5 s. */
function wireBargraph() {
    const bar = /** @type {HTMLElement} */ (root?.querySelector('.pp-radio-bar'));
    if (!bar) {
        return;
    }
    const at = (/** @type {PointerEvent} */ ev) => {
        const r = bar.getBoundingClientRect();
        return Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
    };
    const preview = (f) => {
        bar.style.setProperty('--pp-pct', `${f * 100}%`);
    };
    /** @type {number | null} */
    let id = null;
    bar.addEventListener('pointerdown', (e) => {
        const el = player();
        if (!el || !Number.isFinite(el.duration)) {
            return;
        }
        id = e.pointerId;
        seeking = true;
        bar.setPointerCapture(e.pointerId);
        preview(at(e));
    });
    bar.addEventListener('pointermove', (e) => {
        if (id === e.pointerId) {
            preview(at(e));
        }
    });
    const end = (/** @type {PointerEvent} */ e) => {
        if (id !== e.pointerId) {
            return;
        }
        id = null;
        const el = player();
        if (el && Number.isFinite(el.duration)) {
            el.currentTime = at(e) * el.duration;
        }
        seeking = false;
        render();
    };
    bar.addEventListener('pointerup', end);
    bar.addEventListener('pointercancel', () => {
        id = null;
        seeking = false;
    });
    bar.addEventListener('keydown', (e) => {
        const el = player();
        if (!el || !Number.isFinite(el.duration)) {
            return;
        }
        const step = e.key === 'ArrowRight' ? 5 : e.key === 'ArrowLeft' ? -5 : 0;
        if (step) {
            e.preventDefault();
            el.currentTime = Math.max(0, Math.min(el.duration, el.currentTime + step));
            render();
        }
    });
}

/** Dynamic Audio's music volume (0–100). */
function daVolume() {
    const v = Number(getContext()?.extensionSettings?.audio?.bgm_volume);
    return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 50;
}

/**
 * Set the volume through Dynamic Audio: its own slider handler applies and saves it.
 * @param {number} v 0–100
 */
function setDaVolume(v) {
    const vol = Math.round(Math.max(0, Math.min(100, v)));
    const slider = document.getElementById('audio_bgm_volume_slider');
    if (slider && window.jQuery) {
        window.jQuery(slider).val(vol).trigger('input');
    } else {
        const da = getContext()?.extensionSettings?.audio;
        if (da) {
            da.bgm_volume = vol;
        }
        const el = player();
        if (el) {
            el.volume = vol / 100;
        }
        getContext()?.saveSettingsDebounced?.();
    }
    syncTrimmer();
}

function syncTrimmer() {
    const trim = /** @type {HTMLElement | null} */ (root?.querySelector('.pp-radio-trim'));
    if (!trim) {
        return;
    }
    const v = daVolume();
    trim.style.setProperty('--pp-turn', `${-135 + (v / 100) * 270}deg`);
    trim.setAttribute('aria-valuenow', String(v));
    trim.title = `Volume ${v}`;
}

/** The white trimmer knob: drag up/down or scroll to turn the volume. */
function wireTrimmer() {
    const trim = /** @type {HTMLElement} */ (root?.querySelector('.pp-radio-trim'));
    if (!trim) {
        return;
    }
    /** @type {{ id: number, y: number, v: number } | null} */
    let turn = null;
    trim.addEventListener('pointerdown', (e) => {
        turn = { id: e.pointerId, y: e.clientY, v: daVolume() };
        trim.setPointerCapture(e.pointerId);
        e.preventDefault();
    });
    trim.addEventListener('pointermove', (e) => {
        if (turn && e.pointerId === turn.id) {
            setDaVolume(turn.v + (turn.y - e.clientY) * 0.8);
        }
    });
    const end = (/** @type {PointerEvent} */ e) => {
        if (turn && e.pointerId === turn.id) {
            turn = null;
        }
    };
    trim.addEventListener('pointerup', end);
    trim.addEventListener('pointercancel', end);
    trim.addEventListener('wheel', (e) => {
        e.preventDefault();
        setDaVolume(daVolume() + (e.deltaY < 0 ? 5 : -5));
    }, { passive: false });
    trim.addEventListener('keydown', (e) => {
        const step = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? 5 : e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -5 : 0;
        if (step) {
            e.preventDefault();
            setDaVolume(daVolume() + step);
        }
    });
    syncTrimmer();
}

function makeDraggable() {
    const handle = root?.querySelector('[data-radio-drag]');
    if (!root || !handle) {
        return;
    }
    /** @type {{ id: number, dx: number, dy: number } | null} */
    let drag = null;
    handle.addEventListener('pointerdown', (e) => {
        const ev = /** @type {PointerEvent} */ (e);
        const r = /** @type {HTMLElement} */ (root).getBoundingClientRect();
        drag = { id: ev.pointerId, dx: ev.clientX - r.left, dy: ev.clientY - r.top };
        /** @type {HTMLElement} */ (handle).setPointerCapture(ev.pointerId);
    });
    handle.addEventListener('pointermove', (e) => {
        const ev = /** @type {PointerEvent} */ (e);
        if (!drag || ev.pointerId !== drag.id || !root) {
            return;
        }
        place(ev.clientX - drag.dx, ev.clientY - drag.dy);
    });
    const end = (e) => {
        if (!drag || e.pointerId !== drag.id || !root) {
            return;
        }
        drag = null;
        const r = root.getBoundingClientRect();
        prefs().musicPlayerPos = { x: Math.round(r.left), y: Math.round(r.top) };
        saveSettings();
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
}

/** @param {number} x @param {number} y */
function place(x, y) {
    if (!root) {
        return;
    }
    const w = root.offsetWidth || 320;
    const h = root.offsetHeight || 240;
    root.style.left = `${Math.max(4, Math.min(window.innerWidth - w - 4, x))}px`;
    root.style.top = `${Math.max(4, Math.min(window.innerHeight - h - 4, y))}px`;
}

function placeFromSettings() {
    const pos = prefs().musicPlayerPos;
    if (pos && Number.isFinite(pos.x) && Number.isFinite(pos.y)) {
        place(pos.x, pos.y);
    } else {
        place(10, 56); // under SillyTavern's top bar
    }
}

export function resetPlayerPosition() {
    delete prefs().musicPlayerPos;
    saveSettings();
    placeFromSettings();
}

/** @param {boolean} on */
function show(on) {
    if (!root) {
        return;
    }
    root.classList.toggle('pp-radio-on', on);
    if (on) {
        root.classList.remove('pp-radio-dismissed');
        placeFromSettings();
        nixieKey = '';
        render();
    }
}

/** "7" → "07"; the tubes show two digits. */
const two = (n) => String(Math.max(0, Math.floor(n)) % 100).padStart(2, '0');

/**
 * What the nixie tubes say: track number, decimal point, MM, colon, SS (like the meter).
 * @param {HTMLAudioElement | null} el
 * @param {string} path
 * @param {boolean} colonOn
 */
function tubeChars(el, path, colonOn) {
    if (!el || !path) {
        return [' ', ' ', ' ', ' ', ' ', ' ', ' ', ' '];
    }
    const list = tracksOf(currentPlaylistId());
    const idx = list.indexOf(path);
    const t = Number.isFinite(el.currentTime) ? el.currentTime : 0;
    const no = idx >= 0 ? two(idx + 1) : '  ';
    const mm = two(t / 60);
    const ss = two(t % 60);
    return [no[0], no[1], '.', mm[0], mm[1], colonOn ? ':' : ' ', ss[0], ss[1]];
}

let nixieKey = '';
/** Paused: the colon blinks. */
let blink = true;

function drawTubes(chars, playing) {
    if (!root) {
        return;
    }
    const collapsed = root.classList.contains('pp-radio-collapsed');
    const alpha = playing ? 1 : 0.55;
    const key = `${collapsed}|${chars.join('')}|${alpha}`;
    if (key === nixieKey) {
        return;
    }
    nixieKey = key;
    if (collapsed) {
        const mini = /** @type {HTMLCanvasElement} */ (root.querySelector('.pp-radio-mini-nixies'));
        drawNixieRow(mini, chars.slice(3), { alpha, foot: 0.26, shadow: true, pool: true });
    } else {
        const canvas = /** @type {HTMLCanvasElement} */ (root.querySelector('.pp-radio-nixies'));
        drawNixieRow(canvas, chars, { alpha, foot: 0.15, span: 0.82, shadow: true, pool: true });
    }
}

function render() {
    if (!root) {
        return;
    }
    const el = player();
    const path = currentPath();
    const title = path ? songLabel(path) : 'No song — open the list';
    const playing = Boolean(el && !el.paused && el.getAttribute('src'));
    const s = prefs();
    const titleEl = /** @type {HTMLElement} */ (root.querySelector('.pp-radio-title-text'));
    if (titleEl.textContent !== title) {
        titleEl.textContent = title;
        // Long titles scroll; short ones sit still.
        requestAnimationFrame(() => {
            const box = titleEl.parentElement;
            titleEl.classList.toggle('pp-radio-marquee', Boolean(box && titleEl.scrollWidth > box.clientWidth));
            titleEl.style.setProperty('--pp-radio-shift', `${box ? box.clientWidth - titleEl.scrollWidth - 12 : 0}px`);
        });
    }
    /** @type {HTMLElement} */ (root.querySelector('.pp-radio-mini-text')).textContent = title;
    /** @type {HTMLElement} */ (root.querySelector('.pp-radio-list-name')).textContent = playlistName(currentPlaylistId());
    const playBtn = /** @type {HTMLElement} */ (root.querySelector('.pp-radio-play'));
    if (playBtn.dataset.state !== String(playing)) {
        playBtn.dataset.state = String(playing);
        playBtn.innerHTML = playing ? ICON.pause : ICON.play;
    }
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    const modeBtn = /** @type {HTMLElement} */ (root.querySelector('.pp-radio-toggle'));
    modeBtn.dataset.mode = s.musicPlayMode;
    modeBtn.setAttribute('aria-label', `Play mode: ${MODE_LABEL[s.musicPlayMode]}`);
    modeBtn.title = MODE_LABEL[s.musicPlayMode];
    root.classList.toggle('pp-radio-playing', playing);
    root.classList.toggle('pp-radio-collapsed', Boolean(s.musicPlayerCollapsed));
    drawTubes(tubeChars(el, path, playing || blink), playing);
    const dur = el?.duration;
    const bar = /** @type {HTMLElement} */ (root.querySelector('.pp-radio-bar'));
    /** @type {HTMLElement} */ (root.querySelector('.pp-radio-bar-len')).textContent = Number.isFinite(dur) ? clock(/** @type {number} */ (dur)) : '';
    if (!seeking) {
        const pct = el && Number.isFinite(dur) && dur ? (el.currentTime / /** @type {number} */ (dur)) * 100 : 0;
        bar.style.setProperty('--pp-pct', `${pct}%`);
        bar.setAttribute('aria-valuenow', String(Math.round(pct)));
        bar.setAttribute('aria-valuetext', `${clock(el?.currentTime ?? NaN)} of ${clock(Number.isFinite(dur) ? /** @type {number} */ (dur) : NaN)}`);
    }
    bar.classList.toggle('pp-radio-bar-off', !(el && Number.isFinite(dur)));
    syncTrimmer();
}

/** Keep the panel in step with Dynamic Audio's player. */
function poll() {
    const s = prefs();
    const el = player();
    if (!root || s.musicPlayerEnabled === false || !el) {
        show(false);
        return;
    }
    const loaded = Boolean(el.getAttribute('src'));
    const playing = loaded && !el.paused;
    const visible = root.classList.contains('pp-radio-on');
    blink = playing ? true : !blink;
    if (root.classList.contains('pp-radio-dismissed') && !pinnedOpen) {
        // Hidden with ✕: comes back with the next song.
        if (playing && el.getAttribute('src') !== root.dataset.dismissedSrc) {
            root.classList.remove('pp-radio-dismissed');
        } else {
            root.dataset.dismissedSrc = el.getAttribute('src') || '';
            return;
        }
    }
    if (playing || pinnedOpen || (visible && loaded)) {
        show(true);
        render();
    } else if (visible) {
        show(false);
    }
}

// —— Song list ——

/** Pick songs and manage playlists. */
export async function openSongList() {
    await refreshLibrary();
    document.getElementById('pp-radio-list')?.remove();
    const dlg = document.createElement('dialog');
    dlg.id = 'pp-radio-list';
    dlg.className = 'pp-sg-prompt pp-radio-list';
    let view = currentPlaylistId();
    let query = '';
    /** @type {string | null} song whose "add to" menu is open */
    let adding = null;

    const draw = () => {
        const lists = getPlaylists();
        const custom = view !== 'all';
        const now = currentPath();
        const songs = tracksOf(view).filter((p) => !query || songLabel(p).toLowerCase().includes(query.toLowerCase()));
        dlg.innerHTML = `
            <div class="pp-sg-panel pp-radio-list-panel">
                <span class="pp-sg-corner pp-sg-tl"></span><span class="pp-sg-corner pp-sg-tr"></span>
                <span class="pp-sg-corner pp-sg-bl"></span><span class="pp-sg-corner pp-sg-br"></span>
                <div class="pp-radio-list-head">
                    <span class="pp-radio-list-title">Lab Radio · Songs</span>
                    <button type="button" class="pp-radio-x" data-l="close" aria-label="Close">✕</button>
                </div>
                <div class="pp-radio-list-bar">
                    <select class="pp-radio-input" data-l="view" aria-label="Playlist">
                        <option value="all" ${view === 'all' ? 'selected' : ''}>All songs (${library.length})</option>
                        ${lists.map((p) => `<option value="${esc(p.id)}" ${view === p.id ? 'selected' : ''}>${esc(p.name)} (${p.tracks.length})</option>`).join('')}
                    </select>
                    <button type="button" class="pp-radio-btn" data-l="new" title="New playlist">＋ New</button>
                    ${custom ? '<button type="button" class="pp-radio-btn" data-l="rename" title="Rename playlist">✎</button><button type="button" class="pp-radio-btn" data-l="delete" title="Delete playlist">🗑</button>' : ''}
                </div>
                <input type="search" class="pp-radio-input pp-radio-search" data-l="search" placeholder="Filter by name…" value="${esc(query)}" />
                <div class="pp-radio-rows">
                    ${songs.length ? songs.map((p) => `
                        <div class="pp-radio-row ${p === now ? 'pp-radio-row-now' : ''}">
                            <button type="button" class="pp-radio-row-play" data-play="${esc(p)}">${p === now ? '▶ ' : ''}${esc(songLabel(p))}</button>
                            ${custom
                                ? `<button type="button" class="pp-radio-row-act" data-remove="${esc(p)}" title="Remove from playlist">✕</button>`
                                : `<button type="button" class="pp-radio-row-act" data-add="${esc(p)}" title="Add to a playlist">＋</button>`}
                            ${adding === p ? `
                                <div class="pp-radio-add">
                                    ${lists.length ? lists.map((l) => `<button type="button" data-toggle="${esc(l.id)}">${l.tracks.includes(p) ? '✓' : '·'} ${esc(l.name)}</button>`).join('') : '<span>No playlists yet — ＋ New</span>'}
                                </div>` : ''}
                        </div>
                    `).join('') : `<div class="pp-radio-empty">${library.length ? (custom && !tracksOf(view).length ? 'Empty playlist — add songs from All songs with ＋.' : 'No match.') : 'No songs found. Put music in Dynamic Audio\'s library (assets/bgm).'}</div>`}
                </div>
                <div class="pp-radio-list-foot">Plays through Dynamic Audio. Picking a song locks it there.</div>
            </div>
        `;
        const search = /** @type {HTMLInputElement | null} */ (dlg.querySelector('[data-l="search"]'));
        search?.addEventListener('input', () => {
            query = search.value;
            const pos = search.selectionStart;
            draw();
            const again = /** @type {HTMLInputElement | null} */ (dlg.querySelector('[data-l="search"]'));
            again?.focus();
            again?.setSelectionRange(pos, pos);
        });
        dlg.querySelector('[data-l="view"]')?.addEventListener('change', (e) => {
            view = /** @type {HTMLSelectElement} */ (e.target).value;
            adding = null;
            draw();
        });
    };

    dlg.addEventListener('click', (e) => {
        const t = /** @type {HTMLElement} */ (e.target);
        if (t === dlg) {
            close();
            return;
        }
        const b = t.closest('button');
        if (!b) {
            return;
        }
        const lists = getPlaylists();
        if (b.dataset.l === 'close') {
            close();
        } else if (b.dataset.play) {
            // The list you picked from becomes the queue.
            prefs().musicPlaylist = view;
            saveSettings();
            playTrack(b.dataset.play);
            draw();
        } else if (b.dataset.add) {
            adding = adding === b.dataset.add ? null : b.dataset.add;
            draw();
        } else if (b.dataset.toggle && adding) {
            const list = lists.find((l) => l.id === b.dataset.toggle);
            if (list) {
                list.tracks = list.tracks.includes(adding) ? list.tracks.filter((x) => x !== adding) : [...list.tracks, adding];
                saveSettings();
            }
            draw();
        } else if (b.dataset.remove) {
            const list = lists.find((l) => l.id === view);
            if (list) {
                list.tracks = list.tracks.filter((x) => x !== b.dataset.remove);
                saveSettings();
            }
            draw();
        } else if (b.dataset.l === 'new') {
            const name = prompt('Name the playlist', 'Lab')?.trim();
            if (name) {
                const id = `pl_${Date.now().toString(36)}`;
                lists.push({ id, name: name.slice(0, 40), tracks: [] });
                saveSettings();
                view = id;
            }
            draw();
        } else if (b.dataset.l === 'rename') {
            const list = lists.find((l) => l.id === view);
            const name = list && prompt('Rename the playlist', list.name)?.trim();
            if (list && name) {
                list.name = name.slice(0, 40);
                saveSettings();
            }
            draw();
        } else if (b.dataset.l === 'delete') {
            const list = lists.find((l) => l.id === view);
            if (list && confirm(`Delete the playlist "${list.name}"? The songs stay in the library.`)) {
                prefs().musicPlaylists = lists.filter((l) => l.id !== view);
                if (prefs().musicPlaylist === view) {
                    prefs().musicPlaylist = 'all';
                }
                saveSettings();
                view = 'all';
            }
            draw();
        }
        render();
    });
    dlg.addEventListener('cancel', (e) => {
        e.preventDefault();
        close();
    });
    function close() {
        try {
            dlg.close();
        } catch {
            /* ignore */
        }
        dlg.remove();
    }
    draw();
    document.body.appendChild(dlg);
    try {
        dlg.showModal();
    } catch {
        dlg.setAttribute('open', '');
    }
}

// —— Lifecycle ——

/** Show the player now, even with nothing playing (settings button, /music). */
export function openMusicPlayer() {
    if (!hasDynamicAudio()) {
        return false;
    }
    build();
    pinnedOpen = true;
    prefs().musicPlayerCollapsed = false;
    show(true);
    render();
    return true;
}

export function initMusicPlayer() {
    if (pollTimer) {
        return;
    }
    // Dynamic Audio may load after us: wait for its player before building anything.
    pollTimer = setInterval(() => {
        const el = player();
        if (!el || !hasDynamicAudio()) {
            return;
        }
        if (!root) {
            build();
            void refreshLibrary();
            el.addEventListener('ended', () => {
                if (controlled && prefs().musicPlayMode !== 'loop') {
                    nextTrack();
                }
            });
            ['play', 'pause', 'loadedmetadata'].forEach((ev) => el.addEventListener(ev, () => render()));
        }
        poll();
    }, 500);
}
