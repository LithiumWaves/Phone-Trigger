/**
 * Lab members — member numbers and titles for you and the cast (No. 001, No. 002 …),
 * shown as badges on their mail and optionally told to the AI.
 */
import { getSettings, toast } from './settings.js';
import { getMailStore, persistMailStore, listMailContacts, getPersonaName } from './store.js';
import { isPhoneWaveContact } from './dmail.js';
import { esc, setPrompt, bindToggle } from './ui.js';

export const LAB_PROMPT_KEY = 'phone_trigger_labmem';
const PERSONA = '__persona';

function registry() {
    const m = getMailStore();
    if (!m.labMembers || typeof m.labMembers !== 'object') {
        m.labMembers = {};
    }
    return m.labMembers;
}

function people() {
    return [
        { key: PERSONA, name: getPersonaName() },
        ...listMailContacts().filter((c) => !isPhoneWaveContact(c.key)).map((c) => ({ key: c.key, name: c.name })),
    ];
}

/** Badge for a contact key (or the persona with no key). */
export function labBadge(key) {
    const r = registry()[key || PERSONA];
    if (!r?.no) {
        return '';
    }
    return `<span class="pp-labmem" title="Lab Member No.${esc(pad(r.no))}${r.title ? ` · ${esc(r.title)}` : ''}">No.${esc(pad(r.no))}</span>`;
}

function pad(n) {
    return String(n).padStart(3, '0');
}

export function updateLabPrompt() {
    if (!getSettings().labMembersInject) {
        setPrompt(LAB_PROMPT_KEY, '');
        return;
    }
    const reg = registry();
    const rows = people()
        .filter((p) => reg[p.key]?.no)
        .sort((a, b) => reg[a.key].no - reg[b.key].no)
        .map((p) => `No.${pad(reg[p.key].no)} ${p.name}${reg[p.key].title ? ` (${reg[p.key].title})` : ''}`);
    setPrompt(LAB_PROMPT_KEY, rows.length ? `[Lab members: ${rows.join('; ')}.]` : '', 4);
}

/**
 * @param {string} key
 * @param {{ no?: number | null, title?: string }} patch
 */
async function setMember(key, patch) {
    const reg = registry();
    const cur = reg[key] || {};
    const next = { ...cur, ...patch };
    if (!next.no) {
        delete reg[key];
    } else {
        reg[key] = { no: Math.max(1, Math.floor(Number(next.no))), title: String(next.title || '').slice(0, 60) };
    }
    await persistMailStore();
    updateLabPrompt();
}

export function renderLabPanel() {
    const host = document.getElementById('pp_labmem_panel');
    if (!host) {
        return;
    }
    const reg = registry();
    const list = people();
    host.innerHTML = `
        <table class="pp-labmem-table">
            <thead><tr><th>No.</th><th>Member</th><th>Title</th></tr></thead>
            <tbody>
                ${list.map((p) => `
                <tr>
                    <td><input type="number" min="0" max="999" class="text_pole" data-lm-no="${esc(p.key)}" value="${reg[p.key]?.no || ''}" placeholder="—"></td>
                    <td>${esc(p.name)}${p.key === PERSONA ? ' <small>(you)</small>' : ''}</td>
                    <td><input type="text" class="text_pole" data-lm-title="${esc(p.key)}" value="${esc(reg[p.key]?.title || '')}" placeholder="e.g. Founder, Assistant"></td>
                </tr>`).join('')}
            </tbody>
        </table>
        <button type="button" class="menu_button" id="pp_labmem_number">Number everyone in order</button>`;
    host.querySelectorAll('[data-lm-no]').forEach((el) => el.addEventListener('change', () => {
        const v = Number(/** @type {HTMLInputElement} */ (el).value);
        void setMember(el.getAttribute('data-lm-no') || '', { no: v > 0 ? v : null });
    }));
    host.querySelectorAll('[data-lm-title]').forEach((el) => el.addEventListener('change', () => {
        const key = el.getAttribute('data-lm-title') || '';
        if (!registry()[key]?.no) {
            toast('Give them a member number first', 'info', 'LAB');
            return;
        }
        void setMember(key, { title: /** @type {HTMLInputElement} */ (el).value.trim() });
    }));
    host.querySelector('#pp_labmem_number')?.addEventListener('click', async () => {
        const regNow = registry();
        let next = Math.max(0, ...Object.values(regNow).map((r) => Number(r.no) || 0)) + 1;
        for (const p of list) {
            if (!regNow[p.key]?.no) {
                regNow[p.key] = { no: next++, title: '' };
            }
        }
        await persistMailStore();
        updateLabPrompt();
        renderLabPanel();
    });
}

/** `/labmem <name> [number] [title…]` */
export async function labMemCommand(text) {
    const parts = String(text || '').trim().split(/\s+/);
    if (!parts[0]) {
        const reg = registry();
        return people().filter((p) => reg[p.key]?.no).map((p) => `No.${pad(reg[p.key].no)} ${p.name}`).join(', ') || 'No lab members yet.';
    }
    const numAt = parts.findIndex((x) => /^\d{1,3}$/.test(x));
    const name = (numAt > 0 ? parts.slice(0, numAt) : parts).join(' ').toLowerCase();
    const who = people().find((p) => p.name.toLowerCase() === name || p.name.toLowerCase().split(/\s+/)[0] === name);
    if (!who) {
        return `No one called ${name} in this chat.`;
    }
    if (numAt < 0) {
        const r = registry()[who.key];
        return r?.no ? `${who.name}: Lab Member No.${pad(r.no)}${r.title ? ` (${r.title})` : ''}` : `${who.name} is not a lab member.`;
    }
    await setMember(who.key, { no: Number(parts[numAt]), title: parts.slice(numAt + 1).join(' ') });
    renderLabPanel();
    return `${who.name} is Lab Member No.${pad(Number(parts[numAt]))}`;
}

export function initLabUi() {
    bindToggle('#pp_labmem_inject', 'labMembersInject', updateLabPrompt);
    renderLabPanel();
    updateLabPrompt();
    document.addEventListener('pt:menu-category', (e) => {
        if (/** @type {CustomEvent} */ (e).detail?.cat === 'phones') {
            renderLabPanel();
        }
    });
}

export function refreshLab() {
    renderLabPanel();
    updateLabPrompt();
}
