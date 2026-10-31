import { get, del } from '@vercel/blob';
import { Readable } from 'node:stream';
import { redis, json, body, wrap, newId, requireUser } from './_lib/common.js';

const PATH_OK = (p, gid) => typeof p === 'string' && p.startsWith(`galleries/${gid}/`) && p.length < 300;

async function visibleGalleries(u) {
  const ids = await redis.smembers('galleries');
  if (!ids.length) return [];
  const all = (await redis.mget(...ids.map(i => `gal:${i}`))).filter(Boolean);
  return all.filter(g => u.role === 'admin' || g.owner === u.email).sort((a, b) => b.created - a.created);
}

async function loadOwned(u, id) {
  const g = await redis.get(`gal:${id}`);
  if (!g || (u.role !== 'admin' && g.owner !== u.email)) return null;
  return g;
}

const cleanPhoto = (gid, p) => {
  if (!PATH_OK(p.orig, gid) || !PATH_OK(p.prev, gid)) return null;
  return {
    id: newId(7),
    name: String(p.name || 'foto.jpg').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120),
    w: Math.max(1, Math.min(20000, +p.w || 1200)),
    h: Math.max(1, Math.min(20000, +p.h || 800)),
    orig: p.orig, prev: p.prev,
  };
};

const toView = (g, owners) => ({
  id: g.id, name: g.name, desc: g.desc, limit: g.limit, token: g.token, created: g.created,
  owner: g.owner, ownerName: owners?.[g.owner] || g.owner,
  photos: g.photos.map(p => ({ id: p.id, name: p.name, w: p.w, h: p.h })),
});

export default wrap(async (req, res) => {
  const me = await requireUser(req, res); if (!me) return;
  const action = req.query.action;

  // miniaturas (já com marca d'água) para o painel
  if (req.method === 'GET' && action === 'img') {
    const g = await loadOwned(me, String(req.query.g || ''));
    const p = g?.photos.find(x => x.id === req.query.id);
    if (!p) return json(res, 404, { error: 'Foto não encontrada.' });
    const r = await get(p.prev, { access: 'private' });
    if (!r || r.statusCode !== 200) return json(res, 404, { error: 'Arquivo ausente.' });
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return Readable.fromWeb(r.stream).pipe(res);
  }

  if (req.method === 'GET' && action === 'selections') {
    const list = await visibleGalleries(me);
    const out = [];
    for (const g of list) {
      const ids = await redis.smembers(`dl:${g.id}`);
      if (!ids.length) continue;
      const events = (await redis.lrange(`sel:${g.id}`, 0, 19)).map(e => (typeof e === 'string' ? JSON.parse(e) : e));
      out.push({
        id: g.id, name: g.name, limit: g.limit, total: ids.length,
        photos: g.photos.filter(p => ids.includes(p.id)).map(p => ({ id: p.id, name: p.name, w: p.w, h: p.h })),
        events,
      });
    }
    return json(res, 200, { selections: out });
  }

  if (req.method === 'GET') {
    const list = await visibleGalleries(me);
    let owners = null;
    if (me.role === 'admin') {
      const emails = await redis.smembers('users');
      const us = emails.length ? (await redis.mget(...emails.map(e => `user:${e}`))).filter(Boolean) : [];
      owners = Object.fromEntries(us.map(u => [u.email, u.name]));
    }
    const withCounts = await Promise.all(list.map(async g => ({ ...toView(g, owners), downloaded: await redis.scard(`dl:${g.id}`) })));
    return json(res, 200, { galleries: withCounts });
  }

  const b = body(req);

  if (req.method === 'POST' && action === 'addphotos') {
    const g = await loadOwned(me, String(b.g || ''));
    if (!g) return json(res, 404, { error: 'Galeria não encontrada.' });
    const add = (b.photos || []).map(p => cleanPhoto(g.id, p)).filter(Boolean);
    g.photos.push(...add);
    await redis.set(`gal:${g.id}`, g);
    return json(res, 200, { added: add.length });
  }

  if (req.method === 'POST') {
    const id = String(b.id || '');
    if (!/^[A-Za-z0-9_-]{8,40}$/.test(id) || (await redis.get(`gal:${id}`))) return json(res, 400, { error: 'Identificador inválido.' });
    const name = String(b.name || '').trim().slice(0, 100);
    if (!name) return json(res, 400, { error: 'Dê um nome à galeria.' });
    const photos = (b.photos || []).map(p => cleanPhoto(id, p)).filter(Boolean);
    if (!photos.length) return json(res, 400, { error: 'Adicione ao menos uma foto.' });
    const g = {
      id, name, owner: me.email, created: Date.now(), token: newId(18),
      desc: String(b.desc || '').trim().slice(0, 200) || 'Escolha suas fotos favoritas',
      limit: Math.max(0, Math.min(5000, parseInt(b.limit) || 0)),
      photos,
    };
    await redis.set(`gal:${id}`, g);
    await redis.set(`gtoken:${g.token}`, id);
    await redis.sadd('galleries', id);
    return json(res, 200, { gallery: toView(g) });
  }

  if (req.method === 'PATCH') {
    const g = await loadOwned(me, String(b.g || ''));
    if (!g) return json(res, 404, { error: 'Galeria não encontrada.' });
    if (b.name !== undefined) g.name = String(b.name).trim().slice(0, 100) || g.name;
    if (b.desc !== undefined) g.desc = String(b.desc).trim().slice(0, 200);
    if (b.limit !== undefined) g.limit = Math.max(0, Math.min(5000, parseInt(b.limit) || 0));
    if (b.resetDownloads) { await redis.del(`dl:${g.id}`); await redis.del(`sel:${g.id}`); }
    if (b.newLink) { await redis.del(`gtoken:${g.token}`); g.token = newId(18); await redis.set(`gtoken:${g.token}`, g.id); }
    await redis.set(`gal:${g.id}`, g);
    return json(res, 200, { gallery: toView(g) });
  }

  if (req.method === 'DELETE') {
    const g = await loadOwned(me, String(req.query.g || ''));
    if (!g) return json(res, 404, { error: 'Galeria não encontrada.' });
    const photoId = req.query.photo;
    if (photoId) {
      const p = g.photos.find(x => x.id === photoId);
      if (!p) return json(res, 404, { error: 'Foto não encontrada.' });
      await del([p.orig, p.prev]).catch(() => {});
      g.photos = g.photos.filter(x => x.id !== photoId);
      await redis.srem(`dl:${g.id}`, photoId);
      await redis.set(`gal:${g.id}`, g);
      return json(res, 200, { ok: true });
    }
    await del(g.photos.flatMap(p => [p.orig, p.prev])).catch(() => {});
    await redis.del(`gal:${g.id}`, `gtoken:${g.token}`, `dl:${g.id}`, `sel:${g.id}`);
    await redis.srem('galleries', g.id);
    return json(res, 200, { ok: true });
  }

  json(res, 405, { error: 'Método não permitido.' });
});
