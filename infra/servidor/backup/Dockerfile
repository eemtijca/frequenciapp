# Imagem de backup do FrequenciApp: PostgreSQL 17, rclone, GPG e age.
ARG APP_IMAGEM=frequenciapp:local
FROM ${APP_IMAGEM}

USER root

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg \
    rclone \
    age \
  && install -d /usr/share/postgresql-common/pgdg \
  && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
  && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client-17 \
  && rm -rf /var/lib/apt/lists/* \
  && apt-get clean

USER node
# Fora do Compose, a imagem não tem acesso ao serviço db. O modo URL é o padrão.
ENV BACKUP_MODO=url
