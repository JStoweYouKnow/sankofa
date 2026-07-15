// FamilySearch search-results parser (browser + Node fixture tests).
// Isolates DOM scraping so Forebear never invents citations — only
 // what appears on the open results page the researcher already loaded.
(function (root) {
  'use strict';

  function companionAbsUrl(href, pageUrl) {
    if (!href) return '';
    if (/^https?:\/\//i.test(href)) return href;
    try {
      return new URL(href, pageUrl || 'https://www.familysearch.org/').href;
    } catch (_) {
      return href;
    }
  }

  function companionExtractYear(text) {
    const m = String(text || '').match(/\b((?:1[7-9]|20)\d{2})\b/);
    return m ? Number(m[1]) : null;
  }

  /**
   * @param {Document|Element} doc
   * @param {string} [pageUrl]
   * @returns {Array<{label:string,url:string,year:number|null,note:string,source:string,type:string}>}
   */
  function parseFamilySearchResults(doc, pageUrl) {
    const hits = [];
    if (!doc || typeof doc.querySelectorAll !== 'function') return hits;
    const seen = new Set();
    let nodes = doc.querySelectorAll(
      '[data-testid="search-result"], [data-testid="result-item"], .search-result, li.result, article.result, .results-item'
    );
    if (!nodes.length) {
      nodes = doc.querySelectorAll('a[href*="/ark:/"]');
    }
    nodes.forEach(function (node) {
      const a =
        node.tagName === 'A' && String(node.getAttribute('href') || '').indexOf('/ark:/') >= 0
          ? node
          : node.querySelector('a[href*="/ark:/"]');
      if (!a) return;
      const rawHref = a.getAttribute('href') || a.href || '';
      const url = companionAbsUrl(rawHref, pageUrl);
      if (!url || seen.has(url)) return;
      seen.add(url);
      const label = String(a.textContent || node.textContent || '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 220);
      if (!label || label.length < 3) return;
      const block = String(node.textContent || '').replace(/\s+/g, ' ');
      hits.push({
        label: label,
        url: url,
        year: companionExtractYear(block),
        note: 'Captured from FamilySearch — review before logging (shared surname is a lead, not proof).',
        source: 'companion',
        type: 'Other'
      });
    });
    return hits.slice(0, 40);
  }

  root.parseFamilySearchResults = parseFamilySearchResults;
  root.companionExtractYear = companionExtractYear;
  root.companionAbsUrl = companionAbsUrl;
})(typeof globalThis !== 'undefined' ? globalThis : this);
