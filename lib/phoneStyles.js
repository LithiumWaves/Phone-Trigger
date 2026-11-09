/**
 * Style packs — 2010-era fashion and subculture looks for generated phones.
 * rollStyle(pack, seed) builds a complete, coherent phone from a pack, so variety does not
 * depend on the model (and the model can pick a pack and only override what it cares about).
 */

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   vibe: string,
 *   palettes: string[][],
 *   patterns: string[],
 *   patternOn?: string[],
 *   finishes: string[],
 *   keys: string[],
 *   bodies: string[],
 *   fonts: string[],
 *   uis: string[],
 *   rhinestones?: string[],
 *   pearls?: number,
 *   studs?: number,
 *   coverArts: string[],
 *   outers: string[],
 *   stickers: string[],
 *   density: [number, number],
 *   charms: string[],
 *   charmCount: [number, number],
 *   walls: string[],
 *   makers: string[],
 * }} StylePack
 */

/** palette: [shell, panel, keys, accent, screen] */
/** @type {StylePack[]} */
export const STYLE_PACKS = [
    {
        id: 'jirai', name: 'Jirai-kei', vibe: 'black and baby pink, lace, bows, hearts, bandages, sad-cute',
        palettes: [['#1a1418', '#f4b8c8', '#2a2026', '#ff8fb3', '#1d0f16'], ['#f7c6d4', '#2b2226', '#1d1719', '#2b2226', '#25141c'], ['#2a2026', '#e8a0b8', '#151013', '#ffd1df', '#1a0d13']],
        patterns: ['solid', 'lace', 'hearts', 'gingham', 'checker'], patternOn: ['cover', 'both'],
        finishes: ['gloss', 'pearl', 'velvet'], keys: ['candy', 'pearl', 'standard'], bodies: ['flip', 'flip', 'slider'],
        fonts: ['round', 'hand'], uis: ['lace', 'cute'], rhinestones: ['none', 'border', 'heart'], pearls: 0.5,
        coverArts: ['bow', 'heart', 'none'], outers: ['heart', 'round'],
        stickers: ['bow', 'heart', 'broken-heart', 'bandage', 'pill', 'ribbon', 'cross', 'bunny', 'hearts3', 'syringe', 'angel', 'lt3'], density: [5, 9],
        charms: ['bow', 'bunny', 'pearls', 'lock', 'cross', 'pill'], charmCount: [1, 3],
        walls: ['lace', 'hearts', 'gingham'], makers: ['Mirai', 'Lovely-Tel', 'Hikari'],
    },
    {
        id: 'yami', name: 'Yami-kawaii', vibe: 'pastel lilac and pink with medical motifs, pills, bandages, eyeballs, sick-cute',
        palettes: [['#d9c3f0', '#f6d6e8', '#f5eefa', '#a37ce0', '#2a1838'], ['#f2c4dc', '#cfe8f4', '#fdf2f8', '#7fb6e0', '#1f2338']],
        patterns: ['solid', 'polka', 'hearts', 'gingham'], patternOn: ['cover', 'both'],
        finishes: ['pearl', 'candy', 'gloss'], keys: ['candy', 'pearl'], bodies: ['flip', 'touch'],
        fonts: ['round', 'bubble'], uis: ['cute', 'bubble'], rhinestones: ['none', 'scatter'],
        coverArts: ['heart', 'cross', 'wings'], outers: ['heart', 'round'],
        stickers: ['pill', 'bandage', 'syringe', 'eyeball', 'broken-heart', 'bunny', 'cross', 'angel', 'cloud', 'hearts3'], density: [5, 9],
        charms: ['pill', 'bunny', 'cross', 'pompom', 'tamago'], charmCount: [1, 3],
        walls: ['polka', 'hearts', 'gingham'], makers: ['Mirai', 'Puni', 'Lovely-Tel'],
    },
    {
        id: 'scene', name: 'J-Scene', vibe: 'Japanese-leaning scene: neon rainbow on black, zebra and leopard print, bows, skulls, RAWR, XD, maximal',
        palettes: [['#111111', '#ff2fa8', '#151515', '#39ff6a', '#0b0b0b'], ['#ff2fa8', '#111111', '#151515', '#00e5ff', '#120012'], ['#00e5ff', '#111111', '#141414', '#ff2fa8', '#001418'], ['#39ff6a', '#111111', '#121212', '#ffe600', '#071407']],
        patterns: ['zebra', 'leopard', 'checker', 'stars', 'rainbow', 'hearts'], patternOn: ['both', 'cover', 'shell'],
        finishes: ['gloss', 'glitter', 'holo'], keys: ['neon', 'rainbow', 'candy'], bodies: ['flip', 'slider', 'bar'],
        fonts: ['bubble', 'pixel', 'mono'], uis: ['neon', 'bubble'], rhinestones: ['none', 'scatter', 'border'], studs: 0.3,
        coverArts: ['star', 'skull', 'bow', 'heart', 'lightning'], outers: ['star', 'heart', 'round'],
        stickers: ['rawr', 'xd', 'lt3', 'skull-bow', 'bow', 'star', 'lightning', 'rainbow', 'dice', 'controller', 'paw', 'heart', 'scene', 'sparkle', 'alien'], density: [8, 14],
        charms: ['bow', 'skull', 'star', 'dice', 'chain', 'pompom', 'lightning', 'bear'], charmCount: [2, 3],
        walls: ['zebra', 'leopard', 'stars', 'checker'], makers: ['Raikou', 'Kyorin', 'Neo-Tel'],
    },
    {
        id: 'scene-west', name: 'Scene', vibe: 'MySpace-era scene kid: neon green and hot pink on black, zebra and leopard, RAWR dinos, bows, checkerboard, studded belts',
        palettes: [['#111111', '#39ff14', '#0d0d0d', '#ff1493', '#050505'], ['#ff1493', '#111111', '#141414', '#39ff14', '#14000a'], ['#f4f4f4', '#ff1493', '#111111', '#39ff14', '#0a0a0a'], ['#00bfff', '#111111', '#121212', '#ff1493', '#00121a'], ['#39ff14', '#ff1493', '#111111', '#ffffff', '#041404']],
        patterns: ['zebra', 'leopard', 'checker', 'stars', 'hearts', 'zebra'], patternOn: ['both', 'cover', 'both'],
        finishes: ['gloss', 'glitter', 'candy'], keys: ['neon', 'neon', 'rainbow'], bodies: ['flip', 'slider', 'flip', 'bar'],
        fonts: ['bubble', 'pixel'], uis: ['neon', 'bubble'], rhinestones: ['none', 'scatter', 'border'], studs: 0.6,
        coverArts: ['star', 'skull', 'heart', 'bow'], outers: ['star', 'heart'],
        stickers: ['rawr', 'dino', 'xd', 'lt3', 'skull-bow', 'bow', 'star', 'heart', 'lightning', 'scene', 'paw', 'dice', 'controller', 'sparkle'], density: [9, 15],
        charms: ['dino', 'bow', 'skull', 'star', 'dice', 'chain', 'pompom'], charmCount: [2, 3],
        walls: ['zebra', 'leopard', 'checker', 'stars'], makers: ['Raikou', 'Neo-Tel', 'Kyorin'],
    },
    {
        id: 'emo', name: 'Emo', vibe: 'black with red or white, checkerboard, stars, broken hearts, band-shirt energy',
        palettes: [['#121212', '#2a2a2a', '#0e0e0e', '#d61f2c', '#0a0a0a'], ['#1b1b1b', '#e9e9e9', '#141414', '#ffffff', '#101010'], ['#5a0f16', '#151515', '#101010', '#ff4d5a', '#120507']],
        patterns: ['solid', 'checker', 'stars', 'stripes'], patternOn: ['cover', 'both'],
        finishes: ['matte', 'gloss', 'rubber'], keys: ['standard', 'neon', 'metal'], bodies: ['flip', 'slider', 'bar'],
        fonts: ['mono', 'hand'], uis: ['standard', 'terminal'], studs: 0.4,
        coverArts: ['star', 'skull', 'none'], outers: ['rect', 'star'],
        stickers: ['broken-heart', 'star', 'skull', 'emo', 'music', 'lightning', 'cross', 'meh', 'bat'], density: [3, 7],
        charms: ['star', 'safety-pin', 'chain', 'skull', 'lightning'], charmCount: [0, 2],
        walls: ['checker', 'stars', 'stripes'], makers: ['Kyorin', 'Raikou', 'Darkline'],
    },
    {
        id: 'gyaru', name: 'Gyaru', vibe: 'tanned glam: leopard, gold, hot pink, rhinestones everywhere, loud and rich',
        palettes: [['#f0b8d0', '#d4a64a', '#2a1a12', '#ffd36e', '#2a0f1e'], ['#d4a64a', '#2a1a12', '#1b120d', '#ff4fa3', '#1a1008'], ['#ff4fa3', '#f6e2b8', '#2b1620', '#ffd36e', '#260716']],
        patterns: ['leopard', 'glitter', 'solid', 'zebra'], patternOn: ['both', 'cover'],
        finishes: ['glitter', 'chrome', 'gloss'], keys: ['gem', 'metal', 'candy'], bodies: ['flip', 'slider'],
        fonts: ['round', 'bubble'], uis: ['bubble', 'cute'], rhinestones: ['border', 'scatter', 'heart', 'initial'], pearls: 0.4,
        coverArts: ['heart', 'crown', 'wings', 'none'], outers: ['heart', 'round'],
        stickers: ['gem', 'diamond', 'crown', 'heart', 'sparkle', 'love', 'cherry', 'butterfly', 'lt3'], density: [6, 11],
        charms: ['gem', 'crown', 'pearls', 'tassel', 'lock', 'cherry'], charmCount: [2, 3],
        walls: ['leopard', 'glitter', 'hearts'], makers: ['Glam-Tel', 'Hikari', 'Sanyo-Denki'],
    },
    {
        id: 'hime', name: 'Hime-gyaru', vibe: 'princess: white, blush pink and gold, roses, crowns, pearls, chandelier sparkle',
        palettes: [['#fbf3f1', '#f2c2cf', '#fff9f6', '#d4a64a', '#2b1520'], ['#f6d3dc', '#fbf3f1', '#fff4f6', '#c99a3c', '#26121b']],
        patterns: ['solid', 'lace', 'roses', 'glitter'], patternOn: ['cover', 'both'],
        finishes: ['pearl', 'glitter', 'gloss'], keys: ['pearl', 'gem'], bodies: ['flip', 'flip', 'touch'],
        fonts: ['serif', 'round'], uis: ['lace', 'cute'], rhinestones: ['border', 'heart', 'initial'], pearls: 0.8,
        coverArts: ['crown', 'heart', 'bow'], outers: ['heart', 'round'],
        stickers: ['crown', 'rose', 'bow', 'gem', 'diamond', 'heart', 'sparkle', 'butterfly'], density: [5, 9],
        charms: ['pearls', 'crown', 'bow', 'tassel', 'lock'], charmCount: [1, 3],
        walls: ['lace', 'roses', 'glitter'], makers: ['Lovely-Tel', 'Hikari', 'Sanyo-Denki'],
    },
    {
        id: 'decoden', name: 'Decoden', vibe: 'whipped-cream deco: pastel candy colours buried in rhinestones, sweets and pearls',
        palettes: [['#fde2ec', '#ffffff', '#fff3f7', '#ff8fb3', '#2a1220'], ['#dff3ff', '#ffffff', '#f3fbff', '#7ac6ff', '#0f2030'], ['#fff3c4', '#ffffff', '#fffbe8', '#ffb340', '#2a2010']],
        patterns: ['solid', 'glitter', 'polka'], patternOn: ['cover', 'both'],
        finishes: ['candy', 'glitter', 'pearl'], keys: ['gem', 'candy', 'pearl'], bodies: ['flip', 'slider'],
        fonts: ['bubble', 'round'], uis: ['bubble', 'cute'], rhinestones: ['border', 'scatter', 'heart'], pearls: 0.9,
        coverArts: ['heart', 'bow', 'crown'], outers: ['heart', 'round'],
        stickers: ['cupcake', 'strawberry', 'cherry', 'candy', 'gem', 'bow', 'heart', 'sparkle', 'syrup', 'bear'], density: [9, 15],
        charms: ['strawberry', 'cherry', 'pearls', 'bear', 'bow', 'gem'], charmCount: [2, 3],
        walls: ['polka', 'hearts', 'glitter'], makers: ['Puni', 'Lovely-Tel', 'Mirai'],
    },
    {
        id: 'sweet-lolita', name: 'Sweet Lolita', vibe: 'pastel pink and cream, lace, ribbons, strawberries, bunnies, tea party',
        palettes: [['#ffd6e5', '#fff6ef', '#fffaf6', '#ff8fb3', '#2b1620'], ['#e8f3ff', '#fff6ef', '#fffaf6', '#8ab8ff', '#141e30'], ['#fff1c9', '#ffd6e5', '#fffaf2', '#ff8fb3', '#2a2014']],
        patterns: ['lace', 'gingham', 'hearts', 'polka', 'solid'], patternOn: ['both', 'cover'],
        finishes: ['pearl', 'gloss'], keys: ['pearl', 'candy'], bodies: ['flip'],
        fonts: ['serif', 'round'], uis: ['lace', 'cute'], rhinestones: ['none', 'heart'], pearls: 0.7,
        coverArts: ['bow', 'heart', 'crown'], outers: ['heart', 'round'],
        stickers: ['bow', 'ribbon', 'strawberry', 'bunny', 'cupcake', 'heart', 'rose', 'cherry', 'crown'], density: [5, 9],
        charms: ['bow', 'bunny', 'strawberry', 'pearls', 'lock'], charmCount: [1, 3],
        walls: ['lace', 'gingham', 'polka'], makers: ['Lovely-Tel', 'Mirai'],
    },
    {
        id: 'goth-lolita', name: 'Gothic Lolita', vibe: 'black and burgundy, lace, crosses, bats, roses, candlelit elegance',
        palettes: [['#141014', '#6b1424', '#0f0c0f', '#b8283d', '#0d0709'], ['#3a0d18', '#141014', '#0e0b0d', '#d8c8b8', '#0c0608'], ['#1d1726', '#5a2a6b', '#110e16', '#c9a6d8', '#0e0a12']],
        patterns: ['lace', 'crosses', 'bats', 'roses', 'solid'], patternOn: ['cover', 'both'],
        finishes: ['velvet', 'gloss', 'matte'], keys: ['metal', 'standard', 'pearl'], bodies: ['flip', 'slider'],
        fonts: ['serif'], uis: ['lace', 'standard'], rhinestones: ['none', 'border'], pearls: 0.3,
        coverArts: ['cross', 'bow', 'wings', 'crown'], outers: ['rect', 'heart'],
        stickers: ['cross', 'bat', 'rose', 'bow', 'skull-bow', 'crown', 'moon', 'angel', 'key'], density: [4, 8],
        charms: ['cross', 'bat', 'key', 'lock', 'pearls', 'tassel'], charmCount: [1, 2],
        walls: ['lace', 'crosses', 'roses', 'bats'], makers: ['Darkline', 'Hikari'],
    },
    {
        id: 'visual-kei', name: 'Visual-kei', vibe: 'black, purple and silver, chains, roses, crosses, dramatic rock glam',
        palettes: [['#151018', '#7b3fa8', '#0f0c12', '#c0c6d0', '#0c0810'], ['#c0c6d0', '#151018', '#121014', '#7b3fa8', '#0e0a12'], ['#2a0a2e', '#c01e5a', '#120812', '#e8e0f0', '#0e040e']],
        patterns: ['solid', 'crosses', 'roses', 'tartan', 'carbon'], patternOn: ['cover', 'both'],
        finishes: ['chrome', 'metallic', 'gloss'], keys: ['metal', 'neon'], bodies: ['slider', 'flip', 'bar'],
        fonts: ['serif', 'mono'], uis: ['neon', 'standard'], studs: 0.5,
        coverArts: ['cross', 'wings', 'star', 'moon'], outers: ['rect', 'star'],
        stickers: ['rose', 'cross', 'wing', 'star', 'music', 'moon', 'lightning', 'key', 'skull'], density: [3, 7],
        charms: ['chain', 'cross', 'key', 'safety-pin', 'skull'], charmCount: [1, 3],
        walls: ['crosses', 'roses', 'galaxy'], makers: ['Darkline', 'Raikou'],
    },
    {
        id: 'decora', name: 'Decora', vibe: 'rainbow overload: every colour at once, covered edge to edge in cute stickers',
        palettes: [['#ff5ac8', '#5ad7ff', '#ffe55c', '#5ad67d', '#22143a'], ['#5ad7ff', '#ffe55c', '#ff8fb3', '#b06bff', '#10203a'], ['#ffe55c', '#ff5ac8', '#5ad67d', '#5aa8ff', '#2a2010']],
        patterns: ['rainbow', 'polka', 'stars', 'hearts', 'gingham'], patternOn: ['both', 'shell', 'cover'],
        finishes: ['gloss', 'candy', 'holo'], keys: ['rainbow', 'candy'], bodies: ['flip', 'bar', 'slider'],
        fonts: ['bubble', 'round'], uis: ['bubble', 'cute'], rhinestones: ['scatter', 'none'],
        coverArts: ['star', 'heart', 'paw', 'none'], outers: ['star', 'heart', 'round'],
        stickers: ['star', 'heart', 'rainbow', 'cloud', 'sun', 'flower', 'daisy', 'bear', 'bunny', 'cat', 'smiley', 'candy', 'cupcake', 'kawaii', 'paw', 'mushroom', 'music', 'ufo'], density: [12, 16],
        charms: ['pompom', 'bear', 'star', 'beads', 'tamago', 'mushroom', 'dice', 'upa'], charmCount: [3, 3],
        walls: ['polka', 'stars', 'rainbow'], makers: ['Puni', 'Neo-Tel', 'Kyorin'],
    },
    {
        id: 'fairy-kei', name: 'Fairy-kei', vibe: 'soft 80s pastels: mint, lavender, baby blue, clouds, stars, unicorn-ish dreams',
        palettes: [['#c8f0e0', '#e0d0f8', '#f4fbff', '#8ab8ff', '#1a2038'], ['#e0d0f8', '#ffd6e5', '#fbf8ff', '#7fe0c0', '#201a38'], ['#cfe6ff', '#fff1c9', '#f8fbff', '#ff9cc8', '#14203a']],
        patterns: ['stars', 'polka', 'holo', 'solid'], patternOn: ['both', 'cover'],
        finishes: ['holo', 'pearl', 'candy'], keys: ['pearl', 'candy', 'rainbow'], bodies: ['flip', 'slider', 'touch'],
        fonts: ['round', 'bubble'], uis: ['cute', 'bubble'], rhinestones: ['none', 'scatter'],
        coverArts: ['star', 'moon', 'heart'], outers: ['star', 'round'],
        stickers: ['star', 'cloud', 'rainbow', 'moon', 'sparkle', 'planet', 'heart', 'butterfly', 'ufo', 'candy'], density: [6, 10],
        charms: ['star', 'moon', 'pompom', 'beads', 'tamago'], charmCount: [1, 3],
        walls: ['stars', 'polka', 'galaxy'], makers: ['Puni', 'Mirai'],
    },
    {
        id: 'mori', name: 'Mori-kei', vibe: 'forest girl: cream, moss, brown, wood grain, mushrooms, flowers, quiet',
        palettes: [['#e8dcc4', '#7a8c5a', '#f4ecdc', '#a0643c', '#20241a'], ['#8a6a4a', '#e8dcc4', '#f2e8d4', '#6a8a4a', '#1e1a14'], ['#b8c4a0', '#e8dcc4', '#f6f0e2', '#8a5a3c', '#1c2016']],
        patterns: ['wood', 'solid', 'gingham'], patternOn: ['cover', 'both'],
        finishes: ['matte', 'velvet'], keys: ['standard', 'pearl'], bodies: ['flip', 'bar'],
        fonts: ['serif', 'hand'], uis: ['standard', 'lace'],
        coverArts: ['none', 'paw'], outers: ['round', 'rect'],
        stickers: ['mushroom', 'flower', 'daisy', 'bear', 'cloud', 'sun', 'butterfly', 'paw'], density: [2, 5],
        charms: ['mushroom', 'bear', 'tassel', 'beads', 'bell'], charmCount: [1, 2],
        walls: ['wood', 'gingham', 'polka'], makers: ['Kinoko', 'Sanyo-Denki'],
    },
    {
        id: 'punk', name: 'Punk', vibe: 'red tartan, black, safety pins, studs, anarchy stars, DIY sharpie',
        palettes: [['#b3121e', '#121212', '#0f0f0f', '#f2f2f2', '#0c0606'], ['#121212', '#b3121e', '#101010', '#ffe600', '#0a0a0a'], ['#1d3a1d', '#121212', '#0f0f0f', '#ff3030', '#081008']],
        patterns: ['tartan', 'checker', 'hazard', 'solid'], patternOn: ['both', 'cover'],
        finishes: ['matte', 'rubber', 'gloss'], keys: ['metal', 'standard'], bodies: ['bar', 'flip', 'slider'],
        fonts: ['mono', 'hand'], uis: ['terminal', 'standard'], studs: 0.8,
        coverArts: ['star', 'skull', 'lightning', 'cross'], outers: ['rect', 'star'],
        stickers: ['skull', 'star', 'lightning', 'cross', 'peace', 'music', 'meh', 'broken-heart'], density: [4, 8],
        charms: ['safety-pin', 'chain', 'skull', 'key'], charmCount: [1, 3],
        walls: ['tartan', 'checker', 'hazard'], makers: ['Raikou', 'Darkline', 'Kyorin'],
    },
    {
        id: 'cyber', name: 'Cyber-goth', vibe: 'black with toxic green or UV, hazard stripes, circuits, rave and industrial',
        palettes: [['#0d0d0d', '#39ff14', '#0a0a0a', '#39ff14', '#020a02'], ['#0d0d0d', '#ff00d4', '#0a0a0a', '#00f0ff', '#08020a'], ['#1a1a1a', '#ffe600', '#0d0d0d', '#ffe600', '#0a0a00']],
        patterns: ['hazard', 'circuit', 'carbon', 'solid'], patternOn: ['both', 'cover', 'shell'],
        finishes: ['rubber', 'gloss', 'chrome'], keys: ['neon'], bodies: ['bar', 'slider', 'touch'],
        fonts: ['pixel', 'mono'], uis: ['neon', 'terminal'], studs: 0.3,
        coverArts: ['lightning', 'logo', 'star'], outers: ['rect'],
        stickers: ['lightning', 'skull', 'eyeball', 'alien', 'ufo', 'controller', 'planet', 'syringe'], density: [3, 7],
        charms: ['chain', 'lightning', 'skull', 'dice'], charmCount: [0, 2],
        walls: ['circuit', 'hazard', 'carbon'], makers: ['Neo-Tel', 'Raikou'],
    },
    {
        id: 'otaku', name: 'Otaku', vibe: 'anime fan: manga screentone, idol pink, cat ears, game and star stickers, itasha energy',
        palettes: [['#f2f2f2', '#ff6fa8', '#ffffff', '#4aa8ff', '#16182a'], ['#4aa8ff', '#ffe55c', '#f2f8ff', '#ff6fa8', '#0f1830'], ['#ff6fa8', '#ffffff', '#fff3f8', '#7a5cff', '#200a18']],
        patterns: ['screentone', 'stars', 'solid', 'hearts'], patternOn: ['cover', 'both'],
        finishes: ['gloss', 'holo'], keys: ['candy', 'standard', 'rainbow'], bodies: ['flip', 'slider', 'touch'],
        fonts: ['round', 'bubble', 'pixel'], uis: ['cute', 'bubble'], rhinestones: ['none', 'scatter'],
        coverArts: ['star', 'heart', 'paw', 'lightning'], outers: ['star', 'heart', 'round'],
        stickers: ['cat', 'star', 'controller', 'heart', 'sparkle', 'kawaii', 'baka', 'paw', 'music', 'alien', 'ufo'], density: [6, 11],
        charms: ['upa', 'metal-upa', 'cat', 'star', 'tamago', 'dice', 'bunny', 'bear'], charmCount: [2, 3],
        walls: ['screentone', 'stars', 'hearts'], makers: ['Akiba-Tel', 'Neo-Tel', 'Kyorin'],
    },
    {
        id: 'y2k', name: 'Y2K chrome', vibe: 'iridescent silver, holo, butterflies, translucent candy plastic, futurist pop',
        palettes: [['#d8dde6', '#b8c4f0', '#eef1f6', '#ff7ad9', '#141a28'], ['#c9b8ff', '#d8dde6', '#f2eeff', '#5ad7ff', '#16122a'], ['#9ee7ff', '#d8dde6', '#eefaff', '#ff7ad9', '#0c1a24']],
        patterns: ['holo', 'solid', 'glitter', 'ombre'], patternOn: ['both', 'shell'],
        finishes: ['chrome', 'holo', 'candy'], keys: ['metal', 'candy', 'pearl'], bodies: ['flip', 'slider', 'bar'],
        fonts: ['bubble', 'mono'], uis: ['bubble', 'neon'], rhinestones: ['none', 'scatter'],
        coverArts: ['wings', 'star', 'logo', 'heart'], outers: ['round', 'star'],
        stickers: ['butterfly', 'sparkle', 'star', 'planet', 'heart', 'lt3', 'smiley', 'ufo', 'cherry'], density: [4, 8],
        charms: ['star', 'beads', 'cherry', 'gem', 'heart'], charmCount: [1, 3],
        walls: ['galaxy', 'glitter', 'stars'], makers: ['Neo-Tel', 'Hikari', 'Mirai'],
    },
    {
        id: 'mascot', name: 'Kawaii mascot', vibe: 'one beloved character everywhere: soft colours, plush charms, round shapes',
        palettes: [['#fff3c4', '#ffd6e5', '#fffaf0', '#ff8f6b', '#2a2010'], ['#ffe0ec', '#cfe6ff', '#fff8fb', '#ff6f91', '#2a1420'], ['#d8f5e0', '#fff3c4', '#f8fff8', '#4ab878', '#14281a']],
        patterns: ['solid', 'polka', 'hearts'], patternOn: ['cover'],
        finishes: ['gloss', 'candy', 'matte'], keys: ['candy', 'pearl'], bodies: ['flip', 'bar'],
        fonts: ['round', 'bubble'], uis: ['cute', 'bubble'],
        coverArts: ['paw', 'heart', 'bow'], outers: ['round', 'heart'],
        stickers: ['bear', 'bunny', 'cat', 'paw', 'heart', 'cupcake', 'flower', 'smiley'], density: [3, 7],
        charms: ['upa', 'plush', 'bear', 'bunny', 'cat', 'bell'], charmCount: [2, 3],
        walls: ['polka', 'hearts', 'gingham'], makers: ['Puni', 'Mirai'],
    },
    {
        id: 'sporty', name: 'Sporty', vibe: 'rubber bumpers, racing stripes, bright team colours, tough and clean',
        palettes: [['#1f5fd6', '#f2f2f2', '#1a1a1a', '#ffe600', '#06102a'], ['#f25c05', '#1a1a1a', '#151515', '#ffffff', '#1a0a00'], ['#11a84a', '#f2f2f2', '#141414', '#ffffff', '#04140a']],
        patterns: ['stripes', 'solid', 'carbon'], patternOn: ['shell', 'both'],
        finishes: ['rubber', 'matte'], keys: ['standard', 'metal'], bodies: ['bar', 'slider', 'touch'],
        fonts: ['mono'], uis: ['standard'],
        coverArts: ['band', 'logo', 'lightning'], outers: ['rect'],
        stickers: ['lightning', 'star', 'music', 'dice'], density: [0, 3],
        charms: ['none', 'keychain', 'strap'], charmCount: [0, 1],
        walls: ['stripes', 'carbon'], makers: ['Kyorin', 'Sanyo-Denki', 'Raikou'],
    },
    {
        id: 'rugged', name: 'Rugged outdoor', vibe: 'military green and black rubber, camo, tough armour, practical',
        palettes: [['#4a5a32', '#2a2a24', '#1d1d18', '#d9b44a', '#0f120a'], ['#6a5a3a', '#2a2a24', '#1d1d18', '#ff7a1a', '#14100a'], ['#2a2a24', '#4a5a32', '#18181a', '#9acd32', '#0a0c08']],
        patterns: ['camo', 'carbon', 'solid'], patternOn: ['shell', 'both'],
        finishes: ['rubber', 'matte'], keys: ['standard', 'metal'], bodies: ['bar', 'flip'],
        fonts: ['mono', 'pixel'], uis: ['terminal', 'standard'], studs: 0.4,
        coverArts: ['band', 'logo', 'none'], outers: ['rect'],
        stickers: ['star', 'skull', 'lightning', 'key'], density: [0, 3],
        charms: ['keychain', 'chain', 'key', 'none'], charmCount: [0, 1],
        walls: ['camo', 'carbon'], makers: ['Kyorin', 'Toughline'],
    },
    {
        id: 'business', name: 'Business', vibe: 'salaryman: gunmetal, navy or champagne, no stickers, perfectly plain',
        palettes: [['#4a4f57', '#2b2e33', '#1c1e21', '#9ec4ff', '#0a1220'], ['#1f2a44', '#3a4256', '#16181c', '#c9d6ff', '#0a0e1a'], ['#cbb994', '#4a4f57', '#1c1e21', '#ffe4a8', '#151208']],
        patterns: ['solid', 'carbon'], patternOn: ['shell'],
        finishes: ['metallic', 'matte'], keys: ['metal', 'standard'], bodies: ['flip', 'bar', 'touch'],
        fonts: ['mono'], uis: ['standard'],
        coverArts: ['none', 'logo'], outers: ['rect'],
        stickers: [], density: [0, 0],
        charms: ['none', 'strap'], charmCount: [0, 1],
        walls: ['carbon', 'gingham'], makers: ['Sanyo-Denki', 'Kyorin', 'Hikari'],
    },
    {
        id: 'scientist', name: 'Lab / scientist', vibe: 'clinical white and steel blue, tidy, one or two nerdy stickers',
        palettes: [['#eef1f4', '#9fb4c8', '#f6f8fa', '#3a7bd5', '#0c1424'], ['#c8d3de', '#eef1f4', '#f2f5f8', '#d0393e', '#141820'], ['#a83a3a', '#e8e8ea', '#f2f2f4', '#3a7bd5', '#141016']],
        patterns: ['solid', 'circuit', 'screentone'], patternOn: ['cover'],
        finishes: ['matte', 'gloss', 'metallic'], keys: ['standard', 'pearl'], bodies: ['flip', 'slider', 'touch'],
        fonts: ['mono'], uis: ['terminal', 'standard'],
        coverArts: ['none', 'logo'], outers: ['rect', 'round'],
        stickers: ['planet', 'lightning', 'key', 'star', 'eyeball', 'ufo'], density: [0, 3],
        charms: ['none', 'keychain', 'dice', 'chain', 'metal-upa'], charmCount: [0, 1],
        walls: ['circuit', 'screentone', 'gingham'], makers: ['Sanyo-Denki', 'Lab-Tech'],
    },
    {
        id: 'retro', name: 'Retro cream', vibe: 'old-fashioned cream and mint with chrome trim, a grandpa phone done stylishly',
        palettes: [['#efe6cf', '#9fc4b0', '#f8f2e2', '#c4504a', '#1c1a14'], ['#9fc4b0', '#efe6cf', '#f6f0e0', '#2a5a6a', '#141c18'], ['#e8c87a', '#6a4a2a', '#f6ecd4', '#6a4a2a', '#1a140a']],
        patterns: ['solid', 'wood', 'gingham', 'argyle'], patternOn: ['shell', 'cover'],
        finishes: ['gloss', 'matte'], keys: ['pearl', 'standard'], bodies: ['flip', 'bar'],
        fonts: ['serif', 'mono'], uis: ['standard'],
        coverArts: ['none', 'band'], outers: ['round', 'rect'],
        stickers: ['flower', 'daisy', 'music', 'sun'], density: [0, 3],
        charms: ['bell', 'tassel', 'none', 'beads'], charmCount: [0, 2],
        walls: ['argyle', 'gingham', 'wood'], makers: ['Sanyo-Denki', 'Hikari'],
    },
    {
        id: 'plain', name: 'Plain', vibe: 'an ordinary phone in a normal colour, maybe one sticker',
        palettes: [['#c8ccd2', '#5a5e66', '#1c1e21', '#9ec4ff', '#0a1424'], ['#1c1e21', '#4a4e56', '#141618', '#9ec4ff', '#081018'], ['#d03a3a', '#5a5e66', '#1c1e21', '#ffd0d0', '#180a0a'], ['#2a6ad0', '#5a5e66', '#1c1e21', '#c9e0ff', '#08142a'], ['#f2f2f2', '#9a9ea6', '#2a2c30', '#3a7bd5', '#0c1424']],
        patterns: ['solid'], patternOn: ['shell'],
        finishes: ['gloss', 'matte', 'metallic'], keys: ['standard'], bodies: ['flip', 'flip', 'bar', 'slider', 'touch'],
        fonts: ['mono', 'round'], uis: ['standard'],
        coverArts: ['none'], outers: ['rect', 'round'],
        stickers: ['star', 'heart', 'smiley', 'cat'], density: [0, 1],
        charms: ['none', 'strap', 'keychain'], charmCount: [0, 1],
        walls: ['gingham', 'polka', 'stripes'], makers: ['Sanyo-Denki', 'Kyorin', 'Hikari', 'Mirai'],
    },
];

export const STYLE_IDS = STYLE_PACKS.map((p) => p.id);

/** @param {string} id */
export function getStylePack(id) {
    return STYLE_PACKS.find((p) => p.id === id) || null;
}

/** @param {number} seed */
export function seeded(seed) {
    let s = (seed >>> 0) || 1;
    return () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
    };
}

/** @param {string} str */
export function hashSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

/**
 * Where stickers may go on each side (percent boxes). Front stickers stay off the screen.
 * @type {Record<string, Array<[number, number, number, number]>>} [x0, y0, x1, y1]
 */
const ZONES = {
    cover: [[10, 8, 90, 92]],
    back: [[10, 8, 90, 92]],
    front: [[6, 2, 94, 9], [6, 92, 94, 98], [2, 12, 7, 88], [93, 12, 98, 88]],
    base: [[6, 88, 94, 98], [6, 2, 94, 8]],
};

/**
 * Scatter stickers without heavy overlap.
 * @param {() => number} rnd
 * @param {string[]} kinds
 * @param {number} count
 * @param {string[]} colors
 * @param {string[]} sides
 */
export function placeStickers(rnd, kinds, count, colors, sides) {
    /** @type {Array<{ kind: string, color: string, color2: string, side: string, x: number, y: number, rot: number, scale: number }>} */
    const out = [];
    if (!kinds.length || count <= 0) {
        return out;
    }
    const pick = (list) => list[Math.floor(rnd() * list.length)];
    for (let i = 0; i < count; i++) {
        const side = sides[Math.floor(rnd() * sides.length)];
        const zones = ZONES[side] || ZONES.cover;
        const scale = side === 'front' || side === 'base' ? 0.6 + rnd() * 0.3 : 0.7 + rnd() * 0.8;
        let best = null;
        for (let tries = 0; tries < 14; tries++) {
            const [x0, y0, x1, y1] = pick(zones);
            const x = x0 + rnd() * (x1 - x0);
            const y = y0 + rnd() * (y1 - y0);
            const near = out.filter((s) => s.side === side)
                .reduce((m, s) => Math.min(m, Math.hypot(s.x - x, (s.y - y) * 0.6)), 999);
            if (!best || near > best.near) {
                best = { x, y, near };
            }
            if (near > 22 * scale) {
                break;
            }
        }
        const c1 = pick(colors);
        let c2 = pick(colors);
        if (c2 === c1) {
            c2 = colors[(colors.indexOf(c1) + 1) % colors.length];
        }
        out.push({
            kind: pick(kinds),
            color: c1,
            color2: c2,
            side,
            x: Math.round(best.x * 10) / 10,
            y: Math.round(best.y * 10) / 10,
            rot: Math.round((rnd() - 0.5) * 50),
            scale: Math.round(scale * 100) / 100,
        });
    }
    return out;
}

/**
 * Roll a complete phone in a style. The result still goes through validateSpec.
 * @param {string} packId
 * @param {number} seed
 * @param {{ body?: string }} [opts]
 */
export function rollStyle(packId, seed, opts = {}) {
    const pack = getStylePack(packId) || STYLE_PACKS[STYLE_PACKS.length - 1];
    const rnd = seeded(seed);
    const pick = (list) => list[Math.floor(rnd() * list.length)];
    const range = ([a, b]) => a + Math.floor(rnd() * (b - a + 1));
    const pal = pick(pack.palettes);
    const [shell, panel, keys, accent, screen] = pal;
    const body = opts.body || pick(pack.bodies);
    const patternKind = pick(pack.patterns);
    const coverSide = body === 'flip' ? 'cover' : 'back';
    const sides = body === 'touch' ? [coverSide, coverSide, 'front'] : [coverSide, coverSide, coverSide, 'front', 'base'];
    const charmKinds = pack.charms.filter((k) => k !== 'none');
    const nCharms = charmKinds.length ? range(pack.charmCount) : 0;
    const colors = [...new Set([accent, panel, shell, '#ffffff', ...pal])];
    return {
        v: 2,
        aesthetic: pack.id,
        maker: pick(pack.makers),
        model: `${pick(['N', 'P', 'SH', 'F', 'SO', 'K', 'W', 'D'])}${Math.floor(100 + rnd() * 900)}${pick(['i', 'iS', 'X', 'SE', '', 'μ'])}`,
        body,
        colors: { shell, panel, keys, accent },
        finish: pick(pack.finishes),
        crown: 'none',
        pattern: {
            kind: patternKind,
            a: shell,
            b: patternKind === 'zebra' || patternKind === 'leopard' ? pick([panel, '#111111', accent]) : pick([accent, panel]),
            scale: Math.round((0.7 + rnd() * 0.8) * 100) / 100,
            on: pick(pack.patternOn || ['both']),
        },
        keys: { style: pick(pack.keys), glow: pack.id === 'scene-west' || (pack.keys.includes('neon') && rnd() < 0.7) },
        deco: {
            rhinestones: pick(pack.rhinestones || ['none']),
            gem: pick([accent, '#ffffff', panel]),
            pearls: rnd() < (pack.pearls || 0),
            studs: rnd() < (pack.studs || 0),
        },
        outer: { shape: pick(pack.outers), tint: screen },
        cover: { art: pick(pack.coverArts), color: pick([accent, panel]) },
        lcd: { bg: screen, accent, font: pick(pack.fonts), ui: pick(pack.uis) },
        wallpaper: { kind: 'pattern', a: screen, b: accent, pattern: pick(pack.walls), angle: Math.floor(rnd() * 360), preset: 'night' },
        charms: Array.from({ length: nCharms }, () => ({ kind: pick(charmKinds), color: pick(colors), label: '' })),
        stickers: placeStickers(rnd, pack.stickers, range(pack.density), colors, sides),
        blurb: `${pack.name}: ${pack.vibe}.`,
    };
}
