# ADR-068: origem autenticada, backup e rollout no Kubernetes

## Estado

Implementado no perfil URL explicitamente adotado, com testes locais de Helm e fluxo CLI sintético. Não validado em cluster real. O contrato de adoção e a policy completa estão em [origem-backup.md](../origem-backup.md).

## Contexto

O chart migrava no initContainer antes de conferir backup, não provocava rollout por mudanças de configuração e compartilhava volume entre rotinas. Recibos coerentes e hashes sem autenticação não provavam origem: um autor do PVC podia declarar banco, schema e destino arbitrários. Um bloqueio incondicional posterior preservava segurança, mas tornava upgrades indisponíveis mesmo sob uma adoção operacional válida.

## Decisão

### Autoridade de origem explicitamente adotada

O perfil `postgres-direto-tls-snapshot-v1` parte de operador e produtor protegidos. A policy `operador-confiavel-v1`, fora do PVC, fixa IPv4 literal de endpoint PostgreSQL direto, porta, banco, usuário, CA TLS por SHA-256, identidade do cluster, OIDs do banco e schema, produtor, chave ID, destino, criptografia, destinatário e limites temporais. Não aprende esses valores do recibo. DNS, poolers, proxies e failover transparente ficam fora do perfil suportado.

São usados três Secrets externos imutáveis: policy/CA, conexão e HMAC separado. O chart confere imutabilidade quando o lookup retorna o objeto; uma renderização offline não comprova existência, RBAC ou ownership. Runtime e migrador recebem apenas policy/CA e conexão, nunca HMAC. Somente produtor e hook montam a chave de autenticação. Root, DBA, administrador do cluster ou produtor comprometido estão fora da garantia: HMAC não substitui a autoridade inicial nem distingue sozinho clones físicos do banco.

### Vínculo entre identidade e bytes

O produtor abre transação somente leitura com snapshot repetível, confere TLS e identidade operacional e exporta snapshot. `pg_dump --snapshot` conecta ao mesmo endpoint direto e a sessão exportadora permanece aberta até a conclusão. Assim, a consulta e o dump não usam endereços independentes nem dependem de compatibilidade presumida com poolers.

O fluxo bruto recebe SHA-256 e contagem de bytes, passa por `pg_restore -l` e cifra em fluxo. O recibo básico permanece versão 1 e recebe extensão `origem`, com HMAC-SHA-256 do JSON canônico completo, exceto a própria assinatura. A assinatura cobre hashes exatos do dump bruto, artefatos cifrados e sidecars, identidade, snapshot, timestamps, escopo, produtor e hash da policy. A chave nunca é gravada no recibo, estado ou PVC.

### Gate operacional e configuração efetiva

O Job `backup-gate` executa em `pre-upgrade,pre-rollback`. O ConfigMap do script também é hook, com peso `-10`, anterior ao Job de peso `0`. O hook monta o PVC somente para leitura, policy/CA e HMAC separados; não recebe credenciais de banco ou transporte.

O gate aceita o conjunto autenticado compatível com a policy independente e confere assinatura, identidade, escopo, produtor, timestamps, ponteiro e hashes streaming de todos os artefatos. A leitura usa descritores regulares e blocos limitados. Recibos legados, `url-conservador`, policy/chave divergentes e conjuntos adulterados são recusados. Ausência de adoção ou perfil incompatível continua fail-closed; o perfil válido não é bloqueado incondicionalmente.

Runtime, migrador e produtor recebem explicitamente as três URLs da mesma chave `url` do Secret de conexão. O wrapper confere igualdade efetiva e identidade operacional antes de executar migrador ou entrada original do aplicativo. O chart recusa `extraEnvFrom` opaco, `extraEnv` reservado e conflitos de conexão/TLS/schema na configuração gerenciada. O parâmetro Prisma `schema` é removido somente da URL passada a libpq; runtime e migrador mantêm sua URL compatível com `pg`.

`--diagnosticar-integridade` continua separado e não autoriza rollout. A opção antiga `backupGate.ensaioSemProtecao=true` agora falha no template; a variável antiga também não contorna o hook. Confirmação remota é a observação registrada no instante da produção, não disponibilidade atual. Origem autenticada não prova recuperação ou compatibilidade de rollback.

### Volumes, retenção, contexto de segurança e fuso

- Banco e planilhas usam PVCs distintos, `-backup-banco` e `-backup-planilhas`, com `helm.sh/resource-policy: keep`.
- O estado do banco e os dumps ficam no PVC do banco; a trava privada fica em `/backups/.locks`.
- O perfil adotado exige produtor habilitado e PVC persistente. Fora do perfil, backup somente remoto exige destino e verificação efetivos, mas não fornece catálogo persistente ao hook.
- A referência usa UID/GID/fsGroup 1000, usuário não root, rootfs somente leitura, capabilities removidas, sem escalada ou token automático e `/tmp` gravável.
- Retenção padrão de 30 dias e mínimo de 30 conjuntos permite overrides positivos explícitos. Autenticar origem não libera expurgo: o produtor URL, inclusive adotado, continua sem exclusão local/remota neste recorte e exige monitoramento de capacidade.
- Os três CronJobs têm `timeZone` explícito, `America/Fortaleza` por padrão. Banco às 02:30 e planilhas às 03:00 por padrão.

### Rollout por checksum

O Deployment recebe `checksum/config`. Com Secret gerenciado, `checksum/secret` usa o conteúdo renderizado. Com `existingSecret`, usa lookup no cluster ou `existingSecretRevision` offline. Trocar o Secret geral fora do Helm exige atualizar essa revisão. Secrets de origem usam nomes versionados; alterar seus nomes altera o Pod e exige backup compatível com a policy nova.

## Verificação

- RED causal do hook antigo: recusou recibo autenticado válido por bloqueio incondicional; o hook novo aceitou o mesmo contrato e recusou adulteração, chave/escopo/policy/endpoint divergentes e legado.
- RED causal do produtor de HEAD: a URL com `schema` falhou no `pg_dump` real. O candidato remove apenas esse parâmetro da conexão libpq e produz assinatura compatível com o hook.
- Fluxo real em PostgreSQL 17 descartável: TLS com SAN IP, snapshot exportado, dump Bash, cifra age, `--verificar`, hook, descriptografia, hash bruto exato e recuperação de uma linha sintética em outro banco. Divergência de identidade impediu produzir evidência.
- Helm lint/template locais do perfil adotado e testes de conflitos de env, Secret HMAC separado, PVC obrigatório e override positivo da retenção.
- O driver Docker verifica imagem, labels próprias, rede `none`, ausência de portas e mounts do host e término real antes de remover somente seu contêiner. Não monta socket Docker dentro do contêiner.

Essas evidências são focalizadas, não uma execução do agregador global. Não foram exercitados cluster, kubeconform, publicação, Dropbox real ou transições reais de Helm. O guia de origem descreve as ferramentas extras de CI: Helm, OpenSSL, PostgreSQL servidor/clientes, age e util-linux, além de Node.

## Consequências e limites

O gate torna upgrades operacionais sob autoridade explícita e preserva a recusa de metadados autodeclarados. Isso exige manutenção de Secrets/RBAC, CA, IP fixo e identidade. Mudanças nesses valores exigem nova adoção e novo backup, não edição do recibo antigo.

A primeira instalação não executa `pre-upgrade`. Upgrades legados precisam preparar produtor novo, Secrets e backup no PVC antes do hook; não se deve depender da criação de recursos depois do próprio gate. A troca do PVC único antigo não migra seu conteúdo.

Um rollback pode selecionar hook e imagem antigos, ou nenhum hook. `--no-hooks`, manifests diretos e administradores podem evitar o gate. O chart não é admission controller, não protege retroativamente revisões antigas e não desfaz migrações. Compatibilidade da imagem antiga com banco migrado e recuperação precisam de validação própria antes de ação autorizada.

PVC local não é recuperação de desastre. ReadWriteOnce ainda pode atrasar o hook se o volume estiver em outro nó. Travas e leitura de inodes são cooperativas, não proteção contra root ou escrita hostil no mesmo inode. A verificação de origem deve ser chamada explicitamente por common, controlador ou retenção remota antes de usar recibos URL para decisões protegidas; transportar a extensão HMAC não autoriza essas ações por si só.
