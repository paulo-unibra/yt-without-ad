const express = require('express');
const { KEYS, validDocument } = require('./library-database');

function createLibraryRouter(database) {
  const router = express.Router();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const token = req.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    if (!token) return res.status(401).json({ error: 'Identificação da biblioteca ausente ou inválida.' });
    req.libraryToken = token;
    next();
  });
  router.param('key', (req, res, next, key) => KEYS.has(key) ? next() : res.status(404).json({ error: 'Coleção não encontrada.' }));
  router.get('/:key', (req, res, next) => {
    try { res.json(database.get(req.libraryToken, req.params.key)); } catch (error) { next(error); }
  });
  router.put('/:key', (req, res, next) => {
    const { value, revision } = req.body || {};
    if (!Number.isSafeInteger(revision) || revision < 0 || !validDocument(req.params.key, value)) {
      return res.status(400).json({ error: 'Dados da biblioteca inválidos.' });
    }
    try {
      const result = database.put(req.libraryToken, req.params.key, value, revision);
      if (!result) return res.status(409).json({ error: 'A biblioteca foi atualizada. Reabra a lista e tente salvar novamente.' });
      res.json(result);
    } catch (error) { next(error); }
  });
  return router;
}

module.exports = { createLibraryRouter };
