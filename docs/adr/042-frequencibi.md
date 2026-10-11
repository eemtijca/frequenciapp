# ADR-042: FrequenciBI interno com leitura por chave

Decisão de acesso e análise dos dados escolares, independente da autenticação do aplicativo.

## Status

Aceita.

## Contexto

A escola precisa explorar seus próprios dados, sem depender das fontes agregadas e dos serviços externos da ADR-040. A leitura inclui nomes, observações e motivos e fica restrita a pessoas autorizadas pela Gestão.

## Decisão

A área `/bi` usa apenas GET `/api/bi`, com segredo opaco de 256 bits em `Authorization: Bearer`. O cookie do aplicativo nunca autoriza essa leitura. A administração gerencia chaves em Gestão, Configurações, Acesso e avisos, FrequenciBI, com senha em todas as mutações e auditoria obrigatória na mesma transação. O servidor guarda somente SHA-256 do segredo, que aparece uma vez na criação ou rotação. Chaves e seus hashes não integram a cópia de segurança escolar.

Escopos combinam séries, turmas, datas e bases. O pedido intersecta o escopo e nunca o amplia. Listas vazias no contrato recusam todos os elementos; campos ausentes não restringem. A interface omite campos sem seleção. A rotação revoga a chave anterior e cria a substituta atomicamente. Revogação, expiração e segredo desconhecido recebem a mesma recusa. Consultas válidas atualizam primeiro uso, último uso e contagem. Inatividade significa 90 dias sem uso.

A leitura é paginada, com até 200 registros, projeções escolares e autoria somente por nome. Contas, sessões, auditoria, fila, integrações e parâmetros de acesso não são fontes. O retrato de cada página e a contabilização do uso ficam em uma transação serializável. Datas escolares são civis; saídas usam a turma atual do aluno, entradas e parciais sua turma histórica, e chamadas mantêm sua lista histórica. Totais da chamada reutilizam o cálculo dos indicadores existentes.

Limites compartilhados no PostgreSQL: 600 pedidos por origem por minuto, 240 consultas por chave por minuto e 30 tentativas inválidas por origem em 15 minutos. O segredo não aparece em URL, erro, log, auditoria ou arquivo de configuração exportado. Respostas escolares têm `Cache-Control: no-store`; o service worker mantém a API fora do cache HTTP.

A interface do BI carrega separadamente do aplicativo. Personalização e chave permanecem no navegador; dados escolares baixados usam IndexedDB, com data da consulta e limpeza explícita. A revogação encerra novas leituras e não apaga cópias locais ou exportações já realizadas. Offline não comprova validade atual da chave: a interface identifica o retrato salvo e orienta uso restrito ao dispositivo autorizado. Ao receber recusa ou mudança de escopo online, apaga o cache escolar anterior e mantém apenas a personalização sem dados.

## Alternativas

Continuar apenas com os painéis externos limita a análise e depende de outras contas. Reutilizar a sessão do aplicativo impediria leitura independente e misturaria capacidades administrativas com o BI. Expor uma exportação pública não permite revogação nem escopos individuais.

## Consequências

A entrega tem dois PRs sequenciais: leitura e Gestão de chaves, depois experiência do BI. O painel externo continua independente. A escola controla distribuição, revisão e revogação das chaves e a guarda dos dispositivos e arquivos exportados. Nenhuma chave autoriza mutações escolares.

## Experiência e execução local

A segunda parte entrega abas curadas, explorador e painéis em `/bi`, isolados do bundle do aplicativo principal. Recharts é carregado sob demanda; um worker agrupa bases com passagem única. Medidas ponderadas reutilizam os totais consolidados pelo contrato e recusam combinações sem significado na base escolhida. Aulas enumeradas são expandidas somente em dimensões de aula. Alunos homônimos são separados pelo identificador.

Personalização estrita usa formato v2 com migração da v1; arquivos exportados excluem chave e bases. IndexedDB guarda somente downloads completos, separados por chave, escopo, base e período. Offline mostra retrato e data, sem afirmar validade da chave. Apenas o HTML anônimo de `/bi` entra no service worker; APIs e páginas autenticadas continuam fora desse cache. Recusa ou mudança de escopo online encerra o acesso e remove os retratos antigos. A alternativa sem worker mantém os cálculos no cliente; armazenamento bloqueado mantém a aba utilizável com aviso explícito.

Cobertura histórica é uma estimativa baseada nas turmas atuais, feriados e chamadas existentes. Não se infere matrícula antiga nem quantidade de aulas de turnos sem enumeração. O dicionário informa essas limitações e a turma atual das saídas. O guia operacional fica em [FrequenciBI](../frequencibi.md).
