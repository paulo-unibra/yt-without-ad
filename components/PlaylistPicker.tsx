import { useState } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Playlist, Video } from '../types/video';
import { downloadErrorDetails, logDownload } from '../utils/download-diagnostics';
import { playlistService } from '../services/playlists';
import { usePlaylists } from '../hooks/use-playlists';

interface Props {
  video: Video;
  forDownload?: boolean;
  onClose(): void;
  onSaved(playlist: Playlist): void;
}

export default function PlaylistPicker({ video, forDownload = false, onClose, onSaved }: Props) {
  const { items, loading, error: loadError, refresh } = usePlaylists();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (playlist?: Playlist) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const selected = playlist ?? await playlistService.create(name);
      await playlistService.addVideo(selected.id, video);
      Keyboard.dismiss();
      onSaved(selected);
    } catch (cause) {
      if (forDownload) logDownload('app', video.id, undefined, 'salvamento_playlist_falhou', downloadErrorDetails(cause), 'error');
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar. Tente novamente.');
    } finally { setBusy(false); }
  };

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => { if (!busy) onClose(); }}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.dialog} accessibilityViewIsModal>
          <View style={styles.header}>
            <Text style={styles.heading} accessibilityRole="header">{forDownload ? 'Baixar em uma playlist' : 'Salvar em playlist'}</Text>
            <TouchableOpacity disabled={busy} onPress={onClose} style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Cancelar escolha de playlist">
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          <Text style={styles.videoTitle} numberOfLines={2}>{video.title}</Text>
          {loading ? <ActivityIndicator color="#FFFFFF" style={styles.loading} /> : loadError ? (
            <View>
              <Text style={styles.error} accessibilityLiveRegion="polite">{loadError}</Text>
              <TouchableOpacity onPress={() => { void refresh(); }} style={styles.row} accessibilityRole="button"><Text style={styles.text}>Tentar novamente</Text></TouchableOpacity>
            </View>
          ) : (
            <ScrollView style={styles.playlists} keyboardShouldPersistTaps="handled">
              {items.map((playlist) => (
                <TouchableOpacity key={playlist.id} disabled={busy} onPress={() => { void save(playlist); }} style={styles.row}
                  accessibilityRole="button" accessibilityLabel={`Salvar em ${playlist.name}`}>
                  <Ionicons name="list-outline" size={24} color="#FFFFFF" />
                  <View style={styles.playlistInfo}><Text style={styles.text}>{playlist.name}</Text><Text style={styles.secondary}>{playlist.videos.length} {playlist.videos.length === 1 ? 'vídeo' : 'vídeos'}</Text></View>
                  {playlist.videos.some((item) => item.id === video.id) && <Ionicons name="checkmark" size={22} color="#FFFFFF" />}
                </TouchableOpacity>
              ))}
              {items.length === 0 && <Text style={styles.secondary}>Crie sua primeira playlist abaixo.</Text>}
            </ScrollView>
          )}
          <Text style={styles.label}>Nova playlist</Text>
          <TextInput value={name} onChangeText={(value) => { setName(value); setError(null); }} editable={!busy && !loadError} maxLength={60} placeholder="Nome da playlist"
            placeholderTextColor="#AAAAAA" accessibilityLabel="Nome da playlist" style={styles.input} returnKeyType="done"
            onSubmitEditing={() => { void save(); }} />
          {error && <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text>}
          <TouchableOpacity style={[styles.primary, (busy || !!loadError || loading) && styles.disabled]} disabled={busy || !!loadError || loading}
            onPress={() => { void save(); }} accessibilityRole="button">
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{forDownload ? 'Criar e baixar áudio' : 'Criar e salvar'}</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  dialog: { backgroundColor: '#1F1F1F', borderRadius: 12, padding: 20, width: '100%', maxWidth: 440, maxHeight: '90%' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heading: { flex: 1, color: '#FFFFFF', fontSize: 20, fontWeight: '600' },
  iconButton: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  videoTitle: { color: '#AAAAAA', fontSize: 14, lineHeight: 20, marginBottom: 16 },
  playlists: { maxHeight: 220, flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 10 },
  playlistInfo: { flex: 1 },
  text: { color: '#FFFFFF', fontSize: 16 },
  secondary: { color: '#AAAAAA', fontSize: 13, lineHeight: 20 },
  label: { color: '#FFFFFF', fontSize: 14, marginTop: 20, marginBottom: 8 },
  input: { backgroundColor: '#303030', color: '#FFFFFF', minHeight: 48, paddingHorizontal: 12, borderRadius: 8, fontSize: 16 },
  primary: { minHeight: 48, marginTop: 16, backgroundColor: '#B91C1C', borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  primaryText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  error: { color: '#FFFFFF', fontSize: 14, lineHeight: 20, marginTop: 12 },
  loading: { marginVertical: 20 },
});
