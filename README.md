# OpenTalentPool 1.0.0

Plataforma pública e gratuita de descoberta de talentos em tecnologia.

Para prompts, contexto de produto e convenções de engenharia do workspace, use [AGENTS.md](AGENTS.md) como referência principal.

## O que o 1.0 entrega

- Perfis profissionais reais com publicação manual
- Busca pública conectada ao PostgreSQL
- Filtros por palavra-chave, senioridade, estado, modelo de trabalho e disponibilidade
- Página pública de perfil em `/profissionais/:slug`
- Favoritos e buscas salvas para recrutadores autenticados
- Alertas por e-mail com frequência configurável para novas correspondências de buscas salvas
- Autenticação por código enviado por e-mail com `challengeId`, Turnstile e sessão em cookie `HttpOnly`

Contato privado continua protegido: o `email` da conta não aparece na busca pública nem na página pública do perfil.

## Stack

- Frontend: `React`, `Vite`, `TypeScript`, `Tailwind CSS`, `shadcn/ui`
- Backend: `Express`
- Banco: `PostgreSQL`
- Testes: `Vitest`, `React Testing Library`, `Supertest`, `Playwright`
- Workspace: `pnpm`

## Rodando localmente

1. Instale as dependências:

```sh
pnpm install
```

2. Crie o arquivo de ambiente:

```sh
cp .env.example .env
```

3. Ajuste as variáveis necessárias no `.env`.

Opcionalmente, crie um `.env.local` para sobrescrever valores apenas no desenvolvimento local. O backend agora lê `.env.local` antes do `.env`, alinhando o comportamento com o Vite no frontend.

4. Suba a aplicação:

```sh
pnpm run dev
```

Se `POSTGRES_HOST=localhost` e o banco ainda não estiver disponível, o projeto tentará subir o serviço `db` do `docker compose` antes de iniciar a API.
Se a porta configurada em `PORT` já estiver ocupada, o comando falha antes de abrir o frontend para evitar uma sessão parcialmente quebrada; nesse caso, encerre a sessão anterior do backend ou ajuste `PORT` no `.env.local`.

- Frontend: `http://localhost:8080`
- API: `http://localhost:4000`

## Variáveis de ambiente

Use `.env.example` como referência de chaves e formatos aceitos. O arquivo contém apenas placeholders; substitua os valores sensíveis no `.env` local e nunca versione credenciais reais.

`APP_BASE_URL` é usado nos links públicos e nos alertas de buscas salvas.

`TRUSTED_ORIGINS` controla CORS e a validação de `Origin` nas rotas que alteram estado.

`TRUST_PROXY` só deve ser ativado quando existir um proxy reverso confiável na frente da aplicação, para que `req.ip` e os rate limits usem o IP real sem aceitar spoofing direto de cabeçalho.

`AUTH_CODE_PEPPER`, `TURNSTILE_SECRET_KEY` e a política de cookie são obrigatórios para produção segura.

`REDIS_USERNAME`, `REDIS_PASSWORD` e `MAIL_QUEUE_PREFIX` são obrigatórios em produção. O runtime rejeita o boot com usuário `default`, senha placeholder ou prefixo vazio.

Em `localhost` e `127.0.0.1`, o fluxo local aceita o token dummy oficial do Turnstile apenas fora de produção para não travar autenticação durante desenvolvimento e testes. Em produção, a validação continua fail-closed com verificação real no Cloudflare.

## Fila global de e-mails

Todos os e-mails do sistema agora passam por uma fila única com:

- `Postgres` como fonte de verdade (`email_outbox`)
- `Redis + BullMQ` como mecanismo de distribuição
- `mail-worker` dedicado para retry e entrega SMTP

Os fluxos críticos continuam bloqueantes para o endpoint, mas usam o mesmo `email_outbox` com drenagem inline antes do `COMMIT`:

- OTP de autenticação
- autorização de `profile_contact_email`
- recibo de denúncia
- decisão punitiva de moderação

Prioridades atuais da fila:

- `1000`: autenticação (`signup`, `login`, `profile_contact_email`)
- `500`: recibo e decisão de moderação
- `100`: expiração de perfil
- `50`: alertas de busca salva
- `30`: recência de perfil

## Alertas de buscas salvas

O producer de alertas roda como job externo:

```sh
pnpm run alerts:dispatch
```

Ele processa buscas salvas com alertas ativos, cria lotes deduplicados no Postgres e grava jobs concretos no `email_outbox`.

Para consumir a fila localmente:

```sh
pnpm run mail:worker
```

O worker lê os registros pendentes, publica no Redis com `jobId = email_outbox.id`, envia via SMTP e só então marca o outbox como entregue. Para auth e moderação, o mesmo pipeline é reaproveitado inline dentro da transação da request, mantendo a semântica bloqueante sem abrir um segundo mecanismo de envio.

## Dados ficticios locais

Para popular o ambiente local com dados realistas de navegacao e busca:

```sh
./fill.sh
```

Isso cria:

- `50` profissionais verificados com perfil completo e publicado
- `10` recrutadores verificados
- favoritos e buscas salvas coerentes para os recrutadores fixture

Para limpar tudo depois:

```sh
./unfill.sh
```

Os fixtures usam e-mails reservados em `local.opentalentpool.test` por padrao. Se voce quiser testar o fluxo real de login por codigo em uma inbox controlada por voce, rode o seed com:

```sh
LOCAL_FIXTURE_MAILBOX=seuemail@provedor ./fill.sh
```

Nesse modo, cada conta fixture vira um alias com `plus addressing`, por exemplo `seuemail+otp-profissional-001@provedor`. Isso preserva o fluxo normal de autenticacao por e-mail sem criar bypass local.

## Testes

```sh
pnpm test
pnpm run test:frontend
pnpm run test:server
pnpm run test:e2e
```

Instalação inicial do navegador do Playwright:

```sh
pnpm run test:e2e:install
```

Os testes E2E sobem:

- frontend em `http://127.0.0.1:8080`
- backend com banco em memória e rotas de teste habilitadas em `http://127.0.0.1:4000`

Durante os testes, o login por e-mail continua usando `challengeId` e cookie de sessão. As rotas de teste apenas expõem o último código capturado em memória para o ambiente `NODE_ENV=test`.

## Docker

O stack de rollout da VPS usa um único `docker-compose.yml` na raiz com:

- `db` para PostgreSQL
- `redis` interno, sem porta pública, dedicado à fila de e-mails
- `server` para a API Express
- `alerts` para o producer contínuo de alertas por e-mail
- `mail-worker` para consumir o `email_outbox`, publicar no Redis e entregar os e-mails assíncronos
- `web` para o frontend servido via `nginx`, proxyando `/api` para `server`

O compose usa o `.env` da raiz como fonte de verdade operacional. Para subir o stack:

```sh
docker compose up -d --build
```

O serviço `web` fica publicado apenas em `127.0.0.1:8080`, esperando um proxy HTTPS externo na VPS encaminhando para esse endereço.

Se precisar rodar mais de uma stack na mesma máquina, você pode sobrescrever as portas publicadas com `WEB_PUBLISHED_PORT` e `POSTGRES_PUBLISHED_PORT`.

Para o frontend no Compose, `VITE_API_URL` deve permanecer vazio para usar `/api` no mesmo host.

O Redis do Compose:

- não publica `ports`
- fica isolado em uma rede Docker interna dedicada para `server`, `alerts` e `mail-worker`
- exige ACL com usuário dedicado
- sobe com `protected-mode yes`, `appendonly yes` e `maxmemory-policy noeviction`

## Banco

O schema idempotente fica em [server/db/schema.sql](server/db/schema.sql) e é aplicado automaticamente na inicialização da API.

Tabelas principais:

- `users`
- `verification_codes`
- `auth_code_challenges`
- `auth_sessions`
- `auth_rate_limits`
- `user_profiles`
- `recruiter_favorites`
- `saved_searches`
- `saved_search_notified_profiles`
- `email_outbox`
- `saved_search_alert_batches`
- `saved_search_alert_batch_items`
- `user_profile_freshness_notifications`

## Observações

- Segredos não devem ser versionados.
- A publicação do perfil é manual e depende de checklist mínimo de completude.
- `deploy.sh` continua voltado ao ambiente local de desenvolvimento.
