# Ensaios portáveis do servidor

Estado do rascunho: os harnesses focais novos e os agregadores ainda precisam de conciliação. O [handoff de auto-hospedagem](../../docs/auto-hospedagem-pendencias.md) separa provas históricas, limites do snapshot publicado e tarefas restantes; nenhum comando abaixo é um aceite já executado desta árvore.

Os perfis distinguem clientes falsos, PostgreSQL real sintético e a fixture administrativa root. Nenhum deles aprova sozinho unidade/API/navegador do aplicativo, conta Dropbox real ou cluster real.

## Entradas e inventário completo

Na raiz do checkout, com Bash, Node e Docker local disponíveis ao operador:

```bash
node tests/servidor/sinteticos.mjs --inventario
pnpm run test:servidor:autoteste
pnpm run test:servidor:portabilidade
pnpm run test:servidor:sinteticos
pnpm run test:servidor:e2e:origem-cli
pnpm run test:servidor:e2e:controlador-root
pnpm run test:servidor:e2e:restauracao-url
pnpm run test:servidor:integracao
pnpm run test:servidor:todos
```

| Perfil                 | Cobertura                                                                                       | Limite                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `autoteste`            | Launcher, dublês, receitas, inventário e entradas                                               | Sem clientes reais                                                 |
| `portabilidade`        | Autotestes e chart com Helm real fixado                                                         | Não lê `comum.sh` nem executa drivers de produto                   |
| `sinteticos`           | Todos os `*.test.mjs` em servidor/Kubernetes e quatro ensaios Bash                              | UID/GID 1000, sem socket/rede                                      |
| E2E `origem-cli`       | `origem-backup-cli.e2e.mjs`, produtor Bash, TLS, dump, age, hook e recuperação                  | PostgreSQL criado dentro do contêiner próprio                      |
| E2E `controlador-root` | `controlador/operacional.e2e.mjs`, instalação/cron/atualização com clientes falsos              | UID/GID 0 só na fixture privada, sem capabilities, rede ou socket  |
| E2E `restauracao-url`  | Harness e `restauracao-url-real.mjs`, seis cenários de restauração PostgreSQL                   | Namespace loopback próprio, sem banco externo                      |
| Legados bloqueados     | `backup-restauracao.sh`, `nginx-acme.sh`, `privilegios-preview.sh`, `atualizacao-integracao.sh` | Guardas de ownership/cleanup ainda não comprovadas; não executados |

`--inventario` exige a presença dos E2E conhecidos e recusa E2E novo sem classificação. Os testes comuns continuam descobertos recursivamente; remover regressões centrais falha. A CLI real foi renomeada de `.test.mjs` para `.e2e.mjs`: não há `skip` condicional. Ausência das precondições de contêiner, UID, rede e `/ensaio` causa falha antes de initdb ou dos clientes.

`test:servidor` é alias de `todos`; `rapido` é alias de `sinteticos`. `bash tests/servidor/executar.sh integracao` exige os três E2E, incluindo root, origem CLI e `restauracao-url.sh --executar`. `todos` também exige sintéticos. Falhas de um perfil não eliminam os demais. Cada resultado aparece separadamente; os quatro legados continuam bloqueados, e o agregado retorna não zero, inclusive `78` quando apenas os legados impedem aprovação. Não executar esses legados no VPS para imitar CI.

## Toolchain e receitas sem build da aplicação

O build automático projeta somente `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` e `Dockerfile.sinteticos` em um contexto temporário. Não envia o checkout, `.git`, `.env`, evidências ou credenciais. A receita fixa:

- Node `24.22.2-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9`;
- Helm da imagem `alpine/helm:latest@sha256:e3f8d5c462d75470fbb1fce79ad5c20063657096d1f98c0fcea869e2600e2e5e`, binário `/usr/bin/helm` copiado para `/usr/local/bin/helm`;
- `corepack pnpm install --frozen-lockfile --prod --ignore-scripts`, sem postinstall, Prisma generate, aplicação ou Next build;
- Bash, GNU coreutils, util-linux, jq e Git. Não contém Docker CLI nem socket.

As dependências de produção ficam em `/node_modules`, alcançáveis pelos imports ESM tanto da fonte readonly como das fixtures em `/tmp`. A guarda interna executa Helm e importa `pg` e `dotenv` antes dos casos, sem conectar. `HELM_BIN=/usr/local/bin/helm` é explícito e não vem do host. A rede de build obtém apenas dependências públicas; a execução usa rede `none`.

A receita `tests/kubernetes/origem-backup.Dockerfile` recebe `FERRAMENTAS` resolvido para o ID imutável da toolchain, sem tag local implícita. A base PostgreSQL é `postgres:17-bookworm@sha256:665dc7b37ac52a17e298511414c21d23ffa4e6a6ef6225b3e5d59c7afb35e994`; acrescenta age, OpenSSL, jq e ferramentas GNU. É usada pelo E2E de origem e como cliente da restauração, sem build da aplicação.

Referências opcionais permitem reutilizar imagens já construídas:

```bash
# Ferramentas construídas previamente pela mesma receita/contexto mínimo.
node tests/servidor/sinteticos.mjs --image ferramentas:local --selftest
node tests/servidor/sinteticos.mjs --image ferramentas:local --perfil controlador-root

# Sem essas variáveis, os harnesses constroem a receita pública automaticamente.
ORIGEM_BACKUP_TEST_IMAGE=origem:local node tests/kubernetes/origem-backup-isolado.mjs --executar
RESTAURACAO_URL_RUNNER_IMAGE=origem:local \
RESTAURACAO_URL_DB_IMAGE=postgres:17-bookworm@sha256:665dc7b37ac52a17e298511414c21d23ffa4e6a6ef6225b3e5d59c7afb35e994 \
  bash tests/servidor/restauracao-url.sh --executar
```

Referências são inspecionadas e resolvidas para IDs antes de criar recursos. `imagens-ensaio.mjs` confere o mapa completo de Env, recusando extras, duplicados e valores divergentes, volumes/portas fora do contrato e healthchecks injetados. As imagens próprias exigem labels `sinteticos-v2` ou `origem-v2`; a identidade PostgreSQL 17.11 e seus defaults são fixados, não deduzidos de tags locais. A escolha explícita de uma imagem não dispensa esses contratos nem comprova a confiabilidade de conteúdo arbitrário fornecido pelo operador.

## Isolamento e encerramento

O launcher monta uma captura por allowlist em `/repo:ro`, nunca o checkout inteiro. Não monta `.git`, `.env`, `node_modules` do host, credenciais, evidências nem socket Docker. Raiz readonly, rede `none`, `cap-drop ALL`, `no-new-privileges`, IPC privado, sem portas e limites de CPU/memória/PIDs são inspecionados antes de start. `/tmp` é tmpfs executável. Apenas `controlador-root` acrescenta `/sandbox` tmpfs privado e UID/GID 0; não amplia rede, mounts do host ou capabilities.

O mount de `--init` continua restrito ao destino único `/usr/sbin/docker-init` da imagem Debian. A origem pode variar entre daemons, mas precisa ser arquivo ELF root não gravável por terceiros, readonly, em ext4/xfs/overlay e byte-idêntico ao executável real do PID 1. Não se aceitam diretórios, mounts extras, tmpfs ou arquivo arbitrário. A ausência de prova falha antes dos casos.

O launcher exige attach sem erro/sinal, `docker wait`, estado `exited`, ExitCode conciliado, inventário e contagens completos. `skip`, `todo`, resumo vazio/inválido ou arquivo ausente nunca viram aprovação. Cleanup remove somente o ID criado nesta rodada, parado e com identidade conferida; não usa filtros, `rm -f`, prune ou nomes presumidos. Estado incerto preserva o recurso. O E2E de origem também concilia attach/wait/ExitCode antes de coletar o resultado e remover seu ID. A restauração mantém seus recursos próprios parados e preservados conforme seu contrato específico.

Os hashes das fontes do perfil são comparados com a captura e com o final. Não executar sintéticos completos ou drivers que leem produto durante writers concorrentes. O recorte `portabilidade` não equivale a esse gate integrado.

## Relatórios e CI

```bash
resultados=$(mktemp -d "${TMPDIR:-/tmp}/servidor-resultados.XXXXXX")
node tests/servidor/sinteticos.mjs --perfil portabilidade --report "$resultados/resultado.json"
node tests/servidor/sinteticos.mjs --export-report "$resultados/resultado.json" "$resultados/publico.json"
node tests/servidor/sinteticos.mjs --check-report "$resultados/publico.json"
```

`--report` exige caminho absoluto novo. O schema público fechado contém apenas enums e contagens, sem IDs, paths, logs ou mensagens arbitrárias. O sidecar privado registra comandos/estados e hash das fontes; `.execucao.log` preserva a saída sintética depois do término confirmado. Nenhum deles é enviado ao artifact público. Origem ausente/inválida gera falha estruturada e exit não zero no exportador. O checker exige aprovação completa.

O workflow `Servidor` mantém sintéticos independentes e três jobs E2E obrigatórios na matriz, sem secrets ou build do aplicativo. Os validadores usam captura de fontes públicas versionadas, sem `.git` nem credencial persistida do checkout. A coleta/upload do relatório sintético usa `always()` e ausência de arquivo é erro. A integração agregada, solicitada por `workflow_dispatch`, mantém os quatro bloqueios legados e nunca afirma cobertura completa. Os resultados específicos dos E2E não aprovam esses legados.

## Estado de verificação

As evidências históricas e a rodada focal desta alteração são distintas. O autoteste anterior `30/30` pertence às fontes anteriores e não deve ser reescrito como aprovação destas fontes. A validação final desta frente cobre somente runner/receitas/toolchain/chart; não executa sintéticos completos, E2E de produto, produção, credenciais reais, conta Dropbox ou cluster. Os gates integrados dependem da árvore estável e da conciliação pelo coordenador.
