# Apps Script do FrequenciApp

Ponte entre o aplicativo e a planilha da escola. O script só responde a
chamadas autenticadas pelo token e aplica as seguintes regras, sempre:

- preenche apenas célula vazia e sem fórmula;
- nunca sobrescreve fórmula, nem no modo completo;
- grava só as células livres de cada intervalo, em trechos contíguos, sem
  regravar célula ocupada ou com fórmula;
- remove somente linha, coluna ou aba criada pela própria integração,
  identificada por Developer Metadata;
- cria uma cópia oculta da aba antes de qualquer operação destrutiva,
  mantendo as três mais recentes;
- recusa qualquer escrita quando o cabeçalho da aba mudou.

## Apresentação na versão 5

Abas novas recebem cabeçalho destacado, colunas ajustadas, alinhamento, quebra de texto e linhas alternadas. A ação `organizarAba` aplica o mesmo padrão à aba existente, depois da prévia administrativa e da conferência da assinatura. Ela recebe `aba`, `cabecalhoLinha`, `assinatura` e `colunas` com índice, largura e alinhamento. Valores, fórmulas e formatos numéricos não são regravados. Faixas manuais de cores em outro intervalo são preservadas e bloqueiam a sobreposição; reaplicar ao mesmo intervalo não acumula faixas. Falhas de serviço podem deixar parte dos estilos aplicada, portanto a operação não tem repetição automática.

Para atualizar, cole o código da versão 5, publique uma nova versão na implantação existente e use Testar conexão no aplicativo. O endereço `/exec` e o token continuam os mesmos. `estrutura` aceita `apresentacao: true` para ampliar a amostra a 400 colunas durante a prévia visual, mantendo a leitura padrão de 60 colunas nos envios.

## Marcadores

O Google só aceita Developer Metadata na planilha, na aba ou numa linha ou
coluna inteira. O script marca a linha inteira (`5:5`) com a chave
`frequenciapp.linha` e a coluna inteira (`C:C`) com `frequenciapp.coluna`,
sempre antes de gravar o conteúdo, para uma falha nunca deixar linha sem
marcador. A posição vem da localização do metadado (`getLocation()`), que o
Google move junto com a linha ou coluna quando outras entram ou saem antes
dela e apaga junto com ela. O valor do marcador é `1` e não carrega posição.
Marcador antigo com valor `linha:2`, preso à linha inteira, continua
reconhecido pela localização; metadado de outro tipo com essas chaves é
ignorado. Uma linha só é criada se estiver inteira vazia e sem fórmula.

Desde a versão 3, cada linha de aluno também guarda o código do aluno no
aplicativo, na chave `frequenciapp.aluno`, com o id do aluno como valor. A
leitura devolve os códigos por linha (`alunosDasLinhas`), e o aplicativo acha
o aluno pelo código, mesmo que o nome mude, se repita ou a linha seja movida
ou ordenada. A operação `vincularLinhas` grava o código em linha existente
só se a célula do nome ainda mostrar o texto lido na prévia; `criarLinhas`
grava o código junto com a linha. Cada linha tem no máximo um código e cada
código fica em uma linha só. A restauração de cópia recria os códigos da
cópia.

## Desempenho e tempos

Cada chamada ao serviço de planilhas custa uma ida ao Google. A versão 4
agrupa o trabalho: a vinculação faz uma busca de metadados por lote (a 3
buscava e relia todos os metadados a cada linha), e preenchimentos seguidos
são lidos e gravados por trecho contíguo de cada coluna, sem pular fórmula nem
célula ocupada. No dublê dos testes, o envio com vinculação de 35 linhas, dia
novo e 35 marcas caiu de 3.376 para 97 chamadas na versão 4, e o envio do dia seguinte, de
156 para 22.

A leitura aceita `blocos` (faixas de colunas), devolve `ultimaLinha` e, com
`cabecalhoLinha`, a `assinatura` atual. `estrutura` aceita `aba` para devolver
só aquela aba. `ler` e `aplicar` devolvem `tempos` por etapa em milissegundos
e registram o mesmo objeto com `console.log`, visível em Execuções no editor
do Apps Script.

## Cópias e restauração

A cópia se chama `_frequenciapp_backup_<aba>_<yyyyMMdd-HHmmss-SSS>`, com
sufixo `-2`, `-3` quando duas cópias caem no mesmo milissegundo. Ela é
marcada com `frequenciapp.copia` e nunca herda `frequenciapp.aba`. A
restauração copia valores, fórmulas, formatos, mesclagens e congelamento da
cópia para dentro da própria aba, que mantém ID, posição e as referências
feitas por outras abas. Os marcadores de linha e coluna da aba passam a ser
os da cópia; se a cópia não os tiver, a aba fica sem marcador e a integração
não remove nada dela até novas linhas ou colunas serem criadas.

## Erros

Toda exceção é registrada com `console.error` no Stackdriver do projeto
(Execuções, no editor do Apps Script). A resposta traz a frase em português
em `erro` e a mensagem original em `detalhe`, sem o token nem o
`PLANILHA_ID` e com até 300 caracteres. Exceção durante `escrever`,
`aplicar` ou `restaurarCopia` vem com `parcial: true`, porque parte da ação
pode ter sido aplicada. O aplicativo mostra só a frase; o detalhe vai para o
log do servidor e para o último erro do cartão da integração.

## Publicar

1. Abra a planilha da escola e entre em Extensões, Apps Script.
2. Apague o conteúdo padrão e cole o `Codigo.gs` deste diretório.
3. No menu do projeto, abra Configurações do projeto, Propriedades do script
   e crie `FREQUENCIAPP_TOKEN` com o token copiado do aplicativo, em Gestão,
   Configurações, Google Planilhas. Se o script for autônomo, crie também
   `PLANILHA_ID` com o identificador da planilha.
4. Em Implantar, Nova implantação, escolha Aplicativo da Web, execute como
   a própria conta e permita acesso a qualquer pessoa. Autorize a conta.
5. Copie o endereço terminado em `/exec` e cole no aplicativo, em Gestão.
6. Use Testar conexão e Leia a estrutura antes do primeiro envio.

A cada mudança no código, publique uma nova versão da implantação em
Implantar, Gerenciar implantações, editar, Nova versão; o endereço `/exec`
continua o mesmo. O script declara a `VERSAO` (hoje 4) e o aplicativo avisa
no Testar conexão quando a versão publicada está atrasada. O teste
`tests/unit/gas.test.ts` guarda o hash de cada versão e falha quando o
`Codigo.gs` muda sem uma `VERSAO` nova.

Para a planilha de saídas, repita a publicação na outra planilha, com outro
`FREQUENCIAPP_TOKEN` e, se o projeto for autônomo, outro `PLANILHA_ID`. O
mesmo código serve às duas finalidades, e o aplicativo guarda um endereço e
um token por planilha.

## Desenvolvimento com clasp

```bash
npm install -g @google/clasp
clasp login
cp gas/.clasp.json.example gas/.clasp.json   # preencha o scriptId
clasp push
```

O arquivo `gas/appsscript.json` mantém o manifesto com o escopo mínimo e a
configuração de Aplicativo da Web. `gas/.clasp.json` não entra no Git.

## Ações

| Ação             | Papel                                                       |
| ---------------- | ----------------------------------------------------------- |
| `ping`           | Identificação, abas e versão do script.                     |
| `estrutura`      | Dimensões, congelamento, mesclagens e amostra do cabeçalho. |
| `ler`            | Janela de células com marcação de fórmula.                  |
| `escrever`       | Preenche somente células vazias.                            |
| `aplicar`        | Operações tipadas do modo completo.                         |
| `criarAba`       | Cria aba nova com cabeçalho mínimo.                         |
| `removerAba`     | Remove aba criada pela integração.                          |
| `listarCopias`   | Lista cópias ocultas de uma aba.                            |
| `restaurarCopia` | Restaura o conteúdo de uma cópia dentro da própria aba.     |

## Solução de problemas

- **Não autorizado**: o valor de `FREQUENCIAPP_TOKEN` não confere com o
  token do aplicativo. Copie de novo e salve a propriedade.
- **A estrutura da planilha mudou**: cabeçalho ou nome de aba alterado.
  Volte ao aplicativo e use Conferir estrutura.
- **Aba não encontrada**: a aba mapeada foi renomeada ou removida.
- **Sem permissão**: a conta que publicou o script precisa de edição na
  planilha; em unidade compartilhada, republique com a conta correta.
- **A linha ou coluna não foi criada pela integração**: a remoção é
  recusada de propósito. Ajuste manualmente na planilha, se necessário.
  Marcador fora de linha ou coluna inteira é ignorado; publique a versão
  atual do `Codigo.gs`.
- **Não foi possível concluir a operação na planilha**: confira o último
  erro no cartão da integração, que traz o detalhe do Google, ou as
  Execuções do projeto no editor do Apps Script.
