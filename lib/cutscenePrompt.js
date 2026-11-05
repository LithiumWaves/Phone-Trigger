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

const DMAIL_CARDS = [
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

const LEAP_CARDS = [
    {
        id: 'original',
        tag: 'OPERATION 01',
        title: 'Original',
        gif: 'leap-original.gif',
        pros: [
            ['+', 'The real cutscene footage and soundtrack, untouched.'],
            ['−', 'Fixed clock: it always counts 8/13 19:56 → 16:56.'],
            ['·', 'Your leap still lands where you set it in the machine.'],
        ],
        example: ['You leap back to', '8/13 FRI 22:40', 'the clock still stops on', '8/13 FRI 16:56'],
    },
    {
        id: 'progressive',
        tag: 'OPERATION 02',
        title: 'Progressive',
        gif: 'leap-progressive.gif',
        pros: [
            ['+', 'The flip clock counts back from your time to your destination.'],
            ['+', 'Same timing and soundtrack as the original; the HUD shows the leap’s readout.'],
            ['−', 'Recreated live in your browser, so the warp tunnel is softer.'],
        ],
        example: ['You leap back to', '8/13 FRI 22:40', 'the clock stops on', '8/13 FRI 22:40'],
    },
];

/**
 * @typedef {'dmail' | 'timeleap'} CutsceneKind
 */
const KINDS = {
    dmail: {
        cards: DMAIL_CARDS,
        settingKey: 'dmailCutscene',
        chosenKey: 'dmailCutsceneChosen',
        title: 'Divergence Meter',
        sub: 'When a D-Mail reaches the past, which cutscene should play?',
        alt: 'divergence meter cutscene',
        toastTitle: 'D-MAIL',
        foot: 'Change it anytime: Extensions → Phone Trigger → D-Mail, or on the phone in PhoneWave settings.',
    },
    timeleap: {
        cards: LEAP_CARDS,
        settingKey: 'timeleapCutscene',
        chosenKey: 'timeleapCutsceneChosen',
        title: 'Time Leap',
        sub: 'When your memories travel back, which cutscene should play?',
        alt: 'time leap cutscene',
        toastTitle: 'TIME LEAP',
        foot: 'Change it anytime: Extensions → Phone Trigger → Time Leap, or call PhoneWave and open CONFIG.',
    },
};

function cardHtml(card, current, alt) {
    const [lead, value, mid, landed] = card.example;
    const isDefault = card.id === 'original';
    return `
        <section class="pp-sg-card ${card.id === current ? 'pp-sg-card-current' : ''}" data-choice="${card.id}">
            <header class="pp-sg-card-head">
                <span class="pp-sg-tag">${card.tag}</span>
                ${isDefault ? '<span class="pp-sg-badge">DEFAULT</span>' : ''}
            </header>
            <h3 class="pp-sg-card-title">${card.title}</h3>
            <div class="pp-sg-gif-frame">${gifHtml(card.gif, `${card.title} ${alt}`)}</div>
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
 * Steins;Gate-styled chooser between an original clip and its progressive remake.
 * Dismissing it keeps the current choice.
 * @param {{ firstRun?: boolean, kind?: CutsceneKind }} [opts]
 * @returns {Promise<DmailCutscene>}
 */
export function showCutscenePrompt(opts = {}) {
    document.getElementById(PROMPT_ID)?.remove();
    const settings = getSettings();
    const kind = KINDS[opts.kind === 'timeleap' ? 'timeleap' : 'dmail'];
    /** @type {DmailCutscene} */
    const current = settings[kind.settingKey] === 'progressive' ? 'progressive' : 'original';

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
                ${kind === KINDS.dmail
                    ? '<canvas class="pp-sg-meter" aria-hidden="true"></canvas>'
                    : '<p class="pp-sg-leapclock" aria-hidden="true"><b>8</b><i>月</i><b>13</b><i>日</i><span>FRI</span><b>16</b><i>時</i><b>56</b><i>分</i></p>'}
                <h2 class="pp-sg-title" id="pp-sg-title">${kind.title}</h2>
                <p class="pp-sg-sub">${kind.sub}</p>
                <div class="pp-sg-cards">
                    ${kind.cards.map((c) => cardHtml(c, current, kind.alt)).join('')}
                </div>
                <p class="pp-sg-foot">
                    ${kind.foot}
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
            s[kind.chosenKey] = true;
            if (choice) {
                s[kind.settingKey] = choice;
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
                toast(`Cutscene: ${choice === 'progressive' ? 'Progressive' : 'Original'}`, 'success', kind.toastTitle);
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

/**
 * Photosensitivity, asked once: Reduce flashing or Full effects. Dismissing keeps full effects
 * (unless the system asks for reduced motion, which Reduce flashing follows anyway).
 * @returns {Promise<boolean>} reduce flashing
 */
export function showFlashPrompt() {
    document.getElementById(PROMPT_ID)?.remove();
    let systemCalm = false;
    try {
        systemCalm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
        /* ignore */
    }
    return new Promise((resolve) => {
        const dialog = document.createElement('dialog');
        dialog.id = PROMPT_ID;
        dialog.className = 'pp-sg-prompt pp-flash-prompt';
        dialog.setAttribute('aria-labelledby', 'pp-sg-title');
        dialog.innerHTML = `
            <div class="pp-sg-panel pp-flash-panel">
                <span class="pp-sg-corner pp-sg-tl"></span><span class="pp-sg-corner pp-sg-tr"></span>
                <span class="pp-sg-corner pp-sg-bl"></span><span class="pp-sg-corner pp-sg-br"></span>
                <p class="pp-sg-kicker">Future Gadget Lab · Phone Trigger · First boot</p>
                <h2 class="pp-sg-title" id="pp-sg-title">Photosensitivity</h2>
                <p class="pp-sg-sub">
                    Time leaps and D-Mails use flashing light: lightning, white flashes and a dizzying
                    vertigo as the worldline shifts. You can soften all of it.
                </p>
                ${systemCalm ? '<p class="pp-flash-note">Your system asks for reduced motion, so effects are already softened.</p>' : ''}
                <div class="pp-flash-actions">
                    <button type="button" class="pp-sg-select ${systemCalm ? 'pp-flash-pick' : ''}" data-flash="reduce">Reduce flashing</button>
                    <button type="button" class="pp-sg-select ${systemCalm ? '' : 'pp-flash-pick'}" data-flash="full">Full effects</button>
                </div>
                <p class="pp-sg-foot">Change it anytime: Phone Trigger menu → System → Reduce flashing.</p>
            </div>
        `;
        document.body.appendChild(dialog);
        let settled = false;
        /** @param {boolean | null} reduce null = dismissed */
        const finish = (reduce) => {
            if (settled) {
                return;
            }
            settled = true;
            const st = getSettings();
            st.reduceFlashingAsked = true;
            if (reduce !== null) {
                st.reduceFlashing = reduce;
            }
            saveSettings();
            const box = /** @type {HTMLInputElement | null} */ (document.getElementById('pp_reduce_flashing'));
            if (box) {
                box.checked = Boolean(st.reduceFlashing);
            }
            dialog.classList.add('pp-sg-out');
            window.setTimeout(() => {
                try {
                    dialog.close();
                } catch {
                    /* ignore */
                }
                dialog.remove();
            }, 260);
            if (reduce) {
                toast('Flashing reduced', 'success', 'PHONE TRIGGER');
            }
            resolve(Boolean(st.reduceFlashing));
        };
        dialog.querySelector('[data-flash="reduce"]')?.addEventListener('click', () => finish(true));
        dialog.querySelector('[data-flash="full"]')?.addEventListener('click', () => finish(false));
        dialog.addEventListener('cancel', (e) => {
            e.preventDefault();
            finish(null);
        });
        try {
            dialog.showModal();
        } catch {
            dialog.setAttribute('open', '');
        }
    });
}

/**
 * First boot: photosensitivity first, then each cutscene (D-Mail, then Time Leap), after the UI
 * has settled. People who chose their cutscenes before still get the photosensitivity question once.
 */
export function maybeShowFirstRunCutscenePrompt() {
    const s = getSettings();
    if (s.dmailCutsceneChosen && s.timeleapCutsceneChosen && s.reduceFlashingAsked) {
        return;
    }
    window.setTimeout(async () => {
        if (document.getElementById(PROMPT_ID)) {
            return;
        }
        if (!getSettings().reduceFlashingAsked) {
            await showFlashPrompt();
            await new Promise((r) => window.setTimeout(r, 400));
        }
        if (!getSettings().dmailCutsceneChosen && !document.getElementById(PROMPT_ID)) {
            await showCutscenePrompt({ firstRun: true, kind: 'dmail' });
            await new Promise((r) => window.setTimeout(r, 400));
        }
        if (!getSettings().timeleapCutsceneChosen && !document.getElementById(PROMPT_ID)) {
            void showCutscenePrompt({ firstRun: true, kind: 'timeleap' });
        }
    }, 1200);
}
