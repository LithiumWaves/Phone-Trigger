/**
 * Lab Radio — a Steins;Gate-styled music player that drives Dynamic Audio.
 *
 * Songs come from Dynamic Audio's library (assets/bgm, plus any character songs it lists) and
 * play on Dynamic Audio's own player: picking a song goes through its song dropdown
 * (#audio_bgm_select), which makes Dynamic Audio load it at its own volume, with its lock on
 * so it stays on your pick instead of switching by expression.
 *
 * A floating panel slides in while music plays: title marquee, an oscilloscope trace, a
 * progress bar you can drag to jump ahead, previous / play-pause / next, play mode
 * (in order, shuffle, repeat one) and a song list with your own playlists.
 *
 * The trace is drawn, not measured: tapping Dynamic Audio's player with Web Audio would clash
 * with other extensions that do the same (only one can), so it only follows play / pause.
 */
import { getSettings, saveSettings, getContext } from './settings.js';
import { hasDynamicAudio, listSongs, songLabel, releaseMenuMusic } from './menuMusic.js';

const ROOT_ID = 'pp-radio';
const MODES = ['order', 'shuffle', 'loop'];
const MODE_ICON = { order: '→', shuffle: '⇄', loop: '↻' };
const MODE_LABEL = { order: 'Play in order', shuffle: 'Shuffle', loop: 'Repeat this song' };

/** @type {HTMLElement | null} */
let root = null;
/** @type {ReturnType<typeof setInterval> | null} */
let pollTimer = null;
let rafId = 0;
/** The player started the current song (so it handles "ended"). */
let controlled = false;
/** Shown on purpose (Open music player) even with nothing loaded. */
let pinnedOpen = false;
let seeking = false;
/** @type {string[]} */
let library = [];
let phase = 0;

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
        <span class="pp-sg-corner pp-sg-tl"></span><span class="pp-sg-corner pp-sg-tr"></span>
        <span class="pp-sg-corner pp-sg-bl"></span><span class="pp-sg-corner pp-sg-br"></span>
        <div class="pp-radio-head" data-radio-drag>
            <span class="pp-radio-lamp"></span>
            <span class="pp-radio-brand">LAB RADIO</span>
            <span class="pp-radio-list-name"></span>
            <button type="button" class="pp-radio-min" data-radio="min" aria-label="Minimise">–</button>
            <button type="button" class="pp-radio-min" data-radio="close" aria-label="Hide player">✕</button>
        </div>
        <div class="pp-radio-body">
            <canvas class="pp-radio-scope" aria-hidden="true"></canvas>
            <div class="pp-radio-title"><span class="pp-radio-title-text"></span></div>
            <div class="pp-radio-time">
                <span class="pp-radio-now">--:--</span>
                <input type="range" class="pp-radio-seek" min="0" max="1000" step="1" value="0" aria-label="Position" />
                <span class="pp-radio-len">--:--</span>
            </div>
            <div class="pp-radio-keys">
                <button type="button" data-radio="list" aria-label="Songs">☰</button>
                <button type="button" data-radio="mode" class="pp-radio-mode" aria-label="Play mode">→</button>
                <button type="button" data-radio="prev" aria-label="Previous">⏮</button>
                <button type="button" data-radio="play" class="pp-radio-play" aria-label="Play">⏵</button>
                <button type="button" data-radio="next" aria-label="Next">⏭</button>
            </div>
        </div>
        <button type="button" class="pp-radio-mini" data-radio="restore" aria-label="Show player">
            <span class="pp-radio-lamp"></span><span class="pp-radio-mini-text"></span>
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

    const seek = /** @type {HTMLInputElement} */ (root.querySelector('.pp-radio-seek'));
    seek.addEventListener('input', () => {
        seeking = true;
        const el = player();
        if (el && Number.isFinite(el.duration)) {
            /** @type {HTMLElement} */ (root?.querySelector('.pp-radio-now')).textContent = clock((Number(seek.value) / 1000) * el.duration);
        }
    });
    seek.addEventListener('change', () => {
        const el = player();
        if (el && Number.isFinite(el.duration)) {
            el.currentTime = (Number(seek.value) / 1000) * el.duration;
        }
        seeking = false;
    });

    makeDraggable();
    placeFromSettings();
    window.addEventListener('resize', placeFromSettings);
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
        if (/** @type {HTMLElement} */ (ev.target).closest('button')) {
            return;
        }
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
    const w = root.offsetWidth || 260;
    const h = root.offsetHeight || 150;
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
    const was = root.classList.contains('pp-radio-on');
    root.classList.toggle('pp-radio-on', on);
    if (on) {
        root.classList.remove('pp-radio-dismissed');
        placeFromSettings();
        if (!rafId) {
            rafId = requestAnimationFrame(drawScope);
        }
    } else if (was && rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
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
        // Long titles scroll like the Danganronpa scroller; short ones sit still.
        requestAnimationFrame(() => {
            const box = titleEl.parentElement;
            titleEl.classList.toggle('pp-radio-marquee', Boolean(box && titleEl.scrollWidth > box.clientWidth));
            titleEl.style.setProperty('--pp-radio-shift', `${box ? box.clientWidth - titleEl.scrollWidth - 12 : 0}px`);
        });
    }
    /** @type {HTMLElement} */ (root.querySelector('.pp-radio-mini-text')).textContent = title;
    /** @type {HTMLElement} */ (root.querySelector('.pp-radio-list-name')).textContent = playlistName(currentPlaylistId());
    const playBtn = /** @type {HTMLElement} */ (root.querySelector('.pp-radio-play'));
    playBtn.textContent = playing ? '⏸' : '⏵';
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    const modeBtn = /** @type {HTMLElement} */ (root.querySelector('.pp-radio-mode'));
    modeBtn.textContent = MODE_ICON[s.musicPlayMode];
    modeBtn.setAttribute('aria-label', MODE_LABEL[s.musicPlayMode]);
    modeBtn.title = MODE_LABEL[s.musicPlayMode];
    modeBtn.classList.toggle('pp-radio-on-key', s.musicPlayMode !== 'order');
    root.classList.toggle('pp-radio-playing', playing);
    root.classList.toggle('pp-radio-collapsed', Boolean(s.musicPlayerCollapsed));
    const dur = el?.duration;
    /** @type {HTMLElement} */ (root.querySelector('.pp-radio-len')).textContent = clock(Number.isFinite(dur) ? /** @type {number} */ (dur) : NaN);
    if (!seeking) {
        /** @type {HTMLElement} */ (root.querySelector('.pp-radio-now')).textContent = clock(el?.currentTime ?? NaN);
        const seek = /** @type {HTMLInputElement} */ (root.querySelector('.pp-radio-seek'));
        seek.value = String(el && Number.isFinite(dur) && dur ? Math.round((el.currentTime / /** @type {number} */ (dur)) * 1000) : 0);
        seek.disabled = !(el && Number.isFinite(dur));
    }
}

/** Oscilloscope trace: a worldline wobble that moves while music plays and flattens when paused. */
function drawScope() {
    rafId = 0;
    if (!root || !root.classList.contains('pp-radio-on')) {
        return;
    }
    rafId = requestAnimationFrame(drawScope);
    const canvas = /** @type {HTMLCanvasElement} */ (root.querySelector('.pp-radio-scope'));
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) {
        return;
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(w * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
    }
    const g = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    // Graticule
    g.strokeStyle = 'rgba(255, 140, 60, 0.12)';
    g.lineWidth = 1;
    for (let x = 0; x <= w; x += w / 8) {
        g.beginPath();
        g.moveTo(x + 0.5, 0);
        g.lineTo(x + 0.5, h);
        g.stroke();
    }
    g.beginPath();
    g.moveTo(0, h / 2 + 0.5);
    g.lineTo(w, h / 2 + 0.5);
    g.stroke();
    const el = player();
    const playing = Boolean(el && !el.paused && el.getAttribute('src'));
    phase += playing ? 0.07 : 0.008;
    const amp = playing ? h * 0.32 : h * 0.03;
    g.strokeStyle = '#ffb54a';
    g.shadowColor = 'rgba(255, 140, 40, 0.8)';
    g.shadowBlur = 6;
    g.lineWidth = 1.6;
    g.beginPath();
    for (let x = 0; x <= w; x += 2) {
        const t = x / w;
        const y = h / 2
            + Math.sin(t * 9 + phase * 2.1) * amp * 0.55
            + Math.sin(t * 23 - phase * 3.3) * amp * 0.28 * (0.6 + 0.4 * Math.sin(phase * 0.7))
            + Math.sin(t * 51 + phase * 5.2) * amp * 0.12;
        if (x === 0) {
            g.moveTo(x, y);
        } else {
            g.lineTo(x, y);
        }
    }
    g.stroke();
    g.shadowBlur = 0;
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
                    <span class="pp-radio-lamp"></span> LAB RADIO · SONGS
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
