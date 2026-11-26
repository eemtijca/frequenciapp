# ADR-084: Retrato consistente e relatório em PDF da Grade

- Status: aceita
- Data: 2026-11-26

## Contexto

A coordenação pediu que Relatórios, Grade especificasse melhor as faltas e gerasse relatórios em PDF. A Grade já calculava, por aluno e período, dias com F, FJ e S, mas exibia apenas as marcas e o total histórico. A célula S não informava a proporção de aulas faltadas e a linha do aluno não abria o detalhamento.

O PDF poderia ser montado no navegador a partir das frequências do mês e do resumo histórico já carregados. Essas leituras, porém, acontecem em momentos diferentes. Uma gravação de chamada, transferência, renomeação ou edição de justificativa entre a abertura da tela e o clique poderia produzir um retrato costurado.

## Decisão

- A Grade passa a mostrar as colunas No período, com F, FJ e S, e a coluna Histórico com F + FJ de todo o histórico.
- A célula S mostra a proporção de aulas faltadas, como 2/5, e a linha do aluno abre o detalhamento com datas, aulas e justificativas.
- O PDF é montado no navegador com `jspdf` e `jspdf-autotable`, carregados sob demanda, a partir de um modelo imutável devolvido pelo servidor.
- A rota `GET /api/relatorios/grade/retrato` lê turma, horários, alunos, frequências, faltas, aulas, justificativas e o resumo histórico em uma única transação `RepeatableRead`, com `SELECT now()` e todas as consultas no mesmo `tx`. O leitor não bloqueia o gravador e o gravador não bloqueia o leitor.
- O retrato tem instante, fuso e hash SHA-256 do modelo. O PDF mostra o instante e um código curto; a auditoria do download registra o hash completo.
- O download reutiliza o diálogo protegido, com ZIP AES-256 por padrão e arquivo original por escolha explícita. O nome interno é `relatorio.pdf` e o externo é `frequenciapp-relatorio.zip`.
- O relatório leva o resumo e o detalhamento das faltas da turma de origem. Não é um espelho da Grade e não inclui gráficos.
- O CSV, a integração com o Google Planilhas, o schema Prisma e as variáveis de ambiente ficam inalterados.

## Alternativas

- PDF a partir dos dados já carregados no cliente: rejeitado pelo risco de retrato costurado e desatualizado.
- PDF no servidor: rejeitado pelo custo de CPU e memória, pela necessidade de uma rota binária e pelo trânsito adicional de dados pessoais.
- `pdfmake`: rejeitado pelo tamanho do runtime e das fontes, apesar do bom suporte a tabelas e Unicode.
- `pdf-lib`: rejeitado por não ter motor de tabelas e pela cadência de releases do pacote principal.
- `@react-pdf/renderer`: rejeitado pelo tamanho, pelas fontes e pela necessidade de tabela manual.
- Impressão do navegador: rejeitada por não gerar o arquivo diretamente e não integrar o ZIP protegido.
- Travas de banco para a leitura: rejeitadas por bloquearem escritores sem necessidade.

## Consequências

- Há uma rota nova de leitura e duas dependências MIT carregadas sob demanda.
- O PDF não é marcado para acessibilidade; a Grade continua sendo a via acessível.
- Períodos longos geram muitas páginas; o CSV continua sendo o formato para grandes volumes.
- O PDF depende de rede para obter o retrato. O service worker não cacheia a rota.
- Não há nome da escola no cadastro; o cabeçalho usa FrequenciApp, a turma e o período.
- O hash é um recibo do retrato, não uma assinatura digital. A verificação posterior exigiria guardar o modelo ou assinar o arquivo.
- A linha expandida da tela usa o modelo colapsado de `FaltaAluno`; códigos múltiplos de justificativa no mesmo dia aparecem no PDF pelo mapa do servidor e podem não aparecer na tela.

## Referências

- PostgreSQL, Transaction Isolation e SET TRANSACTION.
- Prisma, transações interativas com nível de isolamento.
- jsPDF, jsPDF-AutoTable e os avisos CVE-2026-31938 e CVE-2026-31898.
- ADR-015, exportação CSV da Grade.
- ADR-031, downloads protegidos.
