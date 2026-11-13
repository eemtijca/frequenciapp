# ADR-078: reconfiguração restrita das rotinas adotadas

## Estado

Aceita.

## Contexto

A aplicação do instalador substituía seletores desligados e habilitava o backup de planilhas ao configurar o destino do banco. Um controlador adotado fixa hashes dos ambientes e mantém um cron próprio; reescrever o ambiente antes da validação invalida o perfil. Mover o prefixo para readotá-lo também move o arquivo da trava e pode separar a exclusão mútua entre processos.

## Decisão

O instalador mantém controles explícitos para agenda geral, notificações, planilhas, indicadores e backup de planilhas. Sem escolha nova, um valor desligado em qualquer ambiente prevalece. O backup de planilhas fica desligado por padrão e não depende do destino do banco.

Para controlador adotado, o instalador usa uma operação administrativa restrita antes do pipeline. A operação conserva caminhos e inode da trava, confere perfil, identidade efetiva, snapshot, journal e pins antes e depois de adquirir a exclusão e altera somente os cinco seletores, o cron e os metadados associados. As escolhas ficam persistidas no JSON da instalação; os demais campos são preservados.

Cron e logrotate são vinculados a um recibo protegido. O legado sem recibo exige revisão e adoção explícita do hash exato do cron e reconhecimento do logrotate. Um recibo divergente nunca é substituído pela autorização de legado.

Uma intenção durável versão 1 guarda os estados anterior e desejado antes das publicações ativas. Cada arquivo é publicado atomicamente e sincronizado. A retomada admite apenas os bytes comprovados e as mesmas escolhas. A intenção permanece privada porque contém ambientes sensíveis. O conjunto não promete atomicidade de múltiplos arquivos nem resistência a um administrador malicioso.

A transição cria uma geração física e perfil versão 2, preservando o prefixo, os snapshots anteriores e os dados. Uma chamada carregada da geração anterior revalida sua autorização depois da trava e é recusada. A versão 1 continua aceita como origem de migração. A readoção ampla que move o prefixo deixa de ser automática e exige revisão administrativa separada.

## Alternativas

- Reescrever somente o ambiente: invalida os hashes, não reconcilia o cron e não revoga processos antigos.
- Arquivar o prefixo e reinstalar: pode dividir a trava física e ocultar estado operacional pendente.
- Recusar toda reconfiguração: preserva a segurança, mas não atende à alteração autorizada das rotinas.

## Consequências

A reconfiguração das rotinas não reinstala pacotes, recria o aplicativo, migra banco nem executa backup. Alterações de outros parâmetros exigem procedimento separado. Interrupções bloqueiam operações normais até uma retomada comprovada ou revisão administrativa; não há rollback nem limpeza automática. Testes sintéticos com falhas injetadas verificam o protocolo, sem substituir ensaio de produção, entrega externa ou teste de perda real de energia.

## Referências

- [Controlador de manutenção](../controlador-manutencao.md)
- [Instalador](../instalador.md)
- [ADR-067: identidade operacional e travas](067-identidade-operacional-e-travas.md)
