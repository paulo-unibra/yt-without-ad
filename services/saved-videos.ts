import { databaseStorage } from './database';
import { SavedVideoLibrary } from '../utils/saved-video-library';

export const savedVideoService = new SavedVideoLibrary({
  read: () => databaseStorage.getItem('@saved_videos'),
  write: raw => databaseStorage.setItem('@saved_videos', raw),
});
