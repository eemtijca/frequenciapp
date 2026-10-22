# ADR-053: backup externo portátil e transporte agnóstico

## Estado

Implementada para revisão.

## Contexto

A escola solicita backups das planilhas com destino inicial no Dropbox, preservando a possibilidade de trocar de armazenamento sem vincular o aplicativo a SDKs ou bibliotecas do provedor. O backup JSON protege dados da aplicação, mas não substitui a exportação dos arquivos externos. Cópias de abas internas continuam desativadas pela ADR-032.

## Decisão

Disponibilizar uma rotina operacional externa e opcional. O executável rclone acessa perfis de origem e destino mantidos pelo operador. O aplicativo não recebe credenciais adicionais, não amplia o OAuth existente e não executa transferências pelo navegador ou durante requisições da escola.

Um módulo independente produz ZIP AES-256 com manifesto versionado e SHA-256 dos arquivos, reutilizando a biblioteca já usada nos downloads. O manifesto e os nomes escolares ficam criptografados; os nomes externos são genéricos. A chave de recuperação é independente da autenticação do aplicativo e fica fora do destino.

Cada execução produz uma cópia nova, sem exclusão ou substituição de versões. Antes de confirmar, confere o pacote local e depois relê os bytes enviados para comparar tamanho e SHA-256. O comprovante externo não contém identificação escolar. Limitar memória, arquivos, pasta temporária e permissões; falhas não publicam confirmação e não repetem a transferência automaticamente.

## Consequências

Trocar de provedor requer mudar o perfil externo, sem alterar código ou formato. O transporte pode ser substituído sem mudar o pacote, e a recuperação usa ferramentas compatíveis com ZIP AES-256. A aplicação e sua experiência no celular permanecem independentes da rotina.

O operador precisa de executor com Node, dependências instaladas e rclone. Credenciais, agendamento, monitoramento, guarda das chaves e retenção pertencem a essa operação. A rotina vem desativada e não instala workflows de envio. Não há expurgo automático.

O ZIP não torna a exportação do Google um retrato transacional nem preserva todos os metadados, identificadores e permissões. A restauração é conferida em local separado, seguida de revisão dos vínculos da integração. Planilhas, cópia JSON e dump do banco são complementares. Preparação e recuperação em [backup-externo.md](../backup-externo.md).
