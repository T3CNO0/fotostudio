import { redis, json, body, wrap, STUDIO, missingEnv, clientIp, rateLimit, hashPassword, verifyPassword,
  safeEqual, startSession, endSession, currentUser, publicUser, requireUser } from './_lib/common.js';

export default wrap(async (req, res) => {
  const action = req.query.action;

  if (action === 'health') return json(res, 200, { ok: true, studio: STUDIO, missing: missingEnv() });

  if (action === 'me') {
    const u = await currentUser(req);
    return json(res, 200, { user: publicUser(u), studio: STUDIO });
  }

  if (action === 'logout') { endSession(res); return json(res, 200, { ok: true }); }

  if (action === 'login' && req.method === 'POST') {
    const { email = '', password = '' } = body(req);
    const mail = String(email).trim().toLowerCase();
    if (!mail || !password) return json(res, 400, { error: 'Informe e-mail e senha.' });
    if (!(await rateLimit(`login:${clientIp(req)}:${mail}`, 8, 900)))
      return json(res, 429, { error: 'Muitas tentativas. Aguarde 15 minutos.' });

    let user = await redis.get(`user:${mail}`);

    // Primeiro acesso: cria o administrador a partir das variáveis de ambiente
    if (!user && mail === String(process.env.ADMIN_EMAIL).trim().toLowerCase()
        && safeEqual(password, process.env.ADMIN_PASSWORD)) {
      user = { email: mail, name: 'Administrador', role: 'admin', hash: hashPassword(password), createdAt: Date.now() };
      await redis.set(`user:${mail}`, user);
      await redis.sadd('users', mail);
    }

    if (!user || !verifyPassword(password, user.hash))
      return json(res, 401, { error: 'E-mail ou senha incorretos.' });

    startSession(res, user.email);
    return json(res, 200, { user: publicUser(user), studio: STUDIO });
  }

  if (action === 'password' && req.method === 'POST') {
    const u = await requireUser(req, res); if (!u) return;
    const { current = '', next = '' } = body(req);
    if (!verifyPassword(current, u.hash)) return json(res, 400, { error: 'Senha atual incorreta.' });
    if (String(next).length < 8) return json(res, 400, { error: 'A nova senha precisa ter ao menos 8 caracteres.' });
    await redis.set(`user:${u.email}`, { ...u, hash: hashPassword(next) });
    return json(res, 200, { ok: true });
  }

  json(res, 404, { error: 'Ação inválida.' });
});
