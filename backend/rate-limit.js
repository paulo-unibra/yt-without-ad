// Janela curta e memória limitada, inclusive quando IPs aleatórios são enviados.
function rateLimit({ limit = 120, windowMs = 60000 } = {}) {
  const clients = new Map();
  return (req, res, next) => {
    const now = Date.now(), key = req.ip;
    let entry = clients.get(key);
    if (!entry || entry.until <= now) {
      if (clients.size >= 10000) clients.delete(clients.keys().next().value);
      entry = { count: 0, until: now + windowMs };
      clients.set(key, entry);
    }
    if (++entry.count > limit) return res.set('Retry-After', String(Math.ceil((entry.until - now) / 1000)))
      .status(429).json({ error: 'Muitas solicitações. Aguarde um minuto e tente novamente.' });
    next();
  };
}
module.exports = { rateLimit };
