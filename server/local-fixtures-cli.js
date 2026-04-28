import path from "path";
import { fileURLToPath } from "url";
import { runLocalFixturesCommand } from "./local-fixtures.js";

const entryFilePath = fileURLToPath(import.meta.url);

export async function main(argv = process.argv.slice(2)) {
  const command = String(argv[0] || "").trim().toLowerCase();

  if (!command || !["fill", "unfill"].includes(command)) {
    console.error("Uso: node server/local-fixtures-cli.js <fill|unfill>");
    process.exit(1);
  }

  await runLocalFixturesCommand(command);
}

if (process.argv[1] && path.resolve(process.argv[1]) === entryFilePath) {
  try {
    await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
