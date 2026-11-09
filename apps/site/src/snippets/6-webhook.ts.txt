import { verifyWebhook, WebhookSignatureError } from "@orynt/sdk";

// Works with any runtime that gives you the raw request body (here: a fetch-style handler).
export async function POST(request: Request): Promise<Response> {
  const raw = await request.text(); // the exact bytes; do not re-serialise parsed JSON
  try {
    const event = verifyWebhook(
      raw,
      request.headers.get("orynt-signature") ?? "",   // format: t=<unix seconds>,v1=<hex hmac>
      process.env.ORYNT_WEBHOOK_SECRET!,              // shown once when you create the endpoint
    );
    // Delivery is at-least-once: de-duplicate on event.id.
    if (event.type === "payment.settled") {
      // mark your own record as paid
    }
    return new Response("ok");
  } catch (err) {
    if (err instanceof WebhookSignatureError) return new Response("bad signature", { status: 400 });
    throw err;
  }
}
