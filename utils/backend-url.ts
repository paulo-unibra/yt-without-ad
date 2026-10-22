interface BackendUrlOptions {
  configuredUrl?: string;
  hostUri?: string | null;
  platform: string;
  isDevelopment: boolean;
}

export function resolveBackendUrl({
  configuredUrl,
  hostUri,
  platform,
  isDevelopment,
}: BackendUrlOptions): string | null {
  if (configuredUrl?.trim()) {
    try {
      const url = new URL(configuredUrl.trim());
      if (!['http:', 'https:'].includes(url.protocol)) return null;
      return url.toString().replace(/\/$/, '');
    } catch {
      return null;
    }
  }

  if (!isDevelopment) return null;

  try {
    const url = new URL(hostUri
      ? (hostUri.includes('://') ? hostUri : `http://${hostUri}`)
      : `http://${platform === 'android' ? '10.0.2.2' : 'localhost'}`);

    // O túnel do Metro não encaminha a porta do backend.
    if (url.hostname.endsWith('.exp.direct') || url.hostname.endsWith('.expo.dev')) {
      return null;
    }

    if (platform === 'android' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      url.hostname = '10.0.2.2';
    }
    url.protocol = 'http:';
    url.port = '3001';
    url.pathname = '/';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}
