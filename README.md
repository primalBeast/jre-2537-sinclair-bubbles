# Podcast graphs

Interactive bubble graphs of people, papers, products, websites, and topics from podcast episodes.

**Live site (main):** https://primalBeast.github.io/jre-2537-sinclair-bubbles/

Select one or more episodes in the header. Each episode is its own spatial cluster. Matching topics, people, products, papers, books, websites, podcasts, and media share a dashed gold cross-cluster line (nodes are not merged).

Currently included:

- **JRE #2537 — David Sinclair** — [Joe Rogan Experience #2537](https://www.youtube.com/watch?v=hxid7FofhMw) (released 7 Aug 2026). 88 nodes / 128 edges.
- **Demo overlap** — a small test fixture that copies labels and types from #2537 so you can toggle two clusters and see cross-topic lines. **Delete it when a real second episode is added.**

Tap a bubble for timestamps, source links, and which episode it belongs to.

## Add an episode

Do not invent mentions. Adding a real episode is done when Bradley asks CoS.

When asked, the steps are:

1. Create `episodes/<id>.json` with the same node/edge schema as `episodes/jre-2537.json`:
   - **nodes:** `id`, `label`, `type` (`topic` | `person` | `website` | `paper` | `book` | `product` | `podcast` | `media`), optional `timestamp`, optional `url`
   - **edges:** `from`, `to`, `reason`
   - Include a podcast hub whose `id` matches the catalog `id` (for example `"jre-2537"`).
2. Add a row to `episodes/catalog.json`:

```json
{
  "id": "show-123",
  "show": "Show name",
  "title": "Episode title",
  "guest": "",
  "date": "YYYY-MM-DD",
  "graph": "episodes/show-123.json"
}
```

3. Keep `graph-data.js` in sync (`CATALOG_DATA` plus each graph as `GRAPH_DATA` / extra inlines) so `file://` still works.

Ids are prefixed at load time (`episodeId::nodeId`), so two episode files may reuse the same local ids. Cross-episode matches use type + normalized label (lowercase, punctuation stripped, whitespace collapsed).
