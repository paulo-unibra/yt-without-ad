import React, { useState, useEffect } from 'react';
import { View, FlatList, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import SearchBar from '../components/SearchBar';
import VideoCard from '../components/VideoCard';
import { youtubeService } from '../services/youtube';
import { storageService } from '../services/storage';
import { Video } from '../types/video';

async function fetchSearch(query: string, pageToken?: string) {
  await storageService.addToSearchHistory(query);
  const [history, result] = await Promise.all([
    storageService.getSearchHistory(), youtubeService.search(query, pageToken),
  ]);
  return { history, result };
}

export default function Search() {
  const { q } = useLocalSearchParams<{ q?: string }>();
  const initialQuery = typeof q === 'string' ? q.trim() : '';
  return <SearchResults key={initialQuery} initialQuery={initialQuery} />;
}

function SearchResults({ initialQuery }: { initialQuery: string }) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [loading, setLoading] = useState(Boolean(initialQuery));
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [currentQuery, setCurrentQuery] = useState(initialQuery);

  useEffect(() => {
    let active = true;

    storageService.getSearchHistory().then((history) => {
      if (active) setSearchHistory(history);
    });

    return () => {
      active = false;
    };
  }, []);

  const handleSearch = async (query: string, pageToken?: string) => {
    try {
      setLoading(true);
      setCurrentQuery(query);
      const { history, result } = await fetchSearch(query, pageToken);
      setSearchHistory(history);

      if (pageToken) {
        setVideos((prev) => [...prev, ...result.videos]);
      } else {
        setVideos(result.videos);
      }
      
      setNextPageToken(result.nextPageToken);
    } catch (error) {
      console.error('Error searching videos:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!initialQuery) return;
    let active = true;
    void fetchSearch(initialQuery).then(({ history, result }) => {
      if (!active) return;
      setSearchHistory(history);
      setVideos(result.videos);
      setNextPageToken(result.nextPageToken);
    }).catch((error) => console.error('Error searching videos:', error))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [initialQuery]);

  const handleLoadMore = () => {
    if (nextPageToken && !loading && currentQuery) {
      handleSearch(currentQuery, nextPageToken);
    }
  };

  return (
    <View style={styles.container}>
      <SearchBar key={initialQuery} onSearch={handleSearch} initialQuery={initialQuery} />
      
      {videos.length === 0 && !loading && (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>Pesquise por vídeos</Text>
          {searchHistory.length > 0 && (
            <View style={styles.historyContainer}>
              <Text style={styles.historyTitle}>Pesquisas recentes:</Text>
              {searchHistory.slice(0, 5).map((query, index) => (
                <TouchableOpacity 
                  key={index}
                  onPress={() => handleSearch(query)}
                >
                  <Text style={styles.historyItem}>
                    {query}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      )}

      <FlatList
        data={videos}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <VideoCard video={item} />}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
      />
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
  emptyTitle: {
    color: '#AAAAAA',
    fontSize: 18,
    marginBottom: 24,
  },
  historyContainer: {
    width: '100%',
    marginTop: 24,
  },
  historyTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  historyItem: {
    color: '#AAAAAA',
    fontSize: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#303030',
  },
});
