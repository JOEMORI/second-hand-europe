// 備份：收藏、追蹤、快捷和設定存成一個 JSON 檔。
// 設定裡的「匯出備份」和每週的自動備份用同一份項目清單。

export const BACKUP_KEYS = [
  'favorites', 'watches', 'quick', 'customCats', 'myCats', 'selectedSources', 'dealThreshold', 'interval', 'lang',
  'usedOnly', 'shipOnly', 'newItems', 'favRemoved', 'favAutoRemove', 'notifyOn', 'notifySticky', 'notifyMode',
  'notifyDealsOnly', 'viewMode', 'favView', 'hiddenItems', 'markSeen', 'homeCc', 'quietOn', 'quietFrom', 'quietTo', 'autoBackup',
];

export async function backupJson() {
  const data = await chrome.storage.local.get(BACKUP_KEYS);
  return JSON.stringify({ app: 'gear-search', version: 1, exportedAt: new Date().toISOString(), data }, null, 2);
}

const WEEK = 7 * 86400e3;
const KEEP = 4;   // 保留最近 4 份

// 每週自動備份到「下載」資料夾裡的 SecondHandEurope 資料夾，舊的只留最近 4 份。
// force：不管上次什麼時候備份過，馬上存一份
export async function autoBackup(force = false) {
  if (!chrome.downloads) return null;
  const { autoBackup: on = true, autoBackupAt = 0, autoBackupIds = [] } =
    await chrome.storage.local.get(['autoBackup', 'autoBackupAt', 'autoBackupIds']);
  if (!on || (!force && Date.now() - autoBackupAt < WEEK)) return null;
  // 背景程式不能用 Blob 網址，改用 data 網址（中文要先轉成 UTF-8）
  const bytes = new TextEncoder().encode(await backupJson());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const id = await chrome.downloads.download({
    url: 'data:application/json;base64,' + btoa(bin),
    filename: `SecondHandEurope/backup-${new Date().toISOString().slice(0, 10)}.json`,
    conflictAction: 'overwrite',
    saveAs: false,
  });
  const ids = [id, ...autoBackupIds.filter(x => x !== id)];
  for (const old of ids.slice(KEEP)) {
    await chrome.downloads.removeFile(old).catch(() => {});
    await chrome.downloads.erase({ id: old }).catch(() => {});
  }
  await chrome.storage.local.set({ autoBackupAt: Date.now(), autoBackupIds: ids.slice(0, KEEP) });
  return id;
}
