// 分類目錄：大類 > 小類，每個小類對應到各平台自己的分類（2026/10 實測編號）。
//
// map：有平台分類的平台怎麼找
//   mp / tdh（Marktplaats、2dehands）：l1 大類編號、l2 小類編號（可以是陣列，一次查多個小類）
//   vinted：catalogs 分類編號陣列
//   ka（Kleinanzeigen）：path + c 分類代號，attr 篩選屬性；分類太粗時加 q 關鍵字（narrow：使用者在分類裡搜尋時兩個字一起搜）
//   ebay：cat 分類編號 + q 通用關鍵字（eBay 純分類頁讀不到商品）；needQ：只有使用者輸入關鍵字時才搜
//         編號來自 ebay.de/n/all-categories（2026/10）
//   陣列：同一個平台查好幾個分類，結果合併
// w：沒有平台分類的平台，用當地語言的關鍵字搜尋。
//   順序固定：de | nl | da | sv | fi | pl | cs | sk | it | pt | ro | bg | hu
//   沒有 w 的小類（例如服飾）只在有平台分類的平台搜尋，避免混進不相干的東西。
// kw：搜尋分類目錄時可以用的別名（英文、荷蘭文、德文、中文同義詞）
// name / sub / 大類名稱是中文原文，顯示時用 tr() 翻譯。

export const WORD_LANGS = ['de', 'nl', 'da', 'sv', 'fi', 'pl', 'cs', 'sk', 'it', 'pt', 'ro', 'bg', 'hu'];
const W = s => Object.fromEntries(s.split('|').map((x, i) => [WORD_LANGS[i], x.trim()]).filter(([, x]) => x));
const MP = (l1, l2) => ({ l1, ...(l2 != null ? { l2 } : {}) });
const both = spec => ({ mp: spec, tdh: spec });

export const CATALOG = [
  {
    key: 'cam', name: '相機與攝影', ico: 'cat-film',
    items: [
      {
        key: 'film', name: '底片相機', sub: "Fotocamera's Analoog · Analogkameras", kw: 'film camera analog analogue 135 120 菲林 傳統相機 analoge camera analogkamera',
        map: {
          ...both(MP(31, 480)),
          vinted: { catalogs: [3076] },
          ka: { path: 's-foto', c: 'c245', attr: 'foto.art_s:camera', q: 'analog', narrow: true },
          ebay: { cat: 15230, q: 'kamera' },
        },
        w: W('analog kamera|analoge camera|analogt kamera|analog kamera|filmikamera|aparat analogowy|analogový fotoaparát|analógový fotoaparát|macchina fotografica analogica|máquina fotográfica analógica|aparat foto film|лентов фотоапарат|analóg fényképezőgép'),
      },
      {
        key: 'digi', name: '數位相機', sub: "Fotocamera's Digitaal · Digitalkameras", kw: 'digital camera dslr mirrorless compact 單眼 微單 類單 數位 digitale camera digitalkamera',
        map: {
          ...both(MP(31, 487)),
          vinted: { catalogs: [3075] },
          ka: { path: 's-foto', c: 'c245', attr: 'foto.art_s:camera', q: 'digital', narrow: true },
          ebay: { cat: 31388, q: 'kamera' },
        },
        w: W('digitalkamera|digitale camera|digitalkamera|digitalkamera|digikamera|aparat cyfrowy|digitální fotoaparát|digitálny fotoaparát|fotocamera digitale|máquina fotográfica digital|aparat foto digital|цифров фотоапарат|digitális fényképezőgép'),
      },
      {
        key: 'lens', name: '鏡頭', sub: 'Objectieven · Objektive', kw: 'lens lenses objective 鏡頭 objectief objektiv',
        map: {
          ...both(MP(31, 495)),
          vinted: { catalogs: [3061] },
          ka: { path: 's-foto', c: 'c245', attr: 'foto.art_s:lens', slug: 'lens' },
          ebay: { cat: 3323, q: 'objektiv' },
        },
        w: W('objektiv|objectief|objektiv|objektiv|objektiivi|obiektyw|objektiv|objektív|obiettivo|objetiva|obiectiv|обектив|objektív'),
      },
      {
        key: 'flash', name: '閃光燈', sub: 'Flitsers · Blitzgeräte', kw: 'flash speedlight strobe 閃燈 flitser blitz',
        map: {
          ...both(MP(31, 489)),
          vinted: { catalogs: [3062] },
          ka: { path: 's-foto', c: 'c245', q: 'blitz', narrow: true },
          ebay: { cat: 625, q: 'blitz' },
        },
        w: W('blitzgerät|flitser|blitz|kamerablixt|salamalaite|lampa błyskowa|blesk|blesk|flash fotografico|flash fotográfico|blitz foto|светкавица|vaku'),
      },
      {
        key: 'tripod', name: '腳架', sub: 'Statieven · Stative', kw: 'tripod monopod 三腳架 statief stativ',
        map: {
          ...both(MP(31, 500)),
          vinted: { catalogs: [3067] },
          ka: { path: 's-foto', c: 'c245', q: 'stativ', narrow: true },
          ebay: { cat: 625, q: 'stativ' },
        },
        w: W('stativ|statief|stativ|stativ|kolmijalka|statyw|stativ|statív|treppiede|tripé|trepied|статив|fotóállvány'),
      },
      {
        key: 'cambag', name: '相機包', sub: 'Fototassen · Kamerataschen', kw: 'camera bag case 攝影包 fototas cameratas kameratasche',
        map: {
          ...both(MP(31, 1484)),
          vinted: { catalogs: [3068] },
          ka: { path: 's-foto', c: 'c245', q: 'tasche', narrow: true },
          ebay: { cat: 625, q: 'kameratasche' },
        },
        w: W('kameratasche|cameratas|kamerataske|kameraväska|kameralaukku|torba fotograficzna|brašna na fotoaparát|taška na fotoaparát|borsa fotografica|mala fotográfica|geanta foto|чанта за фотоапарат|fotós táska'),
      },
      {
        key: 'darkroom', name: '暗房器材', sub: 'Doka · Dunkelkammer', kw: 'darkroom enlarger 放大機 沖洗 doka vergroter dunkelkammer vergrößerer',
        map: {
          ...both(MP(31, 488)),
          vinted: { catalogs: [3715] },
          ka: { path: 's-foto', c: 'c245', q: 'dunkelkammer', narrow: true },
          ebay: { cat: 69323, q: 'dunkelkammer' },
        },
        w: W('dunkelkammer|doka|forstørrelsesapparat|förstoringsapparat|suurennuskone|powiększalnik|zvětšovák|zväčšovák|ingranditore|ampliador fotográfico|laborator foto|фотоувеличител|nagyítógép'),
      },
      {
        key: 'bino', name: '望遠鏡', sub: 'Verrekijkers · Ferngläser', kw: 'binoculars telescope 雙筒 望眼鏡 verrekijker fernglas',
        map: {
          ...both(MP(31, 503)),
          vinted: { catalogs: [4658] },
          ebay: { cat: 28179, q: 'fernglas' },
        },
        w: W('fernglas|verrekijker|kikkert|kikare|kiikari|lornetka|dalekohled|ďalekohľad|binocolo|binóculos|binoclu|бинокъл|távcső'),
      },
    ],
  },
  {
    key: 'audio', name: '音響與耳機', ico: 'cat-audio',
    items: [
      {
        key: 'turntable', name: '唱盤', sub: 'Platenspelers · Plattenspieler', kw: 'turntable record player 黑膠唱機 唱機 platenspeler plattenspieler',
        map: {
          ...both(MP(31, 42)),
          vinted: { catalogs: [3701] },
          ka: { path: 's-audio-hifi', c: 'c172', q: 'plattenspieler', narrow: true },
          ebay: { cat: 14969, q: 'plattenspieler' },
        },
        w: W('plattenspieler|platenspeler|pladespiller|skivspelare|levysoitin|gramofon|gramofon|gramofón|giradischi|gira-discos|pick-up|грамофон|lemezjátszó'),
      },
      {
        key: 'amp', name: '擴大機', sub: 'Versterkers en Receivers · Verstärker', kw: 'amplifier amp receiver preamp 擴音機 功放 後級 前級 versterker verstärker',
        map: {
          ...both(MP(31, 46)),
          vinted: { catalogs: [3699] },
          ka: { path: 's-audio-hifi', c: 'c172', q: 'verstärker', narrow: true },
          ebay: { cat: 14969, q: 'verstärker' },
        },
        w: W('verstärker|versterker|forstærker|förstärkare|vahvistin|wzmacniacz|zesilovač|zosilňovač|amplificatore|amplificador|amplificator|усилвател|erősítő'),
      },
      {
        key: 'speaker', name: '喇叭', sub: 'Luidsprekers · Lautsprecher', kw: 'speakers loudspeaker 音箱 揚聲器 luidspreker boxen lautsprecher',
        map: {
          ...both(MP(31, 38)),
          vinted: { catalogs: [3695] },
          ka: { path: 's-audio-hifi', c: 'c172', attr: 'audio_hifi.art_s:lautsprecher_kopfhoerer', q: 'lautsprecher', narrow: true },
          ebay: { cat: 14969, q: 'lautsprecher' },
        },
        w: W('lautsprecher|luidsprekers|højttalere|högtalare|kaiuttimet|kolumny|reproduktory|reproduktory|casse acustiche|colunas de som|boxe|тонколони|hangfal'),
      },
      {
        key: 'hp', name: '耳機', sub: 'Koptelefoons · Kopfhörer', kw: 'headphones earphones 耳罩 koptelefoon kopfhörer',
        map: {
          ...both(MP(31, 37)),
          vinted: { catalogs: [3678] },
          ka: { path: 's-audio-hifi', c: 'c172', attr: 'audio_hifi.art_s:lautsprecher_kopfhoerer', q: 'kopfhoerer' },
          ebay: { cat: 112529, q: 'kopfhörer' },
        },
        w: W('kopfhörer|koptelefoon|hovedtelefoner|hörlurar|kuulokkeet|słuchawki|sluchátka|slúchadlá|cuffie|auscultadores|căști|слушалки|fejhallgató'),
      },
      {
        key: 'tape', name: '卡式座', sub: 'Cassettedecks · Kassettendecks', kw: 'cassette deck tape deck 卡帶 錄音座 cassettedeck tapedeck',
        map: {
          ...both(MP(31, 2036)),
          vinted: { catalogs: [3703] },
          ka: { path: 's-audio-hifi', c: 'c172', q: 'tapedeck', narrow: true },
          ebay: { cat: 14969, q: 'tapedeck' },
        },
        w: W('tapedeck|cassettedeck|kassettebåndoptager|kassettdäck|kasettidekki|magnetofon kasetowy|kazetový magnetofon|kazetový magnetofón|piastra a cassette|leitor de cassetes|deck caseta|касетъчен дек|kazettás magnó'),
      },
      {
        key: 'reel', name: '盤式錄音機', sub: 'Bandrecorders · Tonbandgeräte', kw: 'reel to reel tape recorder 盤帶 開盤 bandrecorder tonbandgerät spulentonband',
        map: {
          ...both(MP(31, 32)),
          ka: { path: 's-audio-hifi', c: 'c172', q: 'tonband', narrow: true },
          ebay: { cat: 14969, q: 'tonbandgerät' },
        },
        w: W('tonbandgerät|bandrecorder|spolebåndoptager|rullbandspelare|kelanauhuri|magnetofon szpulowy|cívkový magnetofon|cievkový magnetofón|registratore a bobine|gravador de bobines|magnetofon cu benzi|ролков магнетофон|orsós magnó'),
      },
      {
        key: 'rec', name: '錄音機', sub: 'Recorders · Rekorder（含卡帶錄音機）', kw: 'recorder field recorder dictaphone walkman 錄音筆 隨身聽 rekorder',
        map: {
          mp: { l1: 31, l2: 1117, q: 'recorder', narrow: true }, tdh: { l1: 31, l2: 1117, q: 'recorder', narrow: true },
          vinted: { catalogs: [3566, 4833], q: 'recorder', narrow: true },
          ka: { path: 's-audio-hifi', c: 'c172', q: 'recorder', narrow: true },
          ebay: { cat: 15052, q: 'recorder' },
        },
        w: W('recorder|recorder|båndoptager|bandspelare|nauhuri|dyktafon|diktafon|diktafón|registratore|gravador|reportofon|диктофон|diktafon'),
      },
      {
        key: 'cdp', name: 'CD 播放機', sub: "Cd-spelers · CD-Player", kw: 'cd player cd-speler cd-player 光碟機',
        map: {
          ...both(MP(31, 35)),
          vinted: { catalogs: [3702] },
          ka: { path: 's-audio-hifi', c: 'c172', q: 'cd player', narrow: true },
          ebay: { cat: 14969, q: 'cd player' },
        },
        w: W('cd player|cd-speler|cd-afspiller|cd-spelare|cd-soitin|odtwarzacz cd|cd přehrávač|cd prehrávač|lettore cd|leitor de cd|cd player|cd плейър|cd lejátszó'),
      },
      {
        key: 'radio', name: '收音機與調諧器', sub: "Radio's en Tuners · Radios, Tuner", kw: 'radio tuner 收音機 調諧器 tuner radio',
        map: {
          ...both(MP(31, [43, 45])),
          vinted: { catalogs: [3680, 3704] },
          ka: { path: 's-audio-hifi', c: 'c172', q: 'radio', narrow: true },
          ebay: { cat: 14969, q: 'radio' },
        },
        w: W('radio|radio|radio|radio|radio|radio|rádio|rádio|radio|rádio|radio|радио|rádió'),
      },
    ],
  },
  {
    key: 'music', name: '樂器與 DJ', ico: 'cat-music',
    items: [
      {
        key: 'guitar', name: '吉他與貝斯', sub: 'Gitaren · Gitarren', kw: 'guitar bass electric acoustic 電吉他 木吉他 貝斯 gitaar gitarre',
        map: {
          ...both(MP(728, [746, 747, 748])),
          vinted: { catalogs: [4828] },
          ka: { path: 's-musikinstrumente', c: 'c74', q: 'gitarre', narrow: true },
          ebay: { cat: 3858, q: 'gitarre' },
        },
        w: W('gitarre|gitaar|guitar|gitarr|kitara|gitara|kytara|gitara|chitarra|guitarra|chitara|китара|gitár'),
      },
      {
        key: 'synth', name: '鍵盤與合成器', sub: 'Keyboards en Synthesizers · Synthesizer', kw: 'synthesizer synth keyboard 合成器 電子琴 鍵盤 synthesizer',
        map: {
          ...both(MP(728, [751, 777])),
          vinted: { catalogs: [4830] },
          ka: { path: 's-musikinstrumente', c: 'c74', q: 'synthesizer', narrow: true },
          ebay: { cat: 180010, q: 'synthesizer' },
        },
        w: W('synthesizer|synthesizer|synthesizer|synthesizer|syntetisaattori|syntezator|syntezátor|syntetizátor|sintetizzatore|sintetizador|sintetizator|синтезатор|szintetizátor'),
      },
      {
        key: 'mic', name: '麥克風', sub: 'Microfoons · Mikrofone', kw: 'microphone mic 麥克風 收音 microfoon mikrofon', exclude: 'statief, standaard, ständer, stativ, kabel, karaoke',
        map: {
          ...both(MP(728, 757)),
          vinted: { catalogs: [5103] },
          ka: { path: 's-musikinstrumente', c: 'c74', q: 'mikrofon', narrow: true },
          ebay: { cat: 29946, q: 'mikrofon' },
        },
        w: W('mikrofon|microfoon|mikrofon|mikrofon|mikrofoni|mikrofon|mikrofon|mikrofón|microfono|microfone|microfon|микрофон|mikrofon'),
      },
      {
        key: 'dj', name: 'DJ 器材與混音器', sub: 'Dj-sets en Mengpanelen · DJ-Equipment', kw: 'dj mixer controller turntable 混音器 混音台 dj draaitafel mengpaneel mischpult',
        map: {
          ...both(MP(728, [738, 756])),
          vinted: { catalogs: [5091] },
          ka: { path: 's-musikinstrumente', c: 'c74', q: 'dj', narrow: true },
          ebay: { cat: 180014, q: 'dj' },
        },
        w: W('dj mixer|dj mixer|dj mixer|dj mixer|dj mikseri|mikser dj|dj mixpult|dj mixpult|mixer dj|mixer dj|mixer dj|dj миксер|dj keverő'),
      },
      {
        key: 'pedal', name: '效果器', sub: 'Effecten · Effektgeräte', kw: 'effects pedal guitar pedal 效果器 踏板 effectpedaal effektgerät',
        map: {
          ...both(MP(728, 744)),
          vinted: { catalogs: [4840] },
          ka: { path: 's-musikinstrumente', c: 'c74', q: 'effektgerät', narrow: true },
          ebay: { cat: 619, q: 'effektgerät' },
        },
        w: W('effektgerät|effectpedaal|guitarpedal|gitarrpedal|kitarapedaali|efekt gitarowy|kytarový efekt|gitarový efekt|pedale effetto|pedal de efeitos|pedala efect|китарен ефект|gitáreffekt'),
      },
      {
        key: 'gamp', name: '樂器音箱', sub: 'Gitaarversterkers · Gitarrenverstärker', kw: 'guitar amp bass amp combo 吉他音箱 gitaarversterker gitarrenverstärker',
        map: {
          ...both(MP(728, 745)),
          vinted: { catalogs: [4836] },
          ka: { path: 's-musikinstrumente', c: 'c74', q: 'verstärker', narrow: true },
          ebay: { cat: 619, q: 'gitarrenverstärker' },
        },
        w: W('gitarrenverstärker|gitaarversterker|guitarforstærker|gitarrförstärkare|kitaravahvistin|wzmacniacz gitarowy|kytarové kombo|gitarové kombo|amplificatore chitarra|amplificador guitarra|amplificator chitara|китарен усилвател|gitárerősítő'),
      },
    ],
  },
  {
    key: 'home', name: '家具與居家', ico: 'cat-home',
    items: [
      {
        key: 'chair', name: '椅子', sub: 'Stoelen · Stühle', kw: 'chair chairs stool 餐椅 椅 stoel stuhl',
        map: {
          ...both(MP(504, [530, 3194, 2128, 3203])),
          vinted: { catalogs: [3181, 3180, 3182, 3186, 3184] },
          ka: { path: 's-haus-garten', c: 'c80', q: 'stuhl', narrow: true },
          ebay: { cat: 3197, q: 'stuhl' },
        },
        w: W('stuhl|stoel|stol|stol|tuoli|krzesło|židle|stolička|sedia|cadeira|scaun|стол|szék'),
      },
      {
        key: 'sofa', name: '沙發與扶手椅', sub: "Banken en Fauteuils · Sofas, Sessel", kw: 'sofa couch armchair lounge chair 沙發 單人椅 bank fauteuil sessel',
        map: {
          ...both(MP(504, [505, 1939, 1937, 1940])),
          vinted: { catalogs: [3177, 3179, 3185, 3222] },
          ka: { path: 's-wohnzimmer', c: 'c88', q: 'sofa', narrow: true },
          ebay: { cat: 38208, q: 'sofa' },
        },
        w: W('sofa|bankstel|sofa|soffa|sohva|sofa|pohovka|pohovka|divano|sofá|canapea|диван|kanapé'),
      },
      {
        key: 'table', name: '桌子與書桌', sub: 'Tafels en Bureaus · Tische', kw: 'table desk coffee table dining table 桌 餐桌 書桌 茶几 tafel bureau tisch schreibtisch',
        map: {
          ...both(MP(504, [2758, 1949, 527, 1950, 3119, 508])),
          vinted: { catalogs: [3160] },
          ka: { path: 's-haus-garten', c: 'c80', q: 'tisch', narrow: true },
          ebay: { cat: 3197, q: 'tisch' },
        },
        w: W('tisch|tafel|bord|bord|pöytä|stół|stůl|stôl|tavolo|mesa|masă|маса|asztal'),
      },
      {
        key: 'cabinet', name: '櫃子', sub: 'Kasten · Schränke', kw: 'cabinet cupboard sideboard bookcase 櫃 書櫃 邊櫃 kast dressoir schrank kommode',
        map: {
          ...both(MP(504, [515, 516, 517, 518, 2764, 2863, 520, 1255, 1256, 519])),
          vinted: { catalogs: [3188, 3189, 3196, 3198, 3192] },
          ka: { path: 's-haus-garten', c: 'c80', q: 'schrank', narrow: true },
          ebay: { cat: 3197, q: 'schrank' },
        },
        w: W('schrank|kast|skab|skåp|kaappi|szafa|skříň|skriňa|armadio|armário|dulap|шкаф|szekrény'),
      },
      {
        key: 'lamp', name: '燈具', sub: 'Lampen · Lampen & Licht', kw: 'lamp lighting light pendant floor lamp 燈 吊燈 檯燈 lampen leuchte',
        map: {
          ...both(MP(504, [1258, 1944, 2760, 2761, 2762, 1260, 1259, 1622, 1265])),
          vinted: { catalogs: [3834] },
          ka: { path: 's-lampen-licht', c: 'c82' },
          ebay: { cat: 20697, q: 'lampe' },
        },
        w: W('lampe|lamp|lampe|lampa|valaisin|lampa|lampa|lampa|lampada|candeeiro|lampa|лампа|lámpa'),
      },
    ],
  },
  {
    key: 'fashion', name: '服飾', ico: 'cat-cloth',
    items: [
      {
        // 服飾只在有服飾分類的平台搜（只用品牌名搜尋會混進一堆不相干的東西）
        key: 'cloth', name: '服飾', sub: 'Kleding · Kleidung（Vinted、Marktplaats、2dehands、Kleinanzeigen、eBay）', kw: 'clothing clothes fashion 衣服 kleding kleidung mode',
        map: {
          mp: [{ l1: 621 }, { l1: 1776 }], tdh: [{ l1: 621 }, { l1: 1776 }],
          vinted: { catalogs: [1904, 5] },
          ka: { path: 's-mode-beauty', c: 'c153' },
          // eBay 的分類頁沒有關鍵字時讀不到商品：只有搜尋品牌或型號時才用
          ebay: { cat: 11450, needQ: true },
        },
      },
      {
        key: 'women', name: '女裝', sub: 'Kleding Dames · Damenbekleidung', kw: 'women womenswear ladies 女生 dames damen',
        map: {
          ...both({ l1: 621 }),
          vinted: { catalogs: [1904] },
          ka: { path: 's-kleidung-damen', c: 'c154' },
          ebay: { cat: 15724, needQ: true },
        },
      },
      {
        key: 'men', name: '男裝', sub: 'Kleding Heren · Herrenbekleidung', kw: 'men menswear 男生 heren herren',
        map: {
          ...both({ l1: 1776 }),
          vinted: { catalogs: [5] },
          ka: { path: 's-kleidung-herren', c: 'c160' },
          ebay: { cat: 1059, needQ: true },
        },
      },
      {
        key: 'shoes', name: '鞋子', sub: 'Schoenen · Schuhe', kw: 'shoes sneakers boots 鞋 球鞋 靴 schoenen schuhe',
        map: {
          mp: [{ l1: 621, l2: 625 }, { l1: 1776, l2: 642 }], tdh: [{ l1: 621, l2: 625 }, { l1: 1776, l2: 642 }],
          vinted: { catalogs: [16, 1231] },
          ka: [{ path: 's-schuhe-damen', c: 'c159' }, { path: 's-schuhe-herren', c: 'c158' }],
          ebay: [{ cat: 3034, needQ: true }, { cat: 93427, needQ: true }],
        },
      },
      {
        key: 'bags', name: '包包', sub: 'Tassen · Taschen', kw: 'bags handbag backpack 包 手提包 後背包 tassen taschen',
        map: {
          vinted: { catalogs: [19, 94] },
          ka: { path: 's-accessoires-schmuck', c: 'c156', q: 'tasche', narrow: true },
          ebay: { cat: 169291, needQ: true },
        },
      },
    ],
  },
  {
    key: 'bike', name: '單車', ico: 'cat-bike',
    items: [
      {
        key: 'bike', name: '單車', sub: 'Fietsen · Fahrräder', kw: 'bicycle bike cycling 腳踏車 自行車 fiets fahrrad',
        map: {
          ...both(MP(445, [446, 1621, 1667, 447, 1916, 461, 448, 453, 454, 460, 2026, 464, 466, 467, 458])),
          vinted: { catalogs: [4345] },
          ka: { path: 's-fahrraeder', c: 'c217' },
          ebay: { cat: 177831, q: 'fahrrad' },
        },
        w: W('fahrrad|fiets|cykel|cykel|polkupyörä|rower|kolo|bicykel|bicicletta|bicicleta|bicicletă|велосипед|kerékpár'),
      },
      {
        key: 'roadbike', name: '公路車', sub: 'Racefietsen · Rennräder', kw: 'road bike racing bike 公路車 跑車 racefiets rennrad',
        map: {
          ...both(MP(445, 464)),
          vinted: { catalogs: [4357] },
          ka: { path: 's-fahrraeder', c: 'c217', q: 'rennrad', narrow: true },
          ebay: { cat: 177831, q: 'rennrad' },
        },
        w: W('rennrad|racefiets|racercykel|racercykel|maantiepyörä|rower szosowy|silniční kolo|cestný bicykel|bici da corsa|bicicleta de estrada|bicicletă de șosea|шосеен велосипед|országúti kerékpár'),
      },
      {
        key: 'oldbike', name: '復古單車', sub: 'Oldtimer fietsen · Vintage Fahrräder', kw: 'vintage bike retro bicycle classic 老車 古董腳踏車 oldtimer fiets',
        map: {
          ...both(MP(445, 2026)),
          ka: { path: 's-fahrraeder', c: 'c217', q: 'vintage', narrow: true },
          ebay: { cat: 177831, q: 'vintage fahrrad' },
        },
        w: W('vintage fahrrad|oldtimer fiets|retro cykel|retro cykel|retro polkupyörä|rower retro|retro kolo|retro bicykel|bici vintage|bicicleta vintage|bicicletă retro|ретро велосипед|retro kerékpár'),
      },
    ],
  },
  {
    key: 'media', name: '唱片與書', ico: 'cat-media',
    items: [
      {
        key: 'vinyl', name: '黑膠唱片', sub: 'Vinyl · Schallplatten', kw: 'vinyl records lp 黑膠 唱片 elpee plaat schallplatte',
        map: {
          ...both(MP(1744, [1682, 1372, 3248, 1373, 2719, 1374, 1375, 2721, 1376, 1762, 1377, 1378, 1763, 3249, 1379, 1382, 1383, 1380, 1384])),
          vinted: { catalogs: [3041] },
          ka: { path: 's-musik-cds', c: 'c78', q: 'vinyl', narrow: true },
          ebay: { cat: 176985, q: 'vinyl' },
        },
        w: W('schallplatten|vinyl lp|vinylplader|vinylskivor|lp-levy|płyty winylowe|gramofonové desky|gramofónové platne|dischi vinile|discos vinil|discuri vinil|грамофонни плочи|bakelit lemez'),
      },
      {
        // 書：用關鍵字搜各國平台只會搜到一堆不相干的東西，只在有書籍分類的平台搜
        key: 'books', name: '書', sub: 'Boeken · Bücher', kw: 'books book 書籍 boeken bücher',
        map: {
          ...both({ l1: 201 }),
          vinted: { catalogs: [2312] },
          ka: { path: 's-buecher-zeitschriften', c: 'c76' },
          ebay: { cat: 261186, needQ: true },
        },
      },
    ],
  },
  {
    key: 'collect', name: '收藏與撿漏', ico: 'cat-naive',
    items: [
      {
        key: 'antique', name: '古董與藝術品', sub: 'Antiek en Kunst · Antiquitäten, Kunst', kw: 'antique art vintage collectibles 古董 藝術 收藏 antiek kunst antiquitäten',
        map: {
          ...both({ l1: 1 }),
          ka: { path: 's-kunst-antiquitaeten', c: 'c240' },
          ebay: { cat: 353, q: 'antik' },
        },
        w: W('antik|antiek|antik|antik|antiikki|antyk|starožitnost|starožitnosť|antiquariato|antiguidade|antichitate|антика|antik'),
      },
      {
        // 撿漏：不懂行情的賣家常用的標題（老相機、爺爺的、遺物、閣樓找到的），每個平台用當地語言搜尋
        key: 'naive', name: '素人賣家', sub: 'oude camera · alte Kamera · vecchia macchina fotografica…', kw: 'naive seller bargain estate attic old camera 撿漏 遺物 老相機',
        bargain: true, map: {},
      },
    ],
  },
];

// 第一次使用時「我的分類」的預設內容（之後可以自由刪除、從目錄加回來）
export const STARTER_CATS = ['film', 'turntable', 'lamp', 'cloth', 'bike'];
// v1.4 以前的使用者原本看到的分類：更新後保留，不讓畫面突然變掉
export const LEGACY_CATS = ['film', 'lens', 'mic', 'rec', 'hp', 'cloth', 'naive'];
