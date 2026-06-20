# Dindin

Aplicacao de controle financeiro pessoal com backend Node.js, banco SQLite e frontend Vue.

## Executar

Na primeira execucao, instale as dependencias do frontend e gere o build:

```powershell
cd frontend
npm install
cd ..
npm run build
npm start
```

A aplicacao estara disponivel em `http://127.0.0.1:3030`.

## Desenvolvimento do frontend

Com o backend executando em um terminal, inicie o Vite em outro:

```powershell
npm run dev:frontend
```

O Vite usa proxy para as APIs em `http://127.0.0.1:3030`.

## Estrutura atual

- `server.js` e `src/`: servidor HTTP, APIs, servicos, repositorios e SQLite.
- `frontend/`: novo frontend Vue 3 + Vite para autenticacao e telas internas migradas.
- `public/auth-app/`: build gerado do novo frontend.
- `public/index.html`, `public/app.js` e `public/styles.css`: telas autenticadas legadas.
- `data/gastos.sqlite`: banco local.
- `docs/identidade-visual-login.md`: tokens, logo e regras da nova identidade.
- `docs/interface-cadastros.md`: estrutura, regras e componentes da nova tela de cadastros.
- `docs/interfaces-internas.md`: regras e arquitetura das telas internas migradas.

## Migracao incremental

As rotas publicas e todas as areas autenticadas (`/visao-geral`, `/cadastros`, `/lancamentos`, `/detalhes`, `/gastos-fixos` e `/admin/usuarios`) usam o frontend Vue 3 + Vite. Os arquivos legados permanecem temporariamente no projeto apenas como referencia durante a consolidacao da migracao.

O projeto usa `node:sqlite`, disponivel no Node.js 24 utilizado no ambiente atual.
