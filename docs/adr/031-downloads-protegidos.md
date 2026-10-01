# ADR-031: ZIP protegido nos downloads

## Estado

Implementada para revisão.

## Contexto

Grade, relação de alunos e cópia de segurança são baixadas como CSV ou JSON legível. A exportação precisa oferecer proteção por senha no computador e no celular, preservando formatos, permissões e importações existentes.

## Decisão

Usar um diálogo compartilhado com ZIP protegido inicialmente selecionado e arquivo original como escolha explícita. Exigir senha confirmada, entre 12 e 128 caracteres Unicode, sem aparar ou normalizar o valor. Recomendar frase longa e exclusiva. Preparar o arquivo apenas após validação; cancelar não consulta a API de cópia.

Empacotar no navegador com `@zip.js/zip.js`, licença BSD-3-Clause, usando WinZip AES-256 AE-2, sal aleatório e autenticação. Desligar ZipCrypto, workers e compressão. O módulo nativo é carregado sob demanda, sem alterar CSP nem acrescentar recursos externos. A biblioteca implementa o padrão; não há criptografia própria.

Manter senha e conteúdo somente em memória no fluxo do app, sem transmitir, persistir ou registrar a senha. Desmontar o conteúdo do diálogo ao fechar, limpar ao escolher arquivo original e impedir download após desmontagem durante a preparação. Tratar erros sem exibir mensagens internas do empacotador, com opção de tentar novamente e sem baixar conteúdo desprotegido como alternativa automática. A trava de ação única evita dois downloads no toque duplo.

Usar nomes genéricos dentro e fora do ZIP porque nomes do diretório não são criptografados. Manter o conteúdo e os nomes atuais quando a pessoa escolher o formato original. Orientar extração antes de importar e uso de extrator compatível.

Exigir novamente a senha da administração para exportar a cópia completa, com a mesma confirmação limitada já usada nas ações sensíveis da planilha, extraída para um módulo comum. Mover a exportação para `POST /api/backup/exportar`, com senha no corpo e CSRF, e encerrar o GET sem confirmação. Registrar preparação de grade e relação com conta, tipo, formato e data, sem arquivos nem senhas. A cópia mantém o evento de exportação existente.

## Alternativas

ZipCrypto oferece compatibilidade ampla, mas proteção fraca contra ataques conhecidos. Gerar no servidor exigiria transmitir a senha e tratar mais conteúdo sensível. Formato proprietário criptografado perderia interoperabilidade com extratores comuns. Comprimir com codecs externos ou workers acrescentaria recursos de build e restrições nos navegadores sem benefício necessário para a proteção solicitada.

## Consequências

Há uma dependência nova, sem dependências transitivas, e duas rotas novas. Não há migração nem variável de ambiente. Clientes anteriores da exportação por GET precisam migrar para a confirmação por POST. A opção protegida acrescenta a escolha de formato e senha antes do download. ZIP AES pode exigir extrator adicional, e o empacotamento sem compressão não reduz o tamanho do conteúdo. Senhas previsíveis continuam sujeitas a tentativa offline; o padrão WinZip usa PBKDF2-HMAC-SHA1 com 1.000 iterações, o que reforça a necessidade de frase longa. Não há recuperação de senha. Arquivos extraídos e arquivos originais exigem os mesmos cuidados de guarda e compartilhamento da exportação anterior.
