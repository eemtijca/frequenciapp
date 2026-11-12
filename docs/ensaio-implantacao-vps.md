# Ensaio de implantação em VPS

Roteiro para validar o instalador auto-hospedado em uma VPS Ubuntu 26.04 LTS descartável, com perfis, canal, backup, restauração e falha de energia. O ensaio não foi executado neste ciclo.

> [!IMPORTANT]
> Nenhuma VPS, domínio, certificado, conta, token, chave ou backup foi criado, alterado ou removido. A execução exige aprovação, janela de manutenção e insumos exclusivos de ensaio. As invocações do instalador usam apenas os comandos e as flags do contrato; as demais ferramentas são de preparação e verificação.

## 1. Escopo e limites

- Validar `planejar`, `aplicar`, `situacao`, `diagnosticar`, `atualizar`, `backup`, `restaurar`, `desinstalar`, `canal`, `versao` e `esquema` nos perfis `simples`, `controlador`, `dropbox` e `completo`.
- Usar somente dados sintéticos e insumos descartáveis. Nenhum dado de aluno, domínio, IP, senha, token, chave ou e-mail pessoal real entra no ensaio, no repositório ou nas evidências.
- Não alterar GitHub, Vercel, workflows ou produção durante o ensaio. O VPS único e as variáveis de nuvem pertencem ao corte da seção 13, executado depois do ensaio aprovado.
- O ensaio complementa os testes de systemd em contêiner: a VPS valida boot, DNS, TLS, firewall, disco e rede reais.
- Parar na primeira falha inesperada e registrar o estado. Não continuar sobre instalação, backup ou journal incerto.
- Guias de detalhe: [instalador.md](instalador.md), [auto-hospedagem.md](auto-hospedagem.md), [backup-servidor.md](backup-servidor.md), [controlador-manutencao.md](controlador-manutencao.md) e [dropbox-retencao.md](dropbox-retencao.md).

## 2. Convenções

```bash
# Valores fictícios: substituir pelos insumos do ensaio.
export DOMINIO="frequencia-ensaio.exemplo.br" EMAIL_ACME="acme@escola.exemplo.br"
export EMAIL_ADMIN="direcao@escola.exemplo.br" EMAIL_COORD="coordenacao@escola.exemplo.br"
export OPERADOR_CONTROLADOR="operador-ensaio"
export TAG_ESTAVEL="vX.Y.10" TAG_NOVA="vX.Y.11" TAG_ANTERIOR="vX.Y.9"
export COMMIT_MAIN="<sha-da-main>" FONTE="/srv/ensaio/fonte" EVIDENCIAS="/var/tmp/ensaio/evidencias"
export ARQ_SENHA_ADMIN="/var/tmp/ensaio/senha-admin" ARQ_SENHA_COORD="/var/tmp/ensaio/senha-coordenacao"
export ARQ_AGE_DESTINATARIOS="/etc/frequenciapp/age-destinatarios.txt" ARQ_RCLONE="/etc/frequenciapp/rclone.conf"
export ARQ_DROPBOX_CONFIG="/etc/frequenciapp/dropbox.conf" ARQ_DROPBOX_TOKEN="/etc/frequenciapp/dropbox-token"
export DESTINO_RCLONE="destino:frequenciapp/ensaio/banco"
```

- A ordem exigida é `TAG_ANTERIOR < TAG_ESTAVEL < TAG_NOVA`. Exportar as variáveis no shell do operador; o `sudo` recebe os valores já expandidos.
- Executar uma vez por snapshot limpo. Marcar todo comando destrutivo com `[DESTRUTIVO]` e confirmar o identificador da VPS antes.
- Não gravar segredo em variável, argumento, log ou histórico. As senhas e os tokens ficam em arquivos 600.

## 3. Pré-requisitos e segurança

| Item                  | Piso do ensaio                                                 | Recomendado                              | Verificação                                        |
| --------------------- | -------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------- |
| Imagem e arquitetura  | Ubuntu 26.04 LTS 64 bits, `resolute`, `amd64` ou `arm64`       | `amd64`                                  | `cat /etc/os-release`, `dpkg --print-architecture` |
| vCPU, memória e disco | 2 vCPU, 4 GB e 40 GB SSD                                       | 4 vCPU, 8 GB e 80 GB SSD                 | `nproc`, `free -m`, `df -h /`                      |
| DNS e TLS             | A para o domínio; AAAA só com IPv6 funcional; CAA permite a AC | TTL 300 s, `--acme-staging` na repetição | `dig +short A`, `dig CAA`                          |
| SSH e console         | chave dedicada, usuário com sudo, console fora de banda        | segunda sessão aberta                    | `sshd -T`                                          |
| Snapshot              | base limpa, sem Docker e sem FrequenciApp                      | base com Docker para auditoria           | console do provedor                                |

- O disco precisa acomodar o banco em uso, o banco anterior e o dump durante a restauração. O banco do Compose usa PostgreSQL 17; o cliente 17 do host só é instalado no modo URL. O e-mail ACME deve ser uma caixa funcional e monitorada, nunca uma caixa pessoal. O domínio do ensaio não pode ser o de produção, nem um CNAME para ele. Sem IPv6 funcional, não publicar AAAA, porque o ACME pode preferir IPv6 e falhar.
- Sincronizar o relógio e usar o fuso do ensaio: `sudo timedatectl set-timezone America/Fortaleza` e `sudo timedatectl set-ntp true`. O host precisa de saída para DNS, NTP, HTTP, HTTPS, GHCR e o destino de backup.

| Controle         | Critério                                                                             | Verificação                |
| ---------------- | ------------------------------------------------------------------------------------ | -------------------------- |
| Firewall         | provedor com entrada 22, 80 e 443; `ufw` do host com `--firewall sim --porta-ssh 22` | `sudo ufw status verbose`  |
| Portas           | somente 80 e 443 pelo proxy; 3000 e 5432 internos                                    | `ss -lntp` e teste externo |
| SSH              | somente chave; root sem senha; usuário dedicado                                      | `sudo sshd -T`             |
| Backups externos | destino exclusivo, vazio, versionado e com hash                                      | `rclone lsd`               |
| Chaves           | privadas fora da VPS; públicas ou destinatários no servidor                          | revisão do cofre           |
| Segredos         | arquivos 600; nada em `argv`, log, JSON ou Git                                       | `stat` e revisão           |

- O grupo `docker` equivale a root e o controlador é proteção cooperativa, não barreira contra root ou acesso direto ao daemon. O `ufw` não basta para conferir portas do Docker: validar com `ss -lntp` e com conexão externa. O token do Dropbox fica em arquivo 600, com escopo mínimo e revogação prevista; o `rclone.conf` também fica em 600.

## 4. Preparação da VPS

```bash
sudo apt-get update && sudo apt-get install -y ca-certificates curl git jq openssl ufw
sudo install -d -m 755 -o "$USER" -g "$USER" /srv/ensaio && sudo install -d -m 700 -o "$USER" -g "$USER" "$EVIDENCIAS"
git clone https://github.com/eemtijca/frequenciapp.git "$FONTE" && git -C "$FONTE" checkout "$TAG_ESTAVEL"
cd "$FONTE" && sudo ./instalar.sh versao > "$EVIDENCIAS/00-versao.txt" && sudo ./instalar.sh esquema > "$EVIDENCIAS/00-esquema.json"
```

- Criar os arquivos `ARQ_SENHA_ADMIN` e `ARQ_SENHA_COORD` com senhas descartáveis, modo 600, por entrada segura. Não usar `echo` com a senha. Gerar o par age na estação de operação e copiar somente o arquivo de destinatários para `ARQ_AGE_DESTINATARIOS`; a chave privada fica no cofre ou na estação e nunca na VPS.
- Criar a conta `OPERADOR_CONTROLADOR` sem privilégio administrativo e sem acesso ao grupo `docker`. O instalador não cria essa conta nem regra de `sudo`. Ela é obrigatória nos perfis `controlador` e `completo`.
- Criar `/etc/frequenciapp` com modo 700 e os arquivos de destinatários, `rclone.conf` e configuração Dropbox com modo 600 antes do primeiro `planejar`. O `aplicar` também cria o diretório, mas os insumos precisam existir antes da auditoria. O JSON de adoção do Dropbox precisa apontar `tokenFile` e `rcloneConfig` para os mesmos caminhos das flags e repetir o `destino` do rclone; o contrato está em [dropbox-retencao.md](dropbox-retencao.md).
- Criar o remote `destino` com a pasta exclusiva do ensaio, gravar `ARQ_RCLONE` com modo 600 e testar `rclone lsd destino:` da estação. Criar o aplicativo Dropbox de teste, o `ARQ_DROPBOX_CONFIG` e o `ARQ_DROPBOX_TOKEN`, modo 600; a pasta do Dropbox e o remote rclone devem ser a mesma.
- Criar o snapshot base depois da preparação e antes de instalar Docker ou o FrequenciApp. Registrar o identificador e a data.

## 5. Matriz e comandos base

| Ordem | Perfil        | Canal                     | Início                               | Foco                                     |
| ----- | ------------- | ------------------------- | ------------------------------------ | ---------------------------------------- |
| 1     | `simples`     | `release`                 | snapshot base                        | caminho mínimo                           |
| 2     | `controlador` | `release`                 | snapshot base                        | journal, pins e hash                     |
| 3     | `dropbox`     | `release`                 | snapshot base                        | upload, verificação e restauração        |
| 4     | `completo`    | `main` e depois `release` | snapshot base                        | perfis juntos e troca de canal           |
| 5     | `completo`    | `release`                 | VPS do item 4; VPS nova no cenário D | atualização, backup, restauração e falha |

```bash
FLAGS_COMUNS=(
  --diretorio-fonte "$FONTE" --dominio "$DOMINIO" --email-acme "$EMAIL_ACME"
  --proxy caddy --tls acme
  --email-admin "$EMAIL_ADMIN" --arquivo-senha-admin "$ARQ_SENHA_ADMIN"
  --email-coordenacao "$EMAIL_COORD" --arquivo-senha-coordenacao "$ARQ_SENHA_COORD"
  --agendador systemd --fuso America/Fortaleza --firewall sim --porta-ssh 22 --nao-interativo
)
FLAGS_BACKUP=(
  --modo-backup compose --criptografia age
  --destinatarios-age "$ARQ_AGE_DESTINATARIOS"
  --config-rclone "$ARQ_RCLONE" --destino "$DESTINO_RCLONE"
  --retencao-dias 7 --retencao-minimo 5
)
FLAGS_DROPBOX_EXTRA=(--config-dropbox "$ARQ_DROPBOX_CONFIG" --arquivo-token-dropbox "$ARQ_DROPBOX_TOKEN")
FLAGS_SIMPLES=(--perfil simples --canal release --tag "$TAG_ESTAVEL")
FLAGS_CONTROLADOR=(--perfil controlador --operador-controlador "$OPERADOR_CONTROLADOR" --canal release --tag "$TAG_ESTAVEL")
FLAGS_DROPBOX=(--perfil dropbox --canal release --tag "$TAG_ESTAVEL" "${FLAGS_DROPBOX_EXTRA[@]}")
FLAGS_COMPLETO=(--perfil completo --operador-controlador "$OPERADOR_CONTROLADOR" --canal release --tag "$TAG_ESTAVEL" "${FLAGS_DROPBOX_EXTRA[@]}")
FLAGS_COMPLETO_MAIN=(--perfil completo --operador-controlador "$OPERADOR_CONTROLADOR" --canal main --permitir-instavel --ref "$COMMIT_MAIN" "${FLAGS_DROPBOX_EXTRA[@]}")
```

- Antes de cada perfil, conferir o checkout: `git -C "$FONTE" checkout "$TAG_ESTAVEL"` para `release` e `git -C "$FONTE" checkout "$COMMIT_MAIN"` para `main`.

## 6. Perfil simples

```bash
PREFIXO="01-simples"
sudo ./instalar.sh planejar "${FLAGS_COMUNS[@]}" "${FLAGS_BACKUP[@]}" "${FLAGS_SIMPLES[@]}" --json > "$EVIDENCIAS/$PREFIXO-planejar.json"
sudo jq -e '.ok == true and .dry_run == true' "$EVIDENCIAS/$PREFIXO-planejar.json"
sudo ./instalar.sh aplicar "${FLAGS_COMUNS[@]}" "${FLAGS_BACKUP[@]}" "${FLAGS_SIMPLES[@]}" --sim --json --arquivo-log "$EVIDENCIAS/$PREFIXO-aplicar.log" > "$EVIDENCIAS/$PREFIXO-aplicar.json"
sudo jq -e '.ok == true' "$EVIDENCIAS/$PREFIXO-aplicar.json"
sudo ./instalar.sh situacao --json > "$EVIDENCIAS/$PREFIXO-situacao.json"
sudo ./instalar.sh diagnosticar --json > "$EVIDENCIAS/$PREFIXO-diagnosticar.json"
sudo jq -e '.ok == true and ((.erros // []) | length) == 0' "$EVIDENCIAS/$PREFIXO-diagnosticar.json"
```

- Conferir no `planejar` que o sistema não foi alterado; no `aplicar`, a criação de `app.env` e `ops.env`, a saúde e o primeiro backup; no `situacao`, containers, versão, backup, timers e disco; no `diagnosticar`, dependências, portas, DNS, TLS, banco, migrações e backup.
- Conferir `curl -fsS "https://$DOMINIO/api/saude"` com `200`, certificado válido, `ss -lntp` com 80 e 443 públicos e sem 3000 ou 5432, `ufw status verbose`, `stat` dos arquivos 600, `jq .verificadoRemoto` e `systemctl list-timers`; registrar as saídas em `EVIDENCIAS`. Repetir o `aplicar` com as mesmas flags e conferir `sem mudanças` e código 0. Avisos não bloqueantes entram em `observacoes`.

## 7. Perfis controlador, Dropbox e completo

Em cada perfil, repetir `planejar` com a matriz correspondente antes do `aplicar`; a verificação usa o `PREFIXO` do bloco.

### 7.1 Controlador

```bash
PREFIXO="02-controlador"
sudo ./instalar.sh aplicar "${FLAGS_COMUNS[@]}" "${FLAGS_BACKUP[@]}" "${FLAGS_CONTROLADOR[@]}" --sim --json --arquivo-log "$EVIDENCIAS/$PREFIXO-aplicar.log" > "$EVIDENCIAS/$PREFIXO-aplicar.json"
sudo ./instalar.sh backup --sim --json > "$EVIDENCIAS/$PREFIXO-backup.json"
```

- Executar `situacao` e `diagnosticar` e conferir `journal/`, `pins/` e `migradorSha256` em `/opt/frequenciapp-controlador/dados`; o backup e o `situacao` não podem ser bloqueados pelo controlador. Conferir que `atualizacao-em-andamento.json` não existe em repouso e que o `diagnosticar` mostra o perfil e o hash. A segunda execução do `aplicar` deve informar `sem mudanças`.

### 7.2 Dropbox

```bash
PREFIXO="03-dropbox"
sudo ./instalar.sh aplicar "${FLAGS_COMUNS[@]}" "${FLAGS_BACKUP[@]}" "${FLAGS_DROPBOX[@]}" --sim --json --arquivo-log "$EVIDENCIAS/$PREFIXO-aplicar.log" > "$EVIDENCIAS/$PREFIXO-aplicar.json"
```

- Executar `situacao` e `diagnosticar` e conferir `verificadoRemoto: true` em `ultimo-backup.json`, o recibo e a listagem `sudo rclone --config "$ARQ_RCLONE" ls "$DESTINO_RCLONE"`.
- Conferir permissão 600 de `rclone.conf`, `dropbox.conf` e do arquivo de token. O cliente nativo lista, baixa, verifica e apaga; o upload é do rclone. O perfil simples não pode depender do Dropbox, e a divergência entre a pasta do Dropbox e o remote rclone deve ser recusada com `E_DROPBOX`.

### 7.3 Completo

```bash
PREFIXO="04-completo-main"
sudo ./instalar.sh aplicar "${FLAGS_COMUNS[@]}" "${FLAGS_BACKUP[@]}" "${FLAGS_COMPLETO_MAIN[@]}" --sim --json --arquivo-log "$EVIDENCIAS/$PREFIXO-aplicar.log" > "$EVIDENCIAS/$PREFIXO-aplicar.json"
```

- Executar `situacao` e `diagnosticar` e conferir canal `main` marcado como instável, controlador ativo e backup Dropbox verificado. A instalação em `main` é a base para a troca de canal da seção 8; não usar `main` como estado final.
- O `--seed` não é aplicado pelo `aplicar`; carregar a massa sintética com o procedimento de semente do projeto antes das verificações que dependem de alunos. Nenhum dado real entra no ensaio.

## 8. Troca do canal main para release

```bash
sudo ./instalar.sh canal mostrar --json > "$EVIDENCIAS/05-canal-antes.json"
sudo ./instalar.sh backup --sim --json > "$EVIDENCIAS/05-backup-antes-canal.json"
sudo jq -e '.verificadoRemoto == true' /var/lib/frequenciapp/ultimo-backup.json
git -C "$FONTE" status --porcelain
git -C "$FONTE" merge-base --is-ancestor "$COMMIT_MAIN" "$TAG_ESTAVEL^{commit}"
sudo ./instalar.sh canal definir release --tag "$TAG_ESTAVEL" --planejar --json > "$EVIDENCIAS/05-canal-planejar.json"
sudo ./instalar.sh canal definir release --tag "$TAG_ESTAVEL" --aplicar --sim --json --arquivo-log "$EVIDENCIAS/05-canal-aplicar.log" > "$EVIDENCIAS/05-canal-aplicar.json"
sudo ./instalar.sh canal mostrar --json > "$EVIDENCIAS/05-canal-depois.json"
```

- O `merge-base` precisa sair 0: a tag estável deve conter o commit atual. Se sair diferente de 0, a troca é downgrade ou divergência; parar. O `git status --porcelain` precisa sair vazio. O `--planejar` grava a preferência sem aplicar; o `--aplicar` faz backup, valida a compatibilidade, executa o `atualizar.sh` e atualiza o estado. Conferir no `situacao` e no `diagnosticar` a tag, o commit, a imagem, o digest e o novo `migradorSha256`.

```bash
sudo ./instalar.sh canal definir release --tag "$TAG_ANTERIOR" --aplicar --sim --json > "$EVIDENCIAS/05-canal-downgrade.json"
sudo jq -e '.ok == false' "$EVIDENCIAS/05-canal-downgrade.json"
sudo grep -q 'E_CANAL' "$EVIDENCIAS/05-canal-downgrade.json"
sudo ./instalar.sh canal mostrar --json > "$EVIDENCIAS/05-canal-apos-downgrade.json"
```

- A recusa precisa acontecer antes de qualquer alteração, e `canal mostrar` deve continuar na tag anterior. Não usar exceção de downgrade neste ensaio; a exceção exige decisão registrada e restauração.

```bash
PREFIXO="05-controlador-readocao"
sudo ./instalar.sh aplicar "${FLAGS_COMUNS[@]}" "${FLAGS_BACKUP[@]}" "${FLAGS_COMPLETO[@]}" --sim --json --arquivo-log "$EVIDENCIAS/$PREFIXO.log" > "$EVIDENCIAS/$PREFIXO.json"
sudo find /var/lib/frequenciapp/journal /var/lib/frequenciapp/pins -maxdepth 2 -type f -printf '%M %u:%g %s %p\n' > "$EVIDENCIAS/$PREFIXO-artefatos.txt"
```

- Se o hash do migrador mudou, a readoção é obrigatória. A segunda execução do `aplicar` deve concluir a etapa do controlador e deixar o journal sem intenção pendente. Se o estado indicar etapa pendente, repetir o `aplicar` com `--retomar`. Se o controlador não for readotado automaticamente, registrar `E_CONTROLADOR` e parar; não editar o journal à mão.

## 9. Atualização, backup, restauração e falha de energia

### 9.1 Atualização

```bash
sudo ./instalar.sh backup --sim --json > "$EVIDENCIAS/06-backup-antes-update.json"
sudo jq -e '.verificadoRemoto == true' /var/lib/frequenciapp/ultimo-backup.json
sudo ./instalar.sh atualizar --canal release --tag "$TAG_NOVA" --sim --json --arquivo-log "$EVIDENCIAS/06-update.log" > "$EVIDENCIAS/06-update.json"
sudo jq -e '.ok == true' "$EVIDENCIAS/06-update.json"
```

- Executar `situacao` e `diagnosticar` e conferir tag, commit, imagem, digest, `estado.json`, ausência de `falha.json` e recibo de backup verificado. Se a falha ocorrer depois da migração, não iniciar a imagem anterior; restaurar o backup pré-atualização.
- Repetir `atualizar` com a mesma tag deve informar `sem mudanças` e código 0.

### 9.2 Backup manual e restauração

```bash
sudo ./instalar.sh backup --sim --json > "$EVIDENCIAS/07-backup.json"
sudo jq -e '.ok == true' "$EVIDENCIAS/07-backup.json"
sudo jq '{verificadoRemoto, criadoEm}' /var/lib/frequenciapp/ultimo-backup.json
sudo rclone --config "$ARQ_RCLONE" ls "$DESTINO_RCLONE"
sudo ./instalar.sh restaurar --do-remoto --sim --json --arquivo-log "$EVIDENCIAS/08-restaurar.log" > "$EVIDENCIAS/08-restaurar.json"
sudo jq -e '.ok == true' "$EVIDENCIAS/08-restaurar.json"
sudo jq . /var/lib/frequenciapp/ultima-restauracao.json
```

- Executar `situacao` antes e depois e conferir checksum, recibo, listagem remota e retenção mínima de 5 conjuntos. A retenção por tempo não é exercitada em uma janela curta; registrar a limitação.
- A chave privada do ensaio é efêmera e fica fora do disco persistente da VPS. Se o instalador exigir a chave em disco, parar e registrar a lacuna; não copiar a chave de produção. Conferir o conjunto baixado, o checksum, o banco anterior preservado, a saúde, o login, as contagens e `prisma migrate status`. A restauração recusa dump com histórico de migrações incompatível; não usar exceção neste ensaio.

### 9.3 Falha de energia

> [!WARNING]
> Os cenários a seguir interrompem a VPS de ensaio de forma abrupta. Executar somente na VPS descartável, com o identificador confirmado, e nunca em produção.

| Cenário | Interrupção                                                                | Verificação                                                  | Retomada                                                                                       |
| ------- | -------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| A       | desligamento forçado durante `aplicar`, antes da migração                  | boot, `systemctl --failed`, `docker ps`, `estado.json`, lock | `aplicar ... --retomar --sim`                                                                  |
| B       | desligamento forçado durante `atualizar`, depois da migração               | imagem e commit ativos, `falha.json`, journal, saúde         | `restaurar --do-remoto --sim` do backup pré-atualização; não reiniciar a imagem anterior       |
| C       | `kill -9` no processo pai de backup ou atualização, com filho remanescente | `ps -eo pid,ppid,cmd`, lock, journal                         | aguardar o filho; usar `--retomar`; não apagar lock à mão                                      |
| D       | destruição da VPS e criação de outra com o mesmo domínio                   | DNS, TLS, instalação, backup remoto                          | instalar a mesma tag e executar `restaurar --do-remoto --sim`; conferir `AUTH_SECRET` e Google |

- No cenário B, o journal incerto e o `falha.json` são a fonte de verdade; o log pode perder as últimas linhas. No cenário C, identificar os PIDs antes do `kill`; nunca usar `pkill` amplo. O filho pode continuar escrevendo e segurar a trava. No cenário D, o backup precisa ser de tag compatível com o checkout; DNS com TTL 300 e console do provedor devem estar disponíveis.

## 10. Janela de manutenção e critérios de aceite

| Bloco     | Atividade                                                           | Critério de parada                                                           |
| --------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| D-7 e D-1 | aprovação, insumos, DNS, snapshot, backup, console, chaves e janela | insumo ausente, domínio de produção ou backup não verificado                 |
| D1        | perfis simples, controlador, Dropbox e completo                     | saúde ou journal incerto; upload não verificado                              |
| D2        | troca de canal, atualização, downgrade, restauração e falha         | downgrade aceito, controlador não readotado ou restauração falhou duas vezes |
| D2 fim    | limpeza, destruição e evidências                                    | evidência incompleta                                                         |

- A janela é de referência; o tempo real depende do provedor, das imagens e da emissão TLS. Registrar início e fim em UTC.
- Parar e reverter o snapshot se houver segredo em evidência, dado real, migração não controlada, backup não verificado, DNS ou TLS quebrado, ou saúde falhando após o rollback. O rollback do ensaio é a restauração do snapshot base, destrutiva para o disco atual da VPS; o rollback de produção pertence ao roteiro de corte.

| ID  | Critério de aceite                                                                                                 | Comprovação                               |
| --- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| A1  | `planejar` não altera o sistema e devolve JSON válido                                                              | `dry_run: true`, código 0                 |
| A2  | perfil simples sobe, responde saúde e cria admin e coordenação                                                     | `/api/saude`, login, `situacao`           |
| A3  | segunda execução do `aplicar` não muda nada                                                                        | `sem mudanças`, código 0                  |
| A4  | controlador cria journal e pins e não bloqueia backup                                                              | artefatos, `backup`, `situacao`           |
| A5  | Dropbox envia por rclone, verifica pelo cliente nativo e restaura; o perfil completo combina controlador e Dropbox | recibo, `rclone ls`, `restaurar`, journal |
| A6  | troca `main` para `release` faz backup e readota o controlador                                                     | `canal mostrar`, journal, hash            |
| A7  | downgrade é recusado com `E_CANAL` e estado inalterado                                                             | JSON da recusa                            |
| A8  | atualização faz backup, migra, sobe a nova imagem e não volta à anterior                                           | `estado.json`, `situacao`                 |
| A9  | restauração valida checksum, preserva banco anterior e recupera a saúde                                            | `ultima-restauracao.json`                 |
| A10 | falha de energia não deixa recurso duplicado nem journal incurável                                                 | cenários A a C                            |
| A11 | segurança: portas, SSH, firewall, arquivos 600, nenhum segredo e nenhum dado real no Git                           | `ss`, `ufw`, `stat`, revisão              |
| A12 | limpeza: DNS, token, backup, snapshot e VPS removidos                                                              | `dig`, console, `rclone ls`               |

## 11. Registro de evidências

| Campo                       | Conteúdo                                                               |
| --------------------------- | ---------------------------------------------------------------------- |
| `id` e `dataHoraUtc`        | `S1`, `C1`, `D1`, `F1`, `T1`; ISO 8601                                 |
| `perfil` e `canal`          | `simples`, `controlador`, `dropbox` ou `completo`; `release` ou `main` |
| `tag` e `commit`            | identificadores aplicados                                              |
| `comando` e `codigo`        | comando exato, sem segredos, e código de saída                         |
| `resultado`                 | `sucesso`, `falha` ou `bloqueado`                                      |
| `evidencia` e `observacoes` | caminho relativo em `EVIDENCIAS`; desvios, avisos e pendências         |

- Nomear os arquivos como `NN-perfil-comando.json`, `.log` ou `.txt` e gerar `sha256sum` de todos.
- Sanitizar antes de sair da VPS: sem chave privada, token, senha, `AUTH_SECRET`, dado de aluno, domínio de produção ou IP real. O identificador do provedor substitui o IP.
- Copiar a evidência para a estação antes de restaurar o snapshot e guardar fora do repositório, com permissão restrita; registrar o hash no relatório do ensaio.

```text
Ensaio: P6.1
Início e fim (UTC):
Operador:
VPS e região:
Imagem, arquitetura, instalador, Docker e Compose:
Perfil, canal, tag e commit:
Comando, código, resultado, evidência e hash:
```

## 12. Limpeza e destruição

| Etapa | Ação                                                             | Verificação                           |
| ----- | ---------------------------------------------------------------- | ------------------------------------- |
| 1     | coletar, sanear e hashear as evidências                          | `sha256sum`                           |
| 2     | executar `sudo ./instalar.sh desinstalar --sim` no último perfil | serviços removidos; dados preservados |
| 3     | remover o registro DNS do ensaio                                 | `dig +short` vazio                    |
| 4     | revogar o token e apagar o aplicativo Dropbox de teste           | console do Dropbox                    |
| 5     | apagar a pasta remota do ensaio                                  | `rclone lsf` vazio                    |
| 6     | remover a chave SSH e a entrada de `known_hosts`                 | `ssh` falha                           |
| 7     | destruir a VPS e o snapshot                                      | console do provedor                   |
| 8     | conferir recursos e cobrança                                     | sem volume, IP ou snapshot órfão      |

- `[DESTRUTIVO]` A destruição da VPS, do snapshot e da pasta remota é irreversível. Confirmar o identificador, o domínio e o caminho duas vezes.
- `desinstalar` preserva dados por padrão. Não usar `docker system prune` nem `docker volume prune`; remover apenas recursos do projeto do ensaio. A revogação do token e a exclusão do arquivo são ações distintas: apagar o arquivo não invalida o token.

## 13. Corte para VPS único

Bloco executado depois do ensaio aprovado e antes de desligar a produção na nuvem. Nenhum comando desta seção foi executado neste ciclo; as linhas ficam como instrução do operador.

Pré-requisitos: critérios A1 a A12 atendidos, VPS de produção com DNS e TLS do domínio definitivo, backup remoto verificado e janela de manutenção aprovada. O domínio do ensaio não pode ser reaproveitado sem remover o registro anterior.

### 13.1 Congelar a nuvem

1. Confirmar que a `main` está verde e que não há implantação em andamento no GitHub Actions.
2. Executar um backup do banco de produção da nuvem e conferir o recibo antes de qualquer alteração.
3. Exportar as contas e os dados que precisam existir no VPS, sem gravar segredo em arquivo versionado.
4. Definir as variáveis do repositório:

```bash
gh variable set DEPLOY_TARGET --body servidor
gh variable set AGENDA_EXTERNA --body servidor
gh variable set BACKUP_EXTERNO --body servidor
gh variable list
```

- Com `DEPLOY_TARGET=servidor`, `implantacao.yml` e `migracoes.yml` são pulados; a produção de nuvem deixa de migrar e publicar na `main` e em release.
- Com `AGENDA_EXTERNA=servidor`, os jobs de `notificacoes.yml` e `fila-planilha.yml` são pulados e a agenda do servidor assume notificações, fila de planilhas e indicadores.
- Com `BACKUP_EXTERNO=servidor`, o job de `backup-externo.yml` é pulado e o backup das planilhas passa para a rotina do servidor.
- A definição vale para o repositório inteiro. Conferir que nenhum outro ambiente depende desses workflows.

### 13.2 Desligar a Vercel

- Conferir no `vercel.json` que `git.deploymentEnabled.main` é `false`.
- No painel do projeto, desativar a publicação automática da `main` e manter ou desativar o preview conforme a decisão da escola. A variável `DEPLOY_TARGET` não controla o preview.
- Se o preview continuar, apontar os previews para banco descartável e remover o domínio de produção da Vercel.
- O instalador não altera a Vercel nem o GitHub; essas ações são manuais e ficam registradas no histórico operacional.

### 13.3 Conferir o VPS

- `curl -fsS "https://$DOMINIO/api/saude"` responde `200` com o commit esperado.
- O DNS do domínio de produção aponta para o VPS, sem CNAME para a Vercel.
- O certificado está válido e a renovação está agendada.
- O agendador do servidor executa a cada cinco minutos, com `systemctl list-timers` no perfil systemd; `notificacoes.yml` e `fila-planilha.yml` estão pulados.
- `ultimo-backup.json` tem `verificadoRemoto` igual a `true` e a cópia mais recente está no destino externo.
- O backup das planilhas executou no servidor e `backup-externo.yml` está pulado.
- Um único banco de produção atende o domínio; previews e nuvem não usam esse banco.
- Nenhum dispositivo recebe aviso duplicado.

### 13.4 Reversão

- Remover as três variáveis com `gh variable delete` e reativar o deploy Git da `main` na Vercel.
- Manter um único banco de produção e um único ponto de agenda durante a troca.
- Não manter os dois caminhos ativos por tempo indeterminado, porque a divergência de schema e de dados cresce a cada dia.
- Registrar a decisão, a data e o efeito no histórico operacional, sem dados de aluno.

## 14. Declaração de não execução

Este roteiro foi escrito e revisado contra o contrato do instalador, mas não foi executado neste ciclo. Nenhuma VPS, registro DNS, certificado, conta, token, chave ou backup foi criado, alterado ou removido. A execução depende de aprovação, janela de manutenção e insumos descartáveis, e o resultado deve ser anexado ao registro de evidências e ao plano mestre.
