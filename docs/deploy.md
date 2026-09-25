# Deploy

Formas de publicar o Chamada. Todas partem do mesmo build de produção (`npm run build`) e da connection string do PostgreSQL em `DATABASE_URL`.

## Docker Compose (recomendado)

```bash
cp .env.example .env
# Cole um AUTH_SECRET aleatório (openssl rand -base64 32)
docker compose up --build
```

O `compose.yml` sobe:

- `db`: PostgreSQL 17 com volume `pgdata` e healthcheck.
- `app`: build do `Dockerfile`, aplica as migrações na partida e serve na porta 3000.

Criação do administrador inicial e da semente dentro do contêiner:

```bash
ADMIN_EMAIL=direcao@escola.br ADMIN_SENHA='senha forte' ADMIN_NOME='Direção' \
  docker compose exec app npm run criar-admin
SEED_ALUNOS=12 docker compose exec app npm run seed
```

O restante (professores, séries, turmas e alunos) é configurado pela área de Gestão do próprio aplicativo, sem comandos.

Banco externo: comente o serviço `db`, aponte `DATABASE_URL` para o provedor e remova a dependência de saúde. TLS é herança da string de conexão (`?sslmode=require` quando aplicável).

## Imagem avulsa

```bash
docker build -t chamada .
docker run -p 3000:3000 \
  -e DATABASE_URL='postgresql://usuario:senha@host:5432/banco' \
  -e AUTH_SECRET='segredo de 32 bytes' \
  chamada
```

O contêiner espera o banco, aplica as migrações e inicia o servidor standalone. O migrador tolera indisponibilidade inicial do banco por até 2 minutos.

## Vercel

1. Importe o repositório; o build padrão (`npm run build`) já serve, com o `postinstall` gerando o cliente Prisma.
2. Defina `DATABASE_URL` e `AUTH_SECRET` nas variáveis de ambiente.
3. Aplique as migrações apontando a CLI para a conexão direta:
   ```bash
   DATABASE_URL='postgresql://...:5432/postgres' npx prisma migrate deploy
   ```
4. Crie a conta com `npm run criar-conta` a partir de um ambiente com acesso ao banco.

Supabase e serviços equivalentes funcionam pela connection string; prefira a conexão direta `:5432` ou o pooler de sessão para o runtime e exporte `DIRECT_URL` para a CLI quando o pooler de transação for a única opção do runtime.

## Máquina própria com systemd

Build e execução diretos:

```bash
npm ci
npm run build
DATABASE_URL=... AUTH_SECRET=... npm start
```

Exemplo de unidade mínima:

```ini
[Unit]
Description=Chamada
After=network-online.target postgresql.service

[Service]
WorkingDirectory=/opt/chamada
Environment=DATABASE_URL=postgresql://chamada:senha@localhost:5432/chamada
EnvironmentFile=/opt/chamada/.env
ExecStart=/usr/bin/npm start
Restart=on-failure
User=chamada

[Install]
WantedBy=multi-user.target
```

## Verificações após publicar

```bash
curl -s https://seu-dominio/api/saude
```

Confira também:

- login com a conta criada e salvamento de uma chamada;
- o cookie de sessão marcado Secure no tráfego HTTPS;
- a origem pública (`APP_URL` quando o proxy exigir, e HTTPS à frente do processo).
