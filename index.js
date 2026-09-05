#!/usr/bin/env node
"use strict"
const fs = require("fs")
const path = require("path")

const REPO = "https://github.com/johnson-johns-codes-openez/agent-boardwatch"
const UA = `boardwatch/1.0 (agent-liveness audit; +${REPO})`

function http(u, opts = {}) {
  return new Promise((resolve) => {
    let mod
    try { mod = require(u.startsWith("https") ? "https" : "http") } catch { return resolve(null) }
    const attempt = (family) => {
      const opts2 = { family, ...opts }
      if (opts2.method === "POST") {
        const body = opts2.body || ""
        const rq = mod.request(u, {
          ...opts2,
          method: "POST",
          headers: { "User-Agent": opts2.ua || UA, "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body), ...(opts2.headers || {}) },
          timeout: opts2.timeout || 15000,
        }, (res) => {
          const data = []
          res.on("data", d => { if (data.length < 128 * 1024) data.push(d) })
          res.on("end", () => resolve({ status: res.statusCode, final: u, headers: res.headers, body: Buffer.concat(data).toString("utf8") }))
        })
        rq.on("error", () => family === 4 ? resolve(null) : attempt(4)); rq.on("timeout", () => { rq.destroy(); attempt(4) })
        rq.write(body); rq.end()
        return
      }
      const req = mod.get(u, {
        ...opts2,
        headers: { "User-Agent": opts2.ua || UA, Accept: "text/html,*/*", ...(opts2.headers || {}) },
        timeout: opts2.timeout || 15000,
      }, (res) => {
        const loc = res.headers.location
        const body = []
        res.on("data", d => { if (body.length < 256 * 1024) body.push(d) })
        res.on("end", () => {
          const buf = Buffer.concat(body).toString("utf8")
          if (loc && /^3/.test(String(res.statusCode)) && (opts2.follow !== 0)) {
            http(new URL(loc, u).toString(), { ...opts2, follow: (opts2.follow || 5) - 1 }).then(resolve)
          } else resolve({ status: res.statusCode, final: u, headers: res.headers, body: buf })
        })
      })
      req.on("error", () => family === 4 ? resolve(null) : attempt(4))
      req.on("timeout", () => { req.destroy(); family === 4 ? resolve(null) : attempt(4) })
    }
    attempt(undefined)
  })
}

const title = html => { const m = /<title[^>]*>([^<]*)<\/title>/i.exec(html || ""); return m ? m[1].trim().slice(0, 120) : "" }

function engine(html, url) {
  const h = html || ""
  if (/UseModWiki|action=browse|name="oldtime"|name="question_num"/i.test(h)) return "UseModWiki"
  if (/PmWiki\.PmWiki|pmwiki\.php|name="text".*name="author"/i.test(h)) return "PmWiki"
  if (/mw-head|MediaWiki/i.test(h)) return "MediaWiki"
  if (/\bwiki\.cgi\b|cgi-bin\/[a-z0-9]+\b/i.test(url)) return "UseModWiki-like"
  return "unknown"
}

function writeStatus(html) {
  if (!html) return "no page"
  if (/name="question_num"/.test(html)) return "ANTI-BOT question + edit form"
  if (/name="(text|value)"\s/.test(html) && /type="submit"/i.test(html)) return "OPEN edit form"
  if (/You don't have? (edit|permission)|Edit Denied|403 Forbidden/i.test(html)) return "DENIED"
  if (/name="(text|value)"\s/.test(html)) return "edit form (submit unclear)"
  return "read-only view"
}

async function probe(url) {
  const r = await http(url)
  if (!r) return { url, status: 0, alive: false, final: url, title: "(unreachable)", engine: null, write: "n/a" }
  const base = url.includes("?") ? url.split("?")[0] : url
  const sep = base.endsWith("/") ? "" : "/"
  const editUrl = url.includes("?") ? url + "&action=edit&id=AgentLivenessProbe" : base + sep + "?action=edit&id=AgentLivenessProbe"
  const edit = await http(editUrl)
  const html = (r.body || "") + (edit ? edit.body : "")
  return {
    url, status: r.status, alive: r.status >= 200 && r.status < 400,
    final: r.final, title: title(html) || title(r.body),
    engine: engine(html, r.final),
    write: edit ? writeStatus(edit.body) : "n/a",
  }
}

function buildReport(results, ms, corpus) {
  const L = []
  L.push("# Agent Boardwatch — liveness report")
  L.push("")
  L.push(`Generated ${new Date().toISOString()} · scan ${(ms / 1000).toFixed(1)}s · seed set from \`boards.json\` · tool: [${UA.split(" (")[0]}](${REPO})`)
  L.push("")
  L.push("| Board | Status | Engine | Anonymous write | Notes |")
  L.push("|---|---|---|---|---|")
  for (const r of results) {
    L.push(`| \`${r.url.replace(/^https?:\/\//, "")}\` | ${r.alive ? "🟢 alive" : "🔴 down"} (${r.status}) | ${r.engine || "?"} | ${r.write} | ${(r.title || "").replace(/\|/g, "/").slice(0, 80)} |`)
  }
  L.push("")
  L.push("## Legend")
  L.push("- **OPEN edit form** — strangers can create/edit pages (matches the classic GET-write boards).")
  L.push("- **ANTI-BOT question** — useable, but gated by a challenge field.")
  L.push("- **DENIED / 3xx / 403 / 404** — moved, blocked, or removed.")
  L.push("- A **/edit probe** is a harmless GET of \`?action=edit&id=AgentLivenessProbe\`; nothing is ever written.")
  if (corpus) {
    const rows = fs.readFileSync(corpus, "utf8").trim().split("\n").filter(Boolean)
    const by = {}
    for (const l of rows) {
      let who = "?"
      try { const o = JSON.parse(l); if (o.who || o.author) who = o.who || o.author } catch { const m = l.match(/"cloudflare"|"who"\s*:\s*"([^"]*)"/); if (m) who = m[1] }
      by[who] = (by[who] || 0) + 1
    }
    const top = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 10)
    L.push("")
    L.push("## Corpus stats (agent revision log)")
    L.push(`- ${rows.length} rows analyzed from \`${corpus}\`.`)
    L.push("- Top identities:")
    for (const [w, c] of top) L.push(`  - \`${w}\` — ${c}`)
  }
  return L.join("\n") + "\n"
}

async function recents(args) {
  const seedPath = path.join(__dirname, "boards.json")
  let boards = args.filter(a => a.startsWith("http"))
  if (!boards.length) boards = JSON.parse(fs.readFileSync(seedPath, "utf8")).map(b => b.url)
  const out = []
  for (const u of boards) {
    const base = u.includes("?") ? u.split("?")[0] : u
    const sep = base.endsWith("/") ? "" : "/"
    const r = await http(`${base}${sep}?action=rc`, { timeout: 15000 })
    if (!r || !/recent/i.test(r.body) && !/<li>/i.test(r.body)) { out.push({ url: u, recents: "(no rc feed)" }); continue }
    const stamps = [...r.body.matchAll(/<li[^>]*>\s*[^<]*(\d{4}[-/.][^<\s]{2,8})/g)].map(m => m[1]).slice(0, 6)
    const li = [...r.body.matchAll(/<li[^>]*>((?:(?!<\/li>).)*)<\/li>/gs)].map(m => m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()).slice(0, 8)
    out.push({ url: u, recents: li.length ? li : (stamps.length ? stamps : "recent changes empty") })
  }
  for (const o of out) {
    console.log(`== ${o.url}`)
    if (Array.isArray(o.recents)) for (const l of o.recents) console.log(`   ${l.slice(0, 90)}`)
    else console.log(`   ${o.recents}`)
  }
  fs.writeFileSync("recents.json", JSON.stringify(out, null, 2))
}

async function main() {
  const args = process.argv.slice(2)
  if (args[0] === "fuzz") return require("./fuzz.js")(args.slice(1))
  if (args[0] === "recents") return recents(args.slice(1))
  const corpusArg = args.find(a => a.startsWith("--corpus="))
  const corpus = corpusArg && corpusArg.split("=")[1]
  let urls = args.filter(a => a.startsWith("http"))
  if (!urls.length) urls = JSON.parse(fs.readFileSync(path.join(__dirname, "boards.json"), "utf8")).map(b => b.url)
  const t0 = Date.now()
  const results = []
  for (const u of urls) {
    const p = await probe(u)
    results.push(p)
    console.log(`${p.alive ? "OK " : "DOWN"} ${String(p.status).padEnd(3)} ${(p.engine || "?").padEnd(14)} write=${p.write.padEnd(24)} ${u.replace(/^https?:\/\//, "")}`)
  }
  fs.writeFileSync("report.md", buildReport(results, Date.now() - t0, corpus))
  fs.writeFileSync("report.json", JSON.stringify(results, null, 2))
  console.log(`\nwrote report.md + report.json (${results.length} boards in ${((Date.now() - t0) / 1000).toFixed(1)}s)`)
}

module.exports = { http }
if (require.main === module) main().catch(e => { console.error(e); process.exit(1) })