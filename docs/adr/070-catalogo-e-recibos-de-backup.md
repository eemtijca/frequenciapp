# ADR-070: catálogo e recibos dos backups

## Estado

Aceita em 2026-11-10.

## Contexto

O backup do banco gravava um único `ultimo-backup.json` e aplicava retenção por prefixo de nome. Um upload interrompido podia ser contado como cópia, um arquivo de outro formato podia ser removido por engano e um destinatário GPG sem conferência podia receber o dump. O expurgo remoto também dependia de listagem por prefixo, sem provar que os membros pertenciam ao conjunto confirmado.

## Decisão

- Cada backup confirmado ganha um recibo versionado `<base>.confirmado.json`, com escopo de banco, schema, alvo e destino, criptografia, destinatário, data e lista exata de artefatos com SHA-256.
- O catálogo independente fica em `ESTADO_DIR/recibos` e sobrevive ao expurgo local. O `ultimo-backup.json` passa a ser apenas um ponteiro para o recibo vigente.
- A retenção conta somente recibos válidos do mesmo escopo. O mínimo de cópias confirmadas é preservado; recibos incompletos, legados ou de outro alvo não contam e não autorizam exclusão.
- O expurgo remoto deriva os nomes exclusivamente dos membros do recibo. Antes de excluir, a rotina baixa e confere cada membro, registra a intenção em `ESTADO_DIR/expurgos`, exclui um membro por vez e só considera o conjunto concluído após provar a ausência de todos os membros.
- Uma falha parcial retorna erro e preserva catálogo, diário e membros restantes. A retomada só ocorre para o mesmo conjunto e depois de todas as conferências.
- O destinatário GPG é um fingerprint completo, com pin primário independente. Chave revogada, expirada, ambígua ou sem subchave de cifra bloqueia a operação. A cifra usa a subchave selecionada e o recibo registra o fingerprint usado.
- Os destinatários age exigem um SHA-256 independente. O dump é cifrado em fluxo por FIFO, sem arquivo em texto claro no diretório de backup.
- O home GPG usa uma base curta e privada, confere dono, modo e tamanho do socket e encerra apenas o agente criado pela operação. A restauração usa `--pinentry-mode error` e exige chave privada explícita.

## Alternativas consideradas

- Continuar contando arquivos por prefixo: aceitava uploads incompletos e removia membros de outros formatos.
- Baixar o catálogo do provedor: permitia que o próprio destino definisse o que seria apagado.
- Excluir por lista remota sem diário: não distinguia falha parcial de sucesso e não permitia retomada conservadora.
- Aceitar e-mail ou fingerprint curto no GPG: permitia ambiguidade e seleção de chave diferente do pin.
- Usar o agente GPG pessoal: acoplava a operação ao cache e às permissões do operador.

## Consequências

- Instalações antigas precisam de verificação explícita; recibos legados não são adotados automaticamente.
- O expurgo remoto exige catálogo persistente e identidade Compose verificável. Sem isso, a rotina falha fechada.
- A restauração de chave GPG protegida passa a exigir decifra externa e `--entrada -`.
- O espaço em disco precisa acomodar o dump cifrado e os artefatos de verificação temporários.
- O diário de expurgo é local ao host e não coordena réplicas ou máquinas distintas.
- O recibo não prova recuperação; o ensaio de restauração continua obrigatório.
