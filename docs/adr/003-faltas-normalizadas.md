# ADR-003: Faltas normalizadas, presença implícita

## Estado

Aceita.

## Contexto

O aplicativo original armazenava a marca completa de cada aluno (P ou F) como mapa em uma coluna de texto, herdando campos de disciplina e aula de um modelo mais antigo. O fluxo real tem uma frequência por dia e turma, todos presentes por padrão.

## Decisão

- Tabela `faltas` com uma linha por ausência (frequência, aluno).
- Presença é o estado implícito de toda frequência salva: quem não tem falta naquele dia esteve presente.
- A marca de um dia deriva de três regras puras em `src/domain/frequencia.ts`: falta prevalece, presença exige frequência da turma atual, célula vazia quando não houve frequência.

## Consequências

- Minimização de dados: uma frequência com todos presentes não grava nenhuma linha de marca, e a operação comum (uma ou duas faltas) grava o mínimo.
- A complicação de confirmação de presenças antigas em branco desaparece: não existe estado intermediário.
- A grade por turma de origem, o histórico e a frequência usam a mesma derivação, testada de forma isolada.
- Aluno movido de turma conserva as faltas do período anterior, porque a regra da falta olha todas as frequências do dia.
