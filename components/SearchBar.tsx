import React, { useState } from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SearchBarProps {
  onSearch: (query: string) => void;
  placeholder?: string;
  initialQuery?: string;
}

export default function SearchBar({ onSearch, placeholder = 'Pesquisar...', initialQuery = '' }: SearchBarProps) {
  const [query, setQuery] = useState(initialQuery);

  const handleSearch = () => {
    if (query.trim()) {
      onSearch(query.trim());
    }
  };

  const handleClear = () => {
    setQuery('');
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity onPress={handleSearch} style={styles.searchButton} accessibilityRole="button" accessibilityLabel="Buscar vídeos">
        <Ionicons name="search" size={20} color="#AAAAAA" />
      </TouchableOpacity>
      <TextInput
        style={styles.input}
        value={query}
        onChangeText={setQuery}
        placeholder={placeholder}
        accessibilityLabel="Pesquisar vídeos"
        placeholderTextColor="#AAAAAA"
        onSubmitEditing={handleSearch}
        returnKeyType="search"
      />
      {query.length > 0 && (
        <TouchableOpacity onPress={handleClear} style={styles.clearButton} accessibilityRole="button" accessibilityLabel="Limpar pesquisa">
          <Ionicons name="close-circle" size={20} color="#AAAAAA" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F1F1F',
    borderRadius: 8,
    paddingHorizontal: 8,
    minHeight: 48,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  searchButton: { minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
  },
  clearButton: {
    minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center',
  },
});
