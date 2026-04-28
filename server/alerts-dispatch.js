import { runAlertsProducerCycle } from "./alerts.js";
import { createServerRuntime } from "./runtime.js";

try {
  const { config, pool } = await createServerRuntime();
  const summary = await runAlertsProducerCycle({
    pool,
    appBaseUrl: config.appBaseUrl,
  });

  console.log(JSON.stringify(summary, null, 2));
  await pool.end().catch(() => {});
} catch (error) {
  console.error("Failed to dispatch product notifications:", error);
  process.exit(1);
}
