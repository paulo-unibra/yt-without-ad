import { databaseStorage } from './database';
import { Video } from '../types/video';

const STORAGE_KEYS = {
  WATCH_HISTORY: '@watch_history',
  FAVORITES: '@favorites',
  SEARCH_HISTORY: '@search_history',
};

export class StorageService {
  private operations: Promise<unknown> = Promise.resolve();
  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operations.then(operation);
    this.operations = result.catch(() => undefined);
    return result;
  }
  async getWatchHistory(): Promise<Video[]> {
    try {
      const history = await databaseStorage.getItem(STORAGE_KEYS.WATCH_HISTORY);
      const parsed: unknown = history ? JSON.parse(history) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((video): video is Video => video && typeof video === 'object'
        && ['id', 'title', 'description', 'thumbnail', 'channelTitle', 'channelId', 'publishedAt']
          .every((key) => typeof video[key] === 'string')
        && /^[\w-]{11}$/.test(video.id));
    } catch (error) {
      console.error('Error getting watch history:', error);
      return [];
    }
  }

  async addToWatchHistory(video: Video): Promise<void> {
    return this.exclusive(async () => {
    try {
      const history = await this.getWatchHistory();
      const filtered = history.filter(v => v.id !== video.id);
      const newHistory = [video, ...filtered].slice(0, 50);
      await databaseStorage.setItem(STORAGE_KEYS.WATCH_HISTORY, JSON.stringify(newHistory));
    } catch (error) {
      console.error('Error adding to watch history:', error);
    }
    });
  }

  async getFavorites(): Promise<Video[]> {
    try {
      const favorites = await databaseStorage.getItem(STORAGE_KEYS.FAVORITES);
      return favorites ? JSON.parse(favorites) : [];
    } catch (error) {
      console.error('Error getting favorites:', error);
      return [];
    }
  }

  async addToFavorites(video: Video): Promise<void> {
    return this.exclusive(async () => {
    try {
      const favorites = await this.getFavorites();
      const exists = favorites.some(v => v.id === video.id);
      if (!exists) {
        favorites.push(video);
        await databaseStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(favorites));
      }
    } catch (error) {
      console.error('Error adding to favorites:', error);
      throw error;
    }
    });
  }

  async removeFromFavorites(videoId: string): Promise<void> {
    return this.exclusive(async () => {
    try {
      const favorites = await this.getFavorites();
      const filtered = favorites.filter(v => v.id !== videoId);
      await databaseStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(filtered));
    } catch (error) {
      console.error('Error removing from favorites:', error);
      throw error;
    }
    });
  }

  async isFavorite(videoId: string): Promise<boolean> {
    try {
      const favorites = await this.getFavorites();
      return favorites.some(v => v.id === videoId);
    } catch (error) {
      console.error('Error checking favorite:', error);
      return false;
    }
  }

  async getSearchHistory(): Promise<string[]> {
    try {
      const history = await databaseStorage.getItem(STORAGE_KEYS.SEARCH_HISTORY);
      return history ? JSON.parse(history) : [];
    } catch (error) {
      console.error('Error getting search history:', error);
      return [];
    }
  }

  async addToSearchHistory(query: string): Promise<void> {
    return this.exclusive(async () => {
    try {
      if (!query.trim()) return;
      
      const history = await this.getSearchHistory();
      const filtered = history.filter(q => q !== query);
      const newHistory = [query, ...filtered].slice(0, 20);
      await databaseStorage.setItem(STORAGE_KEYS.SEARCH_HISTORY, JSON.stringify(newHistory));
    } catch (error) {
      console.error('Error adding to search history:', error);
    }
    });
  }
}

export const storageService = new StorageService();
