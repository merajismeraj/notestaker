import assert from "node:assert/strict";
import { test } from "node:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";

process.env.NOTESTAKER_DB = "memory";
process.env.GOOGLE_CLIENT_IDS = "web-client,ios-client";
process.env.APPLE_BUNDLE_IDS = "com.notestaker.app";
process.env.AUTH_SECRET = "x".repeat(40);

const { verifyApple, verifyGoogle, sha256Hex } = await import("../src/server/identity");
const accounts = await import("../src/server/accounts");
const { issueSession, readSession } = await import("../src/server/session");
const { db } = await import("../src/server/db");

// A local "Google"/"Apple" signing key standing in for their JWKS endpoints.
const { privateKey, publicKey } = await generateKeyPair("RS256");
const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" }] });
const sign = (claims: Record<string, unknown>, iss: string, aud: string, exp = "5m") =>
  new SignJWT(claims).setProtectedHeader({ alg: "RS256", kid: "k1" }).setIssuer(iss).setAudience(aud)
    .setSubject(String(claims.sub)).setIssuedAt().setExpirationTime(exp).sign(privateKey);

test("Google tokens: accepts any configured client, rejects wrong audience and expiry", async () => {
  const ok = await sign({ sub: "g1", email: "Priya@Acme.com", email_verified: true, name: "Priya" }, "https://accounts.google.com", "ios-client");
  assert.deepEqual(await verifyGoogle(ok, jwks), { sub: "g1", email: "priya@acme.com", emailVerified: true, name: "Priya" });
  await assert.rejects(verifyGoogle(await sign({ sub: "g1" }, "https://accounts.google.com", "someone-else"), jwks));
  await assert.rejects(verifyGoogle(await sign({ sub: "g1" }, "https://accounts.google.com", "web-client", "-1m"), jwks));
});

test("Apple tokens: nonce must match the hash of the app's raw nonce", async () => {
  const token = await sign({ sub: "a1", email: "x@privaterelay.appleid.com", email_verified: "true", nonce: await sha256Hex("raw-123") }, "https://appleid.apple.com", "com.notestaker.app");
  assert.equal((await verifyApple(token, "raw-123", jwks)).emailVerified, true);
  await assert.rejects(verifyApple(token, "replayed-nonce", jwks), /nonce/);
});

test("one account across Google, Apple and email when emails are verified", async () => {
  const g = await accounts.upsertUser("google", { sub: "g-100", email: "sam@acme.com", emailVerified: true, name: "Sam" });
  assert.equal(await accounts.upsertUser("apple", { sub: "a-100", email: "sam@acme.com", emailVerified: true, name: null }), g);
  assert.equal(await accounts.upsertEmailUser("sam@acme.com"), g);
  // Unverified email never links (someone else could claim that address)
  const other = await accounts.upsertUser("google", { sub: "g-200", email: "sam@acme.com", emailVerified: false, name: null });
  assert.notEqual(other, g);
});

test("new users get a Pro trial; it lapses to Free; overrides win", async () => {
  const id = await accounts.upsertEmailUser("trial@acme.com");
  let a = (await accounts.account(id))!;
  assert.equal(a.plan, "pro");
  assert.ok(a.trialEndsAt);
  await (await db()).query(`update users set trial_ends_at = now() - interval '1 day' where id = $1`, [id]);
  a = (await accounts.account(id))!;
  assert.equal(a.plan, "free");
  assert.equal(a.trialEndsAt, null);
  process.env.PLAN_OVERRIDES = "trial@acme.com:team";
  assert.equal((await accounts.account(id))!.plan, "team");
  process.env.PLAN_OVERRIDES = "trial@acme.com:free";
  await (await db()).query(`update users set trial_ends_at = now() + interval '3 days' where id = $1`, [id]);
  assert.deepEqual([(await accounts.account(id))!.plan, (await accounts.account(id))!.trialEndsAt], ["free", null]);
  delete process.env.PLAN_OVERRIDES;
});

test("quotas: AI minutes, meeting length and cloud audio", async () => {
  const id = await accounts.upsertEmailUser("free@acme.com");
  await (await db()).query(`update users set trial_ends_at = null where id = $1`, [id]);
  let a = (await accounts.account(id))!;
  assert.equal(a.plan, "free");
  assert.equal(accounts.checkMinutes(a, 30 * 60), null);
  assert.equal(accounts.checkMinutes(a, 46 * 60)?.limit, "maxMeetingMinutes");

  await accounts.recordUsage(id, { aiMinutes: a.limits.aiMinutesPerMonth });
  a = (await accounts.account(id))!;
  assert.equal(accounts.checkMinutes(a, 60)?.limit, "aiMinutesPerMonth");

  assert.equal(accounts.audioSecondsLeft(a), 120 * 60);
  await accounts.recordUsage(id, { audioSeconds: 119 * 60 });
  await accounts.recordUsage(id, { audioSeconds: 60 });
  a = (await accounts.account(id))!;
  assert.equal(accounts.audioSecondsLeft(a), 0);
  assert.equal(accounts.checkAudio(a)?.code, "quota");
});

test("email codes: single use, throttled, wrong guesses capped", async () => {
  const code = (await accounts.createEmailCode("otp@acme.com"))!;
  assert.match(code, /^\d{6}$/);
  assert.equal(await accounts.createEmailCode("otp@acme.com"), null, "resend is throttled");
  assert.equal(await accounts.consumeEmailCode("otp@acme.com", "000000" === code ? "111111" : "000000"), false);
  assert.equal(await accounts.consumeEmailCode("otp@acme.com", code), true);
  assert.equal(await accounts.consumeEmailCode("otp@acme.com", code), false, "single use");

  await (await db()).query(`update email_codes set sent_at = now() - interval '1 hour'`);
  const c2 = (await accounts.createEmailCode("brute@acme.com"))!;
  for (let i = 0; i < 5; i++) await accounts.consumeEmailCode("brute@acme.com", c2 === "999999" ? "888888" : "999999");
  assert.equal(await accounts.consumeEmailCode("brute@acme.com", c2), false, "locked after 5 wrong guesses");
});

test("session tokens round-trip via bearer and cookie; tampering fails", async () => {
  const { token } = await issueSession("u_test");
  assert.equal(await readSession(new Request("http://x", { headers: { authorization: `Bearer ${token}` } })), "u_test");
  assert.equal(await readSession(new Request("http://x", { headers: { cookie: `a=1; nt_session=${token}` } })), "u_test");
  assert.equal(await readSession(new Request("http://x", { headers: { authorization: `Bearer ${token}x` } })), null);
});
