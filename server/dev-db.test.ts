import { spawn } from "child_process";
import { describe, expect, it, vi } from "vitest";
import {
  createComposeDatabaseStartError,
  ensureDevelopmentDatabase,
  shouldStartComposeMailpit,
  startComposeDatabase,
} from "./dev-db.js";

vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

describe("ensureDevelopmentDatabase", () => {
  it("não faz nada quando o banco já está disponível", async () => {
    const config = {
      postgresHost: "localhost",
      postgresPort: 5432,
      postgresDb: "otp",
      postgresUser: "otp",
      postgresPassword: "change_me",
    };
    const loadEnvironmentFn = vi.fn();
    const tryConnect = vi.fn().mockResolvedValue({ ok: true });
    const startComposeDatabaseFn = vi.fn();
    const waitForDatabaseFn = vi.fn();

    const result = await ensureDevelopmentDatabase({
      env: {},
      loadEnvironmentFn,
      getRuntimeConfigFn: () => config,
      tryConnect,
      startComposeDatabaseFn,
      waitForDatabaseFn,
    });

    expect(result).toEqual({
      status: "already-running",
      config,
    });
    expect(loadEnvironmentFn).toHaveBeenCalledTimes(1);
    expect(tryConnect).toHaveBeenCalledTimes(1);
    expect(startComposeDatabaseFn).not.toHaveBeenCalled();
    expect(waitForDatabaseFn).not.toHaveBeenCalled();
  });

  it("sobe o compose quando o Postgres local recusa conexão", async () => {
    const config = {
      postgresHost: "localhost",
      postgresPort: 5432,
      postgresDb: "otp",
      postgresUser: "otp",
      postgresPassword: "change_me",
    };
    const connectionError = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), {
      code: "ECONNREFUSED",
    });
    const logger = {
      log: vi.fn(),
      error: vi.fn(),
    };
    const tryConnect = vi.fn().mockResolvedValue({ ok: false, error: connectionError });
    const startComposeDatabaseFn = vi.fn().mockResolvedValue(undefined);
    const waitForDatabaseFn = vi.fn().mockResolvedValue(undefined);

    const result = await ensureDevelopmentDatabase({
      env: {},
      logger,
      loadEnvironmentFn: vi.fn(),
      getRuntimeConfigFn: () => config,
      tryConnect,
      startComposeDatabaseFn,
      waitForDatabaseFn,
    });

    expect(result).toEqual({
      status: "started-compose-db",
      config,
    });
    expect(startComposeDatabaseFn).toHaveBeenCalledTimes(1);
    expect(startComposeDatabaseFn).toHaveBeenCalledWith({
      cwd: expect.any(String),
      logger,
      services: ["db"],
    });
    expect(waitForDatabaseFn).toHaveBeenCalledTimes(1);
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining("PostgreSQL"));
  });

  it("garante o Mailpit local quando o SMTP de desenvolvimento usa localhost:1025 sem autenticação", async () => {
    const config = {
      postgresHost: "localhost",
      postgresPort: 5432,
      postgresDb: "otp",
      postgresUser: "otp",
      postgresPassword: "change_me",
      smtpServer: "localhost",
      smtpPort: 1025,
      smtpUser: "",
      smtpPass: "",
      isProduction: false,
    };
    const logger = {
      log: vi.fn(),
      error: vi.fn(),
    };
    const startComposeDatabaseFn = vi.fn().mockResolvedValue(undefined);

    const result = await ensureDevelopmentDatabase({
      env: {},
      logger,
      loadEnvironmentFn: vi.fn(),
      getRuntimeConfigFn: () => config,
      tryConnect: vi.fn().mockResolvedValue({ ok: true }),
      startComposeDatabaseFn,
      waitForDatabaseFn: vi.fn(),
    });

    expect(result.status).toBe("started-compose-mailpit");
    expect(startComposeDatabaseFn).toHaveBeenCalledWith({
      cwd: expect.any(String),
      logger,
      services: ["mailpit"],
    });
    expect(logger.log).toHaveBeenCalledWith(expect.stringContaining("Mailpit"));
  });

  it("sobe Postgres e Mailpit juntos quando ambos são necessários no bootstrap local", async () => {
    const config = {
      postgresHost: "localhost",
      postgresPort: 5432,
      postgresDb: "otp",
      postgresUser: "otp",
      postgresPassword: "change_me",
      smtpServer: "localhost",
      smtpPort: 1025,
      smtpUser: "",
      smtpPass: "",
      isProduction: false,
    };
    const connectionError = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), {
      code: "ECONNREFUSED",
    });
    const startComposeDatabaseFn = vi.fn().mockResolvedValue(undefined);

    const result = await ensureDevelopmentDatabase({
      env: {},
      logger: { log: vi.fn(), error: vi.fn() },
      loadEnvironmentFn: vi.fn(),
      getRuntimeConfigFn: () => config,
      tryConnect: vi.fn().mockResolvedValue({ ok: false, error: connectionError }),
      startComposeDatabaseFn,
      waitForDatabaseFn: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.status).toBe("started-compose-dev-services");
    expect(startComposeDatabaseFn).toHaveBeenCalledWith({
      cwd: expect.any(String),
      logger: expect.any(Object),
      services: ["db", "mailpit"],
    });
  });

  it("não tenta subir Mailpit quando o SMTP local foi trocado por Gmail pessoal", () => {
    expect(
      shouldStartComposeMailpit({
        smtpServer: "smtp.gmail.com",
        smtpPort: 465,
        smtpUser: "person@gmail.com",
        smtpPass: "gmail-app-password",
        isProduction: false,
      }),
    ).toBe(false);
  });

  it("falha com mensagem acionável quando o host não é local", async () => {
    const config = {
      postgresHost: "db.internal",
      postgresPort: 5432,
      postgresDb: "otp",
      postgresUser: "otp",
      postgresPassword: "change_me",
    };
    const connectionError = Object.assign(new Error("connect ECONNREFUSED db.internal:5432"), {
      code: "ECONNREFUSED",
    });
    const startComposeDatabaseFn = vi.fn();

    await expect(
      ensureDevelopmentDatabase({
        env: {},
        loadEnvironmentFn: vi.fn(),
        getRuntimeConfigFn: () => config,
        tryConnect: vi.fn().mockResolvedValue({ ok: false, error: connectionError }),
        startComposeDatabaseFn,
        waitForDatabaseFn: vi.fn(),
      }),
    ).rejects.toThrow(/POSTGRES_HOST=db\.internal/);

    expect(startComposeDatabaseFn).not.toHaveBeenCalled();
  });

  it("traduz erro de permissao do Docker em mensagem acionavel", () => {
    const permissionError = Object.assign(new Error("docker compose up -d db exited with code 1"), {
      stderr: "permission denied while trying to connect to the docker API at unix:///var/run/docker.sock",
    });

    const translatedError = createComposeDatabaseStartError(permissionError);

    expect(translatedError.message).toMatch(/grupo `docker`/);
    expect(translatedError.cause).toBe(permissionError);
  });

  it("mantém o bootstrap do banco usando docker compose up -d db", async () => {
    const onceHandlers: Record<string, (...args: unknown[]) => void> = {};
    const spawnMock = vi.mocked(spawn);

    spawnMock.mockImplementation((_command, _args, _options) => ({
      stdout: {
        on: vi.fn(),
      },
      stderr: {
        on: vi.fn(),
      },
      once: vi.fn((event, handler) => {
        onceHandlers[event] = handler;
      }),
    }));

    const startPromise = startComposeDatabase({
      cwd: "/tmp/open-talent-pool",
    });

    expect(spawnMock).toHaveBeenCalledWith("docker", ["compose", "up", "-d", "db"], {
      cwd: "/tmp/open-talent-pool",
      stdio: ["ignore", "pipe", "pipe"],
    });

    onceHandlers.exit?.(0);

    await expect(startPromise).resolves.toBeUndefined();
  });
});
