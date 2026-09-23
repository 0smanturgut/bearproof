# Assets ledger

Every asset we ship is listed here with its origin and license. If it isn't in this file, it doesn't ship.

## Fonts

| File                                                           | Font                                                      | License                                | Source                                              |
| -------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------- | --------------------------------------------------- |
| `hq/assets/fonts/jersey-10.woff2` (+ game copy)                | Jersey 10, © 2023 The Soft Type Project Authors           | SIL OFL 1.1 (`OFL-jersey-10.txt`)      | Google Fonts via `@fontsource/jersey-10` 5.3.0      |
| `hq/assets/fonts/jetbrains-mono-{400,700}.woff2` (+ game copy) | JetBrains Mono, © 2020 The JetBrains Mono Project Authors | SIL OFL 1.1 (`OFL-jetbrains-mono.txt`) | Google Fonts via `@fontsource/jetbrains-mono` 5.3.0 |

Fonts are self-hosted, so pages make no third-party requests. The OFL license text sits next to the files.

## Images and icons

| File                     | What                                       | Origin                                                         | License         |
| ------------------------ | ------------------------------------------ | -------------------------------------------------------------- | --------------- |
| `hq/assets/proof.svg`    | Proof avatar / favicon (16×16 pixel robot) | Drawn for this project as SVG rects                            | MIT (this repo) |
| `hq/assets/og.png`       | HQ social card 1200×630                    | Rendered from `scripts/og/hq-card.html` with Playwright        | MIT (this repo) |
| Game sprites (Build #1+) | Bull, bears, candles, pickups              | Procedural pixel art defined as ASCII grids in `game/src/art/` | MIT (this repo) |

## Audio

| What              | Origin                                                                       | License                            |
| ----------------- | ---------------------------------------------------------------------------- | ---------------------------------- |
| All SFX and music | Synthesised at runtime with Web Audio (`game/src/audio.js`). No audio files. | MIT (upstream code, modified here) |

## Inherited from upstream (`day-0`)

| What                                             | Status                                                                            |
| ------------------------------------------------ | --------------------------------------------------------------------------------- |
| Code (`src/`, `index.html`, `styles.css`)        | MIT, © 2024 Survivor Game. The copyright notice is kept in `LICENSE`.             |
| `docs/hero.svg`, `docs/og-card.svg`, screenshots | MIT. Only Build #0 ships them. Later builds don't.                                |
| Emoji icons in the UI                            | System emoji fonts render them; no files ship. Being replaced by our pixel icons. |

## Third-party marks

We do not use any third-party logo or likeness. The bull is a generic, original pixel character. It is not based on
Ansem, the "Black Bull" branding or any real person. "Vampire Survivors" is named only in the credit line, as the
genre inspiration of the upstream project.
