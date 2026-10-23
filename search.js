// 英文介面：等翻譯完才顯示畫面，避免先閃一下中文（最多等 1.5 秒）
setTimeout(() => document.documentElement.classList.remove('i18n-pending'), 1500);
import {
  searchAll, searchMulti, browseAll, applyFilters, computeDeals, computeBrowseFlags, sortNewest, cmpPrice, fmt,
  LINK_SITES, SOURCES, DEFAULT_SOURCES, CATEGORIES,
  REGIONS, regionOf, countryRank, countryName, catSources, taskSource, catHow, parseWords, checkBids,
} from './sources.js';
import { T, tr, i18nReady, translateDom, locale, getLang, relTime } from './i18n.js';
import { checkFavorites, restoreFavorite } from './favcheck.js';

const $ = id => document.getElementById(id);
const store = chrome.storage.local;

const state = {
  rawItems: [],         // 搜尋結果（未過濾）
  items: [],            // 目前搜尋結果（已過濾）
  progress: {},         // 各平台狀態
  paging: {},           // 各平台下一頁：{ next, done }
  query: null,          // 這次搜尋的條件（載入更多、改價格時重用）
  loadingMore: false,
  onlySource: null,     // 只看某個平台
  onlyDeals: false,     // 只看疑似便宜
  naive: false,         // 目前是不是素人字詞搜尋
  deals: { median: null, n: 0, flags: {} },
  threshold: 0.3,
  selected: [...DEFAULT_SOURCES],
  favIds: new Set(),
  customCats: [],       // 使用者自訂的分類
  gen: 0,
};

// ---------- 小工具 ----------
function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : String(c));
  return e;
}

function icon(name, cls = 'ico') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', cls);
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#i-' + name);
  svg.append(use);
  return svg;
}

const sourceKeyByName = name => Object.keys(SOURCES).find(k => SOURCES[k].name === name);
const colorOf = name => SOURCES[sourceKeyByName(name)]?.color || '#888';
const eurRound = n => '€ ' + Math.round(n).toLocaleString(getLang() === 'en' ? 'en-GB' : 'nl-NL');
const skeletons = n => Array.from({ length: n }, () => el('div', { class: 'card skeleton' }, el('div', { class: 'img' }), el('div', { class: 'body' }, el('i'), el('i'), el('i'))));

function flash(node, msg) {
  const tip = el('span', { class: 'flash' }, msg);
  node.after(tip);
  setTimeout(() => tip.remove(), 2000);
}

// ---------- 分頁 ----------
function showTab(name) {
  if (typeof hidePreview === 'function') hidePreview();
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  ['results', 'browse', 'new', 'favs', 'watches'].forEach(t => { $('tab-' + t).hidden = t !== name; });
  // 分類瀏覽有自己的價格列，側欄的價格只用在搜尋結果
  $('sidePrice').hidden = name === 'browse';
  window.scrollTo({ top: 0 });
  if (name === 'new') renderNew(true);
  if (name === 'favs') { renderFavs(); maybeCheckFavs(); }
  if (name === 'watches') renderWatches();
  // 在別的分頁改了價格或 eBay 設定：回到搜尋結果時才重新搜尋
  if (name === 'results' && state.stale) { state.stale = false; refreshSearch(); }
  if (name === 'browse' && bState.stale && bState.cat) { bState.stale = false; startBrowse(bState.cat); }
}
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

// ---------- 平台選擇 ----------
// 依地區分組，可以收合；有勾選平台的地區預設展開
let openRegions;
try { openRegions = new Set(JSON.parse(localStorage.getItem('openRegions') || 'null') || ['multi', 'near']); }
catch { openRegions = new Set(['multi', 'near']); }

const ccBadge = cc => el('span', { class: 'cc', title: countryName(cc) }, cc);

function renderSourcePills() {
  const box = $('sourcePills');
  const groups = REGIONS.map(r => ({
    r,
    keys: Object.keys(SOURCES).filter(k => regionOf(k) === r.key).sort((a, b) => countryRank(SOURCES[a].cc) - countryRank(SOURCES[b].cc)),
  })).filter(g => g.keys.length);
  box.replaceChildren(...groups.map(({ r, keys }) => {
    const nOn = keys.filter(k => state.selected.includes(k)).length;
    const open = openRegions.has(r.key);
    const toggle = () => {
      open ? openRegions.delete(r.key) : openRegions.add(r.key);
      try { localStorage.setItem('openRegions', JSON.stringify([...openRegions])); } catch {}
      renderSourcePills();
    };
    // 一鍵全選 / 清除這個地區的平台
    const setAll = on => {
      state.selected = on ? [...new Set([...state.selected, ...keys])] : state.selected.filter(x => !keys.includes(x));
      store.set({ selectedSources: state.selected });
      renderSourcePills();
      $('sourcePills').querySelector(`.src-all[data-region="${r.key}"]`)?.focus();
    };
    const allOn = nOn === keys.length;
    return el('div', { class: 'src-group' + (open ? ' open' : '') },
      el('div', { class: 'src-headrow' },
        el('button', { type: 'button', class: 'src-head', 'data-region': r.key, 'aria-expanded': open ? 'true' : 'false', onclick: () => { toggle(); $('sourcePills').querySelector(`.src-head[data-region="${r.key}"]`)?.focus(); } },
          el('span', { class: 'caret' }), el('span', {}, tr(r.name)),
          el('span', { class: 'src-ccs' }, [...new Set(keys.map(k => SOURCES[k].cc))].filter(c => r.key !== 'multi').join(' ')),
          nOn ? el('b', { class: 'src-n' }, String(nOn)) : null),
        el('button', {
          type: 'button', class: 'src-all', 'data-region': r.key,
          title: allOn ? T`取消勾選這個地區的所有平台` : T`勾選這個地區的所有平台`,
          onclick: () => setAll(!allOn),
        }, allOn ? T`清除` : T`全選`)),
      open ? el('div', { class: 'pills' }, keys.map(k => {
        const s = SOURCES[k];
        const on = state.selected.includes(k);
        return el('button', {
          type: 'button',
          'data-key': k,
          class: 'pill' + (on ? ' on' : ''),
          style: `--c:${s.color}`,
          title: `${countryName(s.cc)} · ${on ? T`點一下取消` : T`點一下加入`}`,
          onclick: () => {
            state.selected = on ? state.selected.filter(x => x !== k) : [...state.selected, k];
            store.set({ selectedSources: state.selected });
            renderSourcePills();
            // 重畫後把鍵盤焦點放回同一個平台
            $('sourcePills').querySelector(`.pill[data-key="${k}"]`)?.focus();
          },
        }, el('span', { class: 'dot' }), ccBadge(s.cc), el('span', { class: 'pname' }, s.name), s.cur !== 'EUR' ? el('small', { title: T`價格依匯率換算成歐元` }, s.cur) : null);
      })) : null,
    );
  }));
}

// ---------- 表單 ----------
function formValues() {
  return {
    query: $('q').value.trim(),
    min: $('min').value.trim(),
    max: $('max').value.trim(),
    exclude: $('exclude').value.trim(),
    strict: $('strict').checked,
    used: $('usedOnly').checked,
    shipOnly: $('shipOnly').checked,
    sources: [...state.selected],
    cat: $('qCat').value || '',
  };
}

function fillForm(v) {
  $('q').value = v.query || '';
  $('min').value = v.min || '';
  $('max').value = v.max || '';
  $('exclude').value = v.exclude || '';
  $('strict').checked = v.strict !== false;
  $('qCat').value = v.cat && findCat(v.cat) ? v.cat : '';
  $('qCat').classList.toggle('on', !!$('qCat').value);
  if (v.sources?.length) {
    state.selected = v.sources.filter(k => SOURCES[k]);
    renderSourcePills();
  }
  renderPricePresets();
}

$('form').addEventListener('submit', e => { e.preventDefault(); runSearch(); });
$('sort').addEventListener('change', renderResults);

const priceOf = v => ({ min: v.min, max: v.max });

// override：素人字詞搜尋時傳入 { multi: [...] } 或 { query, sources, naive }，否則用表單內容
// stay：true 表示在背景重新搜尋，不切換分頁
async function runSearch(override, { stay = false } = {}) {
  const v = { ...formValues(), ...(override || {}) };
  const subs = v.multi || [{ query: v.query, sources: v.sources }];
  if (!v.multi && !v.query) return;
  if (!v.multi && !v.sources.length) { flash($('sourcePills'), T`請至少選一個平台`); return; }
  // 選了分類：只在這個分類裡搜尋（用分類瀏覽的方式，各平台在對應分類裡找這個關鍵字）
  const cat = !v.multi && v.cat ? findCat(v.cat) : null;
  if (cat && !catSources(cat, v.sources).length) { flash($('qCat'), T`勾選的平台都沒有這個分類`); return; }
  const gen = ++state.gen;
  state.stale = false;
  // 快捷或追蹤帶入的價格：記下來，之後改價格時才會正確判斷「價格有沒有變」
  // （搜尋和分類瀏覽的價格各自獨立，這裡不影響分類瀏覽）
  if (!v.multi) state.lastPriceKey = `${v.min || ''}|${v.max || ''}`;
  // 上一次的「載入更多」還在跑也不管它，新的搜尋重新開始
  state.loadingMore = false;
  $('moreLoading').hidden = true;
  delete $('more').dataset.autoAt;
  if (!stay) showTab('results');
  renderLinks(v.multi ? '' : v.query);
  state.query = { v, override };
  state.rawItems = [];
  state.items = [];
  state.paging = {};
  state.onlySource = null;
  state.onlyDeals = false;
  state.naive = !!v.naive;
  const allSources = cat ? catSources(cat, v.sources) : [...new Set(subs.flatMap(s => s.sources))];
  state.progress = Object.fromEntries(allSources.map(k => [k, { status: 'loading', count: 0 }]));
  renderStatus();
  $('emptyResults').hidden = true;
  $('more').hidden = true;
  $('results').replaceChildren(...skeletons(10));

  const onProgress = (k, p) => {
    if (state.gen !== gen) return;
    state.progress[k] = p;
    renderStatus();
  };
  // isStale：你已經開始了新的搜尋時，舊的這次就不用再讀了（不開框架、不開視窗）
  const opts = { price: priceOf(v), used: v.used, isStale: () => state.gen !== gen };
  let res;
  if (v.multi) res = await searchMulti(subs, onProgress, opts);
  else if (cat) res = await browseAll(cat, v.sources, onProgress, { ...opts, q: v.query });
  else res = await searchAll(v.query, v.sources, onProgress, opts);
  if (state.gen !== gen) return;
  state.rawItems = res.items;
  state.paging = v.multi ? {} : (res.paging || {});
  applySearchFilters();
  refreshBids(gen);
  if (!override) { try { localStorage.setItem('lastForm', JSON.stringify(v)); } catch {} }
}

function applySearchFilters() {
  if (!state.query) return;
  const v = { ...state.query.v, ...formFiltersNow() };
  state.items = applyFilters(state.rawItems, v);
  renderResults();
}

// 用同一組條件重新搜尋（價格、eBay 設定改了時），不切換分頁。
// 用的是上次搜尋的關鍵字，不是搜尋框裡還沒送出的文字。
function refreshSearch() {
  if (!state.query) return;
  const { v, override } = state.query;
  runSearch(override || { query: v.query, sources: v.sources, strict: v.strict, cat: v.cat }, { stay: true });
}
// 搜尋結果分頁正在顯示就馬上重搜，否則等回到該分頁再搜
function refreshSearchWhenVisible() {
  if ($('tab-results').hidden) state.stale = true;
  else refreshSearch();
}

// 不需要重新抓資料、只要重新篩選的條件
function formFiltersNow() {
  return { min: $('min').value.trim(), max: $('max').value.trim(), exclude: $('exclude').value.trim(), shipOnly: $('shipOnly').checked };
}

async function loadMoreResults() {
  if (!state.query || state.loadingMore) return;
  const { v } = state.query;
  const keys = Object.entries(state.paging).filter(([, p]) => !p.done).map(([k]) => k);
  if (!keys.length) return;
  state.loadingMore = true;
  const gen = state.gen;
  [...new Set(keys.map(taskSource))].forEach(k => { state.progress[k] = { ...state.progress[k], status: 'loading' }; });
  renderStatus();
  $('more').hidden = true;
  $('moreLoading').hidden = false;
  const start = Object.fromEntries(keys.map(k => [k, state.paging[k].next]));
  const onP = (k, p) => {
    if (state.gen !== gen) return;
    state.progress[k] = { ...p, status: p.status };
    renderStatus();
  };
  const mopts = { price: priceOf({ ...v, ...formFiltersNow() }), used: v.used, start, isStale: () => state.gen !== gen };
  const cat = v.cat ? findCat(v.cat) : null;
  const res = cat
    ? await browseAll(cat, [...new Set(keys.map(taskSource))], onP, { ...mopts, q: v.query })
    : await searchAll(v.query, keys, onP, mopts);
  if (state.gen !== gen) return; // 期間開始了新的搜尋：不要動新搜尋的狀態
  state.loadingMore = false;
  $('moreLoading').hidden = true;
  const seen = new Set(state.rawItems.map(i => i.id));
  state.rawItems.push(...res.items.filter(i => !seen.has(i.id)));
  Object.assign(state.paging, res.paging);
  applySearchFilters();
  refreshBids(gen);
}

// Marktplaats / 2dehands 的「出價」商品：到商品頁讀最低出價、最高出價，讀到就更新畫面
function refreshBids(gen) {
  checkBids(state.rawItems, () => { if (state.gen === gen) applySearchFilters(); }, 40, () => state.gen !== gen);
}
$('more').addEventListener('click', loadMoreResults);

function renderLinks(q) {
  const box = $('links');
  box.replaceChildren();
  if (!q) return;
  box.append(el('span', {}, T`其他平台（開新分頁）：`));
  for (const s of [...LINK_SITES].sort((a, b) => countryRank(a.cc) - countryRank(b.cc))) {
    box.append(el('a', { href: s.url(q), target: '_blank', rel: 'noopener', title: countryName(s.cc) }, ccBadge(s.cc), s.name, icon('ext', 'ico tiny')));
  }
}

function statusChips(progress, items, onlySource, onPick) {
  const counts = {};
  items.forEach(i => { counts[i.source] = (counts[i.source] || 0) + 1; });
  // 還有平台在讀取時，結果還沒合併，先顯示各平台抓到的件數
  const anyLoading = Object.values(progress).some(p => p.status === 'loading');
  return Object.entries(progress).map(([k, p]) => {
    const s = SOURCES[k];
    let text;
    if (p.status === 'loading') text = T`讀取中…`;
    else if (p.status === 'error') text = T`失敗`;
    else text = String(anyLoading && !items.length ? (p.count ?? 0) : (counts[s.name] ?? 0));
    const active = onlySource === s.name;
    return el('button', {
      type: 'button',
      class: `chip status-${p.status}${active ? ' active' : ''}`,
      style: `--c:${s.color}`,
      title: p.status === 'error' ? p.error : (active ? T`顯示全部` : T`只看 ${s.name}`),
      onclick: () => { if (p.status === 'loading') return; onPick(active ? null : s.name); },
    }, el('span', { class: 'dot' }), s.name, el('b', {}, text));
  });
}

// 失敗的平台：只顯示一行摘要，點一下才展開原因
function renderErrors(progress, box) {
  const errs = Object.entries(progress).filter(([, p]) => p.status === 'error');
  box.hidden = !errs.length;
  if (!errs.length) { box.replaceChildren(); return; }
  const open = box.dataset.open === '1';
  const names = errs.map(([k]) => SOURCES[k].name).join(getLang() === 'en' ? ', ' : '、');
  // 原因裡提到的網站（例如 vatera.hu）做成可以點的連結，點了在新分頁打開
  const linkify = text => text.split(/((?:www\.)?(?:vatera\.hu|vinted\.nl|ebay\.de))/).map((part, i) =>
    i % 2 ? el('a', { href: 'https://' + (part.startsWith('www.') ? part : 'www.' + part) + '/', target: '_blank', rel: 'noopener' }, part) : part);
  box.replaceChildren(
    el('button', { type: 'button', class: 'err-sum', onclick: () => { box.dataset.open = open ? '' : '1'; renderErrors(progress, box); } },
      el('span', { class: 'err-dot' }), T`${names} 讀取失敗`, el('span', { class: 'err-more' }, open ? T`收起` : T`看原因`)),
    ...(open ? [el('div', { class: 'errors' }, errs.map(([k, p]) => el('div', {}, linkify(T`${SOURCES[k].name}：${p.error}`))))] : []),
  );
}

function renderStatus() {
  $('status').replaceChildren(...statusChips(state.progress, state.items, state.onlySource, name => { state.onlySource = name; renderResults(); }));
  const extra = $('statusExtra');
  extra.replaceChildren();

  // 行情資訊與「只看疑似便宜」
  const done = Object.values(state.progress).every(p => p.status !== 'loading');
  if (done && state.items.length) {
    if (state.naive) {
      extra.append(el('span', { class: 'market' }, T`素人字詞搜尋：只標示素人線索`));
    } else if (state.threshold && state.deals.median != null) {
      const nDeals = Object.values(state.deals.flags).filter(f => f.kind === 'deal').length;
      extra.append(
        el('span', { class: 'market first', title: T`根據 ${state.deals.n} 件有標價、非拍賣、非故障的商品計算，有運費或手續費資料的用總價` },
          T`行情中位數 ${eurRound(state.deals.median)}`),
        el('button', {
          type: 'button',
          class: 'chip deal-toggle' + (state.onlyDeals ? ' active' : ''),
          disabled: !nDeals,
          onclick: () => { state.onlyDeals = !state.onlyDeals; renderResults(); },
        }, T`只看疑似便宜`, el('b', {}, String(nDeals))),
      );
    } else if (state.threshold) {
      extra.append(el('span', { class: 'market' }, T`有標價的商品太少，無法估算行情`));
    }
  }
  extra.hidden = !extra.childNodes.length;
  renderErrors(state.progress, $('statusErr'));
}

function sortItems(items, mode, flags = {}) {
  const arr = [...items];
  if (mode === 'deal') {
    const pct = i => (flags[i.id]?.kind === 'deal' ? flags[i.id].pct : -1);
    return sortNewest(arr).sort((a, b) => pct(b) - pct(a));
  }
  if (mode === 'asc' || mode === 'desc') {
    const dir = mode === 'asc' ? 1 : -1;
    return arr.sort((a, b) => {
      const pa = cmpPrice(a), pb = cmpPrice(b);
      if (pa == null) return 1;
      if (pb == null) return -1;
      return (pa - pb) * dir;
    });
  }
  return sortNewest(arr);
}

function renderResults() {
  // 行情以「目前所有平台的結果」計算，不受「只看某平台」影響。
  // 素人字詞搜尋型號混雜，改用分類瀏覽的標示方式（素人線索）
  state.deals = state.naive
    ? { median: null, n: 0, flags: computeBrowseFlags(state.items).flags }
    : computeDeals(state.items, state.threshold);
  renderStatus();
  let items = sortItems(state.items, $('sort').value, state.deals.flags);
  if (state.onlySource) items = items.filter(i => i.source === state.onlySource);
  if (state.onlyDeals) items = items.filter(i => state.deals.flags[i.id]?.kind === 'deal');
  $('results').replaceChildren(...items.map(it => card(it, { flag: state.deals.flags[it.id], matched: state.naive ? it.matchedQuery : null })));
  const done = Object.values(state.progress).every(p => p.status !== 'loading');
  $('emptyResults').hidden = items.length > 0 || !done;
  if (!items.length && done && Object.keys(state.progress).length) {
    $('emptyResults').replaceChildren(el('p', {}, T`沒有符合的結果`), el('p', { class: 'sub' }, T`試試放寬價格、減少排除字詞，或取消「標題須含關鍵字」。`));
  }
  const more = Object.values(state.paging).some(p => !p.done);
  $('more').hidden = !more || !done || state.loadingMore;
}

function card(it, opts = {}) {
  const fav = state.favIds.has(it.id);
  const star = el('button', {
    type: 'button',
    class: 'star' + (fav ? ' on' : ''),
    title: fav ? T`取消收藏` : T`加入收藏`,
    onclick: e => { e.preventDefault(); e.stopPropagation(); toggleFav(it); },
  }, icon(fav ? 'star' : 'star-o'));

  const flag = opts.flag || it.deal;
  let badge = null;
  if (flag?.kind === 'deal') badge = el('span', { class: 'badge-deal', title: T`比這次搜尋結果的中位數價格便宜` }, T`低於行情 ${flag.pct}%`);
  else if (flag?.kind === 'naive') badge = el('span', { class: 'badge-naive', title: T`標題用了「${flag.word}」這類不懂行情的賣家常用的字` }, T`素人用語`);
  else if (flag?.kind === 'nobrand') badge = el('span', { class: 'badge-soft', title: T`標題沒寫品牌，可能是賣家不清楚自己在賣什麼，值得點進去看照片` }, T`未寫品牌`);
  else if (flag?.kind === 'odd') badge = el('span', { class: 'badge-muted', title: T`比行情便宜太多，多半是配件或說明書` }, T`異常低價`);
  else if (flag?.kind === 'parts') badge = el('span', { class: 'badge-muted', title: T`標題提到故障或零件` }, T`故障 / 零件`);

  const meta = [it.location, it.dateLabel].filter(Boolean).join(' · ');
  const node = el('a', { class: 'card' + (flag?.kind === 'deal' ? ' is-deal' : ''), href: it.url, target: '_blank', rel: 'noopener' },
    el('div', { class: 'img' },
      it.image ? el('img', { src: it.image, loading: 'lazy', alt: '', referrerpolicy: 'no-referrer' }) : null,
      el('span', { class: 'tag', style: `--c:${colorOf(it.source)}` }, el('i'), it.source),
      star,
      badge,
    ),
    el('div', { class: 'body' },
      el('div', { class: 'price' }, it.priceLabel),
      it.total != null ? el('div', { class: 'total', title: it.totalNote || '' }, T`總價約 € ${fmt(it.total)}`) : null,
      it.localLabel ? el('div', { class: 'total', title: T`依歐洲央行匯率換算` }, T`當地價格 ${it.localLabel}`) : null,
      el('div', { class: 'title' }, it.title),
      // 列表模式才顯示：平台名稱和標示放在文字列
      el('div', { class: 'list-tags' },
        el('span', { class: 'src-inline', style: `--c:${colorOf(it.source)}` }, it.source),
        badge ? badge.cloneNode(true) : null,
        meta ? el('span', { class: 'li-meta' }, meta) : null,
        it.extra ? el('span', { class: 'li-meta' + (it.shipping === 'no' ? ' pickup' : '') }, it.extra) : null,
      ),
      meta ? el('div', { class: 'meta' }, meta) : null,
      it.extra ? el('div', { class: 'meta extra' + (it.shipping === 'no' ? ' pickup' : '') }, it.extra) : null,
      opts.matched ? el('div', { class: 'meta q' }, T`字詞：${opts.matched}`) : null,
      opts.query ? el('div', { class: 'meta q' }, T`追蹤：${opts.query}`) : null,
      opts.note ? el('div', { class: 'note-line' }, T`備註：${opts.note}`) : null,
    ),
    // 列表模式的欄位：平台、價格、上架時間
    listSite(it),
    el('div', { class: 'lc-price' },
      el('b', {}, it.priceLabel),
      it.total != null ? el('small', { title: it.totalNote || '' }, T`總價約 € ${fmt(it.total)}`) : null,
      it.localLabel ? el('small', {}, T`當地價格 ${it.localLabel}`) : null),
    listDate(it),
  );
  cardData.set(node, { it, badge });
  return node;
}

const srcByName = name => Object.values(SOURCES).find(s => s.name === name);
function listSite(it) {
  const s = srcByName(it.source);
  return el('div', { class: 'lc-site' }, s ? ccBadge(s.cc) : null, el('span', {}, it.source));
}
function listDate(it) {
  if (it.ts) {
    return el('div', { class: 'lc-date' },
      el('span', {}, new Date(it.ts).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' })),
      el('small', {}, relTime(it.ts)));
  }
  return el('div', { class: 'lc-date' }, el('span', {}, it.dateLabel || '–'));
}

// ---------- 檢視方式：格狀 / 列表（每個列出商品的分頁都可以切換） ----------
const cardData = new WeakMap();
const VIEW_LISTS = ['results', 'bResults', 'newList'];
// 列表模式上方的欄位標題；點價格、上架時間可以排序
const LIST_HEADS = { results: 'sort', bResults: 'bSort', newList: null, favList: 'favSort' };

function listHead(id) {
  const sortSel = LIST_HEADS[id] ? $(LIST_HEADS[id]) : null;
  const mode = sortSel?.value;
  const sortBtn = (label, cls, next, isOn, arrow) => sortSel
    ? el('button', { type: 'button', class: cls + (isOn ? ' on' : ''), onclick: () => { sortSel.value = next; sortSel.dispatchEvent(new Event('change')); } },
      label, isOn ? el('span', { class: 'arrow' }, arrow) : null)
    : el('span', { class: cls }, label);
  const priceNext = mode === 'asc' ? 'desc' : 'asc';
  const dateMode = id === 'favList' ? 'time' : 'new';
  return [
    el('span', {}, T`商品`), el('span', {}, ''),
    el('span', {}, T`平台`),
    sortBtn(T`價格`, 'lh-price', priceNext, mode === 'asc' || mode === 'desc', mode === 'asc' ? '▲' : '▼'),
    sortBtn(id === 'favList' ? T`收藏時間` : T`上架時間`, 'lh-date', dateMode, mode === dateMode, '▼'),
  ];
}
function renderListHeads() {
  for (const id of [...VIEW_LISTS, 'favList']) {
    const list = $(id);
    let head = list.previousElementSibling;
    if (!head?.classList.contains('list-head')) { head = el('div', { class: 'list-head', role: 'presentation' }); list.before(head); }
    const show = state.view === 'list' && list.classList.contains('list') && list.childElementCount > 0 && !list.querySelector('.empty');
    head.classList.toggle('show', show);
    if (show) {
      const cells = listHead(id);
      // 第一欄（圖片）和第二欄（標題）合併成「商品」
      head.replaceChildren(cells[0], cells[2], cells[3], cells[4]);
      head.firstChild.style.gridColumn = '1 / 3';
    }
  }
}

function applyView(view) {
  state.view = view;
  VIEW_LISTS.forEach(id => $(id).classList.toggle('list', view === 'list'));
  document.querySelectorAll('.viewtoggle:not([data-scope]) button').forEach(b => b.classList.toggle('on', b.dataset.view === view));
  renderListHeads();
}
document.querySelectorAll('.viewtoggle:not([data-scope]) button').forEach(b => b.addEventListener('click', () => {
  applyView(b.dataset.view);
  store.set({ viewMode: b.dataset.view });
}));
// 收藏有自己的檢視設定，預設列表（可以直接寫備註）
function applyFavView(view) {
  state.favView = view;
  document.querySelectorAll('.viewtoggle[data-scope=favs] button').forEach(b => b.classList.toggle('on', b.dataset.view === view));
}
document.querySelectorAll('.viewtoggle[data-scope=favs] button').forEach(b => b.addEventListener('click', () => {
  applyFavView(b.dataset.view);
  store.set({ favView: b.dataset.view });
  renderFavs();
}));
// 清單內容變了（重新搜尋、載入更多）就更新欄位標題
for (const id of [...VIEW_LISTS, 'favList']) new MutationObserver(() => renderListHeads()).observe($(id), { childList: true });
['sort', 'bSort', 'favSort'].forEach(id => $(id).addEventListener('change', renderListHeads));

// ---------- 往下捲到底自動載入更多 ----------
// 「載入更多」按鈕出現在畫面上時自動按下去，不用一直點
const autoMore = new IntersectionObserver(entries => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    const btn = e.target.querySelector('button');
    if (!btn || btn.hidden || btn.disabled || e.target.closest('section').hidden) continue;
    // 上一次自動載入沒有多出任何商品（例如平台讀取失敗）：不要一直自動重試，改成你自己按
    const list = e.target.previousElementSibling?.classList.contains('grid') ? e.target.previousElementSibling : e.target.parentElement.querySelector('.grid');
    const n = String(list?.childElementCount ?? 0);
    if (btn.dataset.autoAt === n) continue;
    btn.dataset.autoAt = n;
    btn.click();
  }
}, { rootMargin: '0px 0px 600px 0px' });
['more', 'bMore'].forEach(id => autoMore.observe($(id).parentElement));
// 按鈕從隱藏變成顯示時，如果已經在畫面上，IntersectionObserver 不會再通知：重新觀察一次
for (const id of ['more', 'bMore']) {
  new MutationObserver(() => {
    if (!$(id).hidden) { autoMore.unobserve($(id).parentElement); autoMore.observe($(id).parentElement); }
  }).observe($(id), { attributes: true, attributeFilter: ['hidden'] });
}

// ---------- 滑過預覽 ----------
const preview = $('preview');
let pvTimer = null, pvCard = null;

function showPreview(cardEl) {
  const data = cardData.get(cardEl);
  if (!data) return;
  const { it, badge } = data;
  const meta = [it.location, it.dateLabel].filter(Boolean).join(' · ');
  preview.replaceChildren(
    el('div', { class: 'pv-img' },
      it.imageLarge || it.image ? el('img', { src: it.imageLarge || it.image, alt: '', referrerpolicy: 'no-referrer' }) : null,
      badge ? badge.cloneNode(true) : null,
    ),
    el('div', { class: 'pv-body' },
      el('div', { class: 'pv-head' },
        el('span', { class: 'src-inline', style: `--c:${colorOf(it.source)}` }, it.source),
        meta ? el('span', { class: 'meta' }, meta) : null,
      ),
      el('div', { class: 'pv-title' }, it.title),
      el('div', { class: 'pv-price' }, it.priceLabel,
        it.total != null ? el('span', { class: 'total inline', title: it.totalNote || '' }, T`總價約 € ${fmt(it.total)}`) : null,
        it.localLabel ? el('span', { class: 'total inline' }, T`當地價格 ${it.localLabel}`) : null),
      it.extra ? el('div', { class: 'meta extra' + (it.shipping === 'no' ? ' pickup' : '') }, it.extra) : null,
    ),
  );
  preview.hidden = false;
  const r = cardEl.getBoundingClientRect();
  const w = preview.offsetWidth, h = preview.offsetHeight, gap = 12;
  let left = r.right + gap;
  if (left + w > window.innerWidth - 8) left = r.left - w - gap;
  if (left < 8) left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left));
  let top = r.top + r.height / 2 - h / 2;
  top = Math.max(8, Math.min(window.innerHeight - h - 8, top));
  preview.style.left = left + 'px';
  preview.style.top = top + 'px';
}

function hidePreview() {
  clearTimeout(pvTimer);
  pvCard = null;
  preview.hidden = true;
}

// 只在有滑鼠的裝置啟用
if (window.matchMedia('(hover: hover)').matches) {
  document.addEventListener('mouseover', e => {
    const c = e.target.closest?.('.card:not(.skeleton)');
    if (c === pvCard) return;
    hidePreview();
    if (!c || !cardData.has(c)) return;
    pvCard = c;
    pvTimer = setTimeout(() => { if (pvCard === c) showPreview(c); }, 450);
  });
  document.addEventListener('scroll', hidePreview, { passive: true });
  window.addEventListener('blur', hidePreview);
}

// ---------- 收藏 ----------
async function loadFavs() {
  const { favorites = [] } = await store.get('favorites');
  state.favIds = new Set(favorites.map(f => f.id));
  $('favCount').textContent = favorites.length || '';
  return favorites;
}

async function toggleFav(it) {
  const favorites = await loadFavs();
  const next = state.favIds.has(it.id)
    ? favorites.filter(f => f.id !== it.id)
    : [{ ...it, note: '', savedAt: Date.now() }, ...favorites];
  await store.set({ favorites: next });
  await loadFavs();
  // 只更新星號，不重畫整頁
  document.querySelectorAll('.card').forEach(c => {
    if (c.getAttribute('href') !== it.url) return;
    const b = c.querySelector('.star');
    const on = state.favIds.has(it.id);
    b.classList.toggle('on', on);
    b.title = on ? T`取消收藏` : T`加入收藏`;
    b.replaceChildren(icon(on ? 'star' : 'star-o'));
  });
  if (!$('tab-favs').hidden) renderFavs();
}

async function renderFavs() {
  let favs = await loadFavs();
  const mode = $('favSort').value;
  if (mode !== 'time') {
    const dir = mode === 'asc' ? 1 : -1;
    favs = [...favs].sort((a, b) => cmpPrice(a) == null ? 1 : cmpPrice(b) == null ? -1 : (cmpPrice(a) - cmpPrice(b)) * dir);
  }
  const list = $('favList');
  renderRemoved();
  // 格狀：用跟搜尋結果一樣的卡片；列表：每件一列，可以直接寫備註
  const gridView = state.favView === 'grid' && favs.length;
  list.className = gridView ? 'grid favgrid' : 'favlist';
  if (gridView) {
    list.replaceChildren(...favs.map(f => card(f, { note: f.note })));
    return;
  }
  if (!favs.length) {
    list.replaceChildren(el('div', { class: 'empty' }, el('p', {}, T`還沒有收藏`), el('p', { class: 'sub' }, T`在搜尋結果點商品圖片右上角的星號就能收藏。`)));
    return;
  }
  list.replaceChildren(...favs.map(f => {
    let timer;
    const note = el('textarea', {
      placeholder: T`備註：例如快門慢速不準、可議價到 €600、要問有沒有霉…`,
      rows: 2,
      oninput: e => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
          const { favorites = [] } = await store.get('favorites');
          await store.set({ favorites: favorites.map(x => x.id === f.id ? { ...x, note: e.target.value } : x) });
        }, 400);
      },
    });
    note.value = f.note || '';
    return el('div', { class: 'fav' },
      el('a', { class: 'thumb', href: f.url, target: '_blank', rel: 'noopener' }, f.image ? el('img', { src: f.image, alt: '', referrerpolicy: 'no-referrer' }) : null),
      el('div', { class: 'info' },
        el('div', { class: 'head' },
          el('span', { class: 'tag inline', style: `--c:${colorOf(f.source)}` }, f.source),
          el('a', { class: 'title', href: f.url, target: '_blank', rel: 'noopener' }, f.title),
        ),
        el('div', { class: 'price' }, f.priceLabel, f.total != null ? el('span', { class: 'total inline' }, T`總價約 € ${fmt(f.total)}`) : null,
          f.localLabel ? el('span', { class: 'total inline' }, T`當地價格 ${f.localLabel}`) : null),
        el('div', { class: 'meta' }, [f.location, f.extra, T`收藏於 ${new Date(f.savedAt).toLocaleDateString(locale())}`].filter(Boolean).join(' · ')),
        note,
      ),
      el('button', { type: 'button', class: 'ghost small icon-only', title: T`移除收藏`, onclick: () => toggleFav(f) }, icon('x')),
    );
  }));
}
$('favSort').addEventListener('change', renderFavs);

// ---------- 收藏：自動移除已下架的商品 ----------
async function renderRemoved() {
  const { favRemoved = [] } = await store.get('favRemoved');
  const box = $('favRemovedBox');
  box.hidden = !favRemoved.length;
  $('favRemovedCount').textContent = favRemoved.length;
  $('favRemovedList').replaceChildren(...favRemoved.map(f => el('div', { class: 'fav gone' },
    el('a', { class: 'thumb', href: f.url, target: '_blank', rel: 'noopener' }, f.image ? el('img', { src: f.image, alt: '', referrerpolicy: 'no-referrer' }) : null),
    el('div', { class: 'info' },
      el('div', { class: 'head' },
        el('span', { class: 'tag inline', style: `--c:${colorOf(f.source)}` }, f.source),
        el('a', { class: 'title', href: f.url, target: '_blank', rel: 'noopener' }, f.title),
      ),
      el('div', { class: 'price' }, f.priceLabel),
      el('div', { class: 'meta' }, [T`移除於 ${new Date(f.removedAt).toLocaleDateString(locale())}`, f.note ? T`備註：${f.note}` : ''].filter(Boolean).join(' · ')),
    ),
    el('button', { type: 'button', class: 'ghost small', onclick: async () => { await restoreFavorite(f.id); renderFavs(); } }, T`放回收藏`),
  )));
}

let favChecking = false;
async function runFavCheck(force) {
  if (favChecking) return;
  favChecking = true;
  const btn = $('favCheck'), status = $('favCheckStatus');
  btn.disabled = true;
  status.textContent = T`正在檢查收藏是否還在…`;
  let r = null;
  try {
    r = await checkFavorites({ force, limit: force ? 200 : 40, gap: 400,
      onProgress: (i, n) => { status.textContent = T`正在檢查收藏是否還在… ${i}/${n}`; } });
    if (r.busy) status.textContent = T`背景正在檢查，稍後再看`;
    else if (!r.checked) status.textContent = force ? T`沒有需要檢查的收藏` : '';
    else if (r.removed.length) status.textContent = T`檢查了 ${r.checked} 件，移除 ${r.removed.length} 件已下架的商品`;
    else status.textContent = T`檢查了 ${r.checked} 件，都還在`;
  } catch (e) {
    status.textContent = T`檢查失敗：${e?.message || e}`;
  } finally {
    favChecking = false;
    btn.disabled = false;
    // 有移除才重畫，避免正在寫的備註被打斷
    if (r?.removed?.length) renderFavs(); else renderRemoved();
  }
}
$('favCheck').addEventListener('click', () => runFavCheck(true));
$('favAuto').addEventListener('change', () => store.set({ favAutoRemove: $('favAuto').checked }));
store.get('favAutoRemove').then(({ favAutoRemove = true }) => { $('favAuto').checked = favAutoRemove; });

// 打開收藏頁時，上次檢查超過 1 小時就順便查一下到期的商品
async function maybeCheckFavs() {
  const { favAutoRemove = true, favCheckedAt = 0 } = await store.get(['favAutoRemove', 'favCheckedAt']);
  if (favAutoRemove && Date.now() - favCheckedAt > 3600e3) runFavCheck(false);
}

// ---------- 快捷搜尋 ----------
async function renderQuick() {
  const { quick = [] } = await store.get('quick');
  const box = $('quickList');
  if (!quick.length) {
    box.replaceChildren(el('span', { class: 'hint' }, T`還沒有快捷，搜尋後按「存成快捷」`));
    return;
  }
  box.replaceChildren(...quick.map((q, i) => {
    const qc = q.cat ? findCat(q.cat) : null;
    const extra = [qc ? catName(qc) : '', q.min || q.max ? `€${q.min || 0}–${q.max || '∞'}` : ''].filter(Boolean).join(' · ');
    return el('span', { class: 'qchip' },
      el('button', { type: 'button', class: 'qmain', title: T`套用並搜尋`, onclick: () => { fillForm(q); runSearch(); } }, q.query, extra ? el('small', {}, extra) : null),
      el('button', {
        type: 'button', class: 'qdel', title: T`刪除快捷`,
        onclick: async () => {
          const { quick = [] } = await store.get('quick');
          await store.set({ quick: quick.filter(x => !(x.query === q.query && (x.cat || '') === (q.cat || ''))) });
          renderQuick();
        },
      }, icon('x', 'ico tiny')),
    );
  }));
}

$('saveQuick').addEventListener('click', async () => {
  const v = formValues();
  if (!v.query) { $('q').focus(); return; }
  const { quick = [] } = await store.get('quick');
  const idx = quick.findIndex(q => q.query.toLowerCase() === v.query.toLowerCase() && (q.cat || '') === (v.cat || ''));
  if (idx >= 0) quick[idx] = v; else quick.push(v);
  await store.set({ quick });
  renderQuick();
  flash($('saveQuick'), T`已存`);
});

// ---------- 分類瀏覽 ----------
const bState = { cat: null, catObj: null, q: '', price: { min: '', max: '' }, priceKey: '|', raw: [], progress: {}, paging: {}, flags: {}, onlySource: null, onlyFlag: null, loading: false, gen: 0 };

// 內建分類 + 使用者自訂分類
const findCat = key => CATEGORIES.find(c => c.key === key) || state.customCats.find(c => c.key === key) || null;
const catName = c => (c.custom ? c.name : tr(c.name));

// 搜尋框旁的分類選單：所有分類，或只在某個分類裡搜尋
function renderQCat() {
  const sel = $('qCat');
  const cur = sel.value;
  const cats = [...CATEGORIES.filter(c => !c.bargain), ...state.customCats];
  sel.replaceChildren(el('option', { value: '' }, T`所有分類`), ...cats.map(c => el('option', { value: c.key }, catName(c))));
  sel.value = cats.some(c => c.key === cur) ? cur : '';
  sel.classList.toggle('on', !!sel.value);
}
$('qCat').addEventListener('change', () => {
  $('qCat').classList.toggle('on', !!$('qCat').value);
  // 已經有關鍵字：換分類就直接重搜
  if ($('q').value.trim()) runSearch();
});

function renderCats() {
  renderQCat();
  const builtIn = CATEGORIES.map(c => el('button', {
    type: 'button',
    class: 'cat' + (bState.cat === c.key ? ' on' : ''),
    onclick: () => pickCat(c.key),
  }, icon('cat-' + c.key, 'cat-ico'), el('strong', {}, tr(c.name)), el('small', {}, tr(c.sub))));
  const custom = state.customCats.map(c => el('div', {
    class: 'cat custom' + (bState.cat === c.key ? ' on' : ''),
    role: 'button',
    tabindex: '0',
    title: T`關鍵字：${c.words.join(', ')}`,
    onclick: () => pickCat(c.key),
    onkeydown: e => {
      if (e.target !== e.currentTarget) return; // 在鉛筆按鈕上按 Enter 是編輯，不是瀏覽
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickCat(c.key); }
    },
  },
    icon('cat-custom', 'cat-ico'),
    el('strong', {}, c.name),
    el('small', {}, c.words.join(' · ')),
    el('button', { type: 'button', class: 'cat-edit', title: T`編輯分類`, onclick: e => { e.stopPropagation(); openCatEditor(c); } }, icon('edit', 'ico tiny')),
  ));
  const add = el('button', { type: 'button', class: 'cat add', onclick: () => openCatEditor(null) },
    icon('plus', 'cat-ico'), el('strong', {}, T`新增分類`), el('small', {}, T`用自己的關鍵字建立分類，任何語言都可以`));
  $('catList').replaceChildren(...builtIn, ...custom, add);
  // 選了分類之後，分類卡片縮成一排小按鈕，商品可以直接看到
  $('catList').classList.toggle('compact', !!bState.cat);
}

// 點分類卡片：換分類時清掉分類內的關鍵字
function pickCat(key) {
  if (bState.cat !== key) setBrowseQuery('');
  startBrowse(key);
}

// 分類裡的關鍵字（選填）
function setBrowseQuery(q) {
  bState.q = q;
  $('bQ').value = q;
  $('bQClear').hidden = !q;
}
$('bSearch').addEventListener('submit', e => {
  e.preventDefault();
  setBrowseQuery($('bQ').value.trim());
  if (bState.cat) startBrowse(bState.cat);
});
$('bQClear').addEventListener('click', () => {
  setBrowseQuery('');
  if (bState.cat) startBrowse(bState.cat);
});

// ---------- 自訂分類編輯 ----------
function openCatEditor(cat) {
  const box = $('catEditor');
  box.hidden = false;
  box.dataset.key = cat?.key || '';
  $('ceTitle').textContent = cat ? T`編輯分類` : T`新增分類`;
  $('ceName').value = cat?.name || '';
  $('ceWords').value = cat ? cat.words.join(', ') : '';
  $('ceExclude').value = cat?.exclude || '';
  $('ceDelete').hidden = !cat;
  $('ceDelete').textContent = T`刪除分類`;
  $('ceDelete').dataset.armed = '';
  $('ceMsg').textContent = '';
  box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  $('ceName').focus();
}
function closeCatEditor() { $('catEditor').hidden = true; }

async function saveCustomCats(list) {
  state.customCats = list;
  await store.set({ customCats: list });
  renderCats();
}

$('ceCancel').addEventListener('click', closeCatEditor);
$('catEditor').addEventListener('submit', async e => {
  e.preventDefault();
  const name = $('ceName').value.trim();
  const words = parseWords($('ceWords').value);
  if (!name) { $('ceMsg').textContent = T`請輸入分類名稱`; $('ceName').focus(); return; }
  if (!words.length) { $('ceMsg').textContent = T`請至少輸入一個關鍵字`; $('ceWords').focus(); return; }
  const key = $('catEditor').dataset.key || 'c_' + Date.now().toString(36);
  const cat = { key, name, words, exclude: $('ceExclude').value.trim(), custom: true };
  const list = state.customCats.some(c => c.key === key) ? state.customCats.map(c => (c.key === key ? cat : c)) : [...state.customCats, cat];
  await saveCustomCats(list);
  // 追蹤中的同一個分類也改用新的關鍵字
  const { watches = [] } = await store.get('watches');
  if (watches.some(w => w.category === key)) {
    // 關鍵字變了：下次檢查時把新關鍵字搜到的現有商品當成已看過，不要一次通知一大堆
    await store.set({ watches: watches.map(w => (w.category === key ? { ...w, customCat: { name, words, exclude: cat.exclude }, seededNames: [] } : w)) });
  }
  closeCatEditor();
  if (key !== bState.cat) setBrowseQuery('');
  startBrowse(key);
});
$('ceDelete').addEventListener('click', async () => {
  const btn = $('ceDelete');
  // 按兩次才刪除，避免誤刪
  if (!btn.dataset.armed) { btn.dataset.armed = '1'; btn.textContent = T`再按一次確定刪除`; return; }
  const key = $('catEditor').dataset.key;
  await saveCustomCats(state.customCats.filter(c => c.key !== key));
  closeCatEditor();
  if (bState.cat === key) {
    bState.cat = null; bState.catObj = null; bState.gen++; bState.raw = []; bState.progress = {}; bState.paging = {};
    setBrowseQuery('');
    renderCats();
    $('bSearch').hidden = true;
    $('bWatch').hidden = true;
    $('bResults').replaceChildren();
    renderBrowse();
    $('bEmpty').hidden = false;
    $('bEmpty').replaceChildren(el('p', {}, T`選一個分類開始瀏覽`));
  }
});

function catExclude() {
  return [bState.catObj?.exclude, $('exclude').value.trim()].filter(Boolean).join(', ');
}

// key：分類代號；fallback：找不到時用的分類物件（追蹤清單裡已刪除的自訂分類）
async function startBrowse(key, fallback) {
  if (!state.selected.length) { flash($('catList'), T`請在上方至少選一個平台`); return; }
  const cat = findCat(key) || fallback;
  if (!cat) return;
  bState.cat = key;
  bState.catObj = cat;
  // 素人賣家分類：預設用「撿漏優先」排序
  if (cat.bargain) $('bSort').value = 'bargain';
  bState.stale = false;
  bState.gen++;
  bState.loading = false;
  bState.raw = [];
  bState.flags = {};
  bState.paging = {};
  bState.onlySource = null;
  bState.onlyFlag = null;
  delete $('bMore').dataset.autoAt;
  const keys = catSources(cat, state.selected);
  bState.progress = Object.fromEntries(keys.map(k => [k, { status: 'loading', count: 0 }]));
  renderCats();
  $('bSearch').hidden = false;
  $('bQ').placeholder = T`在「${catName(cat)}」裡搜尋，例如品牌或型號（選填）`;
  $('bWatch').hidden = false;
  $('bEmpty').hidden = true;
  $('bResults').replaceChildren(...skeletons(10));
  await loadBrowse(keys, {});
}

async function loadBrowse(keys, start) {
  if (bState.loading) return;
  bState.loading = true;
  const gen = bState.gen;
  keys.forEach(k => { bState.progress[k] = { ...bState.progress[k], status: 'loading' }; });
  $('bMore').hidden = true;
  $('bMoreLoading').hidden = !Object.keys(start).length;
  renderBrowseStatus();
  const res = await browseAll(bState.catObj, keys, (k, p) => {
    if (bState.gen !== gen) return;
    bState.progress[k] = p;
    renderBrowseStatus();
  }, { price: browsePrice(), start, q: bState.q, isStale: () => bState.gen !== gen });
  if (bState.gen !== gen) return; // 中途換了分類或價格
  bState.loading = false;
  $('bMoreLoading').hidden = true;
  const seen = new Set(bState.raw.map(i => i.id));
  bState.raw.push(...res.items.filter(i => !seen.has(i.id)));
  Object.assign(bState.paging, res.paging);
  renderBrowse();
  checkBids(bState.raw, () => { if (bState.gen === gen) renderBrowse(); }, 40, () => bState.gen !== gen);
}

// 撿漏標示：素人用語、未寫品牌
const isClue = f => f?.kind === 'naive' || f?.kind === 'nobrand';

function browseFiltered() {
  const { min, max } = browsePrice();
  return applyFilters(bState.raw, { query: bState.q, min, max, exclude: catExclude(), strict: !!bState.q && $('strict').checked, shipOnly: $('shipOnly').checked });
}

function browseItems() {
  const all = browseFiltered();
  // 標示以「所有平台、目前篩選後」的結果計算
  bState.flags = computeBrowseFlags(all).flags;
  let items = all;
  if (bState.onlySource) items = items.filter(i => i.source === bState.onlySource);
  if (bState.onlyFlag === 'clue') items = items.filter(i => isClue(bState.flags[i.id]));
  const mode = $('bSort').value;
  if (mode === 'bargain') {
    const score = i => {
      const f = bState.flags[i.id];
      if (f?.kind === 'naive') return 500;
      if (f?.kind === 'nobrand') return 100;
      return 0;
    };
    return sortNewest(items).sort((a, b) => score(b) - score(a));
  }
  return sortItems(items, mode);
}

function renderBrowseStatus() {
  const items = browseFiltered();
  $('bStatus').replaceChildren(...statusChips(bState.progress, items, bState.onlySource, name => { bState.onlySource = name; renderBrowse(); }));
  // 撿漏篩選
  const extra = $('bStatusExtra');
  extra.replaceChildren();
  const done = Object.values(bState.progress).every(p => p.status !== 'loading');
  if (done && items.length && bState.flags) {
    const nClue = items.filter(i => isClue(bState.flags[i.id])).length;
    const toggle = (key, label, n, title) => el('button', {
      type: 'button',
      class: 'chip flag-toggle ' + key + (bState.onlyFlag === key ? ' active' : ''),
      disabled: !n,
      title,
      onclick: () => { bState.onlyFlag = bState.onlyFlag === key ? null : key; renderBrowse(); },
    }, label, el('b', {}, String(n)));
    extra.append(
      el('span', { class: 'market first' }, T`撿漏`),
      toggle('clue', T`素人線索`, nClue, T`標題有素人用語，或沒寫品牌`),
    );
  }
  extra.hidden = !extra.childNodes.length;
  renderErrors(bState.progress, $('bStatusErr'));
}

function renderBrowse() {
  if (!bState.cat) { renderBrowseStatus(); return; }
  const items = browseItems();
  renderBrowseStatus();
  // 多組字詞的分類（素人賣家、自訂分類）：卡片上標出是哪個字詞搜到的
  const showMatch = bState.catObj?.bargain || (bState.catObj?.custom && bState.catObj.words.length > 1);
  $('bResults').replaceChildren(...items.map(it => card(it, { flag: bState.flags[it.id], matched: showMatch ? it.matchedQuery : null })));
  $('bEmpty').hidden = items.length > 0 || bState.loading;
  if (!items.length && !bState.loading) $('bEmpty').replaceChildren(el('p', {}, T`沒有符合的商品`), el('p', { class: 'sub' }, T`試試放寬價格範圍或減少排除字詞。`));
  const more = Object.values(bState.paging).some(p => !p.done);
  $('bMore').hidden = !more || bState.loading;
}

$('bMore').addEventListener('click', () => {
  const ids = Object.entries(bState.paging).filter(([, p]) => !p.done).map(([id]) => id);
  if (!ids.length) return;
  loadBrowse([...new Set(ids.map(taskSource))], Object.fromEntries(ids.map(id => [id, bState.paging[id].next])));
});
$('bSort').addEventListener('change', renderBrowse);

// 排除字詞、只看可寄送：不用重新抓資料，只要重新篩選
['exclude', 'shipOnly'].forEach(id => $(id).addEventListener('change', () => {
  if (id === 'shipOnly') store.set({ shipOnly: $('shipOnly').checked });
  if (bState.cat) renderBrowse();
  if (state.query) applySearchFilters();
}));

// eBay 只看二手：需要重新向 eBay 要資料
$('usedOnly').addEventListener('change', () => {
  store.set({ usedOnly: $('usedOnly').checked });
  if (state.query && !state.query.v.multi) refreshSearchWhenVisible();
});

// ---------- 價格篩選：搜尋用側欄的價格，分類瀏覽用自己的價格，兩邊互不影響 ----------
const PRICE_PRESETS = [
  { label: '不限', min: '', max: '' },
  { label: '€50 以下', min: '', max: '50' },
  { label: '€50–150', min: '50', max: '150' },
  { label: '€150–500', min: '150', max: '500' },
  { label: '€500–1500', min: '500', max: '1500' },
  { label: '€1500 以上', min: '1500', max: '' },
];

function browsePrice() {
  return { ...bState.price };
}

function renderPricePresets(syncInputs = true) {
  const { min, max } = browsePrice();
  if (syncInputs) { $('bMin').value = min; $('bMax').value = max; }
  $('pricePresets').replaceChildren(...PRICE_PRESETS.map(p => el('button', {
    type: 'button',
    class: 'seg-btn' + (p.min === min && p.max === max ? ' on' : ''),
    onclick: () => setPrice(p.min, p.max, true),
  }, tr(p.label))));
}

// 分類瀏覽的價格：改了就重新向平台要資料（價格由平台篩選，每頁都符合條件）
let priceTimer;
function setPrice(min, max, now) {
  bState.price = { min, max };
  renderPricePresets(now);
  clearTimeout(priceTimer);
  const apply = () => {
    const key = `${min}|${max}`;
    if (key === bState.priceKey) return;
    bState.priceKey = key;
    if (bState.cat) {
      if ($('tab-browse').hidden) bState.stale = true;
      else startBrowse(bState.cat);
    }
  };
  if (now) apply(); else priceTimer = setTimeout(apply, 700);
}

// 搜尋的價格（側欄）：只影響搜尋結果
function setSearchPrice() {
  const key = `${$('min').value.trim()}|${$('max').value.trim()}`;
  if (key === state.lastPriceKey) return;
  state.lastPriceKey = key;
  if (state.query) {
    if (state.query.v.multi) applySearchFilters();
    else refreshSearchWhenVisible();
  }
}

['bMin', 'bMax'].forEach(id => $(id).addEventListener('input', () => setPrice($('bMin').value.trim(), $('bMax').value.trim(), false)));
['min', 'max'].forEach(id => $(id).addEventListener('change', setSearchPrice));

$('bWatch').addEventListener('click', async () => {
  const cat = bState.catObj;
  if (!cat) return;
  const btn = $('bWatch');
  const sources = catSources(cat, state.selected);
  if (!sources.length) { flash(btn, T`請至少選一個平台`); return; }
  const { min, max } = browsePrice();
  const catQuery = bState.q;
  const exclude = catExclude(), shipOnly = $('shipOnly').checked; // 搜尋期間你可能換了分類：先記下來
  // 同一個分類、同樣的平台和價格已經在追蹤：不要重複加
  const same = w => w.category === cat.key && (w.catQuery || '') === catQuery && (w.min || '') === min && (w.max || '') === max && [...(w.sources || [])].sort().join() === [...sources].sort().join();
  if ((await store.get('watches')).watches?.some(same)) { flash(btn, T`已經在追蹤了`); return; }
  btn.disabled = true;
  const { items, errors } = await browseAll(cat, sources, null, { price: { min, max }, pages: 1, q: catQuery });
  // 搜尋要花一點時間，期間清單可能有變：搜完再讀最新的清單
  const { watches = [] } = await store.get('watches');
  if (watches.some(same)) { btn.disabled = false; flash(btn, T`已經在追蹤了`); return; }
  watches.push({
    id: Date.now().toString(36),
    query: catQuery ? T`分類：${catName(cat)} · ${catQuery}` : T`分類：${catName(cat)}`,
    category: cat.key,
    catQuery: catQuery || undefined,
    customCat: cat.custom ? { name: cat.name, words: cat.words, exclude: cat.exclude } : undefined,
    sources,
    min, max, exclude, strict: false, shipOnly,
    seen: items.map(i => i.id),
    seededNames: [...new Set(items.map(i => i.source))],
    lastChecked: Date.now(),
    lastError: errors.join(' / '),
  });
  await store.set({ watches });
  btn.disabled = false;
  flash(btn, T`已加入追蹤`);
});

$('dealThreshold').addEventListener('change', e => {
  state.threshold = Number(e.target.value);
  store.set({ dealThreshold: state.threshold });
  state.onlyDeals = false;
  if (state.items.length) renderResults();
  if (bState.cat) renderBrowse();
});

// ---------- 追蹤 ----------
$('watchBtn').addEventListener('click', async () => {
  const v = formValues();
  if (!v.query) { $('q').focus(); return; }
  if (!v.sources.length) { flash($('watchBtn'), T`請至少選一個平台`); return; }
  const btn = $('watchBtn');
  // 選了分類：追蹤「這個分類裡的這個關鍵字」
  const cat = v.cat ? findCat(v.cat) : null;
  if (cat) {
    const sources = catSources(cat, v.sources);
    if (!sources.length) { flash(btn, T`勾選的平台都沒有這個分類`); return; }
    const sameCat = w => w.category === cat.key && (w.catQuery || '').toLowerCase() === v.query.toLowerCase() &&
      (w.min || '') === v.min && (w.max || '') === v.max && [...(w.sources || [])].sort().join() === [...sources].sort().join();
    if ((await store.get('watches')).watches?.some(sameCat)) { flash(btn, T`已經在追蹤了`); return; }
    btn.disabled = true;
    const { items, errors } = await browseAll(cat, sources, null, { price: priceOf(v), pages: 1, q: v.query });
    const { watches = [] } = await store.get('watches');
    if (watches.some(sameCat)) { btn.disabled = false; flash(btn, T`已經在追蹤了`); return; }
    watches.push({
      id: Date.now().toString(36),
      query: T`分類：${catName(cat)} · ${v.query}`,
      category: cat.key, catQuery: v.query,
      customCat: cat.custom ? { name: cat.name, words: cat.words, exclude: cat.exclude } : undefined,
      sources, min: v.min, max: v.max, exclude: [cat.exclude, v.exclude].filter(Boolean).join(', '), strict: v.strict, shipOnly: v.shipOnly,
      seen: items.map(i => i.id), seededNames: [...new Set(items.map(i => i.source))], lastChecked: Date.now(), lastError: errors.join(' / '),
    });
    await store.set({ watches });
    btn.disabled = false;
    flash(btn, T`已加入追蹤`);
    return;
  }
  const sameWatch = w => !w.category && !w.multi && (w.query || '').toLowerCase() === v.query.toLowerCase() &&
    (w.min || '') === v.min && (w.max || '') === v.max && [...(w.sources || [])].sort().join() === [...v.sources].sort().join();
  if ((await store.get('watches')).watches?.some(sameWatch)) { flash(btn, T`已經在追蹤了`); return; }
  btn.disabled = true;
  // 先搜一次，把目前已有的商品記為「看過」，之後只通知真正新上架的
  const { items, errors } = await searchAll(v.query, v.sources, null, { price: priceOf(v), used: v.used, pages: 1 });
  const { watches = [] } = await store.get('watches');
  if (watches.some(sameWatch)) { btn.disabled = false; flash(btn, T`已經在追蹤了`); return; }
  // seededNames：已經記下現有商品的平台。建立時讀取失敗的平台，之後第一次讀到時只記錄、不通知
  const { cat: _c, ...vw } = v;
  watches.push({ id: Date.now().toString(36), ...vw, seen: items.map(i => i.id), seededNames: [...new Set(items.map(i => i.source))], lastChecked: Date.now(), lastError: errors.join(' / ') });
  await store.set({ watches });
  btn.disabled = false;
  flash(btn, T`已加入追蹤`);
});

// 追蹤的名稱在顯示時才翻譯，切換語言後也會跟著變
function watchLabel(w) {
  if (w.category) {
    const cat = findCat(w.category) || (w.customCat && { ...w.customCat, custom: true });
    const name = cat ? catName(cat) : w.category;
    return w.catQuery ? T`分類：${name} · ${w.catQuery}` : T`分類：${name}`;
  }
  if (w.multi) return T`素人賣家字詞（全部）`;
  return w.query;
}

async function renderWatches() {
  const { watches = [], interval = 30 } = await store.get(['watches', 'interval']);
  $('interval').value = String(interval);
  const list = $('watchList');
  if (!watches.length) {
    list.replaceChildren(el('div', { class: 'empty' }, el('p', {}, T`還沒有追蹤項目`), el('p', { class: 'sub' }, T`在上方輸入關鍵字、選好平台和價格後按「加入追蹤」。`)));
    return;
  }
  list.replaceChildren(...watches.map(w => {
    const price = w.min || w.max ? `€${w.min || 0} – ${w.max ? '€' + w.max : T`不限`}` : T`價格不限`;
    const checked = w.lastChecked ? new Date(w.lastChecked).toLocaleString(locale(), { dateStyle: 'short', timeStyle: 'short' }) : T`尚未檢查`;
    return el('div', { class: 'watch' + (w.paused ? ' paused' : '') },
      el('div', { class: 'info' },
        el('div', { class: 'head' }, el('strong', {}, watchLabel(w)), w.paused ? el('span', { class: 'badge' }, T`已暫停`) : null),
        el('div', { class: 'srcs' }, (w.sources || []).map(k => SOURCES[k] && el('span', { class: 'tag inline', style: `--c:${SOURCES[k].color}` }, SOURCES[k].name))),
        w.multi ? el('div', { class: 'meta' }, T`字詞：${w.multi.map(s => s.query).join(', ')}`) : null,
        el('div', { class: 'meta' }, [price, w.exclude ? T`排除：${w.exclude}` : '', w.strict ? T`標題須含關鍵字` : '', w.shipOnly ? T`隱藏只能面交` : '', T`上次檢查 ${checked}`].filter(Boolean).join(' · ')),
        w.lastError ? el('div', { class: 'errors' }, w.lastError) : null,
      ),
      el('div', { class: 'actions' },
        el('button', {
          type: 'button', class: 'ghost small',
          onclick: () => {
            if (w.category) {
              // 用這個追蹤自己的價格和分類內關鍵字瀏覽
              bState.price = { min: w.min || '', max: w.max || '' };
              bState.priceKey = `${bState.price.min}|${bState.price.max}`;
              setBrowseQuery(w.catQuery || '');
              renderPricePresets();
              showTab('browse');
              startBrowse(w.category, w.customCat && { ...w.customCat, key: w.category, custom: true });
            }
            else if (w.multi) runSearch({ multi: w.multi, min: w.min, max: w.max, exclude: w.exclude, strict: false, naive: true });
            else { fillForm(w); runSearch(); }
          },
        }, T`搜尋`),
        el('button', { type: 'button', class: 'ghost small', onclick: () => updateWatch(w.id, x => ({ ...x, paused: !x.paused })) }, w.paused ? T`恢復` : T`暫停`),
        el('button', { type: 'button', class: 'ghost small danger', onclick: () => updateWatch(w.id, () => null) }, T`刪除`),
      ),
    );
  }));
}

async function updateWatch(id, fn) {
  const { watches = [] } = await store.get('watches');
  await store.set({ watches: watches.map(w => (w.id === id ? fn(w) : w)).filter(Boolean) });
  renderWatches();
}

$('interval').addEventListener('change', e => store.set({ interval: Number(e.target.value) }));

// ---------- 系統通知（Mac / Windows 的通知中心） ----------
$('notifyOn').addEventListener('change', () => store.set({ notifyOn: $('notifyOn').checked }));
$('notifySticky').addEventListener('change', () => store.set({ notifySticky: $('notifySticky').checked }));
store.get(['notifyOn', 'notifySticky']).then(({ notifyOn = true, notifySticky = false }) => {
  $('notifyOn').checked = notifyOn;
  $('notifySticky').checked = notifySticky;
});
$('notifyTest').addEventListener('click', async () => {
  const msg = $('notifyMsg');
  let r = null;
  try { r = await chrome.runtime.sendMessage({ type: 'testNotify' }); } catch {}
  if (r?.level && r.level !== 'granted') msg.textContent = T`Chrome 擋住了這個插件的通知，請到 chrome://settings/content/notifications 允許`;
  else if (r?.id) msg.textContent = T`已送出。沒看到的話，請照下面的說明打開 Mac 的通知設定`;
  else msg.textContent = T`送不出通知：${r?.error || ''}`;
});

$('checkNow').addEventListener('click', async () => {
  const btn = $('checkNow');
  btn.disabled = true;
  btn.textContent = T`檢查中…`;
  let r = null;
  try { r = await chrome.runtime.sendMessage({ type: 'checkNow' }); } catch {}
  btn.disabled = false;
  btn.textContent = r?.found ? T`找到 ${r.found} 件新上架` : T`沒有新上架`;
  clearTimeout(btn._resetTimer);
  btn._resetTimer = setTimeout(() => { btn.textContent = T`立即檢查`; }, 2500);
  renderWatches();
  renderNew(false);
});

// ---------- 新上架 ----------
async function renderNew(markViewed) {
  const { newItems = [] } = await store.get('newItems');
  const unseen = newItems.filter(i => !i.viewed).length;
  $('newCount').textContent = unseen || '';
  if (!newItems.length) {
    $('newList').replaceChildren(el('div', { class: 'empty' }, el('p', {}, T`目前沒有新上架`), el('p', { class: 'sub' }, T`加入追蹤之後才上架的商品會出現在這裡。`)));
  } else {
    $('newList').replaceChildren(...newItems.map(i => card(i, { query: i.query, matched: i.matchedQuery })));
  }
  if (markViewed && unseen) {
    await store.set({ newItems: newItems.map(i => ({ ...i, viewed: true })) });
    chrome.action.setBadgeText({ text: '' });
  }
}

$('clearNew').addEventListener('click', async () => {
  await store.set({ newItems: [] });
  chrome.action.setBadgeText({ text: '' });
  renderNew(false);
});

chrome.storage.onChanged.addListener(c => {
  if (c.newItems) renderNew(!$('tab-new').hidden);
  if (c.favorites) {
    loadFavs();
    // 背景自動移除了商品：重畫收藏清單（只改備註時不重畫，避免打字打到一半被打斷）
    const ids = v => (v || []).map(f => f.id).join();
    if (!$('tab-favs').hidden && !favChecking && ids(c.favorites.newValue) !== ids(c.favorites.oldValue)) renderFavs();
  }
  if (c.favRemoved && !$('tab-favs').hidden) renderRemoved();
});

// ---------- 備份 ----------
const BACKUP_KEYS = ['favorites', 'watches', 'quick', 'customCats', 'selectedSources', 'dealThreshold', 'interval', 'lang', 'usedOnly', 'shipOnly', 'newItems', 'favRemoved', 'favAutoRemove', 'notifyOn', 'notifySticky', 'viewMode', 'favView'];

$('exportBtn').addEventListener('click', async () => {
  const data = await store.get(BACKUP_KEYS);
  const blob = new Blob([JSON.stringify({ app: 'gear-search', version: 1, exportedAt: new Date().toISOString(), data }, null, 2)], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `gear-search-backup-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  flash($('exportBtn'), T`已匯出`);
});

$('importBtn').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', async e => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    const json = JSON.parse(await file.text());
    const data = json?.app === 'gear-search' ? json.data : null;
    if (!data || typeof data !== 'object') throw new Error('format');
    // 逐項檢查格式，壞掉或被改過的備份不能讓插件之後打不開
    const isObj = x => x && typeof x === 'object' && !Array.isArray(x);
    const list = (v, ok) => (Array.isArray(v) ? v.filter(x => isObj(x) && ok(x)) : []);
    const clean = {
      favorites: list(data.favorites, x => typeof x.id === 'string' && typeof x.title === 'string'),
      watches: list(data.watches, x => typeof x.id === 'string' && (x.query || x.category || x.multi)),
      quick: list(data.quick, x => typeof x.query === 'string' && x.query.trim()),
      customCats: list(data.customCats, x => typeof x.key === 'string' && x.name && Array.isArray(x.words) && x.words.length),
      newItems: list(data.newItems, x => typeof x.id === 'string' && typeof x.title === 'string'),
      favRemoved: list(data.favRemoved, x => typeof x.id === 'string' && typeof x.title === 'string'),
    };
    if (typeof data.favAutoRemove === 'boolean') clean.favAutoRemove = data.favAutoRemove;
    if (typeof data.notifyOn === 'boolean') clean.notifyOn = data.notifyOn;
    if (typeof data.notifySticky === 'boolean') clean.notifySticky = data.notifySticky;
    if (data.viewMode === 'grid' || data.viewMode === 'list') clean.viewMode = data.viewMode;
    if (data.favView === 'grid' || data.favView === 'list') clean.favView = data.favView;
    if (Array.isArray(data.selectedSources)) clean.selectedSources = data.selectedSources.filter(k => SOURCES[k]);
    if (typeof data.dealThreshold === 'number') clean.dealThreshold = data.dealThreshold;
    if (typeof data.interval === 'number' && data.interval >= 15) clean.interval = data.interval;
    if (data.lang === 'zh' || data.lang === 'en') clean.lang = data.lang;
    if (typeof data.usedOnly === 'boolean') clean.usedOnly = data.usedOnly;
    if (typeof data.shipOnly === 'boolean') clean.shipOnly = data.shipOnly;
    const n = clean.favorites.length, w = clean.watches.length, q = clean.quick.length;
    const c = clean.customCats.length;
    if (!confirm(T`要匯入備份嗎？目前的收藏、追蹤、快捷和自訂分類會被取代。\n備份內容：${n} 件收藏、${w} 個追蹤、${q} 個快捷、${c} 個自訂分類`)) return;
    await store.set(clean);
    location.reload();
  } catch {
    flash($('importBtn'), T`檔案格式不對`);
  }
});

// ---------- 語言 ----------
$('langSel').addEventListener('change', async e => {
  await store.set({ lang: e.target.value });
  location.reload();
});

// ---------- 初始化 ----------
(async () => {
  await i18nReady;
  translateDom();
  document.documentElement.classList.remove('i18n-pending');
  $('langSel').value = getLang();
  const { selectedSources, dealThreshold, usedOnly, shipOnly, viewMode, favView, customCats } = await store.get(['selectedSources', 'dealThreshold', 'usedOnly', 'shipOnly', 'viewMode', 'favView', 'customCats']);
  if (Array.isArray(customCats)) state.customCats = customCats.filter(c => c?.key && c.name && Array.isArray(c.words) && c.words.length).map(c => ({ ...c, custom: true }));
  applyView(viewMode === 'list' ? 'list' : 'grid');
  applyFavView(favView === 'grid' ? 'grid' : 'list');
  // 工具列固定在搜尋框下方：量出搜尋框區塊的高度
  const head = document.querySelector('.mainhead');
  const setHead = () => document.documentElement.style.setProperty('--head-h', head.offsetHeight + 'px');
  new ResizeObserver(setHead).observe(head);
  setHead();
  if (typeof dealThreshold === 'number') state.threshold = dealThreshold;
  $('dealThreshold').value = String(state.threshold);
  $('usedOnly').checked = usedOnly !== false;
  $('shipOnly').checked = shipOnly === true;
  renderCats();
  if (Array.isArray(selectedSources)) state.selected = selectedSources.filter(k => SOURCES[k]);
  // 第一次打開：有勾選平台的地區預設展開
  try { if (!localStorage.getItem('openRegions')) state.selected.forEach(k => openRegions.add(regionOf(k))); } catch {}
  renderSourcePills();
  try {
    const last = JSON.parse(localStorage.getItem('lastForm') || 'null');
    // 打開時不沿用上次的價格範圍，避免一打開就被價格限制住
    if (last) fillForm({ ...last, min: '', max: '', sources: null });
  } catch {}
  renderPricePresets();
  state.lastPriceKey = `${$('min').value.trim()}|${$('max').value.trim()}`;
  // 舊版「追蹤全部素人字詞」改成追蹤「素人賣家」分類（保留已看過的商品）
  {
    const { watches = [] } = await store.get('watches');
    if (watches.some(w => w.multi)) {
      await store.set({ watches: watches.map(w => {
        if (!w.multi) return w;
        const { multi, query, ...rest } = w;
        return { ...rest, category: 'naive', query: T`分類：${tr('素人賣家')}`, sources: w.sources?.length ? w.sources : [...DEFAULT_SOURCES], strict: false, seededNames: [] };
      }) });
    }
  }
  await loadFavs();
  renderQuick();
  renderNew(false);
  // 點通知時頁面已經開著：只會改網址的 #，在這裡切到「新上架」。
  // 切過去後把 # 清掉，下次再點通知網址才會再改變
  const openNewFromHash = () => {
    if (location.hash !== '#new') return;
    showTab('new');
    history.replaceState(null, '', location.pathname);
  };
  openNewFromHash();
  window.addEventListener('hashchange', openNewFromHash);
  $('q').focus();
})();
