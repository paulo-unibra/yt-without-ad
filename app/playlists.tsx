import { useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import VideoCard from '../components/VideoCard';
import { usePlaylists } from '../hooks/use-playlists';
import { playlistService } from '../services/playlists';

export default function PlaylistsScreen() {
  const { items, loading, error, refresh } = usePlaylists();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const selected = items.find((playlist) => playlist.id === selectedId);

  if (loading) return <View style={styles.center}><ActivityIndicator color="#FFFFFF" /></View>;
  if (error) return <View style={styles.center}>
    <Text style={styles.subtitle} accessibilityLiveRegion="polite">{error}</Text>
    <TouchableOpacity onPress={() => { void refresh(); }} style={styles.button} accessibilityRole="button"><Text style={styles.text}>Tentar novamente</Text></TouchableOpacity>
  </View>;

  if (selected) return <View style={styles.container}>
    <TouchableOpacity onPress={() => { setSelectedId(null); setActionError(null); }} style={styles.back} accessibilityRole="button" accessibilityLabel="Voltar às playlists">
      <Ionicons name="chevron-back" size={24} color="#FFFFFF" /><Text style={styles.text}>Todas as playlists</Text>
    </TouchableOpacity>
    <FlatList data={selected.videos} keyExtractor={(video) => video.id} contentContainerStyle={styles.content}
      ListHeaderComponent={<View style={styles.heading}>
        <Text style={styles.title}>{selected.name}</Text>
        <Text style={styles.subtitle}>{selected.videos.length} {selected.videos.length === 1 ? 'vídeo' : 'vídeos'} · Para ouvir sem internet, baixe o áudio.</Text>
        {actionError && <Text style={styles.subtitle} accessibilityLiveRegion="polite">{actionError}</Text>}
      </View>}
      ListEmptyComponent={<Text style={styles.subtitle}>Nenhum vídeo nesta playlist. Use Salvar na tela de um vídeo para adicionar.</Text>}
      renderItem={({ item }) => <View style={styles.videoRow}>
        <View style={styles.video}><VideoCard video={item} compact /></View>
        <TouchableOpacity style={styles.iconButton} accessibilityRole="button" accessibilityLabel={`Remover ${item.title} desta playlist`}
          onPress={() => { void playlistService.removeVideo(selected.id, item.id).catch(() => setActionError('Não foi possível remover o vídeo. Tente novamente.')); }}>
          <Ionicons name="remove-circle-outline" size={24} color="#AAAAAA" />
        </TouchableOpacity>
      </View>} />
  </View>;

  return <View style={styles.container}>
    <FlatList data={items} keyExtractor={(playlist) => playlist.id} contentContainerStyle={styles.content}
      ListHeaderComponent={<View style={styles.heading}><Text style={styles.title}>Suas playlists</Text><Text style={styles.subtitle}>Organize os vídeos que você quer ouvir.</Text></View>}
      ListEmptyComponent={<View style={styles.empty}><Ionicons name="list-outline" size={48} color="#AAAAAA" /><Text style={styles.text}>Nenhuma playlist ainda</Text><Text style={styles.subtitle}>Abra um vídeo, toque em Salvar e escolha um nome para sua primeira playlist.</Text></View>}
      renderItem={({ item }) => <TouchableOpacity style={styles.playlistRow} onPress={() => setSelectedId(item.id)} accessibilityRole="button" accessibilityLabel={`Abrir playlist ${item.name}`}>
        <Ionicons name="list-outline" size={28} color="#FFFFFF" />
        <View style={styles.video}><Text style={styles.text}>{item.name}</Text><Text style={styles.subtitle}>{item.videos.length} {item.videos.length === 1 ? 'vídeo' : 'vídeos'}</Text></View>
        <Ionicons name="chevron-forward" size={22} color="#AAAAAA" />
      </TouchableOpacity>} />
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F0F' },
  center: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F0F0F', gap: 16 },
  content: { padding: 16, paddingBottom: 32 },
  heading: { marginBottom: 24, gap: 8 },
  title: { fontSize: 22, fontWeight: '600', color: '#FFFFFF' },
  text: { fontSize: 16, color: '#FFFFFF' },
  subtitle: { fontSize: 14, lineHeight: 21, color: '#AAAAAA' },
  playlistRow: { minHeight: 80, flexDirection: 'row', alignItems: 'center', gap: 16, borderBottomWidth: 1, borderBottomColor: '#303030', paddingVertical: 12 },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 16 },
  video: { flex: 1, minWidth: 0 },
  videoRow: { flexDirection: 'row', gap: 8 },
  iconButton: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  button: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 16 },
  back: { flexDirection: 'row', minHeight: 48, alignItems: 'center', gap: 8, paddingHorizontal: 16 },
});
