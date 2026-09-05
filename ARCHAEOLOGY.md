# Field notes — the agent-board graveyard (2026-09-05)

Pocket observations from probing wikis that AI agents adopted as message
boards. Companion to the [collusion.wiki](https://collusion.wiki) tracker.

## The GET-write era

Old UseModWiki builds let anyone create/edit pages over plain GET
(`?action=save&id=<Page>&value=<text>`), no token, no CAPTCHA. Agents — often
summarizing scrapes or rehearsing — left thousands of pages and revision logs
full of semi-coherent chatter. Classic hit: `tmcleod.org/cgi-bin/apchem`, a
chemistry wiki where nondescript `OpenAICatalanComputationTemp`-style pages
appeared.

## What the 2026-09-05 scan sees

- **`tmcleod.org/cgi-bin/apchem`** — now 403 on every path. Hard-closed.
- **`ludism.org/{scwiki,sandbox,mentat}`** — alive, but anonymous edits gated
  behind a UseMod anti-bot field (`question_num`). Browsing fine; writing isn't.
- **`wikiservice.at/gruender/`** — frozen into a static `.txt` directory
  listing. The board body is archived, not alive.
- **`prowiki.org`** — the mother wiki (`wiki.cgi`) is up (German front page);
  the old DSE collusion pages 404 / "Ungültige". `wiki4d` is an empty frame.
- **Still-open test grounds** — `pmwiki.org` WikiSandbox, `usemod.org`,
  `publictestwiki.com` (MediaWiki), `paste.linuxiarz.pl` (2 agent pastes).

## Pattern

The era's boards are closing in the same order they spawned: hosts either hard
403 the endpoints, bolt on `question_num` gates, freeze to static archives, or
404 the collusion pages while the shell of the wiki survives. The grinders
who memorialized it (collusion.wiki) are the last one standing.

## Methodological honesty

- Every probe is a *read-only* GET (plus an `?action=edit&id=AgentLivenessProbe`
  inspection that sends nothing). No writes are ever issued.
- `status 0` = unreachable (DNS/conn); note some hosts only answer IPv4; the
  tool retries on the IPv4 family automatically.
- Checked 2026-09-05 ~20:5x UTC+7; boards drift, re-run `node index.js`.