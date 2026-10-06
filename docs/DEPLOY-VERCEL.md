# Deploy na Vercel

Um único projeto Vercel, criado a partir da raiz do repositório, serve o app e a API na mesma origem:

| Parte                 | Onde roda                                                          | Configurado em                               |
| --------------------- | ------------------------------------------------------------------ | -------------------------------------------- |
| PWA (`apps/web/dist`) | CDN da Vercel, arquivos estáticos                                  | `vercel.json` (`outputDirectory`, `headers`) |
| API (`/api/*`)        | Uma Vercel Function (`api/index.mjs` → `apps/api/dist/vercel.mjs`) | `vercel.json` (`rewrites`, `functions`)      |
| Banco de dados        | [Turso](https://turso.tech) (libSQL, compatível com SQLite)        | `DATABASE_URL`, `DATABASE_AUTH_TOKEN`        |
| Comprovantes          | Vercel Blob **privado**                                            | store conectado ao projeto                   |
| Limite de requisições | Memória de cada instância, ou Upstash Redis (opcional)             | `UPSTASH_REDIS_REST_*`                       |

Por que Turso e Blob: o disco de uma Vercel Function é temporário e separado por instância. Um arquivo SQLite ou uma pasta de uploads ali perderia dados. Por isso, na Vercel, a API se recusa a iniciar sem um banco `libsql://` e sem um Blob store.

O caminho com Docker ou `bun run start` (SQLite em arquivo e comprovantes em disco) continua igual. Veja [RELIABILITY.md](RELIABILITY.md#deploy).

## O que você precisa

- Conta na Vercel com acesso ao repositório `oiagorodrigues/em-dia` no GitHub.
- Conta no Turso e a CLI `turso`.
- Opcional: conta no Upstash (limite de requisições compartilhado) e um provedor SMTP (convites e redefinição de senha por e-mail).

## 1. Criar o banco no Turso

```bash
brew install tursodatabase/tap/turso      # Linux/WSL: curl -sSfL https://get.tur.so/install.sh | bash
turso auth signup                          # ou: turso auth login
turso db create emdia
turso db show emdia --url                  # copie a URL
turso db tokens create emdia --expiration never
```

A URL vai em `DATABASE_URL` e o token em `DATABASE_AUTH_TOKEN`. A API aceita a URL com `libsql://` ou `https://`.

Crie também um banco para as previews. O build de cada preview aplica as migrações no banco que estiver configurado, e uma branch com migração nova não deve alterar o banco de produção:

```bash
turso db create emdia-preview
turso db show emdia-preview --url
turso db tokens create emdia-preview --expiration never
```

Prefere um token que expira? Use `--expiration 90d` e anote a data para trocar.

## 2. Criar o projeto na Vercel

1. Em [vercel.com/new](https://vercel.com/new), importe o repositório do GitHub.
2. **Root Directory**: a raiz do repositório.
3. **Framework Preset**: Other. O `vercel.json` já define instalação (`bun install --frozen-lockfile --ignore-scripts`), build (`bun run build:vercel`) e saída (`apps/web/dist`).
4. **Node.js**: 24.x. O `engines.node` do `package.json` já pede `24.x`.
5. Ainda não faça o deploy: sem as variáveis do passo 4, a função não sobe.

## 3. Criar o Blob store privado

No projeto: **Storage** → **Create Storage** → **Blob** → **Continue**, escolha acesso **Private** e conecte o store ao projeto em todos os ambientes.

Conectar o store adiciona `BLOB_STORE_ID` ao projeto, e o SDK autentica por OIDC. Se você também tiver `BLOB_READ_WRITE_TOKEN` (é o caso de quem roda o seed ou scripts fora da Vercel), a API usa o token.

Os comprovantes ficam em `receipts/<128 bits aleatórios>.<ext>`. O navegador nunca recebe a URL do Blob: a API confere a sessão e as permissões e devolve o arquivo em streaming.

## 4. Variáveis de ambiente

Em **Settings** → **Environment Variables**. Marque também **Enable access to System Environment Variables** (a API usa `VERCEL` e `VERCEL_PROJECT_PRODUCTION_URL`).

| Variável                   | Obrigatória | Valor                                                                                                 |
| -------------------------- | ----------- | ----------------------------------------------------------------------------------------------------- |
| `JWT_SECRET`               | sim         | 32+ caracteres. `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"` |
| `DATABASE_URL`             | sim         | URL do Turso. Em **Production**, o banco `emdia`; em **Preview**, o `emdia-preview`                   |
| `DATABASE_AUTH_TOKEN`      | sim         | token do banco do mesmo ambiente                                                                      |
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
DATABASE_URL=libsql://emdia-preview-... DATABASE_AUTH_TOKEN=... BLOB_READ_WRITE_TOKEN=... bun run seed -- --reset
```

## 8. Domínio próprio

**Settings** → **Domains** → adicione o domínio e siga as instruções de DNS. `VERCEL_PROJECT_PRODUCTION_URL` passa a apontar para o domínio próprio mais curto. Se você definiu `WEB_ORIGIN`, atualize o valor e faça um novo deploy. Os cookies de sessão funcionam porque app e API estão na mesma origem.

## Como as migrações rodam

- O build roda `bun run --cwd apps/api db:migrate --if-configured`. Sem `DATABASE_URL`, o passo é pulado.
- Cada migração roda numa transação de escrita que confere a tabela `migrations` antes de aplicar. Dois builds ao mesmo tempo aplicam cada migração uma vez só.
- A função nunca migra. Ao iniciar, ela compara as migrações do código com as do banco e, se faltar alguma, registra o erro `database schema is behind` com a lista.
- Para migrar à mão: `DATABASE_URL=... DATABASE_AUTH_TOKEN=... bun run db:migrate`.
- Uma migração nova chega à produção no build de produção, antes de o novo código receber tráfego. As migrações precisam ser compatíveis com a versão anterior do código, que segue no ar até o fim do deploy (por exemplo, adicionar colunas antes de remover).

## Backups

**Turso.** O point-in-time recovery é automático. A janela depende do plano: 24 horas no Free, 10 dias no Developer, 30 no Scaler e 90 no Pro. A restauração cria um banco novo:

```bash
turso db create emdia-restaurado --from-db emdia --timestamp 2026-10-06T12:00:00Z
```

Guarde também uma cópia sua, por exemplo diária:

```bash
turso db shell emdia .dump > emdia-$(date +%F).sql
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
- **libSQL.** Para URLs remotas a API carrega `@libsql/client/web`, que só usa `fetch`. O cliente Node carrega um binário nativo que o rastreamento de arquivos da Vercel não inclui; ele só é usado para bancos locais (`file:`) nos testes. Transações de escrita entram numa fila por instância e são repetidas com backoff quando o banco responde `SQLITE_BUSY`.
- **Cabeçalhos.** O `vercel.json` aplica no site a mesma CSP do PWA e o mesmo cache do servidor Express (`/assets/*` imutável, o resto `no-cache`), além de HSTS, `nosniff`, `X-Frame-Options: DENY` e `Referrer-Policy`. Um teste (`apps/api/tests/vercel-config.test.ts`) compara os dois. A API mantém a CSP própria (`default-src 'none'`).
- **Limites da plataforma.** O corpo de uma requisição para a função vai até 4,5 MB. Por isso, na Vercel, comprovantes vão até 4 MB, e acima disso a API responde 413 com a mensagem de sempre. A duração máxima configurada é de 30 s por requisição.

## Problemas comuns

| Sintoma                                                        | Causa e solução                                                                  |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Toda chamada da API dá 500 e o log diz `Invalid environment`   | Falta `DATABASE_URL` remota, Blob store ou `JWT_SECRET`. Corrija e faça redeploy |
| Log `database schema is behind`                                | O build não migrou (sem `DATABASE_URL` no build?). Rode `bun run db:migrate`     |
| Upload grande volta 413 com texto `FUNCTION_PAYLOAD_TOO_LARGE` | Passou de 4,5 MB e a Vercel recusou antes da API. Use arquivos menores           |
| Log `could not remove Vercel request helper`                   | Defina `NODEJS_HELPERS=0`                                                        |
| Log `rate limits are counted per function instance`            | Configure o Upstash (passo 5)                                                    |

## Custos

Só o que está documentado pelos fornecedores: as funções estão incluídas no plano Hobby da Vercel dentro dos [limites](https://vercel.com/docs/limits); o Vercel Blob existe em todos os planos ([preços](https://vercel.com/docs/vercel-blob/usage-and-pricing)); o Turso tem um plano Free (com point-in-time recovery de 24 horas). Confira os valores atuais nas páginas de preço antes de decidir.

## Testar localmente sem conta

Sem login na Vercel nem no Turso, dá para reproduzir as partes principais:

```bash
docker run --rm -p 18080:8080 ghcr.io/tursodatabase/libsql-server:latest   # um libSQL igual ao do Turso
DATABASE_URL=http://127.0.0.1:18080 bun run build:vercel                    # build + migrações pela rede
cd apps/api && EMDIA_TEST_LIBSQL_URL=http://127.0.0.1:18080 vp test tests/db-drivers.test.ts   # apaga esse banco
EMDIA_TEST_DRIVER=libsql vp test                                             # a suíte inteira sobre libSQL
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
- Cliente libSQL: https://docs.turso.tech/sdk/ts/reference
- CLI do Turso: https://docs.turso.tech/cli/introduction, https://docs.turso.tech/cli/db/create, https://docs.turso.tech/cli/db/tokens/create, https://docs.turso.tech/cli/db/shell
- Point-in-time recovery do Turso: https://docs.turso.tech/features/point-in-time-recovery
- Pragmas no Turso (foreign keys): https://docs.turso.tech/sql-reference/pragmas
- API REST do Upstash: https://upstash.com/docs/redis/features/restapi
- `rate-limit-redis`: https://github.com/express-rate-limit/rate-limit-redis
