# Auto-hospedagem: estado da implementação e pendências

Este documento registra a passagem de trabalho do rascunho. Não é um procedimento de implantação nem uma declaração de aceite. As implementações abaixo estão em desenvolvimento; provas de uma etapa não aprovam automaticamente a árvore publicada.

## Decisão de passagem

O trabalho restante envolve integração operacional real, revisão de fronteiras privilegiadas, distribuição e gates conjuntos. A autorização específica para um PR em rascunho permite preservar a implementação incompleta sem apresentá-la como pronta. Não houve autorização de merge, release, deploy, instalação de cron, transporte com credenciais reais ou alteração de produção.

A branch depende do PR #483, `fix/autohospedagem-migracao-config`, e parte de seu head público `fffe329d12392f82a945116057f1f2f6ba427b3b`. A origem de desenvolvimento ainda estava baseada em `c1246e7716bbde4f5f912b828dccd0542c3f8048`. A projeção preserva os ajustes mais restritivos da base em vez de substituí-los por versões locais anteriores. O PR #482 trata separadamente a política de implantação por tags; não é integrado por este recorte.

Depois da integração do predecessor, será necessário conferir o diff contra a base efetiva, adaptar a ancestralidade sem reescrever histórico publicado sem autorização e repetir os gates pertinentes. Não mesclar este PR na branch do predecessor como forma de contornar o estado de rascunho.

## Limites de operação

- Produção, seus contêineres, dados, ambientes e agendadores não são alvos de ensaio.
- Root só existe dentro da fixture administrativa confinada. O coordenador usa UID 1000 e receitas Docker finitas; contêineres não recebem socket Docker, DinD, rede do host ou broker genérico.
- O transporte novo do ensaio de atualização não está aprovado para execução real. Uma sonda independente não substitui essa aprovação.
- Recursos preservados depois de falha não podem ser adotados, reiniciados ou removidos por inferência. Estado parado não concede autoridade de limpeza.
- A primeira falha inesperada encerra a rodada. Não iniciar ciclos de correção e reexecução nem fazer recuperação automática de um estado incerto.
- Google Planilhas e suas agendas não devem ser reativados como consequência da migração. Dados e filas existentes são preservados sem despacho externo.
- Não alterar produto nem helpers compartilhados para acomodar o adaptador de testes. Uma incompatibilidade deve ser registrada e tratada em seu contrato, não por bypass da guarda.

## O que já está escrito

### Controlador de manutenção

Fontes principais: `scripts/servidor/controlador/`, `instalar-controlador.sh`, `instalar-rotinas.sh`, `atualizar.sh`, `comum.sh` e `compose.sh`. Contrato em [controlador-manutencao.md](controlador-manutencao.md).

A implementação introduz entrada estável fora do checkout, perfil adotado, snapshot operacional, exclusão mútua, journal de intenção e conclusão, controle do filho e pins físicos do conjunto de recuperação fora da retenção. O cron adotado passa pela entrada estável. O wrapper Compose do operador deixa de ser uma interface irrestrita de mutação.

A política conservadora preserva o estado quando uma falha de Compose ou migração deixa o resultado incerto. Uma falha do cliente não prova que o serviço parou e não justifica iniciar automaticamente a imagem anterior. A proteção é cooperativa: não impede root, DBA ou alguém com acesso direto ao daemon de contornar o controlador. Instalar um perfil novo também não desativa rotinas antigas.

Há regressões e fixture administrativa com clientes falsos. Isso não comprova adoção numa instalação real, controle de todos os executores antigos nem a atualização completa em PostgreSQL e Docker reais.

### Backup, recibos e retenção Dropbox

Fontes principais: `backup-banco.sh`, `backup-recibos.mjs`, `recibos.mjs`, `dropbox-api.mjs`, `dropbox-autoridade.mjs`, `dropbox-estado.mjs`, `dropbox-retencao.mjs` e `backup-planilhas-interno.sh`. Contratos em [backup-servidor.md](backup-servidor.md) e [dropbox-retencao.md](dropbox-retencao.md).

O código passa a inicializar a identidade antes da verificação do recibo, vincular o conjunto de artefatos ao catálogo independente e preservar 30 cópias confirmadas por padrão, sem transformar esse valor em teto ou sobrescrever uma configuração explícita. Há transporte nativo de leitura com origens HTTPS fixas, limites durante a recepção, prazos e recusa de redirecionamentos, além de autoridade para pasta exclusiva, paginação, revisão remota, journal e exclusão condicional.

O envio e a retenção são caminhos distintos. A presença do cliente nativo não significa que todos os uploads tenham sido substituídos por ele. Os testes de upload e de transporte falso precisam continuar cobrindo a ligação efetiva com o produtor, confirmação remota, catálogo, pins e retomada. Limitar a leitura depois de um download integral ou chamar exclusão genérica não satisfaz esses contratos.

Não foi operada uma conta Dropbox real nesta passagem. Adoção de pasta, credenciais, exclusão e retenção de conteúdo real continuam dependendo de autorização e validação próprias. No modo URL, as restrições conservadoras de expurgo e de operação permanecem documentadas; não desativá-las apenas para obter um fluxo aparentemente completo.

### Origem autenticada e Kubernetes

Fontes principais: `origem-backup.mjs`, `infra/kubernetes/frequenciapp/files/verificar-backup.sh`, `_origem.tpl`, Deployment, CronJob, hook e values do chart. Contratos em [origem-backup.md](origem-backup.md), [kubernetes.md](kubernetes.md) e ADR-068.

O perfil liga identidade e escopo do dump a endpoint PostgreSQL direto com TLS, snapshot, policy independente e HMAC em chave separada do conjunto de backup. O hook deve confrontar o recibo com a autoridade adotada e com as conexões efetivas de runtime, migrador e produtor. Integridade isolada de um arquivo legado não autoriza rollout; autenticação de origem também não prova restauração.

Existem testes sintéticos, E2E de origem e registros focais anteriores do hook. Distribuição dos módulos nas imagens, mounts, ownership sob o UID do hook, chart completo e integração final continuam pendentes. Não houve ensaio em cluster real. Hooks antigos, `--no-hooks`, administradores e revisões anteriores ficam fora da garantia.

### Restauração URL

Fontes principais: `restauracao-url.mjs`, `restaurar.sh`, `restauracao-url-harness.mjs` e `restauracao-url-real.mjs`. Contrato em [restauracao-url.md](restauracao-url.md).

O perfil direto PostgreSQL 17 cria um banco de ensaio próprio em vez de confiar numa URL externa supostamente descartável. Confere nome, OID, dono e marcador antes de escrever ou descartar. A captura de bytes, hash, escopo, histórico de migrações e a distinção entre recusa anterior à escrita e resultado incerto fazem parte da revisão restante.

Há registros anteriores de restauração sintética isolada. Isso não aprova PostgreSQL gerenciado, pooler, produção, todos os esquemas possíveis nem a recuperação da aplicação completa. A exigência de privilégios para criar o banco de ensaio é uma mudança operacional, não uma permissão para usar uma credencial administrativa existente sem adoção.

### Executores, isolamento e CI

Fontes principais: `sinteticos.mjs`, `sinteticos-interno.mjs`, `imagens-ensaio.mjs`, `Dockerfile.sinteticos`, `executar.sh`, harnesses de backup, Nginx, preview e atualização e `.github/workflows/servidor.yml`.

O conjunto separa clientes falsos, PostgreSQL real sintético e root confinado. Os executores projetam fontes por allowlist, conferem imagens e defaults, recusam montagens e ambientes alheios e distinguem attach, wait, ExitCode e ausência. Relatórios públicos devem conter apenas enums e contagens; logs, manifests e journals brutos permanecem privados.

A CI mantém recortes independentes e bloqueios explícitos. O estado atual ainda tem wrappers e agregadores que não representam todas as implementações focais novas. Um agregado não zero por bloqueio não deve ser convertido em verde, skip ou `continue-on-error`. O README de ensaios descreve parte de um estado anterior; conferir o fluxo atual antes de usar seus comandos como aceite.

## Atualização operacional: principal pendência

### Arquitetura presente

O adaptador com `EngineFake` possui uma matriz focal registrada de 52 cenários. A revisão desse perfil não aprova transporte real, OCI real, SQL ou HTTP de uma revisão realmente construída.

O backend novo está nos nove arquivos `atualizacao-integracao-real*`: coordenador, contrato, engine, Root, fontes, microaplicação, proxy, Dockerfile e testes. Ele prepara fontes próprias, Git sintético, dependências locais do `pg`, manifesto e ledger; tenta conectar a entrada administrativa por STDIO a receitas finitas executadas pelo host.

O alvo do ensaio é uma microaplicação sintética com proxy e o migrador canônico, não o Next.js completo com autenticação e todas as rotas do produto. Mesmo um futuro sucesso desse perfil não aprovará por si só os testes de API e navegador da aplicação distribuída.

### Problemas encontrados e tratamento

1. **Preparação de fontes:** a implementação inicial tinha delimitadores incorretos de template strings. A preparação falhou antes da unidade. Delimitadores foram corrigidos numa rodada posterior; essa falha não foi um ensaio operacional.
2. **Contrato de portas:** a imagem PostgreSQL falsa não declarava `ExposedPorts`, mas o inspect falso do contêiner declarava `5432/tcp`. A fixture foi alinhada; a recusa de portas extras foi preservada. Porta declarada na imagem não equivale a porta publicada no host.
3. **URL de socket Unix:** hostname vazio era recusado por `enderecoDaConexao` antes do `pg`. As specs agora usam hostname não vazio com `host=/pgsocket` na query; a query prevalece no parser do cliente. O validador canônico não foi enfraquecido. Falta comprovar a conexão no caminho operacional real.
4. **Prazo e filho órfão:** a espera administrativa era menor que a receita e a rejeição da Promise não encerrava o filho. O código passou a usar 240 segundos para atualizar, 255 segundos para a sessão, SIGKILL e confirmação de close. Ainda falta demonstrar a folga do fluxo inteiro, incluindo build e verificações HTTP, e o comportamento físico dos processos e ExecIDs após falha.
5. **Ferramentas antes de volumes:** a primeira correção dependia de `raw.binarios`, campo inexistente no inspect OCI real. Isso recusava sempre o caminho real. O candidato atual substitui essa leitura por `command -v` de `age`, `age-keygen`, `jq`, `git` e `curl` num contêiner sonda antes dos volumes.
6. **Ciclo de vida da sonda nova:** a sonda ainda precisa da mesma disciplina do restante do engine: intenção durável, ausência prévia, contrato completo de recursos, inspeção antes e depois da partida, término conciliado, ownership e ausência após remoção. A sonda manual independente apenas observou os cinco executáveis; não exercitou esse método do engine nem o fluxo completo.
7. **Runtime portátil:** preparar e conferir o fechamento local do `pg`, o manifesto, os contextos A e B e a imagem de ferramentas não pode depender de uma pasta privada anterior. Uma versão de pacote copiada ou imagem já presente não prova reprodutibilidade pelo Dockerfile e pelo lockfile públicos. IDs de imagem válidos para `create` também precisam de tratamento correto como referência de `FROM` no builder.
8. **Integração física ausente:** ainda não há prova conjunta de atualização A para B, banco preservado, migrações conciliadas, resposta HTTP dos bytes B, reabertura do Root e journal persistente no mesmo ensaio real. Perda de energia não foi testada.

### O que os resultados anteriores realmente demonstram

- A unidade anterior registrou 28 aprovados, zero falhas, skips ou todos, com transporte Docker falso dentro de contêiner confinado. Esse registro antecede a nova sonda.
- A reavaliação posterior aceitou o delta de URL e prazo e reconheceu a recusa antecipada de ferramentas, mas manteve `real_execution_approved=false`: o campo de binários não era uma observação física.
- A sonda manual separada encontrou os cinco binários e terminou com sucesso, com ausência confirmada do recurso transitório. Isso não transforma o backend atual em aprovado.
- Uma tentativa fora do confinamento exigido encontrou precondições de `NoNewPrivs`, `/scratch` e `/repo` ausentes. Não equivale ao gate confinado e não justifica remover as guardas.
- Nenhuma suíte funcional foi reexecutada para abrir este rascunho. As sanitizações e a conciliação com a base alteram bytes: resultados anteriores não são certificados do snapshot publicado.

Contagens históricas são resultados de recortes identificados, não percentual de conclusão. As evidências brutas e seus identificadores físicos não são anexos públicos deste PR.

## Diferenças deliberadas da projeção pública

- Os drivers focais locais `origem-backup-contrato-real.mjs`, seu guest `origem-backup-contrato-real.test.mjs` e `origem-backup-hook-real.mjs` não são publicados. Dependem de manifestos e autoridade física de uma rodada privada. O contrato, o produtor e os testes portáveis permanecem; a prova focal precisa de reprodução portátil antes de ser aceite da branch.
- A fixture de backup derivada do formato Compose 5.5.1 substitui caminhos, rodada, projeto, volume e hostnames por valores sintéticos consistentes. Não é uma captura literal nem um novo inspect real.
- O harness de backup exige `BACKUP_ENSAIO_AGE_DIR` absoluto em vez de uma pasta de scratch de uma execução anterior. Hashes, tipo ELF e ownership dos binários continuam exigidos. Ainda falta tornar esse preparo reproduzível; não copiar artefatos privados nem usar essa variável como autorização de execução.
- O executor de origem usa o diretório temporário do sistema em vez de um cache pessoal. Essa adaptação não autoriza rodá-lo no host produtivo.
- As duas regras `.dockerignore`, o teste `configuracao-segura.test.mjs` e o aviso sobre certificados preservam as proteções mais restritivas de #483. O workflow mantém também os paths de `.dockerignore`, `docker/app/**` e `schema-postgres.mjs` da base.
- `vercel.json` desabilita implantação automática apenas para `fix/autohospedagem-pendente`, por `git.deploymentEnabled`. Não muda o comportamento de `main` ou de outras branches. O mecanismo é documentado em [Git Configuration da Vercel](https://vercel.com/docs/project-configuration/git-configuration). Isso não desliga a CI do GitHub nem bloqueia deploy manual.
- Não são publicados logs, journals, connection strings reais, chaves, manifests locais, capturas brutas, conteúdo de ambiente, dados escolares nem relatórios privados de segurança. A varredura de publicação não substitui revisão funcional ou garantia absoluta de ausência de segredo.

## Ordem recomendada de continuação

### 1. Estabilizar e revisar o snapshot

- [ ] Ler `AGENTS.md`, `CONTRIBUTING.md`, `SECURITY.md`, o diff completo contra a base viva e este documento.
- [ ] Revisar o trabalho anterior, inclusive as diferenças de projeção acima; não apenas continuar do último arquivo editado.
- [ ] Inventariar fontes executadas, dados lidos por hash, imports, ferramentas, versões e contextos mínimos de build. Não confundir um arquivo apenas hasheado por EngineFake com código executado nesse perfil.
- [ ] Consolidar as entradas de sintéticos e E2E. Testes que exigem `/repo`, `/scratch`, root ou `pg` preparado não podem cair num agregador incompatível nem desaparecer silenciosamente.
- [ ] Reproduzir de maneira portátil as provas focais não distribuídas; manter o registro histórico separado.

### 2. Fechar uma vertical real de atualização

- [ ] Completar e revisar a sonda no ciclo durável do engine, sem campo OCI fictício e sem criar volumes antes da observação exigida.
- [ ] Executar unidade confinada atual com transporte falso e inventário completo. Guardas faltantes, falha de coleta, saída parcial ou skip não são aprovação.
- [ ] Obter revisão específica aprovando a transição para o transporte real. O estado atual não concede essa aprovação.
- [ ] Em recursos novos e explicitamente isolados, provar o caminho mínimo A para B: IDs próprios, DB e sentinela preservados, histórico de migrações e checksum conciliados, imagem construída e rotulada, proxy respondendo o commit B, Root reaberto e estado durável conferido.
- [ ] Só depois do caminho mínimo, exercitar recortes físicos de erro, timeout, sinal e encerramento, com parada na primeira falha inesperada e preservação de recursos incertos. Não fazer stop/rm para liberar o próximo teste.
- [ ] Manter explícito que queda do filho, encerramento de sessão e perda de energia têm alcances diferentes.

### 3. Fechar as outras verticais e sua distribuição

- [ ] Backup Compose: tornar portátil o preparo age, repetir o perfil completo e os controles de adulteração, identidade, escopo, recibo, recuperação e retenção. A fixture sanitizada não é novo aceite.
- [ ] Nginx: conciliar o harness novo, `nginx-acme-real.mjs`, wrapper e inventário. Prova sintética de desafio ACME não é emissão real de certificado nem validação da Internet.
- [ ] Preview: conciliar `privilegios-preview-real.mjs`, wrapper e agregadores, preservando isolamento do banco e a matriz de permissões. Não provisionar preview remoto para isso.
- [ ] URL: repetir o perfil PostgreSQL 17 isolado, comparar destino e ensaio por identidade física, conferir os mesmos bytes usados na restauração e provar a ausência de escrita no destino nas recusas prévias.
- [ ] Dropbox: revisar transporte limitado, paginação, upload efetivo, catálogos, revisão condicional, journal e retomada em servidor falso que realmente transmita bytes. Não usar conta real ou exclusão real como atalho para teste ausente.
- [ ] Kubernetes: conferir renderização, validação estrita, Secrets, mounts, UID/GID e todo o fechamento dos imports na imagem distribuída. Provar a origem do dump e o gate completo, não apenas campos coerentes no mesmo recibo.
- [ ] Controlador: conciliar adoção, cron antigo, todas as entradas de manutenção, pins e reabertura. Não declarar cobertura retroativa de scripts anteriores.

### 4. Fechar catálogo, gates e revisão global

- [ ] Atualizar wrappers, catálogo, scripts do pacote, workflow, README de testes e guias para que implementação, cobertura e códigos de saída descrevam o mesmo estado.
- [ ] Tirar os quatro legados do bloqueio somente depois de provar as respectivas substituições: backup/restauração, Nginx, preview e atualização integrada. Não remover o bloqueio apenas porque o arquivo novo existe.
- [ ] Rodar `format:check`, lint, tipos, unidade, validadores de servidor/Helm/workflows e perfis de integração em árvore estável e ambientes isolados. Registrar resultados por comando e SHA.
- [ ] Revisar `pnpm run test:api`, build e demais consumidores afetados num aplicativo sintético isolado; conferir os fluxos distribuídos que a microaplicação não representa. Não executar `pnpm test` no host por conveniência, pois ele inclui API e limpeza de massa.
- [ ] Rever documentação e CHANGELOG para retirar contradições, qualificar limites e não anunciar como pronto o que ainda está bloqueado.
- [ ] Obter revisão independente conjunta e aprovação do mantenedor antes de marcar pronto. Tratar merge, release e adoção operacional como decisões separadas.

## Comandos de orientação, não executados nesta passagem

Depois de demonstrar o isolamento e revisar o fluxo efetivo:

```bash
node tests/servidor/sinteticos.mjs --inventario
pnpm run test:servidor:autoteste
pnpm run test:servidor:portabilidade
pnpm run test:servidor:sinteticos
pnpm run test:servidor:e2e:origem-cli
pnpm run test:servidor:e2e:controlador-root
pnpm run test:servidor:e2e:restauracao-url
```

Os agregados `test:servidor:integracao` e `test:servidor:todos` ainda não são promessa de aprovação. Antes de invocá-los, corrigir a classificação e comprovar as precondições de cada perfil; se houver bloqueio, preservar seu status não zero. Não há neste handoff um comando único, autossuficiente e aprovado para o A para B real. Sua criação e revisão fazem parte da entrega restante.

## Reversão e responsabilidades

Como rascunho sem merge, a publicação não instala esses recursos. Abandonar ou substituir o PR não autoriza apagar os recursos preservados de ensaios anteriores. Para futura adoção, planejar recuperação de estado, banco, configuração e imagens; voltar o Git não desfaz migrações nem torna seguro um downgrade.

A revisão de publicação cobre sigilo e efeitos dos gatilhos, não aceite funcional. O próximo responsável deve revisar e reproduzir o trabalho anterior, resolver as pendências acima e registrar a revisão exata validada antes de pedir revisão de mantenedor ou propor liberação operacional.
