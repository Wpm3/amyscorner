export type ThemeName = 'cream' | 'light' | 'dark' | 'night';

export interface Theme {
  name: ThemeName;
  label: string;
  background: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  /** Background band behind the sentence currently being read. */
  highlight: string;
  /** Colour for every other clause inside the current sentence. */
  clauseAlt: string;
  /**
   * Colour for interrupting asides ("on a good day"). Text, clauseAlt and
   * clauseAside were validated together with the dataviz palette script
   * (colour-blind ΔE and normal-vision floor, all pairs) and reach ≥5.5:1
   * contrast on both the page and the current-sentence highlight.
   */
  clauseAside: string;
  /** Colour of the placeholder bars for unrevealed text. */
  placeholder: string;
  border: string;
  /**
   * Progress-meter fill. Validated with the dataviz six-checks script against
   * this theme's background (lightness band, chroma floor, ≥3:1 contrast);
   * the track is a lighter step of the same hue.
   */
  meter: string;
  statusBar: 'light' | 'dark';
}

// Every text/background pair meets WCAG AA (4.5:1) or better. No pure black on pure white.
export const THEMES: Record<ThemeName, Theme> = {
  cream: {
    name: 'cream', label: 'Cream',
    background: '#FAF6EC', surface: '#F1EBDC', text: '#2B2B2B', muted: '#6B6455', accent: '#2F6F8F',
    highlight: '#EFE3C4', clauseAlt: '#1F5A75', clauseAside: '#8A3F12', placeholder: '#E6DECB', border: '#E1D8C3', meter: '#2A6FA8', statusBar: 'dark',
  },
  light: {
    name: 'light', label: 'Light',
    background: '#FFFFFF', surface: '#F3F4F6', text: '#222222', muted: '#5F6368', accent: '#2B5FB3',
    highlight: '#EAF1FB', clauseAlt: '#1E4F99', clauseAside: '#8F3B0E', placeholder: '#E8EAED', border: '#E2E4E8', meter: '#2B5FB3', statusBar: 'dark',
  },
  dark: {
    name: 'dark', label: 'Dark',
    background: '#1C1C1E', surface: '#2A2A2D', text: '#E6E1D6', muted: '#A39E93', accent: '#8EC5E8',
    highlight: '#2F3236', clauseAlt: '#6FAEF0', clauseAside: '#F0A070', placeholder: '#323236', border: '#3A3A3E', meter: '#4C9BD9', statusBar: 'light',
  },
  night: {
    // Low blue light: warm amber text on very dark warm background.
    name: 'night', label: 'Night',
    background: '#16110B', surface: '#231B12', text: '#E8C9A0', muted: '#A88D6B', accent: '#E0A86A',
    highlight: '#2B2116', clauseAlt: '#A0B8F0', clauseAside: '#F07F6E', placeholder: '#2A2117', border: '#3A2D1F', meter: '#C27F2A', statusBar: 'light',
  },
};
