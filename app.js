/* Podcast topic-bubble graphs */
(function () {
  "use strict";
  const TYPE_ORDER = ["topic","person","website","paper","book","product","podcast","media"];
  const CLUSTER_GAP = 1200;
  function defaultSelectedIds() {
    const eps = (catalog && catalog.episodes) || [];
    const marked = eps.filter((ep) => ep.defaultOn).map((ep) => ep.id);
    if (marked.length) return marked;
    const first = eps.find((ep) => !ep.demo) || eps[0];
    return first ? [first.id] : [];
  }
})();
