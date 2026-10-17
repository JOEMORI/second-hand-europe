// 在插件頁面裡的隱藏框架打開 Vinted / eBay 時執行：讀出商品資料交回插件。
// 只在插件自己建立、名稱以 gs- 開頭的框架裡動作，一般瀏覽這些網站不受影響。
// 框架裡網站自己的程式不會執行（sandbox），只讀伺服器送來的 HTML，所以很省資源。
(() => {
  if (window.top === window) return;
  const req = (window.name.match(/^gs-([\w-]+)$/) || [])[1];
  if (!req) return;

  // eBay、Vatera：整頁 HTML 交回去，由插件解析
  if (/(^|\.)(ebay|vatera)\./.test(location.hostname)) {
    const ready = h => /s-card|data-product-id|id="searchQuery"|srp-save-null-search/.test(h);
    const challenge = h => /captcha-delivery|splashui|awswaf|challenge-platform|pardon our interruption/i.test(h);
    const html = document.documentElement.outerHTML;
    if (ready(html) || !challenge(html)) {
      chrome.runtime.sendMessage({ type: 'pageFrame', req, html }).catch(() => {});
    } else {
      chrome.runtime.sendMessage({ type: 'pageFrame', req, blocked: true }).catch(() => {});
    }
    return;
  }

  function extract() {
    const html = document.documentElement.innerHTML;
    if (/captcha-delivery|geo\.captcha|datadome/i.test(html) && !html.includes('__next_f')) return { blocked: true };
    const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
    let m, flight = '';
    while ((m = re.exec(html))) { try { flight += JSON.parse(m[1]); } catch (e) {} }
    const key = '"items":{"items":[';
    const i = flight.indexOf(key);
    if (i < 0) return null;
    const start = i + key.length - 1;
    let depth = 0, inStr = false, esc = false, j = start;
    for (; j < flight.length; j++) {
      const c = flight[j];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === '[' || c === '{') depth++;
      else if (c === ']' || c === '}') { depth--; if (depth === 0) break; }
    }
    try { return { items: JSON.parse(flight.slice(start, j + 1)) }; } catch (e) { return null; }
  }

  let tries = 0;
  const tick = () => {
    const r = extract();
    if (r || ++tries >= 12) {
      chrome.runtime.sendMessage({ type: 'pageFrame', req, ...(r || { error: 'noitems' }) }).catch(() => {});
    } else {
      setTimeout(tick, 500);
    }
  };
  tick();
})();
