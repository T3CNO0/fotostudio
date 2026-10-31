import { redis, json, body, wrap, hashPassword, isEmail, publicUser, requireUser } from './_lib/common.js';

export default wrap(async (req, res) => {
  const me = await requireUser(req, res, { admin: true }); if (!me) return;

  if (req.method === 'GET') {
    const emails = await redis.smembers('users');
    const users = emails.length ? await redis.mget(...emails.map(e => `user:${e}`)) : [];
    return json(res, 200, { users: users.filter(Boolean).map(publicUser).sort((a, b) => a.createdAt - b.createdAt) });
  }

  const b = body(req);

  if (req.method === 'POST') {            // convidar / criar usuário
    const email = String(b.email || '').trim().toLowerCase();
    const name = String(b.name || '').trim().slice(0, 80) || email.split('@')[0];
    const role = b.role === 'admin' ? 'admin' : 'fotografo';
    if (!isEmail(email)) return json(res, 400, { error: 'E-mail inválido.' });
    if (String(b.password || '').length < 8) return json(res, 400, { error: 'A senha precisa ter ao menos 8 caracteres.' });
    if (await redis.get(`user:${email}`)) return json(res, 409, { error: 'Já existe um usuário com esse e-mail.' });
    const user = { email, name, role, hash: hashPassword(b.password), createdAt: Date.now() };
    await redis.set(`user:${email}`, user);
    await redis.sadd('users', email);
    return json(res, 200, { user: publicUser(user) });
  }

  if (req.method === 'PATCH') {           // redefinir senha / papel
    const email = String(b.email || '').trim().toLowerCase();
    const u = await redis.get(`user:${email}`);
    if (!u) return json(res, 404, { error: 'Usuário não encontrado.' });
    const next = { ...u };
    if (b.password) {
      if (String(b.password).length < 8) return json(res, 400, { error: 'A senha precisa ter ao menos 8 caracteres.' });
      next.hash = hashPassword(b.password);
    }
    if (b.role && email !== me.email) next.role = b.role === 'admin' ? 'admin' : 'fotografo';
    if (b.name) next.name = String(b.name).trim().slice(0, 80);
    await redis.set(`user:${email}`, next);
    return json(res, 200, { user: publicUser(next) });
  }

  if (req.method === 'DELETE') {
    const email = String(req.query.email || '').trim().toLowerCase();
    if (email === me.email) return json(res, 400, { error: 'Você não pode remover a si mesmo.' });
    if (!(await redis.get(`user:${email}`))) return json(res, 404, { error: 'Usuário não encontrado.' });
    // galerias do usuário removido passam para quem o removeu
    const ids = await redis.smembers('galleries');
    for (const id of ids) {
      const g = await redis.get(`gal:${id}`);
      if (g && g.owner === email) await redis.set(`gal:${id}`, { ...g, owner: me.email });
    }
    await redis.del(`user:${email}`);
    await redis.srem('users', email);
    return json(res, 200, { ok: true });
  }

  json(res, 405, { error: 'Método não permitido.' });
});
