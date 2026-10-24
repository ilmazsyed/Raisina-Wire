const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "public, max-age=60, s-maxage=120",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
  "access-control-allow-headers": "content-type"
};

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_HEADERS, ...headers } });
}
function err(message, status = 400) { return json({ error: message }, status, { "cache-control": "no-store" }); }
function randomId() { return crypto.randomUUID(); }
function b64(bytes) { return btoa(String.fromCharCode(...new Uint8Array(bytes))); }
function hex(bytes) { return [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2, "0")).join(""); }
async function sha256(value) { return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))); }
async function passwordHash(password, salt) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: 180000, hash: "SHA-256" }, key, 256);
  return `${salt}:${b64(bits)}`;
}
async function verifyPassword(password, stored) {
  const [salt, expected] = (stored || "").split(":");
  if (!salt || !expected) return false;
  return (await passwordHash(password, salt)) === stored;
}
function cookie(name, value, maxAge) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}
function getCookie(request, name) {
  const all = request.headers.get("Cookie") || "";
  const match = all.split(";").map(x => x.trim()).find(x => x.startsWith(name + "="));
  return match ? match.slice(name.length + 1) : null;
}
async function currentUser(request, env) {
  if (!env.DB) return null;
  const token = getCookie(request, "rw_session");
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(
    "SELECT users.id, users.email, users.display_name, users.role FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=? AND sessions.expires_at>?"
  ).bind(tokenHash, Math.floor(Date.now()/1000)).first();
  return row || null;
}
function slugify(s) { return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,90) || randomId(); }
function allowedRoles(user, roles) { return user && roles.includes(user.role); }

async function gdeltNews(url) {
  const q = url.searchParams.get("q") || "(geopolitics OR diplomacy OR security OR conflict)";
  const safeQ = q.slice(0, 220);
  const api = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
  api.searchParams.set("query", safeQ);
  api.searchParams.set("mode", "ArtList");
  api.searchParams.set("format", "json");
  api.searchParams.set("sort", "DateDesc");
  api.searchParams.set("maxrecords", "30");
  api.searchParams.set("timespan", "24h");
  const response = await fetch(api, { headers: { "user-agent": "RaisinaWire/1.0 (editorial research)" } });
  if (!response.ok) throw new Error(`GDELT returned ${response.status}`);
  const data = await response.json();
  const articles = (data.articles || []).map((a, i) => ({
    id: `${a.url || a.title || i}`,
    title: a.title || "Untitled report",
    url: a.url || "#",
    domain: a.domain || "",
    sourceCountry: a.sourcecountry || "",
    language: a.language || "",
    publishedAt: a.seendate || "",
    image: a.socialimage || "",
    tone: a.tone ?? null,
    source: "GDELT / publisher"
  })).filter(a => a.url.startsWith("http"));
  return { source: "GDELT DOC 2.0", updatedAt: new Date().toISOString(), query: safeQ, articles };
}

const MARKET_WATCHLIST = [
  { label: "S&P 500", symbol: "^GSPC", category: "Indices", currency: "USD" },
  { label: "Apple", symbol: "AAPL", category: "Stocks", currency: "USD" },
  { label: "Reliance Industries", symbol: "RELIANCE.NS", category: "India equities", currency: "INR" },
  { label: "TCS", symbol: "TCS.NS", category: "India equities", currency: "INR" },
  { label: "USD/INR", symbol: "USDINR=X", category: "Currencies", currency: "INR" },
  { label: "EUR/USD", symbol: "EURUSD=X", category: "Currencies", currency: "USD" },
  { label: "Gold futures", symbol: "GC=F", category: "Commodities", currency: "USD" },
  { label: "WTI crude futures", symbol: "CL=F", category: "Commodities", currency: "USD" }
];

async function yahooQuote(item) {
  const encoded = encodeURIComponent(item.symbol);
  const urls = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?range=5d&interval=1d`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${encoded}?range=5d&interval=1d`
  ];
  let lastError = "Quote unavailable";
  for (const endpoint of urls) {
    try {
      const response = await fetch(endpoint, {
        headers: { "user-agent": "Mozilla/5.0 (compatible; RaisinaWire/1.0; +https://raisinawire.com)" },
        cf: { cacheTtl: 60, cacheEverything: true }
      });
      if (!response.ok) throw new Error(`Source returned ${response.status}`);
      const payload = await response.json();
      const result = payload?.chart?.result?.[0];
      if (!result) throw new Error(payload?.chart?.error?.description || "No chart data");
      const meta = result.meta || {};
      const quotes = result.indicators?.quote?.[0] || {};
      const closes = (quotes.close || []).filter(v => Number.isFinite(Number(v))).map(Number);
      const value = Number(meta.regularMarketPrice ?? closes.at(-1));
      if (!Number.isFinite(value)) throw new Error("No valid price");
      const previous = Number(meta.chartPreviousClose ?? meta.previousClose ?? closes.at(-2));
      const change = Number.isFinite(previous) ? value - previous : null;
      const changePct = Number.isFinite(previous) && previous !== 0 ? change / previous * 100 : null;
      const stamp = Number(meta.regularMarketTime || result.timestamp?.at(-1));
      return {
        label: item.label, symbol: item.symbol, category: item.category,
        currency: meta.currency || item.currency, value, change, changePct,
        date: Number.isFinite(stamp) ? new Date(stamp * 1000).toISOString() : null,
        isMarketOpen: typeof meta.marketState === "string" ? meta.marketState === "REGULAR" : null,
        status: "keyless-quote", source: "Yahoo Finance", dataType: "latest available quote; delay varies by instrument"
      };
    } catch (e) { lastError = String(e.message || "Unavailable"); }
  }
  return { label:item.label, symbol:item.symbol, category:item.category, currency:item.currency,
    value:null, change:null, changePct:null, date:null, isMarketOpen:null, status:"unavailable",
    source:"Yahoo Finance", dataType:"quote unavailable", detail:lastError.slice(0,120) };
}

async function fxFallback() {
  try {
    const response = await fetch("https://api.frankfurter.dev/v2/rate/usd/inr", { cf: { cacheTtl: 3600, cacheEverything: true } });
    if (!response.ok) return null;
    const data = await response.json();
    if (!Number.isFinite(Number(data.rate))) return null;
    return { label:"USD/INR reference", symbol:"USD/INR", category:"Currencies", currency:"INR", value:Number(data.rate),
      change:null, changePct:null, date:data.date || null, isMarketOpen:null, status:"daily-reference", source:"Frankfurter",
      dataType:"daily central-bank reference rate" };
  } catch { return null; }
}

async function markets() {
  const now = new Date().toISOString();
  const items = await Promise.all(MARKET_WATCHLIST.map(yahooQuote));
  const hasFxQuote = items.some(item => item.symbol === "USDINR=X" && item.value !== null);
  const fx = hasFxQuote ? null : await fxFallback();
  return {
    updatedAt: now, mode:"keyless", items, fx,
    note:"No API key or account is required. Quotes are from public Yahoo Finance endpoints; timing, availability and exchange delays vary by instrument. USD/INR may fall back to a daily central-bank reference rate. If a source fails, the affected quote is marked unavailable rather than fabricated. Public-feed uptime and licensing are not guaranteed."
  };
}

async function api(request, env) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: JSON_HEADERS });

  if (url.pathname === "/api/health") return json({ ok: true, service: "Raisina Wire API", time: new Date().toISOString(), database: Boolean(env.DB) }, 200, { "cache-control":"no-store" });

  if (url.pathname === "/api/news") {
    try { return json(await gdeltNews(url)); }
    catch (e) { return json({ source: "GDELT DOC 2.0", updatedAt: null, articles: [], error: "Live news feed temporarily unavailable", detail: e.message }, 502); }
  }
  if (url.pathname === "/api/markets") {
    return json(await markets(), 200, { "cache-control":"public, max-age=45, s-maxage=60" });
  }
  if (url.pathname === "/api/config") {
    return json({ appName: env.APP_NAME || "Raisina Wire", linkedinUrl: env.LINKEDIN_URL || "", registrationEnabled: Boolean(env.DB), marketProviderConfigured: true, marketProvider: "keyless public feeds", marketRefreshSeconds: 60 });
  }

  if (!env.DB) return err("Database is not configured. Add a D1 binding before using account and publishing features.", 503);

  if (url.pathname === "/api/auth/register" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase();
    const displayName = String(body.displayName || "").trim().slice(0, 80);
    const password = String(body.password || "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || displayName.length < 2 || password.length < 12) {
      return err("Enter a valid email, a name, and a password of at least 12 characters.");
    }
    const existing = await env.DB.prepare("SELECT id FROM users WHERE email=?").bind(email).first();
    if (existing) return err("An account with this email already exists.", 409);
    const id = randomId(), salt = b64(crypto.getRandomValues(new Uint8Array(16)));
    const hash = await passwordHash(password, salt);
    await env.DB.prepare("INSERT INTO users (id,email,display_name,password_hash) VALUES (?,?,?,?)").bind(id,email,displayName,hash).run();
    return json({ ok:true, message:"Account created. Sign in to continue." }, 201, { "cache-control":"no-store" });
  }

  if (url.pathname === "/api/auth/login" && request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email || "").trim().toLowerCase(), password = String(body.password || "");
    const row = await env.DB.prepare("SELECT id,email,display_name,role,password_hash FROM users WHERE email=?").bind(email).first();
    if (!row || !(await verifyPassword(password, row.password_hash))) return err("Email or password is incorrect.", 401);
    const token = b64(crypto.getRandomValues(new Uint8Array(32))).replace(/[+/=]/g, c => ({"+":"-","/":"_","=":""}[c]));
    const tokenHash = await sha256(token), expires = Math.floor(Date.now()/1000) + 60*60*24*14;
    await env.DB.prepare("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)").bind(tokenHash,row.id,expires).run();
    return json({ ok:true, user:{ id:row.id,email:row.email,displayName:row.display_name,role:row.role } }, 200, { "set-cookie":cookie("rw_session",token,60*60*24*14), "cache-control":"no-store" });
  }

  if (url.pathname === "/api/auth/logout" && request.method === "POST") {
    const token = getCookie(request,"rw_session");
    if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha256(token)).run();
    return json({ ok:true },200,{ "set-cookie":cookie("rw_session","",0),"cache-control":"no-store" });
  }

  if (url.pathname === "/api/auth/me" && request.method === "GET") {
    const user = await currentUser(request,env);
    return json({ user: user ? { id:user.id,email:user.email,displayName:user.display_name,role:user.role } : null },200,{ "cache-control":"no-store" });
  }

  if (url.pathname === "/api/topics" && request.method === "GET") {
    const user = await currentUser(request,env);
    if (!user) return err("Sign in required.",401);
    const rows = await env.DB.prepare("SELECT topic FROM saved_topics WHERE user_id=? ORDER BY topic").bind(user.id).all();
    return json({ topics: rows.results.map(x=>x.topic) },200,{"cache-control":"no-store"});
  }
  if (url.pathname === "/api/topics" && request.method === "POST") {
    const user = await currentUser(request,env);
    if (!user) return err("Sign in required.",401);
    const body = await request.json().catch(()=>({}));
    const topic = String(body.topic||"").trim().slice(0,80);
    if (!topic) return err("Topic is required.");
    await env.DB.prepare("INSERT OR IGNORE INTO saved_topics(user_id,topic) VALUES (?,?)").bind(user.id,topic).run();
    return json({ok:true},200,{"cache-control":"no-store"});
  }
  if (url.pathname.startsWith("/api/topics/") && request.method === "DELETE") {
    const user = await currentUser(request,env);
    if (!user) return err("Sign in required.",401);
    const topic = decodeURIComponent(url.pathname.split("/").pop());
    await env.DB.prepare("DELETE FROM saved_topics WHERE user_id=? AND topic=?").bind(user.id,topic).run();
    return json({ok:true},200,{"cache-control":"no-store"});
  }

  // Lean editorial console: multimedia metadata and live text coverage.
  if (url.pathname === "/api/admin/media" && request.method === "GET") {
    const user = await currentUser(request,env);
    if (!allowedRoles(user,["admin","editor"])) return err("Editor access required.",403);
    const rows = await env.DB.prepare("SELECT * FROM media_items ORDER BY updated_at DESC LIMIT 100").all();
    return json({items:rows.results},200,{"cache-control":"no-store"});
  }
  if (url.pathname === "/api/admin/media" && request.method === "POST") {
    const user = await currentUser(request,env);
    if (!allowedRoles(user,["admin","editor"])) return err("Editor access required.",403);
    const b = await request.json().catch(()=>({}));
    const title=String(b.title||"").trim().slice(0,180), mediaUrl=String(b.mediaUrl||"").trim().slice(0,1500);
    if(title.length<3 || !/^https:\/\//i.test(mediaUrl)) return err("Add a title and a valid HTTPS media URL.");
    const type=["video","image","gallery","audio","embed"].includes(b.mediaType)?b.mediaType:"video";
    const status=b.status==="published"?"published":"draft", id=randomId();
    await env.DB.prepare("INSERT INTO media_items (id,title,description,media_type,media_url,thumbnail_url,category,status,author_id,published_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(id,title,String(b.description||"").slice(0,2000),type,mediaUrl,String(b.thumbnailUrl||"").slice(0,1500),String(b.category||"Geopolitics").slice(0,50),status,user.id,status==="published"?new Date().toISOString():null).run();
    return json({ok:true,id},201,{"cache-control":"no-store"});
  }
  if (url.pathname === "/api/admin/live" && request.method === "GET") {
    const user = await currentUser(request,env);
    if (!allowedRoles(user,["admin","editor"])) return err("Editor access required.",403);
    const rows=await env.DB.prepare("SELECT * FROM live_coverage ORDER BY updated_at DESC LIMIT 100").all();
    return json({items:rows.results},200,{"cache-control":"no-store"});
  }
  if (url.pathname === "/api/admin/live" && request.method === "POST") {
    const user = await currentUser(request,env);
    if (!allowedRoles(user,["admin","editor"])) return err("Editor access required.",403);
    const b=await request.json().catch(()=>({})), title=String(b.title||"").trim().slice(0,180);
    if(title.length<5) return err("Live coverage title must be at least 5 characters.");
    const id=randomId(), slug=slugify(b.slug||title), status=b.status==="live"?"live":"draft";
    try { await env.DB.prepare("INSERT INTO live_coverage (id,slug,title,summary,status,author_id,started_at) VALUES (?,?,?,?,?,?,?)").bind(id,slug,title,String(b.summary||"").slice(0,500),status,user.id,status==="live"?new Date().toISOString():null).run(); }
    catch(e){ return err("Could not create live coverage. Check that the editorial migration is applied and the slug is unique.",500); }
    return json({ok:true,id,slug},201,{"cache-control":"no-store"});
  }
  if (url.pathname.startsWith("/api/admin/live/") && url.pathname.endsWith("/updates") && request.method === "POST") {
    const user=await currentUser(request,env);
    if (!allowedRoles(user,["admin","editor"])) return err("Editor access required.",403);
    const id=decodeURIComponent(url.pathname.split("/")[4]||""), b=await request.json().catch(()=>({})), body=String(b.body||"").trim();
    if(!body) return err("Live update text is required.");
    const exists=await env.DB.prepare("SELECT id FROM live_coverage WHERE id=?").bind(id).first();
    if(!exists) return err("Live coverage not found.",404);
    await env.DB.prepare("INSERT INTO live_updates (id,coverage_id,body,media_url,source_url,author_id) VALUES (?,?,?,?,?,?)").bind(randomId(),id,body.slice(0,12000),String(b.mediaUrl||"").slice(0,1500),String(b.sourceUrl||"").slice(0,1500),user.id).run();
    await env.DB.prepare("UPDATE live_coverage SET status='live', started_at=COALESCE(started_at,?), updated_at=? WHERE id=?").bind(new Date().toISOString(),new Date().toISOString(),id).run();
    return json({ok:true},201,{"cache-control":"no-store"});
  }
  if (url.pathname === "/api/live" && request.method === "GET") {
    const rows=await env.DB.prepare("SELECT id,slug,title,summary,status,started_at AS startedAt,ended_at AS endedAt FROM live_coverage WHERE status='live' ORDER BY started_at DESC LIMIT 20").all();
    return json({items:rows.results});
  }
  if (url.pathname.startsWith("/api/live/") && request.method === "GET") {
    const slug=decodeURIComponent(url.pathname.split("/").pop()||"");
    const item=await env.DB.prepare("SELECT id,slug,title,summary,status,started_at AS startedAt,ended_at AS endedAt FROM live_coverage WHERE slug=? AND status IN ('live','ended')").bind(slug).first();
    if(!item) return err("Live coverage not found.",404);
    const updates=await env.DB.prepare("SELECT body,media_url AS mediaUrl,source_url AS sourceUrl,created_at AS createdAt FROM live_updates WHERE coverage_id=? ORDER BY created_at DESC LIMIT 100").bind(item.id).all();
    return json({item,updates:updates.results});
  }
  if (url.pathname === "/api/media" && request.method === "GET") {
    const rows=await env.DB.prepare("SELECT id,title,description,media_type AS mediaType,media_url AS mediaUrl,thumbnail_url AS thumbnailUrl,category,published_at AS publishedAt FROM media_items WHERE status='published' ORDER BY published_at DESC LIMIT 50").all();
    return json({items:rows.results});
  }

  if (url.pathname === "/api/articles" && request.method === "GET") {
    const rows = await env.DB.prepare("SELECT id,slug,title,dek,category,published_at AS publishedAt FROM articles WHERE status='published' ORDER BY published_at DESC LIMIT 50").all();
    return json({ articles:rows.results });
  }

  if (url.pathname === "/api/admin/articles" && request.method === "GET") {
    const user = await currentUser(request,env);
    if (!allowedRoles(user,["admin","editor"])) return err("Editor access required.",403);
    const rows = await env.DB.prepare("SELECT * FROM articles ORDER BY updated_at DESC LIMIT 100").all();
    return json({ articles:rows.results },200,{"cache-control":"no-store"});
  }
  if (url.pathname === "/api/admin/articles" && request.method === "POST") {
    const user = await currentUser(request,env);
    if (!allowedRoles(user,["admin","editor"])) return err("Editor access required.",403);
    const body = await request.json().catch(()=>({}));
    const title = String(body.title||"").trim().slice(0,180), dek = String(body.dek||"").trim().slice(0,400), bodyText = String(body.body||"").slice(0,100000), category = String(body.category||"Analysis").slice(0,40);
    if (title.length < 8) return err("Title must be at least 8 characters.");
    const id = randomId(), slug = slugify(body.slug || title), status = body.status === "published" ? "published" : "draft";
    await env.DB.prepare("INSERT INTO articles (id,slug,title,dek,body,category,status,author_id,published_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(id,slug,title,dek,bodyText,category,status,user.id,status==="published"?new Date().toISOString():null).run();
    await env.DB.prepare("INSERT INTO audit_log (id,actor_id,action,target_type,target_id,details) VALUES (?,?,?,?,?,?)").bind(randomId(),user.id,"article.create","article",id,JSON.stringify({title,status})).run();
    return json({ok:true,id,slug},201,{"cache-control":"no-store"});
  }

  if (url.pathname === "/api/admin/overview" && request.method === "GET") {
    const user = await currentUser(request,env);
    if (!allowedRoles(user,["admin"])) return err("Administrator access required.",403);
    const [members, articles, drafts, leads, discussions, events] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS n FROM users").first(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM articles WHERE status='published'").first(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM articles WHERE status='draft'").first(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM leads").first(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM community_posts WHERE status='published'").first(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM events WHERE status='published'").first()
    ]);
    return json({members:members.n,published:articles.n,drafts:drafts.n,leads:leads.n,discussions:discussions.n,events:events.n,generatedAt:new Date().toISOString()},200,{"cache-control":"no-store"});
  }


  if (url.pathname === "/api/community/posts" && request.method === "GET") {
    const rows = await env.DB.prepare(
      "SELECT p.id,p.title,p.body,p.topic,p.created_at AS createdAt,u.display_name AS author FROM community_posts p JOIN users u ON u.id=p.user_id WHERE p.status='published' ORDER BY p.created_at DESC LIMIT 50"
    ).all();
    return json({ posts: rows.results });
  }
  if (url.pathname === "/api/community/posts" && request.method === "POST") {
    const user = await currentUser(request, env);
    if (!user) return err("Sign in required to start a discussion.", 401);
    const body = await request.json().catch(() => ({}));
    const title = String(body.title || "").trim().slice(0, 180);
    const content = String(body.body || "").trim().slice(0, 5000);
    const topic = String(body.topic || "General").trim().slice(0, 80);
    if (title.length < 5 || content.length < 10) return err("Add a clear title and a post of at least 10 characters.");
    const id = randomId();
    await env.DB.prepare("INSERT INTO community_posts (id,user_id,title,body,topic) VALUES (?,?,?,?,?)").bind(id,user.id,title,content,topic).run();
    return json({ok:true,id},201,{"cache-control":"no-store"});
  }

  if (url.pathname.startsWith("/api/admin/community/") && request.method === "PUT") {
    const user=await currentUser(request,env);
    if(!allowedRoles(user,["admin","editor"])) return err("Editor access required.",403);
    const id=decodeURIComponent(url.pathname.split("/").pop()), b=await request.json().catch(()=>({}));
    const status=String(b.status||"");
    if(!["published","hidden","removed"].includes(status)) return err("Invalid moderation status.");
    await env.DB.prepare("UPDATE community_posts SET status=? WHERE id=?").bind(status,id).run();
    await env.DB.prepare("INSERT INTO audit_log (id,actor_id,action,target_type,target_id,details) VALUES (?,?,?,?,?,?)").bind(randomId(),user.id,"community.moderate","community_post",id,JSON.stringify({status})).run();
    return json({ok:true},200,{"cache-control":"no-store"});
  }

  if (url.pathname === "/api/events" && request.method === "GET") {
    const rows = await env.DB.prepare("SELECT id,title,description,event_type AS eventType,starts_at AS startsAt,access FROM events WHERE status='published' AND starts_at >= ? ORDER BY starts_at LIMIT 30").bind(new Date().toISOString()).all();
    return json({events:rows.results});
  }
  if (url.pathname === "/api/events" && request.method === "POST") {
    const user = await currentUser(request,env);
    if (!allowedRoles(user,["admin","editor"])) return err("Editor access required.",403);
    const b = await request.json().catch(()=>({}));
    const title=String(b.title||"").trim().slice(0,180), starts=String(b.startsAt||"");
    if(title.length<5 || Number.isNaN(Date.parse(starts))) return err("A title and valid start date are required.");
    const id=randomId();
    await env.DB.prepare("INSERT INTO events (id,title,description,event_type,starts_at,access,status,created_by) VALUES (?,?,?,?,?,?,?,?)").bind(id,title,String(b.description||"").slice(0,3000),String(b.eventType||"Briefing").slice(0,40),new Date(starts).toISOString(),["public","member","premium"].includes(b.access)?b.access:"public","published",user.id).run();
    return json({ok:true,id},201,{"cache-control":"no-store"});
  }
  if (url.pathname === "/api/lead" && request.method === "POST") {
    const b = await request.json().catch(()=>({}));
    const name=String(b.name||"").trim().slice(0,120), email=String(b.email||"").trim().toLowerCase().slice(0,180);
    if(name.length<2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err("Enter a name and valid email address.");
    const id=randomId();
    await env.DB.prepare("INSERT INTO leads (id,name,email,organisation,interest,source) VALUES (?,?,?,?,?,?)").bind(id,name,email,String(b.organisation||"").slice(0,180),String(b.interest||"General").slice(0,100),String(b.source||"Raisina Wire website").slice(0,100)).run();
    return json({ok:true,message:"Thanks. Your request has been received."},201,{"cache-control":"no-store"});
  }
  if (url.pathname === "/api/admin/overview" && request.method === "GET") {
    const user = await currentUser(request,env);
    if (!allowedRoles(user,["admin"])) return err("Administrator access required.",403);
    const [members, published, drafts, leads, discussions, events] = await Promise.all([
      env.DB.prepare("SELECT COUNT(*) AS n FROM users").first(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM articles WHERE status='published'").first(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM articles WHERE status='draft'").first(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM leads").first(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM community_posts WHERE status='published'").first(),
      env.DB.prepare("SELECT COUNT(*) AS n FROM events WHERE status='published'").first()
    ]);
    return json({members:members.n,published:published.n,drafts:drafts.n,leads:leads.n,discussions:discussions.n,events:events.n,generatedAt:new Date().toISOString()},200,{"cache-control":"no-store"});
  }
  if (url.pathname === "/api/admin/leads" && request.method === "GET") {
    const user=await currentUser(request,env);
    if(!allowedRoles(user,["admin"])) return err("Administrator access required.",403);
    const rows=await env.DB.prepare("SELECT * FROM leads ORDER BY created_at DESC LIMIT 500").all();
    return json({leads:rows.results},200,{"cache-control":"no-store"});
  }
  if (url.pathname.startsWith("/api/admin/leads/") && request.method === "PUT") {
    const user=await currentUser(request,env);
    if(!allowedRoles(user,["admin"])) return err("Administrator access required.",403);
    const id=decodeURIComponent(url.pathname.split("/").pop()), b=await request.json().catch(()=>({}));
    const stage=String(b.stage||"New");
    if(!["New","Contacted","Qualified","Demo","Proposal","Won","Lost"].includes(stage)) return err("Invalid lead stage.");
    await env.DB.prepare("UPDATE leads SET stage=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(stage,String(b.notes||"").slice(0,5000),id).run();
    return json({ok:true},200,{"cache-control":"no-store"});
  }
  if (url.pathname === "/api/admin/members" && request.method === "GET") {
    const user=await currentUser(request,env);
    if(!allowedRoles(user,["admin"])) return err("Administrator access required.",403);
    const rows=await env.DB.prepare("SELECT id,email,display_name AS displayName,role,created_at AS createdAt FROM users ORDER BY created_at DESC LIMIT 500").all();
    return json({members:rows.results},200,{"cache-control":"no-store"});
  }
  if (url.pathname.startsWith("/api/admin/members/") && request.method === "PUT") {
    const user=await currentUser(request,env);
    if(!allowedRoles(user,["admin"])) return err("Administrator access required.",403);
    const id=decodeURIComponent(url.pathname.split("/").pop()), b=await request.json().catch(()=>({}));
    const role=String(b.role||"member");
    if(!["member","premium","analyst","editor","admin"].includes(role)) return err("Invalid role.");
    if(id===user.id && role!=="admin") return err("You cannot remove your own administrator role.");
    await env.DB.prepare("UPDATE users SET role=? WHERE id=?").bind(role,id).run();
    await env.DB.prepare("INSERT INTO audit_log (id,actor_id,action,target_type,target_id,details) VALUES (?,?,?,?,?,?)").bind(randomId(),user.id,"member.role.update","user",id,JSON.stringify({role})).run();
    return json({ok:true},200,{"cache-control":"no-store"});
  }
  if (url.pathname === "/api/admin/social-metrics" && request.method === "GET") {
    const user=await currentUser(request,env);
    if(!allowedRoles(user,["admin"])) return err("Administrator access required.",403);
    const rows=await env.DB.prepare("SELECT * FROM social_metrics ORDER BY recorded_at DESC LIMIT 200").all();
    return json({metrics:rows.results,note:"Only connected or manually entered metrics are shown. No fabricated analytics."},200,{"cache-control":"no-store"});
  }
  if (url.pathname === "/api/admin/social-metrics" && request.method === "POST") {
    const user=await currentUser(request,env);
    if(!allowedRoles(user,["admin"])) return err("Administrator access required.",403);
    const b=await request.json().catch(()=>({}));
    const platform=String(b.platform||"").slice(0,50), metric=String(b.metric||"").slice(0,80), value=Number(b.value);
    if(!platform||!metric||!Number.isFinite(value)) return err("Platform, metric and numeric value are required.");
    await env.DB.prepare("INSERT INTO social_metrics (id,platform,metric,value,period,source_note) VALUES (?,?,?,?,?,?)").bind(randomId(),platform,metric,value,String(b.period||"latest").slice(0,50),String(b.sourceNote||"Manual entry").slice(0,180)).run();
    return json({ok:true},201,{"cache-control":"no-store"});
  }

  return err("Not found.",404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try { return await api(request,env); }
      catch (e) { return json({error:"Internal API error",detail:e.message},500,{"cache-control":"no-store"}); }
    }
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Raisina Wire assets are not built. Run npm run build.", { status: 503 });
  }
};
