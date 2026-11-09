// Search-engine pages. The Worker serves every public page with its own title, description,
// canonical URL, hreflang links, social card and schema.org data, plus the story text itself in
// the HTML, so Google and link previews see real content before the app starts. Also: sitemaps,
// a Google News sitemap, robots.txt and an RSS feed.
// Bengali pages live at the bare addresses; English under /en/, Hindi under /hi/.
import { ABOUT, LEGAL, LEGAL_ORDER, LEGAL_UPDATED } from "./legal.js";
import { listPublished, getBySlug, textBlocks, isPublic, tagSlug, WRITERS, writer } from "./store.js";
import { LANGS, PAGE_LANGS, localiseArticles, articleTranslations, localisePage } from "./translate.js";
import { DESKS } from "./feeds.js";

const DEFAULT = "bn";
const LOCALES = { bn: "bn-IN", en: "en-IN", hi: "hi-IN" };
export const prefixed = (lang, path) => lang === DEFAULT ? path : `/${lang}${path === "/" ? "" : path}`;
export const DESK_SLUGS = { Kolkata: "kolkata", "West Bengal": "west-bengal", India: "india", "Probashi Bangali": "probashi-bangali", World: "world", Entertainment: "entertainment", Sports: "sports", Lifestyle: "lifestyle" };
const DESK_NAMES = {
  bn: { Kolkata: "কলকাতা", "West Bengal": "পশ্চিমবঙ্গ", India: "ভারত", "Probashi Bangali": "প্রবাসী বাঙালি", World: "বিশ্ব", Entertainment: "বিনোদন", Sports: "খেলা", Lifestyle: "জীবনধারা" },
  en: { Kolkata: "Kolkata", "West Bengal": "West Bengal", India: "India", "Probashi Bangali": "Probashi Bangali", World: "World", Entertainment: "Entertainment", Sports: "Sports", Lifestyle: "Lifestyle" },
  hi: { Kolkata: "कोलकाता", "West Bengal": "पश्चिम बंगाल", India: "भारत", "Probashi Bangali": "प्रवासी बंगाली", World: "दुनिया", Entertainment: "मनोरंजन", Sports: "खेल", Lifestyle: "जीवनशैली" }
};
const SITE = { bn: "রাষ্ট্রিক্স ২৪×৭ নিউজ", en: "Rashtrix 24×7 News", hi: "राष्ट्रिक्स 24×7 न्यूज़" };
const HOME = {
  bn: { title: "রাষ্ট্রিক্স ২৪×৭ নিউজ — কলকাতা, পশ্চিমবঙ্গ, ভারত আর বিশ্বের খবর বাংলায়", description: "কলকাতার খবর, পশ্চিমবঙ্গের খবর, ভারত, প্রবাসী বাঙালি আর বিশ্বের সর্বশেষ খবর, লাইভ কভারেজ আর অ্যালার্ট — রাষ্ট্রিক্স ২৪×৭ নিউজ। দেশ প্রথম । বলিদান পরম ধর্ম।", latest: "সর্বশেষ খবর" },
  en: { title: "Rashtrix 24×7 News — Kolkata, West Bengal, India and world news", description: "Latest news from Kolkata, West Bengal, India, Bengalis abroad and the world, with live coverage and alerts, from Rashtrix 24×7 News in Bengali, English and Hindi.", latest: "Latest news" },
  hi: { title: "राष्ट्रिक्स 24×7 न्यूज़ — कोलकाता, पश्चिम बंगाल, भारत और दुनिया की खबरें", description: "कोलकाता, पश्चिम बंगाल, भारत, प्रवासी बंगाली और दुनिया की ताज़ा खबरें, लाइव कवरेज और अलर्ट — राष्ट्रिक्स 24×7 न्यूज़।", latest: "ताज़ा खबरें" }
};
const OG_IMAGE = "/og-image.jpg";

const esc = (s = "") => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const xml = esc;
const clip = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s; };
const abs = (origin, path) => !path ? "" : /^https?:\/\//.test(path) ? path : origin + (path.startsWith("/") ? path : "/" + path);
const ld = data => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
const fmtDate = (iso, lang = DEFAULT) => iso ? new Date(iso).toLocaleDateString(LOCALES[lang], { timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric" }) : "";
const kindLabel = (k, lang) => k === "brief" ? { bn: "সংক্ষেপে", en: "Brief", hi: "संक्षेप में" }[lang] : k === "rewrite" ? { bn: "রাষ্ট্রিক্স ওয়্যার", en: "Rashtrix Wire", hi: "राष्ट्रिक्स वायर" }[lang] : "";

export const origin = (request, env) => String(env.SITE_URL || new URL(request.url).origin).replace(/\/+$/, "");

function organization(o) {
  return { "@type": "NewsMediaOrganization", "@id": `${o}/#organization`, name: SITE.en, url: `${o}/`,
    alternateName: [SITE.bn, SITE.hi, "Rashtrix", "রাষ্ট্রিক্স"], slogan: "দেশ প্রথম । বলিদান পরম ধর্ম",
    knowsLanguage: ["bn-IN", "en-IN", "hi-IN"], foundingLocation: { "@type": "Place", name: "Kolkata, West Bengal, India" },
    areaServed: [{ "@type": "State", name: "West Bengal" }, { "@type": "Country", name: "India" }],
    publishingPrinciples: `${o}/disclaimer`, correctionsPolicy: `${o}/corrections`, actionableFeedbackPolicy: `${o}/grievance`,
    founder: { "@type": "Person", name: "Ilmaz Syed", jobTitle: "Founder and Editor-in-Chief" },
    logo: { "@type": "ImageObject", url: `${o}/icon-512.png`, width: 512, height: 512 }, sameAs: ["https://www.rashtrix.live"] };
}
function personLd(o, w) {
  return w.isDesk
    ? { "@type": "Organization", "@id": `${o}/author/${w.key}#desk`, name: w.name, url: `${o}/author/${w.key}`, logo: `${o}${w.portrait}` }
    : { "@type": "Person", "@id": `${o}/author/${w.key}#person`, name: w.name, jobTitle: w.role, url: `${o}/author/${w.key}`, ...(w.portrait?.startsWith("/") ? { image: `${o}${w.portrait}` } : {}), description: w.bio, worksFor: { "@id": `${o}/#organization` } };
}
const breadcrumbs = (o, items) => ({ "@type": "BreadcrumbList", itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: abs(o, path) })) });

/* ---------- Server-rendered content (replaced by the app once it starts) ---------- */
function blocksHTML(blocks) {
  let html = "", list = [];
  const flush = () => { if (list.length) { html += `<ul>${list.map(x => `<li>${esc(x)}</li>`).join("")}</ul>`; list = []; } };
  for (const b of blocks) {
    if (b.t === "li") { list.push(b.x); continue; }
    flush();
    html += b.t === "h" ? `<h2>${esc(b.x)}</h2>` : `<p>${esc(b.x)}</p>`;
  }
  flush();
  return html;
}
const ssrNav = lang => `<nav class="ssr-nav" aria-label="Sections"><a href="${prefixed(lang, "/")}">${{ bn: "প্রথম পাতা", en: "Home", hi: "होम" }[lang]}</a> ${DESKS.map(d => `<a href="${prefixed(lang, `/desk/${DESK_SLUGS[d]}`)}">${DESK_NAMES[lang][d]}</a>`).join(" ")} <a href="${prefixed(lang, "/live")}">${{ bn: "সর্বশেষ", en: "Latest", hi: "ताज़ा" }[lang]}</a></nav>`;
const ssrShell = (inner, lang) => `<div class="ssr"><header><a class="ssr-brand" href="${prefixed(lang, "/")}">RASHTRIX <span>24X7 NEWS</span></a>${ssrNav(lang)}</header><main>${inner}</main></div>`;
const storyList = (stories, lang) => `<ul class="ssr-list">${stories.map(s => `<li><a href="${prefixed(lang, s.href)}">${esc(s.title)}</a> <small>${esc(DESK_NAMES[lang][s.category] || s.category)}${kindLabel(s.kind, lang) ? ` · ${kindLabel(s.kind, lang)}` : ""} · ${fmtDate(s.publishedAt, lang)}</small>${s.dek ? `<p>${esc(s.dek)}</p>` : ""}</li>`).join("")}</ul>`;

async function allTags(env) {
  const seen = new Map();
  for (const a of await listPublished(env, { limit: 1000 })) for (const t of a.tags) if (!seen.has(tagSlug(t))) seen.set(tagSlug(t), { name: t, slug: tagSlug(t) });
  return [...seen.values()];
}

/* ---------- Page definitions ---------- */
async function pageFor(path, url, env, o, lang) {
  const [section, arg] = path.split("/").filter(Boolean).map(decodeURIComponent);
  const site = SITE[lang];

  if (!section) {
    const stories = await localiseArticles(env, lang, await listPublished(env, { limit: 40 })), t = HOME[lang];
    return { title: t.title, description: t.description, alternates: LANGS,
      ld: [{ "@context": "https://schema.org", "@graph": [organization(o),
        { "@type": "WebSite", "@id": `${o}${prefixed(lang, "/")}#website`, url: o + prefixed(lang, "/"), name: site, description: t.description, inLanguage: LOCALES[lang], publisher: { "@id": `${o}/#organization` },
          potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `${o}${prefixed(lang, "/search")}?q={search_term_string}` }, "query-input": "required name=search_term_string" } },
        { "@type": "ItemList", itemListElement: stories.slice(0, 10).map((s, i) => ({ "@type": "ListItem", position: i + 1, url: o + prefixed(lang, s.href) })) }] }],
      body: `<h1>${esc(t.title)}</h1><p>${esc(t.description)}</p><h2>${esc(t.latest)}</h2>${storyList(stories, lang)}` };
  }

  if (section === "install") return { title: `${site}`, description: HOME[lang].description, noindex: true, body: `<h1>${esc(site)}</h1>` };

  if ((section === "article" || section === "edition") && arg) {
    let a = await getBySlug(env, arg);
    if (!isPublic(a)) return { status: 404, title: `404 · ${site}`, description: "", noindex: true, body: `<h1>404</h1><p><a href="${prefixed(lang, "/")}">${esc(site)}</a></p>` };
    if (a.href !== path) return { redirect: prefixed(lang, a.href) };
    const versions = [a.lang];
    for (const l of LANGS) if (l !== a.lang && (await articleTranslations(env, l, [a])).size) versions.push(l);
    [a] = await localiseArticles(env, lang, [a]);
    // No version in this language: the page points search engines at the original.
    if (a.lang !== lang) return { canonicalPath: prefixed(a.lang, a.href), alternates: [], title: `${a.title} · ${site}`, description: clip(a.dek || a.title, 160), contentLang: LOCALES[a.lang], body: `<article><h1>${esc(a.title)}</h1>${a.dek ? `<p class="ssr-dek">${esc(a.dek)}</p>` : ""}${blocksHTML(textBlocks(a.body))}</article>` };
    // The share card: the story's own 1200×630 picture (src/ogcard.js).
    const w = writer(a.writer), image = `${o}/og/${encodeURIComponent(a.slug)}.jpg`;
    const blocks = textBlocks(a.body), words = blocks.reduce((n, b) => n + b.x.split(/\s+/).length, 0);
    const description = clip(a.dek || blocks.find(b => b.t === "p")?.x || a.title, 160);
    const here = prefixed(lang, a.href), desk = DESK_NAMES[lang][a.category] || a.category;
    return {
      alternates: versions, title: `${a.title} · ${site}`, ogTitle: a.title, description, image, imageCard: true, type: "article",
      article: { published: a.publishedAt, modified: a.updatedAt || a.publishedAt, section: desk, author: w.name, tags: a.tags },
      ld: [{ "@context": "https://schema.org", "@graph": [
        { "@type": a.kind === "article" ? "NewsArticle" : "ReportageNewsArticle", "@id": `${o}${here}#article`, mainEntityOfPage: `${o}${here}`, url: `${o}${here}`,
          headline: clip(a.title, 110), description, image: [image], datePublished: a.publishedAt, dateModified: a.correctedAt || a.updatedAt || a.publishedAt,
          author: [personLd(o, w)], publisher: { "@id": `${o}/#organization` }, articleSection: desk, keywords: [...a.tags, desk].filter(Boolean).join(", "),
          wordCount: words, inLanguage: LOCALES[lang], isAccessibleForFree: true,
          ...(a.lang !== a.original ? { translationOfWork: { "@id": `${o}${prefixed(a.original, a.href)}#article` } } : {}),
          ...(a.correctedAt ? { correction: { "@type": "CorrectionComment", text: a.correctionNote, datePublished: a.correctedAt } } : {}) },
        organization(o), breadcrumbs(o, [[site, prefixed(lang, "/")], [desk, prefixed(lang, `/desk/${DESK_SLUGS[a.category] || "world"}`)], [a.title, here]])] }],
      body: `<article><p class="ssr-kicker">${esc(desk)}${kindLabel(a.kind, lang) ? ` · ${esc(kindLabel(a.kind, lang))}` : ""}</p><h1>${esc(a.title)}</h1>${a.dek ? `<p class="ssr-dek">${esc(a.dek)}</p>` : ""}
        <p class="ssr-byline"><a href="${prefixed(lang, `/author/${w.key}`)}">${esc(w.name)}</a> · <time datetime="${esc(a.publishedAt)}">${fmtDate(a.publishedAt, lang)}</time></p>
        ${a.correctedAt ? `<p class="ssr-dek"><b>${{ bn: "সংশোধন", en: "Correction", hi: "सुधार" }[lang]}:</b> ${esc(a.correctionNote)}</p>` : ""}
        ${a.image ? `<img src="${esc(a.heroUrl || a.image)}" alt="" width="1600" height="1000">` : ""}${blocksHTML(blocks)}</article>`
    };
  }

  if (section === "desk" && arg) {
    const desk = DESKS.find(d => DESK_SLUGS[d] === arg);
    if (!desk) return { status: 404, title: `404 · ${site}`, description: "", noindex: true, body: "<h1>404</h1>" };
    const stories = (await localiseArticles(env, lang, await listPublished(env, { limit: 300 }))).filter(s => s.category === desk).slice(0, 60);
    const name = DESK_NAMES[lang][desk];
    const BN_OF = { Kolkata: "কলকাতার", "West Bengal": "পশ্চিমবঙ্গের", India: "ভারতের", "Probashi Bangali": "প্রবাসী বাঙালির", World: "বিশ্বের", Entertainment: "বিনোদনের", Sports: "খেলার", Lifestyle: "জীবনধারার" };
    const title = { bn: `${BN_OF[desk]} খবর · ${site}`, en: `${name} news · ${site}`, hi: `${name} समाचार · ${site}` }[lang];
    return { title, alternates: LANGS, description: clip(`${title}: ${stories.slice(0, 3).map(s => s.title).join("; ")}`, 160),
      ld: [{ "@context": "https://schema.org", "@graph": [{ "@type": "CollectionPage", url: o + prefixed(lang, `/desk/${arg}`), name: title, isPartOf: { "@id": `${o}/#website` },
        mainEntity: { "@type": "ItemList", itemListElement: stories.slice(0, 30).map((s, i) => ({ "@type": "ListItem", position: i + 1, url: o + prefixed(lang, s.href), name: s.title })) } }, breadcrumbs(o, [[site, prefixed(lang, "/")], [name, prefixed(lang, `/desk/${arg}`)]])] }],
      body: `<h1>${esc(name)}</h1>${storyList(stories, lang)}` };
  }

  if (section === "live" || section === "briefs") {
    const stories = (await localiseArticles(env, lang, await listPublished(env, { limit: 120 }))).filter(s => section === "briefs" ? s.kind === "brief" : true).slice(0, 60);
    const title = section === "briefs" ? { bn: "সংক্ষেপে: ১০০ শব্দে খবর", en: "Briefs: the news in 100 words", hi: "संक्षेप में: 100 शब्दों में खबर" }[lang] : { bn: "সর্বশেষ খবর", en: "Latest news", hi: "ताज़ा खबरें" }[lang];
    return { title: `${title} · ${site}`, alternates: LANGS, description: HOME[lang].description, body: `<h1>${esc(title)}</h1>${storyList(stories, lang)}` };
  }

  if (section === "tag" && arg) {
    const t = (await allTags(env)).find(x => x.slug === arg);
    if (!t) return { status: 404, title: `404 · ${site}`, description: "", noindex: true, body: "<h1>404</h1>" };
    const stories = await localiseArticles(env, lang, await listPublished(env, { tag: t.name, limit: 200 }));
    return { title: `${t.name} · ${site}`, alternates: LANGS, description: clip(stories.slice(0, 3).map(x => x.title).join("; "), 160), body: `<h1>${esc(t.name)}</h1>${storyList(stories, lang)}` };
  }

  if (section === "author" && arg) {
    const w = WRITERS.find(x => x.key === arg);
    if (!w) return { status: 404, title: `404 · ${site}`, description: "", noindex: true, body: "<h1>404</h1>" };
    const stories = await localiseArticles(env, lang, await listPublished(env, { writerKey: w.key, limit: 200 }));
    return { title: `${w.name} · ${site}`, alternates: LANGS, description: clip(w.bio, 160), type: "profile",
      ld: [{ "@context": "https://schema.org", "@graph": [{ "@type": "ProfilePage", url: `${o}${prefixed(lang, `/author/${w.key}`)}`, mainEntity: personLd(o, w) }, organization(o)] }],
      body: `<h1>${esc(w.name)}</h1><p>${esc(w.role)}</p><p>${esc(w.bio)}</p>${storyList(stories, lang)}` };
  }

  if ((section === "about" || LEGAL[section]) && !arg) {
    const page = await localisePage(env, lang, section);
    const legal = section !== "about";
    if (page.lang !== lang) return { canonicalPath: `/en/${section}`, alternates: [], title: `${page.title} · ${site}`, description: page.description, contentLang: "en-IN", body: `<article><h1>${page.title}</h1>${page.html}</article>` };
    return { alternates: ["en", ...PAGE_LANGS.filter(l => l === lang || (l === "bn" && (ABOUT.bn || LEGAL[section]?.bn)))], title: `${page.title} · ${site}`, description: page.description,
      ld: [{ "@context": "https://schema.org", "@type": legal ? "WebPage" : "AboutPage", url: o + prefixed(lang, `/${section}`), name: page.title, ...(legal ? { dateModified: new Date(LEGAL_UPDATED).toISOString() } : { about: { "@id": `${o}/#organization` } }) }],
      body: `<article><h1>${esc(page.title)}</h1>${page.html}</article>` };
  }

  if (section === "community") {
    const { results } = await env.DB.prepare("SELECT p.id,p.title,p.topic,u.display_name AS author FROM community_posts p JOIN users u ON u.id=p.user_id WHERE p.status='published' ORDER BY p.created_at DESC LIMIT 50").all();
    const title = { bn: "কমিউনিটি", en: "Community", hi: "कम्युनिटी" }[lang];
    return { title: `${title} · ${site}`, alternates: LANGS, description: HOME[lang].description, body: `<h1>${title}</h1><ul class="ssr-list">${results.map(p => `<li><a href="${prefixed(lang, `/discussion/${encodeURIComponent(p.id)}`)}">${esc(p.title)}</a> <small>${esc(p.author)}</small></li>`).join("")}</ul>` };
  }
  if (section === "discussion" && arg) {
    const post = await env.DB.prepare("SELECT p.id,p.title,p.body,p.created_at AS createdAt,u.display_name AS author FROM community_posts p JOIN users u ON u.id=p.user_id WHERE p.id=? AND p.status='published'").bind(arg).first();
    if (!post) return { status: 404, title: `404 · ${site}`, description: "", noindex: true, body: "<h1>404</h1>" };
    const { results: replies } = await env.DB.prepare("SELECT r.body,u.display_name AS author FROM community_replies r JOIN users u ON u.id=r.user_id WHERE r.post_id=? ORDER BY r.created_at LIMIT 200").bind(arg).all();
    return { title: `${post.title} · ${site}`, ogTitle: post.title, description: clip(post.body, 160),
      ld: [{ "@context": "https://schema.org", "@type": "DiscussionForumPosting", url: `${o}${prefixed(lang, `/discussion/${encodeURIComponent(post.id)}`)}`, headline: clip(post.title, 110), text: clip(post.body, 2000), author: { "@type": "Person", name: post.author } }],
      body: `<article><h1>${esc(post.title)}</h1><p class="ssr-byline">${esc(post.author)}</p><p>${esc(post.body)}</p>${replies.map(r => `<p><b>${esc(r.author)}</b>: ${esc(r.body)}</p>`).join("")}</article>` };
  }
  if (section === "events") {
    const { results } = await env.DB.prepare("SELECT title,event_type AS eventType,starts_at AS startsAt FROM events WHERE status='published' AND starts_at>=? ORDER BY starts_at LIMIT 30").bind(new Date().toISOString()).all();
    const title = { bn: "অনুষ্ঠান", en: "Events", hi: "कार्यक्रम" }[lang];
    return { title: `${title} · ${site}`, alternates: LANGS, description: HOME[lang].description, body: `<h1>${title}</h1><ul class="ssr-list">${results.map(e => `<li>${esc(e.title)} <small>${fmtDate(e.startsAt, lang)}</small></li>`).join("")}</ul>` };
  }
  if (section === "coverage" && arg) {
    const item = await env.DB.prepare("SELECT id,slug,title,summary,status,started_at AS startedAt,ended_at AS endedAt,image_url AS imageUrl,social_url AS socialUrl FROM live_coverage WHERE slug=? AND status IN ('live','ended')").bind(arg).first();
    if (!item) return { status: 404, title: `404 · ${site}`, description: "", noindex: true, body: "<h1>404</h1>" };
    const { results: ups } = await env.DB.prepare("SELECT body,created_at AS createdAt FROM live_updates WHERE coverage_id=? ORDER BY created_at DESC LIMIT 50").bind(item.id).all();
    const iso = d => new Date(String(d).replace(" ", "T") + (/[zZ+]/.test(String(d)) ? "" : "Z")).toISOString();
    const pic = (item.status === "live" && item.socialUrl) || item.imageUrl || item.socialUrl, image = pic ? abs(o, pic) : "";
    return { title: `${item.status === "live" ? "LIVE: " : ""}${item.title} · ${site}`, ogTitle: item.title, description: clip(item.summary || ups[0]?.body || item.title, 160), image,
      ld: [{ "@context": "https://schema.org", "@type": "LiveBlogPosting", url: `${o}${prefixed(lang, `/coverage/${encodeURIComponent(item.slug)}`)}`, headline: clip(item.title, 110), coverageStartTime: item.startedAt, ...(item.endedAt ? { coverageEndTime: item.endedAt } : {}),
        publisher: organization(o), liveBlogUpdate: ups.map(u => ({ "@type": "BlogPosting", headline: clip(u.body, 110), articleBody: u.body, datePublished: iso(u.createdAt) })) }],
      body: `<article><h1>${esc(item.title)}</h1>${item.summary ? `<p>${esc(item.summary)}</p>` : ""}${ups.map(u => `<section>${blocksHTML(textBlocks(u.body))}</section>`).join("")}</article>` };
  }
  return null; // not a page this module renders
}

/* ---------- HTML ---------- */
export async function renderPage(request, env, ensureSchema) {
  const url = new URL(request.url), o = origin(request, env);
  const full = url.pathname.replace(/\/+$/, "") || "/";
  const lang = full.match(/^\/(en|hi)(?=\/|$)/)?.[1] || DEFAULT, path = full.replace(/^\/(en|hi)(?=\/|$)/, "") || "/";
  let page = null;
  if (env.DB) { try { await ensureSchema(env); page = await pageFor(path, url, env, o, lang); } catch (e) { console.error("seo", e?.stack || e); page = null; } }
  if (page?.redirect) return Response.redirect(o + page.redirect + url.search, 301);
  const shell = await env.ASSETS.fetch(new Request(new URL("/", request.url), { headers: request.headers }));
  if (!page) return new HTMLRewriter().on("html", { element(el) { el.setAttribute("lang", LOCALES[lang]); } }).transform(shell);
  const alternates = page.alternates || [];
  const canonical = o + (page.canonicalPath || (full === "/" ? "/" : full));
  const hreflang = alternates.length > 1 ? [...alternates.map(l => `<link rel="alternate" hreflang="${LOCALES[l]}" href="${esc(o + prefixed(l, path))}">`), `<link rel="alternate" hreflang="x-default" href="${esc(o + path)}">`] : [];
  const image = page.image || `${o}${OG_IMAGE}`, card = !page.image || page.imageCard;
  const head = [
    `<link rel="canonical" href="${esc(canonical)}">`, `<link rel="alternate" type="application/rss+xml" title="${esc(SITE[lang])}" href="${o}/feed.xml">`, ...hreflang,
    `<meta property="og:locale" content="${LOCALES[lang].replace("-", "_")}">`, `<meta property="og:url" content="${esc(canonical)}">`,
    ...LANGS.filter(l => l !== lang).map(l => `<meta property="og:locale:alternate" content="${LOCALES[l].replace("-", "_")}">`),
    `<meta name="twitter:title" content="${esc(page.ogTitle || page.title)}">`, `<meta name="twitter:description" content="${esc(page.description)}">`,
    ...(page.article ? [`<meta property="article:published_time" content="${esc(page.article.published)}">`, `<meta property="article:modified_time" content="${esc(page.article.modified)}">`,
      `<meta property="article:section" content="${esc(page.article.section)}">`, `<meta name="author" content="${esc(page.article.author)}">`, ...page.article.tags.map(t => `<meta property="article:tag" content="${esc(t)}">`)] : []),
    ...(page.ld || []).map(ld)
  ].join("\n");
  const set = (attr, value) => ({ element(el) { el.setAttribute(attr, value); } });
  const res = new HTMLRewriter()
    .on("html", { element(el) { el.setAttribute("lang", LOCALES[lang]); } })
    .on("title", { element(el) { el.setInnerContent(page.title); } })
    .on('meta[name="description"]', set("content", page.description))
    .on('meta[property="og:title"]', set("content", page.ogTitle || page.title))
    .on('meta[property="og:description"]', set("content", page.description))
    .on('meta[property="og:type"]', set("content", page.type || "website"))
    .on('meta[property="og:site_name"]', set("content", SITE[lang]))
    .on('meta[property="og:image"]', set("content", image))
    .on('meta[name="twitter:image"]', set("content", image))
    .on('meta[property="og:image:alt"]', set("content", card ? SITE[lang] : page.ogTitle || page.title))
    .on('meta[property="og:image:width"]', { element(el) { if (!card) el.remove(); } })
    .on('meta[property="og:image:height"]', { element(el) { if (!card) el.remove(); } })
    .on('meta[property="og:locale"]', { element(el) { el.remove(); } })
    .on('meta[name="robots"]', set("content", page.noindex ? "noindex" : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"))
    .on("head", { element(el) { el.append(head, { html: true }); } })
    .on("#app", { element(el) { el.setInnerContent(ssrShell(page.contentLang ? `<div lang="${page.contentLang}">${page.body}</div>` : page.body, lang), { html: true }); } })
    .transform(shell);
  const headers = new Headers(res.headers);
  headers.set("content-type", "text/html; charset=utf-8");
  headers.set("cache-control", "public, max-age=0, must-revalidate");
  headers.delete("etag"); headers.delete("content-length");
  return new Response(res.body, { status: page.status || 200, headers });
}

/* ---------- Sitemaps, robots, feed ---------- */
const lastmod = d => { const t = Date.parse(String(d || "").replace(" ", "T") + (/[zZ+]/.test(String(d)) ? "" : "Z")); return Number.isNaN(t) ? "" : new Date(t).toISOString(); };
const xmlResponse = (body, type = "application/xml") => new Response(`<?xml version="1.0" encoding="UTF-8"?>\n${body}`, { headers: { "content-type": `${type}; charset=utf-8`, "cache-control": "public, max-age=900" } });

export async function sitemap(request, env, ensureSchema) {
  const o = origin(request, env);
  await ensureSchema(env);
  const stories = await listPublished(env, { limit: 5000 });
  const { results: posts } = await env.DB.prepare("SELECT id,created_at FROM community_posts WHERE status='published' ORDER BY created_at DESC LIMIT 1000").all();
  const { results: cover } = await env.DB.prepare("SELECT slug,updated_at FROM live_coverage WHERE status IN ('live','ended') ORDER BY updated_at DESC LIMIT 500").all();
  const newest = stories[0]?.publishedAt;
  const tr = Object.fromEntries(await Promise.all(LANGS.map(async l => [l, await articleTranslations(env, l, stories)])));
  const alt = (path, langs) => langs && langs.length > 1 ? langs.map(l => `<xhtml:link rel="alternate" hreflang="${LOCALES[l]}" href="${xml(o + prefixed(l, path))}"/>`).join("") : "";
  const all = (path, freq, pr, m = "") => LANGS.map(l => [prefixed(l, path), m, freq, pr, null, LANGS, path]);
  const urls = [
    ...all("/", "hourly", "1.0", newest), ...all("/live", "always", "0.8", newest), ...all("/briefs", "hourly", "0.7", newest),
    ...Object.values(DESK_SLUGS).flatMap(s => all(`/desk/${s}`, "hourly", "0.8", newest)),
    ...all("/community", "daily", "0.5"), ...all("/events", "daily", "0.4"),
    ["/about", "", "monthly", "0.4", null, ["bn", "en"], "/about"], ["/en/about", "", "monthly", "0.4", null, ["bn", "en"], "/about"],
    ...LEGAL_ORDER.flatMap(([k]) => [[`/${k}`, LEGAL_UPDATED, "yearly", "0.2", null, ["bn", "en"], `/${k}`], [`/en/${k}`, LEGAL_UPDATED, "yearly", "0.2", null, ["bn", "en"], `/${k}`]]),
    ...WRITERS.map(w => [`/author/${w.key}`, newest, "weekly", "0.5", null, null, `/author/${w.key}`]),
    ...(await allTags(env)).map(t => [`/tag/${t.slug}`, newest, "weekly", "0.4", null, null, `/tag/${t.slug}`]),
    ...stories.flatMap(s => { const langs = [s.lang, ...LANGS.filter(l => l !== s.lang && tr[l].has(s.id))]; return langs.map(l => [prefixed(l, s.href), s.updatedAt || s.publishedAt, "monthly", "0.8", s, langs, s.href]); }),
    ...cover.map(c => [`/coverage/${encodeURIComponent(c.slug)}`, c.updated_at, "hourly", "0.6", null, null, ""]),
    ...posts.map(p => [`/discussion/${encodeURIComponent(p.id)}`, p.created_at, "weekly", "0.3", null, null, ""])
  ];
  return xmlResponse(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.map(([p, m, f, pr, s, langs, bare]) => `<url><loc>${xml(o + p)}</loc>${lastmod(m) ? `<lastmod>${lastmod(m)}</lastmod>` : ""}<changefreq>${f}</changefreq><priority>${pr}</priority>${alt(bare, langs)}${s?.image ? `<image:image><image:loc>${xml(abs(o, s.heroUrl || s.image))}</image:loc></image:image>` : ""}</url>`).join("\n")}
</urlset>`);
}

// Google News: stories from the last two days, in each language they exist in.
export async function newsSitemap(request, env, ensureSchema) {
  const o = origin(request, env);
  await ensureSchema(env);
  const stories = await listPublished(env, { since: new Date(Date.now() - 2 * 864e5).toISOString(), limit: 1000 });
  const all = [];
  for (const l of LANGS) all.push(...(await localiseArticles(env, l, stories)).filter(s => s.lang === l && s.publishedAt));
  return xmlResponse(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${all.map(s => `<url><loc>${xml(o + prefixed(s.lang, s.href))}</loc><news:news><news:publication><news:name>${xml(SITE[s.lang])}</news:name><news:language>${s.lang}</news:language></news:publication><news:publication_date>${xml(s.publishedAt)}</news:publication_date><news:title>${xml(s.title)}</news:title></news:news></url>`).join("\n")}
</urlset>`);
}

export function robots(request, env) {
  const o = origin(request, env);
  return new Response(`User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin
Disallow: /search
Disallow: /account
Disallow: /saved
Disallow: /my

Sitemap: ${o}/sitemap.xml
Sitemap: ${o}/news-sitemap.xml
`, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" } });
}

export async function feed(request, env, ensureSchema) {
  const o = origin(request, env);
  await ensureSchema(env);
  const lang = ["en", "hi"].includes(new URL(request.url).searchParams.get("lang")) ? new URL(request.url).searchParams.get("lang") : DEFAULT;
  const stories = (await localiseArticles(env, lang, await listPublished(env, { limit: 50 })));
  return xmlResponse(`<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/">
<channel><title>${xml(SITE[lang])}</title><link>${o}${prefixed(lang, "/")}</link><description>${xml(HOME[lang].description)}</description><language>${LOCALES[lang].toLowerCase()}</language>
<atom:link href="${o}/feed.xml${lang === DEFAULT ? "" : `?lang=${lang}`}" rel="self" type="application/rss+xml"/><image><url>${o}/icon-192.png</url><title>${xml(SITE[lang])}</title><link>${o}/</link></image>
${stories.map(s => `<item><title>${xml(s.title)}</title><link>${o}${prefixed(s.lang, s.href)}</link><guid isPermaLink="true">${o}${prefixed(s.lang, s.href)}</guid><pubDate>${new Date(s.publishedAt).toUTCString()}</pubDate><dc:creator>${xml(s.author)}</dc:creator><category>${xml(DESK_NAMES[lang][s.category] || s.category)}</category><description>${xml(s.dek || clip(s.body || "", 200))}</description>${s.image ? `<media:content url="${xml(abs(o, s.heroUrl || s.image))}" medium="image"/>` : ""}</item>`).join("\n")}
</channel></rss>`, "application/rss+xml");
}

// Paths the Worker renders as HTML pages (the rest are app-only views or static files), tested
// without the /en or /hi prefix.
export const PAGE_PATTERN = /^\/(?:$|install\/?$|(?:edition|article|author|tag|discussion|coverage|desk)\/[^/]+\/?$|live\/?$|briefs\/?$|community\/?$|events\/?$|(?:about|terms|privacy|disclaimer|copyright|corrections|community-guidelines|grievance)\/?$)/;
