import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatSleepTime } from '../utils/sleep-timer';

interface Props {
  active: boolean;
  remaining: number;
  start(minutes: number): void;
  cancel(): void;
}
export default function SleepTimer({ active, remaining, start, cancel }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [minutes, setMinutes] = useState('30');
  const [error, setError] = useState('');
  const activate = (value: number) => {
    try { start(value); setError(''); setExpanded(false); }
    catch { setError('Informe um tempo de 1 a 720 minutos.'); }
  };
  return <View style={styles.container}>
    <TouchableOpacity style={styles.row} onPress={() => setExpanded(!expanded)} accessibilityRole="button" accessibilityState={{ expanded }}>
      <Ionicons name="moon-outline" size={22} color="#FFFFFF" />
      <View style={styles.info}>
        <Text style={styles.title}>Temporizador de sono</Text>
        <Text style={styles.description}>{active ? `Parar em ${formatSleepTime(remaining)}` : 'Escolha quando encerrar a reprodução'}</Text>
      </View>
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color="#AAAAAA" />
    </TouchableOpacity>
    {expanded && <View style={styles.settings}>
      <View style={styles.options}>{[15, 30, 60, 90].map(value => <TouchableOpacity key={value} style={styles.button} onPress={() => activate(value)} accessibilityRole="button" accessibilityLabel={`Parar em ${value} minutos`}><Text style={styles.title}>{value} min</Text></TouchableOpacity>)}</View>
      <Text style={styles.description}>Tempo personalizado em minutos (1 a 720)</Text>
      <View style={styles.options}>
        <TextInput style={styles.input} value={minutes} onChangeText={setMinutes} keyboardType="number-pad" maxLength={3} accessibilityLabel="Duração em minutos" onSubmitEditing={() => activate(/^\d+$/.test(minutes) ? Number(minutes) : NaN)} />
        <TouchableOpacity style={styles.button} onPress={() => activate(/^\d+$/.test(minutes) ? Number(minutes) : NaN)} accessibilityRole="button"><Text style={styles.title}>{active ? 'Alterar tempo' : 'Iniciar'}</Text></TouchableOpacity>
      </View>
      {!!error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
    </View>}
    {active && <TouchableOpacity style={styles.cancel} onPress={cancel} accessibilityRole="button"><Text style={styles.title}>Cancelar temporizador</Text></TouchableOpacity>}
  </View>;
}
const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#303030' },
  row: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12 },
  info: { flex: 1 },
  title: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  description: { color: '#AAAAAA', fontSize: 13, lineHeight: 20, marginTop: 4 },
  settings: { gap: 12, paddingBottom: 16 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { minHeight: 48, paddingHorizontal: 16, justifyContent: 'center', backgroundColor: '#303030', borderRadius: 8 },
  input: { minHeight: 48, width: 90, borderWidth: 1, borderColor: '#AAAAAA', borderRadius: 8, color: '#FFFFFF', paddingHorizontal: 12, fontSize: 16 },
  cancel: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' },
  error: { color: '#FFB4AB', fontSize: 13 },
});
