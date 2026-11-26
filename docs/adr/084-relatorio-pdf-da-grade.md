# ADR-084: relatório PDF da Grade com retrato da leitura

- Status: aceita
- Data: 2026-11-26

## Contexto

A Grade mostrava as marcas do período e um único total histórico. A coordenação precisava ver, no próprio período, quantas faltas, faltas justificadas e presenças parciais cada aluno teve, qual parte das aulas a presença parcial representa e em quais datas, aulas e justificativas isso aconteceu. Também pediu um PDF da turma de origem que não misture chamadas lidas em momentos diferentes.

## Decisão

- A Grade mantém as marcas P, F, FJ e S e acrescenta as colunas F, FJ e S do período. A coluna Histórico continua sendo o acumulado de F + FJ de todo o histórico, no mesmo critério já usado pelo resumo.
- A célula S mostra as aulas faltadas sobre as aulas previstas, como 2/5. A conta usa o retrato gravado na chamada. Sem retrato, usa a grade vigente, como a marca já fazia. A descrição acessível diz quantas aulas foram faltadas.
- A linha do aluno abre as faltas do período, com data, aula e justificativa. Aula sem horário conhecido não expõe identificador.
- `POST /api/relatorios/grade` lê alunos, chamadas, horários, justificativas e histórico numa transação Repeatable Read. O instante é o `now()` dessa transação. O hash SHA-256 identifica o texto canônico dessa leitura, e o PDF imprime resumo, detalhamento, instante, hash e um código curto derivado do hash.
- A auditoria registra `relatorio-grade.preparar` com o hash. Não grava nome de aluno, conteúdo nem senha. O arquivo passa pelo diálogo de download já existente: ZIP AES-256 por padrão e arquivo original como escolha explícita. Os nomes continuam genéricos.
- O CSV, o envio ao Google Planilhas e o schema do banco não mudam.

## Consequências

O PDF e a tela usam a mesma classificação de marca. Duas gerações do mesmo período podem ter hashes diferentes porque o instante entra no retrato. A transação é só de leitura, além da linha de auditoria. Não há biblioteca nova de PDF: o arquivo é texto em Helvetica com codificação WinAnsi.
