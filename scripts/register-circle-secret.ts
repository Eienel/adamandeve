import { registerCircleEntitySecret } from "@arena/agents";

/** One-time Circle Entity Secret setup.
 *
 *  You already have a Circle API key. The Entity Secret is a SEPARATE 32-byte hex string
 *  that you generate yourself, then register ONCE against that API key. After this runs:
 *    1. Copy the printed CIRCLE_ENTITY_SECRET into your Railway env vars (alongside CIRCLE_API_KEY).
 *    2. Keep ./circle-recovery-file.dat safe, then delete it from the repo (never commit it).
 *
 *  Run:  CIRCLE_API_KEY=TEST_API_KEY:... pnpm exec tsx scripts/register-circle-secret.ts
 *  Reuse an existing secret instead of generating: also pass CIRCLE_ENTITY_SECRET=...
 */
async function main() {
  const apiKey = process.env.CIRCLE_API_KEY;
  if (!apiKey) {
    console.error("ERROR: set CIRCLE_API_KEY first (your existing Circle API key).");
    console.error("  CIRCLE_API_KEY=TEST_API_KEY:xxxx pnpm exec tsx scripts/register-circle-secret.ts");
    process.exit(1);
  }

  console.log("Registering Entity Secret with Circle (one-time)...");
  const { entitySecret, recoveryFile } = await registerCircleEntitySecret(apiKey, process.env.CIRCLE_ENTITY_SECRET);

  console.log("\n✅ Registered. Add this to your Railway environment variables:\n");
  console.log("  CIRCLE_ENTITY_SECRET=" + entitySecret);
  console.log("\n(Your CIRCLE_API_KEY stays as-is.)");
  console.log("\nRecovery file saved to ./circle-recovery-file.dat — store it somewhere safe,");
  console.log("then DELETE it from this repo (never commit it). recoveryFile bytes:", recoveryFile.length);
}

main().catch((e) => {
  console.error("\n❌ Registration failed:", e?.response?.data ?? String(e));
  console.error("\nIf it says the entity secret is already registered, you've done this before —");
  console.error("just reuse the CIRCLE_ENTITY_SECRET you saved previously. To rotate, use the recovery file.");
  process.exit(1);
});
