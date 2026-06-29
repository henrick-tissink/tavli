/**
 * /u/[sendId]/[token] — §11 §11.3 RFC 8058 one-click unsubscribe.
 *   GET  — renders a confirm page (does NOT revoke; email-client prefetchers
 *          fire GETs, so revoking on GET would mass-unsubscribe).
 *   POST — revokes consent + suppresses (List-Unsubscribe-Post compliant clients
 *          POST directly when the diner clicks the inbox "Unsubscribe").
 */
import { NextRequest, NextResponse } from "next/server";
import { unsubscribeHandler } from "@/lib/marketing/links";

function page(title: string, body: string): NextResponse {
  const html = `<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#FAFAF9;color:#1C1917;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.card{background:#fff;border:1px solid #E7E5E4;border-radius:16px;padding:40px;max-width:420px;text-align:center}
h1{font-family:Georgia,serif;font-size:24px;margin:0 0 12px}p{color:#78716C;line-height:1.6}
button{background:#F97316;color:#fff;border:0;border-radius:10px;padding:12px 24px;font-weight:700;font-size:15px;cursor:pointer;margin-top:16px}</style></head>
<body><div class="card"><h1>Tavli</h1>${body}</div></body></html>`;
  return new NextResponse(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ sendId: string; token: string }> },
) {
  const { sendId, token } = await params;
  const { valid } = await unsubscribeHandler.verify(sendId, token);
  if (!valid) {
    return page("Link invalid", `<p>Acest link de dezabonare nu este valid sau a expirat.</p>`);
  }
  return page(
    "Dezabonare",
    `<p>Vrei să te dezabonezi de la mesajele de marketing?</p>
     <form method="POST"><button type="submit">Dezabonează-mă</button></form>`,
  );
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ sendId: string; token: string }> },
) {
  const { sendId, token } = await params;
  const { ok } = await unsubscribeHandler.unsubscribe(sendId, token);
  if (!ok) {
    return page("Link invalid", `<p>Nu am putut procesa dezabonarea. Linkul poate fi invalid.</p>`);
  }
  return page(
    "Te-ai dezabonat",
    `<p>Nu vei mai primi mesaje de marketing pe acest canal. Dacă te-ai răzgândit, contactează restaurantul pentru a te reabona.</p>`,
  );
}
