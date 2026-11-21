import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/ui';
import { useFileDrop } from '../hooks/useFileDrop';
import { useImporter, type ImportSource } from '../hooks/useImporter';
import { addBook, deleteBook, getAllPositions, listBooks, type BookSummary, type ReadingPosition } from '../store/library';
import { useSettings } from '../store/settings';
import { getJson, setJson } from '../store/storage';
import { welcomeDocument } from '../text/welcome';
import { fontFamily } from '../theme/fonts';

const FORMAT_LABEL: Record<string, string> = {
  pdf: 'PDF', epub: 'EPUB', docx: 'Word', odt: 'ODT', txt: 'Text', md: 'Markdown', html: 'Web page', rtf: 'RTF', fb2: 'FB2', paste: 'Pasted',
};

export default function Library() {
  const { theme, settings } = useSettings();
  const insets = useSafeAreaInsets();
  const { importFile, importSource, state } = useImporter();
  const [books, setBooks] = useState<BookSummary[] | null>(null);
  const [positions, setPositions] = useState<Record<string, ReadingPosition>>({});

  const refresh = useCallback(async () => {
    const seeded = await getJson<{ done: boolean }>('welcome.seeded', { done: false });
    if (!seeded.done) {
      await addBook(welcomeDocument(), 'md', 'Welcome');
      await setJson('welcome.seeded', { done: true });
    }
    setBooks(await listBooks());
    setPositions(await getAllPositions());
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const onImport = async () => {
    try {
      const book = await importFile();
      if (book) router.push(`/reader/${book.id}`);
    } catch (e) {
      showError(e);
    }
  };

  const showError = (e: unknown) => {
    const msg = (e as Error).message;
    if (Platform.OS === 'web') window.alert(`Could not open file\n\n${msg}`);
    else Alert.alert('Could not open file', msg);
  };

  const dragging = useFileDrop((src: ImportSource) => {
    if (state.busy) return;
    importSource(src)
      .then((book) => router.push(`/reader/${book.id}`))
      .catch(showError);
  });

  const onLongPress = (b: BookSummary) => {
    if (Platform.OS === 'web') {
      if (window.confirm(`Remove “${b.title}” from your library?`)) deleteBook(b.id).then(refresh);
      return;
    }
    Alert.alert(b.title, 'Remove this from your library?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => { await deleteBook(b.id); refresh(); } },
    ]);
  };

  const font = fontFamily(settings.font);
  const bold = fontFamily(settings.font, true);

  return (
    <View style={[styles.root, { backgroundColor: theme.background, paddingTop: insets.top + 12 }]}>
      <View style={styles.column}>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.text, fontFamily: bold }]}>Library</Text>
        <Button label="Settings" kind="ghost" onPress={() => router.push('/settings')} />
      </View>
      <View style={styles.actions}>
        <Button label="Import file" kind="primary" onPress={onImport} disabled={state.busy} style={{ flex: 1 }} accessibilityHint="PDF, EPUB, Word, text and more" />
        <Button label="Paste text" onPress={() => router.push('/paste')} disabled={state.busy} style={{ flex: 1 }} />
      </View>
      {state.busy && (
        <View style={[styles.busy, { backgroundColor: theme.surface }]} accessibilityLiveRegion="polite">
          <ActivityIndicator color={theme.accent} />
          <Text style={{ color: theme.text, fontFamily: font, fontSize: 16, flex: 1 }}>{state.message}</Text>
        </View>
      )}
      <FlatList
        data={books ?? []}
        keyExtractor={(b) => b.id}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingTop: 8 }}
        ListEmptyComponent={
          books ? (<Text style={{ color: theme.muted, fontFamily: font, fontSize: 17, marginTop: 24 }}>Nothing here yet. Import a file to start reading.</Text>) : undefined
        }
        renderItem={({ item }) => {
          const pos = positions[item.id];
          const from = item.contentStart ?? 0;
          const to = item.contentEnd ?? item.blockCount;
          const pct = pos ? Math.round(Math.min(1, Math.max(0, (pos.block - from) / Math.max(1, to - from - 1))) * 100) : 0;
          return (
            <Pressable
              onPress={() => router.push(`/reader/${item.id}`)}
              onLongPress={() => onLongPress(item)}
              accessibilityRole="button"
              accessibilityLabel={`${item.title}${item.author ? ` by ${item.author}` : ''}. ${pos?.updatedAt ? 'Continue reading' : 'Not started'}.`}
              accessibilityHint="Long press to remove"
              accessibilityActions={[{ name: 'longpress', label: 'Remove from library' }]}
              onAccessibilityAction={() => onLongPress(item)}
              style={({ pressed }) => [styles.card, { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.8 : 1 }]}
            >
              <Text numberOfLines={2} style={{ color: theme.text, fontFamily: bold, fontSize: 18 }}>{item.title}</Text>
              <Text style={{ color: theme.muted, fontFamily: font, fontSize: 14, marginTop: 4 }}>
                {[item.author, FORMAT_LABEL[item.format] ?? item.format, pos?.updatedAt ? 'In progress' : 'New'].filter(Boolean).join(' · ')}
              </Text>
              {pos?.updatedAt ? (
                <View style={[styles.progressTrack, { backgroundColor: theme.placeholder }]}>
                  <View style={[styles.progressFill, { backgroundColor: theme.accent, width: `${Math.max(3, pct)}%` }]} />
                </View>
              ) : null}
            </Pressable>
          );
        }}
      />
      {Platform.OS === 'web' && !books?.length ? null : Platform.OS === 'web' ? (
        <Text style={{ color: theme.muted, fontFamily: font, fontSize: 14, textAlign: 'center', paddingBottom: 16 }}>
          Tip: drag a file onto this window to import it. Press and hold a book to remove it.
        </Text>
      ) : null}
      </View>
      {dragging && (
        <View pointerEvents="none" style={[styles.dropOverlay, { backgroundColor: theme.background, borderColor: theme.accent }]}>
          <Text style={{ color: theme.text, fontFamily: bold, fontSize: 24 }}>Drop to start reading</Text>
          <Text style={{ color: theme.muted, fontFamily: font, fontSize: 16, marginTop: 8 }}>PDF, EPUB, Word, ODT, RTF, HTML, Markdown, FB2, text</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16, alignItems: 'center' },
  column: { flex: 1, width: '100%', maxWidth: 760 },
  dropOverlay: { position: 'absolute', top: 12, left: 12, right: 12, bottom: 12, borderWidth: 3, borderStyle: 'dashed', borderRadius: 20, alignItems: 'center', justifyContent: 'center', opacity: 0.96 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 30 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 12 },
  busy: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, marginTop: 12 },
  card: { padding: 16, borderRadius: 14, borderWidth: 1, marginTop: 12 },
  progressTrack: { height: 4, borderRadius: 2, marginTop: 12, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },
});
