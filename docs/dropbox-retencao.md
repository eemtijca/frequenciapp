# Retenção Dropbox opt-in

Guia do perfil opcional que usa o Dropbox como destino do backup do banco. O rclone continua sendo o transporte padrão e o único responsável pelo upload. Este documento cobre a adoção, o token, a pasta exclusiva, a autoridade local, o journal de expurgo e a restauração remota.

O backup do banco em si está em [backup-servidor.md](backup-servidor.md). A decisão de recuperação verificável está na [ADR-065](adr/065-atualizacao-e-recuperacao-verificaveis.md). O perfil Dropbox é independente do controlador de manutenção e pode ser usado sozinho ou junto com ele.

## Por que o perfil é opt-in

O perfil simples precisa funcionar apenas com rclone, GPG ou age e uma pasta remota. O Dropbox acrescenta um aplicativo OAuth, um token de longa duração, uma pasta exclusiva, um arquivo de adoção e um cliente nativo com regras próprias de autoridade e exclusão. Nada disso é necessário para uma escola que já usa rclone.

Por isso, a variável `BACKUP_DROPBOX_CONFIG` é o único interruptor do perfil. Quando ela não existe ou está vazia, o caminho rclone existente continua sendo usado sem erro. Quando ela aponta para um arquivo de adoção válido, o backup do banco passa a usar o cliente nativo apenas para verificar, listar, baixar e excluir. O upload continua em `rclone copy --immutable --checksum`.

O cliente nativo não tem rota de upload. As rotas fixas são limitadas a token, identidade da conta, metadados da pasta, listagem, download e exclusão. Qualquer necessidade de envio continua no rclone, o que evita reescrever o transporte, preserva a configuração existente e mantém o perfil simples como padrão.

O perfil Dropbox não altera o backup das planilhas. As planilhas continuam no caminho rclone atual, com origem, destino e retenção próprios.

O instalador executa a adoção com `sudo ./instalar.sh aplicar --perfil dropbox --config-dropbox <adocao> --arquivo-token-dropbox <token> --config-rclone <rclone> --destino <remoto> --sim`. A etapa `dropbox` roda antes do primeiro backup, valida a adoção e o hash do `rclone.conf`, grava `BACKUP_DROPBOX_CONFIG`, `BACKUP_RCLONE_CONFIG`, `BACKUP_REMOTO` e `BACKUP_RETER_REMOTO` no `ops.env` com modo 600 e mantém as planilhas no rclone. O primeiro backup continua sendo feito por `backup-banco.sh`, com upload rclone e verificação nativa.

## Banco no Dropbox e planilhas no rclone

| Conteúdo  | Transporte de envio | Variáveis principais                                             | Retenção                                                   |
| --------- | ------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------- |
| Banco     | rclone              | `BACKUP_REMOTO`, `BACKUP_RCLONE_CONFIG`, `BACKUP_DROPBOX_CONFIG` | Local e, com `BACKUP_RETER_REMOTO=true`, nativa no Dropbox |
| Planilhas | rclone              | `BACKUP_ORIGEM`, `BACKUP_DESTINO`, `BACKUP_RCLONE_CONFIG`        | Local e remota do caminho rclone existente                 |

Regras de separação:

- A pasta adotada pelo Dropbox pertence apenas ao backup do banco. Não usar a mesma pasta para planilhas, documentos, fotos ou arquivos manuais.
- `BACKUP_DESTINO` das planilhas nunca aponta para a pasta de `BACKUP_REMOTO` do banco.
- `BACKUP_DROPBOX_CONFIG` não é configurado no contêiner de planilhas. O cliente nativo não lista, não baixa e não exclui a pasta das planilhas.
- As planilhas podem usar o mesmo `rclone.conf`, desde que em seção e pasta diferentes. A seção adotada do banco é validada separadamente.
- Arquivos desconhecidos na pasta do banco são preservados pela retenção, mas ocupam espaço e dificultam o diagnóstico. A pasta deve permanecer exclusiva.

## O que o cliente nativo faz

O cliente nativo usa HTTPS com validação de certificado, TLS 1.2 ou superior, destinos fixos do provedor, sem redirecionamento e sem repetição automática de pedidos. Cada resposta tem limite de bytes e prazo absoluto.

Operações permitidas:

- **Identidade da conta e da pasta:** consulta a conta atual, confere o identificador da conta, o namespace raiz ou doméstico e os metadados da pasta. A pasta precisa ter o identificador, o caminho em minúsculas e não pode estar somente leitura.
- **Listagem:** lê apenas os filhos diretos da pasta adotada, com nome, identificador, revisão e tipo. A paginação é limitada e um cursor repetido interrompe a operação.
- **Download:** baixa um arquivo pelo identificador e pela revisão exata, com limite de bytes. Os metadados devolvidos precisam confirmar o mesmo identificador e a mesma revisão.
- **Exclusão condicional:** exclui pelo identificador e pela revisão do pai. A resposta precisa confirmar o mesmo identificador e a mesma revisão. Não existe exclusão por caminho.
- **Não há upload:** nenhuma rota de envio é implementada. O envio é sempre `rclone copy --immutable --checksum`, seguido de download de conferência e publicação do recibo.

A autoridade de pasta combina a identidade da conta, o namespace, o identificador da pasta, o caminho e a trava local. A exclusão só ocorre depois de a identidade ser conferida de novo e de o inventário permanecer exatamente igual ao observado. Uma mudança de revisão, de identificador ou de conjunto interrompe a operação.

## Token e escopos

### Escopos mínimos

O aplicativo do provedor deve ser criado com acesso limitado à pasta ou ao namespace usado pela escola. Os escopos suficientes para o cliente nativo e para o upload por rclone são:

| Escopo                | Uso                                              |
| --------------------- | ------------------------------------------------ |
| `account_info.read`   | Conferir a conta atual                           |
| `files.metadata.read` | Ler metadados e listar a pasta                   |
| `files.content.read`  | Baixar artefatos para conferência                |
| `files.content.write` | Excluir pelo cliente nativo e enviar pelo rclone |

`files.content.write` é o único escopo de escrita necessário. Evitar `files.metadata.write`, `account_info.write`, `sharing.read`, `sharing.write`, `team_data.*` e qualquer permissão de equipe. O cliente não renomeia, não move, não compartilha e não cria links. Não conceder acesso amplo à conta inteira quando a pasta exclusiva ou o acesso de aplicativo resolverem.

O token também pode ser usado pelo rclone. Se forem usados aplicativos diferentes para o cliente nativo e para o rclone, ambos precisam apontar para a mesma conta, o mesmo namespace e a mesma pasta. A adoção valida o namespace e o caminho, não o token do rclone.

### Obtenção

O cliente usa o fluxo de token de atualização (`refresh_token`). O token de acesso é obtido em tempo de execução e não é gravado. Para obter o token de atualização:

1. Criar um aplicativo com acesso limitado no console do provedor e marcar apenas os escopos mínimos.
2. Executar o fluxo de código de autorização com `token_access_type=offline`, usando o identificador e o segredo do aplicativo.
3. Guardar o `refresh_token` devolvido, o `client_id` e o `client_secret`.
4. Montar o arquivo privado do cliente nativo com os três valores. O token do rclone é outro formato e não substitui esse arquivo.

Exemplo de conteúdo do arquivo de token, sem valores reais:

```json
{
  "clientId": "IDENTIFICADOR_DO_APLICATIVO",
  "clientSecret": "SEGREDO_DO_APLICATIVO",
  "refreshToken": "TOKEN_DE_ATUALIZACAO"
}
```

O arquivo não contém token de acesso, URL, conta ou pasta. O token de acesso é solicitado ao provedor e mantido apenas em memória.

### Onde guardar

- Guardar o token em um diretório com modo 700, por exemplo `/etc/frequenciapp/dropbox`, e o arquivo com modo 600.
- O diretório e o arquivo precisam pertencer ao operador das rotinas ou a root. Links simbólicos são recusados.
- O caminho declarado em `tokenFile` precisa ser absoluto e sem link em nenhum componente.
- Não usar argumento de linha de comando, variável de ambiente, log, issue ou captura para o token.
- O `rclone.conf` também é um segredo. O perfil Dropbox exige arquivo comum, com modo 600, porque a adoção lê e compara o mapeamento. `RCLONE_CONFIG_PASS` não é aceito nesse perfil.
- O diretório que contém o `rclone.conf` também precisa ter modo 700 para a leitura privada. Se `/etc/frequenciapp` usa outro modo, colocar os arquivos do Dropbox e uma cópia do `rclone.conf` em um subdiretório 700 e apontar `BACKUP_RCLONE_CONFIG` para essa cópia. A cópia precisa conter também as seções usadas pelas planilhas. Quando o contêiner de planilhas usar a mesma cópia, ajustar `BACKUP_PLANILHAS_UID` e `BACKUP_PLANILHAS_GID` para um usuário que possa atravessar o diretório 700.

### Validação da conta e da pasta

O próprio cliente confere a identidade antes de qualquer exclusão. Para uma conferência manual antes da adoção, executar a partir da raiz do repositório:

```bash
BACKUP_DROPBOX_CONFIG=/etc/frequenciapp/dropbox/adocao.json \
  node --input-type=module -e '
    import fs from "node:fs";
    import { criarApiDropbox } from "./scripts/servidor/dropbox-api.mjs";
    const config = JSON.parse(fs.readFileSync(process.env.BACKUP_DROPBOX_CONFIG, "utf8"));
    console.log(await criarApiDropbox(config).identity());
  '
```

O comando valida o token, a conta, o namespace, o identificador da pasta, o caminho em minúsculas e a ausência de marcação de somente leitura. A saída contém identificadores da conta e da pasta. Não colar essa saída em issue ou relatório público.

Para conferir o caminho do rclone, usar a listagem do próprio rclone:

```bash
rclone lsf --max-depth 1 "$BACKUP_REMOTO"
```

A validação definitiva ocorre antes de qualquer exclusão. Uma conta, um namespace ou uma pasta divergente interrompem a operação.

## Arquivo de adoção

O arquivo apontado por `BACKUP_DROPBOX_CONFIG` é JSON privado, com modo 600 e diretório pai 700. Ele liga a conta, a pasta, o alvo do Compose, o banco, o schema e a configuração do rclone. Exemplo com valores fictícios:

```json
{
  "versao": 1,
  "adocao": "pasta-exclusiva-frequenciapp-v1",
  "accountId": "dbid:CONTA_FICTICIA",
  "namespaceId": "0000000000",
  "folderId": "id:PASTA_FICTICIA",
  "folderPath": "/frequenciapp/banco",
  "destino": "dropbox:frequenciapp/banco",
  "alvo": "CHAVE_DO_ALVO",
  "banco": "frequencia",
  "schema": "public",
  "limiteBytes": 1073741824,
  "timeoutMs": 30000,
  "minimoAutorizado": 5,
  "tokenFile": "/etc/frequenciapp/dropbox/token.json",
  "rcloneConfig": "/etc/frequenciapp/dropbox/rclone.conf",
  "rcloneConfigSha256": "0000000000000000000000000000000000000000000000000000000000000000",
  "authorityLock": "/var/lock/frequenciapp/dropbox-autoridade.lock",
  "targetLock": "/var/lock/frequenciapp/operacoes-CHAVE_DO_ALVO.lock"
}
```

Chaves e validações:

| Chave                | Validação                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| `versao`             | Inteiro 1                                                                                                     |
| `adocao`             | Texto exato `pasta-exclusiva-frequenciapp-v1`                                                                 |
| `accountId`          | `dbid:` seguido de letras, números, sublinhado ou hífen                                                       |
| `namespaceId`        | Apenas dígitos                                                                                                |
| `folderId`           | `id:` seguido de letras, números, sublinhado ou hífen                                                         |
| `folderPath`         | Caminho absoluto, em minúsculas, normalizado, sem barra final e sem caracteres de controle ou barra invertida |
| `destino`            | Igual a `BACKUP_REMOTO`, no formato `remoto:caminho`, e `/<caminho>` igual a `folderPath`                     |
| `alvo`               | Igual a `SERVIDOR_ALVO_CHAVE`, a chave de identidade do projeto Compose                                       |
| `banco`              | Igual a `BACKUP_BANCO_VERIFICADO`, o banco efetivamente conferido                                             |
| `schema`             | Igual a `DATABASE_SCHEMA`, com `public` quando não definido                                                   |
| `limiteBytes`        | Inteiro positivo, no máximo 1 TiB, por download                                                               |
| `timeoutMs`          | Inteiro entre 50 e 300000, em milissegundos                                                                   |
| `minimoAutorizado`   | Opcional; inteiro maior ou igual a zero, igual ao mínimo quando `BACKUP_RETER_MINIMO` for menor que 5         |
| `tokenFile`          | Caminho absoluto de arquivo privado 600                                                                       |
| `rcloneConfig`       | Caminho absoluto do `rclone.conf` original, arquivo privado 600                                               |
| `rcloneConfigSha256` | SHA-256 de 64 dígitos hexadecimais dos bytes do `rcloneConfig`                                                |
| `authorityLock`      | Arquivo comum privado 600 para a autoridade da pasta                                                          |
| `targetLock`         | Arquivo comum privado 600 igual a `SERVIDOR_LOCK_HERDADO` e ao descritor 9                                    |

O `alvo`, o `banco` e o `schema` impedem copiar a adoção para outro projeto Compose, outro banco ou outro schema. Uma mudança de projeto, de banco ou de schema exige nova adoção e nova conferência.

Para preencher `alvo` e `banco`, usar os valores que a rotina exporta depois de conferir a identidade do Compose e o banco efetivo. Não copiar esses valores de outra instalação.

`minimoAutorizado` não é variável de ambiente. Ele fica no arquivo privado para que a redução do mínimo não dependa de um valor exportado por engano. O valor é necessário apenas quando `BACKUP_RETER_MINIMO` for menor que 5 e precisa ser exatamente igual a esse mínimo.

`rcloneConfigSha256` fixa os bytes do arquivo original. O `rclone.conf` efetivo passado ao processo pode ser uma cópia temporária, mas precisa ter o mesmo mapeamento da seção adotada, exceto pelo token. Se o arquivo original mudar, a operação é suspensa até o hash ser recalculado e a adoção revista.

### Seção do rclone

O remote indicado em `destino` precisa existir no `rclone.conf` com tipo `dropbox` e o mesmo namespace da adoção. A seção aceita apenas estas chaves:

```ini
[dropbox]
type = dropbox
root_namespace = 0000000000
token = TOKEN_JSON_DO_RCLONE
client_id = IDENTIFICADOR_DO_APLICATIVO
client_secret = SEGREDO_DO_APLICATIVO
```

Regras:

- `type` precisa ser `dropbox`.
- `root_namespace` precisa ser exatamente o `namespaceId` da adoção.
- A seção não pode ter alias, `crypt`, `remote` ou opções implícitas.
- Chaves duplicadas, seções duplicadas e linhas fora do formato simples são recusadas.
- O mapeamento da seção no `rclone.conf` efetivo precisa ser igual ao do arquivo original, comparando todas as chaves exceto `token`.
- `BACKUP_REMOTO` e `destino` precisam apontar para a mesma pasta, com `folderPath` igual a `/<caminho>`. Uma barra final em `BACKUP_REMOTO` faz a comparação falhar.
- `RCLONE_CONFIG_PASS` precisa estar vazio. Configuração cifrada do rclone não é compatível com este perfil.
- O namespace do rclone é a âncora entre o upload e a pasta que o cliente nativo pode excluir. Namespace diferente bloqueia a retenção.

## Autoridade e marcador de upload

### `SERVIDOR_LOCK_HERDADO`

As rotinas de servidor usam uma trava por identidade de projeto em `/var/lock/frequenciapp/operacoes-<alvo>.lock`. A função `travar` abre o arquivo no descritor 9 ou reutiliza o descritor herdado, adquire `flock` e exporta `SERVIDOR_LOCK_HERDADO` com o caminho. O descritor herdado permite que o processo Node prove que está sob a mesma operação do Bash.

A adoção exige que `targetLock` seja exatamente `SERVIDOR_LOCK_HERDADO` e que o descritor 9 aponte para o mesmo dispositivo e inode. Caminho divergente, link simbólico ou descritor de outro arquivo interrompem a operação antes da rede. A trava é local ao host e coordena apenas processos cooperativos do mesmo projeto.

### Trava de autoridade

A `authorityLock` é uma segunda trava, específica da pasta Dropbox. Ela é adquirida com `flock` e mantida durante todo o upload rclone e durante toda a retenção. O objetivo é impedir que duas operações, mesmo de projetos diferentes, escrevam ou excluam na mesma pasta adotada.

No modo de upload, o processo pai adquire a autoridade, confere que não existe marcador nem `.tmp` de upload, cria uma prova de sessão em arquivo temporário já desvinculado e inicia o `backup-banco.sh` com os descritores da prova, da autoridade e da trava do alvo. O filho confere a sessão, o hash da configuração, o processo ancestral, os descritores em `/proc` e a contenção real do `flock` antes de continuar.

A autoridade é cooperativa. Ela não impede root, o grupo `docker`, um acesso direto ao daemon ou um processo que ignore as travas. Ela reduz o risco de duas rotinas honestas se sobreporem e de uma retomada adotar um estado que não pertence à operação.

### Marcador de upload

Antes de iniciar o filho, o pai grava `${authorityLock}.upload.json` com a versão, a sessão e o hash da configuração. O arquivo é criado de forma atômica, com modo 600, `fsync` do arquivo e do diretório. O marcador é a intenção durável de que um upload pode ter começado.

No fluxo automático, o marcador é removido apenas pela ação de publicação, depois de conferir:

- o recibo confirmado e o hash do catálogo persistente;
- o escopo do alvo, do banco, do schema e do destino;
- a igualdade entre a cópia do catálogo e a cópia local do recibo;
- o ponteiro `ultimo-backup.json`;
- a sincronização dos artefatos, do recibo, do ponteiro e dos diretórios.

Enquanto o marcador existir, nem um novo upload nem uma retenção começam. Um `.tmp` com prefixo do marcador também bloqueia. Isso transforma uma queda no meio do envio em uma parada conservadora, não em uma publicação presumida.

### Depois de queda de energia ou crash

1. Suspender a agenda de backup e não iniciar outra retenção.
2. Preservar o marcador, o journal, o catálogo, o diretório local e a pasta remota. Não apagar nem renomear esses arquivos para destravar a rotina.
3. Conferir o marcador e o ponteiro `ultimo-backup.json`. O `flock` é liberado pelo kernel quando o processo morre, mas o marcador permanece.
4. Executar `baixar-backup.sh` para baixar e conferir o conjunto apontado pelo ponteiro. Se o download e o checksum passarem, o conjunto remoto está completo. Conferir se o recibo do catálogo local e o ponteiro apontam para esse mesmo conjunto e, então, registrar a ocorrência e remover o marcador.
5. Se o download falhar, tratar como upload incompleto. Não remover o marcador, não promover o conjunto e não executar retenção. Preservar os artefatos para diagnóstico e restaurar a partir de uma cópia anterior conhecida.
6. Só remover um conjunto incompleto depois de confirmar que nenhum recibo ou ponteiro o referencia. A remoção manual é uma decisão registrada do operador, feita com rclone, e não uma ação automática das rotinas.
7. Depois da resolução, executar um novo backup e conferir o marcador removido, o recibo publicado e o ponteiro atualizado.

Nunca reconstruir a sessão, reutilizar a prova ou adotar um upload parcial. O marcador de uma sessão não serve para outra. Um `.tmp` de publicação também não é promovido a estado válido.

## Journal de expurgo

O journal do Dropbox fica em `ESTADO_DIR/expurgos/dropbox`, por padrão `/var/lib/frequenciapp/expurgos/dropbox`, com modo 700. Ele é separado do journal do caminho rclone para que a troca de transporte não converta um formato no outro.

Cada arquivo tem nome `<sha256>.json`, calculado a partir de `accountId|namespaceId|folderId|base`, e conteúdo com:

- `versao`: 1;
- `identity`: conta, namespace, pasta, destino, alvo, banco e schema;
- `reciboHash`: SHA-256 do recibo do conjunto;
- `itens`: nome, identificador e revisão de cada membro;
- `removidos`: quantidade de membros já removidos;
- `pendente`: índice do membro cuja exclusão foi iniciada, ou nulo.

A escrita é atômica: arquivo temporário privado, `fsync`, `rename` e `fsync` do diretório. Um crash antes do `rename` deixa o journal anterior intacto. Um arquivo `.tmp` no diretório faz a listagem falhar de forma fechada (fail-closed), porque o journal só aceita nomes de 64 dígitos hexadecimais com extensão `.json`.

Regras de retomada:

- Apenas o mesmo conjunto pode ser retomado. Um journal incompleto de outro conjunto bloqueia a operação; um journal concluído continua exigindo a ausência de todos os membros e bloqueia se algum reaparecer.
- O recibo referenciado precisa continuar existindo, ser válido e pertencer ao alvo, ao banco, ao schema e ao destino.
- Os membros já removidos precisam continuar ausentes. Um membro que reaparece bloqueia o próximo expurgo.
- Um `pendente` com objeto ausente é estado incerto: a ausência não prova que a exclusão foi efetivada pela rotina. A retenção falha e exige reconciliação independente.
- Um journal com identidade, recibo ou lista de itens divergente não é editado à mão. O catálogo e o journal são preservados para diagnóstico.
- Um `.tmp` só pode ser removido depois de confirmar que nenhum processo está em execução e que o journal correspondente e o estado remoto estão consistentes. Se não houver como provar isso, o arquivo é preservado.

O provedor não oferece transação entre a exclusão e a gravação local. Uma resposta perdida pode deixar o objeto removido e o journal com `pendente`. A rotina não converte essa ausência em sucesso e não repete a exclusão. A reconciliação é manual e registrada.

## Retenção

A política do Dropbox usa os mesmos limites do caminho rclone:

| Variável              | Padrão  | Efeito                                                          |
| --------------------- | ------- | --------------------------------------------------------------- |
| `BACKUP_RETER_DIAS`   | `30`    | Idade mínima para um conjunto ser elegível                      |
| `BACKUP_RETER_MINIMO` | `5`     | Conjuntos confirmados mais recentes sempre preservados          |
| `BACKUP_RETER_REMOTO` | `false` | Habilita a exclusão remota; sem `true`, nenhuma exclusão ocorre |
| `minimoAutorizado`    | ausente | Permite mínimo menor que 5 quando igual ao mínimo configurado   |

`BACKUP_RETER_DIAS=0` desativa a retenção remota e não cria journal. O mínimo precisa ser um inteiro maior ou igual a zero. No perfil Dropbox, um mínimo menor que 5 só é aceito quando `minimoAutorizado` tem exatamente o mesmo valor.

Seleção e conferência:

1. O catálogo persistente em `ESTADO_DIR/recibos` é lido por inteiro. Recibos inválidos bloqueiam a operação; recibos inelegíveis não contam no mínimo nem viram candidatos.
2. Apenas recibos do mesmo alvo, banco, schema, destino e com verificação remota entram na lista ativa.
3. Os conjuntos são ordenados do mais novo para o mais antigo. Os `BACKUP_RETER_MINIMO` conjuntos mais novos ficam protegidos.
4. Entre os restantes, são candidatos os que têm idade maior que `BACKUP_RETER_DIAS`. A rotina escolhe o mais antigo.
5. Antes de apagar, o inventário da pasta é lido e todos os conjuntos ativos são conferidos por download: cada artefato, cada sidecar `.sha256`, o recibo confirmado e os limites de bytes. O hash e o conteúdo do sidecar precisam bater.
6. Um conjunto com journal concluído precisa continuar ausente por inteiro. Um arquivo desconhecido, sem recibo, é preservado e não impede a conferência dos conjuntos ativos.
7. A exclusão é feita membro a membro, na ordem do recibo, com a intenção `pendente` gravada antes de cada pedido. A rotina confere a autoridade de novo, relê o inventário e exige que ele esteja idêntico ao anterior. Depois da exclusão, relê o inventário e exige que apenas o membro pedido tenha desaparecido. O recibo confirmado é o último membro.
8. A seleção é de um único conjunto por execução, com uma exclusão condicional por membro. O journal registra o progresso para que a próxima execução retome apenas os membros restantes do mesmo conjunto.
9. A retenção local continua sendo aplicada pelo caminho existente. A retenção Dropbox não altera o catálogo, o recibo nem o expurgo local.

Não há garantia de execução exatamente uma vez. Conflito de revisão, inventário alterado, resposta perdida, hash divergente, sidecar divergente ou limite excedido interrompem a operação e preservam o estado. O caminho rclone continua disponível quando `BACKUP_DROPBOX_CONFIG` não existe e usa a mesma política de mínimo e idade, com `rclone lsjson`, download por `rclone copy` e `rclone deletefile`.

## Falhas e diagnóstico

Parar e preservar catálogo, recibo, journal, marcador, diretório local e pasta remota em qualquer falha que envolva upload, autoridade, journal, identidade, inventário, hash ou exclusão. Não executar retenção em ciclo de repetição e não apagar artefatos para fazer a próxima execução passar.

Sinais comuns:

| Sinal                                                      | Causa provável                                                          | Ação                                                                            |
| ---------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Adoção, autoridade ou journal não comprovado               | Permissão, link simbólico, caminho, hash ou descritor divergente        | Conferir modo 600 e 700, dono, caminho absoluto, hash e `SERVIDOR_LOCK_HERDADO` |
| Autoridade ocupada                                         | Outra operação mantém o `flock`                                         | Aguardar ou identificar o processo; não remover a trava à força                 |
| Upload anterior pendente                                   | Marcador ou `.tmp` de upload presente                                   | Seguir o procedimento de queda e conferir o conjunto com `baixar-backup.sh`     |
| Identidade divergente                                      | Token de outra conta, namespace errado, pasta movida ou somente leitura | Conferir a conta e a pasta antes de qualquer exclusão                           |
| Inventário incompleto ou cursor repetido                   | Paginação interrompida ou resposta inesperada                           | Preservar; repetir apenas depois de conferir a pasta                            |
| Hash divergente, sidecar divergente ou limite excedido     | Corrupção, arquivo trocado ou limite pequeno                            | Preservar o conjunto; não apagar; revisar `limiteBytes`                         |
| Revisão mudou, concorrência detectada ou resultado incerto | Alteração durante a conferência ou resposta perdida                     | Parar; reconciliar o inventário e o journal manualmente                         |
| Intenção anterior não resolvida                            | Mais de um journal incompleto ou journal fora do candidato              | Preservar; resolver o journal antes de nova retenção                            |
| Diário inválido, sem recibo ou duplicado                   | Journal editado, recibo removido ou catálogo inconsistente              | Não editar o journal; restaurar o recibo correspondente ou escalar              |

Conferências úteis:

```bash
jq . /var/lib/frequenciapp/ultimo-backup.json
ls -la /var/lib/frequenciapp/expurgos/dropbox
rclone lsf --max-depth 1 "$BACKUP_REMOTO"
```

Não imprimir o token, o segredo do aplicativo ou o conteúdo integral do `rclone.conf` em log, issue ou terminal compartilhado. O journal contém identificadores de conta e pasta, não o token.

## Restauração remota

O acesso remoto do download usa apenas rclone. Ele não chama o cliente nativo do Dropbox e, por isso, funciona com qualquer destino configurado, inclusive o Dropbox adotado. A restauração depende de `BACKUP_REMOTO`, `BACKUP_RCLONE_CONFIG`, do estado em `ESTADO_DIR/ultimo-backup.json` e do `rclone`.

Fluxo de `scripts/servidor/baixar-backup.sh`:

1. Ler o recibo, o arquivo, o checksum e o destino do ponteiro `ultimo-backup.json`.
2. Recusar recibo legado, nome inválido, checksum inválido ou destino atual diferente do destino registrado.
3. Baixar o recibo para um estágio privado e conferir o nome, o destino e os artefatos listados.
4. Baixar todos os artefatos e conferir com `recibos.mjs conferir`.
5. Conferir o SHA-256 do dump e, quando existir, do arquivo de ambiente.
6. Mover o conjunto conferido para `--destino` ou manter o estágio privado e imprimir o caminho.
7. Com `--restaurar`, encaminhar o dump conferido para `restaurar.sh` com `--arquivo`, `--checksum` e `--confirmar`, além das opções seguintes.

Exemplo apenas de download e conferência:

```bash
scripts/servidor/baixar-backup.sh --destino /var/backups/frequenciapp/restauracao
```

O comando baixa o recibo, o dump, o arquivo de ambiente e os checksums, confere tudo e imprime o caminho do dump. O material fica no diretório informado para inspeção ou restauração posterior.

Executar o download como o usuário das rotinas, normalmente `frequenciapp`, ou com `sudo` quando o estado e o diretório de destino exigirem. O `restaurar.sh` também precisa de acesso ao Compose e ao banco. Não ampliar a permissão do estado ou do token para permitir o comando com outro usuário.

Exemplo de download, conferência e restauração:

```bash
scripts/servidor/baixar-backup.sh --destino /var/backups/frequenciapp/restauracao --restaurar
```

O `restaurar.sh` recebe o arquivo já conferido e executa a validação, a cópia de segurança do banco anterior e a troca. As opções seguintes a `--restaurar` são repassadas, por exemplo `--sem-copia`. Essa opção dispensa a cópia do banco anterior e é uma decisão explícita de risco.

Sem `--destino`, o estágio privado é mantido em caso de sucesso e o caminho é impresso. O estágio contém os artefatos e os checksums. Em falha, o estágio é removido para não ser confundido com um backup válido. Preferir `--destino` para um caminho estável e para a limpeza posterior.

O download não precisa de `BACKUP_DROPBOX_CONFIG`. Se o token nativo estiver indisponível, o rclone ainda pode baixar o conjunto. Manter o `rclone.conf` e o remote válidos é parte da recuperação.

## Backup não é recuperação

Um conjunto confirmado, com upload, download de conferência, hash e recibo, continua com `recuperacaoExercitada` em `false`. Cifra, transporte e listagem não provam que o dump restaura, que o schema e as migrações conferem ou que a aplicação volta a operar.

A recuperação só é considerada comprovada depois de um ensaio em instalação isolada, com a chave privada correta, `restaurar.sh`, comparação de dados agregados, schema, migrações, login e `/api/saude`. O procedimento de restauração e os critérios de conferência estão em [backup-servidor.md](backup-servidor.md). A retenção pode apagar uma cópia antiga depois de conferir o recibo e o download, mas essa conferência não prova a recuperação; o ensaio é a única prova.

## Limites

- **Grupo `docker` e root:** quem controla o daemon ou a conta root pode ler o token, ignorar as travas, abrir a pasta e apagar arquivos. A autoridade e o journal são proteções cooperativas, não uma barreira contra root.
- **DBA e acesso ao banco:** quem administra o PostgreSQL pode ler ou alterar os dados sem passar pelo backup. O backup não substitui controle de acesso ao banco.
- **Token:** o token de atualização dá acesso à pasta e aos escopos concedidos. O escopo `files.content.write` permite excluir. A pasta exclusiva limita o alcance, mas não protege contra um token comprometido. Rotacionar o token e revogar o aplicativo quando houver suspeita.
- **Pasta exclusiva:** a pasta não pode ser compartilhada com planilhas, documentos ou outros backups. A rotina preserva arquivos desconhecidos, mas eles não são catálogo, não entram na retenção e podem esconder um conjunto incompleto.
- **Configuração do rclone:** o perfil exige `rclone.conf` comum e `RCLONE_CONFIG_PASS` vazio. O arquivo e o token precisam de custódia equivalente à de uma chave privada.
- **Somente Compose:** a escrita Dropbox exige `BACKUP_MODO=compose`. O modo URL e o backup do Kubernetes continuam com rclone, PVC ou outro transporte.
- **Somente Linux:** a prova de autoridade usa `/proc`, `flock` e herança de descritores. O perfil não é portátil para sistemas que não ofereçam esses recursos.
- **Prazos e limites:** `timeoutMs` é absoluto por pedido e tem no máximo 300000 milissegundos. Um dump grande em link lento pode exceder o prazo e suspender a retenção. `limiteBytes` é por download e tem no máximo 1 TiB.
- **Provedor externo:** disponibilidade, limites de taxa e mudanças de API são externos. A rotina falha de forma fechada e preserva os artefatos, mas não garante continuidade do provedor.
- **Sem conta real no CI:** os testes usam servidor TLS local, token sintético, conta sintética e pasta sintética. Nenhum teste acessa uma conta Dropbox real, e nenhum dado de aluno entra na massa.

O perfil Dropbox não substitui uma cópia offline ou um segundo destino. A escola deve manter uma cópia fora do provedor quando a política de recuperação exigir independência de fornecedor.

## Checklist de adoção

1. Reservar uma pasta exclusiva para o backup do banco. Não usar a pasta das planilhas nem uma pasta pessoal.
2. Criar o aplicativo com os escopos mínimos e obter o token de atualização.
3. Gravar o arquivo de token com modo 600 em diretório 700.
4. Configurar o remote rclone do tipo `dropbox`, com o mesmo namespace e a mesma pasta, e conferir com `rclone lsf`.
5. Calcular o SHA-256 do `rclone.conf` e preencher o arquivo de adoção com todas as chaves.
6. Proteger a adoção e o `rclone.conf` com modo 600 e os diretórios pais com modo 700.
7. Definir em `ops.env` `BACKUP_REMOTO` igual a `destino`, `BACKUP_DROPBOX_CONFIG`, `BACKUP_RETER_REMOTO=true` quando a exclusão remota for desejada e `BACKUP_RETER_MINIMO` igual ou maior que 5, ou menor com `minimoAutorizado` correspondente.
8. Conferir a identidade da conta e da pasta com o comando de validação ou com um ciclo controlado.
9. Executar um backup manual e confirmar marcador removido, recibo publicado, ponteiro atualizado e arquivos presentes no destino.
10. Executar `backup-banco.sh --verificar` e um ciclo de retenção controlado em instalação de teste.
11. Fazer um ensaio de restauração em instalação isolada antes de considerar a recuperação comprovada.
12. Registrar conta, pasta, custódia do token, hash do `rclone.conf`, política de retenção e procedimento de reversão. Não registrar segredos.

## Checklist de reversão para o rclone

1. Suspender a agenda e confirmar que não há upload nem retenção em execução.
2. Resolver marcador e journal pendentes antes de trocar o transporte. Um journal Dropbox incompleto pode fazer a retenção rclone falhar por membros ausentes.
3. Remover ou comentar `BACKUP_DROPBOX_CONFIG`. Manter `BACKUP_REMOTO`, `BACKUP_RCLONE_CONFIG` e `BACKUP_RETER_REMOTO`.
4. Confirmar que o remote rclone continua apontando para a pasta correta e que o namespace e a conta são os esperados.
5. Preservar `ESTADO_DIR/expurgos/dropbox` para auditoria. O caminho rclone ignora o subdiretório e usa apenas os journals da raiz.
6. Revogar o token ou o aplicativo exclusivo do cliente nativo, se ele for separado do rclone. Se o rclone usa o mesmo aplicativo, não revogar antes de atualizar o `rclone.conf`; remover apenas o arquivo de token nativo e a adoção. Manter a custódia do `rclone.conf`.
7. Executar um backup e uma retenção controlada no caminho rclone, conferindo que nenhuma chamada nativa é feita.
8. Fazer um novo ensaio de restauração com o conjunto escolhido.

A reversão desliga a retenção nativa e a autoridade Dropbox, não move nem apaga os backups existentes. O rclone pode continuar usando o Dropbox como destino, desde que a configuração e a pasta permaneçam válidas.

## Referências

- [Backup do servidor](backup-servidor.md)
- [Auto-hospedagem](auto-hospedagem.md)
- [ADR-064: auto-hospedagem em servidor próprio](adr/064-auto-hospedagem-servidor.md)
- [ADR-065: atualização e recuperação verificáveis](adr/065-atualizacao-e-recuperacao-verificaveis.md)
- [ADR-070: catálogo e recibos de backup](adr/070-catalogo-e-recibos-de-backup.md)
