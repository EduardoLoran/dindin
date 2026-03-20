# Dindin

Aplicacao local para transformar sua planilha em um sistema mais realista, com:

- frontend web em Vue
- backend local em Node
- banco SQLite em arquivo
- historico mensal persistido
- virada automatica do mes

## Estrutura

- [`server.js`](C:\codex\server.js): servidor HTTP local + API + SQLite
- [`public/index.html`](C:\codex\public\index.html): casca HTML da interface
- [`public/app.js`](C:\codex\public\app.js): app Vue consumindo a API
- [`public/styles.css`](C:\codex\public\styles.css): estilos da interface
- `data/gastos.sqlite`: banco gerado automaticamente ao iniciar

## Como rodar

1. No diretorio [`C:\codex`](C:\codex), execute:

```powershell
npm start
```

2. Abra no navegador:

```text
http://127.0.0.1:3030
```

## O que esta primeira versao faz

- Cria o schema do SQLite automaticamente.
- Importa como base inicial os gastos fixos da sua planilha.
- Cria um mes automaticamente quando ele ainda nao existe.
- Salva salario por mes.
- Salva status e valor dos gastos daquele mes.
- Guarda historico por `YYYY-MM`.
- Permite recriar um mes a partir do cadastro fixo.

## Observacoes

- O frontend usa Vue 3 via CDN para manter a base simples, sem etapa de build.
- O SQLite usado e o `node:sqlite`, nativo do Node 24.
- Esse modulo ainda aparece como experimental no Node atual, embora funcione para um MVP local.

## Proximos passos naturais

- editar ou desativar um gasto fixo existente
- registrar gastos variaveis fora da base fixa
- anexar comprovante ou observacao por lancamento
- importar extrato do banco e conciliar com os gastos previstos
- trocar Vue via CDN por Vite se quisermos uma base maior depois
