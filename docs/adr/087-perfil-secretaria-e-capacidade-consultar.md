# ADR-087: perfil Secretaria e a capacidade consultar

## Estado

Aceita.

## Contexto

A secretaria da escola precisa consultar a frequência, no Painel, na Grade e no Por aluno, mas não deve fazer chamada nem registrar nada. O controle de acesso já é por capacidade ([ADR-021](021-acesso-de-leitura-dos-diretores-de-turma.md)), mas só havia `operar`, que dá a chamada, as saídas, as entradas e os relatórios, e `administrar`. Quem consultava a escola toda também operava, e o diretor de turma só lê estatísticas das turmas do próprio vínculo.

## Decisão

- O enum `papel` ganha `SECRETARIA`, em uma migração aditiva. A conta é da equipe: nasce em Gestão, Equipe, como a da coordenação e a da administração.
- A matriz de acesso ganha a capacidade `consultar`: ler o Painel e os relatórios de frequência. `ADMIN` e `COORDENACAO` a têm, junto com o que já tinham. `SECRETARIA` tem só `consultar` e `alterarPropriaSenha`: não opera, não administra e não recebe avisos. Um teste fixa as relações entre as capacidades: administrar implica operar, e operar implica consultar.
- As leituras que o Painel, a Grade e o Por aluno usam passam a exigir `consultar`: `GET /api/frequencias`, `GET /api/frequencias/resumo`, `GET /api/saidas`, `GET /api/configuracoes` e `GET /api/relatorios/grade/retrato`. Toda escrita e toda outra leitura seguem em `operar` ou `administrar`, então a Secretaria recebe 403 em chamada, saídas, entradas, presença parcial, relatório de saídas e entradas, alunos, turmas, séries, equipe, diretores, cópia de segurança e avisos.
- A página inicial abre o aplicativo completo com `operar` e, só com `consultar`, o aplicativo reduzido. Outro papel sem essas capacidades volta à entrada, como antes. O modo consulta não carrega os liberadores de saída.
- O aplicativo reduzido tem Painel e Relatórios, e em Relatórios só a Grade e o Por aluno. Não tem Chamada, Chamada Parcial, Horários, Saídas e Entradas, Provas, Alunos, Gestão, FrequenciBI, o botão de notificações nem o item Notificações do menu da conta. Um link direto para uma área de fora abre o Painel, ou a Grade no caso de um relatório fechado. A interface apenas não oferece o que o servidor já recusa; a segurança está nas capacidades, não no que a tela esconde.
- A Grade não consulta o estado da planilha nem oferece o envio a quem não pode enviar. Emitir o relatório em PDF e baixar o CSV continuam, porque só leem.
- Quem pode liberar saídas (`GET /api/responsaveis`) e quem recebe os avisos de chamadas pendentes passam a sair da capacidade (`operar` e `receberNotificacoes`), não de uma lista fixa de papéis. A Secretaria fica fora dos dois, e um papel novo só entra se receber a capacidade.

## Alternativas

- Reaproveitar `COORDENACAO` com uma marca de "só consulta": duas fontes de verdade para o acesso, e a marca seria fácil de esquecer em uma rota nova.
- Dividir `operar` em capacidades menores (chamada, saídas, relatórios): resolve o caso, mas muda a política de todas as rotas de uma vez e aumenta o que cada revisão precisa conferir. A capacidade `consultar` cobre o pedido sem mexer nas escritas.
- Esconder as áreas só na interface: a Secretaria continuaria podendo gravar chamada pela API.
- Tratar a Secretaria como diretor de turma: o diretor lê só estatísticas das turmas do vínculo, e a Secretaria precisa da escola toda, por aluno.

## Consequências

- A Secretaria lê, nessas telas, o que a coordenação lê: nomes dos alunos, faltas, justificativas e saídas da escola toda. O `docs/lgpd.md` registra isso na seção de papéis. Não vê o cadastro de alunos nem as demais áreas.
- Um papel novo de leitura passa a ser só uma linha da matriz e uma opção na Equipe, mais as rotas que ele precisar.
- Toda rota de leitura nova das telas de consulta precisa escolher entre `consultar` e `operar`. O teste de acesso da Secretaria lista, por rota, o que passa e o que recebe 403, e o de ponta a ponta confere que a navegação da Secretaria não dispara requisição recusada.
- A migração é aditiva e não reescreve dados existentes. O banco aceita o valor novo sem mudar as contas atuais.
