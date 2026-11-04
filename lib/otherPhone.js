/**
 * Someone else's phone, on screen: their inbox, sent mail and call log, and a compose
 * screen that sends as them. Rendered inside lib/phone.js's view (screen 'xphone'),
 * wearing the owner's own chassis.
 */
import { toast, getSettings } from './settings.js';
import { drawStaticMeter } from './divmeter.js';
import { getDivergence, PHONEWAVE_NAME } from './dmail.js';
import { getPhoneSpec } from './phoneSpec.js';
import { specWallpaperCss } from './chassis.js';
import {
    isSeeded,
    seedOwnerPhone,
    listOwnerMails,
    listOwnerCalls,
    readOwnerMail,
    ownerContacts,
    sendAsOwner,
    logSnoop,
    editOwnerMail,
    deleteOwnerMail,
} from './phoneData.js';

/**
 * @typedef {{
 *   setSoftLabels: (left: string, right: string) => void,
 *   escapeHtml: (s: unknown) => string,
 *   render: () => void,
 *   exit: () => void,
 *   isActive: () => boolean,
 *   dmail?: (mail: { subject: string, body: string }) => Promise<void>,
 *   timeleap?: () => void,
 * }} XHost
 */

/** "Someone else…" in the To list. */
const OTHER = '__other__';

/** PhoneWave is reachable from their phone (D-Mail) — same switch as on yours. */
function phoneWaveOn() {
    return getSettings().showPhoneWave !== false;
}

/** @param {string} to */
function isPhoneWave(to) {
    return String(to || '').trim().toLowerCase() === PHONEWAVE_NAME.toLowerCase();
}

const st = {
    key: '',
    name: '',
    /** @type {'home' | 'inbox' | 'outbox' | 'read' | 'compose' | 'calls' | 'edit' | 'confirm'} */
    sub: 'home',
    mailId: '',
    to: '',
    /** typing a name that is not in the contact list */
    toOther: false,
    subject: '',
    body: '',
    seeding: false,
    sending: false,
    editSubject: '',
    editBody: '',
    /** @type {{ kind: 'edit' | 'delete', id: string, subject: string, body: string } | null} */
    pending: null,
    busy: false,
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
        st.toOther = false;
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
    if (st.sub === 'edit') {
        document.getElementById('pp-x-save')?.click();
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
    if (st.sub === 'edit') {
        st.sub = 'read';
        return 'render';
    }
    if (st.sub === 'confirm') {
        // Cancel: back to where the action started
        st.sub = st.pending?.kind === 'edit' ? 'edit' : 'read';
        st.pending = null;
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
        st.toOther = !ownerContacts(st.key, st.name).includes(st.to);
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
                ${spec.meter && getSettings().homeDivergenceMeter !== false ? '<div class="pp-x-meter"><canvas id="pp-x-meter-canvas" aria-label="Divergence"></canvas></div>' : ''}
                <button type="button" class="pp-row" data-x="inbox"><span>Inbox</span><span class="pp-row-meta">${unread ? `${unread} new` : inbox.length}</span></button>
                <button type="button" class="pp-row" data-x="outbox"><span>Sent</span><span class="pp-row-meta">${sent.length}</span></button>
                <button type="button" class="pp-row" data-x="calls"><span>Call log</span><span class="pp-row-meta">${listOwnerCalls(st.key).length}</span></button>
                <button type="button" class="pp-row" data-x="compose"><span>New mail</span><span class="pp-row-meta">✎</span></button>
                ${phoneWaveOn() ? '<button type="button" class="pp-row" data-x="dmail"><span>D-Mail</span><span class="pp-row-meta">◇</span></button>' : ''}
                ${getSettings().timeleapEnabled !== false ? '<button type="button" class="pp-row" data-x="timeleap"><span>Time Leap</span><span class="pp-row-meta">⟲</span></button>' : ''}
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
                        <span class="pp-mail-from">${esc(st.sub === 'inbox' ? m.from : `→ ${m.to}`)}${m.byUser || m.edited ? ' ✎' : ''}</span>
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
                <div class="pp-read-meta">${m.direction === 'in' ? `From: ${esc(m.from)}` : `To: ${esc(m.to)}`}<br />${esc(when(m.timestamp))}${m.byUser || m.edited ? ' ✎' : ''}</div>
                <div class="pp-read-body">${esc(m.body)}</div>
                <div class="pp-x-actions">
                    <button type="button" class="pp-btn pp-btn-ghost" id="pp-x-edit">Edit</button>
                    <button type="button" class="pp-btn pp-btn-ghost pp-x-delete" id="pp-x-delete">Delete</button>
                </div>
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
    } else if (st.sub === 'edit') {
        const m = currentMail();
        if (!m) {
            st.sub = 'inbox';
            host.render();
            return;
        }
        host.setSoftLabels('Save', 'Back');
        view.innerHTML = `
            ${banner}
            <div class="pp-title">Edit mail</div>
            <div class="pp-scroll pp-compose">
                <div class="pp-read-meta">${m.direction === 'in' ? `From: ${esc(m.from)}` : `To: ${esc(m.to)}`}</div>
                <label class="pp-field"><span class="pp-label">Subject</span>
                    <input type="text" id="pp-x-edit-subject" value="${esc(st.editSubject)}" maxlength="120" />
                </label>
                <label class="pp-field"><span class="pp-label">Body</span>
                    <textarea id="pp-x-edit-body" rows="6">${esc(st.editBody)}</textarea>
                </label>
                <button type="button" class="pp-btn" id="pp-x-save">Save</button>
            </div>
        `;
    } else if (st.sub === 'confirm') {
        const p = st.pending;
        const m = currentMail();
        if (!p || !m) {
            st.pending = null;
            st.sub = 'inbox';
            host.render();
            return;
        }
        const del = p.kind === 'delete';
        const verb = del ? 'Delete' : 'Save';
        // Only ask when what you do on their phone reaches the chat at all.
        const asks = getSettings().snoopInject !== false;
        host.setSoftLabels('', 'Cancel');
        view.innerHTML = `
            ${banner}
            <div class="pp-title">${del ? 'Delete this mail?' : 'Save changes?'}</div>
            <div class="pp-scroll">
                <p class="pp-settings-note">"${esc(del ? m.subject : p.subject)}" · ${esc(m.direction === 'in' ? `from ${m.from}` : `to ${m.to}`)}${m.mirror ? ` — only on ${esc(st.name)}'s phone; your own copy stays.` : ''}</p>
                ${asks ? `
                    <button type="button" class="pp-row" data-x-do="tell" ${st.busy ? 'disabled' : ''}><span>Tell the chat</span><span class="pp-row-meta">they may find out</span></button>
                    <button type="button" class="pp-row" data-x-do="hide" ${st.busy ? 'disabled' : ''}><span>Keep it hidden</span><span class="pp-row-meta">no one knows</span></button>
                ` : `
                    <button type="button" class="pp-row" data-x-do="hide" ${st.busy ? 'disabled' : ''}><span>${verb}</span><span class="pp-row-meta">${del ? '✕' : '✓'}</span></button>
                    <p class="pp-settings-note">"Tell the chat what you saw" is off, so this stays hidden.</p>
                `}
                <button type="button" class="pp-row" data-x-do="cancel"><span>Cancel</span><span class="pp-row-meta">←</span></button>
            </div>
        `;
    } else if (st.sub === 'compose') {
        host.setSoftLabels('Send', 'Back');
        const contacts = phoneWaveOn() ? [PHONEWAVE_NAME, ...ownerContacts(st.key, st.name)] : ownerContacts(st.key, st.name);
        const dmailMode = isPhoneWave(st.to) && !st.toOther;
        const limit36 = dmailMode && getSettings().dmailLimit36;
        view.innerHTML = `
            ${banner}
            <div class="pp-title">${dmailMode ? 'D-Mail' : 'New mail'}</div>
            <div class="pp-scroll pp-compose">
                <label class="pp-field"><span class="pp-label">To</span>
                    <select id="pp-x-to-pick" class="pp-select">
                        <option value="" ${st.to || st.toOther ? '' : 'selected'} disabled>Choose…</option>
                        ${contacts.map((c) => `<option value="${esc(c)}" ${!st.toOther && st.to === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
                        <option value="${OTHER}" ${st.toOther ? 'selected' : ''}>Someone else…</option>
                    </select>
                    <input type="text" id="pp-x-to" value="${esc(st.to)}" placeholder="Name" ${st.toOther ? '' : 'hidden'} />
                </label>
                <label class="pp-field"><span class="pp-label">Subject</span>
                    <input type="text" id="pp-x-subject" value="${esc(st.subject)}" maxlength="120" />
                </label>
                <label class="pp-field"><span class="pp-label">Body</span>
                    <textarea id="pp-x-body" rows="4" ${limit36 ? 'maxlength="36"' : ''}>${esc(limit36 ? st.body.slice(0, 36) : st.body)}</textarea>
                </label>
                <button type="button" class="pp-btn" id="pp-x-send" ${st.sending ? 'disabled' : ''}>${st.sending ? 'Sending…' : (dmailMode ? 'Send D-Mail' : 'Send')}</button>
            </div>
        `;
    }
    const meter = /** @type {HTMLCanvasElement | null} */ (view.querySelector('#pp-x-meter-canvas'));
    if (meter) {
        requestAnimationFrame(() => drawStaticMeter(meter, getDivergence()));
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
            if (to === 'timeleap') {
                host.timeleap?.();
                return;
            }
            if (to === 'dmail') {
                startCompose(null);
                st.to = PHONEWAVE_NAME;
                st.toOther = false;
            } else if (to === 'compose') {
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
    view.querySelector('#pp-x-edit')?.addEventListener('click', () => {
        const m = currentMail();
        if (!m) {
            return;
        }
        st.editSubject = m.subject;
        st.editBody = m.body;
        st.sub = 'edit';
        host.render();
    });
    view.querySelector('#pp-x-delete')?.addEventListener('click', () => {
        const m = currentMail();
        if (!m) {
            return;
        }
        st.pending = { kind: 'delete', id: m.id, subject: m.subject, body: m.body };
        st.sub = 'confirm';
        host.render();
    });
    const keepEdit = () => {
        st.editSubject = /** @type {HTMLInputElement | null} */ (view.querySelector('#pp-x-edit-subject'))?.value ?? st.editSubject;
        st.editBody = /** @type {HTMLTextAreaElement | null} */ (view.querySelector('#pp-x-edit-body'))?.value ?? st.editBody;
    };
    view.querySelectorAll('#pp-x-edit-subject, #pp-x-edit-body').forEach((el) => el.addEventListener('input', keepEdit));
    view.querySelector('#pp-x-save')?.addEventListener('click', () => {
        keepEdit();
        const m = currentMail();
        if (!m) {
            return;
        }
        if (!st.editBody.trim()) {
            toast('The mail needs some text — delete it instead?', 'warning', 'PHONE');
            return;
        }
        if (st.editSubject.trim() === m.subject && st.editBody.trim() === m.body.trim()) {
            st.sub = 'read'; // nothing changed
            host.render();
            return;
        }
        st.pending = { kind: 'edit', id: m.id, subject: st.editSubject, body: st.editBody };
        st.sub = 'confirm';
        host.render();
    });
    view.querySelectorAll('[data-x-do]').forEach((btn) => {
        btn.addEventListener('click', async () => {
            const what = btn.getAttribute('data-x-do');
            const p = st.pending;
            if (what === 'cancel' || !p) {
                otherPhoneBack();
                host.render();
                return;
            }
            if (st.busy) {
                return;
            }
            const key = st.key;
            const name = st.name;
            const tell = what === 'tell';
            const mail = currentMail();
            st.busy = true;
            try {
                if (p.kind === 'delete') {
                    const ok = await deleteOwnerMail(key, name, p.id, { tell });
                    if (st.key === key) {
                        st.sub = mail?.direction === 'out' ? 'outbox' : 'inbox';
                        st.mailId = '';
                    }
                    toast(ok ? `Deleted from ${name}'s phone${tell ? '' : ' — quietly'}` : 'That mail is already gone', ok ? 'success' : 'warning', 'PHONE');
                } else {
                    const saved = await editOwnerMail(key, name, p.id, { subject: p.subject, body: p.body }, { tell });
                    if (st.key === key) {
                        st.sub = 'read';
                    }
                    toast(saved ? `Saved${tell ? '' : ' — quietly'}` : 'Could not save that mail', saved ? 'success' : 'warning', 'PHONE');
                }
            } finally {
                st.busy = false;
                st.pending = null;
                if (st.key === key && host.isActive()) {
                    host.render();
                }
            }
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
        if (st.toOther) {
            st.to = /** @type {HTMLInputElement | null} */ (view.querySelector('#pp-x-to'))?.value ?? st.to;
        }
        st.subject = /** @type {HTMLInputElement | null} */ (view.querySelector('#pp-x-subject'))?.value ?? st.subject;
        st.body = /** @type {HTMLTextAreaElement | null} */ (view.querySelector('#pp-x-body'))?.value ?? st.body;
    };
    view.querySelectorAll('#pp-x-to, #pp-x-subject, #pp-x-body').forEach((el) => el.addEventListener('input', keep));
    view.querySelector('#pp-x-to-pick')?.addEventListener('change', (e) => {
        keep();
        const v = /** @type {HTMLSelectElement} */ (e.target).value;
        st.toOther = v === OTHER;
        st.to = st.toOther ? '' : v;
        host.render();
        if (st.toOther) {
            /** @type {HTMLInputElement | null} */ (document.getElementById('pp-x-to'))?.focus();
        }
    });
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
        if (isPhoneWave(st.to) && !st.toOther && host.dmail) {
            // Their D-Mail: the worldline shifts and only you notice. It erases itself from their phone.
            const mail = { subject: st.subject, body: st.body };
            st.to = '';
            st.subject = '';
            st.body = '';
            st.sub = 'home';
            try {
                await host.dmail(mail);
            } catch (err) {
                console.error('[Phone Trigger] D-Mail from their phone failed', err);
                toast('D-Mail failed', 'error', 'D-MAIL');
            } finally {
                st.sending = false;
            }
            return;
        }
        try {
            await sendAsOwner(key, name, { to: st.to, subject: st.subject, body: st.body }, {
                onReply: () => {
                    if (st.key === key && host.isActive()) {
                        host.render();
                    }
                },
            });
            toast('Sent', 'success', 'PHONE');
            st.to = '';
            st.toOther = false;
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
