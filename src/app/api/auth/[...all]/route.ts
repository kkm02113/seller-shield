import { toNextJsHandler } from "better-auth/next-js";

import { getAuth } from "@/platform/auth/auth";

export const runtime = "nodejs";

async function handle(request: Request) {
  let auth;
  try {
    auth = await getAuth();
  } catch {
    console.error("Authentication configuration unavailable; details redacted.");
    return Response.json({ error: "Authentication unavailable." }, { status: 503 });
  }
  const handlers = toNextJsHandler(auth);
  return request.method === "GET" ? handlers.GET(request) : handlers.POST(request);
}

export const GET = handle;
export const POST = handle;
