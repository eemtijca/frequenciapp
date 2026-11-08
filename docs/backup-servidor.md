# Backup do servidor

Rotina de backup do banco e das planilhas em servidor auto-hospedado ou Kubernetes. O desenho separa o dump lógico do PostgreSQL da cópia das planilhas Google, porque os dois cobrem riscos diferentes.

O banco é a fonte de verdade do aplicativo. As planilhas contêm fórmulas e edições manuais que não existem no banco. A cópia JSON da Gestão serve para migração e conferência, mas não substitui o `pg_dump`.

A decisão está na [ADR-064](adr/064-auto-hospedagem-servidor.md). A instalação do servidor está em [auto-hospedagem.md](auto-hospedagem.md).

## Proteções

- O dump é cifrado em fluxo, sem arquivo temporário em texto claro.
- A chave privada fica fora do servidor, em cofre ou gerenciador de senhas.
- A cópia remota é conferida por download e comparação com o hash local original.
- O envio usa `rclone copy --immutable`, sem espelhar exclusões.
- O destino remoto não tem expurgo automático, salvo `BACKUP_RETER_REMOTO=true`.
- A retenção local preserva um mínimo configurável de cópias confirmadas, com padrão de cinco.
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
- A restauração URL exige `BACKUP_RESTAURACAO_URL_VALIDACAO` para o ensaio em banco descartável. A opção `--sem-validacao` é uma decisão explícita de risco.

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

| Variável                           | Padrão                                | Uso                                |
| ---------------------------------- | ------------------------------------- | ---------------------------------- |
| `BACKUP_MODO`                      | `compose` no host, `url` no contêiner | Origem do dump                     |
| `BACKUP_DATABASE_URL`              | vazio                                 | URL para modo `url`                |
| `BACKUP_DIR`                       | `/var/backups/frequenciapp`           | Diretório local                    |
| `BACKUP_BANCO_DIR`                 | `BACKUP_DIR/banco`                    | Dumps do banco                     |
| `BACKUP_PLANILHAS_DIR`             | `BACKUP_DIR/planilhas`                | Cópias das planilhas               |
| `BACKUP_RETER_DIAS`                | `30`                                  | Retenção local                     |
| `BACKUP_RETER_MINIMO`              | `5`                                   | Cópias confirmadas sempre mantidas |
| `BACKUP_RETER_REMOTO`              | `false`                               | Limpeza remota opcional            |
| `BACKUP_RESTAURACAO_URL_VALIDACAO` | vazio                                 | Banco descartável no modo URL      |
| `RESTAURAR_MANTER_ANTERIOR`        | `true`                                | Preserva o banco anterior          |
| `BACKUP_ESPACO_MINIMO_MB`          | `512`                                 | Espaço mínimo antes do dump        |
| `BACKUP_CRIPTOGRAFIA`              | `gpg`                                 | `gpg` ou `age`                     |
| `BACKUP_GPG_DESTINATARIO`          | vazio                                 | Fingerprint ou e-mail              |
| `BACKUP_GPG_CHAVE_PUBLICA`         | vazio                                 | Chave pública GPG                  |
| `BACKUP_AGE_DESTINATARIOS`         | vazio                                 | Arquivo de destinatários age       |
| `BACKUP_REMOTO`                    | vazio                                 | Destino rclone do banco            |
| `BACKUP_RCLONE_CONFIG`             | vazio                                 | Configuração do rclone             |
| `RCLONE_CONFIG_PASS`               | vazio                                 | Senha da configuração do rclone    |
| `BACKUP_VERIFICAR_REMOTO`          | `true`                                | Confere o arquivo remoto           |
| `BACKUP_INCLUIR_AMBIENTE`          | `true` no Compose                     | Cifra o `app.env` junto            |
| `BACKUP_AMBIENTE_ARQUIVO`          | `/etc/frequenciapp/app.env`           | Arquivo de ambiente                |
| `BACKUP_PLANILHAS_LOCAL`           | `true`                                | Copia o ZIP confirmado para o host |
| `BACKUP_ORIGEM`                    | vazio                                 | Origem rclone das planilhas        |
| `BACKUP_DESTINO`                   | vazio                                 | Destino rclone das planilhas       |
| `BACKUP_CHAVE`                     | vazio                                 | Chave do ZIP AES-256 das planilhas |

## Fluxo do banco

1. Validar ambiente, permissões, espaço e trava.
2. Executar `pg_dump -Fc` em um fluxo que passa por `pg_restore -l` e pela cifra.
3. Usar `--schema` quando `DATABASE_SCHEMA` estiver definida.
4. Confirmar que o fluxo passou na validação do `pg_restore`.
5. Calcular SHA-256 do arquivo cifrado.
6. Cifrar o arquivo de ambiente pela entrada padrão, quando configurado.
7. Copiar para o diretório local.
8. Enviar com `rclone copy --immutable` e guardar o hash local.
9. Baixar cada arquivo remoto e comparar com o hash local original.
10. Gravar `ultimo-backup.json` apenas após sucesso.
11. Aplicar a retenção local com o mínimo de cópias.
12. Aplicar a retenção remota somente se ela estiver habilitada.

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

`BACKUP_RETER_DIAS` define a retenção por idade e `BACKUP_RETER_MINIMO` define o número de cópias confirmadas que nunca são removidas, com padrão de cinco. A rotina:

- remove apenas arquivos com o prefixo `frequenciapp-`;
- preserva sempre as `BACKUP_RETER_MINIMO` cópias mais recentes, mesmo acima do limite de idade;
- remove as cópias mais antigas somente quando existem cópias confirmadas além do mínimo;
- não roda se o upload ou a verificação remota falhar;
- pode ser desativada com `BACKUP_RETER_DIAS=0`.

`BACKUP_RETER_REMOTO=true` aplica os mesmos limites ao destino remoto. A limpeza remota é opcional e não exclui nada em caso de falha. O destino remoto deve usar versionamento, object lock ou política de ciclo de vida definida pela escola. O histórico do provedor não é uma política de retenção.

## Restauração

### Compose

```bash
scripts/servidor/restaurar.sh \
  --arquivo /var/backups/frequenciapp/banco/frequenciapp-20261107T033000Z-a1b2c3d4.dump.age \
  --confirmar
```

O script:

1. Monta e confere a instalação Compose.
2. Confere o checksum, quando o arquivo `.sha256` existe.
3. Decifra com GPG ou age em diretório privado.
4. Valida o formato com `pg_restore -l`.
5. Cria um banco descartável e restaura o dump nele.
6. Confere o histórico de migrações, as tabelas e os dados no banco validado.
7. Cria uma cópia de segurança antes da troca, salvo `--sem-copia`.
8. Para a aplicação.
9. Renomeia o banco em uso para um nome de recuperação e o banco validado para o nome de produção.
10. Sobe a aplicação e aguarda a saúde.
11. Em falha, mantém ou volta ao banco anterior e tenta religar a aplicação.
12. Preserva o banco anterior até a conferência, salvo `RESTAURAR_MANTER_ANTERIOR=false`.

O banco anterior não é descartado automaticamente. Depois de conferir login, saúde e migrações, remova-o com o comando exibido pelo script.

### URL externa

```bash
BACKUP_RESTAURACAO_URL_VALIDACAO='postgresql://usuario:senha@host:5432/frequencia_validacao' \
  scripts/servidor/restaurar.sh \
  --arquivo /caminho/backup.dump.age \
  --confirmar \
  --sem-copia
```

No modo `url`, a aplicação precisa ser parada pela plataforma antes da restauração. O script não controla o runtime externo. A URL de validação precisa apontar para um banco descartável e ser diferente da URL de destino. A opção `--sem-validacao` substitui o banco sem o ensaio prévio e deve ser usada somente com uma decisão registrada.

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
- Conferir o banco anterior e removê-lo somente depois da validação.
- Conferir `ultima-restauracao.json` em `/var/lib/frequenciapp`.

### Escopo e objetos globais

O dump usa `--schema` quando `DATABASE_SCHEMA` está definida e exclui publicações e assinaturas. Roles, ACLs, extensões e outros objetos globais não fazem parte do arquivo e precisam existir ou ser recriados no destino. A restauração usa `--no-owner` e `--no-acl`, portanto as permissões são definidas pela role que executa o comando.

### Privacidade dos temporários

O backup cifra o dump em fluxo. A restauração decifra em um diretório temporário com permissão restrita e o remove ao final, inclusive em falha. Um arquivo recebido por `--entrada -` também é gravado apenas nesse diretório privado.

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
- Restauração em banco separado e comparação de dados, schema e migrações.
- Falha de dump, cifra, upload, verificação, checksum e permissões.
- Detecção de arquivo e checksum remotos adulterados.
- Retenção mínima de cinco cópias e preservação após falha.
- Fluxo URL separado do Compose.
- Limpeza de temporários.
- Verificação de permissões e ausência de segredos em log.

Os comandos estão em `tests/servidor/README.md`. O fluxo `Servidor` do GitHub Actions executa ShellCheck, a validação dos arquivos de servidor e os ensaios descartáveis.

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
- Conferir permissões da role e a permissão para criar, renomear e remover bancos.
- Conferir `BACKUP_RESTAURACAO_URL_VALIDACAO` no modo URL.
- Conferir se a aplicação voltou após o rollback e se o banco anterior permanece.
- Conferir `ultima-restauracao.json` em `/var/lib/frequenciapp`.
