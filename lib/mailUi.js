/**
 * Mail screen pieces: envelope icons, keyword highlighting (the VN's Phone Trigger words),
 * photos, the "Receiving…" bar and keyword replies. phone.js composes the screens.
 */
import { getSettings, getContext, toast } from './settings.js';
import { getEmails, getPersonaName } from './store.js';
import { esc, quietGenerate, personaName, emit, bindToggle, bindValue, bindNumber } from './ui.js';

/** @typedef {import('./store.js').EmailMessage} EmailMessage */

/**
 * Icon kind for a mail row.
 * @param {EmailMessage} e
 * @param {Set<string>} replied ids of mails you've answered
 */
export function mailIconKind(e, replied) {
    if (e.isDmail) {
        return 'dmail';
    }
    if (e.direction === 'out') {
        return 'sent';
    }
    if (!e.read) {
        return 'sealed';
    }
    return replied.has(e.id) ? 'replied' : 'open';
}

/** Ids of incoming mails you've replied to. */
export function repliedIds() {
    const ids = new Set();
    for (const e of getEmails()) {
        if (e.direction === 'out' && e.inReplyTo) {
            ids.add(e.inReplyTo);
        }
    }
    return ids;
}

/** @param {string} kind */
export function envelopeHtml(kind) {
    return `<span class="pp-env pp-env-${esc(kind)}" aria-hidden="true"><i></i></span>`;
}

/**
 * Mail body HTML with keywords as tappable links.
 * @param {EmailMessage} mail
 * @param {{ tappable?: boolean }} [opts]
 */
export function mailBodyHtml(mail, opts = {}) {
    const body = String(mail.body || '');
    const words = (mail.keywords || []).map((k) => String(k.word || '')).filter(Boolean);
    if (!words.length) {
        return esc(body).replace(/\n/g, '<br>');
    }
    // Mark the first occurrence of each keyword, longest first so phrases win over their parts.
    const marks = [];
    const lower = body.toLowerCase();
    for (const w of [...words].sort((a, b) => b.length - a.length)) {
        let from = 0;
        while (from < lower.length) {
            const at = lower.indexOf(w.toLowerCase(), from);
            if (at < 0) {
                break;
            }
            if (!marks.some((m) => at < m.end && at + w.length > m.start)) {
                marks.push({ start: at, end: at + w.length, word: w });
                break;
            }
            from = at + 1;
        }
    }
    marks.sort((a, b) => a.start - b.start);
    let out = '';
    let pos = 0;
    for (const m of marks) {
        out += esc(body.slice(pos, m.start));
        const text = esc(body.slice(m.start, m.end));
        out += opts.tappable === false
            ? `<span class="pp-kw pp-kw-static">${text}</span>`
            : `<button type="button" class="pp-kw" data-kw="${esc(m.word)}">${text}</button>`;
        pos = m.end;
    }
    out += esc(body.slice(pos));
    return out.replace(/\n/g, '<br>');
}

/**
 * Photo block for a mail (image, or a described placeholder while it develops / without
 * image generation).
 * @param {EmailMessage} mail
 */
export function photoHtml(mail) {
    if (mail.photo) {
        return `<button type="button" class="pp-mail-photo" data-photo-view title="${esc(mail.photoDesc || 'Photo')}">
            <img src="${esc(mail.photo)}" alt="${esc(mail.photoDesc || 'Attached photo')}" loading="lazy">
        </button>`;
    }
    if (mail.photoDesc) {
        return `<div class="pp-mail-photo pp-mail-photo-desc" role="img" aria-label="Photo: ${esc(mail.photoDesc)}">
            <span class="pp-photo-icon" aria-hidden="true"></span>
            <span>${esc(mail.photoDesc)}</span>
        </div>`;
    }
    return '';
}

/**
 * Full-screen photo viewer (top layer, above the phone).
 * @param {string} src
 * @param {string} [caption]
 * @param {{ actions?: { label: string, run: () => void | string | Promise<void | string> }[] }} [opts]
 *   extra buttons; a returned string replaces the button's label (e.g. "Kept ✓")
 */
export function openPhotoViewer(src, caption = '', opts = {}) {
    const dlg = document.createElement('dialog');
    dlg.className = 'pp-photo-viewer';
    const actions = opts.actions || [];
    dlg.innerHTML = `
        <figure>
            <img src="${esc(src)}" alt="${esc(caption || 'Photo')}">
            ${caption ? `<figcaption>${esc(caption)}</figcaption>` : ''}
        </figure>
        <div class="pp-photo-viewer-bar">
            ${actions.map((act, i) => `<button type="button" class="pp-btn" data-act="${i}">${esc(act.label)}</button>`).join('')}
            <a class="pp-btn" href="${esc(src)}" download="phone-photo.jpg">Save</a>
            <button type="button" class="pp-btn" data-close>Close</button>
        </div>`;
    document.body.appendChild(dlg);
    dlg.querySelectorAll('[data-act]').forEach((btn) => btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const act = actions[Number(btn.getAttribute('data-act'))];
        const label = await act?.run();
        if (typeof label === 'string') {
            btn.textContent = label;
        }
    }));
    const close = () => {
        dlg.close();
        dlg.remove();
    };
    dlg.addEventListener('click', (e) => {
        if (e.target === dlg || /** @type {HTMLElement} */ (e.target).closest('[data-close]')) {
            close();
        }
    });
    dlg.addEventListener('cancel', (e) => {
        e.preventDefault();
        close();
    });
    dlg.showModal();
}

/**
 * Downscale a picked image file to a JPEG data URL within a size budget.
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function fileToPhoto(file) {
    const maxKb = Math.max(40, Number(getSettings().mailPhotoMaxKb) || 300);
    const url = URL.createObjectURL(file);
    try {
        const img = await new Promise((resolve, reject) => {
            const im = new Image();
            im.onload = () => resolve(im);
            im.onerror = reject;
            im.src = url;
        });
        let side = 640;
        for (let attempt = 0; attempt < 6; attempt++) {
            const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
            const w = Math.max(1, Math.round(img.naturalWidth * scale));
            const h = Math.max(1, Math.round(img.naturalHeight * scale));
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            for (const q of [0.82, 0.7, 0.58]) {
                const data = canvas.toDataURL('image/jpeg', q);
                if (data.length * 0.75 / 1024 <= maxKb) {
                    return data;
                }
            }
            side = Math.round(side * 0.75);
        }
        throw new Error('too large');
    } finally {
        URL.revokeObjectURL(url);
    }
}

/**
 * The "Receiving…" sequence over the phone screen. Resolves when it's done.
 * @param {HTMLElement | null} view
 * @param {{ from?: string }} [info]
 */
export function playReceiving(view, info = {}) {
    if (!view || getSettings().mailReceiveAnim === false) {
        return Promise.resolve();
    }
    const el = document.createElement('div');
    el.className = 'pp-receiving';
    el.innerHTML = `
        <div class="pp-receiving-box">
            <div class="pp-receiving-ico">${envelopeHtml('sealed')}</div>
            <div class="pp-receiving-label">${view.closest('[data-mail-theme="classic"]') ? 'Receiving mail' : '受信中 · Receiving'}</div>
            <div class="pp-receiving-bar"><i></i><i></i><i></i><i></i><i></i><i></i></div>
            <div class="pp-receiving-from">${esc(info.from || '')}</div>
        </div>`;
    view.appendChild(el);
    return new Promise((resolve) => {
        setTimeout(() => {
            el.classList.add('pp-receiving-done');
            setTimeout(() => {
                el.remove();
                resolve();
            }, 260);
        }, 1100);
    });
}

/**
 * Write {{user}}'s reply to a mail about one tapped keyword.
 * @param {EmailMessage} mail
 * @param {string} word
 * @returns {Promise<{ subject: string, body: string }>}
 */
export async function keywordReply(mail, word) {
    const ctx = getContext();
    const user = getPersonaName() || personaName();
    const persona = String(ctx.powerUserSettings?.persona_description || '').trim().slice(0, 800);
    const prompt = [
        `Write ${user}'s short reply e-mail to ${mail.from}.`,
        persona ? `About ${user}:\n${persona}` : '',
        `${mail.from} wrote (subject "${mail.subject}"):`,
        String(mail.body || '').slice(0, 1500),
        '',
        `${user}'s reply is about "${word}" — ask about it, react to it, or pick it up, in ${user}'s own voice.`,
        'Keep it to 1–3 short sentences, like a phone e-mail. No narration, no quotes around it.',
        'Output ONLY the reply body.',
    ].filter(Boolean).join('\n');
    let body = '';
    try {
        body = String(await quietGenerate(prompt) || '').trim();
    } catch (err) {
        console.warn('[Phone Trigger] keyword reply failed', err);
    }
    body = body.replace(/^(BODY|Reply)\s*:\s*/i, '').replace(/^["“]|["”]$/g, '').trim();
    if (!body) {
        toast('Could not write a reply — opening a blank one', 'warning');
        body = `${word}?`;
    }
    emit('keyword-tap', { mail, word });
    const subject = String(mail.subject || '').startsWith('Re:') ? mail.subject : `Re: ${mail.subject}`;
    return { subject, body };
}

/**
 * Conversation with one contact, oldest first.
 * @param {string} key
 * @param {string} name
 */
export function threadMails(key, name) {
    const n = String(name || '').toLowerCase();
    return getEmails()
        .filter((e) => !e.isDmail && (
            (key && e.characterKey === key)
            || String(e.from || '').toLowerCase() === n
            || String(e.to || '').toLowerCase() === n))
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
}

/** Bind the Mail category's handset settings. */
export function initMailUi() {
    bindToggle('#pp_mail_keywords', 'mailKeywords');
    bindValue('#pp_keyword_mode', 'keywordTapMode', undefined, ['prefill', 'send']);
    bindToggle('#pp_mail_receive_anim', 'mailReceiveAnim');
    bindValue('#pp_mail_theme', 'mailTheme', () => emit('mail-theme'), ['classic', 'dark']);
    bindToggle('#pp_char_photos', 'charPhotos');
    bindNumber('#pp_photo_max_kb', 'mailPhotoMaxKb', { min: 40, max: 2000, fallback: 300 });
}
