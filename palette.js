(function () {
  if (!window.vis || !vis.DataSet) return;
  var HEX = {
    "#8fb7c9": "#5aa7e6",
    "#6db8a8": "#3ecfbe",
    "#a690c4": "#b794f6",
    "#d07a68": "#f09090",
    "#7fbf9a": "#6dd392",
    "#d4925a": "#f0a05a",
    "#c4849c": "#e879c0"
  };
  var RGB = {
    "143,183,201": "90,167,230",
    "109,184,168": "62,207,190",
    "166,144,196": "183,148,246",
    "208,122,104": "240,144,144",
    "127,191,154": "109,211,146",
    "212,146,90": "240,160,90",
    "196,132,156": "232,121,192"
  };
  function mapStr(s) {
    if (typeof s !== "string") return s;
    if (HEX[s]) return HEX[s];
    return s.replace(/rgba?\((\d+),\s*(\d+),\s*(\d+)/g, function (m, r, g, b) {
      var n = RGB[r + "," + g + "," + b];
      return n ? m.replace(r + "," + g + "," + b, n).replace(r + ", " + g + ", " + b, n) : m;
    });
  }
  function rewrite(n) {
    if (!n || typeof n !== "object") return n;
    var o = {};
    for (var k in n) if (Object.prototype.hasOwnProperty.call(n, k)) o[k] = n[k];
    if (typeof o.color === "string") o.color = mapStr(o.color);
    else if (o.color) {
      o.color = rewrite(o.color);
    }
    if (o.shadow && o.shadow.color) {
      o.shadow = rewrite(o.shadow);
    }
    if (o.background) o.background = mapStr(o.background);
    if (o.border) o.border = mapStr(o.border);
    if (o.highlight) o.highlight = rewrite(o.highlight);
    if (o.hover) o.hover = rewrite(o.hover);
    return o;
  }
  function many(items) {
    if (items == null) return items;
    return Array.isArray(items) ? items.map(rewrite) : rewrite(items);
  }
  var Orig = vis.DataSet;
  vis.DataSet = function (data, options) {
    var ds = new Orig(many(data || []), options);
    var add = ds.add.bind(ds);
    var update = ds.update.bind(ds);
    ds.add = function (items, senderId) { return add(many(items), senderId); };
    ds.update = function (items, senderId) { return update(many(items), senderId); };
    return ds;
  };
  vis.DataSet.prototype = Orig.prototype;
})();
