# Backup externo portátil

Rotina opcional para copiar as planilhas para um armazenamento escolhido pela escola, sem SDK ou biblioteca de provedor no FrequenciApp. O transporte usa o executável externo rclone. Origem e destino ficam na configuração do executor: Dropbox, outro serviço compatível ou disco local. Trocar o destino não altera o pacote, o banco nem a aplicação.

A rotina não está ativada pelo deploy. Roda fora da Vercel e do processo que atende o celular, em executor Linux com Node 24, dependências do projeto instaladas e rclone disponível no `PATH`. O operador configura e agenda esse executor. Nenhum arquivo real é enviado na instalação ou nos testes.

## Proteções

- Cada execução gera um ZIP com data UTC e identificador aleatório. As transferências usam `copy` e `copyto --immutable`, sem espelhar exclusões, apagar versões ou substituir arquivos anteriores.
- O conteúdo é protegido com ZIP AES-256, usando a biblioteca de ZIP já presente no projeto. Não há dependência nova de SDK. O manifesto, os nomes originais e os arquivos ficam criptografados. Os nomes visíveis no diretório do ZIP são genéricos.
- A origem é baixada para uma pasta temporária privada. O pacote é decifrado e conferido localmente antes do envio. Depois de enviar, a rotina relê integralmente o ZIP do destino e compara o tamanho e o SHA-256. Só então envia um comprovante `.confirmado.json`.
- A rotina recusa origem vazia, links simbólicos, configuração legível por outras contas e pacotes acima de 64 MiB ou mil arquivos. Também limita os bytes expandidos ao conferir um ZIP.
- Falhas encerram a execução com código 1 e mensagem genérica, sem senhas, nomes de alunos ou resposta do provedor. O transporte tem tempo limite e uma tentativa por operação. O pacote nunca é confirmado depois de uma transferência ou conferência que falhou.
- A chave do pacote e as credenciais da aplicação não são repassadas ao processo do rclone. O processo recebe somente o ambiente necessário ao transporte e à leitura da configuração privada.
- O diretório temporário é removido ao terminar ou falhar normalmente. Uma interrupção forçada da máquina pode impedir essa limpeza. Usar executor com disco criptografado e pasta temporária efêmera, preferencialmente em memória, sob controle da escola.

O código operacional está em `scripts/backup-externo.mjs`, com uma porta de transporte substituível. `scripts/pacote-backup.mjs` produz e confere o formato portátil, sem consultar provedores, banco ou API da aplicação. O formato permite recuperação com ferramentas compatíveis com ZIP AES-256, como 7-Zip.

## Preparar os perfis

Em um executor controlado pela escola:

1. Instalar o rclone por distribuição confiável, mantendo a verificação dos pacotes. O ensaio local foi feito com a versão 1.60.1 da distribuição.
2. Criar uma configuração privada, fora do repositório, para a origem e o destino:

   ```bash
   umask 077
   rclone config --config /etc/frequenciapp-backup/rclone.conf
   chmod 600 /etc/frequenciapp-backup/rclone.conf
   ```

3. Escolher nomes genéricos, como `origem` e `destino`, e manter as pastas separadas. A aplicação não recebe esses tokens. Usar credenciais restritas à finalidade, autenticação em duas etapas e conta sob controle da escola. Quando o provedor permitir, restringir o acesso à pasta do backup. A criptografia da configuração do próprio rclone é compatível com `RCLONE_CONFIG_PASS` no ambiente do executor.
4. Na origem Google Drive, usar autorização própria da rotina e somente leitura, preferencialmente com conta dedicada e acesso apenas aos arquivos necessários. Definir uma pasta que contenha as planilhas escolhidas. O acesso da rotina é separado do OAuth do FrequenciApp e não exige ampliar o escopo da aplicação.
5. Configurar a exportação de Google Planilhas para Excel no perfil da origem. O rclone usa `xlsx` entre seus formatos padrão; o parâmetro avançado `export_formats` pode limitar a exportação a esse formato. Conferir a lista de arquivos exportados antes de agendar. O código da rotina não contém regra específica do Google ou do Dropbox.

A pasta de origem pode conter a planilha de frequência, a de saídas e entradas e a de Chamada Parcial. Uma origem local já preparada também é aceita por um perfil `local` do rclone. Não colocar nessa pasta configurações, chaves ou outros documentos da escola.

## Configurar a rotina

Copiar o exemplo [backup.env.example](exemplos/backup.env.example) para um arquivo privado, como `/etc/frequenciapp-backup/backup.env`. Ele é exclusivo do executor e não pertence ao `.env` da aplicação, ao Compose ou à Vercel.

| Variável               | Uso                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `BACKUP_RCLONE_CONFIG` | Caminho absoluto do arquivo privado de perfis. A rotina recusa permissões de grupo ou de outras contas. |
| `BACKUP_ORIGEM`        | Perfil e pasta da origem, por exemplo `origem:planilhas`.                                               |
| `BACKUP_DESTINO`       | Perfil e pasta do destino, por exemplo `destino:frequenciapp`.                                          |
| `BACKUP_CHAVE`         | Chave de recuperação de 32 a 256 caracteres, usada somente no pacote.                                   |
| `RCLONE_CONFIG_PASS`   | Opcional, apenas quando a configuração do próprio rclone foi criptografada.                             |

Gerar uma chave aleatória forte, por exemplo com `openssl rand -base64 32`, e guardá-la em gerenciador de senhas controlado pela escola, separado do destino dos backups. Não colocar a chave em argumentos, Git, logs, mensagens ou na pasta sincronizada. Conservar as chaves antigas enquanto existirem cópias que dependam delas. Sem a chave correta não há recuperação do conteúdo. O arquivo de ambiente deve ter permissão 600.

Executar a partir do checkout instalado:

```bash
node --env-file=/etc/frequenciapp-backup/backup.env scripts/backup-externo.mjs
```

Sucesso retorna JSON com nome genérico do pacote, data, hash, tamanho e quantidade de arquivos. Não retorna nomes originais nem destinos. Considerar como concluídos somente os pacotes acompanhados de `.confirmado.json` e uma execução com código 0. Um ZIP sem comprovante pode ter sido enviado antes de uma falha; não deve ser tratado como backup confirmado sem conferência.

O comprovante não é criptografado: contém somente nome genérico, data, versão, tamanho, contagem e SHA-256 do ZIP. Não contém nomes de arquivos escolares ou credenciais. A pasta permanece privada.

## Agendamento e retenção

Agendar uma execução diária após o expediente no executor, por cron ou timer do sistema. Usar uma única rotina e uma trava do agendador para impedir sobreposição. Definir explicitamente o fuso do executor; os nomes dos pacotes usam UTC. Encaminhar falhas pelo monitoramento do próprio agendador, sem anexar dados escolares.

Exemplo de crontab para 22h30 no fuso do executor, com checkout em `/opt/frequenciapp`. Ajustar o horário e os caminhos dos executáveis e garantir que a conta da rotina possa ler a configuração privada e criar a trava:

```cron
30 22 * * * /usr/bin/flock -n /etc/frequenciapp-backup/execucao.lock /usr/bin/node --env-file=/etc/frequenciapp-backup/backup.env /opt/frequenciapp/scripts/backup-externo.mjs
```

O programa não cria workflows de envio nem se conecta automaticamente a contas. A configuração real deve ser testada primeiro com arquivos sintéticos, e depois com os arquivos autorizados pela escola.

Não há expurgo automático. A escola define o prazo de guarda e revisa a capacidade do destino. Uma política futura de retenção deve validar os comprovantes e manter cópias recuperáveis antes de remover versões antigas. A verificação por hash é de integridade; a proteção contra exclusão depende também das permissões e recursos do armazenamento. Manter uma cópia adicional separada quando a política da escola exigir.

## Conferir e recuperar

1. Baixar o ZIP e seu comprovante para um dispositivo autorizado. Conferir o SHA-256 do ZIP com o comprovante, por exemplo com `sha256sum`, e identificar a chave correspondente à data da cópia.
2. Validar o pacote sem escrever nos arquivos escolares:

   ```bash
   node --env-file=/etc/frequenciapp-backup/backup.env scripts/backup-externo.mjs --conferir /caminho/backup.zip
   ```

   Essa operação não precisa dos perfis nem de conexão ao armazenamento. Confere senha, autenticação AES, manifesto, quantidade, tamanhos e SHA-256 de cada arquivo e retorna apenas a quantidade validada.

3. Extrair com ferramenta compatível com ZIP AES-256, informando a senha pelo campo protegido da ferramenta. O manifesto associa nomes genéricos do ZIP aos caminhos originais e registra os hashes dos arquivos. Renomear apenas na pasta privada de recuperação, sem restaurar diretamente sobre a origem.
4. Abrir as planilhas recuperadas e conferir fórmulas, abas e datas em ambiente separado. A exportação Excel não preserva todos os recursos do Google Planilhas, identificadores, permissões, histórico de versões, vínculos de Developer Metadata ou projetos Apps Script. Há limites de exportação do próprio provedor; uma recusa deixa a execução sem confirmação.
5. Se a escola decidir usar um arquivo recuperado como nova planilha, selecioná-lo na Gestão, revisar o diagnóstico, o preparo e os vínculos e conferir uma prévia antes de reativar envios. Nunca retomar a sincronização supondo que os identificadores antigos foram mantidos.

As planilhas podem ser exportadas em momentos distintos: a rotina não garante um retrato transacional conjunto com o banco ou entre arquivos editados durante a execução. Programar fora dos horários de lançamento e interromper alterações durante uma recuperação.

O backup de arquivos complementa a cópia JSON da Gestão e o `pg_dump` descrito em [operacao.md](operacao.md#backup). Não exporta automaticamente o banco nem contorna a confirmação de senha da cópia escolar. A JSON da Gestão pode entrar na origem quando preparada pela administração, mas permanece um arquivo separado dentro do pacote.

Testar periodicamente a recuperação em local isolado e conferir a autorização do destino e o prazo de guarda com a escola, conforme [lgpd.md](lgpd.md).
