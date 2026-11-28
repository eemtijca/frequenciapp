# ADR-089: local por aluno na prova específica

## Estado

Aceita.

## Contexto

Uma prova específica tinha um único local, texto e ponto no mapa, valendo para todos os inscritos ([ADR-085](085-provas-especificas.md), [ADR-086](086-mapa-openstreetmap-para-locais-de-prova.md)). No vestibular, a mesma prova acontece em vários campi: a coordenação quer uma prova só e o local de cada aluno. As provas já cadastradas não podem perder dado, e quem não informa local continua no lugar geral.

## Decisão

- `participantes_prova` ganha `local`, `latitude` e `longitude`, todos nulos. Nulo nas três partes herda o local e o ponto da prova. Texto próprio sem ponto não herda as coordenadas, para o mapa não marcar o aluno em outro campus. O ponto próprio exige o nome do local. A restrição do banco repete a das provas: as duas coordenadas ou nenhuma, na faixa geográfica.
- `PUT /api/provas/{id}/locais` grava o local dos alunos já inscritos, um ou vários, na mesma transação. Quem não vem na lista não muda. A frequência não muda. Local nulo, sem coordenadas, apaga o próprio e volta à herança. Reenviar a lista de alunos mantém o local de quem continua; quem sai e volta entra de novo sem local próprio.
- A leitura devolve o que está gravado, não o valor herdado. A tela resolve a herança. No detalhe, cada aluno mostra o local efetivo, é possível editar um e aplicar o mesmo local aos selecionados. Com mais de um local, a tela filtra a lista e conta presentes, ausentes e sem registro por local.
- Colar uma lista é conferência no navegador, sem rota nova: uma linha por aluno, nome e local separados por tabulação, ponto e vírgula ou barra vertical. O nome casa com um único inscrito, sem acento e sem caixa. Linha sem par, nome repetido na prova, local divergente ou acima de 120 caracteres não é gravada. O ponto no mapa não entra na cola.
- A ocupação do mapa usa o ponto efetivo. Coordenadas próprias vencem. Texto próprio sem ponto fica de fora. Quem herda usa o ponto da prova, ou o ponto consultado quando a prova está em edição e o ponto novo ainda não foi salvo. A rota continua sem dado de aluno.
- A auditoria registra `prova-especifica.locais` com o identificador da prova e a quantidade, sem nome de aluno e sem texto do local. A escrita exige a capacidade de operação e origem confiável. A Secretaria, só de consulta, recebe 403.

## Alternativas

- Catálogo de locais com identificador: agrupa com exatidão e reaproveita o ponto, mas pede cadastro à parte para nomes que mudam a cada vestibular. O texto livre, igual ao local da prova, cobre o uso.
- Copiar o local da prova para cada aluno na migração: uma correção depois no local geral não alcançaria quem herda, e a migração reescreveria linhas. Nulo significa herança e não mexe no que já existe.
- Rota só de importação: a cola não cria aluno nem mexe na frequência; gravar pelo mesmo `PUT` evita um segundo caminho de escrita.

## Consequências

- A migração só adiciona colunas anuláveis e uma restrição que as linhas atuais, todas nulas, já cumprem. Não há cópia nem apagamento.
- Mudar o local da prova alcança na hora quem não tem local próprio e não mexe em quem tem.
- O selo do mapa deixa de contar, no ponto da prova, o aluno que foi para outro lugar. Prova antiga, sem local por aluno, continua contando como antes.
- A cola não traz o ponto. Quem precisa do mapa marca depois, num aluno ou num grupo selecionado.
- O deploy aplica a migração e não pede variável nova. Na VPS, a partida do contêiner migra; não há passo manual além desse.
