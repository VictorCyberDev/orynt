import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { OryntError } from "@orynt/core";
import type { Deps } from "../services/context";
import * as staff from "../services/staff";

/**
 * Internal support console API + a deliberately tiny UI. Mounted under /staff only; the customer cookie is never read here and the staff cookie is never read anywhere else.
 * Cookie: HttpOnly, SameSite=Strict, scoped to /staff. Writes need the per-session CSRF header. There are NO routes for wallets, secrets, approvals, payments or impersonation.
 */
const COOKIE = "orynt_staff";
const Login = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
  mfa_code: z.string().regex(/^\d{6}$/),
});
const Reply = z.object({
  body: z.string().min(1).max(4000),
  status: z.enum(["pending_customer", "resolved", "acknowledged"]).default("pending_customer"),
});
const Ref = z.object({ ref: z.string().regex(/^SUP-[0-9A-F]{8}$/) });
const Reason = z.object({ reason: z.string().min(8).max(300) });

export function registerStaff(app: FastifyInstance, d: Deps, problem: (...a: any[]) => any) {
  const ctxOf = async (req: FastifyRequest, write: boolean): Promise<staff.StaffCtx> => {
    const tok = (req.cookies as Record<string, string | undefined>)[COOKIE];
    const s = tok ? await staff.staffFromToken(d, tok) : null;
    if (!s) throw new OryntError("unauthenticated", 401, "Staff sign-in required.");
    if (write && req.headers["x-staff-csrf"] !== s.csrf)
      throw new OryntError("forbidden", 403, "Missing or wrong CSRF token.");
    return s;
  };
  const wrap =
    (fn: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>) =>
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        return await fn(req, reply);
      } catch (e) {
        if (e instanceof OryntError) return problem(reply, req, e.status, e.code, e.message, e.extra ?? {});
        if (e instanceof z.ZodError)
          return problem(reply, req, 422, "validation_failed", "The request is not valid.");
        throw e;
      }
    };
  const tight = { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } };

  app.post(
    "/staff/api/login",
    tight,
    wrap(async (req, reply) => {
      const b = Login.parse(req.body);
      const r = await staff.staffLogin(d, b.email, b.password, b.mfa_code);
      reply.setCookie(COOKIE, r.token, {
        httpOnly: true,
        sameSite: "strict",
        path: "/staff",
        secure: d.config.cookieSecure,
        maxAge: 8 * 3600,
      });
      return { staff: r.staff, csrf_token: r.csrf };
    }),
  );
  app.post(
    "/staff/api/logout",
    wrap(async (req, reply) => {
      await staff.staffLogout(d, await ctxOf(req, true));
      reply.clearCookie(COOKIE, { path: "/staff" });
      return { ok: true };
    }),
  );
  app.get(
    "/staff/api/me",
    wrap(async (req) => {
      const s = await ctxOf(req, false);
      return { staff: { id: s.id, email: s.email, name: s.name, role: s.role }, csrf_token: s.csrf };
    }),
  );
  app.get(
    "/staff/api/tickets",
    wrap(async (req) =>
      staff.listTickets(
        d,
        await ctxOf(req, false),
        z
          .object({ status: z.enum(["open", "acknowledged", "pending_customer", "resolved"]).optional() })
          .parse(req.query).status,
      ),
    ),
  );
  app.get(
    "/staff/api/tickets/:ref",
    wrap(async (req) => staff.getTicket(d, await ctxOf(req, false), Ref.parse(req.params).ref)),
  );
  app.post(
    "/staff/api/tickets/:ref/reply",
    wrap(async (req) => {
      const s = await ctxOf(req, true);
      const b = Reply.parse(req.body);
      await staff.replyTicket(d, s, Ref.parse(req.params).ref, b.body, b.status);
      return { ok: true };
    }),
  );
  app.get(
    "/staff/api/orgs/:id/summary",
    wrap(async (req) =>
      staff.orgSummary(
        d,
        await ctxOf(req, false),
        z.object({ id: z.string().uuid() }).parse(req.params).id,
        Reason.parse(req.query).reason,
      ),
    ),
  );

  // ---- minimal UI (same-origin script, no inline code: it runs under the strict CSP) ----
  app.get("/staff", async (_req, reply) => reply.type("text/html").send(PAGE));
  app.get("/staff/app.js", async (_req, reply) =>
    reply.type("application/javascript").header("cache-control", "no-store").send(SCRIPT),
  );
}

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Orynt support console</title>
<style>body{font:16px/1.5 system-ui,sans-serif;margin:0;background:#f6f7f9;color:#14181f}main{max-width:60rem;margin:0 auto;padding:1rem}h1{font-size:1.4rem}label{display:block;margin:.6rem 0 .2rem;font-weight:600}input,textarea,select{font:inherit;width:100%;padding:.5rem;border:1px solid #6b7686;border-radius:6px;box-sizing:border-box}button{font:inherit;padding:.5rem 1rem;border-radius:6px;border:1px solid #14181f;background:#14181f;color:#fff;cursor:pointer}button.secondary{background:#fff;color:#14181f}li{margin:.4rem 0}.muted{color:#4a5565}.err{color:#a40000}.banner{background:#fff3cd;border:1px solid #8a6d00;padding:.6rem;border-radius:6px}a{color:#0b4fd1}:focus-visible{outline:3px solid #0b4fd1;outline-offset:2px}@media (prefers-color-scheme:dark){body{background:#12151a;color:#eef1f5}input,textarea,select{background:#1b2028;color:#eef1f5;border-color:#9aa6b6}button{background:#eef1f5;color:#12151a;border-color:#eef1f5}button.secondary{background:#12151a;color:#eef1f5}.muted{color:#b4bfcd}a{color:#8ab4ff}.banner{background:#3a3000;color:#fff3cd}}</style></head>
<body><main><h1>Orynt support console</h1><p class="banner" role="note">Internal use. Every action, including every read, is recorded with your name. Never ask customers for wallet credentials, seed words or private keys. This console cannot send payments, approve payouts or act as a customer.</p><div id="app" aria-live="polite"></div></main><script src="/staff/app.js"></script></body></html>`;

// plain DOM, textContent only (no innerHTML): ticket text is customer-supplied and must never be interpreted as markup
const SCRIPT = `(()=>{"use strict";const app=document.getElementById("app");let csrf="";
const el=(t,p,...k)=>{const e=document.createElement(t);for(const[a,v]of Object.entries(p||{})){if(a==="class")e.className=v;else if(a==="text")e.textContent=v;else if(a.startsWith("on"))e.addEventListener(a.slice(2),v);else e.setAttribute(a,v)}for(const c of k)if(c)e.append(c);return e};
const api=async(m,u,b)=>{const r=await fetch(u,{method:m,credentials:"same-origin",headers:{"content-type":"application/json","x-staff-csrf":csrf},body:b?JSON.stringify(b):undefined});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.detail||"Request failed");return j};
const show=(...n)=>{app.replaceChildren(...n)};const field=(id,label,type="text")=>{const i=el("input",{id,type,autocomplete:type==="password"?"current-password":"off"});return[el("label",{for:id,text:label}),i,i]};
function login(msg){const[l1,i1]=field("e","Email");const[l2,i2]=field("p","Password","password");const[l3,i3]=field("c","Authenticator code");i3.setAttribute("inputmode","numeric");i3.setAttribute("maxlength","6");const err=el("p",{class:"err",role:"alert",text:msg||""});
show(el("h2",{text:"Sign in"}),l1,i1,l2,i2,l3,i3,err,el("button",{type:"button",text:"Sign in",onclick:async()=>{try{const r=await api("POST","/staff/api/login",{email:i1.value,password:i2.value,mfa_code:i3.value});csrf=r.csrf_token;tickets()}catch(e){login(e.message)}}}))}
async function tickets(){try{const j=await api("GET","/staff/api/tickets");const ul=el("ul",{});for(const t of j.data){const a=el("a",{href:"#"+t.reference,text:t.reference+" — "+t.subject});a.addEventListener("click",ev=>{ev.preventDefault();ticket(t.reference)});ul.append(el("li",{},a,el("span",{class:"muted",text:" ["+t.status+"] "+t.category+(t.org_name?" · "+t.org_name:"")})))}
show(el("h2",{text:"Support requests"}),j.data.length?ul:el("p",{class:"muted",text:"No requests."}),orgLookup(),el("button",{type:"button",class:"secondary",text:"Sign out",onclick:async()=>{await api("POST","/staff/api/logout");login()}}))}catch{login()}}
function orgLookup(){const[l1,i1]=field("o","Organisation id");const[l2,i2]=field("r","Reason for looking (recorded)");const out=el("pre",{class:"muted"});return el("section",{},el("h2",{text:"Organisation summary"}),l1,i1,l2,i2,el("button",{type:"button",text:"Look up",onclick:async()=>{try{out.textContent=JSON.stringify(await api("GET","/staff/api/orgs/"+encodeURIComponent(i1.value)+"/summary?reason="+encodeURIComponent(i2.value)),null,2)}catch(e){out.textContent=e.message}}}),out)}
async function ticket(ref){const t=await api("GET","/staff/api/tickets/"+ref);const msgs=el("ul",{});for(const m of t.messages)msgs.append(el("li",{text:(m.author==="staff"?"Support"+(m.staff?" ("+m.staff+")":""):"Customer")+": "+m.body}));
const ta=el("textarea",{id:"b",rows:"4",maxlength:"4000"});const sel=el("select",{id:"s"});for(const[v,l]of[["pending_customer","Waiting for customer"],["resolved","Resolved"],["acknowledged","Acknowledged"]])sel.append(el("option",{value:v,text:l}));const err=el("p",{class:"err",role:"alert"});
show(el("button",{type:"button",class:"secondary",text:"← Back",onclick:tickets}),el("h2",{text:t.reference+" — "+t.subject}),el("p",{class:"muted",text:"Status: "+t.status+" · "+t.category+" · "+t.email+(t.org?" · "+t.org.name:"")}),el("p",{text:t.body}),el("h3",{text:"Safe diagnostics"}),el("pre",{class:"muted",text:JSON.stringify(t.diagnostics,null,2)}),el("h3",{text:"Conversation"}),msgs,el("label",{for:"b",text:"Reply"}),ta,el("label",{for:"s",text:"Then set status"}),sel,err,
el("button",{type:"button",text:"Send reply",onclick:async()=>{try{await api("POST","/staff/api/tickets/"+ref+"/reply",{body:ta.value,status:sel.value});ticket(ref)}catch(e){err.textContent=e.message}}}))}
api("GET","/staff/api/me").then(r=>{csrf=r.csrf_token;tickets()}).catch(()=>login())})();`;
