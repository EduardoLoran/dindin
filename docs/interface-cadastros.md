# Interface de Cadastros

## Objetivo

A tela de Cadastros centraliza os gastos recorrentes usados para gerar os lançamentos mensais. Ela faz parte da migração incremental do frontend legado para Vue 3 + Vite.

## Estrutura visual

- Cabeçalho com contexto da página, seletor do mês de referência e ação principal.
- Indicadores de cadastros ativos, valores fixos, valores variáveis e total padrão.
- Busca textual e filtros por tipo, ciclo e forma de pagamento.
- Tabela no desktop e cartões empilhados em telas pequenas.
- Menu contextual por registro para edição, observação e inativação.
- Estados dedicados de carregamento, erro, lista vazia e filtros sem resultado.

## Regras de interação

- **Novo cadastro:** exige nome, valor maior que zero e forma de pagamento.
- **Valor variável:** permite que o lançamento tenha um valor diferente em cada mês.
- **Valor fixo:** mantém o valor padrão para os meses seguintes.
- **Observação:** é atualizada separadamente para preservar o contrato atual da API.
- **Inativação:** remove o cadastro do mês selecionado e impede sua geração nos próximos meses.
- **Mês inicial:** ao abrir a tela, o mês salvo mais recente é selecionado.

## Componentes

- `TemplatesView.vue`: estado da tela, filtros, tabela e integração com as APIs.
- `TemplateFormDialog.vue`: criação e edição dos cadastros.
- `ObservationDialog.vue`: consulta e edição da observação.
- `ConfirmDialog.vue`: confirmação acessível de inativação.
- `templates.js`: cliente das APIs de cadastros.

## Acessibilidade e responsividade

- Modais e menus usam componentes do Headless UI.
- Campos possuem labels, mensagens inline e foco visível.
- Ações possuem nomes acessíveis e funcionam por teclado.
- A tabela se transforma em cartões abaixo de 700 px, sem rolagem horizontal obrigatória.
- Cores e superfícies usam os tokens compartilhados dos temas claro e escuro.

## APIs preservadas

- `POST /api/templates`
- `PATCH /api/templates/:id`
- `PATCH /api/templates/:id/observation`
- `DELETE /api/templates/:id`
- `GET /api/bootstrap?month=YYYY-MM`
