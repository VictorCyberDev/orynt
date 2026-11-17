import { section } from "../components.mjs";

// The old /use-cases/ address is kept so existing links do not break; the content now lives on /solutions/.
export default {
  path: "/use-cases/",
  title: "Use cases have moved",
  description: "This page has moved to Solutions.",
  noindex: true,
  headExtra: '<meta http-equiv="refresh" content="0; url=/solutions/">',
  body: () => `
${section({
  id: "moved",
  body: `<div class="notfound"><p class="eyebrow">Moved</p><h1>Use cases are now Solutions.</h1>
<p class="lead" style="margin-top:20px">The four target use cases, with the real features each workflow uses, are on the Solutions page.</p>
<div class="btn-row"><a class="btn btn--primary" href="/solutions/">Go to Solutions</a></div></div>`,
})}
`,
};
