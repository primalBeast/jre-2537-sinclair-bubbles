/* Podcast topic-bubble graphs */
(function () {
  "use strict";
  const TYPE_ORDER = ["topic","person","website","paper","book","product","podcast","media"];
  const TYPE_META = {
    topic:   { color: "#5aa7e6", label: "Topic" },
    person:  { color: "#e8b84a", label: "Person" },
    website: { color: "#3ecfbe", label: "Website" },
    paper:   { color: "#b794f6", label: "Paper" },
    book:    { color: "#f09090", label: "Book" },
    product: { color: "#6dd392", label: "Product" },
    podcast: { color: "#f0a05a", label: "Podcast" },
    media:   { color: "#e879c0", label: "Media" }
  };
  const CLUSTER_GAP = 1200;
  const FONT = "IBM Plex Sans, Segoe UI, system-ui, sans-serif";
  const DISPLAY = "Syne, IBM Plex Sans, sans-serif";
  const appRoot = document.getElementById("app");
  const byId = (id) => document.getElementById(id);
  const el = {
    graph: byId("graph"),
    legend: byId("legend"),
    search: byId("search"),
    loading: byId("loading"),
    tooltip: byId("tooltip"),
    wrap: byId("graph-wrap"),
    empty: byId("empty-state"),
    detail: byId("detail"),
    nodeCount: byId("node-count"),
    edgeCount: byId("edge-count"),
    matchCount: byId("match-count"),
    fit: byId("btn-fit"),
    reset: byId("btn-reset"),
    close: byId("btn-close"),
    picker: byId("episode-picker"),
    eyebrow: document.querySelector(".eyebrow"),
    title: document.querySelector("h1"),
    subtitle: document.querySelector(".subtitle")
  };
  let catalog = null;
  let selectedIds = [];
  let raw = null, nodesDS = null, edgesDS = null, network = null, selectedId = null, query = "";
  let rebuildSeq = 0;
  let uiBound = false;
  const typeOn = {};
  TYPE_ORDER.forEach((t) => { typeOn[t] = true; });

  function hexToRgba(hex, a) {
    const n = hex.replace("#", "");
    const r = parseInt(n.slice(0, 2), 16);
    const g = parseInt(n.slice(2, 4), 16);
    const b = parseInt(n.slice(4, 6), 16);
    return "rgba(" + r + "," + g + "," + b + "," + a + ")";
  }
  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function prefixId(episodeId, id) {
    return episodeId + "::" + id;
  }
  function localIdOf(id) {
    const s = String(id || "");
    const i = s.indexOf("::");
    return i === -1 ? s : s.slice(i + 2);
  }
  function isHubNode(n) {
    if (!n) return false;
    if (n.hub === true) return true;
    const ep = n.episodeId || "";
    const id = String(n.id || "");
    if (ep && (id === ep || id.slice(-ep.length - 2) === "::" + ep)) return true;
    return false;
  }
  function normalizeLabel(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  async function fetchJson(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }
  function fallbackCatalog() {
    return {
      episodes: [{
        id: "jre-2537",
        show: "Joe Rogan Experience",
        title: "JRE #2537 — David Sinclair",
        guest: "David Sinclair",
        date: "2026-08-07",
        graph: "graph.json"
      }]
    };
  }
  async function loadCatalog() {
    try {
      const data = await fetchJson("./episodes/catalog.json");
      if (data && Array.isArray(data.episodes) && data.episodes.length) return data;
    } catch (err) { /* file:// or missing catalog */ }
    if (window.CATALOG_DATA && Array.isArray(window.CATALOG_DATA.episodes) && window.CATALOG_DATA.episodes.length) {
      return window.CATALOG_DATA;
    }
    return fallbackCatalog();
  }
  function inlineGraphFor(ep) {
    if (!ep) return null;
    if (ep.id === "demo-overlap" && window.DEMO_DATA && window.DEMO_DATA.nodes) return window.DEMO_DATA;
    if (window.GRAPH_DATA && window.GRAPH_DATA.nodes) {
      if (ep.id === "jre-2537" || !ep.graph || ep.graph === "graph.json" || String(ep.graph).indexOf("jre-2537") !== -1) {
        return window.GRAPH_DATA;
      }
    }
    return null;
  }
  async function loadEpisodeGraph(ep) {
    if (ep && ep.graph) {
      try {
        const data = await fetchJson("./" + ep.graph);
        if (data && Array.isArray(data.nodes) && Array.isArray(data.edges)) return data;
      } catch (err) { /* fall through */ }
    }
    const inline = inlineGraphFor(ep);
    if (inline) return inline;
    try {
      const data = await fetchJson("./graph.json");
      if (data && data.nodes) return data;
    } catch (err2) { /* fall through */ }
    if (window.GRAPH_DATA && window.GRAPH_DATA.nodes) return window.GRAPH_DATA;
    throw new Error("Could not load graph for " + (ep && ep.id ? ep.id : "episode"));
  }
  function tagHub(n, ep) {
    const localId = localIdOf(n.id);
    if (localId === ep.id) return true;
    return false;
  }
  function prefixGraph(ep, graph) {
    const nodes = (graph.nodes || []).map((n) => {
      const localId = n.id;
      const hub = tagHub({ id: localId, type: n.type }, ep) || (n.type === "podcast" && localId === ep.id);
      return {
        id: prefixId(ep.id, localId),
        localId: localId,
        label: n.label,
        type: n.type,
        timestamp: n.timestamp || "",
        url: n.url || "",
        episodeId: ep.id,
        episodeTitle: ep.title || ep.id,
        episodeShow: ep.show || "",
        hub: hub,
        demo: !!ep.demo
      };
    });
    if (!nodes.some((n) => n.hub)) {
      const root = nodes.find((n) => n.type === "podcast") || nodes[0];
      if (root) root.hub = true;
    }
    const edges = (graph.edges || []).map((e) => ({
      from: prefixId(ep.id, e.from),
      to: prefixId(ep.id, e.to),
      reason: e.reason || ""
    }));
    return { nodes: nodes, edges: edges };
  }
  function sameKindReason(type) {
    const meta = TYPE_META[type];
    const noun = meta ? meta.label.toLowerCase() : String(type || "topic");
    return "same " + noun;
  }
  function addCrossEdges(nodes) {
    const buckets = Object.create(null);
    nodes.forEach((n) => {
      if (!n || !n.type || !n.label) return;
      const norm = normalizeLabel(n.label);
      if (!norm) return;
      const key = n.type + "\0" + norm;
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push(n);
    });
    const out = [];
    Object.keys(buckets).forEach((key) => {
      const group = buckets[key];
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          if (group[i].episodeId === group[j].episodeId) continue;
          out.push({
            from: group[i].id,
            to: group[j].id,
            reason: sameKindReason(group[i].type),
            kind: "cross"
          });
        }
      }
    });
    return out;
  }
  function seedClusters(nodes, episodes) {
    const n = episodes.length || 1;
    const pos = Object.create(null);
    episodes.forEach((ep, i) => {
      pos[ep.id] = {
        x: (i - (n - 1) / 2) * CLUSTER_GAP,
        y: 0
      };
    });
    nodes.forEach((node, idx) => {
      const hubPos = pos[node.episodeId] || { x: 0, y: 0 };
      if (node.hub) {
        node.x = hubPos.x;
        node.y = hubPos.y;
        node.fixed = { x: true, y: true };
        node.mass = 12;
      } else {
        const seed = ((idx + 1) * 9301 + 49297) % 1000;
        const ang = (seed / 1000) * Math.PI * 2;
        const rad = 40 + (seed % 70);
        node.x = hubPos.x + Math.cos(ang) * rad;
        node.y = hubPos.y + Math.sin(ang) * rad;
        node.mass = 1;
      }
    });
  }
  function defaultSelectedIds() {
    const eps = (catalog && catalog.episodes) || [];
    const marked = eps.filter((ep) => ep.defaultOn).map((ep) => ep.id);
    if (marked.length) return marked;
    const first = eps.find((ep) => !ep.demo) || eps[0];
    return first ? [first.id] : [];
  }
  function selectedEpisodes() {
    const map = Object.create(null);
    (catalog.episodes || []).forEach((ep) => { map[ep.id] = ep; });
    return selectedIds.map((id) => map[id]).filter(Boolean);
  }
  function updateHeader(eps) {
    const sub = el.subtitle;
    if (!eps.length) return;
    if (eps.length === 1) {
      const ep = eps[0];
      if (el.eyebrow) el.eyebrow.textContent = ep.show || "Podcast graphs";
      if (el.title) el.title.textContent = ep.title || ep.id;
      document.title = ep.title || "Podcast graphs";
      if (sub) {
        sub.textContent = "topics, websites, and podcasts from the episode.";
        sub.classList.remove("is-multi");
      }
    } else {
      if (el.eyebrow) el.eyebrow.textContent = "Podcast graphs";
      if (el.title) el.title.textContent = eps.length + " episodes";
      document.title = eps.length + " episodes";
      if (sub) {
        sub.textContent = eps.map((e) => e.title || e.id).join(" · ");
        sub.classList.add("is-multi");
      }
    }
  }
  function renderPicker() {
    if (!el.picker || !catalog) return;
    el.picker.textContent = "";
    (catalog.episodes || []).forEach((ep) => {
      const on = selectedIds.indexOf(ep.id) !== -1;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "ep-chip" + (on ? " on" : " off");
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.dataset.id = ep.id;
      btn.setAttribute("aria-label", ep.title || ep.id);
      const num = document.createElement("span");
      num.className = "ep-num";
      const m = (ep.title || "").match(/#\d+/);
      num.textContent = ep.demo ? "Demo" : (m ? m[0] : ep.id);
      btn.appendChild(num);
      const name = document.createElement("span");
      name.className = "ep-name";
      name.textContent = ep.demo ? "overlap" : (ep.guest || ep.show || ep.title || ep.id);
      btn.appendChild(name);
      btn.title = ep.title || ep.id;
      if (ep.demo) {
        const tag = document.createElement("span");
        tag.className = "demo-tag";
        tag.textContent = "demo";
        btn.appendChild(tag);
      }
      btn.addEventListener("click", () => toggleEpisode(ep.id));
      el.picker.appendChild(btn);
    });
  }
  function toggleEpisode(id) {
    const i = selectedIds.indexOf(id);
    if (i !== -1) {
      if (selectedIds.length === 1) return;
      selectedIds.splice(i, 1);
    } else {
      selectedIds.push(id);
    }
    renderPicker();
    rebuildGraph();
  }
  function degreeMap(edges) {
    const d = Object.create(null);
    edges.forEach((e) => {
      d[e.from] = (d[e.from] || 0) + 1;
      d[e.to] = (d[e.to] || 0) + 1;
    });
    return d;
  }
  function visNode(n, deg) {
    const meta = TYPE_META[n.type] || { color: "#8b93a4", label: n.type };
    const color = meta.color;
    const isHub = isHubNode(n);
    const fontSize = isHub ? 16 : 12 + Math.min(4, (deg || 0) / 4);
    const node = {
      id: n.id,
      label: n.label,
      type: n.type,
      timestamp: n.timestamp || "",
      url: n.url || "",
      episodeId: n.episodeId || "",
      episodeTitle: n.episodeTitle || "",
      hub: isHub,
      group: n.type,
      shape: "box",
      shapeProperties: { borderRadius: 16 },
      margin: isHub ? 14 : 10,
      widthConstraint: { maximum: isHub ? 188 : 148 },
      borderWidth: isHub ? 2 : 1.25,
      borderWidthSelected: 2.4,
      color: {
        background: hexToRgba(color, isHub ? 0.42 : 0.16),
        border: color,
        highlight: { background: hexToRgba(color, 0.5), border: "#f3eee4" },
        hover: { background: hexToRgba(color, 0.32), border: "#f3eee4" }
      },
      font: {
        face: isHub ? DISPLAY : FONT,
        size: fontSize,
        color: "#f3eee4",
        strokeWidth: 0,
        multi: false
      },
      shadow: { enabled: true, color: hexToRgba(color, isHub ? 0.55 : 0.32), size: isHub ? 22 : 12, x: 0, y: 0 },
      chosen: true
    };
    if (typeof n.x === "number") node.x = n.x;
    if (typeof n.y === "number") node.y = n.y;
    if (n.fixed) node.fixed = n.fixed;
    if (n.mass) node.mass = n.mass;
    return node;
  }
  function isHitEdge(e) {
    return !!(e && typeof e.id === "string" && e.id.slice(-4) === "-hit");
  }
  function isCrossEdge(e) {
    return !!(e && (e.kind === "cross" || (typeof e.id === "string" && e.id.indexOf("cross-") === 0)));
  }
  function realEdgeFrom(idOrEdge) {
    const e = typeof idOrEdge === "string" ? edgesDS.get(idOrEdge) : idOrEdge;
    if (!e) return null;
    if (isHitEdge(e) && e.realId) return edgesDS.get(e.realId) || e;
    return e;
  }
  function visEdges(e, i) {
    const isCross = e.kind === "cross";
    const id = isCross ? "cross-" + i : "e-" + i;
    const visual = {
      id: id,
      from: e.from,
      to: e.to,
      reason: e.reason,
      kind: isCross ? "cross" : "",
      title: e.reason,
      label: "",
      dashes: isCross,
      arrows: { to: { enabled: !isCross, scaleFactor: 0.55 } },
      color: {
        color: isCross ? "rgba(232,184,74,0.45)" : "rgba(232,184,74,0.16)",
        highlight: "rgba(232,184,74,0.9)",
        hover: "rgba(243,238,228,0.55)"
      },
      width: 2,
      hoverWidth: isCross ? 6 : 8,
      selectionWidth: isCross ? 6 : 8,
      physics: isCross ? false : true,
      smooth: { type: "continuous", roundness: isCross ? 0.18 : 0.35 },
      font: { face: FONT, size: 0, color: "transparent", strokeWidth: 0, background: "transparent" }
    };
    const hit = {
      id: id + "-hit",
      from: e.from,
      to: e.to,
      reason: e.reason,
      kind: isCross ? "cross" : "",
      realId: id,
      label: "",
      arrows: { to: { enabled: false } },
      color: {
        color: "rgba(0,0,0,0)",
        highlight: "rgba(0,0,0,0)",
        hover: "rgba(0,0,0,0)"
      },
      width: 24,
      hoverWidth: 0,
      selectionWidth: 0,
      physics: false,
      chosen: false,
      smooth: { type: "continuous", roundness: isCross ? 0.18 : 0.35 },
      font: { face: FONT, size: 0, color: "transparent", strokeWidth: 0, background: "transparent" }
    };
    return [visual, hit];
  }
  function labelFont(on) {
    return on
      ? { face: FONT, size: 11, color: "#f3eee4", strokeWidth: 4, strokeColor: "#09080c", background: "rgba(10,9,12,0.88)", align: "middle" }
      : { face: FONT, size: 0, color: "transparent", strokeWidth: 0, background: "transparent" };
  }
  function connectedEdgeIds(nodeId) {
    return edgesDS.getIds({ filter: (e) => (e.from === nodeId || e.to === nodeId) && !isHitEdge(e) });
  }
  function setEdgeLabels(ids, on) {
    ids = ids.filter((id) => { const e = edgesDS.get(id); return e && !isHitEdge(e); });
    if (!ids.length) return;
    edgesDS.update(ids.map((id) => {
      const e = edgesDS.get(id);
      return { id: id, label: on ? (e.reason || "") : "", font: labelFont(on) };
    }));
  }
  function clearEdgeLabels() {
    const ids = edgesDS.getIds({ filter: (e) => e.label });
    setEdgeLabels(ids, false);
  }
  function matchesQuery(n, q) {
    if (!q) return true;
    return (n.label && n.label.toLowerCase().indexOf(q) !== -1)
      || (n.type && n.type.toLowerCase().indexOf(q) !== -1)
      || (n.id && n.id.toLowerCase().indexOf(q) !== -1)
      || (n.episodeTitle && n.episodeTitle.toLowerCase().indexOf(q) !== -1);
  }
  function applyFilters() {
    if (!raw || !nodesDS || !edgesDS) return;
    const q = query;
    const updates = [];
    let matched = 0;
    raw.nodes.forEach((src) => {
      const typeOk = typeOn[src.type] !== false;
      const hit = matchesQuery(src, q);
      const hidden = !typeOk;
      const dim = typeOk && q && !hit;
      if (typeOk && hit) matched += 1;
      const meta = TYPE_META[src.type] || { color: "#8b93a4" };
      const color = meta.color;
      const isHub = isHubNode(src);
      updates.push({
        id: src.id,
        hidden: hidden,
        opacity: dim ? 0.16 : 1,
        borderWidth: !dim && q && hit ? 3 : (isHub ? 2.5 : 1.6),
        color: {
          background: hexToRgba(color, dim ? 0.06 : (isHub ? 0.42 : 0.16)),
          border: dim ? hexToRgba(color, 0.22) : color,
          highlight: { background: hexToRgba(color, 0.5), border: "#f3eee4" },
          hover: { background: hexToRgba(color, 0.32), border: "#f3eee4" }
        }
      });
    });
    nodesDS.update(updates);
    const edgeUpdates = edgesDS.get().map((e) => {
      const a = nodesDS.get(e.from);
      const b = nodesDS.get(e.to);
      const hide = !a || !b || a.hidden || b.hidden;
      if (isHitEdge(e)) return { id: e.id, hidden: hide };
      const dim = !hide && q && !(matchesQuery(a, q) || matchesQuery(b, q));
      const cross = isCrossEdge(e);
      return {
        id: e.id,
        hidden: hide,
        color: {
          color: dim
            ? (cross ? "rgba(232,184,74,0.12)" : "rgba(232,184,74,0.05)")
            : (cross ? "rgba(232,184,74,0.45)" : "rgba(232,184,74,0.16)"),
          highlight: "rgba(232,184,74,0.9)",
          hover: "rgba(243,238,228,0.55)"
        }
      };
    });
    edgesDS.update(edgeUpdates);
    el.matchCount.textContent = q ? (matched + " match" + (matched === 1 ? "" : "es")) : "";
    if (selectedId) {
      const sn = nodesDS.get(selectedId);
      if (!sn || sn.hidden) deselect();
    }
  }
  function showTooltip(text, x, y) {
    if (appRoot && appRoot.classList.contains("has-sel")) return;
    const tip = el.tooltip;
    tip.textContent = "";
    const k = document.createElement("span");
    k.className = "k";
    k.textContent = "Reason";
    tip.appendChild(k);
    tip.appendChild(document.createTextNode(text || ""));
    tip.hidden = false;
    const rect = el.wrap.getBoundingClientRect();
    const left = Math.min(rect.width - 24, Math.max(12, x + 14));
    const top = Math.min(rect.height - 24, Math.max(12, y + 14));
    tip.style.left = left + "px";
    tip.style.top = top + "px";
  }
  function hideTooltip() { el.tooltip.hidden = true; }

  function kvRow(dt, ddNode) {
    const wrap = document.createElement("div");
    wrap.style.display = "contents";
    const t = document.createElement("dt");
    t.textContent = dt;
    const d = document.createElement("dd");
    d.appendChild(ddNode);
    wrap.appendChild(t);
    wrap.appendChild(d);
    return wrap;
  }
  function renderSidebar(nodeId) {
    el.detail.textContent = "";
    if (!nodeId) {
      el.empty.hidden = false;
      el.detail.hidden = true;
      if (el.close) el.close.hidden = true;
      return;
    }
    const n = raw.nodes.find((x) => x.id === nodeId);
    if (!n) return;
    const meta = TYPE_META[n.type] || { color: "#8b93a4", label: n.type };
    const badge = document.createElement("div");
    badge.className = "detail-type";
    badge.style.setProperty("--swatch", meta.color);
    const sw = document.createElement("span");
    sw.className = "swatch";
    badge.appendChild(sw);
    badge.appendChild(document.createTextNode(meta.label));
    const title = document.createElement("h2");
    title.id = "detail-title";
    title.textContent = n.label;
    const dl = document.createElement("dl");
    dl.className = "kv";
    const typeDd = document.createElement("span");
    typeDd.textContent = n.type;
    dl.appendChild(kvRow("Type", typeDd));
    if (n.episodeTitle) {
      const epDd = document.createElement("span");
      epDd.textContent = n.episodeTitle;
      dl.appendChild(kvRow("Episode", epDd));
    }
    const tsDd = document.createElement("span");
    tsDd.className = "ts";
    tsDd.textContent = n.timestamp ? n.timestamp : "—";
    dl.appendChild(kvRow("Timestamp", tsDd));
    if (n.url) {
      const a = document.createElement("a");
      a.href = n.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = n.url;
      dl.appendChild(kvRow("URL", a));
    }
    el.detail.appendChild(badge);
    el.detail.appendChild(title);
    el.detail.appendChild(dl);
    const conns = [];
    raw.edges.forEach((e) => {
      if (e.from === n.id) {
        const other = raw.nodes.find((x) => x.id === e.to);
        if (other) conns.push({ other: other, reason: e.reason, kind: e.kind || "" });
      } else if (e.to === n.id) {
        const other = raw.nodes.find((x) => x.id === e.from);
        if (other) conns.push({ other: other, reason: e.reason, kind: e.kind || "" });
      }
    });
    if (conns.length) {
      const lab = document.createElement("p");
      lab.className = "section-label";
      lab.textContent = "Connections · " + conns.length;
      const list = document.createElement("div");
      list.className = "conn";
      conns.forEach((c) => {
        const cm = TYPE_META[c.other.type] || { color: "#8b93a4" };
        const item = document.createElement("div");
        item.className = "conn-item";
        item.style.setProperty("--swatch", cm.color);
        item.addEventListener("click", () => selectNode(c.other.id));
        const who = document.createElement("div");
        who.className = "who";
        who.style.setProperty("--swatch", cm.color);
        const dot = document.createElement("span");
        dot.className = "dot";
        who.appendChild(dot);
        who.appendChild(document.createTextNode(c.other.label));
        const reason = document.createElement("div");
        reason.className = "reason";
        reason.textContent = c.reason + (c.other.episodeTitle && c.other.episodeId !== n.episodeId ? " · " + c.other.episodeTitle : "");
        item.appendChild(who);
        item.appendChild(reason);
        list.appendChild(item);
      });
      el.detail.appendChild(lab);
      el.detail.appendChild(list);
    }
    const hint = document.createElement("p");
    hint.className = "hint";
    hint.textContent = "Edge labels on the graph are the original reason field.";
    el.detail.appendChild(hint);
    el.empty.hidden = true;
    el.detail.hidden = false;
    if (el.close) el.close.hidden = false;
  }
  function renderEdgeSheet(e) {
    hideTooltip();
    const from = raw.nodes.find((x) => x.id === e.from);
    const to = raw.nodes.find((x) => x.id === e.to);
    if (!from || !to) return;
    if (appRoot) appRoot.classList.add("has-sel");
    selectedId = null;
    if (network) network.selectEdges([e.id]);
    el.empty.hidden = true;
    el.detail.hidden = false;
    if (el.close) el.close.hidden = false;
    el.detail.textContent = "";
    const badge = document.createElement("div");
    badge.className = "detail-type";
    badge.style.setProperty("--swatch", "#e8b84a");
    const sw = document.createElement("span");
    sw.className = "swatch";
    badge.appendChild(sw);
    badge.appendChild(document.createTextNode(e.kind === "cross" ? "Cross" : "Link"));
    const title = document.createElement("h2");
    title.id = "detail-title";
    title.textContent = e.reason || "Connection";
    const lab = document.createElement("p");
    lab.className = "section-label";
    lab.textContent = "Between";
    const list = document.createElement("div");
    list.className = "conn";
    [from, to].forEach((n) => {
      const cm = TYPE_META[n.type] || { color: "#8b93a4" };
      const item = document.createElement("div");
      item.className = "conn-item";
      item.style.setProperty("--swatch", cm.color);
      item.addEventListener("click", () => selectNode(n.id));
      const who = document.createElement("div");
      who.className = "who";
      const dot = document.createElement("span");
      dot.className = "dot";
      who.appendChild(dot);
      who.appendChild(document.createTextNode(n.label));
      item.appendChild(who);
      if (n.episodeTitle) {
        const reason = document.createElement("div");
        reason.className = "reason";
        reason.textContent = n.episodeTitle;
        item.appendChild(reason);
      }
      list.appendChild(item);
    });
    el.detail.appendChild(badge);
    el.detail.appendChild(title);
    el.detail.appendChild(lab);
    el.detail.appendChild(list);
  }
  function selectNode(id) {
    if (!id || !nodesDS.get(id) || nodesDS.get(id).hidden) return;
    hideTooltip();
    selectedId = id;
    if (appRoot) appRoot.classList.add("has-sel");
    network.selectNodes([id]);
    clearEdgeLabels();
    setEdgeLabels(connectedEdgeIds(id), true);
    renderSidebar(id);
  }
  function deselect() {
    selectedId = null;
    if (appRoot) appRoot.classList.remove("has-sel");
    if (network) network.unselectAll();
    clearEdgeLabels();
    hideTooltip();
    renderSidebar(null);
  }
  function buildLegend() {
    const counts = Object.create(null);
    raw.nodes.forEach((n) => { counts[n.type] = (counts[n.type] || 0) + 1; });
    el.legend.textContent = "";
    TYPE_ORDER.forEach((type) => {
      if (!counts[type]) return;
      const meta = TYPE_META[type];
      const lab = document.createElement("label");
      lab.style.setProperty("--swatch", meta.color);
      lab.classList.toggle("off", typeOn[type] === false);
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = typeOn[type] !== false;
      box.addEventListener("change", () => {
        typeOn[type] = box.checked;
        lab.classList.toggle("off", !box.checked);
        applyFilters();
      });
      const sw = document.createElement("span");
      sw.className = "swatch";
      sw.textContent = meta.label.charAt(0);
      const cnt = document.createElement("span");
      cnt.className = "count";
      cnt.textContent = String(counts[type]);
      lab.appendChild(box);
      lab.appendChild(sw);
      lab.appendChild(document.createTextNode(" " + meta.label + " "));
      lab.appendChild(cnt);
      el.legend.appendChild(lab);
    });
  }
  function bindUi() {
    if (uiBound) return;
    uiBound = true;
    el.search.addEventListener("input", () => {
      query = el.search.value.trim().toLowerCase();
      applyFilters();
    });
    el.search.addEventListener("keydown", (ev) => {
      if (ev.key !== "Enter") return;
      const q = query;
      const first = raw.nodes.find((n) => {
        const node = nodesDS.get(n.id);
        return node && !node.hidden && matchesQuery(n, q);
      });
      if (first) {
        selectNode(first.id);
        network.focus(first.id, { scale: 1.25, animation: { duration: 400 } });
      }
    });
    document.addEventListener("keydown", (ev) => {
      if (ev.key !== "Escape") return;
      if (document.activeElement === el.search && el.search.value) {
        el.search.value = "";
        query = "";
        applyFilters();
      } else {
        deselect();
      }
    });
    if (el.close) el.close.addEventListener("click", () => deselect());
    el.fit.addEventListener("click", () => network && network.fit({ animation: true }));
    el.reset.addEventListener("click", () => {
      deselect();
      el.search.value = "";
      query = "";
      TYPE_ORDER.forEach((t) => { typeOn[t] = true; });
      el.legend.querySelectorAll("label").forEach((lab) => {
        lab.classList.remove("off");
        const box = lab.querySelector("input");
        if (box) box.checked = true;
      });
      applyFilters();
      if (network) network.fit({ animation: true });
    });
    window.addEventListener("resize", () => { if (network) network.redraw(); });
  }
  function bindNetwork() {
    network.on("click", (params) => {
      if (params.nodes.length) {
        selectNode(params.nodes[0]);
        return;
      }
      if (params.edges.length) {
        const e = realEdgeFrom(params.edges[0]);
        if (e) {
          setEdgeLabels([e.id], true);
          renderEdgeSheet(e);
        }
        return;
      }
      deselect();
    });
    network.on("hoverEdge", (params) => {
      const e = realEdgeFrom(params.edge);
      if (!e) return;
      setEdgeLabels([e.id], true);
      showTooltip(e.reason, params.pointer.DOM.x, params.pointer.DOM.y);
    });
    network.on("blurEdge", (params) => {
      const e = realEdgeFrom(params.edge);
      hideTooltip();
      const id = e ? e.id : params.edge;
      if (selectedId) {
        const keep = connectedEdgeIds(selectedId);
        if (keep.indexOf(id) === -1) setEdgeLabels([id], false);
      } else {
        setEdgeLabels([id], false);
      }
    });
    network.on("hoverNode", (params) => {
      el.graph.style.cursor = "pointer";
      if (!selectedId && params.node) setEdgeLabels(connectedEdgeIds(params.node), true);
    });
    network.on("blurNode", (params) => {
      el.graph.style.cursor = "default";
      if (!selectedId && params.node) setEdgeLabels(connectedEdgeIds(params.node), false);
    });
    network.on("doubleClick", (params) => {
      if (params.nodes[0]) {
        network.focus(params.nodes[0], { scale: 1.35, animation: { duration: 350 } });
      }
    });
    network.once("stabilizationIterationsDone", () => {
      if (nodesDS) {
        const unfix = raw.nodes.filter((n) => !isHubNode(n)).map((n) => ({ id: n.id, fixed: false }));
        if (unfix.length) nodesDS.update(unfix);
      }
      el.loading.hidden = true;
      el.graph.classList.add("is-ready");
      network.fit({ animation: { duration: 650, easingFunction: "easeInOutQuad" } });
    });
  }
  function destroyNetwork() {
    hideTooltip();
    selectedId = null;
    if (appRoot) appRoot.classList.remove("has-sel");
    renderSidebar(null);
    if (network) {
      try { network.destroy(); } catch (err) { /* ignore */ }
      network = null;
    }
    nodesDS = null;
    edgesDS = null;
    el.graph.classList.remove("is-ready");
    el.graph.textContent = "";
    el.loading.hidden = false;
    el.loading.textContent = "Laying out graph…";
  }
  function buildNetwork() {
    const deg = degreeMap(raw.edges);
    nodesDS = new vis.DataSet(raw.nodes.map((n) => visNode(n, deg[n.id] || 0)));
    edgesDS = new vis.DataSet(raw.edges.flatMap(visEdges));
    network = new vis.Network(el.graph, { nodes: nodesDS, edges: edgesDS }, {
      autoResize: true,
      interaction: {
        hover: true,
        hoverConnectedEdges: true,
        tooltipDelay: 400,
        dragNodes: true,
        dragView: true,
        zoomView: true,
        selectable: true,
        selectConnectedEdges: true,
        navigationButtons: false,
        keyboard: false,
        hideEdgesOnDrag: false
      },
      layout: { improvedLayout: false, randomSeed: 2537 },
      physics: {
        enabled: true,
        solver: "forceAtlas2Based",
        forceAtlas2Based: {
          gravitationalConstant: selectedIds.length > 1 ? -68 : -50,
          centralGravity: selectedIds.length > 1 ? 0.002 : 0.008,
          springLength: 110,
          springConstant: 0.07,
          damping: 0.55,
          avoidOverlap: 1
        },
        stabilization: { enabled: true, iterations: 320, fit: true, updateInterval: 25 }
      },
      nodes: { scaling: { min: 10, max: 40 } },
      edges: { chosen: { edge: true, label: true } }
    });
  }
  async function rebuildGraph() {
    const seq = ++rebuildSeq;
    const eps = selectedEpisodes();
    if (!eps.length) return;
    updateHeader(eps);
    destroyNetwork();
    try {
      const loaded = await Promise.all(eps.map(async (ep) => {
        const g = await loadEpisodeGraph(ep);
        return prefixGraph(ep, g);
      }));
      if (seq !== rebuildSeq) return;
      const nodes = [];
      const edges = [];
      loaded.forEach((g) => {
        nodes.push.apply(nodes, g.nodes);
        edges.push.apply(edges, g.edges);
      });
      const cross = addCrossEdges(nodes);
      edges.push.apply(edges, cross);
      seedClusters(nodes, eps);
      raw = { nodes: nodes, edges: edges };
      el.nodeCount.textContent = String(nodes.length);
      el.edgeCount.textContent = String(edges.length);
      buildLegend();
      buildNetwork();
      bindNetwork();
      applyFilters();
    } catch (err) {
      if (seq !== rebuildSeq) return;
      el.loading.hidden = false;
      el.loading.textContent = "Could not load graph: " + (err && err.message ? err.message : err);
    }
  }
  async function main() {
    try {
      if (typeof vis === "undefined") {
        el.loading.textContent = "vis-network failed to load from CDN";
        return;
      }
      catalog = await loadCatalog();
      selectedIds = defaultSelectedIds();
      if (!selectedIds.length) throw new Error("Catalog has no episodes");
      renderPicker();
      bindUi();
      await rebuildGraph();
    } catch (err) {
      el.loading.hidden = false;
      el.loading.textContent = "Could not load graph: " + (err && err.message ? err.message : err);
    }
  }
  main();
})();
