# Deploy na Vercel

Um único projeto Vercel, criado a partir da raiz do repositório, serve o app e a API na mesma origem:

| Parte                 | Onde roda                                                          | Configurado em                               |
| --------------------- | ------------------------------------------------------------------ | -------------------------------------------- |
| PWA (`apps/web/dist`) | CDN da Vercel, arquivos estáticos                                  | `vercel.json` (`outputDirectory`, `headers`) |
| API (`/api/*`)        | Uma Vercel Function (`api/index.mjs` → `apps/api/dist/vercel.mjs`) | `vercel.json` (`rewrites`, `functions`)      |
| Banco de dados        | [Neon](https://neon.com) (PostgreSQL), via Drizzle ORM             | `DATABASE_URL`, `DATABASE_URL_UNPOOLED`      |
| Comprovantes          | Vercel Blob **privado**                                            | store conectado ao projeto                   |
| Limite de requisições | Memória de cada instância, ou Upstash Redis (opcional)             | `UPSTASH_REDIS_REST_*`                       |

Por que Neon e Blob: o disco de uma Vercel Function é temporário e separado por instância. Um banco embutido ou uma pasta de uploads ali perderia dados. Por isso, na Vercel, a API se recusa a iniciar sem um `DATABASE_URL` `postgres://` e sem um Blob store.

Fora da Vercel: `docker compose up` sobe Postgres e o app; `bun run dev` usa PGlite (Postgres embutido, sem servidor). Veja [RELIABILITY.md](RELIABILITY.md#deploy).

## O que você precisa

- Conta na Vercel com acesso ao repositório `oiagorodrigues/em-dia` no GitHub.
- Conta no Neon, ou nenhuma: a integração da Vercel pode criar a conta e o banco por você.
- Opcional: conta no Upstash (limite de requisições compartilhado) e um provedor SMTP (convites e redefinição de senha por e-mail).

## 1. Banco no Neon

Há duas integrações oficiais, e as duas criam as variáveis no projeto da Vercel:

- **Vercel-Managed** (Vercel Marketplace → Native Integrations → **Neon Postgres**): o Neon é cobrado pela Vercel. Boa escolha para quem ainda não tem conta no Neon.
- **Neon-Managed** (Vercel Marketplace → Connectable Accounts → **Neon**): para quem já tem conta no Neon e quer a cobrança lá.

Faça isso depois de criar o projeto (passo 2), na aba **Storage** ou no Marketplace, e conecte o banco ao projeto. A integração define:

| Variável                | O que é                                                                       |
| ----------------------- | ----------------------------------------------------------------------------- |
| `DATABASE_URL`          | conexão **pooled** (PgBouncer, host com `-pooler`). A API usa esta em runtime |
| `DATABASE_URL_UNPOOLED` | conexão **direta**. `db:migrate` usa esta no build                            |
| `PG*`, `POSTGRES_*`     | partes da URL e nomes legados; a API não usa                                  |

**Branches para previews.** Ative o preview branching na integração. A cada deploy de preview o Neon cria a branch `preview/<branch-do-git>` (uma cópia do banco de produção) e a Vercel injeta as URLs dela só naquele deploy. O build roda as migrações nessa branch, então uma migração nova nunca toca a produção antes do merge. As branches são apagadas quando os deploys correspondentes saem do ar.

Sem integração (outro Postgres, ou CI próprio): defina `DATABASE_URL` com a URL pooled e `DATABASE_URL_UNPOOLED` com a direta. Se só houver a pooled, `db:migrate` remove o sufixo `-pooler` do host, a convenção documentada do Neon.

## 2. Criar o projeto na Vercel

1. Em [vercel.com/new](https://vercel.com/new), importe o repositório do GitHub.
2. **Root Directory**: a raiz do repositório.
3. **Framework Preset**: Other. O `vercel.json` já define instalação (`bun install --frozen-lockfile --ignore-scripts`), build (`bun run build:vercel`) e saída (`apps/web/dist`).
4. **Node.js**: 24.x. O `engines.node` do `package.json` já pede `24.x`.
5. Ainda não faça o deploy: sem o banco (passo 1) e as variáveis do passo 4, a função não sobe.

## 3. Criar o Blob store privado

No projeto: **Storage** → **Create Storage** → **Blob** → **Continue**, escolha acesso **Private** e conecte o store ao projeto em todos os ambientes.

Conectar o store adiciona `BLOB_STORE_ID` ao projeto, e o SDK autentica por OIDC. Se você também tiver `BLOB_READ_WRITE_TOKEN` (é o caso de quem roda o seed ou scripts fora da Vercel), a API usa o token.

Os comprovantes ficam em `receipts/<128 bits aleatórios>.<ext>`. O navegador nunca recebe a URL do Blob: a API confere a sessão e as permissões e devolve o arquivo em streaming.

## 4. Variáveis de ambiente

Em **Settings** → **Environment Variables**. Marque também **Enable access to System Environment Variables** (a API usa `VERCEL` e `VERCEL_PROJECT_PRODUCTION_URL`).

| Variável                   | Obrigatória | Valor                                                                                                 |
| -------------------------- | ----------- | ----------------------------------------------------------------------------------------------------- |
| `JWT_SECRET`               | sim         | 32+ caracteres. `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"` |
| `DATABASE_URL`             | automática  | pooled, criada pela integração do Neon (passo 1)                                                      |
| `DATABASE_URL_UNPOOLED`    | automática  | direta, criada pela integração do Neon; usada só pelas migrações                                      |
| `BLOB_STORE_ID`            | automática  | criada ao conectar o Blob store                                                                       |
| `NODEJS_HELPERS`           | recomendada | `0`. Desliga os helpers de request da Vercel; o Express faz o próprio parsing                         |
| `WEB_ORIGIN`               | não         | URL pública. Sem ela: `https://` + `VERCEL_PROJECT_PRODUCTION_URL`. Vale para links de e-mail e CORS  |
| `SMTP_URL`                 | não         | `smtps://usuario:senha@host:465`. Sem ela, nenhum e-mail sai e os convites voltam `emailSent: false`  |
| `MAIL_FROM`                | não         | ex.: `em dia <nao-responda@seudominio.com.br>`                                                        |
| `UPSTASH_REDIS_REST_URL`   | não         | URL REST do Upstash (passo 5)                                                                         |
| `UPSTASH_REDIS_REST_TOKEN` | não         | token REST do Upstash                                                                                 |
| `RATE_LIMIT_GLOBAL`        | não         | padrão 300 requisições por IP em 15 min                                                               |
| `RATE_LIMIT_AUTH`          | não         | padrão 10 (login, cadastro, esqueci a senha) por IP em 15 min                                         |
| `LOG_LEVEL`                | não         | `info` (padrão), `warn`, `error`                                                                      |

O que a API ajusta sozinha quando `VERCEL=1`: modo produção em todo deploy, previews incluídas (cookies `Secure`, sem a caixa de e-mails de desenvolvimento, `JWT_SECRET` obrigatório), `TRUST_PROXY=1` (o IP real vem do `X-Forwarded-For` da Vercel), limite de comprovante de 4 MB e a origem padrão descrita acima.

## 5. Upstash Redis (opcional, recomendado)

Sem Upstash, cada instância da função conta os limites de requisição por conta própria. Com várias instâncias, o limite efetivo fica maior que o configurado, e o log de boot avisa isso.

Crie um banco Redis no [console do Upstash](https://console.upstash.com) e copie a **REST URL** e o **REST token** para `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`. A API fala com o Upstash por HTTP (`fetch`), sem conexão TCP aberta. Se o Upstash cair, as requisições passam sem limite em vez de falhar.

## 6. E-mail

Qualquer provedor SMTP serve. Configure `SMTP_URL` e `MAIL_FROM`. Sobre portas e conexões SMTP a partir de funções, veja o guia da Vercel [Can I use SMTP with Vercel?](https://vercel.com/kb/guide/serverless-functions-and-smtp).

## 7. Primeiro deploy

Clique em **Deploy**. No log do build, confira:

1. `bun install` com o `bun.lock`;
2. `bun run build:vercel`: `vp pack` da API, build do PWA e `db:migrate --if-configured`;
3. a linha `"msg":"migrations applied"` com as migrações aplicadas. Em deploys seguintes aparece `database already up to date`.

Depois abra `https://<seu-projeto>.vercel.app/api/health`. A resposta esperada é `{"status":"ok","db":"ok",...}`. Então crie a primeira conta pelo app.

Quer dados de demonstração num banco de preview? Rode o seed da sua máquina apontando para ele (nunca para produção):

```bash
DATABASE_URL='postgresql://...-pooler...neon.tech/neondb?sslmode=require' BLOB_READ_WRITE_TOKEN=... bun run seed -- --reset
```

## 8. Domínio próprio

**Settings** → **Domains** → adicione o domínio e siga as instruções de DNS. `VERCEL_PROJECT_PRODUCTION_URL` passa a apontar para o domínio próprio mais curto. Se você definiu `WEB_ORIGIN`, atualize o valor e faça um novo deploy. Os cookies de sessão funcionam porque app e API estão na mesma origem.

## Como as migrações rodam

- O schema vive em `apps/api/src/db/schema.ts` (Drizzle). `bun run db:generate` gera o SQL em `apps/api/drizzle/`, que vai para o git. Um teste (`apps/api/tests/migrations-sync.test.ts`) falha se o schema mudou sem migração gerada.
- O build roda `bun run --cwd apps/api db:migrate --if-configured` com a URL direta. Sem URL, o passo é pulado.
- O migrador do Drizzle roda dentro de um advisory lock do Postgres (por sessão, por isso a conexão direta: o pooler do Neon trabalha em modo transação). Dois builds ao mesmo tempo aplicam cada migração uma vez só; o segundo espera e registra `database already up to date`.
- A função nunca migra. Ao iniciar, compara o journal das migrações (embutido no bundle) com `drizzle.__drizzle_migrations` e, se faltar alguma, registra o erro `database schema is behind` com a lista.
- Para migrar à mão: `DATABASE_URL_UNPOOLED=... bun run db:migrate`.
- Uma migração nova chega à produção no build de produção, antes de o novo código receber tráfego. As migrações precisam ser compatíveis com a versão anterior do código, que segue no ar até o fim do deploy (por exemplo, adicionar colunas antes de remover).

## Backups

**Neon.** O Neon guarda o histórico do banco e restaura para qualquer instante dentro da janela do plano (padrão: 6 horas no Free, 1 dia no Launch e no Scale; máximo de 7 dias no Launch e 30 no Scale). No console: **Restore from history**; na CLI: `neon branches restore <branch> <origem>@<timestamp>`. O Neon guarda o estado anterior numa branch de backup, então a restauração pode ser desfeita.

Guarde também uma cópia sua, por exemplo diária, pela conexão direta (o Neon recomenda a direta para `pg_dump`):

```bash
pg_dump "$DATABASE_URL_UNPOOLED" --format=custom --file=emdia-$(date +%F).dump
```

**Blob.** O Vercel Blob não tem snapshot. Copie a pasta `receipts/` com a CLI da Vercel, num diretório com o projeto vinculado (`vercel link`) ou passando `--rw-token`:

```bash
vercel blob list --prefix receipts/ --limit 1000
vercel blob get receipts/<arquivo> --access private --output ./backup/<arquivo>
```

Restaure o banco antes dos comprovantes. Um comprovante que falta aparece como "Comprovante indisponível" (404), sem quebrar a tela.

## Como funciona (para quem mantém)

- **Rewrites.** `/api/:emdiaPath*` vai para a função `/api`. A Vercel repassa o caminho na query (`/api?emdiaPath=v1/...`; o `vercel build` gera a rota `"dest": "/api?emdiaPath=$1"`). `apps/api/src/lib/vercel-url.ts` reconstrói a URL original antes do Express. A segunda regra é o fallback do SPA, que exclui `api/` e `assets/`. Arquivos estáticos têm prioridade sobre rewrites.
- **Função.** Uma instância monta o runtime (banco, serviços, app) na primeira requisição e o reutiliza nas seguintes. A entrada remove os helpers `body`, `query` e `cookies` da Vercel quando possível. `NODEJS_HELPERS=0` evita que eles sejam criados.
- **Conexão com o Neon.** A API usa `node-postgres` (TCP) com um `Pool` por instância, registrado com `attachDatabasePool` do `@vercel/functions`: no Fluid compute, conexões ociosas são liberadas antes de a instância ser suspensa. É a recomendação do Neon para Vercel Functions no runtime Node.js. O driver `@neondatabase/serverless` (HTTP/WebSocket) é para runtimes de edge e não é usado. Transações interativas (`repos.tx`) funcionam pela conexão pooled, já que o PgBouncer do Neon trabalha por transação.
- **PGlite fora do bundle.** O driver PGlite (Postgres em WASM, só para desenvolvimento e testes) é carregado sob demanda e excluído da função pelo `excludeFiles` do `vercel.json`, o que reduz a função de cerca de 27 MB para 10 MB.
- **Cabeçalhos.** O `vercel.json` aplica no site a mesma CSP do PWA e o mesmo cache do servidor Express (`/assets/*` imutável, o resto `no-cache`), além de HSTS, `nosniff`, `X-Frame-Options: DENY` e `Referrer-Policy`. Um teste (`apps/api/tests/vercel-config.test.ts`) compara os dois. A API mantém a CSP própria (`default-src 'none'`).
- **Limites da plataforma.** O corpo de uma requisição para a função vai até 4,5 MB. Por isso, na Vercel, comprovantes vão até 4 MB, e acima disso a API responde 413 com a mensagem de sempre. A duração máxima configurada é de 30 s por requisição.

## Problemas comuns

| Sintoma                                                        | Causa e solução                                                                                                 |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Toda chamada da API dá 500 e o log diz `Invalid environment`   | Falta `DATABASE_URL` `postgres://`, Blob store ou `JWT_SECRET`. Corrija e faça redeploy                         |
| Log `database schema is behind`                                | O build não migrou (integração do Neon desconectada?). Rode `bun run db:migrate` com a URL direta               |
| `db:migrate` fica parado                                       | Outro deploy segura o advisory lock; ele termina e libera. Se nada estiver rodando, confira se a URL é a direta |
| Upload grande volta 413 com texto `FUNCTION_PAYLOAD_TOO_LARGE` | Passou de 4,5 MB e a Vercel recusou antes da API. Use arquivos menores                                          |
| Log `could not remove Vercel request helper`                   | Defina `NODEJS_HELPERS=0`                                                                                       |
| Log `rate limits are counted per function instance`            | Configure o Upstash (passo 5)                                                                                   |

## Custos

Só o que está documentado pelos fornecedores: as funções estão incluídas no plano Hobby da Vercel dentro dos [limites](https://vercel.com/docs/limits); o Vercel Blob existe em todos os planos ([preços](https://vercel.com/docs/vercel-blob/usage-and-pricing)); o Neon tem um plano Free (com 6 horas de histórico para restauração). Confira os valores atuais nas páginas de preço antes de decidir.

## Testar localmente sem conta

Sem login na Vercel nem no Neon, dá para reproduzir as partes principais com um Postgres em Docker:

```bash
docker run --rm -d --name pg -e POSTGRES_PASSWORD=emdia -e POSTGRES_USER=emdia -p 15432:5432 postgres:18
DATABASE_URL=postgres://emdia:emdia@127.0.0.1:15432/emdia bun run build:vercel     # build + migrações
cd apps/api && EMDIA_TEST_POSTGRES_URL=postgres://emdia:emdia@127.0.0.1:15432/emdia vp test tests/db-drivers.test.ts   # apaga esse banco
```

O `vercel build` também roda offline com um `.vercel/project.json` escrito à mão (`projectId`, `orgId`, `settings.framework: null`). Ele gera `.vercel/output` com a função e as rotas que a Vercel usaria.

## Referências

- Express na Vercel: https://vercel.com/docs/frameworks/backend/express
- Runtime Node.js e funções em `/api`: https://vercel.com/docs/functions/runtimes/node-js
- Versões de Node: https://vercel.com/docs/functions/runtimes/node-js/node-js-versions
- Build personalizado e `NODEJS_HELPERS`: https://vercel.com/docs/functions/runtimes/node-js/advanced-node-configuration
- Gerenciadores de pacotes (bun e `bun.lock`): https://vercel.com/docs/package-managers
- `vercel.json` (build, functions, rewrites, headers): https://vercel.com/docs/project-configuration/vercel-json
- Rewrites: https://vercel.com/docs/routing/rewrites
- Limites das funções (4,5 MB, duração): https://vercel.com/docs/functions/limitations
- Variáveis de sistema: https://vercel.com/docs/environment-variables/system-environment-variables
- Blob privado: https://vercel.com/docs/vercel-blob/private-storage
- SDK do Blob: https://vercel.com/docs/vercel-blob/using-blob-sdk
- CLI do Blob: https://vercel.com/docs/cli/blob
- Driver serverless do Neon (HTTP vs WebSocket, Node 22+): https://neon.com/docs/serverless/serverless-driver
- Neon com Vercel Functions e Fluid compute (TCP + `attachDatabasePool`): https://neon.com/docs/guides/vercel-connection-methods
- Formas de conectar Neon e Vercel: https://neon.com/docs/guides/vercel-overview
- Integração Vercel-Managed (variáveis, branches de preview): https://neon.com/docs/guides/vercel-managed-integration
- Integração Neon-Managed: https://neon.com/docs/guides/neon-managed-vercel-integration
- Pooling e limites do PgBouncer (advisory locks, conexão direta para migrações): https://neon.com/docs/connect/connection-pooling
- Restauração e janela de histórico: https://neon.com/docs/introduction/branch-restore, https://neon.com/docs/postgres/backup-restore/history-window
- `attachDatabasePool` e `waitUntil`: https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package
- Migrações do Drizzle: https://orm.drizzle.team/docs/migrations
- `drizzle-kit check`: https://orm.drizzle.team/docs/drizzle-kit-check
- drizzle-zod: https://orm.drizzle.team/docs/zod
- PGlite: https://pglite.dev/docs/api
- API REST do Upstash: https://upstash.com/docs/redis/features/restapi
- `rate-limit-redis`: https://github.com/express-rate-limit/rate-limit-redis
