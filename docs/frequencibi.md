# FrequenciBI

Análises internas em `/bi`, sem conta de leitor e com chave própria da Gestão. A integração externa com Zoho ou Looker continua disponível separadamente.

## Acesso

A administração cria a chave em Gestão, Configurações, Acesso e avisos, FrequenciBI. Cada pessoa recebe uma chave nomeada, com escopo e validade quando necessários. O segredo aparece uma vez. O botão Testar e entrar abre a área com a chave guardada neste navegador. O item da barra lateral de administração e coordenação abre outra aba, preservando registros ainda em edição no aplicativo; o diretor continua com a própria tela de estatísticas.

A sessão do FrequenciApp não concede acesso ao BI. O navegador envia a chave somente no cabeçalho de GET `/api/bi`, com `credentials: omit`. A chave nunca entra em endereço, arquivo de configurações ou exportação escolar. O servidor mantém apenas seu hash.

O cabeçalho usa três colunas no desktop, com a marca centralizada e a volta ao aplicativo à esquerda. No celular, a seção é escolhida em um seletor e as ações secundárias ficam em Mais ações, para o título e os controles não competirem com o conteúdo. As seções e os controles usam a mesma linguagem visual do aplicativo, com alvos de toque de pelo menos 44 pixels.

## Análises

- Visão geral: alunos ativos, turmas, infrequência ponderada, ausências, movimentos, dias com chamada e confirmação Seduc; evolução e comparações por série e turma.
- Faltas: justificativa, aula, disciplina, mês, dia da semana, mapa de calor por turma e tabela por aluno.
- Movimentações: evolução, faixa horária, momento e dia da semana de entradas e saídas.
- Chamada Parcial: tipo, turno, aulas enumeradas e confirmação Seduc.
- Explorador: bases, dimensões, medidas compatíveis, dez visualizações, tabela de agregados ou registros, busca, ordenação, metas e notas. A última análise válida é recuperada ao reabrir; visões existentes podem ser atualizadas ou salvas como novas.
- Meus painéis: vários gráficos com filtros compartilhados; criação, renomeação, duplicação, exclusão, puxadores de arraste e tamanho. Setas do teclado e botões de ordem oferecem alternativas ao toque. Cada painel preserva seu recorte quando recebe outro gráfico, e o Explorador permite escolher o painel de destino.
- Ajuda: instruções, fórmulas, limitações históricas e consulta dos cadastros e catálogos permitidos.

Os painéis predefinidos oferecem Personalizar este painel, que cria uma cópia editável em Meus painéis. A ação Personalizar de cada gráfico abre sua configuração no Explorador. Aparência e tamanho reúne cinco paletas, rótulos de valores, legendas nos tipos compatíveis e controles de largura e altura. No celular, os cartões ocupam toda a largura; no desktop, a largura configurada determina sua ocupação na grade.

O período inicial é o mês atual. Hoje, Esta semana, Este mês e Este ano aplicam imediatamente o período no fuso da escola, preservando os demais recortes. O ano e as datas usam popovers próprios, sem campos nativos; Aplicar período efetiva as datas e o ano escolhido, e os demais recortes atuam localmente. Comparações usam intervalo anterior com igual quantidade de dias ou o mesmo intervalo no ano anterior, com ajuste do dia bissexto. Taxas variam em pontos percentuais. Atualizar dados renova também o intervalo comparado. Links com filtros explícitos abrem a Visão geral no recorte recebido, preservando os filtros dos painéis salvos. As ações de tabela permitem filtrar série, turma ou aluno e aprofundar da série à turma e ao aluno.

Recortes por aluno, busca, situação ou marca de frequência calculam os totais da chamada a partir da Lista histórica, agrupada por chamada. A chave precisa permitir essa base. Dados ausentes ou filtros incompatíveis produzem aviso de indisponibilidade, em vez de um zero aparente. Alunos ativos e Turmas são cadastros atuais; Cobertura das turmas é estimada por turma e dia, restrita ao período permitido pela chave, sem filtros individuais.

Taxas usam soma dos numeradores dividida pela soma dos denominadores, sem média simples de percentuais. Ausências incluem F e FJ. Sem registrados, infrequência e presença ficam sem base de cálculo. Faltas por aula não equivalem a faltas por aluno e dia. A Lista permite taxas por aluno, derivadas das marcas consolidadas P, F, FJ e S, sem contar Sem marca no denominador. Aulas parciais sem enumeração não recebem uma quantidade estimada. Situação do aluno e cadastros são atuais, mesmo em consultas antigas; a turma da chamada é histórica, a das entradas é gravada e a das saídas é atual. O dicionário dentro do BI detalha essas diferenças.

Destaques são regras locais: maiores ausências, séries e turmas com maior taxa, aulas, justificativas, alunos, horários e dias de movimentos e pendências Seduc. Destaques de taxas, motivos e horários exigem pelo menos cinco registros. Contagens pequenas são descritivas, não avaliações automáticas de alunos ou da escola.

## Dispositivo e conexão

A chave, preferências, visões, painéis, metas e notas usam `localStorage`. Retratos completos usam IndexedDB, separados por hash da chave, escopo, base e período. A personalização tem formato versionado; a versão anterior é migrada automaticamente. Importação rejeita campos desconhecidos, datas inválidas, medidas incompatíveis e versões futuras, preservando o trabalho existente.

Os conjuntos são lidos sob demanda por páginas de até 200 linhas, deduplicadas por identificador. Totais de uma base nunca usam um download incompleto. Consultas extensas fazem pausas limitadas quando a API responde 429; falha posterior permite atualizar sem mostrar totais parciais. Atualizações escolares entre páginas podem mudar o retrato. Atualizar dados refaz a leitura; as datas visíveis identificam o retrato mais antigo entre as bases exibidas.

Gráficos entram apenas ao se aproximar da área visível e Recharts fica em um chunk exclusivo. Agrupamentos usam um worker por área de BI, transferindo a base uma vez por atualização. Sem worker, o cálculo usa o navegador diretamente. Gráficos limitam a exibição a 100 grupos; tabelas têm páginas de 50 e CSV inclui o conjunto filtrado completo. Mapas de calor têm limites próprios de eixos, explicitados na visualização. Suas células usam todos os registros dos eixos exibidos, com rolagem interna no celular, datas legíveis e ativação por teclado. Valores sem base permanecem como lacunas nas linhas e áreas. Dias da semana seguem de segunda a domingo. A paginação se ajusta ao novo recorte e cada linha agregada compatível permite filtrar o gráfico.

Após uma visita com conexão, o service worker pode guardar somente o HTML público de `/bi` e arquivos estáticos. Nenhum dado escolar, sessão ou segredo aparece nesse HTML. As respostas da API continuam fora do cache HTTP e do service worker; outras páginas autenticadas mantêm a proteção offline existente.

Offline só reabre recortes completos já baixados, com aviso e data. Se o módulo visual ainda não estiver no cache, a tabela continua disponível no cartão. Uma revogação recente não pode ser conferida sem rede. Ao reconectar ou conferir a chave novamente, uma recusa remove o segredo e seus retratos; mudança de escopo remove o retrato antigo. Se o navegador indicar conexão e a conferência encontrar falha temporária de rede, são feitas até duas novas tentativas antes de usar o retrato guardado. Recusas de chave e limites de consulta não são repetidos; falhas de conferência ficam visíveis mesmo com uma análise aberta. Visões e notas permanecem. Limpar cache preserva chave e personalização; esquecer chave remove também os retratos ligados a ela; limpar tudo remove todo o namespace local do BI. Armazenamento bloqueado ou sem espaço permite continuar na aba, com aviso de que o trabalho pode não ser recuperado depois.

## Exportação e compartilhamento

CSV e PNG são preparados no próprio navegador, com nomes neutros e confirmação de uso de dados pessoais. CSV usa UTF-8, ponto e vírgula e neutraliza fórmulas em texto livre. PNG preserva a proporção do gráfico, inclui legenda quando habilitada e acrescenta o resumo dos grupos. Se a imagem exceder o limite legível, a exportação orienta o uso de CSV. Imprimir prepara também os gráficos fora da área visível, ajusta o mapa de calor à largura do papel e retira a rolagem das tabelas. A impressão informa a página e a quantidade de registros exibidos; CSV inclui todos os registros filtrados. Configurações exportadas nunca incluem a chave ou as bases, mas podem conter anotações pessoais e também exigem confirmação.

Links levam apenas período e identificadores de recorte, tipo, turno e situação. Não incluem busca livre, notas, chave ou dados baixados. Quem recebe precisa da própria chave. Apresentação e impressão mantêm a análise no dispositivo; nenhuma ação publica ou compartilha o painel em serviço externo.

Em dispositivo perdido ou no desligamento, a Gestão deve revogar ou rotacionar a chave e seguir os procedimentos da escola para arquivos e retratos já baixados. Revogar acesso não apaga uma exportação fora do aplicativo.
