import { section } from "../components.mjs";

export default {
  path: "/404.html",
  file: "404.html",
  title: "Page not found",
  description: "This page does not exist.",
  noindex: true,
  body: () => `
${section({
  id: "nf",
  body: `<div class="notfound"><p class="eyebrow">404</p><h1>That page is not here.</h1>
<p class="lead" style="margin-top:20px">It may have moved, or the link may be wrong.</p>
<div class="btn-row"><a class="btn btn--primary" href="/">Go to the home page</a><a class="btn btn--secondary" href="/product/">See how Orynt works</a></div></div>`,
})}
`,
};
