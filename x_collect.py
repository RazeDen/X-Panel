import os, sys, json, csv, datetime as dt
from requests_oauthlib import OAuth1Session

HERE = os.path.dirname(os.path.abspath(__file__))

def load_env():
    env = {}
    with open(os.path.join(HERE, ".env"), encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env

env = load_env()
need = ["X_CONSUMER_KEY", "X_CONSUMER_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET"]
missing = [k for k in need if not env.get(k)]
if missing:
    sys.exit("Порожні поля в .env: " + ", ".join(missing))

s = OAuth1Session(env["X_CONSUMER_KEY"], env["X_CONSUMER_SECRET"],
                  env["X_ACCESS_TOKEN"], env["X_ACCESS_TOKEN_SECRET"])
API = "https://api.x.com/2"

def get(path, params=None):
    r = s.get(API + path, params=params, timeout=30)
    if r.status_code != 200:
        sys.exit(f"HTTP {r.status_code}: {r.text[:600]}")
    return r.json()

mode = sys.argv[1] if len(sys.argv) > 1 else "me"
days = int(sys.argv[2]) if len(sys.argv) > 2 else 7

me = get("/users/me", {"user.fields": "public_metrics,created_at,username"})["data"]
if mode == "me":
    print(json.dumps(me, ensure_ascii=False, indent=2))
    sys.exit(0)

# --- збір постів за N днів ---
now = dt.datetime.now(dt.timezone.utc)
start = (now - dt.timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
fields = "created_at,public_metrics,non_public_metrics,organic_metrics,referenced_tweets,attachments,entities,lang,conversation_id"
posts, token = [], None
while True:
    p = {"max_results": 100, "start_time": start, "tweet.fields": fields}
    if token: p["pagination_token"] = token
    j = get(f"/users/{me['id']}/tweets", p)
    posts += j.get("data", [])
    token = j.get("meta", {}).get("next_token")
    if not token: break

stamp = now.strftime("%Y-%m-%d")
with open(os.path.join(HERE, f"posts_{stamp}.json"), "w", encoding="utf-8") as f:
    json.dump({"collected_at": now.isoformat(), "account": me, "posts": posts}, f, ensure_ascii=False, indent=2)

rows = []
for t in posts:
    pm, npm, om = t.get("public_metrics", {}), t.get("non_public_metrics", {}), t.get("organic_metrics", {})
    ref = (t.get("referenced_tweets") or [{}])[0].get("type", "post")
    rows.append({
        "id": t["id"], "created_at": t["created_at"], "type": ref, "text": t["text"].replace("\n", " "),
        "impressions": pm.get("impression_count"), "likes": pm.get("like_count"), "reposts": pm.get("retweet_count"),
        "replies": pm.get("reply_count"), "quotes": pm.get("quote_count"), "bookmarks": pm.get("bookmark_count"),
        "organic_impressions": om.get("impression_count"), "profile_clicks": npm.get("user_profile_clicks"),
        "url_clicks": npm.get("url_link_clicks"), "engagements": npm.get("engagements"),
    })
if rows:
    with open(os.path.join(HERE, f"posts_{stamp}.csv"), "w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(rows)

# історія метрик акаунту
hist = os.path.join(HERE, "account_history.csv")
new = not os.path.exists(hist)
with open(hist, "a", encoding="utf-8", newline="") as f:
    w = csv.writer(f)
    if new: w.writerow(["date", "followers", "following", "posts_total", "listed"])
    m = me["public_metrics"]
    w.writerow([stamp, m["followers_count"], m["following_count"], m["tweet_count"], m["listed_count"]])
print(f"Зібрано постів: {len(posts)} за {days} днів. Файли: posts_{stamp}.csv / .json, account_history.csv")
