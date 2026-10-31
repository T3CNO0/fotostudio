import { $, $$, esc, ico, ornament, api, toast, rid } from './common.js';
import { enableProtection } from './protect.js';

export async function startClient(token) {
  const root = $('#root');
  root.innerHTML = `<div id="client"><div class="msg-screen"><div><div class="logo-script" style="font-size:54px">…</div></div></div></div>`;

  let G;
  try { G = await api(`/api/public?action=gallery&t=${encodeURIComponent(token)}`); }
  catch (e) {
    root.innerHTML = `<div class="msg-screen"><div>${ico('lock').replace('class="i"', 'class="i" style="width:52px;height:52px;color:var(--gold)"')}
      <h2>Galeria indisponível</h2><p>${esc(e.message)}</p></div></div>`;
    return;
  }

  document.title = `${G.name} · ${G.studio}`;
  enableProtection(root);

  const key = `fs_sel_${token}`;
  const photos = G.photos;
  const byId = Object.fromEntries(photos.map(p => [p.id, p]));
  const downloaded = new Set(G.downloaded);
  let selected = new Set();
  try { selected = new Set(JSON.parse(localStorage.getItem(key) || '[]').filter(id => byId[id])); } catch {}
  const viewer = (sessionStorage.fs_viewer ||= rid(4).toUpperCase());

  root.innerHTML = `
  <div id="client">
    <header class="hero fade-up">
      <div class="logo-script">${esc(G.studio)}</div>
      ${ornament}
      <h1>${esc(G.name)}</h1>
      <p>${esc(G.desc)}</p>
      <div class="hint">${ico('heart')} Toque no coração para escolher · depois baixe só as suas favoritas</div>
    </header>
    <main class="masonry" id="grid"></main>
    <footer class="cbar">
      <div class="prog">
        <div class="t"><span id="p-text"></span><b id="p-num"></b></div>
        <div class="bar"><i id="p-bar"></i></div>
      </div>
      <div class="row">
        <button class="btn sm" id="b-clear">Limpar</button>
        <button class="btn gold" id="b-dl">${ico('down')} <span>Baixar selecionadas</span></button>
      </div>
    </footer>
  </div>`;

  const grid = $('#grid');
  const blobs = new Map();           // id -> Blob da prévia (já com marca d'água)
  const imgUrl = id => `/api/public?action=img&t=${encodeURIComponent(token)}&id=${id}`;

  async function getBlob(id) {
    if (!blobs.has(id)) {
      const r = await fetch(imgUrl(id), { credentials: 'same-origin' });
      if (!r.ok) throw new Error('img');
      blobs.set(id, await r.blob());
    }
    return blobs.get(id);
  }

  // desenha em <canvas> (não existe <img> para "salvar imagem como…") + marca extra do visitante
  async function paint(canvas, id, maxW) {
    const bmp = await createImageBitmap(await getBlob(id));
    const s = Math.min(1, maxW / bmp.width);
    canvas.width = Math.round(bmp.width * s); canvas.height = Math.round(bmp.height * s);
    const c = canvas.getContext('2d');
    c.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close?.();
    c.save();
    c.translate(canvas.width / 2, canvas.height / 2); c.rotate(-Math.PI / 7);
    c.font = `${Math.max(11, canvas.width / 38)}px Jost, sans-serif`;
    c.fillStyle = 'rgba(255,255,255,.12)'; c.textAlign = 'center';
    const label = `${G.studio} · ${viewer}`, step = c.measureText(label).width + 90, lh = Math.max(46, canvas.width / 9);
    for (let y = -canvas.height; y < canvas.height; y += lh) for (let x = -canvas.width; x < canvas.width; x += step) c.fillText(label, x + ((y / lh) % 2 ? step / 2 : 0), y);
    c.restore();
    canvas.classList.add('ready');
  }

  grid.innerHTML = photos.map((p, i) => `
    <div class="tile" data-id="${p.id}" style="animation-delay:${Math.min(i, 14) * 45}ms">
      <div class="ph" style="padding-top:${(p.h / p.w * 100).toFixed(2)}%"></div>
      <canvas width="${p.w > 600 ? 600 : p.w}" height="${Math.round((p.w > 600 ? 600 : p.w) * p.h / p.w)}" style="position:absolute;inset:0;width:100%;height:100%"></canvas>
      <button class="heart" aria-label="Escolher foto">${ico('heart')}</button>
    </div>`).join('');

  // carrega as imagens só quando se aproximam da tela
  const io = new IntersectionObserver(es => es.forEach(en => {
    if (!en.isIntersecting) return;
    io.unobserve(en.target);
    const t = en.target, cv = $('canvas', t);
    paint(cv, t.dataset.id, 640).then(() => { $('.ph', t)?.remove(); cv.style.position = 'static'; cv.style.height = 'auto'; }).catch(() => {});
  }), { rootMargin: '600px' });
  $$('.tile', grid).forEach(t => io.observe(t));

  const union = () => new Set([...downloaded, ...selected]);
  const newCount = () => [...selected].filter(id => !downloaded.has(id)).length;

  function refresh() {
    $$('.tile', grid).forEach(t => {
      const id = t.dataset.id;
      t.classList.toggle('sel', selected.has(id));
      let b = $('.dlbadge', t);
      if (downloaded.has(id) && !b) t.insertAdjacentHTML('beforeend', '<span class="dlbadge">BAIXADA</span>');
    });
    const lim = G.limit, n = selected.size, u = union().size;
    $('#p-text').textContent = lim > 0 ? 'Fotos escolhidas' : 'Fotos escolhidas (sem limite)';
    $('#p-num').textContent = lim > 0 ? `${u} de ${lim}` : `${n}`;
    $('#p-bar').style.width = lim > 0 ? `${Math.min(100, u / lim * 100)}%` : (n ? '100%' : '0');
    $('#b-dl span').textContent = n ? `Baixar ${n} foto${n > 1 ? 's' : ''}` : 'Baixar selecionadas';
    $('#b-dl').disabled = !n; $('#b-clear').disabled = !n;
    try { localStorage.setItem(key, JSON.stringify([...selected])); } catch {}
  }

  function toggle(id) {
    if (selected.has(id)) selected.delete(id);
    else {
      if (G.limit > 0 && !downloaded.has(id) && union().size >= G.limit) {
        toast(`Limite de ${G.limit} fotos atingido. Remova uma para escolher outra.`); return false;
      }
      selected.add(id);
    }
    refresh(); return true;
  }

  grid.addEventListener('click', e => {
    const t = e.target.closest('.tile'); if (!t) return;
    if (e.target.closest('.heart')) { toggle(t.dataset.id); return; }
    openLightbox(photos.findIndex(p => p.id === t.dataset.id));
  });

  $('#b-clear').onclick = () => { selected.clear(); refresh(); };

  // ── download direto (ZIP só com as escolhidas) ──
  let frame;
  $('#b-dl').onclick = () => {
    if (!selected.size) return;
    if (G.limit > 0 && union().size > G.limit) return toast(`O limite é de ${G.limit} fotos.`);
    const btn = $('#b-dl'); btn.disabled = true;
    frame?.remove();
    frame = document.createElement('iframe'); frame.name = 'dlframe'; frame.style.display = 'none';
    document.body.appendChild(frame);
    const form = document.createElement('form');
    form.method = 'POST'; form.target = 'dlframe';
    form.action = `/api/public?action=download&t=${encodeURIComponent(token)}`;
    form.innerHTML = `<input name="ids" value="${[...selected].join(',')}">`;
    document.body.appendChild(form);
    const got = new Set(selected);
    let failed = false;
    // erro (JSON) carrega no iframe; sucesso é um download e não dispara onload
    frame.onload = () => {
      let txt = ''; try { txt = frame.contentDocument?.body?.innerText || ''; } catch {}
      if (txt.trim().startsWith('{')) {
        failed = true; let m = 'Não foi possível baixar.'; try { m = JSON.parse(txt).error || m; } catch {}
        toast(m); btn.disabled = !selected.size; form.remove();
      }
    };
    // confirma pelo servidor, que registra a seleção assim que o download começa
    const confirmDone = async () => {
      if (failed) return true;
      try {
        const r = await api(`/api/public?action=gallery&t=${encodeURIComponent(token)}`);
        r.downloaded.forEach(id => downloaded.add(id));
        if ([...got].every(id => downloaded.has(id))) {
          got.forEach(id => selected.delete(id));
          toast('Download iniciado! Confira sua pasta de downloads.');
          refresh(); form.remove(); return true;
        }
      } catch {}
      return false;
    };
    setTimeout(async () => { if (!(await confirmDone())) setTimeout(confirmDone, 5000); }, 2500);
    form.submit();
    toast('Preparando suas fotos em alta qualidade…');
    setTimeout(() => { btn.disabled = !selected.size; }, 5000);
  };

  // ── lightbox ──
  function openLightbox(i) {
    const lb = document.createElement('div'); lb.className = 'lb';
    lb.innerHTML = `
      <div class="top"><button class="heart" id="lb-h" aria-label="Escolher">${ico('heart')}</button><button class="btn icon-btn" id="lb-x" aria-label="Fechar">${ico('x')}</button></div>
      <button class="nav prev" aria-label="Anterior">${ico('left')}</button>
      <canvas></canvas>
      <button class="nav next" aria-label="Próxima">${ico('right')}</button>
      <div class="cap"></div>`;
    document.body.appendChild(lb);
    const cv = $('canvas', lb), h = $('#lb-h', lb);
    let alive = true;
    const show = async () => {
      const p = photos[i];
      h.classList.toggle('on', selected.has(p.id));
      $('.cap', lb).textContent = `${i + 1} / ${photos.length}`;
      cv.classList.remove('ready'); cv.style.opacity = .3;
      try { await paint(cv, p.id, 1600); cv.style.opacity = 1; } catch { toast('Não foi possível carregar a foto.'); }
      [i + 1, i - 1].forEach(j => photos[j] && getBlob(photos[j].id).catch(() => {}));
    };
    const go = d => { i = (i + d + photos.length) % photos.length; show(); };
    const close = () => { alive = false; lb.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = e => { if (!alive) return; if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); };
    document.addEventListener('keydown', onKey);
    $('.prev', lb).onclick = () => go(-1); $('.next', lb).onclick = () => go(1); $('#lb-x', lb).onclick = close;
    h.onclick = () => { toggle(photos[i].id); h.classList.toggle('on', selected.has(photos[i].id)); };
    let sx = 0; lb.addEventListener('touchstart', e => sx = e.touches[0].clientX, { passive: true });
    lb.addEventListener('touchend', e => { const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1); });
    lb.addEventListener('click', e => { if (e.target === lb) close(); });
    show();
  }

  refresh();
}
