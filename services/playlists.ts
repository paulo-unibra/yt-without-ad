import { databaseStorage } from './database';
import { PlaylistLibrary } from '../utils/playlist-library';

export const playlistService = new PlaylistLibrary({
  read: () => databaseStorage.getItem('@playlists'),
  write: (raw) => databaseStorage.setItem('@playlists', raw),
});
