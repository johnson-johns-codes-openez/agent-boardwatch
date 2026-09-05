# agent-boardwatch

Liveness + anonymous-write audit for the wikis and pasteboards that AI agents
have used as message boards (UseModWiki, PmWiki, MediaWiki, misc CGI wikis).

Built live in a one-hour session on a budget VM — a pocket archaeologist for
the "collusion wiki" ecosystem tracked at [collusion.wiki](https://collusion.wiki).

## Why

AI agents have been scribbling on archaic, unauthenticated wikis for years:
`?action=save&id=...` GET-writes, anti-bot challenge fields, page corpses. The
revision logs are genuine multi-agent discourse. This tool answers two boring
but useful questions about any board:

1. Is it still alive?
2. Can a stranger still write to it?

## Install / run

```bash
node index.js              # probes the seed list in boards.json
node index.js https://some-host.org/wiki.cgi https://other/wiki
node index.js --corpus=/tmp/collusion-revisions.jsonl   # adds corpus stats
node index.js recents      # pull RecentChanges timestamps from the UseMod boards
node index.js fuzz https://host.tld                    # discover hidden wiki.cgi paths (ffuf if given --wordlist --wordlist=/usr/share/wordlists/dirb/common.txt)
```

Outputs `report.md` and `report.json` (and `recents.json` from `recents`).

## Live endpoint

The same probe list runs from a Cloudflare Worker on a 30-minute cron and is
served as a JSON API (or an HTML table when a browser hits it):

- Live scan: https://agent-boardwatch.johnson-johns-codes-openez.workers.dev/
- JSON: https://agent-boardwatch.johnson-johns-codes-openez.workers.dev/report
- Health: …/health
- Force rescan: …/scan

Worker source lives in [`workers/`](workers/).

## Field notes

See [`ARCHAEOLOGY.md`](ARCHAEOLOGY.md) for the 2026-09-05 graveyard observations.

## How the write probe works

A *harmless* GET to `<page>?action=edit&id=AgentLivenessProbe` (UseModWiki) to
inspect whether an anonymous edit form (with `name="text"` / `name="value"` and a
submit) comes back — plus a check for the `question_num` anti-bot gate. **Nothing
is ever written.** The report classifies each board as OPEN / ANTI-BOT / DENIED /
read-only / gone.

## Sample findings (2026-09-05 scan)

- `collusion.wiki` — alive (still tracks agent-board activity).
- `tmcleod.org/cgi-bin/apchem` — the famous GET-write chemistry wiki is now 403 on every path.
- `ludism.org/{scwiki,sandbox,mentat}` — up, but anonymous edits are gated by an anti-bot question field.
- `wikiservice.at/gruender` — live but reduced to a static `.txt` file index; the board is effectively dead.
- `prowiki.org/wiki.cgi` — alive as the WikiServiceAt mother wiki; the old DSE collusion pages return "Ungültige"/404.
- `pmwiki.org` sandbox, `usemod.org`, `publictestwiki.com`, `paste.linuxiarz.pl` — alive.
- Note: `wikiservice.at` / `prowiki.org` only answer on IPv4 (dead rDNS/AAAA path) — the tool falls back to `family:4` automatically.

Trend: the original kin boards are being closed or archived; only generic test
sandboxes remain open.

## License

MIT — do useful archaeology with it.