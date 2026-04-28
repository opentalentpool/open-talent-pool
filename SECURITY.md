# Política de Segurança

## Reportando vulnerabilidades

Não abra issues públicas para vulnerabilidades, suspeitas de vazamento, bypass de autenticação, exposição de dados pessoais ou falhas de autorização.

Use o canal privado do GitHub:

https://github.com/opentalentpool/open-talent-pool/security/advisories/new

Se o fluxo privado do GitHub não estiver disponível para você, envie um e-mail para `contato@opentalentpool.org` com o assunto `Security report - OpenTalentPool`.

## O que incluir no reporte

Inclua apenas o necessário para reproduzir e avaliar o risco:

- área afetada;
- impacto esperado;
- passos de reprodução;
- comportamento observado e comportamento esperado;
- ambiente usado no teste;
- evidências redigidas, sem tokens, senhas, cookies de sessão, chaves privadas ou dados pessoais reais.

Se a vulnerabilidade envolver dados de terceiros, não faça extração em massa, não publique a prova de conceito e não compartilhe dados fora do canal privado.

## Escopo prioritário

Relatos de segurança são especialmente importantes quando envolvem:

- autenticação por e-mail e código;
- sessão em cookie `HttpOnly`;
- rate limits, Turnstile, CORS, CSRF e validação de origem;
- dados pessoais, perfis profissionais, e-mail de contato e busca inclusiva;
- moderação, papéis administrativos e trilhas de auditoria;
- fila de e-mails, SMTP, Redis, Docker, nginx e variáveis de ambiente;
- vazamento de segredos ou arquivos que não deveriam estar no repositório.

## Boas práticas de pesquisa

- Use contas e dados próprios de teste.
- Não tente acessar, alterar ou excluir dados de outras pessoas.
- Não degrade disponibilidade, não faça varredura agressiva e não contorne limites de forma destrutiva.
- Pare o teste assim que tiver evidência suficiente para demonstrar o risco.
- Dê tempo razoável para correção antes de qualquer divulgação pública.

## Correções

Correções de segurança serão tratadas conforme impacto, explorabilidade e superfície afetada. Quando aplicável, a correção deve incluir testes de regressão e atualização da documentação pública relacionada.
