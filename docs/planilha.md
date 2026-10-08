# Google Planilhas

Integração opcional da administração com a planilha da escola. A frequência e as saídas antecipadas usam OAuth 2.0, Google Picker e a Sheets API. Desligada por padrão, a integração reorganiza a frequência das turmas atuais por turma de origem. Uma segunda finalidade registra saídas e entradas em outro arquivo. A finalidade `PARCIAL` registra a frequência para conferência na Seduc em um terceiro arquivo distinto, com aba própria, combinando a chamada salva e as personalizações.

## Princípios

- A chamada continua sendo feita nas turmas atuais; a planilha recebe o recorte por turma de origem, o mesmo da Grade.
- No modo conservador a integração confere de novo os dados antes do envio e só preenche célula observada vazia e sem fórmula. A exceção pela Sheets API é a desistência: troca o nome original por `DESISTENTE` na linha vinculada ao aluno, com valor anterior idêntico ao da prévia. Não limpa, não remove e não cria linha sem autorização explícita. Uma edição manual entre a última leitura e a escrita ainda pode causar conflito, pois a API não oferece condição de gravação baseada no conteúdo anterior da célula.
- O modo completo existe para atualizar e remover, sempre com frase, senha e janela curta, sem criar cópias internas.
- O token de atualização OAuth fica cifrado no servidor. O navegador recebe somente um token de acesso breve para abrir o Google Picker.
- A integração fica fora da cópia JSON e desligá-la não altera a planilha.

## Conectar por OAuth e Sheets API

1. Crie ou escolha um projeto Google Cloud e ative a Google Sheets API, a Google Picker API e a Google Drive API, necessária ao seletor. A leitura e a escrita da planilha continuam pela Sheets API.
2. Em Google Auth Platform, configure a marca e o público do aplicativo. No modo de teste, adicione a conta da escola como usuária de teste. O token de atualização de um aplicativo externo em teste pode expirar após sete dias; para uso contínuo, publique a configuração de autorização em produção.
3. Crie um cliente OAuth do tipo Aplicativo da Web. Cadastre a origem pública do FrequenciApp e o URI de redirecionamento exato `https://SEU-DOMINIO/api/planilha/google/retorno`.
4. Crie uma chave de API restrita à Google Picker API. Nas restrições de site, inclua a origem do FrequenciApp e `https://docs.google.com/*`, pois o Picker abre em um quadro desse domínio.
5. Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_PICKER_API_KEY` e `GOOGLE_PROJECT_NUMBER` no servidor. O número do projeto é usado pelo Picker para dar acesso apenas aos arquivos escolhidos. Não coloque o segredo OAuth no navegador nem no repositório.
6. Como administrador, abra Gestão, Configurações, Planilha de frequência. Use Conectar conta Google, autorize a conta e escolha uma planilha no seletor. Ative a integração, confira as abas, salve o mapa e faça uma prévia antes do primeiro envio. Na Planilha de saídas, escolha a planilha da mesma conta ou conecte outra conta, ative e confira a aba do registro.

O escopo solicitado é `drive.file`: o aplicativo recebe acesso aos arquivos escolhidos pelo Picker. Para trocar de planilha, escolha outro arquivo e confira novamente o mapa. As três finalidades mantêm seleção e estrutura próprias. A conta da frequência pode ser usada para selecionar os arquivos de saídas e chamada parcial sem uma segunda autorização.

Para renovar uma autorização vencida, usar **Reconectar conta Google** e autorizar a conta que tem acesso à planilha existente. A reconexão confere esse acesso antes de atualizar o token e preserva arquivo, mapa, integração ativa e envio automático. Cancelamento, falha ou alteração da conexão durante a autorização mantêm a configuração anterior. **Trocar conta Google** continua exigindo escolher o arquivo e conferir o mapa; escolher novamente o mesmo arquivo no Picker preserva sua estrutura.

Falhas do Google não encerram a sessão do aplicativo. Autorização expirada ou revogada pede reconexão; falha temporária pede nova tentativa; configuração OAuth inválida pede ajuste no servidor. O log de autorização registra apenas status HTTP e categoria conhecida, sem tokens nem descrições externas. Se a expiração se repetir após sete dias, conferir o modo de publicação do aplicativo no Google Auth Platform.

O envio pela Sheets API relê valores exibidos, fórmulas, marcadores e assinatura do cabeçalho imediatamente antes do lote. Operações destrutivas e mudanças de desistência no nome não criam abas de backup. A API aplica cada lote de requisições em sequência; se a conexão cair depois do envio, o aplicativo registra resultado parcial e pede conferência manual antes de repetir.

Na leitura da Sheets API, o aplicativo consulta os marcadores pela operação `spreadsheets.developerMetadata.search` e também reconhece os campos `developerMetadata` da planilha, da aba e das dimensões em `sheets.data`. A busca por chave evita tratar como ausente um código de aluno que o GET da estrutura omitiu. Se a busca falhar, a prévia para em vez de propor novamente todos os vínculos.

## Frequência por turma e mês

Em Gestão, Configurações, Planilhas, Planilha de frequência, usar **Preparar mês**. Escolher o mês e confirmar a preparação das turmas. Cada turma de origem recebe uma aba como `1º A · Outubro`, com Aluno e datas de segunda a sexta em `dd/mm/aaaa`, sem Turma atual. A lista de alunos ativos e os vínculos são preparados; as marcações ficam vazias até o envio. A interface acompanha uma turma por requisição e informa abas criadas, atualizadas, reutilizadas e pendências. Cancelar antes de confirmar não grava nada.

Para atualizar um mês já preparado, abrir **Preparar mês**, selecionar novamente o mês e confirmar. O aplicativo renomeia a mesma aba e exclui as colunas próprias de Turma atual, sábado e domingo, inclusive os valores dessas colunas na planilha. As frequências dos demais dias, as fórmulas nessas células, a lista de alunos e os vínculos são mantidos; não há reconstrução das linhas nem cópia de backup. As chamadas salvas no aplicativo permanecem disponíveis. Colunas sem identificação da integração são preservadas; cabeçalho inesperado ou mesclagens que cruzem colunas removidas exigem conferência.

Repetir o preparo de uma aba já ajustada apenas reutiliza o destino. Ano e mês continuam identificados nos metadados, independentemente do título. Se o nome estiver ocupado pela mesma turma e mês de outro ano, o novo título inclui o ano, como `1º A · Outubro 2027`. Aba manual com nome igual exige conferência. Criação ou ajuste usam um lote atômico do Google. Uma resposta perdida permite somente releitura para conferir título, identidade e colunas finais, sem repetir a gravação. Preparação e envio da frequência compartilham uma trava entre instâncias, impedindo que um envio use índices de colunas durante sua remoção.

Falha comum de conexão interrompe o lote e mantém as turmas restantes como não preparadas. **Tentar pendentes** retoma apenas as turmas sem sucesso enquanto o diálogo está aberto. **Reconectar conta Google** devolve a Gestão ao mês selecionado; depois do retorno, abrir **Preparar mês** e confirmar novamente. As abas já criadas são reutilizadas. Não há preparação nem envio automático após a autorização.

Depois de preparar o primeiro mês de uma turma, os envios dela usam apenas as abas mensais e somente datas de segunda a sexta. **Prévia do envio** permite enviar as chamadas do mês, inclusive períodos antigos do aplicativo; confirmações anteriores na aba antiga não fazem a nova aba parecer preenchida. Conteúdo manual e alunos que só existem na planilha antiga continuam nessa aba, sem migração automática. A seleção de alunos acompanha a Grade do aplicativo. Chamadas de sábado e domingo não recriam colunas nem aparecem como pendências de envio mensal; abas legadas mantêm seu comportamento anterior.

Preparar cada mês antes de iniciar seus envios. **Enviar ao salvar** usa o mês da data da chamada e a turma de origem do aluno. Mês ainda não preparado fica pendente para a Gestão; não recebe escrita na aba antiga nem em outro mês. Um período que atravessa meses gera planos separados, com resultados por aba. Abas antigas permanecem na planilha, mesmo quando ocultas.

A identificação mensal usa metadados de turma, mês e geração, além do identificador estável da aba. O histórico de sincronização registra `destino` para distinguir cada arquivo, aba e recriação; registros antigos mantêm esse campo nulo. A conferência da estrutura reutiliza o esquema salvo dos meses conhecidos e consulta seu catálogo, enquanto cada envio relê assinatura, identidade e conteúdo atuais. A migração `20261005145103_destino_mensal_planilha` deve ser aplicada antes de executar esta versão (ADR-037).

Ao concluir **Preparar mês** para todas as turmas, a Gestão mostra as abas do mês escolhido e oculta outros meses e as abas legadas vinculadas às turmas que já têm esse mês preparado. O mês inicial é o corrente no fuso da escola. **Mostrar mês na planilha** permite aplicar essa organização a abas já preparadas, consultar outro mês e voltar ao corrente. A seleção começa no mês corrente a cada abertura e só altera a planilha após confirmar **Mostrar mês**. Na virada do mês, preparar o novo mês para mudar as abas visíveis; não há agendamento dessa troca.

A visibilidade usa a identificação mensal, incluindo o ano, sem depender do título. Nenhuma célula, fórmula ou aba é excluída nessa operação. Abas manuais sem vínculo, cópias ocultas e abas legadas de turmas sem o mês preparado permanecem intactas. Um mês sem abas preparadas exige preparo antes da troca. O Google recebe um lote atômico que primeiro revela o mês e depois oculta os demais destinos. Envios e consultas do aplicativo continuam reconhecendo os meses ocultos e não alteram a navegação da planilha. Uma resposta perdida exige conferência antes de outra tentativa.

## Organização visual e cabeçalhos

Abas novas recebem cabeçalho verde com texto branco e negrito, altura de 44 pixels e congelamento até o cabeçalho. Colunas de aluno têm 260 pixels; turma, 140; dias da frequência com ano completo, 110. Datas e totais ficam centralizados; observações e motivos recebem espaço e quebra de texto. As linhas alternam branco e verde claro por faixas nativas, que acompanham a planilha. Novas colunas de dia também recebem largura e alinhamento próprios.

Para abas existentes, na Gestão, escolha a aba de frequência e use Organizar apresentação. A planilha de entradas e saídas oferece a mesma ação para a aba escolhida e, no mesmo cartão, para a aba Entradas, junto de Preparar aba Entradas. A prévia mostra os cabeçalhos e as larguras; Cancelar não altera a planilha. Aplicar apresentação substitui a aparência das colunas reconhecidas e registra a ação na auditoria. Valores, fórmulas, formatos numéricos, rótulos e colunas auxiliares são preservados. Regras de formatação condicional da escola continuam em vigor e podem prevalecer sobre as cores alternadas.

A prévia é assinada e vinculada ao arquivo, à conexão e ao cabeçalho. A confirmação relê a estrutura e a integração confere a assinatura novamente antes de aplicar estilos. Uma edição manual após essa última leitura ainda pode causar conflito, pois o Google não oferece escrita condicionada à assinatura. Abas ocultas, células mescladas, mais de 400 colunas ou faixas de cores alternadas que se sobrepõem em outro intervalo exigem ajuste manual antes da organização. Reaplicar ao mesmo intervalo atualiza as cores sem acumular faixas. O congelamento já existente não é reduzido.

A Sheets API oferece o padrão diretamente. A organização visual não exige modo completo, pois não altera registros. Os arquivos CSV continuam sendo texto, sem cores ou larguras de coluna.

## Retirar título e legenda e corrigir datas

As novas colunas da frequência e os cabeçalhos do CSV usam `dd/mm/aaaa`. Para corrigir as abas existentes, na Gestão, escolha a aba e use **Corrigir cabeçalho e datas**. O ano informado atende datas sem nenhum ano explícito na aba; quando há uma data com ano, a correção usa a data explícita mais próxima, respeitando a virada de dezembro para janeiro. A prévia mostra as datas completas e a quantidade de linhas que serão retiradas. Cancelar não grava nada.

A confirmação remove somente as linhas iniciais reconhecidas como título de frequência, legenda de presença/falta ou espaço vazio. A linha Aluno e os dias passam para a primeira linha. Conteúdo manual diferente, fórmulas nessas linhas ou nos cabeçalhos que seriam alterados e mesclagens na tabela bloqueiam a operação. Mesclagens inteiramente dentro da introdução podem ser removidas junto com ela.

A integração não cria abas de backup. As chamadas, colunas auxiliares e fórmulas da tabela permanecem; o Google ajusta as referências após a remoção das linhas. O esquema da aba é relido e o mapa das turmas é conservado. A correção não é automática nas planilhas já conectadas: exige a prévia e a confirmação administrativas.

## Organizar todas as turmas

Na Gestão, a seleção **Todas as turmas** organiza a apresentação ou corrige cabeçalhos e datas nas abas vinculadas às turmas na estrutura salva. Abas auxiliares, cópias e turmas sem aba vinculada não entram na seleção. A prévia apresenta cada aba, seus cabeçalhos e as alterações previstas; a confirmação é única.

As leituras e aplicações seguem uma aba por requisição, em sequência, com andamento e resultado por aba. Manter a tela aberta até o resultado. Uma aba que não puder ser conferida fica fora da aplicação. Falhas durante a escrita são identificadas sem repetição automática; as demais abas continuam sendo processadas. Conferir a aba antes de uma nova tentativa, pois uma falha de rede pode ocorrer depois da gravação. As correções conservam o mapa e não criam abas de backup. Renovar o esquema de uma aba não invalida a prévia das outras; trocar o arquivo, as credenciais ou o mapa exige novas prévias.

Na conexão Google, uma leitura recusada pelo limite temporário (HTTP 429) pode pausar a organização por até um minuto antes de ser repetida. A pausa respeita `Retry-After`, quando informado, e é compartilhada pelas leituras simultâneas da mesma requisição. Cada aba admite até duas pausas; uma recusa persistente ou que peça espera superior a um minuto encerra a tentativa com orientação para aguardar. As rotas de organização reservam até 300 segundos, compatíveis com o limite do Vercel Hobby com Fluid Compute. Só a leitura recusada é repetida: remoções e escritas já efetuadas não são reenviadas. Erros de acesso, estrutura, rede e gravação continuam exigindo conferência.

## Conferir a estrutura

A leitura devolve o esquema de cada aba: linha de cabeçalho, coluna de aluno, colunas de dia com a data, coluna de total (inclusive por fórmula), mesclagens e limites. A partir dele o aplicativo:

- sugere o mapa de cada aba para uma turma de origem pelo nome;
- lista divergências: nomes repetidos, alunos da planilha que não estão no app, alunos do app sem linha e datas ambíguas;
- guarda o mapa e uma assinatura do esquema.

Antes de cada envio a assinatura é conferida de novo. Se o cabeçalho, o nome da aba ou as mesclagens mudarem, o envio para e pede nova conferência. O cartão guia conexão, estrutura e envio em etapas: conferir a estrutura só libera com a integração ligada e conectada, e salvar só libera depois da leitura.

## Enviar

O envio é manual, com prévia obrigatória, exceto o envio ao salvar a chamada, descrito abaixo. Sem conexão, o botão de envio fica bloqueado com aviso. Na Grade, o botão envia a turma de origem; no card da Gestão, "Enviar todas as turmas" envia todas as turmas mapeadas, com a mesma prévia e as mesmas regras.

**O que vai por padrão.** Só os dias com chamada ainda sem envio confirmado em cada turma original, em qualquer turma atual que tenha aluno dela na lista da chamada. A confirmação precisa cobrir o próprio dia, ter referência posterior à atualização da chamada e não ter células puladas. O sucesso de outro dia, mês ou turma não elimina essa pendência. Pela Sheets API, uma situação de desistência alterada também inclui o último dia do período para atualizar o nome. Sem envio anterior, valem os dias com chamada do período escolhido e as situações pendentes. Sem nada alterado, a prévia avisa que não há o que enviar. "O período inteiro" continua disponível no mesmo diálogo, para conferência ou recuperação; no modo conservador ele só preenche o que está vazio e sinaliza a desistência no nome.

**Uma turma por requisição.** A prévia monta o plano de cada turma; o envio faz uma requisição por turma, em sequência, e mostra o andamento de cada uma. A falha de uma turma não impede as seguintes. A leitura da aba se limita às colunas que o plano usa: aluno, turma atual, total e os dias do período que já têm coluna.

**Estrutura sempre atual.** Depois de um envio que cria coluna ou linha, o aplicativo relê a estrutura daquela aba e atualiza o esquema e a assinatura salvos; o envio do dia seguinte funciona sem Revisar estrutura. Se a assinatura lida na prévia não bater com a salva (por exemplo, porque um envio anterior criou o dia e não chegou a responder), a estrutura daquela aba é detectada de novo e a prévia avisa. A proteção contra mudança manual entre a prévia e o envio continua: o envio recalcula o plano e exige o mesmo hash.

**Resultado sem confirmação.** O registro de cada turma nasce `PARCIAL` antes da chamada ao Google e só vira `SUCESSO` com a resposta. Timeout, queda de rede ou 504 depois de enviada a requisição ficam `PARCIAL`, com a mensagem de que não foi possível confirmar o resultado e de que a aba precisa ser conferida; nunca "nada foi alterado". Falha na releitura anterior ao lote fica `FALHA`, pois nenhuma escrita começou. O envio nunca é repetido automaticamente. Pela Sheets API, o registro também guarda o motivo técnico da leitura ou da escrita (código HTTP e mensagem do Google; na escrita, o lote que falhou), lido na tabela de sincronizações e no log do servidor; a tela mostra só a frase curta. Os dias continuam pendentes. Ao reenviar, o aplicativo relê a aba, ignora células que encontra ocupadas e reconhece a coluna do dia já criada.

A prévia mostra:

- células a preencher, células ocupadas ignoradas e fórmulas protegidas;
- colunas de dia que serão criadas, sempre antes da coluna de total quando ela existe;
- alunos novos que serão incluídos e posicionados em ordem alfabética;
- nomes de alunos que serão trocados por `DESISTENTE` ou restaurados pela Sheets API;
- divergências existentes, apenas listadas no modo conservador.

O diálogo de envio é enxuto: uma escolha entre "Só chamadas pendentes" e "O período inteiro", um bloco único por aba com os totais em caixas (só o que tem valor; zeros não aparecem e vários dias viram um intervalo), os avisos importantes à vista e, em recolhidos, "Ver detalhes da prévia" (dias novos, nomes e divergências) e "Opções do envio" (criar colunas, acrescentar alunos e, no modo completo, atualizar divergências). As candidatas à remoção de linhas e colunas ficam sempre à vista, fora do bloco recolhido, e só podem ser marcadas no modo completo; as colunas de dia aparecem como caixas marcáveis, com Marcar todas e Limpar.

**Identificação do aluno.** Cada linha de aluno guarda, de forma invisível, o código do aluno no aplicativo. O envio acha a linha pelo código; o nome só é usado para vincular uma linha que ainda não tem código, e apenas quando ele é único na turma e na aba. A prévia informa quantas linhas ganham o código. Alunos com o mesmo nome na turma não são vinculados pelo nome: o aviso pede conferência para evitar associar marcas ao aluno errado. A leitura vai até a última linha com conteúdo da aba. A linha de aluno novo é criada depois dela e, ao concluir a escrita, a integração ordena as linhas identificadas pelo nome em português. O mapa aceita uma aba por turma original.

**Ordem alfabética.** Abas mensais novas já recebem os alunos em ordem alfabética, com os códigos na mesma posição dos nomes. Envios manuais e automáticos de frequência ordenam as linhas identificadas depois de gravar as marcações. A Sheets API move a linha inteira, incluindo frequências anteriores, fórmulas, observações, formatos e código do aluno. Cabeçalhos, nomes com fórmula e linhas manuais sem identificação conservam a posição. Homônimos mantêm a ordem relativa. Mesclagens de várias linhas na tabela exigem conferência antes de ordenar.

Para ordenar uma aba existente, abrir **Relatórios**, **Grade**, selecionar a turma e o período, abrir **Enviar para a planilha**, escolher **O período inteiro**, conferir a prévia e confirmar. Mesmo sem marcações novas, o envio confere a ordem das linhas; quando já estão ordenadas, não grava movimentos novamente. A ordenação não exige modo completo e não remove alunos. O envio que inclui uma aluna transferida na turma de destino já a posiciona pelo nome.

**Desistência.** A administração usa uma ação própria, sem desativar o aluno. Na Chamada, o nome permanece visível com `DESISTENTE` ao lado e o botão de frequência fica bloqueado. Pela Sheets API, a célula do nome passa a conter somente `DESISTENTE` na linha da turma de origem, inclusive quando a turma atual é outra; ao desfazer, o nome original é restaurado. A prévia lista cada mudança. O aplicativo só troca o nome original exato ou `DESISTENTE` numa linha vinculada, sem fórmula. Se houver uma linha `DESISTENTE` sem código de aluno, alunos sem linha identificada não são acrescentados até a conferência manual. O nome original permanece no aplicativo, e as células de frequência anteriores e as últimas linhas da aba permanecem intactas.

Depois de revisar, o envio recalcula tudo e exige o mesmo hash de plano. Se alguém salvou uma chamada ou editou a planilha no meio do caminho, o aplicativo recusa e pede nova prévia. Na gravação, cada célula é conferida outra vez: o que estiver ocupado ou com fórmula é pulado e relatado.

## Enviar ao salvar a chamada

Em Gestão, Configurações, Planilha de frequência, o interruptor "Enviar ao salvar a chamada" liga o envio automático. Ele começa desligado e só liga com a integração ativa e a estrutura salva. Ligado, cada chamada salva dispara, depois de a resposta do salvamento já ter saído, o envio daquele dia para a aba de cada turma original dos alunos da lista da chamada (na 3ª série remanejada, a chamada da turma atual vai para as abas de origem).

O envio automático é mais estreito que o manual, porque ninguém revisa a prévia:

- roda só no modo conservador e desiste se o modo completo estiver aberto;
- só preenche célula vazia, cria a coluna do dia, vincula aluno e, pela Sheets API, troca o nome por `DESISTENTE` após conferir o vínculo; plano com outra substituição, limpeza, remoção, linha de aluno novo, ambiguidade ou célula divergente ocupada ou com fórmula não é enviado e o dia fica pendente para o envio manual;
- faz uma tentativa por salvamento e nunca repete depois de timeout, 504 ou queda: se o último registro da turma for `PARCIAL`, os salvamentos seguintes não enviam até a aba ser conferida e um envio manual concluir;
- se as marcações já coincidem com a planilha, registra a confirmação da chamada sem repetir a escrita;
- falha ou desistência não altera o salvamento, que já foi confirmado.
- passa pela fila FIFO de envios (seção abaixo): o envio é enfileirado antes da resposta e processado na ordem de chegada.

## Fila FIFO dos envios automáticos

Todo envio automático (chamada salva, saída e entrada registradas) vira um item da tabela `fila_planilha` antes de a resposta sair, e só quando a integração está ativa, o envio automático ligado e o modo conservador em vigor. Itens iguais que aguardam a vez são fundidos, porque o envio lê o estado atual. O processamento começa logo depois da resposta e o item aberto de menor sequência é reservado por cinco minutos, de modo que só um consumidor trabalha por vez, mesmo com várias instâncias.

- Falha confirmada tenta de novo depois de 30 segundos, 2, 10 e 30 minutos, até cinco tentativas; esgotadas, o item fica como `FALHOU` e a fila segue.
- Enquanto o item da frente espera a nova tentativa, os de trás aguardam, para as linhas chegarem à planilha na ordem dos registros.
- Envio sem confirmação (`PARCIAL`), plano que pede conferência manual, turma sem aba vinculada e integração desligada encerram o item sem repetir; a conferência manual retoma a automação.
- Uma agenda de cinco minutos (`fila-planilha.yml`, com `CRON_SECRET`) recolhe o que sobrou. Em Gestão, Configurações, Planilhas, a seção Fila de envios automáticos mostra contagens e itens, e permite Processar agora, Descartar e Reenfileirar.
- A fila não guarda nome de aluno nem dados da planilha, e não cobre os envios manuais com prévia.

## Modo completo

Na prévia de uma turma, o modo completo seleciona "O período inteiro" por padrão para conferir também as linhas de alunos que saíram da turma, mesmo sem chamadas pendentes. Ao marcar uma remoção ou mudar as opções, a prévia é recalculada e o envio aguarda a nova leitura; uma falha nessa leitura impede a confirmação do plano anterior. No modo conservador, "Conferir linhas da turma" abre essa conferência, mas a seleção de remoções permanece bloqueada até liberar o modo completo. Uma solicitação de remoção com a janela expirada é recusada, sem apresentar a exclusão como concluída.

Depois de alterar a turma atual e a turma de origem em Gestão, Alunos, o envio passa a usar a nova origem. A linha antiga permanece até a remoção explícita: conferir o envio na aba de destino, liberar o modo completo, abrir Relatórios, Grade, selecionar a turma antiga e o mês, abrir "Enviar para a planilha", marcar "Remover" para a linha desejada e confirmar a prévia. Só linhas criadas pela integração são oferecidas; a exclusão inclui as frequências da linha. A alteração da origem reorganiza também o histórico no aplicativo, sem separar a transferência por data. Linhas manuais são conferidas diretamente no Google Planilhas.

O destrave é feito em Gestão, Configurações, Planilha de frequência, por um administrador, com a frase `EDITAR PLANILHA`, a senha e a duração entre 5, 15, 30 e 60 minutos, padrão 15. Enquanto a janela estiver aberta, admin e coordenação podem enviar:

- atualização de células divergentes, inclusive nome e turma atual do aluno encontrado pelo código da linha ou, antes do primeiro vínculo, pelo nome único;
- limpeza de células indicadas;
- remoção de linhas criadas pela integração para alunos que saíram da turma;
- remoção de colunas de dia e de abas criadas pela integração, com confirmação.

Fórmulas encontradas na última leitura são preservadas, inclusive no modo completo. Na conexão OAuth, vale a ressalva sobre edição simultânea. A remoção só acontece em linha, coluna ou aba com o marcador da integração. Cabeçalho com mesclagem sobre coluna de dia bloqueia a prévia e pede ajuste manual. Qualquer sessão pode voltar ao conservador, e a janela expira sozinha; perto do fim, o card oferece Estender, sempre com senha de novo.

Quando a falha no envio é de rede, o registro fica como parcial, porque parte do plano pode ter sido aplicada; recusa antes da escrita fica como falha. A tela mostra só a frase em português. O diagnóstico técnico do Google fica no registro de sincronização e no log do servidor; a interface mostra a orientação de conferência.

O card mostra o último erro só enquanto ele for vigente: vale o envio mais recente e, se ele deu certo, o erro anterior some. Na planilha de frequência o critério é por turma de origem, porque o envio do mês grava uma turma por vez: a falha de uma turma continua visível até ela mesma ser enviada com sucesso, e o sucesso de outra turma não a esconde. Na planilha de saídas há um só histórico. O selo "Último envio em" mostra a data em que o envio aconteceu, no fuso da escola, e o histórico lista o período enviado em DD/MM/AAAA.

## Cópias de segurança

A integração não cria cópias internas ao enviar, organizar, excluir ou restaurar. As cópias geradas por versões anteriores podem ser consultadas e restauradas enquanto existirem, sem criar outra cópia. A restauração invalida o esquema salvo e exige nova conferência; a aba mantém identificador, posição e referências de outras abas.

Em Gestão > Configurações > Planilha de frequência > Zona de risco, **Remover abas de backup** apresenta as cópias antigas do arquivo conectado. Confirmar com senha administrativa e a frase indicada apaga definitivamente somente abas com o nome de backup, carimbo e marcador de cópia da integração. Abas normais, turmas e nomes parecidos sem marcador são preservados. A planilha de saídas oferece a mesma limpeza. A lista e a conexão são conferidas novamente antes da exclusão; alterações exigem nova prévia. A limpeza não é repetida automaticamente e elimina a restauração dessas cópias. O app não apaga cópias ao abrir a tela ou consultar a estrutura.

Downloads de cópia completa do aplicativo em JSON ou ZIP continuam independentes dessa limpeza. Eles contêm o banco do aplicativo, não os formatos e fórmulas manuais do Google Planilhas. Para recuperar essas edições, exportar a planilha ou usar o histórico de versões do Google antes de alterações destrutivas. A mudança depende da publicação do app.

## Planilha de entradas e saídas

A segunda finalidade registra as saídas antecipadas em outra planilha, em aba única, uma linha por saída. A configuração fica em Gestão, Configurações, Planilha de entradas e saídas, que também prepara e organiza a aba Entradas. Pela Sheets API, selecione a planilha no Google Picker e confira a estrutura antes do envio.

Colunas reconhecidas no cabeçalho, por rótulo: Data, Aluno, Turma, Momento, Justificativa, Observação e Liberado por. Aluno e Data são obrigatórios. Colunas desconhecidas são preservadas e não recebem escrita. A coluna Justificativa recebe o rótulo do tipo ou o texto escrito; Liberado por recebe o rótulo do catálogo de quem libera.

O envio é manual, pela vista Saídas, no botão "Enviar para a planilha", com o mês escolhido e prévia obrigatória. No modo conservador só nasce linha para saída que ainda não existe e só célula vazia é preenchida; divergência em linha manual é listada e ignorada. No modo completo, com a mesma frase, senha e prazo, o aplicativo corrige células divergentes de linhas criadas pela integração e permite remover linhas marcadas que não têm mais saída no período enviado. Não são criadas abas de backup.

## Planilha de entradas atrasadas

Na planilha de saídas, a coluna de momento passa a levar o horário quando ele existe (por exemplo `08:15 · 2ª aula`), como nas entradas; registros sem horário mantêm só o momento. O formulário de entradas usa calendário brasileiro, Momento da entrada e Responsável pelo registro. As abas de saídas e de entradas têm as mesmas colunas e a mesma estrutura: `Data`, `Aluno`, `Turma`, `Momento`, `Justificativa`, `Observação` e `Responsável`. Novas linhas incluem o momento junto ao horário (por exemplo `08:15 · 2ª aula`) e o responsável escolhido. Em saídas antigas, o rótulo `Liberado por` continua reconhecido. Históricos sem esses campos mantêm horário e autoria anteriores. Linhas já enviadas nunca são reescritas.

Na área Saídas e entradas, o botão Entradas abre o registro de chegadas atrasadas. A consulta e o envio usam a data e a turma escolhidas na tela. O registro não muda as faltas da chamada.

As entradas usam exclusivamente a Sheets API e a mesma planilha selecionada para saídas na Gestão, sem outra autorização OAuth. A integração de saídas precisa estar ativa e conectada ao Google. A administração confirma "Preparar aba Entradas", no cartão da planilha de entradas e saídas, para criar a aba com as mesmas colunas da aba de saídas (Data, Aluno, Turma, Momento, Justificativa, Observação e Responsável). A mesma ação organiza abas Entradas já existentes com o padrão visual de Saídas: cabeçalho verde, texto branco, cores alternadas, larguras de coluna, quebra de texto e primeira linha congelada. Aba existente nunca é recriada nem limpa. Uma aba no formato anterior (`Data`, `Aluno`, `Turma`, `Horário`, `Motivo`, `Registrado por` e `Código`) é realinhada ao preparar, em uma única atualização: os rótulos passam ao cabeçalho comum, o responsável vai para a coluna Responsável, Observação fica vazia, o Código é descartado e as linhas já enviadas são mantidas; fórmulas nessas colunas bloqueiam o realinhamento. Cabeçalho incompatível, com fórmula ou mesclagens bloqueia a preparação e o envio. A aba Entradas fica reservada às chegadas e não pode ser mapeada para saídas.

Depois de preparar Entradas, a aba padrão Sheet1 é removida apenas se não contiver valores, fórmulas, notas ou gráficos, nem mesclagens ou marcadores da integração, e as abas de saídas configurada e Entradas estiverem presentes e visíveis no mesmo arquivo. Outras abas não são removidas. Se Sheet1 precisar de conferência ou for a própria aba de saídas, ela permanece e o aviso informa sua preservação. A ação é registrada na auditoria e não envia registros de aluno.

"Prévia das entradas" lê toda a aba e informa as linhas novas. "Enviar entradas" relê a estrutura, os dados e os registros, exigindo o mesmo hash. A linha de cada entrada é reconhecida pela data e pelo nome do aluno, o que evita duplicação entre reenvios, correções e restaurações; homônimos no mesmo dia usam uma linha cada. Conteúdo existente na linha reconhecida, mesmo se divergente, permanece intacto e gera aviso. Fórmulas e conteúdo das últimas linhas, inclusive em colunas adicionais, são preservados; novas linhas entram depois de todo o conteúdo.

A remoção no aplicativo não remove a linha já enviada. A correção de conteúdo existente na planilha fica a cargo da escola; um reenvio sinaliza a divergência. Não há modo completo de entradas. A escrita conserva as proteções do adaptador da Sheets API, mas uma edição simultânea no Google ainda pode gerar conflito: a API não oferece gravação condicionada ao valor anterior. Resultado sem confirmação exige conferir a aba e fazer nova prévia; não há retentativa automática.

## Planilha de chamada parcial

Em Gestão, Configurações, Planilha de chamada parcial, selecionar um terceiro arquivo pelo Google Picker. O arquivo precisa ser distinto dos arquivos de frequência e saídas, mesmo quando a conta Google é a mesma. A integração começa desligada. Depois de conectar e ativar, a administração confirma Preparar aba: o aplicativo cria `Chamada Parcial` apenas quando ausente. Aba existente é validada, sem substituir conteúdo.

O cabeçalho padrão é `Data`, `Aluno`, `Turma`, `Frequência parcial`, `Registrado na Seduc`, `Confirmação Seduc`, `Observação`, `Código` e `Revisão`. Esse cabeçalho é preservado nas abas existentes. Data usa `dd/mm/aaaa`; Aluno e Turma usam os nomes da consulta da base ou os nomes históricos da personalização. Frequência parcial identifica Dia inteiro, Manhã, Tarde, aulas selecionadas ou a situação de falta na Chamada. Marcadores de linha identificam o que a integração criou. Não há publicação de script nem novas credenciais de ambiente.

Na Chamada Parcial, o envio é manual e exige prévia, com período de até 92 dias e turma opcional. A base vem das chamadas salvas, com P como Dia inteiro e F, FJ e S preservados; a personalização prevalece por aluno e dia antes do filtro de turma. Consultar ou enviar não cria cópias de presença no banco. Sem chamada salva nem personalização, não há linha a enviar.

Novas linhas usam `chamada:<alunoId>:<dia>` na coluna Código, inclusive para personalizações. Assim, passar da base para um ajuste não acrescenta outro aluno no mesmo dia. UUIDs de personalizações enviados anteriormente são reconhecidos e preservados na atualização. Se a aba contiver ambos os códigos para o mesmo registro, o envio é bloqueado. Uma linha antiga de personalização removida sem correspondência segura também exige conferência quando tem o mesmo nome e dia. Um UUID antigo sem origem impede novos acréscimos na mesma turma e data, inclusive após renomear o aluno; atualizações reconhecidas e outras turmas e datas permanecem disponíveis. A coluna Revisão identifica tanto a revisão da chamada como a confirmação individual na base; personalizações mantêm sua própria revisão.

O padrão acrescenta registros novos e reconhece códigos existentes, sem duplicar. A opção explícita de atualizar existentes permite refletir correções e a confirmação manual da Seduc em linhas já enviadas. Essa opção só altera campos do registro nas linhas com marcador da integração e código único, sem fórmulas. Código repetido, fórmula, divergência sem autorização ou linha existente sem marcador bloqueiam a escrita. Linhas manuais com mesmo nome e dia, sem código, ficam preservadas e exigem conferência.

A confirmação relê dados locais e conteúdo externo e compara o hash da prévia. A última leitura confere valores anteriores, código, marcador e fórmulas antes do lote. Como a Sheets API não oferece escrita condicionada, uma edição externa depois dessa leitura ainda pode competir com o envio. Falha depois de enviar o lote exige conferência, sem repetição automática. Remover no aplicativo não remove linhas externas. Nenhuma operação cria abas de backup.

Os envios parciais têm trava compartilhada entre instâncias do aplicativo, obtida no PostgreSQL antes de remontar o plano, reler a aba e gravar. Outro envio em andamento responde 409 para aguardar. Perda da conexão que mantém a trava cancela a requisição ao Google e responde 502 com pedido de conferência: um lote já enviado pode ter sido aceito. A tentativa com efeito externo não é repetida automaticamente. A trava não permite reverter Google junto com o banco e não bloqueia edições feitas diretamente na planilha. A frequência possui sua própria trava; Saídas e Entradas compartilham outra, inclusive nos envios automáticos, na preparação de Entradas, na organização e na restauração ou remoção da aba de saídas.

"Registrado na Seduc" é uma chave manual por registro no aplicativo: confirma o lançamento externo já feito pela equipe. Enviar para o Google não marca essa chave e marcar a chave não envia à Seduc. Depois de uma correção, a chave volta a desligada e a equipe confere o lançamento novamente. Para refletir a mudança em linha Google anterior, usar a atualização explícita com nova prévia. A chamada normal e seus envios de frequência permanecem independentes. Remover uma personalização volta à base disponível com RS pendente; a linha externa não é apagada e refletir a base exige nova prévia com atualização explícita.

## Solução de problemas

| Mensagem                                | Causa provável                                                                   |
| --------------------------------------- | -------------------------------------------------------------------------------- |
| A estrutura da planilha mudou           | Cabeçalho, nome de aba ou mesclagem alterados; confira de novo.                  |
| A mesclagem cobre colunas de dia        | Ajuste o cabeçalho na planilha antes de enviar.                                  |
| Conta Google precisa ser reconectada    | Autorização revogada ou expirada; usar Entrar com Google na Gestão.              |
| Aba não encontrada                      | A aba mapeada foi renomeada ou removida.                                         |
| A linha não foi criada pela integração  | A remoção é recusada de propósito para dado manual ou marcador de versão antiga. |
| A aba de saídas precisa de Aluno e Data | Ajuste o cabeçalho da aba de registro antes de salvar a estrutura.               |
| Nada a enviar no período                | As saídas do mês já estão na planilha; a prévia mostra zero linhas novas.        |
| Não foi possível falar com a planilha   | Rede de saída bloqueada ou autorização Google indisponível.                      |
| Não foi possível concluir a operação    | Recusa da Sheets API; conferir o resultado antes de tentar novamente.            |

## Privacidade

A integração é opcional e, quando ligada, envia a frequência para a conta Google da própria escola, controladora dos dados. Não há serviço contratado pelo aplicativo, telemetria ou compartilhamento com terceiros. Desligar a integração apaga a autorização OAuth e o esquema do banco; a planilha permanece como estiver.

## Enviar ao registrar saídas e entradas

Em Gestão, Configurações, Planilha de entradas e saídas, o interruptor "Enviar ao registrar" liga o envio automático das saídas e das entradas. Depois de cada registro, a resposta sai primeiro e o envio roda em seguida, para o dia registrado, sem atrasar nem derrubar o registro. A chave pertence à conexão de saídas, então vale também para a aba Entradas da mesma planilha.

Como ninguém revisa a prévia, o envio automático é mais estreito que o manual:

- só acrescenta: cria a linha da saída (ou da entrada) e preenche células vazias; substituição, remoção, plano bloqueado ou modo completo ficam para o envio manual;
- em Saídas e Entradas, um envio sem confirmação (`PARCIAL`) pausa a automação daquele arquivo e aba até a conferência manual do período;
- nas entradas, a aba Entradas precisa estar preparada; sem ela, o registro fica para o envio manual;
- os envios automáticos seguem na fila FIFO (seção abaixo); a trava distribuída permanece durante a releitura, a escrita e a confirmação, impedindo envios simultâneos de instâncias diferentes. Se estiver ocupada, o registro permanece salvo no app e o envio fica para conferência manual. O plano continua preservando linhas existentes.

Cada tentativa fica registrada como `PARCIAL` antes da escrita externa. Sem esse registro no banco, o Google não é chamado. Somente uma resposta completa, com as contagens esperadas e a proteção ainda vigente, permite confirmar `SUCESSO`. Interrupção do processo ou falha na confirmação preserva a pendência; não há repetição automática de escritas. A prévia de Saídas também inclui o arquivo escolhido, impedindo reutilizar um plano depois da troca de planilha.

Para retomar após um envio sem confirmação, conferir a aba no Google, gerar uma nova prévia manual do período afetado e confirmar o envio. Um envio sem novidades também registra a conferência. Na tela de Entradas, a prévia sem linhas novas oferece **Confirmar conferência**; planos bloqueados continuam indisponíveis. O sucesso precisa ser posterior, abranger todo o período pendente e não conter células puladas; sucesso em outra aba, arquivo ou período não libera a pendência. O histórico original permanece intacto. Registros antigos sem identificação de destino são tratados conservadoramente como pendências de saídas e exigem conferência do período. Planos de saídas com nomes ambíguos precisam ser corrigidos antes do envio.

Falha do envio nunca desfaz o registro. A consulta de saídas por período também foi corrigida: `de` e `até` agora valem juntos, e o envio de um dia não leva saídas de outros dias.
