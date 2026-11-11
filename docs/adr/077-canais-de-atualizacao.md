# ADR-077: canais de atualização release e main

## Estado

Aceita em 2026-11-11. Implementação na tarefa P4.5 do plano mestre.

## Contexto

O `scripts/servidor/atualizar.sh` já trabalha com os modos `auto`, `release` e `main`. O modo `auto` usa a branch principal enquanto não houver tag e passa a release quando uma tag contém o commit implantado. A escola deste ciclo está na `main` e precisa migrar para tags estáveis sem perder o histórico, o backup e a possibilidade de recuperação.

A troca de canal mexe em quatro coisas ao mesmo tempo: a tag e o commit, a imagem e o digest, as migrações do banco e o perfil do controlador. Uma tag antiga pode não conter as migrações atuais. Um release pode mudar o `migradorSha256` e invalidar os pins do controlador. Um backup anterior é a única forma de voltar o banco depois de uma migração aplicada.

O instalador precisa de um estado que diferencie a preferência de canal da instalação em execução. Também precisa de regras claras para downgrade, compatibilidade, backup e readoção do controlador, sem transformar `--forcar` em autorização universal.

## Decisão

### Canais

- O canal `release` é o padrão de produção. Ele usa tag estável no formato `vX.Y.Z`, imagem publicada no GHCR e o perfil de migrador correspondente.
- O canal `main` é explícito e exige `--permitir-instavel`. Ele é marcado como instável em `situacao`, `diagnosticar` e no JSON.
- O instalador expõe apenas `release` e `main`. O modo `auto` permanece no `atualizar.sh` por compatibilidade, mas não é gravado como canal do instalador.
- A tag e o digest são registrados no estado. A release usa tag imutável e a imagem é conferida por digest. `latest` não é usado como estado de produção.
- A atualização automática por timer fica desabilitada por padrão. Quando habilitada, usa `release` salvo configuração explícita de `main` com `--permitir-instavel`.

### Estado

- O estado do instalador fica em `/var/lib/frequenciapp/instalacao.json`, modo 600, sem segredos.
- O estado grava `canal`, `tag`, `commit`, `imagem`, `digest`, `schema`, `migradorSha256`, `instaladoEm`, `atualizadoEm`, perfil, etapas, controlador e ponteiro de backup.
- O `estado.json` continua pertencendo ao `atualizar.sh` e registra a última atualização aplicada. O instalador não sobrescreve esse arquivo.
- A preferência de canal pode divergir da instalação em execução. `situacao` mostra a preferência, a versão instalada e a diferença.
- A escrita do estado é atômica. Estado corrompido ou divergente produz `E_VALIDACAO`, e `--forcar` não o transforma em estado válido.

### Operação

- `canal mostrar` lê o estado e mostra canal, tag, commit, imagem, digest e pendência do controlador.
- `canal definir` sem `--aplicar` grava apenas a preferência. Não altera containers, imagem, ambiente ou dados.
- `canal definir --aplicar` exige backup confirmado, valida a compatibilidade e delega ao `atualizar.sh`. Depois da saúde, atualiza `instalacao.json`, `estado.json` e `ops.env`.
- A ordem é obrigatória: backup, validação da tag e do digest, validação das migrações, atualização, saúde, estado e controlador.
- A troca de `main` para `release` é permitida quando a tag contém o commit atual ou é descendente dele.
- A preferência só é considerada aplicada depois que a atualização e a conferência de saúde terminam com sucesso.

### Downgrade e compatibilidade

- Downgrade é a tag cujo commit é ancestral do commit instalado. Alvo sem relação de ancestralidade comprovada também é tratado como downgrade.
- O instalador recusa downgrade com `E_CANAL` e saída 78.
- A exceção exige `--permitir-downgrade`, backup confirmado, confirmação explícita e compatibilidade de migrações.
- O instalador recusa a descida quando o release alvo não contém todas as migrações já aplicadas, quando o estado do banco é incerto, quando o backup não foi confirmado, quando o journal do controlador está incerto ou quando a imagem e o digest não são imutáveis.
- Migração aplicada não é desfeita por downgrade de imagem. A recuperação do banco usa o backup anterior e `restaurar.sh`.
- Se o release alvo não contiver as migrações atuais, a troca espera um release compatível ou exige a restauração do backup anterior.
- O `--permitir-migracoes` confirma a aplicação de migrações novas, mas não autoriza downgrade nem ignora a ordem das migrações.

### Controlador

- O controlador é opt-in e não bloqueia o perfil simples.
- O estado registra `controlador.adotado`, `controlador.migradorSha256` e `controlador.readocaoPendente`.
- Quando o `migradorSha256` muda, o marcador do controlador é invalidado, o controlador fica parado e journal e pins são preservados.
- `situacao` e `diagnosticar` mostram `E_CONTROLADOR` até a readoção.
- A readoção usa `aplicar --perfil controlador`, depois da revisão do journal, do backup, do novo hash e dos pins.
- O `--forcar` não dispensa a readoção e não ignora journal incerto.
- O controlador é proteção cooperativa, não barreira contra root, DBA ou acesso direto ao daemon do Docker.

### Falha e recuperação

- O backup antes da troca é obrigatório no caminho simples e no controlador, salvo decisão explícita de risco registrada.
- Falha depois de migração não inicia automaticamente a imagem anterior. O estado preserva a etapa, o código e a indicação de migração possivelmente aplicada.
- A recuperação usa o backup confirmado e o procedimento de [backup-servidor.md](../backup-servidor.md).
- A retomada de uma troca interrompida usa `--retomar` ou `--desde-etapa`, sem limpeza destrutiva.
- O estado de canal, tag e commit é atualizado somente depois da conferência de saúde.

### Transição de main para release

1. Executar `canal definir release --tag vX.Y.Z --planejar` e revisar o plano.
2. Confirmar que a tag contém o commit atual ou é descendente dele.
3. Confirmar que o release contém todas as migrações aplicadas.
4. Executar `canal definir release --tag vX.Y.Z --aplicar --sim`.
5. Conferir a saúde, a versão e o estado.
6. Revisar o controlador e executar a readoção quando o hash tiver mudado.

## Alternativas consideradas

### Manter apenas `main`

Seria simples para a escola atual, mas produção ficaria sujeita a commits não lançados. A tag estável permite auditoria, reprodução e suporte.

### Manter apenas `auto`

O modo `auto` decide sozinho quando a branch vira release. A troca implícita dificulta prever qual código e qual migração estão em produção. O instalador exige uma escolha explícita.

### Usar `latest`

`latest` é mutável e não identifica o commit nem o conjunto de migrações. O estado precisa de tag e digest imutáveis.

### Permitir downgrade por padrão

Uma imagem antiga sobre um banco migrado pode perder dados ou falhar na inicialização. A descida exige autorização, backup e compatibilidade.

### Readoção automática do controlador

O hash do migrador muda por motivo relevante. A readoção automática esconderia a revisão do journal, dos pins e do release alvo. A decisão fica explícita.

### Um único arquivo de estado

O `estado.json` do atualizador e o `instalacao.json` do instalador têm donos e ciclos diferentes. Unificar os dois misturaria a última atualização com o plano de instalação e dificultaria a recuperação.

### Atualização sem backup

O rollback de imagem não desfaz SQL. O backup confirmado é o único caminho de recuperação do banco.

### Canal gravado apenas em `ops.env`

O ambiente é editável e não tem histórico de etapas, hashes e recibos. O estado durável é necessário para auditoria e retomada.

## Consequências

### Positivas

- Produção passa a usar tags estáveis e imagens identificadas por digest.
- A troca de canal tem backup, validação de migração, saúde e estado.
- O downgrade deixa de ser um acidente e passa a ser uma decisão registrada.
- O controlador não continua ativo com hash de migrador divergente.
- A preferência de canal fica separada da versão em execução, o que permite planejar a transição.
- A recuperação depois de migração tem caminho documentado.

### Negativas e riscos

- A operação exige disciplina de tags, releases e backups.
- A readoção do controlador é manual e pode atrasar a troca.
- O backup passa a consumir espaço e tempo antes de cada atualização.
- A tag pode existir sem release compatível, e a espera por um release novo bloqueia a troca.
- O estado precisa ser protegido e incluído na rotina de recuperação.
- O canal `main` continua disponível e pode ser usado em produção por decisão explícita, com risco assumido.
- O controlador não protege contra root, DBA ou acesso direto ao Docker.

### Operação

- `situacao` mostra canal preferido, canal aplicado, tag, commit, digest, backup e pendência do controlador.
- `diagnosticar` confere tag, digest, migrações, journal, pins e recibo antes de uma atualização.
- A documentação do contrato fica em [instalador.md](../instalador.md), e a operação do servidor fica em [auto-hospedagem.md](../auto-hospedagem.md).
