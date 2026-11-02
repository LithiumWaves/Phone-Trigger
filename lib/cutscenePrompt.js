import { EXTENSION_FOLDER, LEGACY_EXTENSION_FOLDER } from './constants.js';
import { getSettings, saveSettings, toast } from './settings.js';
import { drawStaticMeter } from './divmeter.js';

/** @typedef {'original' | 'progressive'} DmailCutscene */

const PROMPT_ID = 'pp-cutscene-prompt';

function assetUrl(file, folder = EXTENSION_FOLDER) {
    return `/${folder}/assets/${file}`;
}

/** @param {string} file */
function gifHtml(file, alt) {
    const legacy = assetUrl(file, LEGACY_EXTENSION_FOLDER);
    return `<img class="pp-sg-gif" src="${assetUrl(file)}" alt="${alt}" loading="eager"
        onerror="if (!this.dataset.retried) { this.dataset.retried = '1'; this.src = '${legacy}'; }" />`;
}

const CARDS = [
    {
        id: 'original',
        tag: 'OPERATION 01',
        title: 'Original',
        gif: 'meter-original.gif',
        pros: [
            ['+', 'The real cutscene footage and soundtrack, untouched.'],
            ['−', 'Fixed numbers: it always rolls 1.130426 → 0.571024.'],
            ['·', 'The home-screen meter still tracks your chat’s real divergence.'],
        ],
        example: ['Your D-Mail shifts the chat to', '1.048596', 'the cutscene still lands on', '0.571024'],
    },
    {
        id: 'progressive',
        tag: 'OPERATION 02',
        title: 'Progressive',
        gif: 'meter-progressive.gif',
        pros: [
            ['+', 'Lands on the divergence the AI picked for this D-Mail.'],
            ['+', 'Same timing and soundtrack as the original.'],
            ['−', 'Recreated live in your browser, so details differ (equations use a script font).'],
        ],
        example: ['Your D-Mail shifts the chat to', '1.048596', 'the cutscene lands on', '1.048596'],
    },
];

function cardHtml(card, current) {
    const [lead, value, mid, landed] = card.example;
    const isDefault = card.id === 'original';
    return `
        <section class="pp-sg-card ${card.id === current ? 'pp-sg-card-current' : ''}" data-choice="${card.id}">
            <header class="pp-sg-card-head">
                <span class="pp-sg-tag">${card.tag}</span>
                ${isDefault ? '<span class="pp-sg-badge">DEFAULT</span>' : ''}
            </header>
            <h3 class="pp-sg-card-title">${card.title}</h3>
            <div class="pp-sg-gif-frame">${gifHtml(card.gif, `${card.title} divergence meter cutscene`)}</div>
            <ul class="pp-sg-points">
                ${card.pros.map(([mark, text]) => `<li><span class="pp-sg-mark">${mark}</span>${text}</li>`).join('')}
            </ul>
            <p class="pp-sg-example">
                ${lead} <b>${value}</b>;<br />${mid} <b class="${landed === value ? 'pp-sg-match' : 'pp-sg-miss'}">${landed}</b>.
            </p>
            <button type="button" class="pp-sg-select" data-choice="${card.id}">
                Use ${card.title}
            </button>
        </section>
    `;
}

/**
 * Steins;Gate-styled chooser between the original clip and the progressive meter.
 * Dismissing it keeps the current choice.
 * @param {{ firstRun?: boolean }} [opts]
 * @returns {Promise<DmailCutscene>}
 */
export function showCutscenePrompt(opts = {}) {
    document.getElementById(PROMPT_ID)?.remove();
    const settings = getSettings();
    /** @type {DmailCutscene} */
    const current = settings.dmailCutscene === 'progressive' ? 'progressive' : 'original';

    return new Promise((resolve) => {
        /** @type {HTMLDialogElement} */
        const dialog = document.createElement('dialog');
        dialog.id = PROMPT_ID;
        dialog.className = 'pp-sg-prompt';
        dialog.setAttribute('aria-labelledby', 'pp-sg-title');
        dialog.innerHTML = `
            <div class="pp-sg-panel">
                <span class="pp-sg-corner pp-sg-tl"></span><span class="pp-sg-corner pp-sg-tr"></span>
                <span class="pp-sg-corner pp-sg-bl"></span><span class="pp-sg-corner pp-sg-br"></span>
                <button type="button" class="pp-sg-close" aria-label="Close">×</button>
                <p class="pp-sg-kicker">Future Gadget Lab · Phone Trigger${opts.firstRun ? ' · First boot' : ''}</p>
                <canvas class="pp-sg-meter" aria-hidden="true"></canvas>
                <h2 class="pp-sg-title" id="pp-sg-title">Divergence Meter</h2>
                <p class="pp-sg-sub">When a D-Mail reaches the past, which cutscene should play?</p>
                <div class="pp-sg-cards">
                    ${CARDS.map((c) => cardHtml(c, current)).join('')}
                </div>
                <p class="pp-sg-foot">
                    Change it anytime: Extensions → Phone Trigger → D-Mail, or on the phone in PhoneWave settings.
                    <span class="pp-sg-sign">El Psy Kongroo.</span>
                </p>
            </div>
        `;
        document.body.appendChild(dialog);

        let settled = false;
        /** @param {DmailCutscene | null} choice null = dismissed */
        const finish = (choice) => {
            if (settled) {
                return;
            }
            settled = true;
            const s = getSettings();
            s.dmailCutsceneChosen = true;
            if (choice) {
                s.dmailCutscene = choice;
            }
            saveSettings();
            dialog.classList.add('pp-sg-out');
            window.setTimeout(() => {
                try {
                    dialog.close();
                } catch {
                    /* ignore */
                }
                dialog.remove();
            }, 260);
            const result = choice || current;
            if (choice) {
                toast(`Cutscene: ${choice === 'progressive' ? 'Progressive' : 'Original'}`, 'success', 'D-MAIL');
            }
            resolve(result);
        };

        dialog.querySelectorAll('button[data-choice]').forEach((btn) => {
            btn.addEventListener('click', () => finish(/** @type {DmailCutscene} */ (btn.getAttribute('data-choice'))));
        });
        dialog.querySelector('.pp-sg-close')?.addEventListener('click', () => finish(null));
        dialog.addEventListener('cancel', (e) => {
            e.preventDefault();
            finish(null);
        });

        try {
            dialog.showModal();
        } catch {
            dialog.setAttribute('open', '');
        }
        const meter = /** @type {HTMLCanvasElement | null} */ (dialog.querySelector('.pp-sg-meter'));
        if (meter) {
            requestAnimationFrame(() => drawStaticMeter(meter, '1.048596'));
        }
    });
}

/** First boot: ask once, after the UI has settled. */
export function maybeShowFirstRunCutscenePrompt() {
    if (getSettings().dmailCutsceneChosen) {
        return;
    }
    window.setTimeout(() => {
        if (!getSettings().dmailCutsceneChosen && !document.getElementById(PROMPT_ID)) {
            void showCutscenePrompt({ firstRun: true });
        }
    }, 1200);
}
