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
- `src/lib/weather/` — Open-Meteo 客戶端與 WMO 代碼→天空狀態對應
- `src/components/WeatherBackdrop.tsx` — canvas 繪製的雨／陰／晴天空
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

三個來源,各自獨立降級——任何一個掛掉都不影響另外兩個,也絕不會顯示假資料。

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

### 2. 天氣背景(Open-Meteo)

`src/lib/weather/` 依當下天氣把地圖背後換成三種天空之一,由 WMO 4677 天氣代碼決定:

| WMO 代碼 | 天氣 | 背景 |
| --- | --- | --- |
| 51–57 · 61–67 · 71–77 · 80–86 · 95–99 | 毛毛雨／降雨／雪／陣雨／雷雨 | 雨天 |
| 3 · 45 · 48 | 陰天、霧 | 陰天 |
| 0 · 1 · 2 | 晴、大致晴、多雲時晴 | 晴天 |
| 其他無法辨識的代碼 | — | 陰天(中性,不猜晴或雨) |

雪歸在雨天:新竹平地實際上不會下雪,真下了「天上有東西掉下來」也是通勤族該看到的訊息。

天空是 `WeatherBackdrop.tsx` 用 canvas 即時繪製,不是 GIF——約 1KB 而不是好幾 MB、任何像素密度都不糊、
`prefers-reduced-motion` 時只畫一張靜止的天空。每種天空在 `.map-pane[data-weather]` 上各自指定可讀的
文字色與節點填色,所以亮天空不會配到淺色字(反之亦然),兩種主題下都成立。

Open-Meteo 免金鑰、實測從 Vercel 117ms 回應,伺服器端每 10 分鐘更新一次。抓不到天氣時**維持現在的天空
不變**(不會退回預設);第一次就抓不到則完全不畫,地圖坐在原本的頁面底色上。

中央氣象署(`opendata.cwa.gov.tw`)實測也連得到(回 401 缺金鑰),要換成官方資料只需申請免費金鑰並改寫
`fetchWeather`,其餘程式不用動。

### 3. 新竹市施工／交通管制公告

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

## M0:資料收集

PRD v0.2 §7 明講:這個網站目前顯示的路況是時間函式模擬,不是真實資料;要換成真實基準線(§7.1 的 p50／p75／
p90),得先累積至少 4 週的歷史路況(§14 M0 的出場條件)。M0 因此**不是功能開發,是一個持續執行的排程器**——
先把資料存起來,異常偵測與 LINE 推播都要等基準線算得出來才有意義。

- `src/lib/live/tdx/freeway.ts` 的 `fetchTdxCorridorSnapshots()`:抓 TDX 國道即時路況裡,凡是路段文字含
  竹科通勤走廊關鍵字(新竹、竹北、湖口、頭份、竹南,以及新竹系統—竹南之間查到的茄苳、香山、西濱)的所有路段,
  不侷限於本站顯示用的 4 個命名路段。哪些路段該合併成一條「路段」是顯示層的事,不必在收集當下就決定——這也
  是為什麼新竹系統到竹南那段(TDX 拆成 4 段,不是一段直達,見程式內註解)在這裡不是問題:每一段各自入庫,以
  後要怎麼串隨時可以從歷史資料回頭算。
- `src/lib/db/client.ts`:寫入 Postgres 的 `traffic_snapshot` 時序表(`section_id, section_name, source,
  travel_minutes, speed_kmh, ts, collected_at`),用 Neon 的 HTTP driver(`@neondatabase/serverless`)——
  cron 是短命的 serverless 呼叫,不需要維護連線池。
- `src/app/api/cron/collect/route.ts`:被排程呼叫的進入點,`Authorization: Bearer <CRON_SECRET>` 驗證。
- **排程**:`.github/workflows/collect-traffic.yml`。每小時的 cron **只是重啟觸發器**,真正的頻率來自
  job 內部的迴圈——進去之後每 5 分鐘打一次 route,持續約 5 小時 20 分後自行結束,等下一次 cron 把它重新拉起來。

  為什麼要這樣繞,兩個顯而易見的選項都被實測排除了,記在這裡免得之後有人再踩一次:

  - **Vercel 原生 Cron**:本專案是 Hobby 方案,一天只能跑一次。而且填比一天更頻繁的排程不是變慢,是
    **讓部署直接失敗**(`Hobby accounts are limited to daily cron jobs`)。Hobby 的每日 cron 連時間都不準,
    會在指定的那個小時內隨機挑時間;要分鐘級精度得升級 Pro(US$20/月)。
  - **GitHub 自己的 `schedule` 事件**:原本設 `*/5 * * * *`,實測 11 小時只跑 2 次(不是應有的約 130 次)。
    schedule 事件跑在共用的 best-effort 基礎設施上,官方明講不保證準時,短間隔實務上不會被遵守。

  **已知取捨(刻意接受的)**:長輪詢等於讓 runner 近乎全天候佔用,是 Actions 使用條款的灰色地帶。優先順序
  是先把資料累積起來,之後若 GitHub 有意見再換。換的成本很低——endpoint 本身跟排程器無關,改用 Vercel Pro
  的 cron 或外部 cron 服務都只是設定變更,不用改程式。

  幾個實作上的細節,拆掉任何一個都會讓它安靜地壞掉:
  - `concurrency` 群組確保同時只有一個收集器,否則每次重啟觸發都會再疊一個 5 小時的 job 上去。
  - 迴圈的死線設在 `timeout-minutes` 之前——被 timeout 砍掉的 run 會標記成失敗,真正的失敗就被雜訊蓋掉了。
  - `curl` 失敗時用 `|| status="000"` 接住:workflow 預設的 shell 是 `bash -e`,少了這個,一次連線失敗
    就會終止整個 run。
  - 只有「一次都沒成功」才讓 run 變紅。5 小時內偶發失敗是正常的,每次都變紅只會訓練大家忽略這個 workflow。

- **重複讀數處理**:`traffic_snapshot` 對 `(section_id, ts)` 建了唯一索引,寫入時 `ON CONFLICT DO NOTHING`。
  TDX 的即時路況大約每分鐘更新一次,而我們每 5 分鐘抓一次,所以有機會讀到還沒更新的同一筆讀數;把同一筆存兩次
  會在算 p50/p75/p90 時過度加權那個時間點,等於安靜地污染 M0 唯一要產出的東西。API 回應會分開回報
  `inserted` 與 `duplicates`,因為「上游沒有新資料」和「收集器壞了」從筆數上看起來是一樣的。

### 設定(已完成,記錄用)

1. **接一個 Postgres 資料庫**:Vercel 專案頁 → Storage 分頁 → Create Database → 選 Neon(免費方案即可)→
   連到 `hsinchu-fab-route` 這個專案。連完 Vercel 會自動把連線字串寫進環境變數;程式讀的是 `DATABASE_URL`,
   如果 Vercel 幫你取的變數名稱不是這個,去 Environment Variables 頁把值複製一份存成 `DATABASE_URL`
   (Production 環境)。
2. **設定 `CRON_SECRET`**:同一組值要設兩個地方——
   - Vercel 專案 → Settings → Environment Variables → 新增 `CRON_SECRET`(Production)
   - GitHub repo → Settings → Secrets and variables → Actions → 新增同名 secret `CRON_SECRET`

密鑰是用 `Authorization: Bearer` header 傳的,**不要改成用 query string**——網址會留在各種存取紀錄、
瀏覽器歷史與 referrer 裡,等於把密鑰散佈出去。之後若要換成外部 cron 服務,也要挑支援自訂 request header 的。

**環境變數改了之後一定要重新部署**才會生效:Vercel 是在建置當下把環境變數打包進該次部署的,既有的部署
不會回頭讀新值。可以用 `GET /api/cron/collect`(帶同一組 Bearer token)手動觸發一次,確認回應是
`{"status":"ok","fetched":N,"inserted":N,...}` 而不是 401 或 `not-configured`。

## 基準線批次(Baseline)

PRD §9 的 Baseline:每個路段 × 星期幾 × 15 分鐘時段的正常旅行時間分布(p50/p75/p90)。這是「今天跟平常
不一樣」裡的**平常**,異常判定(§7.2)全部靠它。

- `src/lib/baseline/bucket.ts` — 時段格子。全部用 **Asia/Taipei**,這不是顯示偏好的問題:格子的意義是
  「這裡正常的週二 08:00」,用 UTC 分桶會把每筆讀數平移 8 小時,台北的 00:00–08:00 會被歸到**前一天**的
  星期——週一清晨落進週日的桶裡,週一早尖峰就會拿去跟含週末車流的樣本比。錯得很安靜,不會壞給你看。
  批次在 SQL 裡分桶,消費端要在 TypeScript 裡算出同一個 key,兩份實作同一條規則本身就是風險,所以
  `scripts/parser-checks.mjs` 把邊界(台北午夜、UTC 換日、ISODOW 的星期天 = 7)釘住。
- `src/lib/baseline/classify.ts` — 純函式的異常分級,不碰資料庫所以可以直接測。門檻照 §7.2:≤P75 正常、
  >P75 且 ≤P90 注意、>P90 異常,下緣一律含等於(剛好落在 P75 的讀數按定義就在正常的四分之三裡,推播出去
  就是誤報,而 §4.2 把誤報率列為會殺死產品的指標)。樣本不足時回 **`unknown`,不是 `normal`**——這兩個
  是不同的宣稱,「正常」是在告訴通勤者今天路上沒事,拿三筆讀數講這句話正是 §11(資料誠實)要擋的事。
- `src/lib/baseline/compute.ts` — 批次本體。從 `traffic_snapshot` 的**滾動 8 週**視窗整批重算:百分位數
  本來就無法增量維護(要維護也得留著整份樣本),整批重算則保證 baseline 表跟原始資料永遠對得起來。
  幾個刻意的選擇:
  - 一句 `INSERT … ON CONFLICT DO UPDATE`,不是 DELETE 再 INSERT。後者會有一段空窗期,那段時間任何比對
    都會得到「每條路都 unknown」——自己造成的停機。
  - 視窗外已無資料的桶會被刪掉(比對資料庫時鐘取的 `computed_at`,不是應用端的時鐘,否則幾秒的時差就會
    刪掉這次剛寫進去的列)。留著舊數字的桶,對讀取端來說跟新鮮的桶長得一模一樣。
  - 只濾掉 `travel_minutes <= 0`(壞讀數)。異常**慢**的讀數不濾——那通常是真的塞車,而 p90 就是為了
    記得這種時候而存在的。
- `src/app/api/cron/baseline/route.ts` — 每日重算的進入點,一樣用 `Authorization: Bearer <CRON_SECRET>`。
  **這個排程 Vercel Hobby 跑得動**:每日正是它唯一允許的頻率,所以不像 5 分鐘的收集需要繞路,直接寫在
  `vercel.json`(19:20 UTC / 台北 03:20)。八週的百分位數不會因為多一天的資料而變多少,算更密只是浪費。
  回應會回報 `buckets` 與 `reliableBuckets`——後者是樣本數過門檻、真的能拿來判斷的桶數,也就是決定
  M0 何時算完成的那個數字。同一份數字也接在 `/api/diagnostics/collection` 的 `baseline` 欄位裡(讀不到
  就給 `null`,基準線還沒建起來不該讓「收集器是否活著」的報告一起掛掉)。
- 要臨時重算一次(例如改了視窗長度)可以跑 GitHub Actions 的 **Recompute baseline** workflow,
  手動觸發,不需要自己拿到 `CRON_SECRET`。
- `scripts/baseline-sql-check.sql` — 批次的 SQL 用真的 Postgres 驗過:百分位數的值、台北分桶(用一筆
  台北 07:30 / UTC 前一天 23:30 的讀數,分在 UTC 就會掉到前一天的 bucket 94)、`travel_minutes <= 0`
  被排除、視窗外被排除、過期的桶被刪掉、重跑不會撞主鍵。這些 SQL 走 Neon 的 HTTP driver,單元測試碰不到,
  出錯只會變成生產環境裡一份安靜錯掉的基準線。
  跑法:`BASELINE_CHECK_DATABASE_URL=... npm run check:baseline-sql`(**指向臨時資料庫**,腳本會自己
  建表刪表)。已知限制:那份 SQL 是 `compute.ts` 的複本,沒有任何機制保證兩邊同步——改批次時要一起改。

## LINE Bot(骨架,尚未啟用)

PRD v0.2 §10.1:主通路是 **LINE 官方帳號 + Messaging API**(不是 2025-03-31 已停止服務的 LINE Notify)。
**不需要另外架 server**——webhook 就是這個 Next.js 專案裡的一支 API route,跟 `/api/live-traffic` 同一種東西;
排程推播則是由外部排程器打進來(跟 M0 collector 同一套機制)。

- `src/lib/line/signature.ts` — 驗證 `x-line-signature`:以 channel secret 為金鑰,對**原始 request body**
  做 HMAC-SHA256 再 base64。兩個關鍵細節:body 必須是未經解析的原始字串(解析成 JSON 再序列化會改變字串,
  簽章就永遠對不上),比對必須用 `timingSafeEqual`(用 `===` 會從回應時間洩漏猜對了幾個位元組)。沒有這道
  檢查,任何知道 webhook 網址的人都能送假事件進來。
- `src/lib/line/client.ts` — `replyMessage()`(回覆事件,reply token 一次性、有時效)與 `pushMessage()`
  (主動推播,之後的每日摘要與異常警報用這支)。
- `src/app/api/line/webhook/route.ts` — webhook 進入點。

目前的回覆內容刻意很少:驗證簽章、確認事件、誠實回答「警報還沒開始運作」。因為每日摘要(§6.1)和異常警報
(§6.2)都要跟基準線比對,而 M0 還在累積那 ≥4 週的資料——在那之前假裝這些功能會動,等於捏造這個產品唯一
要賣的東西。

### 要啟用,你要做的事

1. 到 [LINE Developers Console](https://developers.line.biz/console/) 建立 Provider,底下開一個
   **Messaging API channel**
2. 取得 **Channel Secret** 與 **Channel Access Token**
3. 在 Vercel 加兩個環境變數(Production):`LINE_CHANNEL_SECRET`、`LINE_CHANNEL_ACCESS_TOKEN`。
   一樣**不要**加 `NEXT_PUBLIC_` 前綴——channel secret 是用來證明 webhook 真的來自 LINE 的,access token
   能以官方帳號名義發訊息,兩個洩漏到前端等於把這兩種能力送給每個訪客。
4. 在 Console 把 Webhook URL 設成 `https://hsinchu-fab-route.vercel.app/api/line/webhook`,並啟用 webhook

沒設定 `LINE_CHANNEL_SECRET` 時,webhook 會回 503(沒有 secret 就無法分辨真假請求,不能處理任何事件),
不會靜默接受。

## 已知限制

- 市區、園區道路與班別交接尖峰仍是時間函式模擬(含施工示範情境)。
- 施工公告只做「列出來」,不會自動換算成某段路的壅塞係數——公告文字未必標明確切路段,硬套會產生假的精確度。
- 即時資料只在檢視「目前時間」時套用;把時間軸拖到其他時刻一律顯示模擬值,避免把即時資料誤用在非當下的模擬情境上。
- M0 的資料收集管線已經寫好(見上一節),但要接上資料庫、設定密鑰才會真的開始累積——這兩步是人工設定,不是程式碼。

詳見產品 PRD 的「路網與壅塞模型」「資料來源與整合」「非功能需求」與「風險與假設」章節。
