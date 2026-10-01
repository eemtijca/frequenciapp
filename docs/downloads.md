# Downloads protegidos

As exportações contêm dados escolares pessoais. O aplicativo oferece ZIP protegido por senha na grade de frequência, na relação de alunos e na cópia de segurança. A proteção do arquivo contribui para a segurança no armazenamento e compartilhamento, prevista no art. 46 da LGPD.

## Uso

1. Acionar Baixar planilha, Exportar relação ou Baixar cópia.
2. Manter ZIP protegido por senha selecionado, definir uma senha entre 12 e 128 caracteres e confirmar a mesma senha. Preferir frase longa e exclusiva, diferente da senha de acesso.
3. Acionar Baixar ZIP protegido. O arquivo só é preparado após essa confirmação; cancelar não solicita a cópia de segurança nem gera download.
4. Guardar a senha separada do arquivo. Ao compartilhar, encaminhar a senha por outro canal e somente a pessoas autorizadas.
5. Abrir com um extrator compatível com ZIP AES, como 7-Zip ou Keka. Extrair o CSV ou JSON antes de importar uma relação ou cópia no aplicativo.

A opção Arquivo original sem senha mantém o CSV ou JSON existente. A interface avisa que qualquer pessoa com acesso ao arquivo poderá ler o conteúdo. A escolha não é lembrada: cada nova exportação começa na opção protegida.

A cópia completa exige também a senha atual da administração, tanto no formato original quanto no ZIP. Essa senha de acesso é conferida pelo servidor, com até cinco tentativas incorretas em 15 minutos; a senha do ZIP continua somente no navegador. CSV de grade e relação registra preparação na auditoria com conta, tipo, formato e data, sem nome de aluno, conteúdo ou senha. O evento não comprova que o navegador salvou o arquivo. A cópia mantém o registro `backup.exportar`.

## Conteúdo e permissões

| Download            | Conteúdo interno do ZIP                                                                     | Permissão                    |
| ------------------- | ------------------------------------------------------------------------------------------- | ---------------------------- |
| Grade de frequência | `grade.csv`, com o mesmo período e alunos ativos da turma de origem da exportação original. | Administração e coordenação. |
| Relação de alunos   | `relacao-alunos.csv`, no schema de importação, com alunos ativos.                           | Administração.               |
| Cópia de segurança  | `copia.json`, com os mesmos dados escolares da cópia original.                              | Administração.               |

Os arquivos externos são `frequenciapp-grade.zip`, `frequenciapp-relacao-alunos.zip` e `frequenciapp-copia.zip`. Os nomes são genéricos porque o diretório de um ZIP, incluindo nomes internos, fica visível mesmo quando o conteúdo está criptografado. A proteção não amplia acesso nem altera os dados exportados. A cópia continua sem contas, senhas de acesso, tokens ou configurações de notificações.

## Tratamento da senha

A criptografia WinZip AES-256 (AE-2) é feita no navegador por `@zip.js/zip.js`. Não usa ZipCrypto. Cada arquivo recebe sal aleatório e autenticação do conteúdo. A senha não passa por API, URL, auditoria ou armazenamento do aplicativo. Fica apenas na memória durante o diálogo e o processamento; os campos são limpos ao concluir, cancelar, escolher o formato original ou desmontar o diálogo. Não existe recuperação de senha pelo app. O navegador e extensões continuam sujeitos às políticas do dispositivo.

O conteúdo é empacotado sem compressão, evitando dependência de workers, WASM ou codecs adicionais nos celulares. A biblioteca é carregada somente quando há exportação protegida. As URLs locais do download são liberadas após 60 segundos; fechar a visão durante a preparação impede iniciar o download.

## Cuidados e limites

- O ZIP protege o conteúdo enquanto permanece criptografado. O CSV ou JSON extraído volta a ser legível, assim como a opção de formato original.
- A qualidade da senha importa: AES-256 não impede tentativa de adivinhação de senhas previsíveis. O formato WinZip AES usa a derivação de chave definida por esse padrão; a frase longa ajuda a resistir a ataques offline.
- Alguns extratores nativos não aceitam ZIP AES. A solução é usar um extrator compatível, sem reduzir a proteção para ZipCrypto.
- Guardar arquivos, cópias extraídas e senhas pelo tempo necessário à finalidade da escola e eliminar cópias sem uso. A retenção do banco permanece sob a política da controladora.
- A exportação no navegador não garante ausência de cópias em downloads, sincronização do dispositivo ou cópias de segurança externas.
- Enviar à planilha Google é uma integração distinta de download. As permissões, conteúdo e destino dessa integração seguem [planilha.md](planilha.md).

Os testes verificam AES-256, conteúdo original byte a byte, senha incorreta, alteração da cifra, sal aleatório, nomes genéricos, cancelamento, ausência da senha nos pedidos e no armazenamento e toque duplo. A decisão está na [ADR-031](adr/031-downloads-protegidos.md).
