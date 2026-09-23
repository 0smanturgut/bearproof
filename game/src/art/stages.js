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
    }
};
