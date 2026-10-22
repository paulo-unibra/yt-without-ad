function details(error: unknown, visited = new Set<unknown>()): string[] {
  if (!error || visited.has(error) || visited.size >= 8) return [];
  visited.add(error);
  if (typeof error === 'string') return [error];
  if (typeof error !== 'object') return [];
  const record = error as Record<string, unknown>;
  return [
    typeof record.message === 'string' ? record.message : '',
    typeof record.code === 'string' ? record.code : '',
    ...details(record.cause, visited),
    ...details(record.nativeError, visited),
  ].filter(Boolean);
}

export function downloadErrorMessage(error: unknown): string {
  const messages = details(error);
  const text = messages.join('\n');
  if (/ENOSPC|no space left|disk.*full|not enough.*space|espaço insuficiente/i.test(text)) {
    return 'Espaço insuficiente no aparelho. Exclua um download para liberar espaço.';
  }
  if (/permission denied|EACCES|EPERM|Missing.*permission/i.test(text)) {
    return 'Não foi possível gravar na pasta do app. Feche e abra o app e tente novamente.';
  }
  const status = Number(text.match(/(?:HTTP(?:\s+Error)?\s*|status(?:\s+code)?\s*[:=]?\s*)(\d{3})/i)?.[1]);
  if ([401, 403, 404, 410].includes(status)) {
    return `O servidor recusou o download (HTTP ${status}). Tente novamente para preparar um novo link.`;
  }
  if (status === 429) return 'O YouTube limitou os downloads. Aguarde alguns minutos e tente novamente.';
  if (status === 502) return 'O backend não conseguiu obter o vídeo do YouTube. Tente novamente.';
  if (status === 504 || /timed?\s*out|timeout|ETIMEDOUT/i.test(text)) {
    return 'O download ficou sem resposta. Verifique a conexão e tente novamente.';
  }
  if (/network|unable to resolve host|connect|ENOTFOUND|ECONN|SSL|certificate|CLEARTEXT/i.test(text)) {
    return 'Não foi possível conectar para baixar. Verifique a conexão e se o backend está acessível.';
  }
  const specific = messages.filter((message) => !/^ERR_/.test(message))
    .map((message) => message.split(/(?:→\s*)?Caused by:\s*/i).at(-1)?.trim())
    .find((message) => message && !/FileSystemDownloadTask.*rejected/i.test(message));
  if (!specific) {
    return 'Não foi possível iniciar o download. Verifique a conexão, mantenha o backend aberto e tente novamente.';
  }
  return specific.replace(/https?:\/\/[^\s"'<>]+/gi, '[endereço remoto]').slice(0, 350);
}
