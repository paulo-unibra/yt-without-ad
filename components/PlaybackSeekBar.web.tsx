import type { PlaybackSeekBarProps } from './PlaybackSeekBar.types';

const seekKeys = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End']);

export default function PlaybackSeekBar(props: PlaybackSeekBarProps) {
  return (
    <input
      type="range"
      min={0}
      max={props.duration || 1}
      step={Math.min(1, props.duration || 1)}
      value={props.value}
      disabled={props.disabled}
      aria-label="Posição do vídeo"
      aria-valuetext={props.valueText}
      style={{ width: '100%', height: 48, margin: 0, accentColor: '#FF0000', cursor: props.disabled ? 'default' : 'pointer' }}
      onPointerDown={(event) => { if (!props.disabled) props.onStart(Number(event.currentTarget.value)); }}
      onChange={(event) => props.onChange(Number(event.currentTarget.value))}
      onPointerUp={(event) => props.onComplete(Number(event.currentTarget.value))}
      onPointerCancel={props.onCancel}
      onKeyDown={(event) => { if (seekKeys.has(event.key) && !event.repeat) props.onStart(Number(event.currentTarget.value)); }}
      onKeyUp={(event) => { if (seekKeys.has(event.key)) props.onComplete(Number(event.currentTarget.value)); }}
      onBlur={props.onCancel}
    />
  );
}
