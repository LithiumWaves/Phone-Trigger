/**
 * Someone else's phone, on screen: their inbox, sent mail and call log, and a compose
 * screen that sends as them. Rendered inside lib/phone.js's view (screen 'xphone'),
 * wearing the owner's own chassis.
 */
import { toast } from './settings.js';
import { getPhoneSpec } from './phoneSpec.js';
import { specWallpaperCss } from './chassis.js';
import { getPersonaName } from './store.js';
import {
    isSeeded,
    seedOwnerPhone,
    listOwnerMails,
    listOwnerCalls,
    readOwnerMail,
    ownerContacts,
    sendAsOwner,
    logSnoop,
} from './phoneData.js';

/**
 * @typedef {{
 *   setSoftLabels: (left: string, right: string) => void,
 *   escapeHtml: (s: unknown) => string,
 *   render: () => void,
 *   exit: () => void,
 *   isActive: () => boolean,
 * }} XHost
 */

const st = {
    key: '',
    name: '',
    /** @type {'home' | 'inbox' | 'outbox' | 'read' | 'compose' | 'calls'} */
    sub: 'home',
    mailId: '',
    to: '',
    subject: '',
    body: '',
    seeding: false,
    sending: false,
    /** @type {Set<string>} mails already opened this session (logged once) */
    seen: new Set(),
};

/**
 * @param {string} key
 * @param {string} name
 * @param {{ mailId?: string }} [opts]
 */
export function startOtherPhone(key, name, opts = {}) {
    const same = st.key === key;
    st.key = key;
    st.name = name;
    st.sub = opts.mailId ? 'read' : 'home';
    st.mailId = opts.mailId || '';
    if (!same) {
        st.to = '';
        st.subject = '';
        st.body = '';
        st.seen = new Set();
    }
    void logSnoop(key, 'opened', opts.mailId ? `was shown ${name}'s phone` : `picked up ${name}'s phone and looked through it`);
}

export function otherPhoneOwner() {
    return st.key ? { key: st.key, name: st.name } : null;
}

export function stopOtherPhone() {
    st.key = '';
    st.name = '';
}

/** Soft-left. @returns {boolean} needs render */
export function otherPhoneSoftLeft() {
    if (st.sub === 'home') {
        st.sub = 'inbox';
        return true;
    }
    if (st.sub === 'inbox' || st.sub === 'outbox' || st.sub === 'read') {
        startCompose(st.sub === 'read' ? currentMail() : null);
        return true;
    }
    if (st.sub === 'compose') {
        document.getElementById('pp-x-send')?.click();
    }
    return false;
}

/**
 * Back. @returns {'render' | 'exit'}
 */
export function otherPhoneBack() {
    const up = { inbox: 'home', outbox: 'home', calls: 'home', compose: 'inbox', read: 'inbox', home: '' };
    if (st.sub === 'read') {
        const m = currentMail();
        st.sub = m && m.direction === 'out' ? 'outbox' : 'inbox';
        return 'render';
    }
    const next = up[st.sub];
    if (!next) {
        return 'exit';
    }
    st.sub = /** @type {any} */ (next);
    return 'render';
}

/** Hinge shortcut on their phone. @param {string} goto */
export function otherPhoneShortcut(goto) {
    if (goto === 'mail') {
        st.sub = 'inbox';
    } else if (goto === 'compose') {
        startCompose(null);
    } else {
        st.sub = 'home';
    }
}

/** Green key on their phone: the call log. */
export function otherPhoneCallKey() {
    st.sub = 'calls';
}

function currentMail() {
    return listOwnerMails(st.key, st.name).find((m) => m.id === st.mailId) || null;
}

/** @param {ReturnType<typeof currentMail>} replyTo */
function startCompose(replyTo) {
    st.sub = 'compose';
    if (replyTo) {
        st.to = replyTo.direction === 'in' ? replyTo.from : replyTo.to;
        st.subject = replyTo.subject.startsWith('Re:') ? replyTo.subject : `Re: ${replyTo.subject}`;
        st.body = '';
    }
}

/** @param {number} ts */
function when(ts) {
    try {
        return new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
        return '';
    }
}

/**
 * @param {HTMLElement} view
 * @param {XHost} host
 */
export function renderOtherPhone(view, host) {
    const esc = host.escapeHtml;
    const spec = getPhoneSpec(st.key, st.name);
    view.style.background = '';
    view.className = 'pp-view pp-view-x';
    const banner = `<div class="pp-x-banner">◆ ${esc(st.name)}'s phone</div>`;

    // Shown a specific mail: show it now; the rest of the phone fills in when you browse.
    if (!isSeeded(st.key) && !(st.sub === 'read' && currentMail())) {
        host.setSoftLabels('', 'Return');
        view.style.background = specWallpaperCss(spec);
        view.innerHTML = `${banner}<div class="pp-x-unlock"><div class="pp-x-spin" aria-hidden="true"></div><div>Unlocking…</div></div>`;
        if (!st.seeding) {
            st.seeding = true;
            const key = st.key;
            void seedOwnerPhone(st.key, st.name)
                .catch((err) => console.warn('[Phone Trigger] seed failed', err))
                .finally(() => {
                    st.seeding = false;
                    if (st.key === key && host.isActive()) {
                        host.render();
                    }
                });
        }
        return;
    }

    const mails = listOwnerMails(st.key, st.name);
    const inbox = mails.filter((m) => m.direction === 'in');
    const sent = mails.filter((m) => m.direction === 'out');
    const unread = inbox.filter((m) => !m.read).length;

    if (st.sub === 'home') {
        host.setSoftLabels('Mail', 'Return');
        view.style.background = specWallpaperCss(spec);
        view.className = 'pp-view pp-view-x pp-view-x-home';
        view.innerHTML = `
            ${banner}
            <div class="pp-x-home">
                <div class="pp-x-clock">${esc(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</div>
                <div class="pp-x-model">${esc(`${spec.maker} ${spec.model}`.trim())}</div>
                <button type="button" class="pp-row" data-x="inbox"><span>Inbox</span><span class="pp-row-meta">${unread ? `${unread} new` : inbox.length}</span></button>
                <button type="button" class="pp-row" data-x="outbox"><span>Sent</span><span class="pp-row-meta">${sent.length}</span></button>
                <button type="button" class="pp-row" data-x="calls"><span>Call log</span><span class="pp-row-meta">${listOwnerCalls(st.key).length}</span></button>
                <button type="button" class="pp-row" data-x="compose"><span>New mail as ${esc(st.name)}</span><span class="pp-row-meta">✎</span></button>
            </div>
        `;
    } else if (st.sub === 'inbox' || st.sub === 'outbox') {
        host.setSoftLabels('New', 'Back');
        const list = st.sub === 'inbox' ? inbox : sent;
        view.innerHTML = `
            ${banner}
            <div class="pp-title">${st.sub === 'inbox' ? 'Inbox' : 'Sent'}</div>
            <div class="pp-scroll">
                ${list.length ? list.map((m) => `
                    <button type="button" class="pp-row pp-mail-row ${m.read ? '' : 'pp-unread'}" data-mail="${esc(m.id)}">
                        <span class="pp-mail-from">${esc(st.sub === 'inbox' ? m.from : `→ ${m.to}`)}${m.byUser ? ' ✎' : ''}</span>
                        <span class="pp-mail-subj">${esc(m.subject)}</span>
                        <span class="pp-row-meta">${esc(when(m.timestamp))}</span>
                    </button>
                `).join('') : '<div class="pp-empty">Empty</div>'}
                ${st.sub === 'inbox' ? '<button type="button" class="pp-row" id="pp-x-more"><span>Check for new mail</span><span class="pp-row-meta">↻</span></button>' : ''}
            </div>
        `;
    } else if (st.sub === 'read') {
        const m = currentMail();
        if (!m) {
            st.sub = 'inbox';
            host.render();
            return;
        }
        host.setSoftLabels('Reply', 'Back');
        view.innerHTML = `
            ${banner}
            <div class="pp-title">${esc(m.subject)}</div>
            <div class="pp-scroll pp-read">
                <div class="pp-read-meta">${m.direction === 'in' ? `From: ${esc(m.from)}` : `To: ${esc(m.to)}`}<br />${esc(when(m.timestamp))}${m.byUser ? '<br /><em>Sent by you, as them</em>' : ''}</div>
                <div class="pp-read-body">${esc(m.body)}</div>
            </div>
        `;
        if (!st.seen.has(m.id)) {
            st.seen.add(m.id);
            void readOwnerMail(st.key, st.name, m.id);
        }
    } else if (st.sub === 'calls') {
        host.setSoftLabels('', 'Back');
        const calls = listOwnerCalls(st.key);
        const icon = { in: '↙', out: '↗', missed: '✕' };
        view.innerHTML = `
            ${banner}
            <div class="pp-title">Call log</div>
            <div class="pp-scroll">
                ${calls.length ? calls.map((c) => `
                    <div class="pp-row pp-x-call pp-x-call-${c.kind}">
                        <span>${icon[c.kind] || '·'} ${esc(c.with)}${c.note ? `<small>${esc(c.note)}</small>` : ''}</span>
                        <span class="pp-row-meta">${esc(when(c.at))}${c.seconds ? ` · ${Math.round(c.seconds / 60) || '<1'}m` : ''}</span>
                    </div>
                `).join('') : '<div class="pp-empty">No calls</div>'}
            </div>
        `;
    } else if (st.sub === 'compose') {
        host.setSoftLabels('Send', 'Back');
        const contacts = ownerContacts(st.key, st.name);
        view.innerHTML = `
            ${banner}
            <div class="pp-title">New mail · as ${esc(st.name)}</div>
            <div class="pp-scroll pp-compose">
                <label class="pp-field"><span class="pp-label">To</span>
                    <input type="text" id="pp-x-to" list="pp-x-to-list" value="${esc(st.to)}" placeholder="Name" />
                    <datalist id="pp-x-to-list">${contacts.map((c) => `<option value="${esc(c)}"></option>`).join('')}</datalist>
                </label>
                <label class="pp-field"><span class="pp-label">Subject</span>
                    <input type="text" id="pp-x-subject" value="${esc(st.subject)}" maxlength="120" />
                </label>
                <label class="pp-field"><span class="pp-label">Body</span>
                    <textarea id="pp-x-body" rows="4">${esc(st.body)}</textarea>
                </label>
                <p class="pp-settings-note">Sent from ${esc(st.name)}'s phone. ${esc(getPersonaName())} wrote it; the recipient will think it is ${esc(st.name)}.</p>
                <button type="button" class="pp-btn" id="pp-x-send" ${st.sending ? 'disabled' : ''}>${st.sending ? 'Sending…' : 'Send'}</button>
            </div>
        `;
    }
    bind(view, host);
}

/**
 * @param {HTMLElement} view
 * @param {XHost} host
 */
function bind(view, host) {
    view.querySelectorAll('[data-x]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const to = btn.getAttribute('data-x');
            if (to === 'compose') {
                startCompose(null);
            } else {
                st.sub = /** @type {any} */ (to);
            }
            host.render();
        });
    });
    view.querySelectorAll('[data-mail]').forEach((btn) => {
        btn.addEventListener('click', () => {
            st.mailId = btn.getAttribute('data-mail') || '';
            st.sub = 'read';
            host.render();
        });
    });
    view.querySelector('#pp-x-more')?.addEventListener('click', async (e) => {
        const btn = /** @type {HTMLButtonElement} */ (e.currentTarget);
        btn.disabled = true;
        btn.querySelector('span')?.replaceChildren('Checking…');
        const key = st.key;
        const n = await seedOwnerPhone(st.key, st.name, { more: true });
        toast(n ? `${n} new on ${st.name}'s phone` : 'Nothing new', 'info', 'PHONE');
        if (st.key === key && host.isActive()) {
            host.render();
        }
    });
    const keep = () => {
        st.to = /** @type {HTMLInputElement | null} */ (view.querySelector('#pp-x-to'))?.value ?? st.to;
        st.subject = /** @type {HTMLInputElement | null} */ (view.querySelector('#pp-x-subject'))?.value ?? st.subject;
        st.body = /** @type {HTMLTextAreaElement | null} */ (view.querySelector('#pp-x-body'))?.value ?? st.body;
    };
    view.querySelectorAll('#pp-x-to, #pp-x-subject, #pp-x-body').forEach((el) => el.addEventListener('input', keep));
    view.querySelector('#pp-x-send')?.addEventListener('click', async () => {
        keep();
        if (!st.to.trim() || !st.body.trim()) {
            toast('Who to, and what?', 'warning', 'PHONE');
            return;
        }
        st.sending = true;
        host.render();
        const key = st.key;
        const name = st.name;
        const toYou = st.to.trim().toLowerCase() === getPersonaName().toLowerCase();
        try {
            await sendAsOwner(key, name, { to: st.to, subject: st.subject, body: st.body }, {
                onReply: () => {
                    if (st.key === key && host.isActive()) {
                        host.render();
                    }
                },
            });
            toast(toYou ? `Sent to yourself from ${name}'s phone` : `Sent as ${name}`, 'success', 'PHONE');
            st.to = '';
            st.subject = '';
            st.body = '';
            st.sub = 'outbox';
        } finally {
            st.sending = false;
            if (st.key === key && host.isActive()) {
                host.render();
            }
        }
    });
}
