# AGENTS.md

## Propósito do documento

Este é o ponto de entrada obrigatório para qualquer prompt de trabalho neste workspace.

Ele existe para alinhar contexto de produto, linguagem de domínio, guardrails de segurança, boas práticas de engenharia e expectativas de execução da IA. Em caso de conflito entre um pedido genérico e este documento, a IA deve seguir este documento e pedir esclarecimento apenas quando o conflito impactar produto, segurança, privacidade ou arquitetura.

Este documento é `AI-first`, mas deve continuar legível e útil para humanos.

## Missão do produto

O OpenTalentPool é uma plataforma pública e gratuita de descoberta de talentos em tecnologia.

O produto nasceu para reduzir o atrito entre:

- pessoas e organizações que precisam encontrar profissionais com critérios reais de aderência;
- profissionais de tecnologia que precisam ser encontrados pelo que sabem fazer;
- a limitação artificial das plataformas tradicionais, que escondem busca útil atrás de paywall.

O objetivo do OpenTalentPool é democratizar o acesso à descoberta de talentos em TI com busca eficiente, filtros úteis, transparência e baixo custo de acesso. A plataforma deve ser útil para recrutadores, lideranças técnicas, startups, pequenas empresas, comunidades e pessoas com necessidades legítimas de busca, sem depender de soluções caras ou excessivamente fechadas.

## Estado atual do workspace

### Visão do produto

Na visão do produto, profissionais podem manter perfis técnicos pesquisáveis e quem busca talentos pode localizar pessoas por palavras-chave, senioridade, stack, localização, modelo de trabalho e outros filtros relevantes. Cenários específicos, como vagas afirmativas, só são aceitáveis quando tratados com critérios explícitos, éticos e transparentes.

### Implementado hoje

- Frontend em `React + Vite + TypeScript`
- Backend próprio em `Express`
- Banco em `PostgreSQL`
- UI com `Tailwind CSS` e `shadcn/ui`
- Autenticação por e-mail + código com `challengeId`, Cloudflare Turnstile e sessão opaca server-side em cookie `HttpOnly`
- Busca pública conectada ao banco real
- Perfil profissional editável
- Favoritos, buscas salvas e alertas por e-mail para recrutadores
- Fila global de e-mails com `email_outbox` no Postgres como fonte de verdade, `Redis + BullMQ` como camada de execução e prioridade máxima para auth
- Infraestrutura base de testes com `Vitest`, `React Testing Library`, `Supertest` e configuração de `Playwright`
- Workspace gerenciado por `pnpm`

### Não tratar como pronto quando não estiver

- O produto ainda depende de uma única trilha de autenticação por e-mail + código; qualquer mudança nessa área é sensível e precisa de revisão reforçada
- O ownership map atual mostra concentração operacional no auth; bus factor baixo deve ser tratado como risco real de manutenção e segurança
- A cobertura de testes ainda é inicial e deve crescer junto com as próximas mudanças

## Linguagem ubíqua e mapa de domínio

Use sempre os termos abaixo como linguagem canônica do produto:

- `profissional`: pessoa de tecnologia que publica um perfil técnico
- `recrutador`: pessoa ou organização que busca talentos
- `perfil profissional`: representação pública e pesquisável das informações técnicas de um profissional
- `busca de talentos`: processo de localizar perfis com aderência a critérios de pesquisa
- `filtros`: critérios estruturados de busca
- `disponibilidade`: sinalização sobre abertura para oportunidades
- `senioridade`: nível de experiência profissional
- `stack`: tecnologias, ferramentas e competências técnicas
- `modelo de trabalho`: remoto, híbrido ou presencial

### Subdomínios atuais e esperados

- `Identidade e Acesso`
  Cadastro, verificação por e-mail, desafios OTP com `challengeId`, sessão em cookie, anti-bot e papéis básicos.
- `Perfis Profissionais`
  Dados técnicos, experiências, links profissionais, localização e disponibilidade.
- `Descoberta de Talentos`
  Busca, palavras-chave, filtros, ordenação e aderência entre necessidade e perfil.
- `Administração/Curadoria`
  Moderação, governança, filas críticas de notificação, qualidade de dados e políticas de uso.

### Diretriz de DDD pragmático

- Modele o software a partir do domínio, não da ferramenta.
- Prefira nomes orientados ao negócio em vez de nomes genéricos de CRUD.
- Separe responsabilidades por subdomínio quando a complexidade justificar.
- Não introduza formalismo de DDD por vaidade; use DDD para clareza, limites e manutenção.
- Se um conceito ainda for apenas visão futura, deixe isso explícito no código e na documentação.

## Guardrails inegociáveis

### Segurança e privacidade

- Nunca versionar segredos, tokens, senhas, chaves ou credenciais reais.
- Nunca enfraquecer autenticação, autorização ou validação de entrada para “acelerar” entrega.
- Minimizar coleta, exposição e retenção de PII.
- Nunca ampliar coleta de dados pessoais sem justificativa explícita de produto.
- Toda entrada externa deve ser validada e normalizada.
- Toda query SQL deve ser parametrizada.
- O auth web deve permanecer cookie-based. Não reintroduzir JWT ou qualquer token de sessão em `localStorage`, `sessionStorage` ou URL.
- Emissão de código deve permanecer protegida por anti-bot, limites persistidos e respostas anti-enumeração.
- Todos os e-mails do sistema devem passar pelo `email_outbox`; auth (`signup`, `login`, `profile_contact_email`) deve continuar com prioridade máxima e semântica bloqueante até a entrega inline do item enfileirado.
- `ENABLE_TEST_ROUTES` só pode existir em `NODE_ENV=test`. Não criar exceções locais ou temporárias para produção.
- `TRUST_PROXY` só pode ser ativado quando houver proxy reverso confiável e documentado; nunca confiar em `X-Forwarded-For` diretamente vindo da internet.
- `DEBUG` ou `LOG_LEVEL=debug` não são aceitáveis em produção.

### Ética e uso responsável

- Nunca inferir atributos sensíveis a partir de nome, foto, texto livre, localização ou heurística.
- Nunca tratar filtros afirmativos por dedução implícita.
- Só usar atributos explícitos, autodeclarados e tratados com transparência quando isso fizer parte de uma política clara do produto.
- Quando o produto se referir a grupos como pessoas trans e pessoas não binárias em contexto coletivo, preferir o termo `LGBTQIAPN+`. Se a funcionalidade não distinguir subgrupos de forma explícita, usar a categoria coletiva em vez de rótulos específicos que possam excluir outras pessoas do mesmo recorte.
- Em funcionalidades de descoberta, priorizar clareza, auditabilidade e não discriminação indevida.

### Arquitetura e manutenção

- Evitar lock-in desnecessário com vendors, scaffolds ou serviços “mágicos”.
- Não introduzir integrações externas sem justificar valor, custo operacional e impacto de manutenção.
- Preferir fluxos explícitos, legíveis e reversíveis.
- Não esconder regra de negócio importante em configuração opaca ou acoplamento implícito.
- Não tratar mock, placeholder ou visão futura como se fosse capacidade consolidada.

## Workflow obrigatório da IA

Antes de implementar qualquer mudança, a IA deve:

1. Entender o pedido e reler este documento.
2. Inspecionar o código relevante antes de propor ou editar.
3. Em tarefas de design, UI/UX, frontend e design system, a IA pode consultar skills, referências e ferramentas especializadas quando isso agregar valor, sem tornar nenhuma delas obrigatória.
4. Diferenciar claramente `estado atual`, `objetivo desejado` e `impacto da mudança`.
5. Escolher a menor mudança segura que resolva o problema sem inflar escopo.
6. Explicitar suposições quando não puder validar algo no workspace.
7. Em qualquer mudança de autenticação, sessão, rate limit, captcha, cookies, CORS, headers de segurança ou fila de e-mails sensível, revisar também backend, frontend, schema, testes e documentação.

Durante a implementação, a IA deve:

- Preferir mudanças pequenas, explícitas e reversíveis.
- Atualizar testes, validações e documentação quando houver mudança de comportamento.
- Preservar coerência de domínio entre frontend, backend e banco.
- Evitar renomeações ou refactors amplos sem necessidade clara.
- Em UI, evitar copy autoexplicativa, meta ou hipotética em estado neutro. A interface não deve explicar fluxos que não estão acontecendo no momento nem justificar suas próprias decisões visuais; mensagens desse tipo só devem aparecer quando acionadas por um estado real, erro real ou ação real do usuário.
- Em auth, mensagens externas devem continuar genéricas o suficiente para não facilitar enumeração de contas.

Ao finalizar, a IA deve:

- informar o que mudou;
- informar o que foi validado;
- explicitar riscos remanescentes;
- registrar suposições feitas;
- quando a mudança tocar auth, atualizar também `open-talent-pool-threat-model.md`, `security_best_practices_report.md` e, se a superfície sensível mudar, regenerar `ownership-map-out/`.

## Política de TDD

TDD é obrigatório por padrão para nova funcionalidade, correção de bug ou mudança de comportamento.

O ciclo esperado é:

1. `red`: escrever o teste que descreve o comportamento desejado ou a regressão.
2. `green`: implementar o mínimo necessário para fazer o teste passar.
3. `refactor`: melhorar a solução preservando o comportamento coberto.

### Regra para áreas sem infraestrutura de testes

Se a área afetada ainda não tiver infraestrutura de testes suficiente, a primeira entrega deve ser criar a infraestrutura mínima apropriada antes da feature ou modificação.

Não é aceitável usar a ausência de testes como justificativa para implementar direto.

### Exceção formal

Exceções só são aceitáveis quando houver impedimento real e explícito. Nesses casos, a IA deve registrar:

- por que TDD não pôde ser aplicado naquele ponto;
- qual risco foi assumido;
- qual cobertura alternativa foi usada;
- qual é o plano concreto para fechar a lacuna depois.

Sem esse protocolo, a implementação não está aderente a este workspace.

## Padrão de testes recomendado

Defaults do workspace para eliminar ambiguidade futura:

- Frontend: `Vitest + React Testing Library`
- Backend HTTP: `Vitest + Supertest`
- Fluxos críticos ponta a ponta: `Playwright`
- Integração com banco: ambiente isolado e descartável por execução
- Dependências de produção: `pnpm audit --prod` deve fazer parte da validação de mudanças sensíveis

Ao introduzir a infraestrutura de testes, ela deve seguir esses padrões por padrão, salvo justificativa técnica forte.

## Critérios de qualidade

Toda entrega deve buscar:

- coerência com o domínio do OpenTalentPool;
- nomes claros e orientados ao negócio;
- baixo acoplamento e baixa surpresa;
- tratamento explícito de erros;
- validação de entradas e saídas relevantes;
- testes adequados ao risco da mudança;
- `build`, `lint` e testes passando quando aplicável;
- ausência de segredos, dados sensíveis ou comportamentos antiéticos introduzidos pela mudança;
- em auth, `pnpm run test:frontend`, `pnpm run test:server`, `pnpm run test:e2e` e `pnpm audit --prod` são o baseline mínimo de validação.

## Checklist operacional de auth

- Arquivos sensíveis de auth exigem segundo revisor: `server/auth.js`, `server/app.js`, `server/runtime.js`, `server/contracts.js`, `server/db/schema.sql`, `src/pages/Auth.tsx`, `src/lib/api.ts`, `src/hooks/useAuth.tsx`, `src/types/auth.ts`, `src/components/TurnstileField.tsx`.
- Mudanças no contrato de login devem atualizar backend, frontend, testes e documentação no mesmo pacote.
- Alterações em origem confiável, cookie, proxy, captcha, SMTP, Redis, BullMQ ou rate limit devem ser tratadas como mudança de segurança, não como ajuste incidental.
- Se o threat model, o ownership map ou o report de best practices ficarem desatualizados após uma mudança de auth, a entrega não está completa.

## Instruções de resposta esperadas da IA

As respostas da IA neste workspace devem:

- começar do contexto real do código, não de suposições abstratas;
- propor plano enxuto quando necessário;
- implementar orientado a testes;
- deixar claro o que é fato atual, o que é visão e o que é suposição;
- resumir no final as validações executadas, os riscos remanescentes e as decisões assumidas.

Se o prompt for ambíguo, a IA deve explorar o repositório primeiro e só perguntar o que realmente não puder ser descoberto localmente.
