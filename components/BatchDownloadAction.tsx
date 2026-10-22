import { useSyncExternalStore } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { downloadQueue } from '../services/download-queue';
import { offlineSupported } from '../services/downloads';
import { useDownloads } from '../hooks/use-downloads';
import { downloadLabel } from '../utils/download-library';
import type { Video } from '../types/video';

export default function BatchDownloadAction({ videos, title }: { videos: Video[]; title: string }) {
  const batch = useSyncExternalStore(downloadQueue.subscribe, downloadQueue.getSnapshot, downloadQueue.getSnapshot);
  const { jobs } = useDownloads();
  const currentJob = batch.current ? jobs[batch.current.id] : undefined;
  const processed = batch.completed + batch.skipped + batch.failed.length;
  const progress = batch.total ? Math.round(processed / batch.total * 100) : 0;
  const belongs = batch.title === title;
  const showResult = !batch.running && batch.total > 0 && belongs;
  return <View style={styles.container}>
    <TouchableOpacity style={[styles.button, (!offlineSupported || !videos.length || batch.cancelled && batch.running) && styles.disabled]}
      disabled={!offlineSupported || !videos.length || batch.cancelled && batch.running}
      accessibilityRole="button" accessibilityLabel={batch.running ? 'Cancelar downloads em fila' : `Baixar todos os áudios: ${title}`}
      onPress={() => { if (batch.running) downloadQueue.cancel(); else void downloadQueue.start(videos, title); }}>
      <Ionicons name={batch.running ? 'close-circle-outline' : 'cloud-download-outline'} size={22} color="#FFFFFF" />
      <Text style={styles.label}>{batch.running ? batch.cancelled ? 'Cancelando…' : 'Cancelar fila' : showResult && (batch.failed.length || batch.cancelled) ? 'Baixar os que faltam' : 'Baixar todos os áudios'}</Text>
    </TouchableOpacity>
    {!offlineSupported && <Text style={styles.detail}>Para baixar, use o app Android ou iOS.</Text>}
    {batch.running && <View style={styles.status}>
      <Text style={styles.detail} accessibilityLiveRegion="polite">{batch.title} · {batch.completed + batch.skipped} de {batch.total} disponíveis offline{batch.failed.length ? ` · ${batch.failed.length} com falha` : ''}</Text>
      <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: progress }} accessibilityLabel="Progresso da fila">
        <View style={[styles.fill, { width: `${progress}%` }]} />
      </View>
      {batch.current && <Text style={styles.detail} numberOfLines={2}>{batch.current.title}{currentJob ? ` · ${downloadLabel(currentJob)}` : ''}</Text>}
      <Text style={styles.detail}>Mantenha o app aberto até concluir.</Text>
    </View>}
    {showResult && <Text style={styles.detail} accessibilityLiveRegion="polite">
      {batch.cancelled ? 'Fila cancelada. ' : ''}{batch.completed + batch.skipped} de {batch.total} disponíveis offline.
      {batch.failed.length ? ` ${batch.failed.length} não foram baixados. Veja a causa em Downloads e tente novamente.` : ''}
    </Text>}
  </View>;
}
const styles = StyleSheet.create({
  container: { gap: 8, marginTop: 8 },
  button: { minHeight: 48, backgroundColor: '#B91C1C', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  disabled: { backgroundColor: '#404040' },
  label: { flexShrink: 1, color: '#FFFFFF', fontSize: 14, lineHeight: 20, fontWeight: '600', textAlign: 'center' },
  detail: { color: '#AAAAAA', fontSize: 14, lineHeight: 21 },
  status: { gap: 8 },
  track: { height: 4, borderRadius: 2, backgroundColor: '#404040', overflow: 'hidden' },
  fill: { height: 4, backgroundColor: '#FFFFFF' },
});
