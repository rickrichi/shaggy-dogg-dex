// Generate the public document from its editable source. No runtime JavaScript is needed.
// Run: node scripts/build-whitepaper.mjs
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { marked } from "marked";

const root = new URL("../", import.meta.url);
const markdown = await readFile(new URL("docs/WHITEPAPER.md", root), "utf8");
// The edition line, e.g. "Version 1.3 · 21 October 2026", read from the source so it cannot go stale.
const edition = markdown.match(/\*\*(Version [^*]+?)\*\*/)?.[1] ?? "Technical whitepaper";
const escapeHtml = (value) => value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const contents = [];
const renderer = new marked.Renderer();
renderer.heading = (text, level, raw) => {
  const id = raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (level === 2 && /^\d+\./.test(raw)) contents.push({ id, title: raw });
  return `<h${level} id="${id}">${text}</h${level}>\n`;
};
const article = marked.parse(markdown, { renderer, gfm: true });
const toc = contents.map(({ id, title }) => `<li><a href="#${id}">${escapeHtml(title)}</a></li>`).join("\n");
const html = `<!DOCTYPE html>
<!-- Generated from docs/WHITEPAPER.md by scripts/build-whitepaper.mjs. -->
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Shaggy Dogg DEX — Technical Whitepaper</title>
  <meta name="description" content="Shaggy Dogg DEX technical whitepaper: multi-chain routing, liquidity, vaults, position locks, administrative authority, and contract references." />
  <link rel="canonical" href="https://dex.lumsian.com/whitepaper" />
  <link rel="icon" type="image/png" href="/favicon-32x32.png" />
  <meta property="og:title" content="Shaggy Dogg DEX — Technical Whitepaper" />
  <meta property="og:description" content="${escapeHtml(edition)}. Architecture, implementation status, and deployment evidence." />
  <meta property="og:type" content="article" />
  <meta property="og:url" content="https://dex.lumsian.com/whitepaper" />
  <style>
    :root { color-scheme: light; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #202b38; background: #f5f4ef; line-height: 1.75; }
    * { box-sizing: border-box; }
    body { margin: 0; }
    a { color: #065d73; text-underline-offset: .2em; overflow-wrap: anywhere; }
    a:hover { color: #073d4a; }
    a:focus-visible { outline: 3px solid #0a6d85; outline-offset: 4px; }
    .skip { position: absolute; top: -5rem; left: 1rem; padding: .6rem; background: white; }
    .skip:focus { top: 1rem; }
    .masthead { padding: 1rem max(1.25rem, calc((100vw - 1280px) / 2)); background: #112d36; color: white; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .8rem; }
    .masthead a { color: #e5f4f4; }
    .brand { font-weight: 700; text-decoration: none; letter-spacing: .02em; }
    .links { display: flex; gap: 1.2rem; flex-wrap: wrap; font-size: .9rem; }
    .layout { max-width: 1280px; margin: auto; padding: 2.5rem 1.25rem 5rem; display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 3rem; }
    .contents { align-self: start; position: sticky; top: 1.5rem; font-size: .85rem; }
    .contents p { font-size: .75rem; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: #526573; }
    .contents ol { list-style: none; padding: 0; }
    .contents li { margin: .7rem 0; line-height: 1.5; }
    .contents a { text-decoration: none; }
    main { min-width: 0; background: white; border: 1px solid #dedfd8; padding: clamp(1.25rem, 4vw, 3.5rem); }
    h1, h2, h3 { color: #112d36; line-height: 1.2; scroll-margin-top: 1.5rem; }
    h1 { font-size: clamp(2.1rem, 5vw, 3.8rem); letter-spacing: -.045em; margin: .25rem 0 .6rem; }
    h2 { margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid #dedfd8; font-size: 1.55rem; }
    h2:first-of-type { border: 0; margin: 0 0 2rem; padding: 0; font-size: 1.3rem; font-weight: 400; color: #526573; }
    h3 { margin-top: 2rem; font-size: 1.1rem; }
    p { margin: 1rem 0; }
    li { margin: .5rem 0; }
    table { width: 100%; border-collapse: collapse; font-size: .88rem; margin: 1.5rem 0; table-layout: fixed; }
    th, td { text-align: left; vertical-align: top; padding: .75rem .65rem; border-bottom: 1px solid #dedfd8; overflow-wrap: anywhere; }
    th { background: #eef3f2; color: #112d36; }
    code { font-family: ui-monospace, Consolas, monospace; font-size: .85em; overflow-wrap: anywhere; }
    pre { padding: 1rem; background: #eef3f2; border-left: 3px solid #367b83; overflow-x: auto; line-height: 1.6; }
    pre code { overflow-wrap: normal; }
    footer { max-width: 1280px; margin: auto; padding: 0 1.25rem 2rem; color: #526573; font-size: .85rem; }
    @media (max-width: 960px) { .layout { grid-template-columns: minmax(0, 1fr); gap: 1.5rem; padding-top: 1rem; } .contents { position: static; } .contents ol { columns: 2; column-gap: 2rem; } .contents li { break-inside: avoid; } }
    @media (max-width: 520px) { .contents ol { columns: 1; } table { font-size: .78rem; } th, td { padding: .5rem .3rem; } }
    @media print { @page { margin: 18mm; } :root { background: white; color: black; font-size: 10pt; } .masthead, .contents, .skip, footer { display: none; } .layout { display: block; padding: 0; } main { border: 0; padding: 0; } h1 { font-size: 30pt; } h2 { font-size: 16pt; } h2, h3 { break-after: avoid; } tr, pre { break-inside: avoid; } pre { white-space: pre-wrap; } a { color: inherit; } }
  </style>
</head>
<body>
  <a class="skip" href="#document">Skip to whitepaper</a>
  <header class="masthead">
    <a class="brand" href="/">SHAGGY DOGG DEX</a>
    <nav class="links" aria-label="Project links"><a href="/whitepaper.md" download="Shaggy-Dogg-DEX-Whitepaper.md">Download Markdown</a><a href="https://github.com/rickrichi/shaggy-dogg-dex">Source code</a></nav>
  </header>
  <div class="layout">
    <nav class="contents" aria-label="Whitepaper contents"><p>In this paper</p><ol>${toc}</ol></nav>
    <main id="document">${article}</main>
  </div>
  <footer>${escapeHtml(edition)} · Use your browser's Print command for a print-formatted copy.</footer>
</body>
</html>
`;
await writeFile(new URL("public/whitepaper.html", root), html);
await writeFile(new URL("public/whitepaper.md", root), markdown);
console.log(`Generated ${fileURLToPath(new URL("public/whitepaper.html", root))} (${contents.length} sections).`);
