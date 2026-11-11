# ADR-065: atualização e recuperação verificáveis na auto-hospedagem

## Estado

Implementada para revisão.

**Nota sobre o estado atual:** as decisões abaixo registram o desenho original. A revisão acrescenta perfis explicitamente adotados para [controlador estável](../controlador-manutencao.md), [retenção Dropbox](../dropbox-retencao.md), [restauração URL](../restauracao-url.md) e [origem autenticada](../origem-backup.md). Configuração ausente ou incompatível continua recusada. O padrão preserva 30 conjuntos confirmados, sem impor esse valor a overrides explícitos. A implementação não autoriza ativação operacional nem substitui os gates de aceite.

## Contexto

A referência de auto-hospedagem da ADR-064 entregou atualização, backup e restauração em scripts. Um ensaio em instalação descartável mostrou que o atualizador não montava o Compose antes do uso, construía a imagem antes do checkout do commit alvo, aceitava o primeiro uso sem backup e exigia a imagem opcional de backup de planilhas. A restauração recriava o banco e falhava no schema `public`, deixando a aplicação parada. O backup gravava um dump temporário em texto claro, confiava no checksum remoto e aplicava retenção apenas por idade. O cron escrevia `CRON_TZ` sem confirmar o suporte da implementação.

A correção precisa continuar portátil entre instalações Linux suportadas, sem supor IP, domínio, usuário, caminho, nome de projeto Compose, serviço, volume, transporte ou credencial de uma máquina específica.

## Decisão

### Instalação

- Toda rotina Compose monta a configuração e executa `docker compose config --quiet` antes de usar a pilha.
- O conjunto de arquivos Compose, o nome do projeto e os nomes dos serviços podem ser configurados por variáveis de ambiente.
- Os caminhos externos continuam válidos e são citados nas linhas do cron.

### Atualização

- O backup anterior é obrigatório em toda atualização, inclusive no primeiro uso sem estado registrado.
- A imagem do modo `main` é construída em uma worktree isolada do commit alvo. A instalação principal só muda depois da validação.
- A imagem recebe o rótulo OCI `org.opencontainers.image.revision` e o valor é conferido antes da aplicação.
- A imagem de backup de planilhas só é baixada ou construída quando a rotina está habilitada.
- Migrações novas continuam bloqueadas por padrão.
- O controlador não inicia automaticamente a imagem anterior após migração possível ou resultado incerto. Preserva journal e pins; recuperação exige inspeção e decisão administrativa sobre compatibilidade.
- A atualização preserva o mesmo projeto e os mesmos volumes do Compose.

### Backup

- O dump é cifrado em fluxo, sem arquivo temporário em texto claro.
- A validação usa `pg_restore -l` sobre o fluxo, antes de o arquivo ser confirmado.
- O hash local é guardado antes do envio. A verificação remota compara o arquivo baixado com esse hash, sem confiar no checksum remoto.
- A retenção local preserva um mínimo configurável de cópias confirmadas, com padrão de 30, além do limite por idade.
- A limpeza remota é opcional, usa o mesmo mínimo e só ocorre depois de upload e verificação bem-sucedidos.
- O checksum remoto é um manifesto não assinado. A comparação com o hash local cobre a adulteração do provedor, mas não substitui assinatura de manifesto em modelos de ameaça mais fortes.

### Restauração

- O dump é conferido, decifrado em diretório privado e validado com `pg_restore -l` antes de qualquer operação destrutiva.
- No modo Compose, o dump é restaurado em um banco descartável e o histórico de migrações e as tabelas são conferidos.
- Só depois da validação a aplicação é parada. O banco em uso é renomeado para um nome de recuperação e o banco validado assume o nome de produção.
- Em falha antes da troca, a aplicação continua no ar. Em falha depois da troca, o script tenta voltar ao banco anterior e religar a aplicação.
- O banco anterior é preservado por padrão e pode ser descartado por configuração depois da conferência.
- No modo URL, o perfil direto cria o próprio banco de ensaio e recusa URLs externas de validação. A opção `--sem-validacao` é explícita e documentada como risco.
- O dump cobre apenas o schema configurado. Roles, ACLs, publicações, assinaturas e dependências externas não fazem parte do arquivo.

### Agendamento

- O instalador confirma se o daemon do cron usa o mesmo fuso de `TZ_APP`.
- `CRON_TZ` só é gravado quando a implementação comprova suporte. Do contrário, o instalador recusa a configuração em vez de agendar no horário errado.
- Os CronJobs do Kubernetes aceitam `timeZone` por valor configurável, com exigência documentada de Kubernetes 1.27 ou superior.

## Alternativas consideradas

### Manter o build no checkout principal

Exigiria alterar o checkout antes de saber se a imagem e o Compose são válidos. A worktree mantém a instalação limpa e permite comparar o commit e a imagem.

### Confiar no checksum remoto

Não detecta a alteração conjunta do arquivo e do seu checksum. O hash local é independente do transporte.

### Restaurar diretamente sobre o banco em uso

Depois de uma falha, a aplicação pode ficar parada ou voltar com um banco incompleto. A validação em banco descartável e a troca de nomes permitem recuperar o banco anterior.

### Retenção apenas por idade

Pode apagar todas as cópias antigas quando o intervalo entre backups é maior que a política. O mínimo de cópias confirmadas preserva uma janela de recuperação.

## Consequências

### Positivas

- A instalação não é alterada por um alvo inválido.
- O primeiro uso e as falhas de backup bloqueiam a atualização.
- A restauração tem validação e caminho de volta.
- O backup não deixa dump em texto claro no diretório de trabalho.
- A retenção não apaga todas as cópias confirmadas.
- O horário do cron deixa de ser uma suposição silenciosa.

### Negativas e riscos

- A worktree e a validação em banco descartável exigem espaço em disco adicional.
- O modo Compose mantém o banco anterior até a conferência, consumindo espaço.
- O modo URL exige o perfil direto suportado, permissão para criar o próprio banco de ensaio ou a decisão explícita de dispensá-lo.
- A troca de banco exige permissão para renomear bancos e encerrar conexões.
- A atualização continua dependendo de cron, Git, Docker Compose, GPG ou age e rclone conforme a configuração.
- O rollback da imagem não reverte migrações.
