import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useDownloads } from '../hooks/use-downloads';
import { downloadService, offlineSupported } from '../services/downloads';
import type { DownloadedVideo } from '../types/video';
import { downloadLabel, formatBytes } from '../utils/download-library';

export default function DownloadsScreen() {
  const { ready, error, items, jobs } = useDownloads();
  const router = useRouter();
  const [actionError, setActionError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  useFocusEffect(useCallback(() => {
    let active = true;
    void downloadService.refresh().catch(() => {
      if (active) setActionError('Não foi possível atualizar a biblioteca. Tente novamente.');
    });
    return () => { active = false; };
  }, []));

  const remove = (video: DownloadedVideo) => {
    Alert.alert('Excluir download?', `Liberar ${formatBytes(video.fileSize)} no aparelho?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: async () => {
        setRemoving(video.id);
        setActionError(null);
        try { await downloadService.remove(video.id); }
        catch { setActionError('Não foi possível excluir o download. Tente novamente.'); }
        finally { setRemoving(null); }
      } },
    ]);
  };

  const retryLibrary = () => {
    setActionError(null);
    void downloadService.refresh().catch(() => setActionError('Não foi possível abrir a biblioteca. Tente novamente.'));
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={(
          <View>
            <Text style={styles.title}>Sua biblioteca offline</Text>
            <Text style={styles.subtitle}>{items.length > 0 ? `${items.length} ${items.length === 1 ? 'download salvo' : 'downloads salvos'} · ${formatBytes(items.reduce((total, item) => total + item.fileSize, 0))}` : 'Baixe uma vez. Ouça sem conexão.'}</Text>

            {!offlineSupported && <Text style={styles.notice}>Downloads estão disponíveis no app Android e iOS.</Text>}
            {Object.values(jobs).some((job) => job.phase !== 'error') && <Text style={styles.notice}>Mantenha o app aberto até o download terminar.</Text>}
            {(error || actionError) && (
              <View style={styles.status}>
                <Text style={styles.notice} accessibilityLiveRegion="polite">{actionError ?? error}</Text>
                <TouchableOpacity onPress={retryLibrary} style={styles.textButton} accessibilityRole="button"><Text style={styles.buttonText}>Tentar novamente</Text></TouchableOpacity>
              </View>
            )}

            {Object.values(jobs).map((job) => (
              <View key={job.video.id} style={styles.job}>
                <View style={styles.jobInfo}>
                  <Text style={styles.itemTitle} numberOfLines={2}>{job.video.title}</Text>
                  <Text style={styles.subtitle} accessibilityLiveRegion="polite">{job.error ?? downloadLabel(job)}</Text>
                  {job.phase === 'downloading' && <Text style={styles.metadata}>{formatBytes(job.bytesWritten)}{job.totalBytes > 0 ? ` de ${formatBytes(job.totalBytes)}` : ''}</Text>}
                </View>
                {job.phase === 'error' ? (
                  <View>
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Tentar baixar ${job.video.title} novamente`} style={styles.iconButton} onPress={() => { void downloadService.start(job.video); }}><Ionicons name="refresh" size={24} color="#FFFFFF" /></TouchableOpacity>
                    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Dispensar erro do download" style={styles.iconButton} onPress={() => downloadService.dismissError(job.video.id)}><Ionicons name="close" size={24} color="#FFFFFF" /></TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Cancelar download de ${job.video.title}`} style={styles.iconButton} onPress={() => downloadService.cancel(job.video.id)}><Ionicons name="close-circle-outline" size={26} color="#FFFFFF" /></TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        )}
        ListEmptyComponent={!ready && !error ? (
          <ActivityIndicator color="#FF0000" style={styles.loading} />
        ) : (
          <View style={styles.empty}>
            <Ionicons name="cloud-download-outline" size={48} color="#AAAAAA" />
            <Text style={styles.emptyTitle}>Nenhum áudio baixado</Text>
            <Text style={styles.emptyText}>Abra um vídeo e toque em Baixar áudio. Depois, ele aparece aqui para ouvir mesmo sem internet.</Text>
            <TouchableOpacity accessibilityRole="button" onPress={() => router.replace('/')} style={styles.primaryButton}><Text style={styles.buttonText}>Explorar vídeos</Text></TouchableOpacity>
          </View>
        )}
        renderItem={({ item }) => (
          <View style={styles.savedRow}>
            <TouchableOpacity
              style={styles.playButton}
              disabled={removing !== null}
              accessibilityRole="button"
              accessibilityLabel={`Ouvir ${item.title} offline`}
              onPress={() => router.push({ pathname: '/video/[id]', params: { id: item.id } })}
            >
              <Ionicons name="play-circle-outline" size={36} color="#FFFFFF" />
              <View style={styles.jobInfo}>
                <Text style={styles.itemTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.subtitle} numberOfLines={1}>{item.channelTitle}</Text>
                <Text style={styles.metadata}>{formatBytes(item.fileSize)} · Disponível offline</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.iconButton} disabled={removing !== null} accessibilityRole="button" accessibilityLabel={`Excluir download de ${item.title}`} onPress={() => remove(item)}>
              {removing === item.id ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="trash-outline" size={22} color="#AAAAAA" />}
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  content: { padding: 16, paddingBottom: 40 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '600', marginBottom: 8 },
  subtitle: { color: '#AAAAAA', fontSize: 14, lineHeight: 20, marginTop: 4 },
  metadata: { color: '#AAAAAA', fontSize: 12, lineHeight: 18, marginTop: 4 },
  notice: { color: '#AAAAAA', fontSize: 14, lineHeight: 21, marginTop: 16 },
  status: { paddingBottom: 16 },
  job: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: '#303030' },
  jobInfo: { flex: 1, minWidth: 0 },
  itemTitle: { color: '#FFFFFF', fontSize: 15, lineHeight: 21, fontWeight: '600' },
  savedRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#303030' },
  playButton: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 20, minHeight: 88 },
  iconButton: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  textButton: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  loading: { marginTop: 48 },
  empty: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 16, gap: 16 },
  emptyTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '600', textAlign: 'center' },
  emptyText: { color: '#AAAAAA', fontSize: 14, lineHeight: 22, textAlign: 'center', maxWidth: 360 },
  primaryButton: { backgroundColor: '#B91C1C', paddingHorizontal: 24, minHeight: 48, justifyContent: 'center', borderRadius: 8, marginTop: 8 },
});
