# ADR-090: rota da prova a partir de uma origem livre

## Estado

Aceita.

## Contexto

A equipe leva os alunos de ônibus e deixa grupos em locais diferentes da mesma prova ([ADR-085](085-provas-especificas.md), [ADR-089](089-local-por-aluno-na-prova.md)). A cidade de onde o ônibus sai pode ser outra que a cidade dos locais de prova. Um centro genérico da cidade de destino escolheria a primeira parada errada, porque a chegada depende da rodovia usada desde a partida real.

A Secretaria continua só de consulta ([ADR-087](087-perfil-secretaria-e-capacidade-consultar.md)). O diretor de turma já acompanha as próprias turmas e precisa da rota das provas em que há aluno dessas turmas.

## Decisão

- A origem é um campo livre da prova: texto de até 200 caracteres e um ponto, os dois juntos ou nenhum. Nada no código escolhe município, escola ou centro de cidade. O exemplo "Mucambo, CE" aparece só como placeholder do campo. A equipe digita o endereço ou a cidade, busca quando `NOMINATIM_URL` está definida, ajusta no mapa ou marca a posição do aparelho. Sem texto, a posição do aparelho recebe o rótulo "Posição marcada no aparelho".
- A matriz de custo começa nesse ponto. O primeiro trecho, de viagem, é a aresta da origem até cada parada; a primeira parada é a melhor segundo essa aresta, não um ponto inventado no meio da cidade. O critério padrão é o menor tempo. A equipe pode pedir a menor distância e pode incluir a volta à origem. Até 12 paradas a ordem é exata (Held-Karp em caminho aberto). Acima disso a ordem é aproximada e a tela diz isso. A reordenação manual continua e volta a pedir o traçado.
- Com `OSRM_URL`, a matriz vem de `/table` e o traçado de `/route`. Sem a variável, ou se a consulta falhar, a ordem e os tempos usam linha reta a 50 km/h e a tela avisa. As duas URLs são opcionais, sem destino público embutido. O navegador fala só com o aplicativo; o servidor consulta o serviço. O mapa continua com os tiles já previstos na [ADR-086](086-mapa-openstreetmap-para-locais-de-prova.md).
- A origem confirmada, o critério, a volta e a ordem ficam na prova, em colunas anuláveis. "Deixados" e a posição contínua do acompanhamento ficam só no aparelho. A distância até a próxima parada, nesse acompanhamento, é linha reta calculada no navegador. A auditoria `prova-especifica.rota` guarda o identificador da prova e a quantidade de paradas, sem coordenada, sem nome e sem o texto da origem.
- A Secretaria lê a lista, o detalhe, o plano e pode calcular e buscar endereço. Não grava a ordem, a frequência nem o ponto do aluno. O diretor com palavra-chave já trocada lê e grava a rota, a frequência e o ponto quando a prova tem aluno de turma vigente do vínculo; sem esse aluno a prova responde 404. A ocupação do mapa continua restrita a quem opera.

## Alternativas

- Origem fixa da escola ou da cidade da prova: erra a chegada quando a partida muda e esconde a escolha de quem monta a rota.
- Centro da cidade de destino como primeira aresta: ignora a rodovia de entrada e pode começar pelo lado oposto da cidade.
- Guardar a ordem só no aparelho: a equipe não compartilha o plano. A coluna anulável na prova compartilha sem obrigar quem não usa a rota.
- Serviço pago de rotas: fora do escopo. OSRM e Nominatim ficam opcionais e substituíveis por instância própria.

## Consequências

- A migração só adiciona colunas anuláveis. Prova antiga abre sem origem e sem ordem.
- Sem `OSRM_URL` e sem `NOMINATIM_URL` o aplicativo sobe. O mapa e o GPS continuam; a ordem avisa que é linha reta e a busca de endereço explica que não está configurada.
- A Secretaria passa a ver Provas na gaveta, em leitura. É a exceção à redução descrita na [ADR-087](087-perfil-secretaria-e-capacidade-consultar.md). O restante da gaveta dela não muda.
- O deploy não exige variável nova. Na VPS, a partida do contêiner aplica a migração. `OSRM_URL` e `NOMINATIM_URL` só entram se a escola quiser ruas e busca de endereço.
