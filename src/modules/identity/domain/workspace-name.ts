export function requireWorkspaceName(input: unknown): string {
  if (typeof input === "string") {
    // Match PostgreSQL btrim(text)'s ASCII-space boundary, not JS Unicode trim.
    const name = input.replace(/^ +| +$/g, "");
    if (!name.includes("\0") && Array.from(name).length >= 1 && Array.from(name).length <= 80) return name;
  }
  throw new Error("Workspace name requires 1–80 characters.");
}
