// BULL RUN palette ("Terminal Arcade"). Every sprite colour comes from here.
// Core tokens match the HQ CSS variables (docs/DECISIONS.md §2). Shades are
// added per family so each sprite stays at 3-5 colours plus the ink outline.
// Light source is top-left: *Light = lit edge, base = body, *Dark = shadow side.

export const PAL = {
    // Terminal
    ink: '#07090C', // outline + darkest
    panel: '#0E1217',
    grid: '#1B222B',
    text: '#E8EDF2',
    muted: '#7D8896',
    white: '#FFFFFF',

    // Bull (player, good things)
    bull: '#16E08A',
    bullDark: '#0A8F55',
    bullDeep: '#064D2F',
    bullLight: '#7DFFC0',
    horn: '#F4EBD2',
    hornDark: '#C2AE82',

    // Bear (enemies, danger)
    bear: '#FF3B5C',
    bearDark: '#B3173A',
    bearDeep: '#5E0A1F',
    bearLight: '#FF8FA3',

    // Gold (rewards, crowns, crits)
    gold: '#FFC53D',
    goldDark: '#B07A00',
    goldLight: '#FFE9A8',

    // Info (sparingly: ice, water, diamonds)
    info: '#46C8FF',
    infoDark: '#1C7DB8',
    infoLight: '#BDEEFF',

    // Bears (fur)
    brown: '#8A4B2A',
    brownDark: '#5C2E17',
    brownDeep: '#351809',
    brownLight: '#C27A4E',
    tan: '#E2AE72',

    // Final boss fur (dark brown / crimson)
    crimson: '#8E1030',
    crimsonDark: '#56091D',
    umber: '#3F2014',
    umberDark: '#24110A',
    umberLight: '#6B3A22',

    // Greys (masks, metal, bag holder)
    grey: '#A3ACB8',
    greyDark: '#636C79',
    greyDeep: '#3A414B',
    greyLight: '#DCE2EA',

    // FUD (storm clouds, doom)
    fud: '#8D7BA8',
    fudDark: '#5B4A73',
    fudDeep: '#372B48',
    fudLight: '#BBAAD4',

    // Winter boss
    ice: '#9FE6FF',
    iceDark: '#3F95C8',
    iceDeep: '#1D4F7A',
    iceLight: '#E8FBFF',

    // Paper
    paper: '#F5F1E6',
    paperDark: '#C8C0AC',

    // Hoods, shadows
    shadow: '#262C36',
    shadowDark: '#161A21',
    shadowLight: '#3E4655',

    // Royal robe (Rug Lord)
    robe: '#4B2A6B',
    robeDark: '#2C1742',
    robeLight: '#7446A0'
};

/** Resolve a palette key or a raw hex string to a hex colour. */
export function color(keyOrHex) {
    return PAL[keyOrHex] || keyOrHex;
}
