# Documentação

Índice da documentação do FrequenciApp. Comece pelo [README](../README.md) para o uso rápido; os documentos abaixo aprofundam cada frente.

| Documento                                            | Conteúdo                                                   |
| ---------------------------------------------------- | ---------------------------------------------------------- |
| [arquitetura.md](arquitetura.md)                     | Camadas, fluxo de requisição e organização do código.      |
| [ambiente.md](ambiente.md)                           | Variáveis de ambiente e execução local.                    |
| [banco.md](banco.md)                                 | Esquema, migrações e rotinas de banco.                     |
| [modelo-de-dados.md](modelo-de-dados.md)             | Entidades, regras de frequência e derivações.              |
| [api.md](api.md)                                     | Contratos das rotas HTTP e Swagger UI em /api/docs.        |
| [llms.txt](../public/llms.txt)                       | Índice da documentação para agentes de IA.                 |
| [interface.md](interface.md)                         | Interface, movimento, PWA e acessibilidade.                |
| [planilha.md](planilha.md)                           | Integração com Planilhas por OAuth e Sheets API.           |
| [testes.md](testes.md)                               | Suítes, convenções e cobertura.                            |
| [deploy.md](deploy.md)                               | Docker Compose, Vercel e outras formas de publicar.        |
| [implantacao-nuvem.md](implantacao-nuvem.md)         | AWS, Azure e GCP com Terraform, modo local e produção.     |
| [seguranca.md](seguranca.md)                         | Autenticação, sessões, papéis, CSRF e cabeçalhos.          |
| [lgpd.md](lgpd.md)                                   | Dados tratados, minimização e direitos do titular.         |
| [beneficios-frequencia.md](beneficios-frequencia.md) | Regras de frequência mínima dos benefícios e alerta.       |
| [operacao.md](operacao.md)                           | Backup, restauração e rotinas do operador.                 |
| [backup-externo.md](backup-externo.md)               | Backup portátil de arquivos com transporte externo.        |
| [Contribuir](../CONTRIBUTING.md)                     | Fluxo de issues, etiquetas, commits e pull requests.       |
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

- [ADR-034](adr/034-chamada-parcial-e-confirmacao-seduc.md): presença parcial independente, confirmação manual da Seduc, terceira planilha Google e cópia JSON compatível.
- [ADR-035](adr/035-seduc-na-chamada-normal.md): confirmação manual da base diária, revisão independente e preservação da cópia JSON; o adendo concentra a conferência na Chamada Parcial.
- [ADR-036](adr/036-implantacao-multinuvem.md): implantação em AWS, Azure e GCP com Terraform, com modo local nos emuladores do Floci.
- [ADR-037](adr/037-frequencia-mensal-no-google.md): preparo de abas por turma e mês, preservação do histórico e confirmação por destino.
- [ADR-038](adr/038-automacao-do-schema-de-preview.md): schema `preview_pr_<n>` por pull request, fallback na `main` e faxina semanal.
- [ADR-049](adr/049-regras-de-frequencia-dos-beneficios.md): regras de frequência de benefícios configuráveis no banco, pela API e pela Gestão.
- [ADR-039](adr/039-fila-fifo-dos-envios-automaticos.md): fila FIFO durável dos envios automáticos às planilhas, com retentativas e agenda.

- [Referência histórica do painel externo](looker-studio.md): fontes agregadas já preparadas no Zoho Analytics ou Looker Studio. A análise atual fica no FrequenciBI.
- [ADR-040: indicadores para Looker Studio](adr/040-indicadores-looker-studio.md): minimização e substituição atômica.
- [ADR-041: sincronização de feriados](adr/041-sincronizacao-de-feriados.md): base externa opcional, gravação única e senha para repetir.

- [ADR-042: FrequenciBI interno](adr/042-frequencibi.md).
- [FrequenciBI](frequencibi.md): análise curada, explorador, painéis locais e uso offline.

A organização do histórico mensal e a retirada conferida de abas antigas estão no [ADR-045](adr/045-acesso-aos-meses-da-planilha.md).

- [ADR-046](adr/046-justificativas-antecipadas.md): justificativas por período na Chamada Parcial, propostas para a Chamada e preservação das revisões.
- [ADR-047](adr/047-regras-do-react-compiler.md): regras do React Compiler no lint, correções reais e exceções pontuais justificadas.
- [ADR-048](adr/048-abas-de-saidas-por-turma.md): consultas automáticas de saídas por turma, com preservação da origem.
- [ADR-050](adr/050-limite-de-leitura-da-planilha.md): cota de leitura do Google no envio da frequência e confirmação do que já estava na planilha.
- [ADR-051](adr/051-ordem-do-almoco.md): ordem das turmas no almoço por dia, com horário opcional e mesclagem na cópia JSON.
- [ADR-052](adr/052-envio-automatico-com-simulacao-unica.md): envio automático com uma simulação sob a trava, token de acesso guardado e releitura da estrutura numa ação.
