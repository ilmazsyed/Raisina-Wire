import "./style.css";
const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => [...root.querySelectorAll(sel)];
const state = { news: [], newsUpdatedAt: null, markets: null, activeTopic: "All", installPrompt: null, user: null, mode: "dark" };
const topics = ["All","Geopolitics","Security","Markets","India","Diplomacy","Energy"];
const queryForTopic = {
  "All":"(geopolitics OR diplomacy OR security OR international relations)",
  "Geopolitics":"(geopolitics OR strategic competition OR foreign policy OR diplomacy)",
  "Security":"(defence OR military OR security OR conflict OR NATO)",
  "Markets":"(oil prices OR global markets OR trade OR energy security)",
  "India":"(India foreign policy OR India diplomacy OR India security OR Indo-Pacific)",
  "Diplomacy":"(summit OR foreign minister OR diplomatic talks OR treaty)",
  "Energy":"(energy security OR oil OR gas OR critical minerals)"
};
const fmt = (v, digits=2) => Number.isFinite(Number(v)) ? Number(v).toLocaleString("en-IN",{maximumFractionDigits:digits,minimumFractionDigits:digits}) : "—";
const dateAgo = (s) => {
  if (!s) return "Time not supplied";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s);
  const mins = Math.max(0, Math.floor((Date.now()-d.getTime())/60000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins/60)}h ago`;
  return d.toLocaleDateString("en-IN",{day:"numeric",month:"short"});
};
const esc = (s="") => String(s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const categoryFor = (a) => {
  const t = `${a.title} ${a.domain}`.toLowerCase();
  if (/oil|market|trade|econom|stock|energy|tariff/.test(t)) return "Markets";
  if (/military|defence|defense|naval|missile|army|security|war|conflict/.test(t)) return "Security";
  if (/india|indian|delhi|modi|indo-pacific/.test(t)) return "India";
  if (/summit|diplom|foreign minister|treaty|ambassador/.test(t)) return "Diplomacy";
  return "Geopolitics";
};
const imgFor = (a) => a.image && /^https?:\/\//.test(a.image) ? a.image : "";
const fallbackImage = "https://images.unsplash.com/photo-1521295121783-8a321d551ad2?auto=format&fit=crop&w=1200&q=80";

function renderShell() {
  $("#app").innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <button class="menu-btn icon-btn" aria-label="Open menu" id="menuToggle">☰</button>
      <a class="wordmark" href="#" aria-label="Raisina Wire home"><span class="rw-monogram">RW</span><span><b>RAISINA <i>WIRE</i></b><small>IDEAS · INTELLIGENCE · IMPACT</small></span></a>
      <nav class="desktop-nav" aria-label="Main navigation">
        <a class="active" href="#home">Home</a><a href="#coverage">Geopolitics</a><a href="#coverage">Security</a><a href="#markets">Markets</a><a href="#analysis">Analysis</a><a href="#regions">Regions</a><a href="#briefings">Briefings</a><a href="#academy">Academy</a><a href="#community">Community</a>
      </nav>
      <div class="top-actions"><button class="icon-btn search-open" aria-label="Search" id="searchOpen">⌕</button><button class="btn btn-outline" id="signInBtn">Sign in</button><button class="btn btn-gold" id="joinBtn">Join free</button></div>
    </header>
    <div class="mobile-menu" id="mobileMenu"><a href="#coverage">Geopolitics</a><a href="#markets">Markets</a><a href="#analysis">Analysis</a><a href="#briefings">Briefings</a><a href="#academy">Academy</a><a href="#community">Community</a></div>
    <main id="home">
      <section class="hero-grid">
        <div class="hero-copy">
          <div class="eyebrow"><span class="live-dot"></span> LIVE GLOBAL WATCH <span class="eyebrow-line"></span><span class="muted" id="newsFreshness">CONNECTING TO GLOBAL DESK</span></div>
          <h1 id="heroTitle">The world is changing.<br><em>Understand why.</em></h1>
          <p class="hero-dek" id="heroDek">Geopolitics, security, markets and the strategic forces reshaping our world — through an Indian lens.</p>
          <div class="hero-actions"><a class="btn btn-gold btn-large" href="#analysis">Explore the analysis <span>↗</span></a><button class="play-briefing" id="briefingPlay"><span class="play-icon">▶</span><span><b>Listen to the briefing</b><small>Editorial audio experience · coming soon</small></span></button></div>
          <div class="hero-foot"><span class="live-dot"></span><span>LIVE COVERAGE</span><span class="foot-divider"></span><span id="liveCount">Global coverage clusters</span><span class="foot-divider"></span><span>Editorially curated</span></div>
        </div>
        <div class="globe-panel" id="coverage">
          <div class="globe-top"><span class="panel-kicker">THE WORLD, IN CONTEXT</span><div class="globe-tools"><button class="tool active" data-layer="all">Globe</button><button class="tool" data-layer="security">Security</button><button class="tool" data-layer="markets">Markets</button></div></div>
          <canvas id="globeCanvas" aria-label="Animated globe showing broad news coverage clusters"></canvas>
          <div class="globe-caption"><span class="live-dot"></span><b>Coverage clusters</b><span>Derived from current global news coverage — not operational tracking</span></div>
          <div class="globe-legend"><span><i class="legend-dot red"></i> Security</span><span><i class="legend-dot gold"></i> Diplomacy</span><span><i class="legend-dot blue"></i> Markets & trade</span></div>
          <div class="globe-refresh" id="globeRefresh">Updated from news feed when available</div>
        </div>
        <aside class="live-rail">
          <div class="section-head"><div><span class="live-dot"></span><b>Live global desk</b></div><span class="tiny-label">GDELT</span></div>
          <div id="liveEvents" class="event-list"><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div></div>
          <div class="rail-divider"></div>
          <div class="rail-brief">
            <div class="rail-brief-image" aria-hidden="true"></div><div><span class="tiny-label">THE STRATEGIC PICTURE</span><b>Follow the forces behind the headlines.</b><a href="#briefings">Explore briefings ↗</a></div>
          </div>
        </aside>
      </section>
      <section class="market-strip" id="markets">
        <div class="market-title"><span class="tiny-label">MARKET PULSE</span><b>Prices & moves</b><small id="marketUpdated">Connecting to sources…</small><small id="marketSourceStatus">Checking market provider…</small></div>
        <div id="marketItems" class="market-items"><div class="market-cell"><small>Market feed</small><b>Loading…</b></div></div>
        <div class="market-note">Quotes may be delayed or last available · Not investment advice</div>
      </section>
      <section class="content-layout" id="analysis">
        <div class="main-column">
          <div class="section-heading"><div><span class="section-index">01 / THE WORLD NOW</span><h2>Stories that shape strategy.</h2></div><a class="text-link" href="#coverage">Explore coverage ↗</a></div>
          <div class="topic-tabs" id="topicTabs">${topics.map(t=>`<button class="topic-tab ${t==="All"?"selected":""}" data-topic="${t}">${t}</button>`).join("")}</div>
          <div class="story-grid" id="storyGrid"><div class="story-placeholder">Retrieving the latest global reporting…</div></div>
          <div class="source-note">Source: GDELT global news index. Headlines and links belong to their original publishers. Raisina Wire editorial selection is separate from the source feed.</div>
        </div>
        <aside class="side-column">
          <div class="section-heading compact"><div><span class="section-index">02 / THE AGENDA</span><h2>Coming into focus.</h2></div></div>
          <div class="agenda-list">
            <a href="#briefings" class="agenda-item"><span class="agenda-number">01</span><div><b>The Indo-Pacific reset</b><small>Regional strategy · Briefing</small></div><span>↗</span></a>
            <a href="#briefings" class="agenda-item"><span class="agenda-number">02</span><div><b>Energy in a fractured world</b><small>Markets · Risk</small></div><span>↗</span></a>
            <a href="#academy" class="agenda-item"><span class="agenda-number">03</span><div><b>OSINT for strategic professionals</b><small>Academy · Learning</small></div><span>↗</span></a>
          </div>
          <div class="membership-card"><span class="tiny-label">YOUR INTELLIGENCE WORKSPACE</span><h3>Follow what matters to you.</h3><p>Save regions, track issues and build a personal briefing list.</p><button class="btn btn-gold" id="workspaceBtn">Create your free account ↗</button></div>
          <div class="community-mini" id="community"><div class="section-heading compact"><div><span class="section-index">03 / COMMUNITY</span><h2>Ideas in conversation.</h2></div></div><p>Join moderated discussions, expert briefings and research missions with a community interested in how the world works.</p><div id="communityPosts" class="community-posts"><p class="muted">Loading member discussions…</p></div><button class="btn btn-outline full" id="communityBtn">Start or join a discussion ↗</button></div>
        </aside>
      </section>
      <section class="briefing-band" id="briefings"><div><span class="section-index">04 / RAISINA BRIEFINGS</span><h2>Less noise.<br><em>More signal.</em></h2><p>Concise, source-led briefings that connect events to strategic consequences.</p><button class="btn btn-gold" id="briefingJoin">Get the daily briefing ↗</button></div><div class="briefing-cards"><article><span>GEOPOLITICS</span><b>What changed overnight — and why it matters</b><small>Daily intelligence note · Editorial series</small></article><article><span>INDIA & THE WORLD</span><b>Reading the strategic choices ahead</b><small>Perspective · Analysis</small></article><article><span>RISK & RESILIENCE</span><b>Signals to watch across regions and sectors</b><small>Weekly briefing · In development</small></article></div></section>
      <section class="events-band" id="events"><div><span class="section-index">05 / EVENTS & BRIEFINGS</span><h2>Meet around ideas.</h2><p>Expert briefings, debates and learning sessions. Published events update from the platform database.</p></div><div id="publicEvents" class="public-events"><p class="muted">Loading published events…</p></div></section><section class="academy-band" id="academy"><div class="academy-mark">RW<span> / </span>ACADEMY</div><div><span class="section-index">05 / LEARN WITH PURPOSE</span><h2>Build the skills to read the world.</h2><p>Structured learning in OSINT, geopolitical analysis and strategic intelligence — from foundations to professional practice.</p></div><a class="btn btn-outline" href="https://calibrex.org/" target="_blank" rel="noreferrer">Explore the Calibrex ecosystem ↗</a></section>
      <section class="calibrex-band"><div class="calibrex-intro"><span class="tiny-label">INTELLIGENCE TOOLS</span><h2>Research is a discipline.<br><em>Make it actionable.</em></h2><p>Discover tools for investigation and newsroom operations from Calibrex.</p><a class="text-link" href="https://calibrex.org/" target="_blank" rel="noreferrer">Discover Calibrex ↗</a></div><a class="product-tile" href="https://calibrex.org/" target="_blank" rel="noreferrer"><span class="product-icon">◎</span><span class="tiny-label">INVESTIGATE</span><b>OSINT Studio</b><small>Open-source intelligence workflows.</small><span class="tile-arrow">↗</span></a><a class="product-tile" href="https://calibrex.org/" target="_blank" rel="noreferrer"><span class="product-icon">▦</span><span class="tiny-label">OPERATE</span><b>NRCS</b><small>Newsroom operations and coordination.</small><span class="tile-arrow">↗</span></a><a class="product-tile" href="https://calibrex.org/" target="_blank" rel="noreferrer"><span class="product-icon">↗</span><span class="tiny-label">LEARN</span><b>Academy</b><small>Professional learning pathways.</small><span class="tile-arrow">↗</span></a></section>
      <footer class="footer"><a class="wordmark footer-brand" href="#"><span class="rw-monogram">RW</span><span><b>RAISINA <i>WIRE</i></b><small>AN INDIAN PERSPECTIVE ON A CHANGING WORLD</small></span></a><div class="footer-links"><a href="#analysis">About</a><a href="#briefings">Editorial standards</a><a href="#community">Contact</a><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a><a id="linkedinLink" href="https://www.linkedin.com/" target="_blank" rel="noreferrer">Follow on LinkedIn ↗</a></div><small class="copyright">© ${new Date().getFullYear()} Raisina Wire. Independent editorial platform.</small><form id="leadForm" class="footer-lead"><span class="tiny-label">BRIEFINGS & PARTNERSHIPS</span><input name="name" placeholder="Your name" required minlength="2"><input name="email" type="email" placeholder="Work email" required><input name="organisation" placeholder="Organisation (optional)"><select name="interest"><option>Daily briefing</option><option>Academy training</option><option>Calibrex enterprise enquiry</option><option>Speaking / partnership</option></select><button class="btn btn-gold" type="submit">Request contact ↗</button><small id="leadMessage" aria-live="polite"></small></form></footer>
    </main>
    <div class="modal-backdrop hidden" id="modalBackdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle"><button class="modal-close" id="modalClose" aria-label="Close">×</button><div class="modal-eyebrow">RAISINA WIRE MEMBERSHIP</div><h2 id="modalTitle">Make the world make sense.</h2><p class="modal-intro">Create a free account to save topics and shape your briefing workspace.</p><div id="authMessage" class="auth-message" aria-live="polite"></div><form id="authForm"><label id="nameField" class="hidden">Your name<input name="displayName" autocomplete="name" minlength="2" /></label><label>Email address<input name="email" type="email" autocomplete="email" required /></label><label>Password <small>(12+ characters)</small><input name="password" type="password" minlength="12" autocomplete="current-password" required /></label><button class="btn btn-gold full" type="submit" id="authSubmit">Sign in</button></form><div class="auth-switch"><span id="authSwitchText">New to Raisina Wire?</span><button id="authSwitch" type="button">Create an account</button></div><p class="modal-legal">Account features require the Cloudflare D1 database to be configured. No paid membership is processed in this starter.</p></section></div>
    <div class="toast" id="toast" role="status"></div>
    <button class="install-pill hidden" id="installPill">＋ Install Raisina Wire</button>
  </div>`;
  bindUI();
}

function bindUI() {
  $("#menuToggle").addEventListener("click",()=>$("#mobileMenu").classList.toggle("open"));
  $("#searchOpen").addEventListener("click",()=>openSearch());
  ["signInBtn","joinBtn","workspaceBtn","communityBtn","briefingJoin"].forEach(id=>$("#"+id)?.addEventListener("click",()=>openAuth(id==="signInBtn"?"login":"register")));
  $("#communityBtn").addEventListener("click",()=>{if(!state.user){openAuth("register");return;}openDiscussionForm();});
  $("#leadForm").addEventListener("submit",submitLead);
  $("#briefingPlay").addEventListener("click",()=>toast("Audio briefings are planned; no audio stream is connected yet."));
  $("#topicTabs").addEventListener("click",e=>{const b=e.target.closest("[data-topic]");if(!b)return;state.activeTopic=b.dataset.topic;$$(".topic-tab").forEach(x=>x.classList.toggle("selected",x===b));renderStories();});
  $$(".tool").forEach(b=>b.addEventListener("click",()=>{$$(".tool").forEach(x=>x.classList.toggle("active",x===b));globeLayer=b.dataset.layer;}));
  $("#modalClose").addEventListener("click",closeAuth);
  $("#modalBackdrop").addEventListener("click",e=>{if(e.target.id==="modalBackdrop")closeAuth();});
  $("#authSwitch").addEventListener("click",()=>setAuthMode(authMode==="login"?"register":"login"));
  $("#authForm").addEventListener("submit",submitAuth);
  $("#installPill").addEventListener("click",installPWA);
  $("#linkedinLink").addEventListener("click",e=>{if(e.currentTarget.href.endsWith("linkedin.com/")){e.preventDefault();toast("Add the official Raisina Wire LinkedIn URL in Cloudflare Worker variables.");}});
}

let authMode="login";
function openAuth(mode="register"){setAuthMode(mode);$("#modalBackdrop").classList.remove("hidden");}
function closeAuth(){$("#modalBackdrop").classList.add("hidden");}
function setAuthMode(mode){authMode=mode;$("#modalTitle").textContent=mode==="login"?"Welcome back.":"Make the world make sense.";$("#nameField").classList.toggle("hidden",mode==="login");$("#nameField input").required=mode==="register";$("#authSubmit").textContent=mode==="login"?"Sign in":"Create free account";$("#authSwitchText").textContent=mode==="login"?"New to Raisina Wire?":"Already have an account?";$("#authSwitch").textContent=mode==="login"?"Create an account":"Sign in instead";$("#authMessage").textContent="";}
async function submitAuth(e){
  e.preventDefault();const form=new FormData(e.currentTarget);const payload={email:form.get("email"),password:form.get("password"),displayName:form.get("displayName")};
  $("#authSubmit").disabled=true;$("#authMessage").textContent="Connecting securely…";
  try{const r=await fetch(`/api/auth/${authMode==="login"?"login":"register"}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});const d=await r.json();if(!r.ok)throw new Error(d.error||"Request failed.");if(authMode==="register"){$("#authMessage").textContent="Account created. Sign in with your credentials.";setAuthMode("login");}else{state.user=d.user;$("#authMessage").textContent=`Signed in as ${d.user.displayName}.`;toast(`Welcome, ${d.user.displayName}.`);setTimeout(closeAuth,700);$("#signInBtn").textContent="Account";$("#joinBtn").textContent=d.user.role==="premium"?"Premium":d.user.role;}}catch(err){$("#authMessage").textContent=err.message;}finally{$("#authSubmit").disabled=false;}
}
function toast(msg){const t=$("#toast");t.textContent=msg;t.classList.add("show");setTimeout(()=>t.classList.remove("show"),3500);}
function openSearch(){const q=prompt("Search current global news");if(q?.trim()){loadNews(q.trim()).then(()=>{state.activeTopic="All";renderStories();document.querySelector("#analysis").scrollIntoView({behavior:"smooth"});});}}

async function loadNews(q=queryForTopic[state.activeTopic]||queryForTopic.All){
  const freshness=$("#newsFreshness");freshness.textContent="UPDATING GLOBAL DESK";
  try{const r=await fetch(`/api/news?q=${encodeURIComponent(q)}`);const d=await r.json();if(!r.ok)throw new Error(d.error||"feed unavailable");state.news=d.articles||[];state.newsUpdatedAt=d.updatedAt;freshness.textContent=d.updatedAt?`SYNCED ${new Date(d.updatedAt).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}`:"SOURCE OFFLINE";$("#globeRefresh").textContent=d.updatedAt?`News index synced ${dateAgo(d.updatedAt)}`:"No successful sync timestamp";$("#liveCount").textContent=`${state.news.length} current articles in feed`;renderEvents();renderStories();updateGlobePoints();}catch(e){freshness.textContent="FEED UNAVAILABLE";$("#liveEvents").innerHTML=`<div class="feed-error">The global news feed could not be reached. Try again shortly.</div>`;$("#storyGrid").innerHTML=`<div class="feed-error">Live headlines are unavailable. No placeholder stories are being passed off as current news.</div>`;}
}
function renderEvents(){
  const list=state.news.slice(0,5);
  $("#liveEvents").innerHTML=list.length?list.map((a,i)=>`<a class="event-row" href="${esc(a.url)}" target="_blank" rel="noreferrer"><span class="event-time">${dateAgo(a.publishedAt)}</span><span class="event-dot ${i%3===0?"red":i%3===1?"gold":"blue"}"></span><span class="event-title">${esc(a.title)}</span><span class="event-arrow">↗</span></a>`).join(""):`<p class="feed-error">No articles returned by the source.</p>`;
}
function renderStories(){
  let list=state.news;
  if(state.activeTopic!=="All")list=list.filter(a=>categoryFor(a)===state.activeTopic || (state.activeTopic==="Geopolitics"&&categoryFor(a)==="Diplomacy"));
  list=list.slice(0,6);
  if(!list.length){$("#storyGrid").innerHTML=`<div class="feed-error">No current results for this topic. Choose another topic or refresh the feed.</div>`;return;}
  $("#storyGrid").innerHTML=list.map((a,i)=>{
    const category=categoryFor(a), image=imgFor(a)||fallbackImage;
    return `<article class="story-card ${i===0?"featured-story":""}"><a class="story-image" href="${esc(a.url)}" target="_blank" rel="noreferrer" style="background-image:linear-gradient(0deg,rgba(3,9,14,.65),transparent 55%),url('${esc(image)}')"><span class="story-category">${esc(category.toUpperCase())}</span><span class="story-image-arrow">↗</span></a><div class="story-content"><a href="${esc(a.url)}" target="_blank" rel="noreferrer" class="story-title">${esc(a.title)}</a><p>${esc(a.domain||"Source publisher")} · Current global coverage</p><div class="story-meta"><span>${dateAgo(a.publishedAt)}</span><button class="save-topic" data-save="${esc(category)}" title="Follow this topic">＋ Follow ${esc(category)}</button></div></div></article>`;
  }).join("");
  $$(".save-topic").forEach(b=>b.addEventListener("click",()=>saveTopic(b.dataset.save)));
}
async function saveTopic(topic){
  if(!state.user){openAuth("login");toast("Sign in to save topics.");return;}
  try{const r=await fetch("/api/topics",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({topic})});const d=await r.json();if(!r.ok)throw new Error(d.error||"Could not save topic");toast(`Following ${topic}.`);}catch(e){toast(e.message);}
}


async function loadCommunityAndEvents(){
  try {
    const d=await fetch("/api/community/posts").then(r=>r.json());
    const posts=d.posts||[];
    $("#communityPosts").innerHTML=posts.length?posts.slice(0,3).map(p=>`<article class="community-post"><span class="tiny-label">${esc(p.topic)}</span><b>${esc(p.title)}</b><small>${esc(p.author)} · ${dateAgo(p.createdAt)}</small></article>`).join(""):`<div class="community-empty">No public discussions yet. Members can start the first conversation.</div>`;
  } catch { $("#communityPosts").innerHTML=`<div class="community-empty">Community discussions are available after the database is configured.</div>`; }
  try {
    const d=await fetch("/api/events").then(r=>r.json()), events=d.events||[];
    $("#publicEvents").innerHTML=events.length?events.slice(0,3).map(e=>`<article class="public-event"><span class="event-date">${new Date(e.startsAt).toLocaleDateString("en-IN",{day:"2-digit",month:"short"}).toUpperCase()}</span><div><b>${esc(e.title)}</b><small>${esc(e.eventType)} · ${esc(e.access)} access</small><p>${esc(e.description||"Details will be shared with registered attendees.")}</p></div></article>`).join(""):`<div class="community-empty">No upcoming events published yet.</div>`;
  } catch { $("#publicEvents").innerHTML=`<div class="community-empty">Events will appear here when the database and event publishing are configured.</div>`; }
}
function openDiscussionForm(){
  const title=prompt("Discussion title (at least 5 characters)");
  if(!title)return;
  const body=prompt("Your opening post (at least 10 characters)");
  if(!body)return;
  const topic=prompt("Topic: Geopolitics, Security, Markets, India or General","Geopolitics")||"General";
  fetch("/api/community/posts",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({title,body,topic})})
    .then(async r=>{const d=await r.json();if(!r.ok)throw new Error(d.error||"Could not post");toast("Discussion published.");loadCommunityAndEvents();})
    .catch(e=>toast(e.message));
}
async function submitLead(e){
  e.preventDefault();const form=e.currentTarget;const payload=Object.fromEntries(new FormData(form));
  const msg=$("#leadMessage");msg.textContent="Submitting…";
  try{const r=await fetch("/api/lead",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});const d=await r.json();if(!r.ok)throw new Error(d.error||"Could not submit");msg.textContent=d.message||"Request received.";form.reset();}
  catch(err){msg.textContent=err.message==="Database is not configured. Add a D1 binding before using account and publishing features."?"Contact form is not live until the database is configured.":err.message;}
}

async function loadMarkets(){
  const host=$("#marketItems"), updated=$("#marketUpdated"), sourceStatus=$("#marketSourceStatus");
  try{
    const r=await fetch("/api/markets");const d=await r.json();if(!r.ok)throw new Error(d.error||"Market feed unavailable");
    state.markets=d;
    const items=[...(d.items||[]),...(d.fx?[d.fx]:[])];
    const groups=[
      {name:"Stocks & shares",items:items.filter(x=>["Stocks","India equities","Indices"].includes(x.category))},
      {name:"Currencies",items:items.filter(x=>x.category==="Currencies")},
      {name:"Commodities",items:items.filter(x=>x.category==="Commodities")}
    ].filter(g=>g.items.length);
    if(!items.length){host.innerHTML=`<div class="market-cell"><small>Market pulse</small><b>No quotes available</b></div>`;}
    else host.innerHTML=groups.map(group=>`<div class="market-group"><div class="market-group-title">${esc(group.name)}</div><div class="market-group-items">${group.items.map(x=>{
      const unavailable=x.value===null||x.value===undefined;
      const statusText=x.status==="keyless-quote"?"LATEST AVAILABLE":x.status==="daily-delayed"?"DAILY CLOSE":x.status==="daily-reference"?"DAILY FX REF":unavailable?"UNAVAILABLE":"INDICATIVE";
      const pct=Number(x.changePct);
      const changeLabel=Number.isFinite(pct)?`${pct>0?"+":""}${fmt(pct,2)}%`:x.status==="daily-reference"?"Reference rate":unavailable?"No quote":"Change n/a";
      return `<div class="market-cell"><small>${esc(x.label)}</small><b>${unavailable?"—":fmt(x.value, x.category==="Currencies"||x.symbol==="GC=F"||x.symbol==="CL=F"||x.symbol==="XAU/USD"||x.symbol==="WTI/USD"?4:2)} <em>${esc(x.currency||"")}</em></b><span class="${Number.isFinite(pct)&&pct>0?"positive":Number.isFinite(pct)&&pct<0?"negative":"neutral"}">${esc(changeLabel)}</span><small class="quote-status">${esc(statusText)}${x.date?" · "+esc(String(x.date).slice(0,16)):""}</small></div>`;
    }).join("")}</div></div>`).join("");
    updated.textContent=`Checked ${new Date(d.updatedAt).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",second:"2-digit"})}`;
    sourceStatus.textContent="Keyless public feeds · timing varies by instrument";
    host.title=d.note||"Market data source status";
  }catch(e){
    host.innerHTML=`<div class="market-cell"><small>Markets</small><b>Feed unavailable</b><span class="neutral">No prices fabricated</span></div>`;
    updated.textContent="Sources unavailable";sourceStatus.textContent="Retrying automatically";
  }
}

let globeLayer="all", globeFrame=0, globeRAF=null;
function initGlobe(){
  const canvas=$("#globeCanvas"), ctx=canvas.getContext("2d"); if(!ctx)return;
  const draw=()=>{
    const rect=canvas.getBoundingClientRect(), dpr=Math.min(window.devicePixelRatio||1,2);
    if(canvas.width!==Math.round(rect.width*dpr)||canvas.height!==Math.round(rect.height*dpr)){canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);}
    ctx.setTransform(dpr,0,0,dpr,0,0);
    const w=rect.width,h=rect.height,cx=w*.51,cy=h*.51,r=Math.min(w*.43,h*.47);
    ctx.clearRect(0,0,w,h);
    const bg=ctx.createRadialGradient(cx-r*.2,cy-r*.4,2,cx,cy,r*1.5);bg.addColorStop(0,"rgba(23,64,86,.32)");bg.addColorStop(1,"rgba(4,12,20,0)");
    ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
    ctx.save();ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.clip();
    const ocean=ctx.createRadialGradient(cx-r*.3,cy-r*.4,5,cx,cy,r*1.2);ocean.addColorStop(0,"#123b50");ocean.addColorStop(.58,"#0a2434");ocean.addColorStop(1,"#020a12");ctx.fillStyle=ocean;ctx.fillRect(cx-r,cy-r,2*r,2*r);
    // Latitude/longitude lines
    ctx.strokeStyle="rgba(130,174,190,.14)";ctx.lineWidth=.7;
    for(let i=-3;i<=3;i++){ctx.beginPath();ctx.ellipse(cx,cy+i*r*.22,r,Math.max(2,r*Math.sqrt(Math.max(.02,1-(i*.22)**2))*.17),0,0,Math.PI*2);ctx.stroke();}
    for(let i=-2;i<=2;i++){ctx.beginPath();ctx.ellipse(cx,cy,r*Math.max(.08,Math.cos(i*.42)),r,0,0,Math.PI*2);ctx.stroke();}
    // Stylised landmass contours, intentionally not presented as a precise GIS map
    ctx.fillStyle="rgba(93,139,137,.36)";
    const land=(pts)=>{ctx.beginPath();pts.forEach((p,i)=>i?ctx.lineTo(cx+p[0]*r,cy+p[1]*r):ctx.moveTo(cx+p[0]*r,cy+p[1]*r));ctx.closePath();ctx.fill();};
    land([[-.76,-.47],[-.58,-.65],[-.37,-.62],[-.23,-.48],[-.26,-.27],[-.43,-.12],[-.52,.08],[-.68,-.03],[-.8,-.24]]);
    land([[-.32,.03],[-.18,.08],[-.12,.28],[-.22,.62],[-.37,.48],[-.43,.22]]);
    land([[-.04,-.53],[.18,-.62],[.4,-.54],[.59,-.35],[.55,-.12],[.39,-.04],[.28,.11],[.15,.03],[.07,-.15],[-.12,-.25]]);
    land([[.04,-.06],[.19,-.01],[.25,.18],[.17,.43],[.06,.35],[-.03,.12]]);
    land([[.38,.16],[.59,.1],[.76,.22],[.73,.38],[.52,.36],[.4,.27]]);
    // City light network
    for(let i=0;i<95;i++){const x=cx+(Math.sin(i*127.1)*.82)*r,y=cy+(Math.cos(i*72.7)*.72)*r;if((x-cx)**2+(y-cy)**2<r*r){ctx.fillStyle=i%4===0?"rgba(240,190,104,.85)":"rgba(98,175,207,.45)";ctx.beginPath();ctx.arc(x,y,i%7===0?1.5:.65,0,Math.PI*2);ctx.fill();}}
    // moving orbital arcs
    ctx.strokeStyle="rgba(218,178,103,.5)";ctx.lineWidth=.8;
    for(let i=0;i<3;i++){ctx.beginPath();ctx.ellipse(cx,cy,r*(.62+i*.1),r*(.2+i*.07),-.35+i*.4,Math.PI*.12+globeFrame*.001*(i+1),Math.PI*1.22+globeFrame*.001*(i+1));ctx.stroke();}
    ctx.restore();
    // live topic coverage markers. Coordinates are thematic coverage clusters, not exact event coordinates.
    const counts = (state.news || []).reduce((acc, article) => {
      const category = categoryFor(article);
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {});
    const marks=[
      {x:-.08,y:-.12,label:"EUROPE",kind:"gold",weight:(counts.Diplomacy||0)+(counts.Geopolitics||0)},
      {x:.16,y:.15,label:"INDO-PACIFIC",kind:"red",weight:(counts.Security||0)+(counts.India||0)},
      {x:.29,y:-.02,label:"EAST ASIA",kind:"red",weight:(counts.Security||0)+(counts.Geopolitics||0)},
      {x:-.52,y:-.06,label:"AMERICAS",kind:"blue",weight:(counts.Markets||0)+(counts.Geopolitics||0)},
      {x:.08,y:.38,label:"INDIAN OCEAN",kind:"blue",weight:(counts.India||0)+(counts.Markets||0)},
      {x:.45,y:.22,label:"PACIFIC",kind:"gold",weight:(counts.Diplomacy||0)+(counts.Markets||0)}
    ];
    const palette={red:"#e45e55",gold:"#d7b36b",blue:"#68b7d7"};
    marks.forEach((m,i)=>{
      if(globeLayer==="security"&&m.kind==="blue")return;if(globeLayer==="markets"&&m.kind==="red")return;
      const x=cx+m.x*r,y=cy+m.y*r,p=palette[m.kind],pulse=(Math.sin(globeFrame*.045+i)+1)/2;
      const intensity = Math.min(1, (m.weight || 0) / 8);
      ctx.beginPath();ctx.arc(x,y,4+pulse*4+intensity*3,0,Math.PI*2);ctx.strokeStyle=p;ctx.globalAlpha=.15+pulse*.18+intensity*.18;ctx.stroke();ctx.globalAlpha=1;
      ctx.beginPath();ctx.arc(x,y,2.2+intensity*1.4,0,Math.PI*2);ctx.fillStyle=p;ctx.fill();
      ctx.fillStyle="rgba(231,238,240,.84)";ctx.font="9px DM Sans, sans-serif";ctx.fillText(m.label,x+8,y-8);
    });
    globeFrame++;globeRAF=requestAnimationFrame(draw);
  };draw();
  window.addEventListener("resize",()=>{});
}

async function loadConfigAndUser(){
  try{const c=await fetch("/api/config").then(r=>r.json());if(c.linkedinUrl)$("#linkedinLink").href=c.linkedinUrl;}catch{}
  try{const d=await fetch("/api/auth/me").then(r=>r.json());if(d.user){state.user=d.user;$("#signInBtn").textContent="Account";$("#joinBtn").textContent=d.user.role==="premium"?"Premium":"Member";}}catch{}
}
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();state.installPrompt=e;$("#installPill")?.classList.remove("hidden");});
async function installPWA(){if(state.installPrompt){state.installPrompt.prompt();await state.installPrompt.userChoice;state.installPrompt=null;$("#installPill").classList.add("hidden");}else{toast("On iPhone: tap Share, then Add to Home Screen.");}}
window.addEventListener("appinstalled",()=>toast("Raisina Wire installed."));
window.addEventListener("online",()=>{loadNews();loadMarkets();});
document.addEventListener("visibilitychange",()=>{if(!document.hidden){loadNews();loadMarkets();}});
renderShell();initGlobe();loadConfigAndUser();loadNews();loadMarkets();loadCommunityAndEvents();
setInterval(()=>{if(!document.hidden)loadNews();},5*60*1000);
setInterval(()=>{if(!document.hidden)loadMarkets();},60*1000);
setInterval(()=>{if(!document.hidden)loadMarkets();},15*60*1000);
if("serviceWorker" in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("/sw.js").catch(()=>{}));
