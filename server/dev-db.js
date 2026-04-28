import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { createPool, getRuntimeConfig, loadEnvironment } from "./runtime.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const defaultProjectRoot = path.resolve(currentDir, "..");

export function isLocalDatabaseHost(host) {
  return ["localhost", "127.0.0.1", "::1"].includes(String(host || "").trim().toLowerCase());
}

export function formatDatabaseTarget(config) {
  return `${config.postgresHost}:${config.postgresPort}/${config.postgresDb}`;
}

export function shouldStartComposeDatabase(config, error) {
  return isLocalDatabaseHost(config.postgresHost) && error?.code === "ECONNREFUSED";
}

export function createDatabaseConnectionError(config, error) {
  const target = formatDatabaseTarget(config);
  const guidance = isLocalDatabaseHost(config.postgresHost)
    ? "Inicie o banco com `docker compose up -d db` ou ajuste as variaveis POSTGRES_* do seu .env."
    : `Verifique POSTGRES_HOST=${config.postgresHost}, POSTGRES_PORT=${config.postgresPort} e as credenciais atuais.`;

  return new Error(`Nao foi possivel conectar ao PostgreSQL em ${target}. ${guidance}`, {
    cause: error,
  });
}

export async function tryConnectToDatabase(config) {
  const pool = await createPool(config);

  try {
    await pool.query("SELECT 1");
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  } finally {
    await pool.end().catch(() => {});
  }
}

function runCommand(command, args, { cwd = defaultProjectRoot } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      const error = new Error(`${command} ${args.join(" ")} exited with code ${code ?? "unknown"}`);
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
  });
}

export function createComposeDatabaseStartError(error) {
  if (error?.code === "ENOENT") {
    return new Error(
      "Docker nao esta disponivel no PATH. Inicie o PostgreSQL manualmente ou use `docker compose up -d db` em um ambiente com Docker.",
      { cause: error },
    );
  }

  const output = [error?.stderr, error?.stdout, error?.message].filter(Boolean).join("\n");

  if (output.includes("permission denied while trying to connect to the docker API")) {
    return new Error(
      "Docker esta instalado, mas este usuario nao tem permissao para acessar o socket do Docker. Adicione seu usuario ao grupo `docker` e abra um novo shell antes de rodar `pnpm run dev` novamente.",
      { cause: error },
    );
  }

  if (output.includes("Cannot connect to the Docker daemon")) {
    return new Error(
      "O cliente Docker foi encontrado, mas o daemon nao esta acessivel. Inicie o Docker Engine e tente `pnpm run dev` novamente.",
      { cause: error },
    );
  }

  return error;
}

export async function startComposeDatabase({ cwd = defaultProjectRoot } = {}) {
  try {
    await runCommand("docker", ["compose", "up", "-d", "db"], { cwd });
  } catch (error) {
    throw createComposeDatabaseStartError(error);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForDatabase(
  config,
  {
    tryConnect = tryConnectToDatabase,
    timeoutMs = 30_000,
    intervalMs = 1_000,
  } = {},
) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    const result = await tryConnect(config);

    if (result.ok) {
      return;
    }

    lastError = result.error;
    await sleep(intervalMs);
  }

  throw new Error(`O PostgreSQL nao ficou disponivel em ${formatDatabaseTarget(config)} apos ${timeoutMs}ms.`, {
    cause: lastError,
  });
}

export async function ensureDevelopmentDatabase({
  env = process.env,
  cwd = defaultProjectRoot,
  logger = console,
  loadEnvironmentFn = loadEnvironment,
  getRuntimeConfigFn = getRuntimeConfig,
  tryConnect = tryConnectToDatabase,
  startComposeDatabaseFn = startComposeDatabase,
  waitForDatabaseFn = waitForDatabase,
} = {}) {
  loadEnvironmentFn();

  const config = getRuntimeConfigFn(env);
  const connectionResult = await tryConnect(config);

  if (connectionResult.ok) {
    return {
      status: "already-running",
      config,
    };
  }

  if (shouldStartComposeDatabase(config, connectionResult.error)) {
    logger.log(
      `PostgreSQL local indisponivel em ${formatDatabaseTarget(config)}. Subindo o servico db do docker compose...`,
    );

    await startComposeDatabaseFn({ cwd, logger });
    await waitForDatabaseFn(config, { logger, tryConnect });

    return {
      status: "started-compose-db",
      config,
    };
  }

  throw createDatabaseConnectionError(config, connectionResult.error);
}

const entryFilePath = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === entryFilePath) {
  try {
    await ensureDevelopmentDatabase();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
