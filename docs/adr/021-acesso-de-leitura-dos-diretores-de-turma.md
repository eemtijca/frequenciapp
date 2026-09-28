# ADR-021: acesso de leitura dos diretores de turma e guardas por capacidade

## Status

Aceita e implementada nas cinco fases, cada uma em pull request próprio. O roteiro de operação está em [operacao.md](../operacao.md#diretores-de-turma).

## Contexto

Os professores diretores de turma precisam acompanhar as estatísticas das próprias turmas sem acesso ao restante do aplicativo. Exportar os dados para arquivos em outro serviço tiraria o controle de acesso do aplicativo: o compartilhamento passaria a depender de links, os números ficariam defasados e a saída do professor da função não revogaria nada. A frequência de estudantes é dado pessoal de menores, e a escola é a controladora (ver [lgpd.md](../lgpd.md)).

Até aqui havia dois papéis e duas guardas: `exigirAdmin` para a gestão e `exigirSessao` para todo o resto, inclusive escrita. Um terceiro papel que passasse por `exigirSessao` ganharia escrita na chamada e nas saídas sem que ninguém tivesse decidido isso.

## Decisão

- **Acesso dentro do aplicativo, individual.** Cada diretor tem uma conta própria, cadastrada pela gestão, com uma palavra-chave individual. Não existe palavra compartilhada por turma: cada acesso tem autoria na auditoria e pode ser revogado sem afetar os demais.
- **Guardas por capacidade, com recusa por padrão.** As rotas consultam capacidades (`operar`, `administrar`, `alterarPropriaSenha`), nunca o papel. A matriz de papel para capacidades fica em `src/domain/usuarios.ts`, tipada como `Record<Papel, ...>`: um papel novo não compila sem declarar o que pode, e só recebe o que for listado. `exigirSessao` passa a significar "sessão com a capacidade `operar`", e `exigirAdmin`, "sessão com `administrar`". A página inicial só abre o aplicativo completo para quem tem `operar`.
- **A matriz é código, não configuração.** Quem cabe em cada papel, as turmas de cada diretor e os parâmetros vivem no banco e mudam pela Gestão. O que cada papel pode fazer é política de segurança: muda por pull request, com revisão e teste.
- **Nada de pessoa ou turma no código.** Diretores, vínculos com turmas e parâmetros entram pela Gestão. Migrações criam estrutura e valores padrão neutros, como na [ADR-020](020-justificativa-escrita-e-catalogo-de-liberadores.md).
- **Recorte pela turma de origem, em todas as séries.** `Aluno.turmaOriginalId` é obrigatório e, sem indicação, recebe a turma atual. Na 1ª e na 2ª série as duas coincidem; na 3ª, o diretor acompanha a turma de origem, o mesmo recorte da Grade e da planilha. Não há regra por série.
- **Escopo no servidor.** Toda consulta do diretor filtra pelas turmas do vínculo vigente, lidas do banco na própria requisição. Um identificador de turma vindo do navegador nunca amplia o escopo.
- **Parâmetros na Configuração, editáveis pela administração,** com valores iniciais conservadores: categorias visíveis (inicialmente só faltas), validade da palavra-chave (90 dias), duração da sessão do diretor, tentativas de entrada e janela de bloqueio, e limite de risco de frequência.
- **Emissão e revogação da palavra-chave só pela administração.**
- **Entrada por identificador.** O diretor entra com um identificador curto, sem arroba (por exemplo `3a-maria`), e a palavra-chave. O identificador fica na coluna `email`, que passa a ser o login de todas as contas: a equipe continua entrando por e-mail, e a ausência de arroba impede colisão entre os dois. A palavra-chave é a senha da conta, com o mesmo hash scrypt; o ciclo de vida fica em `credenciais_diretor`.

## Ciclo de vida da palavra-chave

| Estado    | Origem                                                 | Efeito                                                                             |
| --------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Emitida   | A administração gera a palavra para um diretor         | O servidor grava só o hash (scrypt) e mostra a palavra uma única vez, para entrega |
| Entregue  | Entrega fora do aplicativo, em mãos ou mensagem direta | O aplicativo não envia nada; registra a data de emissão                            |
| Em uso    | Primeira entrada com identificador e palavra-chave     | Troca obrigatória antes de qualquer dado, quando marcada; registra o primeiro uso  |
| Expirada  | O prazo da Configuração vence                          | A entrada é recusada e as sessões abertas caem                                     |
| Reemitida | A administração gera outra palavra                     | A anterior é revogada e as sessões dela são apagadas                               |
| Revogada  | Saída da função, suspeita de vazamento ou desligamento | Data e motivo registrados; todas as sessões da conta são apagadas na hora          |
| Encerrada | O vínculo com a turma termina ou o ano letivo vira     | A conta entra, mas não vê turma alguma; a Gestão sinaliza o diretor sem vínculo    |

Na virada do ano letivo, a Gestão revisa os vínculos. O fim de um vínculo é registrado, nunca apagado, para o histórico dizer quem via o quê em cada período.

## Fases

1. Esta ADR e as guardas por capacidade, com o teste que exige guarda em todo manipulador da API. Nenhum comportamento muda para os papéis atuais.
2. Papel `DIRETOR_TURMA`, vínculos com turmas, credenciais com o ciclo acima e limite de tentativas persistido no banco (o limitador atual é em memória, ver [seguranca.md](../seguranca.md)).
3. Seção de diretores e parâmetros na Gestão.
4. Entrada do diretor e a visão "Minhas turmas", só leitura, com os gráficos.
5. Roteiro de operação: entrega da palavra-chave, resposta a vazamento e virada do ano letivo.

## Consequências

- Uma rota nova sem guarda reprova `tests/unit/guardas-rotas.test.ts`; as rotas públicas ficam listadas no teste com o motivo.
- Decidir acesso comparando o papel dentro de uma rota também reprova o teste. A interface usa `temCapacidade` para mostrar ou esconder ações, sem que isso substitua a guarda do servidor.
- A mensagem de recusa de quem não tem `operar` é genérica e não revela o papel. A de gestão continua "Apenas o administrador pode fazer esta operação."
