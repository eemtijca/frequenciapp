# Controlador de manutenção Compose

O controlador é instalado fora do checkout, com scripts operacionais revisados, configuração Compose fixa, perfil protegido, trava por identidade do alvo, journal e cópias físicas dos backups. Não é daemon e não instala cron nem sudo durante a adoção.

## Interface de integração

- `scripts/servidor/instalar-controlador.sh --fonte /copia/revisada --app /srv/frequenciapp --config /etc/frequenciapp --operador operador --prefixo /opt/frequenciapp-controlador --plano` valida sem instalar. `--confirmar` cria o prefixo, nunca sobrescreve instalação existente.
- `/opt/frequenciapp-controlador/executar atualizar`, `backup-banco`, `restaurar`, `backup-planilhas`, `retencao`, `agenda` e `renovar-certificado` executam exclusivamente o snapshot. `estado` confere o journal. `retencao` aplica apenas a política local; o expurgo remoto permanece na rotina de backup tipada.
- `SERVIDOR_CONTROLADOR_PERFIL` contém o caminho do perfil protegido, não um segredo nem uma autorização por si só. `SERVIDOR_CONTROLADOR_PREPARACAO` identifica a classificação de uma atualização ainda não aplicada; não autoriza backup filho nem dispensa a intenção. `SERVIDOR_CONTROLADOR_OPERACAO` e `SERVIDOR_CONTROLADOR_ACAO` só autorizam a execução quando a intenção correspondente já existe. `common.travar` valida perfil, fd9, alvo, intenção e journal, inclusive nos filhos. O descritor herdado é a mesma descrição de arquivo do `flock`, não um lock novo; backup filho não sofre deadlock.
- Outros scripts devem usar `$DIR` ou `$SERVIDOR_SCRIPTS_DIR` para módulos operacionais, nunca `$APP_DIR/scripts/servidor`. `APP_DIR` é somente a fonte da aplicação, que muda entre revisões.
- O instalador coleta os arquivos de `scripts/servidor` somente no momento da instalação. Os arquivos finais de backup, restauração, recibos e retenção precisam estar estabilizados e revisados antes da adoção real. A cópia do teste usa dublê executável de backup, não comprova o transporte/cifra real.
- O perfil inicial só aceita um host Compose e banco interno, sem `DATABASE_URL`, `DIRECT_URL` ou `BACKUP_DATABASE_URL` paralelas. URLs, Kubernetes e controladores distribuídos não são adotados implicitamente. Configuração e identidade não podem mudar sem revisão administrativa e adoção de um novo perfil.

## Confiança e atores

A proteção é para atores cooperativos das rotinas e para o operador limitado configurado. Root, administradores, membros de grupos privilegiados, quem pode usar Docker diretamente e código com privilégios administrativos estão fora do modelo de ameaça. Não existe promessa de proteção contra um administrador nem contra um release malicioso deliberadamente aprovado pelo administrador.

Fonte revisada, checkout, configuração, snapshot, perfil, journal, backups e ancestrais precisam pertencer a root sem escrita de grupo/outros e sem symlinks. Ancestral sticky pertencente a root é aceito para instalação de teste em diretório temporário privado. Arquivos de configuração e journal são privados de root. O operador não pode pertencer a `docker`, `sudo`, `wheel`, `root`, `lxd`, `disk` ou `containerd`, nem ter escrita nos sockets Docker locais conhecidos. O administrador também deve revisar sudoers, polkit, ACLs, sockets alternativos, Docker remoto e credenciais externas: listar grupos não demonstra ausência de todos os poderes administrativos.

A instalação e a leitura do perfil conferem recursivamente o checkout e as árvores Git, incluindo arquivos, diretórios, hooks, referências, objetos, ponteiro `.git` e `commondir` de worktrees ligadas. Includes de configuração e diretórios de hooks externos também precisam existir e ser protegidos. Links e escrita de grupo/outros dentro dessas árvores são recusados, mesmo em diretórios sticky. Stores alternativos de objetos e monitores Git externos não são adotados por este perfil. A conferência não executa hooks nem corrige ownership automaticamente.

A execução não é setuid. O administrador configura uma delegação exata para a entrada fixa, sem autorização de shell, instalador, `env`, Node, Docker ou Compose arbitrário. Por exemplo, uma regra sudoers revisada com `visudo` pode permitir apenas a entrada absoluta e as operações aprovadas; os argumentos de restauração também precisam de revisão. O instalador não escreve sudoers, não altera grupos, não remove privilégios e não declara a conta segura apenas porque passou nas verificações locais. A entrada limpa o ambiente recebido. Arquivos `app.env` e `ops.env` são código shell administrativo confiável e não podem ser graváveis pelo operador.

## Atualização e recuperação

O Compose operacional e os scripts vêm do snapshot fixo. O build lê a fonte da revisão alvo, não executa as rotinas dessa revisão. O hash integral do migrador aprovado é fixado na adoção e conferido tanto na fonte quanto na imagem em um contêiner sem rede, mounts ou privilégios. Alterar o migrador requer revisão e nova adoção, não flag de bypass.

Ajuda e simulação são classificadas como leituras, sem intenção de atualização nem pin. O registro explícito grava `estado.json` sob uma intenção própria `registrar-atualizacao`, sem afirmar que houve aplicação nem fabricar backup. A atualização compara o alvo sob fd9: sem mudança, retorna sucesso público sem criar journal ou pin. O código interno 10 apenas comunica esse no-op ao controlador e nunca libera uma intenção iniciada. O fetch normal ainda pode atualizar referências Git; simulação não faz fetch. `--forcar` continua pedindo aplicação, mesmo para o mesmo commit.

Uma aplicação efetiva inicia uma intenção exclusiva sincronizada em `dados/journal/<operacao>/intencao.json` antes do backup e de qualquer build/partida/checkout. Antes do build/partida, o backup, checksums, recibo e ponteiro são copiados para `dados/pins/<operacao>`, fora da árvore de retenção. Essas cópias não são hardlinks para inodes mutáveis. O controlador confere os hashes antes de concluir e nas leituras posteriores do journal. Não há expurgo automático dos pins. Uma declaração de migração externa continua iniciando estado incerto antes da seleção do alvo; não é um no-op seguro.

Sucesso exige encerramento confirmado do filho, observação dos IDs/imagens e saúde, pin íntegro e conclusão sincronizada. Assim, duas atualizações sucessivas não dependem de apagar um marcador de incerteza. O journal mantém intenção e conclusão, sem liberar por `unlink` de marcador. Estado parcial, erro de persistência, sinal ou falha Compose mantêm o alvo bloqueado, mesmo com `--forcar`.

Falha do cliente Compose não comprova fim do migrador nem quiescência dos serviços. O controlador preserva os recursos observados, nunca executa parada, remoção ou partida automática de imagem anterior. A imagem anterior pode ser incompatível com o banco já migrado. Após crash, o filho pode continuar com a trava herdada; quando encerrar, a intenção incompleta continua bloqueando novas mutações.

Recuperação incerta é uma operação administrativa externa: preservar journal/pins e dados, observar processos e IDs exatos, comprovar ausência de migração ativa, avaliar compatibilidade e exercitar restauração em alvo separado antes de decidir o corte. Não remover arquivos do journal para forçar liberação. Não há comando automático de desbloqueio nesta versão. Se for necessário novo prefixo, a adoção deve preservar/reconciliar o journal anterior e a identidade física antes de conceder poderes; criar prefixo novo não comprova recuperação.

Antes de criar qualquer prefixo ou chamar Docker para a conferência de adoção, o instalador preserva o `ESTADO_DIR` lido da configuração protegida (padrão `/var/lib/frequenciapp`). Marcador de atualização, falha indeterminada ou journal anterior não vazio impedem a adoção. O caminho fica no perfil e é conferido nas execuções seguintes, antes de substituir o estado operacional pelo diretório privado do controlador. Não há flag de reconciliação automática nem limpeza dos registros legados. Esta guarda cobre o caminho configurado e seu journal associado, não descobre estados antigos omitidos da configuração administrativa.

## Evidência de desenvolvimento

O teste `tests/servidor/controlador/operacional.e2e.mjs` roda em contêiner descartável root, `/repo` somente leitura, `/sandbox` em tmpfs, sem rede e sem socket Docker. Ele não integra a descoberta comum `*.test.mjs` do runner UID1000: a entrada explícita `tests/servidor/controlador/operacional.sh` falha, em vez de ignorar a prova, se as pré-condições root/fixture faltarem. O instalador é exercitado em prefixo temporário e os clientes Docker/Git de transporte são executáveis sintéticos. Git local, Bash, flock, fsync, arquivos e processos do controlador são reais. Não equivale a deploy ou validação de um daemon de produção.

Comando portátil da prova, partindo da raiz de uma cópia revisada e sem serviços reais montados:

```bash
docker build -t frequenciapp-controlador-prova \
  -f tests/servidor/controlador/Dockerfile tests/servidor/controlador
docker run --rm --network none --read-only --cap-drop ALL --user 0:0 \
  --tmpfs /sandbox:rw,exec,nosuid,nodev,mode=0700 \
  --tmpfs /tmp:rw,nosuid,nodev,mode=1777 \
  -v "$PWD:/repo:ro" frequenciapp-controlador-prova
```

O build das ferramentas usa rede para obter dependências. A execução da prova não usa rede. A rodada executada durante o desenvolvimento usou a imagem local equivalente `frequenciapp-controlador-test:isolado`, com Node 24.22.2, Bash, Git, jq, flock e ShellCheck; o Dockerfile portátil acima ainda precisa de sua própria validação de build pelo integrador.

### Revisão focal e orçamento corretivo

Os REDs já existentes reproduziram no-op com falsa incerteza e aceitação de `.git/config` gravável por outro ator. O novo RED vertical de adoção legada retornou 1: a instalação retornava 0 diante de marcador incerto em `ESTADO_DIR`, em vez da recusa 78. O bloco corretivo usa esses testemunhos, não reinicia o orçamento anterior e admite uma única validação focal final. Nova falha após a correção encerra a frente sem patch/reexecução automática. Instalação real, publicação e concessão de privilégios permanecem fora do escopo.

**Validação final bloqueada, sem GREEN funcional.** Prettier e ESLint dos arquivos alterados retornaram 0. Os oito arquivos Shell selecionados passaram em `bash -n`; ShellCheck 0.9.0 retornou 1 por seis diagnósticos informativos SC2015: quatro guards preexistentes em `comum.sh` (linhas 228, 241, 248 e 293), o guard de membro em `controlador/retencao.sh:18` e a pré-condição de `operacional.sh:4`. Não houve diagnóstico de variáveis anteriores sem uso. A frente encerrou nessa primeira falha, sem correção ou reexecução. A suíte operacional ROOT, os testes unitários do controlador e os quatro consumidores do atualizador estavam depois do lint e **não chegaram a executar nessa validação**. Portanto, duplo sucesso, no-op, ajuda/registro, ownership completo e recusa legada ainda exigem GREEN sobre estas fontes finais antes de adoção.

O snapshot congelado de `scripts/servidor/**` e `docker/app/migrar.mjs` tem SHA-256 agregado `cc91d9a860218b51e3366e3c850f5f8665b2d0f8d14eb02616864a5f9e441859`. O agregado de fonte e testes capturados é `988ae867358ffcea19dcb012c8f6a26156d27b6ae3619e1f8177b921ffa85453`. Esses hashes identificam manifestos ordenados de caminhos e hashes de conteúdo, não commits Git. A base do checkout continua `c1246e7716bbde4f5f912b828dccd0542c3f8048`, com alterações locais preservadas. O contêiner da tentativa usou a imagem local por ID, sem rede, socket, capacidades ou mounts graváveis do host; nenhum serviço, cron ou privilégio real foi instalado.
