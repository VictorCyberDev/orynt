import { z } from "zod";
import { routes, type RouteSpec } from "./routes";
import { Problem } from "./schemas";

const toSchema = (s: z.ZodTypeAny) => {
  const j = z.toJSONSchema(s, { target: "draft-2020-12", io: "output", unrepresentable: "any" }) as Record<
    string,
    unknown
  >;
  delete j["$schema"];
  return j;
};
const oasPath = (p: string) => p.replace(/:([A-Za-z_]+)/g, "{$1}");

function paramsOf(spec: RouteSpec) {
  const out: unknown[] = [];
  const add = (schema: z.ZodTypeAny | undefined, where: "path" | "query") => {
    if (!schema) return;
    const js = toSchema(schema) as { properties?: Record<string, unknown>; required?: string[] };
    for (const [name, sch] of Object.entries(js.properties ?? {})) {
      out.push({
        name,
        in: where,
        required: where === "path" || (js.required ?? []).includes(name),
        schema: sch,
      });
    }
  };
  add(spec.params, "path");
  add(spec.query, "query");
  if (spec.idempotency)
    out.push({
      name: "Idempotency-Key",
      in: "header",
      required: spec.idempotency === "required",
      schema: { type: "string", minLength: 8, maxLength: 120 },
      description:
        "Retrying with the same key replays the original response; reusing it with a different body is rejected.",
    });
  return out;
}

export function buildOpenApi(version = "0.1.0") {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const r of routes) {
    const p = (paths[oasPath(r.path)] ??= {});
    p[r.method.toLowerCase()] = {
      operationId: r.id,
      summary: r.summary,
      tags: r.tags,
      security: r.auth === "public" ? [] : [{ bearerApiKey: [] }, { sessionCookie: [] }],
      "x-orynt-required-permission": r.auth === "public" || r.auth === "any" ? null : r.auth,
      parameters: paramsOf(r),
      ...(r.body
        ? { requestBody: { required: true, content: { "application/json": { schema: toSchema(r.body) } } } }
        : {}),
      responses: {
        [String(r.success.status)]: {
          description: "Success",
          content: { "application/json": { schema: toSchema(r.success.schema) } },
        },
        ...(r.id === "executeObligation"
          ? {
              "202": {
                description:
                  "Accepted — the payment outcome is not yet certain (UNKNOWN/RECONCILING). Do NOT send again; poll the obligation.",
                content: { "application/json": { schema: toSchema(r.success.schema) } },
              },
            }
          : {}),
        default: {
          description: "RFC 7807 problem",
          content: { "application/problem+json": { schema: toSchema(Problem) } },
        },
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Orynt API",
      version,
      description:
        "Payment authorization and settlement truth for Lightning payouts. Amounts are integer millisatoshi strings. All errors are RFC 7807 problems with a stable `code`.",
      license: { name: "Apache-2.0" },
    },
    servers: [{ url: "http://127.0.0.1:8787", description: "Local development" }],
    tags: [...new Set(routes.flatMap((r) => r.tags))].map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        bearerApiKey: {
          type: "http",
          scheme: "bearer",
          description: "API key: `Authorization: Bearer orynt_…`",
        },
        sessionCookie: { type: "apiKey", in: "cookie", name: "orynt_session" },
      },
    },
  };
}
