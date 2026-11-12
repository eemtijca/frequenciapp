# ADR-076: instalador cross-distro com bootstrap Bash e CLI Node

## Estado

Aceita em 2026-11-11. Implementação nas tarefas P4.2 a P4.9 do plano mestre.

## Contexto

A auto-hospedagem da [ADR-064](064-auto-hospedagem-servidor.md) e da [ADR-065](065-atualizacao-e-recuperacao-verificaveis.md) entrega scripts para Compose, proxy, backup, restauração e atualização. A preparação do servidor, porém, continuava manual e concentrada em Ubuntu. Cada escola precisava instalar Docker, Compose, Node, `jq`, `git`, `rclone`, `age` ou GPG, criar usuário, diretórios, arquivos de ambiente e rotinas sem uma sequência verificável.

O ciclo exige um instalador que atenda a escola em Ubuntu 26.04 e não feche as portas para Debian, RHEL, Rocky, Alma, Fedora, Arch, openSUSE e distribuições Tier 2. A operação também precisa ser usada por agentes de IA, com saída JSON, códigos estáveis, estado durável, idempotência e retomada.

As decisões consolidadas D10 a D14 do plano fixam o desenho: bootstrap Bash e CLI Node sem dependências externas, interface em português com aliases em inglês, Tier 1 testado e Tier 2 em melhor esforço, systemd como agendador padrão e Docker do repositório oficial com fallback para o pacote da distro. O instalador não pode usar `get.docker.com` no caminho padrão, não pode fazer upgrade geral e não pode rodar teste em WSL.

## Decisão

### Entry point e bootstrap

- O entry point é `instalar.sh`, um bootstrap Bash pequeno com `set -Eeuo pipefail`, `umask 077`, `flock` e `trap` de limpeza.
- O bootstrap detecta o host, instala apenas os utilitários mínimos que faltam e garante um runtime Node 24 privado quando necessário.
- O Node 24 vem do tarball oficial, com conferência de SHA-256, extração em diretório do instalador e uso por caminho absoluto. Não há `curl | sh`, não há alteração do Node do sistema e não há dependência de npm.
- A CLI interna fica em `scripts/instalador/` e usa ESM sem dependências externas. Os módulos separam CLI, detecção, pacotes, plano, estado, JSON, redação, execução, canal e passos.
- O bootstrap não contém a lógica de instalação. Ele apenas prepara o ambiente para a CLI e repassa os argumentos.

### Detecção e matriz

- A detecção lê `/etc/os-release`, `ID`, `VERSION_ID`, `ID_LIKE` e `VERSION_CODENAME`, além de arquitetura, gerenciador de pacotes, iniciador, firewall, SELinux, AppArmor, Docker, Compose e instalação existente.
- As famílias reconhecidas são Debian e Ubuntu, RHEL e derivados, Fedora, Arch, openSUSE e Alpine. Os gerenciadores são `apt`, `dnf`, `pacman`, `zypper` e `apk`.
- As distribuições são classificadas em Tier 1, Tier 2 e Tier 3. Tier 1 tem plano e aplicação testados em Docker; Tier 2 tem melhor esforço com aviso; Tier 3 é recusado com `E_DISTRO`.
- O Docker vem do repositório oficial quando disponível. O pacote da distro é fallback e exige `docker compose` 2.24 ou superior. O instalador não mistura repositórios para o mesmo pacote e não reinstala Docker suficiente.
- O instalador instala somente pacotes ausentes ou abaixo da versão mínima. Não faz upgrade geral. O `--forcar-pacotes` existe apenas para reinstalação explícita.
- SELinux é preservado, com labels nos volumes. AppArmor é preservado. O firewall não é alterado sem `--sim`.
- O agendador padrão é systemd. Cron ou OpenRC entram como fallback quando a distribuição não tem systemd. O fuso é conferido antes de agendar.

### Perfis e orquestração

- O perfil `simples` é o padrão. Os perfis `controlador`, `dropbox` e `completo` são opt-in e não podem ser obrigatórios.
- O instalador orquestra os scripts existentes de Compose, identidade, backup, restauração, atualização e rotinas. Não reimplementa essas operações.
- O perfil simples não depende de artefato do controlador. O controlador só é criado depois da adoção explícita.
- A ordem das etapas é fixa por perfil. O perfil simples executa 16 etapas. O perfil Dropbox insere a etapa `dropbox` antes de `backup-inicial`. O perfil controlador pula o `agendador` e executa `controlador` depois de `firewall`. O perfil completo combina as duas alterações.
- O perfil controlador exige `--operador-controlador` e instala as rotinas estáveis em cron. A readoção após troca de canal arquiva o prefixo e o cron anteriores antes da nova confirmação.
- O perfil Dropbox exige adoção, token, `rclone.conf` e destino iguais à pasta adotada. O upload continua no rclone, a verificação nativa fica no backup e as planilhas permanecem no caminho rclone.
- A instalação é dividida em etapas com identificadores estáveis. Cada etapa tem limite de tempo, ações previstas, avisos e detalhes.

### Estado e execução

- O estado fica em `/var/lib/frequenciapp/instalacao.json`, modo 600, com escrita atômica por temporário, `fsync` e `rename`.
- O estado guarda perfil, canal, tag, commit, imagem, digest, schema, hashes, etapas, versões e ponteiros de backup. Não guarda segredo.
- A trava fica em `/var/lock/frequenciapp/instalador.lock`, modo 600, com `flock` exclusivo. A trava é local ao host.
- A segunda execução do mesmo plano termina sem mudanças e com saída 0.
- O `--retomar`, o `--desde-etapa` e o `--forcar` retomam a execução sem limpeza destrutiva.
- Rede, gerenciador de pacotes e saúde têm retentativa com espera exponencial. Validação, política e segredo ausente não são repetidos.
- O `--tempo-limite` vale por etapa e globalmente. O estouro preserva o estado.
- Nenhum processo filho recebe segredo em `argv`. A redação remove segredos de stdout, stderr, JSON, relatório, log e estado.

### Interface e contrato

- Comandos, flags de domínio, mensagens, ajuda, relatórios e documentação são em português.
- As flags universais têm aliases em inglês: `--help`, `--version`, `--dry-run`, `--yes`, `--profile`, `--channel`, `--report` e `--non-interactive`.
- `--json`, `--tag`, `--image`, `--image-digest` e `--config` permanecem técnicos.
- A saída JSON segue `frequenciapp.instalador/1`, com chaves em português, `additionalProperties: false` e códigos `E_*` estáveis.
- As saídas de processo distinguem uso, distro, pré-requisito, permissão, rede, validação, pacotes, saúde, backup, política e sinal.

### Testes

- Toda validação roda em Docker, com worktree em LF e evidência de imagem, comando, código e log.
- A matriz de `planejar` cobre todas as distros Tier 1 e um subconjunto Tier 2.
- O subconjunto de `aplicar` usa systemd em contêiner privilegiado, nome de projeto exclusivo, `--modo-teste` e massa sintética.
- Testes unitários cobrem detecção, pacotes, flags, JSON, estado, redação, idempotência, retomada, canal e downgrade.
- Nenhum teste roda em WSL, no Windows ou diretamente no host. Nenhum teste usa dados ou credenciais reais.

## Alternativas consideradas

### Instalador apenas em Bash

Seria menor no início, mas JSON, estado, schema, retomada, testes e redação ficariam frágeis. A CLI Node concentra essas responsabilidades sem dependências externas.

### Exigir Node instalado no host

Transferiria ao operador a responsabilidade por versão, caminho e integridade. O bootstrap com tarball oficial e SHA-256 mantém a instalação previsível.

### Ansible ou outra ferramenta de configuração

Acrescentaria um agente, um inventário e um modelo de execução externo ao repositório. O instalador precisa funcionar com `git clone` e `sudo ./instalar.sh`.

### Usar `get.docker.com`

A própria documentação da Docker não recomenda o script para produção. O caminho padrão usa o repositório oficial com chave verificada.

### Usar apenas `docker.io` da distro

O pacote da distro pode trazer Compose antigo e variações de versão. O fallback existe, mas exige Compose 2.24 ou superior e validação.

### Instalador em Python

Acrescentaria outro runtime e outra matriz de dependências. Node já é usado pelo projeto e pode ser embarcado de forma privada.

### Instalador monolítico sem estado

Não permitiria retomada, idempotência confiável, auditoria de etapa ou uso por agentes. O estado durável é parte do contrato.

### Incluir Kubernetes no mesmo entry point

Kubernetes tem Helm, initContainer, CronJobs e rollout próprios. Misturar os caminhos criaria promessas que o instalador não consegue cumprir.

### Configurar Vercel e GitHub automaticamente

Exigiria credenciais de plataforma, mudaria recursos fora do servidor e criaria um segundo dono da implantação. O instalador apenas mostra os comandos e documenta a configuração manual.

## Consequências

### Positivas

- A instalação deixa de depender de uma sequência manual e de conhecimento tácito de Ubuntu.
- O mesmo contrato atende VPS, servidor dedicado e máquina on-premises com Docker.
- O plano, o estado e o JSON tornam a operação auditável e utilizável por agentes.
- A instalação é idempotente, retomável e não reinstala o que já está correto.
- O perfil simples permanece independente do controlador e do Dropbox.
- A matriz Docker reduz regressões entre distribuições.

### Negativas e riscos

- O bootstrap acrescenta uma superfície de segurança e depende da integridade do tarball do Node e dos repositórios de pacotes.
- A matriz cross-distro aumenta o custo de manutenção e pode divergir com novas releases.
- Tier 2 não tem a mesma cobertura de teste e pode exigir ajuste manual.
- O instalador exige root para aplicar pacotes, criar usuário, instalar serviços e alterar firewall.
- O grupo `docker` continua equivalente a root. O instalador não promete isolamento contra root, DBA ou acesso direto ao daemon.
- O estado e os arquivos de ambiente precisam de proteção e backup operacional.
- A CLI Node interna precisa ser mantida junto com o schema JSON e os testes.

### Operação

- O estado, os logs e os arquivos de ambiente ficam em caminhos fixos e com modo restrito.
- O `planejar` pode rodar sem root para leitura, com avisos sobre verificações privilegiadas.
- O `diagnosticar` é o caminho de suporte e de decisão antes de atualizar.
- A documentação do contrato fica em [instalador.md](../instalador.md), e a matriz de distros é atualizada junto com os testes.
