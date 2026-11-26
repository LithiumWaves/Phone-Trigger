/**
 * Multiplayer (ST-Multiplayer 1.6.0+): what you see when somebody else in the room sends a
 * D-Mail or time leaps. Mail, calls and the host-side work live with their features
 * (email.js, call.js, timeleap.js) and reach the room through mpLink.js.
 *
 * Settings → D-Mail → "When another player sends a D-Mail": cutscene or vertigo only.
 * Settings → Time Leap → "When another player time leaps": nothing (just the rewound chat) or cutscene.
 */
import { getSettings, toast, dmailOn, timeleapOn } from './settings.js';
import { onMpLocal, onPlayersChanged, listPlayerContacts } from './mpLink.js';
import { playDmailSequence } from './dmail.js';
import { runScreenVertigo } from './vertigoFx.js';
import { playTimeleapSequence } from './timeleapFx.js';
import { formatLeapTime, hopsSuffix } from './timeleap.js';
import { closePhone, presentDmailResult, refreshIfOpen } from './phone.js';

/** @returns {'cutscene'|'vertigo'} */
export function othersDmailFx() {
    return getSettings().mpOthersDmail === 'vertigo' ? 'vertigo' : 'cutscene';
}

/** @returns {'none'|'cutscene'} */
export function othersLeapFx() {
    return getSettings().mpOthersLeap === 'cutscene' ? 'cutscene' : 'none';
}

/** One effect at a time: a second D-Mail waits for the first spell to pass. */
let queue = Promise.resolve();
/** @param {() => Promise<void>} job */
function enqueue(job) {
    queue = queue.then(job).catch((err) => console.warn('[Phone Trigger] multiplayer effect failed', err));
    return queue;
}

/** Spectacle is the D-Mail tier that allows any effect at all. */
function spectacleOn() {
    return getSettings().dmailSpectacle !== false;
}

/**
 * Another player's D-Mail, on a player's screen (the host told us).
 * @param {{ sender: string, divergenceFrom: string, divergenceTo: string, fact: string, undone: string[] }} d
 */
function onDmailApplied(d) {
    const note = d.fact
        ? `${d.sender}'s D-Mail reached the past: ${d.fact.slice(0, 140)}`
        : d.undone.length
            ? `${d.sender}'s D-Mail undid: ${d.undone.join(' / ').slice(0, 140)}`
            : `${d.sender} sent a D-Mail`;
    void enqueue(async () => {
        if (dmailOn() && spectacleOn()) {
            await closePhone({ force: true });
            if (othersDmailFx() === 'vertigo') {
                await runScreenVertigo();
            } else {
                await playDmailSequence({ from: d.divergenceFrom, to: d.divergenceTo });
            }
        }
        toast(note, 'info', 'READING STEINER');
        refreshIfOpen();
    });
}

/**
 * The host: a player's D-Mail just ran here. Same review screens as any D-Mail (lorebook,
 * card), the effect the host chose, and no Propose — it's already true.
 * @param {{ shift: any, subject: string, body: string, sender: string }} d
 */
function onDmailOnHost(d) {
    void enqueue(async () => {
        if (!dmailOn()) {
            toast(`${d.sender} sent a D-Mail`, 'info', 'READING STEINER');
            return;
        }
        await presentDmailResult(d.shift, {
            subject: d.subject,
            body: d.body,
            sender: d.sender,
            fx: othersDmailFx(),
            committed: true,
        });
    });
}

/**
 * Somebody else leapt: by default only the rewound chat shows it; or play the leap.
 * @param {{ leaper: string, fromTime: string, toTime: string, hops: number }} d
 */
function onLeap(d) {
    void enqueue(async () => {
        if (timeleapOn() && othersLeapFx() === 'cutscene' && d.fromTime && d.toTime) {
            await closePhone({ force: true });
            await playTimeleapSequence({
                from: d.fromTime,
                to: d.toTime,
                lines: [
                    `LEAPER  ${d.leaper.toUpperCase()}`,
                    `FROM  ${formatLeapTime(d.fromTime)}`,
                    `DEST  ${formatLeapTime(d.toTime)}`,
                    ...(d.hops > 1 ? [`LEAPS  ×${d.hops}`] : []),
                ],
            });
        }
        toast(`${d.leaper} time leapt${hopsSuffix(d.hops)} — the chat was rewound`, 'info', 'TIME LEAP');
    });
}

let started = false;

export function initMultiplayer() {
    if (started) {
        return;
    }
    started = true;
    onMpLocal('dmail-applied', onDmailApplied);
    onMpLocal('dmail-host', onDmailOnHost);
    onMpLocal('leap-applied', onLeap);
    onMpLocal('leap-host', onLeap);
    // Players come and go from the address book, compose and call screens.
    // Redraw only when who's there changed (roster events also fire for pings and status).
    let lastPlayers = '';
    onPlayersChanged(() => {
        const now = listPlayerContacts().map((c) => c.key).join('|');
        if (now !== lastPlayers) {
            lastPlayers = now;
            refreshIfOpen();
        }
    });
}
