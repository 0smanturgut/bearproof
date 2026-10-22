// Render-only themes for each stage: the chart backdrop, grid, lighting and weather. Kept out of the
// simulation's content.js on purpose: nothing here can change a run.

export const THEMES = {
    chop: {
        bg: '#06080B',
        glow: 'rgba(22,224,138,0.05)',
        grid: '#0D141B',
        gridMajor: '#142029',
        cross: '#1E3040',
        label: '#2A4254',
        up: '#0B2A20',
        upWick: '#0E3528',
        down: '#2A0D16',
        downWick: '#35111C',
        ma: 'rgba(22,224,138,0.22)',
        vignette: 'rgba(2,3,5,0.82)',
        weather: null
    },
    bear_trap: {
        bg: '#0A0507',
        glow: 'rgba(255,59,92,0.06)',
        grid: '#180C11',
        gridMajor: '#241218',
        cross: '#3A1A23',
        label: '#4A2530',
        up: '#1E1A12',
        upWick: '#29231A',
        down: '#3A0C18',
        downWick: '#4A1220',
        ma: 'rgba(255,59,92,0.24)',
        vignette: 'rgba(8,1,3,0.85)',
        weather: 'alarm'
    },
    winter: {
        bg: '#04080E',
        glow: 'rgba(155,226,255,0.06)',
        grid: '#0C1822',
        gridMajor: '#132433',
        cross: '#1F3A50',
        label: '#2B4B63',
        up: '#0D2636',
        upWick: '#12324A',
        down: '#1B2233',
        downWick: '#232C42',
        ma: 'rgba(155,226,255,0.22)',
        vignette: 'rgba(1,4,9,0.84)',
        weather: 'snow'
    },
    // Market Eras: the Genesis Era is the map's own theme; each later era has its own (themeFor picks it)
    eras: {
        bg: '#030805',
        glow: 'rgba(60,255,120,0.06)',
        grid: '#0A1A10',
        gridMajor: '#0F2617',
        cross: '#17402A',
        label: '#22553A',
        up: '#0B2A18',
        upWick: '#0E3520',
        down: '#1E1410',
        downWick: '#2A1A14',
        ma: 'rgba(60,255,120,0.24)',
        vignette: 'rgba(0,4,1,0.84)',
        weather: null
    },
    eras_defi: {
        bg: '#0B0806',
        glow: 'rgba(255,180,70,0.06)',
        grid: '#1A130B',
        gridMajor: '#261C10',
        cross: '#3D2C18',
        label: '#5A4022',
        up: '#1E2A12',
        upWick: '#283A18',
        down: '#2E1610',
        downWick: '#3D1D14',
        ma: 'rgba(255,180,70,0.24)',
        vignette: 'rgba(8,4,1,0.82)',
        weather: null
    },
    eras_altseason: {
        bg: '#09040C',
        glow: 'rgba(255,70,220,0.07)',
        grid: '#170A1E',
        gridMajor: '#21102B',
        cross: '#3A1A4A',
        label: '#552A66',
        up: '#0A2A2C',
        upWick: '#0E3A3D',
        down: '#2E0C26',
        downWick: '#3D1233',
        ma: 'rgba(80,240,255,0.24)',
        vignette: 'rgba(5,1,8,0.84)',
        weather: null
    },
    // The Liquidity Pool: deep teal water, a cyan chart
    pool: {
        bg: '#030A0D',
        glow: 'rgba(90,230,240,0.06)',
        grid: '#0A1C22',
        gridMajor: '#10272F',
        cross: '#1A3E4A',
        label: '#24525F',
        up: '#0B2A2C',
        upWick: '#0E3A3D',
        down: '#1E1420',
        downWick: '#2A1A2C',
        ma: 'rgba(110,235,245,0.24)',
        vignette: 'rgba(0,5,8,0.84)',
        weather: null
    },
    eras_bear: {
        bg: '#0A0405',
        glow: 'rgba(255,50,60,0.07)',
        grid: '#1C0B0D',
        gridMajor: '#281013',
        cross: '#441A1F',
        label: '#5A242B',
        up: '#1E1A12',
        upWick: '#29231A',
        down: '#3E0C14',
        downWick: '#52121C',
        ma: 'rgba(255,59,92,0.26)',
        vignette: 'rgba(9,1,2,0.86)',
        weather: 'alarm'
    }
};

/** The theme a run is drawn in right now: its map's, or on Market Eras its current era's. */
export function themeFor(stageId, era = null) {
    if (era && era.id !== 'genesis' && THEMES[`${stageId}_${era.id}`])
        return THEMES[`${stageId}_${era.id}`];
    return THEMES[stageId] || THEMES.chop;
}
