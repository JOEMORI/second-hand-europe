// 語言切換：介面文字以中文為原文，英文翻譯放在 EN 字典裡。
// 程式裡用 T`中文 ${變數}` 或 tr('中文')，切到英文時自動換成字典裡的翻譯。
import { EN } from './i18n-en.js';

let LANG = 'zh';

export const i18nReady = (async () => {
  try {
    const { lang } = await chrome.storage.local.get('lang');
    LANG = lang || ((navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en');
  } catch {
    LANG = (navigator.language || '').toLowerCase().startsWith('zh') ? 'zh' : 'en';
  }
  return LANG;
})();

export const getLang = () => LANG;
// 隱藏頁面（offscreen）不能讀取設定，由背景程式把語言傳過來
export const setLang = l => { if (l === 'zh' || l === 'en') LANG = l; };
export const locale = () => (LANG === 'en' ? 'en-GB' : 'zh-TW');

// 標記模板：T`低於 ${brand} 行情 ${pct}%` → 字典鍵為「低於 {0} 行情 {1}%」
export function T(strings, ...vals) {
  let key = strings[0];
  for (let i = 0; i < vals.length; i++) key += `{${i}}` + strings[i + 1];
  const out = LANG === 'en' && EN[key] != null ? EN[key] : key;
  return out.replace(/\{(\d+)\}/g, (_, n) => String(vals[n]));
}

export const tr = s => (LANG === 'en' && s && EN[s] != null ? EN[s] : s);

// 翻譯 HTML 裡寫死的文字和 placeholder / title
export function translateDom(root = document.body) {
  if (LANG !== 'en') return;
  document.documentElement.lang = 'en';
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    const raw = n.nodeValue, key = raw.trim();
    if (key && EN[key] != null) n.nodeValue = raw.replace(key, EN[key]);
  }
  root.querySelectorAll('[placeholder],[title]').forEach(el => {
    for (const attr of ['placeholder', 'title']) {
      const v = el.getAttribute(attr);
      if (v && EN[v] != null) el.setAttribute(attr, EN[v]);
    }
  });
  if (EN[document.title] != null) document.title = EN[document.title];
}

// 相對時間：「3 小時前」
export function relTime(ts) {
  if (!ts) return '';
  const min = (Date.now() - ts) / 60000;
  if (min < 1) return T`剛剛`;
  if (min < 60) return T`${Math.round(min)} 分鐘前`;
  if (min < 1440) return T`${Math.round(min / 60)} 小時前`;
  if (min < 2880) return T`昨天`;
  if (min < 30 * 1440) return T`${Math.round(min / 1440)} 天前`;
  // 一個月以前：直接顯示日期
  const d = new Date(ts);
  return d.toLocaleDateString(locale(), d.getFullYear() === new Date().getFullYear() ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}
