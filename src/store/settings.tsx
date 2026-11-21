import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { FontChoice } from '../theme/fonts';
import { THEMES, type Theme, type ThemeName } from '../theme/themes';
import { getJson, setJson } from './storage';

export type UnrevealedStyle = 'faded' | 'bars' | 'hidden';
export type ClauseMode = 'off' | 'tint' | 'cascade';
export type TapLayout = 'zones' | 'anywhere';

export interface Settings {
  theme: ThemeName;
  font: FontChoice;
  fontSize: number;
  lineHeight: number;
  extraSpacing: boolean;
  /** How text that has not been revealed yet is drawn. */
  unrevealed: UnrevealedStyle;
  /** Opacity of sentences already read (1 = no dimming). */
  pastOpacity: number;
  highlightCurrent: boolean;
  clauseMode: ClauseMode;
  /** Bold the first part of each word ("bionic"-style). Opt-in: evidence is weak. */
  fixationBold: boolean;
  tapLayout: TapLayout;
  haptics: boolean;
  speakOnReveal: boolean;
  speechRate: number;
  showSentenceCounter: boolean;
  showBookProgress: boolean;
  breakReminderMinutes: number; // 0 = off
  autoRevealFirst: boolean;
  /** Start at the real text and stop before back matter (copyright, contents, index…). */
  skipFrontBack: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'cream',
  font: 'atkinson',
  fontSize: 21,
  lineHeight: 1.6,
  extraSpacing: false,
  unrevealed: 'faded',
  pastOpacity: 0.65,
  highlightCurrent: true,
  clauseMode: 'tint',
  fixationBold: false,
  tapLayout: 'zones',
  haptics: true,
  speakOnReveal: false,
  speechRate: 1,
  showSentenceCounter: true,
  showBookProgress: false,
  breakReminderMinutes: 25,
  autoRevealFirst: false,
  skipFrontBack: true,
};

const KEY = 'settings.v1';

interface SettingsContextValue {
  settings: Settings;
  theme: Theme;
  loaded: boolean;
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getJson(KEY, DEFAULT_SETTINGS).then((s) => {
      setSettings({ ...DEFAULT_SETTINGS, ...s });
      setLoaded(true);
    });
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      setJson(KEY, next).catch(() => {});
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    setJson(KEY, DEFAULT_SETTINGS).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ settings, theme: THEMES[settings.theme] ?? THEMES.cream, loaded, update, reset }),
    [settings, loaded, update, reset],
  );
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider');
  return ctx;
}
