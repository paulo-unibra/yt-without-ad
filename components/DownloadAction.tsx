import { useState } from 'react';
import PlaylistPicker from './PlaylistPicker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useDownloads } from '../hooks/use-downloads';
import { downloadService, offlineSupported } from '../services/downloads';
import type { Video } from '../types/video';
import { logDownload } from '../utils/download-diagnostics';
import { downloadLabel } from '../utils/download-library';

export default function DownloadAction({ video }: { video: Video }) {
  const { items, jobs, ready } = useDownloads();
  const router = useRouter();
  const [choosePlaylist, setChoosePlaylist] = useState(false);
  const job = jobs[video.id];
  const active = job && job.phase !== 'error';
  const saved = items.some((item) => item.id === video.id);
  const label = saved ? 'Salvo offline' : job ? downloadLabel(job) : 'Baixar áudio';

  return (
    <>
      <TouchableOpacity
        style={styles.button}
        disabled={!offlineSupported || !ready}
        accessibilityRole="button"
        accessibilityLabel={active ? `Cancelar download de ${video.title}` : saved ? 'Abrir downloads' : `Baixar áudio de ${video.title} na melhor qualidade disponível`}
        onPress={() => {
          if (active) downloadService.cancel(video.id);
          else if (saved) router.replace('/downloads');
          else { logDownload('app', video.id, undefined, 'aguardando_playlist'); setChoosePlaylist(true); }
        }}
      >
        <Ionicons name={active ? 'close-circle-outline' : saved ? 'checkmark-circle-outline' : 'cloud-download-outline'} size={24} color={offlineSupported ? '#FFFFFF' : '#777777'} />
        <Text style={styles.label}>{label}</Text>
        {active && <Text style={styles.cancel}>Toque para cancelar</Text>}
      </TouchableOpacity>
      {choosePlaylist && <PlaylistPicker video={video} forDownload onClose={() => { logDownload('app', video.id, undefined, 'selecao_playlist_cancelada'); setChoosePlaylist(false); }} onSaved={(playlist) => {
        logDownload('app', video.id, undefined, 'playlist_selecionada', { playlistId: playlist.id });
        setChoosePlaylist(false);
        void downloadService.start(video);
      }} />}
    </>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', justifyContent: 'center', minHeight: 48, flex: 1, gap: 4, paddingHorizontal: 4 },
  label: { color: '#FFFFFF', fontSize: 12, textAlign: 'center' },
  cancel: { color: '#AAAAAA', fontSize: 10, textAlign: 'center' },
});
