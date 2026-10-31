import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { launchCamera, launchImageLibrary, type Asset, type ImagePickerResponse } from 'react-native-image-picker';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { validateDraft } from '../engine/policy';
import type { LocalImage, LocalReport } from '../engine/types';
import { preparePhoto } from '../images/prepare';
import { createId } from '../ids';
import type { RootStackParamList } from '../navigation';
import { useRunner } from '../state/QueueContext';
import { copyPhoto } from '../storage/copyPhoto';
import { draftPath, removeFile, removeReportFiles, reportDir, toFileUri } from '../storage/files';
import { BigButton } from '../ui/bits';
import { colors } from '../ui/theme';

type DraftPhoto = { id: string; uri: string; bytes: number };

export function ComposeScreen() {
  return <Composer />;
}

export function Composer({ embedded = false, onSaved }: { embedded?: boolean; onSaved?: () => void }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const runner = useRunner();
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<DraftPhoto[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const room = 5 - photos.length;
  const problem = validateDraft(description, photos.length);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => {
      if (next === 'active') {
        setMessage(current =>
          current?.includes('Settings') ? 'If you allowed access, tap the photo button again.' : current,
        );
      }
    });
    return () => subscription.remove();
  }, []);

  async function addAssets(assets: Asset[]) {
    const next = [...photos];
    try {
      for (const asset of assets) {
        if (!asset.uri || next.length >= 5) {
          break;
        }
        const id = createId();
        const dest = draftPath(id);
        const bytes = await copyPhoto(asset.uri, dest, asset.fileSize);
        next.push({ id, uri: toFileUri(dest), bytes });
      }
      setPhotos(next);
    } catch (caught) {
      setPhotos(next);
      setMessage(caught instanceof Error ? caught.message : 'That photo could not be kept on this phone.');
    }
  }

  function explain(result: ImagePickerResponse) {
    if (result.didCancel) {
      return;
    }
    if (result.errorCode === 'permission') {
      setMessage('The camera or photos permission is off. Allow it in Settings, come back, and tap the button again. You do not need to restart.');
      return;
    }
    if (result.errorCode) {
      setMessage(result.errorMessage ?? 'The photo could not be opened.');
    }
  }

  async function takePhoto() {
    setMessage(null);
    const result = await launchCamera({ mediaType: 'photo', cameraType: 'back', saveToPhotos: false, quality: 1 });
    explain(result);
    await addAssets(result.assets ?? []);
  }

  async function choosePhotos() {
    setMessage(null);
    const result = await launchImageLibrary({ mediaType: 'photo', selectionLimit: 1, quality: 1 });
    explain(result);
    await addAssets(result.assets ?? []);
  }

  async function remove(photo: DraftPhoto) {
    setPhotos(current => current.filter(item => item.id !== photo.id));
    await removeFile(photo.uri);
  }

  async function save() {
    const error = validateDraft(description, photos.length);
    if (error) {
      setMessage(error);
      return;
    }
    setPreparing(true);
    setMessage(null);
    const reportId = createId();
    const images: LocalImage[] = [];
    try {
      for (const photo of photos) {
        const dest = `${reportDir(reportId)}/${photo.id}.jpg`;
        const prepared = await preparePhoto(photo.uri, photo.bytes, dest);
        images.push({
          id: photo.id,
          fileUri: prepared.uri,
          byteSize: prepared.bytes,
          status: 'pending',
          bytesSent: 0,
        });
        await removeFile(photo.uri);
      }
      const report: LocalReport = {
        id: reportId,
        description: description.trim(),
        createdAt: new Date().toISOString(),
        status: 'queued',
        serverRecord: false,
        attempts: 0,
        nextAttemptAt: null,
        lastError: null,
        serverAckAt: null,
        images,
      };
      await runner.addReport(report);
      if (embedded) {
        setDescription('');
        setPhotos([]);
        onSaved?.();
        return;
      }
      navigation.replace('LocalReport', { id: reportId });
    } catch (caught) {
      await removeReportFiles(reportId);
      setMessage(caught instanceof Error ? caught.message : 'The photos could not be prepared.');
    } finally {
      setPreparing(false);
    }
  }

  const fields = (
    <View style={embedded ? styles.embedded : undefined}>
      <View style={styles.pair}>
        <View style={styles.pairItem}>
          <BigButton label="Take a photo" tone="ghost" disabled={preparing || room === 0} onPress={() => {
            takePhoto();
          }} />
        </View>
        <View style={styles.pairItem}>
          <BigButton label="Gallery" tone="ghost" disabled={preparing || room === 0} onPress={() => {
            choosePhotos();
          }} />
        </View>
      </View>
      <Text style={styles.count}>{photos.length === 0 ? 'One photo is enough. Five is the most.' : `${photos.length} added. One is enough, five is the most.`}</Text>
      <View style={styles.grid}>
        {photos.map(photo => (
          <View key={photo.id} style={styles.tile}>
            <Image source={{ uri: photo.uri }} style={styles.image} />
            <Pressable accessibilityRole="button" onPress={() => remove(photo)} style={styles.remove}>
              <Text style={styles.removeText}>Remove</Text>
            </Pressable>
          </View>
        ))}
      </View>
      {room === 0 ? <Text style={styles.message}>A report holds at most 5 photos. Remove one to add another.</Text> : null}
      <Text style={styles.label}>What did you see?</Text>
      <TextInput
        value={description}
        onChangeText={setDescription}
        multiline
        maxLength={400}
        placeholder="A short note."
        placeholderTextColor={colors.muted}
        style={styles.input}
      />
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {!message && problem ? <Text style={styles.hint}>{problem}</Text> : null}
      <View style={styles.gap}>
        {preparing ? (
          <View style={styles.preparing}>
            <ActivityIndicator color={colors.ink} />
            <Text style={styles.preparingText}>Preparing photos on this phone. Not uploading yet.</Text>
          </View>
        ) : (
          <BigButton label="Save on this phone" disabled={Boolean(problem)} onPress={() => {
            save();
          }} />
        )}
      </View>
      <Text style={styles.hint}>This saves it on the phone. The server does not have it yet.</Text>
      <Pressable onPress={() => Linking.openSettings()} style={styles.settings}>
        <Text style={styles.settingsText}>Open Settings</Text>
      </Pressable>
    </View>
  );

  if (embedded) {
    return fields;
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        {fields}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  page: { padding: 20, paddingBottom: 32 },
  embedded: { marginBottom: 8 },
  pair: { flexDirection: 'row', gap: 8 },
  pairItem: { flex: 1 },
  label: { fontSize: 16, fontWeight: '700', color: colors.ink, marginTop: 14, marginBottom: 8 },
  input: {
    minHeight: 110,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    padding: 14,
    fontSize: 16,
    color: colors.ink,
    textAlignVertical: 'top',
  },
  count: { marginTop: 16, color: colors.muted, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
  tile: { width: 104 },
  image: { width: 104, height: 104, borderRadius: 12, backgroundColor: colors.line },
  remove: { minHeight: 44, justifyContent: 'center' },
  removeText: { color: colors.stop, fontWeight: '700' },
  gap: { marginTop: 10 },
  message: { color: colors.stop, marginTop: 12, lineHeight: 20 },
  hint: { color: colors.muted, marginTop: 12, lineHeight: 20 },
  preparing: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10 },
  preparingText: { flex: 1, color: colors.ink, fontWeight: '700' },
  settings: { minHeight: 48, justifyContent: 'center', marginTop: 8 },
  settingsText: { color: colors.move, fontWeight: '700' },
});
