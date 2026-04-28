import { createAsyncEmailQueue, runMailWorker } from "./async-email.js";
import { createRedisConnection, createServerRuntime } from "./runtime.js";

let shutdownPromise = null;

try {
  const {
    config,
    pool,
    asyncEmailSenderRegistry,
  } = await createServerRuntime();

  const queueConnection = createRedisConnection(config);
  const workerConnection = createRedisConnection(config);
  const queue = createAsyncEmailQueue({
    connection: queueConnection,
    prefix: config.mailQueuePrefix,
  });
  const workerRuntime = await runMailWorker({
    pool,
    queue,
    queueConnection,
    workerConnection,
    mailQueuePrefix: config.mailQueuePrefix,
    senderRegistry: asyncEmailSenderRegistry,
    concurrency: config.mailWorkerConcurrency,
    pollIntervalMs: config.mailOutboxPollIntervalMs,
    batchSize: config.mailOutboxBatchSize,
    maxAttempts: config.mailRetryMaxAttempts,
    retryBaseDelayMs: config.mailRetryBaseDelayMs,
  });

  console.log("[MAIL_WORKER] Ready");

  const shutdown = async (signal) => {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    shutdownPromise = (async () => {
      console.log(`[MAIL_WORKER] Received ${signal}. Shutting down gracefully...`);

      const forcedShutdown = setTimeout(() => {
        console.error("[MAIL_WORKER] Graceful shutdown timed out.");
        process.exit(1);
      }, 10_000);
      forcedShutdown.unref();

      try {
        await workerRuntime.shutdown();
        await pool.end();
        clearTimeout(forcedShutdown);
        process.exit(0);
      } catch (error) {
        clearTimeout(forcedShutdown);
        console.error("[MAIL_WORKER] Failed during shutdown:", error);
        process.exit(1);
      }
    })();

    return shutdownPromise;
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
} catch (error) {
  console.error("Failed to start mail worker:", error);
  process.exit(1);
}
