# Origem autenticada de backups URL

Contrato operacional do produtor URL e do hook Kubernetes. A autenticação usa Node `crypto` e `pg`, sem nova dependência de aplicação. O diagnóstico de integridade continua separado da autorização de rollout.

## Modelo de confiança adotado

O perfil `postgres-direto-tls-snapshot-v1` exige adoção explícita `operador-confiavel-v1`. O operador registra uma policy fora do PVC e controla os Secrets, a imagem do produtor, os manifests e a topologia do PostgreSQL. A chave HMAC fica em outro Secret, montado somente no produtor e no hook. O aplicativo e o migrador não recebem essa chave.

O perfil aceita apenas IPv4 literal fixo, PostgreSQL direto, TLS `verify-full`, certificado com SAN para esse IP e CA com SHA-256 independente. Não aceita DNS, poolers de transação ou sessão, proxy TLS, balanceador, failover transparente, `hostaddr`, opções arbitrárias de conexão ou schemas com nomes fora do subconjunto ASCII documentado. A exclusão dessas topologias é uma premissa operacional verificável pelo operador, não uma descoberta automática de proxies.

A identidade operacional esperada contém `system_identifier`, OID do banco e OID do schema. Os valores são registrados pelo operador por canal administrativo independente, não aprendidos automaticamente do recibo ou do PVC. O papel precisa de `CONNECT`, leitura do schema e permissão de execução de `pg_catalog.pg_control_system()`. Não é necessário tornar o papel superusuário; a concessão dessa função deve ser planejada pelo DBA. O sistema não concede permissões nem cria schemas automaticamente.

A autoridade inicial é o operador e o produtor protegido. HMAC não prova origem contra DBA, root, produtor comprometido, administrador do cluster ou alguém que obtenha a chave. O verificador HMAC também pode assinar se comprometido. Clones físicos podem preservar `system_identifier`; a identidade depende conjuntamente do endpoint TLS fixado e da topologia adotada. Isso não é prova universal baseada apenas em DNS ou campos autodeclarados.

## Policy independente

Exemplo ilustrativo, sem credenciais. Os valores precisam ser obtidos e conferidos na instalação antes da adoção:

```json
{
  "versao": 1,
  "adocao": "operador-confiavel-v1",
  "perfil": "postgres-direto-tls-snapshot-v1",
  "produtor": "backup-escola-v1",
  "chaveId": "hmac-v1",
  "endpoint": {
    "host": "192.0.2.10",
    "port": 5432,
    "database": "frequencia",
    "user": "frequencia"
  },
  "tls": {
    "caSha256": "SHA256_DOS_BYTES_DA_CA_EM_HEXADECIMAL_MINUSCULO",
    "rootCert": "/etc/frequenciapp-origem/ca.crt"
  },
  "identidade": {
    "systemIdentifier": "IDENTIFICADOR_DECIMAL_DO_CLUSTER",
    "databaseOid": "OID_DECIMAL_DO_BANCO",
    "schemaOid": "OID_DECIMAL_DO_SCHEMA"
  },
  "schema": "public",
  "remoto": "",
  "criptografia": "age",
  "destinatario": "SHA256_DOS_BYTES_DO_ARQUIVO_DE_DESTINATARIOS_AGE",
  "idadeMaximaHoras": 36,
  "duracaoMaximaSegundos": 3600
}
```

Para GPG, `destinatario` é o fingerprint efetivamente verificado pelo produtor. Para age, é o SHA-256 dos bytes exatos do arquivo de destinatários, igual ao pin independente `BACKUP_AGE_DESTINATARIOS_SHA256`. O destino remoto da policy deve coincidir exatamente com `BACKUP_REMOTO`, inclusive ausência de destino. Trocar CA, destino, schema, identidade ou produtor altera o hash da policy e exige um novo backup; recibos antigos não são adotados por edição de metadados.

As três URLs efetivas precisam ser idênticas, incluindo credenciais, com estes únicos parâmetros, sem duplicação:

```text
postgresql://usuario:senha@192.0.2.10:5432/frequencia?sslmode=verify-full&sslrootcert=%2Fetc%2Ffrequenciapp-origem%2Fca.crt&schema=public
```

O nome de usuário e o banco devem coincidir com a policy. `DATABASE_SCHEMA` também deve coincidir com o parâmetro `schema`. O produtor remove apenas `schema` ao chamar libpq, que não aceita esse parâmetro; TLS e o endpoint permanecem iguais. Runtime e migrador recebem a URL original compatível com `pg`. Variáveis `PG*`, `NODE_OPTIONS` e `NODE_TLS_REJECT_UNAUTHORIZED` presentes são recusadas pelo wrapper de configuração. Não colocar opções de conexão nesses canais.

## Produção e consumo

1. `backup-banco.sh` valida a configuração independente antes de abrir a conexão ou produzir o dump.
2. O produtor abre uma transação `REPEATABLE READ READ ONLY`, confere o endpoint observado, TLS, identidade do cluster, OID do banco e OID do schema e exporta um snapshot.
3. `pg_dump --snapshot` usa exatamente o mesmo endpoint direto e mantém a sessão exportadora aberta até o término. A importação do snapshot e a premissa de endpoint direto vinculam as sessões. Não existe um segundo endereço opcional para a consulta de identidade.
4. O fluxo bruto passa por SHA-256 e contagem de bytes, validação `pg_restore -l` e cifra. O hash bruto nunca exige persistir o dump aberto no PVC. O recibo também declara os hashes de cada artefato cifrado e de cada `.sha256` associado.
5. Após sucesso da produção e da verificação remota configurada, o recibo recebe `origem`: produtor, ID da chave, hash da policy, identidade observada, snapshot, início/fim, hash e tamanho do dump bruto. A assinatura HMAC-SHA-256 cobre o JSON canônico completo do recibo, exceto o próprio campo da assinatura, incluindo escopo, etapas e lista fechada de artefatos.
6. O recibo autenticado usa o nome existente `.confirmado.json`, com `versao: 1` preservada e extensão `origem`. Assim, cópia e catálogo continuam transportando o mesmo arquivo, sem assinatura solta que possa ser esquecida. A chave não aparece no recibo, no estado ou no PVC.
7. O hook verifica HMAC com chave independente, policy, identidade, escopo, produtor, janela temporal, ponteiro, hashes e sidecars. A leitura de artefatos é por descritores regulares e blocos limitados; não carrega dumps inteiros em memória. Symlinks em metadados e artefatos são recusados. Symlinks de Secrets projetados são resolvidos antes da leitura, fora do PVC.

`origem-backup.mjs verificar` e `backup-banco.sh --verificar` verificam o perfil adotado. O hook não usa o diagnóstico como autorização. Ausência de adoção, key ID errado, chave errada, policy diferente, escopo alterado, artefato adulterado e recibo legado sem HMAC são recusados. Não há fallback para `url-conservador` nem bypass por `ENSAIO_SEM_PROTECAO`.

## Adoção no chart

Preparar três Secrets externos, imutáveis e com ownership/RBAC do operador. Eles não são criados a partir de values e não são armazenados pelo chart no histórico de releases:

| Secret        | Chaves                                      | Montagem                                                     |
| ------------- | ------------------------------------------- | ------------------------------------------------------------ |
| Policy        | `policy.json`, `ca.crt`                     | Runtime, migrador, produtor e hook                           |
| Conexão       | `url`                                       | Somente variáveis explícitas de runtime, migrador e produtor |
| HMAC separado | `key`, com 32 a 128 bytes aleatórios brutos | Somente produtor e hook                                      |

A chave HMAC não deve ser a senha do banco, chave de sessão ou chave privada de descriptografia. O Secret de policy não deve conter segredos. O volume projeta somente as duas chaves declaradas. Restringir também quem pode criar Pods, alterar imagens ou ler os Secrets. `immutable: true` impede troca dos bytes no mesmo objeto, não exclusão/recriação pelo administrador; a proteção de ownership e RBAC continua necessária.

```yaml
backupOrigin:
  adopted: true
  policySecret: frequenciapp-origem-v1
  connectionSecret: frequenciapp-conexao-v1
  hmacSecret: frequenciapp-origem-hmac-v1
  schema: public
backup:
  enabled: true
  retentionDays: 30
  retentionMinimum: 30
  filesSecret: frequenciapp-backup-arquivos
  database:
    enabled: true
    existingSecret: frequenciapp-backup-banco
    local: true
    persistence:
      enabled: true
  spreadsheets:
    enabled: false
backupGate:
  maxAgeHours: 36
  activeDeadlineSeconds: 1800
  requireRemoteVerification: false
```

O chart exige PVC para o perfil adotado. Injeta a mesma chave `url` nas três variáveis de conexão em todos os consumidores, sobrepondo as URLs de Secrets legados com uma única fonte controlada. `extraEnv` com conexão/TLS/schema reservado, `extraEnvFrom` opaco e conflitos em `config` ou `secrets.data` são recusados. Os wrappers de runtime e migrador validam a configuração e a identidade operacional antes de iniciar o processo original. A montagem da policy é somente leitura; HMAC não é montado no Deployment. O hook não recebe credenciais de banco ou transporte.

Os Secrets externos são conferidos como `immutable` quando o `lookup` do Helm retorna o objeto. Renderização offline não comprova existência, imutabilidade, RBAC ou ownership reais. A identificação do cluster e a inspeção das permissões precisam ser realizadas na adoção autorizada. O chart não instala nem altera esses recursos por conta própria.

O perfil herda `runAsUser/runAsGroup/fsGroup: 1000`, `runAsNonRoot`, rootfs somente leitura, remoção de capabilities, proibição de escalada, token de ServiceAccount desligado e `/tmp` gravável. O produtor usa `/backups/.locks` privado. O hook monta o PVC somente para leitura. Esses valores são parte da configuração de referência; sobrescrever securityContext exige revisão do operador e não reforça a autenticidade da chave.

Retenção de 30 dias e mínimo de 30 conjuntos são padrões, não pisos obrigatórios: um override positivo explícito é permitido. A autenticação do hook não habilita, por si só, exclusão URL. Nesta revisão, `backup-banco.sh` continua sem expurgo local/remoto no modo URL, inclusive adotado, preservando mais conjuntos e exigindo monitoramento de capacidade. A retenção remota continua no contrato separado de catálogo/transporte; não foi ensaiado Dropbox real.

## Bootstrap, old hooks e no hooks

A primeira instalação não executa `pre-upgrade`. Antes de instalar sobre banco existente, identificar o alvo e obter backup recuperável e autorização de migração. Em atualização de instalação legada, preparar previamente Secrets, PVC e execução do produtor da revisão nova em etapa autorizada e independente; não depender de recursos que só seriam criados depois do próprio `pre-upgrade`.

`pre-rollback` pode selecionar o hook e a imagem da revisão antiga, ou nenhum hook. `--no-hooks`, aplicação direta de manifests e credenciais administrativas podem evitar o gate. O chart não é admission controller e não oferece proteção retroativa a revisões antigas. Inspecionar as duas revisões e as imagens antes de qualquer transição. `backupGate.ensaioSemProtecao=true` agora é recusado, inclusive em template; o diagnóstico é o caminho de inspeção, não um mecanismo de liberação.

HMAC prova origem autenticada sob as premissas adotadas, não recuperação garantida ou compatibilidade de rollback. A confirmação remota é a observação registrada no instante do backup, não consulta atual de disponibilidade. Ensaiar restauração fora do banco de origem e revisar compatibilidade da imagem antiga com o banco migrado. Travas e leitura de inodes são cooperativas, não defesa contra escrita concorrente por root no mesmo inode ou contra comprometimento do storage.

## Verificação sintética e dependências

As provas não usam cluster, banco ou segredos reais. A prova CLI usa PostgreSQL 17 descartável, TLS local com certificado SAN IP, Node, `pg_dump`, `pg_restore`, `psql`, `age`, `age-keygen`, OpenSSL, Bash, coreutils, util-linux e Docker do host. O socket Docker nunca é montado no contêiner. O driver inspeciona imagem, labels próprias, ausência de mounts do host e portas, rede `none`, rootfs somente leitura, UID 999 do usuário postgres e término real antes da remoção exclusiva. A imagem de testes é separada do runtime UID 1000 do chart.

```bash
docker build --network none -t frequenciapp-origem-backup-test:isolado - < tests/kubernetes/origem-backup.Dockerfile
node tests/kubernetes/origem-backup-isolado.mjs
node --test tests/servidor/origem-backup.test.mjs tests/kubernetes/origem-backup-gate.test.mjs
HELM_BIN=/caminho/local/helm node --test tests/kubernetes/origem-backup-chart.test.mjs
```

O Dockerfile de testes usa uma imagem local de ferramentas previamente construída e a base pública PostgreSQL fixada por digest. A suíte de chart precisa de Helm local, fora das dependências da aplicação. O runner genérico de Node não inclui automaticamente Helm, OpenSSL, age ou PostgreSQL servidor; essas ferramentas precisam entrar na toolchain de CI ou ser executadas por este driver dedicado. A prova CLI é explicitamente separada das unidades e só inicia PostgreSQL quando `ORIGEM_BACKUP_ENSAIO=/ensaio` está presente no contêiner previamente inspecionado.

Foram exercitados produtor Bash e hook reais, descriptografia, igualdade do hash bruto e restauração de linha sintética em outro banco da mesma instância descartável. Os testes também alteram artefato, assinatura, chave, schema, produtor, policy, identidade e endpoint, e recusam fallback legado. Helm lint e template foram executados localmente no perfil adotado. Não foram executados cluster real, publicação de imagem, Dropbox real, `helm upgrade`, `helm rollback` ou kubeconform neste recorte.

## Integração com contratos compartilhados

`recibos.mjs` continua responsável pelo formato básico e pela leitura streaming dos artefatos; a extensão de origem não altera seus exports. A verificação protegida URL deve chamar `verificarReciboAutenticado` ou `verificarEstado`, não inferir confiança de `escopo.alvo` com prefixo `url-autenticado`. Common, controlador e Dropbox não ganham autoridade de origem apenas por transportar o recibo. Uma integração que fizer exclusão, atualização ou restauração por outro ponto de entrada precisa invocar a autenticação contra a policy independente antes de usar esse recibo para decisão protegida. Essas fontes não foram alteradas neste recorte.
