import { useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { useSettings } from '../store/settings';
import type { TocEntry } from '../text/blocks';
import { withAlpha } from '../theme/color';
import { fontFamily } from '../theme/fonts';

interface Props {
  toc: TocEntry[];
  /** Index of the TOC entry containing the current reading position (-1 if none). */
  currentIndex: number;
  onSelect: (entry: TocEntry) => void;
  onClose: () => void;
}

/** Index of the TOC entry that contains `block` (the last entry starting at or before it). */
export function currentTocIndex(toc: TocEntry[], block: number): number {
  let best = -1;
  for (let i = 0; i < toc.length; i++) {
    if (toc[i].block <= block && (best < 0 || toc[i].block >= toc[best].block)) best = i;
  }
  return best;
}

/** For each entry, whether it has child entries (deeper level right after it). */
function childFlags(toc: TocEntry[]): boolean[] {
  return toc.map((e, i) => i + 1 < toc.length && toc[i + 1].level > e.level);
}

/** Indices of the ancestors of entry `i` (nearest first). */
function ancestors(toc: TocEntry[], i: number): number[] {
  const out: number[] = [];
  let level = toc[i]?.level ?? 0;
  for (let j = i - 1; j >= 0 && level > 1; j--) {
    if (toc[j].level < level) {
      out.push(j);
      level = toc[j].level;
    }
  }
  return out;
}

/**
 * Collapsible table of contents. Sections with sub-entries can be expanded or
 * collapsed; the current chapter is highlighted and its section opened.
 * Front/back matter that reading skips is shown dimmed and marked.
 */
export function TocPanel({ toc, currentIndex, onSelect, onClose }: Props) {
  const { theme, settings } = useSettings();
  const hasChildren = useMemo(() => childFlags(toc), [toc]);
  const [expanded, setExpanded] = useState<Set<number>>(() => {
    // Small TOCs start fully open; large ones open only the path to the current entry.
    if (toc.length <= 30) return new Set(toc.map((_, i) => i).filter((i) => hasChildren[i]));
    return new Set(currentIndex >= 0 ? ancestors(toc, currentIndex) : []);
  });
  const scrollRef = useRef<ScrollViewInstance>(null);
  const rowY = useRef(new Map<number, number>());

  // When the reading position moves to another entry, open the sections around it
  // (adjusting state during render, as React recommends for prop-driven updates).
  const [openedFor, setOpenedFor] = useState(currentIndex);
  if (openedFor !== currentIndex) {
    setOpenedFor(currentIndex);
    if (currentIndex >= 0) setExpanded((prev) => new Set([...prev, ...ancestors(toc, currentIndex)]));
  }

  // Visible rows: an entry is hidden if any ancestor is collapsed.
  const visible = useMemo(() => {
    const rows: number[] = [];
    const collapsedAt: number[] = []; // levels of collapsed ancestors on the current path
    toc.forEach((e, i) => {
      while (collapsedAt.length && e.level <= collapsedAt[collapsedAt.length - 1]) collapsedAt.pop();
      if (!collapsedAt.length) rows.push(i);
      if (hasChildren[i] && !expanded.has(i) && !collapsedAt.length) collapsedAt.push(e.level);
    });
    return rows;
  }, [toc, expanded, hasChildren]);

  const toggle = (i: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const font = fontFamily(settings.font);
  const bold = fontFamily(settings.font, true);
  const allOpen = visible.length === toc.length;

  return (
    <View style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.border }]} accessibilityRole="menu" accessibilityLabel="Table of contents">
      <View style={[styles.header, { borderColor: theme.border }]}>
        <Text accessibilityRole="header" style={{ color: theme.text, fontFamily: bold, fontSize: 18, flex: 1 }}>
          Contents
        </Text>
        {toc.some((_, i) => hasChildren[i]) && (
          <Pressable
            onPress={() => setExpanded(allOpen ? new Set() : new Set(toc.map((_, i) => i).filter((i) => hasChildren[i])))}
            accessibilityRole="button"
            style={styles.headerBtn}
            hitSlop={6}
          >
            <Text style={{ color: theme.accent, fontFamily: font, fontSize: 14 }}>{allOpen ? 'Collapse all' : 'Expand all'}</Text>
          </Pressable>
        )}
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close contents" style={styles.headerBtn} hitSlop={8}>
          <Text style={{ color: theme.text, fontSize: 22, lineHeight: 24 }}>×</Text>
        </Pressable>
      </View>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingVertical: 6 }}
        onLayout={() => {
          const y = rowY.current.get(currentIndex);
          if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, y - 120), animated: false });
        }}
      >
        {visible.map((i) => {
          const e = toc[i];
          const current = i === currentIndex;
          const open = expanded.has(i);
          return (
            <View
              key={i}
              onLayout={(ev) => rowY.current.set(i, ev.nativeEvent.layout.y)}
              style={[styles.row, { paddingLeft: 8 + (e.level - 1) * 18 }, current && { backgroundColor: theme.highlight }]}
            >
              {hasChildren[i] ? (
                <Pressable
                  onPress={() => toggle(i)}
                  accessibilityRole="button"
                  accessibilityLabel={`${open ? 'Collapse' : 'Expand'} ${e.title}`}
                  accessibilityState={{ expanded: open }}
                  style={styles.chevron}
                  hitSlop={6}
                >
                  <Text style={{ color: theme.muted, fontSize: 14, transform: [{ rotate: open ? '90deg' : '0deg' }] }}>▶</Text>
                </Pressable>
              ) : (
                <View style={styles.chevron} />
              )}
              <Pressable
                onPress={() => onSelect(e)}
                accessibilityRole="menuitem"
                accessibilityLabel={`${e.title}${current ? ', current' : ''}${e.skipped ? ', skipped while reading' : ''}`}
                style={styles.entry}
              >
                <Text
                  numberOfLines={2}
                  style={{
                    color: e.skipped ? withAlpha(theme.text, 0.55) : theme.text,
                    fontFamily: current || e.level === 1 ? bold : font,
                    fontSize: e.level === 1 ? 16 : 15,
                  }}
                >
                  {e.title}
                </Text>
                {e.skipped && <Text style={{ color: theme.muted, fontFamily: font, fontSize: 12, marginTop: 2 }}>Skipped while reading</Text>}
              </Pressable>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { flex: 1, borderRightWidth: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth, gap: 4 },
  headerBtn: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingRight: 12, borderRadius: 8, marginHorizontal: 6 },
  chevron: { width: 32, height: 44, alignItems: 'center', justifyContent: 'center' },
  entry: { flex: 1, paddingVertical: 8 },
});
