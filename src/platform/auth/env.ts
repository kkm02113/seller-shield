export type AuthEnvironment = Readonly<{ secret: string; baseURL: string }>;

export function requireAuthEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): AuthEnvironment {
  const secret = environment.BETTER_AUTH_SECRET?.trim();
  if (!secret || secret.length < 32 || secret.startsWith("replace-with-")) {
    throw new Error("BETTER_AUTH_SECRET requires a non-placeholder secret of at least 32 characters.");
  }

  try {
    const url = new URL(environment.BETTER_AUTH_URL?.trim() ?? "");
    const localHTTP = url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((!localHTTP && url.protocol !== "https:") ||
        url.username || url.password || url.search || url.hash || url.pathname !== "/") {
      throw new Error("Invalid base origin.");
    }
    return { secret, baseURL: url.origin };
  } catch {
    throw new Error("BETTER_AUTH_URL requires an HTTPS origin or a local HTTP origin.");
  }
}
