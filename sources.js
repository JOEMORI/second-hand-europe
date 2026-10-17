// 各平台的搜尋方式。每個平台回傳統一格式的商品：
// { id, source, title, price, total, totalNote, currency, localPrice, priceLabel, url, image,
//   location, dateLabel, ts, extra, shipping, isAuction, rank }
//   price / total：一律是歐元（非歐元國家依匯率換算）；localPrice：當地幣別的原價
//   ts：上架時間（毫秒）；沒有就是 null（Vinted 的列表沒有上架時間）
//   total：含已知費用（運費、買家手續費）的總價；不知道就是 null
//   shipping：'yes' 可寄送、'no' 只能面交、null 不知道
// 注意：這個檔案用到 DOMParser，只能在頁面（search.html / offscreen.html）裡執行。
import { T, tr, relTime, locale } from './i18n.js';

const MP = 'https://www.marktplaats.nl', TDH = 'https://www.2dehands.be';

// ---------- 地區與國家 ----------
// 平台選單依地區分組；目前人在荷蘭，所以鄰近國家排前面
export const REGIONS = [
  { key: 'multi', name: '跨國平台' },
  { key: 'near', name: '鄰近國家' },
  { key: 'nordic', name: '北歐' },
  { key: 'central', name: '中歐' },
  { key: 'south', name: '南歐' },
  { key: 'southeast', name: '東南歐' },
  { key: 'other', name: '其他' },
];
export const COUNTRY_REGION = {
  EU: 'multi', NL: 'near', BE: 'near', DE: 'near', FR: 'near',
  DK: 'nordic', SE: 'nordic', FI: 'nordic',
  AT: 'central', PL: 'central', CZ: 'central', SK: 'central', HU: 'central',
  IT: 'south', ES: 'south', PT: 'south',
  RO: 'southeast', BG: 'southeast', HR: 'southeast', SI: 'southeast',
  IE: 'other', UK: 'other',
};
const COUNTRY_ORDER = Object.keys(COUNTRY_REGION);
export const countryRank = cc => { const i = COUNTRY_ORDER.indexOf(cc); return i < 0 ? 99 : i; };
// 國家名稱用瀏覽器內建的翻譯（中文、英文都有）
export function countryName(cc) {
  if (cc === 'EU') return tr('多國');
  try { return new Intl.DisplayNames([locale()], { type: 'region' }).of(cc === 'UK' ? 'GB' : cc) || cc; } catch { return cc; }
}

// search(query, page, opts) 關鍵字搜尋；browse(spec, page, opts) 用平台自己的分類瀏覽（沒有就用當地語言關鍵字）
// opts：{ price: { min, max }（歐元）, used: true/false }
// cur：平台幣別；lang：分類瀏覽時用哪種語言的關鍵字
export const SOURCES = {
  vinted:    { name: 'Vinted',        cc: 'EU', cur: 'EUR', lang: 'nl', color: '#0b8a7a', perLoad: 1,
               search: (q, p, o) => fetchVinted({ q }, p, o),
               browse: (s, p, o) => fetchVinted(s, p, o) },
  ebay:      { name: 'eBay',          cc: 'DE', multi: true, cur: 'EUR', lang: 'de', color: '#b8322a', perLoad: 2,
               search: (q, p, o) => fetchEbay({ q }, p, o),
               browse: (s, p, o) => fetchEbay(s, p, { ...o, used: true }) },
  mp:        { name: 'Marktplaats',   cc: 'NL', cur: 'EUR', lang: 'nl', color: '#2f6fb0', perLoad: 2,
               search: (q, p, o) => fetchAdevinta({ query: q }, p, o, MP, 'Marktplaats', 'mp'),
               browse: (s, p, o) => fetchAdevinta(s, p, o, MP, 'Marktplaats', 'mp') },
  tdh:       { name: '2dehands',      cc: 'BE', cur: 'EUR', lang: 'nl', color: '#e0861a', perLoad: 2,
               search: (q, p, o) => fetchAdevinta({ query: q }, p, o, TDH, '2dehands', 'tdh'),
               browse: (s, p, o) => fetchAdevinta(s, p, o, TDH, '2dehands', 'tdh') },
  ka:        { name: 'Kleinanzeigen', cc: 'DE', cur: 'EUR', lang: 'de', color: '#5f8f1f', perLoad: 3,
               search: (q, p, o) => fetchKleinanzeigen({ search: q }, p, o),
               browse: (s, p, o) => fetchKleinanzeigen(s, p, o) },
  dba:       { name: 'DBA',           cc: 'DK', cur: 'DKK', lang: 'da', color: '#00098a', perLoad: 1,
               search: (q, p, o) => fetchFinn('dba', q, p, o) },
  blocket:   { name: 'Blocket',       cc: 'SE', cur: 'SEK', lang: 'sv', color: '#d6262f', perLoad: 1,
               search: (q, p, o) => fetchFinn('blocket', q, p, o) },
  tori:      { name: 'Tori',          cc: 'FI', cur: 'EUR', lang: 'fi', color: '#f2552c', perLoad: 1,
               search: (q, p, o) => fetchFinn('tori', q, p, o) },
  willhaben: { name: 'willhaben',     cc: 'AT', cur: 'EUR', lang: 'de', color: '#0f6ad1', perLoad: 2,
               search: (q, p, o) => fetchWillhaben(q, p, o) },
  olx_pl:    { name: 'OLX.pl',        cc: 'PL', cur: 'PLN', lang: 'pl', color: '#23a491', perLoad: 1,
               search: (q, p, o) => fetchOlx('olx_pl', q, p, o) },
  bazos_cz:  { name: 'Bazoš.cz',      cc: 'CZ', cur: 'CZK', lang: 'cs', color: '#c77d16', perLoad: 2,
               search: (q, p, o) => fetchBazos('bazos_cz', q, p, o) },
  bazos_sk:  { name: 'Bazoš.sk',      cc: 'SK', cur: 'EUR', lang: 'sk', color: '#b06a2b', perLoad: 2,
               search: (q, p, o) => fetchBazos('bazos_sk', q, p, o) },
  subito:    { name: 'Subito',        cc: 'IT', cur: 'EUR', lang: 'it', color: '#e8473a', perLoad: 2,
               search: (q, p, o) => fetchSubito(q, p, o) },
  olx_pt:    { name: 'OLX.pt',        cc: 'PT', cur: 'EUR', lang: 'pt', color: '#3a77ff', perLoad: 1,
               search: (q, p, o) => fetchOlx('olx_pt', q, p, o) },
  olx_ro:    { name: 'OLX.ro',        cc: 'RO', cur: 'RON', lang: 'ro', color: '#1f8f7f', perLoad: 1,
               search: (q, p, o) => fetchOlx('olx_ro', q, p, o) },
  olx_bg:    { name: 'OLX.bg',        cc: 'BG', cur: 'EUR', lang: 'bg', color: '#2b9a6b', perLoad: 1,
               search: (q, p, o) => fetchOlx('olx_bg', q, p, o) },
  vatera:    { name: 'Vatera',        cc: 'HU', cur: 'HUF', lang: 'hu', color: '#f08a00', perLoad: 1,
               search: (q, p, o) => fetchVatera(q, p, o) },
};
// 每個平台屬於哪個地區：Vinted、eBay 這類多國都在用的放最上面
export const regionOf = k => (SOURCES[k].multi ? 'multi' : COUNTRY_REGION[SOURCES[k].cc] || 'other');

export const DEFAULT_SOURCES = ['mp', 'tdh', 'vinted', 'ka', 'ebay'];

// ---------- 分類瀏覽 ----------
// 每個分類對應到各平台自己的分類編號（2026/10 實測）。
// Marktplaats / 2dehands / Vinted 有對應的官方分類；
// Kleinanzeigen 分類較粗、eBay 純分類頁抓不到資料，所以用「分類＋通用關鍵字」。
// 其他國家的平台用當地語言的關鍵字（CAT_WORDS）。
// name / sub 是中文原文，顯示時用 tr() 翻譯。
export const CATEGORIES = [
  {
    key: 'film', name: '底片相機', sub: "Fotocamera's Analoog · Analogkameras",
    map: {
      mp: { l1: 31, l2: 480 }, tdh: { l1: 31, l2: 480 },
      vinted: { catalogs: [3076] },
      ka: { path: 's-foto', c: 'c245', attr: 'foto.art_s:camera', q: 'analog' },
      ebay: { cat: 15230, q: 'kamera' },
    },
  },
  {
    key: 'lens', name: '鏡頭', sub: 'Objectieven · Objektive',
    map: {
      mp: { l1: 31, l2: 495 }, tdh: { l1: 31, l2: 495 },
      vinted: { catalogs: [3061] },
      ka: { path: 's-foto', c: 'c245', attr: 'foto.art_s:lens', slug: 'lens' },
      ebay: { cat: 3323, q: 'objektiv' },
    },
  },
  {
    key: 'mic', name: '麥克風', sub: 'Microfoons · Mikrofone', exclude: 'statief, standaard, ständer, stativ, kabel, karaoke',
    map: {
      mp: { l1: 728, l2: 757 }, tdh: { l1: 728, l2: 757 },
      vinted: { catalogs: [5103] },
      ka: { path: 's-musikinstrumente', c: 'c74', q: 'mikrofon' },
      ebay: { cat: 29946, q: 'mikrofon' },
    },
  },
  {
    key: 'rec', name: '錄音機', sub: 'Recorders · Rekorder（含卡帶錄音機）',
    map: {
      mp: { l1: 31, l2: 1117, q: 'recorder' }, tdh: { l1: 31, l2: 1117, q: 'recorder' },
      vinted: { catalogs: [3566, 4833], q: 'recorder' },
      ka: { path: 's-audio-hifi', c: 'c172', q: 'recorder' },
      ebay: { cat: 15052, q: 'recorder' },
    },
  },
  {
    key: 'hp', name: '耳機', sub: 'Koptelefoons · Kopfhörer',
    map: {
      mp: { l1: 31, l2: 37 }, tdh: { l1: 31, l2: 37 },
      vinted: { catalogs: [3678] },
      ka: { path: 's-audio-hifi', c: 'c172', attr: 'audio_hifi.art_s:lautsprecher_kopfhoerer', q: 'kopfhoerer' },
      ebay: { cat: 112529, q: 'kopfhörer' },
    },
  },
  {
    // 撿漏：不懂行情的賣家常用的標題（老相機、爺爺的、遺物、閣樓找到的），每個平台用當地語言搜尋
    key: 'naive', name: '素人賣家', sub: 'oude camera · alte Kamera · vecchia macchina fotografica…', bargain: true,
    map: {},
  },
];

// 沒有對應分類的平台：用當地語言的關鍵字找
export const CAT_WORDS = {
  de: { film: 'analog kamera', lens: 'objektiv', mic: 'mikrofon', rec: 'recorder', hp: 'kopfhörer' },
  nl: { film: 'analoge camera', lens: 'objectief', mic: 'microfoon', rec: 'recorder', hp: 'koptelefoon' },
  da: { film: 'analogt kamera', lens: 'objektiv', mic: 'mikrofon', rec: 'båndoptager', hp: 'hovedtelefoner' },
  sv: { film: 'analog kamera', lens: 'objektiv', mic: 'mikrofon', rec: 'bandspelare', hp: 'hörlurar' },
  fi: { film: 'filmikamera', lens: 'objektiivi', mic: 'mikrofoni', rec: 'nauhuri', hp: 'kuulokkeet' },
  pl: { film: 'aparat analogowy', lens: 'obiektyw', mic: 'mikrofon', rec: 'dyktafon', hp: 'słuchawki' },
  cs: { film: 'analogový fotoaparát', lens: 'objektiv', mic: 'mikrofon', rec: 'diktafon', hp: 'sluchátka' },
  sk: { film: 'analógový fotoaparát', lens: 'objektív', mic: 'mikrofón', rec: 'diktafón', hp: 'slúchadlá' },
  it: { film: 'macchina fotografica analogica', lens: 'obiettivo', mic: 'microfono', rec: 'registratore', hp: 'cuffie' },
  pt: { film: 'máquina fotográfica analógica', lens: 'objetiva', mic: 'microfone', rec: 'gravador', hp: 'auscultadores' },
  ro: { film: 'aparat foto film', lens: 'obiectiv', mic: 'microfon', rec: 'reportofon', hp: 'căști' },
  bg: { film: 'лентов фотоапарат', lens: 'обектив', mic: 'микрофон', rec: 'диктофон', hp: 'слушалки' },
  hu: { film: 'analóg fényképezőgép', lens: 'objektív', mic: 'mikrofon', rec: 'diktafon', hp: 'fejhallgató' },
};
// 素人賣家：每種語言幾組字詞（陣列 = 每組各搜一次）
const NAIVE_WORDS = {
  nl: ['oude camera', 'oud fototoestel', 'camera opa'],
  de: ['alte Kamera', 'Kamera Nachlass', 'Dachbodenfund Kamera', 'Kamera Konvolut'],
  da: ['gammelt kamera', 'kamera dødsbo'],
  sv: ['gammal kamera', 'kamera dödsbo'],
  fi: ['vanha kamera', 'kamera kuolinpesä'],
  pl: ['stary aparat', 'aparat po dziadku'],
  cs: ['starý fotoaparát', 'fotoaparát po dědovi'],
  sk: ['starý fotoaparát', 'fotoaparát po dedovi'],
  it: ['vecchia macchina fotografica', 'macchina fotografica del nonno'],
  pt: ['máquina fotográfica antiga'],
  ro: ['aparat foto vechi'],
  bg: ['стар фотоапарат'],
  hu: ['régi fényképezőgép', 'fényképezőgép hagyaték'],
};
for (const [lang, words] of Object.entries(NAIVE_WORDS)) CAT_WORDS[lang].naive = words;
// 個別平台另外指定（Vinted 歐洲各國共用商品庫，多搜一組法文）
const SOURCE_WORDS = { vinted: { naive: [...NAIVE_WORDS.nl, 'ancien appareil photo'] } };
const catWords = (k, key) => SOURCE_WORDS[k]?.[key] ?? CAT_WORDS[SOURCES[k].lang]?.[key];

// 只提供連結、在新分頁開啟的平台（網站擋自動讀取，或搜尋結果不準）
export const LINK_SITES = [
  { name: 'Leboncoin', cc: 'FR', url: q => `https://www.leboncoin.fr/recherche?text=${enc(q)}&sort=time` },
  { name: 'Tradera', cc: 'SE', url: q => `https://www.tradera.com/search?q=${enc(q)}&sortBy=AddedOn` },
  { name: 'Huuto.net', cc: 'FI', url: q => `https://www.huuto.net/haku?words=${enc(q)}` },
  { name: 'Allegro', cc: 'PL', url: q => `https://allegro.pl/listing?string=${enc(q)}&order=n` },
  { name: 'Jófogás', cc: 'HU', url: q => `https://www.jofogas.hu/magyarorszag?q=${enc(q)}` },
  { name: 'Wallapop', cc: 'ES', url: q => `https://es.wallapop.com/search?keywords=${enc(q)}&order_by=newest` },
  { name: 'Milanuncios', cc: 'ES', url: q => `https://www.milanuncios.com/anuncios/?s=${enc(q)}&orden=relevance` },
  { name: 'CustoJusto', cc: 'PT', url: q => `https://www.custojusto.pt/portugal/q/${enc(q)}` },
  { name: 'Njuškalo', cc: 'HR', url: q => `https://www.njuskalo.hr/search/?keywords=${enc(q)}&sort=new` },
  { name: 'Bolha', cc: 'SI', url: q => `https://www.bolha.com/search/?keywords=${enc(q)}&sort=new` },
  { name: 'DoneDeal', cc: 'IE', url: q => `https://www.donedeal.ie/all?words=${enc(q)}&sort=publishdatedesc` },
  { name: 'eBay.fr', cc: 'FR', url: q => `https://www.ebay.fr/sch/i.html?_nkw=${enc(q)}&_sop=10` },
  { name: 'eBay.it', cc: 'IT', url: q => `https://www.ebay.it/sch/i.html?_nkw=${enc(q)}&_sop=10` },
  { name: 'eBay.es', cc: 'ES', url: q => `https://www.ebay.es/sch/i.html?_nkw=${enc(q)}&_sop=10` },
  { name: 'eBay UK', cc: 'UK', url: q => `https://www.ebay.co.uk/sch/i.html?_nkw=${enc(q)}&_sop=10` },
  { name: 'Catawiki', cc: 'EU', url: q => `https://www.catawiki.com/en/s?q=${enc(q)}` },
];

// ---------- 小工具 ----------
function enc(q) { return encodeURIComponent(String(q).trim()); }
const num = v => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
const clean = s => (s || '').replace(/\s+/g, ' ').trim();
// rawCount：平台這一頁原本有幾件（過濾掉不相關的之前），用來判斷是不是已經沒有下一頁
// end：平台已經告訴我們這是最後一頁，不用再要下一頁
const withRank = (items, page, rawCount, end) => {
  const out = items.map((it, i) => ({ ...it, rank: i + (page - 1) * 100 }));
  if (rawCount != null) out.rawCount = rawCount;
  if (end) out.end = true;
  return out;
};

// 逐筆解析：某一筆資料格式怪怪的就跳過那一筆，不要讓整個平台失敗；沒有編號的商品也跳過
function mapSafe(arr, fn) {
  return (arr || []).map((x, i) => { try { return fn(x, i); } catch (e) { if (globalThis.__debugParse) console.warn(e); return null; } })
    .filter(it => it && it.id && !/-(undefined|null)?$/.test(it.id));
}

function absUrl(u, base) {
  if (!u) return null;
  if (u.startsWith('//')) return 'https:' + u;
  if (u.startsWith('/')) return base + u;
  return u;
}

export function fmt(n) {
  return n.toLocaleString(locale() === 'en-GB' ? 'en-GB' : 'nl-NL', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
}
const eur = n => `€ ${fmt(n)}`;

// 「1.350 €」「EUR 1.234,56」→ 1350 / 1234.56
function parseEuro(text) {
  const m = (text || '').match(/(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?/);
  if (!m) return null;
  return parseFloat(m[1].replace(/\./g, '') + (m[2] ? '.' + m[2] : ''));
}

// 網站沒有回應時 20 秒後放棄，不要讓這個平台一直顯示「讀取中」
const timeoutSignal = ms => (typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(ms) : undefined);
async function getRes(url, opts = {}) {
  let res;
  try { res = await fetch(url, { credentials: 'include', signal: timeoutSignal(20000), ...opts }); }
  catch (e) { throw new Error(e?.name === 'TimeoutError' ? T`網站沒有回應` : T`連線失敗`); }
  if (!res.ok) throw new Error(T`回應 ${res.status}`);
  return res;
}
async function getHtml(url) {
  return new DOMParser().parseFromString(await (await getRes(url)).text(), 'text/html');
}
async function getJson(url) {
  const res = await getRes(url, { headers: { Accept: 'application/json' } });
  try { return await res.json(); } catch { throw new Error(T`回應格式不對`); }
}

// 只知道日期、不知道時間的商品：當天最後一刻，再依排名往前推一點，保持原本順序
function dayTs(date, rank) {
  const d = new Date(date);
  d.setHours(23, 59, 0, 0);
  return Math.min(d.getTime(), Date.now()) - rank * 1000;
}
const today = () => new Date();
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d; };
const shortDate = ts => new Date(ts).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });

// 標題是否含搜尋字詞之一（不分大小寫、忽略重音）。有些平台連描述一起搜，結果很雜。
const fold = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
export function titleHits(title, q) {
  const words = fold(q).split(/[\s,.;:/()+-]+/).filter(w => w.length >= 3);
  if (!words.length) return true;
  const t = fold(title);
  return words.some(w => t.includes(w));
}

// ---------- 匯率 ----------
// 非歐元國家的價格換算成歐元，價格篩選和行情比價才能放在一起。
// 匯率來自歐洲央行（frankfurter），每 12 小時更新；連不上就用內建的近似值。
const FALLBACK_RATES = { PLN: 4.38, DKK: 7.47, SEK: 11.17, CZK: 24.37, RON: 5.34, HUF: 365, GBP: 0.85, CHF: 0.93, BGN: 1.9558 };
let rates = null, ratesJob = null, ratesAt = 0;
export function ensureRates() {
  // 頁面開很久（例如背景檢查用的隱藏頁面）也要每 12 小時更新一次匯率
  if (rates && Date.now() - ratesAt < 12 * 3600e3) return Promise.resolve(rates);
  if (rates && !ratesJob) { rates = null; }
  ratesAt = Date.now();
  return (ratesJob ||= (async () => {
    try {
      const c = JSON.parse(localStorage.getItem('fxRates') || 'null');
      if (c?.rates && Date.now() - c.at < 12 * 3600e3) return (rates = { ...FALLBACK_RATES, ...c.rates });
    } catch {}
    try {
      const res = await fetch('https://api.frankfurter.dev/v1/latest?base=EUR', { signal: timeoutSignal(8000) });
      if (res.ok) {
        const d = await res.json();
        if (d?.rates) {
          rates = { ...FALLBACK_RATES, ...d.rates };
          try { localStorage.setItem('fxRates', JSON.stringify({ at: Date.now(), rates: d.rates })); } catch {}
          return rates;
        }
      }
    } catch {}
    return (rates = { ...FALLBACK_RATES });
  })().finally(() => { ratesJob = null; }));
}
const rateOf = cur => (!cur || cur === 'EUR' ? 1 : (rates?.[cur] ?? FALLBACK_RATES[cur] ?? null));
export function toEur(amount, cur) {
  if (amount == null) return null;
  const r = rateOf(cur);
  return r ? Math.round((amount / r) * 100) / 100 : null;
}
// 歐元的價格範圍 → 平台當地幣別（放寬一點，最後再用歐元精確篩選）
function localRange(price, cur) {
  let lo = num(price?.min), hi = num(price?.max);
  const r = rateOf(cur);
  if (r && r !== 1) {
    if (lo != null) lo = Math.floor(lo * r * 0.97);
    if (hi != null) hi = Math.ceil(hi * r * 1.03);
  }
  return { lo, hi };
}
function localMoney(amount, cur) {
  try { return new Intl.NumberFormat(locale() === 'en-GB' ? 'en-GB' : 'nl-NL', { style: 'currency', currency: cur, maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount); }
  catch { return `${cur} ${fmt(amount)}`; }
}
// 價格標籤：歐元直接顯示；其他幣別顯示「≈ € 換算價」，當地原價放在 localLabel
function moneyLabel(amount, cur) {
  if (amount == null) return '';
  if (!cur || cur === 'EUR') return eur(amount);
  const e = toEur(amount, cur);
  return e == null ? localMoney(amount, cur) : `≈ ${eur(Math.round(e))}`;
}
const money = (amount, cur) => {
  const foreign = cur && cur !== 'EUR' && amount != null;
  return { price: toEur(amount, cur), currency: cur || 'EUR', localPrice: foreign ? amount : null, localLabel: foreign ? localMoney(amount, cur) : '' };
};

// ---------- Marktplaats / 2dehands（同一家公司，格式相同） ----------
const NL_MONTHS = { jan: 0, feb: 1, mrt: 2, apr: 3, mei: 4, jun: 5, jul: 6, aug: 7, sep: 8, okt: 9, nov: 10, dec: 11 };

function adevintaTs(label, rank) {
  // 「今天」不知道幾點：越前面的估計越新，每往後一名估早 15 分鐘，最早到今天 0 點
  if (/^vandaag$/i.test(label)) {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    return { ts: Math.max(start.getTime() + 60e3, Date.now() - (rank + 1) * 15 * 60e3), label: T`今天` };
  }
  if (/^gisteren$/i.test(label)) return { ts: dayTs(yesterday(), rank), label: T`昨天` };
  const m = (label || '').match(/^(\d{1,2})\s+([a-z]{3})\.?\s+'?(\d{2,4})$/i);
  if (m && NL_MONTHS[m[2].toLowerCase()] != null) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = new Date(y, NL_MONTHS[m[2].toLowerCase()], Number(m[1]));
    return { ts: dayTs(d, rank), label: d.toLocaleDateString(locale(), { day: 'numeric', month: 'short' }) };
  }
  return { ts: null, label: label || '' };
}

async function fetchAdevinta(spec, page, opts, base, name, prefix) {
  const lo = num(opts?.price?.min), hi = num(opts?.price?.max);
  const url = withPrice => `${base}/lrp/api/search?` +
    (spec.l1 ? `l1CategoryId=${spec.l1}&l2CategoryIds=${spec.l2}&` : '') +
    (spec.q || spec.query ? `query=${enc(spec.q || spec.query)}&` : '') +
    (withPrice ? `attributeRanges[]=PriceCents:${lo != null ? Math.round(lo * 100) : 'null'}:${hi != null ? Math.round(hi * 100) : 'null'}&` : '') +
    `limit=40&offset=${(page - 1) * 40}&sortBy=SORT_INDEX&sortOrder=DECREASING`;
  const get = async u => {
    let res;
    try { res = await fetch(u, { credentials: 'include', headers: { Accept: 'application/json' }, signal: timeoutSignal(20000) }); }
    catch (e) { throw new Error(e?.name === 'TimeoutError' ? T`網站沒有回應` : T`連線失敗`); }
    if (!res.ok) throw new Error(T`回應 ${res.status}`);
    let data;
    try { data = await res.json(); } catch { throw new Error(T`回應格式不對`); }
    return parseAdevinta(data, base, name, prefix);
  };
  if (lo == null && hi == null) return withRank(await get(url(false)), page);
  // 設了價格時，平台會把「出價」（沒有標價）的商品全部濾掉。
  // 另外不帶價格再查一次，只留下這些出價商品，之後再到商品頁讀最低出價。
  const [priced, all] = await Promise.all([get(url(true)), get(url(false))]);
  const bids = all.filter(it => it.openPrice);
  // 有價格的結果不滿一頁就是最後一頁（不帶價格的那組會一直有，不能拿來判斷）
  return withRank([...priced, ...bids], page, priced.length + all.length, priced.length < 40);
}

export function parseAdevinta(data, base, name, prefix) {
  return mapSafe(data?.listings, (l, i) => {
    const cents = l.priceInfo?.priceCents;
    const type = l.priceInfo?.priceType;
    const price = typeof cents === 'number' && cents > 0 ? cents / 100 : null;
    let priceLabel = price != null ? eur(price) : '';
    if (type === 'FAST_BID' || type === 'MIN_BID') priceLabel = price != null ? T`${eur(price)} 起標` : T`出價`;
    else if (type === 'SEE_DESCRIPTION') priceLabel = T`見描述`;
    else if (type === 'RESERVED') priceLabel = T`已保留`;
    else if (type === 'FREE') priceLabel = T`免費`;
    else if (type === 'EXCHANGE') priceLabel = T`交換`;
    else if (!priceLabel) priceLabel = T`價格未標`;
    const attr = k => (l.attributes || []).find(a => a.key === k)?.value || '';
    const delivery = attr('delivery');
    const shipping = /verzenden/i.test(delivery) ? 'yes' : /ophalen/i.test(delivery) ? 'no' : null;
    const cond = { 'Nieuw': T`全新`, 'Zo goed als nieuw': T`近全新`, 'Gebruikt': T`二手`, 'Niet werkend': T`故障` }[attr('condition')] || '';
    const { ts, label } = adevintaTs(l.date, i);
    const pic = l.pictures?.[0];
    // 價格未定：只寫「出價」或「見描述」，價格篩選時不要把它們濾掉
    const openPrice = price == null && (type === 'FAST_BID' || type === 'MIN_BID' || type === 'SEE_DESCRIPTION');
    return {
      id: prefix + '-' + l.itemId,
      openPrice,
      bidCheck: openPrice && type !== 'SEE_DESCRIPTION', // 可以到商品頁讀最低出價、目前最高出價
      source: name,
      title: l.title || '',
      price,
      total: null,
      currency: 'EUR',
      priceLabel,
      url: absUrl(l.vipUrl, base),
      image: absUrl(pic?.mediumUrl || pic?.largeUrl || l.imageUrls?.[0], base),
      imageLarge: absUrl(pic?.extraExtraLargeUrl || pic?.largeUrl || pic?.mediumUrl, base),
      location: [l.location?.cityName, cond].filter(Boolean).join(' · '),
      dateLabel: label,
      ts,
      shipping,
      extra: shipping === 'yes' ? T`可寄送` : shipping === 'no' ? T`僅面交` : '',
      isAuction: type === 'FAST_BID' || type === 'MIN_BID',
      rank: i,
    };
  });
}

// 「出價」商品：列表沒有價格，到商品頁讀賣家設的最低出價和目前最高出價
const bidCache = new Map();
function jsonAt(html, key) {
  const i = html.indexOf(key);
  if (i < 0) return null;
  const start = i + key.length;
  let depth = 0, inStr = false, esc = false, j = start;
  for (; j < html.length; j++) {
    const c = html[j];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') { depth--; if (depth === 0) break; }
  }
  try { return JSON.parse(html.slice(start, j + 1)); } catch { return null; }
}
export function parseBidInfo(html) {
  const b = jsonAt(html, '"bidsInfo":');
  if (!b) return null;
  const values = (b.bids || []).map(x => Number(x.value)).filter(v => v > 0);
  return {
    min: b.currentMinimumBid > 0 ? b.currentMinimumBid / 100 : null,
    top: values.length ? Math.max(...values) / 100 : null,
    n: values.length,
  };
}
async function bidInfo(it) {
  const c = bidCache.get(it.id);
  if (c && Date.now() - c.at < 10 * 60e3) return c.info;
  const info = parseBidInfo(await (await getRes(it.url)).text());
  bidCache.set(it.id, { at: Date.now(), info });
  return info;
}
function applyBid(it, info) {
  it.bidChecked = true;
  if (!info) return;
  it.isAuction = true; // 出價中的價格不是成交價，不列入行情
  if (info.top) {
    it.price = info.top;
    it.priceLabel = T`最高出價 ${eur(info.top)}`;
    it.extra = [T`${info.n} 次出價`, it.extra].filter(Boolean).join(' · ');
  } else if (info.min) {
    it.price = info.min;
    it.priceLabel = T`最低出價 ${eur(info.min)}`;
  } else {
    it.priceLabel = T`出價（無底價）`;
  }
}
// 一次最多查 limit 件，同時 3 個；每查完幾件呼叫 onUpdate 讓畫面更新
export async function checkBids(items, onUpdate, limit = 40, isStale) {
  const todo = items.filter(it => it.bidCheck && !it.bidChecked).slice(0, limit);
  if (!todo.length) return 0;
  let next = 0, done = 0;
  const worker = async () => {
    while (next < todo.length && !isStale?.()) {
      const it = todo[next++];
      try { applyBid(it, await bidInfo(it)); } catch { it.bidChecked = true; }
      if (++done % 6 === 0) onUpdate?.();
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  if (!isStale?.()) onUpdate?.();
  return done;
}

// ---------- Vinted ----------
// Vinted 歐洲各國共用同一個商品庫，查荷蘭站就涵蓋其他國家。
// 商品資料嵌在搜尋頁的 HTML 裡；列表沒有上架時間。
async function fetchVinted(spec, page, opts) {
  const lo = num(opts?.price?.min), hi = num(opts?.price?.max);
  const parts = [];
  (spec.catalogs || []).forEach(c => parts.push('catalog[]=' + c));
  if (spec.q) parts.push('search_text=' + enc(spec.q));
  if (lo != null) parts.push('price_from=' + lo);
  if (hi != null) parts.push('price_to=' + hi);
  if (lo != null || hi != null) parts.push('currency=EUR');
  parts.push('order=newest_first', 'page=' + page);
  const url = 'https://www.vinted.nl/catalog?' + parts.join('&');
  return withRank(parseVinted(await vintedItems(url, opts?.background, opts?.isStale)), page);
}

// Vinted 有防機器人機制，常常擋掉插件直接送出的請求。依序嘗試：
// 1. 直接讀取  2. 在看不見的框架裡打開頁面讀取  3. 請背景程式在最小化視窗裡讀取
// 同一個網址 5 分鐘內重用結果，切換價格再切回來不用重讀。
const vintedCache = new Map();
async function vintedItems(url, background, isStale) {
  const hit = vintedCache.get(url);
  if (hit && Date.now() - hit.at < 5 * 60e3) return hit.items;
  const items = await vintedLoad(url, background, isStale);
  vintedCache.set(url, { at: Date.now(), items });
  return items;
}

async function vintedLoad(url, background, isStale) {
  let why = '';
  const direct = async () => {
    const res = await fetch(url, { credentials: 'include', signal: timeoutSignal(20000) });
    if (!res.ok) return { why: T`直接讀取回應 ${res.status}` };
    const html = await res.text();
    const list = extractVintedItems(html);
    if (list) return { list };
    // Vinted 的登入狀態過期時會先轉到「session-refresh」頁面，那一頁沒有商品
    const expired = /session-refresh/.test(res.url) || /<title>Session refresh/i.test(html);
    return { why: T`頁面裡找不到商品資料`, expired };
  };
  try {
    let r = await direct();
    if (r.list) return r.list;
    if (r.expired) {
      // 跟 Vinted 網頁一樣，先更新登入狀態再讀一次
      await fetch('https://www.vinted.nl/web/api/auth/refresh', { method: 'POST', credentials: 'include', signal: timeoutSignal(10000) }).catch(() => {});
      r = await direct();
      if (r.list) return r.list;
    }
    why = r.why;
  } catch (e) {
    why = T`直接讀取失敗`;
  }
  const f = await readViaFrame(url, isStale);
  if (f?.items) return f.items;
  if (f?.blocked) throw new Error(T`Vinted 要求人機驗證，請在 Chrome 打開 vinted.nl 完成驗證後再試`);
  // 背景追蹤不開視窗；只有你自己在搜尋頁操作時才用最小化視窗當最後手段
  if (background) throw new Error(T`背景檢查暫時讀不到 Vinted，下次檢查會再試`);
  // 你已經換了分類或價格：這次的結果用不到了，不要再開視窗
  if (isStale?.()) throw new Error(T`已取消`);
  const r = await chrome.runtime.sendMessage({ type: 'vintedViaTab', url, background: false });
  if (r?.items) return r.items;
  throw new Error(T`${r?.error || tr('讀不到商品')}（${why}）`);
}

// 在目前頁面放一個看不見的框架打開網頁（Vinted、eBay），由 frame-reader.js 讀出資料傳回來。
// 框架裡網站自己的程式不執行，只讀 HTML；同時最多 2 個框架，避免拖慢瀏覽器。
let frameSlots = 2;
const frameWaiters = [];
// 用完的名額直接交給排隊中的下一個，避免同時超過 2 個框架
function releaseFrameSlot() {
  const next = frameWaiters.shift();
  if (next) next(); else frameSlots++;
}
// scripts：讓網站自己的程式在框架裡執行（只有 Vatera 需要，它要先跑一段防機器人檢查才給看資料）
async function readViaFrame(url, isStale, { scripts = false, timeout = 20000 } = {}) {
  if (typeof document === 'undefined' || !document.body || !chrome.runtime?.onMessage) return null;
  if (isStale?.()) return null;
  if (frameSlots > 0) frameSlots--;
  else await new Promise(r => frameWaiters.push(r));
  // 排隊期間你換了分類或價格：不用讀了，名額讓給下一個
  if (isStale?.()) { releaseFrameSlot(); return null; }
  const req = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const frame = document.createElement('iframe');
  frame.name = 'gs-' + req;
  frame.setAttribute('aria-hidden', 'true');
  // 框架不能開新視窗、也不能把插件頁面導到 Vinted
  frame.setAttribute('sandbox', scripts ? 'allow-same-origin allow-scripts' : 'allow-same-origin');
  frame.tabIndex = -1;
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;height:600px;border:0;opacity:0;pointer-events:none;';
  try {
    return await new Promise(resolve => {
      const done = v => { chrome.runtime.onMessage.removeListener(onMsg); clearTimeout(timer); resolve(v); };
      const onMsg = msg => { if (msg?.type === 'pageFrame' && msg.req === req) done(msg); };
      const timer = setTimeout(() => done(null), timeout);
      chrome.runtime.onMessage.addListener(onMsg);
      // 框架載完後最多再等 8 秒（資料讀取會重試幾次），沒有回應就換下一個方法
      // 要跑檢查程式的網站會重新載入一次，等久一點
      frame.addEventListener('load', () => setTimeout(() => done(null), scripts ? 15000 : 8000), { once: true });
      frame.src = url;
      document.body.append(frame);
    });
  } finally {
    frame.remove();
    releaseFrameSlot();
  }
}

export function extractVintedItems(html) {
  const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
  let m, flight = '';
  while ((m = re.exec(html))) {
    try { flight += JSON.parse(m[1]); } catch {}
  }
  const key = '"items":{"items":[';
  const i = flight.indexOf(key);
  if (i < 0) return null;
  const start = i + key.length - 1;
  let depth = 0, inStr = false, esc = false, j = start;
  for (; j < flight.length; j++) {
    const c = flight[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') { depth--; if (depth === 0) break; }
  }
  try { return JSON.parse(flight.slice(start, j + 1)); } catch { return null; }
}

const VINTED_COND = { 'Nieuw met prijskaartje': '全新附吊牌', 'Nieuw zonder prijskaartje': '全新無吊牌', 'Heel goed': '很好', 'Goed': '良好', 'Redelijk': '尚可' };

export function parseVinted(list) {
  return mapSafe((list || [])
    .filter(Boolean)
    .map(x => x.productItem || x)
    .filter(it => it && it.id && it.title), (it, i) => {
      const amount = it.priceWithDiscount?.amount ?? it.price?.amount;
      let price = amount != null ? parseFloat(amount) : null;
      if (Number.isNaN(price)) price = null;
      const currency = it.price?.currencyCode || 'EUR';
      let total = it.totalItemPrice?.amount ? parseFloat(it.totalItemPrice.amount) : null;
      if (Number.isNaN(total)) total = null;
      const cond = it.itemBox?.secondLine || '';
      return {
        id: 'vt-' + it.id,
        source: 'Vinted',
        title: it.title || '',
        ...money(price, currency),
        total: total && price != null && total !== price ? toEur(total, currency) : null,
        totalNote: T`含買家保護費，不含運費`,
        priceLabel: price != null ? moneyLabel(price, currency) : T`價格未標`,
        url: absUrl(it.url, 'https://www.vinted.nl') || `https://www.vinted.nl/items/${it.id}`,
        image: it.thumbnailUrl || it.photos?.[0]?.url || null,
        imageLarge: it.photos?.[0]?.url || it.thumbnailUrl || null,
        location: VINTED_COND[cond] ? tr(VINTED_COND[cond]) : cond,
        dateLabel: it.isPromoted ? T`推廣` : '',
        ts: null,
        vintedId: Number(it.id),
        shipping: 'yes',
        extra: '',
        rank: i,
      };
    });
}

// ---------- Kleinanzeigen ----------
async function fetchKleinanzeigen(spec, page, opts) {
  const lo = num(opts?.price?.min), hi = num(opts?.price?.max);
  const seite = (page > 1 ? `seite:${page}/` : '') + (lo != null || hi != null ? `preis:${lo ?? ''}:${hi ?? ''}/` : '');
  let url;
  if (spec.search != null) {
    const slug = enc(spec.search.trim().replace(/\s+/g, '-'));
    url = `https://www.kleinanzeigen.de/s-sortierung:neuste/${seite}${slug}/k0`;
  } else {
    const tail = spec.q ? `${enc(spec.q)}/k0${spec.c}` : `${spec.slug}/${spec.c}`;
    url = `https://www.kleinanzeigen.de/${spec.path}/sortierung:neuste/${seite}${tail}${spec.attr ? '+' + spec.attr : ''}`;
  }
  return withRank(parseKleinanzeigen(await getHtml(url)), page);
}

// Kleinanzeigen 顯示的是德國時間；用德國時區換算，人在別的時區也不會算錯（例如在台灣）
function berlinParts(ts) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(ts)).map(x => [x.type, Number(x.value)]));
  return p;
}
function berlinTs(y, mo, d, h, mi) {
  // 先當成 UTC，再減去德國當時和 UTC 的時差
  const guess = Date.UTC(y, mo, d, h, mi);
  const p = berlinParts(guess);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return guess - (asUtc - guess);
}
function kaTs(date, rank) {
  let m = date.match(/^(Heute|Gestern),\s*(\d{1,2}):(\d{2})/);
  if (m) {
    try {
      const b = berlinParts(Date.now() - (m[1] === 'Gestern' ? 86400e3 : 0));
      const ts = Math.min(berlinTs(b.year, b.month - 1, b.day, Number(m[2]), Number(m[3])), Date.now());
      return { ts, exact: true };
    } catch {
      const d = m[1] === 'Heute' ? today() : yesterday();
      d.setHours(Number(m[2]), Number(m[3]), 0, 0);
      return { ts: Math.min(d.getTime(), Date.now()), exact: true };
    }
  }
  m = date.match(/^(\d{2})\.(\d{2})\.(\d{4})/);
  if (m) return { ts: dayTs(new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])), rank), exact: false };
  return { ts: null, exact: false };
}

export function parseKleinanzeigen(doc) {
  return mapSafe([...doc.querySelectorAll('article[data-adid]')], (a, i) => {
    const spans = [...a.querySelectorAll('span')].map(s => clean(s.textContent));
    const location = spans.find(t => /^\d{5}\s/.test(t)) || '';
    const date = spans.find(t => /^(Heute|Gestern|\d{2}\.\d{2}\.\d{4})/.test(t)) || '';
    // 價格欄：新版網頁是粗體大字的 <p>，舊版有專用 class；描述也是 <p>，不能誤抓描述裡的「Neupreis 2.500 €」
    const priceEl = a.querySelector('p[class*="text-title3"], p[class*="font-strong"], [class*="price-shipping--price"], .aditem-main--middle--price');
    const priceText = (priceEl && clean(priceEl.textContent)) ||
      [...a.querySelectorAll('p')].map(p => clean(p.textContent)).find(t => /^(\d[\d.]*\s*€|VB$|zu verschenken)/i.test(t) || /€\s*(VB)?$/.test(t)) || '';
    const price = /verschenken/i.test(priceText) ? 0 : parseEuro(priceText);
    const shipping = /Versand möglich/.test(a.textContent) ? 'yes' : 'no';
    if (!date) return null; // 沒有日期的是付費置頂廣告（多半是收購廣告），略過
    const img = a.querySelector('img');
    const srcset = img?.getAttribute('srcset')?.split(/\s+/)[0];
    const { ts, exact } = kaTs(date, i);
    const d = ts ? new Date(ts) : null;
    return {
      id: 'ka-' + a.dataset.adid,
      source: 'Kleinanzeigen',
      title: clean(a.querySelector('h3')?.textContent || a.querySelector('img')?.alt),
      price,
      total: null,
      currency: 'EUR',
      priceLabel: price === 0 ? T`免費` : price != null ? (/VB/.test(priceText) ? T`${eur(price)}（可議）` : eur(price)) : /^VB$/.test(priceText) ? T`可議價` : (priceText || T`價格未標`),
      openPrice: price == null && /^VB$/.test(priceText),
      url: absUrl(a.dataset.href, 'https://www.kleinanzeigen.de'),
      image: srcset || img?.getAttribute('src') || null,
      imageLarge: (srcset || img?.getAttribute('src') || '').replace(/rule=\$_\d+\.AUTO/, 'rule=$_59.AUTO') || null,
      location: location.replace(/^\d{5}\s/, ''),
      dateLabel: exact ? relTime(ts) : d ? d.toLocaleDateString(locale(), { day: 'numeric', month: 'short' }) : date,
      ts,
      shipping,
      extra: shipping === 'yes' ? T`可寄送` : T`僅面交`,
      rank: i,
    };
  }).filter(it => it && it.title);
}


// ---------- eBay 德國 ----------
async function fetchEbay(spec, page, opts) {
  const lo = num(opts?.price?.min), hi = num(opts?.price?.max);
  const url = `https://www.ebay.de/sch/i.html?_nkw=${enc(spec.q)}` +
    (spec.cat ? `&_sacat=${spec.cat}` : '') +
    `&_sop=10&_ipg=60&_pgn=${page}` +
    (opts?.used ? '&LH_ItemCondition=3000' : '') + // 3000：只看二手
    (lo != null ? `&_udlo=${lo}` : '') + (hi != null ? `&_udhi=${hi}` : '');
  // eBay 擋人時常回 403，或一個「請稍候」的頁面（狀態碼 200），裡面沒有商品也沒有「找不到結果」的提示
  const noResultsPage = doc => !!doc.querySelector('.srp-save-null-search, .srp-river-answer--NO_ANSWER, .s-message') ||
    /keine exakten treffer|0 ergebnisse/i.test(doc.body?.textContent || '');
  const tryDirect = async () => {
    const doc = await getHtml(url);
    const items = parseEbay(doc);
    // 第一頁什麼都沒有又沒寫「找不到結果」，多半是被擋；後面的頁數空了就是沒有更多
    if (!items.length && page === 1 && !noResultsPage(doc)) throw new Error(T`頁面裡找不到商品資料`);
    return items;
  };
  const done = items => withRank(items, page, null, items.length < 50);
  let firstErr;
  // 第一次被擋時 eBay 通常會順便設好 cookie，馬上再試一次多半就成功
  for (let i = 0; i < 2; i++) {
    try { return done(await tryDirect()); } catch (e) { firstErr ||= e; }
    if (opts?.isStale?.()) throw firstErr;
    await new Promise(r => setTimeout(r, 400));
  }
  // 還是不行：改在看不見的框架裡打開頁面讀取
  const f = await readViaFrame(url, opts?.isStale);
  if (f?.html) {
    const doc = new DOMParser().parseFromString(f.html, 'text/html');
    const items = parseEbay(doc);
    if (items.length || noResultsPage(doc) || page > 1) return done(items);
  }
  if (f?.blocked) throw new Error(T`eBay 要求人機驗證，請在 Chrome 打開 ebay.de 完成驗證後再試`);
  if (/403/.test(firstErr?.message || '')) throw new Error(T`eBay 暫時擋住了讀取，請在 Chrome 打開 ebay.de 一次再試`);
  throw firstErr;
}

// eBay 的上架時間有兩種寫法：「Vor 3 Std. eingestellt」或「16. Oct. 22:47」（德國時間）
const EBAY_MONTHS = { jan: 0, feb: 1, mar: 2, mär: 2, apr: 3, may: 4, mai: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, okt: 9, nov: 10, dec: 11, dez: 11 };
function ebayTs(rows) {
  for (const r of rows) {
    let m = r.match(/^Vor (\d+) (Min|Std|T)\./);
    if (m) return Date.now() - Number(m[1]) * { Min: 60e3, Std: 3600e3, T: 86400e3 }[m[2]];
    m = r.match(/^(\d{1,2})\.\s*([A-Za-zÄäÖöÜü]{3})[a-zäöü]*\.?\s+(\d{1,2}):(\d{2})$/);
    if (m && EBAY_MONTHS[m[2].toLowerCase()] != null) {
      const now = new Date();
      let ts = berlinTs(now.getFullYear(), EBAY_MONTHS[m[2].toLowerCase()], Number(m[1]), Number(m[3]), Number(m[4]));
      if (ts > Date.now() + 86400e3) ts = berlinTs(now.getFullYear() - 1, EBAY_MONTHS[m[2].toLowerCase()], Number(m[1]), Number(m[3]), Number(m[4]));
      return Math.min(ts, Date.now());
    }
  }
  return null;
}

// 標題欄有時先放「Neues Angebot」之類的小標籤，真正的標題在最後一個文字區塊
const EBAY_BADGE = /^(neues angebot|new listing|nouvelle annonce|nuova inserzione|nuevo anuncio)$/i;
function ebayTitle(c) {
  const box = c.querySelector('.s-card__title');
  if (!box) return '';
  const parts = [...box.querySelectorAll('span')]
    .filter(s => !s.querySelector('span') && !s.classList.contains('clipped'))
    .map(s => clean(s.textContent))
    .filter(t => t && !EBAY_BADGE.test(t));
  return parts.length ? parts[parts.length - 1] : clean(box.textContent).replace(/^(Neues Angebot|New listing)\s*/i, '');
}

export function parseEbay(doc) {
  const seen = new Set();
  return mapSafe([...doc.querySelectorAll('li.s-card[data-listingid]')], (c, i) => {
    const id = c.dataset.listingid;
    const title = ebayTitle(c);
    if (!title || /^Shop on eBay$/i.test(title) || seen.has(id)) return null;
    seen.add(id);
    const priceText = clean(c.querySelector('.s-card__price')?.textContent);
    const rows = [...c.querySelectorAll('.s-card__attribute-row, .s-card__subtitle')].map(x => clean(x.textContent));
    const condition = (rows.find(r => /\|/.test(r) || /Gebraucht|Neu|Ersatzteile/.test(r)) || '').split('|')[0].trim();
    const ship = rows.find(r => /Lieferung|Versand/.test(r)) || '';
    const from = rows.find(r => /^aus /.test(r)) || '';
    const age = rows.find(r => /eingestellt/.test(r)) || '';
    const bids = rows.find(r => /Gebot/.test(r)) || '';
    const img = c.querySelector('img');
    const imgUrl = (img?.getAttribute('src') || img?.dataset.deferLoad || '').replace(/s-l\d+\./, 's-l500.') || null;
    const condMap = { 'Gebraucht': '二手', 'Neu': '全新', 'Nur Ersatzteile': '零件機', 'Neu: Sonstige': '全新（其他）', 'Generalüberholt': '整新' };
    const cond = condMap[condition] ? tr(condMap[condition]) : condition;
    const price = parseEuro(priceText);
    let shipCost = null, shipLabel = '';
    const sm = ship.match(/^\+EUR\s*([\d.,]+)\s*(Lieferung|Versand)/);
    if (sm) { shipCost = parseEuro(sm[1]); shipLabel = T`運費 ${eur(shipCost)}`; }
    else if (/Kostenlos/i.test(ship)) { shipCost = 0; shipLabel = T`免運`; }
    else if (/Keine Angaben/i.test(ship)) shipLabel = T`未標運費`;
    const ts = ebayTs(age ? [age, ...rows] : rows);
    return {
      id: 'eb-' + id,
      source: 'eBay',
      title,
      price,
      total: price != null && shipCost ? price + shipCost : null,
      totalNote: T`含運費`,
      currency: 'EUR',
      priceLabel: /bis/.test(priceText) ? priceText.replace(/EUR\s*/g, '€ ').replace('bis', '–')
        : price != null ? eur(price) : (priceText || T`價格未標`),
      url: `https://www.ebay.de/itm/${id}`,
      image: imgUrl,
      imageLarge: imgUrl ? imgUrl.replace(/s-l\d+\./, 's-l1200.') : null,
      location: [cond, from ? T`來自 ${from.replace(/^aus /, '')}` : ''].filter(Boolean).join(' · '),
      dateLabel: ts ? relTime(ts) : '',
      ts,
      shipping: shipCost != null || /Lieferung|Versand/.test(ship) ? 'yes' : null,
      extra: [bids ? (/^0\b/.test(bids) ? T`拍賣` : T`${bids.replace(/\s*Gebote?/, '')} 次出價`) : '', shipLabel].filter(Boolean).join(' · '),
      isAuction: !!bids,
      rank: i,
    };
  }).filter(Boolean);
}

// ---------- Vatera（匈牙利） ----------
// 搜尋頁 HTML；ob=5&obd=2 是「最新優先」，p1/p2 是福林價格範圍，每頁 50 件
async function fetchVatera(q, page, opts) {
  const { lo, hi } = localRange(opts?.price, 'HUF');
  const url = `https://www.vatera.hu/listings/index.php?q=${enc(q)}&c=0&ob=5&obd=2&p=${page}` +
    (lo != null ? `&p1=${lo}` : '') + (hi != null ? `&p2=${hi}` : '');
  let doc;
  try {
    doc = await getHtml(url);
    if (!doc.querySelector('div.prod[data-product-id]') && !doc.querySelector('.product_link, #searchQuery')) throw new Error(T`頁面裡找不到商品資料`);
  } catch (e) {
    // 直接讀取被擋時，改在看不見的框架裡打開頁面讀取
    // Vatera 的安全檢查要在一般分頁裡跑一次（之後約一段時間內都有效），框架裡跑不了
    const f = await readViaFrame(url, opts?.isStale);
    if (!f?.html) throw new Error(T`Vatera 需要先通過它的安全檢查：在 Chrome 打開 vatera.hu，等首頁出現後回來再搜尋一次`);
    doc = new DOMParser().parseFromString(f.html, 'text/html');
  }
  const items = parseVatera(doc);
  const raw = doc.querySelectorAll('div.prod[data-product-id]').length;
  return withRank(items, page, raw, raw < 50);
}

export function parseVatera(doc) {
  return mapSafe([...doc.querySelectorAll('div.prod[data-product-id]')], (p, i) => {
    if (p.dataset.expired === '1') return null;
    const amount = num(p.dataset.gtmPrice);
    const auction = p.dataset.gtmAuctionType === 'bid';
    const info = clean(p.querySelector('.additional-info')?.textContent);
    const loc = (info.match(/Termék helye:\s*(.+?)(?:\s+Eladó:|$)/) || [])[1] || '';
    const condRaw = (info.match(/Állapot:\s*(\S+)/) || [])[1] || '';
    const cond = { 'használt': '二手', 'új': '全新', 'újszerű': '近全新' }[condRaw.toLowerCase()];
    const bids = (clean(p.querySelector('.auction-info')?.textContent).match(/licitek száma:\s*(\d+)/i) || [])[1];
    const free = p.dataset.gtmFreeshipping === '1';
    const img = p.querySelector('img[data-original]')?.getAttribute('data-original') || p.querySelector('img')?.getAttribute('src');
    const id = p.dataset.productId;
    const price = amount > 0 ? amount : null;
    return {
      id: 'vat-' + id,
      source: 'Vatera',
      title: p.dataset.gtmName || clean(p.querySelector('.product_link h3')?.textContent),
      ...money(price, 'HUF'),
      total: null,
      priceLabel: price != null ? moneyLabel(price, 'HUF') : T`價格未標`,
      url: p.querySelector('a.product_link')?.href || `https://www.vatera.hu/${id}.html`,
      image: img && !/no_picture/.test(img) ? img : null,
      imageLarge: img && !/no_picture/.test(img) ? img.replace(/resize\.width=\d+/, 'resize.width=1000') : null,
      location: [loc, cond ? tr(cond) : condRaw].filter(Boolean).join(' · '),
      dateLabel: '',
      ts: null,
      shipping: free ? 'yes' : null,
      extra: [auction ? (bids ? T`${bids} 次出價` : T`拍賣`) : '', free ? T`免運` : ''].filter(Boolean).join(' · '),
      isAuction: auction,
      rank: i,
    };
  }).filter(it => it && it.title);
}

// ---------- DBA（丹麥）/ Blocket（瑞典）/ Tori（芬蘭）：同一家公司，格式相同 ----------
const FINN = { dba: 'https://www.dba.dk', blocket: 'https://www.blocket.se', tori: 'https://www.tori.fi' };

async function fetchFinn(key, q, page, opts) {
  const s = SOURCES[key];
  const { lo, hi } = localRange(opts?.price, s.cur);
  const url = `${FINN[key]}/recommerce/forsale/search/api/search/SEARCH_ID_BAP_COMMON?q=${enc(q)}&sort=PUBLISHED_DESC&page=${page}` +
    (lo != null ? `&price_from=${lo}` : '') + (hi != null ? `&price_to=${hi}` : '');
  const data = await getJson(url);
  const last = data?.metadata?.paging?.last;
  if (last != null && page > last) return withRank([], page, 0); // 超過最後一頁，平台會重複給最後一頁
  return withRank(parseFinn(data, key), page, null, last != null && page >= last);
}

export function parseFinn(data, key) {
  const s = SOURCES[key];
  return mapSafe((data?.docs || []).filter(d => d?.heading), (d, i) => {
    const amount = typeof d.price?.amount === 'number' && d.price.amount > 0 ? d.price.amount : null;
    const cur = d.price?.currency_code || s.cur;
    const ship = (d.flags || []).includes('shipping_exists') || (d.labels || []).some(l => l.id === 'fiks_ferdig') ? 'yes' : null;
    const ts = typeof d.timestamp === 'number' ? d.timestamp : null;
    const img = d.image?.url || d.image_urls?.[0] || null;
    const shop = (d.flags || []).includes('retailer') ? tr('商家') : '';
    return {
      id: key + '-' + (d.ad_id || d.id),
      source: s.name,
      title: d.heading,
      ...money(amount, cur),
      total: null,
      priceLabel: amount != null ? moneyLabel(amount, cur) : T`價格未標`,
      url: d.canonical_url || `${FINN[key]}/recommerce/forsale/item/${d.ad_id || d.id}`,
      image: img,
      imageLarge: img,
      location: [d.location, shop].filter(Boolean).join(' · '),
      dateLabel: ts ? relTime(ts) : '',
      ts,
      shipping: ship,
      extra: ship ? T`可寄送` : '',
      rank: i,
    };
  });
}

// ---------- willhaben（奧地利） ----------
// 商品資料在搜尋頁 HTML 裡的 __NEXT_DATA__
async function fetchWillhaben(q, page, opts) {
  const lo = num(opts?.price?.min), hi = num(opts?.price?.max);
  const url = `https://www.willhaben.at/iad/kaufen-und-verkaufen/marktplatz?keyword=${enc(q)}&sort=1&rows=30&page=${page}` +
    (lo != null ? `&PRICE_FROM=${lo}` : '') + (hi != null ? `&PRICE_TO=${hi}` : '');
  const html = await (await getRes(url)).text();
  const items = parseWillhaben(html, page);
  return withRank(items, page, null, items.length < 30);
}

export function parseWillhaben(html, page = 1) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error(T`頁面裡找不到商品資料`);
  let sr;
  try { sr = JSON.parse(m[1])?.props?.pageProps?.searchResult; } catch { throw new Error(T`頁面裡找不到商品資料`); }
  if (!sr) throw new Error(T`頁面裡找不到商品資料`);
  // 超過最後一頁：平台會重複給最後一頁
  if (sr.rowsFound != null && sr.rowsRequested && page > Math.ceil(sr.rowsFound / sr.rowsRequested)) return [];
  return mapSafe(sr.advertSummaryList?.advertSummary, (a, i) => {
    const at = {};
    for (const x of a.attributes?.attribute || []) at[x.name] = x.values?.[0];
    const amount = num(at.PRICE);
    const ts = num(at.PUBLISHED) || Date.parse(at.PUBLISHED_String) || null;
    const ship = at.p2penabled === 'true' ? 'yes' : null;
    const img = a.advertImageList?.advertImage?.[0];
    return {
      id: 'wh-' + a.id,
      source: 'willhaben',
      title: at.HEADING || a.description || '',
      price: amount > 0 ? amount : null,
      total: null,
      currency: 'EUR',
      priceLabel: amount > 0 ? eur(amount) : amount === 0 ? T`免費` : (at.PRICE_FOR_DISPLAY || T`價格未標`),
      url: at.SEO_URL ? 'https://www.willhaben.at/iad/' + at.SEO_URL.replace(/^\//, '') : `https://www.willhaben.at/iad/object?adId=${a.id}`,
      image: img?.thumbnailImageUrl || img?.mainImageUrl || null,
      imageLarge: img?.mainImageUrl || img?.referenceImageUrl || null,
      location: at.LOCATION || '',
      dateLabel: ts ? relTime(ts) : '',
      ts,
      shipping: ship,
      extra: ship ? T`可寄送` : '',
      rank: i,
    };
  }).filter(it => it.title);
}

// ---------- OLX（波蘭、葡萄牙、羅馬尼亞、保加利亞） ----------
// OLX 連商品描述一起搜，結果很雜：只留標題含搜尋字詞的
const OLX = { olx_pl: 'www.olx.pl', olx_pt: 'www.olx.pt', olx_ro: 'www.olx.ro', olx_bg: 'www.olx.bg' };

async function fetchOlx(key, q, page, opts) {
  const s = SOURCES[key];
  const { lo, hi } = localRange(opts?.price, s.cur);
  const url = `https://${OLX[key]}/api/v1/offers/?offset=${(page - 1) * 40}&limit=40&query=${enc(q)}&sort_by=created_at%3Adesc` +
    (lo != null ? `&filter_float_price:from=${lo}` : '') + (hi != null ? `&filter_float_price:to=${hi}` : '');
  const data = await getJson(url);
  const all = parseOlx(data, key);
  return withRank(all.filter(it => titleHits(it.title, q)), page, all.length, all.length < 40);
}

export function parseOlx(data, key) {
  const s = SOURCES[key];
  return mapSafe(data?.data, (x, i) => {
    const param = k => (x.params || []).find(p => p.key === k)?.value;
    const pv = param('price');
    const cur = pv?.currency || s.cur;
    const amount = typeof pv?.value === 'number' && pv.value > 0 ? pv.value : null;
    let priceLabel;
    if (amount != null) priceLabel = pv.negotiable ? T`${moneyLabel(amount, cur)}（可議）` : moneyLabel(amount, cur);
    else if (pv?.type === 'exchange') priceLabel = T`交換`;
    else if (pv?.type === 'free') priceLabel = T`免費`;
    else priceLabel = T`價格未標`;
    const ts = Date.parse(x.created_time) || null;
    const ship = x.delivery?.rock?.active ? 'yes' : null;
    const img = x.photos?.[0]?.link;
    return {
      id: key + '-' + x.id,
      source: s.name,
      title: x.title || '',
      ...money(amount, cur),
      total: null,
      priceLabel,
      url: x.url || `https://${OLX[key]}/`,
      image: img ? img.replace('{width}x{height}', '400x400') : null,
      imageLarge: img ? img.replace('{width}x{height}', '1000x1000') : null,
      location: [x.location?.city?.name, param('state')?.label].filter(Boolean).join(' · '),
      dateLabel: ts ? relTime(ts) : '',
      ts,
      shipping: ship,
      extra: ship ? T`可寄送` : '',
      rank: i,
    };
  }).filter(it => it.title);
}

// ---------- Subito（義大利） ----------
// qso=true：只搜標題（不然會搜到描述裡順便提到的東西）
async function fetchSubito(q, page, opts) {
  const lo = num(opts?.price?.min), hi = num(opts?.price?.max);
  const url = `https://hades.subito.it/v1/search/items?q=${enc(q)}&t=s&qso=true&lim=30&start=${(page - 1) * 30}&sort=datedesc` +
    (lo != null ? `&ps=${Math.floor(lo)}` : '') + (hi != null ? `&pe=${Math.ceil(hi)}` : '');
  const items = parseSubito(await getJson(url));
  return withRank(items, page, null, items.length < 30);
}

// 「1.200」「7,99」「6.90」都要正確：點後面剛好三位數才是千位分隔
const itNum = v => {
  const n = parseFloat(String(v ?? '').trim().replace(/\.(?=\d{3}(?!\d))/g, '').replace(',', '.'));
  return Number.isNaN(n) ? null : n;
};

export function parseSubito(data) {
  return mapSafe(data?.ads, (a, i) => {
    const feat = uri => a.features?.find(f => f.uri === uri)?.values?.[0];
    const amount = itNum(feat('/price')?.key);
    const shipCost = itNum(feat('/item_shipping_cost_tuttosubito')?.key);
    const shippable = feat('/item_shippable')?.key === '1' || feat('/item_shipping_allowed')?.key === '1';
    const cond = (feat('/item_condition')?.value || '').split(' - ')[0];
    const id = (a.urn || '').split(':').pop();
    const iso = (a.dates?.display_iso8601 || '').replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
    const ts = Date.parse(iso) || null;
    const img = a.images?.[0]?.cdn_base_url;
    const price = amount > 0 ? amount : null;
    return {
      id: 'sb-' + id,
      source: 'Subito',
      title: a.subject || '',
      price,
      total: price != null && shipCost ? Math.round((price + shipCost) * 100) / 100 : null,
      totalNote: T`含運費`,
      currency: 'EUR',
      priceLabel: price != null ? eur(price) : T`價格未標`,
      url: a.urls?.default || '',
      image: img ? img + '?rule=gallery-mobile-2x-auto' : null,
      imageLarge: img ? img + '?rule=gallery-desktop-2x-auto' : null,
      location: [a.geo?.town?.value, cond].filter(Boolean).join(' · '),
      dateLabel: ts ? relTime(ts) : '',
      ts,
      shipping: shippable ? 'yes' : null,
      extra: shippable ? (shipCost ? T`運費 ${eur(shipCost)}` : T`可寄送`) : '',
      rank: i,
    };
  }).filter(it => it.title && it.url);
}

// ---------- Bazoš（捷克、斯洛伐克） ----------
const BAZOS = { bazos_cz: 'https://www.bazos.cz', bazos_sk: 'https://www.bazos.sk' };

async function fetchBazos(key, q, page, opts) {
  const s = SOURCES[key];
  const { lo, hi } = localRange(opts?.price, s.cur);
  const url = `${BAZOS[key]}/search.php?hledat=${enc(q)}&rubriky=www&hlokalita=&humkreis=25` +
    `&cenaod=${lo ?? ''}&cenado=${hi ?? ''}&Submit=Hledat&order=&crz=${(page - 1) * 20}`;
  const doc = await getHtml(url);
  const items = parseBazos(doc, key);
  const raw = doc.querySelectorAll('.inzeraty').length;
  return withRank(items, page, raw, raw < 20);
}

export function parseBazos(doc, key) {
  const s = SOURCES[key];
  return mapSafe([...doc.querySelectorAll('.inzeraty')], (row, i) => {
    const a = row.querySelector('.nadpis a');
    if (!a) return null;
    const href = absUrl(a.getAttribute('href'), BAZOS[key]);
    if (!href) return null;
    const id = (href.match(/inzerat\/(\d+)/) || [])[1] || href;
    const priceText = clean(row.querySelector('.inzeratycena')?.textContent);
    const digits = priceText.replace(/[\s .]/g, '').match(/^(\d+)(?:,(\d{1,2}))?/);
    const amount = digits ? parseFloat(digits[1] + (digits[2] ? '.' + digits[2] : '')) : null;
    const dm = clean(row.querySelector('.velikost10')?.textContent).match(/\[(\d{1,2})\.(\d{1,2})\.\s*(\d{4})\]/);
    const ts = dm ? dayTs(new Date(Number(dm[3]), Number(dm[2]) - 1, Number(dm[1])), i) : null;
    const locEl = row.querySelector('.inzeratylok');
    const loc = locEl ? clean((locEl.innerHTML.split(/<br\s*\/?>/i)[0] || '').replace(/<[^>]+>/g, '')) : '';
    const img = row.querySelector('img.obrazek')?.getAttribute('src') || null;
    let priceLabel;
    if (amount > 0) priceLabel = moneyLabel(amount, s.cur);
    else if (/zdarma|zadarmo/i.test(priceText)) priceLabel = T`免費`;
    else if (/dohodou|v textu|nabídněte|ponúknite/i.test(priceText)) priceLabel = T`可議價`;
    else priceLabel = priceText || T`價格未標`;
    return {
      id: key + '-' + id,
      source: s.name,
      title: clean(a.textContent),
      ...money(amount > 0 ? amount : null, s.cur),
      total: null,
      priceLabel,
      openPrice: !(amount > 0) && /dohodou|v textu|nabídněte|ponúknite/i.test(priceText),
      url: href,
      image: img,
      imageLarge: img ? img.replace('/1t/', '/1/') : null,
      location: loc,
      dateLabel: ts ? shortDate(ts) : '',
      ts,
      shipping: null,
      extra: '',
      rank: i,
    };
  }).filter(it => it && it.title);
}

// ---------- 撿漏：行情比價 ----------
// 標題含這些字的多半是故障機或零件，不列入行情計算
export const PARTS_RE = /defekt|defect|kapot|onderdelen|ersatzteil|for parts|not working|bastler|niet werkend|funktioniert nicht|pour pi[eè]ces|hors service/i;

// 比價用的價格：有總價（含運費、手續費）就用總價
export const cmpPrice = i => (i.total ?? i.price);

const median = arr => {
  const s = [...arr].sort((a, b) => a - b), mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

// 用目前結果的中位數當行情：低於行情 threshold 以上就標記。
// 拍賣（起標價、出價中）不算，因為顯示的不是最終價格。
export function computeDeals(items, threshold = 0.3) {
  let prices = items.filter(i => cmpPrice(i) > 0 && !i.isAuction && !PARTS_RE.test(i.title)).map(cmpPrice);
  if (prices.length < 5) return { median: null, n: prices.length, flags: {} };
  // 第二輪：去掉便宜得不合理的（配件、說明書）再算一次，避免拉低行情
  const rough = median(prices);
  const trimmed = prices.filter(p => p >= rough * 0.15);
  if (trimmed.length >= 5) prices = trimmed;
  const med = median(prices);
  const flags = {};
  for (const i of items) {
    const p = cmpPrice(i);
    if (PARTS_RE.test(i.title)) { flags[i.id] = { kind: 'parts' }; continue; }
    if (!(p > 0) || i.isAuction || !threshold) continue;
    if (p < med * 0.15) flags[i.id] = { kind: 'odd' }; // 便宜得不合理：多半是配件
    else if (1 - p / med >= threshold) flags[i.id] = { kind: 'deal', pct: Math.round((1 - p / med) * 100) };
  }
  return { median: med, n: prices.length, flags };
}

// ---------- 撿漏：分類瀏覽用（素人線索） ----------
// 品牌清單：[顯示名稱, ...標題裡可能出現的寫法]
const BRANDS = [
  // 相機、鏡頭
  ['Leica', 'leica', 'leitz', 'summicron', 'elmarit', 'summilux'], ['Rollei', 'rolleiflex', 'rolleicord', 'rollei'],
  ['Hasselblad', 'hasselblad'], ['Mamiya', 'mamiya'], ['Pentax', 'pentax', 'asahi', 'takumar'],
  ['Nikon', 'nikon', 'nikkor', 'nikkormat'], ['Canon', 'canon', 'canonet'], ['Olympus', 'olympus', 'zuiko'],
  ['Minolta', 'minolta', 'rokkor'], ['Yashica', 'yashica'], ['Contax', 'contax'], ['Zeiss', 'zeiss', 'zeiss ikon'],
  ['Voigtländer', 'voigtländer', 'voigtlander'], ['Fujifilm', 'fujifilm', 'fujica', 'fujinon', 'fuji'],
  ['Konica', 'konica', 'hexanon'], ['Ricoh', 'ricoh'], ['Praktica', 'praktica', 'pentacon'], ['Zenit', 'zenit', 'zenith'],
  ['Kiev', 'kiev', 'kiew'], ['Polaroid', 'polaroid'], ['Kodak', 'kodak'], ['Agfa', 'agfa'], ['Bronica', 'bronica'],
  ['Linhof', 'linhof'], ['Exakta', 'exakta', 'ihagee'], ['Lomo', 'lomo', 'lomography'], ['Sigma', 'sigma'],
  ['Tamron', 'tamron'], ['Tokina', 'tokina'], ['Helios', 'helios'], ['Jupiter', 'jupiter'], ['Samyang', 'samyang'],
  ['Schneider', 'schneider'], ['Meyer', 'meyer optik', 'meyer-optik'], ['Topcon', 'topcon'], ['Chinon', 'chinon'],
  ['Cosina', 'cosina'], ['Vivitar', 'vivitar'], ['Panasonic', 'panasonic', 'lumix'],
  // 麥克風、錄音
  ['Shure', 'shure'], ['Sennheiser', 'sennheiser'], ['Neumann', 'neumann'], ['Rode', 'røde', /\brode\s?(nt|videomic|podmic|procaster|wireless|smartlav|m5|m3|ntg|lavalier)/i], ['AKG', 'akg'],
  ['Audio-Technica', 'audio-technica', 'audio technica', 'audiotechnica'], ['Beyerdynamic', 'beyerdynamic', 'beyer dynamic', 'beyer'],
  ['Electro-Voice', 'electro-voice', 'electrovoice'], ['Schoeps', 'schoeps'], ['DPA', 'dpa'], ['Lewitt', 'lewitt'],
  ['Oktava', 'oktava'], ['Blue', 'blue yeti', 'blue snowball', 'blue microphones'], ['Behringer', 'behringer'], ['Samson', 'samson'],
  ['Superlux', 'superlux'], ['Telefunken', 'telefunken'], ['Warm Audio', 'warm audio'], ['Deity', 'deity'],
  ['Saramonic', 'saramonic'], ['Boya', 'boya'], ['Line Audio', 'line audio'], ['LOM', 'lom'],
  ['Zoom', /\bzoom\s?[hfrq]\d/i], ['Tascam', 'tascam'], ['Marantz', 'marantz'], ['Nagra', 'nagra'],
  ['Roland', 'roland', 'edirol'], ['Uher', 'uher'], ['Revox', 'revox', 'studer'], ['Teac', 'teac'], ['Akai', 'akai'],
  ['Fostex', 'fostex'], ['Sound Devices', 'sound devices'],
  // 耳機、音響
  ['Grado', 'grado'], ['Sony', 'sony'], ['Bose', 'bose'], ['Focal', 'focal'], ['HiFiMAN', 'hifiman'], ['Audeze', 'audeze'],
  ['Koss', 'koss'], ['Stax', 'stax'], ['B&O', 'bang & olufsen', 'bang&olufsen', 'b&o', 'beoplay'], ['Philips', 'philips'],
  ['Apple', 'apple', 'airpods'], ['Beats', 'beats'], ['Meze', 'meze'], ['Ultrasone', 'ultrasone'], ['JBL', 'jbl'],
  ['Marshall', 'marshall'], ['Denon', 'denon'], ['Technics', 'technics'], ['B&W', 'bowers & wilkins', 'bowers', 'b&w'],
  ['Jabra', 'jabra'], ['Grundig', 'grundig'], ['Aiwa', 'aiwa'], ['JVC', 'jvc'],
];
const BRAND_PATTERNS = BRANDS.flatMap(([name, ...alts]) => alts.map(a => ({
  name,
  re: a instanceof RegExp ? a
    : new RegExp('(^|[^a-z0-9äöüøé])' + a.replace(/[.*+?^${}()|[\]\\&]/g, m => '\\' + m) + '($|[^a-z0-9äöüøé])', 'i'),
})));

export function detectBrand(title) {
  for (const p of BRAND_PATTERNS) if (p.re.test(title)) return p.name;
  return null;
}

// 不懂行情的賣家常用的字：老的、爺爺的、閣樓、遺物、一整批
// 用 Unicode 字母判斷字界，波蘭文、捷克文、北歐文字的特殊字母也算在字裡
const NAIVE_WORDS_RE = [
  'oude?', 'opa', 'oma', 'zolder', 'nalatenschap', 'antiek', 'grootvader', 'partij', 'verzameling', // 荷蘭文
  'nachlass', 'dachboden\\p{L}*', 'alte[rns]?', 'konvolut', 'sammlung', 'erbst[üu]ck', 'opas', 'omas', // 德文
  'ancien(ne)?', 'grand-p[èe]re', 'grenier', 'lot de', // 法文
  'attic', 'estate', 'grandfather', // 英文
  'gammel[t]?', 'gammal[t]?', 'dødsbo', 'dödsbo', 'morfars?', 'farfars?', // 丹麥、瑞典
  'vanha', 'kuolinpesä\\p{L}*', // 芬蘭
  'stary', 'stare', 'dziadk\\p{L}*', 'po dziadku', // 波蘭
  'star[ýáé]', 'po d[ěe]dovi', 'pozůstalost\\p{L}*', // 捷克、斯洛伐克
  'vecchi[aoe]?', 'nonno', 'soffitta', // 義大利
  'antig[ao]s?', 'avô', // 葡萄牙
  'vech[ie]', 'bunic\\p{L}*', // 羅馬尼亞
  'стар\\p{L}{0,2}', // 保加利亞
  'régi', 'hagyaték\\p{L}*', 'nagyap\\p{L}*', 'padlás\\p{L}*', // 匈牙利
];
export const NAIVE_RE = new RegExp('(?<!\\p{L})(' + NAIVE_WORDS_RE.join('|') + ')(?!\\p{L})', 'iu');

// 分類瀏覽的標示：不比價（不同型號混在一起，比價沒有意義），只標素人線索和故障零件
export function computeBrowseFlags(items) {
  const flags = {};
  for (const it of items) {
    if (PARTS_RE.test(it.title)) { flags[it.id] = { kind: 'parts' }; continue; }
    const naive = it.title.match(NAIVE_RE);
    if (naive) { flags[it.id] = { kind: 'naive', word: naive[0] }; continue; }
    if (!detectBrand(it.title)) flags[it.id] = { kind: 'nobrand' };
  }
  return { flags };
}

// ---------- 共用 ----------
export function applyFilters(items, { query, min, max, exclude, strict, shipOnly }) {
  const words = (exclude || '').split(/[,，]/).map(w => w.trim().toLowerCase()).filter(Boolean);
  const must = strict ? (query || '').toLowerCase().split(/\s+/).filter(Boolean) : [];
  return items.filter(it => {
    // 價格未定的（出價、可議價）不知道會落在哪裡，價格篩選時保留
    const unknown = it.price == null && it.openPrice;
    if (min != null && min !== '' && !unknown && (it.price == null || it.price < Number(min))) return false;
    if (max != null && max !== '' && !unknown && (it.price == null || it.price > Number(max))) return false;
    if (shipOnly && it.shipping === 'no') return false;
    const t = it.title.toLowerCase();
    if (must.some(w => !t.includes(w))) return false;
    return !words.some(w => t.includes(w));
  });
}

// 依上架時間排序：有時間的照時間；Vinted 沒有時間，依它自己的順序按比例穿插進去
export function sortNewest(items) {
  const timed = items.filter(i => i.ts).sort((a, b) => b.ts - a.ts);
  const untimed = items.filter(i => !i.ts).sort((a, b) => a.rank - b.rank);
  if (!untimed.length) return timed;
  if (!timed.length) return untimed;
  const out = [];
  let ti = 0;
  untimed.forEach((it, k) => {
    const upto = Math.round(((k + 1) / (untimed.length + 1)) * timed.length);
    while (ti < upto) out.push(timed[ti++]);
    out.push(it);
  });
  while (ti < timed.length) out.push(timed[ti++]);
  return out;
}

// 一個平台連續抓幾頁。平台給了空頁就停，表示沒有更多了。
// 後面某一頁失敗時，保留前面已經抓到的，下次「載入更多」從失敗的那頁重試。
async function loadPages(fetchPage, start, count, isStale) {
  const items = [];
  let page = start, done = false;
  for (let i = 0; i < count; i++) {
    if (i > 0 && isStale?.()) break;
    let r;
    try {
      r = await fetchPage(page);
    } catch (e) {
      if (items.length) return { items, next: page, done: false };
      throw e;
    }
    page++;
    items.push(...r);
    if (r.end || !(r.rawCount ?? r.length)) { done = true; break; }
  }
  return { items, next: page, done };
}

// 同時跑多個工作（一個工作 = 一個平台 × 一個關鍵字），個別失敗不影響其他。
// 工作：{ id, src, fetch(page), tag }；tag 會變成商品的 matchedQuery。
// opts.start：{ 工作 id: 從第幾頁開始 }（載入更多時用）；opts.pages：每個工作抓幾頁（預設看平台設定）
// onProgress(平台, { status, count, error, done })：同一平台的工作都完成時呼叫一次
async function runTasks(tasks, onProgress, opts = {}) {
  const items = [], errors = [], paging = {}, bySrc = {};
  tasks.forEach(t => { (bySrc[t.src] ||= { left: 0, count: 0, errs: [], ok: false, done: true }).left++; });
  if (tasks.some(t => SOURCES[t.src].cur !== 'EUR')) await ensureRates();
  // 同時最多跑 6 個工作，避免一次對各網站送出幾十個請求、拖慢瀏覽器
  const queue = [...tasks];
  const worker = async () => { for (let t; (t = queue.shift());) await runOne(t); };
  async function runOne(t) {
    const g = bySrc[t.src];
    const start = opts.start?.[t.id] || 1;
    try {
      const r = await loadPages(page => t.fetch(page), start, opts.pages || t.pages || SOURCES[t.src].perLoad || 1, opts.isStale);
      items.push(...(t.tag ? r.items.map(it => ({ ...it, matchedQuery: t.tag })) : r.items));
      paging[t.id] = { next: r.next, done: r.done };
      g.ok = true;
      g.count += r.items.length;
      if (!r.done) g.done = false;
    } catch (e) {
      g.errs.push(e?.message || String(e));
      // 載入更多時失敗：之前讀到的還在，下次可以再試，不要永久停掉這個平台
      paging[t.id] = { next: start, done: !opts.start };
    }
    if (--g.left === 0) {
      if (g.ok) onProgress?.(t.src, { status: 'ok', count: g.count, done: g.done });
      else {
        errors.push(T`${SOURCES[t.src].name}：${g.errs[0]}`);
        onProgress?.(t.src, { status: 'error', error: g.errs[0], done: true });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, tasks.length) }, worker));
  const seen = new Set();
  return { items: items.filter(it => !seen.has(it.id) && seen.add(it.id)), errors, paging };
}

const searchOpts = o => ({ price: o?.price, used: o?.used, background: o?.background, isStale: o?.isStale });
// 沒指定平台（undefined）才用預設；明確給空陣列就是「沒有平台」
const pickKeys = keys => (Array.isArray(keys) ? keys : DEFAULT_SOURCES).filter(k => SOURCES[k]);

// 關鍵字搜尋
export function searchAll(query, sourceKeys, onProgress, opts = {}) {
  const o = searchOpts(opts);
  const tasks = pickKeys(sourceKeys).map(k => ({ id: k, src: k, fetch: page => SOURCES[k].search(query, page, o) }));
  return runTasks(tasks, onProgress, opts);
}

// ---------- 分類瀏覽 ----------
// 自訂分類：{ key: 'c_…', name, words: [關鍵字…], exclude, custom: true }
// 每個關鍵字都會在每個勾選的平台上搜尋，結果合併。
export const isCustomKey = key => typeof key === 'string' && key.startsWith('c_');
export function parseWords(text) {
  return [...new Set(String(text || '').split(/[,，\n]/).map(w => w.trim()).filter(Boolean))].slice(0, 8);
}

// 分類在各平台要跑哪些工作。工作 id：內建分類是平台代號；自訂分類是「平台::第幾個關鍵字」
export function catTasks(cat, sourceKeys, o = {}) {
  const tasks = [];
  if (!cat) return tasks;
  for (const k of (sourceKeys || []).filter(x => SOURCES[x])) {
    const s = SOURCES[k];
    if (cat.custom) {
      const words = cat.words || [];
      // 多個關鍵字時每個只抓一頁，需要更多再按「載入更多」
      words.forEach((w, i) => tasks.push({ id: `${k}::${i}`, src: k, tag: words.length > 1 ? w : null, pages: words.length > 1 ? 1 : undefined, fetch: page => s.search(w, page, o) }));
    } else if (cat.map?.[k] && s.browse) {
      tasks.push({ id: k, src: k, fetch: page => s.browse(cat.map[k], page, o) });
    } else {
      const w = catWords(k, cat.key);
      // 多組字詞：每組各搜一次，每次只抓一頁，避免請求太多
      if (Array.isArray(w)) w.forEach((x, i) => tasks.push({ id: `${k}::${i}`, src: k, tag: x, pages: 1, fetch: page => s.search(x, page, o) }));
      else if (w) tasks.push({ id: k, src: k, fetch: page => s.search(w, page, o) });
    }
  }
  return tasks;
}
export const taskSource = id => String(id).split('::')[0];
// 這個分類在勾選的平台中，實際會用到哪些平台
export const catSources = (cat, sourceKeys) => [...new Set(catTasks(cat, sourceKeys).map(t => t.src))];
// 分類在某個平台上怎麼找（顯示給使用者看）
export function catHow(cat, k) {
  const s = SOURCES[k];
  if (!s || !cat) return '';
  if (cat.custom) return (cat.words || []).join(', ');
  if (cat.map?.[k] && s.browse) return tr('平台分類');
  const w = catWords(k, cat.key);
  return Array.isArray(w) ? w.join(', ') : w || '';
}

// cat：內建分類代號，或分類物件（自訂分類）
export function browseAll(cat, sourceKeys, onProgress, opts = {}) {
  const c = typeof cat === 'string' ? CATEGORIES.find(x => x.key === cat) : cat;
  if (!c) return Promise.resolve({ items: [], errors: [T`找不到分類`], paging: {} });
  let tasks = catTasks(c, pickKeys(sourceKeys), searchOpts(opts));
  // 載入更多：只跑還有下一頁的工作
  if (opts.start && Object.keys(opts.start).length) tasks = tasks.filter(t => opts.start[t.id] != null);
  if (!tasks.length) return Promise.resolve({ items: [], errors: [], paging: {} });
  return runTasks(tasks, onProgress, opts);
}

// 一次跑多組搜尋（每組有自己的關鍵字和平台），合併結果。
// 每個商品會帶上 matchedQuery，表示是哪個字詞搜到的。
export async function searchMulti(subs, onProgress, opts = {}) {
  const tasks = [];
  const o = searchOpts(opts);
  subs.forEach((s, si) => pickKeys(s.sources).forEach(k => tasks.push({
    id: `${k}::${si}`, src: k, tag: subs.length > 1 ? s.query : null, fetch: page => SOURCES[k].search(s.query, page, o),
  })));
  const r = await runTasks(tasks, onProgress, { ...opts, pages: opts.pages || 1 });
  return { items: r.items, errors: r.errors };
}
