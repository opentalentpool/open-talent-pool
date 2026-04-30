import { ensureDevelopmentDatabase, isLocalDatabaseHost } from "./dev-db.js";
import { createPublicSlug, getProfilePublicationIssues } from "./profiles.js";
import { createPool, ensureSchema, getRuntimeConfig, loadEnvironment } from "./runtime.js";
import {
  AFFIRMATIVE_POLICY_VERSION,
  createEmptyAffirmativeProfile,
} from "../src/lib/affirmative-config.js";
import { SIGNUP_REQUIRED_POLICIES } from "../src/lib/legal-policies.js";

export const LOCAL_FIXTURE_PROFESSIONAL_COUNT = 50;
export const LOCAL_FIXTURE_RECRUITER_COUNT = 10;
export const DEFAULT_LOCAL_FIXTURE_EMAIL_DOMAIN = "local.opentalentpool.test";
export const LOCAL_FIXTURE_ACCEPTANCE_SOURCE = "local-fixture";
const LOCAL_FIXTURE_PLUS_ALIAS_PREFIX = "otp";

const LOCATION_OPTIONS = [
  { city: "Sao Paulo", state: "SP" },
  { city: "Rio de Janeiro", state: "RJ" },
  { city: "Belo Horizonte", state: "MG" },
  { city: "Curitiba", state: "PR" },
  { city: "Recife", state: "PE" },
  { city: "Fortaleza", state: "CE" },
  { city: "Salvador", state: "BA" },
  { city: "Porto Alegre", state: "RS" },
  { city: "Florianopolis", state: "SC" },
  { city: "Goiania", state: "GO" },
];

export const LOCAL_FIXTURE_WOMEN_FIRST_NAMES = [
  "Aline",
  "Camila",
  "Eduarda",
  "Gabriela",
  "Isabela",
  "Karina",
  "Marina",
  "Olivia",
  "Quezia",
  "Sabrina",
  "Ursula",
  "Yasmin",
  "Zuleica",
  "Bianca",
  "Larissa",
  "Patricia",
];

export const LOCAL_FIXTURE_NON_WOMEN_FIRST_NAMES = [
  "Bruno",
  "Diego",
  "Felipe",
  "Henrique",
  "Joao",
  "Lucas",
  "Nicolas",
  "Paulo",
  "Rafael",
  "Thiago",
  "Vinicius",
  "Wesley",
  "Caio",
  "Murilo",
  "Andre",
];

const PROFESSIONAL_LAST_NAMES = [
  "Almeida",
  "Barbosa",
  "Cardoso",
  "Duarte",
  "Esteves",
  "Ferreira",
  "Gomes",
  "Henriques",
  "Ibrahim",
  "Junqueira",
];

const RECRUITER_NAMES = [
  "Ana People",
  "Bruna Talent",
  "Caio Hiring",
  "Daniela Recruiting",
  "Enzo Acquisition",
  "Fernanda TalentOps",
  "Guilherme PeopleOps",
  "Helena Hiring",
  "Igor Recruiting",
  "Juliana Talent",
];

const RECRUITER_COMPANIES = [
  "Norte Digital",
  "Plataforma Aurora",
  "Conecta Cloud",
  "Base Produto",
  "Orbitas Tech",
  "Cais Dados",
  "Vila Engenharia",
  "Atlas Labs",
  "Rumo Sistemas",
  "Lume Software",
];

const AFFIRMATIVE_PROFILE_PATTERNS = [
  [],
  ["women"],
  ["black_people"],
  ["indigenous_people"],
  ["lgbtqiapn_people"],
  ["pcd"],
  ["women", "black_people"],
  ["women", "indigenous_people"],
  ["lgbtqiapn_people", "pcd"],
  ["black_people", "pcd"],
];

const PROFESSIONAL_ARCHETYPES = [
  {
    area: "frontend",
    headline: "Frontend Engineer",
    focus: "interfaces acessiveis, design system e performance web",
    skills: ["React", "TypeScript", "Tailwind CSS", "Vite", "Testing Library"],
    currentRole: "Frontend Engineer",
    previousRole: "Desenvolvedor Frontend",
    companies: ["Studio Pixel", "Fluxo Web", "Craft Interface"],
  },
  {
    area: "backend",
    headline: "Backend Engineer",
    focus: "APIs resilientes, integracoes e observabilidade",
    skills: ["Node.js", "TypeScript", "PostgreSQL", "Redis", "OpenAPI"],
    currentRole: "Backend Engineer",
    previousRole: "Desenvolvedor Backend",
    companies: ["Core API", "Rota Dados", "Pulse Services"],
  },
  {
    area: "fullstack",
    headline: "Full Stack Engineer",
    focus: "produto ponta a ponta com React, Node.js e SQL",
    skills: ["React", "Node.js", "PostgreSQL", "TypeScript", "Docker"],
    currentRole: "Full Stack Engineer",
    previousRole: "Desenvolvedor Full Stack",
    companies: ["Cubo Produto", "Atalho Tech", "Stack Livre"],
  },
  {
    area: "data",
    headline: "Data Engineer",
    focus: "pipelines, modelagem analitica e confiabilidade de dados",
    skills: ["Python", "SQL", "dbt", "Airflow", "BigQuery"],
    currentRole: "Data Engineer",
    previousRole: "Analista de Dados",
    companies: ["Lakehouse Sul", "Trilha Dados", "Sigma Metrics"],
  },
  {
    area: "mobile",
    headline: "Mobile Engineer",
    focus: "aplicativos mobile com boa experiencia, telemetria e releases seguras",
    skills: ["React Native", "TypeScript", "Expo", "Firebase", "Jest"],
    currentRole: "Mobile Engineer",
    previousRole: "Desenvolvedor Mobile",
    companies: ["Pocket App", "Movel Labs", "Track Mobile"],
  },
  {
    area: "devops",
    headline: "Platform Engineer",
    focus: "plataforma cloud, CI/CD, conteinerizacao e automacao",
    skills: ["Docker", "Kubernetes", "Terraform", "GitHub Actions", "Linux"],
    currentRole: "Platform Engineer",
    previousRole: "DevOps Engineer",
    companies: ["Infra Norte", "Cloud Vento", "Operacao Azul"],
  },
  {
    area: "qa",
    headline: "QA Engineer",
    focus: "qualidade de produto com automacao, contratos e regressao critica",
    skills: ["Playwright", "Cypress", "Vitest", "API Testing", "Quality Strategy"],
    currentRole: "QA Engineer",
    previousRole: "Analista de QA",
    companies: ["Teste Real", "Foco Qualidade", "Orbita QA"],
  },
  {
    area: "security",
    headline: "Application Security Engineer",
    focus: "seguranca de aplicacao, revisao de ameacas e hardening",
    skills: ["AppSec", "OWASP", "Threat Modeling", "SAST", "Security Review"],
    currentRole: "Application Security Engineer",
    previousRole: "Security Analyst",
    companies: ["Shield Code", "Camada Segura", "Guard Rails"],
  },
  {
    area: "product",
    headline: "Product Engineer",
    focus: "iteracao rapida de produto com metricas, UX e autonomia tecnica",
    skills: ["Product Discovery", "React", "Node.js", "SQL", "Analytics"],
    currentRole: "Product Engineer",
    previousRole: "Software Engineer",
    companies: ["Nucleo Produto", "Radar SaaS", "Sprint House"],
  },
  {
    area: "infra",
    headline: "Site Reliability Engineer",
    focus: "confiabilidade, operacao e resposta a incidentes em sistemas criticos",
    skills: ["SRE", "Prometheus", "Grafana", "Kubernetes", "Incident Response"],
    currentRole: "Site Reliability Engineer",
    previousRole: "Infrastructure Engineer",
    companies: ["Operacao Viva", "Base Cloud", "Pulso Infra"],
  },
];

const SEARCH_NAME_BY_AREA = {
  frontend: "Busca React e frontend",
  backend: "Busca backend e APIs",
  fullstack: "Busca full stack",
  data: "Busca dados e analytics",
  mobile: "Busca mobile",
  devops: "Busca plataforma e DevOps",
  qa: "Busca qualidade e testes",
  security: "Busca AppSec",
  product: "Busca product engineering",
  infra: "Busca SRE e infraestrutura",
};

function padIndex(index) {
  return String(index).padStart(3, "0");
}

function normalizeEmailDomain(value) {
  return String(value || "").trim().toLowerCase().replace(/^@+/, "");
}

function normalizeMailboxEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function getMailboxParts(mailboxEmail) {
  const normalized = normalizeMailboxEmail(mailboxEmail);
  const atIndex = normalized.lastIndexOf("@");

  if (atIndex <= 0 || atIndex === normalized.length - 1) {
    throw new Error("LOCAL_FIXTURE_MAILBOX precisa ser um e-mail valido, por exemplo contato@exemplo.com.");
  }

  return {
    localPart: normalized.slice(0, atIndex),
    domain: normalized.slice(atIndex + 1),
  };
}

function getFixtureRoleLabel(role) {
  if (role === "professional") return "profissional";
  if (role === "recruiter") return "recrutador";
  throw new Error(`Role de fixture nao suportada: ${role}`);
}

export function buildLocalFixtureEmail({
  role,
  index,
  mailboxEmail = "",
  emailDomain = DEFAULT_LOCAL_FIXTURE_EMAIL_DOMAIN,
}) {
  const roleLabel = getFixtureRoleLabel(role);
  const padded = padIndex(index);
  const normalizedMailbox = normalizeMailboxEmail(mailboxEmail);

  if (normalizedMailbox) {
    const { localPart, domain } = getMailboxParts(normalizedMailbox);
    return `${localPart}+${LOCAL_FIXTURE_PLUS_ALIAS_PREFIX}-${roleLabel}-${padded}@${domain}`;
  }

  const normalizedDomain = normalizeEmailDomain(emailDomain) || DEFAULT_LOCAL_FIXTURE_EMAIL_DOMAIN;
  return `fixture-${roleLabel}-${padded}@${normalizedDomain}`;
}

function buildProfessionalName(index, affirmativeGroups = []) {
  // Demo fixtures keep women-tagged profiles visually aligned with their synthetic autodeclaration.
  // This is only for local test data; product behavior never infers groups from names.
  const firstNamePool = affirmativeGroups.includes("women")
    ? LOCAL_FIXTURE_WOMEN_FIRST_NAMES
    : LOCAL_FIXTURE_NON_WOMEN_FIRST_NAMES;
  const firstName = firstNamePool[index % firstNamePool.length];
  const lastName = PROFESSIONAL_LAST_NAMES[Math.floor(index / firstNamePool.length) % PROFESSIONAL_LAST_NAMES.length];
  return `${firstName} ${lastName}`;
}

function buildRecruiterName(index) {
  return `${RECRUITER_NAMES[index]} | ${RECRUITER_COMPANIES[index]}`;
}

function buildExperienceId(roleLabel, index, stage) {
  return `${roleLabel}-${padIndex(index)}-${stage}`;
}

function buildAffirmativeFixtureProfile(index) {
  const groups = AFFIRMATIVE_PROFILE_PATTERNS[index % AFFIRMATIVE_PROFILE_PATTERNS.length];

  if (!groups.length) {
    return createEmptyAffirmativeProfile();
  }

  return {
    groups,
    policyVersion: AFFIRMATIVE_POLICY_VERSION,
    consentAcceptedAt: new Date(Date.UTC(2026, 3, 1 + (index % 20), 12, 0, 0)).toISOString(),
  };
}

function buildProfessionalProfile({ index, email }) {
  const archetype = PROFESSIONAL_ARCHETYPES[index % PROFESSIONAL_ARCHETYPES.length];
  const location = LOCATION_OPTIONS[index % LOCATION_OPTIONS.length];
  const seniority = ["junior", "pleno", "senior"][index % 3];
  const workModel = ["remoto", "hibrido", "presencial"][index % 3];
  const workModels = ["remoto", "hibrido", "presencial"].filter((item, itemIndex) => {
    if (item === workModel) {
      return true;
    }

    return (index + itemIndex) % 5 === 0;
  });
  const openToOpportunities = index % 5 !== 0;
  const affirmativeProfile = buildAffirmativeFixtureProfile(index);
  const name = buildProfessionalName(index, affirmativeProfile.groups);
  const companyCurrent = archetype.companies[index % archetype.companies.length];
  const companyPrevious = archetype.companies[(index + 1) % archetype.companies.length];
  const currentStartYear = 2021 + (index % 4);
  const previousStartYear = currentStartYear - 2;
  const bio = `${name} atua em ${archetype.focus}. Tem experiencia em ${archetype.skills.slice(0, 3).join(", ")} e prefere ambientes com clareza tecnica, backlog priorizado e colaboracao proxima com produto.`;

  return {
    name,
    city: location.city,
    state: location.state,
    bio,
    headline: `${archetype.headline} | ${archetype.skills[0]} e ${archetype.skills[1]}`,
    linkedin: `https://linkedin.com/in/fixture-profissional-${padIndex(index + 1)}`,
    github: `https://github.com/fixture-profissional-${padIndex(index + 1)}`,
    portfolio: `https://portfolio.opentalentpool.test/profissional-${padIndex(index + 1)}`,
    skills: archetype.skills,
    experiences: [
      {
        id: buildExperienceId("profissional", index + 1, "atual"),
        role_title: archetype.currentRole,
        company_name: companyCurrent,
        start_date: `${currentStartYear}-01-01`,
        end_date: "",
        is_current: true,
        seniority,
        description: `Responsavel por ${archetype.focus} com stack ${archetype.skills.slice(0, 3).join(", ")}.`,
        positions: [
          {
            id: buildExperienceId("profissional", index + 1, "promocao"),
            role_title: archetype.previousRole,
            seniority: seniority === "senior" ? "pleno" : "junior",
            start_date: `${currentStartYear}-01-01`,
            end_date: `${currentStartYear + 1}-12-31`,
            is_current: false,
            description: `Primeiro ciclo na empresa com foco em ${archetype.area}.`,
          },
          {
            id: buildExperienceId("profissional", index + 1, "atual-cargo"),
            role_title: archetype.currentRole,
            seniority,
            start_date: `${currentStartYear + 2}-01-01`,
            end_date: "",
            is_current: true,
            description: `Promocao para liderar ${archetype.focus}.`,
          },
        ],
      },
      {
        id: buildExperienceId("profissional", index + 1, "anterior"),
        role_title: archetype.previousRole,
        company_name: companyPrevious,
        start_date: `${previousStartYear}-01-01`,
        end_date: `${currentStartYear - 1}-12-31`,
        is_current: false,
        seniority: seniority === "senior" ? "pleno" : "junior",
        description: `Atuacao anterior em ${archetype.area} com foco em entrega continua e sustentacao de produto.`,
        positions: [
          {
            id: buildExperienceId("profissional", index + 1, "anterior-cargo"),
            role_title: archetype.previousRole,
            seniority: seniority === "senior" ? "pleno" : "junior",
            start_date: `${previousStartYear}-01-01`,
            end_date: `${currentStartYear - 1}-12-31`,
            is_current: false,
            description: `Atuacao anterior em ${archetype.area} com foco em entrega continua e sustentacao de produto.`,
          },
        ],
      },
    ],
    educations: [
      {
        id: `education-${padIndex(index + 1)}`,
        institution: "Universidade Livre de Tecnologia",
        degree: "Bacharelado",
        field: archetype.area,
        start_date: "2012-01-01",
        end_date: "2016-12-01",
        description: "Formacao tecnica de base para atuacao em produto e engenharia.",
      },
    ],
    certifications: [
      {
        id: `certification-${padIndex(index + 1)}`,
        name: `${archetype.skills[0]} Professional`,
        issuer: "Open Tech Institute",
        issued_at: "2025-01-01",
        credential_url: "",
        description: `Certificacao aplicada em ${archetype.skills[0]}.`,
      },
    ],
    languages: [
      {
        id: `language-${padIndex(index + 1)}`,
        name: index % 2 === 0 ? "Inglês" : "Espanhol",
        proficiency: index % 2 === 0 ? "Avançado" : "Intermediário",
      },
    ],
    projects: [
      {
        id: `project-${padIndex(index + 1)}`,
        name: `Plataforma ${archetype.area}`,
        role: archetype.currentRole,
        url: "",
        start_date: `${currentStartYear}-03-01`,
        end_date: "",
        description: `Projeto de referencia em ${archetype.focus}.`,
        skills: archetype.skills.slice(0, 3),
      },
    ],
    publications: [
      {
        id: `publication-${padIndex(index + 1)}`,
        title: `Notas tecnicas sobre ${archetype.area}`,
        publisher: "OpenTalentPool Labs",
        url: "",
        published_at: "2025-06-01",
        description: "Texto publico de demonstracao para fixtures locais.",
      },
    ],
    volunteerExperiences: [],
    awards: [
      {
        id: `award-${padIndex(index + 1)}`,
        title: "Reconhecimento de impacto técnico",
        issuer: companyCurrent,
        awarded_at: "2024-11-01",
        description: "Registro sintético para demonstrar conquistas profissionais.",
      },
    ],
    courses: [
      {
        id: `course-${padIndex(index + 1)}`,
        name: `Praticas avancadas em ${archetype.skills[0]}`,
        institution: "Open Academy",
        completed_at: "2024-04-01",
        description: "Curso complementar usado em fixtures locais.",
      },
    ],
    organizations: [],
    seniority,
    workModels,
    openToOpportunities,
    isPublished: true,
    affirmativeProfile,
    fixtureMeta: {
      email,
      area: archetype.area,
    },
  };
}

function buildRecruiterSearch(index) {
  const archetype = PROFESSIONAL_ARCHETYPES[index % PROFESSIONAL_ARCHETYPES.length];
  const location = LOCATION_OPTIONS[index % LOCATION_OPTIONS.length];
  const workModel = ["remoto", "hibrido", "presencial"][index % 3];
  const seniority = ["", "junior", "pleno", "senior"][index % 4];
  const alertFrequency = ["daily", "weekly", "biweekly", "monthly"][index % 4];

  return {
    name: `${SEARCH_NAME_BY_AREA[archetype.area]} ${index + 1}`,
    criteria: {
      q: archetype.skills[0],
      seniority,
      workModel,
      state: location.state,
      openToOpportunities: index % 2 === 0,
      language: index % 2 === 0 ? "Inglês" : "",
      certification: index % 3 === 0 ? archetype.skills[0] : "",
      education: index % 4 === 0 ? archetype.area : "",
    },
    alertFrequency,
  };
}

export function buildLocalFixtureDataset({
  professionalCount = LOCAL_FIXTURE_PROFESSIONAL_COUNT,
  recruiterCount = LOCAL_FIXTURE_RECRUITER_COUNT,
  emailDomain = DEFAULT_LOCAL_FIXTURE_EMAIL_DOMAIN,
  mailboxEmail = "",
} = {}) {
  const professionals = Array.from({ length: professionalCount }, (_, zeroBasedIndex) => {
    const index = zeroBasedIndex + 1;
    const email = buildLocalFixtureEmail({
      role: "professional",
      index,
      emailDomain,
      mailboxEmail,
    });
    const profile = buildProfessionalProfile({ index: zeroBasedIndex, email });

    return {
      email,
      name: profile.name,
      role: "professional",
      isVerified: true,
      profile,
    };
  });

  const recruiters = Array.from({ length: recruiterCount }, (_, zeroBasedIndex) => {
    const index = zeroBasedIndex + 1;
    const email = buildLocalFixtureEmail({
      role: "recruiter",
      index,
      emailDomain,
      mailboxEmail,
    });

    return {
      email,
      name: buildRecruiterName(zeroBasedIndex),
      role: "recruiter",
      isVerified: true,
      search: buildRecruiterSearch(zeroBasedIndex),
    };
  });

  return {
    professionals,
    recruiters,
  };
}

function assertPublishableFixtures(professionals) {
  for (const professional of professionals) {
    const issues = getProfilePublicationIssues({
      role: professional.role,
      isVerified: professional.isVerified,
      profile: professional.profile,
    });

    if (issues.length > 0) {
      throw new Error(`Fixture profissional invalido para ${professional.email}: ${issues.join(" | ")}`);
    }
  }
}

async function upsertUser(client, user, now) {
  const result = await client.query(
    `
      INSERT INTO users (name, email, role, is_verified, created_at)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (email) DO UPDATE
      SET name = EXCLUDED.name,
          role = EXCLUDED.role,
          is_verified = EXCLUDED.is_verified
      RETURNING id, email, role
    `,
    [user.name, user.email, user.role, true, now],
  );

  return result.rows[0];
}

async function ensureUserRole(client, userId, role, now) {
  await client.query(
    `
      INSERT INTO user_roles (user_id, role, created_at)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, role) DO NOTHING
    `,
    [userId, role, now],
  );
}

async function recordFixturePolicyAcceptances(client, userId, now) {
  for (const policy of SIGNUP_REQUIRED_POLICIES) {
    await client.query(
      `
        INSERT INTO user_policy_acceptances (
          user_id,
          policy_key,
          policy_version,
          policy_hash,
          acceptance_source,
          accepted_at,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $6)
        ON CONFLICT (user_id, policy_key, policy_version) DO NOTHING
      `,
      [userId, policy.key, policy.version, policy.hash, LOCAL_FIXTURE_ACCEPTANCE_SOURCE, now],
    );
  }
}

async function upsertProfessionalProfile(client, userId, profile, now) {
  const publicSlug = createPublicSlug(profile.name || profile.headline || "profissional", userId);
  const publishedAt = new Date(now.getTime() - userId * 60_000);

  await client.query(
    `
      INSERT INTO user_profiles (
        user_id,
        profile_data,
        is_published,
        public_slug,
        published_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, true, $3, $4, $5, $5)
      ON CONFLICT (user_id) DO UPDATE
      SET profile_data = EXCLUDED.profile_data,
          is_published = EXCLUDED.is_published,
          public_slug = EXCLUDED.public_slug,
          published_at = EXCLUDED.published_at,
          updated_at = EXCLUDED.updated_at
    `,
    [userId, profile, publicSlug, publishedAt, now],
  );
}

function buildFixtureFavoritePairs(recruiters, professionals) {
  const pairs = [];

  recruiters.forEach((recruiter, recruiterIndex) => {
    const baseIndex = recruiterIndex * 3;

    for (let offset = 0; offset < 3; offset += 1) {
      const professional = professionals[(baseIndex + offset) % professionals.length];
      pairs.push({
        recruiterEmail: recruiter.email,
        professionalEmail: professional.email,
      });
    }
  });

  return pairs;
}

export async function seedLocalFixtures({
  pool,
  now = new Date(),
  emailDomain = process.env.LOCAL_FIXTURE_EMAIL_DOMAIN || DEFAULT_LOCAL_FIXTURE_EMAIL_DOMAIN,
  mailboxEmail = process.env.LOCAL_FIXTURE_MAILBOX || "",
} = {}) {
  if (!pool) {
    throw new Error("seedLocalFixtures exige uma instancia de pool.");
  }

  const dataset = buildLocalFixtureDataset({
    emailDomain,
    mailboxEmail,
  });

  assertPublishableFixtures(dataset.professionals);

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const professionalMap = new Map();
    const recruiterMap = new Map();

    for (const professional of dataset.professionals) {
      const storedUser = await upsertUser(client, professional, now);
      professionalMap.set(professional.email, storedUser.id);
      await ensureUserRole(client, storedUser.id, professional.role, now);
      await recordFixturePolicyAcceptances(client, storedUser.id, now);
      await upsertProfessionalProfile(client, storedUser.id, professional.profile, now);
    }

    for (const recruiter of dataset.recruiters) {
      const storedUser = await upsertUser(client, recruiter, now);
      recruiterMap.set(recruiter.email, storedUser.id);
      await ensureUserRole(client, storedUser.id, recruiter.role, now);
      await recordFixturePolicyAcceptances(client, storedUser.id, now);
    }

    const recruiterIds = [...recruiterMap.values()];

    for (const recruiterId of recruiterIds) {
      await client.query("DELETE FROM recruiter_favorites WHERE recruiter_user_id = $1", [recruiterId]);
      await client.query("DELETE FROM saved_searches WHERE recruiter_user_id = $1", [recruiterId]);
    }

    const favoritePairs = buildFixtureFavoritePairs(dataset.recruiters, dataset.professionals);

    for (const pair of favoritePairs) {
      await client.query(
        `
          INSERT INTO recruiter_favorites (recruiter_user_id, professional_user_id, created_at)
          VALUES ($1, $2, $3)
          ON CONFLICT (recruiter_user_id, professional_user_id) DO NOTHING
        `,
        [recruiterMap.get(pair.recruiterEmail), professionalMap.get(pair.professionalEmail), now],
      );
    }

    for (const recruiter of dataset.recruiters) {
      const recruiterId = recruiterMap.get(recruiter.email);
      await client.query(
        `
          INSERT INTO saved_searches (
            recruiter_user_id,
            name,
            criteria_json,
            alerts_enabled,
            alert_frequency,
            last_alert_sent_at,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, true, $4, NULL, $5, $5)
        `,
        [recruiterId, recruiter.search.name, recruiter.search.criteria, recruiter.search.alertFrequency, now],
      );
    }

    await client.query("COMMIT");

    return {
      professionals: dataset.professionals.length,
      recruiters: dataset.recruiters.length,
      favorites: favoritePairs.length,
      savedSearches: dataset.recruiters.length,
      mailboxEmail: normalizeMailboxEmail(mailboxEmail) || null,
      emailDomain: normalizeMailboxEmail(mailboxEmail) ? null : normalizeEmailDomain(emailDomain),
      sampleProfessionalEmails: dataset.professionals.slice(0, 3).map((item) => item.email),
      sampleRecruiterEmails: dataset.recruiters.slice(0, 3).map((item) => item.email),
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function getFixtureDeletionFilters({ emailDomain, mailboxEmail }) {
  const exactEmails = [
    ...buildLocalFixtureDataset({ emailDomain, mailboxEmail }).professionals.map((item) => item.email),
    ...buildLocalFixtureDataset({ emailDomain, mailboxEmail }).recruiters.map((item) => item.email),
  ];

  return {
    exactEmails,
    likePatterns: [
      "fixture-profissional-%@%",
      "fixture-recrutador-%@%",
      `%+${LOCAL_FIXTURE_PLUS_ALIAS_PREFIX}-profissional-%@%`,
      `%+${LOCAL_FIXTURE_PLUS_ALIAS_PREFIX}-recrutador-%@%`,
    ],
  };
}

export async function removeLocalFixtures({
  pool,
  emailDomain = process.env.LOCAL_FIXTURE_EMAIL_DOMAIN || DEFAULT_LOCAL_FIXTURE_EMAIL_DOMAIN,
  mailboxEmail = process.env.LOCAL_FIXTURE_MAILBOX || "",
} = {}) {
  if (!pool) {
    throw new Error("removeLocalFixtures exige uma instancia de pool.");
  }

  const { exactEmails, likePatterns } = getFixtureDeletionFilters({ emailDomain, mailboxEmail });
  const clauses = ["email = ANY($1::text[])"];
  const params = [exactEmails];

  likePatterns.forEach((pattern, index) => {
    clauses.push(`email LIKE $${index + 2}`);
    params.push(pattern);
  });

  const deleted = await pool.query(
    `
      DELETE FROM users
      WHERE ${clauses.join(" OR ")}
      RETURNING id
    `,
    params,
  );

  return {
    removedUsers: deleted.rowCount || 0,
  };
}

export function assertLocalFixtureRuntime(config) {
  if (config.isProduction) {
    throw new Error("fill/unfill local recusado: NODE_ENV=production nao pode receber fixtures locais.");
  }

  if (!isLocalDatabaseHost(config.postgresHost)) {
    throw new Error(
      `fill/unfill local recusado: POSTGRES_HOST=${config.postgresHost} nao aponta para banco local. Use localhost/127.0.0.1/::1.`,
    );
  }
}

function formatSummary(summary) {
  return [
    `Profissionais: ${summary.professionals}`,
    `Recrutadores: ${summary.recruiters}`,
    `Favoritos: ${summary.favorites}`,
    `Buscas salvas: ${summary.savedSearches}`,
    summary.mailboxEmail
      ? `Mailbox unica: ${summary.mailboxEmail}`
      : `Dominio padrao: ${summary.emailDomain}`,
    `Exemplos profissionais: ${summary.sampleProfessionalEmails.join(", ")}`,
    `Exemplos recrutadores: ${summary.sampleRecruiterEmails.join(", ")}`,
  ].join("\n");
}

export async function runLocalFixturesCommand(command, { logger = console } = {}) {
  loadEnvironment();
  const config = getRuntimeConfig();

  assertLocalFixtureRuntime(config);
  await ensureDevelopmentDatabase({ logger });

  const pool = await createPool(config);

  try {
    await ensureSchema(pool);

    if (command === "fill") {
      const summary = await seedLocalFixtures({ pool });
      logger.log("Fixtures locais aplicadas com sucesso.");
      logger.log(formatSummary(summary));
      logger.log(
        "Se quiser receber os codigos de login em uma inbox real, rode novamente com LOCAL_FIXTURE_MAILBOX=seuemail@provedor.",
      );
      return;
    }

    if (command === "unfill") {
      const summary = await removeLocalFixtures({ pool });
      logger.log(`Fixtures locais removidas com sucesso. Usuarios removidos: ${summary.removedUsers}.`);
      return;
    }

    throw new Error(`Comando desconhecido: ${command}`);
  } finally {
    await pool.end().catch(() => undefined);
  }
}
