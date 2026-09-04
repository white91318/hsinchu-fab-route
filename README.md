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
- `src/components/BottomSheet.tsx` — 手機底部浮動面板(三段吸附、可拖曳/可點擊切換);桌機由 CSS 轉成左欄
- `src/components/RoutePanel.tsx` — 兩種版型共用的控制與結果內容
- `src/components/MapPane.tsx` — 地圖窗格:分段縮放、浮動圖例

## 版面:地圖為主,面板為輔

同一份 DOM 服務兩種版型(`RoutePanel` 只渲染一次),所以兩邊行為不會走鐘,視窗跨越斷點時也不會重新掛載而丟失狀態。

- **手機(<900px):App 式全螢幕。** 地圖佔滿整個 body 高度,`BottomSheet` 浮在上面。整頁不捲動(`height:100dvh; overflow:hidden`),內容在面板內部捲。面板三段吸附:14%(只留摘要)、50%(預設)、90%(全開);拖曳把手可無段拖動、放開吸附到最近一段,點一下則依序切換——所以鍵盤與螢幕閱讀器也操作得動,不是只有手勢。收合狀態仍顯示建議路線與分鐘數,「今天走哪條路」這個問題永遠看得到答案。
- **桌機(≥900px):兩欄。** 左欄固定 `minmax(380px, 34%)` 是同一個面板(把手隱藏、滿版高度),右欄是地圖。整頁不捲動,選完出發地/目的地後建議路線卡與兩張路線比較卡都在第一屏(實測 1440×900:卡片底端 y=464)。
- **地圖 1× 時整張塞滿窗格**(靠 viewBox 的等比縮放留白,不是變形),所以預設不需要捲地圖;按 ＋ 放大後才變成可平移的捲動區,手機上也保留瀏覽器原生的雙指縮放。
- 點擊目標維持 ≥44×44px;地圖點站點與面板下拉選單共用同一份狀態,兩邊互相同步。

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

### 從 Vercel 實測的連通性結論

部署後打 `/api/diagnostics`(以及一支獨立探測),結果:

| 主機 | 結果 |
| --- | --- |
| `tdx.transportdata.tw` | **連得到**。未帶憑證打 token endpoint 得到 `400 invalid_client`(1.06 秒)——Keycloak 的正常回應,代表網址、grant type 與參數格式都正確,只差真憑證。 |
| `publicworks.hsinchu.gov.tw` | **連不到**。10.5 秒後 `fetch failed`(連線層級失敗,非逾時);放寬到 45 秒一樣。`www.hsinchu.gov.tw` 同樣失敗。 |
| `data.gov.tw` | 連得到(同一支程式 0.5 秒回應)——證明不是 Vercel 端的網路問題,是新竹市政府網域擋掉雲端 IP。 |

也就是說:**TDX 只要拿到 Key 就會通;施工公告在這個部署架構下拿不到資料**,程式與解析器已完成並通過檢查,
但需要一個台灣境內的抓取端(例如自架小型 fetcher 定時把公告推到本站)才能真的顯示。

### 尚未驗證的部分(誠實標示)

TDX 的 Swagger 在開發沙箱連不到(egress 政策擋掉所有 `*.tw` 網域,含 `data.gov.tw`),
所以以下兩件事是依官方樣板與常見版面寫的防禦性實作,尚未對真實回應驗證過:

- TDX 回應是裸陣列還是包在某個 key 底下(解析器兩種都吃,取最長的陣列)
- 路段基本資料裡承載交流道名稱的確切欄位名(試多個候選鍵)

驗證方式:填入憑證後打 `/api/diagnostics`,它會回報實際看到的欄位名與筆數(`shapeReport`),用事實取代這些猜測。`scripts/parser-checks.mjs`(`npm run check:parsers`)以合成 payload 覆蓋兩種
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
