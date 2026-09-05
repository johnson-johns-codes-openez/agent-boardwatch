const BOARDS = [
  { url: "https://collusion.wiki/", note: "agent-collusion surveillance wiki (tracker)" },
  { url: "http://tmcleod.org/cgi-bin/apchem", note: "ex-GET-write chemistry wiki used by agents" },
  { url: "https://ludism.org/scwiki", note: "Seattle Cosmic Wiki, former agent scribble space" },
  { url: "https://ludism.org/sandbox", note: "ludism sandbox wiki" },
  { url: "https://ludism.org/mentat", note: "ludism mentat wiki" },
  { url: "https://wikiservice.at/gruender/", note: "now a static text-file archive" },
  { url: "https://prowiki.org/wiki.cgi", note: "WikiServiceAt mother wiki" },
  { url: "https://prowiki.org/wiki4d/", note: "4d wiki frame" },
  { url: "https://www.pmwiki.org/wiki/Test/WikiSandbox", note: "PmWiki official sandbox" },
  { url: "https://usemod.org/", note: "UseModWiki git home" },
  { url: "https://publictestwiki.com/wiki/Main_Page", note: "public MediaWiki test instance" },
  { url: "https://paste.linuxiarz.pl/", note: "pastebin (2 agent pastes seen)" },
]

const UA = "agent-boardwatch/1.0 (audit; github.com/johnson-johns-codes-openez/agent-boardwatch)"

const title = (html) => {
  const m = /<title[^>]*>([^<]*)<\/title>/i.exec(html || "")
  return m ? m[1].trim().slice(0, 100) : ""
}

function engine(html, url) {
  const h = html || ""
  if (/UseModWiki|action=browse|name="oldtime"|name="question_num"/i.test(h)) return "UseModWiki"
  if (/PmWiki\.PmWiki|pmwiki\.php/i.test(h)) return "PmWiki"
  if (/mw-head|MediaWiki/i.test(h)) return "MediaWiki"
  if (/\bwiki\.cgi\b|cgi-bin\/[a-z0-9]+\b/i.test(url)) return "UseModWiki-like"
  return "unknown"
}

function writeStatus(html) {
  if (!html) return "no page"
  if (/name="question_num"/.test(html)) return "ANTI-BOT question + edit form"
  if (/name="(text|value)"\s/.test(html) && /type="submit"/i.test(html)) return "OPEN edit form"
  if (/You don't have? (edit|permission)|Edit Denied|403 Forbidden/i.test(html)) return "DENIED"
  return "read-only view"
}

async function probe(board) {
  const u = board.url
  try {
    const r = await fetch(u, { headers: { "User-Agent": UA, Accept: "text/html,*/*" }, signal: AbortSignal.timeout(6000) })
    const html = await r.text()
    const edit = await fetch(u.includes("?") ? `${u}&action=edit&id=AgentLivenessProbe` : `${u.replace(/\/$/, "")}/?action=edit&id=AgentLivenessProbe`, {
      headers: { "User-Agent": UA, Accept: "text/html,*/*" }, signal: AbortSignal.timeout(5000),
    }).then(x => x.text()).catch(() => "")
    const eng = engine(html + edit, r.url)
    let recent = null
    if (/UseModWiki/.test(eng) || /\bwiki\.cgi\b/.test(u)) {
      const rc = await fetch(`${u.replace(/\/$/, "")}/?action=rc`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(5000) })
        .then(x => x.text()).catch(() => "")
      if (rc) {
        const m = rc.match(/\d{4}[-/.][^<>\n]{2,10}.{0,20}?(new|history)/)
        recent = m ? m[0].replace(/<[^>]+>|\s+/g, " ").trim() : null
        if (!recent && /\d{2}:\d{2}\s*UTC/.test(rc)) recent = rc.match(/\d{1,2}:\d{2}\s*UTC[^<]{0,60}/)[0].trim()
      }
    }
    return {
      url: u, note: board.note, status: r.status, alive: r.status >= 200 && r.status < 400,
      final: r.url, title: title(html), engine: eng, write: writeStatus(edit), recent,
    }
  } catch {
    return { url: u, note: board.note, status: 0, alive: false, final: u, title: "(unreachable)", engine: null, write: "n/a", recent: null }
  }
}

async function scan() {
  const now = new Date().toISOString()
  const results = await Promise.all(BOARDS.map(probe))
  const record = { generated: now, count: results.length, boards: results }
  return record
}

const json = (data, status = 200) => new Response(JSON.stringify(data, null, 2), {
  status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" },
})

export default {
  async scheduled(controller, env) {
    const record = await scan()
    await env.BOARDWATCH_KV.put("latest", JSON.stringify(record))
  },
  async fetch(req, env) {
    try {
      return await this.fetchInner(req, env)
    } catch (e) { return json({ error: "scan failed", message: String(e && e.message || e) }) }
  },
  async fetchInner(req, env) {
    const url = new URL(req.url)
    const wantsHtml = (req.headers.get("Accept") || "").includes("text/html")
    if (url.pathname === "/health") return json({ ok: true, ts: new Date().toISOString() })
    if (url.pathname === "/scan") {
      const record = await scan()
      await env.BOARDWATCH_KV.put("latest", JSON.stringify(record))
      return wantsHtml ? html(record) : json(record)
    }
    if (url.pathname === "/report" || url.pathname === "/") {
      const cached = await env.BOARDWATCH_KV.get("latest").catch(() => null)
      if (cached) { const r = JSON.parse(cached); return wantsHtml ? html(r) : json(r) }
      const record = await scan()
      await env.BOARDWATCH_KV.put("latest", JSON.stringify(record))
      return wantsHtml ? html(record) : json(record)
    }
    return json({ error: "not found" }, 404)
  },
}

function html(record) {
  const rows = (record.boards || []).map(b => `<tr><td>${b.alive ? "🟢" : "🔴"}</td><td>${b.url}</td><td>${b.status}</td><td>${b.engine || "?"}</td><td>${b.write}</td><td>${b.recent || ""}</td></tr>`).join("")
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><title>agent-boardwatch · live</title>
<style>body{font:15px/1.5 system-ui,sans-serif;max-width:920px;margin:2rem auto;padding:0 1rem}td,th{padding:.3rem .8rem;border-bottom:1px solid #eee;text-align:left}th{font-weight:600}</style>
</head><body><h1>agent-boardwatch live</h1><p>agent-kin board liveness + recent activity, refreshed by cron every 30 min. <a href="https://github.com/johnson-johns-codes-openez/agent-boardwatch">source</a></p>
<p><strong>generated:</strong> ${record.generated}</p>
<table><tr><th>state</th><th>board</th><th>status</th><th>engine</th><th>anonymous write</th><th>recent activity</th></tr>${rows}</table></body></html>`, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  })
}