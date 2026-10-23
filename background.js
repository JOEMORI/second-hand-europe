import { applyFilters, computeDeals, CATEGORIES, SOURCES } from './sources.js';
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

  await notifyNew(found);
  return { found: found.length };
}

// ---------- 系統通知 ----------
// Mac 的通知只顯示標題、一段文字、一行小字和一張小圖，所以：
//   每件一則（預設）：最多 3 件各一則（標題是價格和平台，內文是商品名稱，小圖是商品照片，點了打開商品頁），
//                    其餘併成一則彙總（點了打開「新上架」）
//   只要一則彙總：全部併成一則
const MAX_ITEM_NOTES = 3;
const srcOf = name => Object.values(SOURCES).find(s => s.name === name);

// 標題：€ 289（DKK 2.150）· DBA DK
function itemTitle(it) {
  const s = srcOf(it.source);
  const where = s && s.cc !== 'EU' ? `${it.source} ${s.cc}` : it.source;
  const price = it.priceLabel ? it.priceLabel + (it.localLabel ? `（${it.localLabel}）` : '') : '';
  return [price, where].filter(Boolean).join(' · ');
}
const dealTag = it => (it.deal?.kind === 'deal' ? T`低於行情 ${it.deal.pct}%` : '');
// 彙總內文：Leica M6 ×12 · 分類：底片相機 ×41
function countByWatch(items) {
  const n = new Map();
  for (const it of items) n.set(it.query, (n.get(it.query) || 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([q, c]) => `${q} ×${c}`).join(' · ');
}

// 建立通知；商品照片讀不到時（網站擋、網址失效）改用插件圖示
async function createNote(id, opts, image) {
  if (image && /^https:\/\//.test(image)) {
    try { return await chrome.notifications.create(id, { ...opts, iconUrl: image }); } catch {}
  }
  return chrome.notifications.create(id, { ...opts, iconUrl: 'icon128.png' });
}

// 點通知要打開的商品頁：背景程式隨時可能被 Chrome 暫停，所以存在 session 儲存區
async function rememberUrl(id, url) {
  const { noteUrls = {} } = await chrome.storage.session.get('noteUrls');
  const keep = Object.entries(noteUrls).slice(-30);
  await chrome.storage.session.set({ noteUrls: Object.fromEntries([...keep, [id, url]]) });
}

async function notifyNew(found) {
  const { notifyOn = true, notifySticky = false, notifyMode = 'each', notifyDealsOnly = false } =
    await chrome.storage.local.get(['notifyOn', 'notifySticky', 'notifyMode', 'notifyDealsOnly']);
  if (!notifyOn || !found.length) return;
  // 低於行情的排前面，其他照上架時間
  let list = [...found].sort((a, b) => (b.deal?.kind === 'deal') - (a.deal?.kind === 'deal') || (b.ts || 0) - (a.ts || 0));
  if (notifyDealsOnly) list = list.filter(i => i.deal?.kind === 'deal');
  if (!list.length) return;
  const base = { type: 'basic', requireInteraction: !!notifySticky };
  const stamp = Date.now();
  const each = notifyMode !== 'summary' || list.length === 1;
  const shown = each ? list.slice(0, MAX_ITEM_NOTES) : [];
  const rest = list.length - shown.length;
  // 先建彙總、再從第 3 件建到第 1 件：通知中心最新的在最上面，第 1 件會在最上面
  if (rest > 0) {
    const deals = list.filter(i => i.deal?.kind === 'deal').length;
    const title = shown.length
      ? T`還有 ${rest} 件新上架`
      : (deals ? T`${list.length} 件新上架（${deals} 件低於行情）` : T`${list.length} 件新上架`);
    await createNote(`new-${stamp}`, {
      ...base,
      title,
      message: countByWatch(shown.length ? list.slice(shown.length) : list),
      contextMessage: T`點這裡打開「新上架」`,
      priority: deals && !shown.length ? 2 : 0,
    }).catch(e => console.warn('notify', e));
  }
  for (let i = shown.length - 1; i >= 0; i--) {
    const it = shown[i];
    const id = `item-${stamp}-${i}`;
    if (it.url) await rememberUrl(id, it.url).catch(() => {});
    await createNote(id, {
      ...base,
      title: itemTitle(it) || T`新上架`,
      message: it.title || '',
      contextMessage: [T`追蹤：${it.query}`, dealTag(it)].filter(Boolean).join(' · '),
      priority: it.deal?.kind === 'deal' ? 2 : 1,
    }, it.image).catch(e => console.warn('notify', e));
  }
}

// 測試通知：讓你確認 Mac 有沒有允許 Chrome 跳通知
async function testNotify() {
  await i18nReady;
  const level = await chrome.notifications.getPermissionLevel();
  if (level !== 'granted') return { level };
  const { notifySticky = false } = await chrome.storage.local.get('notifySticky');
  // 跟真正的新上架通知長得一樣（只是用插件圖示代替商品照片）
  const id = await chrome.notifications.create('test-' + Date.now(), {
    type: 'basic',
    iconUrl: 'icon128.png',
    title: T`€ 1.450 · Marktplaats NL`,
    message: T`測試通知：Leica M6 0.72 black chrome`,
    contextMessage: T`有新商品時會像這樣通知你，點通知會打開商品頁`,
    requireInteraction: !!notifySticky,
  });
  return { level, id };
}

async function updateBadge(n) {
  await chrome.action.setBadgeBackgroundColor({ color: '#d9480f' });
  await chrome.action.setBadgeText({ text: n ? String(n) : '' });
}

// 點單件商品的通知：打開商品頁；點彙總或舊的通知：打開「新上架」
chrome.notifications.onClicked.addListener(async id => {
  chrome.notifications.clear(id);
  const { noteUrls = {} } = await chrome.storage.session.get('noteUrls').catch(() => ({}));
  const url = noteUrls[id];
  if (url && /^https?:\/\//.test(url)) {
    const win = await chrome.windows.getLastFocused().catch(() => null);
    await chrome.tabs.create({ url, ...(win?.id ? { windowId: win.id } : {}) }).catch(() => openPage('#new'));
    if (win?.id) chrome.windows.update(win.id, { focused: true }).catch(() => {});
  } else {
    openPage('#new');
  }
});
