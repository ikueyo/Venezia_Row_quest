# Venice Row Quest — 專案指引

夏令營義大利主題的 iPad 體感遊戲:學生對著鏡頭做划船動作(MediaPipe Pose 追蹤手腕),
操縱 3D 貢多拉穿過五道水門,把掃描的彩繪玻璃作品送到教堂安裝。純靜態網站,**沒有
build 步驟**,直接編輯、直接部署。

## 檔案結構

| 檔案 | 角色 |
| --- | --- |
| `index.html` + `three-rowing.js` + `rowing.css` | **主遊戲**(Three.js 3D 版,目前唯一使用中的版本) |
| `gallery.html` + `gallery.js` | 教堂內部藝廊(讀同一份 localStorage) |
| `teacher-test.html` | 純靜態的老師操作說明頁(只有連結,無 script) |
| `assets/` | 選用音檔(缺檔自動略過,見 README 的 Audio 表格) |

(舊版 2D canvas 原型 `app.js`、`rowing.js`、`styles.css` 已於 2026-07 刪除,需要時從 git 歷史找。)

Three.js 0.165 與 MediaPipe 都從 jsDelivr CDN 經 import map 載入(見 `index.html`),
需要 iPadOS 16.4+。

## 本機執行與測試

```powershell
python -m http.server 5173
# http://localhost:5173/index.html?test=1  ← 測試模式(免鏡頭,有 Left/Right/Row/Boost/Finish 按鈕)
```

視覺驗證:系統已有 Playwright(chromium 已快取),可起本機伺服器對 `?test=1` 截圖,
點 `#startGame` 後等 4.5 秒倒數再操作測試按鈕。

## 部署

Firebase Hosting(專案 `venezia-row-quest`,serve repo root):

```bash
firebase deploy --only hosting
```

**相機需要 HTTPS**——在 iPad 上一律用部署後的 `https://venezia-row-quest.web.app/`,
別用 `http://IP` 區網網址測相機。使用者通常自行部署;除非被要求,不要主動 deploy。

## iPad Safari 地雷(本專案踩過的,不要回退)

- `HTMLMediaElement.volume` 在 iOS **無效**:音量控制一律走 WebAudio GainNode
  (`routeMusicThroughGain()` / gallery 的 `routeGalleryMusic()`)。
- 改 `playbackRate` 會讓 iPad Safari 重新解碼、爆音或靜音:音樂固定 1.0×。
- 行動裝置 autoplay 規則:所有音訊都在第一次使用者手勢(按鈕/pointerdown)解鎖。
- 對 `canvas.width` 賦值(即使同值)會清空並重配置緩衝區:`analysisCanvas` 只在啟動時
  設定一次,絕不能放進每幀的 `resize()`。
- 效能預算很緊:水面法線用波函數偏導數解析計算(不要換回 `computeVertexNormals()`)、
  pixelRatio 上限 1.5、bloom 半解析度、閘門材質只在切換時重指派。
- iPadOS 相機串流有旋轉 90° 的 WebKit bug:`startCamera()` 刻意**不帶**寬高/比例
  constraints,並在拿到直向串流時自動重試(`healCameraOrientation()`)。

## 槳(remo)的幾何約定

`createOar(dir)`:群組原點=槳架(船舷上 `±0.7, 0.72`),所有零件沿局部 x 軸排列,
`dir` 是指向槳葉的局部 x 正負號(左槳 `-1`、右槳 `+1`)。`OAR_TILT`(0.55 rad)是
靜止時低於水平的斜角,讓槳葉尖端剛好碰到水面。`updateOar()` 用 `rotation.x` 做前後
掃動、`rotation.z` 做入水深度。**槳葉必須在桿軸上(局部 y=0)**、握把端不能超過離
樞軸 0.55(再長會穿過船員的頭)。改槳的幾何時,記得同步 `updateSplashEmitters()`
的水花生成位置(目前 `±2.0`)。細節見 README「Oar model (remo) — design notes」。

## 其他約定

- 程式註解與 README 用英文;與使用者的對話用繁體中文(全域偏好)。
- 資料只存 localStorage(`venice-church-windows-v1`),每台裝置各自獨立,沒有後端。
- 管理密碼在 `three-rowing.js` 的 `ADMIN_PASSWORD`。
- 調參數速查表在 README 的「Tuning cheatsheet」。
