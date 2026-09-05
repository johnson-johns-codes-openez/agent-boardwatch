"use strict"
const { execFile } = require("child_process")
const fs = require("fs")
const http = require("./index.js").http

// Discovery: fuzz for UseModWiki-style endpoints (wiki.cgi, cgi-bin/<name>, ?action=)
// Uses installed ffuf if available; falls back to a tiny builtin wordlist over curl-free http().

const BUILTIN = ["wiki.cgi", "cgi-bin/wiki", "cgi-bin/usemod", "cgi-bin/apchem", "cgi-bin/biki",
  "cgi-bin/omniki", "cgi-bin/aks", "cgi-bin/mywiki", "cgi-bin/scratch", "biki.cgi", "pwiki.cgi",
  "cgi-bin/test", "cgi-bin/Test", "cgi-bin/sandbox", "wiki4d", "open", "wikisig"]

async function hasFfuf() {
  return new Promise(res => {
    execFile("/home/john/bin/ffuf", ["-V"], { timeout: 10000 }, (e, o) => res(!e && /ffuf version/.test(o || "")))
  })
}

function builtinFuzz(base) {
  return Promise.all(BUILTIN.map(async w => {
    const u = `${base.replace(/\/+$/, "")}/${w}`
    const r = await http(u, { timeout: 8000 })
    return r && r.status < 400 ? { url: u, status: r.status, size: Buffer.byteLength(r.body) } : null
  })).then(v => v.filter(Boolean))
}

async function ffufFuzz(base, wordlist) {
  const words = wordlist || "/usr/share/wordlists/dirb/common.txt"
  if (!fs.existsSync(words)) return null
  return new Promise((resolve) => {
    execFile("/home/john/bin/ffuf", [
      "-u", base.replace(/\/+$/, "") + "/FUZZ", "-w", words,
      "-mc", "200-302", "-t", "8", "-timeout", "5", "-s", "-m", "all",
    ], { timeout: 60000 }, (e, o) => {
      if (e) return resolve(null)
      resolve(o.trim().split("\n").filter(Boolean).map(f => ({ url: base + "/" + f, fuzz: f })))
    })
  })
}

module.exports = async function fuzz(args) {
  const base = args.find(a => a.startsWith("http"))
  const wordlist = args.find(a => a.startsWith("--wordlist="))?.split("=")[1]
  if (!base) { console.error("usage: boardwatch fuzz <https://host.tld> [--wordlist=/path]"); process.exit(1) }
  const ff = await hasFfuf()
  let found
  if (ff && wordlist) found = await ffufFuzz(base, wordlist)
  found = found || await builtinFuzz(base)
  console.log(`found ${found.length} candidate endpoints on ${base}`)
  for (const f of found) console.log(`  ${f.status}  ${f.url}`)
  const html = []
  for (const f of found.slice(0, 25)) {
    const r = await http(f.url, { timeout: 10000 })
    if (r) html.push(r.body)
  }
  console.log(`\nwrite-capable among candidates (probes run without writing):`)
  for (const f of found.slice(0, 25)) {
    const r = await http(f.url.replace(/\/+$/, "") + "/?action=edit&id=AgentLivenessProbe", { timeout: 10000 })
    const open = r && /name="(text|value)"\s/.test(r.body) && /type="submit"/i.test(r.body)
    if (open) console.log(`  OPEN  ${f.url}`)
  }
  return
}
if (require.main === module) {
  module.exports(process.argv.slice(2)).then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
}
