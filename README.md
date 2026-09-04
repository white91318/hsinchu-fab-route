# 竹科塞車通

給新竹科學園區通勤族的路況決策工具:今天走哪條路、哪裡在施工、大廠什麼時候交接班。

這個 Next.js 專案是 Phase 1 功能「今天走哪條路」的正式程式碼版本,移植自互動原型(見產品 PRD 附錄 A)。國道 1 號／3 號路段會嘗試串接高速公路局即時路況(見下方「即時資料」),其餘市區、園區路段與班別交接尖峰仍是**時間函式模擬**(見 PRD §6.2、§7)。

## 開發

```bash
npm install
npm run dev
```

打開 [http://localhost:3000](http://localhost:3000)。

```bash
npm run lint   # ESLint
npx tsc --noEmit  # 型別檢查(需先跑過一次 build/dev,讓 Next.js 產生 .next/types)
npm run build  # production build
npm run check:parsers  # 即時資料解析器檢查(不需網路)
```

## 專案結構

- `src/lib/data/` — 路網資料:路段(`segments.ts`)、節點(`nodes.ts`)、邊(`edges.ts`,含雙向鄰接表)
- `src/lib/traffic/` — 壅塞模型(`model.ts`,模擬基準線 + 即時資料覆蓋)與型別定義
- `src/lib/routing/` — 路徑搜尋(`pathfinding.ts`)、單一路徑評估與合併同路多段(`computePath.ts`)、選出最佳與次佳相異路線(`selectRoutes.ts`)
- `src/lib/diagram/` — 捷運圖式 SVG 幾何工具(直角轉彎路徑、標籤定位)
- `src/lib/live/tdx/` — TDX 客戶端:OAuth2 token 快取(`auth.ts`)、國道即時路況與路段名稱對應(`freeway.ts`)
- `src/lib/live/constructionClient.ts` — 新竹市工務處施工公告解析(當日公告優先)
- `src/app/api/live-traffic/` — 伺服器端代理:聚合即時資料來源,回傳給前端輪詢(TDX 憑證只在這裡用)
- `src/app/api/diagnostics/` — 來源連通性與回應格式探測(部署後用來把猜測換成事實)
- `src/hooks/useCommuteState.ts` — 頁面互動狀態(時間、平日/假日、出發地/目的地、播放)
- `src/hooks/useLiveTraffic.ts` — 每 2 分鐘輪詢 `/api/live-traffic`,失敗時保留上次成功的資料與時間戳
- `src/components/` — 地圖、時間軸控制、路段標籤、建議路線卡、即時資料狀態列等 UI 元件
- `src/hooks/useIsWideViewport.ts` — 客戶端視窗寬度判斷(SSR 一律回 `false`,掛載後才升級,避免 hydration 不一致)

## 手機優先的版面決策

PRD 把手機列為主要使用情境,所以版面以 iPhone 12(390×844)為基準驗過:

- **選單是主要輸入,地圖是次要參考。** 捷運圖上的站點在手機上只有約 10px,點不準;所以出發地／目的地改用 `RouteSelectors.tsx` 的兩個 `<select>`,地圖收進 `NetworkMapSection.tsx` 的可折疊卡片,手機預設收合、桌機(≥760px)自動展開,使用者手動切換一律優先。地圖上點站點仍然可以選,兩邊共用同一份狀態。
- **答案在第一屏。** 建議路線卡排在選單正下方、時間軸之上;選完出發地和目的地後,路線名稱與預估時間不用捲動就看得到(實測卡片頂端在 y=490,視窗高 664)。時間軸是「想看其他時段」的次要工具,所以移到結果之後。
- **點擊目標 ≥44×44px**(Apple HIG 建議值,WCAG 2.5.8 只要求 24×24):`.node-select`、`.icon-btn`、`.seg button`、`.reset-btn`、`.map-toggle` 都符合。
- **路段標籤列在窄螢幕橫向捲動**,23 個標籤佔一列 48px,而不是堆成 23 行約 1000px。

## 即時資料

兩個來源,各自獨立降級——任何一個掛掉都不影響另一個,也絕不會顯示假資料。

### 1. 國道即時路況(TDX)

`src/lib/live/tdx/` 走 TDX 官方管道:OAuth2 client-credentials 換 token(快取到期前 60 秒才續)、再打
`api/basic/v2/Road/Traffic/Live/Freeway` 拿各路段旅行時間與車速,並用
`Road/Traffic/Section/Freeway` 的路段基本資料把 SectionID 對回交流道名稱,才能比對本站的 4 個國道路段
(`freewayConfig.ts` 的關鍵字比對,已處理「新竹」是「新竹系統」前綴的陷阱)。

**要啟用,請設定這兩個環境變數:**

```bash
TDX_CLIENT_ID=<你的 Client Id>
TDX_CLIENT_SECRET=<你的 Client Secret>
```

本機放在 `.env.local`(已被 `.gitignore` 排除);Vercel 在 Project Settings → Environment Variables 加,
加完要重新部署才會生效。**不要**加 `NEXT_PUBLIC_` 前綴——那會把密鑰打包進前端送給每個訪客。憑證只在
`/api/live-traffic` 這支伺服器端 route 使用,不會進 client bundle。

**API Key 是免費的**:一般會員用 email 註冊即可(約 3 個工作天人工審核),註冊後 Basic／Advanced／加值／
歷史四類服務預設就能呼叫,只有「機敏」類要另外申請;上面兩支都屬 Basic。速率限制註冊後是每個來源 IP
每秒 50 次(未註冊匿名呼叫是每天 50 次)。門檻是「要註冊、要等審核」,不是付費或企業資格。
申請:<https://tdx.transportdata.tw/>

沒設憑證時,狀態列顯示「尚未設定 TDX 憑證」(和「連不上」是不同狀態,因為前者沒有壞掉)。

### 2. 新竹市施工／交通管制公告

`src/lib/live/constructionClient.ts` 解析新竹市政府工務處最新消息
(<https://publicworks.hsinchu.gov.tw/News.aspx?n=538&sms=8972>)。這頁是 ASP.NET WebForms,沒有 JSON API,
所以是解析 HTML;解析器刻意不綁死版面(抓 `*_Content.aspx` 詳細頁連結,再在**同一個表格列／清單項內**找日期),
日期同時支援西元與民國年。當日公告會以「今日」標籤排在最前面。

抓不到或解析不到時,整張卡片**不顯示**——空卡片會被讀成「今天沒有施工」,那是讀不到資料時不能做的宣稱。

### 尚未驗證的部分(誠實標示)

TDX 的 Swagger 與工務處頁面**在這個開發沙箱都連不到**(egress 政策擋掉所有 `*.tw` 網域,含 `data.gov.tw`),
所以以下兩件事是依官方樣板與常見版面寫的防禦性實作,尚未對真實回應驗證過:

- TDX 回應是裸陣列還是包在某個 key 底下(解析器兩種都吃,取最長的陣列)
- 路段基本資料裡承載交流道名稱的確切欄位名(試多個候選鍵)

驗證方式:部署後打 `/api/diagnostics`,它會回報每個主機是否連得通、HTTP 狀態、實際看到的欄位名與筆數,
用事實取代這些猜測。`scripts/parser-checks.mjs`(`npm run check:parsers`)以合成 payload 覆蓋兩種
envelope、民國/西元日期、路段前綴陷阱等 21 項,可在無網路下執行。

### 先前來源的實測結論(保留紀錄)

`tisvcloud.freeway.gov.tw`、`opendata.hccg.gov.tw`、`odws.hccg.gov.tw` 從 Vercel **兩個機房**(美東 iad1、
東京 hnd1)實測都是連線層級失敗,看起來是直接擋掉雲端/機房 IP;`dep-traffic.hccg.gov.tw` 連得到但卡在
Cloudflare JS 驗證。這些路徑已從程式碼移除(它們每次請求要空等 24 秒的 timeout),改由上面兩個來源取代。

## 已知限制

- 市區、園區道路與班別交接尖峰仍是時間函式模擬(含施工示範情境)。
- 施工公告只做「列出來」,不會自動換算成某段路的壅塞係數——公告文字未必標明確切路段,硬套會產生假的精確度。
- 即時資料只在檢視「目前時間」時套用;把時間軸拖到其他時刻一律顯示模擬值,避免把即時資料誤用在非當下的模擬情境上。
- 尚未有資料庫或排程抓取歷史,對應 PRD 里程碑 M0(可行性驗證),還沒到 M2(正式接資料 + 歷史保存)。

詳見產品 PRD 的「路網與壅塞模型」「資料來源與整合」「非功能需求」與「風險與假設」章節。
