import { describe, expect, it, vi } from "vitest";
import { createDevelopmentServerPortInUseError, ensureDevelopmentServerPort } from "./dev-server-port.js";

describe("ensureDevelopmentServerPort", () => {
  it("nao faz nada quando a porta do backend esta livre", async () => {
    const config = {
      port: 4000,
    };
    const loadEnvironmentFn = vi.fn();
    const probePortFn = vi.fn().mockResolvedValue({ ok: true });

    const result = await ensureDevelopmentServerPort({
      env: {},
      loadEnvironmentFn,
      getRuntimeConfigFn: () => config,
      probePortFn,
    });

    expect(result).toEqual({
      status: "available",
      config,
    });
    expect(loadEnvironmentFn).toHaveBeenCalledTimes(1);
    expect(probePortFn).toHaveBeenCalledWith(4000);
  });

  it("falha com mensagem acionavel quando a porta ja esta ocupada", async () => {
    const config = {
      port: 4000,
    };
    const portError = Object.assign(new Error("listen EADDRINUSE: address already in use :::4000"), {
      code: "EADDRINUSE",
    });

    await expect(
      ensureDevelopmentServerPort({
        env: {},
        loadEnvironmentFn: vi.fn(),
        getRuntimeConfigFn: () => config,
        probePortFn: vi.fn().mockResolvedValue({ ok: false, error: portError }),
      }),
    ).rejects.toThrow(/outra sessao de desenvolvimento do backend/);
  });

  it("mantem erros inesperados do probe sem mascarar", async () => {
    const unexpectedError = Object.assign(new Error("listen EACCES: permission denied"), {
      code: "EACCES",
    });

    await expect(
      ensureDevelopmentServerPort({
        env: {},
        loadEnvironmentFn: vi.fn(),
        getRuntimeConfigFn: () => ({ port: 4000 }),
        probePortFn: vi.fn().mockResolvedValue({ ok: false, error: unexpectedError }),
      }),
    ).rejects.toBe(unexpectedError);
  });
});

describe("createDevelopmentServerPortInUseError", () => {
  it("orienta encerrar a sessao anterior ou usar .env.local", () => {
    const cause = Object.assign(new Error("listen EADDRINUSE"), {
      code: "EADDRINUSE",
    });

    const error = createDevelopmentServerPortInUseError({ port: 4000 }, cause);

    expect(error.message).toMatch(/PORT no \.env\.local/);
    expect(error.cause).toBe(cause);
  });
});
