# ADR-023: código do aluno na linha da planilha

A conexão e as exigências de Apps Script descritas nesta decisão são históricas e foram substituídas pela [ADR-033](033-integracao-exclusiva-com-google-planilhas.md).

## Status

Aceita.

## Contexto

A integração com o Google Planilhas achava a linha de cada aluno pelo nome normalizado. Com a reorganização das turmas da 3ª série, a consolidação pela turma original ganhou peso, e o casamento por nome tinha riscos concretos de troca ou duplicação:

- o esquema salvo limitava a leitura e a posição da linha nova; depois de um envio que criava linhas, o seguinte podia gravar marcas na linha de outro aluno;
- uma grafia diferente criava uma linha duplicada;
- dois alunos com o mesmo nome caíam na mesma linha;
- duas abas podiam receber a mesma turma original.

## Decisão

- **Código invisível por linha.** O script grava, em cada linha de aluno, um metadado de desenvolvedor `frequenciapp.aluno` com o id do aluno no aplicativo. O metadado acompanha a linha quando outras entram, saem ou a aba é ordenada, e não aparece para quem usa a planilha.
- **Casamento pelo código.** O envio acha o aluno pelo código. Sem código, usa o nome só quando ele é único na turma do aplicativo e entre as linhas ainda sem código, e grava o código na mesma operação (`vincularLinhas`), conferindo que a célula do nome ainda mostra o texto lido na prévia.
- **Leitura até o fim da aba.** A leitura não se limita ao esquema salvo, e a linha de aluno novo entra depois da última linha com conteúdo.
- **Uma aba por turma original** no mapa.
- **Versão 3 do script obrigatória para o envio de frequência.** Sem os códigos na leitura, a prévia pede a publicação da versão atual.

## Alternativas

- Coluna visível com o código: dispensa mudar o script, mas fica exposta a edição e exclusão acidentais.
- Aba própria reescrita pelo aplicativo a cada envio: elimina o casamento, mas descarta a edição manual e rompe com as abas que a escola já usa.

## Consequências

- Publicar a versão 3 do `gas/Codigo.gs` antes do próximo envio.
- O primeiro envio depois da atualização vincula as linhas existentes pelo nome; os seguintes usam só o código. Homônimos sem código ficam com aviso para conferência manual.
- A restauração de uma cópia de segurança recria os códigos da cópia.
