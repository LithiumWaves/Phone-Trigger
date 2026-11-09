/**
 * Art library for phone decoration: die-cut stickers, strap charms, shell patterns and
 * cover prints. Shared by the real handset (lib/chassis.js) and the menu previews/editor.
 *
 * Everything here is drawn from whitelisted kinds and #rrggbb colours that have already
 * been through validateSpec — no free text from a model ever reaches SVG or CSS
 * (text stickers use a fixed list of words).
 */

const INK = '#1b1418';

/** Die-cut white border for the shapes inside. */
const cut = (inner) => `<g stroke="#fff" stroke-width="2.4" stroke-linejoin="round" paint-order="stroke">${inner}</g>`;

/**
 * Sticker drawings in a 24×24 box. `c` main colour, `d` accent colour.
 * @type {Record<string, (c: string, d: string) => string>}
 */
const STICKER_ART = {
    heart: (c) => cut(`<path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z" fill="${c}"/>`),
    'broken-heart': (c) => cut(`<path d="M11.4 20.6S4 15.6 4 10a4.5 4.5 0 0 1 7.4-3.4L10 10.5l2.4 2.2-1.8 3.4z" fill="${c}"/><path d="M12.9 20.4S20 15.6 20 10a4.5 4.5 0 0 0-7.2-3.5l-1.2 3.7 2.4 2.3-1.9 3.6z" fill="${c}"/>`),
    star: (c) => cut(`<path d="M12 2l3 6.5 7 .8-5.2 4.8 1.4 7L12 17.6 5.8 21.1l1.4-7L2 9.3l7-.8z" fill="${c}"/>`),
    sparkle: (c) => cut(`<path d="M12 2c1 7 3 9 10 10-7 1-9 3-10 10-1-7-3-9-10-10 7-1 9-3 10-10z" fill="${c}"/>`),
    skull: (c) => cut(`<path fill-rule="evenodd" d="M12 3c-4.4 0-8 3.2-8 7.4 0 2.4 1.2 4.4 3 5.6V19h2v2h2v-2h2v2h2v-2h2v-3c1.8-1.2 3-3.2 3-5.6C20 6.2 16.4 3 12 3zm-3 9.5a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6zm6 0a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6z" fill="${c}"/>`),
    'skull-bow': (c, d) => cut(`<path fill-rule="evenodd" d="M11 5c-4 0-7 2.9-7 6.7 0 2.2 1 4 2.7 5.1V20h1.8v1.8h1.8V20h1.8v1.8H14V20h1.8v-3.2c1.7-1.1 2.7-2.9 2.7-5.1C18.5 7.9 15 5 11 5zm-2.7 8.6a1.6 1.6 0 1 1 0-3.3 1.6 1.6 0 0 1 0 3.3zm5.4 0a1.6 1.6 0 1 1 0-3.3 1.6 1.6 0 0 1 0 3.3z" fill="${c}"/><path d="M17 5l-3.6-2.6v5.2zm0 0l3.6-2.6v5.2z" fill="${d}"/>`) + `<circle cx="17" cy="5" r="1.2" fill="${d}"/>`,
    bow: (c, d) => cut(`<path d="M12 12L3.5 6.5Q1.5 12 3.5 17.5zM12 12l8.5-5.5q2 5.5 0 11z" fill="${c}"/>`) + `<circle cx="12" cy="12" r="2.4" fill="${d}" stroke="#fff" stroke-width="1"/>`,
    ribbon: (c, d) => cut(`<path d="M11 13l-3 9 2.2-1 1.8 1.6zM13 13l3 9-2.2-1-1.8 1.6zM12 10L4 5q-2 5 0 10zM12 10l8-5q2 5 0 10z" fill="${c}"/>`) + `<circle cx="12" cy="10" r="2.2" fill="${d}"/>`,
    bandage: (c, d) => cut(`<g transform="rotate(-32 12 12)"><rect x="1.5" y="8" width="21" height="8" rx="4" fill="${c}"/></g>`) + `<g transform="rotate(-32 12 12)"><rect x="9" y="8" width="6" height="8" fill="${d}"/><circle cx="10.6" cy="10.2" r=".55" fill="${INK}" opacity=".4"/><circle cx="13.4" cy="10.2" r=".55" fill="${INK}" opacity=".4"/><circle cx="10.6" cy="13.8" r=".55" fill="${INK}" opacity=".4"/><circle cx="13.4" cy="13.8" r=".55" fill="${INK}" opacity=".4"/></g>`,
    pill: (c, d) => cut(`<g transform="rotate(-35 12 12.5)"><path d="M12 9H6.5a3.5 3.5 0 0 0 0 7H12z" fill="${c}"/><path d="M12 9h5.5a3.5 3.5 0 0 1 0 7H12z" fill="${d}"/></g>`),
    cross: (c) => cut(`<path d="M10 2.5h4v5.5h5.5v4H14v9.5h-4V12H4.5V8H10z" fill="${c}"/>`),
    bat: (c) => cut(`<path d="M12 10.5l-1.6-3-.5 2.2C7 8.2 4 8.6 2 10.8c1.5 1 2 2.5 2 4.4 2-1 4-1 5.5 1 1-.9 2-.9 2.5.5.5-1.4 1.5-1.4 2.5-.5 1.5-2 3.5-2 5.5-1 0-1.9.5-3.4 2-4.4-2-2.2-5-2.6-7.9-1.1l-.5-2.2z" fill="${c}"/>`),
    crown: (c, d) => cut(`<path d="M3 18.5L4 7l5 5 3-7 3 7 5-5 1 11.5z" fill="${c}"/>`) + `<circle cx="12" cy="15" r="1.6" fill="${d}"/><circle cx="7" cy="15.6" r="1.1" fill="${d}"/><circle cx="17" cy="15.6" r="1.1" fill="${d}"/>`,
    rose: (c, d) => cut(`<path d="M5 19c1-4 4-5 7-5s6 1 7 5c-3 2-11 2-14 0z" fill="${d}"/><circle cx="12" cy="10" r="6.3" fill="${c}"/>`) + `<path d="M12 6.5c2.2 0 3.3 1.6 3 3.3-.3 1.6-2 2.4-3.2 1.7-1.1-.7-.8-2.3.3-2.3" fill="none" stroke="${INK}" stroke-opacity=".35" stroke-width="1"/>`,
    strawberry: (c, d) => cut(`<path d="M12 21.5C6 18.5 4 12.5 6 9.3c2-2.3 10-2.3 12 0 2 3.2 0 9.2-6 12.2z" fill="${c}"/><path d="M7.5 8.2L12 4.6l4.5 3.6L12 10z" fill="${d}"/>`) + [[9, 12], [12, 13], [15, 12], [10, 16], [14, 16], [12, 18.5]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx=".45" ry=".7" fill="#ffe7a0"/>`).join(''),
    cherry: (c, d) => cut(`<circle cx="7.5" cy="17" r="4" fill="${c}"/><circle cx="16.5" cy="16" r="4" fill="${c}"/>`) + `<path d="M7.5 13Q10 6 15.5 3M16.5 12Q15.5 7 15.5 3" fill="none" stroke="${d}" stroke-width="1.4"/><path d="M15.5 3q4 0 5 3-3 1-5-3z" fill="${d}"/>`,
    cat: (c) => cut(`<path d="M4 3l4 4h8l4-4v9c0 5-3.6 9-8 9s-8-4-8-9z" fill="${c}"/>`) + `<circle cx="9" cy="12.5" r="1.2" fill="${INK}"/><circle cx="15" cy="12.5" r="1.2" fill="${INK}"/><path d="M11 15.5l1 .8 1-.8" fill="none" stroke="${INK}" stroke-width=".8"/>`,
    bunny: (c, d) => cut(`<ellipse cx="8.5" cy="7" rx="2.4" ry="5.5" fill="${c}"/><ellipse cx="15.5" cy="7" rx="2.4" ry="5.5" fill="${c}"/><circle cx="12" cy="15.5" r="6.5" fill="${c}"/>`) + `<ellipse cx="8.5" cy="7" rx="1" ry="3.5" fill="${d}"/><ellipse cx="15.5" cy="7" rx="1" ry="3.5" fill="${d}"/><circle cx="9.6" cy="15" r=".9" fill="${INK}"/><circle cx="14.4" cy="15" r=".9" fill="${INK}"/>`,
    bear: (c, d) => cut(`<circle cx="6" cy="7" r="3.2" fill="${c}"/><circle cx="18" cy="7" r="3.2" fill="${c}"/><circle cx="12" cy="13.5" r="7.5" fill="${c}"/>`) + `<ellipse cx="12" cy="16" rx="3" ry="2.2" fill="${d}"/><circle cx="9" cy="12" r=".95" fill="${INK}"/><circle cx="15" cy="12" r=".95" fill="${INK}"/><circle cx="12" cy="15.3" r=".8" fill="${INK}"/>`,
    ghost: (c) => cut(`<path d="M5 21V11a7 7 0 0 1 14 0v10l-2.3-2-2.3 2-2.4-2-2.4 2-2.3-2z" fill="${c}"/>`) + `<ellipse cx="9.5" cy="11" rx="1.1" ry="1.6" fill="${INK}"/><ellipse cx="14.5" cy="11" rx="1.1" ry="1.6" fill="${INK}"/>`,
    moon: (c) => cut(`<path d="M15 2.5a9.5 9.5 0 1 0 6.5 16A7.5 7.5 0 0 1 15 2.5z" fill="${c}"/>`),
    sun: (c, d) => cut(`<path d="M12 1.5l2 3.5 3.8-1.4-.3 4 4 .9-2.6 3 2.6 3-4 .9.3 4-3.8-1.4-2 3.5-2-3.5-3.8 1.4.3-4-4-.9 2.6-3-2.6-3 4-.9-.3-4L10 5z" fill="${c}"/>`) + `<circle cx="12" cy="12" r="4.6" fill="${d}"/>`,
    cloud: (c) => cut(`<path d="M7 19a4.5 4.5 0 0 1-.4-9A5.5 5.5 0 0 1 17 9a4.5 4.5 0 0 1 .5 10z" fill="${c}"/>`),
    rainbow: () => `<path d="M2.5 18a9.5 9.5 0 0 1 19 0" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round"/>`
        + ['#ff5a6e', '#ffb340', '#ffe55c', '#5ad67d', '#5aa8ff', '#b06bff'].map((col, i) => `<path d="M${4 + i * 1.3} 18a${8 - i * 1.3} ${8 - i * 1.3} 0 0 1 ${16 - i * 2.6} 0" fill="none" stroke="${col}" stroke-width="1.4"/>`).join(''),
    lightning: (c) => cut(`<path d="M13.5 1.5L4 14h6.5l-1.5 8.5 10-13h-6.5z" fill="${c}"/>`),
    music: (c) => cut(`<path d="M9 17.5a3 3 0 1 1-2-2.8V5l11-2.2v11.7a3 3 0 1 1-2-2.8V6.3L9 7.6z" fill="${c}"/>`),
    butterfly: (c, d) => cut(`<ellipse cx="7" cy="8.5" rx="5" ry="5.5" fill="${c}"/><ellipse cx="17" cy="8.5" rx="5" ry="5.5" fill="${c}"/><ellipse cx="8" cy="17" rx="3.6" ry="3.8" fill="${d}"/><ellipse cx="16" cy="17" rx="3.6" ry="3.8" fill="${d}"/>`) + `<rect x="11.2" y="5" width="1.6" height="15" rx=".8" fill="${INK}"/>`,
    flower: (c, d) => cut(`<g fill="${c}"><circle cx="12" cy="5.5" r="3.6"/><circle cx="12" cy="18.5" r="3.6"/><circle cx="5.5" cy="12" r="3.6"/><circle cx="18.5" cy="12" r="3.6"/></g>`) + `<circle cx="12" cy="12" r="3.4" fill="${d}"/>`,
    daisy: (c, d) => cut(Array.from({ length: 8 }, (_, i) => `<ellipse cx="12" cy="5.2" rx="2.1" ry="4.2" fill="${c}" transform="rotate(${i * 45} 12 12)"/>`).join('')) + `<circle cx="12" cy="12" r="3" fill="${d}"/>`,
    mushroom: (c, d) => cut(`<path d="M3 12a9 8 0 0 1 18 0z" fill="${c}"/><path d="M9 12h6l1 8.5H8z" fill="${d}"/>`) + `<circle cx="8" cy="8.5" r="1.4" fill="#fff"/><circle cx="13.5" cy="7" r="1.8" fill="#fff"/><circle cx="17" cy="10" r="1.1" fill="#fff"/>`,
    diamond: (c, d) => cut(`<path d="M6.5 3.5h11l4.5 6L12 21.5 2 9.5z" fill="${c}"/>`) + `<path d="M2 9.5h20M9 3.5l-2.5 6L12 21.5l5.5-12L15 3.5M6.5 9.5L12 3.5l5.5 6" fill="none" stroke="${d}" stroke-width=".8" stroke-opacity=".8"/>`,
    gem: (c, d) => cut(`<circle cx="12" cy="12" r="9" fill="${c}"/>`) + `<path d="M12 3l3 6 6 3-6 3-3 6-3-6-6-3 6-3z" fill="${d}" opacity=".5"/><circle cx="9" cy="8.5" r="1.6" fill="#fff" opacity=".85"/>`,
    peace: (c, d) => cut(`<circle cx="12" cy="12" r="9.5" fill="${c}"/>`) + `<circle cx="12" cy="12" r="6.6" fill="none" stroke="${d}" stroke-width="1.8"/><path d="M12 5.4v13.2M12 12l-4.7 4.7M12 12l4.7 4.7" stroke="${d}" stroke-width="1.8"/>`,
    smiley: (c) => cut(`<circle cx="12" cy="12" r="9.5" fill="${c}"/>`) + `<ellipse cx="9" cy="9.5" rx="1.1" ry="1.7" fill="${INK}"/><ellipse cx="15" cy="9.5" rx="1.1" ry="1.7" fill="${INK}"/><path d="M7 13.5q5 5 10 0" fill="none" stroke="${INK}" stroke-width="1.4" stroke-linecap="round"/>`,
    alien: (c) => cut(`<path d="M12 2.5c5 0 8.5 3.5 8.5 8 0 5-5 11-8.5 11S3.5 15.5 3.5 10.5c0-4.5 3.5-8 8.5-8z" fill="${c}"/>`) + `<ellipse cx="8.4" cy="11.5" rx="2.6" ry="1.5" transform="rotate(30 8.4 11.5)" fill="${INK}"/><ellipse cx="15.6" cy="11.5" rx="2.6" ry="1.5" transform="rotate(-30 15.6 11.5)" fill="${INK}"/>`,
    paw: (c) => cut(`<g fill="${c}"><ellipse cx="12" cy="16" rx="5" ry="4.2"/><circle cx="5.5" cy="10.5" r="2.2"/><circle cx="9.5" cy="6.5" r="2.3"/><circle cx="14.5" cy="6.5" r="2.3"/><circle cx="18.5" cy="10.5" r="2.2"/></g>`),
    lock: (c, d) => `<path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="#fff" stroke-width="4"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="${d}" stroke-width="1.8"/>`
        + cut(`<path d="M12 22s-7.5-4.5-7.5-9.5a3.8 3.8 0 0 1 7.5-1.5 3.8 3.8 0 0 1 7.5 1.5c0 5-7.5 9.5-7.5 9.5z" fill="${c}"/>`) + `<circle cx="12" cy="14" r="1.2" fill="${INK}"/>`,
    key: (c) => cut(`<path fill-rule="evenodd" d="M7.5 3.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 2.3a2.2 2.2 0 1 0 0 4.4 2.2 2.2 0 0 0 0-4.4zM10.5 11l10 10-1.6 1.6-1.6-1.6-1.4 1.4-1.4-1.4 1.4-1.4-1.3-1.3-1.4 1.4L12 18.3l1.4-1.4L9 12.5z" fill="${c}"/>`),
    wing: (c) => cut(`<path d="M21 6C14 3 6 5 3 11c3-1 5-.5 6 0-2 1-3.5 3-3.5 5 2-1.5 4-1.8 5.5-1.2-1 1.4-1.2 3-.8 4.7C15 16 19 11 21 6z" fill="${c}"/>`),
    planet: (c, d) => cut(`<circle cx="12" cy="12" r="6.5" fill="${c}"/>`) + `<ellipse cx="12" cy="12.5" rx="11" ry="3.2" transform="rotate(-18 12 12)" fill="none" stroke="#fff" stroke-width="3"/><ellipse cx="12" cy="12.5" rx="11" ry="3.2" transform="rotate(-18 12 12)" fill="none" stroke="${d}" stroke-width="1.3"/>`,
    dice: (c) => cut(`<rect x="3.5" y="3.5" width="17" height="17" rx="3.5" fill="${c}"/>`) + [[8, 8], [16, 8], [12, 12], [8, 16], [16, 16]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.5" fill="${INK}"/>`).join(''),
    controller: (c, d) => cut(`<path d="M6 7h12a5 5 0 0 1 4.6 7l-1.4 3.6a2.5 2.5 0 0 1-4.3.6L15 16H9l-1.9 2.2a2.5 2.5 0 0 1-4.3-.6L1.4 14A5 5 0 0 1 6 7z" fill="${c}"/>`) + `<path d="M6.5 10v4M4.5 12h4" stroke="${INK}" stroke-width="1.5"/><circle cx="16.5" cy="10.5" r="1.1" fill="${d}"/><circle cx="18.5" cy="12.8" r="1.1" fill="${d}"/>`,
    cupcake: (c, d) => cut(`<path d="M5 13h14l-2 8H7z" fill="${d}"/><path d="M4 13a8 7 0 0 1 16 0z" fill="${c}"/>`) + `<circle cx="12" cy="5.4" r="1.6" fill="#ff4d6a"/>`,
    syrup: (c, d) => cut(`<rect x="7" y="7" width="10" height="15" rx="3" fill="${c}"/><rect x="9.5" y="2" width="5" height="6" rx="1.5" fill="${d}"/>`) + `<path d="M9 13h6" stroke="#fff" stroke-width="1.2" opacity=".8"/>`,
    angel: (c, d) => cut(`<path d="M12 9c-3-4-8-5-10-2 2 0 3 1 3 2-1.5 0-2.5 1.2-2.5 2.5 1.5-.8 3-.6 4 .3-.6 1-.5 2.2.2 3.2C9 14 11 12 12 9zM12 9c3-4 8-5 10-2-2 0-3 1-3 2 1.5 0 2.5 1.2 2.5 2.5-1.5-.8-3-.6-4 .3.6 1 .5 2.2-.2 3.2C15 14 13 12 12 9z" fill="${c}"/>`) + `<ellipse cx="12" cy="4" rx="4" ry="1.4" fill="none" stroke="${d}" stroke-width="1.2"/>`,
    syringe: (c, d) => cut(`<g transform="rotate(45 12 12)"><rect x="9" y="5" width="6" height="12" rx="1.5" fill="${c}"/><rect x="11.3" y="17" width="1.4" height="5" fill="${d}"/><rect x="8" y="2.5" width="8" height="2.5" rx="1" fill="${d}"/></g>`),
    candy: (c, d) => cut(`<circle cx="12" cy="12" r="5" fill="${c}"/><path d="M7 12L2 8.5v7zM17 12l5-3.5v7z" fill="${c}"/>`) + `<path d="M9.5 9l5 6M12 7.5l3 4.5" stroke="${d}" stroke-width="1.3"/>`,
    eyeball: (c, d) => cut(`<circle cx="12" cy="12" r="9.3" fill="#fff"/>`) + `<circle cx="12" cy="12" r="5" fill="${c}"/><circle cx="12" cy="12" r="2.4" fill="${INK}"/><circle cx="10.4" cy="10.4" r="1" fill="#fff"/><path d="M4 9l3 1.5M20 9l-3 1.5M5 16l2.8-1" stroke="${d}" stroke-width=".9"/>`,
    dino: (c, d) => cut(`<path d="M3 21v-4c0-3 2-5 5-5h2V8c0-3.3 2.2-5.5 5.5-5.5h1C19.5 2.5 21.5 4.5 21.5 7v1.5c0 1.4-1.1 2.5-2.5 2.5H16v3.5l2.2 1.2-.6 1.1-1.6-.8V21h-2.2v-3.5h-3.6V21H8v-3.4L5 21z" fill="${c}"/>`)
        + `<circle cx="17.6" cy="5.6" r="1" fill="${INK}"/><path d="M16.5 8.6h3.3" stroke="${INK}" stroke-width=".7"/><path d="M10 6l-1.6-.6M10 9l-1.8.2M11 3.6L9.8 2.2" stroke="${d}" stroke-width="1.6" stroke-linecap="round"/>`,
    ufo: (c, d) => cut(`<ellipse cx="12" cy="14" rx="10" ry="3.6" fill="${c}"/><path d="M7 13a5 5 0 0 1 10 0z" fill="${d}"/>`) + `<circle cx="7" cy="14.5" r=".9" fill="#ffe55c"/><circle cx="12" cy="15.4" r=".9" fill="#ffe55c"/><circle cx="17" cy="14.5" r=".9" fill="#ffe55c"/>`,
};

/** Fixed words for text stickers (never model text). */
const STICKER_WORDS = {
    rawr: 'RAWR',
    xd: 'XD',
    lt3: '<3',
    love: 'LOVE',
    kawaii: 'KAWAII',
    baka: 'BAKA',
    hearts3: '♡♡♡',
    scene: 'SCENE',
    emo: '★EMO★',
    meh: 'meh.',
};

for (const [id, word] of Object.entries(STICKER_WORDS)) {
    const size = word.length <= 2 ? 11 : word.length <= 4 ? 7.6 : word.length <= 5 ? 6.2 : 5.2;
    const safe = word.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    STICKER_ART[id] = (c, d) => `<text x="12" y="${12 + size * 0.36}" text-anchor="middle" font-family="'Arial Black','Impact',sans-serif" font-weight="900" font-size="${size}" fill="${c}" stroke="#fff" stroke-width="2.2" stroke-linejoin="round" paint-order="stroke">${safe}</text>`
        + `<text x="12" y="${12 + size * 0.36}" text-anchor="middle" font-family="'Arial Black','Impact',sans-serif" font-weight="900" font-size="${size}" fill="none" stroke="${d}" stroke-width=".35">${safe}</text>`;
}

export const STICKER_KINDS = Object.keys(STICKER_ART);
export const STICKER_TEXT_KINDS = Object.keys(STICKER_WORDS);

/**
 * Inner SVG of a sticker (24×24 box).
 * @param {string} kind
 * @param {string} c
 * @param {string} d
 */
export function stickerInner(kind, c, d) {
    return (STICKER_ART[kind] || STICKER_ART.star)(c, d);
}

/**
 * A whole sticker element.
 * @param {{ kind: string, color: string, color2: string }} s
 * @param {string} [attrs] extra attributes (class/style), already safe
 */
export function stickerSvg(s, attrs = '') {
    return `<svg viewBox="-1 -1 26 26" aria-hidden="true" ${attrs}>${stickerInner(s.kind, s.color, s.color2)}</svg>`;
}

// —— Charms (24×30 box, hanging from the top) ——

/** @type {Record<string, (c: string, d: string) => string>} */
const CHARM_ONLY = {
    strap: (c) => `<rect x="7" y="6" width="10" height="22" rx="3" fill="${c}"/>`,
    plush: (c) => `<circle cx="12" cy="18" r="8" fill="${c}"/><circle cx="6" cy="10" r="3.4" fill="${c}"/><circle cx="18" cy="10" r="3.4" fill="${c}"/><circle cx="9.3" cy="17" r="1.1" fill="${INK}"/><circle cx="14.7" cy="17" r="1.1" fill="${INK}"/>`,
    bell: (c, d) => `<path d="M12 8c-4 0-6 3-6 8v4h12v-4c0-5-2-8-6-8z" fill="${c}"/><circle cx="12" cy="23" r="2" fill="${d}"/>`,
    beads: (c, d) => `<circle cx="12" cy="9" r="3" fill="${c}"/><circle cx="12" cy="16" r="3.4" fill="${d}"/><circle cx="12" cy="23.5" r="3.8" fill="${c}"/>`,
    keychain: (c) => `<circle cx="12" cy="10" r="4" fill="none" stroke="${c}" stroke-width="2"/><rect x="8" y="14" width="8" height="12" rx="2" fill="${c}"/>`,
    pearls: () => Array.from({ length: 5 }, (_, i) => `<circle cx="12" cy="${5 + i * 5}" r="2.6" fill="#fbf6ee" stroke="#d8cdbd" stroke-width=".5"/>`).join(''),
    pompom: (c, d) => `<circle cx="12" cy="19" r="8" fill="${c}"/>${Array.from({ length: 10 }, (_, i) => `<circle cx="${12 + Math.cos(i) * 5}" cy="${19 + Math.sin(i * 1.3) * 5}" r="1.4" fill="${d}" opacity=".6"/>`).join('')}`,
    tassel: (c) => `<rect x="10" y="5" width="4" height="5" rx="1" fill="${c}"/>${Array.from({ length: 7 }, (_, i) => `<path d="M${10.5 + i * .5} 10L${7 + i * 1.7} 28" stroke="${c}" stroke-width="1.2"/>`).join('')}`,
    tamago: (c, d) => `<ellipse cx="12" cy="18" rx="8" ry="10" fill="${c}"/><rect x="7.5" y="13" width="9" height="7" rx="1.5" fill="#cfe3c4" stroke="${INK}" stroke-width=".6"/><circle cx="12" cy="16.5" r="1.6" fill="${INK}"/><circle cx="8.5" cy="24" r="1.2" fill="${d}"/><circle cx="12" cy="25" r="1.2" fill="${d}"/><circle cx="15.5" cy="24" r="1.2" fill="${d}"/>`,
    'safety-pin': () => `<path d="M8 6v19a4 4 0 0 0 8 0M16 25V8" fill="none" stroke="#cfd3d8" stroke-width="1.6"/><path d="M14.5 5h4v5h-4z" fill="#aab0b6"/>`,
    chain: (c) => Array.from({ length: 5 }, (_, i) => `<ellipse cx="12" cy="${5 + i * 5}" rx="${i % 2 ? 1.6 : 3}" ry="3" fill="none" stroke="${c}" stroke-width="1.5"/>`).join(''),
};

/** Sticker art reused as charm ornaments. */
const CHARM_FROM_STICKER = ['dino', 'bow', 'bear', 'bunny', 'skull', 'bat', 'star', 'heart', 'ghost', 'cat', 'moon', 'cross', 'pill', 'lightning', 'dice', 'key', 'lock', 'strawberry', 'cherry', 'crown', 'gem', 'mushroom', 'alien'];

export const CHARM_KINDS = ['none', ...Object.keys(CHARM_ONLY), ...CHARM_FROM_STICKER];

/**
 * Inner SVG of a charm ornament (24×30 box).
 * @param {string} kind
 * @param {string} c
 * @param {string} d
 */
export function charmInner(kind, c, d) {
    if (CHARM_ONLY[kind]) {
        return CHARM_ONLY[kind](c, d);
    }
    return `<g transform="translate(0 5)">${stickerInner(kind, c, d)}</g>`;
}

// —— Shell patterns (SVG tiles) ——

/** @param {string} svg */
function tile(svg, size) {
    // Single quotes: this ends up inside an inline style="…" attribute.
    return `url('data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27')}') 0 0 / ${size}px ${size}px`;
}

/**
 * @type {Record<string, (a: string, b: string) => string>} 20×20 tile bodies
 */
const TILE = {
    zebra: (a, b) => `<rect width="20" height="20" fill="${a}"/><path d="M0 3c4 1 6-2 10-1s5 3 10 2v3c-5 1-6-1-10-2S4 6 0 5zM0 12c3 0 5 2 9 1s7-2 11 0v2c-4-1-6 1-10 2S3 15 0 15z" fill="${b}"/>`,
    leopard: (a, b) => `<rect width="20" height="20" fill="${a}"/><g fill="none" stroke="${b}" stroke-width="1.6" stroke-linecap="round"><path d="M3 4c2-1 4 0 4 2M6 8c-2 1-4 0-4-2"/><path d="M13 3c2 0 3 2 2 3M16 7c-1 1-3 1-4 0"/><path d="M8 13c2-1 4 1 3 3M10 17c-2 0-3-1-3-3"/><path d="M16 13c1 1 1 3-1 3"/></g><g fill="${b}" opacity=".55"><circle cx="5" cy="5.8" r="1.2"/><circle cx="14" cy="5" r="1"/><circle cx="9" cy="15" r="1.1"/></g>`,
    checker: (a, b) => `<rect width="20" height="20" fill="${a}"/><path d="M0 0h10v10H0zM10 10h10v10H10z" fill="${b}"/>`,
    tartan: (a, b) => `<rect width="20" height="20" fill="${a}"/><g fill="${b}" opacity=".55"><rect x="3" width="5" height="20"/><rect y="3" width="20" height="5"/></g><g fill="${b}" opacity=".35"><rect x="13" width="1.5" height="20"/><rect y="13" width="20" height="1.5"/></g><g fill="#000" opacity=".25"><rect x="5" width=".8" height="20"/><rect y="5" width="20" height=".8"/></g>`,
    polka: (a, b) => `<rect width="20" height="20" fill="${a}"/><circle cx="5" cy="5" r="2.6" fill="${b}"/><circle cx="15" cy="15" r="2.6" fill="${b}"/>`,
    stripes: (a, b) => `<rect width="20" height="20" fill="${a}"/><path d="M-5 5L5-5h5L-5 10zM0 20L20 0v5L5 20zM15 20l5-5v5z" fill="${b}"/>`,
    hearts: (a, b) => `<rect width="20" height="20" fill="${a}"/><path d="M5 8s-3.2-2-3.2-4.2a1.8 1.8 0 0 1 3.2-1.1 1.8 1.8 0 0 1 3.2 1.1C8.2 6 5 8 5 8zM15 18s-3.2-2-3.2-4.2a1.8 1.8 0 0 1 3.2-1.1 1.8 1.8 0 0 1 3.2 1.1c0 2.2-3.2 4.2-3.2 4.2z" fill="${b}"/>`,
    stars: (a, b) => `<rect width="20" height="20" fill="${a}"/><path d="M5 1.5l1 2.3 2.5.3-1.9 1.7.5 2.5L5 7l-2.1 1.3.5-2.5L1.5 4.1 4 3.8zM15 11.5l1 2.3 2.5.3-1.9 1.7.5 2.5L15 17l-2.1 1.3.5-2.5-1.9-1.7 2.5-.3z" fill="${b}"/>`,
    lace: (a, b) => `<rect width="20" height="20" fill="${a}"/><g fill="none" stroke="${b}" stroke-width=".9"><circle cx="10" cy="10" r="5"/><circle cx="10" cy="10" r="2"/><path d="M0 0q5 4 10 0t10 0M0 20q5-4 10 0t10 0"/></g><g fill="${b}"><circle cx="0" cy="10" r="1.2"/><circle cx="20" cy="10" r="1.2"/><circle cx="10" cy="5" r=".7"/><circle cx="10" cy="15" r=".7"/><circle cx="5" cy="10" r=".7"/><circle cx="15" cy="10" r=".7"/></g>`,
    camo: (a, b) => `<rect width="20" height="20" fill="${a}"/><path d="M0 2c3-2 6 1 8 0s3 4 0 5-6 0-8-1zM11 9c3-1 7 0 8 3s-3 4-5 3-5-4-3-6zM2 14c2-1 5 0 5 2s-3 4-5 3-2-4 0-5z" fill="${b}"/><path d="M12 1c2 0 4 1 3 3s-4 1-4-1zM8 11c1 0 2 2 0 2s-2-2 0-2z" fill="#000" opacity=".3"/>`,
    hazard: (a, b) => `<rect width="20" height="20" fill="${a}"/><path d="M0 0h5L0 5zM0 10L10 0h5L0 15zM0 20L20 0v5L5 20zM10 20l10-10v5l-5 5z" fill="${b}"/>`,
    gingham: (a, b) => `<rect width="20" height="20" fill="${a}"/><g fill="${b}" opacity=".45"><rect width="10" height="20"/><rect width="20" height="10"/></g>`,
    argyle: (a, b) => `<rect width="20" height="20" fill="${a}"/><path d="M10 0l10 10-10 10L0 10z" fill="${b}"/><path d="M0 0l20 20M20 0L0 20" stroke="#fff" stroke-width=".5" opacity=".6"/>`,
    galaxy: (a, b) => `<defs><radialGradient id="g"><stop offset="0" stop-color="${b}" stop-opacity=".7"/><stop offset="1" stop-color="${a}" stop-opacity="0"/></radialGradient></defs><rect width="20" height="20" fill="${a}"/><circle cx="6" cy="7" r="7" fill="url(#g)"/><g fill="#fff"><circle cx="3" cy="3" r=".4"/><circle cx="15" cy="5" r=".6"/><circle cx="11" cy="14" r=".3"/><circle cx="17" cy="17" r=".5"/><circle cx="6" cy="16" r=".35"/></g>`,
    glitter: (a, b) => `<rect width="20" height="20" fill="${a}"/><g fill="${b}">${[[2, 3], [7, 1], [12, 4], [17, 2], [4, 9], [10, 8], [15, 11], [1, 14], [7, 16], [13, 17], [18, 15], [9, 12]].map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${0.35 + (i % 3) * 0.2}"/>`).join('')}</g><g fill="#fff">${[[5, 5], [14, 7], [3, 18], [16, 19]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".4"/>`).join('')}</g>`,
    carbon: (a, b) => `<rect width="20" height="20" fill="${a}"/><g fill="${b}" opacity=".6"><rect width="10" height="5"/><rect x="10" y="5" width="10" height="5"/><rect y="10" width="10" height="5"/><rect x="10" y="15" width="10" height="5"/></g>`,
    wood: (a, b) => `<rect width="20" height="20" fill="${a}"/><g fill="none" stroke="${b}" stroke-width=".7" opacity=".7"><path d="M0 3q5 2 10 0t10 0M0 8q6 1 12-1t8 1M0 13q4 2 9 0t11 1M0 18q6-1 10 1t10-1"/></g>`,
    screentone: (a, b) => `<rect width="20" height="20" fill="${a}"/><g fill="${b}">${[0, 5, 10, 15].flatMap((x) => [0, 5, 10, 15].map((y) => `<circle cx="${x + ((y / 5) % 2) * 2.5 + 1.25}" cy="${y + 2.5}" r="1"/>`)).join('')}</g>`,
    circuit: (a, b) => `<rect width="20" height="20" fill="${a}"/><g fill="none" stroke="${b}" stroke-width=".8"><path d="M0 5h6l3 3v12M20 12h-6l-3-3V0M14 20v-4h6"/></g><g fill="${b}"><circle cx="6" cy="5" r="1"/><circle cx="14" cy="12" r="1"/><circle cx="14" cy="16" r="1"/></g>`,
    crosses: (a, b) => `<rect width="20" height="20" fill="${a}"/><path d="M4.2 1h1.6v2.2H8v1.6H5.8V9H4.2V4.8H2V3.2h2.2zM14.2 11h1.6v2.2H18v1.6h-2.2V19h-1.6v-4.2H12v-1.6h2.2z" fill="${b}"/>`,
    bats: (a, b) => `<rect width="20" height="20" fill="${a}"/><path d="M5 6l-.8-1.4-.3 1C2.5 4.9 1 5.1 0 6.2c.8.5 1 1.3 1 2.2 1-.5 2-.5 2.8.5.5-.5 1-.5 1.2.2.3-.7.8-.7 1.3-.2.7-1 1.8-1 2.7-.5 0-.9.3-1.7 1-2.2-1-1.1-2.5-1.3-4-.6l-.2-1z" fill="${b}" transform="translate(5 6)"/>`,
    roses: (a, b) => `<rect width="20" height="20" fill="${a}"/><g fill="${b}"><circle cx="5" cy="5" r="2.6"/><circle cx="15" cy="15" r="2.6"/></g><g fill="none" stroke="#000" stroke-opacity=".35" stroke-width=".5"><path d="M5 4c1 0 1.3 1 .8 1.6M15 14c1 0 1.3 1 .8 1.6"/></g><g fill="#3c7a4a"><ellipse cx="8" cy="7" rx="1.5" ry=".6"/><ellipse cx="12" cy="17" rx="1.5" ry=".6"/></g>`,
};

/** Patterns that are plain CSS gradients rather than tiles. */
const GRADIENT_PATTERNS = {
    holo: () => 'linear-gradient(115deg, #ffb3e6, #b3f0ff 25%, #fff6b3 45%, #c9b3ff 65%, #b3ffd9 85%, #ffb3e6)',
    rainbow: () => 'linear-gradient(160deg, #ff5a6e, #ffb340 18%, #ffe55c 34%, #5ad67d 50%, #5aa8ff 68%, #b06bff 84%, #ff5ac8)',
    ombre: (a, b) => `linear-gradient(180deg, ${a}, ${b})`,
};

export const PATTERN_KINDS = ['solid', ...Object.keys(TILE), ...Object.keys(GRADIENT_PATTERNS)];

/**
 * CSS background layer for a pattern ('' for solid).
 * @param {{ kind: string, a: string, b: string, scale: number }} p
 */
export function patternCss(p) {
    if (!p || p.kind === 'solid') {
        return '';
    }
    if (GRADIENT_PATTERNS[p.kind]) {
        return GRADIENT_PATTERNS[p.kind](p.a, p.b);
    }
    const body = TILE[p.kind];
    if (!body) {
        return '';
    }
    const size = Math.round(14 * (p.scale || 1));
    return tile(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">${body(p.a, p.b)}</svg>`, size);
}

/**
 * The same pattern as an SVG <pattern> for previews.
 * @param {string} id
 * @param {{ kind: string, a: string, b: string, scale: number }} p
 * @param {number} unit tile size in preview units
 */
export function patternDef(id, p, unit = 8) {
    if (!p || p.kind === 'solid') {
        return '';
    }
    if (GRADIENT_PATTERNS[p.kind]) {
        const stops = p.kind === 'ombre'
            ? [[0, p.a], [1, p.b]]
            : (p.kind === 'holo'
                ? [[0, '#ffb3e6'], [0.25, '#b3f0ff'], [0.45, '#fff6b3'], [0.65, '#c9b3ff'], [0.85, '#b3ffd9'], [1, '#ffb3e6']]
                : [[0, '#ff5a6e'], [0.18, '#ffb340'], [0.34, '#ffe55c'], [0.5, '#5ad67d'], [0.68, '#5aa8ff'], [0.84, '#b06bff'], [1, '#ff5ac8']]);
        return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">${stops.map(([o, col]) => `<stop offset="${o}" stop-color="${col}"/>`).join('')}</linearGradient>`;
    }
    const body = TILE[p.kind];
    if (!body) {
        return '';
    }
    const u = unit * (p.scale || 1);
    return `<pattern id="${id}" width="${u}" height="${u}" patternUnits="userSpaceOnUse"><svg viewBox="0 0 20 20" width="${u}" height="${u}">${body(p.a, p.b).replace(/id="g"/g, `id="${id}g"`).replace(/url\(#g\)/g, `url(#${id}g)`)}</svg></pattern>`;
}

// —— Cover prints ——

/** @type {Record<string, string>} paths in a 100×100 box */
const COVER_ART = {
    heart: '<path d="M50 88S12 64 12 36a19 19 0 0 1 38-10 19 19 0 0 1 38 10c0 28-38 52-38 52z"/>',
    skull: '<path fill-rule="evenodd" d="M50 12c-19 0-34 14-34 32 0 10 5 19 13 24v12h8v8h8v-8h10v8h8v-8h8V68c8-5 13-14 13-24 0-18-15-32-34-32zM37 52a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm26 0a8 8 0 1 1 0-16 8 8 0 0 1 0 16z"/>',
    star: '<path d="M50 8l12 27 29 3-22 20 6 29-25-15-25 15 6-29L9 38l29-3z"/>',
    band: '<path d="M0 40h100v20H0z"/><path d="M0 35h100v2H0zM0 63h100v2H0z"/>',
    logo: '<circle cx="50" cy="50" r="22" fill="none" stroke-width="6"/><circle cx="50" cy="50" r="8"/>',
    wings: '<path d="M50 50C38 30 16 24 4 34c10 0 15 4 15 8-7 1-11 6-11 12 7-4 14-3 19 1-3 5-2 11 2 16 6-8 17-13 21-21zM50 50c12-20 34-26 46-16-10 0-15 4-15 8 7 1 11 6 11 12-7-4-14-3-19 1 3 5 2 11-2 16-6-8-17-13-21-21z"/>',
    crown: '<path d="M14 74l4-46 20 20 12-28 12 28 20-20 4 46z"/>',
    bow: '<path d="M50 50L14 26q-8 24 0 48zM50 50l36-24q8 24 0 48z"/><circle cx="50" cy="50" r="9"/>',
    moon: '<path d="M62 10a40 40 0 1 0 28 66A32 32 0 0 1 62 10z"/>',
    cross: '<path d="M42 10h16v24h22v16H58v40H42V50H20V34h22z"/>',
    lightning: '<path d="M58 6L18 58h28l-6 36 42-54H54z"/>',
    paw: '<ellipse cx="50" cy="66" rx="20" ry="17"/><circle cx="23" cy="44" r="9"/><circle cx="39" cy="28" r="9"/><circle cx="61" cy="28" r="9"/><circle cx="77" cy="44" r="9"/>',
};

export const COVER_ARTS = ['none', ...Object.keys(COVER_ART)];

/**
 * @param {string} art
 * @param {string} color
 */
export function coverArtSvg(art, color) {
    const body = COVER_ART[art];
    if (!body) {
        return '';
    }
    return `<svg class="pp-cover-art" viewBox="0 0 100 100" aria-hidden="true" fill="${color}" stroke="${color}">${body}</svg>`;
}

/** @param {string} art @param {string} color */
export function coverArtInner(art, color) {
    const body = COVER_ART[art];
    return body ? `<g fill="${color}" stroke="${color}">${body}</g>` : '';
}
