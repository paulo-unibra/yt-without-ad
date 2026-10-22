export function createDownloadId(): string;
export function sanitizeLogText(value: unknown): string;
export function downloadErrorDetails(error: unknown): Record<string, unknown>;
export function logDownload(scope: 'app' | 'backend', videoId: string, downloadId: string | undefined, event: string, details?: Record<string, unknown>, level?: 'info' | 'warn' | 'error'): void;
