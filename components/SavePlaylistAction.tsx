import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Video } from '../types/video';
import PlaylistPicker from './PlaylistPicker';

export default function SavePlaylistAction({ video }: { video: Video }) {
  const [open, setOpen] = useState(false);
  const [savedIn, setSavedIn] = useState<string | null>(null);
  return <>
    <TouchableOpacity style={styles.button} onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`Salvar ${video.title} em uma playlist`}>
      <Ionicons name="list-outline" size={24} color="#FFFFFF" />
      <Text style={styles.label}>{savedIn ? 'Salvo' : 'Salvar'}</Text>
    </TouchableOpacity>
    {open && <PlaylistPicker video={video} onClose={() => setOpen(false)} onSaved={(playlist) => { setSavedIn(playlist.name); setOpen(false); }} />}
  </>;
}
const styles = StyleSheet.create({
  button: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 48, gap: 4, paddingHorizontal: 4 },
  label: { color: '#FFFFFF', fontSize: 12 },
});
