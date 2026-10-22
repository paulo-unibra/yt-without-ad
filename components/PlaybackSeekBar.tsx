import Slider from '@react-native-community/slider';
import type { PlaybackSeekBarProps } from './PlaybackSeekBar.types';

export default function PlaybackSeekBar(props: PlaybackSeekBarProps) {
  return (
    <Slider
      style={{ width: '100%', height: 48 }}
      minimumValue={0}
      maximumValue={props.duration || 1}
      value={props.value}
      step={Math.min(1, props.duration || 1)}
      disabled={props.disabled}
      tapToSeek
      minimumTrackTintColor={props.disabled ? '#777777' : '#FF0000'}
      maximumTrackTintColor="#777777"
      thumbTintColor={props.disabled ? '#777777' : '#FFFFFF'}
      accessibilityLabel="Posição do vídeo"
      accessibilityHint="Arraste para escolher o trecho do vídeo."
      accessibilityValue={{ min: 0, max: props.duration || 1, now: props.value, text: props.valueText }}
      onSlidingStart={props.onStart}
      onValueChange={props.onChange}
      onSlidingComplete={props.onComplete}
      onTouchCancel={props.onCancel}
    />
  );
}
