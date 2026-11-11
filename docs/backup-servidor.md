# Backup do servidor

Rotina de backup do banco e das planilhas em servidor auto-hospedado ou Kubernetes. O desenho separa o dump lógico do PostgreSQL da cópia das planilhas Google, porque os dois cobrem riscos diferentes.

O banco é a fonte de verdade do aplicativo. As planilhas contêm fórmulas e edições manuais que não existem no banco. A cópia JSON da Gestão serve para migração e conferência, mas não substitui o `pg_dump`.

A decisão está na [ADR-064](adr/064-auto-hospedagem-servidor.md). A instalação do servidor está em [auto-hospedagem.md](auto-hospedagem.md).

## Proteções

- O dump é cifrado em fluxo, sem arquivo temporário em texto claro.
- A chave privada fica fora do servidor, em cofre ou gerenciador de senhas.
- A cópia remota é conferida por download e comparação com o hash local original.
- O envio usa `rclone copy --immutable`, sem espelhar exclusões.
- O expurgo remoto exige o perfil Dropbox adotado, pasta exclusiva, autoridade cooperativa e exclusão da revisão verificada. Outros transportes e instalações sem adoção continuam recusados. Consulte [retenção Dropbox](dropbox-retencao.md).
- No modo Compose, a retenção local preserva um mínimo configurável de cópias confirmadas, com padrão de 30. No modo URL, ambos os expurgos ficam suspensos; monitore o espaço local e remoto.
- Falhas de geração ou transporte não publicam recibo. Falha de expurgo pode ocorrer após a confirmação do novo conjunto e retorna erro sem anunciar limpeza completa.
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
- O ensaio de restauração URL exige `BACKUP_RESTAURACAO_PERFIL=postgres-direto`, PostgreSQL 17 direto e permissão `CREATEDB`. O ensaio cria o próprio banco aleatório e verifica sua propriedade. URLs externas de validação são recusadas, mesmo quando diferentes do destino. Consulte [restauração URL](restauracao-url.md).

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
BACKUP_GPG_DESTINATARIO=FINGERPRINT_COMPLETO_DA_CHAVE_DE_CIFRA
BACKUP_GPG_FINGERPRINT=FINGERPRINT_COMPLETO_DA_CHAVE_PRIMARIA
GPG_BASE_CURTA=/tmp
BACKUP_GPG_CHAVE_PUBLICA=/etc/frequenciapp/backup-publica.asc
```

O pin da chave primária precisa ser conferido por canal independente do arquivo público. Guardar ambos em uma área que o mesmo atacante substitui não cria uma nova âncora de confiança. O destinatário deve ser fingerprint completo da primária ou da subchave de cifra; ambiguidade, revogação e expiração bloqueiam a operação. O recibo registra a chave de cifra selecionada, não uma chave privada nem prova de posse dela.

`GPG_BASE_CURTA` deve existir e permitir criar um home privado 0700. A rotina separa esse home da área do dump, confere dono e tamanho do socket informado por `gpgconf` e encerra apenas o agente do home criado pela operação. Não usa nem encerra agente pessoal herdado.

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
BACKUP_AGE_DESTINATARIOS_SHA256=HASH_SHA256_CONFERIDO_POR_CANAL_INDEPENDENTE
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

| Variável                           | Padrão                                | Uso                                       |
| ---------------------------------- | ------------------------------------- | ----------------------------------------- |
| `BACKUP_MODO`                      | `compose` no host, `url` no contêiner | Origem do dump                            |
| `BACKUP_DATABASE_URL`              | vazio                                 | URL para modo `url`                       |
| `BACKUP_DIR`                       | `/var/backups/frequenciapp`           | Diretório local                           |
| `BACKUP_BANCO_DIR`                 | `BACKUP_DIR/banco`                    | Dumps do banco                            |
| `BACKUP_PLANILHAS_DIR`             | `BACKUP_DIR/planilhas`                | Cópias das planilhas                      |
| `BACKUP_RETER_DIAS`                | `30`                                  | Retenção local                            |
| `BACKUP_RETER_MINIMO`              | `30`                                  | Cópias confirmadas sempre mantidas        |
| `BACKUP_RETER_REMOTO`              | `false`                               | Expurgo somente no perfil Dropbox adotado |
| `BACKUP_DROPBOX_CONFIG`            | vazio                                 | Configuração privada da adoção Dropbox    |
| `BACKUP_RESTAURACAO_PERFIL`        | vazio                                 | `postgres-direto` para ensaio próprio URL |
| `BACKUP_RESTAURACAO_URL_VALIDACAO` | vazio                                 | URL externa recusada, não configurar      |
| `BACKUP_ORIGEM_POLICY`             | vazio                                 | Policy independente para origem URL       |
| `BACKUP_ORIGEM_CHAVE`              | vazio                                 | Chave HMAC separada do PVC                |
| `RESTAURAR_MANTER_ANTERIOR`        | `true`                                | Preserva o banco anterior                 |
| `BACKUP_ESPACO_MINIMO_MB`          | `512`                                 | Espaço mínimo antes do dump               |
| `BACKUP_CRIPTOGRAFIA`              | `gpg`                                 | `gpg` ou `age`                            |
| `BACKUP_GPG_DESTINATARIO`          | vazio                                 | Fingerprint completo                      |
| `BACKUP_GPG_CHAVE_PUBLICA`         | vazio                                 | Chave pública GPG                         |
| `BACKUP_AGE_DESTINATARIOS`         | vazio                                 | Arquivo de destinatários age              |
| `BACKUP_AGE_DESTINATARIOS_SHA256`  | vazio                                 | Pin independente obrigatório para age     |
| `BACKUP_REMOTO`                    | vazio                                 | Destino rclone do banco                   |
| `BACKUP_RCLONE_CONFIG`             | vazio                                 | Configuração do rclone                    |
| `RCLONE_CONFIG_PASS`               | vazio                                 | Senha da configuração do rclone           |
| `BACKUP_VERIFICAR_REMOTO`          | `true`                                | Confere o arquivo remoto                  |
| `BACKUP_EXIGIR_REMOTO`             | `false`                               | Exige destino e verificação remota        |
| `BACKUP_CATALOGO_PERSISTENTE`      | `true`                                | Exige catálogo persistente                |
| `BACKUP_INCLUIR_AMBIENTE`          | `true` no Compose                     | Cifra o `app.env` junto                   |
| `BACKUP_AMBIENTE_ARQUIVO`          | `/etc/frequenciapp/app.env`           | Arquivo de ambiente                       |
| `BACKUP_PLANILHAS_LOCAL`           | `true`                                | Copia o ZIP confirmado para o host        |
| `BACKUP_ORIGEM`                    | vazio                                 | Origem rclone das planilhas               |
| `BACKUP_DESTINO`                   | vazio                                 | Destino rclone das planilhas              |
| `BACKUP_CHAVE`                     | vazio                                 | Chave do ZIP AES-256 das planilhas        |

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
10. Publicar recibo individual versionado após as etapas exigidas e manter cópia no catálogo persistente `ESTADO_DIR/recibos`.
11. Atualizar atomicamente `ultimo-backup.json`, que é ponteiro e não catálogo histórico.
12. Planejar expurgo por recibos válidos do mesmo alvo; verificar novamente o remoto contra o catálogo local independente antes de excluir seus membros exatos.

Execução manual no Compose:

```bash
scripts/servidor/backup-banco.sh
```

No modo Compose, execute `scripts/servidor/backup-banco.sh --verificar` para conferir a última cópia. A rotina consulta o banco efetivo e valida o recibo e os arquivos locais. Quando há destino remoto configurado, ela compara cada artefato e o recibo remotos com os hashes locais. Essa verificação não substitui o ensaio de restauração.

Para cópias cuja origem não pode ser comprovada, `scripts/servidor/backup-banco.sh --diagnosticar-integridade` confere apenas a integridade local do conjunto. O resultado não identifica o banco de origem, não verifica a cópia remota, não demonstra recuperação e não autoriza atualização ou retenção. No perfil URL adotado, `--verificar` valida a origem autenticada contra policy e chave independentes. Legados sem essa autenticação continuam recusados. Consulte [origem de backup](origem-backup.md).

Execução no contêiner de backup, modo URL:

```bash
docker run --rm \
  --network frequenciapp_interna \
  -e BACKUP_MODO=url \
  -e BACKUP_DATABASE_URL='postgresql://usuario:senha@db:5432/frequencia' \
  -e BACKUP_CRIPTOGRAFIA=age \
  -e BACKUP_AGE_DESTINATARIOS=/etc/frequenciapp/age-destinatarios.txt \
  -e BACKUP_AGE_DESTINATARIOS_SHA256="$BACKUP_AGE_DESTINATARIOS_SHA256" \
  -e BACKUP_DIR=/backups \
  -e BACKUP_RCLONE_CONFIG=/etc/frequenciapp/rclone.conf \
  -e BACKUP_REMOTO='destino:frequenciapp/banco' \
  -v /var/backups/frequenciapp:/backups \
  -v /etc/frequenciapp:/etc/frequenciapp:ro \
  frequenciapp-backup:local
```

Antes do comando, obtenha por canal independente o SHA-256 esperado do arquivo de destinatários e defina-o em `BACKUP_AGE_DESTINATARIOS_SHA256` com 64 caracteres hexadecimais minúsculos. O comando exato depende do nome da rede e do projeto Compose.

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

`BACKUP_RETER_DIAS` define a idade e `BACKUP_RETER_MINIMO` protege os conjuntos confirmados mais recentes, com padrão de 30. Podem ser mantidas mais cópias dentro do período de retenção. A confirmação exige recibo `<base>.confirmado.json` versão 1 com escopo, alvo, formato, destinatário, lista exata de artefatos, hashes e etapas tipadas. Recibo local só conta se todos os membros e checksums conferirem; nomes, legados ou uploads incompletos não contam nem autorizam exclusão por prefixo.

A etapa `recuperacaoExercitada` permanece `false`: cifra, hash, transporte e listagem não comprovam recuperação. O ensaio completo em estação isolada com chave privada separada, restauração oficial e comparação de dados, constraints e migrações continua obrigatório. Cópias legadas exigem adoção e verificação explícitas, não confirmação retroativa por nome.

O catálogo em `ESTADO_DIR/recibos` é independente do provedor. O perfil Dropbox usa transporte limitado durante a recepção, revisão fixa, journal durável e exclusão condicional. A pasta precisa ser exclusivamente operada pelo contrato adotado; a configuração não prova ausência de outro administrador. No modo URL, os expurgos local e remoto continuam suspensos, inclusive com origem autenticada: a autorização de rollout não concede autorização de exclusão.

Não configure `BACKUP_RETER_REMOTO=true` sem concluir a adoção descrita em [retenção Dropbox](dropbox-retencao.md). Configuração ausente, transporte incompatível, revisão divergente ou resultado incerto podem ser recusados após a confirmação do novo conjunto. A falha retorna erro e impede anunciar limpeza completa. Preserve catálogo, journals e artefatos para reconciliação; monitore o espaço local e remoto.

## Restauração

### Compose

```bash
scripts/servidor/restaurar.sh \
  --arquivo /var/backups/frequenciapp/banco/frequenciapp-20261107T033000Z-a1b2c3d4.dump.age \
  --confirmar
```

O script:

1. Monta e confere a instalação Compose.
2. Exige checksum explícito ou arquivo `.sha256` e confere ambos quando fornecidos.
3. Decifra com GPG ou age em diretório privado.
4. Valida o formato com `pg_restore -l`.
5. Cria um banco descartável e restaura o dump nele.
6. Confere o histórico de migrações, as tabelas e os dados no banco validado.
7. Cria uma cópia de segurança antes da troca, salvo `--sem-copia`.
8. Para a aplicação.
9. Renomeia o banco em uso para um nome de recuperação e o banco validado para o nome de produção em uma única transação. Uma falha entre as renomeações desfaz a troca parcial; a recuperação reconhece tanto a troca completa quanto a ausência de troca.

O modo Compose recusa a restauração quando o banco em uso tem schemas fora de `DATABASE_SCHEMA`. O dump cobre apenas esse schema e a troca do banco inteiro perderia os demais; a mensagem orienta a gerar um dump integral em outro fluxo ou remover os schemas antes.

10. Sobe a aplicação e aguarda a saúde.
11. Em falha, mantém ou volta ao banco anterior e tenta religar a aplicação.
12. Preserva o banco anterior até a conferência, salvo `RESTAURAR_MANTER_ANTERIOR=false`.

O banco anterior não é descartado automaticamente. Depois de conferir login, saúde e migrações, remova-o com o comando exibido pelo script.

### URL externa

No modo `url`, o perfil `BACKUP_RESTAURACAO_PERFIL=postgres-direto` cria um banco de ensaio aleatório no endpoint direto PostgreSQL 17. A role precisa de `CREATEDB`. Nome, OID, dono, servidor e marcador privado são revalidados antes de restaurar e descartar o recurso. O destino só recebe o dump após o ensaio bem-sucedido. `BACKUP_RESTAURACAO_URL_VALIDACAO` é recusada: uma URL fornecida externamente nunca é autoridade para destruir um banco de ensaio.

O journal de cada rodada fica em `ESTADO_DIR/ensaios-url`. Falha, sinal ou propriedade divergente preservam o recurso para inspeção manual. Não usar esse perfil com pooler, proxy que ignore database ou topologia não revisada. Consulte os requisitos e os limites em [restauração URL](restauracao-url.md).

Somente após decisão explícita registrada, a opção `--sem-validacao` permite uma restauração destrutiva sem o ensaio prévio. A aplicação precisa ser parada pela plataforma antes da operação; o script não controla o runtime externo. Preserve e confira uma cópia recuperável independente antes de prosseguir. `--sem-copia` também dispensa a cópia de segurança automática e aumenta o risco.

```bash
scripts/servidor/restaurar.sh \
  --arquivo /caminho/backup.dump.age \
  --confirmar --sem-validacao
```

Uma falha após iniciar `pg_restore` pode deixar o resultado incerto. O script não executa rollback automático no modo URL: mantenha a aplicação parada, inspecione o destino e a cópia de segurança indicada e decida a recuperação manual em ambiente controlado. Mesmo quando a transação é usada, não presuma o estado do destino após falha ou perda de conexão.

### Restauração com chave offline

Para não copiar a chave privada para o servidor, decifrar em uma estação autorizada e enviar o dump em fluxo:

```bash
age --decrypt -i backup-age.txt backup.dump.age |
  scripts/servidor/restaurar.sh --entrada - --checksum SHA256_DO_DUMP_DECIFRADO --confirmar --sem-copia
```

O script aceita `--entrada -` e materializa o dump em texto claro num diretório temporário privado. Não é um fluxo sem texto claro em disco. A área é removida em sucesso, erro e sinais tratáveis; `SIGKILL` exige diagnóstico de resíduos.

A decifra nativa GPG exige chave privada explícita e usa `--batch --pinentry-mode error`, sem desbloquear chave protegida nem depender de cache pessoal. Para chave protegida, usar decifra externa em estação autorizada e entregar somente o dump via `--entrada -`. Não remover a passphrase, transferir a chave privada por conveniência ou colocar passphrase em argumentos, ambiente ou logs.

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

O backup cifra o dump em fluxo. A restauração copia o arquivo de entrada e decifra a cópia em diretório temporário privado. Reserve espaço para o arquivo capturado e o dump decifrado simultaneamente, além de espaço para a cópia de segurança quando habilitada. `--entrada -` grava o dump decifrado no temporário. A limpeza ocorre no sucesso, erro e sinais tratáveis, mas não é garantida após `SIGKILL` ou queda do sistema; inspecione resíduos com segurança.

O sidecar aceito atualmente deve conter exatamente uma linha `SHA256␠␠nome-do-arquivo` seguida de LF, como produzido pelo backup atual. Sidecars legados com marcador binário `*`, múltiplas entradas ou nomes escapados pelo `sha256sum` são incompatíveis e serão recusados, inclusive quando `--checksum` também for informado. Não converta ou ignore um sidecar sem verificar independentemente o arquivo e sua origem; checksum sozinho não autentica a origem.

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

O ZIP usa AES-256, manifesto e `.confirmado.json`. A cópia local é opcional e fica em `BACKUP_PLANILHAS_DIR`. O contêiner usa `BACKUP_PLANILHAS_UID` e `BACKUP_PLANILHAS_GID` para gravar no volume com o dono da conta de implantação. A retenção local usa `BACKUP_RETER_DIAS` e preserva no mínimo `BACKUP_RETER_MINIMO` conjuntos confirmados.

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
- Retenção mínima padrão de 30 cópias, valores explicitamente configurados e preservação após falha.
- Fluxo URL separado do Compose.
- Limpeza de temporários.
- Verificação de permissões e ausência de segredos em log.

Os comandos e os resultados por perfil estão em `tests/servidor/README.md`. Sintéticos sem rede/socket, ensaios reais PostgreSQL descartáveis e instalação privilegiada em fixture própria são provas separadas. Um autoteste do launcher não aprova a suíte inteira; uma integração legada sem ownership demonstrado continua não executada e deve ser reportada como bloqueio, não como teste aprovado ou ignorado.

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
- No modo URL, conferir perfil direto, permissão `CREATEDB` e o journal do banco de ensaio. Uma URL externa não é aceita como destino descartável.
- Conferir se a aplicação voltou após o rollback e se o banco anterior permanece.
- Conferir `ultima-restauracao.json` em `/var/lib/frequenciapp`.

## Backup no Kubernetes

O chart aceita duas formas de durabilidade para o backup do banco:

- PVC em `backup.database.persistence.enabled=true`, que mantém o dump, o recibo `ultimo-backup.json` e o catálogo em `/backups`;
- destino remoto em `backup.database.remote.enabled=true`, com `backup.database.local=false` quando não há PVC.

Com PVC, o chart define `BACKUP_CATALOGO_PERSISTENTE=true` e `BACKUP_EXIGIR_REMOTO=false`. Sem PVC, define `BACKUP_EXIGIR_REMOTO=true`; a rotina então recusa `BACKUP_REMOTO` vazio e exige `BACKUP_VERIFICAR_REMOTO=true`. A declaração do chart não comprova transporte nem recuperação: a prova vem do upload, da comparação do hash e do recibo gravado pela rotina.

O gate protegido exige PVC e o perfil de [origem autenticada](origem-backup.md): policy independente, endpoint TLS fixado, identidade PostgreSQL esperada e recibo HMAC vinculado ao dump e aos artefatos. O diagnóstico local não autoriza a operação. Ausência de adoção, legado sem HMAC e `backupGate.ensaioSemProtecao=true` são recusados. A proteção não é retroativa: instalação inicial, hooks de revisões antigas, `--no-hooks` e alterações administrativas diretas podem não passar pelo gate. Consulte [Kubernetes](kubernetes.md).
