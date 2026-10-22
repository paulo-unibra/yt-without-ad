import React, { useState, useEffect } from 'react';
import { View, FlatList, StyleSheet, Text } from 'react-native';
import VideoCard from '../components/VideoCard';
import { storageService } from '../services/storage';
import { Video } from '../types/video';

export default function Favorites() {
  const [favorites, setFavorites] = useState<Video[]>([]);

  useEffect(() => {
    let active = true;

    const loadFavorites = async () => {
      const favs = await storageService.getFavorites();
      if (active) setFavorites(favs);
    };

    void loadFavorites();

    return () => {
      active = false;
    };
  }, []);

  return (
    <View style={styles.container}>
      {favorites.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Nenhum vídeo favorito ainda</Text>
        </View>
      ) : (
        <FlatList
          data={favorites}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <VideoCard video={item} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F0F0F',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    color: '#AAAAAA',
    fontSize: 16,
  },
});
