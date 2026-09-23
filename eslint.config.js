// ESLint v9+ flat config.
// See https://eslint.org/docs/latest/use/configure/configuration-files

'use strict';

module.exports = [
    {
        ignores: [
            'node_modules/**',
            '_site/**',
            'coverage/**',
            'dist/**',
            '.wrangler/**',
            'docs/upstream/**'
        ]
    },
    {
        files: ['game/src/**/*.js', 'hq/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                // Browser globals used by the game runtime.
                window: 'readonly',
                document: 'readonly',
                navigator: 'readonly',
                location: 'readonly',
                console: 'readonly',
                requestAnimationFrame: 'readonly',
                cancelAnimationFrame: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                localStorage: 'readonly',
                sessionStorage: 'readonly',
                performance: 'readonly',
                AudioContext: 'readonly',
                webkitAudioContext: 'readonly',
                Image: 'readonly',
                HTMLElement: 'readonly',
                HTMLCanvasElement: 'readonly',
                CanvasRenderingContext2D: 'readonly',
                URL: 'readonly',
                URLSearchParams: 'readonly',
                fetch: 'readonly',
                FormData: 'readonly',
                Event: 'readonly',
                CustomEvent: 'readonly',
                KeyboardEvent: 'readonly',
                structuredClone: 'readonly',
                AbortController: 'readonly',
                OffscreenCanvas: 'readonly',
                crypto: 'readonly',
                matchMedia: 'readonly',
                alert: 'readonly',
                confirm: 'readonly',
                prompt: 'readonly'
            }
        },
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            'no-undef': 'error',
            semi: ['warn', 'always'],
            'prefer-const': 'warn',
            eqeqeq: ['warn', 'smart'],
            'no-console': 'off'
        }
    },
    {
        // The simulation must be bit-identical on every JS engine (see game/src/sim/dmath.js), or server-side
        // replay verification breaks. Engine-approximated Math functions, Math.random and clocks are banned.
        files: ['game/src/sim/**/*.js'],
        ignores: ['game/src/sim/bot.js', 'game/src/sim/input-codes.js'],
        rules: {
            'no-restricted-properties': [
                'error',
                ...[
                    'random',
                    'sin',
                    'cos',
                    'tan',
                    'atan',
                    'atan2',
                    'asin',
                    'acos',
                    'hypot',
                    'pow',
                    'exp',
                    'log',
                    'log2',
                    'log10',
                    'cbrt',
                    'sinh',
                    'cosh',
                    'tanh',
                    'expm1',
                    'log1p'
                ].map((property) => ({
                    object: 'Math',
                    property,
                    message:
                        'Use sim/dmath.js or sim.rng: the sim must be deterministic across engines.'
                })),
                { object: 'Date', property: 'now', message: 'No clocks in the sim: use sim.tick.' },
                {
                    object: 'performance',
                    property: 'now',
                    message: 'No clocks in the sim: use sim.tick.'
                }
            ],
            'no-restricted-globals': [
                'error',
                { name: 'document', message: 'The sim runs headless.' },
                { name: 'window', message: 'The sim runs headless.' }
            ]
        }
    },
    {
        files: ['game/server.js', 'game/scripts/**/*.js', '*.config.js', '*.cjs'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                // Node.js globals.
                process: 'readonly',
                Buffer: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                module: 'writable',
                require: 'readonly',
                exports: 'writable',
                global: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly'
            }
        },
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            'no-undef': 'error',
            semi: ['warn', 'always'],
            'prefer-const': 'warn',
            eqeqeq: ['warn', 'smart'],
            'no-console': 'off'
        }
    },
    {
        // Tests run under the Node `node:test` runner as ESM modules.
        files: ['game/test/**/*.js', 'worker/test/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                console: 'readonly',
                process: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                global: 'readonly',
                globalThis: 'readonly',
                structuredClone: 'readonly',
                performance: 'readonly'
            }
        },
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
            'no-undef': 'error',
            semi: ['warn', 'always'],
            'prefer-const': 'warn',
            eqeqeq: ['warn', 'smart'],
            'no-console': 'off'
        }
    }
];
