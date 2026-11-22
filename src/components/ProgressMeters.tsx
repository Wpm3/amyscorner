import { StyleSheet, Text, View } from 'react-native';
import { useSettings } from '../store/settings';
import type { ChapterProgress } from '../text/chapters';
import { withAlpha } from '../theme/color';
import { fontFamily } from '../theme/fonts';

interface Props {
  /** null when the document has no (verified) chapters, or the reader is outside them. */
  chapter: ChapterProgress | null;
  chapterWord: 'Chapter' | 'Section';
  document: number;
  documentWord: 'Book' | 'Document';
  showChapter: boolean;
}

/**
 * Meter list (dataviz pattern): one row per ratio — a fixed-width name, a thin
 * bar on a shared alignment, and the figure. Single hue: the fill is the
 * theme's validated meter colour, the track a lighter step of the same hue.
 * Text uses text colours, never the bar colour.
 */
export function ProgressMeters({ chapter, chapterWord, document, documentWord, showChapter }: Props) {
  const { theme, settings } = useSettings();
  const font = fontFamily(settings.font);
  const rows: { key: string; label: string; spoken: string; value: number }[] = [];
  if (showChapter && chapter) {
    rows.push({
      key: 'chapter',
      label: `${chapterWord} ${chapter.index + 1} of ${chapter.total}`,
      spoken: `${chapterWord} ${chapter.index + 1} of ${chapter.total}, ${chapter.title}`,
      value: chapter.fraction,
    });
  }
  rows.push({ key: 'document', label: documentWord === 'Book' ? 'Whole book' : 'Whole document', spoken: `Whole ${documentWord.toLowerCase()}`, value: document });

  return (
    <View style={styles.list}>
      {rows.map((r) => {
        const pct = Math.round(r.value * 100);
        return (
          <View
            key={r.key}
            style={styles.row}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={r.spoken}
            accessibilityValue={{ min: 0, max: 100, now: pct, text: `${pct} percent` }}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
            aria-valuetext={`${pct} percent`}
          >
            <Text numberOfLines={1} style={[styles.label, { color: theme.muted, fontFamily: font }]}>
              {r.label}
            </Text>
            <View style={[styles.track, { backgroundColor: withAlpha(theme.meter, 0.22) }]}>
              {r.value > 0 && <View style={[styles.fill, { backgroundColor: theme.meter, width: `${Math.max(r.value * 100, 2)}%` }]} />}
            </View>
            <Text style={[styles.figure, { color: theme.text, fontFamily: font }]}>{pct}%</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { width: '100%', maxWidth: 560, alignSelf: 'center', paddingHorizontal: 16, gap: 6, paddingTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 22 },
  label: { width: 124, fontSize: 13 },
  track: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  figure: { width: 44, textAlign: 'right', fontSize: 13, fontVariant: ['tabular-nums'] },
});
