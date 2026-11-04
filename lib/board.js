/**
 * @channel — an anonymous textboard on the phone.
 *
 * Nothing generates in the background: a board's threads are written when you first open it
 * (or press ↻), a thread's first 4–6 replies when you first open it, and more only when you
 * press Load more. You can steer a board or a thread, post yourself, start threads, and add
 * boards of your own (a strong steer: the board's topic shapes everything posted there).
 *
 * Characters post too (on by default): once per chat their cards decide who'd plausibly use
 * the site and under what handle (or anonymously). Regulars turn up in replies in their own
 * voice, and you can make anyone post with "Post as…".
 */
import { getSettings, toast } from './settings.js';
import { listMailContacts, getPersonaName } from './store.js';
import { isPhoneWaveContact, getWorldlineFacts } from './dmail.js';
import { registerPhoneApp } from './phone.js';
import { storyStamp, isStoryClockActive, getStoryClock, formatStoryTime } from './storyClock.js';
import { getBoardData, saveBoard, addThread, addPost, uid } from './boardStore.js';
import { bindToggle, bindValue, characterCardText, esc, parseJsonLoose, quietGenerate, recentChatLines } from './ui.js';
import { bindingConvergence } from './worldline.js';

/** @type {{ level: 'home' | 'board' | 'thread' | 'newboard' | 'newthread', boardId: string, threadId: string, busy: string, reveal: boolean, postAs: boolean, replyTo: number }} */
const nav = { level: 'home', boardId: '', threadId: '', busy: '', reveal: false, postAs: false, replyTo: 0 };
/** @type {import('./phone.js').PhoneAppApi | null} */
let api = null;

function boardName() {
    return String(getSettings().boardName || '@channel').trim() || '@channel';
}

function rerender() {
    if (api?.isActive()) {
        api.render();
    }
}

/** The cast who could post (never PhoneWave). */
function cast() {
    return listMailContacts().filter((c) => c && !isPhoneWaveContact(c.key));
}

// —— Regulars ——

/** Decide once per chat which characters use the board and under what handle. */
async function ensureRegulars() {
    const s = getSettings();
    const data = getBoardData();
    const people = cast();
    const undecided = people.filter((c) => !data.regulars[c.name]);
    if (!s.boardCharacters || !undecided.length) {
        return;
    }
    const prompt = [
        `"${boardName()}" is an anonymous Japanese textboard (2ch-style) in 2010: otaku, conspiracy nuts, students, hackers.`,
        'For each character below, decide from their card whether they would plausibly read and post there.',
        'An older person who avoids computers, or someone with no interest in the internet, would not.',
        'If they would, pick the handle they would use (their own style — a nickname, a pun, a tripcode-like name), or "Anonymous" if they would post anonymously.',
        '',
        ...undecided.map((c) => `### ${c.name}\n${characterCardText(c.name, 500) || '(no card)'}`),
        '',
        'Answer with JSON only: {"<name>": {"posts": true|false, "handle": "…"}, …}',
    ].join('\n');
    let res = null;
    try {
        res = parseJsonLoose(await quietGenerate(prompt));
    } catch (err) {
        console.warn('[Phone Trigger] board regulars failed', err);
    }
    for (const c of undecided) {
        const r = res && typeof res === 'object' ? (res[c.name] || res[c.name.split(/\s+/)[0]]) : null;
        const handle = String(r?.handle || 'Anonymous').trim().slice(0, 40) || 'Anonymous';
        data.regulars[c.name] = {
            posts: Boolean(r?.posts),
            handle,
            anon: /^anonymous$/i.test(handle) || handle === '名無しさん',
        };
    }
    data.regularsDecided = true;
    await saveBoard();
    renderRegularsPanel();
}

function regularsFor() {
    if (!getSettings().boardCharacters) {
        return [];
    }
    const data = getBoardData();
    return cast()
        .map((c) => ({ name: c.name, ...(data.regulars[c.name] || {}) }))
        .filter((r) => r.posts);
}

// —— Prompt pieces ——

function storyBlock() {
    if (!getSettings().boardStoryAware) {
        return '';
    }
    const lines = recentChatLines(10, 220);
    const facts = getWorldlineFacts().slice(0, 6).map((f) => `- ${f.text}`);
    return [
        'What has been happening around the people the story follows (posters may have heard rumors, seen things in Akihabara, or be those people — never reveal private details nobody could know):',
        ...lines.map((l) => `- ${l}`),
        facts.length ? 'True on this worldline:' : '',
        ...facts,
        isStoryClockActive() ? `Current date/time: ${formatStoryTime(getStoryClock())}` : '',
    ].filter(Boolean).join('\n');
}

function travelerBlock() {
    const s = getSettings();
    if (!s.boardTraveler) {
        return '';
    }
    const hints = [
        ...getWorldlineFacts().slice(0, 4).map((f) => f.text),
        ...bindingConvergence().map((c) => `fated: ${c.text}`),
    ];
    return [
        `A recurring poster with the tripcode name "${s.boardTravelerHandle || 'Traveler◆T1t0r'}" claims to be a time traveler from the future.`,
        'Calm, cryptic, specific; answers questions about the future in riddles; gets mocked. At most one post per batch, and not every batch (author "traveler").',
        hints.length ? `They seem to know things they shouldn't: ${hints.join(' | ')}` : '',
    ].filter(Boolean).join('\n');
}

function regularsBlock() {
    const regs = regularsFor();
    if (!regs.length) {
        return '';
    }
    return [
        'Some regulars may post (at most one or two posts per batch, only where it fits; they write the way they would online — not like their spoken dialogue):',
        ...regs.map((r) => `- ${r.name} posts as "${r.anon ? 'Anonymous' : r.handle}". ${characterCardText(r.name, 420).replace(/\s+/g, ' ')}`),
        'For their posts set "author" to their name.',
    ].join('\n');
}

function threadTranscript(th, max = 24) {
    const user = getPersonaName();
    return th.posts.slice(-max).map((p) => {
        const you = p.by === 'user' ? ' (You)' : '';
        return `>>${p.no} ${p.name}${p.trip ? ` ${p.trip}` : ''}${you}${p.by === 'user' ? ` [${user}]` : ''}:\n${p.text}`;
    }).join('\n\n');
}

function boardOf(id) {
    return getBoardData().boards.find((b) => b.id === id);
}

/** Map a generated post to a stored one (resolving regulars and the traveler). */
function shapePost(raw) {
    const s = getSettings();
    const data = getBoardData();
    const author = String(raw?.author || '').trim();
    const text = String(raw?.text || '').trim();
    if (!text) {
        return null;
    }
    if (/^traveler$/i.test(author) && s.boardTraveler) {
        const handle = String(s.boardTravelerHandle || 'Traveler◆T1t0r');
        const [name, trip] = handle.includes('◆') ? [handle.split('◆')[0], `◆${handle.split('◆')[1]}`] : [handle, undefined];
        return { name: name || 'Traveler', trip, text, by: 'traveler', author: 'traveler', storyTime: storyStamp() };
    }
    const reg = author && data.regulars[author];
    if (reg && s.boardCharacters) {
        return { name: reg.anon ? 'Anonymous' : reg.handle, text, by: 'char', author, storyTime: storyStamp() };
    }
    return { name: String(raw?.name || 'Anonymous').slice(0, 40) || 'Anonymous', text, by: 'anon', storyTime: storyStamp() };
}

// —— Generation ——

async function generateThreads(board) {
    await ensureRegulars();
    const prompt = [
        `You write for "${boardName()}", an anonymous Japanese textboard (2ch-style), around 2010.`,
        `Board: /${board.name}/ — ${board.topic}`,
        board.steer ? `Steer the threads toward: ${board.steer}` : '',
        storyBlock(),
        travelerBlock(),
        regularsBlock(),
        '',
        'Write 6 new threads that would be on the front page right now: varied, specific, a little unhinged, in English with textboard slang.',
        'Each opening post is 1–5 short lines. Use greentext (lines starting with ">") where it fits.',
        'Answer with JSON only: [{"title": "…", "name": "Anonymous", "author": "", "text": "…"}, …]',
    ].filter(Boolean).join('\n');
    const res = parseJsonLoose(await quietGenerate(prompt));
    const list = Array.isArray(res) ? res : Array.isArray(res?.threads) ? res.threads : [];
    let n = 0;
    for (const t of list.slice(0, 8).reverse()) {
        const post = shapePost(t);
        if (post && t.title) {
            addThread(board.id, { title: String(t.title), post });
            n++;
        }
    }
    board.generatedAt = Date.now();
    await saveBoard();
    return n;
}

async function generateReplies(th, count = 0) {
    await ensureRegulars();
    const board = boardOf(th.boardId);
    const n = count || 4 + Math.floor(Math.random() * 3);
    const last = th.posts[th.posts.length - 1]?.no || 1;
    const prompt = [
        `You write posts for "${boardName()}", an anonymous Japanese textboard (2ch-style), around 2010.`,
        board ? `Board: /${board.name}/ — ${board.topic}${board.steer ? ` (steer: ${board.steer})` : ''}` : '',
        `Thread: "${th.title}"`,
        th.steer ? `Steer the conversation toward: ${th.steer}` : '',
        storyBlock(),
        travelerBlock(),
        regularsBlock(),
        '',
        'The thread so far:',
        threadTranscript(th),
        '',
        `Write the next ${n} replies (numbered from >>${last + 1}). Mostly anonymous posters: skeptics, trolls, helpful nerds, greentext, one-liners.`,
        'Reply to earlier posts with >>N. If someone marked (You) posted, people react to them. Keep each post 1–4 short lines.',
        'Answer with JSON only: [{"name": "Anonymous", "author": "", "text": "…"}, …]',
    ].filter(Boolean).join('\n');
    const res = parseJsonLoose(await quietGenerate(prompt));
    const list = Array.isArray(res) ? res : Array.isArray(res?.posts) ? res.posts : [];
    let added = 0;
    for (const raw of list.slice(0, n + 2)) {
        const post = shapePost(raw);
        if (post) {
            addPost(th.id, post);
            added++;
        }
    }
    await saveBoard();
    return added;
}

/**
 * A chosen character posts now (a reply, or a new thread on the board).
 * @param {string} name
 * @param {{ hint?: string, threadId?: string, boardId?: string, replyTo?: number }} opts
 */
async function forceCharacterPost(name, opts) {
    await ensureRegulars();
    const data = getBoardData();
    const reg = data.regulars[name] || { handle: 'Anonymous', anon: true };
    const handle = reg.anon ? 'Anonymous' : reg.handle;
    const th = opts.threadId ? data.threads[opts.threadId] : null;
    const board = boardOf(th ? th.boardId : opts.boardId || '');
    const prompt = [
        `${name} is posting on "${boardName()}", an anonymous Japanese textboard (2ch-style), as "${handle}".`,
        characterCardText(name, 1600) || `(No character card for ${name} — infer who they are from the story.)\n${recentChatLines(8, 200).join('\n')}`,
        board ? `Board: /${board.name}/ — ${board.topic}` : '',
        storyBlock(),
        th ? `Thread "${th.title}" so far:\n${threadTranscript(th, 16)}` : '',
        opts.replyTo ? `${name} is replying to >>${opts.replyTo}.` : '',
        opts.hint ? `What ${name} posts about: ${opts.hint}` : '',
        '',
        `Write ${th ? 'the post' : 'a new thread (title and opening post)'} in ${name}'s own voice as they would write online (typing habits, slang, how much they'd reveal while anonymous). 1–5 short lines.`,
        th
            ? 'Answer with JSON only: {"text": "…"}'
            : 'Answer with JSON only: {"title": "…", "text": "…"}',
    ].filter(Boolean).join('\n');
    const res = parseJsonLoose(await quietGenerate(prompt));
    let text = String(res?.text || '').trim();
    if (!text) {
        throw new Error('empty post');
    }
    if (opts.replyTo && !text.includes(`>>${opts.replyTo}`)) {
        text = `>>${opts.replyTo}\n${text}`;
    }
    const post = { name: handle, text, by: 'char', author: name, storyTime: storyStamp() };
    if (th) {
        addPost(th.id, post);
    } else if (board) {
        const created = addThread(board.id, { title: String(res?.title || 'untitled'), post });
        nav.threadId = created?.id || '';
    }
    await saveBoard();
}

async function run(label, fn) {
    if (nav.busy) {
        return;
    }
    nav.busy = label;
    rerender();
    try {
        await fn();
    } catch (err) {
        console.warn('[Phone Trigger] board generation failed', err);
        toast('The board timed out. Try again.', 'warning', boardName());
    } finally {
        nav.busy = '';
        rerender();
    }
}

// —— Rendering ——

function postBodyHtml(text) {
    return esc(text).split('\n').map((line) => {
        let html = line.replace(/&gt;&gt;(\d{1,4})/g, '<button type="button" class="pt-bd-ref" data-ref="$1">&gt;&gt;$1</button>');
        if (/^&gt;(?!&gt;)/.test(line)) {
            html = `<span class="pt-bd-green">${html}</span>`;
        }
        return html;
    }).join('<br>');
}

function postHtml(p, th) {
    const date = p.storyTime ? formatStoryTime(p.storyTime) : '';
    const who = nav.reveal && p.author && p.by !== 'user' ? `<span class="pt-bd-reveal">${esc(p.author === 'traveler' ? 'traveler' : p.author)}</span>` : '';
    return `
        <article class="pt-bd-post ${p.by === 'user' ? 'pt-bd-you' : ''} ${p.by === 'traveler' ? 'pt-bd-trav' : ''}" id="pt-bd-p${p.no}" data-no="${p.no}">
            <header>
                <button type="button" class="pt-bd-no" data-quote="${p.no}" title="Reply to this">${p.no}</button>
                <span class="pt-bd-name">${esc(p.name)}</span>${p.trip ? `<span class="pt-bd-trip">${esc(p.trip)}</span>` : ''}${p.by === 'user' ? '<span class="pt-bd-youtag">(You)</span>' : ''}
                <span class="pt-bd-date">${esc(date)} ID:${esc(p.uid)}</span>${who}
            </header>
            <div class="pt-bd-body">${postBodyHtml(p.text)}</div>
        </article>`;
}

function chrome(path, inner) {
    return `
        <div class="pt-bd">
            <div class="pt-bd-bar">
                <span class="pt-bd-lock" aria-hidden="true"></span>
                <span class="pt-bd-url">${esc(boardName().replace(/^@/, 'at').toLowerCase())}.jp/${esc(path)}</span>
                ${nav.busy ? '<span class="pt-bd-load" aria-label="Loading"></span>' : ''}
            </div>
            ${inner}
        </div>`;
}

function postAsHtml(where) {
    if (!nav.postAs) {
        return '';
    }
    const people = cast();
    const data = getBoardData();
    return `
        <div class="pt-bd-postas">
            <label>Who <select id="pt-bd-as">${people.map((c) => `<option value="${esc(c.name)}">${esc(c.name)}${data.regulars[c.name] ? ` — ${esc(data.regulars[c.name].anon ? 'Anonymous' : data.regulars[c.name].handle)}${data.regulars[c.name].posts ? '' : ' (not a regular)'}` : ''}</option>`).join('')}<option value="__other">Someone else…</option></select></label>
            <input type="text" id="pt-bd-as-other" placeholder="Name (a character card, or anyone in the story)" ${people.length ? 'hidden' : ''}>
            <input type="text" id="pt-bd-as-hint" placeholder="${where === 'thread' ? 'What about? (optional)' : 'Thread idea (optional)'}">
            ${where === 'thread' ? `<label class="pt-bd-small">Reply to &gt;&gt;<input type="number" id="pt-bd-as-to" min="0" value="${nav.replyTo || ''}" placeholder="—"></label>` : ''}
            <button type="button" class="pt-bd-btn pt-bd-go" id="pt-bd-as-go">${where === 'thread' ? 'Post' : 'Start thread'}</button>
        </div>`;
}

/**
 * @param {HTMLElement} view
 * @param {import('./phone.js').PhoneAppApi} a
 */
function renderBoardApp(view, a) {
    api = a;
    const data = getBoardData();
    if (nav.level === 'home') {
        a.setSoftLabels('New', 'Back');
        view.innerHTML = chrome('', `
            <div class="pt-bd-scroll">
                <div class="pt-bd-banner"><b>${esc(boardName())}</b><small>the world's largest anonymous textboard</small></div>
                <ul class="pt-bd-boards">
                    ${data.boards.map((b) => `
                    <li><button type="button" data-board="${esc(b.id)}">
                        <span class="pt-bd-bname">/${esc(b.name)}/</span>
                        <span class="pt-bd-btopic">${esc(b.topic)}</span>
                        <span class="pt-bd-bcount">${b.threadIds.length || '·'}</span>
                    </button></li>`).join('')}
                </ul>
                <button type="button" class="pt-bd-btn" id="pt-bd-newboard">＋ New board</button>
            </div>`);
        view.querySelectorAll('[data-board]').forEach((btn) => btn.addEventListener('click', () => openBoard(btn.getAttribute('data-board') || '')));
        view.querySelector('#pt-bd-newboard')?.addEventListener('click', () => {
            nav.level = 'newboard';
            rerender();
        });
        return;
    }
    if (nav.level === 'newboard') {
        a.setSoftLabels('Create', 'Back');
        view.innerHTML = chrome('new', `
            <div class="pt-bd-scroll pt-bd-form">
                <label>Board name <input type="text" id="pt-bd-nb-name" maxlength="20" placeholder="e.g. lab"></label>
                <label>What it's about <textarea id="pt-bd-nb-topic" rows="4" placeholder="Everything posted here follows this topic."></textarea></label>
                <button type="button" class="pt-bd-btn pt-bd-go" id="pt-bd-nb-go">Create board</button>
            </div>`);
        view.querySelector('#pt-bd-nb-go')?.addEventListener('click', () => void createBoard(view));
        return;
    }
    const board = boardOf(nav.boardId);
    if (!board) {
        nav.level = 'home';
        rerender();
        return;
    }
    if (nav.level === 'newthread') {
        a.setSoftLabels('Post', 'Back');
        view.innerHTML = chrome(`${board.name}/new`, `
            <div class="pt-bd-scroll pt-bd-form">
                <label>Title <input type="text" id="pt-bd-nt-title" maxlength="120"></label>
                <label>Name <input type="text" id="pt-bd-nt-name" placeholder="Anonymous" value="${esc(lastName)}"></label>
                <label>Post <textarea id="pt-bd-nt-text" rows="5"></textarea></label>
                <button type="button" class="pt-bd-btn pt-bd-go" id="pt-bd-nt-go">Start thread</button>
            </div>`);
        view.querySelector('#pt-bd-nt-go')?.addEventListener('click', () => void userThread(view, board));
        return;
    }
    if (nav.level === 'board') {
        a.setSoftLabels('New', 'Back');
        const threads = board.threadIds.map((id) => data.threads[id]).filter(Boolean);
        view.innerHTML = chrome(`${board.name}/`, `
            <div class="pt-bd-scroll">
                <div class="pt-bd-head">
                    <b>/${esc(board.name)}/</b>
                    <span>${esc(board.topic)}</span>
                </div>
                <div class="pt-bd-tools">
                    <button type="button" class="pt-bd-btn" id="pt-bd-refresh" ${nav.busy ? 'disabled' : ''}>↻ New threads</button>
                    <button type="button" class="pt-bd-btn" id="pt-bd-nt">＋ Thread</button>
                    ${getSettings().boardCharacters !== false || cast().length ? `<button type="button" class="pt-bd-btn ${nav.postAs ? 'pt-on' : ''}" id="pt-bd-asbtn">Post as…</button>` : ''}
                </div>
                ${postAsHtml('board')}
                <details class="pt-bd-steer" ${board.steer ? 'open' : ''}><summary>Steer this board</summary>
                    <input type="text" id="pt-bd-steer" value="${esc(board.steer || '')}" placeholder="e.g. everyone's talking about the satellite crash">
                </details>
                ${nav.busy ? `<div class="pt-bd-busy">${esc(nav.busy)}…</div>` : ''}
                <ol class="pt-bd-threads">
                    ${threads.map((th) => `
                    <li><button type="button" data-thread="${esc(th.id)}">
                        <span class="pt-bd-ttitle">${esc(th.title)}</span>
                        <span class="pt-bd-tmeta">(${th.posts.length})${th.posts[th.posts.length - 1]?.storyTime ? ` · ${esc(formatStoryTime(th.posts[th.posts.length - 1].storyTime))}` : ''}</span>
                    </button></li>`).join('') || (nav.busy ? '' : '<li class="pt-bd-empty">No threads yet.</li>')}
                </ol>
            </div>`);
        view.querySelectorAll('[data-thread]').forEach((btn) => btn.addEventListener('click', () => openThread(btn.getAttribute('data-thread') || '')));
        view.querySelector('#pt-bd-refresh')?.addEventListener('click', () => void run('Loading new threads', () => generateThreads(board)));
        view.querySelector('#pt-bd-nt')?.addEventListener('click', () => {
            nav.level = 'newthread';
            rerender();
        });
        wirePostAs(view, 'board');
        wireSteer(view, board);
        return;
    }
    // Thread
    const th = data.threads[nav.threadId];
    if (!th) {
        nav.level = 'board';
        rerender();
        return;
    }
    a.setSoftLabels('Reply', 'Back');
    const hasHidden = th.posts.some((p) => p.author && p.by !== 'user');
    view.innerHTML = chrome(`${board.name}/res/${th.id.slice(-6)}`, `
        <div class="pt-bd-scroll" id="pt-bd-thread-scroll">
            <h3 class="pt-bd-ttl">${esc(th.title)}</h3>
            <div class="pt-bd-tools">
                ${hasHidden ? `<button type="button" class="pt-bd-btn pt-bd-eye ${nav.reveal ? 'pt-on' : ''}" id="pt-bd-reveal" title="Show who wrote what (only you see this)">${nav.reveal ? '◉' : '◎'} Who</button>` : ''}
                <button type="button" class="pt-bd-btn ${nav.postAs ? 'pt-on' : ''}" id="pt-bd-asbtn">Post as…</button>
            </div>
            ${postAsHtml('thread')}
            <details class="pt-bd-steer" ${th.steer ? 'open' : ''}><summary>Steer this thread</summary>
                <input type="text" id="pt-bd-steer" value="${esc(th.steer || '')}" placeholder="e.g. someone posts a blurry photo">
            </details>
            ${th.posts.map((p) => postHtml(p, th)).join('')}
            ${nav.busy ? `<div class="pt-bd-busy">${esc(nav.busy)}…</div>` : `<button type="button" class="pt-bd-btn pt-bd-more" id="pt-bd-more">Load more</button>`}
            <div class="pt-bd-reply" id="pt-bd-reply">
                <input type="text" id="pt-bd-name" placeholder="Anonymous" value="${esc(lastName)}">
                <textarea id="pt-bd-text" rows="3" placeholder="Reply…">${nav.replyTo ? `>>${nav.replyTo}\n` : ''}</textarea>
                <button type="button" class="pt-bd-btn pt-bd-go" id="pt-bd-send">Post</button>
            </div>
        </div>`);
    const scroller = view.querySelector('#pt-bd-thread-scroll');
    if (scroller && keepBottom) {
        scroller.scrollTop = scroller.scrollHeight;
        keepBottom = false;
    }
    view.querySelector('#pt-bd-more')?.addEventListener('click', () => {
        keepBottom = true;
        void run('Loading replies', () => generateReplies(th));
    });
    view.querySelector('#pt-bd-reveal')?.addEventListener('click', () => {
        nav.reveal = !nav.reveal;
        rerender();
    });
    view.querySelectorAll('[data-ref]').forEach((btn) => btn.addEventListener('click', () => {
        const el = view.querySelector(`#pt-bd-p${btn.getAttribute('data-ref')}`);
        el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el?.classList.add('pt-bd-flash');
        setTimeout(() => el?.classList.remove('pt-bd-flash'), 900);
    }));
    view.querySelectorAll('[data-quote]').forEach((btn) => btn.addEventListener('click', () => {
        const no = Number(btn.getAttribute('data-quote'));
        const ta = /** @type {HTMLTextAreaElement} */ (view.querySelector('#pt-bd-text'));
        if (ta) {
            ta.value = `${ta.value}${ta.value && !ta.value.endsWith('\n') ? '\n' : ''}>>${no}\n`;
            ta.focus();
        }
        nav.replyTo = no;
        const asTo = /** @type {HTMLInputElement | null} */ (view.querySelector('#pt-bd-as-to'));
        if (asTo) {
            asTo.value = String(no);
        }
    }));
    view.querySelector('#pt-bd-send')?.addEventListener('click', () => void userReply(view, th));
    wirePostAs(view, 'thread', th);
    wireSteer(view, th);
}

let lastName = '';
let keepBottom = false;

function wireSteer(view, target) {
    const input = /** @type {HTMLInputElement | null} */ (view.querySelector('#pt-bd-steer'));
    input?.addEventListener('change', () => {
        target.steer = input.value.trim().slice(0, 240);
        void saveBoard();
        toast(target.steer ? 'Steer set — it shapes the next posts' : 'Steer cleared', 'info', boardName());
    });
}

function wirePostAs(view, where, th = null) {
    view.querySelector('#pt-bd-asbtn')?.addEventListener('click', () => {
        nav.postAs = !nav.postAs;
        rerender();
    });
    const sel = /** @type {HTMLSelectElement | null} */ (view.querySelector('#pt-bd-as'));
    const other = /** @type {HTMLInputElement | null} */ (view.querySelector('#pt-bd-as-other'));
    sel?.addEventListener('change', () => {
        if (other) {
            other.hidden = sel.value !== '__other';
        }
    });
    if (sel && other && sel.value === '__other') {
        other.hidden = false;
    }
    view.querySelector('#pt-bd-as-go')?.addEventListener('click', () => {
        const name = sel?.value === '__other' ? String(other?.value || '').trim().slice(0, 40) : String(sel?.value || '');
        if (!name) {
            toast('Who is posting?', 'warning', boardName());
            return;
        }
        const hint = /** @type {HTMLInputElement} */ (view.querySelector('#pt-bd-as-hint')).value.trim();
        const to = Number(/** @type {HTMLInputElement | null} */ (view.querySelector('#pt-bd-as-to'))?.value || 0);
        nav.postAs = false;
        keepBottom = true;
        void run(`${name} is typing`, async () => {
            await forceCharacterPost(name, { hint, threadId: th?.id, boardId: nav.boardId, replyTo: to || undefined });
            if (where === 'board' && nav.threadId) {
                nav.level = 'thread';
            }
        });
    });
}

function openBoard(id) {
    const board = boardOf(id);
    if (!board) {
        return;
    }
    nav.level = 'board';
    nav.boardId = id;
    nav.postAs = false;
    rerender();
    if (!board.threadIds.length && !nav.busy) {
        void run('Loading threads', () => generateThreads(board));
    }
}

function openThread(id) {
    const th = getBoardData().threads[id];
    if (!th) {
        return;
    }
    nav.level = 'thread';
    nav.threadId = id;
    nav.replyTo = 0;
    nav.postAs = false;
    rerender();
    if (th.posts.length <= 1 && !nav.busy) {
        void run('Loading replies', () => generateReplies(th));
    }
}

async function createBoard(view) {
    const name = String(/** @type {HTMLInputElement} */ (view.querySelector('#pt-bd-nb-name')).value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20);
    const topic = String(/** @type {HTMLTextAreaElement} */ (view.querySelector('#pt-bd-nb-topic')).value || '').trim().slice(0, 400);
    if (!name || !topic) {
        toast('Give the board a name and a topic', 'warning', boardName());
        return;
    }
    const data = getBoardData();
    if (data.boards.some((b) => b.name === name)) {
        toast(`/${name}/ already exists`, 'warning', boardName());
        return;
    }
    const id = uid('bd');
    data.boards.push({ id, name, topic, steer: '', custom: true, threadIds: [], generatedAt: 0 });
    await saveBoard();
    openBoard(id);
}

async function userThread(view, board) {
    const title = String(/** @type {HTMLInputElement} */ (view.querySelector('#pt-bd-nt-title')).value || '').trim();
    const text = String(/** @type {HTMLTextAreaElement} */ (view.querySelector('#pt-bd-nt-text')).value || '').trim();
    lastName = String(/** @type {HTMLInputElement} */ (view.querySelector('#pt-bd-nt-name')).value || '').trim();
    if (!title || !text) {
        toast('A thread needs a title and a post', 'warning', boardName());
        return;
    }
    const th = addThread(board.id, { title, post: { name: lastName || 'Anonymous', text, by: 'user', storyTime: storyStamp() } });
    await saveBoard();
    if (th) {
        nav.level = 'thread';
        nav.threadId = th.id;
        keepBottom = true;
        rerender();
        void run('Loading replies', () => generateReplies(th));
    }
}

async function userReply(view, th) {
    const ta = /** @type {HTMLTextAreaElement} */ (view.querySelector('#pt-bd-text'));
    const text = String(ta.value || '').trim();
    lastName = String(/** @type {HTMLInputElement} */ (view.querySelector('#pt-bd-name')).value || '').trim();
    if (!text) {
        return;
    }
    addPost(th.id, { name: lastName || 'Anonymous', text, by: 'user', storyTime: storyStamp() });
    nav.replyTo = 0;
    keepBottom = true;
    await saveBoard();
    rerender();
}

registerPhoneApp('board', {
    title: '@channel',
    icon: '＠',
    home: () => getSettings().boardEnabled !== false,
    render(view, a) {
        renderBoardApp(view, a);
    },
    back() {
        if (nav.level === 'thread') {
            nav.level = 'board';
            nav.postAs = false;
            return 'stay';
        }
        if (nav.level === 'newthread') {
            nav.level = 'board';
            return 'stay';
        }
        if (nav.level === 'board' || nav.level === 'newboard') {
            nav.level = 'home';
            nav.postAs = false;
            return 'stay';
        }
        return undefined;
    },
    softLeft() {
        if (nav.level === 'home') {
            nav.level = 'newboard';
        } else if (nav.level === 'board') {
            nav.level = 'newthread';
        } else if (nav.level === 'thread') {
            const ta = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('pt-bd-text'));
            ta?.scrollIntoView({ block: 'center' });
            ta?.focus();
            return;
        } else if (nav.level === 'newboard') {
            document.getElementById('pt-bd-nb-go')?.click();
            return;
        } else if (nav.level === 'newthread') {
            document.getElementById('pt-bd-nt-go')?.click();
            return;
        }
        rerender();
    },
});

// —— Menu: Board settings + regulars ——

function renderRegularsPanel() {
    const host = document.getElementById('pp_board_regulars');
    if (!host) {
        return;
    }
    const data = getBoardData();
    const people = cast();
    host.innerHTML = people.length ? `
        <table class="pt-bd-regs">
            <thead><tr><th>Character</th><th>Posts</th><th>Handle</th></tr></thead>
            <tbody>
            ${people.map((c) => {
        const r = data.regulars[c.name];
        return `<tr>
                    <td>${esc(c.name)}</td>
                    <td><input type="checkbox" data-reg-posts="${esc(c.name)}" ${r?.posts ? 'checked' : ''} ${r ? '' : 'disabled'}></td>
                    <td><input type="text" class="text_pole" data-reg-handle="${esc(c.name)}" value="${esc(r ? (r.anon ? 'Anonymous' : r.handle) : '')}" placeholder="${r ? '' : 'decided when the board first opens'}"></td>
                </tr>`;
    }).join('')}
            </tbody>
        </table>
        <button type="button" class="menu_button" id="pp_board_regulars_reset">Decide again from their cards</button>`
        : '<small>No characters in this chat.</small>';
    host.querySelectorAll('[data-reg-posts]').forEach((el) => el.addEventListener('change', () => {
        const r = data.regulars[el.getAttribute('data-reg-posts') || ''];
        if (r) {
            r.posts = /** @type {HTMLInputElement} */ (el).checked;
            void saveBoard();
        }
    }));
    host.querySelectorAll('[data-reg-handle]').forEach((el) => el.addEventListener('change', () => {
        const name = el.getAttribute('data-reg-handle') || '';
        const handle = /** @type {HTMLInputElement} */ (el).value.trim() || 'Anonymous';
        const r = data.regulars[name] || { posts: true, handle, anon: false };
        r.handle = handle;
        r.anon = /^anonymous$/i.test(handle);
        data.regulars[name] = r;
        void saveBoard();
        renderRegularsPanel();
    }));
    host.querySelector('#pp_board_regulars_reset')?.addEventListener('click', async () => {
        data.regulars = {};
        await saveBoard();
        renderRegularsPanel();
        try {
            await ensureRegulars();
            toast('Regulars decided', 'info', boardName());
        } catch {
            // shown on next open
        }
    });
}

/** Bind the Board menu category. */
export function initBoardUi() {
    bindToggle('#pp_board_on', 'boardEnabled');
    bindValue('#pp_board_name', 'boardName');
    bindToggle('#pp_board_story', 'boardStoryAware');
    bindToggle('#pp_board_traveler', 'boardTraveler');
    bindValue('#pp_board_traveler_handle', 'boardTravelerHandle');
    bindToggle('#pp_board_chars', 'boardCharacters', renderRegularsPanel);
    renderRegularsPanel();
    document.addEventListener('pt:menu-category', (e) => {
        if (/** @type {CustomEvent} */ (e).detail?.cat === 'board') {
            renderRegularsPanel();
        }
    });
}

/** On chat change: start the app from its front page. */
export function resetBoardNav() {
    Object.assign(nav, { level: 'home', boardId: '', threadId: '', busy: '', reveal: false, postAs: false, replyTo: 0 });
    renderRegularsPanel();
}

/** `/board [name]` */
export async function openBoardApp(name = '') {
    const { openPhoneApp } = await import('./phone.js');
    const b = name ? getBoardData().boards.find((x) => x.name === String(name).replace(/\//g, '').toLowerCase()) : null;
    if (b) {
        nav.level = 'board';
        nav.boardId = b.id;
    }
    openPhoneApp('board');
    if (b && !b.threadIds.length) {
        void run('Loading threads', () => generateThreads(b));
    }
}

