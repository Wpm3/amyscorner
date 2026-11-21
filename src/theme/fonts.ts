import { Platform } from 'react-native';

export type FontChoice = 'atkinson' | 'lexend' | 'system' | 'serif';

export const FONT_LABELS: Record<FontChoice, string> = {
  atkinson: 'Atkinson Hyperlegible',
  lexend: 'Lexend',
  system: 'System',
  serif: 'Serif',
};

export function fontFamily(choice: FontChoice, bold = false): string | undefined {
  switch (choice) {
    case 'atkinson':
      return bold ? 'AtkinsonHyperlegible_700Bold' : 'AtkinsonHyperlegible_400Regular';
    case 'lexend':
      return bold ? 'Lexend_600SemiBold' : 'Lexend_400Regular';
    case 'serif':
      return Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });
    case 'system':
    default:
      return undefined;
  }
}
