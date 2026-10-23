// 檢查收藏的商品是否已經賣掉或下架，下架的自動移出收藏（可以在「最近自動移除」復原）。
// 背景定時檢查（約 12 小時一次）和收藏頁的「立即檢查」都用這裡的程式。
//
// 判斷方式，保守為主，讀不到就當作還在：
//   - 網站回 404 / 410（找不到、已刪除）：確定下架，直接移除
//   - 被轉到別的頁面（例如分類頁）、頁面寫著已售出 / 已結束：可能下架，
//     連續兩次檢查都這樣才移除，避免網站一時出錯就誤刪
//   - 被擋、要驗證、網路錯誤：不判斷，下次再查

const SOFT_RECHECK = 2 * 3600e3;        // 第一次「可能下架」後 2 小時再確認一次
const RECHECK_EVERY = 10 * 3600e3;      // 每件商品約 10 小時查一次
const KEEP_REMOVED = 30 * 86400e3;      // 「最近自動移除」保留 30 天

// 從商品網址取出商品編號，用來判斷轉址後是不是同一件商品
export function listingKey(url) {
  try {
    const u = new URL(url);
    const p = u.pathname;
    const m = p.match(/\/items\/(\d+)/) || p.match(/\/itm\/(?:[^/]+\/)?(\d+)/) || p.match(/\/(m\d{6,})/)
      || p.match(/-(ID\w+)\.html/) || p.match(/(\d{6,})/) || u.search.match(/(?:adId|id)=(\d+)/i);
    return m ? m[1] : null;
  } catch { return null; }
}

// 頁面上明確寫著已售出 / 已結束（各網站的寫法）
const ENDED = [
  /schema\.org\/(SoldOut|Discontinued)"/,                                   // 很多網站的結構化資料
  /Dieses Angebot wurde (vom Verkäufer )?beendet|Diese Auktion (ist|wurde) beendet|This listing (was ended|has ended)|Der Verkäufer hat diesen Artikel beendet/i,   // eBay
  /Die Anzeige ist nicht mehr verfügbar|Diese Anzeige ist (leider )?nicht mehr verfügbar|Anzeige wurde gelöscht/i,   // Kleinanzeigen、willhaben
  /Inzerát (byl smazán|neexistuje|nebyl nalezen)|Inzerát (bol|bol už) (zmazaný|vymazaný)|Inzerát neexistuje/i,   // Bazoš
  /Questo annuncio non è più disponibile|Annuncio (scaduto|rimosso|non più disponibile)/i,   // Subito
  /Deze advertentie is niet (meer )?beschikbaar|Deze advertentie is verwijderd/i,   // Marktplaats、2dehands
];

function endedOnPage(url, html) {
  if (/vinted\./.test(url)) {
    // Vinted 的商品資料裡有一段專門描述這件商品能不能買（用商品編號對到同一段，
    // 不會誤看頁面上其他推薦商品）。賣掉或下架後 can_buy 會變成 false；保留中不算。
    const id = listingKey(url);
    const m = id && html.match(new RegExp('\\{\\\\"can_buy\\\\":(true|false)[^{}]{0,300}?\\\\"item_id\\\\":\\\\"' + id + '\\\\"'));
    if (!m) return false;
    const seg = m[0];
    if (/\\"is_hidden\\":true/.test(seg)) return true;
    return m[1] === 'false' && !/\\"is_reserved\\":true/.test(seg);
  }
  // 結構化資料同時寫著有貨的話，以有貨為準
  if (/schema\.org\/InStock"/.test(html)) return false;
  // 北歐的 DBA、Blocket、Tori 每件都是單一商品，缺貨就是賣掉了
  if (/(dba\.dk|blocket\.se|tori\.fi)\//.test(url) && /schema\.org\/OutOfStock"/.test(html)) return true;
  return ENDED.some(re => re.test(html));
}

const BLOCKED = /captcha-delivery|geo\.captcha|awswaf|challenge-platform|Human Verification|pardon our interruption|Just a moment/i;

// 回傳 'gone'（確定下架）、'soft'（可能下架）、'live'（還在）、'unknown'（讀不到）
export async function listingStatus(url) {
  let res;
  try {
    res = await fetch(url, { credentials: 'include', redirect: 'follow', signal: AbortSignal.timeout(15000) });
  } catch { return 'unknown'; }
  if (res.status === 404 || res.status === 410) return 'gone';
  if (!res.ok) return 'unknown';
  const key = listingKey(url);
  if (res.redirected && key && !res.url.includes(key)) {
    // 被轉到登入、同意或驗證頁，不代表下架
    if (/login|signin|anmelden|inloggen|consent|captcha|challenge|verif/i.test(res.url)) return 'unknown';
    return 'soft';
  }
  let html;
  try { html = await res.text(); } catch { return 'unknown'; }
  if (html.length < 60000 && BLOCKED.test(html)) return 'unknown';
  return endedOnPage(url, html) ? 'soft' : 'live';
}

// 檢查到期的收藏，把下架的移到 favRemoved。
// force：不管多久前查過、也不管自動移除有沒有開，全部重查（收藏頁的「立即檢查」）
export async function checkFavorites({ limit = 40, force = false, onProgress, gap = 700 } = {}) {
  const now = Date.now();
  const { favorites = [], favAutoRemove = true, favCheckLock = 0 } = await chrome.storage.local.get(['favorites', 'favAutoRemove', 'favCheckLock']);
  if (!favAutoRemove && !force) return { checked: 0, removed: [] };
  // 背景和收藏頁不要同時檢查
  if (now - favCheckLock < 10 * 60e3) return { checked: 0, removed: [], busy: true };
  const due = favorites
    .filter(f => f.url && !f.keep && (force || now - (f.checkedAt || 0) > RECHECK_EVERY))
    .sort((a, b) => (a.checkedAt || 0) - (b.checkedAt || 0))
    .slice(0, limit);
  if (!due.length) {
    await chrome.storage.local.set({ favCheckedAt: now });
    return { checked: 0, removed: [] };
  }
  await chrome.storage.local.set({ favCheckLock: now });
  const results = new Map();
  try {
    for (let i = 0; i < due.length; i++) {
      results.set(due[i].id, await listingStatus(due[i].url));
      onProgress?.(i + 1, due.length);
      // 慢慢查，不要一次對網站送一堆請求；寫入儲存區也讓背景程式不會被 Chrome 暫停
      await chrome.storage.local.set({ favCheckLock: Date.now() });
      // Vinted 對連續請求很敏感，間隔拉長到 3 秒，避免你自己的 Vinted 分頁被要求驗證
      const wait = /vinted\./.test(due[i].url) ? Math.max(gap, 3000) : gap;
      if (i < due.length - 1) await new Promise(r => setTimeout(r, wait));
    }
  } finally {
    // 檢查期間你可能新增或移除了收藏：以最新的收藏清單為準
    const { favorites: cur = [], favRemoved = [] } = await chrome.storage.local.get(['favorites', 'favRemoved']);
    const t = Date.now();
    const removed = [], next = [];
    for (const f of cur) {
      const st = results.get(f.id);
      if (!st || f.keep) { next.push(f); continue; }
      if (st === 'unknown') { next.push({ ...f, checkedAt: t }); continue; }
      if (st === 'live') { next.push({ ...f, checkedAt: t, goneHits: 0 }); continue; }
      // 「可能下架」的第二次確認至少要隔 2 小時（連按「立即檢查」不算），避免網站一時出錯就誤刪
      if (st === 'soft' && f.goneHits >= 1 && t - (f.goneAt || 0) < SOFT_RECHECK) { next.push({ ...f, checkedAt: t - RECHECK_EVERY + SOFT_RECHECK }); continue; }
      const hits = st === 'gone' ? 2 : (f.goneHits || 0) + 1;
      if (hits >= 2) removed.push({ ...f, removedAt: t, goneHits: hits });
      else next.push({ ...f, goneHits: hits, goneAt: t, checkedAt: t - RECHECK_EVERY + SOFT_RECHECK });
    }
    const keptRemoved = [...removed, ...favRemoved].filter(x => t - (x.removedAt || 0) < KEEP_REMOVED).slice(0, 100);
    await chrome.storage.local.set({ favorites: next, favRemoved: keptRemoved, favCheckedAt: t, favCheckLock: 0 });
    checkFavorites.last = { checked: results.size, removed };
  }
  return checkFavorites.last;
}

// 復原：放回收藏，之後不再自動移除這一件
export async function restoreFavorite(id) {
  const { favorites = [], favRemoved = [] } = await chrome.storage.local.get(['favorites', 'favRemoved']);
  const it = favRemoved.find(x => x.id === id);
  if (!it) return;
  const { removedAt, goneHits, goneAt, ...rest } = it;
  await chrome.storage.local.set({
    favorites: favorites.some(f => f.id === id) ? favorites : [{ ...rest, keep: true }, ...favorites],
    favRemoved: favRemoved.filter(x => x.id !== id),
  });
}
