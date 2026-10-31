import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { setFault } from '../api/http';
import { colors } from '../ui/theme';

const OPTIONS = [
  { label: 'Normal', mode: 'off', requests: 0, line: 'The server answers. This turns the failure off.' },
  { label: 'Slow', mode: 'slow', requests: 2, line: 'The server waits, like a bad signal. The phone keeps sending.' },
  { label: 'Drop twice', mode: 'drop', requests: 2, line: 'The line dies twice in the middle. The phone tries again. The photo is not sent twice.' },
  { label: 'Refuse', mode: 'refuse', requests: 1, line: 'The server says no. The report stays on this phone and is tried again.' },
  { label: 'Hang', mode: 'hang', requests: 1, line: 'The server never answers. The phone does not sit on a spinner. It tries again.' },
] as const;

export function FaultPanel() {
  const [picked, setPicked] = useState<(typeof OPTIONS)[number]['label']>('Normal');
  const [note, setNote] = useState(OPTIONS[0].line);
  const [busy, setBusy] = useState(false);

  async function choose(option: (typeof OPTIONS)[number]) {
    setBusy(true);
    try {
      await setFault(option.mode, option.requests);
      setPicked(option.label);
      setNote(option.line);
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
        Tap one, then save a report. The phone keeps it and tries again. Normal turns the failure off.
      </Text>
      <View style={styles.row}>
        {OPTIONS.map(option => (
          <Pressable
            key={option.label}
            accessibilityRole="button"
            disabled={busy}
            onPress={() => choose(option)}
            style={[styles.chip, picked === option.label && styles.chipOn]}>
            <Text style={[styles.chipLabel, picked === option.label && styles.chipLabelOn]}>{option.label}</Text>
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
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipLabel: { color: colors.ink, fontWeight: '700' },
  chipLabelOn: { color: colors.cream },
  note: { marginTop: 12, color: colors.ink, lineHeight: 20 },
});
