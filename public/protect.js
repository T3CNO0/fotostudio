// Proteção anti-captura (melhor esforço no navegador).
// Nenhum site consegue impedir 100% um print — o que ele faz é: esconder o conteúdo
// sempre que a janela perde o foco / surgem atalhos de captura / DevTools / impressão,
// limpar a área de transferência após PrintScreen e entregar só prévias pequenas
// com marca d'água gravada na própria imagem (ver upload no painel).
import { $ } from './common.js';

export function enableProtection(root) {
  const shield = document.createElement('div');
  shield.className = 'shield';
  shield.innerHTML = `<svg class="i" viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
    <h3>Conteúdo protegido</h3><p id="shield-msg">Volte para esta janela para continuar vendo as fotos.</p>`;
  document.body.appendChild(shield);

  let hold = 0;             // até quando manter escondido (ms epoch)
  let reasons = new Set();
  const apply = () => {
    const on = reasons.size > 0 || Date.now() < hold;
    shield.classList.toggle('on', on);
    document.documentElement.classList.toggle('protect-hide', on);
  };
  const hide = (r, holdMs = 0) => {
    if (holdMs) { hold = Math.max(hold, Date.now() + holdMs); setTimeout(apply, holdMs + 20); }  // temporário
    else reasons.add(r);                                                                           // até a condição acabar
    apply();
  };
  const show = r => { reasons.delete(r); apply(); };

  // janela sem foco (ferramentas de recorte, outro monitor, app switcher no celular)
  window.addEventListener('blur', () => hide('blur'));
  window.addEventListener('focus', () => setTimeout(() => { if (document.hasFocus()) show('blur'); }, 250));
  document.addEventListener('visibilitychange', () => document.hidden ? hide('vis') : show('vis'));
  window.addEventListener('pagehide', () => hide('vis'));

  const wipeClipboard = () => { try { navigator.clipboard?.writeText(' ')?.catch(() => {}); } catch {} };

  document.addEventListener('keydown', e => {
    const k = (e.key || '').toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;
    // tecla Windows/Cmd segurada = provável atalho de captura (Win+Shift+S, Cmd+Shift+3/4/5)
    if (k === 'meta' || k === 'os') hide('meta');
    const block =
      k === 'printscreen' || k === 'f12' ||
      (e.metaKey && e.shiftKey) ||
      (ctrl && ['p', 's', 'u'].includes(k)) ||
      (ctrl && e.shiftKey && ['i', 'j', 'c', 's'].includes(k));
    if (block) {
      e.preventDefault(); e.stopPropagation();
      hide('key', 2500); wipeClipboard();
    }
  }, true);
  document.addEventListener('keyup', e => {
    const k = (e.key || '').toLowerCase();
    if (k === 'printscreen') { wipeClipboard(); hide('key', 3000); }
    if (k === 'meta' || k === 'os') setTimeout(() => show('meta'), 1500);
  }, true);

  // impressão / salvar / arrastar / copiar / menu de contexto
  window.addEventListener('beforeprint', () => hide('print', 4000));
  window.addEventListener('afterprint', () => show('print'));
  ['contextmenu', 'dragstart', 'selectstart', 'copy', 'cut'].forEach(ev =>
    document.addEventListener(ev, e => { e.preventDefault(); if (ev === 'copy' || ev === 'cut') wipeClipboard(); }, true));

  // DevTools aberto (acoplado) — só em computadores
  if (matchMedia('(pointer:fine)').matches) {
    setInterval(() => {
      const open = (outerWidth - innerWidth > 220) || (outerHeight - innerHeight > 260);
      open ? hide('devtools') : show('devtools');
    }, 800);
  }

  // iOS/Android: capturas de tela do sistema não são detectáveis pelo navegador.
  // Mitigação: prévias pequenas + marca d'água embutida em cada pixel da imagem.
  return { hide, show };
}
