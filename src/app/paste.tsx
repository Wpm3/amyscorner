import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/ui';
import { useImporter } from '../hooks/useImporter';
import { useSettings } from '../store/settings';
import { fontFamily } from '../theme/fonts';

export default function Paste() {
  const { theme, settings } = useSettings();
  const insets = useSafeAreaInsets();
  const { importText } = useImporter();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const font = fontFamily(settings.font);

  const save = async () => {
    try {
      const book = await importText(text, title);
      router.replace(`/reader/${book.id}`);
    } catch (e) {
      if (Platform.OS === 'web') window.alert((e as Error).message);
      else Alert.alert('Could not save', (e as Error).message);
    }
  };

  const input = [styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border, fontFamily: font }];
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.root, { backgroundColor: theme.background, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: theme.text, fontFamily: fontFamily(settings.font, true) }]}>Paste text</Text>
      <TextInput value={title} onChangeText={setTitle} placeholder="Title (optional)" placeholderTextColor={theme.muted} style={[input, { minHeight: 52 }]} accessibilityLabel="Title" />
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Paste or type text here. Leave a blank line between paragraphs."
        placeholderTextColor={theme.muted}
        multiline
        textAlignVertical="top"
        style={[input, { flex: 1 }]}
        accessibilityLabel="Text to read"
      />
      <View style={styles.row}>
        <Button label="Cancel" onPress={() => router.back()} style={{ flex: 1 }} />
        <Button label="Start reading" kind="primary" onPress={save} disabled={!text.trim()} style={{ flex: 1 }} />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16, gap: 12 },
  title: { fontSize: 28 },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 18 },
  row: { flexDirection: 'row', gap: 12 },
});
