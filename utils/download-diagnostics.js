function createDownloadId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function sanitizeLogText(value) {
  return String(value)
    .replace(/(?:https?|file):\/\/[^\s"'<>]+/gi, '[endereço remoto]')
    .replace(/\b(authorization|cookie|set-cookie)\s*:\s*[^\r\n]+/gi, '$1=[oculto]')
    .replace(/\bBearer\s+[\w.~+\/-]+=*/gi, 'Bearer [oculto]')
    .replace(/\b(authorization|cookie|set-cookie|token|signature|sig|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, '$1=[oculto]')
    .slice(0, 1500);
}

function sanitizeDetails(value, seen = new Set(), depth = 0) {
  if (typeof value === 'string') return sanitizeLogText(value);
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value === undefined) return undefined;
  if (depth >= 5 || seen.has(value)) return '[detalhes limitados]';
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 12).map(item => sanitizeDetails(item, seen, depth + 1));
  if (typeof value !== 'object') return String(value);
  return Object.fromEntries(Object.entries(value).slice(0, 24).map(([key, item]) => [key,
    /^(authorization|cookie|set-cookie|token|signature|sig|api[_-]?key|headers|config|request|url)$/i.test(key)
      ? '[oculto]' : sanitizeDetails(item, seen, depth + 1),
  ]));
}

function downloadErrorDetails(error, seen = new Set()) {
  if (!error || typeof error !== 'object') return { message: sanitizeLogText(error) };
  if (seen.has(error) || seen.size >= 6) return { message: '[causa circular ou limitada]' };
  seen.add(error);
  return sanitizeDetails({
    name: error.name,
    code: error.code,
    message: error.message,
    httpStatus: error.response?.status ?? error.statusCode ?? error.status,
    serverCode: error.response?.data?.code,
    serverMessage: error.response?.data?.error,
    cause: error.cause ? downloadErrorDetails(error.cause, seen) : undefined,
    nativeError: error.nativeError ? downloadErrorDetails(error.nativeError, seen) : undefined,
  });
}

function logDownload(scope, videoId, downloadId, event, details = {}, level = 'info') {
  const safeId = value => String(value || '-').replace(/[^\w-]/g, '?').slice(0, 64);
  const prefix = `[Download][${scope}][${safeId(videoId)}][${safeId(downloadId)}] ${event}`;
  const write = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  write(`${prefix} ${JSON.stringify(sanitizeDetails(details))}`);
}

module.exports = { createDownloadId, sanitizeLogText, downloadErrorDetails, logDownload };
