# FotoStudio — galerias para clientes (Vercel)

Painel do fotógrafo + página do cliente. O cliente escolhe as fotos (respeitando o limite da galeria) e **baixa direto um ZIP só com as escolhidas, em qualidade original**.

## Como publicar na Vercel

1. Envie esta pasta para um repositório no GitHub e importe em **vercel.com/new** (ou rode `npx vercel` dentro da pasta).
2. No projeto, aba **Storage**:
   - **Blob** → *Create* → escolha acesso **Private** (originais nunca ficam públicos). Isso cria `BLOB_READ_WRITE_TOKEN`.
   - **Upstash Redis** (Marketplace) → *Create*. Isso cria `KV_REST_API_URL` e `KV_REST_API_TOKEN`.
3. Em **Settings → Environment Variables**, adicione:

   | Variável | Valor |
   |---|---|
   | `ADMIN_EMAIL` | seu e-mail de login |
   | `ADMIN_PASSWORD` | sua senha (mín. 8 caracteres) |
   | `SESSION_SECRET` | texto aleatório longo — gere com `openssl rand -base64 32` |
   | `STUDIO_NAME` | (opcional) nome na marca d'água e no topo, ex.: `Maria Fotografia` |

4. Faça **Redeploy**. Entre em `https://seu-site.vercel.app` com `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
   `ADMIN_PASSWORD` só é lido no **primeiro login**; depois a senha fica guardada (com hash) e você troca em *Minha conta*.

Se faltar alguma variável, a própria tela de login avisa qual é.

## Usuários
Aba **Equipe** (só admin) → *Convidar usuário*: informe nome, e-mail e senha (ou clique em *Gerar*), e envie o convite pronto. Perfis:
- **Fotógrafo**: vê e gerencia só as próprias galerias.
- **Administrador**: vê tudo e gerencia a equipe.

## Como funciona a proteção
- Você envia a foto → o navegador gera uma **prévia reduzida (1400 px) com marca d'água gravada na imagem** e envia original + prévia para o Blob **privado**.
- O cliente só recebe a prévia (desenhada em `<canvas>`, sem `<img>`). O original só sai pelo ZIP, depois que o servidor confere o limite.
- O limite é verificado **no servidor** e é cumulativo: se o limite é 30, o cliente baixa no máximo 30 fotos distintas na galeria (pode rebaixar as mesmas).
- Painel do cliente: esconde tudo ao perder o foco da janela, ao apertar PrintScreen / Win(Cmd)+Shift / Ctrl+P / Ctrl+S / F12, ao abrir DevTools e ao imprimir; bloqueia botão direito, arrastar e copiar.

**Limite honesto:** nenhum site consegue bloquear 100% um print ou uma foto da tela feita com outro aparelho. Por isso a defesa principal é a marca d'água gravada + prévia pequena: um print só rende uma imagem pequena marcada.

## Limites / observações
- Formatos aceitos: JPG, PNG, WebP (HEIC não; converta antes).
- Download de ZIP grande usa até 300 s de função (configurado em `vercel.json`).
- Para trocar o link de um cliente: *Compartilhar → Gerar novo link*.
