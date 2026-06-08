/**
 * Autocrawl chart theme — theme-aware (Paper light / Ink dark).
 *
 * ECharts cannot read CSS variables at runtime, so palette values are
 * baked literals. Two parallel maps for `paper` and `ink-dark` themes
 * mirror tokens.css. Helpers read `document.documentElement.dataset.theme`
 * to pick the active palette.
 *
 * Public surface preserved for existing consumers:
 *   - `tactical` object — kept as paper-default for any caller that
 *     does not use the theme-aware helpers yet.
 *   - `tooltipDefaults(isDark)` and `axisDefaults(isDark)` — now honor
 *     the boolean argument and return theme-appropriate styles.
 *   - New `getPalette()` and `currentThemeIsDark()` helpers.
 */

export interface ChartPalette {
  bg: string
  rule: string
  rule_strong: string
  surface: string
  ink: string
  ink_2: string
  ink_mute: string
  accent: string
  vermilion: string
  gold: string
  ok: string
  warn: string
  crit: string
  info: string
  font_mono: string
}

/* --- PAPER (light, default) palette --- */
const PAPER: ChartPalette = {
  bg: 'transparent',
  rule:        'rgba(20,18,16,0.10)',
  rule_strong: 'rgba(20,18,16,0.22)',
  surface:     '#FAF6EE',
  ink:         '#141210',
  ink_2:       '#3A342D',
  ink_mute:    '#7A7167',
  accent:      '#10302E',
  vermilion:   '#B5321A',
  gold:        '#9E7C2E',
  ok:          '#166347',
  warn:        '#9E7C2E',
  crit:        '#B5321A',
  info:        '#10302E',
  font_mono:   '"Geist Mono Variable", "Geist Mono", ui-monospace, monospace',
}

/* --- INK DARK palette (mirrors tokens.css ink-dark values) --- */
const INK_DARK: ChartPalette = {
  bg: 'transparent',
  rule:        'rgba(240,232,213,0.06)',
  rule_strong: 'rgba(240,232,213,0.14)',
  surface:     '#131F33',
  ink:         '#F0E8D5',
  ink_2:       '#AEB6C8',
  ink_mute:    '#7A849C',
  accent:      '#FFB840',
  vermilion:   '#FFB840',
  gold:        '#FF9230',
  ok:          '#22C55E',
  warn:        '#F59E0B',
  crit:        '#F04438',
  info:        '#4DD8E6',
  font_mono:   '"Geist Mono Variable", "Geist Mono", ui-monospace, monospace',
}

/** Read the active theme from <html data-theme>. SSR-safe; defaults to paper. */
export function currentThemeIsDark(): boolean {
  if (typeof document === 'undefined') return false
  return document.documentElement.dataset.theme === 'ink-dark'
}

/** Return the active palette object. */
export function getPalette(isDark = currentThemeIsDark()): ChartPalette {
  return isDark ? INK_DARK : PAPER
}

/* --- Back-compat `tactical` object —
 * Same shape as the legacy export so existing chart files keep working
 * unchanged. The .dark/.light pair fields are pre-resolved per theme.
 * Single-value fields use getters that resolve to the active theme at
 * access time, so chart consumers reading `tactical.accent` get the
 * right color after a theme toggle (combined with BaseChart's :key
 * remount). */
export const tactical = {
  bg: 'transparent',
  grid: {
    line: { dark: INK_DARK.rule, light: PAPER.rule },
  },
  text: {
    primary:   { dark: INK_DARK.ink,      light: PAPER.ink },
    secondary: { dark: INK_DARK.ink_2,    light: PAPER.ink_2 },
    muted:     { dark: INK_DARK.ink_mute, light: PAPER.ink_mute },
  },
  tooltip: {
    bg:     { dark: INK_DARK.surface,     light: PAPER.surface },
    border: { dark: INK_DARK.rule_strong, light: PAPER.rule_strong },
    text:   { dark: INK_DARK.ink,         light: PAPER.ink },
  },
  get series(): string[] { return seriesPalette() },
  get accent(): string   { return getPalette().accent },
  get ok(): string       { return getPalette().ok },
  get warn(): string     { return getPalette().warn },
  get crit(): string     { return getPalette().crit },
  get info(): string     { return getPalette().info },
}

export function tooltipDefaults(isDark = currentThemeIsDark()) {
  const p = getPalette(isDark)
  return {
    backgroundColor: p.surface,
    borderColor: p.rule_strong,
    borderWidth: 1,
    padding: [8, 12],
    textStyle: {
      color: p.ink,
      fontSize: 11,
      fontFamily: p.font_mono,
    },
    extraCssText: isDark
      ? 'border-radius: 6px; box-shadow: 0 1px 0 rgb(0 0 0 / 0.20), 0 8px 24px rgb(0 0 0 / 0.30);'
      : 'border-radius: 6px; box-shadow: 0 1px 0 rgb(20 18 16 / 0.04), 0 4px 12px rgb(20 18 16 / 0.06);',
  }
}

export function axisDefaults(isDark = currentThemeIsDark()) {
  const p = getPalette(isDark)
  return {
    axisLabel: {
      color: p.ink_mute,
      fontSize: 10,
      fontFamily: p.font_mono,
      fontFeatureSettings: 'tnum, lnum',
    },
    axisLine: { lineStyle: { color: p.rule_strong, width: 1 } },
    axisTick: { show: false },
    splitLine: { lineStyle: { color: p.rule, type: [1, 4] as [number, number] } },
  }
}

/** Series palette for chart categorical color cycling. */
export function seriesPalette(isDark = currentThemeIsDark()): string[] {
  const p = getPalette(isDark)
  return [p.accent, p.ink, p.ink_2, p.ink_mute, p.gold, p.vermilion]
}
