# Painel externo no Zoho Analytics ou Looker Studio

Indicadores agregados do FrequenciApp em um painel privado da gestão, alimentado pela planilha Google de indicadores.

## Ativação

1. Após o merge e a implantação, aplique a migração `painel_indicadores` pelo fluxo normal de migrações. O build da Vercel não migra o banco.
2. Em Gestão, Configurações, Planilhas, conecte a conta Google da frequência. A planilha operacional continua com sua configuração original.
3. Abra **Painel externo** e clique em **Preparar indicadores**. O aplicativo cria um arquivo separado chamado `FrequenciApp - Indicadores`, com quatro abas. A integração não altera permissões de compartilhamento. Um arquivo já preparado pode ser reutilizado no Zoho ou no Looker.

O aplicativo prepara as fontes; a criação dos gráficos e o compartilhamento do painel são concluídos pela gestão no serviço escolhido. Nenhum painel público ou iframe é criado pelo app.

## Conexão do Looker Studio

1. Em [Looker Studio](https://lookerstudio.google.com/), crie um relatório e escolha o conector **Google Planilhas**, na mesma conta Google que preparou o arquivo. Selecione a planilha de indicadores e a aba `Frequencia`. Use a primeira linha como cabeçalho.
2. Adicione outras três fontes Google Planilhas no relatório, uma para cada aba: `Movimentacoes`, `Parciais` e `Aulas_parciais`. Cada fonte usa uma única aba.
3. Confira os tipos dos campos: `Data` como data; `Ano`, contagens e `Aula` como números; demais campos como texto. As contagens usam agregação **Soma**.
4. Monte os gráficos e filtros descritos abaixo. Compartilhe o relatório somente com contas autorizadas, sem acesso público por link. Confira também as permissões das fontes e da planilha: credenciais do proprietário permitem ao leitor do relatório acessar os dados exibidos mesmo sem acesso direto ao arquivo.
5. Copie o endereço HTTPS do relatório e salve em **Endereço do painel** no app. O botão **Abrir painel** dá acesso ao painel externo.

## Conexão do Zoho Analytics

1. No workspace privado do Zoho, importe a planilha `FrequenciApp - Indicadores` pelo conector Google Planilhas ou Google Drive disponível na conta. Use a primeira linha como cabeçalho e importe as abas como tabelas separadas.
2. Confira os tipos, contagens e percentuais descritos neste guia. Para o primeiro teste, a tabela `Frequencia` basta. A junção das outras tabelas exige cuidado para não multiplicar os totais.
3. Configure a sincronização da fonte no próprio Zoho e confira a disponibilidade no plano contratado. A atualização automática do FrequenciApp envia dados ao Google Planilhas; o Zoho precisa importar as mudanças em seu próprio intervalo.
4. Abra a visualização do painel e copie o link direto no formato `https://analytics.zoho.com/workspace/<id>/view/<id>`. O endereço do workspace sozinho não identifica o painel. Salve o link em **Endereço do painel** e teste **Abrir painel** com a conta autorizada.
5. No aplicativo Zoho Analytics para Android, entre com a conta autorizada e confira o painel e os filtros. O aplicativo externo decide se o link abre no navegador ou no app e quais recursos exigem licença. Não habilite compartilhamento público.

O FrequenciApp aceita apenas links HTTPS do relatório Looker Studio ou de uma visualização em `analytics.zoho.com`, sem credenciais ou portas alternativas. Salvar o link troca somente o destino de **Abrir painel**; não recria o arquivo de indicadores nem altera o compartilhamento ou a configuração do serviço externo.

## Visualizações sugeridas

| Página            | Gráficos                                                                                              | Filtros                  |
| ----------------- | ----------------------------------------------------------------------------------------------------- | ------------------------ |
| Frequência        | Cartões de registrados, presentes e ausências; evolução diária; barras comparativas por turma e série | Data, série, turma       |
| Saídas e entradas | Cartões por tipo; evolução diária; barras por turma e faixa horária                                   | Data, série, turma, tipo |
| Chamada parcial   | Registros por tipo e turno; RS confirmados e pendentes; barras por aula                               | Data, série, turma, tipo |

Na fonte `Frequencia`, um campo calculado percentual pode usar `SUM(Ausencias) / SUM(Registrados)`. Trate divisor zero como valor vazio. Não use média de percentuais de turmas: os tamanhos diferentes exigem o denominador agregado. `Ausencias` soma faltas comuns e justificadas; `Parciais` corresponde à marca S, separada das faltas.

## Conteúdo e limites

| Aba            | Uma linha representa                                             | Medidas                                                           |
| -------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| Frequencia     | Uma chamada salva por data e turma                               | Registrados, Presentes, Faltas, Justificadas, Parciais, Ausencias |
| Movimentacoes  | Totais por data, turma, tipo e hora aproximada                   | Quantidade                                                        |
| Parciais       | Totais de registros personalizados por data, turma, tipo e turno | Registros, RS_confirmados, RS_pendentes                           |
| Aulas_parciais | Totais por data, turma e aula selecionada explicitamente         | Registros                                                         |

Todas as fontes incluem Data, Ano, Mes, Serie e Turma. `Mes` tem formato `YYYY-MM`. Data é uma data nativa do Google Planilhas, com apresentação `dd/mm/yyyy`.

- Não são exportados nomes, identificadores de alunos, responsáveis, autores, observações ou motivos de justificativas. Dados de saúde e textos livres ficam fora das fontes externas.
- A frequência usa a lista histórica de alunos das chamadas salvas. Transferências posteriores não movem chamadas antigas. Desistência exclui a contagem a partir da data registrada. Dias sem chamada salva não geram presença ou taxa.
- Aulas e justificativas seguem as regras de marca do app; alterações na grade de aulas podem afetar o cálculo de históricos, como nos relatórios internos.
- Entradas e parciais usam a turma vinculada ao registro. Saídas usam a turma atual do aluno, pois o cadastro de saídas não guarda uma turma histórica. Transferências podem alterar esse agrupamento.
- Parciais inclui somente registros personalizados salvos. Presença usada implicitamente como base da Chamada Parcial não cria um registro nesta fonte.
- Aulas_parciais conta apenas registros do tipo AULAS, uma vez por aula selecionada. Não infere aulas para TURNO ou DIA_INTEIRO. Somar aulas conta marcações, não alunos distintos.
- Totais de grupos pequenos ainda podem permitir identificação indireta. Mantenha acesso restrito e avalie o público e a finalidade do relatório conforme as políticas da escola.
- O ano vazio acompanha o ano corrente no fuso do app. Um ano fixo permite consultar o histórico daquele ano. A troca de ano substitui o conteúdo das fontes; para manter painéis anuais independentes, é necessária outra estratégia de arquivo.

## Atualização e recuperação

**Atualizar indicadores** recompõe as quatro abas integralmente, incluindo correções, exclusões e mudanças de turma que se aplicam ao agrupamento. O envio não acrescenta linhas duplicadas. As quatro fontes são substituídas em um único lote atômico do Google. Abas adicionais no arquivo são preservadas; alterações manuais dentro das quatro abas gerenciadas são substituídas. Não renomeie nem remova essas abas ou seus marcadores.

A opção **Atualização automática** usa o workflow existente `fila-planilha.yml`, previsto a cada cinco minutos. Configure o mesmo segredo `CRON_SECRET` na Vercel e no GitHub e a variável `NOTIFICACOES_APP_URL` do repositório com o endereço HTTPS de produção. A etapa de indicadores roda mesmo se o processamento da fila operacional falhar. O GitHub pode atrasar a agenda; o Zoho e o Looker também têm seus próprios intervalos e cache. Este fluxo não garante dados em tempo real.

A agenda nunca cria arquivos. Sem destino preparado ou com atualização desativada, ela não envia indicadores. Envios automáticos com sucesso há menos de quatro minutos são ignorados. Falhas ficam visíveis na Gestão e são tentadas no próximo acionamento da agenda. O último sucesso só avança após a confirmação do Google.

Se a criação perder a resposta, o aplicativo bloqueia uma segunda criação: confira no Drive o arquivo `FrequenciApp - Indicadores`, copie seu endereço e use **Recuperar planilha**. A recuperação verifica um marcador exclusivo da instalação e as quatro abas antes de aceitar o destino. Arquivos operacionais ou de outras instalações são recusados. Se nenhum arquivo foi criado, a pendência exige investigação do suporte antes de liberar outra criação.

Uma resposta perdida durante a atualização pode ser repetida: a mesma substituição integral é idempotente. Revogação de autorização exige reconectar a conta Google da frequência. Trocar de conta exige que a conta conectada tenha acesso ao arquivo já preparado; o aplicativo não cria outro silenciosamente.

A configuração de integração externa e seus marcadores não entram na cópia JSON de cadastros e frequências. Uma instalação restaurada deve preparar suas próprias fontes. Remover dados no app exige uma atualização bem-sucedida da planilha e a importação das mudanças pelo serviço externo. Exportações dos serviços e cópias manuais precisam de controle de retenção separado.
