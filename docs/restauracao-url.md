# Restauração URL com ensaio próprio

O perfil `postgres-direto` cria um banco de ensaio exclusivo no mesmo servidor direto do destino. Não aceita uma URL externa como autoridade de descarte. O contrato pressupõe operador, servidor e dump confiáveis; não oferece isolamento contra DBA malicioso ou dump SQL hostil.

## Estado da validação

O ciclo unitário com clientes simulados está aprovado. A primeira prova PostgreSQL 17 real expôs um defeito de transporte: o cliente `psql` precisa receber a URI por `--dbname`, não somente por `PGDATABASE`. A integração real ainda não está aprovada. Não habilitar o fluxo como rotina validada enquanto esse defeito e o ensaio real não estiverem concluídos. O journal registra a falha antes de criação ou escrita no destino.

## Perfil suportado

- PostgreSQL 17, endpoint direto e estável que respeite o nome do database em cada conexão. Não usar pooler ou endpoint que selecione uma base fixa.
- Role de operação com `CREATEDB` ou superusuário, permissão de conexão no destino e propriedade dos objetos que serão substituídos. Não é necessário superusuário para o perfil; não conceder privilégios automaticamente quando a checagem falhar.
- `BACKUP_DATABASE_URL`, ou `DIRECT_URL` como fallback, com host e usuário explícitos. Nome de banco e schema aceitam identificadores simples com até 63 caracteres.
- Parâmetros de URI aceitos: `sslmode`, `sslrootcert`, `sslcert`, `sslkey`, `channel_binding`, `connect_timeout` e `application_name`, sem duplicação. Parâmetros de roteamento e `options` são recusados. O perfil não herda `PGHOST`, `PGOPTIONS`, `PGSERVICE` ou hooks Node do chamador para clientes PostgreSQL.
- `ESTADO_DIR` privado, pertencente ao operador e com modo `700`. O fluxo não corrige permissões inseguras automaticamente e não aceita links simbólicos nos componentes desse caminho.
- Node, Bash, utilitários de servidor e clientes PostgreSQL 17 disponíveis. A captura, checksum e eventual decifra continuam no restaurador, antes do ensaio.

Configuração operacional, em arquivos privados já usados pelas rotinas:

```bash
BACKUP_MODO=url
BACKUP_RESTAURACAO_PERFIL=postgres-direto
# BACKUP_DATABASE_URL ou DIRECT_URL: preencher somente no arquivo privado.
# Remover BACKUP_RESTAURACAO_URL_VALIDACAO, inclusive quando for alias do destino.
```

Invocação após aprovação do ensaio real:

```bash
scripts/servidor/restaurar.sh --arquivo /caminho/privado/dump --checksum SHA256 --confirmar
```

A URL de validação legada agora causa recusa antes de clientes, lock e backup. Essa recusa inclui URLs iguais, percent-encoding do mesmo nome, outro endereço e outro nome de banco. Nenhuma delas é restaurada como ensaio. A ausência de perfil também é recusada. A opção `--sem-validacao` mantém a decisão explícita de dispensar o ensaio, com aviso; não dispensa identidade, checksum, captura privada nem cópia de segurança por padrão. `--sem-copia` é uma decisão independente.

## Identidade e propriedade

A rodada gera `freq_ensaio_` seguido de 32 caracteres hexadecimais aleatórios e um marcador secreto de 256 bits. Antes de `CREATE DATABASE`, persiste a intenção no journal. Cria a base com `template0`, sem `IF NOT EXISTS`, e grava seu marcador no comentário da base.

Antes de restaurar, consulta o catálogo pelo nome criado e abre uma conexão pelo mesmo nome aleatório. Exige nome efetivo, OID, dono, usuário, marcador, versão e identidade do servidor coerentes, além de OID distinto do destino. Um endpoint que ignore o nome da base falha antes de receber o dump. O dump vem de descritor aberto sobre a captura privada; o caminho original não é reaberto pelo ensaio.

O ensaio restaura sem `--create` e sem `--clean` em sua base nova, com transação única e parada em erro. Confere histórico de migrações e tabelas. A compatibilidade das migrações preserva a regra de prefixo do checkout e a exceção explícita `RESTAURAR_PERMITIR_MIGRACOES_DIVERGENTES=true`.

Reconfere identidade e marcador após restauração e antes do descarte. Só então executa `DROP DATABASE` pelo nome próprio, sem `FORCE`, sem encerrar sessões alheias e sem expurgar por prefixo. Confirma ausência no catálogo antes de registrar sucesso. Nome parecido, journal antigo ou banco que já existia não autorizam adoção ou exclusão.

Essas verificações comprovam seleção e propriedade no modelo de endpoint confiável. Não comprovam independência física de armazenamento e não protegem contra DBA, DNS ou endpoint deliberadamente maliciosos.

## Auditoria, falhas e recuperação

Cada rodada preserva `ESTADO_DIR/ensaios-url/rodada-*/journal.json`, modo `600`, em diretório próprio `700`. O journal inclui intenção, fase, OIDs, dono, marcador secreto, hash do endpoint sem senha, hash do dump e código/sinal de cada cliente confirmado. Não publicar o journal: o marcador é prova privada de propriedade. Os logs operacionais não incluem URL completa, credencial, SQL ou stderr bruto do servidor.

- Falha antes da primeira escrita no destino não dispara restauração automática nem cópia de volta.
- Falha de criação, marcação, validação, identidade, sinal ou timeout preserva a rodada e qualquer recurso possivelmente criado. Mesmo que o comando possa ter falhado antes de criar, não tentar adotar ou apagar por nome.
- Divergência de OID, dono, marcador ou servidor bloqueia novas mutações. Não usar `DROP DATABASE ... FORCE` como recuperação automática.
- Falha depois do início de `pg_restore` no destino tem resultado operacional incerto e exige intervenção manual. `ultima-restauracao.json` registra `destinoEscritaIniciada` e `resultadoIncerto`. Transação única reduz efeitos parciais, mas não permite concluir, apenas pelo código do cliente, se houve commit.
- SIGINT e SIGTERM preservam códigos convencionais 130 e 143; não há limpeza destrutiva em trap de erro. SIGKILL ou queda do host podem deixar o journal na última intenção durável.

Na inspeção manual, conferir o endpoint direto, nome, OID, proprietário e marcador do journal contra o catálogo e contra uma conexão selecionada pelo nome. Conferir também atividade e resultado da criação. Qualquer divergência exige preservar o recurso e investigar. O procedimento não fornece comando automático para limpar journals antigos nem converte parada de contêiner em autorização para remoção.

## Ensaio sintético verificável

```bash
node --test tests/servidor/restauracao-url.test.mjs
bash tests/servidor/restauracao-url.sh --executar
```

O segundo comando não usa URL real, `.env`, socket Docker dentro do executor, portas publicadas ou rede externa de runtime. Exige daemon Docker local e as imagens locais fixadas por digest no harness: PostgreSQL 17.11 e runner Node com Bash, clientes PostgreSQL 17 e `flock`. Imagens ausentes, cliente ausente e guardas não atendidas causam erro, nunca skip.

O launcher copia somente fontes allowlist para snapshot com hashes, monta esse snapshot somente para leitura e inspeciona imagem, ambiente efetivo, mounts, privilégios, recursos e rede dos IDs criados. Banco usa `network none`; runner compartilha somente esse namespace. Confere loopback, ausência de rotas e socket Docker, listener PostgreSQL local único e inode do namespace antes do primeiro SQL.

O teste real exige servidor inicial vazio e só então cria dados sintéticos. Cobre caminho positivo, URL externa da mesma base, alias, checksum errado, role sem `CREATEDB` e erro no destino com estado controlado por transação. O ensaio usa `--sem-copia`, portanto não comprova o produtor de backup, cifra ou transporte remoto. Os testes de checksum, captura e cópia preservada com clientes simulados são evidência separada. O snapshot não inclui dados ou migrações reais do aplicativo; a prova positiva é de restauração e isolamento do perfil, não de migração completa da aplicação.

Cada execução informa o diretório privado de evidências, com IDs, manifesto e resultado. Após sucesso, para somente seus recursos cuja identidade ainda confere e os preserva sem remoção. Após falha ou negação, não tenta limpar, remover ou adotar nada. O código do cliente e o término do executor são verificados; nenhum log acompanhado isoladamente equivale a aceite. Sem `--executar`, o launcher recusa antes de Docker, sem aparentar sucesso.
