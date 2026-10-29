import "./load-env";

import { spawn } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { eq } from "drizzle-orm";
import { closeDb, getDb, schema } from "../src/db";
import { verifyPassword } from "../src/lib/password";

async function main() {
  const manufacturers = await getDb().select({ email: schema.users.email, passwordHash: schema.users.passwordHash }).from(schema.users).where(eq(schema.users.domain, "manufacturer"));
  if (!manufacturers.length) throw new Error("No manufacturer account is available for browser testing");
  const input = createInterface({ input: process.stdin, output: process.stderr, terminal: false });
  const password = process.env.E2E_MANUFACTURER_PASSWORD ?? (await input.question("Manufacturer test password: "));
  input.close();
  if (!password) throw new Error("Manufacturer test password is required");
  let manufacturer: (typeof manufacturers)[number] | undefined;
  for (const candidate of manufacturers) {
    if (await verifyPassword(password, candidate.passwordHash)) {
      manufacturer = candidate;
      break;
    }
  }
  await closeDb();
  if (!manufacturer) throw new Error("The supplied password does not match an enabled manufacturer test account");
  const child = spawn("npm", ["run", "test:e2e:browser"], {
    stdio: "inherit",
    env: { ...process.env, E2E_MANUFACTURER_EMAIL: manufacturer.email, E2E_MANUFACTURER_PASSWORD: password },
  });
  const code = await new Promise<number>((resolve) => child.once("exit", (value) => resolve(value ?? 1)));
  process.exitCode = code;
}

main().catch(async (error) => {
  console.error(error);
  await closeDb();
  process.exit(1);
});

