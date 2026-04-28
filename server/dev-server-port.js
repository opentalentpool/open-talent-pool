import net from "node:net";
import path from "path";
import { fileURLToPath } from "url";
import { getRuntimeConfig, loadEnvironment } from "./runtime.js";

export function isPortInUseError(error) {
  return error?.code === "EADDRINUSE";
}

export function createDevelopmentServerPortInUseError(config, error) {
  return new Error(
    `A porta ${config.port} ja esta em uso antes de iniciar a API. Isso normalmente significa que outra sessao de desenvolvimento do backend ainda esta rodando. Encerre o processo antigo ou ajuste PORT no .env.local antes de executar \`pnpm run dev\` novamente.`,
    { cause: error },
  );
}

export async function probeServerPortAvailability(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.unref();
    server.once("error", (error) => {
      resolve({ ok: false, error });
    });

    server.listen(port, () => {
      server.close((error) => {
        if (error) {
          resolve({ ok: false, error });
          return;
        }

        resolve({ ok: true });
      });
    });
  });
}

export async function ensureDevelopmentServerPort({
  env = process.env,
  loadEnvironmentFn = loadEnvironment,
  getRuntimeConfigFn = getRuntimeConfig,
  probePortFn = probeServerPortAvailability,
} = {}) {
  loadEnvironmentFn();

  const config = getRuntimeConfigFn(env);
  const portResult = await probePortFn(config.port);

  if (portResult.ok) {
    return {
      status: "available",
      config,
    };
  }

  if (isPortInUseError(portResult.error)) {
    throw createDevelopmentServerPortInUseError(config, portResult.error);
  }

  throw portResult.error;
}

const entryFilePath = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === entryFilePath) {
  try {
    await ensureDevelopmentServerPort();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
