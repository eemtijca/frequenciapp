# Retenção Dropbox adotada

Contrato da retenção nativa dos backups Compose. Não cria conta, pasta, compartilhamento ou permissões no Dropbox. A adoção é uma decisão operacional do administrador, registrada fora do repositório. O expurgo continua bloqueado para outros provedores e para instalações sem adoção válida.

## Estado da entrega

O adaptador HTTPS, a CLI, o journal e o produtor Bash usam o protocolo de autoridade descrito abaixo. Os ensaios usam API Dropbox sintética em loopback, sem rede externa. Nenhuma credencial ou pasta real foi utilizada. Isso não valida conta real, rclone real ou PostgreSQL real.

O mapeamento INI exige a chave oficial `root_namespace`. O campo `root_namespace_id` da resposta JSON da API Dropbox não é uma chave de configuração rclone.

## Premissas e autoridade

- Uma pasta previamente criada é exclusiva dos backups deste FrequenciApp. A conta, o namespace, o ID estável e o caminho da pasta são adotados explicitamente. A API confere conta e namespace raiz ou pessoal, resolve a pasta por ID e confere seu caminho em minúsculas.
- Exclusividade é premissa operacional, não uma prova contra o proprietário da conta ou um administrador malicioso. Operador, root e arquivos de adoção são confiáveis. Não há garantia contra um escritor externo que ignore o protocolo.
- Todos os escritores cooperativos da pasta precisam usar a mesma autoridade. O produtor de backup Compose mantém o mutex durante upload rclone de artefatos, publicação do recibo, persistência local e expurgo. Restauração lê a pasta; ferramentas externas de manutenção que escrevem nela devem aderir ao protocolo ou operar fora da janela de backup. A pasta exclusiva de banco não pode ser usada por uploads de planilhas ou outros clientes que não participam deste protocolo.
- `authorityLock` é um arquivo estável, previamente provisionado, em armazenamento local com semântica Linux `flock`. Não pode ser substituído ou removido durante operações. Não se admite NFS nem múltiplas máquinas independentes apenas repetindo o mesmo nome de arquivo.
- A ordem é trava do alvo, depois autoridade Dropbox. `dropbox-autoridade.mjs` mantém o lock no processo pai e inicia o Bash operacional fixo no mesmo diretório. O Bash filho e o expurgador recebem o mesmo descritor 7 da autoridade e o descritor 6 de uma prova privada desvinculada, aberta apenas para leitura. O descritor 9 continua vinculado à trava do alvo.
- O handoff confere sessão aleatória, hash da adoção, UID, ancestral vivo, descritores do dono, dispositivo e inode, contenção por abertura independente e sucesso de `flock` no descritor compartilhado. `BACKUP_DROPBOX_SESSAO` é apenas um seletor: sem essas provas não autoriza nada. O expurgador herdado não readquire a trava; a CLI independente espera pela mesma autoridade, com limite `timeoutMs`. Não há liberação entre upload e expurgo.

## Arquivos privados

Configuração, credenciais OAuth, configuração rclone e locks devem ser arquivos regulares, sem symlinks, com modo `0600`, pertencentes a root ou ao operador efetivo. Os diretórios privados usam `0700`; catálogo e diários pertencem ao operador. Caminhos devem ser absolutos, sem componentes que resolvam por symlink. Não colocar esses arquivos no Git, na imagem, em argumentos de processo ou em logs.

O arquivo indicado por `BACKUP_DROPBOX_CONFIG` tem este formato ilustrativo. Identificadores e hashes abaixo são exemplos, não valores para adoção:

```json
{
  "versao": 1,
  "adocao": "pasta-exclusiva-frequenciapp-v1",
  "accountId": "dbid:CONTA_CONFERIDA",
  "namespaceId": "123456789",
  "folderId": "id:PASTA_CONFERIDA",
  "folderPath": "/frequenciapp",
  "destino": "dropbox:frequenciapp",
  "alvo": "IDENTIDADE_COMPOSE_CONFERIDA",
  "banco": "escola",
  "schema": "public",
  "tokenFile": "/caminho/privado/oauth.json",
  "rcloneConfig": "/caminho/privado/rclone.conf",
  "rcloneConfigSha256": "HASH_SHA256_DO_ARQUIVO_ADOTADO",
  "authorityLock": "/caminho/privado/dropbox.lock",
  "targetLock": "/caminho/privado/locks/operacoes-IDENTIDADE_COMPOSE_CONFERIDA.lock",
  "limiteBytes": 10737418240,
  "timeoutMs": 120000
}
```

`namespaceId` deve corresponder ao namespace raiz ou pessoal da conta retornada por `users/get_current_account`. Esta versão não adota namespaces arbitrários de pastas compartilhadas. `folderPath` não pode ser a raiz; `destino` deve mapear diretamente o nome do remoto rclone para esse caminho. Alias, crypt, configuração rclone cifrada e opções adicionais não adotadas são recusados.

O contrato oficial do rclone usa:

```ini
[dropbox]
type = dropbox
root_namespace = 123456789
```

O operador confere esse mapeamento e registra o SHA-256 do arquivo original completo. A cópia efetiva recebida em `RCLONE_CONFIG` deve manter a mesma seção e todas as opções adotadas, exceto `token`: o rclone pode renovar esse campo na cópia privada. Mudança de namespace, tipo, cliente ou opção não é tratada como renovação de token. Alteração do arquivo original exige nova adoção do hash.

`tokenFile` contém somente `clientId`, `clientSecret` e `refreshToken`, todos strings não vazias. O refresh é enviado por HTTPS a `https://api.dropbox.com/oauth2/token`, com `grant_type=refresh_token`. O access token fica apenas em memória e não é gravado no journal. O provisionamento OAuth e a concessão de escopos são externos ao expurgador. São necessários `account_info.read`, `files.metadata.read`, `files.content.read` e `files.content.write`, com refresh token de acesso offline.

## Integração na CLI existente

Exportar `BACKUP_DROPBOX_CONFIG` no ambiente do processo que inicia o Bash. A adoção não é inferida do nome do remoto ou de flags de retenção:

```bash
export BACKUP_DROPBOX_CONFIG=/caminho/privado/dropbox-retencao.json
bash scripts/servidor/backup-banco.sh
```

O Bash mantém a entrada existente:

```bash
node scripts/servidor/backup-recibos.mjs expurgar-remoto catalogo diarios
```

Continuam obrigatórios `BACKUP_MODO=compose`, `BACKUP_CATALOGO_PERSISTENTE=true`, `SERVIDOR_ALVO_CHAVE`, `BACKUP_BANCO_VERIFICADO`, `DATABASE_SCHEMA`, `BACKUP_REMOTO`, `RCLONE_CONFIG` e o descritor 9 correspondente a `SERVIDOR_LOCK_HERDADO`. O Bash já fornece esses campos; `targetLock` os vincula à adoção. O diretório do journal não pode conter diários genéricos legados ou arquivos estranhos. Não migrar intenções antigas automaticamente.

Módulos operacionais são resolvidos pelo diretório instalado dos scripts, não por `APP_DIR`, que identifica somente o checkout da aplicação. O perfil URL com adoção Dropbox continua suspenso para escrita e retenção: um prefixo `url-autenticado` não comprova HMAC. O produtor e a configuração independente de origem URL permanecem inalterados; suportar retenção URL exigiria `verificarReciboAutenticado` com a política independente, não apenas inspeção de nomes.

`BACKUP_RETER_DIAS=0` desativa novas exclusões na CLI. O mínimo padrão é 30. Valores maiores ou iguais a 30 são aceitos normalmente. Para reduzir o mínimo, o administrador precisa registrar `minimoAutorizado` com o inteiro exato no arquivo de adoção e definir o mesmo valor em `BACKUP_RETER_MINIMO`. Por exemplo, um override autorizado de zero não autoriza implicitamente o valor um. Alterar o ambiente sozinho não reduz o mínimo remoto.

## Transporte e seleção

As únicas origens são `api.dropbox.com`, `api.dropboxapi.com` e `content.dropboxapi.com`, na porta 443. TLS exige validação de certificado e no mínimo TLS 1.2. Não há override de origem por ambiente, proxy configurável, redirecionamento ou repetição automática de pedido. Erros HTTP, autenticação, timeout, resposta inválida e inventário incompleto suspendem a rodada.

O cabeçalho é limitado a 16 KiB, o JSON RPC a 4 MiB e o token a 64 KiB. Downloads têm limite aplicado no stream durante recepção, com backpressure, deadline absoluto e timeout de inatividade. Sidecars usam limite exato e recibos usam no máximo 1 MiB. `limiteBytes` limita cada artefato, não o conjunto inteiro. Inventários paginam até completar, com teto de páginas e objetos e recusa de cursores repetidos.

O núcleo valida o catálogo inteiro, separa recibos do mesmo alvo, banco, schema e remoto, e só conta conjuntos verificados remotamente. Baixa e confere os hashes dos conjuntos ativos por ID e revisão. Arquivos sem recibo, pastas, recibos de outro escopo e conjuntos incompletos nunca autorizam exclusão. Não há exclusão por prefixo ou limpeza recursiva.

Cada rodada remove no máximo um conjunto: o mais antigo além do mínimo, com idade estritamente maior que a janela configurada. Mantém os mais novos. Cada membro é removido por `files/delete_v2` com `parent_rev`; o recibo remoto fica por último. Uma revisão substituída não é apagada. Conta, pasta, autoridade e inventário são conferidos novamente antes das mutações, e o resultado é lido de volta antes de confirmar progresso.

## Journal e retomada

Antes de iniciar o produtor, o pai grava `${authorityLock}.upload.json` com `fsync` de arquivo, `rename` e `fsync` do diretório. Erro de upload ou publicação deixa essa intenção privada e bloqueia produtores e expurgadores seguintes antes de acessarem a API. O filho sincroniza artefatos locais, recibo no catálogo, recibo local, ponteiro e diretórios antes de retirar a intenção. Não há adoção automática de upload parcial nem descarte de intenção por idade. Uma falha de expurgo posterior à publicação conserva o journal de exclusão e permite somente a retomada segura já definida abaixo.

Cada journal é vinculado à conta, namespace, pasta, recibo original e lista exata de IDs e revisões. A escrita usa arquivo temporário exclusivo `0600`, `fsync` do arquivo, `rename` e `fsync` do diretório. O catálogo histórico e os diários concluídos não são removidos.

A intenção é persistida antes de cada delete. A confirmação exige resposta válida e inventário posterior igual ao anterior menos aquele arquivo. Falha antes de transmitir pode ser retomada se o mesmo objeto e revisão continuam presentes e os conjuntos protegidos continuam íntegros. Membros já confirmados não são repetidos.

Ausência após pedido incerto não comprova quem excluiu. Timeout de delete, resposta perdida, crash antes da confirmação ou arquivo temporário residual bloqueiam novas exclusões. A retomada não apaga outro conjunto para contornar a pendência. Reaparecimento de membro concluído, perda do recibo independente ou corrupção do mínimo também bloqueiam.

Não editar o diário para converter ausência em sucesso. Preservar os arquivos e reconciliar a causa por evidência independente antes de qualquer intervenção administrativa. Não existe comando de adoção automática de exclusões incertas.

## Provas isoladas

A API de teste usa TLS real, certificado sintético e o mesmo adaptador HTTP/HTTPS de produção. Somente o preload no processo de teste redireciona a conexão para loopback e instala a CA sintética; o código operacional não possui esse override. O helper recusa qualquer interface de rede não interna. Nenhum teste acessa conta real, sockets Docker ou serviços do host.

Com a imagem de testes já preparada e conferida:

```bash
docker run --rm --network none --read-only --cap-drop ALL \
  --security-opt no-new-privileges --user 1000:1000 \
  --tmpfs /tmp:rw,exec,nosuid,nodev,size=512m \
  -e HOME=/tmp -e TMPDIR=/tmp -v "$PWD":/repo:ro -w /repo \
  --entrypoint node frequenciapp-test-backup-flock:isolado \
  --test tests/servidor/dropbox-nativo.test.mjs \
  tests/servidor/dropbox-upload.test.mjs \
  tests/servidor/dropbox-retencao.test.mjs \
  tests/servidor/retencao-remote-segura.test.mjs
```

O wrapper `tests/unidade/infra/operacao-catalogo-cli.test.ts` executa o cenário Bash/Node/FS/HTTPS, reconcilia títulos TAP, totais sem skips e testemunha com nonce e hashes dos arquivos envolvidos. As fixtures de Docker, PostgreSQL, cifra, rclone e API são falsas; isso não prova esses serviços reais. A suíte cobre duas rodadas com mais de 30 conjuntos, erros/token, timeout, excesso de bytes em stream real, conflito de revisão, paginação, crash em journal, mutex, corrupção do mínimo e retomada conservadora.

O cenário de upload interrompe o rclone falso após o primeiro artefato, inicia outro produtor e dois expurgadores e verifica ausência de acesso Dropbox e de segundo upload nessa janela. Depois libera o produtor e exige conclusão dos quatro processos sem deadlock. As variantes de erro do upload e de `fsync` do catálogo exigem zero deletes e preservação da intenção. Trata-se de concorrência local cooperativa em Linux, não de exclusão distribuída entre hosts.

## Referências

- [Especificação oficial de arquivos Dropbox](https://github.com/dropbox/dropbox-api-spec/blob/main/files.stone), especialmente `DownloadArg`, `DeleteArg.parent_rev` e `DeleteResult`.
- [Namespace no cabeçalho Path Root](https://docs.dropboxapi.com/dropbox-api/docs/technical-reference/path-root-header-modes).
- [Backend Dropbox do rclone](https://rclone.org/dropbox/#dropbox-root-namespace).
