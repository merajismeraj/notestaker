// Sends sign-in codes via Resend's HTTP API. Without RESEND_API_KEY, codes are
// logged to the server console in development (or when AUTH_DEV_LOG_CODES=1
// for local end-to-end tests) and refused everywhere else.
export async function sendSignInCode(email: string, code: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    const devLog = process.env.NODE_ENV !== "production" || process.env.AUTH_DEV_LOG_CODES === "1";
    if (!devLog || process.env.VERCEL) throw new Error("Email sign-in isn't configured (RESEND_API_KEY).");
    console.log(`[auth] sign-in code for ${email}: ${code}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.AUTH_EMAIL_FROM ?? "Notestaker <login@notestaker.app>",
      to: email,
      subject: `${code} is your Notestaker code`,
      text: `Your Notestaker sign-in code is ${code}. It expires in 10 minutes.\n\nIf you didn't request it, ignore this email.`,
    }),
  });
  if (!res.ok) throw new Error("Couldn't send the sign-in email.");
}
