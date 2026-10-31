import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';

import { statusLine } from '../engine/status';
import type { RootStackParamList } from '../navigation';
import { useRunnerState } from '../state/QueueContext';
import { EmptyLine, ProgressBar } from '../ui/bits';
import { colors, toneColor } from '../ui/theme';
import { useNow } from '../ui/useNow';

export function LocalReportScreen() {
  const route = useRoute<RouteProp<RootStackParamList, 'LocalReport'>>();
  const state = useRunnerState();
  const now = useNow();
  const report = state.reports.find(item => item.id === route.params.id);
  if (!report) {
    return (
      <View style={styles.page}>
        <EmptyLine>This report is not on this phone.</EmptyLine>
      </View>
    );
  }
  const line = statusLine(report, state.online, now);
  const tone = toneColor[line.tone];
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={[styles.banner, { backgroundColor: tone.bg }]}>
        <Text style={[styles.bannerTitle, { color: tone.fg }]}>{line.title}</Text>
        <Text style={styles.bannerDetail}>{line.detail}</Text>
      </View>
      <Text style={styles.description}>{report.description}</Text>
      {report.images.map((image, index) => {
        const sent = state.progress[image.id] ?? image.bytesSent;
        const value = image.status === 'stored' ? 1 : image.byteSize > 0 ? sent / image.byteSize : 0;
        return (
          <View key={image.id} style={styles.photo}>
            <Image source={{ uri: image.fileUri }} style={styles.image} />
            <Text style={styles.photoLabel}>
              Photo {index + 1} · {image.status === 'stored' ? 'On the server' : image.status === 'uploading' ? 'Sending' : 'On this phone'}
            </Text>
            <ProgressBar value={value} />
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, paddingBottom: 40 },
  banner: { borderRadius: 16, padding: 16 },
  bannerTitle: { fontSize: 22, fontWeight: '700' },
  bannerDetail: { color: colors.ink, marginTop: 6, lineHeight: 21 },
  description: { fontSize: 18, color: colors.ink, marginTop: 16, lineHeight: 26 },
  photo: {
    marginTop: 16,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
  },
  image: { width: '100%', height: 180, borderRadius: 12, backgroundColor: colors.line },
  photoLabel: { marginTop: 8, color: colors.ink, fontWeight: '700' },
});
