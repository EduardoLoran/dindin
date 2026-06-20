# Interfaces internas

## Visão geral

As áreas autenticadas do Dindin usam Vue 3, Vite, Vue Router, Headless UI e os mesmos tokens visuais da autenticação. O backend e os contratos das APIs permaneceram inalterados.

## Lançamentos

- Filtros múltiplos por status, ciclo e tipo, persistidos no cookie `dindin-entry-filters`.
- Grupos de início do mês e quinzena em formato de acordeão.
- Tabelas dinâmicas dentro dos grupos, com busca, ordenação e edição inline.
- Estado recolhido persistido em `dindin-entry-groups-collapsed`.
- Edição de valor, ciclo e status com uma única ação de salvar.
- Barra flutuante de alterações pendentes, disponível durante toda a rolagem, com ações de salvar e descartar.
- Proteção ao sair da página ou recarregar com alterações ainda não salvas.
- Ordenação visual por setas, observações e exclusão mensal.

## Detalhes e relatórios

- Indicadores de quantidade, total, pendências e ticket médio.
- Progresso de organização do mês.
- Distribuições por status, ciclo e forma de pagamento.
- Cartões responsivos com a composição completa dos lançamentos.

## Gastos fixos

- Lista exclusiva de cadastros que não variam mensalmente.
- Tabela dinâmica com busca, filtro por ciclo e ordenação por nome, valor, ciclo e vigência.
- Edição de observação, acesso ao cadastro e inativação protegida por confirmação.

## Seleção de mês

- Componente visual único em todas as áreas financeiras.
- Exibe o período selecionado, quantidade de meses no histórico e base salarial.
- Lista acessível pelo teclado, responsiva e adaptada aos temas claro e escuro.

## Administração

- Rota protegida para administradores.
- Busca e filtro de usuários por perfil.
- Criação e edição em modais acessíveis.
- Validação de usuário, e-mail, nome, senha e permissões.

## Arquitetura

- `api/entries.js`: atualização, observação e exclusão de lançamentos.
- `api/admin.js`: leitura, criação e edição de usuários.
- `composables/useMonthlyBootstrap.js`: carregamento e troca do mês compartilhados.
- `components/MonthPageHeader.vue`: cabeçalho e seletor de período.
- `components/MonthSelector.vue`: seleção visual e acessível do mês.
- `components/MultiSelectFilter.vue`: filtro múltiplo acessível.
- `styles/workspace.css`: estilos responsivos das áreas migradas.
