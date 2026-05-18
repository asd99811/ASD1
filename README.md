# ASD1 — 現場勘查照片整理工具

這是一個純前端、單頁式的現場勘查照片/PDF 整理工具。使用者可以上傳一張照片或 PDF 當作主視窗底圖，像地圖一樣縮放/拖曳瀏覽，並在底圖上放置可編輯、可拖曳的標籤。每個標籤可記錄標題、勘查時間、註解與補充照片，專案資料會存到瀏覽器 `localStorage`，也可匯出/匯入 JSON。

## 快速啟動

這個專案沒有建置流程，也沒有外部套件依賴。直接用瀏覽器開啟 `index.html` 即可。

建議開發時用本機靜態伺服器，避免瀏覽器對 `file://` 有不同限制：

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

然後打開：

```text
http://127.0.0.1:4173/index.html
```

## 使用流程

1. 開啟 `index.html`。
2. 上傳 PDF 或照片作為主視窗底圖；重新選擇底圖時會初始化視圖並清空既有標籤。
3. 使用滑鼠滾輪、縮放滑桿、＋/－按鈕縮放；最小縮放為 100%，不會縮小到原始主視窗範圍以下，圖釘會依縮放倍率自動微調尺寸，避免放大時跟著變大。
4. 按住主視窗拖曳瀏覽。
5. 切換到「新增標籤」後點擊底圖新增標籤；只有在此模式下，既有標籤才可拖曳調整位置。
6. 標籤內容會以右側浮動標籤頁顯示，可拖曳移動；開啟時主視窗仍可同時操作。每張補充照片可另外手寫照片標題與照片註解。
7. 可匯出 JSON 備份專案，也可再匯入 JSON 繼續編輯。

## 檔案架構

| 檔案 | 角色 | 修改重點 |
| --- | --- | --- |
| `index.html` | 靜態 DOM 結構 | 新增欄位、按鈕、頂部設定列、左側標籤清單或右側浮動標籤頁時先改這裡。所有互動元素大多靠 `id` 被 `app.js` 查找。 |
| `styles.css` | UI 與互動狀態樣式 | 版面、頂部設定列、可隱藏/釘住的標籤清單、主視窗、圖釘、active 狀態、浮動標籤頁、響應式樣式都在這裡。 |
| `app.js` | 所有應用邏輯 | 狀態、檔案讀取、縮放/拖曳、標籤 CRUD、照片預覽、JSON 匯入/匯出、localStorage。 |
| `README.md` | 專案說明 | 讓後續 Agent 或開發者快速理解修改方向。 |

## HTML 結構導覽

`index.html` 的主要區塊：

- `.app-header`：頁首與 JSON 匯入/匯出按鈕。
- `.settings-bar`：頂部設定列。
  - `#baseFileInput`：上傳底圖（PDF 或圖片）。
  - `#panMode` / `#pinMode`：切換拖曳瀏覽與新增標籤模式。
  - `#zoomSlider`、`#zoomOut`、`#zoomIn`：縮放控制；目前最小值為 100%。
- `#pinPanel` / `.control-panel`：左側標籤清單，可隱藏到左側，也可用 `#pinPanelPin` 釘住。
  - `#hidePinPanel`：隱藏標籤清單。
  - `#showPinPanel`：從左側重新展開標籤清單。
  - `#pinList`：標籤清單。
- `.viewer-card` / `#viewer`：主視窗。
  - `#stage`：實際被 transform 縮放/平移的底圖舞台。
  - `#baseImage`：圖片底圖。
  - `#basePdf`：PDF 底圖。
  - `#pinLayer`：標籤圖層。
- `#pinEditor`：右側浮動標籤內容頁，不使用 modal，所以開啟時主視窗仍可操作。
  - `#pinEditorHeader`：拖曳標籤內容頁的位置。
  - `#pinTitle`、`#pinTime`、`#pinNote`、`#pinPhotos` 對應標籤資料欄位。
  - `#photoPreview` 顯示補充照片預覽，並動態產生每張照片的「照片標題」與「照片註解」欄位。

> 注意：如果修改任一元素 `id`，通常也要同步修改 `app.js` 的 `elements` 查找表。

## JavaScript 架構導覽

`app.js` 沒有使用框架，核心是 `state`、`elements`、一組功能函式與事件監聽器。

### `state` 資料模型

```js
{
  mode: 'pan' | 'pin',
  scale: number,
  translateX: number,
  translateY: number,
  pins: Pin[],
  activePinId: string | null,
  baseFile: { name: string, dataUrl: string } | null,
  baseType: 'pdf' | 'image' | null,
  isDragging: boolean,
  draggingPinId: string | null,
  didMovePin: boolean,
  suppressPinClick: boolean,
  dragStart: { x: number, y: number },
  startTranslate: { x: number, y: number }
}
```

標籤 `Pin` 結構：

```js
{
  id: string,
  x: number,
  y: number,
  title: string,
  time: string,
  note: string,
  photos: Array<{ name: string, title: string, note: string, dataUrl: string }>
}
```

### 重要函式分區

- 視窗/座標/縮放
  - `getStageBaseOffset()`：取得 `#stage` 以 viewer 中心定位時的基準偏移。
  - `clampViewport()`：限制主視窗平移範圍，避免拖曳後露出過多空白背景。
  - `applyTransform()`：套用 `translate(...) scale(...)`，同步縮放 UI 顯示，並把 `--pin-marker-scale` 寫到 `#pinLayer`，讓圖釘在主畫面放大時自動縮小。
  - `viewerPointToStagePoint(clientX, clientY)`：把滑鼠座標換算成 `#stage` 內座標。新增或拖曳標籤時會用到。
  - `zoomAt(nextScale, clientX, clientY)`：以滑鼠位置或 viewer 中心為縮放中心，並透過 `getMinimumScale()` 限制最小縮放為 100%。
- 底圖檔案
  - `readFileAsDataUrl(file)`：用 `FileReader` 將檔案轉成 data URL。
  - `loadBaseFile(file)`：讀取使用者上傳的 PDF/圖片；會先呼叫 `resetProjectForNewBaseFile()` 清空既有標籤並重設視圖。
  - `resetProjectForNewBaseFile()`：重新選擇底圖時初始化標籤、目前選取、縮放/平移與右側標籤頁。
  - `showBaseMedia()`：依 `baseType` 顯示 `#baseImage` 或 `#basePdf`。
- 標籤
  - `createPin(x, y)`：建立新標籤。
  - `renderPins()`：重繪圖釘與左側清單。
  - `openPinDialog(pinId)`：開啟右側浮動標籤內容頁。
  - `saveActivePin()`：儲存浮動標籤頁欄位回目前標籤。
  - `startPinDrag()` / `moveActivePin()` / `finishPinDrag()`：拖曳既有標籤調整位置；`startPinDrag()` 會檢查 `state.mode === 'pin'`，所以只有新增標籤模式可移動標籤。
  - `updateActivePinStyles()`：同步圖釘與清單的 active 顏色。
  - `hidePinPanel()` / `showPinPanel()` / `setPinPanelPinned()`：控制左側標籤清單隱藏、展開與釘住狀態。
  - `startEditorDrag()` / `moveEditor()` / `finishEditorDrag()`：拖曳右側標籤內容頁。
- 專案保存
  - `getProjectData()`：組出可儲存/匯出的專案 JSON。
  - `saveProject()`：寫入 `localStorage`。
  - `restoreProject(project)`：從 JSON 還原狀態。
  - `downloadProject()` / `importProject(file)`：JSON 匯出/匯入。

## 座標系統與拖曳注意事項

`#stage` 在 CSS 中設定：

```css
.stage {
  left: 50%;
  top: 50%;
  transform-origin: 0 0;
}
```

因此 `state.translateX` / `state.translateY` 不是單純相對 viewer 左上角，而是疊加在「viewer 中心點」之後的偏移。修改縮放、拖曳、標籤定位時，請優先使用既有函式：

- 滑鼠座標轉 stage 座標：`viewerPointToStagePoint(...)`
- 限制標籤不要超出底圖：`clampPinToStage(...)`
- 限制底圖不要拖出可視範圍：`clampViewport()` / `applyTransform()`

不要在事件處理器中自行重寫座標換算，否則很容易造成標籤位置、縮放中心或拖曳邊界偏移。

## 樣式修改重點

- 全站配色集中在 `:root` CSS variables。
- `.viewer` 是可視區，`.stage` 是被縮放/平移的底圖舞台。
- `.pin-marker` 是實際可點擊/可拖曳的標籤 hit area，會使用 `--pin-marker-scale` 抵銷主畫面縮放造成的尺寸放大。
- `.pin-marker::before` 是旋轉後的圖釘視覺；動畫只放在 pseudo-element 上，避免動畫改變可點擊範圍。
- `.pin-marker.active` 與 `.pin-list li.active button` 要保持視覺同步。
- `.settings-bar` 是頂部設定列，放置底圖上傳、操作模式與縮放。
- `#pinPanel` 是左側標籤清單，搭配 `.panel-hidden` 與 `.pinned` 控制隱藏/釘住狀態。
- `.pin-editor` 是右側浮動標籤頁，使用 `position: fixed`，可由 `#pinEditorHeader` 拖曳。
- 響應式規則集中在檔案底部的 `@media (max-width: 900px)`。

## 常見修改任務提示

### 新增標籤欄位

1. 在 `index.html` 的 `#pinEditor` 新增 input/textarea。
2. 在 `app.js` 的 `elements` 增加對應 DOM 查找。
3. 在 `createPin()` 的 pin 初始資料新增欄位。
4. 在 `openPinDialog()` 將 pin 資料填入欄位。
5. 在 `saveActivePin()` 將欄位值寫回 pin。
6. 若欄位屬於補充照片，請同步檢查 `renderPhotoPreview()`、`savePhotoMetadata()` 與 `addPinPhotos()`。
7. 若要匯出/匯入，不必另外處理；`getProjectData()` 會把整個 `pins` 陣列寫入 JSON。

### 修改標籤外觀或動畫

優先修改 `styles.css` 的 `.pin-marker`、`.pin-marker::before`、`.pin-marker.active`。避免把旋轉或位移動畫加在 `.pin-marker` 本體，因為本體是 hit area；視覺動畫應加在 `::before`。

### 修改縮放/拖曳行為

優先看 `app.js` 的：

- `getMinimumScale()`
- `clampViewport()`
- `applyTransform()`
- `zoomAt()`
- `viewerPointToStagePoint()`
- viewer 的 `pointerdown` / `pointermove` / `pointerup` 事件監聽器

### 修改保存格式

目前資料會存在：

```text
localStorage['field-survey-photo-mapper']
```

匯出 JSON 的內容來自 `getProjectData()`，還原則走 `restoreProject(project)`。如果要做版本遷移，可以利用 `version` 欄位加入相容處理。

## 驗證建議

目前沒有測試框架。修改後至少執行：

```bash
node --check app.js
```

```bash
python3 - <<'PY'
from html.parser import HTMLParser
from pathlib import Path
class Parser(HTMLParser):
    pass
Parser().feed(Path('index.html').read_text())
print('html parsed')
PY
```

也建議用靜態伺服器確認頁面可載入：

```bash
python3 -m http.server 4173 --bind 127.0.0.1
curl -I http://127.0.0.1:4173/index.html
```

手動驗證清單：

- 上傳圖片後可顯示底圖。
- 上傳 PDF 後可顯示 PDF。
- 滾輪、滑桿、＋/－縮放正常，且不能縮小到 100% 以下；放大主畫面時，圖釘位置固定且視覺尺寸會自動微調縮小。
- 拖曳瀏覽時底圖不會被拖出可視範圍。
- 新增標籤後右側浮動標籤頁可輸入並儲存資料，且主視窗仍可操作。
- 右側浮動標籤頁可拖曳移動位置。
- 左側標籤清單可隱藏到左側並重新展開，也可釘住。
- 補充照片以標籤視窗寬度顯示，且每張照片可填寫照片標題與照片註解。
- 點擊圖釘與清單項目會同步 active 顏色。
- 既有標籤只能在「新增標籤」模式下拖曳調整位置；「拖曳瀏覽」模式下點擊標籤只開啟詳細資料。
- 重新上傳/選擇新的 PDF 或照片後，既有標籤會清空，視圖回到初始縮放與位置。
- 匯出 JSON 後可再匯入還原底圖與標籤。

## 開發限制與注意事項

- 目前全部資料（包含底圖與補充照片）以 data URL 儲存在瀏覽器 localStorage/JSON 中；大型 PDF 或大量照片可能讓 JSON 變大，也可能碰到瀏覽器儲存空間限制。
- PDF 使用 `<object type="application/pdf">` 顯示，實際 PDF 互動能力會依瀏覽器內建 PDF viewer 而異。
- `base-media` 設為 `pointer-events: none`，讓 viewer 能接收到拖曳/縮放/新增標籤事件；若需要 PDF 內部互動，要重新設計事件處理。
- 專案刻意維持無框架、無 build step；若引入工具鏈，請同步更新本 README 的啟動與驗證流程。
