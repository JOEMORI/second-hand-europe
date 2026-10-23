import { applyFilters, computeDeals, CATEGORIES } from './sources.js';
import { T, tr, i18nReady, getLang, setLang } from './i18n.js';
import { checkFavorites } from './favcheck.js';

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

async function browseAll(category, sources, price, q) {
  await ensureOffscreen();
  return chrome.runtime.sendMessage({ target: 'offscreen', type: 'browseAll', category, sources, price, q, lang: getLang() });
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
          // 換成最嚴格的規則：框架只拿 HTML，不載入圖片、樣式、字型、廣告框架。
          // 一頁 Vinted 就有數百 KB 的圖片和樣式，省下來瀏覽器就不會被拖慢。
          { header: 'content-security-policy', operation: 'set', value: "default-src 'none'" },
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
  if (a.name === 'check') Promise.resolve(checkWatches()).catch(() => {}).finally(maybeCheckFavs);
});

// 收藏的商品是否已賣掉或下架：追蹤檢查完之後，順便查一下到期的收藏（每件約 10 小時查一次）
async function maybeCheckFavs() {
  try {
    const { favAutoRemove = true, favCheckedAt = 0 } = await chrome.storage.local.get(['favAutoRemove', 'favCheckedAt']);
    if (!favAutoRemove || Date.now() - favCheckedAt < 3600e3) return;
    await checkFavorites({ limit: 40 });
  } catch (e) { console.warn('favorites check', e); }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'testNotify') {
    testNotify().then(sendResponse).catch(e => sendResponse({ error: String(e?.message || e) }));
    return true;
  }
  if (msg?.type === 'checkNow') {
    checkWatches().then(r => sendResponse(r)).catch(e => sendResponse({ found: 0, error: String(e?.message || e) }));
    return true;
  }
});

// ---------- 舊版留下的最小化 Vinted 視窗 ----------
// v1.3 以前讀不到 Vinted 時會開一個最小化視窗。v1.4 起不再這樣做；
// 如果更新前還留著那個視窗，背景程式啟動時把它關掉。
chrome.storage.session.get('vintedWorker').then(({ vintedWorker }) => {
  if (vintedWorker?.windowId) {
    chrome.windows.remove(vintedWorker.windowId).catch(() => {});
    chrome.storage.session.remove('vintedWorker').catch(() => {});
  }
}).catch(() => {});

function watchLabel(w) {
  if (w.category) {
    const cat = CATEGORIES.find(c => c.key === w.category);
    const name = cat ? tr(cat.name) : w.customCat?.name || w.category;
    return w.catQuery ? T`分類：${name} · ${w.catQuery}` : T`分類：${name}`;
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
      if (w.category) res = await browseAll(w.customCat ? { ...w.customCat, key: w.category, custom: true } : w.category, w.sources, { min: w.min, max: w.max }, w.catQuery);
      else res = await searchMulti(w.multi || [{ query: w.query, sources: w.sources }], { min: w.min, max: w.max }, w.used);
      const { items, errors } = res;
      // 自訂分類的排除字詞可能事後改過，一起套用
      const exclude = [w.exclude, w.customCat?.exclude].filter(Boolean).join(', ');
      // 分類追蹤：有指定關鍵字（在分類裡搜尋）時才檢查標題
      const filtered = applyFilters(items, { ...w, query: w.category ? w.catQuery : w.query, exclude, strict: w.category ? !!w.catQuery && w.strict !== false : w.strict });
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

  const { notifyOn = true, notifySticky = false } = await chrome.storage.local.get(['notifyOn', 'notifySticky']);
  if (found.length && notifyOn) {
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
      requireInteraction: !!notifySticky,
    });
  }
  return { found: found.length };
}

// 測試通知：讓你確認 Mac 有沒有允許 Chrome 跳通知
async function testNotify() {
  await i18nReady;
  const level = await chrome.notifications.getPermissionLevel();
  if (level !== 'granted') return { level };
  const { notifySticky = false } = await chrome.storage.local.get('notifySticky');
  const id = await chrome.notifications.create('test-' + Date.now(), {
    type: 'basic',
    iconUrl: 'icon128.png',
    title: T`測試通知：新上架`,
    message: T`Leica M6｜€ 1.450｜Marktplaats\n有新商品時會像這樣通知你`,
    requireInteraction: !!notifySticky,
  });
  return { level, id };
}

async function updateBadge(n) {
  await chrome.action.setBadgeBackgroundColor({ color: '#d9480f' });
  await chrome.action.setBadgeText({ text: n ? String(n) : '' });
}

chrome.notifications.onClicked.addListener(id => {
  chrome.notifications.clear(id);
  openPage('#new');
});
