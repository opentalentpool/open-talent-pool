import { createApp } from "./app.js";
import { ASYNC_EMAIL_TEMPLATE_KEY, runAsyncEmailDeliveryCycle } from "./async-email.js";
import { runAlertsProducerCycle } from "./alerts.js";
import { createServerRuntime } from "./runtime.js";

function buildInlineDeliverySummary(producerSummary, deliverySummary) {
  const savedSearchDelivery = deliverySummary.byTemplate[ASYNC_EMAIL_TEMPLATE_KEY.savedSearchAlert] || {
    processed: 0,
    sent: 0,
    retried: 0,
    dead: 0,
    noop: 0,
  };
  const profileFreshnessDelivery = deliverySummary.byTemplate[ASYNC_EMAIL_TEMPLATE_KEY.profileFreshness] || {
    processed: 0,
    sent: 0,
    retried: 0,
    dead: 0,
    noop: 0,
  };

  return {
    savedSearches: {
      ...producerSummary.savedSearches,
      sent: savedSearchDelivery.sent,
      delivery: savedSearchDelivery,
    },
    profileFreshness: {
      ...producerSummary.profileFreshness,
      remindersSent: producerSummary.profileFreshness.remindersQueued,
      delivery: profileFreshnessDelivery,
    },
    delivery: deliverySummary,
  };
}

try {
  const {
    config,
    pool,
    asyncEmailSenderRegistry,
    sendCodeEmail,
    sendModerationReportReceiptEmail,
    sendModerationDecisionEmail,
    testState,
  } =
    await createServerRuntime();

  const dispatchAlerts = async () => {
    const producerSummary = await runAlertsProducerCycle({
      pool,
      appBaseUrl: config.appBaseUrl,
    });

    if (!config.enableTestRoutes) {
      return producerSummary;
    }

    const deliverySummary = await runAsyncEmailDeliveryCycle({
      pool,
      senderRegistry: asyncEmailSenderRegistry,
      maxAttempts: config.mailRetryMaxAttempts,
      retryBaseDelayMs: config.mailRetryBaseDelayMs,
      limit: Math.max(config.mailOutboxBatchSize, 500),
    });

    return buildInlineDeliverySummary(producerSummary, deliverySummary);
  };

  const app = createApp({
    pool,
    config,
    sendCodeEmail,
    sendModerationReportReceiptEmail,
    sendModerationDecisionEmail,
    enableTestRoutes: config.enableTestRoutes,
    testState,
    dispatchAlerts,
    debug: config.debug,
  });

  const server = app.listen(config.port, () => {
    console.log(`Server listening on ${config.port}`);
  });

  let shutdownPromise = null;

  const shutdown = async (signal) => {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    shutdownPromise = (async () => {
      console.log(`Received ${signal}. Shutting down gracefully...`);

      const forcedShutdown = setTimeout(() => {
        console.error("Graceful shutdown timed out.");
        process.exit(1);
      }, 10_000);
      forcedShutdown.unref();

      try {
        await new Promise((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          });
        });
        await pool.end();
        clearTimeout(forcedShutdown);
        process.exit(0);
      } catch (error) {
        clearTimeout(forcedShutdown);
        console.error("Failed during graceful shutdown:", error);
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
  console.error("Failed to start server:", error);
  process.exit(1);
}
