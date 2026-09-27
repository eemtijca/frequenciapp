# ADR-019: integração de saídas antecipadas com Google Planilhas

## Status

Aceita.

## Contexto

A escola mantém a frequência em uma planilha e precisa registrar as saídas antecipadas em
outra, uma linha por saída. O envio precisa continuar opcional, manual e conservador, sem
alterar o que já existe, e o script único já publicado deve servir às duas planilhas sem
ganhar ação nova.

## Decisão

Segunda finalidade da mesma integração, em aba única de registro:

- uma linha de configuração por finalidade (`FREQUENCIA` e `SAIDAS`), com endpoint, token e
  modo próprios;
- o mesmo `gas/Codigo.gs` é publicado em cada planilha, com implantação e token próprios;
- a aba de registro tem uma linha por saída, com colunas reconhecidas por rótulo (Data,
  Aluno, Turma, Momento, Justificativa, Observação e Liberado por);
- o envio é manual, com prévia e confirmação, disparado pela vista Saídas, e a configuração
  é restrita à administração;
- no modo conservador só célula ou linha vazia é preenchida; no modo completo, correção e
  remoção atingem apenas linhas criadas pela integração, sempre com cópia antes.

## Consequências

- O histórico de envios ganha a finalidade, e o quadro de sincronizações da frequência não
  é afetado.
- A vista Saídas depende de a integração estar configurada; o botão fica bloqueado com aviso
  e relê o estado quando a vista fica visível.
- A segunda planilha guarda justificativa e observação das saídas, na mesma conta Google da
  escola; `docs/lgpd.md` e `docs/seguranca.md` refletem o envio.
