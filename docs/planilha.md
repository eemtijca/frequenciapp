# Google Planilhas

Integração opcional da administração com a planilha da escola, por Google Apps Script. Desligada por padrão, ela reorganiza a frequência das turmas atuais por turma de origem e preenche a planilha sem nunca alterar célula ocupada. Uma segunda finalidade registra as saídas antecipadas em outra planilha, em aba única. O guia cobre a publicação do script, o mapeamento, o envio, o modo completo e as cópias de segurança.

## Princípios

- A chamada continua sendo feita nas turmas atuais; a planilha recebe o recorte por turma de origem, o mesmo da Grade.
- No modo conservador a integração só preenche célula vazia e sem fórmula. Não substitui, não limpa, não remove e não cria linha sem autorização explícita.
- O modo completo existe para atualizar e remover, sempre com frase, senha, janela curta e cópia de segurança antes de cada operação destrutiva.
- O endereço do script e o token ficam apenas no servidor do aplicativo. O navegador nunca fala com o Google.
- A integração fica fora da cópia JSON e desligá-la não altera a planilha.

## Publicar o script

1. Abra a planilha da escola e entre em Extensões, Apps Script.
2. Apague o conteúdo padrão e cole o `gas/Codigo.gs` do repositório.
3. Em Configurações do projeto, Propriedades do script, crie `FREQUENCIAPP_TOKEN` com o token copiado em Gestão, Configurações, Planilha de frequência. Para script autônomo, crie também `PLANILHA_ID` com o identificador da planilha.
4. Em Implantar, Nova implantação, escolha Aplicativo da Web, execute como a própria conta e permita acesso a qualquer pessoa. Autorize.
5. Copie o endereço terminado em `/exec`, cole no aplicativo e use Testar conexão.

Cada mudança no código pede uma nova versão da implantação. O aplicativo mostra a versão que o script devolveu no último teste. O script guarda a posição de cada linha e coluna criada no valor do marcador de metadado; marcador sem essa posição vem de versão de teste antiga e é ignorado, o que mantém a remoção restrita ao que a integração criou.

## Conferir a estrutura

A leitura devolve o esquema de cada aba: linha de cabeçalho, coluna de aluno, colunas de dia com a data, coluna de total (inclusive por fórmula), mesclagens e limites. A partir dele o aplicativo:

- sugere o mapa de cada aba para uma turma de origem pelo nome;
- lista divergências: nomes repetidos, alunos da planilha que não estão no app, alunos do app sem linha e datas ambíguas;
- guarda o mapa e uma assinatura do esquema.

Antes de cada envio a assinatura é conferida de novo. Se o cabeçalho, o nome da aba ou as mesclagens mudarem, o envio para e pede nova conferência. O cartão guia conexão, estrutura e envio em etapas: conferir a estrutura só libera com a integração ligada e conectada, e salvar só libera depois da leitura.

## Enviar

O envio é manual, com prévia obrigatória. Sem conexão, o botão de envio fica bloqueado com aviso. Na Grade, o botão envia a turma de origem e o período selecionados; no card da Gestão, "Enviar o mês de todas as turmas" envia o mês escolhido para todas as turmas mapeadas, com a mesma prévia e as mesmas regras.

A prévia mostra:

- células a preencher, células ocupadas ignoradas e fórmulas protegidas;
- colunas de dia que serão criadas, sempre antes da coluna de total quando ela existe;
- alunos novos que serão acrescentados no fim do bloco;
- divergências existentes, apenas listadas no modo conservador.

Depois de revisar, o envio recalcula tudo e exige o mesmo hash de plano. Se alguém salvou uma chamada ou editou a planilha no meio do caminho, o aplicativo recusa e pede nova prévia. Na gravação, cada célula é conferida outra vez: o que estiver ocupado ou com fórmula é pulado e relatado.

## Modo completo

O destrave é feito em Gestão, Configurações, Planilha de frequência, por um administrador, com a frase `EDITAR PLANILHA`, a senha e a duração entre 5, 15, 30 e 60 minutos, padrão 15. Enquanto a janela estiver aberta, admin e coordenação podem enviar:

- atualização de células divergentes, inclusive nome e turma atual quando o aluno é encontrado pelo nome normalizado (renomeações completas sem correspondência pedem ajuste manual, porque não há identificador na planilha);
- limpeza de células indicadas;
- remoção de linhas criadas pela integração para alunos que saíram da turma;
- remoção de colunas de dia e de abas criadas pela integração, com confirmação.

Fórmula nunca é sobrescrita, nem no modo completo. A remoção só acontece em linha, coluna ou aba com o marcador da integração. Cabeçalho com mesclagem sobre coluna de dia bloqueia a prévia e pede ajuste manual. Qualquer sessão pode voltar ao conservador, e a janela expira sozinha; perto do fim, o card oferece Estender, sempre com senha de novo.

Quando a falha no envio é de rede, o registro fica como parcial, porque parte do plano pode ter sido aplicada; recusa explícita do script fica como falha.

## Cópias de segurança

Antes de cada operação destrutiva o script duplica a aba como cópia oculta `_frequenciapp_backup_<aba>_<data-hora>`, mantendo as três mais recentes. O card lista as cópias por aba e permite restaurar, com senha e frase de novo. A restauração guarda a versão atual como nova cópia e invalida o esquema salvo, exigindo nova conferência antes do próximo envio.

## Planilha de saídas

A segunda finalidade registra as saídas antecipadas em outra planilha, em aba única, uma linha por saída. A configuração fica em Gestão, Configurações, Planilha de saídas, com token, endereço e conferência de estrutura próprios. O mesmo `gas/Codigo.gs` é publicado na planilha de saídas, com implantação e token próprios; o aplicativo avisa quando o script publicado está atrasado.

Colunas reconhecidas no cabeçalho, por rótulo: Data, Aluno, Turma, Momento, Justificativa, Observação e Liberado por. Aluno e Data são obrigatórios. Colunas desconhecidas são preservadas e não recebem escrita.

O envio é manual, pela vista Saídas, no botão "Enviar para a planilha", com o mês escolhido e prévia obrigatória. No modo conservador só nasce linha para saída que ainda não existe e só célula vazia é preenchida; divergência em linha manual é listada e ignorada. No modo completo, com a mesma frase, senha e prazo, o aplicativo corrige células divergentes de linhas criadas pela integração e permite remover linhas marcadas que não têm mais saída no período enviado. Cada operação destrutiva guarda cópia da aba.

## Solução de problemas

| Mensagem                                 | Causa provável                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------------- |
| Não autorizado                           | Token do aplicativo diferente do `FREQUENCIAPP_TOKEN` do script.                 |
| A estrutura da planilha mudou            | Cabeçalho, nome de aba ou mesclagem alterados; confira de novo.                  |
| A mesclagem cobre colunas de dia         | Ajuste o cabeçalho na planilha antes de enviar.                                  |
| O script usa outro fuso                  | Divergência com `TZ_APP`; as datas podem sair deslocadas.                        |
| O script está na versão antiga           | Publique a versão atual do `gas/Codigo.gs`.                                      |
| Aba não encontrada                       | A aba mapeada foi renomeada ou removida.                                         |
| A linha não foi criada pela integração   | A remoção é recusada de propósito para dado manual ou marcador de versão antiga. |
| A aba de saídas precisa de Aluno e Data  | Ajuste o cabeçalho da aba de registro antes de salvar a estrutura.               |
| Nada a enviar no período                 | As saídas do mês já estão na planilha; a prévia mostra zero linhas novas.        |
| Não foi possível falar com a planilha    | Rede de saída bloqueada ou implantação despublicada.                             |
| O script respondeu em formato inesperado | Código antigo publicado; publique a versão atual.                                |

## Privacidade

A integração é opcional e, quando ligada, envia a frequência para a conta Google da própria escola, controladora dos dados. Não há serviço contratado pelo aplicativo, telemetria ou compartilhamento com terceiros. Desligar a integração apaga token e esquema do banco; a planilha permanece como estiver.
