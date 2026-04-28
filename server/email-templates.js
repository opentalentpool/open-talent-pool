import { hasAffirmativeFilters } from "../src/lib/affirmative-config.js";
import { LEGAL_CONTACT_EMAIL } from "../src/lib/legal-policies.js";
import {
  MODERATION_ACTION_TYPE_LABEL,
  MODERATION_REPORT_CATEGORY_LABEL,
  MODERATION_TARGET_KIND_LABEL,
} from "../src/lib/moderation.js";

const EMAIL_COLORS = {
  pageBackground: "#eef4fb",
  surface: "#ffffff",
  surfaceMuted: "#f6f9fd",
  surfaceAccent: "#edf8ff",
  border: "#d8e2ef",
  text: "#16213b",
  textMuted: "#5c6b84",
  navy: "#0b1f4d",
  teal: "#18b7a0",
  blue: "#2476ea",
  white: "#ffffff",
};

const FONT_STACK = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
const MONO_STACK = "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace";
const CARD_RADIUS = "28px";
const PILL_RADIUS = "999px";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildAppUrl(appBaseUrl, pathname) {
  return new URL(pathname, appBaseUrl).toString();
}

function buildProfileUrl(appBaseUrl, publicSlug) {
  return buildAppUrl(appBaseUrl, `/profissionais/${encodeURIComponent(String(publicSlug ?? ""))}`);
}

function buildSavedSearchUrl(appBaseUrl, criteria = {}, savedSearchId = null) {
  if (savedSearchId) {
    const url = new URL("/buscar", appBaseUrl);
    url.searchParams.set("savedSearch", String(savedSearchId));

    return url.toString();
  }

  const url = new URL("/buscar", appBaseUrl);

  if (criteria.q) url.searchParams.set("q", criteria.q);
  if (criteria.seniority) url.searchParams.set("seniority", criteria.seniority);
  if (criteria.workModel) url.searchParams.set("workModel", criteria.workModel);
  if (criteria.state) url.searchParams.set("state", criteria.state);
  if (criteria.openToOpportunities) url.searchParams.set("openToOpportunities", "true");

  return url.toString();
}

function buildSavedSearchManagementUrl(appBaseUrl, savedSearchId = null) {
  const url = new URL("/dashboard", appBaseUrl);

  if (savedSearchId) {
    url.searchParams.set("savedSearch", String(savedSearchId));
  }

  return url.toString();
}

function formatBrazilianDate(value) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function formatAlertFilters(criteria = {}) {
  if (hasAffirmativeFilters(criteria)) {
    return "busca com priorização inclusiva e critérios afirmativos ativos";
  }

  const filters = [
    criteria.q ? `palavras-chave: ${criteria.q}` : null,
    criteria.seniority ? `senioridade: ${criteria.seniority}` : null,
    criteria.workModel ? `modelo de trabalho: ${criteria.workModel}` : null,
    criteria.state ? `estado: ${criteria.state}` : null,
    criteria.openToOpportunities ? "apenas perfis abertos a oportunidades" : null,
  ].filter(Boolean);

  return filters.length ? filters.join(" | ") : "sem filtros adicionais";
}

function formatMatchCount(matchCount) {
  return matchCount === 1 ? "1 novo perfil" : `${matchCount} novos perfis`;
}

function formatModerationCategory(category) {
  return MODERATION_REPORT_CATEGORY_LABEL[category] || "Outro motivo";
}

function formatModerationTargetKind(targetKind) {
  return MODERATION_TARGET_KIND_LABEL[targetKind] || "Conta alvo";
}

function formatModerationAction(actionType) {
  return MODERATION_ACTION_TYPE_LABEL[actionType] || "Decisão administrativa";
}

function renderBrandLockup() {
  return `
    <div style="font-family:${FONT_STACK};font-size:26px;font-weight:800;line-height:1.1;letter-spacing:-0.04em;">
      <span style="color:${EMAIL_COLORS.navy};">Open</span><span style="color:${EMAIL_COLORS.teal};">Talent</span><span style="color:${EMAIL_COLORS.blue};">Pool</span>
    </div>
    <div style="margin-top:8px;font-family:${FONT_STACK};font-size:12px;line-height:1.4;letter-spacing:0.18em;text-transform:uppercase;color:${EMAIL_COLORS.textMuted};">
      descoberta pública de talentos em tecnologia
    </div>
  `;
}

function renderButton({ href, label, tone = "primary" }) {
  const isPrimary = tone === "primary";
  const backgroundColor = isPrimary ? EMAIL_COLORS.navy : EMAIL_COLORS.surfaceMuted;
  const textColor = isPrimary ? EMAIL_COLORS.white : EMAIL_COLORS.navy;
  const borderColor = isPrimary ? EMAIL_COLORS.navy : EMAIL_COLORS.border;

  return `
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 12px 12px 0;">
      <tr>
        <td align="center" bgcolor="${backgroundColor}" style="border:1px solid ${borderColor};border-radius:${PILL_RADIUS};">
          <a
            href="${escapeHtml(href)}"
            style="display:inline-block;padding:14px 24px;font-family:${FONT_STACK};font-size:14px;font-weight:700;line-height:1.2;color:${textColor};text-decoration:none;border-radius:${PILL_RADIUS};"
          >
            ${escapeHtml(label)}
          </a>
        </td>
      </tr>
    </table>
  `;
}

function renderPanel({ eyebrow, title, bodyHtml, background = EMAIL_COLORS.surfaceMuted, borderColor = EMAIL_COLORS.border }) {
  const titleMarkup = title
    ? `<div style="margin:0 0 10px;font-family:${FONT_STACK};font-size:18px;font-weight:700;line-height:1.3;color:${EMAIL_COLORS.text};">${escapeHtml(title)}</div>`
    : "";
  const eyebrowMarkup = eyebrow
    ? `<div style="margin:0 0 8px;font-family:${FONT_STACK};font-size:11px;font-weight:700;line-height:1.4;letter-spacing:0.16em;text-transform:uppercase;color:${EMAIL_COLORS.textMuted};">${escapeHtml(eyebrow)}</div>`
    : "";

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px;border:1px solid ${borderColor};border-radius:22px;background:${background};">
      <tr>
        <td style="padding:20px 22px;">
          ${eyebrowMarkup}
          ${titleMarkup}
          <div style="font-family:${FONT_STACK};font-size:15px;line-height:1.7;color:${EMAIL_COLORS.text};">
            ${bodyHtml}
          </div>
        </td>
      </tr>
    </table>
  `;
}

function renderFooter(footnote) {
  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border-top:1px solid ${EMAIL_COLORS.border};">
      <tr>
        <td style="padding:22px 32px 30px;background:${EMAIL_COLORS.surfaceMuted};">
          <div style="font-family:${FONT_STACK};font-size:14px;font-weight:700;line-height:1.4;color:${EMAIL_COLORS.navy};">
            OpenTalentPool
          </div>
          <div style="margin-top:8px;font-family:${FONT_STACK};font-size:13px;line-height:1.7;color:${EMAIL_COLORS.textMuted};">
            ${escapeHtml(footnote)}
          </div>
        </td>
      </tr>
    </table>
  `;
}

function renderEmailShell({ preheader, eyebrow, title, intro, bodyHtml, primaryCta, secondaryCta, footnote }) {
  const ctas = [primaryCta, secondaryCta].filter(Boolean).map(renderButton).join("");

  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta http-equiv="x-ua-compatible" content="ie=edge" />
        <title>${escapeHtml(title)} - OpenTalentPool</title>
      </head>
      <body style="margin:0;padding:0;background:${EMAIL_COLORS.pageBackground};">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;visibility:hidden;">
          ${escapeHtml(preheader)}
        </div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0;background:${EMAIL_COLORS.pageBackground};">
          <tr>
            <td align="center" style="padding:32px 16px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;">
                <tr>
                  <td style="padding:0;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:${EMAIL_COLORS.surface};border:1px solid ${EMAIL_COLORS.border};border-radius:${CARD_RADIUS};">
                      <tr>
                        <td style="padding:28px 32px 18px;background:${EMAIL_COLORS.surface};">
                          ${renderBrandLockup()}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:0 32px 8px;">
                          <div style="display:inline-block;margin:0 0 14px;padding:8px 14px;border-radius:${PILL_RADIUS};background:${EMAIL_COLORS.surfaceAccent};font-family:${FONT_STACK};font-size:11px;font-weight:700;line-height:1.3;letter-spacing:0.16em;text-transform:uppercase;color:${EMAIL_COLORS.blue};">
                            ${escapeHtml(eyebrow)}
                          </div>
                          <h1 style="margin:0 0 12px;font-family:${FONT_STACK};font-size:34px;line-height:1.08;font-weight:800;letter-spacing:-0.04em;color:${EMAIL_COLORS.text};">
                            ${escapeHtml(title)}
                          </h1>
                          <p style="margin:0 0 24px;font-family:${FONT_STACK};font-size:16px;line-height:1.75;color:${EMAIL_COLORS.textMuted};">
                            ${escapeHtml(intro)}
                          </p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:0 32px 14px;">
                          ${bodyHtml}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:0 32px 18px;">
                          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                            <tr>
                              <td style="padding:0;">
                                ${ctas}
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:0;">
                          ${renderFooter(footnote)}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
}

export function buildCodeEmail({ appBaseUrl, code, purpose = "verification" }) {
  const isLogin = purpose === "login";
  const isProfileContactEmail = purpose === "profile_contact_email";
  const entryPath = isLogin ? "/entrar" : isProfileContactEmail ? "/dashboard" : "/cadastro";
  const subject = isLogin
    ? "Seu código de login - OpenTalentPool"
    : isProfileContactEmail
      ? "Autorize a troca do e-mail de contato - OpenTalentPool"
      : "Código de verificação - OpenTalentPool";
  const title = isLogin
    ? "Seu código de login chegou"
    : isProfileContactEmail
      ? "Autorize a troca do e-mail de contato"
      : "Seu código de verificação chegou";
  const intro = isLogin
    ? "Use este código de 6 dígitos para entrar na sua conta e continuar de onde parou."
    : isProfileContactEmail
      ? "Use este código de 6 dígitos para autorizar a alteração do e-mail de contato exibido para recrutadores autenticados."
      : "Use este código de 6 dígitos para confirmar seu e-mail e continuar no OpenTalentPool.";
  const openAppUrl = buildAppUrl(appBaseUrl, entryPath);
  const text = [
    subject,
    "",
    intro,
    "",
    code,
    "",
    "Este código expira em 15 minutos.",
    `Abra o OpenTalentPool: ${openAppUrl}`,
    "",
    isProfileContactEmail
      ? "Se você não pediu essa alteração, ignore este e-mail e mantenha o endereço atual."
      : "Se você não pediu este código, pode ignorar este e-mail.",
  ].join("\n");

  const codePanel = `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px;border-radius:24px;background:${EMAIL_COLORS.navy};">
      <tr>
        <td align="center" style="padding:24px 18px 18px;">
          <div style="margin:0 0 8px;font-family:${FONT_STACK};font-size:11px;font-weight:700;line-height:1.4;letter-spacing:0.16em;text-transform:uppercase;color:${EMAIL_COLORS.white};opacity:0.7;">
            Código de acesso
          </div>
          <div style="font-family:${MONO_STACK};font-size:36px;font-weight:800;line-height:1.1;letter-spacing:8px;color:${EMAIL_COLORS.white};">
            ${escapeHtml(code)}
          </div>
          <div style="margin-top:12px;font-family:${FONT_STACK};font-size:14px;line-height:1.6;color:${EMAIL_COLORS.white};opacity:0.82;">
            Copie os 6 dígitos acima e conclua o acesso no navegador.
          </div>
        </td>
      </tr>
    </table>
  `;

  const html = renderEmailShell({
    preheader: isProfileContactEmail
      ? "Autorize a troca do e-mail de contato com um código que expira em 15 minutos."
      : "Seu código do OpenTalentPool expira em 15 minutos.",
    eyebrow: isLogin ? "login com código" : isProfileContactEmail ? "e-mail de contato do perfil" : "verificação por e-mail",
    title,
    intro,
    bodyHtml:
      codePanel +
      renderPanel({
        eyebrow: "Validade",
        title: "Expira em 15 minutos",
        background: EMAIL_COLORS.surfaceAccent,
        borderColor: "#d6e7ff",
        bodyHtml:
          "Sempre use o código mais recente enviado para este e-mail. Cada novo envio substitui o anterior.",
      }) +
      renderPanel({
        eyebrow: "Segurança",
        title: "Não foi você?",
        bodyHtml:
          isProfileContactEmail
            ? "Se você não pediu essa troca, ignore este e-mail. O e-mail de contato do seu perfil só muda depois da confirmação e do salvamento manual."
            : "Se você não pediu este código, ignore este e-mail. Nenhuma alteração será feita sem a confirmação no OpenTalentPool.",
      }),
    primaryCta: {
      href: openAppUrl,
      label: isProfileContactEmail ? "Abrir painel" : "Abrir OpenTalentPool",
    },
    footnote: isProfileContactEmail
      ? "Confirmação por código para proteger mudanças no e-mail de contato do perfil profissional."
      : "Autenticação por código, com acesso leve e sem expor informações privadas na busca pública.",
  });

  return {
    subject,
    text,
    html,
  };
}

export function buildSavedSearchAlertEmail({ to, recruiterName, searchName, savedSearchId = null, criteria, matches, appBaseUrl }) {
  const greeting = recruiterName ? `Olá, ${recruiterName}!` : "Olá!";
  const searchUrl = buildSavedSearchUrl(appBaseUrl, criteria, savedSearchId);
  const manageAlertUrl = buildSavedSearchManagementUrl(appBaseUrl, savedSearchId);
  const dashboardUrl = buildAppUrl(appBaseUrl, "/dashboard");
  const matchCount = formatMatchCount(matches.length);
  const filters = formatAlertFilters(criteria);
  const subject = `Novos perfis para a busca salva "${searchName}"`;
  const textMatches = matches
    .map((match) => {
      const profileUrl = buildProfileUrl(appBaseUrl, match.publicSlug);

      return `- ${match.name}\n  ${match.headline || "Perfil técnico"}\n  ${profileUrl}`;
    })
    .join("\n\n");
  const text = [
    subject,
    "",
    greeting,
    "",
    `Encontramos ${matchCount} para a sua busca salva "${searchName}".`,
    `Filtros: ${filters}`,
    "",
    "Perfis encontrados:",
    textMatches,
    "",
    `Abrir esta busca: ${searchUrl}`,
    `Gerenciar alerta: ${manageAlertUrl}`,
    `Ir para o painel: ${dashboardUrl}`,
    "",
    "Você está recebendo este alerta porque esta busca salva está com notificações ativas no seu painel.",
  ].join("\n");

  const matchesHtml = matches
    .map((match) => {
      const profileUrl = buildProfileUrl(appBaseUrl, match.publicSlug);

      return renderPanel({
        eyebrow: "Perfil publicado",
        title: match.name,
        bodyHtml: `
          <div style="margin:0 0 14px;color:${EMAIL_COLORS.textMuted};">${escapeHtml(match.headline || "Perfil técnico")}</div>
          ${renderButton({ href: profileUrl, label: "Abrir perfil", tone: "secondary" })}
        `,
      });
    })
    .join("");

  const html = renderEmailShell({
    preheader: `${matchCount} para a busca salva ${searchName}.`,
    eyebrow: "alerta de busca salva",
    title: "Novos perfis chegaram para a sua busca",
    intro: `${greeting} Encontramos ${matchCount} para a busca salva "${searchName}".`,
    bodyHtml:
      renderPanel({
        eyebrow: "Resumo",
        title: `Busca salva: ${searchName}`,
        background: EMAIL_COLORS.surfaceAccent,
        borderColor: "#d6e7ff",
        bodyHtml: `
          <div style="margin:0 0 8px;"><strong>${escapeHtml(matchCount)}</strong></div>
          <div style="color:${EMAIL_COLORS.textMuted};">Revise os novos perfis publicados e continue a curadoria com contexto técnico mais claro.</div>
        `,
      }) +
      renderPanel({
        eyebrow: "Último filtro registrado",
        title: "Critérios da busca",
        bodyHtml: `
          <div>${escapeHtml(filters)}</div>
          <div style="margin-top:10px;">
            <a href="${escapeHtml(dashboardUrl)}" style="color:${EMAIL_COLORS.blue};text-decoration:underline;">
              Ir para o painel
            </a>
          </div>
        `,
      }) +
      matchesHtml,
    primaryCta: {
      href: searchUrl,
      label: "Abrir esta busca",
    },
    secondaryCta: {
      href: manageAlertUrl,
      label: "Gerenciar alerta",
      tone: "secondary",
    },
    footnote: "Você está recebendo este alerta porque esta busca salva está com notificações ativas no seu painel.",
  });

  return {
    to,
    subject,
    text,
    html,
  };
}

export function buildProfileFreshnessEmail({
  to,
  professionalName,
  publicSlug,
  stageDays,
  lastUpdatedAt,
  staleAfterAt,
  appBaseUrl,
}) {
  const dashboardUrl = buildAppUrl(appBaseUrl, "/dashboard");
  const profileUrl = publicSlug ? buildProfileUrl(appBaseUrl, publicSlug) : dashboardUrl;
  const greeting = professionalName ? `Olá, ${professionalName}!` : "Olá!";
  const staleDateLabel = formatBrazilianDate(staleAfterAt);
  const updatedAtLabel = formatBrazilianDate(lastUpdatedAt);
  const isExpiry = stageDays === 180;
  const subject = isExpiry
    ? "Seu perfil foi retirado da descoberta pública - OpenTalentPool"
    : `Atualize seu perfil para manter a descoberta ativa - ${stageDays} dias`;
  const title = isExpiry ? "Seu perfil saiu da descoberta pública" : "Seu perfil precisa de atualização";
  const intro = isExpiry
    ? `${greeting} Seu perfil profissional foi retirado da descoberta pública porque ficou mais de 180 dias sem atualização.`
    : `${greeting} Seu perfil publicado está há ${stageDays} dias sem atualização.`;
  const text = [
    subject,
    "",
    intro,
    isExpiry
      ? "Faça qualquer atualização real no currículo e salve o perfil para liberar uma nova publicação manual."
      : `Atualize o currículo até ${staleDateLabel} para manter o perfil ativo na descoberta pública.`,
    `Última atualização registrada: ${updatedAtLabel}`,
    "",
    `Abrir dashboard: ${dashboardUrl}`,
    `Abrir perfil público atual: ${profileUrl}`,
    "",
    "Você está recebendo este e-mail porque o OpenTalentPool acompanha a recência de perfis públicos para preservar qualidade e confiança na base.",
  ].join("\n");

  const stagePanel = renderPanel({
    eyebrow: isExpiry ? "Expiração do perfil" : "Recência do perfil",
    title,
    background: isExpiry ? "#fff3f1" : EMAIL_COLORS.surfaceAccent,
    borderColor: isExpiry ? "#f2d1cb" : "#d6e7ff",
    bodyHtml: isExpiry
      ? `
          <div style="margin:0 0 8px;"><strong>Perfil retirado da descoberta pública</strong></div>
          <div style="color:${EMAIL_COLORS.textMuted};">Atualize e salve o currículo para liberar uma nova publicação manual no seu painel.</div>
        `
      : `
          <div style="margin:0 0 8px;"><strong>${stageDays} dias sem atualização</strong></div>
          <div style="color:${EMAIL_COLORS.textMuted};">Atualize o perfil até ${escapeHtml(staleDateLabel)} para continuar na descoberta pública.</div>
        `,
  });

  const timelinePanel = renderPanel({
    eyebrow: "Última atividade",
    title: "Recorte atual do currículo",
    bodyHtml: `
      <div>Última atualização registrada: <strong>${escapeHtml(updatedAtLabel)}</strong></div>
      <div style="margin-top:8px;">Prazo máximo sem atualização: <strong>${escapeHtml(staleDateLabel)}</strong></div>
    `,
  });

  const html = renderEmailShell({
    preheader: isExpiry
      ? "Seu perfil foi retirado da descoberta pública por falta de atualização."
      : `Seu perfil está há ${stageDays} dias sem atualização.`,
    eyebrow: isExpiry ? "perfil expirado" : "atualização do perfil",
    title,
    intro,
    bodyHtml: stagePanel + timelinePanel,
    primaryCta: {
      href: dashboardUrl,
      label: "Abrir dashboard",
    },
    secondaryCta: publicSlug
      ? {
          href: profileUrl,
          label: "Abrir perfil público",
          tone: "secondary",
        }
      : undefined,
    footnote:
      "A recência do perfil ajuda a manter a descoberta pública útil para profissionais e recrutadores, sem transformar dados privados em vitrine.",
  });

  return {
    to,
    subject,
    text,
    html,
  };
}

export function buildModerationReportReceiptEmail({
  to,
  reporterName,
  reportId,
  targetKind,
  category,
  appBaseUrl,
}) {
  const dashboardUrl = buildAppUrl(appBaseUrl, "/dashboard");
  const greeting = reporterName ? `Olá, ${reporterName}!` : "Olá!";
  const subject = "Recebemos sua denúncia - OpenTalentPool";
  const intro = "Recebemos sua denúncia e vamos revisar o caso o mais rápido possível.";
  const targetKindLabel = formatModerationTargetKind(targetKind);
  const categoryLabel = formatModerationCategory(category);
  const protocolLabel = reportId ? `#${reportId}` : "em análise";
  const text = [
    subject,
    "",
    greeting,
    "",
    intro,
    `Canal analisado: ${targetKindLabel}`,
    `Motivo informado: ${categoryLabel}`,
    `Protocolo interno: ${protocolLabel}`,
    "",
    `Acompanhar sua conta: ${dashboardUrl}`,
    `Canal complementar: ${LEGAL_CONTACT_EMAIL}`,
  ].join("\n");

  const html = renderEmailShell({
    preheader: "Sua denúncia foi registrada e entrou em revisão administrativa.",
    eyebrow: "confirmação de denúncia",
    title: "Denúncia recebida",
    intro: `${greeting} ${intro}`,
    bodyHtml:
      renderPanel({
        eyebrow: "Resumo do envio",
        title: targetKindLabel,
        background: EMAIL_COLORS.surfaceAccent,
        borderColor: "#d6e7ff",
        bodyHtml: `
          <div>Motivo informado: <strong>${escapeHtml(categoryLabel)}</strong></div>
          <div style="margin-top:8px;">Protocolo interno: <strong>${escapeHtml(protocolLabel)}</strong></div>
        `,
      }) +
      renderPanel({
        eyebrow: "Próximo passo",
        title: "Revisão humana",
        bodyHtml: `
          <div>Nossa equipe vai avaliar o caso antes de qualquer decisão administrativa.</div>
          <div style="margin-top:8px;">Se for necessário complementar o contexto por um canal formal, use ${escapeHtml(LEGAL_CONTACT_EMAIL)}.</div>
        `,
      }),
    primaryCta: {
      href: dashboardUrl,
      label: "Abrir dashboard",
    },
    footnote: "O OpenTalentPool registra denúncias autenticadas com revisão administrativa e trilha mínima de auditoria.",
  });

  return {
    to,
    subject,
    text,
    html,
  };
}

export function buildModerationDecisionEmail({
  to,
  targetName,
  targetKind,
  category = null,
  actionType,
  strikeCount = null,
  isImmediatePermanentBan = false,
  appBaseUrl,
}) {
  const dashboardUrl = buildAppUrl(appBaseUrl, "/dashboard");
  const decisionLabel = formatModerationAction(actionType);
  const targetKindLabel = formatModerationTargetKind(targetKind);
  const categoryLabel = category ? formatModerationCategory(category) : null;
  const safeTargetName = targetName || "sua conta";
  const greeting = `Olá, ${safeTargetName}!`;

  let subject = "Atualização de moderação - OpenTalentPool";
  let title = "Atualização sobre sua conta";
  let intro = "Após revisão administrativa, aplicamos uma medida de moderação na sua conta.";
  let primaryCta = null;
  let secondaryCta = {
    href: `mailto:${LEGAL_CONTACT_EMAIL}`,
    label: "Falar com o time",
    tone: "secondary",
  };
  let nextStepsTitle = "Próximo passo";
  let nextStepsBody = `Se precisar registrar esclarecimentos formais, escreva para ${LEGAL_CONTACT_EMAIL}.`;
  let footnote = "As decisões de moderação preservam trilha mínima de auditoria e seguem revisão humana.";

  if (actionType === "hide_professional_profile") {
    subject = "Seu perfil público foi retirado da vitrine - OpenTalentPool";
    title = "Seu perfil público foi ocultado";
    intro = "Após revisão administrativa, seu perfil saiu temporariamente da vitrine pública.";
    primaryCta = {
      href: dashboardUrl,
      label: "Revisar perfil no dashboard",
    };
    nextStepsTitle = "Correção e revisão";
    nextStepsBody = `
      <div>Revise o conteúdo do perfil, faça as correções necessárias e salve as alterações no dashboard.</div>
      <div style="margin-top:8px;">Se quiser pedir revisão administrativa depois da correção, use ${escapeHtml(LEGAL_CONTACT_EMAIL)}.</div>
    `;
    footnote = "O perfil só volta para a vitrine pública após revisão administrativa e nova liberação.";
  }

  if (actionType === "suspend_target_account") {
    subject = "Sua conta foi suspensa - OpenTalentPool";
    title = "Sua conta está suspensa";
    intro = "Após revisão administrativa, o acesso à plataforma foi suspenso.";
    nextStepsTitle = "Canal de revisão";
    nextStepsBody = `
      <div>Se você precisar registrar sua manifestação formal sobre esta suspensão, escreva para ${escapeHtml(LEGAL_CONTACT_EMAIL)}.</div>
      <div style="margin-top:8px;">Enquanto a suspensão estiver ativa, o acesso à conta permanece bloqueado.</div>
    `;
    footnote = "Suspensões administrativas revogam sessões ativas e interrompem o uso da plataforma até nova decisão.";
  }

  if (actionType === "permanent_ban_target_account") {
    subject = "Sua conta foi banida permanentemente - OpenTalentPool";
    title = isImmediatePermanentBan ? "Banimento definitivo imediato" : "Banimento definitivo";
    intro = isImmediatePermanentBan
      ? "Após revisão administrativa, identificamos violação grave no perfil público e o acesso foi encerrado em definitivo."
      : "Após revisão administrativa, sua conta foi encerrada em definitivo.";
    secondaryCta = {
      href: `mailto:${LEGAL_CONTACT_EMAIL}`,
      label: "Contato legal",
      tone: "secondary",
    };
    nextStepsTitle = "Exclusão de dados operacionais";
    nextStepsBody = `
      <div>Seus dados operacionais da plataforma estão sendo removidos do banco de dados neste fluxo de sanção.</div>
      <div style="margin-top:8px;">Mantemos apenas o mínimo pseudonimizado necessário para auditoria, segurança e defesa em eventual obrigação legal.</div>
      <div style="margin-top:8px;">${isImmediatePermanentBan
        ? `Para temas legais ou tratamento dos dados remanescentes, use ${escapeHtml(LEGAL_CONTACT_EMAIL)}.`
        : `Se precisar tratar aspectos legais desta decisão, use ${escapeHtml(LEGAL_CONTACT_EMAIL)}.`}</div>
    `;
    footnote = isImmediatePermanentBan
      ? "Conteúdo discriminatório grave em perfil público pode levar a banimento definitivo imediato."
      : "Banimentos definitivos removem o acesso operacional e preservam apenas retenção pseudonimizada estritamente necessária.";
  }

  const strikeLine =
    typeof strikeCount === "number" && actionType !== "permanent_ban_target_account"
      ? `<div style="margin-top:8px;">Histórico punitivo anterior considerado nesta revisão: <strong>${escapeHtml(String(strikeCount))}</strong></div>`
      : "";
  const categoryLine = categoryLabel
    ? `<div style="margin-top:8px;">Motivo analisado: <strong>${escapeHtml(categoryLabel)}</strong></div>`
    : "";
  const text = [
    subject,
    "",
    greeting,
    "",
    intro,
    `Decisão aplicada: ${decisionLabel}`,
    `Canal analisado: ${targetKindLabel}`,
    categoryLabel ? `Motivo analisado: ${categoryLabel}` : null,
    typeof strikeCount === "number" && actionType !== "permanent_ban_target_account"
      ? `Histórico punitivo anterior considerado: ${strikeCount}`
      : null,
    "",
    actionType === "hide_professional_profile"
      ? "Revise o perfil no dashboard, corrija o conteúdo e peça revisão administrativa pelo canal oficial."
      : actionType === "suspend_target_account"
        ? `Se precisar registrar manifestação formal sobre a suspensão, use ${LEGAL_CONTACT_EMAIL}.`
        : "Seus dados operacionais estão sendo removidos do banco de dados. O canal legal permanece disponível para temas formais.",
    primaryCta ? `Abrir dashboard: ${dashboardUrl}` : null,
    `Contato oficial: ${LEGAL_CONTACT_EMAIL}`,
  ].filter(Boolean).join("\n");

  const html = renderEmailShell({
    preheader: subject,
    eyebrow: "decisão de moderação",
    title,
    intro: `${greeting} ${intro}`,
    bodyHtml:
      renderPanel({
        eyebrow: "Decisão aplicada",
        title: decisionLabel,
        background: actionType === "permanent_ban_target_account" ? "#fff3f1" : EMAIL_COLORS.surfaceAccent,
        borderColor: actionType === "permanent_ban_target_account" ? "#f2d1cb" : "#d6e7ff",
        bodyHtml: `
          <div>Canal analisado: <strong>${escapeHtml(targetKindLabel)}</strong></div>
          ${categoryLine}
          ${strikeLine}
        `,
      }) +
      renderPanel({
        eyebrow: "Orientação",
        title: nextStepsTitle,
        bodyHtml: nextStepsBody,
      }),
    primaryCta,
    secondaryCta,
    footnote,
  });

  return {
    to,
    subject,
    text,
    html,
  };
}
