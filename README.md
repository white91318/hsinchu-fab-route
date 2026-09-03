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

## 即時資料(國道路段)

`src/lib/live/freewayClient.ts` 會嘗試向高速公路局「交通資料庫」(tisvcloud.freeway.gov.tw,免驗證、免費使用)抓取即時路況 XML,依交流道關鍵字比對到 `N1_NORTH`、`N1_MID`、`N1_SOUTH`、`N3_ZHUNAN` 這 4 個國道路段,覆蓋掉模擬基準線;抓不到或比對不到時,該路段自動退回模擬值,不會顯示空白或假資料。

`src/lib/live/hccgClient.ts` 是新竹市開放資料平臺的**診斷用**查詢(CKAN `package_search`),只回報有哪些疑似路況相關資料集,目前不會拿它覆蓋任何路段——因為 PRD §7 本來就把市區/園區即時官方資料標為「待確認」,目前沒有已知可用的即時資料集。

### ⚠️ 尚未實際連線驗證

寫這段程式碼時,執行環境的網路出口白名單擋掉了 `tisvcloud.freeway.gov.tw`、`opendata.hccg.gov.tw`、`tdx.transportdata.tw`,所以**下列細節是根據公開文件與間接資料推斷,並未實際打過一次真實 API**:

- `src/lib/live/freewayConfig.ts` 裡 `FREEWAY_LIVE_URL_CANDIDATES` 的確切檔名(已確認的只有:資料免驗證、根目錄放即時檔案、遵循「即時路況資料標準 v2」、欄位含 `SectionID`/`TravelTime`/`TravelSpeed`)
- 即時資料裡實際會出現哪些欄位可以拿來比對路段名稱(`freewayClient.ts` 的 `NAME_KEYS` 是猜的候選欄位清單)
- `opendata.hccg.gov.tw` 是否真的是 CKAN 架構

部署到能連上網路的環境後,**請務必**:
1. 直接瀏覽 `https://tisvcloud.freeway.gov.tw/` 找到真正的即時路況檔名,更新 `freewayConfig.ts`
2. 呼叫一次 `/api/live-traffic`,確認 `freeway.status` 是 `"ok"` 且 `readings` 有抓到 4 個國道路段
3. 視需要調整 `FREEWAY_SEGMENT_MATCHERS` 的關鍵字比對邏輯

程式碼本身已經處理好「來源打不通、格式不對、比對不到」的每一種失敗情況(見 `freewayClient.ts` 的 try/catch 與 `SourceHealth`),所以就算上面這些細節猜錯,應用程式也只會安靜地退回模擬路況並在畫面上誠實標示,不會壞掉。

## 已知限制

- 市區、園區道路與班別交接尖峰仍是時間函式模擬(含施工示範情境)。
- 即時資料只在檢視「目前時間」時套用;把時間軸拖到其他時刻一律顯示模擬值,避免把即時資料誤用在非當下的模擬情境上。
- 尚未有資料庫或排程抓取歷史,對應 PRD 里程碑 M0(可行性驗證),還沒到 M2(正式接資料 + 歷史保存)。

詳見產品 PRD 的「路網與壅塞模型」「資料來源與整合」「非功能需求」與「風險與假設」章節。
