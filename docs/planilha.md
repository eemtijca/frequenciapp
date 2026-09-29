# Google Planilhas

Integração opcional da administração com a planilha da escola. A frequência e as saídas antecipadas podem usar OAuth 2.0, Google Picker e a Sheets API, sem publicar Apps Script. A conexão anterior por Apps Script continua disponível para instalações existentes. Desligada por padrão, a integração reorganiza a frequência das turmas atuais por turma de origem. Uma segunda finalidade registra as saídas antecipadas em outra planilha, em aba única.

## Princípios

- A chamada continua sendo feita nas turmas atuais; a planilha recebe o recorte por turma de origem, o mesmo da Grade.
- No modo conservador a integração confere de novo os dados antes do envio e só preenche célula observada vazia e sem fórmula. A exceção pela Sheets API é a situação de desistência ao lado do nome: só troca o sufixo `(DESISTENTE)` de uma linha vinculada ao aluno, com valor anterior idêntico ao da prévia e cópia de segurança da aba. Não limpa, não remove e não cria linha sem autorização explícita. Uma edição manual entre a última leitura e a escrita ainda pode causar conflito, pois a API não oferece condição de gravação baseada no conteúdo anterior da célula.
- O modo completo existe para atualizar e remover, sempre com frase, senha, janela curta e cópia de segurança antes de cada operação destrutiva.
- O token de atualização OAuth fica cifrado no servidor. O navegador recebe somente um token de acesso breve para abrir o Google Picker. Na conexão legada, o endereço do script e o token ficam apenas no servidor.
- A integração fica fora da cópia JSON e desligá-la não altera a planilha.

## Conectar por OAuth e Sheets API

1. Crie ou escolha um projeto Google Cloud e ative a Google Sheets API, a Google Picker API e a Google Drive API, necessária ao seletor. A leitura e a escrita da planilha continuam pela Sheets API.
2. Em Google Auth Platform, configure a marca e o público do aplicativo. No modo de teste, adicione a conta da escola como usuária de teste. O token de atualização de um aplicativo externo em teste pode expirar após sete dias; para uso contínuo, publique a configuração de autorização em produção.
3. Crie um cliente OAuth do tipo Aplicativo da Web. Cadastre a origem pública do FrequenciApp e o URI de redirecionamento exato `https://SEU-DOMINIO/api/planilha/google/retorno`.
4. Crie uma chave de API restrita à Google Picker API. Nas restrições de site, inclua a origem do FrequenciApp e `https://docs.google.com/*`, pois o Picker abre em um quadro desse domínio.
5. Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_PICKER_API_KEY` e `GOOGLE_PROJECT_NUMBER` no servidor. O número do projeto é usado pelo Picker para dar acesso apenas aos arquivos escolhidos. Não coloque o segredo OAuth no navegador nem no repositório.
6. Como administrador, abra Gestão, Configurações, Planilha de frequência. Use Conectar conta Google, autorize a conta e escolha uma planilha no seletor. Ative a integração, confira as abas, salve o mapa e faça uma prévia antes do primeiro envio. Na Planilha de saídas, escolha a planilha da mesma conta ou conecte outra conta, ative e confira a aba do registro.

O escopo solicitado é `drive.file`: o aplicativo recebe acesso aos arquivos escolhidos pelo Picker. Para trocar de planilha, escolha outro arquivo e confira novamente o mapa. As duas finalidades mantêm seleção, modo e esquema próprios. A conta da frequência pode ser usada para selecionar a planilha de saídas sem uma segunda autorização.

O envio pela Sheets API relê valores exibidos, fórmulas, marcadores e assinatura do cabeçalho imediatamente antes do lote. Operações destrutivas e mudanças da situação ao lado do nome criam uma cópia oculta da aba. A API aplica cada lote de requisições em sequência; se a conexão cair depois do envio, o aplicativo registra resultado parcial e pede conferência manual antes de repetir.

Na leitura da Sheets API, o aplicativo consulta os marcadores pela operação `spreadsheets.developerMetadata.search` e também reconhece os campos `developerMetadata` da planilha, da aba e das dimensões em `sheets.data`. A busca por chave evita tratar como ausente um código de aluno que o GET da estrutura omitiu. Se a busca falhar, a prévia para em vez de propor novamente todos os vínculos.

## Conexão legada por Apps Script

## Publicar o script

1. Abra a planilha da escola e entre em Extensões, Apps Script.
2. Apague o conteúdo padrão e cole o `gas/Codigo.gs` do repositório.
3. Em Configurações do projeto, Propriedades do script, crie `FREQUENCIAPP_TOKEN` com o token copiado em Gestão, Configurações, Planilha de frequência. Para script autônomo, crie também `PLANILHA_ID` com o identificador da planilha.
4. Em Implantar, Nova implantação, escolha Aplicativo da Web, execute como a própria conta e permita acesso a qualquer pessoa. Autorize.
5. Copie o endereço terminado em `/exec`, cole no aplicativo e use Testar conexão.

Cada mudança no código pede uma nova versão da implantação, em Implantar, Gerenciar implantações, Nova versão; o endereço `/exec` não muda. O script está na versão 4, e o Testar conexão avisa quando a versão publicada é outra. Publique sempre como nova versão da implantação existente, sem criar implantação nova, para o endereço `/exec` continuar o mesmo. O envio de frequência exige a versão 3 ou maior: com a anterior, a prévia pede a publicação da versão atual. A versão 4 acrescenta a leitura por faixas de colunas, a assinatura atual na leitura (que permite recuperar sozinho um envio sem confirmação), a vinculação e o preenchimento em lote e os tempos de cada etapa no registro de execuções do Apps Script. Um teste de unidade guarda o hash de cada versão e falha se o `gas/Codigo.gs` mudar sem versão nova.

O script marca cada linha e coluna que cria com Developer Metadata na linha ou coluna inteira, único alvo que o Google aceita além da aba e da planilha. A posição é lida da localização do marcador, que acompanha a linha ou coluna quando outras são inseridas ou removidas antes dela; o valor não carrega posição. Assim a remoção fica restrita ao que a integração criou, mesmo depois de edição manual acima. Marcador antigo com valor `linha:2` na linha inteira continua reconhecido.

## Conferir a estrutura

A leitura devolve o esquema de cada aba: linha de cabeçalho, coluna de aluno, colunas de dia com a data, coluna de total (inclusive por fórmula), mesclagens e limites. A partir dele o aplicativo:

- sugere o mapa de cada aba para uma turma de origem pelo nome;
- lista divergências: nomes repetidos, alunos da planilha que não estão no app, alunos do app sem linha e datas ambíguas;
- guarda o mapa e uma assinatura do esquema.

Antes de cada envio a assinatura é conferida de novo. Se o cabeçalho, o nome da aba ou as mesclagens mudarem, o envio para e pede nova conferência. O cartão guia conexão, estrutura e envio em etapas: conferir a estrutura só libera com a integração ligada e conectada, e salvar só libera depois da leitura.

## Enviar

O envio é manual, com prévia obrigatória, exceto o envio ao salvar a chamada, descrito abaixo. Sem conexão, o botão de envio fica bloqueado com aviso. Na Grade, o botão envia a turma de origem; no card da Gestão, "Enviar todas as turmas" envia todas as turmas mapeadas, com a mesma prévia e as mesmas regras.

**O que vai por padrão.** Só os dias com chamada criada ou alterada desde o último envio confirmado (resultado `SUCESSO`) de cada turma original, em qualquer turma atual que tenha aluno dela na lista da chamada. Pela Sheets API, uma situação de desistência alterada também inclui o último dia do período para atualizar o nome. Sem envio anterior, valem os dias com chamada do período escolhido e as situações pendentes. Sem nada alterado, a prévia avisa que não há o que enviar. "O período inteiro" continua disponível no mesmo diálogo, para conferência ou recuperação; no modo conservador ele só preenche o que está vazio e sinaliza a desistência no nome.

**Uma turma por requisição.** A prévia monta o plano de cada turma; o envio faz uma requisição por turma, em sequência, e mostra o andamento de cada uma. A falha de uma turma não impede as seguintes. A leitura da aba se limita às colunas que o plano usa: aluno, turma atual, total e os dias do período que já têm coluna.

**Estrutura sempre atual.** Depois de um envio que cria coluna ou linha, o aplicativo relê a estrutura daquela aba e atualiza o esquema e a assinatura salvos; o envio do dia seguinte funciona sem Revisar estrutura. Se a assinatura lida na prévia não bater com a salva (por exemplo, porque um envio anterior criou o dia e não chegou a responder), a estrutura daquela aba é detectada de novo e a prévia avisa. A proteção contra mudança manual entre a prévia e o envio continua: o envio recalcula o plano e exige o mesmo hash.

**Resultado sem confirmação.** O registro de cada turma nasce `PARCIAL` antes da chamada ao Google e só vira `SUCESSO` com a resposta. Timeout, queda de rede ou 504 depois de enviada a requisição ficam `PARCIAL`, com a mensagem de que não foi possível confirmar o resultado e de que a aba precisa ser conferida; nunca "nada foi alterado". Falha na releitura anterior ao lote fica `FALHA`, pois nenhuma escrita começou. O envio nunca é repetido automaticamente. Pela Sheets API, o registro também guarda o motivo técnico da leitura ou da escrita (código HTTP e mensagem do Google; na escrita, o lote que falhou), lido na tabela de sincronizações e no log do servidor; a tela mostra só a frase curta. Os dias continuam pendentes. Ao reenviar, o aplicativo relê a aba, ignora células que encontra ocupadas e reconhece a coluna do dia já criada.

A prévia mostra:

- células a preencher, células ocupadas ignoradas e fórmulas protegidas;
- colunas de dia que serão criadas, sempre antes da coluna de total quando ela existe;
- alunos novos que serão acrescentados no fim do bloco;
- situações de desistência que aparecerão ao lado do nome pela Sheets API;
- divergências existentes, apenas listadas no modo conservador.

**Identificação do aluno.** Cada linha de aluno guarda, de forma invisível, o código do aluno no aplicativo. O envio acha a linha pelo código; o nome só é usado para vincular uma linha que ainda não tem código, e apenas quando ele é único na turma e na aba. A prévia informa quantas linhas ganham o código. Alunos com o mesmo nome na turma não são vinculados pelo nome: o aviso pede conferência para evitar associar marcas ao aluno errado. A leitura vai até a última linha com conteúdo da aba, e a linha de aluno novo entra depois dela. O mapa aceita uma aba por turma original.

**Desistência.** A administração usa uma ação própria, sem desativar o aluno. Pela Sheets API, o nome passa a `Nome (DESISTENTE)` na linha da turma de origem, inclusive quando a turma atual é outra; ao desfazer, o sufixo é retirado. A prévia lista cada mudança. O aplicativo só sinaliza um nome original exato ou o mesmo nome com esse sufixo, sem fórmula. As células de frequência anteriores e as últimas linhas da aba permanecem intactas. Na conexão legada por Apps Script, o CSV inclui o sufixo, mas a situação em nome existente só é atualizada pelo modo completo; a ação automática de situação é própria da Sheets API.

Depois de revisar, o envio recalcula tudo e exige o mesmo hash de plano. Se alguém salvou uma chamada ou editou a planilha no meio do caminho, o aplicativo recusa e pede nova prévia. Na gravação, cada célula é conferida outra vez: o que estiver ocupado ou com fórmula é pulado e relatado.

## Enviar ao salvar a chamada

Em Gestão, Configurações, Planilha de frequência, o interruptor "Enviar ao salvar a chamada" liga o envio automático. Ele começa desligado e só liga com a integração ativa e a estrutura salva. Ligado, cada chamada salva dispara, depois de a resposta do salvamento já ter saído, o envio daquele dia para a aba de cada turma original dos alunos da lista da chamada (na 3ª série remanejada, a chamada da turma atual vai para as abas de origem).

O envio automático é mais estreito que o manual, porque ninguém revisa a prévia:

- roda só no modo conservador e desiste se o modo completo estiver aberto;
- só preenche célula vazia, cria a coluna do dia, vincula aluno e, pela Sheets API, atualiza o sufixo de desistência após conferir o vínculo; plano com outra substituição, limpeza, remoção, linha de aluno novo ou ambiguidade não é enviado e o dia fica pendente para o envio manual;
- faz uma tentativa por salvamento e nunca repete depois de timeout, 504 ou queda: se o último registro da turma for `PARCIAL`, os salvamentos seguintes não enviam até a aba ser conferida e um envio manual concluir;
- falha ou desistência não altera o salvamento, que já foi confirmado.

## Modo completo

O destrave é feito em Gestão, Configurações, Planilha de frequência, por um administrador, com a frase `EDITAR PLANILHA`, a senha e a duração entre 5, 15, 30 e 60 minutos, padrão 15. Enquanto a janela estiver aberta, admin e coordenação podem enviar:

- atualização de células divergentes, inclusive nome e turma atual do aluno encontrado pelo código da linha ou, antes do primeiro vínculo, pelo nome único;
- limpeza de células indicadas;
- remoção de linhas criadas pela integração para alunos que saíram da turma;
- remoção de colunas de dia e de abas criadas pela integração, com confirmação.

Fórmulas encontradas na última leitura são preservadas, inclusive no modo completo. Na conexão OAuth, vale a ressalva sobre edição simultânea. A remoção só acontece em linha, coluna ou aba com o marcador da integração. Cabeçalho com mesclagem sobre coluna de dia bloqueia a prévia e pede ajuste manual. Qualquer sessão pode voltar ao conservador, e a janela expira sozinha; perto do fim, o card oferece Estender, sempre com senha de novo.

Quando a falha no envio é de rede, o registro fica como parcial, porque parte do plano pode ter sido aplicada; recusa antes da escrita fica como falha. A tela mostra só a frase em português. Na conexão legada, o detalhe técnico devolvido pelo script fica no log do servidor e no último erro do card.

O card mostra o último erro só enquanto ele for vigente: vale o envio mais recente e, se ele deu certo, o erro anterior some. Na planilha de frequência o critério é por turma de origem, porque o envio do mês grava uma turma por vez: a falha de uma turma continua visível até ela mesma ser enviada com sucesso, e o sucesso de outra turma não a esconde. Na planilha de saídas há um só histórico. O selo "Último envio em" mostra a data em que o envio aconteceu, no fuso da escola, e o histórico lista o período enviado em DD/MM/AAAA.

## Cópias de segurança

Antes de cada operação destrutiva a integração duplica a aba como cópia oculta `_frequenciapp_backup_<aba>_<data-hora-milissegundos>`, mantendo as três mais recentes. O card lista as cópias por aba e permite restaurar, com senha e frase de novo. A restauração guarda a versão atual como nova cópia, copia o conteúdo, os formatos e as mesclagens da cópia para dentro da própria aba e invalida o esquema salvo, exigindo nova conferência antes do próximo envio. A aba mantém identificador, posição e as fórmulas de outras abas que apontam para ela. Os marcadores de linha e coluna passam a ser os da cópia.

## Planilha de saídas

A segunda finalidade registra as saídas antecipadas em outra planilha, em aba única, uma linha por saída. A configuração fica em Gestão, Configurações, Planilha de saídas. Pela Sheets API, selecione a planilha no Google Picker e confira a estrutura antes do envio. A conexão antiga por Apps Script continua disponível em Conexão por Apps Script, com implantação e token próprios.

Colunas reconhecidas no cabeçalho, por rótulo: Data, Aluno, Turma, Momento, Justificativa, Observação e Liberado por. Aluno e Data são obrigatórios. Colunas desconhecidas são preservadas e não recebem escrita. A coluna Justificativa recebe o rótulo do tipo ou o texto escrito; Liberado por recebe o rótulo do catálogo de quem libera.

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
| Não foi possível concluir a operação     | Erro do Google no script; o último erro do card traz o detalhe.                  |
| O script respondeu em formato inesperado | Código antigo publicado; publique a versão atual.                                |

## Privacidade

A integração é opcional e, quando ligada, envia a frequência para a conta Google da própria escola, controladora dos dados. Não há serviço contratado pelo aplicativo, telemetria ou compartilhamento com terceiros. Desligar a integração apaga token e esquema do banco; a planilha permanece como estiver.
