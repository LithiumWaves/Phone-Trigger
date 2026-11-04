/**
 * Board (textboard) data, kept in chat metadata. No UI here so time leaps can prune it.
 *
 * meta.board = {
 *   boards: [{ id, name, topic, steer, custom, threadIds[], generatedAt }],
 *   threads: { [id]: { id, boardId, title, steer, posts[], createdAt, storyTime } },
 *   regulars: { [characterName]: { posts, handle, anon } },
 *   regularsDecided: boolean,
 * }
 * post = { no, name, trip?, uid, text, author?, by?: 'user'|'char'|'traveler'|'anon', storyTime?, at }
 */
import { getMailStore, persistMailStore } from './store.js';

export const DEFAULT_BOARDS = Object.freeze([
    { id: 'occult', name: 'occult', topic: 'Occult, conspiracies, urban legends, time travel, the Organization.' },
    { id: 'sci', name: 'sci', topic: 'Science and technology: physics papers, gadgets, hacking, retro computers.' },
    { id: 'anime', name: 'anime', topic: 'Anime, games, idols, figures, Akihabara shops and events.' },
    { id: 'news', name: 'news', topic: 'Breaking news and current events around Tokyo and the world, with the usual skepticism.' },
]);

const MAX_THREADS_PER_BOARD = 30;
const MAX_POSTS = 300;

export function getBoardData() {
    const m = getMailStore();
    if (!m.board || typeof m.board !== 'object') {
        m.board = { boards: [], threads: {}, regulars: {}, regularsDecided: false };
    }
    const b = m.board;
    if (!Array.isArray(b.boards) || !b.boards.length) {
        b.boards = DEFAULT_BOARDS.map((d) => ({ ...d, steer: '', custom: false, threadIds: [], generatedAt: 0 }));
    }
    // Built-in boards follow their current default topic (older chats stored an earlier one).
    for (const board of b.boards) {
        const def = !board.custom && DEFAULT_BOARDS.find((d) => d.id === board.id);
        if (def && board.topic !== def.topic) {
            board.topic = def.topic;
        }
    }
    if (!b.threads || typeof b.threads !== 'object') {
        b.threads = {};
    }
    if (!b.regulars || typeof b.regulars !== 'object') {
        b.regulars = {};
    }
    return b;
}

export async function saveBoard() {
    await persistMailStore();
}

export function uid(prefix) {
    return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** 2ch-style daily ID: stable per author per thread. */
export function posterId(threadId, authorKey) {
    let h = 2166136261;
    const s = `${threadId}|${authorKey}`;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let out = '';
    let v = h >>> 0;
    for (let i = 0; i < 8; i++) {
        out += chars[v % 64];
        v = (Math.floor(v / 64) ^ Math.imul(v, 2654435761)) >>> 0;
    }
    return out;
}

/**
 * Add a thread with its opening post.
 * @param {string} boardId
 * @param {{ title: string, post: Record<string, any> }} t
 */
export function addThread(boardId, t) {
    const data = getBoardData();
    const board = data.boards.find((b) => b.id === boardId);
    if (!board) {
        return null;
    }
    const id = uid('th');
    data.threads[id] = {
        id,
        boardId,
        title: String(t.title || 'untitled').slice(0, 120),
        steer: '',
        posts: [],
        createdAt: Date.now(),
        storyTime: t.post.storyTime,
    };
    addPost(id, t.post);
    board.threadIds.unshift(id);
    while (board.threadIds.length > MAX_THREADS_PER_BOARD) {
        delete data.threads[board.threadIds.pop()];
    }
    return data.threads[id];
}

/**
 * @param {string} threadId
 * @param {Record<string, any>} post
 */
export function addPost(threadId, post) {
    const th = getBoardData().threads[threadId];
    if (!th) {
        return null;
    }
    const no = (th.posts[th.posts.length - 1]?.no || 0) + 1;
    const authorKey = post.by === 'anon' ? `anon${no % 7}` : `${post.by}:${post.author || post.name}`;
    const p = {
        no,
        name: String(post.name || 'Anonymous').slice(0, 40),
        trip: post.trip || undefined,
        uid: posterId(threadId, authorKey),
        text: String(post.text || '').slice(0, 2000),
        author: post.author || undefined,
        by: post.by || 'anon',
        storyTime: post.storyTime,
        at: Date.now(),
    };
    th.posts.push(p);
    if (th.posts.length > MAX_POSTS) {
        th.posts.splice(1, th.posts.length - MAX_POSTS);
    }
    return p;
}

/**
 * Time leaps: drop threads and posts made after the arrival point.
 * @param {Record<string, any>} metaObj chat metadata being carried to the branch
 * @param {number | null} anchorTs real time of the arrival message
 * @param {string} toTime story time arrived at
 */
export function pruneBoardAfter(metaObj, anchorTs, toTime) {
    const b = metaObj?.board;
    if (!b?.threads) {
        return;
    }
    const after = (p) => (p.storyTime && toTime ? String(p.storyTime) > toTime : anchorTs != null && (p.at || 0) > anchorTs);
    for (const [id, th] of Object.entries(b.threads)) {
        th.posts = (th.posts || []).filter((p) => !after(p));
        if (!th.posts.length) {
            delete b.threads[id];
        }
    }
    for (const board of b.boards || []) {
        board.threadIds = (board.threadIds || []).filter((id) => b.threads[id]);
    }
}
