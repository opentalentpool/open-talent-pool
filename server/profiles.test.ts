import fs from "fs";
import path from "path";
import { newDb } from "pg-mem";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { AFFIRMATIVE_POLICY_VERSION } from "../src/lib/affirmative-config.js";
import { normalizeProfilePayload, searchAffirmativeProfiles, searchPublishedProfiles } from "./profiles.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.join(currentDir, "db", "schema.sql");

function loadTestSchema() {
  return fs
    .readFileSync(schemaPath, "utf8")
    .replace("CREATE INDEX IF NOT EXISTS user_profiles_profile_data_gin_idx ON user_profiles USING GIN (profile_data);", "");
}

async function createTestPool() {
  const database = newDb({ autoCreateForeignKeyIndices: true });
  const { Pool } = database.adapters.createPg();
  const pool = new Pool();

  await pool.query(loadTestSchema());

  return pool;
}

async function createUser(pool, { name, email, role, isVerified = true }) {
  const result = await pool.query(
    `
      INSERT INTO users (name, email, role, is_verified)
      VALUES ($1, $2, $3, $4)
      RETURNING id
    `,
    [name, email, role, isVerified],
  );

  const userId = Number(result.rows[0].id);

  await pool.query(
    `
      INSERT INTO user_roles (user_id, role, created_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (user_id, role) DO NOTHING
    `,
    [userId, role],
  );

  return userId;
}

async function createPublishedProfile(pool, userId, overrides = {}) {
  const workModels = Array.isArray(overrides.workModels)
    ? overrides.workModels
    : overrides.workModel
      ? [overrides.workModel]
      : ["remoto"];
  const profileData = {
    name: overrides.name || "Ada Lovelace",
    city: overrides.city || "São Paulo",
    state: overrides.state || "SP",
    bio: overrides.bio || "Especialista em produto e plataforma.",
    headline: overrides.headline || "Software Engineer",
    linkedin: "",
    github: "",
    portfolio: "",
    skills: overrides.skills || ["React"],
    experiences: overrides.experiences || [],
    seniority: overrides.seniority || "pleno",
    workModels,
    openToOpportunities: overrides.openToOpportunities ?? true,
    isPublished: true,
    affirmativeProfile: overrides.affirmativeProfile || {
      groups: [],
      policyVersion: "",
      consentAcceptedAt: null,
    },
  };

  await pool.query(
    `
      INSERT INTO user_profiles (user_id, profile_data, is_published, public_slug, published_at, updated_at, expired_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [
      userId,
      profileData,
      overrides.isPublished ?? true,
      overrides.publicSlug || `perfil-${userId}`,
      overrides.publishedAt || new Date(),
      overrides.updatedAt || overrides.publishedAt || new Date(),
      overrides.expiredAt || null,
    ],
  );
}

describe("searchAffirmativeProfiles", () => {
  it("normaliza payload legado com workModel singular para a nova lista workModels", () => {
    const normalized = normalizeProfilePayload({
      name: "Ada Lovelace",
      workModel: "remoto",
    });

    expect(normalized.workModels).toEqual(["remoto"]);
  });

  it("inclui perfis multi-modelo quando o filtro singular busca por um dos modelos aceitos", async () => {
    const pool = await createTestPool();

    try {
      const multiModelId = await createUser(pool, {
        name: "Ada Lovelace",
        email: "ada-multimodel@example.com",
        role: "professional",
      });
      const presencialOnlyId = await createUser(pool, {
        name: "Grace Hopper",
        email: "grace-presencial@example.com",
        role: "professional",
      });

      await createPublishedProfile(pool, multiModelId, {
        name: "Ada Lovelace",
        publicSlug: "ada-multimodel-1",
        workModels: ["remoto", "hibrido"],
      });
      await createPublishedProfile(pool, presencialOnlyId, {
        name: "Grace Hopper",
        publicSlug: "grace-presencial-2",
        workModels: ["presencial"],
      });

      const result = await searchPublishedProfiles(pool, {
        q: "",
        seniority: "",
        workModel: "remoto",
        state: "SP",
        openToOpportunities: false,
        page: 1,
        pageSize: 20,
      });

      expect(result.total).toBe(1);
      expect(result.items).toEqual([
        expect.objectContaining({
          name: "Ada Lovelace",
          workModels: ["remoto", "hibrido"],
        }),
      ]);
    } finally {
      await pool.end();
    }
  });

  it("prioriza perfis no escopo afirmativo sem remover os demais perfis tecnicamente aderentes", async () => {
    const pool = await createTestPool();

    try {
      const prioritizedNewestId = await createUser(pool, {
        name: "Ada Lovelace",
        email: "ada@example.com",
        role: "professional",
      });
      const prioritizedOlderId = await createUser(pool, {
        name: "Grace Hopper",
        email: "grace@example.com",
        role: "professional",
      });
      const fallbackNewestId = await createUser(pool, {
        name: "Katherine Johnson",
        email: "katherine@example.com",
        role: "professional",
      });
      const fallbackOlderId = await createUser(pool, {
        name: "Radia Perlman",
        email: "radia@example.com",
        role: "professional",
      });

      await createPublishedProfile(pool, prioritizedNewestId, {
        name: "Ada Lovelace",
        publicSlug: "ada-lovelace-1",
        publishedAt: new Date("2026-04-24T12:00:00.000Z"),
        affirmativeProfile: {
          groups: ["women", "black_people"],
          policyVersion: AFFIRMATIVE_POLICY_VERSION,
          consentAcceptedAt: "2026-04-20T09:00:00.000Z",
        },
      });
      await createPublishedProfile(pool, prioritizedOlderId, {
        name: "Grace Hopper",
        publicSlug: "grace-hopper-2",
        publishedAt: new Date("2026-04-22T12:00:00.000Z"),
        affirmativeProfile: {
          groups: ["women", "black_people"],
          policyVersion: AFFIRMATIVE_POLICY_VERSION,
          consentAcceptedAt: "2026-04-20T09:00:00.000Z",
        },
      });
      await createPublishedProfile(pool, fallbackNewestId, {
        name: "Katherine Johnson",
        publicSlug: "katherine-johnson-3",
        publishedAt: new Date("2026-04-25T12:00:00.000Z"),
      });
      await createPublishedProfile(pool, fallbackOlderId, {
        name: "Radia Perlman",
        publicSlug: "radia-perlman-4",
        publishedAt: new Date("2026-04-21T12:00:00.000Z"),
      });

      const result = await searchAffirmativeProfiles(pool, {
        q: "",
        seniority: "",
        workModel: "remoto",
        state: "SP",
        openToOpportunities: false,
        page: 1,
        pageSize: 20,
        affirmativeContext: {
          useCase: "vaga_afirmativa",
          vacancyReference: "REQ-123",
        },
        affirmativeFilters: {
          genderGroups: ["women"],
          raceGroups: ["black_people"],
          pcdOnly: false,
        },
      });

      expect(result.total).toBe(4);
      expect(result.items.map((item) => item.name)).toEqual([
        "Ada Lovelace",
        "Grace Hopper",
        "Katherine Johnson",
        "Radia Perlman",
      ]);
    } finally {
      await pool.end();
    }
  });

  it("preserva o ranking técnico dentro de cada tier da priorização inclusiva quando há palavras-chave", async () => {
    const pool = await createTestPool();

    try {
      const prioritizedStrongId = await createUser(pool, {
        name: "Ada Lovelace",
        email: "ada@example.com",
        role: "professional",
      });
      const prioritizedWeakId = await createUser(pool, {
        name: "Grace Hopper",
        email: "grace@example.com",
        role: "professional",
      });
      const fallbackStrongId = await createUser(pool, {
        name: "Katherine Johnson",
        email: "katherine@example.com",
        role: "professional",
      });
      const fallbackWeakId = await createUser(pool, {
        name: "Radia Perlman",
        email: "radia@example.com",
        role: "professional",
      });

      await createPublishedProfile(pool, prioritizedStrongId, {
        name: "Ada Lovelace",
        publicSlug: "ada-lovelace-5",
        headline: "Kubernetes Staff Engineer",
        bio: "Lidera confiabilidade de plataformas.",
        skills: ["Kubernetes", "Go"],
        affirmativeProfile: {
          groups: ["women", "black_people"],
          policyVersion: AFFIRMATIVE_POLICY_VERSION,
          consentAcceptedAt: "2026-04-20T09:00:00.000Z",
        },
      });
      await createPublishedProfile(pool, prioritizedWeakId, {
        name: "Grace Hopper",
        publicSlug: "grace-hopper-6",
        headline: "Platform Engineer",
        bio: "Atua com kubernetes em sustentação de clusters críticos.",
        skills: ["Linux", "Platform"],
        affirmativeProfile: {
          groups: ["women", "black_people"],
          policyVersion: AFFIRMATIVE_POLICY_VERSION,
          consentAcceptedAt: "2026-04-20T09:00:00.000Z",
        },
      });
      await createPublishedProfile(pool, fallbackStrongId, {
        name: "Katherine Johnson",
        publicSlug: "katherine-johnson-7",
        headline: "Kubernetes Architect",
        bio: "Desenha plataformas resilientes.",
        skills: ["Kubernetes", "AWS"],
      });
      await createPublishedProfile(pool, fallbackWeakId, {
        name: "Radia Perlman",
        publicSlug: "radia-perlman-8",
        headline: "Site Reliability Engineer",
        bio: "Trabalha com kubernetes e observabilidade em ambientes críticos.",
        skills: ["Observability", "SRE"],
      });

      const result = await searchAffirmativeProfiles(pool, {
        q: "kubernetes",
        seniority: "",
        workModel: "remoto",
        state: "SP",
        openToOpportunities: false,
        page: 1,
        pageSize: 20,
        affirmativeContext: {
          useCase: "vaga_inclusiva",
          vacancyReference: "REQ-K8S-01",
        },
        affirmativeFilters: {
          genderGroups: ["women"],
          raceGroups: ["black_people"],
          pcdOnly: false,
        },
      });

      expect(result.total).toBe(4);
      expect(result.items.map((item) => item.name)).toEqual([
        "Ada Lovelace",
        "Grace Hopper",
        "Katherine Johnson",
        "Radia Perlman",
      ]);
    } finally {
      await pool.end();
    }
  });
});
