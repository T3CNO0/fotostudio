import { get } from '@vercel/blob';
import { ZipArchive } from 'archiver';
import { Readable } from 'node:stream';
import { redis, json, body, wrap, STUDIO, clientIp, rateLimit, slug } from './_lib/common.js';

async function galleryByToken(t) {
  if (!/^[A-Za-z0-9_-]{10,60}$/.test(String(t || ''))) return null;
  const id = await redis.get(`gtoken:${t}`);
  return id ? await redis.get(`gal:${id}`) : null;
}

export default wrap(async (req, res) => {
  const q = req.query;
  const b = body(req);
  const action = q.action || b.action;
  const t = q.t || b.t;

  const g = await galleryByToken(t);
  if (!g) return json(res, 404, { error: 'Galeria não encontrada ou link expirado.' });

  // ── dados da galeria (sem caminhos dos arquivos originais) ──
  if (action === 'gallery') {
    const downloaded = await redis.smembers(`dl:${g.id}`);
    return json(res, 200, {
      studio: STUDIO, name: g.name, desc: g.desc, limit: g.limit,
      photos: g.photos.map(p => ({ id: p.id, w: p.w, h: p.h })),
      downloaded,
    });
  }

  // ── prévia com marca d'água embutida ──
  if (action === 'img') {
    const p = g.photos.find(x => x.id === q.id);
    if (!p) return json(res, 404, { error: 'Foto não encontrada.' });
    const r = await get(p.prev, { access: 'private' });
    if (!r || r.statusCode !== 200) return json(res, 404, { error: 'Arquivo ausente.' });
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=600');
    res.setHeader('Content-Disposition', 'inline; filename="preview.jpg"');
    return Readable.fromWeb(r.stream).pipe(res);
  }

  // ── download: ZIP somente com as fotos escolhidas, respeitando o limite ──
  if (action === 'download' && (req.method === 'POST' || req.method === 'GET')) {
    if (!(await rateLimit(`dl:${clientIp(req)}:${g.id}`, 20, 3600)))
      return json(res, 429, { error: 'Muitos downloads em pouco tempo. Tente novamente mais tarde.' });

    const raw = b.ids ?? q.ids ?? '';
    const ids = [...new Set((Array.isArray(raw) ? raw : String(raw).split(',')).map(s => s.trim()).filter(Boolean))];
    if (!ids.length) return json(res, 400, { error: 'Nenhuma foto selecionada.' });

    const chosen = ids.map(id => g.photos.find(p => p.id === id));
    if (chosen.some(p => !p)) return json(res, 400, { error: 'Seleção inválida.' });

    // limite vale para o total de fotos distintas já baixadas nesta galeria
    const already = await redis.smembers(`dl:${g.id}`);
    const total = new Set([...already, ...ids]);
    if (g.limit > 0 && total.size > g.limit)
      return json(res, 400, { error: `O limite desta galeria é de ${g.limit} fotos (você já baixou ${already.length}).` });

    await redis.sadd(`dl:${g.id}`, ...ids);
    await redis.lpush(`sel:${g.id}`, JSON.stringify({ date: Date.now(), count: ids.length, ids }));
    await redis.ltrim(`sel:${g.id}`, 0, 49);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${slug(g.name)}-fotos.zip"`);
    res.setHeader('Cache-Control', 'no-store');

    const zip = new ZipArchive({ store: true });
    zip.on('error', () => res.destroy());
    zip.pipe(res);

    const used = new Set();
    for (const p of chosen) {
      const r = await get(p.orig, { access: 'private' });
      if (!r || r.statusCode !== 200) continue;
      let name = p.name, n = 1;
      while (used.has(name.toLowerCase())) { const i = p.name.lastIndexOf('.'); name = i > 0 ? `${p.name.slice(0, i)}-${++n}${p.name.slice(i)}` : `${p.name}-${++n}`; }
      used.add(name.toLowerCase());
      await new Promise((ok, fail) => {
        zip.once('entry', ok); zip.once('error', fail);
        zip.append(Readable.fromWeb(r.stream), { name });
      });
    }
    await zip.finalize();
    return;
  }

  json(res, 404, { error: 'Ação inválida.' });
});
