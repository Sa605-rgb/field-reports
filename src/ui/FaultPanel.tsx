import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { setFault } from '../api/http';
import { colors } from '../ui/theme';

const OPTIONS = [
  { label: 'Normal', mode: 'off', requests: 0 },
  { label: 'Slow', mode: 'slow', requests: 2 },
  { label: 'Drop twice', mode: 'drop', requests: 2 },
  { label: 'Refuse', mode: 'refuse', requests: 1 },
  { label: 'Hang', mode: 'hang', requests: 1 },
] as const;

export function FaultPanel() {
  const [note, setNote] = useState('The server answers normally until you pick a failure.');
  const [busy, setBusy] = useState(false);

  async function choose(mode: (typeof OPTIONS)[number]['mode'], requests: number) {
    setBusy(true);
    try {
      setNote(await setFault(mode, requests));
    } catch {
      setNote('Could not reach the server to change it.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.box}>
      <Text style={styles.title}>Make the server fail</Text>
      <Text style={styles.copy}>
        For the test. Saved reports stay on this phone. Only the next upload requests are affected.
      </Text>
      <View style={styles.row}>
        {OPTIONS.map(option => (
          <Pressable
            key={option.label}
            accessibilityRole="button"
            disabled={busy}
            onPress={() => choose(option.mode, option.requests)}
            style={styles.chip}>
            <Text style={styles.chipLabel}>{option.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.note}>{note}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginTop: 28,
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  title: { fontSize: 16, fontWeight: '700', color: colors.ink },
  copy: { color: colors.muted, marginTop: 6, lineHeight: 20 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paper,
  },
  chipLabel: { color: colors.ink, fontWeight: '700' },
  note: { marginTop: 12, color: colors.ink, lineHeight: 20 },
});
