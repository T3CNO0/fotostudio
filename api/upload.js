import { handleUpload } from '@vercel/blob/client';
import { json, body, wrap, requireUser } from './_lib/common.js';

export default wrap(async (req, res) => {
  if (req.method !== 'POST') return json(res, 405, { error: 'Método não permitido.' });
  const b = body(req);

  // Só quem está logado gera tokens de upload (o callback de conclusão vem da Vercel, assinado)
  if (b.type === 'blob.generate-client-token') {
    const u = await requireUser(req, res); if (!u) return;
  }

  const out = await handleUpload({
    body: b,
    request: req,
    onBeforeGenerateToken: async (pathname) => {
      if (!/^galleries\/[A-Za-z0-9_-]{8,40}\/[A-Za-z0-9_.-]+$/.test(pathname)) throw new Error('Caminho inválido.');
      return {
        allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
        maximumSizeInBytes: 80 * 1024 * 1024,
        addRandomSuffix: true,
      };
    },
    onUploadCompleted: async () => {},
  });
  json(res, 200, out);
});
