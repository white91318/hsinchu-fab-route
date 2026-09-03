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
```

## 專案結構

- `src/lib/data/` — 路網資料:路段(`segments.ts`)、節點(`nodes.ts`)、邊(`edges.ts`,含雙向鄰接表)
- `src/lib/traffic/` — 壅塞模型(`model.ts`,模擬基準線 + 即時資料覆蓋)與型別定義
- `src/lib/routing/` — 路徑搜尋(`pathfinding.ts`)、單一路徑評估與合併同路多段(`computePath.ts`)、選出最佳與次佳相異路線(`selectRoutes.ts`)
- `src/lib/diagram/` — 捷運圖式 SVG 幾何工具(直角轉彎路徑、標籤定位)
- `src/lib/live/` — 即時資料來源客戶端(見下方章節)
- `src/app/api/live-traffic/` — 伺服器端代理:聚合即時資料來源,回傳給前端輪詢
- `src/hooks/useCommuteState.ts` — 頁面互動狀態(時間、平日/假日、出發地/目的地、播放)
- `src/hooks/useLiveTraffic.ts` — 每 2 分鐘輪詢 `/api/live-traffic`,失敗時保留上次成功的資料與時間戳
- `src/components/` — 地圖、時間軸控制、路段標籤、建議路線卡、即時資料狀態列等 UI 元件

## 即時資料 — 目前狀態:全部退回模擬(已實測,非推測)

`src/lib/live/freewayClient.ts`(國道 4 路段)與 `src/lib/live/hccgClient.ts`(市區診斷查詢)都會嘗試連上公開資料源,失敗時自動退回模擬值,不會顯示空白或假資料——但**目前確實抓不到任何真實資料**,而且這不是「網址猜錯」的問題:

- 部署到 Vercel 後,實際用一支探測用的 API route 從**兩個不同機房**(美東 iad1、東京 hnd1)直接打 `tisvcloud.freeway.gov.tw`、`opendata.hccg.gov.tw`、`odws.hccg.gov.tw`(新竹市開放資料實際檔案主機)、`dep-traffic.hccg.gov.tw`(施工公告頁面),結果:
  - 前三個網域:**兩個機房都連線失敗**(`fetch failed`,連線層級失敗,不是 404),看起來是這些政府網域直接擋掉雲端/機房 IP 網段,跟地理位置無關。
  - `dep-traffic.hccg.gov.tw` 連得到,但擋在 Cloudflare 的 JS 驗證關卡前(伺服器端 fetch 沒有瀏覽器可以過關),抓不到實際公告內容。
- 透過政府資料開放平臺(data.gov.tw / data.nat.gov.tw,這兩個網域可以連)查到「高速公路發布路段即時路況資料」(datasetId 157203)的官方 metadata,確認**真正的資料來源其實是 TDX**(`https://tdx.transportdata.tw/api/basic/v2/Road/Traffic/Live/Freeway`),且**必須先在 TDX 平台註冊並建立 API Key**——沒有 TDX 憑證就是拿不到,不是網址問題。

**結論:在目前的 Vercel 部署架構下,免驗證管道走不通。要接上真國道即時路況,唯一路是去 TDX 註冊拿 API Key**,改用 OAuth2 client-credentials 呼叫上面那支 TDX API(`freewayClient.ts` 需要改寫呼叫方式,現在打的 tisvcloud 網址留著只是讓程式優雅降級,不代表它們可行)。市區路況與施工公告目前沒有找到任何可從這個架構存取的替代方案。

程式碼本身已經處理好「來源打不通、格式不對、比對不到」的每一種失敗情況(見 `freewayClient.ts`/`hccgClient.ts` 的 try/catch 與 `SourceHealth`),所以這個部署會一直安靜地顯示模擬路況並在畫面上誠實標示,不會壞掉——只是目前沒有一段路是真的即時資料。

## 已知限制

- 市區、園區道路與班別交接尖峰仍是時間函式模擬(含施工示範情境)。
- 即時資料只在檢視「目前時間」時套用;把時間軸拖到其他時刻一律顯示模擬值,避免把即時資料誤用在非當下的模擬情境上。
- 尚未有資料庫或排程抓取歷史,對應 PRD 里程碑 M0(可行性驗證),還沒到 M2(正式接資料 + 歷史保存)。

詳見產品 PRD 的「路網與壅塞模型」「資料來源與整合」「非功能需求」與「風險與假設」章節。
