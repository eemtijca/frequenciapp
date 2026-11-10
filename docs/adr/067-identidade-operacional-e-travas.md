# ADR-067: identidade operacional e travas por projeto Compose

## Estado

Aceita em 2026-11-10.

## Contexto

As rotinas de auto-hospedagem usam Docker Compose para atualizar, copiar e restaurar o banco, executar a agenda e instalar o cron. O nome do projeto podia ser inferido do diretório, e uma operação podia atingir um projeto vizinho quando os nomes de serviço coincidiam. A trava única por host também serializava instalações independentes sem necessidade. A confirmação de backup remoto era lida como texto, o que aceitava valores truncados ou diferentes do booleano esperado.

## Decisão

- O `COMPOSE_PROJECT_NAME` é obrigatório e precisa ser explícito no ambiente de operação. O Compose é sempre montado com `--project-name`.
- A identidade reúne o ID do daemon, o projeto, os serviços da aplicação e do banco, os labels do Compose e as montagens persistentes do banco. Segredos e variáveis resolvidas não entram na chave.
- Antes da primeira subida, `identidade.sh --iniciar` confere a configuração declarada sem exigir containers. Depois da subida, `identidade.sh --adotar --confirmar` grava o registro privado em `/etc/frequenciapp/identidade.json`, com modo 600. O modo `--conferir` apenas compara o registro com os recursos atuais.
- A trava é derivada da identidade e fica em `SERVIDOR_LOCK_DIR`. Operações do mesmo projeto são serializadas; projetos independentes progridem em paralelo. O descritor herdado só é aceito quando aponta para a trava do mesmo projeto, e a identidade é revalidada depois da aquisição.
- A atualização só aceita backup remoto confirmado quando `verificadoRemoto` é o booleano `true`. Texto, número, nulo, campo ausente ou JSON truncado bloqueiam a operação.
- As rotinas passam a exigir Node.js e `jq` no host.

## Alternativas consideradas

- Inferir o projeto pelo diretório: recusada por permitir colisão entre instalações e por depender do caminho de checkout.
- Manter uma trava global por host: recusada por bloquear projetos independentes e por acoplar operações sem relação.
- Aceitar a string `true` na confirmação remota: recusada por aceitar JSON truncado, texto livre e valores ambíguos.
- Executar a verificação dentro do contêiner da aplicação: recusada porque o modo inicial precisa funcionar antes da primeira subida e porque aumentaria o acoplamento com a pilha.
- Guardar a identidade em texto claro sem permissão restrita: recusada porque o registro revela a topologia local e precisa ser privado.

## Consequências

- A instalação nova tem dois passos explícitos, um antes e outro depois da primeira subida.
- O host precisa de Node.js e `jq`, verificados pelas mensagens das rotinas.
- A trava é local ao host e não coordena réplicas ou máquinas distintas.
- Mudança de daemon, projeto, serviço ou volume exige revisão manual do registro, sem adoção automática.
- O backup remoto passa a falhar fechado quando a confirmação não for um booleano verdadeiro.
