/**
 * Address book — per chat: who is registered on your phone and under what name.
 *
 * Display names are for the handset only. Prompts, mail matching, leaps and
 * everything the AI reads keep each character's real name.
 *
 * State (chat metadata): getMailStore().contacts = { setup, ids: string[], names: { [key]: string } }
 * A chat without `setup` behaves as before: everyone in the chat is a contact.
 */
import { getSettings, saveSettings } from './settings.js';
import { getMailStore, persistMailStore, listMailContacts } from './store.js';
import { isPhoneWaveContact, PHONEWAVE_KEY } from './dmail.js';

/** @returns {{ setup?: boolean, ids?: string[], names?: Record<string, string> }} */
function bookState() {
    const store = getMailStore();
    if (!store.contacts || typeof store.contacts !== 'object') {
        store.contacts = {};
    }
    const book = store.contacts;
    if (!Array.isArray(book.ids)) {
        book.ids = [];
    }
    if (!book.names || typeof book.names !== 'object') {
        book.names = {};
    }
    return book;
}

/** Whether this chat has its own address book yet. */
export function hasAddressBook() {
    return Boolean(bookState().setup);
}

/** Whether `key` is on your phone (PhoneWave always is). */
export function isRegistered(key) {
    if (!key) {
        return false;
    }
    if (isPhoneWaveContact(key)) {
        return true;
    }
    const book = bookState();
    return !book.setup || book.ids.includes(key);
}

/**
 * Contacts on your phone, in the usual order (PhoneWave, active, A–Z).
 * @param {{ include?: string[] }} [opts] keys to keep even when not registered (a reply in progress)
 */
export function listAddressBook(opts = {}) {
    const book = bookState();
    const keep = new Set((opts.include || []).filter(Boolean));
    return listMailContacts().filter((c) => !book.setup || isPhoneWaveContact(c.key) || book.ids.includes(c.key) || keep.has(c.key));
}

/** Everyone in the chat who isn't on your phone yet. */
export function listUnregistered() {
    return listMailContacts().filter((c) => !isRegistered(c.key));
}

/**
 * The name you saved someone under; falls back to their real name.
 * @param {string} [key]
 * @param {string} [fallback]
 */
export function displayName(key, fallback = '') {
    const name = key ? bookState().names[key] : '';
    return String(name || fallback || '');
}

/**
 * Display name for a stored mail peer name (mail keeps real names).
 * @param {string} [name]
 */
export function peerLabel(name = '') {
    const raw = String(name || '');
    if (isPhoneWaveContact(raw)) {
        return displayName(PHONEWAVE_KEY, raw);
    }
    const key = keyForName(raw);
    return key ? displayName(key, raw) : raw;
}

/** Contact key for a stored mail peer name (or ''). */
export function keyForName(name) {
    const needle = String(name || '').trim().toLowerCase();
    return needle ? listMailContacts().find((x) => x.name.toLowerCase() === needle)?.key || '' : '';
}

/**
 * Create this chat's address book.
 * @param {{ key: string, name?: string }[]} entries
 */
export async function setupAddressBook(entries) {
    const book = bookState();
    book.setup = true;
    book.ids = [];
    for (const e of entries) {
        if (e?.key && !isPhoneWaveContact(e.key) && !book.ids.includes(e.key)) {
            book.ids.push(e.key);
        }
        if (e?.key) {
            setName(book, e.key, e.name);
        }
    }
    await persistMailStore();
}

function setName(book, key, name) {
    const real = isPhoneWaveContact(key) ? null : listMailContacts().find((c) => c.key === key)?.name;
    const clean = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!clean || clean === real) {
        delete book.names[key];
    } else {
        book.names[key] = clean;
    }
}

/** Add someone to your phone (optionally under a name). */
export async function addContact(key, name) {
    if (!key) {
        return;
    }
    const book = bookState();
    if (!book.setup) {
        // First change in an old chat: start from everyone already in it.
        book.setup = true;
        book.ids = listMailContacts().filter((c) => !isPhoneWaveContact(c.key)).map((c) => c.key);
    }
    if (!isPhoneWaveContact(key) && !book.ids.includes(key)) {
        book.ids.push(key);
    }
    if (name != null) {
        setName(book, key, name);
    }
    await persistMailStore();
}

/** Remove someone from your phone. Their mail stays; they show as unregistered. */
export async function removeContact(key) {
    if (!key || isPhoneWaveContact(key)) {
        return;
    }
    const book = bookState();
    if (!book.setup) {
        book.setup = true;
        book.ids = listMailContacts().filter((c) => !isPhoneWaveContact(c.key)).map((c) => c.key);
    }
    book.ids = book.ids.filter((k) => k !== key);
    await persistMailStore();
}

/** Save someone under another name ('' resets to their real name). */
export async function renameContact(key, name) {
    if (!key) {
        return;
    }
    setName(bookState(), key, name);
    await persistMailStore();
}

// —— Per-contact sounds (global: they follow the character across chats) ——

/**
 * @param {string} key
 * @returns {{ ring?: string, mail?: string, ringUrl?: string, mailUrl?: string }}
 */
export function getContactSounds(key) {
    const all = getSettings().contactSounds;
    return (all && typeof all === 'object' && all[key]) || {};
}

/**
 * @param {string} key
 * @param {{ ring?: string, mail?: string, ringUrl?: string, mailUrl?: string }} patch
 */
export function setContactSounds(key, patch) {
    const s = getSettings();
    if (!s.contactSounds || typeof s.contactSounds !== 'object') {
        s.contactSounds = {};
    }
    const next = { ...(s.contactSounds[key] || {}), ...patch };
    for (const k of Object.keys(next)) {
        if (!next[k]) {
            delete next[k];
        }
    }
    if (Object.keys(next).length) {
        s.contactSounds[key] = next;
    } else {
        delete s.contactSounds[key];
    }
    saveSettings();
}

// —— Start-of-chat picker ——

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let asking = false;

/**
 * First time the phone opens in a chat: choose who starts in the address book.
 * Resolves once answered (or at once when not needed).
 */
export async function maybeAskStartingContacts() {
    if (asking || hasAddressBook() || getSettings().contactsAskOnStart === false) {
        return;
    }
    const cast = listMailContacts().filter((c) => !isPhoneWaveContact(c.key));
    if (!cast.length) {
        return;
    }
    // Only a fresh chat asks; one that already has mail or calls keeps everyone as a contact.
    const store = getMailStore();
    if ((store.emails || []).length || (store.calls || []).length) {
        return;
    }
    asking = true;
    try {
        const picked = await askStartingContacts(cast);
        await setupAddressBook(picked);
    } finally {
        asking = false;
    }
}

/**
 * @param {{ key: string, name: string }[]} cast
 * @returns {Promise<{ key: string, name: string }[]>}
 */
function askStartingContacts(cast) {
    return new Promise((resolve) => {
        document.getElementById('pp-book-ask')?.remove();
        const dlg = document.createElement('dialog');
        dlg.id = 'pp-book-ask';
        dlg.className = 'pp-sg-prompt pp-wa-ask pp-book-ask';
        dlg.innerHTML = `
            <div class="pp-sg-panel pp-wa-frame">
                <span class="pp-sg-corner pp-sg-tl"></span><span class="pp-sg-corner pp-sg-tr"></span>
                <span class="pp-sg-corner pp-sg-bl"></span><span class="pp-sg-corner pp-sg-br"></span>
                <div class="pp-wa-head">ADDRESS BOOK · NEW CHAT</div>
                <div class="pp-wa-sub">Who is already in your phone? The rest can be added later, when they mail or call you.</div>
                <div class="pp-book-ask-list">
                    ${cast.map((c, i) => `
                        <div class="pp-book-ask-row">
                            <label><input type="checkbox" data-i="${i}" checked /> <span>${esc(c.name)}</span></label>
                            <input type="text" class="pp-book-ask-name" data-i="${i}" maxlength="40" placeholder="Saved as… (${esc(c.name)})" aria-label="Saved as" />
                        </div>`).join('')}
                </div>
                <div class="pp-wa-actions">
                    <button type="button" class="pp-wa-btn" data-book="none">Nobody yet</button>
                    <button type="button" class="pp-wa-btn pp-wa-go" data-book="ok">Save contacts</button>
                </div>
                <label class="pp-wa-quiet"><input type="checkbox" id="pp-book-noask" /> Don't ask in new chats (everyone starts as a contact)</label>
            </div>
        `;
        document.body.appendChild(dlg);
        const finish = (list) => {
            if (/** @type {HTMLInputElement | null} */ (dlg.querySelector('#pp-book-noask'))?.checked) {
                getSettings().contactsAskOnStart = false;
                saveSettings();
            }
            try {
                dlg.close();
            } catch {
                /* ignore */
            }
            dlg.remove();
            resolve(list);
        };
        const read = (all) => cast
            .map((c, i) => {
                const on = /** @type {HTMLInputElement | null} */ (dlg.querySelector(`input[type="checkbox"][data-i="${i}"]`))?.checked;
                const name = /** @type {HTMLInputElement | null} */ (dlg.querySelector(`.pp-book-ask-name[data-i="${i}"]`))?.value || '';
                return all || on ? { key: c.key, name } : null;
            })
            .filter(Boolean);
        dlg.querySelector('[data-book="ok"]')?.addEventListener('click', () => finish(/** @type {any} */ (read(false))));
        dlg.querySelector('[data-book="none"]')?.addEventListener('click', () => finish([]));
        dlg.addEventListener('cancel', (e) => {
            e.preventDefault();
            finish(/** @type {any} */ (read(true)));
        });
        // Typing a name ticks the box.
        dlg.querySelectorAll('.pp-book-ask-name').forEach((inp) => inp.addEventListener('input', () => {
            const box = /** @type {HTMLInputElement | null} */ (dlg.querySelector(`input[type="checkbox"][data-i="${inp.getAttribute('data-i')}"]`));
            if (box && /** @type {HTMLInputElement} */ (inp).value.trim()) {
                box.checked = true;
            }
        }));
        try {
            dlg.showModal();
        } catch {
            dlg.setAttribute('open', '');
        }
    });
}

