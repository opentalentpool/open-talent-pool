# Contribuindo com o OpenTalentPool

Obrigado por contribuir com o OpenTalentPool. Este repositório é público, então toda contribuição precisa preservar segurança, privacidade e clareza de domínio desde o primeiro commit.

Antes de começar, leia [AGENTS.md](AGENTS.md). Ele é a referência principal de contexto do produto, linguagem de domínio, guardrails de segurança e expectativas de engenharia.

## Preparando o ambiente

Use `pnpm` na versão definida pelo `packageManager` do `package.json`.

```sh
pnpm install
cp .env.example .env
pnpm run dev
```

O arquivo `.env` é local e nunca deve ser commitado. Use apenas valores dummy, locais ou de desenvolvimento. Se precisar testar envio real de e-mail, use credenciais pessoais somente no `.env` local.

## Antes de abrir um pull request

- Mantenha PRs pequenos, revisáveis e focados em um objetivo claro.
- Explique a mudança, o motivo e os testes executados.
- Inclua testes quando mudar comportamento de produto, backend, frontend, segurança, privacidade ou contrato de API.
- Não suba `.env`, dumps, relatórios internos, artefatos de build/teste, chaves privadas, tokens, senhas ou prints/logs com dados sensíveis.
- Siga a linguagem do domínio: `profissional`, `recrutador`, `perfil profissional`, `busca de talentos`, `filtros`, `senioridade`, `stack` e `modelo de trabalho`.
- Evite copy de interface que explique intenção interna, layout ou roadmap. A UI deve falar de estados reais, erros reais ou ações reais do usuário.

## Checks recomendados

Para mudanças pequenas de documentação, rode pelo menos:

```sh
git diff --check
gitleaks detect --source . --redact
```

Para mudanças de código, rode:

```sh
pnpm run lint
pnpm test
pnpm run build
```

Para mudanças que toquem autenticação, sessão, captcha, cookies, CORS, SMTP, Redis, BullMQ, dados pessoais ou autorização, rode também:

```sh
pnpm run test:e2e
pnpm audit --prod
```

## Segurança e privacidade

Não abra issue pública para vulnerabilidades. Use o fluxo descrito em [SECURITY.md](SECURITY.md).

Mudanças em autenticação, sessão, rate limit, e-mail transacional, dados pessoais, moderação, busca inclusiva ou exposição de contato são sensíveis. Elas precisam de testes, revisão cuidadosa e alinhamento com as políticas públicas do produto.

## Commits

Use mensagens objetivas e convencionais quando fizer sentido:

- `docs: ...`
- `fix: ...`
- `feat: ...`
- `test: ...`
- `ci: ...`
- `chore: ...`

Prefira descrever o comportamento entregue em vez de detalhes internos irrelevantes.
