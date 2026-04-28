import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { newDb } from "pg-mem";
import { describe, expect, it } from "vitest";
import {
  AFFIRMATIVE_GROUP_VALUES,
  AFFIRMATIVE_POLICY_VERSION,
} from "../src/lib/affirmative-config.js";
import {
  DEFAULT_LOCAL_FIXTURE_EMAIL_DOMAIN,
  LOCAL_FIXTURE_PROFESSIONAL_COUNT,
  LOCAL_FIXTURE_RECRUITER_COUNT,
  LOCAL_FIXTURE_NON_WOMEN_FIRST_NAMES,
  LOCAL_FIXTURE_WOMEN_FIRST_NAMES,
  buildLocalFixtureDataset,
  buildLocalFixtureEmail,
  removeLocalFixtures,
  seedLocalFixtures,
} from "./local-fixtures.js";
import { getProfilePublicationIssues, searchPublishedProfiles } from "./profiles.js";

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

function normalizeCountRow(row: Record<string, number | number[]>) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );
}

describe("local fixtures", () => {
  it("gera emails reservados por padrao e suporta mailbox unica com plus addressing", () => {
    expect(buildLocalFixtureEmail({ role: "professional", index: 1 })).toBe(
      `fixture-profissional-001@${DEFAULT_LOCAL_FIXTURE_EMAIL_DOMAIN}`,
    );

    expect(
      buildLocalFixtureEmail({
        role: "recruiter",
        index: 7,
        mailboxEmail: "contato@opentalentpool.org",
      }),
    ).toBe("contato+otp-recrutador-007@opentalentpool.org");
  });

  it("gera 50 profissionais publicaveis e 10 recrutadores distintos", () => {
    const dataset = buildLocalFixtureDataset();

    expect(dataset.professionals).toHaveLength(LOCAL_FIXTURE_PROFESSIONAL_COUNT);
    expect(dataset.recruiters).toHaveLength(LOCAL_FIXTURE_RECRUITER_COUNT);
    expect(new Set(dataset.professionals.map((item) => item.email)).size).toBe(LOCAL_FIXTURE_PROFESSIONAL_COUNT);
    expect(new Set(dataset.recruiters.map((item) => item.email)).size).toBe(LOCAL_FIXTURE_RECRUITER_COUNT);

    for (const professional of dataset.professionals) {
      expect(
        getProfilePublicationIssues({
          role: professional.role,
          isVerified: professional.isVerified,
          profile: professional.profile,
        }),
      ).toEqual([]);
    }

    const groupedProfiles = dataset.professionals.filter((item) => item.profile.affirmativeProfile.groups.length > 0);
    const ungroupedProfiles = dataset.professionals.filter((item) => item.profile.affirmativeProfile.groups.length === 0);
    const distributedGroups = new Set(
      dataset.professionals.flatMap((item) => item.profile.affirmativeProfile.groups),
    );

    expect(groupedProfiles.length).toBeGreaterThan(0);
    expect(ungroupedProfiles.length).toBeGreaterThan(0);
    expect([...distributedGroups].sort()).toEqual([...AFFIRMATIVE_GROUP_VALUES].sort());

    for (const professional of groupedProfiles) {
      expect(professional.profile.affirmativeProfile.policyVersion).toBe(AFFIRMATIVE_POLICY_VERSION);
      expect(professional.profile.affirmativeProfile.consentAcceptedAt).toEqual(expect.any(String));
    }

    const womenProfiles = dataset.professionals.filter((item) =>
      item.profile.affirmativeProfile.groups.includes("women"),
    );
    const nonWomenProfiles = dataset.professionals.filter(
      (item) => !item.profile.affirmativeProfile.groups.includes("women"),
    );
    const womenNamePool = new Set(LOCAL_FIXTURE_WOMEN_FIRST_NAMES);
    const nonWomenNamePool = new Set(LOCAL_FIXTURE_NON_WOMEN_FIRST_NAMES);

    expect(womenProfiles.length).toBeGreaterThan(0);
    expect(nonWomenProfiles.length).toBeGreaterThan(0);

    for (const professional of womenProfiles) {
      const firstName = professional.name.split(" ")[0];
      expect(womenNamePool.has(firstName)).toBe(true);
      expect(nonWomenNamePool.has(firstName)).toBe(false);
    }

    for (const professional of nonWomenProfiles) {
      const firstName = professional.name.split(" ")[0];
      expect(nonWomenNamePool.has(firstName)).toBe(true);
      expect(womenNamePool.has(firstName)).toBe(false);
    }
  });

  it("faz seed idempotente e limpeza reversivel no banco local", async () => {
    const pool = await createTestPool();

    try {
      const firstRun = await seedLocalFixtures({
        pool,
        now: new Date("2026-04-26T12:00:00.000Z"),
      });

      expect(firstRun.professionals).toBe(LOCAL_FIXTURE_PROFESSIONAL_COUNT);
      expect(firstRun.recruiters).toBe(LOCAL_FIXTURE_RECRUITER_COUNT);
      expect(firstRun.savedSearches).toBe(LOCAL_FIXTURE_RECRUITER_COUNT);
      expect(firstRun.favorites).toBe(LOCAL_FIXTURE_RECRUITER_COUNT * 3);

      const firstCounts = await pool.query(`
        SELECT
          (SELECT COUNT(*)::int FROM users) AS users_count,
          (SELECT COUNT(*)::int FROM user_roles) AS roles_count,
          (SELECT COUNT(*)::int FROM user_profiles) AS profiles_count,
          (SELECT COUNT(*)::int FROM recruiter_favorites) AS favorites_count,
          (SELECT COUNT(*)::int FROM saved_searches) AS searches_count,
          (SELECT COUNT(*)::int FROM user_policy_acceptances) AS acceptances_count
      `);

      expect(normalizeCountRow(firstCounts.rows[0])).toEqual({
        users_count: 60,
        roles_count: 60,
        profiles_count: 50,
        favorites_count: 30,
        searches_count: 10,
        acceptances_count: 120,
      });

      await expect(searchPublishedProfiles(pool, {})).resolves.toMatchObject({
        total: 50,
      });

      await seedLocalFixtures({
        pool,
        now: new Date("2026-04-26T13:00:00.000Z"),
      });

      const secondCounts = await pool.query(`
        SELECT
          (SELECT COUNT(*)::int FROM users) AS users_count,
          (SELECT COUNT(*)::int FROM user_roles) AS roles_count,
          (SELECT COUNT(*)::int FROM user_profiles) AS profiles_count,
          (SELECT COUNT(*)::int FROM recruiter_favorites) AS favorites_count,
          (SELECT COUNT(*)::int FROM saved_searches) AS searches_count,
          (SELECT COUNT(*)::int FROM user_policy_acceptances) AS acceptances_count
      `);

      expect(normalizeCountRow(secondCounts.rows[0])).toEqual(normalizeCountRow(firstCounts.rows[0]));

      const cleanup = await removeLocalFixtures({ pool });

      expect(cleanup.removedUsers).toBe(60);

      const finalCounts = await pool.query(`
        SELECT
          (SELECT COUNT(*)::int FROM users) AS users_count,
          (SELECT COUNT(*)::int FROM user_roles) AS roles_count,
          (SELECT COUNT(*)::int FROM user_profiles) AS profiles_count,
          (SELECT COUNT(*)::int FROM recruiter_favorites) AS favorites_count,
          (SELECT COUNT(*)::int FROM saved_searches) AS searches_count,
          (SELECT COUNT(*)::int FROM user_policy_acceptances) AS acceptances_count
      `);

      expect(normalizeCountRow(finalCounts.rows[0])).toEqual({
        users_count: 0,
        roles_count: 0,
        profiles_count: 0,
        favorites_count: 0,
        searches_count: 0,
        acceptances_count: 0,
      });
    } finally {
      await pool.end();
    }
  });
});
