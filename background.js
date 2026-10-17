import { applyFilters, computeDeals, CATEGORIES } from './sources.js';
import { T, tr, i18nReady, getLang, setLang } from './i18n.js';

const PAGE = 'search.html';

// 背景程式無法解析 HTML，搜尋交給隱藏的 offscreen 頁面執行
let creating = null;
async function ensureOffscreen() {
  const url = chrome.runtime.getURL('offscreen.html');
  const ctx = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [url] });
  if (ctx.length) return;
  if (!creating) {
    creating = chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['DOM_PARSER', 'IFRAME_SCRIPTING'],
      justification: 'Parse second-hand marketplace search result pages',
    }).finally(() => { creating = null; });
  }
  await creating;
}

async function searchMulti(subs, price, used) {
  await ensureOffscreen();
  return chrome.runtime.sendMessage({ target: 'offscreen', type: 'searchMulti', subs, price, used, lang: getLang() });
}

async function browseAll(category, sources, price) {
  await ensureOffscreen();
  return chrome.runtime.sendMessage({ target: 'offscreen', type: 'browseAll', category, sources, price, lang: getLang() });
}

// Vinted、eBay 頁面預設不准被嵌入。只有插件自己的頁面嵌入時，拿掉這個限制，
// 這樣直接讀取被擋時，可以在看不見的框架裡讀，不用另外開視窗。
async function allowVintedFrame() {
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [1],
      addRules: [{
        id: 1,
        priority: 1,
        action: { type: 'modifyHeaders', responseHeaders: [
          { header: 'x-frame-options', operation: 'remove' },
          { header: 'content-security-policy', operation: 'remove' },
        ] },
        condition: { requestDomains: ['www.vinted.nl', 'www.ebay.de', 'www.vatera.hu'], resourceTypes: ['sub_frame'], initiatorDomains: [chrome.runtime.id] },
      }],
    });
  } catch (e) { console.warn('frame rule', e); }
}
allowVintedFrame();

// 點擊工具列圖示：打開（或切換到）搜尋頁
chrome.action.onClicked.addListener(() => openPage());

async function openPage(hash = '') {
  const url = chrome.runtime.getURL(PAGE);
  const tabs = await chrome.tabs.query({ url: url + '*' }).catch(() => []);
  if (tabs.length) {
    // 已經開著：切換過去就好，不重新載入（不然搜尋結果會不見）；
    // 要換到「新上架」分頁時只改網址的 # 部分，頁面會自己切換
    const upd = { active: true };
    if (hash && tabs[0].url !== url + hash) upd.url = url + hash;
    await chrome.tabs.update(tabs[0].id, upd);
    await chrome.windows.update(tabs[0].windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: url + hash });
  }
}

async function ensureAlarm() {
  const { interval = 30 } = await chrome.storage.local.get('interval');
  const existing = await chrome.alarms.get('check');
  if (!existing || existing.periodInMinutes !== interval) {
    await chrome.alarms.create('check', { periodInMinutes: interval, delayInMinutes: 1 });
  }
}

chrome.runtime.onInstalled.addListener(ensureAlarm);
chrome.runtime.onStartup.addListener(ensureAlarm);
// 重新開 Chrome 後工具列的數字會消失：從存著的新上架補回來
chrome.runtime.onStartup.addListener(async () => {
  const { newItems = [] } = await chrome.storage.local.get('newItems');
  updateBadge(newItems.filter(i => !i.viewed).length).catch(() => {});
});

chrome.storage.onChanged.addListener(changes => {
  if (changes.lang) setLang(changes.lang.newValue);
  if (changes.interval) {
    chrome.alarms.clear('check').then(ensureAlarm).catch(e => console.warn(e));
  }
});

chrome.alarms.onAlarm.addListener(a => {
  if (a.name === 'check') checkWatches();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'checkNow') {
    checkWatches().then(r => sendResponse(r)).catch(e => sendResponse({ found: 0, error: String(e?.message || e) }));
    return true;
  }
  if (msg?.type === 'vintedViaTab') {
    vintedViaTab(msg.url, msg.background).then(sendResponse).catch(e => sendResponse({ error: String(e?.message || e) }));
    return true;
  }
});

// ---------- Vinted 備援：在最小化的獨立視窗裡讀取 ----------
// 用獨立視窗而不是在你的視窗開分頁，分頁列就不會閃。
// 同一批讀取共用同一個視窗，全部讀完幾秒後才關閉。
let vintedQueue = Promise.resolve();
let workerWin = null;     // { windowId, tabId }
let closeTimer = null;
let pending = 0;

function vintedViaTab(url, background) {
  // 背景追蹤絕對不開視窗：你可能正在看影片或做別的事，視窗跳出來會打斷你
  if (background) return i18nReady.then(() => ({ error: T`背景檢查暫時讀不到 Vinted，下次檢查會再試` }));
  pending++;
  clearTimeout(closeTimer);
  const job = vintedQueue.then(async () => {
    await i18nReady;
    return readVinted(url);
  });
  vintedQueue = job.catch(() => {}).finally(() => {
    pending--;
    if (pending === 0) closeTimer = setTimeout(closeWorker, 5000);
  });
  return job;
}

async function closeWorker() {
  if (pending > 0 || !workerWin) return;
  const w = workerWin;
  workerWin = null;
  chrome.storage.session.remove('vintedWorker').catch(() => {});
  await chrome.windows.remove(w.windowId).catch(() => {});
}

// 背景程式閒置太久會被 Chrome 暫停，計時器跟著失效，最小化視窗可能沒關掉。
// 所以把視窗編號記在 session 儲存區，背景程式重新啟動時把留下的視窗關掉。
chrome.storage.session.get('vintedWorker').then(({ vintedWorker }) => {
  if (vintedWorker?.windowId && !workerWin) {
    chrome.windows.remove(vintedWorker.windowId).catch(() => {});
    chrome.storage.session.remove('vintedWorker').catch(() => {});
  }
}).catch(() => {});

async function getWorkerTab(url) {
  if (workerWin) {
    try {
      await chrome.tabs.update(workerWin.tabId, { url });
      return workerWin.tabId;
    } catch { workerWin = null; }
  }
  try {
    const win = await chrome.windows.create({ url, state: 'minimized', focused: false });
    workerWin = { windowId: win.id, tabId: win.tabs[0].id };
    chrome.storage.session.set({ vintedWorker: workerWin }).catch(() => {});
    return workerWin.tabId;
  } catch {
    // 少數情況無法建立最小化視窗：退回在背景開分頁
    const tab = await chrome.tabs.create({ url, active: false });
    workerWin = null;
    return { fallbackTab: tab.id };
  }
}

async function readVinted(url) {
  let target;
  try {
    target = await getWorkerTab(url);
    const tabId = typeof target === 'object' ? target.fallbackTab : target;
    await waitForTabComplete(tabId, 25000);
    // 頁面資料是分批送來的，等一下讓它載完
    for (let i = 0; i < 6; i++) {
      const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: extractVintedInPage });
      if (result?.blocked) return { error: T`Vinted 要求人機驗證，請在 Chrome 打開 vinted.nl 完成驗證後再試` };
      if (result?.items) return result;
      await new Promise(r => setTimeout(r, 700));
    }
    return { error: T`頁面裡找不到商品資料` };
  } catch (e) {
    return { error: T`備援讀取失敗：${e?.message || e}` };
  } finally {
    if (typeof target === 'object') chrome.tabs.remove(target.fallbackTab).catch(() => {});
  }
}

function waitForTabComplete(tabId, timeout) {
  return new Promise((resolve, reject) => {
    let started = false;
    const timer = setTimeout(() => { chrome.tabs.onUpdated.removeListener(onUpd); reject(new Error(T`載入逾時`)); }, timeout);
    function onUpd(id, info) {
      if (id !== tabId) return;
      if (info.status === 'loading') started = true;
      if (info.status === 'complete' && started) {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(onUpd);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(onUpd);
    chrome.tabs.get(tabId).then(t => {
      if (t.status === 'loading') started = true;
      else if (t.status === 'complete' && t.url && !t.pendingUrl) { started = true; onUpd(tabId, { status: 'complete' }); }
    }).catch(() => {});
  });
}

// 這個函式會被注入到 Vinted 頁面裡執行，所以必須自給自足、不能用外部變數
function extractVintedInPage() {
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

function watchLabel(w) {
  if (w.category) {
    const cat = CATEGORIES.find(c => c.key === w.category);
    return T`分類：${cat ? tr(cat.name) : w.customCat?.name || w.category}`;
  }
  if (w.multi) return T`素人賣家字詞（全部）`;
  return w.query;
}

// 檢查所有追蹤中的搜尋，有新商品就通知
// 同一時間只跑一次檢查（定時檢查和「立即檢查」撞在一起時共用同一次）
let checking = null;
function checkWatches() {
  if (!checking) checking = runCheck().finally(() => {
    checking = null;
    // 檢查完把隱藏頁面關掉，不要整個瀏覽期間都佔著記憶體
    chrome.offscreen.closeDocument().catch(() => {});
  });
  return checking;
}

async function runCheck() {
  await i18nReady;
  const { watches = [], dealThreshold = 0.3 } = await chrome.storage.local.get(['watches', 'dealThreshold']);
  const startSeeded = Object.fromEntries(watches.map(w => [w.id, JSON.stringify(w.seededNames ?? null)]));
  let found = [];
  for (const w of watches) {
    if (w.paused) continue;
    try {
      let res;
      // 自訂分類：把分類內容（關鍵字）一起傳過去
      if (w.category) res = await browseAll(w.customCat ? { ...w.customCat, key: w.category, custom: true } : w.category, w.sources, { min: w.min, max: w.max });
      else res = await searchMulti(w.multi || [{ query: w.query, sources: w.sources }], { min: w.min, max: w.max }, w.used);
      const { items, errors } = res;
      // 自訂分類的排除字詞可能事後改過，一起套用
      const exclude = [w.exclude, w.customCat?.exclude].filter(Boolean).join(', ');
      const filtered = applyFilters(items, { ...w, exclude, strict: w.category ? false : w.strict });
      // 素人字詞、分類追蹤的結果型號混雜，算行情沒有意義
      const flags = w.multi || w.category ? {} : computeDeals(filtered, dealThreshold).flags;
      const seen = new Set(w.seen || []);
      // 還沒記錄過現有商品的平台（建立追蹤時讀取失敗、或關鍵字剛改過）：這次只記錄，不通知
      const seeded = Array.isArray(w.seededNames) ? new Set(w.seededNames) : null;
      const fresh = filtered
        .filter(it => !seen.has(it.id) && (!seeded || seeded.has(it.source)))
        .map(it => (flags[it.id] ? { ...it, deal: flags[it.id] } : it));
      if (seeded) { items.forEach(it => seeded.add(it.source)); w.seededNames = [...seeded]; }
      // 這次結果裡的商品（包括被過濾掉的）都移到清單最後，裁切舊紀錄時才不會被當成新上架再通知一次
      for (const it of items) { seen.delete(it.id); seen.add(it.id); }
      w.seen = [...seen].slice(-Math.max(1500, items.length + 200));
      w.lastChecked = Date.now();
      w.lastError = errors.join(' / ');
      found.push(...fresh.map(it => ({ ...it, query: watchLabel(w), foundAt: Date.now() })));
    } catch (e) {
      w.lastError = String(e?.message || e);
      w.lastChecked = Date.now();
    }
  }
  // 檢查要花一段時間，期間你可能新增、暫停或刪除了追蹤：重新讀一次，只更新檢查結果，不蓋掉你的修改
  const byId = Object.fromEntries(watches.map(w => [w.id, w]));
  const now = await chrome.storage.local.get(['watches', 'newItems']);
  const latest = (now.watches || []).map(w => {
    const r = byId[w.id];
    if (!r) return w;
    const out = { ...w, seen: r.seen, lastChecked: r.lastChecked, lastError: r.lastError };
    // 檢查期間你改了自訂分類的關鍵字（seededNames 被清空）：保留你的修改，下次重新記錄
    if (JSON.stringify(w.seededNames ?? null) === startSeeded[w.id] && r.seededNames !== undefined) out.seededNames = r.seededNames;
    return out;
  });
  const merged = [...found, ...(now.newItems || [])].slice(0, 300);
  await chrome.storage.local.set({ watches: latest, newItems: merged });
  await updateBadge(merged.filter(i => !i.viewed).length);

  if (found.length) {
    // 低於行情的排前面
    found.sort((a, b) => (b.deal?.kind === 'deal') - (a.deal?.kind === 'deal'));
    const deals = found.filter(i => i.deal?.kind === 'deal');
    const first = found[0];
    const tag = i => (i.deal?.kind === 'deal' ? T`［低於行情 ${i.deal.pct}%］` : '');
    chrome.notifications.create('new-' + Date.now(), {
      type: 'basic',
      iconUrl: 'icon128.png',
      title: found.length === 1
        ? (deals.length ? T`疑似便宜！${first.query}` : T`新上架：${first.query}`)
        : (deals.length ? T`${found.length} 件新上架（${deals.length} 件低於行情）` : T`${found.length} 件新上架`),
      message: found.length === 1
        ? `${tag(first)}${first.title}｜${first.priceLabel}｜${first.source}`
        : found.slice(0, 3).map(i => `${tag(i)}${i.title}（${i.priceLabel}）`).join('\n'),
      priority: deals.length ? 2 : 1,
    });
  }
  return { found: found.length };
}

async function updateBadge(n) {
  await chrome.action.setBadgeBackgroundColor({ color: '#d9480f' });
  await chrome.action.setBadgeText({ text: n ? String(n) : '' });
}

chrome.notifications.onClicked.addListener(id => {
  chrome.notifications.clear(id);
  openPage('#new');
});
