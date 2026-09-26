# Apps Script do FrequenciApp

Ponte entre o aplicativo e a planilha da escola. O script só responde a
chamadas autenticadas pelo token e aplica as seguintes regras, sempre:

- preenche apenas célula vazia e sem fórmula;
- nunca sobrescreve fórmula, nem no modo completo;
- remove somente linha, coluna ou aba criada pela própria integração,
  identificada por Developer Metadata;
- cria uma cópia oculta da aba antes de qualquer operação destrutiva,
  mantendo as três mais recentes;
- recusa qualquer escrita quando o cabeçalho da aba mudou.

## Publicar

1. Abra a planilha da escola e entre em Extensões, Apps Script.
2. Apague o conteúdo padrão e cole o `Codigo.gs` deste diretório.
3. No menu do projeto, abra Configurações do projeto, Propriedades do script
   e crie `FREQUENCIAPP_TOKEN` com o token copiado do aplicativo, em Gestão,
   Configurações, Google Planilhas. Se o script for autônomo, crie também
   `PLANILHA_ID` com o identificador da planilha.
4. Em Implantar, Nova implantação, escolha Aplicativo da Web, execute como
   você e permita acesso a qualquer pessoa. Autorize a conta.
5. Copie o endereço terminado em `/exec` e cole no aplicativo, em Gestão.
6. Use Testar conexão e Leia a estrutura antes do primeiro envio.

A cada mudança no código, publique uma nova versão da implantação. O
aplicativo avisa quando a versão publicada está atrasada.

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
| `restaurarCopia` | Troca a aba atual por uma cópia.                            |

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
