# Núcleo administrativo local

Este núcleo liga controles tipados, barreira de recursos e exec binário em streams Node locais. O módulo host possui journal durável, endpoint Unix privado e a primeira prova PostgreSQL nativa descrita abaixo. Não existe entrada CLI administrativa pública. Os testes usam Engine explicitamente falso e streams ou subprocessos locais reais, nunca PostgreSQL real.

## Contrato fechado

`criarBarreiraEngine` recebe receitas host imutáveis e imagens locais por ID de conteúdo. A receita local anterior continua recusando mounts e volumes herdados. O perfil PostgreSQL nativo separado cobre o VOLUME da imagem fixada com tmpfs fechado, sem volume anônimo ou bind. Ambos recusam portas, rede externa e capacidades adicionais. Opções desconhecidas são recusadas, inclusive na receita. A fachada host `atender` admite apenas os corpos e endpoints exatos de criação parada, inspeção, partida e parada de recursos próprios. Não existe passthrough, listagem global, busca por nome ou remoção recebida do runner.

A criação persiste a intenção, recebe o ID completo, persiste a criação confirmada e confere o estado parado antes de disponibilizar o handle. A partida reinspeciona o recurso. A persistência precisa resolver somente depois do commit durável; os testes verificam a ordem e a recusa quando ela falha, não fsync de um armazenamento real. Resposta perdida ou criação incerta reserva o slot e impede repetição ou descoberta por prefixo. Partida e parada com efeito possível ou commit posterior não confirmado também travam o recurso em estado incerto; o erro original e a identidade já persistida permanecem rastreáveis. Timeout limita a espera, não cancela a chamada remota nem autoriza retry.

A criação participa da mesma exclusão de lifecycle desde a intenção. Depois do commit, confere novamente a autorização antes do POST; fechar o gate enquanto esse commit está pendente impede qualquer criação nova quando a persistência resolve. O encerramento preserva o registro ocupado sem esperar indefinidamente pelo callback externo. Intenção não enviada mantém o slot reservado; efeito já enviado continua rastreável por ID quando conhecido e preservado como incerto. Nenhuma criação publica um handle de sucesso depois do fechamento.

A reserva de exec precede sua inspeção e exclui transições de lifecycle, sem serializar execs entre si. Partida e exec revalidam autorização após a inspeção; fechar o gate impede novos envios ainda pendentes dessa confirmação.

`executarSessao` aceita estes pedidos JSON com UTF-8 válido, discriminador textual literal e conjunto exato de campos:

- `consultarConfiguracao`: devolve somente handles, slots e estados próprios.
- `consultarServico`: recebe um handle opaco, nunca um ID Docker.
- `executar`: recebe handle e uma das variantes `consultarIdentidade`, `dump` ou `restaurar`. O host seleciona argv fixo; não há shell, URL, diretório ou argv recebido do cliente.
- `coletar`: invoca o coletor host registrado, sem destino fornecido pelo cliente.

A sessão começa com `HELLO` de requestId zero e corpo `{"versao":1}`. `SESSION_END` também usa requestId zero e corpo vazio JSON. Todos os contadores começam em zero, com sequência independente por direção e requestId. Não há reutilização de requestId. EOF sem `SESSION_END`, frames fora da fase e controles não reconhecidos falham.

## Fluxo binário e limites

O codec, o leitor incremental e o escritor já existentes permanecem inalterados. `STDIN`, `STDOUT` e `STDERR` transportam bytes opacos, sem base64. `STDIN_END` tem payload vazio. Os demais corpos são controles JSON.

Limites do recorte:

- Quatro execs ativos e 4.096 pedidos por sessão.
- Frame de dados até 16 KiB e chunk do supervisor até 64 KiB.
- Janela de entrada de 64 KiB anunciada no `ACCEPTED`.
- Crédito independente de stdout e stderr, inicialmente zero. `WINDOW` contém `stream` e `bytes`, sem exceder 64 KiB de crédito acumulado por stream.
- Até 8 MiB somados de entrada e saídas por operação.
- Prazo local da sessão de até 60 segundos, configurado pelo host. Chamadas ao cliente de Engine e ao supervisor têm prazo próprio, de 5 segundos por padrão.

O receptor precisa repor créditos enquanto consome dados, inclusive para permitir a observação do EOF do produtor após esgotar uma janela. Sem crédito, o produtor de saída não recebe `next`. Cada produtor espera sua escrita antes de gerar mais dados. A escrita física é serial e não preemptível; consumidor que não recebe nenhum frame não pode receber confirmação de cancelamento. Prazo ou sinal host encerra esse canal com falha, em vez de declarar entrega.

## Cancelamento e encerramento

O supervisor host recebe o ID que a barreira registrou, argv fixo, entrada binária e AbortSignal. Seu resultado precisa confirmar término do grupo de processos, com código ou sinal coerente. Encerrar um CLI não é essa confirmação. `CANCEL` acorda as esperas por crédito, pede cancelamento ao supervisor e só envia `CANCELLED` depois de conciliar o recibo com o resultado. Falha, prazo ou recibo inconclusivo não autoriza retry e preserva o resíduo. Cada espera local de `next` ou `return` recebe até 100 ms para terminar após abort; se `return` só começar depois de um `next` abandonado, recebe seu próprio limite. Promessas tardias continuam observadas, não canceladas. O retorno da sessão registra essas esperas em `saidasPendentes`, por requestId, stream e etapa, mantendo erro e código de falha. Essa pendência local não confirma nem desmente o término do grupo: a remoção do recurso continua condicionada ao resultado e recibo conciliados pelo supervisor, independentemente de bytes não entregues.

A primeira falha de produtor aborta as operações locais e interrompe o canal antes de aguardar a finalização do iterador, para ativar os limites e o cancelamento supervisionado sem criar outra espera ilimitada. A sessão consolida o resultado limitado pelo gate e todos os produtores de saída iniciados antes da coleta final e do retorno, mesmo se o recibo de cancelamento falhar. A causa inicial não é substituída por falhas posteriores de finalização. `saidasPendentes` já está completo e permanece estável quando a promessa da sessão resolve; isso não significa entrega de bytes ou frames nem dispensa a confirmação do grupo.

A origem e o destino fornecidos à sessão são exclusivos dela. Em erro de transporte, prazo ou sinal, a sessão pode destruí-los para interromper leitura ou escrita pendente. Isso não altera o contrato de empréstimo do escritor isolado. A origem não é drenada para esconder fechamento antecipado. AbortSignal host permite representar HUP, INT e TERM sem instalar handlers globais nestes módulos. Timer e listener permanecem ativos até a entrega ou falha da escrita final de `SESSION_END`; limpeza remota concluída não equivale à entrega dessa confirmação local.

O encerramento coleta antes de remover, reinspeciona ownership, para o recurso e remove somente seu ID exato. A ausência precisa ser confirmada. Falha de coleta preserva os recursos; falha ou divergência de cleanup transforma sucesso em falha. Recursos incertos não são removidos por nome ou label.

## Limites de integração

Este núcleo não libera nenhuma entrada administrativa legada nem fornece cliente Compose. O host possui transporte HTTP sobre dial-stdio e recuperação somente leitura do journal. Recuperar não reautoriza efeitos após SIGKILL. O perfil nativo valida o raw relevante de Config, HostConfig, mounts, imagem, ID e rede antes de projetar o DTO local; não substitui valores perigosos por defaults. A compatibilidade com o daemon efetivo ainda depende da primeira prova real após revisão conjunta.

Volumes persistentes, app/proxy, revisões, snapshots, builds, rollback de imagem, createdb/dropdb e os seis cenários administrativos reais ainda não são operações desta interface. São recusados, não simulados como sucesso. Este recorte não valida PostgreSQL real, build, backup, restauração ou atualização. O supervisor sintético não comprova encerramento de processos no daemon.

Antes de qualquer prova real mínima, continua obrigatória uma revisão independente conjunta. Nenhum resultado unitário libera o daemon ou aprova L01. Os contratos locais anteriores permanecem cobertos pelos seus testes, sem alteração de protocolo, sessão ou guardas do executor API.

## Primeira prova PostgreSQL nativa, ainda sem aceite real

`iniciarDockerReal` sem configuração recusa. Um chamador host revisado pode fornecer somente a base privada de trabalho; o host gera rodada, nome, diretório exclusivo, configuração Docker vazia e credencial sintética. O pin é o mesmo de `tests/isolamento/executar.mjs`. O cliente consulta somente a imagem local por digest, sem pull. Ambiente host permite apenas PATH fixo e HOME privado; não herda contextos, autenticação ou DOCKER_HOST.

O cliente HTTP nativo mantém o path fixo `/v1.47` e não negocia outra versão. O cabeçalho `API-Version` anuncia o máximo do daemon, não a versão efetivamente pedida. Quando presente, exige uma única versão canônica `1.minor`, com minor inteiro seguro igual ou superior a 47; recusa máximo inferior, major diferente, valor vazio, sintaxe inválida ou cabeçalhos repetidos, mesmo iguais. A ausência do cabeçalho continua permitida pelo contrato anterior. Esse anúncio não comprova a versão mínima do daemon nem autoriza efeitos: completude HTTP, status, tipo, JSON estrito, IDs, limites e conclusão local continuam obrigatórios. Completude e versão têm erros fechados distintos, sem incluir valores de cabeçalhos ou corpos nos diagnósticos.

A imagem pinada é aprovada com `WorkingDir=/` e a variável de compilação `DOCKER_PG_LLVM_DEPS` no valor exato da captura preservada. A receita fixa o mesmo diretório, seleciona positivamente o ambiente de execução e solicita `DOCKER_PG_LLVM_DEPS=` com valor explicitamente vazio; omitir a chave não neutralizaria a herança. A inspeção exige o conjunto exato de pares de ambiente, com nomes únicos, tipos e sintaxe válidos, sem extras nem valores divergentes. A ordem de `Env` é irrelevante na inspeção; o pedido recebido pelo Gate continua integralmente canônico. O raw é validado antes da projeção, sem corrigir divergências com valores esperados. A fixture JSON contém uma projeção documental sintética, sem hash da captura privada e com data local substituída; não há identidade de bytes com a captura. Os dois produtores falsos modelam herança e override delimitados, não são inspeções reais. O override vazio foi observado somente no raw criado; o PostgreSQL real continua sem aceite.

`MaskedPaths` deve estar presente como array de doze strings únicas, com os membros exatos da política fechada; somente sua ordem é irrelevante. Ausência, duplicação, membros extras, tipos ou caminhos divergentes são recusados sem normalizar o raw. `ReadonlyPaths` e `MemorySwap` também são obrigatórios, com a sequência e o valor exatos já definidos. A fixture de contêiner criado preserva os defaults da captura e documenta substituições sintéticas por campo, sem a credencial original. Ambos os produtores falsos conferem o pedido contra esses dados e a fidelidade do raw antes do Gate; as transições de estado continuam sintéticas, sem comprovar partida, mounts efetivos ou SQL.

O logging nativo usa `local`, `max-size="1m"`, `max-file="1"` e `compress="false"` textual explícito. A compressão padrão é incompatível com um único arquivo no [contrato do driver local](https://raw.githubusercontent.com/moby/moby/464cd50c3d9e92877d56940ea160de6fca7bea23/daemon/logger/local/config.go); não é necessário ampliar a retenção. `max-size` é limiar de rotação, não garantia de teto físico exato de bytes. A captura histórica permanece imutável e sem `compress`; os dois fakes acrescentam somente esse literal em clone de HostConfig, com expectativa documental independente e prova de que a remoção da adição restitui o original. Criação e inspect não comprovam inicialização do driver ou partida do PostgreSQL.

A receita executa o entrypoint oficial como o usuário nomeado `postgres`, sem UID/GID presumido e sem capacidades adicionais. Um subdiretório PGDATA novo nasce nesse usuário dentro do tmpfs 1777 que cobre o VOLUME herdado. A raiz é somente leitura; os únicos tmpfs são dados, socket PostgreSQL e temporários, com limites, nosuid, nodev e noexec. A rede é none e não há portas publicadas.

O fluxo persiste intenção, cria parado, persiste o ID completo, valida a inspeção e só então autoriza a partida. A consulta fixa usa psql sem shell, rc, stdin ou SQL recebido do runner, com autenticação sintética e transação somente leitura. TCP no loopback interno impede confundir o servidor temporário de inicialização com o servidor final. Apenas recusa de conexão reconhecida admite readiness limitado; erro SQL, identidade divergente e banco não vazio falham imediatamente.

O exec recebe ID próprio persistido antes da partida. Após consumir a resposta binária limitada, a prova exige ExecInspect do mesmo ID e contêiner, Running falso, Pid zero, código e ProcessConfig do psql fixo. Não produz `grupoEncerrado=true` nem libera execução arbitrária, dump ou restauração. Incerteza conserva o recurso para revisão. Coleta projetada é persistida antes de stop e DELETE; a remoção usa somente o ID registrado e exige 404 NoSuchContainerID exato. Journal e credencial permanecem privados, fora dos relatórios projetados.

`tests/unidade/infra/administrativo-nativo.test.ts` exercita o fluxo completo com Engine falso, canário vizinho lógico, negativos de autoridade e HTTP real sobre subprocesso falso, incluindo chunked e JSON não canônico. Isso não é captura documental do daemon desta máquina, teste PostgreSQL real ou aprovação geral da fase de exec/cancelamento.
