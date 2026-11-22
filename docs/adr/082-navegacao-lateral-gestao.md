# ADR-082: navegação lateral de Gestão e preferência de movimento

- Status: aceita
- Complementa o [ADR-081](081-material-ui-e-tema-dos-templates.md).

## Contexto

A navegação da aplicação já fica na gaveta, mas Gestão e Configurações acumulavam abas, uma lista ou seletor de categorias e trilhos de seção. A troca de destino não deve descartar rascunhos nem afetar permissões. A redução de movimento também precisa alcançar os componentes que encerram transições em JavaScript, inclusive os portados.

## Decisão

- Reusar a gaveta do aplicativo, modal abaixo de 905 px e permanente a partir daí. Manter três níveis: menu principal, Gestão e Configurações. As seções de uma categoria se expandem dentro do terceiro nível. O nível mostrado não define os painéis montados, e voltar ao menu principal não muda o destino.
- Manter uma única indicação acessível da opção atual na navegação visível. Se a seção ativa estiver recolhida, indicar sua categoria. Mover o foco para Voltar ao entrar em um nível e para o acionador do nível ao retornar. No celular, focar o título ativo após escolher um destino final ou mudar para desktop; voltar ao gatilho apenas ao dispensar a gaveta. Abertura de aviso de pendência ou ação de conta entrega o foco ao diálogo.
- Animar apenas a lista ao mudar de nível, no sentido inverso ao voltar. Reabrir a gaveta, mudar de largura ou reativar movimento não repete a animação. Com movimento reduzido, o shell conclui o fechamento da gaveta e dos avisos de pendência pela API de transição do MUI e libera o fundo, mesmo que a redução tenha sido aplicada durante a saída.
- A preferência pessoal mora no navegador, não nas configurações da escola. Sistema acompanha `prefers-reduced-motion`; Ativadas e Desativadas prevalecem quando selecionadas explicitamente. Sem armazenamento, a escolha vale na sessão atual. Indicadores de carregamento mantêm indicação estática sem movimento.

## Consequências

Os painéis visitados e seus rascunhos permanecem montados com chaves estáveis. Trocar o nível é independente de trocar a visão e de gravar configurações. Não há rota nova, entrada adicional de histórico, mudança no OAuth ou alteração nas permissões. Abas funcionais e acordeões de formulários que não navegam entre os destinos de Gestão continuam no conteúdo.
