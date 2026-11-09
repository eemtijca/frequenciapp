# Executor de testes isolados

API, ponta a ponta e PWA não aceitam mais um servidor ou banco escolhido por variáveis do host. O executor cria uma rodada exclusiva e só libera fixtures depois de comprovar a topologia e a identidade do runtime e do banco.

## Comandos

Requisitos: Docker disponível para o usuário, Git e Node no host. O servidor e os testes usam Node 24 dentro da imagem. Dependências e navegadores não são instalados no host.

```bash
node tests/isolamento/executar.mjs -- pnpm exec vitest run --config vitest.api.config.ts tests/api/sistema/documentacao.test.ts
node tests/isolamento/executar.mjs -- pnpm exec playwright test tests/ponta-a-ponta/sistema/autenticacao.spec.ts --project=chromium --workers=1 --retries=0
node tests/isolamento/executar.mjs -- pnpm exec playwright test --config=playwright.pwa.config.ts --project=chromium --workers=1 --retries=0
```

`pnpm run test:api`, `pnpm run test:e2e`, `pnpm run test:e2e:docker` e `pnpm run test:pwa` chamam esse executor. Dentro dele, usar o programa real, como `pnpm exec vitest`, e não outro wrapper, que tentaria criar uma segunda rodada.

Não carregar `.env` nem exportar URLs de banco, `APP_URL`, `TEST_BASE_URL`, `AUTH_SECRET`, Google, push, cron, `NODE_OPTIONS`, `PG*`, `DOCKER_HOST`, contexto Docker ou overrides Compose. Valores externos não vazios são recusados antes do preparo. Não existe opção para adotar uma instalação existente.

O acesso via `sudo -n docker` só é selecionado por `FREQUENCIAPP_DOCKER_SUDO=1`, após autorização operacional explícita. Não há elevação automática quando Docker é negado. Uma falha de permissão ou de preparo encerra a operação e não aciona outro daemon, registry ou credencial.

## Fases e perímetro

1. Uma cópia allowlist reúne arquivos versionados e uma lista fixa dos arquivos próprios do executor. Novos arquivos de outros lotes exigem `--fontes-novas`, com caminho e hash explícitos, conforme a política abaixo. Não há varredura ampla de untracked. `.git`, `.env*`, `.hermes`, sessões, `node_modules` e resultados não entram na cópia. Links em arquivos ou diretórios ancestrais são recusados. A imagem de dependências usa o lock e não executa postinstall arbitrário; a geração do Prisma e dos assets é explícita.
2. O build de produção ocorre em uma fase com rede e somente configuração sintética, sem banco ou segredos. Essa rede é necessária às dependências e às fontes do Next. Nenhum teste ou fixture roda nessa fase.
3. Containers novos recebem nomes aleatórios e labels de ownership. A inspeção antecede a partida e recusa portas publicadas, binds, volumes externos, rede de host, privilégios e recursos não registrados. O PostgreSQL usa tmpfs próprio e `--network none`.
4. App e programa de testes compartilham somente o namespace `container:<id>` desse PostgreSQL. Não possuem interface externa ou rota IPv4. A ausência de interfaces externas também impede rotas IPv6 para fora do namespace. Não há socket Docker, diretório pessoal, segredo ou `.env` montado.
5. Um canário sintético vizinho, em rede interna nova, precisa ser inalcançável com `ENETUNREACH`. Só esse endereço criado pela rodada é sondado. O contador do canário deve continuar em zero. Não são sondados gateways, serviços reais ou endereços públicos.
6. Uma consulta real confirma banco e papel esperados e catálogo vazio antes de migrar. Só falhas transitórias de conexão são repetidas. Erro SQL ou banco não vazio interrompe o preparo.
7. Após migrar, o provisionador grava um marcador aleatório. Um socket Unix privado atesta o mesmo processo Next que atende HTTP. Um desafio assinado na resposta de saúde liga a origem HTTP à prova privada. O cliente confere marcador, papel, banco, schema e cada checksum de migração antes de liberar a suíte.

O runtime especial está integralmente em `tests/isolamento/runtime.mjs`. Não adiciona endpoint ao aplicativo de distribuição, nem modifica o build normal para oferecer atestados. O Google falso continua restrito ao loopback, agora compartilhado com os testes. Credenciais não reconhecidas não escapam do namespace sem rotas.

O manifesto privado e a assinatura não protegem contra um administrador local malicioso que controle Docker ou altere os arquivos de prova. O contrato protege a execução acidental contra destinos incorretos e depende do isolamento do kernel e da autoridade do provisionador.

## Guardas e encerramento

A configuração de API recusa a coleta sem prova e executa o preflight antes de importar os contratos. Configurações Playwright que usam o app real não iniciam nem reutilizam servidor externo. O setup global verifica antes de contar alunos, criar contas ou gravar sessões. Helpers diretos e limpezas repetem a prova; filtros e casos ignorados não a desativam.

`negativos.mjs` exercita configuração ausente, destino externo e divergência de app ou banco, instrumentando sockets, `pg.connect` e `fetch` para exigir zero conexões. Os testes unitários usam dublês e verificam também zero criação ou redefinição de conta e zero limpeza.

O encerramento inspeciona IDs e labels exatos antes de remover os containers e a rede registrados. Não usa `prune`, busca por substring ou `compose down` sobre um projeto presumido. O erro principal é preservado quando o encerramento também falha. Falhas de inspeção preservam o recurso ambíguo para análise, em vez de remover algo não comprovado.

Logs e provas ficam no diretório privado indicado na saída, com manifesto em modo 0600 e diretório em 0700. Não publicar o manifesto, `fontes.json` ou anexar o diretório inteiro. Imagens nomeadas da rodada são removidas no encerramento normal; o cache do builder pode permanecer e não recebe limpeza global.

### Resultados recuperáveis

O subdiretório `artefatos/` recebe somente `runtime.log`, `test-results/` e `playwright-report/`. Quando o comando contém `imagens.spec.ts`, inclui também os sete PNGs exatos declarados por esse spec em `docs/imagens/`. Os PNGs antigos são retirados somente da cópia de fonte, antes do build de capturas. Imagem ausente reprova o comando e não é substituída por uma imagem anterior. A coleta ocorre antes da limpeza por ownership, inclusive após falha da conferência final, sem apagar o erro original.

`--artefatos /caminho/absoluto/novo` escolhe o destino; sem a opção, o executor cria `artefatos/` dentro da pasta privada da rodada e imprime ambos os caminhos. O destino final precisa ser novo, fora do checkout e sem symlink em qualquer componente; o diretório pai já deve existir. Um destino existente é recusado antes de chamar Docker. Não há cópia automática sobre arquivos versionados. Após revisão visual, os PNGs selecionados podem ser copiados manualmente para `docs/imagens/`.

A transferência usa `docker cp` para um fluxo tar, nunca diretamente para o checkout. O leitor aceita somente arquivos regulares e diretórios no prefixo autorizado, com checksum e limites de tamanho; rejeita links, tipos especiais, caminhos absolutos, `..`, PAX não autorizado, manifestos, `.env*` e arquivos de sessão. Os arquivos exportados são criados com exclusividade em modo 0600 e diretórios em 0700. `inventario.json` lista os resultados efetivamente extraídos. Relatórios e traces são sintéticos e privados, mas não passam por redação de conteúdo; revisar antes de qualquer compartilhamento.

### Fontes novas de outros lotes

Sem opção adicional, apenas arquivos Git autorizados e os caminhos fixos do executor são copiados. Para testar código novo ainda não versionado, preparar fora do contexto de build um JSON revisado com itens `{ "caminho": "src/domain/arquivo-novo.ts", "sha256": "hash SHA-256 de 64 caracteres hexadecimais minúsculos" }`. O caminho é relativo à raiz, sem curingas ou diretórios. Revisar o conteúdo de cada arquivo e calcular seu hash antes de incluí-lo; não listar evidências privadas, segredos ou dados reais.

```bash
node tests/isolamento/executar.mjs --fontes-novas "$HOME/evidencias/fontes-revisadas.json" -- pnpm exec vitest run --config vitest.api.config.ts tests/api/sistema/documentacao.test.ts
```

A lista só aceita extensões de fonte/documentação dentro das raízes permitidas. Caminhos privados, arquivos de chave, sessão, ambiente, traversal, links ou hashes divergentes são recusados. Duplicar caminho Git ou um arquivo próprio também é erro. Não são usados `rglob`, `git add` ou inclusão implícita de todos os untracked. O inventário privado `fontes.json`, fora da cópia enviada ao build, registra caminho, origem e SHA-256 dos bytes usados. Essa política torna a seleção auditável, não detecta todo segredo embutido em um arquivo de código; a revisão da lista e do conteúdo continua obrigatória.

## Validação da imagem de distribuição

```bash
node tests/isolamento/executar.mjs --validar-distribuicao
```

O workflow `testes.yml` usa essa fase antes de API, navegador e PWA. Ela valida `compose.yml` e `compose.yml` com `compose.ci.yml` usando `config --quiet`, nome de projeto aleatório, `--env-file /dev/null` e ambiente sintético. Não chama `up` nem executa a topologia legada com rede de host ou bind.

Depois constrói o Dockerfile de distribuição a partir da cópia autorizada e executa sua imagem final, sem instalar dependências de testes nela. O validador recebe somente ambiente sintético, compartilha o namespace do PostgreSQL novo em `none`, comprova identidade e catálogo vazio antes da primeira escrita e testa a recusa de rota ao canário vizinho. Executa `docker/app/migrar.mjs`, `scripts/administracao/criar-admin.mjs --somente-criar`, `scripts/administracao/criar-coordenacao.mjs` e `scripts/seed/seed.mjs` com perfil leve. Uma consulta confirma administração, coordenação, nove turmas e alunos persistidos. O contador do canário precisa continuar em zero. Logs, ID da imagem e recibo ficam privados; recursos são removidos somente por IDs/labels registrados. A base não é reaproveitada pelas suítes que exigem banco escolar vazio.

Esse modo não inicia o HTTP da imagem final nem comprova seu healthcheck. O runtime atestado de API/navegador continua em imagem própria. A configuração anônima de legibilidade não muda o provisionador comum: ainda há criação de contas sintéticas antes do comando.

## Limites

- A implementação usa Docker diretamente, em vez de Compose, para inspecionar IDs antes da partida e compartilhar um namespace sem gateway. Não depende de `internal: true` como prova suficiente.
- Não há suporte a servidor externo, Docker remoto, rede de host, interface interativa ou janela de navegador exposta no host.
- O harness Compose legado de `tests/servidor/lib.sh` é bloqueado: ainda não registra ownership verificável por recurso. Importá-lo ou recusá-lo não chama Docker no trap de saída. Os ensaios com dublês continuam independentes. Ensaios administrativos reais precisam ser adaptados ao mesmo contrato antes de sua reativação.
- Falha de download, build, navegador ou Docker é bloqueio de infraestrutura. Não comprova um smoke positivo, não substitui um RED de comportamento e não autoriza contorno de permissões.
- O CI usa rodadas separadas para distribuição, API, navegador e PWA. O build da imagem final não é substituído pelo build da testimage.

## Implementado e verificação pendente

As regressões `isolamento-artefatos.test.ts` e `isolamento-cobertura-ci.test.ts` exercitam cópia/exportação em arquivos sintéticos, seleção da imagem e comandos com Docker falso, consultas com dublês e recusas de caminhos/ownership. Não validam um daemon, PostgreSQL, navegador, build novo ou o CI remoto. Os comandos integrados abaixo só devem ser executados depois de estabilizar e revisar o candidato, com autorização e recursos sintéticos exclusivos:

```bash
node tests/isolamento/executar.mjs --validar-distribuicao
node tests/isolamento/executar.mjs -- pnpm exec vitest run --config vitest.api.config.ts tests/api/sistema/documentacao.test.ts
pnpm run capturas:readme
```

Conferir logs privados e recibo da imagem final, testes descobertos/executados, sete PNGs novos recuperados, preservação do checkout, canário sem conexões e limpeza somente dos recursos da rodada. Falhas de build, tipos ou infraestrutura bloqueiam a prova integrada; GREEN com dublês não as substitui. A revisão e a integração das interfaces administrativas de servidor e de preview pertencem a seus respectivos responsáveis.
