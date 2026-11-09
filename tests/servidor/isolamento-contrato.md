# Contrato pendente do harness administrativo

As entradas reais de servidor retornam 78 (`BLOQUEADO`) antes de clientes, preparo de chaves ou traps mutantes. Os cenários permanecem nos scripts, mas ainda não foram adaptados. A recusa não equivale à aprovação do ensaio. Nenhuma variável de opt-in, projeto existente, arquivo de prova fornecido pelo chamador ou ausência de ferramenta libera a operação.

## Dependência de arquitetura

O executor `tests/isolamento/executar.mjs` atende API e navegador. O runner não recebe socket Docker nem acesso ao host, o que deve continuar assim. Executar os scripts administrativos dentro dele não oferece o transporte Compose necessário. No modo URL, o preparo automático das migrações também conflita com a fixture SQL mínima do ensaio. Não basta envolver o comando atual no executor.

O contrato abaixo é uma proposta de interface para o responsável por `tests/isolamento/*`, não uma interface já disponível:

```text
node tests/isolamento/executar.mjs --servidor CENARIO
CENARIO = backup-restauracao | restauracao-url | atualizacao-integracao
        | validar-servidor | validar-helm | validar-workflows
```

O modo deve selecionar uma implementação revisada do cenário, sem aceitar programa Docker, projeto, contêiner, volume, rede, URL, diretório do host ou ambiente arbitrários como entrada. O launcher cria cada recurso novo e registra o ID completo devolvido pela criação em um ledger privado da rodada. Não se admite adotar recurso preexistente, ainda que seu nome ou label pareça compatível.

## Criação e prova

- Gerar 128 bits aleatórios para a rodada e aplicar as labels `br.frequenciapp.isolamento` e `br.frequenciapp.isolamento.tipo` a cada recurso criado. O ledger registra ID completo, tipo e rodada; nomes são apenas diagnósticos, nunca autorização ou critério de remoção.
- Usar ambiente allowlist sintético, sem `.env`, credenciais do host, configuração Docker herdada, home pessoal, agentes, destinos de notificação ou transporte remoto real. Fonte e ferramentas entram por cópia allowlist, sem binds e sem socket Docker. Chaves GPG/age e rclone local são exclusivos da rodada.
- Separar preparo de ferramentas/imagens da execução. Fixar imagens de ferramentas e clientes PostgreSQL 17; falha ou ausência de ferramenta reprova, não pula o caso. O ensaio de atualização precisa construir as duas revisões sintéticas sem rede durante o build, a partir de bases já preparadas, com tags exclusivas, sem substituir imagem preexistente.
- O banco inicia em `network=none`; runner, app e proxy compartilham somente esse namespace por `container:<ID completo registrado>`. Sem portas publicadas, interfaces externas, gateways, `extra_hosts`, capacidades adicionais, modo privilegiado ou namespaces de host. Inspecionar todos os recursos antes da partida e antes de cada ação mutante. Rede `internal` isoladamente não atende o contrato.
- Armazenamento de PostgreSQL e proxy, quando necessário para provar persistência durante a atualização, usa volumes novos com IDs/nomes exatos devolvidos pela criação e labels verificadas. Recusar volumes externos, volumes anônimos implícitos e mounts de host. O ledger distingue volumes da mesma rodada dos canários vizinhos.
- Provar interfaces e rotas efetivas dentro do namespace e usar somente canários sintéticos para os negativos. Antes de fixtures, obter consulta somente leitura com papel, banco, schema e marcador do provisionador. Confirmar que o app sintético usa o mesmo banco quando houver app; nome de projeto ou URL igual não bastam.

## Transporte das rotinas reais

Para `restauracao-url`, executar os clientes PostgreSQL 17 e `scripts/servidor/restaurar.sh` no runner sem egress. O launcher cria somente o PostgreSQL vazio; não aplica o schema do aplicativo. A fixture cria origem, destino, validação e outro destino no mesmo servidor recém-criado, com nomes aleatórios da rodada e papéis sintéticos. As URLs são geradas pelo provisionador para loopback nesse namespace, nunca recebidas do host. O dump passa por stdin ou arquivo interno copiado, sem porta publicada. Preservar recuperação de alunos, histórico e validação, além da recusa sem URL de validação.

Para os modos Compose, fornecer um transporte restrito controlado pelo launcher externo, sem entregar o socket Docker ao runner. A rotina real deve continuar sendo exercitada; substituir sua saída por respostas falsas não valida integração. A interface proposta entre launcher e adaptador aceita operações tipadas, não uma linha de shell:

```text
configurar(cenario) -> { rodada, servicos, referenciasOpacas }
consultar(servico, consultaPermitida) -> dados
executarNoServico(servico, argv, stdin) -> { status, stdout, stderr }
pararAplicacao() -> status
subirAplicacao(revisaoPreparada) -> status
construirRevisao(revisaoSinteticaRegistrada) -> imagemRegistrada
coletarEvidencias() -> relatorioSanitizado
encerrar() -> { removidos, preservados, falhas }
```

O adaptador de CLI usado pelos scripts converte os argumentos Compose conhecidos para essas operações. Ele precisa conferir projeto efetivo, serviços, fonte e revisões registradas, inclusive a worktree de build, e recusar qualquer opção ou destino não reconhecido antes do daemon. SQL e comandos rodam exclusivamente nos serviços já registrados e sem rota externa. Nenhuma operação admite ID Docker fornecido pelo cliente. Não há operação genérica `docker`, `run`, `prune`, `down --remove-orphans`, remoção por label ou busca de nome. Se essa tradução não preservar o comportamento real, a alternativa exige uma interface explícita de transporte nos scripts operacionais e revisão pelo responsável desses arquivos, fora deste recorte.

## Evidência e encerramento

Capturar logs sanitizados e resultados antes do encerramento, inclusive em falha e sinais HUP, INT e TERM. Preservar o código original; falha de coleta/cleanup é evidência adicional e transforma sucesso em falha, nunca o contrário. Após SIGKILL, uma retomada pode usar o ledger privado do provisionador, mas não reconstruí-lo por varredura de recursos.

Remover somente IDs registrados pela própria criação, depois de reinspecionar ID, labels, tipo, mounts e namespace. Se houver divergência ou desfecho de criação incerto, não buscar por prefixo nem remover vizinhos. Registrar o resíduo e reprovar. Confirmar a ausência de cada ID exato após sua remoção. Falhas não autorizam `prune`, busca por nome ou outra limpeza ampla.

O workflow atual executa unidade e atualização com dublês. As três integrações e as validações de servidor/proxies, Helm e workflows continuam como etapas obrigatórias, mas explicitamente bloqueadas. Cada etapa guarda sua saída e mantém status de falha com `pipefail`; as etapas posteriores coletam evidências mesmo após falha. Não há limpeza Docker no workflow enquanto ele não cria recursos reais.

## Cenários que continuam bloqueados

- Backup GPG, cópia cifrada de ambiente, retenção, recuperação de aluno e migrações, preservação do banco anterior, age, rollback de saúde, dump corrompido e detecção de cópia remota adulterada com rclone local.
- Restauração por URL com recuperação de dados e migrações, preenchimento da validação e recusa de validação ausente.
- Atualização real com commit alvo, label OCI, conteúdo do volume, configuração do proxy e estado operacional preservados. A fixture de backup desse ensaio continua sendo um dublê explícito, não prova de backup real.
- Compose Caddy/Nginx, validação dos proxies e certificados sintéticos, lint/renderização Helm, kubeconform e actionlint. Esses comandos precisam de ferramentas e recursos confinados no novo modo, ou de uma implementação host revisada que não crie recursos Docker.

O desbloqueio exige RED/GREEN com clientes falsos para criação parcial, labels divergentes, colisão, erro e sinais; canário vizinho preservado; negativos de rede; e execução real de cada cenário. Os testes de recusa atuais não satisfazem esses gates de integração.
