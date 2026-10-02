# Documentação

Índice da documentação do FrequenciApp. Comece pelo [README](../README.md) para o uso rápido; os documentos abaixo aprofundam cada frente.

| Documento                                            | Conteúdo                                                   |
| ---------------------------------------------------- | ---------------------------------------------------------- |
| [arquitetura.md](arquitetura.md)                     | Camadas, fluxo de requisição e organização do código.      |
| [ambiente.md](ambiente.md)                           | Variáveis de ambiente e execução local.                    |
| [banco.md](banco.md)                                 | Esquema, migrações e rotinas de banco.                     |
| [modelo-de-dados.md](modelo-de-dados.md)             | Entidades, regras de frequência e derivações.              |
| [api.md](api.md)                                     | Contratos das rotas HTTP.                                  |
| [interface.md](interface.md)                         | Interface, movimento, PWA e acessibilidade.                |
| [planilha.md](planilha.md)                           | Integração com Planilhas por OAuth e Sheets API.           |
| [testes.md](testes.md)                               | Suítes, convenções e cobertura.                            |
| [deploy.md](deploy.md)                               | Docker Compose, Vercel e outras formas de publicar.        |
| [seguranca.md](seguranca.md)                         | Autenticação, sessões, papéis, CSRF e cabeçalhos.          |
| [lgpd.md](lgpd.md)                                   | Dados tratados, minimização e direitos do titular.         |
| [operacao.md](operacao.md)                           | Backup, restauração e rotinas do operador.                 |
| [adr/](adr/)                                         | Decisões de arquitetura registradas.                       |
| [ADR-026](adr/026-origem-configuravel-na-chamada.md) | Exibição de origem configurável por escola, série e turma. |

- [ADR-027](adr/027-entradas-atrasadas.md): entradas independentes da chamada e envio conservador em aba própria.
- [Notificações push](notificacoes.md): adesão por dispositivo, chaves VAPID, agenda e compatibilidade.
- [ADR-028](adr/028-notificacoes-web-push.md): avisos voluntários aos diretores, sem dados individuais no payload.
- [ADR-029](adr/029-configuracao-automatica-push.md): configuração automática de VAPID com identidade estável por instalação.
- [ADR-030](adr/030-preferencias-agenda-notificacoes.md): tipos de aviso, pendências da coordenação e agenda compatível com Vercel Hobby.
- [Downloads protegidos](downloads.md): ZIP com senha, confirmação da cópia completa e auditoria mínima de exportações.
- [ADR-031](adr/031-downloads-protegidos.md): proteção AES-256 no navegador, nomes genéricos e formatos originais por escolha explícita.
- [ADR-032](adr/032-planilhas-sem-backups-internos.md): fim das cópias automáticas dentro da planilha e limpeza administrativa das cópias antigas.

A integração exclusiva com OAuth e Sheets API está registrada na [ADR-033](adr/033-integracao-exclusiva-com-google-planilhas.md).
