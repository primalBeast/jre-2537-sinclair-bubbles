/* JRE #2537 topic-bubble graph */
(function () {
  "use strict";
  const TYPE_ORDER = ["topic","person","website","paper","book","product","podcast","media"];
  const TYPE_META = {
    topic:   { color: "#8fb7c9", label: "Topic" },
    person:  { color: "#e8b84a", label: "Person" },
    website: { color: "#6db8a8", label: "Website" },
    paper:   { color: "#a690c4", label: "Paper" },
    book:    { color: "#d07a68", label: "Book" },
    product: { color: "#7fbf9a", label: "Product" },
    podcast: { color: "#d4925a", label: "Podcast" },
    media:   { color: "#c4849c", label: "Media" }
  };
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
    close: byId("btn-close")
  };
  let raw = null, nodesDS = null, edgesDS = null, network = null, selectedId = null, query = "";
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
  async function loadData() {
    try {
      const res = await fetch("./graph.json", { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } catch (err) {
      if (window.GRAPH_DATA && window.GRAPH_DATA.nodes) return window.GRAPH_DATA;
      throw err;
    }
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
    const isHub = n.id === "jre-2537";
    const fontSize = isHub ? 16 : 12 + Math.min(4, (deg || 0) / 4);
    return {
      id: n.id,
      label: n.label,
      type: n.type,
      timestamp: n.timestamp || "",
      url: n.url || "",
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
  }
  function visEdge(e, i) {
    return {
      id: "e-" + i,
      from: e.from,
      to: e.to,
      reason: e.reason,
      title: e.reason,
      label: "",
      arrows: { to: { enabled: true, scaleFactor: 0.55 } },
      color: {
        color: "rgba(232,184,74,0.16)",
        highlight: "rgba(232,184,74,0.9)",
        hover: "rgba(243,238,228,0.55)"
      },
      width: 2,
      hoverWidth: 8,
      selectionWidth: 8,
      smooth: { type: "continuous", roundness: 0.35 },
      font: { face: FONT, size: 0, color: "transparent", strokeWidth: 0, background: "transparent" }
    };
  }
  function labelFont(on) {
    return on
      ? { face: FONT, size: 11, color: "#f3eee4", strokeWidth: 4, strokeColor: "#09080c", background: "rgba(10,9,12,0.88)", align: "middle" }
      : { face: FONT, size: 0, color: "transparent", strokeWidth: 0, background: "transparent" };
  }
  function connectedEdgeIds(nodeId) {
    return edgesDS.getIds({ filter: (e) => e.from === nodeId || e.to === nodeId });
  }
  function setEdgeLabels(ids, on) {
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
      || (n.id && n.id.toLowerCase().indexOf(q) !== -1);
  }
  function applyFilters() {
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
      const isHub = src.id === "jre-2537";
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
      const dim = !hide && q && !(matchesQuery(a, q) || matchesQuery(b, q));
      return {
        id: e.id,
        hidden: hide,
        color: {
          color: dim ? "rgba(232,184,74,0.05)" : "rgba(232,184,74,0.16)",
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
        if (other) conns.push({ other: other, reason: e.reason });
      } else if (e.to === n.id) {
        const other = raw.nodes.find((x) => x.id === e.from);
        if (other) conns.push({ other: other, reason: e.reason });
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
        reason.textContent = c.reason;
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
    badge.appendChild(document.createTextNode("Link"));
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
      list.appendChild(item);
    });
    el.detail.appendChild(badge);
    el.detail.appendChild(title);
    el.detail.appendChild(lab);
    el.detail.appendChild(list);
  }
  function selectNode(id) {
    if (!id || !nodesDS.get(id) || nodesDS.get(id).hidden) return;
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
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = true;
      box.addEventListener("change", () => {
        typeOn[type] = box.checked;
        lab.classList.toggle("off", !box.checked);
        applyFilters();
      });
      const sw = document.createElement("span");
      sw.className = "swatch";
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
      network.fit({ animation: true });
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
        const e = edgesDS.get(params.edges[0]);
        if (e) {
          setEdgeLabels([e.id], true);
          showTooltip(e.reason, params.pointer.DOM.x, params.pointer.DOM.y);
          renderEdgeSheet(e);
        }
        return;
      }
      deselect();
    });
    network.on("hoverEdge", (params) => {
      const e = edgesDS.get(params.edge);
      if (!e) return;
      setEdgeLabels([e.id], true);
      showTooltip(e.reason, params.pointer.DOM.x, params.pointer.DOM.y);
    });
    network.on("blurEdge", (params) => {
      const id = params.edge;
      hideTooltip();
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
      el.loading.hidden = true;
      el.graph.classList.add("is-ready");
      network.fit({ animation: { duration: 650, easingFunction: "easeInOutQuad" } });
    });
  }
  function buildNetwork() {
    const deg = degreeMap(raw.edges);
    nodesDS = new vis.DataSet(raw.nodes.map((n) => visNode(n, deg[n.id] || 0)));
    edgesDS = new vis.DataSet(raw.edges.map(visEdge));
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
      layout: { improvedLayout: true, randomSeed: 2537 },
      physics: {
        enabled: true,
        solver: "forceAtlas2Based",
        forceAtlas2Based: {
          gravitationalConstant: -42,
          centralGravity: 0.012,
          springLength: 128,
          springConstant: 0.07,
          damping: 0.55,
          avoidOverlap: 1
        },
        stabilization: { enabled: true, iterations: 280, fit: true, updateInterval: 25 }
      },
      nodes: { scaling: { min: 10, max: 40 } },
      edges: { chosen: { edge: true, label: true } }
    });
  }
  async function main() {
    try {
      if (typeof vis === "undefined") {
        el.loading.textContent = "vis-network failed to load from CDN";
        return;
      }
      raw = await loadData();
      if (!raw || !Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) {
        throw new Error("Graph data missing nodes/edges");
      }
      el.nodeCount.textContent = String(raw.nodes.length);
      el.edgeCount.textContent = String(raw.edges.length);
      buildLegend();
      buildNetwork();
      bindNetwork();
      bindUi();
    } catch (err) {
      el.loading.hidden = false;
      el.loading.textContent = "Could not load graph: " + (err && err.message ? err.message : err);
    }
  }
  main();
})();
