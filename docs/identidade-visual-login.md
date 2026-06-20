# Identidade visual e autenticação do Dindin

## Direção

A nova interface posiciona o Dindin como um produto financeiro pessoal simples, confiável e contemporâneo. A composição usa espaços amplos, superfícies leves e poucos elementos decorativos. A paleta aparece como identidade e hierarquia, não como excesso de cor.

## Logo

O símbolo é um monograma `D` arredondado. O espaço interno sugere continuidade e organização, enquanto a forma vertical mantém boa leitura em tamanhos pequenos.

- `frontend/src/assets/dindin-mark.svg`: símbolo principal em gradiente.
- `frontend/src/assets/dindin-mark-mono.svg`: versão monocromática.
- `frontend/src/assets/dindin-lockup.svg`: símbolo acompanhado do nome.
- `frontend/public/favicon.svg`: versão reduzida para navegador.

Mantenha uma área livre equivalente a aproximadamente um quarto da largura do símbolo. Não altere proporções, não aplique sombras fortes e não substitua as cores do gradiente por cores sem contraste.

## Cores

| Papel | Claro | Escuro |
| --- | --- | --- |
| Primária | `#7A41C0` | `#7A41C0` |
| Secundária | `#B180BF` | `#B180BF` |
| Lilás suave | `#C080B4` | `#C080B4` |
| Rosa de apoio | `#BF808E` | `#BF808E` |
| Acento quente | `#BF8780` | `#BF8780` |
| Fundo | `#FBF8FC` | `#17121C` |
| Superfície | `#FFFFFF` | `#211927` |
| Texto | `#241B2E` | `#F8F3FA` |
| Texto secundário | `#786C7E` | `#B9AABD` |
| Borda | `#E7DDEA` | `#3A2C40` |

## Tipografia e componentes

- Família: Manrope.
- Títulos: peso 700, espaçamento reduzido e frases curtas.
- Texto e campos: pesos 400 a 600.
- Campos: 56 px de altura, raio de 14 px e foco com anel violeta.
- Botão principal: gradiente violeta, lilás e rosa, com movimento discreto no hover.
- Mensagens: exibidas junto ao formulário com contraste e região acessível `aria-live`.

## Layout responsivo

No desktop, a página é dividida entre identidade à esquerda e formulário à direita. Não existe card pesado ao redor do formulário. Em telas menores que 760 px, a área de marca torna-se um cabeçalho compacto e o formulário ocupa uma única coluna.

## Rotas cobertas

- `/login`
- `/cadastro`
- `/esqueci-senha`
- `/redefinir-senha?token=...`

O tema é persistido no navegador pela chave `dindin-theme`. A autenticação continua usando as APIs e o cookie de sessão existentes.

## Previews da primeira entrega

- [Login desktop claro](previews/login-desktop-light.png)
- [Login desktop escuro](previews/login-desktop-dark.png)
- [Login mobile claro](previews/login-mobile-light.png)
- [Login mobile escuro](previews/login-mobile-dark.png)

## Próximas aplicações

Os mesmos tokens devem orientar o futuro shell autenticado: menu lateral, cabeçalho, modais de cadastro, tabelas com filtros e relatórios. Componentes novos devem reutilizar as variáveis de `frontend/src/styles/tokens.css`.
