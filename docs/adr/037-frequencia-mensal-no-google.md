# ADR-037: Frequência mensal no Google Planilhas

Estado: aceita. Data: 2026-10-05.

## Contexto

Uma aba por turma acumula datas de vários meses e dificulta a consulta. A integração já possui envios conservadores, confirmação de prévia e registros incrementais, que precisam distinguir os novos destinos sem alterar o histórico existente.

## Decisão

A Gestão prepara uma aba por turma de origem e mês, com nome como `1º A · Outubro`, lista de alunos ativos e datas completas de segunda a sexta, sem a coluna Turma atual. A confirmação executa uma turma por requisição. O Google cria aba, cabeçalho, lista e metadados em um lote atômico; um identificador determinístico impede abas duplicadas em preparos concorrentes. Uma nova leitura pode reconhecer o resultado após perda de resposta, sem repetir a escrita.

Metadados identificam turma e mês mesmo após renomeação. O mapa admite vínculos legados e mensais, com unicidade por turma e período. Depois do primeiro preparo mensal de uma turma, seus envios exigem o mês correspondente. A preparação de cada mês é administrativa; o envio ao salvar continua conservador. Os envios dividem o período por destino, incluem sua identidade no hash e validam novamente a aba antes de gravar.

O campo opcional `destino` no histórico identifica arquivo, aba e uma geração aleatória gravada nos metadados durante a criação. Um sucesso na aba antiga não comprova preenchimento da nova aba, inclusive após exclusão e novo preparo do mesmo mês. O esquema é atualizado em transações que preservam vínculos preparados em outras requisições. O catálogo de meses conhecidos reutiliza os esquemas salvos; assinatura e conteúdo são relidos antes de cada envio.

## Consequências

As abas legadas permanecem disponíveis. Chamadas antigas do aplicativo podem ser enviadas aos meses preparados; não há cópia automática de conteúdo manual nem criação de backups internos. O envio segue o recorte de alunos da Grade e, nos destinos mensais, exclui sábados e domingos. Preparar um mês não preenche presenças nem faltas.

A migração de banco adiciona uma coluna nula aos registros existentes e precisa ser aplicada antes da nova versão. Não há nova credencial, permissão Google nem alteração nas planilhas de saídas e chamada parcial. Edições externas após a última leitura ainda podem competir com a escrita, pois o Google não oferece gravação condicionada ao conteúdo da célula.

## Ajuste de apresentação em 2026-10-06

O preparo passa a ajustar abas mensais já existentes no mesmo destino: renomeia o título numérico e exclui as colunas próprias reconhecidas de Turma atual, sábado e domingo. Os demais valores, fórmulas, linhas e vínculos são preservados. A validação exige a identidade mensal e o cabeçalho completo dos dias úteis; colunas desconhecidas não são excluídas. Repetir uma preparação concluída não escreve de novo. A recuperação após resposta perdida confere o resultado completo, pois a mera existência da aba não comprova sua atualização.

O ano continua nos metadados e nas datas. Uma colisão de título com o mesmo mês e turma em outro ano acrescenta o ano ao novo título; títulos ocupados por abas desconhecidas bloqueiam o preparo. Preparo mensal e envio da frequência compartilham exclusão por transação PostgreSQL em conexão dedicada, sem repetição de efeitos externos. A perda da trava cancela novas escritas e impede confirmação de sucesso. O mecanismo existente da chamada parcial é compartilhado com uma chave independente. Este ajuste não exige migração de banco.
