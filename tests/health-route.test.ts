import { describe, expect, it } from "vitest";

import { GET } from "../src/app/api/health/route";

describe("GET /api/health", () => {
  it("reports only application process health", async () => {
    const response = GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      service: "seller-shield",
      scope: "process",
    });
  });
});
