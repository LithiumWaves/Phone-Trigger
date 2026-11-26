/**
 * Multiplayer link — the only place that talks to ST-Multiplayer's
 * `globalThis.STMultiplayer` (ST-Multiplayer 1.6.0+). Every function is a no-op,
 * or answers "not in a room", when Multiplayer is missing or not connected.
 *
 * Deliberately imports nothing from the phone, so any module can use it
 * without an import cycle.
 *
 * Channels are namespaced `pt.*` and carry `v` (PT_MP_VERSION).
 */

export const PT_MP_VERSION = 1;
const PLAYER_PREFIX = 'mp:';

/** @returns {any | null} the API, only while in a room */
export function mpApi() {
    const api = globalThis.STMultiplayer;
    try {
        return api && typeof api.isConnected === 'function' && api.isConnected() ? api : null;
    } catch {
        return null;
    }
}

export function mpConnected() {
    return Boolean(mpApi());
}

/** In a room, and somebody else's host runs the model and owns the chat. */
export function isMpClient() {
    return mpApi()?.role() === 'client';
}

/** In a room as its host. */
export function isMpHost() {
    return mpApi()?.role() === 'host';
}

/**
 * In a room and in its shared chat (where the host's transcript is), not a local chat.
 * Older Multiplayer builds without inSession(): assume yes while connected.
 */
export function mpInSession() {
    const api = mpApi();
    if (!api) {
        return false;
    }
    try {
        return typeof api.inSession === 'function' ? Boolean(api.inSession()) : true;
    } catch {
        return false;
    }
}

/** A D-Mail or leap here belongs to the host: you're a player in the room's chat. */
export function routesToHost() {
    return isMpClient() && mpInSession();
}

/** A D-Mail or leap here is the room's: tell the other players. */
export function sharesWithRoom() {
    return isMpHost() && mpInSession();
}

export function mpSelfId() {
    return mpApi()?.selfId() || null;
}

// —— Players as contacts ——

/** @param {{ name?: string, persona?: { name?: string|null } | null }} peer */
function peerDisplayName(peer) {
    return String(peer?.persona?.name || peer?.name || 'Player').trim() || 'Player';
}

/** @param {string} name */
export function playerKeyForName(name) {
    return `${PLAYER_PREFIX}${String(name || '').trim().toLowerCase()}`;
}

/** @param {unknown} keyOrContact */
export function isPlayerContact(keyOrContact) {
    if (keyOrContact && typeof keyOrContact === 'object') {
        return Boolean(/** @type {any} */ (keyOrContact).player)
            || String(/** @type {any} */ (keyOrContact).key || '').startsWith(PLAYER_PREFIX);
    }
    return String(keyOrContact || '').startsWith(PLAYER_PREFIX);
}

/**
 * A peer as a phone contact.
 * @param {any} peer
 */
function contactFromPeer(peer) {
    const name = peerDisplayName(peer);
    return {
        key: playerKeyForName(name),
        name,
        player: true,
        peerId: String(peer.id),
        isActive: false,
        description: String(peer?.persona?.description || '').slice(0, 1200),
        personality: '',
        scenario: '',
    };
}

/**
 * The other players in the room, as contacts (never yourself).
 * @returns {{ key: string, name: string, player: true, peerId: string, isActive: false, description: string, personality: string, scenario: string }[]}
 */
export function listPlayerContacts() {
    const api = mpApi();
    if (!api) {
        return [];
    }
    let peers = [];
    try {
        peers = api.peers() || [];
    } catch {
        return [];
    }
    const seen = new Set();
    const out = [];
    for (const peer of peers) {
        if (!peer || peer.isMe) {
            continue;
        }
        const c = contactFromPeer(peer);
        if (seen.has(c.key)) {
            continue;
        }
        seen.add(c.key);
        out.push(c);
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** @param {string} keyOrName */
export function findPlayerContact(keyOrName) {
    const needle = String(keyOrName || '').trim().toLowerCase();
    if (!needle) {
        return null;
    }
    return listPlayerContacts().find((c) => c.key === needle || c.name.toLowerCase() === needle || c.peerId === keyOrName) || null;
}

/**
 * The contact behind a message's sender.
 * @param {string} peerId
 * @param {string} [fallbackName]
 */
export function contactForPeer(peerId, fallbackName = '') {
    const found = listPlayerContacts().find((c) => c.peerId === peerId);
    if (found) {
        return found;
    }
    const name = String(fallbackName || 'Player');
    return { key: playerKeyForName(name), name, player: true, peerId: String(peerId || ''), isActive: false, description: '', personality: '', scenario: '' };
}

/** @param {string} key a player contact key */
export function peerIdFor(key) {
    return findPlayerContact(key)?.peerId || null;
}

/** Your own name as the others see it (persona, else player name). */
export function mpSelfName() {
    const api = mpApi();
    if (!api) {
        return '';
    }
    try {
        const me = (api.peers() || []).find((p) => p.isMe);
        return me ? peerDisplayName(me) : '';
    } catch {
        return '';
    }
}

/** Display name of a peer by id. */
export function mpPeerName(peerId, fallback = 'Someone') {
    const api = mpApi();
    try {
        const peer = (api?.peers() || []).find((p) => p.id === peerId);
        return peer ? peerDisplayName(peer) : fallback;
    } catch {
        return fallback;
    }
}

// —— Messaging ——

/**
 * @param {string} channel
 * @param {Record<string, any>} data
 * @param {string | null} [to] a peer id, 'host', or null for everyone else
 * @returns {Promise<boolean>}
 */
export async function mpSend(channel, data, to = null) {
    const api = mpApi();
    if (!api) {
        return false;
    }
    try {
        return Boolean(await api.send(channel, { v: PT_MP_VERSION, ...(data || {}) }, to ? { to } : {}));
    } catch (err) {
        console.warn('[Phone Trigger] multiplayer send failed', channel, err);
        return false;
    }
}

/** @type {Map<string, Set<(data: any, msg: { from: string, name: string, role: string }) => any>>} */
const handlers = new Map();
/** @type {Set<() => void>} */
const rosterHandlers = new Set();
/** @type {any} */
let attachedTo = null;
/** @type {(() => void)[]} */
let detachers = [];

function dispatch(channel, msg) {
    const set = handlers.get(channel);
    if (!set || !msg) {
        return;
    }
    const data = msg.data && typeof msg.data === 'object' ? msg.data : {};
    for (const fn of [...set]) {
        try {
            const r = fn(data, { from: String(msg.from || ''), name: String(msg.name || ''), role: String(msg.role || '') });
            if (r && typeof r.catch === 'function') {
                r.catch((err) => console.error(`[Phone Trigger] ${channel} handler failed`, err));
            }
        } catch (err) {
            console.error(`[Phone Trigger] ${channel} handler failed`, err);
        }
    }
}

/** Hook our channels into the current API (it is replaced when Multiplayer reloads). */
function attach() {
    const api = globalThis.STMultiplayer;
    if (!api || api === attachedTo || typeof api.on !== 'function') {
        return;
    }
    for (const off of detachers) {
        try { off(); } catch { /* ignore */ }
    }
    detachers = [];
    attachedTo = api;
    for (const channel of handlers.keys()) {
        detachers.push(api.on(channel, (msg) => dispatch(channel, msg)));
    }
    if (typeof api.onRoster === 'function') {
        detachers.push(api.onRoster(() => {
            for (const fn of rosterHandlers) {
                try { fn(); } catch (err) { console.error('[Phone Trigger] roster handler failed', err); }
            }
        }));
    }
}

let listening = false;
function ensureListening() {
    if (listening) {
        return;
    }
    listening = true;
    document.addEventListener('stmp:ready', () => attach());
    attach();
}

/**
 * Listen on a channel; works whether Multiplayer loads before or after us.
 * @param {string} channel
 * @param {(data: any, msg: { from: string, name: string, role: string }) => any} fn
 * @returns {() => void}
 */
export function mpOn(channel, fn) {
    ensureListening();
    let set = handlers.get(channel);
    if (!set) {
        set = new Set();
        handlers.set(channel, set);
        if (attachedTo) {
            detachers.push(attachedTo.on(channel, (msg) => dispatch(channel, msg)));
        }
    }
    set.add(fn);
    return () => set?.delete(fn);
}

/** Players joined, left or changed persona; or the room opened/closed. */
export function onPlayersChanged(fn) {
    ensureListening();
    rosterHandlers.add(fn);
    return () => rosterHandlers.delete(fn);
}

// —— Request / reply (to the host) ——

/** @type {Map<string, { resolve: (v: any) => void, reject: (e: Error) => void, timer: ReturnType<typeof setTimeout> }>} */
const pending = new Map();
const repliesWired = new Set();

function wireReplies(channel) {
    if (repliesWired.has(channel)) {
        return;
    }
    repliesWired.add(channel);
    mpOn(`${channel}.reply`, (data) => {
        const job = pending.get(String(data.rid || ''));
        if (!job) {
            return;
        }
        pending.delete(String(data.rid));
        clearTimeout(job.timer);
        if (data.ok) {
            job.resolve(data.result);
        } else {
            job.reject(new Error(String(data.error || 'The host could not do that.')));
        }
    });
}

/**
 * Ask the host to do something and wait for its answer.
 * @param {string} channel
 * @param {Record<string, any>} data
 * @param {{ timeoutMs?: number, to?: string }} [opts]
 * @returns {Promise<any>}
 */
export function mpRequest(channel, data, opts = {}) {
    wireReplies(channel);
    const rid = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
    const timeoutMs = Math.max(1000, Number(opts.timeoutMs) || 120000);
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            pending.delete(rid);
            reject(new Error('The host did not answer in time.'));
        }, timeoutMs);
        pending.set(rid, { resolve, reject, timer });
        void mpSend(channel, { ...data, rid }, opts.to || 'host').then((sent) => {
            if (!sent && pending.has(rid)) {
                pending.delete(rid);
                clearTimeout(timer);
                reject(new Error('Not connected to the room.'));
            }
        });
    });
}

/**
 * Host side of mpRequest: run `handler` and send its result (or error) back to the asker.
 * Only the host answers; other peers ignore requests.
 * @param {string} channel
 * @param {(data: any, msg: { from: string, name: string, role: string }) => Promise<any> | any} handler
 */
export function mpServe(channel, handler) {
    return mpOn(channel, async (data, msg) => {
        if (!isMpHost() || !data?.rid) {
            return;
        }
        try {
            if (!mpInSession()) {
                throw new Error("The host isn't in the room's chat right now.");
            }
            const result = await handler(data, msg);
            await mpSend(`${channel}.reply`, { rid: data.rid, ok: true, result }, msg.from);
        } catch (err) {
            await mpSend(`${channel}.reply`, { rid: data.rid, ok: false, error: String(err?.message || err) }, msg.from);
        }
    });
}

// —— Local events (so low-level modules can reach the phone without importing it) ——

/**
 * @param {string} name e.g. 'dmail-applied'
 * @param {any} detail
 */
export function emitMpLocal(name, detail) {
    document.dispatchEvent(new CustomEvent(`pt:mp-${name}`, { detail }));
}

/**
 * @param {string} name
 * @param {(detail: any) => void} fn
 */
export function onMpLocal(name, fn) {
    const h = (e) => fn(/** @type {CustomEvent} */ (e).detail);
    document.addEventListener(`pt:mp-${name}`, h);
    return () => document.removeEventListener(`pt:mp-${name}`, h);
}

/** Short stable hash of a message's text, to find the same message on another machine. */
export function textHash(text) {
    const s = String(text || '').replace(/\s+/g, ' ').trim();
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
}
