import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';

import { fetchReport } from '../api/http';
import type { ServerReport } from '../engine/types';
import type { RootStackParamList } from '../navigation';
import { BigButton, EmptyLine } from '../ui/bits';
import { colors } from '../ui/theme';

export function ServerReportScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'ServerReport'>>();
  const [report, setReport] = useState<ServerReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchReport(route.params.id);
      setReport(next);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load this report from the server.');
    } finally {
      setLoading(false);
    }
  }, [route.params.id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (loading && !report) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.ink} />
        <Text style={styles.muted}>Loading from the server…</Text>
      </View>
    );
  }

  if (!report) {
    return (
      <View style={styles.page}>
        <EmptyLine>{error ?? 'The server did not return this report.'}</EmptyLine>
        <View style={styles.gap}>
          <BigButton label="Try again" onPress={() => {
            load();
          }} />
        </View>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.kicker}>FROM THE SERVER</Text>
      <Text style={styles.description}>{report.description}</Text>
      <Text style={styles.muted}>
        {report.complete
          ? `All ${report.images.length} photos are on the server.`
          : `${report.images.filter(image => image.stored).length} of ${report.images.length} photos are on the server.`}
      </Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {report.images.map((image, index) => (
        <View key={image.id} style={styles.photo}>
          {image.stored ? (
            <Image source={{ uri: image.url }} style={styles.image} />
          ) : (
            <View style={[styles.image, styles.missing]}>
              <Text style={styles.missingText}>Not on the server yet</Text>
            </View>
          )}
          <Text style={styles.photoLabel}>Photo {index + 1}</Text>
        </View>
      ))}
      <View style={styles.gap}>
        <BigButton label={loading ? 'Refreshing…' : 'Refresh from server'} tone="ghost" disabled={loading} onPress={() => {
            load();
          }} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  kicker: { color: colors.safe, fontWeight: '700', letterSpacing: 1.1 },
  description: { fontSize: 22, fontWeight: '700', color: colors.ink, marginTop: 8 },
  muted: { color: colors.muted, marginTop: 8, lineHeight: 20 },
  error: { color: colors.stop, marginTop: 8 },
  photo: {
    marginTop: 16,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
  },
  image: { width: '100%', height: 200, borderRadius: 12, backgroundColor: colors.line },
  missing: { alignItems: 'center', justifyContent: 'center' },
  missingText: { color: colors.muted, fontWeight: '700' },
  photoLabel: { marginTop: 8, color: colors.ink, fontWeight: '700' },
  gap: { marginTop: 16 },
});
