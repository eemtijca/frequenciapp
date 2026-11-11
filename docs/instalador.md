# Instalador

Contrato do instalador do FrequenciApp. Este documento fixa a interface pública antes do código: comandos, flags, saída JSON, códigos de erro, canais, estado, matriz de distribuições e testes. A implementação entra em `instalar.sh` e `scripts/instalador/` nas tarefas seguintes e deve seguir este contrato. Uma divergência exige atualização deste documento e dos ADRs correspondentes.

O destino de produção é um VPS Linux único com Docker. A Vercel fica como preview ou desligada. O instalador não configura a Vercel nem o GitHub sozinho: ele não cria projeto, não altera domínio, não define variáveis em repositório, não cria release e não executa `gh variable set`. Essas ações ficam com o operador, conforme [auto-hospedagem.md](auto-hospedagem.md).

As decisões estão na [ADR-076](adr/076-instalador-cross-distro.md) e na [ADR-077](adr/077-canais-de-atualizacao.md). O backup e a restauração têm contrato próprio em [backup-servidor.md](backup-servidor.md).

## Visão geral

O entry point é `instalar.sh`, um bootstrap Bash pequeno. Ele confere o host, instala apenas o mínimo para executar a CLI Node interna e delega o trabalho a `scripts/instalador/`. A CLI não usa dependências externas de npm, para que a instalação não dependa de rede de pacotes JavaScript.

```text
instalar.sh
scripts/instalador/
  cli.mjs
  detectar.mjs
  pacotes.mjs
  plano.mjs
  estado.mjs
  json.mjs
  redigir.mjs
  executor.mjs
  canal.mjs
  passos/
```

O instalador orquestra os scripts existentes do servidor: `compose.sh`, `identidade.sh`, `backup-banco.sh`, `restaurar.sh`, `atualizar.sh`, `instalar-rotinas.sh` e os scripts do controlador quando o perfil for adotado. Ele não reimplementa backup, restauração ou atualização.

### Perfis

| Perfil        | Controlador | Dropbox | Uso                                               |
| ------------- | ----------- | ------- | ------------------------------------------------- |
| `simples`     | não         | não     | Escola com VPS e Docker. É o perfil padrão.       |
| `controlador` | sim         | não     | Escola que adota journal, pins e entrada estável. |
| `dropbox`     | não         | sim     | Escola que usa Dropbox para o banco.              |
| `completo`    | sim         | sim     | Escola que adota controlador e Dropbox.           |

O perfil `simples` não pode ser bloqueado por artefato do controlador. Os perfis `controlador`, `dropbox` e `completo` são opt-in e exigem configuração explícita.

### Escopo

| Item           | Contrato                                                        |
| -------------- | --------------------------------------------------------------- |
| Sistema        | Linux com Bash, Docker Engine e Docker Compose 2.24 ou superior |
| Iniciador      | systemd como padrão; cron ou OpenRC como fallback               |
| Arquitetura    | AMD64 e ARM64                                                   |
| Distribuições  | Tier 1 e Tier 2 conforme a matriz deste documento               |
| Banco          | PostgreSQL 17 no Compose ou por URL no modo externo             |
| Proxy          | Caddy ou Nginx, com TLS público ou interno                      |
| Atualização    | Canal `release` ou `main`, com backup obrigatório               |
| Fora do escopo | Kubernetes, Windows, macOS, WSL, 32 bits e sistemas sem Bash    |

### VPS único e GitHub

O único destino de produção deste contrato é um VPS Linux. A Vercel fica como preview ou desligada. O repositório GitHub precisa das variáveis `DEPLOY_TARGET=servidor`, `AGENDA_EXTERNA=servidor` e `BACKUP_EXTERNO=servidor`, definidas pelo operador com `gh variable set`. O instalador não executa esse comando, não altera workflow, não cria release e não configura a Vercel.

## Comandos

Todos os comandos aceitam `--json`, `--config`, `--relatorio`, `--arquivo-log`, `--sem-cor`, `--silencioso`, `--verboso` e `--nao-interativo`. A tabela indica o efeito padrão.

| Comando        | Papel                                                              | Altera o sistema |
| -------------- | ------------------------------------------------------------------ | ---------------- |
| `planejar`     | Produz o plano completo, sem alterar o sistema                     | não              |
| `aplicar`      | Executa o plano com trava, estado e retomada                       | sim              |
| `situacao`     | Mostra containers, saúde, versão, backup, timers e disco           | não              |
| `diagnosticar` | Verifica dependências, portas, DNS, TLS, banco, migrações e backup | não              |
| `atualizar`    | Atualiza por tag estável, com backup                               | sim              |
| `backup`       | Executa e verifica um backup                                       | sim              |
| `restaurar`    | Baixa do remoto, valida checksum e chama `restaurar.sh`            | sim              |
| `desinstalar`  | Remove serviços, preservando dados por padrão                      | sim              |
| `canal`        | Mostra ou troca o canal                                            | condicional      |
| `versao`       | Mostra a versão do instalador e do projeto                         | não              |
| `esquema`      | Mostra o JSON Schema                                               | não              |

As flags `--planejar` e `--aplicar` são equivalentes aos comandos `planejar` e `aplicar` quando usadas como primeiro argumento. A forma com subcomando é a recomendada em documentação e automação.

### planejar

O `planejar` lê o host e produz o plano determinístico. Ele não instala pacote, não cria usuário, não grava estado, não altera arquivo de ambiente, não sobe container, não muda firewall e não inicia serviço. Apenas os arquivos pedidos explicitamente por `--relatorio`, `--arquivo-log` ou `--salvar-config` são escritos.

O plano contém:

- distribuição, versão, codename, família, arquitetura e tier;
- gerenciador de pacotes, iniciador, firewall, SELinux e AppArmor;
- pacotes presentes, versão encontrada, versão mínima e ação prevista;
- Docker, serviço, grupo e versão do Compose;
- portas, DNS, relógio, disco, memória e fuso;
- instalação existente, estado, containers, volumes e perfil do controlador;
- backup, rclone, Dropbox e permissões dos arquivos sensíveis;
- etapas que seriam executadas, na ordem, com o motivo de cada ação.

O `planejar` não exige `--sim`. Achados bloqueantes produzem `ok: false`, código `E_*` e saída diferente de zero, sem alterar o host. Avisos não bloqueantes mantêm `ok: true`.

### aplicar

O `aplicar` executa o plano com trava exclusiva e estado durável. A ordem das etapas é fixa e os identificadores são estáveis para retomada e automação.

| Ordem | Etapa            | Papel                                                            | Limite padrão |
| ----- | ---------------- | ---------------------------------------------------------------- | ------------- |
| 1     | `preflight`      | Confere distro, arquitetura, dependências, disco e memória       | 5 min         |
| 2     | `pacotes`        | Instala somente o que falta ou está abaixo da versão mínima      | 30 min        |
| 3     | `docker`         | Instala ou valida Docker, serviço, grupo e Compose               | 15 min        |
| 4     | `usuario`        | Cria a conta de implantação e os diretórios de operação          | 5 min         |
| 5     | `diretorios`     | Cria estado, backup, log e configuração com modo restrito        | 5 min         |
| 6     | `fonte`          | Prepara o checkout ou a origem da imagem e ajusta o proprietário | 15 min        |
| 7     | `ambiente`       | Gera `app.env` e `ops.env` com segredos e permissões corretas    | 5 min         |
| 8     | `dropbox`        | Configura o destino Dropbox quando o perfil exige                | 15 min        |
| 9     | `proxy`          | Configura Caddy ou Nginx, TLS e portas públicas                  | 15 min        |
| 10    | `compose`        | Monta, valida e sobe a pilha                                     | 30 min        |
| 11    | `banco`          | Valida o PostgreSQL 17 e a conexão                               | 10 min        |
| 12    | `migracoes`      | Aplica as migrações pendentes                                    | 30 min        |
| 13    | `contas`         | Cria administração e coordenação quando solicitado               | 10 min        |
| 14    | `saude`          | Aguarda `/api/saude` e confere a versão                          | 10 min        |
| 15    | `controlador`    | Adota o controlador quando o perfil exige                        | 20 min        |
| 16    | `backup-inicial` | Executa e confere o primeiro backup                              | 60 min        |
| 17    | `agendador`      | Instala systemd timers ou cron                                   | 10 min        |
| 18    | `firewall`       | Ajusta o firewall somente com consentimento explícito            | 5 min         |

O `aplicar` interrompe na etapa exata da falha, preserva estado e recursos e não faz limpeza destrutiva. Depois de uma migração aplicada, ele não inicia automaticamente a imagem anterior. A recuperação usa o backup e `restaurar.sh`.

Ações destrutivas exigem `--sim`. Com `--nao-interativo` e sem `--sim`, a execução falha com `E_USO` antes de qualquer alteração. O `--forcar` repete a etapa selecionada, mas não ignora estado incerto, política de canal, downgrade nem hash do controlador.

As flags de teste têm efeito restrito:

- `--nao-iniciar` instala e valida a configuração sem subir a pilha;
- `--pular-saude` não espera o health check e registra aviso;
- `--modo-teste` usa caminhos e nomes de projeto de teste, e é recusado em instalação real;
- `--autoteste` valida CLI, detecção, schema e estado sem alterar o host.

### situacao

O `situacao` é somente leitura. Ele mostra containers, saúde, versão instalada, canal, tag, commit, imagem, digest, idade do último backup confirmado, timers, agenda, espaço em disco e pendências do controlador.

O comando retorna 0 quando consegue produzir o relatório, mesmo que a instalação esteja degradada. O campo `ok` indica a saúde. A impossibilidade de consultar o Docker ou o estado produz `E_DOCKER` ou `E_VALIDACAO`.

### diagnosticar

O `diagnosticar` verifica dependências, portas 80 e 443, DNS, TLS, banco, migrações, saúde, backup, permissões, relógio, fuso, firewall, SELinux, AppArmor, timers e estado do controlador. Cada achado traz comando, código, dica e documentação.

O comando não altera o sistema. Avisos mantêm a saída 0. Falha crítica produz o código específico e a saída correspondente. É o comando indicado para suporte e para agentes de IA antes de uma atualização.

### atualizar

O `atualizar` aceita apenas os canais `release` e `main`. O canal `auto` do `atualizar.sh` não é exposto pelo instalador. A atualização:

1. confere o estado, o checkout, o canal e a tag alvo;
2. recusa árvore Git suja, estado divergente e downgrade sem autorização;
3. exige backup confirmado antes de aplicar, salvo decisão explícita de risco registrada;
4. valida a compatibilidade das migrações;
5. delega ao `atualizar.sh` com o modo correspondente;
6. confere a saúde e atualiza `instalacao.json`, `estado.json` e `ops.env`;
7. preserva a imagem anterior apenas para rollback de imagem, sem desfazer migração.

O backup é obrigatório no caminho simples e no controlador. A atualização automática por timer fica desabilitada por padrão e só é instalada com `--habilitar-atualizacoes`. Em modo não interativo, a aplicação exige `--sim`.

### backup

O `backup` chama a rotina existente, espera o recibo confirmado e atualiza o ponteiro do último backup. Ele aceita os modos `compose` e `url`, as cifras GPG e age, o destino rclone e a retenção configurada em [backup-servidor.md](backup-servidor.md).

O comando não publica recibo quando a geração, a cifra, o upload ou a verificação falham. A retenção preserva o mínimo de cópias confirmadas. Na cifra GPG, `--destinatario-gpg` é obrigatório; na cifra age, `--destinatarios-age` é obrigatório. O backup das planilhas continua no caminho rclone atual e não é movido para o Dropbox.

### restaurar

O `restaurar` aceita um arquivo local com `--arquivo` ou baixa a cópia remota com `--do-remoto`. Antes de qualquer operação destrutiva, ele confere o checksum, decifra em diretório privado, valida o dump e chama `restaurar.sh`.

A restauração preserva o banco anterior por padrão. A remoção do banco anterior é uma decisão posterior, depois da conferência de login, saúde e migrações. A falta de chave privada, checksum divergente ou dump incompatível produz `E_RESTAURACAO`.

### desinstalar

O `desinstalar` remove containers, redes, units, timers e linhas de cron criadas pelo instalador. Dados são preservados por padrão: volumes do banco, `/var/lib/frequenciapp`, `/var/backups/frequenciapp`, `/etc/frequenciapp` e os backups remotos.

A remoção de dados exige `--remover-dados` e `--sim`. Essa combinação é irreversível: remove os volumes do banco, `/var/lib/frequenciapp`, `/var/backups/frequenciapp` e `/etc/frequenciapp`, mas não remove backups remotos nem apaga a chave privada que estiver fora do servidor. O comando não desinstala Docker nem remove pacotes do sistema, para não afetar outras aplicações. O firewall não é alterado pelo `desinstalar`; as regras abertas pelo instalador devem ser revistas pelo operador.

### canal

O `canal` tem os subcomandos `mostrar` e `definir`.

```text
instalar.sh canal mostrar --json
instalar.sh canal definir release --tag vX.Y.Z --planejar
instalar.sh canal definir release --tag vX.Y.Z --aplicar --sim
instalar.sh canal definir main --permitir-instavel --planejar
```

Sem `--aplicar`, o comando grava apenas a preferência de canal no estado, sem alterar containers, imagem, ambiente ou dados. Com `--aplicar`, o instalador faz backup, valida a compatibilidade, executa `atualizar.sh` e atualiza o estado. Em modo não interativo, `--aplicar` exige `--sim`. O `--planejar` no `canal definir` produz o plano da troca e mantém a gravação da preferência, que é a única escrita permitida nesse modo.

O detalhamento de downgrade, compatibilidade e readoção do controlador está na seção [Canal release e main](#canal-release-e-main).

### versao

O `versao` mostra a versão do instalador, a versão do projeto, o schema do estado, o canal, a tag, o commit, a imagem e o digest. Com `--json`, a saída segue o contrato JSON com detecção básica de `/etc/os-release` e sem verificações de rede, Docker ou backup.

### esquema

O `esquema` escreve no stdout o JSON Schema da saída do instalador, em draft 2020-12. O schema é estático, tem `additionalProperties: false` e descreve todos os campos deste documento. O comando não altera o host.

## Flags

As flags de domínio são em português. As flags universais têm alias em inglês. `--json`, `--tag`, `--config` e `--ref` permanecem técnicos. `--image` e `--image-digest` permanecem técnicos e são aceitos ao lado de `--imagem` e `--imagem-digest`.

| Grupo           | Flags                                                                                                                                                                                                 | Uso                                                    |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Ajuda e versão  | `--ajuda`, `-h`, `--versao`                                                                                                                                                                           | Ajuda e versão do instalador                           |
| Perfil e origem | `--perfil`, `--canal`, `--tag`, `--ref`, `--diretorio-fonte`, `--imagem`, `--imagem-digest`                                                                                                           | Perfil, canal, tag, commit, fonte e imagem             |
| Proxy e TLS     | `--proxy`, `--tls`, `--dominio`, `--email-acme`, `--acme-staging`                                                                                                                                     | Caddy ou Nginx, TLS público ou interno                 |
| Contas e Google | `--email-admin`, `--arquivo-senha-admin`, `--email-coordenacao`, `--arquivo-senha-coordenacao`, `--arquivo-google`, `--pular-contas`, `--seed`                                                        | Contas iniciais e credencial do Google                 |
| Backup          | `--modo-backup`, `--criptografia`, `--destinatario-gpg`, `--destinatarios-age`, `--config-rclone`, `--destino`, `--retencao-dias`, `--retencao-minimo`, `--config-dropbox`, `--arquivo-token-dropbox` | Banco, cifra, transporte, retenção e Dropbox           |
| Agendador       | `--agendador`, `--fuso`, `--habilitar-atualizacoes`, `--canal-atualizacao`, `--ref-atualizacao`                                                                                                       | systemd, cron, fuso e atualização agendada             |
| Rede            | `--firewall`, `--porta-ssh`, `--porta-http`, `--porta-https`                                                                                                                                          | Firewall e portas públicas                             |
| Saída           | `--json`, `--relatorio`, `--arquivo-log`, `--sem-cor`, `--silencioso`, `--verboso`                                                                                                                    | Formato, relatório, log e verbosidade                  |
| Execução        | `--nao-interativo`, `--sim`, `--forcar`, `--retomar`, `--desde-etapa`, `--tempo-limite`, `--config`, `--salvar-config [arquivo]`                                                                      | Confirmação, retomada, tempo e configuração            |
| Teste           | `--autoteste`, `--nao-iniciar`, `--pular-saude`, `--modo-teste`                                                                                                                                       | Validação isolada e execução sem subir a pilha         |
| Canal e risco   | `--permitir-instavel`, `--permitir-downgrade`, `--permitir-migracoes`                                                                                                                                 | Uso consciente de `main`, descida e migração           |
| Pacotes         | `--forcar-pacotes`                                                                                                                                                                                    | Reinstalação explícita de pacote                       |
| Restauração     | `--do-remoto`, `--arquivo`                                                                                                                                                                            | Origem do dump                                         |
| Desinstalação   | `--remover-dados`                                                                                                                                                                                     | Remoção irreversível de dados                          |
| Compatibilidade | `--planejar`, `--aplicar`, `--simular`, `--sem-firewall`                                                                                                                                              | Subcomando alternativo, simulação e firewall desligado |

Valores aceitos: `--perfil` aceita `simples`, `controlador`, `dropbox` ou `completo`; `--canal` aceita `release` ou `main`; `--proxy` aceita `caddy` ou `nginx`; `--tls` aceita `acme` ou `interno`; `--agendador` aceita `auto`, `systemd` ou `cron`; `--modo-backup` aceita `compose` ou `url`; `--criptografia` aceita `gpg` ou `age`; `--firewall` aceita `auto`, `sim` ou `nao`, com padrão `nao`. O `--sem-firewall` equivale a `--firewall nao`. O `--dominio` é obrigatório nos dois modos de TLS e o `--email-acme` é obrigatório no modo `acme`. O `--pular-contas` deixa a criação das contas para o operador. O `--seed` cria massa sintética e não deve ser usado em produção. O `--acme-staging` usa a autoridade de teste.

Padrões: perfil `simples`, canal `release`, canal de atualização `release`, proxy `caddy`, TLS `acme`, agendador `auto`, atualização agendada desabilitada, modo de backup `compose`, criptografia `gpg`, retenção de 30 dias com mínimo de 5 cópias confirmadas, firewall `nao`, fuso `America/Fortaleza`, porta SSH 22, portas HTTP e HTTPS 80 e 443. O `--canal-atualizacao main` exige `--permitir-instavel`.

### Aliases

| Português          | Inglês              | Observação                                       |
| ------------------ | ------------------- | ------------------------------------------------ |
| `--ajuda`, `-h`    | `--help`            | Ajuda e exemplos                                 |
| `--versao`         | `--version`         | Versão do instalador e do projeto                |
| `--simular`        | `--dry-run`         | Não altera o host; equivale ao plano de execução |
| `--sim`            | `--yes`             | Confirma ações destrutivas                       |
| `--perfil`         | `--profile`         | Perfil de instalação                             |
| `--canal`          | `--channel`         | Canal de atualização                             |
| `--relatorio`      | `--report`          | Relatório legível ou JSON                        |
| `--nao-interativo` | `--non-interactive` | Falha em vez de perguntar                        |
| `--imagem`         | `--image`           | Imagem da aplicação                              |
| `--imagem-digest`  | `--image-digest`    | Digest imutável da imagem                        |

`--json`, `--tag`, `--config`, `--ref` e `--arquivo` são técnicos e não têm alias.

### Regras de precedência

1. Flags de linha de comando prevalecem sobre o arquivo de configuração.
2. O arquivo de configuração prevalece sobre os padrões do perfil.
3. A mesma flag repetida com o mesmo valor é idempotente. Valores diferentes produzem `E_USO`.
4. Flags de segredo aceitam apenas caminho de arquivo ou entrada padrão. Valor de segredo em `argv` é recusado.
5. `--json` desliga cor, barra de progresso e perguntas. Não implica `--sim`.
6. `--nao-interativo` sem `--sim` falha antes de ação destrutiva.
7. `--simular` e `--planejar` nunca executam ação que altere o host.
8. `--forcar` não substitui `--sim` e não ignora estado incerto, política de canal ou hash divergente.

### Arquivo de configuração

O `--config` aponta para um JSON com as chaves longas em camelCase. O padrão é `/etc/frequenciapp/instalador.json`, lido quando existe. O `--salvar-config [arquivo]` grava a configuração efetiva com modo 600, sem segredos, e só sobrescreve com `--forcar`. O diretório pai precisa existir; o `planejar` não cria `/etc/frequenciapp`. O `aplicar` grava uma cópia da configuração efetiva em `/etc/frequenciapp/instalador.json` depois de criar os diretórios de operação.

```json
{
  "perfil": "simples",
  "canal": "release",
  "tag": "v1.0.0",
  "dominio": "frequencia.exemplo.br",
  "emailAcme": "administracao@escola.exemplo.br",
  "proxy": "caddy",
  "tls": "acme",
  "agendador": "systemd",
  "modoBackup": "compose",
  "criptografia": "gpg"
}
```

Chaves desconhecidas produzem `E_USO`. O arquivo não aceita senha, token, chave privada nem URL com credencial: esses valores ficam nos arquivos indicados pelas flags `--arquivo-senha-*`, `--arquivo-token-dropbox` e `--config-rclone`.

## Contrato JSON

Com `--json`, o stdout contém um único documento JSON, sem texto de progresso. O stderr recebe diagnóstico, avisos e progresso. O `--silencioso` reduz o stderr a erros. O `--relatorio` grava uma cópia legível ou JSON, conforme a extensão, com modo 600.

### Chaves de topo

| Chave         | Tipo             | Uso                                                                                 |
| ------------- | ---------------- | ----------------------------------------------------------------------------------- |
| `schema`      | string           | Identificador do contrato, `frequenciapp.instalador/1`                              |
| `comando`     | string           | Comando executado, inclusive `canal mostrar` e `canal definir`                      |
| `ok`          | boolean          | `true` quando não há erro bloqueante                                                |
| `codigo`      | string ou null   | Primeiro código `E_*` que interrompeu a execução                                    |
| `dry_run`     | boolean          | `true` em `planejar`, `--simular` ou `canal definir --planejar`; `false` nos demais |
| `distro`      | string           | `ID` de `/etc/os-release`                                                           |
| `versao`      | objeto           | Versão do instalador e do projeto                                                   |
| `codename`    | string           | `VERSION_CODENAME` ou vazio                                                         |
| `familia`     | string           | `debian`, `rhel`, `fedora`, `arch`, `suse`, `alpine` ou `desconhecida`              |
| `tier`        | inteiro          | 1, 2 ou 3                                                                           |
| `arquitetura` | string           | `amd64`, `arm64`, `i386` ou o valor detectado                                       |
| `gerenciador` | string           | `apt`, `dnf`, `pacman`, `zypper` ou `apk`                                           |
| `iniciador`   | string           | `systemd`, `openrc` ou `desconhecido`                                               |
| `firewall`    | string           | `ufw`, `firewalld`, `nft` ou `nenhum`                                               |
| `selinux`     | string           | `enforcing`, `permissive`, `disabled` ou `ausente`                                  |
| `apparmor`    | string           | `enforcing`, `complain`, `disabled` ou `ausente`                                    |
| `canal`       | string           | `release` ou `main`                                                                 |
| `perfil`      | string           | `simples`, `controlador`, `dropbox` ou `completo`                                   |
| `tag`         | string           | Tag estável ou vazio no canal `main`                                                |
| `commit`      | string           | SHA completo do commit implantado                                                   |
| `imagem`      | string           | Referência da imagem, sem tag implícita                                             |
| `digest`      | string           | `sha256:` com 64 hexadecimais                                                       |
| `etapas`      | array            | Etapas executadas ou planejadas                                                     |
| `avisos`      | array            | Avisos não bloqueantes                                                              |
| `erros`       | array            | Erros com código, dica e documentação                                               |
| `proximos`    | array de strings | Comandos sugeridos e seguros para o próximo passo                                   |
| `relatorio`   | string ou null   | Caminho do relatório gravado                                                        |

`versao` tem as chaves `instalador` e `projeto`, ambas strings. `comando` aceita `planejar`, `aplicar`, `situacao`, `diagnosticar`, `atualizar`, `backup`, `restaurar`, `desinstalar`, `canal mostrar`, `canal definir`, `versao` e `esquema`.

### Etapas

Cada item de `etapas` tem as chaves abaixo. A ordem reflete a execução e os identificadores são estáveis.

| Chave      | Tipo           | Uso                                                                      |
| ---------- | -------------- | ------------------------------------------------------------------------ |
| `id`       | string         | Identificador da etapa, como `preflight` ou `migracoes`                  |
| `estado`   | string         | `pendente`, `executando`, `concluida`, `pulada`, `falhou` ou `bloqueada` |
| `inicio`   | string ou null | Início em ISO 8601 UTC                                                   |
| `fim`      | string ou null | Fim em ISO 8601 UTC                                                      |
| `codigo`   | string ou null | Código `E_*` da falha da etapa                                           |
| `acoes`    | array          | Ações previstas ou executadas                                            |
| `avisos`   | array          | Avisos da etapa                                                          |
| `detalhes` | objeto         | Dados estruturados da etapa, sempre redigidos                            |

Cada ação tem `descricao`, `comando` e `altera`. `descricao` é uma frase curta em português. `comando` é uma string ou null com o comando equivalente, já redigido. `altera` é booleano e indica se a ação modifica o host.

### Erros e avisos

Cada erro tem `codigo`, `mensagem`, `dica`, `comando` e `documentacao`. `comando` é uma sugestão segura e pode ser null. `documentacao` é um caminho relativo ou uma âncora deste documento. Nenhum erro expõe stack trace, SQL, caminho interno de biblioteca ou termo técnico sem tradução.

Cada aviso tem `codigo` opcional, `mensagem` e `documentacao`. Códigos `A_*` são informativos e podem ser acrescentados sem quebra de contrato. Códigos `E_*` são estáveis.

### Exemplo

```json
{
  "schema": "frequenciapp.instalador/1",
  "comando": "planejar",
  "ok": true,
  "codigo": null,
  "dry_run": true,
  "distro": "ubuntu",
  "versao": {
    "instalador": "1.0.0",
    "projeto": "1.0.0"
  },
  "codename": "resolute",
  "familia": "debian",
  "tier": 1,
  "arquitetura": "amd64",
  "gerenciador": "apt",
  "iniciador": "systemd",
  "firewall": "ufw",
  "selinux": "ausente",
  "apparmor": "enforcing",
  "canal": "release",
  "perfil": "simples",
  "tag": "v1.0.0",
  "commit": "0000000000000000000000000000000000000000",
  "imagem": "ghcr.io/eemtijca/frequenciapp",
  "digest": "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  "etapas": [
    {
      "id": "preflight",
      "estado": "concluida",
      "inicio": "2026-11-11T12:00:00Z",
      "fim": "2026-11-11T12:00:03Z",
      "codigo": null,
      "acoes": [
        {
          "descricao": "Confere distro, arquitetura e dependências",
          "comando": null,
          "altera": false
        }
      ],
      "avisos": [],
      "detalhes": {}
    }
  ],
  "avisos": [],
  "erros": [],
  "proximos": ["sudo ./instalar.sh aplicar --config /etc/frequenciapp/instalador.json --sim"],
  "relatorio": null
}
```

## Códigos de erro

Os códigos `E_*` são estáveis e aparecem em `codigo`, em `erros` e no relatório. A mensagem pode mudar, mas o código e o significado não.

| Código          | Uso                                                            | Saída padrão |
| --------------- | -------------------------------------------------------------- | ------------ |
| `E_USO`         | Flag ausente, conflito ou valor inválido                       | 2            |
| `E_DISTRO`      | Distro ou arquitetura não suportada                            | 3            |
| `E_PACOTE`      | Falha de pacote ou gerenciador                                 | 8            |
| `E_DOCKER`      | Docker ausente, parado ou sem permissão                        | 8 ou 5       |
| `E_COMPOSE`     | Compose ausente ou abaixo da versão mínima                     | 8            |
| `E_REDE`        | DNS, download, proxy ou porta                                  | 6            |
| `E_VALIDACAO`   | Pré-requisito, disco, memória, relógio, estado ou configuração | 4 ou 7       |
| `E_SAUDE`       | Aplicação, migração ou health check                            | 9            |
| `E_BACKUP`      | Backup, recibo ou retenção                                     | 10           |
| `E_RESTAURACAO` | Restauração, checksum ou banco anterior                        | 10           |
| `E_CONTROLADOR` | Perfil, journal, pin ou hash do migrador                       | 78           |
| `E_DROPBOX`     | Token, pasta, autoridade ou retenção                           | 10           |
| `E_CANAL`       | Canal, tag, downgrade ou migração incompatível                 | 78           |

A saída 4 é usada quando a falha é um pré-requisito do host detectado no `preflight`. A saída 7 é usada quando a falha é de configuração, estado ou validação. A saída 5 é usada quando `E_DOCKER` ou `E_VALIDACAO` decorre de permissão. A saída 78 é bloqueio de política, como downgrade recusado, `main` sem `--permitir-instavel` ou controlador que exige readoção.

## Códigos de saída

| Saída | Significado                                      |
| ----- | ------------------------------------------------ |
| 0     | Sucesso, inclusive segunda execução sem mudanças |
| 1     | Falha interna não classificada                   |
| 2     | Uso incorreto                                    |
| 3     | Distro ou arquitetura não suportada              |
| 4     | Pré-requisito ausente                            |
| 5     | Permissão negada                                 |
| 6     | Rede, DNS, proxy ou porta                        |
| 7     | Validação de configuração ou estado              |
| 8     | Pacotes, Docker ou Compose                       |
| 9     | Aplicação, migração ou saúde                     |
| 10    | Backup ou restauração                            |
| 78    | Bloqueio de política                             |
| 130   | Interrupção por SIGINT                           |
| 143   | Interrupção por SIGTERM                          |

A saída 130 ou 143 preserva o estado da etapa em andamento. A próxima execução com `--retomar` continua do ponto seguro. Um sinal não converte falha de validação em sucesso.

## Canal release e main

O canal `release` é o padrão de produção. Ele usa tag estável no formato `vX.Y.Z`, imagem publicada no GHCR e o perfil de migrador correspondente. O canal `main` é explícito, exige `--permitir-instavel` e é marcado como instável em `situacao` e `diagnosticar`. No canal `release`, `--tag` é obrigatório. No canal `main`, `--ref` aponta para branch ou commit, com padrão `main`, e `--tag` fica vazio.

O estado grava `canal`, `tag`, `commit`, `imagem`, `digest`, `schema`, `migradorSha256`, `instaladoEm` e `atualizadoEm`. O `estado.json` do `atualizar.sh` continua sendo do atualizador; o `instalacao.json` é do instalador. O instalador não sobrescreve o estado do atualizador.

### Troca de canal

```text
instalar.sh canal mostrar --json
instalar.sh canal definir release --tag v1.0.0 --planejar
instalar.sh canal definir release --tag v1.0.0 --aplicar --sim
instalar.sh canal definir main --permitir-instavel --planejar
```

Sem `--aplicar`, somente a preferência é gravada. A instalação em execução continua na versão anterior. Com `--aplicar`, a sequência é obrigatória:

1. backup confirmado do banco;
2. validação da tag, do commit, da imagem e do digest;
3. validação das migrações do alvo;
4. execução de `atualizar.sh` no modo correspondente;
5. conferência da saúde;
6. atualização de `instalacao.json`, `estado.json` e `ops.env`;
7. verificação do controlador, quando adotado.

A troca de `main` para `release` é permitida quando a tag contém o commit atual ou é descendente dele. A preferência registrada no estado é a intenção do próximo plano; a troca só é considerada aplicada depois da saúde e da atualização do estado.

### Downgrade

Downgrade é a tag cujo commit é ancestral do commit instalado. Também é tratado como downgrade o alvo sem relação de ancestralidade comprovada, porque não há como garantir a ordem das migrações.

O instalador recusa downgrade com `E_CANAL` e saída 78. A exceção exige `--permitir-downgrade`, backup confirmado e confirmação explícita. Mesmo com a flag, o instalador recusa quando:

- o release alvo não contém todas as migrações já aplicadas;
- o estado do banco é incerto;
- o backup não foi confirmado;
- o controlador está com journal incerto;
- a imagem ou o digest não são imutáveis.

Migração aplicada não é desfeita por downgrade de imagem. A recuperação do banco usa o backup anterior e `restaurar.sh`. A decisão de downgrade e o recibo usado ficam registrados no relatório e no log.

### Migrações incompatíveis

Se o release alvo não contiver as migrações atuais, a troca espera um release compatível ou exige a restauração do backup anterior. O instalador não aplica a imagem antiga sobre um banco migrado e não remove migração do banco.

O `--permitir-migracoes` confirma a aplicação de migrações novas em `atualizar`, mas não autoriza downgrade nem ignorar a ordem. A compatibilidade é conferida pelo histórico de migrações do alvo, pelo schema do banco e pelo `migradorSha256`.

### Controlador

O controlador é opt-in e não bloqueia o perfil simples. Quando adotado, o estado do instalador registra `controlador.adotado`, `controlador.migradorSha256` e `controlador.readocaoPendente`.

Uma troca de canal que muda o `migradorSha256` invalida o marcador do controlador. O controlador fica parado, o journal e os pins são preservados e `situacao` e `diagnosticar` mostram `E_CONTROLADOR`. A readoção é feita com `aplicar --perfil controlador`, depois de:

1. confirmar que o journal não tem operação incerta;
2. confirmar o backup e o recibo;
3. validar o novo hash do migrador;
4. revisar os pins do release alvo;
5. reativar a entrada estável do agendador.

O `--forcar` não dispensa a readoção e não ignora journal incerto. O controlador é proteção cooperativa, não barreira contra root, DBA ou acesso direto ao daemon do Docker.

## Auditoria de pacotes

O `planejar` e o `diagnosticar` verificam, sem alterar:

- `bash`, `curl`, `ca-certificates`, `git`, `jq`, `openssl`, `gpg`, `age`, `rclone`, `tar`, `gzip`, `flock` e `sha256sum`;
- `docker`, `docker info`, `docker compose version`, serviço `docker` e grupo `docker`;
- `systemctl`, `timedatectl` e `journalctl`;
- `psql`, `pg_dump` e `pg_restore` 17, somente no modo URL;
- `ufw`, `firewall-cmd`, `nft`, SELinux e AppArmor;
- portas 80 e 443, DNS, relógio, disco, memória e fuso;
- instalação existente, `instalacao.json`, containers, volumes, perfil do controlador, Dropbox e `rclone.conf`;
- permissões de `app.env`, `ops.env` e arquivos de conta.

O plano mostra uma tabela estável:

```text
pacote       presente  versao    acao
docker       sim       29.8.2    nenhuma
compose      sim       5.6.0     nenhuma
jq           nao                 instalar
age          nao                 instalar
rclone       sim       1.72.0    nenhuma
```

A verificação usa `command -v`, `dpkg -s`, `rpm -q`, `pacman -Q`, `zypper se -i` e `apk info -e`. O `aplicar` instala apenas o que falta ou está abaixo da versão mínima. Não faz upgrade geral. O `--forcar-pacotes` existe somente para reinstalação explícita e registra a decisão no relatório e no log.

Docker instalado e suficiente não é reinstalado. O Compose precisa ser 2.24 ou superior. Se o pacote da distro for usado como fallback, o instalador exige `docker compose` 2.24 ou superior e valida o comando antes de seguir.

## Estado, idempotência e retomada

### Estado durável

O estado fica em `/var/lib/frequenciapp/instalacao.json`, modo 600, sem segredos. A escrita é atômica: arquivo temporário no mesmo diretório, `fsync`, `rename` e conferência de proprietário e modo.

```json
{
  "schema": "frequenciapp.instalacao/1",
  "instaladoEm": "2026-11-11T12:00:00Z",
  "atualizadoEm": "2026-11-11T12:10:00Z",
  "perfil": "simples",
  "canal": "release",
  "tag": "v1.0.0",
  "commit": "0000000000000000000000000000000000000000",
  "imagem": "ghcr.io/eemtijca/frequenciapp",
  "digest": "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  "migradorSha256": "0000000000000000000000000000000000000000000000000000000000000000",
  "etapas": [],
  "controlador": {
    "adotado": false,
    "migradorSha256": null,
    "readocaoPendente": false
  },
  "backup": {
    "ultimoRecibo": null,
    "verificadoEm": null
  },
  "origem": {
    "repositorio": "https://github.com/eemtijca/frequenciapp",
    "diretorioFonte": "/opt/frequenciapp"
  }
}
```

O estado não guarda senha, token, chave, URL com credencial nem conteúdo de `app.env` ou `ops.env`. O campo `schema` identifica a versão do formato do próprio estado; a compatibilidade do banco é conferida pelo histórico de migrações e por `migradorSha256`. O ponteiro do último backup continua em `/var/lib/frequenciapp/ultimo-backup.json`, de propriedade da rotina de backup.

### Idempotência

A segunda execução do mesmo plano termina com `sem mudanças`, `ok: true` e saída 0. O instalador não reinstala pacote presente, não recria usuário, não sobrescreve arquivo de ambiente igual, não recria container saudável e não reaplica migração concluída.

Se houver divergência, o plano mostra a diferença e o `aplicar` corrige apenas o necessário. O `--forcar-pacotes` é a única exceção para reinstalação de pacote. O `--forcar` por etapa não altera a regra de idempotência das etapas não selecionadas.

### Retomada

O estado registra a etapa em execução, o horário de início, o código da falha e as ações concluídas. As formas de retomada são:

```text
instalar.sh aplicar --retomar
instalar.sh aplicar --desde-etapa migracoes
instalar.sh aplicar --retomar --desde-etapa saude
```

O `--retomar` continua da primeira etapa não concluída. O `--desde-etapa` começa na etapa indicada e revalida as anteriores sem executá-las. O `--forcar` repete a etapa selecionada ou todas as etapas a partir dela.

Estado corrompido, etapa desconhecida ou estado de instalação divergente produzem `E_VALIDACAO`. O `--forcar` não transforma estado incerto em estado válido. A correção exige inspeção manual, restauração do estado a partir do backup ou nova instalação em diretório limpo.

### Trava

A trava fica em `/var/lock/frequenciapp/instalador.lock`, modo 600, e usa `flock` exclusivo. O instalador espera até 30 segundos; se a trava continuar ocupada, retorna `E_VALIDACAO` com a etapa e o processo que detém o arquivo.

A trava é local ao host, não distribuída. Ela serializa `aplicar`, `atualizar`, `backup`, `restaurar`, `desinstalar` e `canal definir --aplicar`. Projetos Compose independentes usam travas próprias quando a identidade operacional estiver configurada. Um processo filho legítimo pode herdar o descritor, e a revalidação confere se ele aponta para a trava do mesmo projeto.

### Retentativas e tempo limite

Rede, gerenciador de pacotes e saúde têm retentativa com espera exponencial. O padrão é de três tentativas para rede e pacotes, com espera de 5, 15 e 45 segundos. A saúde é consultada a cada 5 segundos até o limite da etapa.

Validação, uso incorreto, política, segredo ausente e checksum divergente não são repetidos. Uma retentativa não apaga o estado da tentativa anterior.

O `--tempo-limite` aceita segundos ou sufixos `s`, `m` e `h`. O padrão global é 7200 segundos e cada etapa tem o limite da tabela de `aplicar`. O menor valor entre o limite global e o limite da etapa prevalece. O estouro produz `E_VALIDACAO`, preserva o estado e encerra o grupo de processos da etapa.

### Redação de segredos

O instalador redige antes de gravar ou imprimir:

- valores de `AUTH_SECRET`, `CRON_SECRET`, `POSTGRES_PASSWORD` e variáveis com `SENHA`, `SECRET`, `TOKEN` ou `KEY` no nome;
- usuário e senha embutidos em `DATABASE_URL`, `DIRECT_URL` e `BACKUP_DATABASE_URL`;
- cabeçalhos `Authorization` e `Cookie`;
- conteúdo de `rclone.conf`, chaves GPG e age e tokens do Dropbox;
- arquivos de senha de administração e coordenação.

O marcador é `[REDIGIDO]`. Nenhum processo filho recebe segredo em `argv`. A redação cobre stdout, stderr, `--json`, `--relatorio`, `--arquivo-log`, estado e nome de etapa. O log padrão é `/var/log/frequenciapp/instalador.log`, modo 600, para comandos que alteram o sistema. `planejar`, `situacao`, `diagnosticar`, `versao` e `esquema` só gravam log quando `--arquivo-log` é informado.

Segredos entram por arquivo 600 ou entrada padrão. `AUTH_SECRET` e a senha do banco são gerados quando ausentes. Senhas administrativas são lidas uma vez do arquivo indicado ou geradas e gravadas em arquivo 600, e não são copiadas para o estado. O arquivo de senha deve ser removido depois da criação das contas.

## Matriz de distribuições e repositórios

### Tiers

| Tier | Distribuições                                                                                                          | Tratamento                           |
| ---- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 1    | Ubuntu 22.04, 24.04 e 26.04; Debian 12 e 13; RHEL, Rocky e Alma 9 e 10; Fedora atual; Arch; openSUSE Leap e Tumbleweed | Plano e aplicação testados em Docker |
| 2    | Amazon Linux 2023, Oracle Linux 9 e 10, CentOS Stream, Alpine 3.20 ou superior, Raspberry Pi OS 64 bits                | Melhor esforço, com aviso e fallback |
| 3    | 32 bits, sem Bash, WSL, macOS, Windows, sem Docker                                                                     | Recusa com `E_DISTRO`                |

### Famílias, pacotes e repositórios

| Família           | Gerenciador | Docker                                                                                                                  | Base                                                                             | Backup                                                                            | Agendador                                              |
| ----------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Debian e Ubuntu   | `apt`       | `docker-ce`, `docker-ce-cli`, `containerd.io`, `docker-buildx-plugin`, `docker-compose-plugin` pelo repositório oficial | `ca-certificates`, `curl`, `gnupg`, `git`, `jq`, `openssl`                       | `age`, `rclone`; `postgresql-client-17` pelo PGDG quando o modo URL exigir        | `systemd`; `cron` no fallback                          |
| RHEL, Rocky, Alma | `dnf`       | `dnf-plugins-core`, repositório `rhel` ou `centos`, os mesmos pacotes Docker                                            | `ca-certificates`, `curl`, `gnupg2`, `git`, `jq`, `openssl`                      | `age`, `rclone`, com EPEL quando necessário; `postgresql17` pelo PGDG no modo URL | `systemd`; `cronie` no fallback                        |
| Fedora            | `dnf`       | repositório `fedora`, os mesmos pacotes Docker                                                                          | `ca-certificates`, `curl`, `gnupg2`, `git`, `jq`, `openssl`                      | `age`, `rclone`                                                                   | `systemd`; `cronie` no fallback                        |
| Arch              | `pacman`    | `docker` e `docker-compose` pelo repositório da distro                                                                  | `ca-certificates`, `curl`, `gnupg`, `git`, `jq`, `openssl`                       | `age`, `rclone`                                                                   | `systemd`; exigir sistema atualizado                   |
| openSUSE          | `zypper`    | `docker` e `docker-compose`                                                                                             | `ca-certificates`, `curl`, `gpg2`, `git`, `jq`, `openssl`                        | `age`, `rclone`                                                                   | `systemd`; `cron` no fallback                          |
| Alpine            | `apk`       | `docker` e `docker-cli-compose`; OpenRC                                                                                 | `bash`, `ca-certificates`, `curl`, `gnupg`, `git`, `jq`, `openssl`, `util-linux` | `age`, `rclone`                                                                   | `cron` ou `dcron`; sem systemd; somente perfil simples |
| Amazon e Oracle   | `dnf`       | repositório `centos` ou `rhel`, com validação de versão                                                                 | `ca-certificates`, `curl`, `gnupg2`, `git`, `jq`, `openssl`                      | `age`, `rclone`, com EPEL quando necessário                                       | `systemd`; `cronie` no fallback                        |

### Regras de repositório

- Docker oficial em Ubuntu, Debian, RHEL, Rocky, Alma, Fedora, Amazon Linux e Oracle. A chave é instalada em keyring com `signed-by` ou em repositório RPM oficial.
- O codename do Ubuntu 26.04 é `resolute` e o repositório oficial da Docker publica essa release. Se o codename não existir, o instalador tenta o codename LTS anterior apenas com aviso e valida a versão do Compose.
- O `docker.io` da distro não é o caminho padrão. Se o pacote da distro for usado como fallback, o instalador exige `docker compose` 2.24 ou superior.
- O Docker 29 no Ubuntu 26.04 usa cgroup v2 e containerd image store. O instalador não habilita nftables experimental sem decisão explícita.
- O PostgreSQL 17 não é padrão no Ubuntu 26.04. O cliente 17 vem do PGDG `resolute` e só é instalado quando o modo URL exigir. O banco do Compose continua na imagem 17.
- O `age` e o `rclone` podem exigir EPEL em RHEL, Rocky, Alma e Oracle.
- O `cron` pode não estar instalado no Ubuntu 26.04. O padrão é systemd timer. O cron só é instalado com `--agendador cron`.
- O SELinux em RHEL, Rocky, Alma e Fedora exige labels nos volumes. O instalador usa `:Z` ou uma sobreposição de Compose. Nunca desliga o SELinux.
- O AppArmor em Ubuntu e Debian é preservado.
- O firewall não é alterado sem `--sim`. O Compose publica apenas 80 e 443 pelo proxy.
- O instalador não mistura repositórios da distro com repositórios oficiais para o mesmo pacote. Se o Docker da distro estiver instalado e suficiente, ele é preservado.
- O instalador não usa `get.docker.com` no caminho padrão.

## Exemplos

### Ubuntu 26.04

Pré-requisitos: VPS com Ubuntu 26.04, DNS do domínio apontando para o IP, portas 80 e 443 liberadas no provedor e uma conta com `sudo`.

```bash
sudo apt-get update
sudo apt-get install -y git
sudo git clone https://github.com/eemtijca/frequenciapp.git /opt/frequenciapp
cd /opt/frequenciapp
```

Gravar a senha inicial de administração em um arquivo com modo 600, por exemplo `/root/senha-admin`, sem usar a linha de comando para o valor. O mesmo vale para a coordenação.

```bash
sudo ./instalar.sh planejar \
  --perfil simples \
  --canal release \
  --tag v1.0.0 \
  --dominio frequencia.exemplo.br \
  --email-acme administracao@escola.exemplo.br \
  --proxy caddy \
  --tls acme \
  --arquivo-senha-admin /root/senha-admin \
  --salvar-config /root/instalador.json \
  --json
```

Conferir o plano, os avisos e os códigos. Aplicar com a configuração gravada:

```bash
sudo ./instalar.sh aplicar \
  --config /root/instalador.json \
  --sim
```

O `aplicar` grava a configuração efetiva em `/etc/frequenciapp/instalador.json`, sem segredos. As execuções seguintes podem usar o caminho padrão.

Conferir a instalação:

```bash
sudo ./instalar.sh situacao --json
sudo ./instalar.sh diagnosticar --json
curl -fsS https://frequencia.exemplo.br/api/saude
```

Atualizar e fazer backup:

```bash
sudo ./instalar.sh atualizar --canal release --tag v1.0.1 --sim
sudo ./instalar.sh backup
```

A tag `v1.0.0` é ilustrativa. Usar a tag estável publicada no momento da instalação. O `--seed` não entra no caminho de produção, porque cria massa sintética.

### Rocky Linux 9

O fluxo é o mesmo, com as diferenças de gerenciador, SELinux e firewall. O Docker vem do repositório oficial `centos`, o SELinux permanece em `enforcing`, o firewall detectado é o `firewalld` e a alteração só ocorre com consentimento.

```bash
sudo dnf install -y git
sudo git clone https://github.com/eemtijca/frequenciapp.git /opt/frequenciapp
cd /opt/frequenciapp
sudo ./instalar.sh planejar \
  --perfil simples \
  --canal release \
  --tag v1.0.0 \
  --dominio frequencia.exemplo.br \
  --email-acme administracao@escola.exemplo.br \
  --proxy caddy \
  --tls acme \
  --agendador systemd \
  --firewall sim \
  --arquivo-senha-admin /root/senha-admin \
  --salvar-config /root/instalador.json \
  --json
sudo ./instalar.sh aplicar \
  --config /root/instalador.json \
  --sim
```

Se `age` ou `rclone` não estiverem disponíveis, o instalador habilita o EPEL quando necessário e registra a origem do pacote no plano. O cliente PostgreSQL 17 só é instalado no modo URL.

### Transição de main para release

Uma instalação que nasceu na `main` pode migrar para tags estáveis. A preferência é gravada no plano e a aplicação exige backup, compatibilidade e confirmação.

```bash
sudo ./instalar.sh canal definir release --tag v1.0.0 --planejar
sudo ./instalar.sh canal definir release --tag v1.0.0 --aplicar --sim
sudo ./instalar.sh situacao --json
```

Se o controlador estiver adotado e o `migradorSha256` mudar, a troca termina com o controlador parado e `readocaoPendente: true`. A readoção usa `sudo ./instalar.sh aplicar --perfil controlador --sim`, depois da revisão do journal e dos pins.

## Para agentes de IA

O instalador é feito para uso não interativo e para leitura por máquina. As regras abaixo evitam decisões destrutivas sem revisão humana.

1. Ler `instalar.sh versao --json` e `instalar.sh esquema` para confirmar a versão do contrato.
2. Executar `planejar --json --nao-interativo` e tratar a saída como única fonte de verdade.
3. Conferir `ok`, `codigo`, `erros`, `avisos` e `etapas`. Não interpretar texto humano.
4. Usar `--simular` para pré-visualizar uma ação mutável sem executá-la.
5. Pedir aprovação humana explícita antes de `aplicar`, `atualizar`, `restaurar`, `desinstalar` ou `canal definir --aplicar`.
6. Nunca inserir senha, token, chave ou URL com credencial em prompt, argumento, log ou mensagem.
7. Preparar arquivos de segredo com modo 600 fora do agente e passar apenas o caminho.
8. Não usar `--forcar` para contornar bloqueio de política, estado incerto, downgrade ou readoção do controlador.
9. Após uma falha, executar `diagnosticar --json` e seguir `proximos` e `dica`. Não repetir a mesma ação sem mudança de causa.
10. Confirmar a saída 0 e `ok: true` antes de considerar a operação concluída.

Sequência mínima para um agente em ambiente já preparado:

```bash
sudo ./instalar.sh planejar --config /etc/frequenciapp/instalador.json --json --nao-interativo
sudo ./instalar.sh aplicar --config /etc/frequenciapp/instalador.json --json --nao-interativo --sim
sudo ./instalar.sh diagnosticar --config /etc/frequenciapp/instalador.json --json --nao-interativo
```

O `--json` não confirma nada e não substitui `--sim`. O `--nao-interativo` falha com `E_USO` quando falta confirmação. O `--modo-teste` é restrito a Docker e não deve ser usado em VPS real.

Tabela de reação a códigos:

| Código          | Ação do agente                                                       |
| --------------- | -------------------------------------------------------------------- |
| `E_USO`         | Corrigir flags ou configuração e repetir o plano                     |
| `E_DISTRO`      | Parar e relatar a distro ou arquitetura não suportada                |
| `E_PACOTE`      | Ler o pacote e o repositório no plano; não forçar upgrade geral      |
| `E_DOCKER`      | Conferir serviço, grupo e permissão; não reinstalar sem necessidade  |
| `E_COMPOSE`     | Atualizar o Compose para 2.24 ou superior                            |
| `E_REDE`        | Conferir DNS, porta, proxy e conectividade                           |
| `E_VALIDACAO`   | Corrigir pré-requisito ou configuração; não usar `--forcar`          |
| `E_SAUDE`       | Executar `diagnosticar`; preservar estado e logs                     |
| `E_BACKUP`      | Corrigir cifra, chave, espaço ou destino; não atualizar sem recibo   |
| `E_RESTAURACAO` | Não repetir sobre o banco em uso; conferir checksum e banco anterior |
| `E_CONTROLADOR` | Parar o controlador e pedir readoção revisada                        |
| `E_DROPBOX`     | Conferir token, pasta, remote e retenção                             |
| `E_CANAL`       | Não forçar downgrade; revisar tag, commit e migrações                |

## Segurança

- O `aplicar`, o `atualizar` e o `desinstalar` exigem root ou uma conta com `sudo`. O `backup` e o `restaurar` rodam com a conta de implantação e usam privilégio apenas quando a operação exigir. O `planejar` e o `diagnosticar` podem rodar sem root, com avisos sobre verificações que exigem privilégio.
- O grupo `docker` é equivalente a root. O instalador não promete isolamento contra quem controla o daemon, o banco ou a conta de root.
- O controlador é proteção cooperativa. Ele reduz erro operacional e preserva journal e pins, mas não impede root, DBA ou acesso direto ao Docker.
- `AUTH_SECRET` tem pelo menos 32 caracteres e é gerado ou lido de arquivo. A senha do banco é gerada. Senhas administrativas vêm de arquivo 600, entrada padrão ou são geradas e gravadas em arquivo 600 fora do estado.
- Nenhum segredo entra em `argv`, log, JSON, relatório, estado ou commit. A redação é aplicada antes de qualquer escrita.
- O Compose publica apenas 80 e 443 pelo proxy. Aplicação e banco ficam internos. `PERMITIR_HTTP=false` é o padrão com TLS.
- O firewall não é alterado sem `--sim`. As portas padrão são 22, 80 e 443. O instalador não abre porta de banco nem de aplicação.
- SELinux é preservado, com labels nos volumes. AppArmor é preservado. O instalador não desliga nenhum dos dois para contornar falha.
- A chave pública GPG ou age pode ficar no servidor. A chave privada fica fora, em cofre ou gerenciador de senhas. A perda da chave privada torna as cópias irrecuperáveis.
- O rclone usa credenciais restritas e arquivo 600. O token do Dropbox tem escopo mínimo e fica em arquivo privado.
- A imagem é referenciada por tag e digest. A release usa tag imutável. O bootstrap do Node usa o tarball oficial com SHA-256, sem `curl | sh`.
- Nenhum teste usa dados reais, domínio real ou credencial real. As suítes usam prefixos `QA` e `E2E` e massa própria.

## Limites

| Limite                            | Consequência                                                            |
| --------------------------------- | ----------------------------------------------------------------------- |
| Não é ferramenta de hardening     | Não substitui CIS, auditoria de host, antivírus ou gestão de patches    |
| Não é alta disponibilidade        | Um VPS, um banco e um proxy; não há failover automático                 |
| Não faz atualização sem janela    | A atualização reinicia a aplicação e pode haver indisponibilidade curta |
| Não desfaz migração               | Rollback de imagem não reverte SQL aplicado; a recuperação usa backup   |
| Não gerencia DNS                  | Confere registros, mas não cria nem altera zona no provedor             |
| Não configura Vercel nem GitHub   | Não cria projeto, release, variável, workflow ou domínio                |
| Não é gerenciador de segredos     | Lê arquivos 600 e entrada padrão; a custódia fica com a escola          |
| Não instala Kubernetes            | O chart Helm tem caminho próprio em [kubernetes.md](kubernetes.md)      |
| Não suporta Windows, macOS ou WSL | Recusa com `E_DISTRO`; o teste também não roda em WSL                   |
| Não suporta 32 bits               | Recusa com `E_DISTRO`                                                   |
| Tier 2 é melhor esforço           | Pode exigir ajuste manual e não tem a mesma matriz de teste             |
| Não remove dados por padrão       | `desinstalar` preserva volumes, configuração e backups                  |
| Não protege contra root           | Root, DBA e o grupo `docker` podem ignorar o controlador e o estado     |

O instalador não configura a Vercel nem o GitHub sozinho. Ele pode mostrar os comandos `gh variable set` e as opções da Vercel no relatório, mas a execução é do operador. A Vercel não é destino de produção deste contrato. O deploy de nuvem continua documentado em [deploy.md](deploy.md).

## Testes em Docker

Nenhum teste do instalador roda no Windows, no WSL ou diretamente no host. A matriz usa Docker, worktree em LF e imagens oficiais. As evidências registram imagem, comando, código de saída e caminho do log.

### Matriz de plano

```bash
docker run --rm \
  -v "$PWD:/work:ro" \
  -w /work \
  ubuntu:26.04 \
  bash -lc 'bash instalar.sh planejar --json --nao-interativo'
```

Imagens Tier 1:

```text
ubuntu:22.04
ubuntu:24.04
ubuntu:26.04
debian:12
debian:13
rockylinux:9
almalinux:9
fedora:latest
archlinux:latest
opensuse/leap:15.6
```

Imagens Tier 2:

```text
amazonlinux:2023
alpine:3.22
```

No Alpine, o próprio teste instala `bash` e `curl` antes de chamar o instalador. O `planejar` não altera o sistema do contêiner; a montagem read-only comprova a ausência de escrita no worktree.

### Aplicação e systemd

O subconjunto de `aplicar` usa um contêiner privilegiado com systemd, nome de projeto exclusivo, `--modo-teste`, `--agendador systemd`, `--firewall nao` e massa sintética. O teste valida units, timers, saúde e segunda execução sem mudanças.

```bash
docker run --rm --privileged --cgroupns=host \
  -v /sys/fs/cgroup:/sys/fs/cgroup:rw \
  -v "$PWD:/work" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -w /work \
  <imagem-systemd> /sbin/init
```

O systemd em contêiner valida units e timers, mas não substitui o ensaio em VPS. A limpeza remove apenas containers, redes e volumes do projeto da tarefa. Nunca usar `docker system prune` ou `docker volume prune`.

### Testes unitários

Os testes ficam em `tests/instalador/` e cobrem:

- detecção de distro, arquitetura, gerenciador, iniciador, firewall, SELinux e AppArmor;
- auditoria de pacote presente, versão suficiente e versão antiga;
- Docker instalado, parado, sem permissão e com Compose antigo;
- flags, precedência, configuração e códigos de uso;
- JSON válido, schema, redação e ausência de segredo;
- estado 600, escrita atômica, trava e segunda leitura;
- segunda execução sem mudanças;
- falha no meio do `aplicar` seguida de `--retomar`;
- porta ocupada, DNS inválido, disco insuficiente, backup falhando e saúde falhando;
- troca de `main` para `release`, downgrade recusado e hash do migrador divergente;
- perfis `simples`, `controlador`, `dropbox` e `completo`;
- matriz de plano em todas as distros Tier 1 e subconjunto de aplicação com systemd.

O workflow `instalador.yml` separa detecção e plano, aplicação simples, canal, systemd e matriz. A suíte de qualidade do repositório continua rodando formatação, lint, tipos e unidade. O instalador não depende de `pnpm` no host de produção.

## Referências

- [ADR-076: instalador cross-distro](adr/076-instalador-cross-distro.md)
- [ADR-077: canais de atualização](adr/077-canais-de-atualizacao.md)
- [Auto-hospedagem](auto-hospedagem.md)
- [Backup do servidor](backup-servidor.md)
- [Operação](operacao.md)
- [Ambiente](ambiente.md)
- [Testes](testes.md)
- [Deploy](deploy.md)
