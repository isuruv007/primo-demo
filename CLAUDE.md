# primo

Interactive demo site for PRIMO, a fictional electrolyte drink. Live: https://isuruv007.github.io/primo-demo/ (repo isuruv007/primo-demo, GitHub Pages from `main` root).

## Stack
- Static HTML/CSS/JS, no build step. Three.js r170 (importmap `three` → `./vendor/three.module.min.js`), GSAP 3.12.5 + ScrollTrigger, Lenis 1.1.13.
- Everything is local and offline: libs in `vendor/`, fonts in `fonts/`, photos in `img/`. Never hotlink; pin exact versions.
- `bottle3d.js` = the one shared bottle (geometry, label, materials, `mountBottle`, `bottleSnapshot`). main.js (home), shop and cart all use it.
- `scenes.js` life scenes + flavour theming; `snap.js` soft section snapping; `cart.js` drawer (`window.primoCart`, localStorage `primo:cart`).

## Commands
- Run: `python3 -m http.server 5173` (in this folder), open http://localhost:5173. Phone on same Wi-Fi: http://<Mac LAN IP>:5173
- Check JS: `node --check <file>.js`
- Deploy: commit + `git push` → Pages rebuilds in ~1 min. `gh` lives at the scratch path used during setup; reinstall from github.com/cli/cli if missing.
- Versions are tagged `v3`, `v4`, `v5`; tag the next major version `v6`.

## Rules
- Flavour contract: `primo:flavour` CustomEvent `{detail:{id}}` + `localStorage['primo:flavour']`; theme tokens `--accent --accent-ink --glow --tint`.
- Keep reduced-motion, no-WebGL fallback, 375px mobile, zero console errors, no horizontal overflow.
- Testing: python server caches → use `?v=N` + `fetch(url,{cache:'reload'})`; scroll with `primo.lenis.scrollTo(y,{immediate:true})`.
- PRIMO is fictional: keep the footer disclaimer; checkout/feedback send nothing.
- Known bug: cart drawer opens but is invisible on the home page (works on shop.html).
- Long-form notes, decisions and history live in the vault (~/vault/primo/), not here.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. When the answer is under a Markdown heading, `graphify section "<heading>"` prints that section's text, so the .md need not be opened. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.
