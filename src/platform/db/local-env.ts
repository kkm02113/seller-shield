import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadEnvFile } from "node:process";

export function loadDatabaseEnvironment(directory = process.cwd()): void {
  // loadEnvFile preserves existing process variables; local values win over fallback.
  for (const name of [".env.local", ".env"]) {
    const file = join(directory, name);

    if (existsSync(file)) {
      loadEnvFile(file);
    }
  }
}
