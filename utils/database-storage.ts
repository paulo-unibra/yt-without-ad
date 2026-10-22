interface Document { value: unknown; revision: number }
interface Cache { raw: string | null; revision: number }
interface DatabaseStoragePorts {
  readLocal(key: string): Promise<string | null>;
  writeLocal(key: string, raw: string): Promise<void>;
  get(key: string): Promise<Document>;
  put(key: string, value: unknown, revision: number): Promise<Document>;
  isUnavailable(error: unknown): boolean;
}

// Cada documento tem uma revisão: uma cópia antiga nunca substitui dados novos.
// O cache permite leitura offline; alterações só são confirmadas após o banco salvar.
export class DatabaseStorage {
  private ports: DatabaseStoragePorts;
  private operations: Promise<unknown> = Promise.resolve();
  private cache = new Map<string, Cache>();
  constructor(ports: DatabaseStoragePorts) { this.ports = ports; }
  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operations.then(operation);
    this.operations = result.catch(() => undefined);
    return result;
  }
  private async cached(key: string): Promise<Cache | null> {
    if (this.cache.has(key)) return this.cache.get(key)!;
    const raw = await this.ports.readLocal(`@database:${key}`);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Cache;
    if (!Number.isSafeInteger(parsed.revision) || parsed.revision < 0
      || (parsed.raw !== null && typeof parsed.raw !== 'string')) throw new Error('Cache da biblioteca inválido.');
    this.cache.set(key, parsed);
    return parsed;
  }
  private async remember(key: string, document: Document) {
    const cached = { raw: document.value === null ? null : JSON.stringify(document.value), revision: document.revision };
    // O banco já confirmou o commit mesmo se o cache local não puder ser gravado.
    this.cache.set(key, cached);
    try { await this.ports.writeLocal(`@database:${key}`, JSON.stringify(cached)); }
    catch { console.warn('[Biblioteca] Dados salvos no banco; não foi possível atualizar o cache offline.'); }
    return cached;
  }
  private async read(key: string): Promise<Cache> {
    const cached = await this.cached(key);
    try {
      let document = await this.ports.get(key);
      if (document.value === null && cached === null) {
        const legacy = await this.ports.readLocal(`@${key}`);
        if (legacy !== null) document = await this.ports.put(key, JSON.parse(legacy), document.revision);
      }
      return await this.remember(key, document);
    } catch (error) {
      if (!this.ports.isUnavailable(error)) throw error;
      if (cached !== null) return cached;
      // Preserva a biblioteca antiga enquanto aguarda a primeira conexão.
      return { raw: await this.ports.readLocal(`@${key}`), revision: 0 };
    }
  }
  getItem(key: string): Promise<string | null> {
    return this.exclusive(async () => (await this.read(key.replace(/^@/, ''))).raw);
  }
  setItem(key: string, raw: string): Promise<void> {
    return this.exclusive(async () => {
      const name = key.replace(/^@/, '');
      const cached = await this.cached(name) ?? await this.read(name);
      if (cached.revision > 0 && cached.raw === raw) return;
      const document = await this.ports.put(name, JSON.parse(raw), cached.revision);
      await this.remember(name, document);
    });
  }
}
