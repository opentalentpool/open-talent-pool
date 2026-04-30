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

function expectNonEmptyText(value: unknown) {
  expect(typeof value).toBe("string");
  expect(String(value).trim().length).toBeGreaterThan(0);
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

  it("preenche todos os blocos exibidos no perfil publico", () => {
    const dataset = buildLocalFixtureDataset({ professionalCount: 3, recruiterCount: 0 });

    for (const professional of dataset.professionals) {
      const profile = professional.profile;

      for (const field of ["name", "city", "state", "bio", "headline", "linkedin", "github", "portfolio"]) {
        expectNonEmptyText(profile[field as keyof typeof profile]);
      }

      expect(profile.contactEmail).toBe(professional.email);
      expect(profile.showContactEmailToRecruiters).toBe(true);
      expect(profile.skills.length).toBeGreaterThan(0);
      expect(profile.workModels.length).toBeGreaterThan(0);
      expectNonEmptyText(profile.seniority);

      expect(profile.experiences.length).toBeGreaterThan(0);
      for (const experience of profile.experiences) {
        for (const field of ["role_title", "company_name", "start_date", "seniority", "description"]) {
          expectNonEmptyText(experience[field as keyof typeof experience]);
        }
        if (!experience.is_current) {
          expectNonEmptyText(experience.end_date);
        }
        expect(experience.positions.length).toBeGreaterThan(0);
        for (const position of experience.positions) {
          for (const field of ["role_title", "seniority", "start_date", "description"]) {
            expectNonEmptyText(position[field as keyof typeof position]);
          }
          if (!position.is_current) {
            expectNonEmptyText(position.end_date);
          }
        }
      }

      expect(profile.educations.length).toBeGreaterThan(0);
      for (const education of profile.educations) {
        for (const field of ["institution", "degree", "field", "start_date", "end_date", "description"]) {
          expectNonEmptyText(education[field as keyof typeof education]);
        }
      }

      expect(profile.certifications.length).toBeGreaterThan(0);
      for (const certification of profile.certifications) {
        for (const field of ["name", "issuer", "issued_at", "credential_url", "description"]) {
          expectNonEmptyText(certification[field as keyof typeof certification]);
        }
      }

      expect(profile.languages.length).toBeGreaterThan(0);
      for (const language of profile.languages) {
        for (const field of ["name", "proficiency"]) {
          expectNonEmptyText(language[field as keyof typeof language]);
        }
      }

      expect(profile.projects.length).toBeGreaterThan(0);
      for (const project of profile.projects) {
        for (const field of ["name", "role", "url", "start_date", "end_date", "description"]) {
          expectNonEmptyText(project[field as keyof typeof project]);
        }
        expect(project.skills.length).toBeGreaterThan(0);
      }

      expect(profile.publications.length).toBeGreaterThan(0);
      for (const publication of profile.publications) {
        for (const field of ["title", "publisher", "url", "published_at", "description"]) {
          expectNonEmptyText(publication[field as keyof typeof publication]);
        }
      }

      expect(profile.volunteerExperiences.length).toBeGreaterThan(0);
      for (const volunteerExperience of profile.volunteerExperiences) {
        for (const field of ["organization", "role", "start_date", "description"]) {
          expectNonEmptyText(volunteerExperience[field as keyof typeof volunteerExperience]);
        }
        if (!volunteerExperience.is_current) {
          expectNonEmptyText(volunteerExperience.end_date);
        }
      }

      expect(profile.awards.length).toBeGreaterThan(0);
      for (const award of profile.awards) {
        for (const field of ["title", "issuer", "awarded_at", "description"]) {
          expectNonEmptyText(award[field as keyof typeof award]);
        }
      }

      expect(profile.courses.length).toBeGreaterThan(0);
      for (const course of profile.courses) {
        for (const field of ["name", "institution", "completed_at", "description"]) {
          expectNonEmptyText(course[field as keyof typeof course]);
        }
      }

      expect(profile.organizations.length).toBeGreaterThan(0);
      for (const organization of profile.organizations) {
        for (const field of ["name", "role", "start_date", "description"]) {
          expectNonEmptyText(organization[field as keyof typeof organization]);
        }
        if (!organization.is_current) {
          expectNonEmptyText(organization.end_date);
        }
      }
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
