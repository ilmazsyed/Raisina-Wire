"""Raisina TV anchor voices: records the anchors' own lines the site is waiting for (hello, bulletins,
News Update lines, intros of new explainers) with Chatterbox and uploads them. Run by the GitHub
Action "Raisina TV anchor voices" (started by the site when lines are waiting).
  RW_PUBLISH_TOKEN=... python video/voices/lines_action.py [minutes]"""
import json, os, sys, time, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
SITE = os.environ.get("RW_SITE", "https://raisinawire.calibrex.org").rstrip("/"); TOKEN = os.environ.get("RW_PUBLISH_TOKEN", "")
BUDGET = float(sys.argv[1] if len(sys.argv) > 1 else 50) * 60
def call(method, path, body=None, ctype=None):
    req = urllib.request.Request(SITE + path, data=body, method=method, headers={"authorization": f"Bearer {TOKEN}", "user-agent": "raisina-anchor-voices", **({"content-type": ctype} if ctype else {})})
    with urllib.request.urlopen(req, timeout=60) as r: return json.loads(r.read() or b"{}")
if not TOKEN: print("::warning::Add the repository secret RW_PUBLISH_TOKEN."); sys.exit(0)
todo = call("GET", "/api/admin/tv/lines-todo")["todo"]
print(f"{len(todo)} lines to record", flush=True)
if not todo: sys.exit(0)
from chatterbox_voice import speak  # noqa: E402
start, ok = time.time(), 0
for j in todo:
    if time.time() - start > BUDGET: print("Time's up for this run; the next one carries on."); break
    t = time.time()
    try:
        call("PUT", f"/api/admin/tv/line/{j['id']}", speak(j.get("say") or j["text"], j["ref"]), "audio/mpeg"); ok += 1
        print(f"ok {j['anchor']} {time.time() - t:.0f}s: {j['text'][:70]}", flush=True)
    except Exception as e: print(f"::warning::{j['id']}: {e}", flush=True)
print(f"{ok} recorded")
