/** Provision a support-staff account: `pnpm --filter @orynt/api staff:create -- <email> "<name>" [support|support_lead]`. Prints a one-time password and the TOTP secret ONCE. */
import { loadConfig } from "./config";
import { createPool } from "./db/pool";
import { migrateUp } from "./db/migrate";
import { createStaff } from "./services/staff";

const [email, name, role = "support"] = process.argv.slice(2).filter((a) => a !== "--");
if (!email || !name || !["support", "support_lead"].includes(role)) { console.error('usage: staff:create <email> "<name>" [support|support_lead]'); process.exit(2); }
const config = loadConfig(process.env);
const pool = createPool(config.databaseUrl);
await migrateUp(pool);
const r = await createStaff({ pool, config } as never, { email, name, role: role as "support" | "support_lead" });
console.log(JSON.stringify({ email: r.email, one_time_password: r.one_time_password, mfa_secret: r.mfa_secret, otpauth_uri: r.otpauth_uri, note: "Shown once. Store the password and add the secret to an authenticator app now." }, null, 2));
await pool.end();
