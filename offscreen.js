// 背景檢查用的隱藏頁面：背景程式不能解析網頁 HTML，所以交給這裡搜尋。
import { searchMulti, browseAll } from './sources.js';
import { i18nReady, setLang } from './i18n.js';

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== 'offscreen') return;
  // 背景檢查只抓第一頁（依最新排序，新上架一定在最前面），並標記為背景，讓 Vinted 備援控制頻率
  const opts = { pages: 1, price: msg.price, used: msg.used, background: true, q: msg.q };
  const ready = i18nReady.then(() => setLang(msg.lang));
  let job;
  if (msg.type === 'searchMulti') job = ready.then(() => searchMulti(msg.subs, null, opts));
  else if (msg.type === 'browseAll') job = ready.then(() => browseAll(msg.category, msg.sources, null, opts));
  else return;
  // 檢查可能超過 30 秒：期間每 20 秒通知背景程式一次，Chrome 才不會把它暫停而丟掉這次結果
  const ping = setInterval(() => chrome.runtime.sendMessage({ type: 'keepalive' }).catch(() => {}), 20000);
  job.then(sendResponse).catch(e => sendResponse({ items: [], errors: [String(e?.message || e)] }))
    .finally(() => clearInterval(ping));
  return true;
});
