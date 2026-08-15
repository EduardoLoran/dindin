# Dindin

Aplicacao de controle financeiro pessoal com backend Node.js, SQLite e frontend Vue 3.

## Requisitos

- Node.js 24 ou superior (o backend usa `node:sqlite`).
- npm.
- Variaveis de ambiente conforme `.env.example`.

Uma instalacao vazia nao cria credenciais padrao. Defina `INITIAL_ADMIN_USERNAME`, `INITIAL_ADMIN_EMAIL` e uma `INITIAL_ADMIN_PASSWORD` com pelo menos 12 caracteres antes da primeira inicializacao.

## Desenvolvimento

```powershell
npm ci --prefix frontend
npm run build
npm test
npm start
```

A aplicacao fica em `http://127.0.0.1:3030`. Para trabalhar com o Vite em outro terminal:

```powershell
npm run dev:frontend
```

## Seguranca

- Sessao opaca persistida no SQLite; somente o hash do identificador e armazenado.
- Cookie `Secure`, `HttpOnly`, `SameSite=Strict` e prefixo `__Host-` em producao.
- CSRF, origem permitida, limite de payload, validacao estrita e rate limiting nas APIs.
- Cloudflare Turnstile em login, cadastro e recuperacao quando configurado.
- Meses fechados sao somente leitura no frontend e no backend.
- Migracoes nao destroem tabelas e criam um backup SQLite antes da primeira atualizacao do esquema.

## Estrutura

- `server.js` e `src/`: HTTP, APIs, servicos, repositorios e SQLite.
- `frontend/`: frontend Vue 3, Vite e Tabulator.
- `public/auth-app/`: build de producao do frontend.
- `test/`: testes de integracao e seguranca com banco temporario.
- `deploy/`: exemplos de systemd, Nginx e configuracao da VPS.
- `scripts/`: backup e manutencao controlada do historico Git.

O procedimento completo para Debian 13 esta em `deploy/README.md`.
