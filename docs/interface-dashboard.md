# Interface autenticada - Visão geral

## Objetivo

A primeira etapa da área autenticada substitui o antigo cabeçalho horizontal por uma estrutura de produto SaaS: menu lateral, barra superior compacta e conteúdo organizado por prioridade. A visão geral utiliza os dados reais já fornecidos por `/api/bootstrap`.

## Estrutura

- Menu lateral recolhível no desktop, com preferência gravada em `dindin-sidebar-collapsed`.
- Menu em gaveta no mobile, implementado com o `Dialog` acessível do Headless UI.
- Barra superior com tema, identidade da conta e encerramento de sessão.
- Seletor de mês que inicia no mês salvo mais recente.
- Links para as páginas legadas durante a migração incremental.

## Visão geral

- Resumo com salário, total previsto, valores pagos ou guardados, pendências e saldo projetado.
- Indicador de comprometimento do orçamento.
- Progresso do mês e divisão entre início do mês e quinzena.
- Lista dos lançamentos mais relevantes, priorizando pendências.
- Atalhos para cadastros, lançamentos e detalhes.
- Histórico dos meses recentes.
- Edição do salário em modal, sem abandonar o contexto da página.

## Responsividade e acessibilidade

- O menu lateral é substituído por uma gaveta abaixo de 900 px.
- Os cards passam de cinco para três, duas e uma coluna conforme o espaço disponível.
- Não há rolagem horizontal em 390 px.
- Menus e modal possuem foco, nomes acessíveis e fechamento pelo teclado.
- O tema continua compartilhando a preferência `dindin-theme` com a autenticação.

## Migração

A rota `/visao-geral` já utiliza o novo frontend. As rotas `/cadastros`, `/lancamentos`, `/detalhes`, `/gastos-fixos` e `/admin/usuarios` continuam no frontend legado até suas respectivas etapas de migração.
