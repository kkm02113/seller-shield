import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getAuth } from "./auth.ts";

export async function requireUser() {
  let session;
  try {
    session = await (await getAuth()).api.getSession({ headers: await headers() });
  } catch {
    // Do not let a Server Component print SQL/token-bearing adapter errors.
    throw new Error("Authentication temporarily unavailable.");
  }
  if (!session) redirect("/sign-in");
  return session.user;
}

export async function requireOnboardedUser() {
  const user = await requireUser();
  if (user.name.trim() === "") redirect("/onboarding");
  return user;
}
