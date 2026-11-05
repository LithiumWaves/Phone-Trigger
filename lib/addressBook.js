/**
 * Address book app — your contacts in this chat, the names you saved them under,
 * their own ringtone and mail tone, and people you can still add.
 */
import { SOUND_PRESETS } from './constants.js';
import { getSettings, toast } from './settings.js';
import { bindToggle } from './ui.js';
import { registerPhoneApp, render as renderPhone } from './phone.js';
import { isPhoneWaveContact, PHONEWAVE_NAME } from './dmail.js';
import { labBadge } from './labMembers.js';
import { closenessBadge } from './consequences.js';
import { playPreset, playRingtone, playNotification } from './audio.js';
import {
    listAddressBook,
    listUnregistered,
    displayName,
    addContact,
    removeContact,
    renameContact,
    getContactSounds,
    setContactSounds,
} from './contacts.js';

/** @type {{ level: 'list' | 'entry' | 'add', key: string }} */
const nav = { level: 'list', key: '' };

const NOTIFY = SOUND_PRESETS.filter((p) => p.kind === 'notify' || p.kind === 'both');
const RING = SOUND_PRESETS.filter((p) => p.kind === 'ringtone' || p.kind === 'both');

function soundSelect(id, presets, current, label) {
    return `
        <label class="pp-field">
            <span class="pp-label">${label}</span>
            <select id="${id}" class="pp-select">
                <option value="" ${current ? '' : 'selected'}>Default</option>
                ${presets.map((p) => `<option value="${p.id}" ${current === p.id ? 'selected' : ''}>${p.name}</option>`).join('')}
            </select>
        </label>`;
}

function renderList(view, a) {
    a.setSoftLabels('Add', 'Back');
    const book = listAddressBook();
    const more = listUnregistered().length;
    view.innerHTML = `
        <div class="pp-title pp-title-bar"><span class="pp-title-text">Address book</span><span class="pp-mail-count">${book.length}</span></div>
        <div class="pp-scroll pp-book">
            ${book.length ? book.map((c) => {
        const shown = displayName(c.key, c.name);
        const sounds = getContactSounds(c.key);
        return `
                <button type="button" class="pp-row pp-book-row" data-entry="${a.escapeHtml(c.key)}">
                    <span class="pp-book-main">
                        <span class="pp-book-name">${a.escapeHtml(shown)}${labBadge(c.key)}</span>
                        ${shown !== c.name ? `<span class="pp-book-real">${a.escapeHtml(c.name)}</span>` : ''}
                    </span>
                    <span class="pp-row-meta">${sounds.ring || sounds.ringUrl || sounds.mail || sounds.mailUrl ? '♪' : ''}${c.isActive ? ' ★' : ''}</span>
                </button>`;
    }).join('') : '<div class="pp-empty">No contacts yet</div>'}
            <button type="button" class="pp-btn pp-btn-ghost" id="pp-book-add" ${more ? '' : 'disabled'}>＋ Add contact${more ? ` (${more})` : ''}</button>
        </div>`;
    view.querySelectorAll('[data-entry]').forEach((btn) => btn.addEventListener('click', () => {
        nav.level = 'entry';
        nav.key = btn.getAttribute('data-entry') || '';
        a.render();
    }));
    view.querySelector('#pp-book-add')?.addEventListener('click', () => {
        nav.level = 'add';
        a.render();
    });
}

function renderAdd(view, a) {
    a.setSoftLabels('', 'Back');
    const people = listUnregistered();
    view.innerHTML = `
        <div class="pp-title">Add contact</div>
        <div class="pp-scroll pp-book">
            <p class="pp-settings-note">People in this chat who aren't in your phone yet.</p>
            ${people.length ? people.map((c) => `
                <div class="pp-book-add-row">
                    <span class="pp-book-name">${a.escapeHtml(c.name)}</span>
                    <input type="text" class="pp-book-as" data-as="${a.escapeHtml(c.key)}" maxlength="40" placeholder="Save as… (optional)" />
                    <button type="button" class="pp-btn" data-add="${a.escapeHtml(c.key)}">Add</button>
                </div>`).join('') : '<div class="pp-empty">Everyone is already a contact</div>'}
        </div>`;
    view.querySelectorAll('[data-add]').forEach((btn) => btn.addEventListener('click', async () => {
        const key = btn.getAttribute('data-add') || '';
        const input = /** @type {HTMLInputElement | null} */ ([...view.querySelectorAll('[data-as]')].find((el) => el.getAttribute('data-as') === key) || null);
        await addContact(key, input?.value || '');
        const real = people.find((c) => c.key === key)?.name || '';
        toast(`Added ${displayName(key, real)}`, 'success', 'Contacts');
        nav.level = listUnregistered().length ? 'add' : 'list';
        a.render();
    }));
}

function renderEntry(view, a) {
    const c = listAddressBook().find((x) => x.key === nav.key);
    if (!c) {
        nav.level = 'list';
        renderList(view, a);
        return;
    }
    const pw = isPhoneWaveContact(c.key);
    const sounds = getContactSounds(c.key);
    const callable = !pw && getSettings().callEnabled !== false;
    a.setSoftLabels('Mail', 'Back');
    view.innerHTML = `
        <div class="pp-title">${a.escapeHtml(displayName(c.key, c.name))}</div>
        <div class="pp-scroll pp-book">
            <div class="pp-read-meta">
                <div class="pp-read-line"><span class="pp-label">Name</span> ${a.escapeHtml(c.name)}${labBadge(c.key)}${closenessBadge(c.key)}</div>
            </div>
            <label class="pp-field">
                <span class="pp-label">Saved as</span>
                <input type="text" id="pp-book-name" maxlength="40" value="${a.escapeHtml(displayName(c.key, ''))}" placeholder="${a.escapeHtml(pw ? PHONEWAVE_NAME : c.name)}" />
            </label>
            <p class="pp-settings-note">Only your phone shows this name. The story still uses ${a.escapeHtml(pw ? 'the real one' : c.name)}.</p>
            <div class="pp-book-actions">
                <button type="button" class="pp-btn" id="pp-book-mail">✉ Mail</button>
                ${callable ? '<button type="button" class="pp-btn" id="pp-book-call">☎ Call</button>' : ''}
            </div>
            ${pw ? '' : `
            <div class="pp-section">Sounds</div>
            ${soundSelect('pp-book-ring', RING, sounds.ring || '', 'Ringtone')}
            <label class="pp-field"><span class="pp-label">Ringtone URL (optional)</span><input type="url" id="pp-book-ring-url" value="${a.escapeHtml(sounds.ringUrl || '')}" placeholder="https://…/ring.mp3" /></label>
            ${soundSelect('pp-book-mailtone', NOTIFY, sounds.mail || '', 'Mail tone')}
            <label class="pp-field"><span class="pp-label">Mail tone URL (optional)</span><input type="url" id="pp-book-mail-url" value="${a.escapeHtml(sounds.mailUrl || '')}" placeholder="https://…/mail.mp3" /></label>
            <div class="pp-book-actions">
                <button type="button" class="pp-btn pp-btn-ghost" id="pp-book-test-ring">Test ring</button>
                <button type="button" class="pp-btn pp-btn-ghost" id="pp-book-test-mail">Test mail tone</button>
            </div>
            <div class="pp-section"></div>
            <button type="button" class="pp-btn pp-btn-ghost pp-btn-danger" id="pp-book-remove">Remove from contacts</button>
            <p class="pp-settings-note">Their mail stays. They can still mail or call you, and show as not in contacts.</p>`}
        </div>`;

    const nameInput = /** @type {HTMLInputElement | null} */ (view.querySelector('#pp-book-name'));
    nameInput?.addEventListener('change', async () => {
        await renameContact(c.key, nameInput.value);
        toast(`Saved as ${displayName(c.key, c.name)}`, 'success', 'Contacts');
        a.render();
    });
    view.querySelector('#pp-book-mail')?.addEventListener('click', () => a.compose({ toKey: c.key }));
    view.querySelector('#pp-book-call')?.addEventListener('click', () => a.call(c.key));

    const bindSound = (sel, field) => {
        const el = /** @type {HTMLInputElement | HTMLSelectElement | null} */ (view.querySelector(sel));
        el?.addEventListener('change', () => {
            setContactSounds(c.key, { [field]: el.value.trim() });
            if (field === 'ring' || field === 'mail') {
                void playPreset(el.value);
            }
        });
    };
    bindSound('#pp-book-ring', 'ring');
    bindSound('#pp-book-ring-url', 'ringUrl');
    bindSound('#pp-book-mailtone', 'mail');
    bindSound('#pp-book-mail-url', 'mailUrl');
    view.querySelector('#pp-book-test-ring')?.addEventListener('click', () => void playRingtone(c.key));
    view.querySelector('#pp-book-test-mail')?.addEventListener('click', () => void playNotification(c.key));
    view.querySelector('#pp-book-remove')?.addEventListener('click', async () => {
        if (!window.confirm(`Remove ${displayName(c.key, c.name)} from your contacts?`)) {
            return;
        }
        await removeContact(c.key);
        nav.level = 'list';
        a.render();
    });
}

registerPhoneApp('contacts', {
    title: 'Address book',
    icon: '☰',
    menuIcon: 'contacts',
    home: () => getSettings().addressBookEnabled !== false,
    render(view, a) {
        view.style.background = '';
        view.className = 'pp-view';
        if (nav.level === 'add') {
            renderAdd(view, a);
        } else if (nav.level === 'entry') {
            renderEntry(view, a);
        } else {
            renderList(view, a);
        }
    },
    back() {
        if (nav.level !== 'list') {
            nav.level = 'list';
            return 'stay';
        }
        return undefined;
    },
    softLeft() {
        if (nav.level === 'list') {
            if (listUnregistered().length) {
                nav.level = 'add';
                renderPhone();
            }
            return;
        }
        if (nav.level === 'entry') {
            /** @type {HTMLElement | null} */ (document.querySelector('#pp-book-mail'))?.click();
        }
    },
});

/** Back to the list whenever the chat changes. */
export function resetAddressBookNav() {
    nav.level = 'list';
    nav.key = '';
}

export function initAddressBookUi() {
    bindToggle('#pp_book_enabled', 'addressBookEnabled');
    bindToggle('#pp_book_ask', 'contactsAskOnStart');
    bindToggle('#pp_data_enabled', 'dataFolderEnabled');
}
