(function () {
  "use strict";
  var catalog = null;
  var ytById = Object.create(null);
  var ytByTitle = Object.create(null);
  var picker = document.getElementById("episode-picker");
  var appRoot = document.getElementById("app");
  var detail = document.getElementById("detail");
  var btnOpen = document.getElementById("btn-catalog");
  var btnClose = document.getElementById("btn-rail-close");

  function parseTs(s) {
    var p = String(s || "").trim().split(":");
    if (!p.length || p.some(function (x) { return x === "" || isNaN(Number(x)); })) return null;
    var n = p.map(Number);
    if (n.length === 3) return n[0] * 3600 + n[1] * 60 + n[2];
    if (n.length === 2) return n[0] * 60 + n[1];
    return n[0];
  }
  function youtubeAt(base, ts) {
    var sec = parseTs(ts);
    if (!base || sec == null) return null;
    return base + (base.indexOf("?") >= 0 ? "&" : "?") + "t=" + sec + "s";
  }
  function loadCatalog(cb) {
    fetch("./episodes/catalog.json", { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        catalog = data;
        ((data && data.episodes) || []).forEach(function (ep) {
          if (ep.youtube) {
            ytById[ep.id] = ep.youtube;
            if (ep.title) ytByTitle[ep.title] = ep.youtube;
          }
        });
        cb();
      })
      .catch(function () { cb(); });
  }
  function categoryOf(id) {
    var eps = (catalog && catalog.episodes) || [];
    for (var i = 0; i < eps.length; i++) {
      if (eps[i].id === id) return eps[i].category || (eps[i].demo ? "Demo" : "Episodes");
    }
    return "Episodes";
  }
  function groupPicker() {
    if (!picker) return;
    var chips = Array.prototype.slice.call(picker.querySelectorAll(".ep-chip"));
    if (!chips.length) return;
    var groups = [];
    var map = Object.create(null);
    chips.forEach(function (chip) {
      var cat = categoryOf(chip.dataset.id);
      if (!map[cat]) {
        map[cat] = [];
        groups.push(cat);
      }
      map[cat].push(chip);
    });
    picker.textContent = "";
    groups.forEach(function (cat) {
      var wrap = document.createElement("div");
      wrap.className = "rail-cat open";
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "rail-cat-btn";
      btn.setAttribute("aria-expanded", "true");
      var tick = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      tick.setAttribute("class", "rail-tick");
      tick.setAttribute("viewBox", "0 0 16 16");
      tick.setAttribute("aria-hidden", "true");
      var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-width", "2");
      path.setAttribute("stroke-linecap", "round");
      path.setAttribute("stroke-linejoin", "round");
      path.setAttribute("d", "M3 8.5l3.2 3.2L13 4.5");
      tick.appendChild(path);
      btn.appendChild(tick);
      btn.appendChild(document.createTextNode(cat));
      var body = document.createElement("div");
      body.className = "rail-cat-body";
      map[cat].forEach(function (chip) { body.appendChild(chip); });
      btn.addEventListener("click", function () {
        var on = wrap.classList.toggle("open");
        btn.setAttribute("aria-expanded", on ? "true" : "false");
      });
      wrap.appendChild(btn);
      wrap.appendChild(body);
      picker.appendChild(wrap);
    });
  }
  function youtubeForDetail() {
    if (!detail) return ytById["jre-2537"] || "";
    var dts = detail.querySelectorAll("dt");
    for (var i = 0; i < dts.length; i++) {
      if (dts[i].textContent.trim() !== "Episode") continue;
      var dd = dts[i].nextElementSibling;
      var title = dd ? dd.textContent.trim() : "";
      if (title && ytByTitle[title]) return ytByTitle[title];
    }
    var ids = Object.keys(ytById);
    return ids.length ? ytById[ids[0]] : "";
  }
  function timesFrom(text) {
    return String(text || "")
      .split(/[,;]|\n/)
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s && s !== "—"; });
  }
  function enhanceDetail() {
    if (!detail || detail.hidden) return;
    var dts = detail.querySelectorAll("dt");
    dts.forEach(function (dt) {
      if (dt.textContent.trim() !== "Timestamp") return;
      var dd = dt.nextElementSibling;
      if (!dd || dd.dataset.yt === "1") return;
      var times = timesFrom(dd.textContent);
      dd.dataset.yt = "1";
      dd.textContent = "";
      if (!times.length) {
        dd.textContent = "—";
        return;
      }
      var list = document.createElement("div");
      list.className = "ts-list";
      var base = youtubeForDetail();
      times.forEach(function (t) {
        var href = youtubeAt(base, t);
        var row = document.createElement(href ? "a" : "div");
        row.className = "ts-row";
        row.textContent = t;
        if (href) {
          row.href = href;
          row.target = "_blank";
          row.rel = "noopener noreferrer";
        }
        list.appendChild(row);
      });
      dd.appendChild(list);
    });
  }
  function openRail() {
    if (appRoot) appRoot.classList.add("has-rail");
    if (btnClose) btnClose.hidden = false;
  }
  function closeRail() {
    if (appRoot) appRoot.classList.remove("has-rail");
    if (btnClose) btnClose.hidden = true;
  }
  function watchPicker() {
    if (!picker) return;
    var obs = new MutationObserver(function () {
      if (picker.querySelector(".rail-cat")) return;
      if (picker.querySelector(".ep-chip")) groupPicker();
    });
    obs.observe(picker, { childList: true });
    if (picker.querySelector(".ep-chip")) groupPicker();
  }
  function watchDetail() {
    if (!detail) return;
    var obs = new MutationObserver(function () { enhanceDetail(); });
    obs.observe(detail, { childList: true, subtree: true });
    enhanceDetail();
  }

  if (btnOpen) btnOpen.addEventListener("click", openRail);
  if (btnClose) btnClose.addEventListener("click", closeRail);
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && appRoot && appRoot.classList.contains("has-rail")) closeRail();
  });
  loadCatalog(function () {
    watchPicker();
    watchDetail();
  });
})();
