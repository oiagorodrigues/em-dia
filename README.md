# em dia

PWA para famílias brasileiras acompanharem horas, presença, pagamentos e comprovantes de trabalhadoras e trabalhadores domésticos. Empregador e profissional veem o mesmo cartão de ponto e confirmam os registros um do outro.

English: a PWA for Brazilian households to track hours, attendance, payments and receipts of domestic workers. Both sides see the same time card and confirm each other's entries.

## Como rodar

Requisitos: Node 22.18 ou mais novo, [bun](https://bun.sh) e o CLI `vp` (Vite+).

```bash
bun install
bun run seed   # dados de demonstração
bun run dev    # api e web juntos
```

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

`tools/e2e` guia o app com o Chrome do sistema (`playwright-core`, rodando com node): `screens` tira capturas de todas as telas e `flows` roda 10 jornadas de usuário. Precisa de `bun run dev` ativo. Detalhes em [tools/e2e/README.md](tools/e2e/README.md).

## Estrutura

- `packages/shared`: tipos, schemas, permissões e cálculo de pagamento
- `apps/api`: API Express 5 com `node:sqlite`
- `apps/web`: PWA em Vue 3 e Pinia
- `tools/e2e`: jornadas e capturas de tela no navegador
- `tools/harness`: testes que impõem arquitetura, estilo e documentação
- `docs/`: documentação; comece por [AGENTS.md](AGENTS.md) e [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
