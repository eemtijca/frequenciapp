# Imagem do Nginx do FrequenciApp, com escolha entre HTTP inicial e HTTPS.
FROM nginx:1.30.6-alpine@sha256:583b7f2fce1cdb8da5ad5c39ebd3c33b98b87d493190e548bdee1fa8c619c311

COPY docker-entrypoint.d/50-frequenciapp.sh /docker-entrypoint.d/50-frequenciapp.sh
COPY frequenciapp-http.conf /etc/nginx/modelos/http.conf
COPY frequenciapp-https.conf /etc/nginx/modelos/https.conf

RUN chmod +x /docker-entrypoint.d/50-frequenciapp.sh
