# ADR-038: Automação de preview e fronteira de confiança

Estado: contrato anterior parcialmente suspenso; topologia dedicada pendente de aceite.

## Contexto

Um schema separa nomes de objetos, não comprova a fronteira de privilégios efetivos. Roles podem receber acesso por PUBLIC ou memberships; grants da instalação não foram examinados. Não se afirma exploração nem isolamento da instalação a partir de inspeção estática.

## Contrato implementado na proposta

- `schema-preview.yml` somente valida propostas, inclusive forks e sincronizações, sem environment de preview ou segredos de banco e plataforma. O ambiente do validador subprocessado é mínimo e usa conexão fictícia.
- Manutenção privilegiada fica em `schema-preview-confiavel.yml`, exclusivamente por dispatch na `main`, com checkout do SHA completo de `PREVIEW_TRUSTED_SHA`. O SHA precisa ter 40 hexadecimais e ser ancestral de `origin/main`, conferido por `git fetch` e `git merge-base --is-ancestor` antes do checkout, do segredo e de qualquer script. Scripts, lock e migrações dessa revisão precisam de revisão humana antes da indicação.
- `PREVIEW_MANUTENCAO_APROVADA=true` é um gate operacional explícito, não um valor configurado por esta mudança. O mantenedor precisa confirmar proteções reais do environment `preview` e acesso a segredos. Uma variável não substitui aprovação do environment.
- A manutenção aceita apenas fallback, limpeza de PR identificado numericamente e faxina. Não consome branch, artefato ou lock do PR e não aplica SQL proposto por ele com credencial compartilhada.
- Preparo automático e redeploy de PR ficam suspensos. A política nativa da Vercel também é externa ao Actions e exige conferência do mantenedor.

## Faxina completa

A API é consultada por páginas numéricas construídas na origem fixa do GitHub, com 100 itens por página e ordenação por criação. O leitor não segue URLs de Link nem redirects com token. A página curta final encerra a listagem. Erro HTTP, JSON inválido, formato estranho, número inválido, repetição de número ou limite de paginação interrompem antes de qualquer DROP. Somente nomes canônicos `preview_pr_<inteiro positivo>` entram na decisão.

A listagem REST é viva, não um snapshot transacional. Uma alteração concorrente capaz de mudar páginas exige repetir o inventário, não aproveitar uma resposta parcial. A unidade cobre duas páginas cheias, PR ativo na última página e zero remoções nos erros; a integração com PostgreSQL exclusivo continua um gate separado.

## Hipótese de privilégios e decisão pendente

A caracterização do legado em rodada sintética exclusiva, com canários, PUBLIC, membership e duas identidades, pertence ao executor de isolamento da issue #423-C e não integra esta frente. O ensaio mutante não foi executado. Seu resultado, quando autorizado, caracteriza o banco sintético, não os grants de serviços reais. O provisionador legado não foi alterado para remediar uma hipótese sem essa prova.

A proposta segura para migrações não confiáveis é um banco descartável dedicado por preview, com credenciais e rede limitadas ao próprio banco, fora da instalação e de outros previews. Isso não está aprovado nem provisionado. Exige decisão de custo, retenção, owner, descarte, bootstrap e inventário de privilégios efetivos. Não revogar PUBLIC globalmente no banco compartilhado nem transformar uma recusa em prova de segurança.
