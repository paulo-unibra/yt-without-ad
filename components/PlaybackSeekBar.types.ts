export interface PlaybackSeekBarProps {
  value: number;
  duration: number;
  disabled: boolean;
  valueText: string;
  onStart(value: number): void;
  onChange(value: number): void;
  onComplete(value: number): void;
  onCancel(): void;
}
