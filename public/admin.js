import { $, $$, esc, ico, ornament, api, toast, rid, fmtDate } from './common.js';

const BLOB_CLIENT = 'https://esm.sh/@vercel/blob@2.8.2/client';
let ME = null, STUDIO = 'FotoStudio', tab = 'galleries';
const S = { galleries: [], selections: [], users: [] };
const root = () => $('#root');

export async function startAdmin() {
  document.title = 'Painel do Fotógrafo';
  try { const r = await api('/api/auth?action=me'); STUDIO = r.studio; ME = r.user; } catch {}
  ME ? shell() : loginView();
}

/* ───────────── login ───────────── */
async function loginView() {
  root().innerHTML = `
  <div id="login"><div class="card login-card fade-up">
    <div class="logo-script">${esc(STUDIO)}</div>
    <div class="sub">Painel do Fotógrafo</div>
    ${ornament}
    <div id="cfg"></div>
    <form id="lf">
      <div class="field"><label>E-mail</label><input type="email" id="le" autocomplete="username" required></div>
      <div class="field"><label>Senha</label><input type="password" id="lp" autocomplete="current-password" required></div>
      <button class="btn gold block" id="lb">Entrar</button>
      <div class="err" id="lerr"></div>
    </form>
  </div></div>`;
  api('/api/auth?action=health').then(h => {
    if (h.missing?.length) $('#cfg').innerHTML = `<div class="warn"><b>Falta configurar na Vercel:</b><br>${h.missing.map(esc).join('<br>')}</div>`;
  }).catch(() => {});
  $('#lf').onsubmit = async e => {
    e.preventDefault(); $('#lerr').textContent = ''; $('#lb').disabled = true;
    try {
      const r = await api('/api/auth?action=login', { method: 'POST', body: { email: $('#le').value, password: $('#lp').value } });
      ME = r.user; shell();
    } catch (er) { $('#lerr').textContent = er.message; }
    $('#lb') && ($('#lb').disabled = false);
  };
}

async function logout() { await api('/api/auth?action=logout').catch(() => {}); ME = null; loginView(); }

/* ───────────── estrutura ───────────── */
function shell() {
  root().innerHTML = `
  <div class="topbar">
    <div class="brand"><span class="logo-script">${esc(STUDIO)}</span><small>Painel</small></div>
    <div class="who"><span class="nm">${esc(ME.name)}${ME.role === 'admin' ? ' · admin' : ''}</span><div class="avatar">${esc(ME.name[0].toUpperCase())}</div>
      <button class="btn sm" id="out">Sair</button></div>
  </div>
  <nav class="tabs" id="tabs">
    <button class="tab" data-t="galleries">Galerias</button>
    <button class="tab" data-t="selections">Fotos baixadas pelos clientes</button>
    ${ME.role === 'admin' ? '<button class="tab" data-t="team">Equipe</button>' : ''}
    <button class="tab" data-t="account">Minha conta</button>
  </nav>
  <div class="wrap" id="view"></div>`;
  $('#out').onclick = logout;
  $('#tabs').onclick = e => { const b = e.target.closest('.tab'); if (b) go(b.dataset.t); };
  go(tab);
}

function go(t) {
  tab = t;
  $$('.tab').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  ({ galleries: viewGalleries, selections: viewSelections, team: viewTeam, account: viewAccount })[t]();
}

const guard = fn => async (...a) => { try { return await fn(...a); } catch (e) { if (e.status === 401) { ME = null; loginView(); } else toast(e.message); } };
const imgUrl = (g, id) => `/api/galleries?action=img&g=${g}&id=${id}`;

function modal(html) {
  const ov = document.createElement('div'); ov.className = 'ov';
  ov.innerHTML = `<div class="card modal"><button class="btn icon-btn close" aria-label="Fechar">${ico('x')}</button>${html}</div>`;
  document.body.appendChild(ov);
  const close = () => ov.remove();
  $('.close', ov).onclick = close;
  ov.addEventListener('mousedown', e => { if (e.target === ov) close(); });
  return { el: ov, close, $: s => $(s, ov) };
}

/* ───────────── galerias ───────────── */
const viewGalleries = guard(async function () {
  $('#view').innerHTML = `<div class="head"><div><h2>Minhas galerias</h2><p>Crie galerias, envie as fotos e compartilhe o link com o cliente.</p></div>
    <button class="btn gold" id="ng">${ico('plus')} Nova galeria</button></div><div id="gl"><div class="empty"><p>Carregando…</p></div></div>`;
  $('#ng').onclick = newGallery;
  S.galleries = (await api('/api/galleries')).galleries;
  drawGalleries();
});

function drawGalleries() {
  const el = $('#gl'); if (!el) return;
  if (!S.galleries.length) {
    el.innerHTML = `<div class="empty">${ico('img')}<h3>Nenhuma galeria ainda</h3><p>Crie a primeira para começar a encantar seus clientes.</p></div>`;
    return;
  }
  el.innerHTML = S.galleries.map((g, i) => `
  <section class="card gal fade-up" style="animation-delay:${i * 50}ms" data-g="${g.id}">
    <div class="gal-top">
      <div>
        <h3>${esc(g.name)}</h3>
        <div class="meta">${esc(g.desc)} · criada em ${new Date(g.created).toLocaleDateString('pt-BR')}${ME.role === 'admin' ? ` · por ${esc(g.ownerName)}` : ''}</div>
        <div class="badges">
          <span class="badge">${ico('img')} ${g.photos.length} foto${g.photos.length !== 1 ? 's' : ''}</span>
          <span class="badge">${g.limit > 0 ? `Limite: ${g.limit} fotos` : 'Sem limite'}</span>
          <span class="badge mute">${ico('down')} ${g.downloaded} baixada${g.downloaded !== 1 ? 's' : ''}</span>
        </div>
      </div>
      <div class="row" style="align-content:flex-start">
        <button class="btn sm" data-a="share">${ico('link')} Compartilhar</button>
        <button class="btn sm" data-a="add">${ico('up')} Fotos</button>
        <button class="btn sm" data-a="edit">${ico('edit')} Editar</button>
        <button class="btn sm danger" data-a="del">${ico('trash')}</button>
      </div>
    </div>
    <div class="thumbs">
      ${g.photos.slice(0, 13).map(p => `<div class="thumb"><img loading="lazy" draggable="false" src="${imgUrl(g.id, p.id)}" alt=""><button class="x" data-a="rm" data-p="${p.id}" title="Remover foto">${ico('x')}</button></div>`).join('')}
      ${g.photos.length > 13 ? `<div class="thumb more">+${g.photos.length - 13}</div>` : ''}
    </div>
  </section>`).join('');
  el.onclick = guard(async e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const g = S.galleries.find(x => x.id === b.closest('[data-g]').dataset.g);
    const a = b.dataset.a;
    if (a === 'share') shareModal(g);
    if (a === 'edit') editModal(g);
    if (a === 'add') addPhotos(g);
    if (a === 'del' && confirm(`Excluir "${g.name}" e todas as fotos (inclusive os originais)? Não dá para desfazer.`)) {
      await api(`/api/galleries?g=${g.id}`, { method: 'DELETE' }); toast('Galeria excluída'); viewGalleries();
    }
    if (a === 'rm' && confirm('Remover esta foto da galeria?')) {
      await api(`/api/galleries?g=${g.id}&photo=${b.dataset.p}`, { method: 'DELETE' }); viewGalleries();
    }
  });
}

/* ── upload: prévia reduzida + marca d'água gravada na imagem, original vai privado ── */
function drawWatermark(c, w, h) {
  c.save();
  c.translate(w / 2, h / 2); c.rotate(-Math.PI / 6);
  const fs = Math.max(20, w / 20); c.font = `italic ${fs}px "Cormorant Garamond", Georgia, serif`;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  const label = STUDIO, step = c.measureText(label).width + fs * 3, lh = fs * 3.2;
  c.shadowColor = 'rgba(0,0,0,.45)'; c.shadowBlur = 3; c.fillStyle = 'rgba(255,255,255,.30)';
  for (let y = -h, r = 0; y < h; y += lh, r++) for (let x = -w - (r % 2 ? step / 2 : 0); x < w; x += step) c.fillText(label, x, y);
  c.restore();
}

async function makePreview(file) {
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const s = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
  const cw = Math.round(bmp.width * s), ch = Math.round(bmp.height * s);
  const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
  const c = cv.getContext('2d'); c.drawImage(bmp, 0, 0, cw, ch);
  drawWatermark(c, cw, ch);
  const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.8));
  const out = { blob, w: bmp.width, h: bmp.height };
  bmp.close?.(); return out;
}

async function uploadFiles(gid, items, onTick) {
  const { upload } = await import(BLOB_CLIENT);
  const done = [], q = [...items];
  const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
  const worker = async () => {
    while (q.length) {
      const it = q.shift();
      try {
        const pv = await makePreview(it.file);
        const key = rid(6);
        const opt = { access: 'private', handleUploadUrl: '/api/upload' };
        const [o, p] = await Promise.all([
          upload(`galleries/${gid}/${key}-orig${EXT[it.file.type] || '.jpg'}`, it.file, { ...opt, multipart: it.file.size > 8e6, contentType: it.file.type }),
          upload(`galleries/${gid}/${key}-prev.jpg`, pv.blob, { ...opt, contentType: 'image/jpeg' }),
        ]);
        done.push({ name: it.file.name, w: pv.w, h: pv.h, orig: o.pathname, prev: p.pathname });
        it.el?.classList.add('done');
      } catch (e) { console.error(e); it.el?.classList.add('fail'); }
      onTick(done.length, items.length);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return done;
}

function picker(m) {
  const items = [];
  const grid = m.$('#qg'), input = m.$('#fi'), drop = m.$('#dz');
  const add = files => [...files].forEach(f => {
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return toast(`"${f.name}" ignorada (use JPG, PNG ou WebP)`);
    const el = document.createElement('div'); el.className = 'qitem';
    el.innerHTML = `<img alt="">`; $('img', el).src = URL.createObjectURL(f);
    grid.appendChild(el); items.push({ file: f, el });
  });
  input.onchange = () => { add(input.files); input.value = ''; };
  drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); add(e.dataTransfer.files); };
  return items;
}

const dropHtml = `<div class="drop" id="dz"><input type="file" id="fi" accept="image/jpeg,image/png,image/webp" multiple>${ico('up')}<div>Arraste as fotos aqui ou clique para escolher</div><small>JPG, PNG ou WebP · originais ficam guardados com segurança</small></div>
<div class="qgrid" id="qg"></div><div class="bar hidden" id="pb"><i></i></div><div class="meta" id="pt" style="text-align:center;color:var(--muted);font-size:13px"></div>`;

function newGallery() {
  const gid = rid(10);
  const m = modal(`<h2>Nova galeria</h2><p class="lead">Defina o limite de fotos que o cliente poderá baixar.</p>
    <div class="field"><label>Nome da galeria</label><input id="gn" placeholder="Ex.: Casamento Ana &amp; Bruno"></div>
    <div class="field"><label>Mensagem para o cliente</label><input id="gd" placeholder="Ex.: Escolha suas 30 fotos favoritas"></div>
    <div class="field"><label>Limite de fotos para download</label><input id="gl2" type="number" min="0" value="0"><small>0 = sem limite. O limite é verificado no servidor.</small></div>
    ${dropHtml}<button class="btn gold block" id="go" style="margin-top:16px">Criar galeria</button>`);
  const items = picker(m);
  m.$('#go').onclick = guard(async () => {
    const name = m.$('#gn').value.trim();
    if (!name) return toast('Dê um nome à galeria');
    if (!items.length) return toast('Adicione ao menos uma foto');
    m.$('#go').disabled = true; m.$('#pb').classList.remove('hidden');
    const photos = await uploadFiles(gid, items, (d, t) => { m.$('#pb i').style.width = `${d / t * 100}%`; m.$('#pt').textContent = `Enviando ${d} de ${t}…`; });
    if (!photos.length) { m.$('#go').disabled = false; return toast('Nenhuma foto foi enviada. Tente novamente.'); }
    await api('/api/galleries', { method: 'POST', body: { id: gid, name, desc: m.$('#gd').value, limit: m.$('#gl2').value, photos } });
    m.close(); toast('Galeria criada!'); await viewGalleries();
    shareModal(S.galleries.find(g => g.id === gid));
  });
}

function addPhotos(g) {
  const m = modal(`<h2>Adicionar fotos</h2><p class="lead">${esc(g.name)}</p>${dropHtml}<button class="btn gold block" id="go" style="margin-top:16px">Enviar fotos</button>`);
  const items = picker(m);
  m.$('#go').onclick = guard(async () => {
    if (!items.length) return toast('Escolha as fotos');
    m.$('#go').disabled = true; m.$('#pb').classList.remove('hidden');
    const photos = await uploadFiles(g.id, items, (d, t) => { m.$('#pb i').style.width = `${d / t * 100}%`; m.$('#pt').textContent = `Enviando ${d} de ${t}…`; });
    if (photos.length) await api('/api/galleries?action=addphotos', { method: 'POST', body: { g: g.id, photos } });
    m.close(); toast(`${photos.length} foto(s) adicionada(s)`); viewGalleries();
  });
}

function editModal(g) {
  const m = modal(`<h2>Editar galeria</h2><p class="lead">Alterações valem imediatamente para quem tem o link.</p>
    <div class="field"><label>Nome</label><input id="en" value="${esc(g.name)}"></div>
    <div class="field"><label>Mensagem</label><input id="ed" value="${esc(g.desc)}"></div>
    <div class="field"><label>Limite de fotos (0 = sem limite)</label><input id="el" type="number" min="0" value="${g.limit}"></div>
    <button class="btn gold block" id="es">Salvar</button>
    <div class="row" style="margin-top:14px;justify-content:center"><button class="btn sm" id="rd">Zerar contagem de baixadas</button></div>`);
  const save = guard(async extra => {
    await api('/api/galleries', { method: 'PATCH', body: { g: g.id, name: m.$('#en').value, desc: m.$('#ed').value, limit: m.$('#el').value, ...extra } });
    m.close(); toast('Salvo'); viewGalleries();
  });
  m.$('#es').onclick = () => save();
  m.$('#rd').onclick = () => confirm('Isso permite que o cliente baixe de novo até o limite. Continuar?') && save({ resetDownloads: true });
}

function shareModal(g) {
  const url = `${location.origin}/g/${g.token}`;
  const m = modal(`<h2>Compartilhar</h2><p class="lead">Envie este link ao cliente. Ele escolhe e baixa só as fotos que selecionar${g.limit ? `, até ${g.limit}` : ''}.</p>
    <div class="linkbox"><input id="lk" readonly value="${esc(url)}"><button class="btn gold" id="cp">${ico('copy')} Copiar</button></div>
    <div class="row" style="margin-top:14px;justify-content:center">
      <a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(`Suas fotos estão prontas ✨ ${url}`)}">${ico('send')} WhatsApp</a>
      <a class="btn sm" target="_blank" rel="noopener" href="${esc(url)}">${ico('eye')} Visualizar</a>
      <button class="btn sm" id="nl">${ico('key')} Gerar novo link</button></div>`);
  m.$('#cp').onclick = async () => { try { await navigator.clipboard.writeText(url); } catch { m.$('#lk').select(); document.execCommand('copy'); } toast('Link copiado!'); };
  m.$('#nl').onclick = guard(async () => {
    if (!confirm('O link atual deixará de funcionar. Continuar?')) return;
    await api('/api/galleries', { method: 'PATCH', body: { g: g.id, newLink: true } });
    m.close(); await viewGalleries(); shareModal(S.galleries.find(x => x.id === g.id));
  });
}

/* ───────────── seleções / downloads ───────────── */
const viewSelections = guard(async function () {
  $('#view').innerHTML = `<div class="head"><div><h2>Fotos baixadas</h2><p>As escolhas dos clientes aparecem aqui assim que eles baixam.</p></div></div><div id="sl"></div>`;
  S.selections = (await api('/api/galleries?action=selections')).selections;
  $('#sl').innerHTML = !S.selections.length
    ? `<div class="empty">${ico('down')}<h3>Nada por aqui ainda</h3><p>Quando um cliente baixar suas favoritas, você vê quais foram.</p></div>`
    : S.selections.map(s => `
    <section class="card gal fade-up"><div class="gal-top"><div><h3>${esc(s.name)}</h3>
      <div class="badges"><span class="badge">${s.total} foto${s.total > 1 ? 's' : ''} baixada${s.total > 1 ? 's' : ''}${s.limit ? ` de ${s.limit}` : ''}</span></div>
      <div class="ev">${s.events.map(e => `<span>${fmtDate(e.date)} · ${e.count} foto${e.count > 1 ? 's' : ''}</span>`).join('')}</div></div></div>
      <div class="thumbs">${s.photos.map(p => `<div class="thumb" title="${esc(p.name)}"><img loading="lazy" draggable="false" src="${imgUrl(s.id, p.id)}" alt=""></div>`).join('')}</div>
      <p class="meta" style="margin-top:12px">Arquivos: ${s.photos.map(p => esc(p.name)).join(', ')}</p>
    </section>`).join('');
});

/* ───────────── equipe ───────────── */
const genPass = () => { const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'; return Array.from(crypto.getRandomValues(new Uint8Array(12)), n => a[n % a.length]).join(''); };

const viewTeam = guard(async function () {
  $('#view').innerHTML = `<div class="head"><div><h2>Equipe</h2><p>Convide pessoas com e-mail e senha. Cada fotógrafo vê apenas as próprias galerias.</p></div>
    <button class="btn gold" id="nu">${ico('plus')} Convidar usuário</button></div><div id="ul"></div>`;
  $('#nu').onclick = inviteModal;
  S.users = (await api('/api/users')).users;
  $('#ul').innerHTML = S.users.map(u => `
    <div class="card pill-row"><div><b>${esc(u.name)}</b> <span class="badge ${u.role === 'admin' ? '' : 'mute'}">${u.role === 'admin' ? 'Administrador' : 'Fotógrafo'}</span><small>${esc(u.email)}</small></div>
      <div class="row"><button class="btn sm" data-r="${esc(u.email)}">${ico('key')} Nova senha</button>
      ${u.email !== ME.email ? `<button class="btn sm danger" data-d="${esc(u.email)}">${ico('trash')}</button>` : ''}</div></div>`).join('');
  $('#ul').onclick = guard(async e => {
    const r = e.target.closest('[data-r]'), d = e.target.closest('[data-d]');
    if (r) resetModal(r.dataset.r);
    if (d && confirm(`Remover ${d.dataset.d}? As galerias dele passam para você.`)) {
      await api(`/api/users?email=${encodeURIComponent(d.dataset.d)}`, { method: 'DELETE' }); toast('Usuário removido'); viewTeam();
    }
  });
});

function inviteModal() {
  const m = modal(`<h2>Convidar usuário</h2><p class="lead">Defina e-mail e senha de acesso e envie para a pessoa.</p>
    <div class="field"><label>Nome</label><input id="un" placeholder="Nome da pessoa"></div>
    <div class="field"><label>E-mail (login)</label><input id="ue" type="email" placeholder="pessoa@email.com"></div>
    <div class="field"><label>Senha</label><div class="linkbox"><input id="up" style="color:var(--text)" value="${genPass()}"><button class="btn sm" id="gp" type="button">Gerar</button></div><small>Mínimo de 8 caracteres.</small></div>
    <div class="field"><label>Perfil</label><select id="ur"><option value="fotografo">Fotógrafo (só as próprias galerias)</option><option value="admin">Administrador (tudo)</option></select></div>
    <button class="btn gold block" id="us">Criar acesso</button>`);
  m.$('#gp').onclick = () => m.$('#up').value = genPass();
  m.$('#us').onclick = guard(async () => {
    const body = { name: m.$('#un').value, email: m.$('#ue').value, password: m.$('#up').value, role: m.$('#ur').value };
    await api('/api/users', { method: 'POST', body });
    const msg = `Olá! Seu acesso ao painel ${STUDIO}:\n${location.origin}\nE-mail: ${body.email.trim().toLowerCase()}\nSenha: ${body.password}`;
    m.close();
    const d = modal(`<h2>Acesso criado ✨</h2><p class="lead">Copie e envie para ${esc(body.email)}. A senha não será exibida de novo.</p>
      <div class="field"><textarea id="iv" readonly rows="5" style="width:100%;background:rgba(0,0,0,.35);border:1px solid var(--line);border-radius:12px;padding:14px;color:var(--gold2);font:inherit">${esc(msg)}</textarea></div>
      <button class="btn gold block" id="ic">${ico('copy')} Copiar convite</button>`);
    d.$('#ic').onclick = async () => { try { await navigator.clipboard.writeText(msg); } catch { d.$('#iv').select(); document.execCommand('copy'); } toast('Convite copiado!'); };
    viewTeam();
  });
}

function resetModal(email) {
  const m = modal(`<h2>Nova senha</h2><p class="lead">${esc(email)}</p>
    <div class="field"><label>Senha</label><div class="linkbox"><input id="np" style="color:var(--text)" value="${genPass()}"><button class="btn sm" id="gp" type="button">Gerar</button></div></div>
    <button class="btn gold block" id="ns">Salvar nova senha</button>`);
  m.$('#gp').onclick = () => m.$('#np').value = genPass();
  m.$('#ns').onclick = guard(async () => {
    const pw = m.$('#np').value;
    await api('/api/users', { method: 'PATCH', body: { email, password: pw } });
    try { await navigator.clipboard.writeText(pw); } catch {}
    m.close(); toast('Senha alterada (copiada para a área de transferência)');
  });
}

/* ───────────── conta ───────────── */
function viewAccount() {
  $('#view').innerHTML = `<div class="head"><div><h2>Minha conta</h2><p>${esc(ME.name)} · ${esc(ME.email)}</p></div></div>
  <div class="card" style="max-width:480px;padding:30px"><form id="pf"><h3 style="font-size:26px;margin-bottom:16px">Alterar senha</h3>
    <div class="field"><label>Senha atual</label><input type="password" id="pc" autocomplete="current-password" required></div>
    <div class="field"><label>Nova senha</label><input type="password" id="pn" autocomplete="new-password" minlength="8" required></div>
    <button class="btn gold">Salvar</button></form></div>`;
  $('#pf').onsubmit = guard(async e => {
    e.preventDefault();
    await api('/api/auth?action=password', { method: 'POST', body: { current: $('#pc').value, next: $('#pn').value } });
    e.target.reset(); toast('Senha alterada');
  });
}
