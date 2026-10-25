// Search-engine pages. The Worker serves every public page with its own title, description,
// canonical URL, social card and schema.org data, plus the story text itself in the HTML,
// so Google and link previews see real content before the app starts. Also: sitemaps,
// a Google News sitemap, robots.txt and an RSS feed.
import { ABOUT, LEGAL, LEGAL_ORDER, LEGAL_UPDATED } from "./legal.js";
import { listPublished, getBySlug, textBlocks, storyPath, isPublic, tagSlug, WRITERS, writer } from "./store.js";
import { LANGS, localiseArticles, articleTranslations, localisePage } from "./translate.js";

// Hindi and Bengali pages live under /hi/ and /bn/. Story and site pages are served in the
// language once translated; until then they point search engines at the English page.
const LOCALES = { en: "en-IN", hi: "hi-IN", bn: "bn-IN" };
const prefixed = (lang, path) => lang === "en" ? path : `/${lang}${path === "/" ? "" : path}`;
const HOME_TEXT = {
  hi: { title: "Raisina Wire — भू-राजनीति, सुरक्षा और बाजार पर भारत की रणनीतिक ब्रीफिंग", description: "Raisina Wire भू-राजनीति, राष्ट्रीय सुरक्षा, कूटनीति और बाजारों पर एक स्वतंत्र भारतीय समाचार और विश्लेषण मंच है: इल्माज़ सैयद के मूल संस्करण, लाइव समाचार वायर, मार्केट बोर्ड और सदस्यों की कम्युनिटी।", latest: "Raisina Wire से ताजा" },
  bn: { title: "Raisina Wire — ভূরাজনীতি, নিরাপত্তা আর বাজার নিয়ে ভারতের কৌশলগত ব্রিফিং", description: "Raisina Wire ভূরাজনীতি, জাতীয় নিরাপত্তা, কূটনীতি আর বাজার নিয়ে একটি স্বাধীন ভারতীয় সংবাদ ও বিশ্লেষণের মঞ্চ: ইলমাজ সৈয়দের মূল সংস্করণ, লাইভ সংবাদ ওয়্যার, মার্কেট বোর্ড আর সদস্যদের কমিউনিটি।", latest: "Raisina Wire থেকে সর্বশেষ" }
};

const SITE = "Raisina Wire";
const TAGLINE = "India’s strategic briefing";
const SITE_DESCRIPTION = "Raisina Wire is an independent Indian news and analysis platform on geopolitics, national security, diplomacy and markets: original editions by Ilmaz Syed, a live news wire, a market board and a members’ community.";
const NEWSLETTER = "https://www.linkedin.com/newsletters/raisina-wire-7418787153549238272";
const LIVE_CATS = ["India", "Security", "Diplomacy", "Markets", "Energy", "World"];

const esc = (s = "") => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const xml = esc;
const clip = (s, n) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s; };
const abs = (origin, path) => !path ? "" : /^https?:\/\//.test(path) ? path : origin + (path.startsWith("/") ? path : "/" + path);
// JSON inside <script> must not be able to close the tag.
const ld = data => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
const fmtDate = (iso, lang = "en") => iso ? new Date(iso).toLocaleDateString(LOCALES[lang], { timeZone: "Asia/Kolkata", day: "numeric", month: "long", year: "numeric" }) : "";

export const origin = (request, env) => String(env.SITE_URL || new URL(request.url).origin).replace(/\/+$/, "");

function organization(o) {
  return { "@type": "NewsMediaOrganization", "@id": `${o}/#organization`, name: SITE, url: `${o}/`,
    logo: { "@type": "ImageObject", url: `${o}/icon-512.png`, width: 512, height: 512 }, sameAs: [NEWSLETTER],
    founder: { "@type": "Person", "@id": `${o}/author/ilmaz-syed#person`, name: "Ilmaz Syed" } };
}
function personLd(o, w) {
  return w.isDesk
    ? { "@type": "Organization", "@id": `${o}/author/${w.key}#desk`, name: w.name, url: `${o}/author/${w.key}`, logo: `${o}${w.portrait}` }
    : { "@type": "Person", "@id": `${o}/author/${w.key}#person`, name: w.name, jobTitle: w.role, url: `${o}/author/${w.key}`, image: `${o}${w.portrait}`, description: w.bio, worksFor: { "@id": `${o}/#organization` }, ...(w.sameAs?.length ? { sameAs: w.sameAs } : {}) };
}
function breadcrumbs(o, items) {
  return { "@type": "BreadcrumbList", itemListElement: items.map(([name, path], i) => ({ "@type": "ListItem", position: i + 1, name, item: abs(o, path) })) };
}

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
const ssrNav = `<nav class="ssr-nav" aria-label="Sections"><a href="/">Today</a> <a href="/editions">Raisina Wire</a> <a href="/live">Live wire</a> <a href="/markets">Markets</a> <a href="/community">Community</a> <a href="/events">Events</a></nav>`;
const ssrShell = inner => `<div class="ssr"><header><a class="ssr-brand" href="/">Raisina <span>Wire</span></a>${ssrNav}</header><main>${inner}</main></div>`;
const storyList = (stories, lang = "en") => `<ul class="ssr-list">${stories.map(s => `<li><a href="${prefixed(lang, s.href)}">${esc(s.title)}</a> <small>${esc(s.topic)} · ${esc(s.author)} · ${fmtDate(s.publishedAt, lang)}</small>${s.dek ? `<p>${esc(s.dek)}</p>` : ""}</li>`).join("")}</ul>`;

async function allTags(env) {
  const seen = new Map();
  for (const a of await listPublished(env, { limit: 1000 })) for (const t of a.tags) if (!seen.has(tagSlug(t))) seen.set(tagSlug(t), { name: t, slug: tagSlug(t) });
  return [...seen.values()];
}

/* ---------- Page definitions ---------- */
async function pageFor(path, url, env, o, lang = "en") {
  const parts = path.split("/").filter(Boolean).map(decodeURIComponent);
  const [section, arg] = parts;

  if (!section && lang !== "en") {
    const stories = await localiseArticles(env, lang, await listPublished(env, { limit: 30 })), t = HOME_TEXT[lang];
    return { title: t.title, description: t.description, inLanguage: LOCALES[lang],
      ld: [{ "@context": "https://schema.org", "@graph": [organization(o), { "@type": "WebSite", "@id": `${o}/${lang}#website`, url: `${o}/${lang}`, name: SITE, description: t.description, inLanguage: LOCALES[lang], publisher: { "@id": `${o}/#organization` } }] }],
      body: `<h1>${esc(t.title)}</h1><p>${esc(t.description)}</p><h2>${esc(t.latest)}</h2>${storyList(stories, lang)}` };
  }
  if (!section) {
    const stories = await listPublished(env, { limit: 30 });
    return {
      title: `${SITE} — ${TAGLINE} on geopolitics, security and markets`,
      description: SITE_DESCRIPTION,
      ld: [{ "@context": "https://schema.org", "@graph": [organization(o),
        { "@type": "WebSite", "@id": `${o}/#website`, url: `${o}/`, name: SITE, description: SITE_DESCRIPTION, inLanguage: "en-IN", publisher: { "@id": `${o}/#organization` },
          potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `${o}/search?q={search_term_string}` }, "query-input": "required name=search_term_string" } },
        { "@type": "ItemList", itemListElement: stories.slice(0, 10).map((s, i) => ({ "@type": "ListItem", position: i + 1, url: abs(o, s.href) })) }] }],
      body: `<h1>${SITE}: ${TAGLINE}</h1><p>${esc(SITE_DESCRIPTION)}</p><h2>Latest from Raisina Wire</h2>${storyList(stories)}`
    };
  }

  if ((section === "edition" || section === "article") && arg) {
    let a = await getBySlug(env, arg);
    if (!isPublic(a)) return { status: 404, title: `Story not found · ${SITE}`, description: "This story may have been moved or unpublished.", noindex: true, body: `<h1>Story not found</h1><p><a href="/editions">See all Raisina Wire stories</a></p>` };
    if (a.href !== path) return { redirect: prefixed(lang, a.href) };
    const versions = ["en"]; // languages this story can be read in
    for (const l of LANGS) if ((await articleTranslations(env, l, [a])).size) versions.push(l);
    if (lang !== "en") [a] = await localiseArticles(env, lang, [a]);
    const translated = a.lang === lang && lang !== "en";
    if (lang !== "en" && !translated) return { canonicalPath: a.href, alternates: versions.filter(l => l !== lang), title: `${a.title} · ${SITE}`, description: clip(a.dek || a.title, 160), body: `<article><h1>${esc(a.title)}</h1>${a.dek ? `<p class="ssr-dek">${esc(a.dek)}</p>` : ""}${blocksHTML(textBlocks(a.body))}</article>`, contentLang: "en-IN" };
    const w = writer(a.writer), image = abs(o, a.imageUrl || a.heroUrl || a.image);
    const blocks = textBlocks(a.body), words = blocks.reduce((n, b) => n + b.x.split(/\s+/).length, 0);
    const description = clip(a.dek || blocks.find(b => b.t === "p")?.x || a.title, 160);
    const crumb = a.kind === "edition" ? ["Editions", "/editions"] : [a.category, `/editions`];
    const here = prefixed(lang, a.href);
    return {
      alternates: versions, inLanguage: LOCALES[lang],
      title: `${a.title} · ${SITE}`, ogTitle: a.title, description, image, type: "article",
      article: { published: a.publishedAt, modified: a.updatedAt || a.publishedAt, section: a.category, author: w.name, tags: [a.topic, a.category].filter(Boolean) },
      ld: [{ "@context": "https://schema.org", "@graph": [
        { "@type": a.kind === "edition" ? "AnalysisNewsArticle" : "NewsArticle", "@id": `${o}${here}#article`, mainEntityOfPage: `${o}${here}`, url: `${o}${here}`,
          headline: clip(a.title, 110), description, image: [image], datePublished: a.publishedAt, dateModified: a.updatedAt || a.publishedAt,
          author: [personLd(o, w)], publisher: { "@id": `${o}/#organization` }, articleSection: a.category, keywords: [...a.tags, a.category, "India"].filter(Boolean).join(", "),
          wordCount: words, inLanguage: LOCALES[lang], isAccessibleForFree: true, ...(translated ? { translationOfWork: { "@id": `${o}${a.href}#article` } } : a.sourceUrl ? { isBasedOn: a.sourceUrl } : {}) },
        organization(o), breadcrumbs(o, [["Home", prefixed(lang, "/")], crumb, [a.title, here]])] }],
      body: `<article><p class="ssr-kicker">${esc(a.topic)}</p><h1>${esc(a.title)}</h1>${a.dek ? `<p class="ssr-dek">${esc(a.dek)}</p>` : ""}
        <p class="ssr-byline">${lang === "en" ? "By " : ""}<a href="${prefixed(lang, `/author/${w.key}`)}">${esc(w.name)}</a> · <time datetime="${esc(a.publishedAt)}">${fmtDate(a.publishedAt, lang)}</time>${lang === "en" ? ` · ${a.readMinutes} min read` : ""}</p>
        <img src="${esc(a.heroUrl || a.image)}" alt="" width="1600" height="1000">${blocksHTML(blocks)}
        ${a.sourceUrl ? `<p><a href="${esc(a.sourceUrl)}" rel="noopener">Read the original</a></p>` : ""}</article>`
    };
  }

  if (section === "editions") {
    const stories = await localiseArticles(env, lang, await listPublished(env, { limit: 300 }));
    return { title: `All Raisina Wire editions and analysis · ${SITE}`, description: `Every Raisina Wire edition and article, newest first: ${stories.length} stories on India’s security, diplomacy, neighbourhood and markets.`,
      ld: [{ "@context": "https://schema.org", "@graph": [{ "@type": "CollectionPage", url: `${o}/editions`, name: "Raisina Wire editions", isPartOf: { "@id": `${o}/#website` },
        mainEntity: { "@type": "ItemList", itemListElement: stories.map((s, i) => ({ "@type": "ListItem", position: i + 1, url: abs(o, s.href), name: s.title })) } }, breadcrumbs(o, [["Home", "/"], ["Editions", "/editions"]])] }],
      body: `<h1>Every Raisina Wire edition</h1>${storyList(stories, lang)}` };
  }

  if (section === "tag" && arg) {
    const tags = await allTags(env), t = tags.find(x => x.slug === arg);
    if (!t) return { status: 404, title: `Topic not found · ${SITE}`, description: "", noindex: true, body: `<h1>Topic not found</h1><p><a href="/editions">See all stories</a></p>` };
    const stories = await listPublished(env, { tag: t.name, limit: 200 });
    return { title: `${t.name}: news and analysis · ${SITE}`, description: clip(`Raisina Wire stories on ${t.name}: ${stories.slice(0, 3).map(x => x.title).join("; ")}`, 160),
      ld: [{ "@context": "https://schema.org", "@graph": [{ "@type": "CollectionPage", url: `${o}/tag/${t.slug}`, name: `${t.name} · ${SITE}`, isPartOf: { "@id": `${o}/#website` },
        mainEntity: { "@type": "ItemList", itemListElement: stories.map((x, i) => ({ "@type": "ListItem", position: i + 1, url: abs(o, x.href), name: x.title })) } }, breadcrumbs(o, [["Home", "/"], ["Topics", "/editions"], [t.name, `/tag/${t.slug}`]])] }],
      body: `<h1>${esc(t.name)}</h1>${storyList(stories)}` };
  }

  if (section === "author" && arg) {
    const w = WRITERS.find(x => x.key === arg);
    if (!w) return { status: 404, title: `Writer not found · ${SITE}`, description: "", noindex: true, body: `<h1>Writer not found</h1>` };
    const stories = await listPublished(env, { writerKey: w.key, limit: 200 });
    return { title: w.isDesk ? "The Raisina Wire desk: news, explainers and briefings from New Delhi" : `${w.name} — ${w.role} · ${SITE}`, description: clip(w.bio, 160), image: abs(o, w.portrait), type: "profile",
      ld: [{ "@context": "https://schema.org", "@graph": [{ "@type": "ProfilePage", url: `${o}/author/${w.key}`, mainEntity: personLd(o, w) }, organization(o), breadcrumbs(o, [["Home", "/"], [w.name, `/author/${w.key}`]])] }],
      body: `<h1>${esc(w.name)}</h1><p>${esc(w.role)}</p><p>${esc(w.bio)}</p><h2>Stories</h2>${storyList(stories)}` };
  }

  if (section === "live") {
    const cat = LIVE_CATS.includes(arg) ? arg : "";
    return { title: `${cat ? `${cat} news live` : "Live news wire"}: latest headlines · ${SITE}`,
      description: `${cat ? `Latest ${cat.toLowerCase()} headlines` : "The latest headlines on India, security, diplomacy, markets and energy"} from named publishers, updated every two minutes, with an in-app reader and links to the original.`,
      body: `<h1>${cat ? `${cat} news live` : "Live news wire"}</h1><p>Headlines from The Hindu, Indian Express, NDTV, Mint, BBC News, Al Jazeera and The Diplomat, newest first.</p>` };
  }
  if (section === "markets") {
    return { title: `Markets today: Nifty, Sensex, rupee, crude, gold and defence stocks · ${SITE}`,
      description: "A live market board for India: Nifty 50, Sensex, Bank Nifty, Indian defence stocks, the rupee, crude oil, gold, US bond yields and crypto, with intraday charts.",
      body: `<h1>Market board</h1><p>India and global indices, Indian stocks including defence, currencies, commodities, bond yields and crypto.</p>` };
  }
  if (lang !== "en" && (section === "about" || LEGAL[section]) && !arg) {
    const p = await localisePage(env, lang, section);
    if (p.lang !== lang) return { canonicalPath: `/${section}`, title: `${p.title} · ${SITE}`, description: p.description, body: `<article><h1>${p.title}</h1>${p.html}</article>`, contentLang: "en-IN" };
    return { alternates: ["en", ...LANGS], inLanguage: LOCALES[lang], title: `${p.title} · ${SITE}`, description: p.description, body: `<article><h1>${esc(p.title)}</h1>${p.html}</article>` };
  }
  if (section === "about" && !arg) {
    return { title: `${ABOUT.title} — independent analysis on India’s security, diplomacy and markets`, description: ABOUT.description,
      ld: [{ "@context": "https://schema.org", "@graph": [{ "@type": "AboutPage", url: `${o}/about`, name: ABOUT.title, about: { "@id": `${o}/#organization` } }, organization(o), personLd(o, writer("ilmaz-syed")), breadcrumbs(o, [["Home", "/"], ["About", "/about"]])] }],
      body: `<article><h1>${ABOUT.title}</h1>${ABOUT.html}</article>` };
  }
  if (LEGAL[section] && !arg) {
    const d = LEGAL[section];
    return { title: `${d.title} · ${SITE}`, description: d.description,
      ld: [{ "@context": "https://schema.org", "@type": "WebPage", url: `${o}/${section}`, name: d.title, dateModified: new Date(LEGAL_UPDATED).toISOString(), isPartOf: { "@id": `${o}/#website` } }],
      body: `<article><h1>${d.title}</h1><p>Last updated ${LEGAL_UPDATED}</p>${d.html}</article>` };
  }
  if (section === "watch") return { title: `Watch and listen: video and audio briefings · ${SITE}`, description: "Video, audio and image briefings from the Raisina Wire desk.", body: `<h1>Watch and listen</h1>` };

  if (section === "community") {
    const { results } = await env.DB.prepare("SELECT p.id,p.title,p.topic,p.created_at AS createdAt,u.display_name AS author FROM community_posts p JOIN users u ON u.id=p.user_id WHERE p.status='published' ORDER BY p.created_at DESC LIMIT 50").all();
    return { title: `Community: discussions on India’s strategic questions · ${SITE}`,
      description: "Join the Raisina Wire community: moderated discussions on geopolitics, security and markets, invitations to expert briefings, and members’ events. Free to join.",
      body: `<h1>Raisina Wire community</h1><p>Moderated discussions on India’s strategic questions. Free to join.</p><ul class="ssr-list">${results.map(p => `<li><a href="/discussion/${encodeURIComponent(p.id)}">${esc(p.title)}</a> <small>${esc(p.topic)} · ${esc(p.author)}</small></li>`).join("")}</ul>` };
  }
  if (section === "discussion" && arg) {
    const post = await env.DB.prepare("SELECT p.id,p.title,p.body,p.topic,p.created_at AS createdAt,u.display_name AS author FROM community_posts p JOIN users u ON u.id=p.user_id WHERE p.id=? AND p.status='published'").bind(arg).first();
    if (!post) return { status: 404, title: `Discussion not found · ${SITE}`, description: "", noindex: true, body: `<h1>Discussion not found</h1><p><a href="/community">Back to the community</a></p>` };
    const { results: replies } = await env.DB.prepare("SELECT r.body,r.created_at AS createdAt,u.display_name AS author FROM community_replies r JOIN users u ON u.id=r.user_id WHERE r.post_id=? ORDER BY r.created_at LIMIT 200").bind(arg).all();
    const href = `/discussion/${encodeURIComponent(post.id)}`, iso = d => new Date(String(d).replace(" ", "T") + (String(d).includes("Z") ? "" : "Z")).toISOString();
    return { title: `${post.title} · ${SITE} community`, ogTitle: post.title, description: clip(post.body, 160),
      ld: [{ "@context": "https://schema.org", "@type": "DiscussionForumPosting", url: `${o}${href}`, headline: clip(post.title, 110), text: clip(post.body, 2000), datePublished: iso(post.createdAt),
        author: { "@type": "Person", name: post.author }, interactionStatistic: { "@type": "InteractionCounter", interactionType: "https://schema.org/CommentAction", userInteractionCount: replies.length },
        comment: replies.slice(0, 50).map(r => ({ "@type": "Comment", text: clip(r.body, 1000), datePublished: iso(r.createdAt), author: { "@type": "Person", name: r.author } })) }],
      body: `<article><p class="ssr-kicker">${esc(post.topic)}</p><h1>${esc(post.title)}</h1><p class="ssr-byline">${esc(post.author)}</p><p>${esc(post.body)}</p><h2>${replies.length} replies</h2>${replies.map(r => `<p><b>${esc(r.author)}</b>: ${esc(r.body)}</p>`).join("")}</article>` };
  }
  if (section === "events") {
    const { results } = await env.DB.prepare("SELECT id,title,description,event_type AS eventType,starts_at AS startsAt,access FROM events WHERE status='published' AND starts_at>=? ORDER BY starts_at LIMIT 30").bind(new Date().toISOString()).all();
    return { title: `Events and expert briefings · ${SITE}`, description: "Upcoming Raisina Wire briefings, debates and workshops on geopolitics, security and markets. Times in India Standard Time.",
      ld: results.map(e => ({ "@context": "https://schema.org", "@type": "Event", name: e.title, description: clip(e.description || e.title, 300), startDate: e.startsAt,
        endDate: new Date(new Date(e.startsAt).getTime() + 3600e3).toISOString(), eventStatus: "https://schema.org/EventScheduled",
        eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode", location: { "@type": "VirtualLocation", url: `${o}/events` },
        organizer: { "@type": "Organization", name: SITE, url: `${o}/` }, isAccessibleForFree: true, image: [`${o}/og-image.jpg`] })),
      body: `<h1>Events and briefings</h1><ul class="ssr-list">${results.map(e => `<li>${esc(e.title)} <small>${esc(e.eventType)} · ${fmtDate(e.startsAt)}</small></li>`).join("")}</ul>` };
  }
  if (section === "coverage" && arg) {
    const item = await env.DB.prepare("SELECT id,slug,title,summary,status,started_at AS startedAt,ended_at AS endedAt,updated_at AS updatedAt,image_url AS imageUrl,social_url AS socialUrl FROM live_coverage WHERE slug=? AND status IN ('live','ended')").bind(arg).first();
    if (!item) return { status: 404, title: `Live coverage not found · ${SITE}`, description: "", noindex: true, body: `<h1>Live coverage not found</h1>` };
    const { results: ups } = await env.DB.prepare("SELECT body,created_at AS createdAt FROM live_updates WHERE coverage_id=? ORDER BY created_at DESC LIMIT 50").bind(item.id).all();
    const iso = d => new Date(String(d).replace(" ", "T") + (String(d).includes("Z") || String(d).includes("+") ? "" : "Z")).toISOString();
    const href = `/coverage/${encodeURIComponent(item.slug)}`;
    // While live, link previews use the social image (the hero with a LIVE tab); once ended, the plain hero.
    const pic = (item.status === "live" && item.socialUrl) || item.imageUrl || item.socialUrl, image = pic ? abs(o, pic) : undefined;
    return { title: `${item.status === "live" ? "LIVE: " : ""}${item.title} · ${SITE}`, ogTitle: item.title, description: clip(item.summary || ups[0]?.body || item.title, 160), image,
      ld: [{ "@context": "https://schema.org", "@type": "LiveBlogPosting", url: `${o}${href}`, headline: clip(item.title, 110), description: clip(item.summary || item.title, 300), ...(image ? { image: [image] } : {}),
        coverageStartTime: item.startedAt, ...(item.endedAt ? { coverageEndTime: item.endedAt } : {}), datePublished: item.startedAt, dateModified: ups[0] ? iso(ups[0].createdAt) : item.startedAt,
        publisher: organization(o), author: { "@type": "Organization", name: SITE, url: `${o}/` },
        liveBlogUpdate: ups.map(u => ({ "@type": "BlogPosting", headline: clip(u.body, 110), articleBody: u.body, datePublished: iso(u.createdAt) })) }],
      body: `<article><h1>${esc(item.title)}</h1>${item.summary ? `<p>${esc(item.summary)}</p>` : ""}${ups.map(u => `<section><time datetime="${iso(u.createdAt)}"></time>${blocksHTML(textBlocks(u.body))}</section>`).join("")}</article>` };
  }
  return null; // not a page this module renders
}

/* ---------- HTML ---------- */
export async function renderPage(request, env, ensureSchema) {
  const url = new URL(request.url), o = origin(request, env);
  const full = url.pathname.replace(/\/+$/, "") || "/";
  const lang = full.match(/^\/(hi|bn)(?=\/|$)/)?.[1] || "en", path = full.replace(/^\/(hi|bn)(?=\/|$)/, "") || "/";
  let page = null;
  if (env.DB) { try { await ensureSchema(env); page = await pageFor(path, url, env, o, lang); } catch { page = null; } }
  if (page?.redirect) return Response.redirect(o + page.redirect + url.search, 301);
  const shell = await env.ASSETS.fetch(new Request(new URL("/", request.url), { headers: request.headers }));
  if (!page) return lang === "en" ? shell : new HTMLRewriter().on("html", { element(el) { el.setAttribute("lang", LOCALES[lang]); } }).transform(shell);
  // Each language version names the others; pages without their own translation point to the English one.
  const alternates = page.alternates || (page.canonicalPath ? [] : ["en", ...LANGS]);
  const canonical = o + (page.canonicalPath || (full === "/" ? "/" : full));
  const hreflang = alternates.length > 1 ? [...alternates.map(l => `<link rel="alternate" hreflang="${LOCALES[l]}" href="${esc(o + prefixed(l, path))}">`), `<link rel="alternate" hreflang="x-default" href="${esc(o + path)}">`] : [];
  const image = page.image || `${o}/og-image.jpg`;
  const head = [
    `<link rel="canonical" href="${esc(canonical)}">`, ...hreflang,
    ...(lang !== "en" ? [`<meta property="og:locale" content="${LOCALES[lang].replace("-", "_")}">`] : []),
    `<meta property="og:url" content="${esc(canonical)}">`,
    `<meta name="twitter:title" content="${esc(page.ogTitle || page.title)}">`,
    `<meta name="twitter:description" content="${esc(page.description)}">`,
    ...(page.article ? [`<meta property="article:published_time" content="${esc(page.article.published)}">`, `<meta property="article:modified_time" content="${esc(page.article.modified)}">`,
      `<meta property="article:section" content="${esc(page.article.section)}">`, `<meta property="article:author" content="${esc(page.article.author)}">`, `<meta name="author" content="${esc(page.article.author)}">`,
      ...page.article.tags.map(t => `<meta property="article:tag" content="${esc(t)}">`)] : []),
    ...(page.ld || []).map(ld)
  ].join("\n");
  const set = (attr, value) => ({ element(el) { el.setAttribute(attr, value); } });
  const res = new HTMLRewriter()
    .on("html", { element(el) { el.setAttribute("lang", page.inLanguage || (lang === "en" ? "en-IN" : LOCALES[lang])); } })
    .on("title", { element(el) { el.setInnerContent(page.title); } })
    .on('meta[name="description"]', set("content", page.description))
    .on('meta[property="og:title"]', set("content", page.ogTitle || page.title))
    .on('meta[property="og:description"]', set("content", page.description))
    .on('meta[property="og:type"]', set("content", page.type || "website"))
    .on('meta[property="og:image"]', set("content", image))
    .on('meta[name="twitter:image"]', set("content", image))
    .on('meta[name="robots"]', set("content", page.noindex ? "noindex" : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"))
    .on("head", { element(el) { el.append(head, { html: true }); } })
    .on("#app", { element(el) { el.setInnerContent(ssrShell(page.contentLang ? `<div lang="${page.contentLang}">${page.body}</div>` : page.body), { html: true }); } })
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
  // Hindi and Bengali versions that exist, each listed with its alternates.
  const tr = Object.fromEntries(await Promise.all(LANGS.map(async l => [l, await articleTranslations(env, l, stories)])));
  const pages = [];
  for (const k of ["about", ...LEGAL_ORDER.map(([x]) => x)]) for (const l of LANGS) if ((await localisePage(env, l, k)).lang === l) pages.push([l, k]);
  const alt = (path, langs) => langs && langs.length > 1 ? langs.map(l => `<xhtml:link rel="alternate" hreflang="${LOCALES[l]}" href="${xml(o + prefixed(l, path))}"/>`).join("") : "";
  const bare = p => p.replace(/^\/(hi|bn)(?=\/|$)/, "") || "/";
  const urls = [
    ["/", newest, "hourly", "1.0"], ["/editions", newest, "daily", "0.9"], ["/live", "", "always", "0.8"], ["/markets", "", "always", "0.7"],
    ...LIVE_CATS.map(c => [`/live/${c}`, "", "always", "0.5"]), ["/community", "", "daily", "0.7"], ["/events", "", "daily", "0.6"], ["/watch", "", "weekly", "0.5"], ["/about", "", "monthly", "0.5"], ...LEGAL_ORDER.map(([k]) => [`/${k}`, "", "yearly", "0.2"]),
    ...WRITERS.map(w => [`/author/${w.key}`, newest, "weekly", "0.6"]),
    ...(await allTags(env)).map(t => [`/tag/${t.slug}`, newest, "weekly", "0.5"]),
    ...LANGS.flatMap(l => [[`/${l}`, newest, "hourly", "0.9"], [`/${l}/editions`, newest, "daily", "0.7"]]),
    ...stories.flatMap(s => { const langs = ["en", ...LANGS.filter(l => tr[l].has(s.id))]; return langs.map(l => [prefixed(l, s.href), s.updatedAt || s.publishedAt, "monthly", "0.8", s, langs]); }),
    ...pages.map(([l, k]) => [`/${l}/${k}`, "", "yearly", "0.2", null, ["en", ...LANGS.filter(x => pages.some(([y, z]) => y === x && z === k))]]),
    ...cover.map(c => [`/coverage/${encodeURIComponent(c.slug)}`, c.updated_at, "hourly", "0.6"]),
    ...posts.map(p => [`/discussion/${encodeURIComponent(p.id)}`, p.created_at, "weekly", "0.4"])
  ];
  return xmlResponse(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.map(([p, m, f, pr, s, langs]) => `<url><loc>${xml(o + p)}</loc>${lastmod(m) ? `<lastmod>${lastmod(m)}</lastmod>` : ""}<changefreq>${f}</changefreq><priority>${pr}</priority>${alt(bare(p), langs)}${s ? `<image:image><image:loc>${xml(abs(o, s.heroUrl || s.image))}</image:loc></image:image>` : ""}</url>`).join("\n")}
</urlset>`);
}

// Google News: stories from the last two days.
export async function newsSitemap(request, env, ensureSchema) {
  const o = origin(request, env);
  await ensureSchema(env);
  const stories = await listPublished(env, { since: new Date(Date.now() - 2 * 864e5).toISOString(), limit: 1000 });
  const all = [...stories.map(s => ({ ...s, lang: "en" }))];
  for (const l of LANGS) all.push(...(await localiseArticles(env, l, stories)).filter(s => s.lang === l));
  return xmlResponse(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${all.map(s => `<url><loc>${xml(o + prefixed(s.lang, s.href))}</loc><news:news><news:publication><news:name>${SITE}</news:name><news:language>${s.lang}</news:language></news:publication><news:publication_date>${xml(s.publishedAt)}</news:publication_date><news:title>${xml(s.title)}</news:title></news:news></url>`).join("\n")}
</urlset>`);
}

export function robots(request, env) {
  const o = origin(request, env);
  return new Response(`User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin
Disallow: /read
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
  const stories = await listPublished(env, { limit: 50 });
  return xmlResponse(`<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/">
<channel><title>${SITE}</title><link>${o}/</link><description>${xml(SITE_DESCRIPTION)}</description><language>en-in</language>
<atom:link href="${o}/feed.xml" rel="self" type="application/rss+xml"/><image><url>${o}/icon-192.png</url><title>${SITE}</title><link>${o}/</link></image>
${stories.map(s => `<item><title>${xml(s.title)}</title><link>${o}${s.href}</link><guid isPermaLink="true">${o}${s.href}</guid><pubDate>${new Date(s.publishedAt).toUTCString()}</pubDate><dc:creator>${xml(s.author)}</dc:creator><category>${xml(s.category)}</category><description>${xml(s.dek)}</description><media:content url="${xml(abs(o, s.heroUrl || s.image))}" medium="image"/></item>`).join("\n")}
</channel></rss>`, "application/rss+xml");
}

// Paths the Worker renders as HTML pages (the rest are app-only views or static files), tested
// without the /hi or /bn prefix.
export const PAGE_PATTERN = /^\/(?:$|editions\/?$|(?:edition|article|author|tag|discussion|coverage)\/[^/]+\/?$|live(?:\/[^/]+)?\/?$|markets\/?$|community\/?$|events\/?$|watch\/?$|(?:about|terms|privacy|disclaimer|copyright|community-guidelines|grievance)\/?$)/;
