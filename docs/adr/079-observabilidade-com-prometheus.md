# ADR-079: observabilidade com Prometheus na auto-hospedagem

## Estado

Aceita.

## Contexto

A operação do FrequenciApp dependia de `/api/saude`, dos logs do Docker, do cron e de verificações manuais. A rota de saúde responde de forma binária e não mostra latência, taxa de erro, saturação do pool nem profundidade da fila de planilhas. Uma falha lenta podia chegar ao usuário antes de aparecer no log.

A aplicação é um único processo Next.js 16. A auto-hospedagem já usa uma rede `interna` sem saída, um proxy Caddy ou Nginx com TLS e um contrato de ambiente validado na partida. Qualquer coleta nova precisa caber nesse contrato, sem SaaS, sem telemetria de terceiros e sem dados de alunos.

## Decisão

- A aplicação expõe `GET /api/metricas` no runtime Node.js, fora do OpenAPI público e fora de `executarRota` para não se autoinstrumentar.
- A coleta usa `Authorization: Bearer ${METRICAS_TOKEN}`. Sem o token configurado, a rota responde 404; com token errado, 401; com token válido, 200. A comparação usa `timingSafeEqual`.
- O cliente é `@prometheus-io/client`. As métricas próprias usam o prefixo `frequenciapp_`, e as métricas padrão do Node mantêm os nomes originais.
- As métricas cobrem requisições HTTP, duração, requisições em andamento, pool, latência de consultas, fila de planilhas e falhas de coleta.
- O label de rota é um padrão de baixa cardinalidade. UUID vira `:id`, data vira `:dia`, número vira `:numero` e caminho longo vira `/api/:rota-longa`. Nenhum label recebe nome, matrícula, e-mail, identificador de aluno, turma, escola, SQL ou conteúdo de requisição.
- O Prometheus fica somente na rede `interna`, sem portas publicadas e sem saída para a internet. A retenção é de 15 dias e 1 GB no volume `prometheus_data`.
- O Docker não publica portas de um contêiner ligado apenas a uma rede `internal`. Uma ponte `socat` separada publica o painel em `127.0.0.1:${PROMETHEUS_PORTA:-9090}` e encaminha apenas para `prometheus:9090`.
- O Caddy e o Nginx respondem 404 para `/api/metricas` antes do proxy.
- O Prometheus inicia sem lifecycle e sem admin API.
- A ativação é opt-in por `OBSERVABILIDADE_HABILITADA`. Instalações novas nascem com `true`; instalações existentes preservam o valor, inclusive `false`.
- A fase 1 inclui cinco regras de alerta, visíveis no painel, sem Alertmanager.
- O volume de métricas não entra no backup. A cópia JSON e o dump do banco continuam sendo a fonte de recuperação dos dados escolares.

## Alternativas

- Publicar `/api/metricas` sem autenticação: exporia o mapa de rotas e a operação interna a qualquer cliente da internet.
- Publicar a porta do Prometheus em todas as interfaces: o painel não tem autenticação própria e ficaria aberto na rede.
- Ligar o Prometheus também à rede `publica` para usar `ports`: amplia a superfície sem necessidade. A ponte `socat` limita o encaminhamento a um único destino.
- Usar um serviço de métricas externo: contraria a operação local, cria dependência de terceiros e exige avaliar transferência de dados.
- Adotar Grafana na fase 1: adiciona um serviço e um painel sem resolver a lacuna de coleta.
- Adotar Alertmanager na fase 1: exige receptor, segredo e decisão sobre o canal de notificação. As regras já ficam prontas para a fase seguinte.
- Manter apenas logs e `/api/saude`: não mede latência, erros por rota, pool nem fila.

## Consequências

- A escola passa a diagnosticar indisponibilidade, erros 5xx, latência, pool e fila sem serviço externo.
- A coleta é local, agregada e sem dados de alunos.
- O consumo de disco é limitado pela retenção de 15 dias e 1 GB.
- O painel exige túnel SSH e não notifica ninguém sozinho. Sem Alertmanager, um alerta só é visto quando o operador abre `/alerts`.
- O histórico é descartável. Recriar o volume apaga as métricas, sem perda de dados escolares.
- O p95 é aproximado pelos buckets fixos dos histogramas clássicos.
- A aplicação continua em processo único. Métricas de múltiplas réplicas exigem alvos adicionais, fora da fase 1.
- A troca de token exige recriar a aplicação e o Prometheus.
- Em perfil com controlador adotado, ligar a observabilidade altera a topologia e exige readoção revisada.
- Configuração e regras novas exigem reiniciar o Prometheus, porque lifecycle e admin API ficam desligados.
- A fase 1 não cobre host, disco, TLS, certificado, idade do backup nem ServiceMonitor.

## Referências

- [Observabilidade](../observabilidade.md)
- [Auto-hospedagem](../auto-hospedagem.md)
- [Segurança](../seguranca.md)
- [LGPD](../lgpd.md)
- [ADR-064: auto-hospedagem com contrato portátil, proxy, backup e atualização](064-auto-hospedagem-servidor.md)
- [Prometheus: configuração](https://prometheus.io/docs/prometheus/latest/configuration/configuration/)
- [Prometheus: storage](https://prometheus.io/docs/prometheus/latest/storage/)
- [Prometheus: alerting](https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/)
