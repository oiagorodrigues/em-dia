# em dia

PWA para famílias brasileiras acompanharem horas, presença, pagamentos e comprovantes de trabalhadoras e trabalhadores domésticos. Empregador e profissional veem o mesmo cartão de ponto e confirmam os registros um do outro.

English: a PWA for Brazilian households to track hours, attendance, payments and receipts of domestic workers. Both sides see the same time card and confirm each other's entries.

## Como rodar

O gerenciador de pacotes é o **bun**. npm e pnpm são recusados de propósito (`devEngines` no `package.json`).

Requisitos: [bun](https://bun.sh) 1.3 ou mais novo e Node 22.18 ou mais novo (o `vp`, do Vite+, já traz um Node).

```bash
bun run setup   # instala dependências, cria apps/api/.env e carrega dados de demonstração
bun run dev     # sobe a API (http://localhost:3000) e o app (http://localhost:5173)
```

Abra http://localhost:5173 e entre com `ana@emdia.dev` (contratante) ou `maria@emdia.dev` (profissional), senha `emdia12345`. Para recriar os dados: `bun run seed -- --reset`.

### Se algo der errado

- `npm error EBADDEVENGINES` ou `This project is configured to use bun`: use `bun`, não npm/pnpm.
- `port 3000 is already in use` ou `Port 5173 is already in use`: já há um servidor rodando. Feche o outro terminal, ou encerre com `lsof -ti :3000 -ti :5173 | xargs kill`.
- `~/.vite-plus/env: parse error near '()'` ao abrir o terminal: o seu `~/.zshrc` define `alias vp=...` antes de carregar o Vite+. Remova o alias ou coloque-o depois da linha `. "$HOME/.vite-plus/env"`. O app roda mesmo assim, mas o `vp` fica sem a função de shell.
- `vp dev` na raiz não sobe nada: na raiz use `bun run dev` (ou `vp run dev`), que sobe API e web juntas.

## Comandos

```bash
bun run check        # formatação, lint e tipos
bun run test         # testes de todos os pacotes, incluindo a harness
bun run ready        # check + test + build
bun run docs:schema  # gera docs/generated/db-schema.md
```

## Produção e Docker

```bash
bun run build
bun run start        # serve a API e o build do web na mesma porta
docker build -t emdia .
docker run -p 3000:3000 -v emdia-data:/data -e JWT_SECRET=<32+ caracteres> emdia
```

O banco SQLite e os comprovantes ficam em `/data`; faça backup dos dois juntos (veja [docs/RELIABILITY.md](docs/RELIABILITY.md)). `JWT_SECRET` é obrigatório em produção. A imagem tem healthcheck em `/api/health`.

## Testes de navegador

`tools/e2e` guia o app com o Chrome do sistema (`playwright-core`, rodando com node): `screens` tira capturas de todas as telas e `flows` roda 25 jornadas de usuário. Precisa de `bun run dev` ativo. Detalhes em [tools/e2e/README.md](tools/e2e/README.md).

## Estrutura

- `packages/shared`: tipos, schemas, permissões e cálculo de pagamento
- `apps/api`: API Express 5 com `node:sqlite`
- `apps/web`: PWA em Vue 3 e Pinia
- `tools/e2e`: jornadas e capturas de tela no navegador
- `tools/harness`: testes que impõem arquitetura, estilo e documentação
- `docs/`: documentação; comece por [AGENTS.md](AGENTS.md) e [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
