# Imagem do Nginx do FrequenciApp, com escolha entre HTTP inicial e HTTPS.
FROM nginx:1.31-alpine@sha256:713fc2ebfd92e8217db451477182ee91944b123d2b1ee9fd5a8c6e91ca6c3a11

COPY docker-entrypoint.d/50-frequenciapp.sh /docker-entrypoint.d/50-frequenciapp.sh
COPY frequenciapp-http.conf /etc/nginx/modelos/http.conf
COPY frequenciapp-https.conf /etc/nginx/modelos/https.conf

RUN chmod +x /docker-entrypoint.d/50-frequenciapp.sh
