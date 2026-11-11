import { describe, expect, it } from "vitest";
import { buildOpenApi, routes } from "../src";
describe("openapi", () => {
  it("builds every route with unique operationIds and problem responses", () => {
    const doc = buildOpenApi() as {
      paths: Record<string, Record<string, { operationId: string; responses: Record<string, unknown> }>>;
    };
    const ids = routes.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.keys(doc.paths)).toContain("/v1/obligations/{id}/execute");
    expect(doc.paths["/v1/obligations/{id}/execute"]!["post"]!.responses["default"]).toBeTruthy();
    expect(JSON.stringify(doc)).not.toMatch(/"type":"number"/); // no float money
  });
});
