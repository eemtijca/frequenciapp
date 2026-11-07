# Imagem do Nginx do FrequenciApp, com escolha entre HTTP inicial e HTTPS.
FROM nginx:1.30-alpine

COPY docker-entrypoint.d/50-frequenciapp.sh /docker-entrypoint.d/50-frequenciapp.sh
COPY frequenciapp-http.conf /etc/nginx/modelos/http.conf
COPY frequenciapp-https.conf /etc/nginx/modelos/https.conf

RUN chmod +x /docker-entrypoint.d/50-frequenciapp.sh
