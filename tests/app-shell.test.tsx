import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import HomePage from "../src/app/page";

describe("Seller Shield application shell", () => {
  it("identifies the product without presenting unimplemented product data", () => {
    const html = renderToStaticMarkup(<HomePage />);

    expect(html).toContain("Seller Shield");
    expect(html).toContain("셀러방패");
    expect(html).toContain("MVP development shell");
    expect(html).toContain("No cases or marketplace data are available yet.");
  });
});
