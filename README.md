<p align="center"><img src="icon128.png" width="96" alt="Second Hand Europe"></p>

# Second Hand Europe 歐洲二手搜尋

一個 Chrome 插件，把歐洲各國的二手平台整合成一個搜尋框：一次搜 17 個平台，結果合併在同一頁，價格統一換成歐元。不論相機、家具、單車或唱片，在荷蘭找不到的東西，可以順便看德國、波蘭、義大利有沒有。

A Chrome extension that brings Europe's second-hand marketplaces together in one search box: 17 sites across the continent at once, merged into one page, every price in euros. Whatever you're after, if it isn't for sale in your country, see whether it is in Germany, Poland or Italy. [English below](#english)

## 支援平台

| 地區 | 平台 |
| --- | --- |
| 跨國 | Vinted、eBay.de |
| 荷蘭附近 | Marktplaats (NL)、2dehands (BE)、Kleinanzeigen (DE) |
| 北歐 | DBA (DK)、Blocket (SE)、Tori (FI) |
| 中歐 | willhaben (AT)、OLX.pl (PL)、Bazos.cz (CZ)、Bazos.sk (SK)、Vatera (HU) |
| 南歐 | Subito (IT)、OLX.pt (PT) |
| 東南歐 | OLX.ro (RO)、OLX.bg (BG) |

另外提供 Leboncoin、Wallapop、Allegro、Tradera 等網站的一鍵連結。

## 功能

- 一個搜尋框搜所有勾選的平台，結果合併排序；也可以只在某個分類裡搜尋（例如在「鏡頭」裡找 Schneider）
- 外幣依歐洲央行匯率換成歐元，同時顯示當地原價
- 分類瀏覽：從分類目錄（相機、音響、樂器、家具、服飾、單車、唱片與書、收藏，共 40 類）挑自己的分類，對應到各平台自己的分類；不要的可以刪，也可以用關鍵字自訂
- 格狀或表格式列表（大圖、平台、價格、上架時間），往下捲自動載入更多
- 價格篩選、排除字詞、只看二手、隱藏只能面交
- Marktplaats／2dehands「Bieden」商品會讀出最低出價
- 追蹤搜尋或分類，有新上架時跳出系統通知：一件一則，帶照片和價格，點了打開商品頁（可以改成一則彙總或關掉）
- 收藏商品並加備註；已賣掉或下架的收藏會自動移除（可以放回）
- 中英文介面、匯出／匯入備份

## 安裝

1. 到 [Releases](../../releases) 下載最新的 `second-hand-europe.zip` 並解壓縮，把 `second-hand-europe` 資料夾放在固定位置（之後不要移動或刪除）。
2. Chrome 網址列輸入 `chrome://extensions`。
3. 打開右上角「開發人員模式」。
4. 按「載入未封裝項目」，選 `second-hand-europe` 資料夾。
5. 第一次使用前，先在 Chrome 正常打開一次 vinted.nl 和 vatera.hu（這兩個網站要先通過它們的檢查）。

更新時把新檔案覆蓋到同一個資料夾，再到 `chrome://extensions` 按重新載入。不要按「移除」，否則收藏和追蹤會不見。

## 注意

- 換算的歐元價格是約略值，以賣家當地價格為準。
- 網站改版或擋自動讀取時，該平台可能暫時讀不到。
- 版本紀錄見 [CHANGELOG.md](CHANGELOG.md)。

---

<a id="english"></a>

## English

### Marketplaces

Vinted, eBay.de, Marktplaats, 2dehands, Kleinanzeigen, DBA, Blocket, Tori, willhaben, OLX (PL, PT, RO, BG), Bazos (CZ, SK), Subito and Vatera, plus one-click links to Leboncoin, Wallapop, Allegro, Tradera and more.

### Features

- One search box for every ticked marketplace, merged into one page; optionally search within one category (e.g. Schneider in "Lenses")
- Prices converted to euros at the European Central Bank rate, local price shown too
- Browse categories without a keyword: pick your own from a catalog of 40 (cameras, audio, instruments, furniture, clothing, bikes, records and books, collectibles), each mapped to the marketplaces' own categories; remove any you don't need or make your own with keywords
- Grid or table-style list (large photo, marketplace, price, listing date), with automatic loading as you scroll
- Price filter, exclude words, used-only and hide-pickup-only switches
- Minimum bids for Marktplaats / 2dehands "Bieden" listings
- Watch a search or category and get a system notification for new listings: one per item with photo and price, click to open the listing (or one summary, or off)
- Save listings with notes; sold or removed listings leave your saved list automatically (you can put them back)
- English and Chinese interface; backup export / import

### Install

1. Download `second-hand-europe.zip` from [Releases](../../releases), unzip it and keep the `second-hand-europe` folder somewhere permanent.
2. Open `chrome://extensions` and turn on Developer mode.
3. Click "Load unpacked" and select the `second-hand-europe` folder.
4. Before the first search, open vinted.nl and vatera.hu once in a normal tab.

To update, copy the new files into the same folder and click reload on `chrome://extensions`. Don't click "Remove", or your saved items and watches are lost.

See [CHANGELOG.md](CHANGELOG.md) for version history.
