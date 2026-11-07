# Backup do servidor

Rotina de backup do banco e das planilhas em servidor auto-hospedado ou Kubernetes. O desenho separa o dump lógico do PostgreSQL da cópia das planilhas Google, porque os dois cobrem riscos diferentes.

O banco é a fonte de verdade do aplicativo. As planilhas contêm fórmulas e edições manuais que não existem no banco. A cópia JSON da Gestão serve para migração e conferência, mas não substitui o `pg_dump`.

A decisão está na [ADR-064](adr/064-auto-hospedagem-servidor.md). A instalação do servidor está em [auto-hospedagem.md](auto-hospedagem.md).

## Proteções

- O dump é cifrado antes de sair do servidor.
- A chave privada fica fora do servidor, em cofre ou gerenciador de senhas.
- A cópia remota é conferida por download e SHA-256.
- O envio usa `rclone copy --immutable`, sem espelhar exclusões.
- O destino remoto não tem expurgo automático.
- A retenção local preserva sempre a cópia mais recente.
- Falhas retornam código 1 e não gravam confirmação.
- Nenhum teste usa dados reais.

## Modos do banco

### `BACKUP_MODO=compose`

- Executa `docker compose exec db pg_dump`.
- Não exige `pg_dump` no host.
- Recomendado para a instalação com Docker Compose.
- O banco precisa estar saudável.

### `BACKUP_MODO=url`

- Executa `pg_dump` contra `BACKUP_DATABASE_URL` ou `DIRECT_URL`.
- Recomendado para Kubernetes, PostgreSQL gerenciado e banco externo.
- Exige cliente PostgreSQL 17 no ambiente.
- A imagem de backup já inclui o cliente.
- Usar uma role somente leitura com `pg_read_all_data` quando possível.
- A Transaction pooler do Supabase não é adequada para `pg_dump`.

## Imagem de backup

`infra/servidor/backup/Dockerfile` deriva da imagem da aplicação e acrescenta:

- `postgresql-client-17`;
- `rclone`;
- `gnupg`;
- `age`;
- `curl`.

A imagem é publicada no GHCR como `frequenciapp-backup` e também pode ser construída localmente:

```bash
docker build \
  --build-arg APP_IMAGEM=frequenciapp:local \
  -t frequenciapp-backup:local \
  -f infra/servidor/backup/Dockerfile .
```

## Chaves

### GPG de chave pública

Gerar o par em uma estação autorizada, não no servidor:

```bash
gpg --quick-generate-key "Backup FrequenciApp <backup@escola.exemplo.br>" rsa4096 encr 0
gpg --armor --export backup@escola.exemplo.br > backup-publica.asc
gpg --armor --export-secret-keys backup@escola.exemplo.br > backup-privada.asc
```

- `backup-publica.asc` pode ficar no servidor em `/etc/frequenciapp/backup-publica.asc`.
- `backup-privada.asc` fica em cofre offline, com dois custodiantes.
- A senha da chave privada não entra no servidor.
- A perda da chave privada torna as cópias irrecuperáveis.

Configuração:

```text
BACKUP_CRIPTOGRAFIA=gpg
BACKUP_GPG_DESTINATARIO=backup@escola.exemplo.br
BACKUP_GPG_CHAVE_PUBLICA=/etc/frequenciapp/backup-publica.asc
```

### age

Gerar o par:

```bash
age-keygen -o backup-age.txt
age-keygen -y backup-age.txt > backup-age-destinatarios.txt
```

- `backup-age-destinatarios.txt` contém apenas chaves públicas.
- `backup-age.txt` fica em cofre offline.
- A restauração usa `BACKUP_AGE_CHAVE_PRIVADA`.

Configuração:

```text
BACKUP_CRIPTOGRAFIA=age
BACKUP_AGE_DESTINATARIOS=/etc/frequenciapp/backup-age-destinatarios.txt
```

## rclone

O transporte é agnóstico. Criar um perfil de origem e outro de destino em `/etc/frequenciapp/rclone.conf`, com permissão 600.

Exemplo de estrutura, sem credenciais reais:

```ini
[destino]
type = s3
provider = Other
access_key_id = ...
secret_access_key = ...
endpoint = ...
region = ...

[origem]
type = drive
scope = drive.readonly
root_folder_id = ...
```

Regras:

- Origem e destino em pastas separadas.
- Preferir credenciais restritas à finalidade.
- Usar autenticação em duas etapas na conta do provedor.
- Criptografar a configuração do rclone quando possível.
- Não colocar o arquivo no Git.
- O diretório remoto do banco e o das planilhas são diferentes.

## Variáveis do backup

| Variável                   | Padrão                                | Uso                                |
| -------------------------- | ------------------------------------- | ---------------------------------- |
| `BACKUP_MODO`              | `compose` no host, `url` no contêiner | Origem do dump                     |
| `BACKUP_DATABASE_URL`      | vazio                                 | URL para modo `url`                |
| `BACKUP_DIR`               | `/var/backups/frequenciapp`           | Diretório local                    |
| `BACKUP_BANCO_DIR`         | `BACKUP_DIR/banco`                    | Dumps do banco                     |
| `BACKUP_PLANILHAS_DIR`     | `BACKUP_DIR/planilhas`                | Cópias das planilhas               |
| `BACKUP_RETER_DIAS`        | `30`                                  | Retenção local                     |
| `BACKUP_ESPACO_MINIMO_MB`  | `512`                                 | Espaço mínimo antes do dump        |
| `BACKUP_CRIPTOGRAFIA`      | `gpg`                                 | `gpg` ou `age`                     |
| `BACKUP_GPG_DESTINATARIO`  | vazio                                 | Fingerprint ou e-mail              |
| `BACKUP_GPG_CHAVE_PUBLICA` | vazio                                 | Chave pública GPG                  |
| `BACKUP_AGE_DESTINATARIOS` | vazio                                 | Arquivo de destinatários age       |
| `BACKUP_REMOTO`            | vazio                                 | Destino rclone do banco            |
| `BACKUP_RCLONE_CONFIG`     | vazio                                 | Configuração do rclone             |
| `RCLONE_CONFIG_PASS`       | vazio                                 | Senha da configuração do rclone    |
| `BACKUP_VERIFICAR_REMOTO`  | `true`                                | Confere o arquivo remoto           |
| `BACKUP_INCLUIR_AMBIENTE`  | `true` no Compose                     | Cifra o `app.env` junto            |
| `BACKUP_AMBIENTE_ARQUIVO`  | `/etc/frequenciapp/app.env`           | Arquivo de ambiente                |
| `BACKUP_PLANILHAS_LOCAL`   | `true`                                | Copia o ZIP confirmado para o host |
| `BACKUP_ORIGEM`            | vazio                                 | Origem rclone das planilhas        |
| `BACKUP_DESTINO`           | vazio                                 | Destino rclone das planilhas       |
| `BACKUP_CHAVE`             | vazio                                 | Chave do ZIP AES-256 das planilhas |

## Fluxo do banco

1. Validar ambiente, permissões, espaço e trava.
2. Executar `pg_dump -Fc`.
3. Usar `--schema` quando `DATABASE_SCHEMA` estiver definida.
4. Validar o arquivo com `pg_restore -l`.
5. Calcular SHA-256.
6. Cifrar com GPG ou age.
7. Calcular SHA-256 do arquivo cifrado.
8. Copiar para o diretório local.
9. Enviar com `rclone copy --immutable`.
10. Baixar o arquivo remoto e comparar o SHA-256.
11. Gravar `ultimo-backup.json` apenas após sucesso.
12. Aplicar a retenção local.

Execução manual no Compose:

```bash
scripts/servidor/backup-banco.sh
```

Execução no contêiner de backup, modo URL:

```bash
docker run --rm \
  --network frequenciapp_interna \
  -e BACKUP_MODO=url \
  -e BACKUP_DATABASE_URL='postgresql://usuario:senha@db:5432/frequencia' \
  -e BACKUP_CRIPTOGRAFIA=age \
  -e BACKUP_AGE_DESTINATARIOS=/etc/frequenciapp/age-destinatarios.txt \
  -e BACKUP_DIR=/backups \
  -e BACKUP_RCLONE_CONFIG=/etc/frequenciapp/rclone.conf \
  -e BACKUP_REMOTO='destino:frequenciapp/banco' \
  -v /var/backups/frequenciapp:/backups \
  -v /etc/frequenciapp:/etc/frequenciapp:ro \
  frequenciapp-backup:local
```

O comando exato depende do nome da rede e do projeto Compose.

## Arquivos gerados

```text
frequenciapp-20261107T033000Z-a1b2c3d4.dump.gpg
frequenciapp-20261107T033000Z-a1b2c3d4.dump.gpg.sha256
frequenciapp-20261107T033000Z-a1b2c3d4.dump.age
frequenciapp-20261107T033000Z-a1b2c3d4.dump.age.sha256
frequenciapp-20261107T033000Z-a1b2c3d4-ambiente.env.gpg
frequenciapp-20261107T033000Z-a1b2c3d4-ambiente.env.gpg.sha256
```

- O horário é UTC.
- O sufixo aleatório evita colisão.
- O JSON de estado não contém nomes de alunos, URL do banco ou token.

## Retenção local

`BACKUP_RETER_DIAS` define a retenção. A rotina:

- remove apenas arquivos com o prefixo `frequenciapp-`;
- nunca remove a cópia mais recente;
- não mexe no destino remoto;
- pode ser desativada com `BACKUP_RETER_DIAS=0`.

O destino remoto deve usar versionamento, object lock ou política de ciclo de vida definida pela escola. O histórico do provedor não é uma política de retenção.

## Restauração

### Compose

```bash
scripts/servidor/restaurar.sh \
  --arquivo /var/backups/frequenciapp/banco/frequenciapp-20261107T033000Z-a1b2c3d4.dump.age \
  --confirmar
```

O script:

1. Confere o checksum, quando o arquivo `.sha256` existe.
2. Decifra com GPG ou age.
3. Para a aplicação.
4. Cria uma cópia de segurança antes da restauração, salvo `--sem-copia`.
5. Recria o banco.
6. Executa `pg_restore`.
7. Sobe a aplicação e aguarda a saúde.

### URL externa

```bash
scripts/servidor/restaurar.sh \
  --arquivo /caminho/backup.dump.age \
  --confirmar \
  --sem-copia
```

No modo `url`, a aplicação precisa ser parada pela plataforma antes da restauração. O script não controla o runtime externo.

### Restauração com chave offline

Para não copiar a chave privada para o servidor, decifrar em uma estação autorizada e enviar o dump em fluxo:

```bash
age --decrypt -i backup-age.txt backup.dump.age |
  scripts/servidor/restaurar.sh --entrada - --confirmar --sem-copia
```

O script aceita `--entrada -` e não grava o dump em texto puro no servidor.

### Depois da restauração

- Conferir `/api/saude`.
- Conferir login e uma chamada.
- Executar `prisma migrate status`.
- Conferir contagens agregadas.
- Revisar a fila e os vínculos das planilhas antes de reativar envios.
- Conferir o `AUTH_SECRET` usado. Um segredo diferente exige reconectar o Google.

## Backup das planilhas

A rotina existente `scripts/backup/backup-externo.mjs` continua sendo usada. No servidor, ela roda no contêiner `backup-planilhas`:

```bash
scripts/servidor/backup-planilhas.sh
```

O contêiner precisa de:

- `BACKUP_ORIGEM`;
- `BACKUP_DESTINO`;
- `BACKUP_CHAVE`;
- `BACKUP_RCLONE_CONFIG`;
- `RCLONE_CONFIG_PASS`, quando a configuração estiver cifrada.

O ZIP usa AES-256, manifesto e `.confirmado.json`. A cópia local é opcional e fica em `BACKUP_PLANILHAS_DIR`.

A exportação para xlsx não preserva todos os recursos do Google Planilhas. Não há garantia de retrato transacional. O banco continua sendo a fonte de verdade.

## Custódia de chaves

O inventário deve listar:

- chave GPG ou age do dump;
- chave `BACKUP_CHAVE` do ZIP das planilhas;
- senha `RCLONE_CONFIG_PASS`, quando usada;
- `AUTH_SECRET` da aplicação;
- credenciais da role de backup.

Regras:

- dois custodiantes;
- cofre offline ou gerenciador de senhas;
- chaves antigas mantidas enquanto existirem cópias que dependam delas;
- rotação com teste de decifra;
- nenhuma chave em issue, commit, log, captura ou mensagem.

## Monitoramento

- `ultimo-backup.json` em `/var/lib/frequenciapp`.
- `MAILTO` do cron.
- `NOTIFICAR_URL` opcional, sem dados escolares.
- Alerta quando o backup mais recente tiver mais de 24 horas.
- Alerta quando o disco de backup estiver acima do limite.
- Alerta quando a renovação do certificado falhar.
- Conferência mensal de restauração em ambiente isolado.

## Segurança e LGPD

- O dump contém dados pessoais de menores.
- Acesso restrito ao diretório local, ao destino remoto e às chaves.
- Cifra obrigatória antes de sair do servidor.
- Retenção e descarte definidos pela escola.
- Nenhum dado real em teste automatizado.
- O `app.env` cifrado contém `AUTH_SECRET`, credenciais Google e senha do banco.
- O backup não substitui a política de resposta a incidentes da escola.

## Testes

- Unidade do formato do pacote de planilhas.
- Integração com PostgreSQL 17 descartável.
- Dump nos modos `compose` e `url`.
- Cifra GPG e age.
- Upload e conferência por rclone local.
- Restauração em banco separado.
- Falha de dump, cifra, upload e verificação.
- Limpeza de temporários.
- Verificação de permissões e ausência de segredos em log.

## Diagnóstico

### GPG não encontra a chave

- Conferir `BACKUP_GPG_DESTINATARIO`.
- Conferir se a chave pública foi importada no `GNUPGHOME` temporário.
- Conferir validade e capacidade de cifra da chave.

### age recusa a chave

- Conferir se o arquivo de destinatários contém a chave pública correta.
- Conferir se a chave privada corresponde ao backup.

### rclone falha

- Conferir permissão 600 do `rclone.conf`.
- Conferir token, endpoint e pasta.
- Conferir `RCLONE_CONFIG_PASS`.
- Testar com `rclone lsd destino:`.

### Restauração falha

- Conferir checksum.
- Conferir se a chave privada é a mesma da cópia.
- Conferir versão do `pg_restore`.
- Conferir permissões da role.
- Conferir se o banco está vazio ou se `--clean` é permitido.
