# Controlador de manutenção

O controlador de manutenção é um recurso opt-in para instalações auto-hospedadas em Docker Compose. Ele reúne perfil próprio, snapshot físico, entrada estável, journal durável e pins de backup para tornar a atualização e a recuperação verificáveis. O caminho simples continua sendo o padrão e não depende de nenhum artefato do controlador.

A decisão está na [ADR-065](adr/065-atualizacao-e-recuperacao-verificaveis.md); a identidade e a trava estão na [ADR-067](adr/067-identidade-operacional-e-travas.md). O guia geral da auto-hospedagem é [auto-hospedagem.md](auto-hospedagem.md) e o backup do banco é [backup-servidor.md](backup-servidor.md).

## Por que opt-in

Uma instalação simples usa `atualizar.sh`, `compose.sh` e `instalar-rotinas.sh` diretamente. Ela não tem perfil, snapshot, journal, pins nem entrada estável. O controlador só entra em ação quando o perfil existe ou quando uma variável `SERVIDOR_CONTROLADOR_*` declara uma operação filha. A ausência do perfil mantém o comportamento anterior.

O caminho simples não pode ser bloqueado por artefato do controlador. Um perfil arquivado, um marcador residual ou um journal antigo não podem transformar a instalação simples em refém:

- `atualizar.sh` ignora `atualizacao-em-andamento.json` quando não há perfil ativo.
- `compose.sh` continua genérico quando não há perfil.
- `instalar-rotinas.sh` instala o cron simples quando não há perfil e a opção `--controlador` não foi usada.
- O instalador do controlador não cria perfil automaticamente. A adoção é um comando administrativo explícito.

O único caso de recusa deliberada é `SERVIDOR_CONTROLADOR_PERFIL` definido com arquivo ausente. Nesse caso, a operação falha com código 78 em vez de cair silenciosamente no caminho simples, porque o operador declarou intenção de usar o controlador.

## Perfil, snapshot e entrada estável

### Pré-requisitos

| Requisito     | Detalhe                                                                                                                                                                                                    |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Execução      | A instalação e a entrada estável exigem root. O controlador não é setuid.                                                                                                                                  |
| Checkout      | Caminho absoluto e canônico, sem espaços ou metacaracteres, pertencente a root e sem escrita de grupo ou de outras contas. O mesmo vale para os metadados Git.                                             |
| Configuração  | `/etc/frequenciapp` precisa ser privado de root. `app.env`, `ops.env` e `identidade.json` precisam de modo 600. Permissão 640 de grupo é recusada.                                                         |
| Identidade    | A identidade Compose precisa estar adotada com `identidade.sh --adotar --confirmar` e corresponder aos recursos atuais.                                                                                    |
| Operador      | A conta indicada em `--operador` precisa existir, não pode ser root e não pode pertencer a `root`, `docker`, `sudo`, `wheel`, `lxd`, `disk` ou `containerd`. Também não pode ter escrita no socket Docker. |
| Banco         | O primeiro perfil aceita apenas banco interno do Compose. `DATABASE_URL`, `DIRECT_URL` e `BACKUP_DATABASE_URL` precisam estar ausentes, e o modo de backup precisa ser `compose` ou estar ausente.         |
| Estado legado | O `ESTADO_DIR` da configuração, por padrão `/var/lib/frequenciapp`, não pode conter marcador de atualização, falha com migrações possivelmente aplicadas ou journal não vazio.                             |
| Host          | Node.js acessível no momento da instalação, Docker e Docker Compose funcionais, Git, `flock`, `jq` e espaço para snapshot, worktree e pins.                                                                |

A conta de implantação que usa o grupo `docker` não serve como `--operador` do controlador. O perfil exige uma conta sem privilégio administrativo e sem acesso direto ao daemon. A execução das rotinas continua sendo feita pela entrada administrativa e pelo cron de root. O instalador não cria regra de `sudo`, unidade systemd ou usuário.

Uma instalação que seguiu o caminho simples com o checkout ou a configuração pertencentes à conta de implantação precisa revisar proprietário e permissões antes da adoção. O controlador não altera essas permissões.

### Instalação

A instalação é feita com `scripts/servidor/instalar-controlador.sh`. O comando aceita `--plano` ou `--confirmar`, nunca os dois. O plano valida identidade, configuração, estado legado e snapshot sem criar o prefixo.

```bash
sudo scripts/servidor/instalar-controlador.sh \
  --fonte /opt/frequenciapp \
  --app /opt/frequenciapp \
  --config /etc/frequenciapp \
  --prefixo /opt/frequenciapp-controlador \
  --operador conta-de-operacao \
  --plano
```

Substituir `conta-de-operacao` pela conta existente. O campo `--fonte` aponta para a cópia revisada dos scripts que será congelada; `--app` aponta para o checkout usado nas atualizações. Normalmente os dois caminhos são iguais. O prefixo padrão é `/opt/frequenciapp-controlador`.

O plano imprime um JSON com prefixo, aplicação, operador, alvo da identidade, quantidade de arquivos do snapshot e a indicação de que cron e `sudo` não serão instalados. Depois da revisão, repetir o comando com `--confirmar`.

O instalador pode executar a mesma adoção com `sudo ./instalar.sh aplicar --perfil controlador --operador-controlador conta-de-operacao --sim`. Ele valida a conta, adota o snapshot, confere o hash do migrador e instala as rotinas estáveis em cron. A etapa `agendador` é pulada nesse perfil.

Depois de uma troca de canal que mude o `migradorSha256`, a readoção usa `sudo ./instalar.sh aplicar --retomar --sim`. O instalador arquiva o prefixo e o cron anteriores com o sufixo `.anterior-<data>` e confirma a nova adoção. O journal e os pins antigos permanecem no diretório arquivado para revisão.

O instalador grava:

| Caminho                                                 | Papel                                                                                           |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `/opt/frequenciapp-controlador/perfil.json`             | Perfil imutável da adoção, com caminhos, hashes e `migradorSha256`.                             |
| `/opt/frequenciapp-controlador/executar`                | Entrada estável, executável apenas por root.                                                    |
| `/opt/frequenciapp-controlador/snapshot/`               | Cópia física dos scripts de servidor, do migrador e dos arquivos Compose.                       |
| `/opt/frequenciapp-controlador/snapshot/manifesto.json` | Mapa de nomes e SHA-256 de cada membro do snapshot.                                             |
| `/opt/frequenciapp-controlador/dados/estado/`           | `estado.json`, `falha.json`, `ultimo-backup.json` e o marcador de atualização, quando presente. |
| `/opt/frequenciapp-controlador/dados/journal/`          | Intenções, observações e conclusões das operações.                                              |
| `/opt/frequenciapp-controlador/dados/pins/`             | Cópias físicas de backup, recibo, ponteiro e checksums.                                         |
| `/opt/frequenciapp-controlador/dados/backups/`          | Backups produzidos pelo perfil.                                                                 |
| `/opt/frequenciapp-controlador/dados/logs/`             | Logs das rotinas estáveis.                                                                      |
| `/opt/frequenciapp-controlador/dados/locks/`            | Trava derivada da identidade do alvo.                                                           |

Com o perfil ativo, `ESTADO_DIR`, `BACKUP_DIR` e `LOG_DIR` são fixados sob o prefixo; a instalação simples continua usando `/var/lib/frequenciapp`, `/var/backups/frequenciapp` e `/var/log/frequenciapp`. O estado legado é apenas conferido na adoção e nas leituras do perfil.

O perfil guarda `versao`, `tipo` `compose-host`, caminhos absolutos, o caminho absoluto do Node usado na entrada, a lista de arquivos Compose, o `migradorSha256`, o SHA-256 do manifesto, o SHA-256 de `app.env`, de `ops.env` e de `identidade.json`, e o estado legado conferido. O `migradorSha256` é o hash de `docker/app/migrar.mjs` no momento da adoção.

A entrada estável é fixa e não carrega o ambiente do chamador:

```text
exec /usr/bin/env -i PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  <node> /opt/frequenciapp-controlador/snapshot/scripts/servidor/controlador/cli.mjs \
  executar /opt/frequenciapp-controlador/perfil.json "$@"
```

O prefixo é imutável do ponto de vista operacional, não por atributo do sistema de arquivos. O instalador recusa prefixo existente, grava cada arquivo com criação exclusiva e o perfil verifica o manifesto e os hashes em cada leitura. Uma instalação interrompida pode deixar um prefixo parcial; ele não deve ser reaproveitado. A nova tentativa usa outro prefixo, depois de revisar e arquivar o anterior. Não editar `perfil.json`, `manifesto.json`, o snapshot, o journal ou os pins à mão.

### Rotinas estáveis

O instalador do controlador não instala cron nem `sudo`. As rotinas são instaladas em etapa separada:

```bash
sudo scripts/servidor/instalar-rotinas.sh \
  --controlador \
  --perfil /opt/frequenciapp-controlador/perfil.json \
  --plano
```

O plano imprime as linhas de cron. Depois da revisão, repetir com `--confirmar`. O modo controlador grava `/etc/cron.d/frequenciapp` e `/etc/logrotate.d/frequenciapp` com criação exclusiva: se os arquivos já existirem, inclusive os do caminho simples, a instalação recusa em vez de sobrescrever. Remover ou arquivar os arquivos antigos depois de conferir o novo plano.

O cron do controlador usa a entrada `executar` e as ações estáveis `agenda`, `backup-banco`, `backup-planilhas`, `atualizar` e `renovar-certificado`. Os padrões são:

| Rotina               | Ação                  | Padrão                                                          |
| -------------------- | --------------------- | --------------------------------------------------------------- |
| Agenda               | `agenda`              | `*/5 * * * *`, habilitada por `AGENDA_HABILITADA=true`.         |
| Backup do banco      | `backup-banco`        | `30 2 * * *`, habilitado por `BACKUP_HABILITADO=true`.          |
| Backup das planilhas | `backup-planilhas`    | `0 3 * * *`, habilitado por `BACKUP_PLANILHAS_HABILITADO=true`. |
| Atualização          | `atualizar`           | `30 4 * * *`, desabilitada por `ATUALIZAR_HABILITADO=false`.    |
| Certificado          | `renovar-certificado` | Nginx com ACME, horário de `CERTBOT_RENOVAR_HORARIO`.           |

O instalador exige confirmação do fuso. `CRON_FUSO_SISTEMA` precisa ser igual a `TZ_APP`, ou `CRON_TZ` precisa ser aceito com `CRON_SUPORTA_TZ=true`. O cron do controlador não recarrega serviço nenhum; o daemon lê `/etc/cron.d`. O logrotate também não é recarregado.

## Journal

Cada operação do controlador, exceto leitura, `estado` e instalação de rotinas, recebe um identificador UUID e uma pasta em `dados/journal/<uuid>/`:

```text
dados/journal/<uuid>/
  intencao.json
  observado-antes.json
  observado-depois.json
  concluida.json
  incerta.json
```

- `intencao.json` é gravado antes do processo filho e registra versão, operação, alvo, ação, hash do snapshot e horário.
- `observado-antes.json` registra os containers Compose observados antes da ação.
- `observado-depois.json` registra os containers depois que o filho termina.
- `concluida.json` registra o status 0 e o `intencaoSha256`. A conclusão precisa corresponder à intenção original.
- `incerta.json` é gravado quando a conclusão não pode ser comprovada. Ele registra status, sinal, observação disponível e o motivo de o estado ser incerto.

As gravações usam criação exclusiva, `fsync` do arquivo e do diretório. O `verificarJournal` relê e sincroniza as conclusões e exige que toda entrada tenha intenção válida e conclusão íntegra. Qualquer `incerta.json`, entrada sem `concluida.json` ou divergência de hash bloqueia novas mutações.

A leitura de `--simular` e `--ajuda` também passa pela autorização, mas não cria intenção, observação, conclusão ou pin. `estado` imprime o alvo e as operações do journal sem gravar. `instalar-rotinas` é autorizado sob a trava, mas não cria entrada de journal. `--registrar` cria uma intenção da ação `registrar-atualizacao` e uma conclusão, sem pin.

Uma atualização só conclui com pin verificado e com o serviço da aplicação executando e saudável. As demais ações concluem depois que o filho termina com status 0 e a observação posterior é gravada. A conclusão prova que o filho terminou e que o estado observável foi registrado, não que o banco ou as migrações estejam semanticamente corretos.

## Pins

Antes de aplicar uma atualização, o controlador fixa o backup confirmado. O comando `fixar` exige que `ultimo-backup.json` aponte para um recibo confirmado versão 1, que o recibo corresponda ao alvo, ao banco, ao schema e ao destino adotados, e que os artefatos e checksums confiram. Quando há destino remoto, a verificação remota precisa estar confirmada. Sem destino remoto, `ATUALIZAR_PERMITIR_BACKUP_LOCAL=true` precisa declarar a decisão explícita.

O pin fica em `dados/pins/<uuid>/` e contém cópias dos artefatos do backup, do recibo, de `ponteiro.json` e de `pin.json`. O `pin.json` lista nome e SHA-256 de cada membro. O pin usa o mesmo UUID da operação no journal, o que permite correlacionar a atualização, o backup e a conclusão.

A retenção local do backup não remove pins. A ação `retencao` executa apenas o plano local de retenção tipada, valida os nomes dos membros e remove arquivos `frequenciapp-*` do diretório de backup conforme `BACKUP_RETER_DIAS` e `BACKUP_RETER_MINIMO`. Os pins permanecem até uma decisão administrativa. Não apagar o pin de uma atualização enquanto o backup correspondente ainda for necessário para recuperação. A restauração a partir de um pin usa `restaurar.sh` com o arquivo e o checksum do pin; o pin não substitui o ensaio de restauração.

## Trava, identidade e marcador

A identidade do alvo é a chave `trava` de 64 caracteres hexadecimais gravada em `identidade.json` na adoção. O perfil guarda essa chave e o hash do arquivo de identidade. A leitura do perfil compara o hash; a autorização exige que `SERVIDOR_ALVO_CHAVE` seja igual ao alvo, e a entrada que monta o Compose recalcula a identidade efetiva antes de usar a trava.

A trava fica em `dados/locks/operacoes-<alvo>.lock`, com modo 600 e proprietário root. O `trancar.sh` monta o Compose, confere a identidade e chama `travar`. A função abre o descritor 9, aplica `flock` sem espera e exporta `SERVIDOR_LOCK_HERDADO`. O controlador passa o descritor 9 para o processo filho.

O `autorizar` compara o inode e o dispositivo do descritor 9 com o arquivo de trava do perfil. O filho que chama `travar` com `SERVIDOR_LOCK_HERDADO` confere o mesmo descritor e não reabre o arquivo. Descritor ausente, trava de outro alvo ou identidade divergente encerram a operação. Não há fallback para uma trava global nem para o caminho simples quando o perfil está ativo.

O marcador `atualizacao-em-andamento.json` é um aviso grosso do fluxo de atualização. Com perfil ativo, ele é conferido no diretório de estado efetivo sob a trava e no estado legado durante a leitura do perfil; a existência bloqueia mutações. A adoção também recusa um marcador no estado legado. Sem perfil, o marcador é ignorado, para que um resíduo de uma adoção removida não bloqueie o caminho simples para sempre.

O marcador não substitui o journal. O journal registra a operação, a intenção e a conclusão; o marcador apenas sinaliza que uma atualização anterior pode estar em andamento ou incerta. Não remover o marcador enquanto o journal ou os containers não tiverem sido reconciliados.

## Filho, sinais e conclusão

O controlador inicia o filho com `/bin/bash` e o script correspondente no snapshot. O filho herda a saída padrão, a saída de erro e o descritor 9. O controlador espera o evento de encerramento e observa os containers antes de concluir.

Os sinais `SIGINT`, `SIGTERM` e `SIGHUP` recebidos pelo controlador apenas marcam a operação como interrompida. O controlador não mata o filho, não para containers e não inicia rollback. Mesmo que o filho termine com status 0, a presença de sinal impede a conclusão e gera estado incerto. Um sinal não prova que o Docker ou o banco estejam quiescentes.

Se o controlador for morto com `SIGKILL` ou o host perder energia, a intenção pode ficar sem conclusão. O filho pode continuar executando e manter a trava pelo descritor 9. Nesse caso, uma nova operação falha na trava ou no journal. O operador precisa identificar o processo remanescente, avaliar o estado dos containers e do banco e só então reconciliar.

O código interno 10 do atualizador só é aceito como no-op quando a operação está em preparação e nenhuma intenção foi criada. Ele não transforma uma falha iniciada em sucesso e não fabrica um pin.

Em qualquer falha posterior à intenção, o controlador tenta gravar `incerta.json` com o status, o sinal e a observação disponível. Se a gravação falhar, tenta um marcador mínimo `{"bloqueado":true}`. Se nem isso for possível, a intenção sem conclusão continua bloqueando. A mensagem informa que nenhum rollback ou parada automática foi autorizado. O código de saída é o do filho quando positivo; caso contrário, é 1. Erros de uso, autorização, perfil ou estado inseguro usam 78.

## Atualização

O `atualizar.sh` tem dois comportamentos:

| Situação   | Comportamento                                                                                                                                                                                        |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sem perfil | Mantém o caminho simples: backup obrigatório, validação do Compose, build ou download da imagem, aplicação e rollback de imagem e commit em falha. O marcador é ignorado.                            |
| Com perfil | Delega à entrada estável. O controlador registra journal, fixa o backup, valida o guard de migração na fonte e na imagem, aplica e exige saúde e pin antes da conclusão. Não há rollback automático. |

No modo controlador, `--simular` e `--ajuda` são leituras e não criam journal. A simulação continua sem executar `git fetch` e usa as referências locais. A entrada estável também pode ser chamada diretamente:

```bash
sudo /opt/frequenciapp-controlador/executar atualizar --simular
```

`--registrar` grava o estado atual com journal, sem pin. Uma atualização normal usa a preparação, executa o backup, fixa o pin, valida o commit e a imagem, aplica o Compose e confere a saúde.

`--permitir-migracoes` libera migrações novas. Com `MIGRAR_NA_PARTIDA=false`, a atualização também exige `ATUALIZAR_MIGRACAO_EXTERNA=true` para confirmar que a migração foi aplicada fora do entrypoint. Migrações aplicadas não são revertidas por rollback. O modo controlador registra `migracoesPossivelmenteAplicadas` como verdadeiro mesmo quando não há diff de migração, porque a imagem pode aplicar migrações pendentes.

Os modos de atualização são `auto`, `release` e `main`. `release` usa a tag estável mais recente; `main` usa `ATUALIZAR_REF`, por padrão `origin/main`. `auto` escolhe release quando a tag é compatível com o estado atual e main nos demais casos. A atualização simples grava `estado.json` com modo, referência, commit, imagem, imagem de backup e horário. Em falha, grava `falha.json` com a possibilidade de migrações aplicadas.

Quando o controlador está ativo e a atualização falha, a imagem e o commit anteriores não são iniciados automaticamente. O estado anterior continua registrado, o backup e o pin permanecem, e a recuperação é uma decisão administrativa. Usar o backup e o procedimento de restauração de [backup-servidor.md](backup-servidor.md); não tratar a falha como sucesso nem apagar o journal.

## compose.sh e instalar-rotinas.sh

### compose.sh

| Situação   | Comportamento                                                                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sem perfil | Executa o Compose genérico, com as opções e os arquivos do chamador.                                                                                                                                          |
| Com perfil | Aceita apenas `config`, `ps`, `images`, `version` e `logs`. Qualquer mutação, como `up`, `down`, `build`, `pull` ou `exec`, é recusada com código 78. As leituras conferem identidade e usam a trava do alvo. |

A restrição impede que uma mutação arbitrária contorne o journal, a trava e a identidade. A saída de `config` e de `logs` pode conter configuração resolvida ou dados operacionais; evitar colar essa saída em issue ou relatório.

### instalar-rotinas.sh

| Situação                                             | Comportamento                                                                                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Sem perfil e sem opções                              | Instala o cron simples, grava `/etc/cron.d/frequenciapp` e `/etc/logrotate.d/frequenciapp`, ajusta proprietários e recarrega o cron. |
| Perfil existe no caminho padrão, sem `--controlador` | Recusa a instalação simples e orienta o uso de `--controlador`.                                                                      |
| `--controlador` ou `--perfil`                        | Exige o perfil, delega à entrada estável e usa `--plano` ou `--confirmar`. Não sobrescreve cron existente e não recarrega serviço.   |
| Perfil indicado, mas ausente                         | Recusa com código 78.                                                                                                                |

A transição entre os modos exige atenção ao cron. O caminho simples grava os arquivos diretamente; o controlador usa criação exclusiva. Para adotar o controlador, gerar o plano, remover ou arquivar os arquivos do cron simples e confirmar a instalação do controlador. Para voltar ao simples, remover os arquivos do controlador antes de executar o instalador simples. O perfil precisa estar fora do caminho padrão para o instalador simples aceitar a operação.

## Readoção

A readoção é necessária quando o perfil deixou de corresponder ao ambiente. Os gatilhos são:

| Mudança                                                   | Efeito                                                                                                     | Ação                                                                 |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `docker/app/migrar.mjs`                                   | O `migradorSha256` diverge. A atualização recusa a fonte e a imagem antes de alterar o checkout principal. | Revisar a mudança, criar novo prefixo e instalar novo perfil.        |
| `app.env` ou `ops.env`                                    | O hash de configuração diverge. O perfil recusa a leitura.                                                 | Revisar a configuração, criar novo prefixo e instalar novo perfil.   |
| `identidade.json`                                         | O hash ou a identidade efetiva diverge. O perfil recusa a leitura.                                         | Reconciliar a identidade, criar novo prefixo e instalar novo perfil. |
| Conta de operação ou grupos                               | O perfil recusa a leitura quando a conta deixa de ser não privilegiada.                                    | Corrigir a conta ou criar novo perfil.                               |
| Snapshot, scripts ou arquivos Compose                     | O manifesto ou o hash do arquivo diverge. O perfil recusa a leitura.                                       | Arquivar o prefixo antigo e instalar novo snapshot.                  |
| Journal incerto                                           | Toda mutação é bloqueada.                                                                                  | Reconciliar o journal antes de qualquer readoção.                    |
| Perfil ausente com `SERVIDOR_CONTROLADOR_PERFIL` definido | A operação falha com 78.                                                                                   | Restaurar o perfil ou remover a variável para voltar ao simples.     |
| Perfil presente e entrada ausente                         | A delegação falha.                                                                                         | Não recriar a entrada à mão; reinstalar ou readotar.                 |

Na atualização, as mensagens `Migrador alvo diverge do guard aprovado; adoção administrativa necessária` e `Imagem não contém o guard de migração aprovado` indicam que a readoção é necessária. A falta de readoção também aparece como `Configuração mudou; adoção explícita necessária`, `Snapshot operacional alterado`, `Identidade adotada mudou` ou `Perfil do controlador não existe`. Nenhuma dessas mensagens autoriza editar o perfil; a saída é uma nova adoção ou a volta ao caminho simples.

O prefixo existente não é sobrescrito. A readoção usa um novo prefixo, por exemplo com sufixo de data, e um novo snapshot. O procedimento é:

1. Preservar o prefixo antigo e o journal, sem apagar pins ou backups.
2. Conferir que o journal antigo está conclusivo ou reconciliado.
3. Instalar o novo prefixo com `--plano` e `--confirmar`.
4. Executar `estado` na nova entrada e conferir a identidade.
5. Gerar o plano de cron do novo perfil, remover os arquivos de cron antigos e confirmar a instalação.
6. Executar uma simulação de atualização e uma leitura de `compose.sh`.
7. Manter o prefixo antigo arquivado até a nova instalação passar por uma atualização real e por uma restauração ensaiada.

Não copiar `perfil.json` entre prefixos. Não editar `migradorSha256` para forçar a atualização. O guard de migração existe para impedir que uma imagem ou um fonte diferente do adotado seja aplicada.

## Estado incerto

Um estado incerto aparece quando existe `incerta.json`, uma intenção sem `concluida.json`, uma conclusão com hash divergente, um pin ausente ou inválido, ou uma falha de observação. A mensagem `Operação incerta bloqueia mutações. Revisão administrativa obrigatória` confirma o bloqueio. A partir daí, o controlador recusa atualização, backup, restauração, retenção, instalação de rotinas e até a leitura de `estado`, porque a autorização valida o journal antes de qualquer ação.

O procedimento de diagnóstico é:

1. Não iniciar outra atualização e não apagar o journal.
2. Listar `dados/journal/*/` e identificar `intencao.json`, `concluida.json` e `incerta.json`.
3. Conferir `dados/estado/estado.json`, `falha.json`, `ultimo-backup.json` e o marcador.
4. Conferir o estado dos containers e do banco. A leitura por `compose.sh` também passa pela autorização e pode estar bloqueada pelo journal; nesse caso, a inspeção direta com Docker é diagnóstico fora da garantia do controlador.
5. Identificar se há processo filho remanescente e se a trava continua presa.
6. Se a operação terminou e os dados estão consistentes, arquivar a entrada incerta em uma pasta de revisão fora de `journal/`, com registro do que foi conferido. Não editar `concluida.json` para simular sucesso.
7. Se os dados não estão consistentes, preservar o prefixo e restaurar a partir do pin ou de um backup confirmado. Como o controlador bloqueia a restauração enquanto o journal estiver incerto, a recuperação pode exigir a retirada temporária do perfil e de `SERVIDOR_CONTROLADOR_PERFIL` para usar o caminho simples, seguida de nova adoção ou da volta definitiva ao simples.
8. Depois da reconciliação, validar `estado`, `compose.sh ps`, a saúde e uma simulação de atualização.

A remoção de uma entrada incerta é uma decisão administrativa. O controlador não tem comando de aprovação, de rollback ou de limpeza automática. O journal preserva a evidência; apagá-lo elimina a possibilidade de auditoria.

## Volta ao caminho simples

A volta ao caminho simples desativa a delegação e restaura o comportamento anterior. O comando mínimo é retirar o perfil do caminho padrão; a forma recomendada é arquivar o prefixo inteiro, preservando journal, pins e backups. Executar fora da janela de agenda e somente depois de confirmar que não há operação em curso.

```bash
# 1. Conferir o journal e o estado antes de mexer no perfil.
sudo /opt/frequenciapp-controlador/executar estado

# 2. Confirmar que não há processo do controlador em execução.
pgrep -af 'frequenciapp-controlador' || true

# 3. Arquivar o prefixo inteiro, sem apagar dados.
sudo mv /opt/frequenciapp-controlador \
  "/var/backups/frequenciapp-controlador-$(date -u +%Y%m%dT%H%M%SZ)"

# 4. Remover os arquivos de cron do controlador.
sudo rm -f /etc/cron.d/frequenciapp /etc/logrotate.d/frequenciapp

# 5. Remover a variável do ambiente de operação, se existir.
sudo sed -i '/^SERVIDOR_CONTROLADOR_PERFIL=/d' /etc/frequenciapp/ops.env

# 6. Instalar o cron simples.
sudo scripts/servidor/instalar-rotinas.sh
```

O `sed` altera `ops.env`; revisar o arquivo antes e depois, mantendo modo 600. Se a variável estiver definida no shell, em um script ou em outro arquivo de ambiente, removê-la também. O `atualizar.sh` relê a configuração depois de carregar o ambiente e voltaria a delegar se `SERVIDOR_CONTROLADOR_PERFIL` permanecesse.

O que remover:

- Os arquivos `/etc/cron.d/frequenciapp` e `/etc/logrotate.d/frequenciapp` do controlador, que são substituídos pelo instalador simples.
- O perfil do caminho padrão, por arquivamento do prefixo ou remoção de `perfil.json`.
- O marcador `atualizacao-em-andamento.json` somente depois de reconciliar a operação. O caminho simples o ignora, mas uma adoção futura o recusaria.

O que preservar:

- `/etc/frequenciapp`, incluindo `app.env`, `ops.env` e `identidade.json`.
- O estado simples em `/var/lib/frequenciapp`, quando existir.
- O estado do controlador dentro do prefixo arquivado, incluindo `estado`, `journal`, `pins`, `backups` e `logs`.
- Os backups em `/var/backups/frequenciapp`, os recibos, o catálogo e o último backup confirmado.
- O prefixo antigo, pelo menos até a nova instalação e uma restauração ensaiada.

A validação depois da volta:

```bash
sudo env -u SERVIDOR_CONTROLADOR_PERFIL scripts/servidor/atualizar.sh --simular
sudo scripts/servidor/compose.sh ps
curl -fsS https://exemplo.invalid/api/saude
```

Substituir `https://exemplo.invalid/api/saude` pelo endereço real de saúde da instalação. Conferir também se `/etc/cron.d/frequenciapp` aponta para os scripts do checkout, e não para a entrada arquivada. Se o cron simples não instalar porque o usuário de serviço não existe, corrigir a conta antes de repetir.

## Limites

O controlador é proteção cooperativa. Ele organiza e registra operações, mas não impede um ator com privilégio equivalente de contorná-lo:

- Root pode ler e alterar o perfil, o snapshot, o journal, os pins, o cron e os binários; pode executar Docker e trocar a imagem em uso.
- O administrador do banco pode aplicar migrações, alterar dados, trocar roles ou apagar tabelas fora do controlador. O journal só registra o que passou pela entrada estável.
- O grupo `docker` equivale a root no host. Quem pertence ao grupo pode criar containers privilegiados, montar o sistema de arquivos, alterar volumes, falsificar labels e substituir imagens.
- O acesso direto a `/var/run/docker.sock`, a um `DOCKER_HOST` externo ou a outro daemon contorna a identidade, a trava e o journal. O controlador remove `DOCKER_HOST` e `DOCKER_CONTEXT` do ambiente dos filhos, mas não impede o acesso fora dele.
- Os pins e o journal são locais. Um ator com root pode alterar ambos. O backup remoto com GPG ou age protege a cópia em repouso e o transporte, não o estado do controlador.
- A validação do operador, dos caminhos e do socket na adoção e nas leituras do perfil é preventiva. Ela não substitui sudoers, SSH, firewall, SELinux, AppArmor, auditd, política de containers ou controle de acesso ao daemon.

O controlador também não é um sistema de alta disponibilidade. A trava é local ao host, não coordena réplicas e não transforma uma falha de energia em operação concluída. O ensaio de restauração e a cópia remota continuam necessários.

## Checklists

### Adoção

- [ ] A identidade Compose foi adotada e confere com os recursos atuais.
- [ ] O checkout, os metadados Git e a configuração pertencem a root e não têm escrita de grupo ou de outras contas.
- [ ] `app.env`, `ops.env` e `identidade.json` estão em modo 600.
- [ ] A conta de operação não é root e não tem grupos administrativos nem escrita no socket Docker.
- [ ] O banco é interno ao Compose e as três variáveis de URL estão ausentes.
- [ ] O estado legado não tem marcador, falha indeterminada ou journal não vazio.
- [ ] Há Node.js, Docker, Git, `flock`, `jq` e espaço para snapshot, worktree e pins.
- [ ] O plano do `instalar-controlador.sh` foi revisado e o prefixo ainda não existe.
- [ ] A entrada `executar estado` responde.
- [ ] O plano de cron foi revisado, os arquivos antigos foram arquivados e a confirmação foi aplicada.
- [ ] Uma simulação de atualização e uma leitura de `compose.sh` funcionam.

### Operação

- [ ] O backup confirmado existe e o destino remoto está verificado, ou a decisão de backup local está explícita.
- [ ] O journal está conclusivo e `estado` responde antes da atualização.
- [ ] A simulação foi revisada; migrações novas exigem `--permitir-migracoes` e revisão.
- [ ] A atualização não foi interrompida por sinal, e o filho terminou com status 0.
- [ ] A aplicação está saudável e o pin da operação foi verificado.
- [ ] `estado.json`, `falha.json` e `ultimo-backup.json` foram conferidos depois da operação.
- [ ] O cron aponta para a entrada estável e os logs estão no diretório do perfil.
- [ ] A retenção local não removeu pins e o backup mais recente continua íntegro.

### Diagnóstico

- [ ] `executar estado` foi executado e o código de saída foi registrado.
- [ ] As entradas de `dados/journal/*/` foram listadas, com `intencao.json`, `concluida.json` e `incerta.json`.
- [ ] O marcador `atualizacao-em-andamento.json` foi localizado no estado efetivo e no estado legado.
- [ ] `compose.sh ps`, a saúde, os logs e o estado do banco foram conferidos.
- [ ] Processos remanescentes e a trava foram verificados.
- [ ] O `migradorSha256` foi comparado entre a fonte, a imagem e o perfil.
- [ ] A configuração, a identidade e o snapshot foram comparados com os hashes do perfil.
- [ ] A recuperação por pin ou backup foi considerada antes de remover qualquer evidência.

### Reversão

- [ ] Não há operação em curso e o journal foi lido.
- [ ] O prefixo inteiro foi arquivado, sem apagar journal, pins ou backups.
- [ ] `SERVIDOR_CONTROLADOR_PERFIL` foi removido de `ops.env`, do shell e dos scripts.
- [ ] O cron do controlador foi substituído pelo cron simples.
- [ ] O marcador foi reconciliado ou preservado para revisão.
- [ ] `atualizar.sh --simular`, `compose.sh ps` e a saúde pública funcionam sem o perfil.
- [ ] O prefixo arquivado continua disponível para auditoria e restauração.

## Testes em Docker

Os testes do controlador são separados da suíte padrão do servidor:

```bash
pnpm run test:servidor:controlador
```

O comando executa `node --test tests/servidor/controlador/*.test.mjs` e `bash tests/servidor/perfis.sh`. O smoke root de `tests/servidor/controlador/operacional-minimo.test.mjs` instala o controlador, consulta o estado, simula uma atualização delegada, gera o plano de cron e volta ao caminho simples. Ele é pulado quando o processo não é root. O ensaio usa dublês de Docker e um invólucro de Git para o fetch, sempre em diretórios sintéticos, e exige que `/var/run/docker.sock` não exista.

`tests/servidor/perfis.sh` verifica que o controlador é opt-in, que o marcador não bloqueia o caminho simples sem perfil, que o Compose simples continua funcionando, que a delegação usa a entrada estável, que o instalador simples recusa um perfil existente e que a volta ao simples funciona. O ensaio também pode ser executado isoladamente:

```bash
bash tests/servidor/perfis.sh
```

O smoke root e os testes de perfil não montam o socket Docker. Executar em um contêiner Node 24 com Git, Bash e `flock`, sem o socket:

```bash
docker run --rm \
  -v "<worktree>:/work" \
  -v "frequenciapp-p2.4-node_modules:/work/node_modules" \
  -v "frequenciapp-p2.4-pnpm-store:/pnpm-store" \
  -w /work \
  -e CI=1 \
  -e PNPM_HOME=/pnpm \
  -e PNPM_STORE_DIR=/pnpm-store \
  node:24.22.2-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9 \
  bash -lc 'corepack enable && pnpm install --frozen-lockfile && pnpm run test:servidor:controlador'
```

O comando acima pressupõe Git e `flock` na imagem. Se a imagem mínima não os tiver, instalar os pacotes no contêiner antes do ensaio, sem alterar o host.

A validação de servidor cobre sintaxe, ShellCheck dos scripts e do controlador, configuração Compose, Caddy e Nginx:

```bash
pnpm run servidor:validar
```

Essa validação precisa de Docker CLI e do socket montado no contêiner de ferramentas. Ela não faz parte de `test:servidor:controlador`. A suíte padrão `pnpm run test:servidor` continua sem os testes do controlador.

Para a documentação, executar `pnpm run format:check` e o teste editorial:

```bash
pnpm exec vitest run tests/unidade/interface/texto-editorial.test.ts
```

Registrar, para cada ensaio, a imagem, o comando, o código de saída e o caminho do log. Nenhum ensaio usa dados reais, domínio real ou credencial de produção.

## Referências

- [ADR-065](adr/065-atualizacao-e-recuperacao-verificaveis.md)
- [ADR-067](adr/067-identidade-operacional-e-travas.md)
- [Auto-hospedagem](auto-hospedagem.md)
- [Backup do servidor](backup-servidor.md)
- [Operação](operacao.md)
- [Testes](testes.md)
