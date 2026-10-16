# ADR-047: regras do React Compiler no lint

## Estado

Aceita.

## Contexto

O `eslint-config-next` 16.4 exige `eslint-plugin-react-hooks` 7.1, e a versão 7.1 trouxe detecção mais ampla das regras do React Compiler: `set-state-in-effect`, `refs` e `purity`. A troca de versão fez o `pnpm run lint` reprovar 15 pontos do repositório, todos anteriores à atualização.

Duas famílias de acusação apareceram. A primeira é real: escrita de ref durante o render, leitura de `Date.now()` durante o render e estado reiniciado dentro de efeitos de sincronização. A segunda depende da estrutura acidental do código, não do comportamento: o mesmo auxiliar assíncrono que só toca no estado depois de um `await` é aprovado quando fica dentro de `try`/`finally` e reprovado quando tem `catch`, quando é escrito sem o `try` ou quando o resultado do `await` passa por um `.catch`. A análise das continuações do `await` é conservadora, e `pedir`, mesmo sendo assíncrona, é tratada como capaz de lançar de forma síncrona.

## Decisão

Corrigir de verdade o que a regra acerta:

- a escrita do ref em `use-acao-unica` passou para um efeito sem dependências;
- o prazo do modo completo passou a usar `useMinutoCorrente`, que entrega o minuto do cliente depois da hidratação e a cada minuto, sem ler o relógio durante o render nem divergir entre servidor e cliente;
- a prop `alvo` da Chamada, a primeira turma, o reinício do diálogo de notificações e o carregando das saídas do dia passaram a ser estado derivado durante o render, como o React recomenda, no lugar de efeitos que escreviam estado depois da pintura;
- o comparativo do BI deixou de limpar o estado no início do efeito: o recorte por identificador já descarta resultado de outro filtro.

Manter exceções pontuais, com justificativa na própria linha, nos casos em que a regra não distingue o padrão pretendido:

- `src/components/auth/tela-login.tsx`: semente única do e-mail lembrado e do aviso de sessão expirada lida do armazenamento do navegador. Semear durante a renderização do servidor divergiria a hidratação;
- `src/components/bi/vista-bi.tsx`: semente única das preferências guardadas, pelo mesmo motivo;
- `src/components/frequencia/vista-frequencia.tsx`: efeito de carregamento da Chamada, que reinicia o estado antes da busca para nenhuma marca do dia anterior aparecer enquanto a chamada nova não chega;
- `src/components/gestao/integracao-planilha.tsx`, `src/components/gestao/integracao-parcial.tsx`, `src/components/gestao/integracao-saidas.tsx` e `src/lib/use-dados-bi.ts`: carregamento de montagem por auxiliar assíncrono, cujo veredito muda conforme a estrutura acidental do auxiliar.

Nenhuma regra é desativada no `eslint.config.mjs`. As exceções são locais e cada uma aponta para este ADR.

## Consequências

O `eslint-config-next` volta a receber atualizações e o lint segue reprovando as violações reais das três regras. Quem tocar nos trechos com exceção precisa reavaliar se a justificativa ainda vale; a regra acusa o primeiro ponto de cada efeito, então mover o `setState` dentro de um efeito com exceção pode exigir ajustar a linha da exceção. Se o plugin passar a analisar as continuações do `await` com precisão, as quatro exceções de carregamento saem e restam só as duas de armazenamento do navegador.
