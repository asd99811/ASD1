const state = {
  mode: 'pan',
  scale: 1,
  translateX: -450,
  translateY: -310,
  pins: [],
  activePinId: null,
  baseFile: null,
  baseType: null,
  isDragging: false,
  dragStart: { x: 0, y: 0 },
  startTranslate: { x: 0, y: 0 }
};

const elements = {
  baseFileInput: document.querySelector('#baseFileInput'),
  importProject: document.querySelector('#importProject'),
  exportProject: document.querySelector('#exportProject'),
  fileName: document.querySelector('#fileName'),
  viewer: document.querySelector('#viewer'),
  stage: document.querySelector('#stage'),
  placeholder: document.querySelector('#placeholder'),
  baseImage: document.querySelector('#baseImage'),
  basePdf: document.querySelector('#basePdf'),
  pinLayer: document.querySelector('#pinLayer'),
  panMode: document.querySelector('#panMode'),
  pinMode: document.querySelector('#pinMode'),
  zoomOut: document.querySelector('#zoomOut'),
  zoomIn: document.querySelector('#zoomIn'),
  zoomSlider: document.querySelector('#zoomSlider'),
  zoomLabel: document.querySelector('#zoomLabel'),
  modeHint: document.querySelector('#modeHint'),
  emptyPins: document.querySelector('#emptyPins'),
  pinList: document.querySelector('#pinList'),
  pinDialog: document.querySelector('#pinDialog'),
  pinForm: document.querySelector('#pinForm'),
  dialogTitle: document.querySelector('#dialogTitle'),
  pinTitle: document.querySelector('#pinTitle'),
  pinTime: document.querySelector('#pinTime'),
  pinNote: document.querySelector('#pinNote'),
  pinPhotos: document.querySelector('#pinPhotos'),
  photoPreview: document.querySelector('#photoPreview'),
  deletePin: document.querySelector('#deletePin'),
  cancelDialog: document.querySelector('#cancelDialog')
};

function applyTransform() {
  elements.stage.style.transform = `translate(${state.translateX}px, ${state.translateY}px) scale(${state.scale})`;
  elements.zoomSlider.value = Math.round(state.scale * 100);
  elements.zoomLabel.textContent = `${Math.round(state.scale * 100)}%`;
}

function setMode(mode) {
  state.mode = mode;
  elements.panMode.classList.toggle('active', mode === 'pan');
  elements.pinMode.classList.toggle('active', mode === 'pin');
  elements.modeHint.textContent = `目前模式：${mode === 'pin' ? '新增標籤' : '拖曳瀏覽'}`;
  elements.viewer.style.cursor = mode === 'pin' ? 'crosshair' : 'grab';
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result));
    reader.addEventListener('error', () => reject(reader.error));
    reader.readAsDataURL(file);
  });
}

async function loadBaseFile(file) {
  if (!file) return;
  const dataUrl = await readFileAsDataUrl(file);
  state.baseFile = { name: file.name, dataUrl };
  state.baseType = file.type.includes('pdf') ? 'pdf' : 'image';
  elements.fileName.textContent = file.name;
  showBaseMedia();
  saveProject();
}

function showBaseMedia() {
  elements.placeholder.classList.toggle('hidden', Boolean(state.baseFile));
  elements.baseImage.classList.add('hidden');
  elements.basePdf.classList.add('hidden');

  if (!state.baseFile) return;

  if (state.baseType === 'pdf') {
    elements.basePdf.data = state.baseFile.dataUrl;
    elements.basePdf.classList.remove('hidden');
  } else {
    elements.baseImage.src = state.baseFile.dataUrl;
    elements.baseImage.classList.remove('hidden');
  }
}

function viewerPointToStagePoint(clientX, clientY) {
  const viewerRect = elements.viewer.getBoundingClientRect();
  return {
    x: (clientX - viewerRect.left - state.translateX) / state.scale,
    y: (clientY - viewerRect.top - state.translateY) / state.scale
  };
}

function zoomAt(nextScale, clientX, clientY) {
  const boundedScale = Math.min(4, Math.max(0.25, nextScale));
  const viewerRect = elements.viewer.getBoundingClientRect();
  const originX = clientX ?? viewerRect.left + viewerRect.width / 2;
  const originY = clientY ?? viewerRect.top + viewerRect.height / 2;
  const point = viewerPointToStagePoint(originX, originY);

  state.scale = boundedScale;
  state.translateX = originX - viewerRect.left - point.x * state.scale;
  state.translateY = originY - viewerRect.top - point.y * state.scale;
  applyTransform();
  saveProject();
}

function createPin(x, y) {
  const pin = {
    id: crypto.randomUUID(),
    x,
    y,
    title: `標籤 ${state.pins.length + 1}`,
    time: new Date().toISOString().slice(0, 16),
    note: '',
    photos: []
  };
  state.pins.push(pin);
  renderPins();
  openPinDialog(pin.id);
  saveProject();
}

function renderPins() {
  elements.pinLayer.innerHTML = '';
  elements.pinList.innerHTML = '';
  elements.emptyPins.classList.toggle('hidden', state.pins.length > 0);

  state.pins.forEach((pin, index) => {
    const marker = document.createElement('button');
    marker.className = 'pin-marker';
    marker.type = 'button';
    marker.style.left = `${pin.x}px`;
    marker.style.top = `${pin.y}px`;
    marker.title = pin.title;
    marker.innerHTML = `<span>${index + 1}</span>`;
    marker.addEventListener('click', (event) => {
      event.stopPropagation();
      openPinDialog(pin.id);
    });
    elements.pinLayer.append(marker);

    const item = document.createElement('li');
    const itemButton = document.createElement('button');
    itemButton.type = 'button';
    itemButton.innerHTML = `<strong>${index + 1}. ${escapeHtml(pin.title)}</strong><br><small>${pin.time || '未填時間'}</small>`;
    itemButton.addEventListener('click', () => openPinDialog(pin.id));
    item.append(itemButton);
    elements.pinList.append(item);
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[character]));
}

function openPinDialog(pinId) {
  const pin = state.pins.find((item) => item.id === pinId);
  if (!pin) return;

  state.activePinId = pinId;
  elements.dialogTitle.textContent = pin.title;
  elements.pinTitle.value = pin.title;
  elements.pinTime.value = pin.time || '';
  elements.pinNote.value = pin.note || '';
  elements.pinPhotos.value = '';
  elements.deletePin.hidden = false;
  renderPhotoPreview(pin.photos);
  elements.pinDialog.showModal();
}

function renderPhotoPreview(photos) {
  elements.photoPreview.innerHTML = '';
  if (!photos.length) {
    elements.photoPreview.innerHTML = '<p class="muted">尚未加入補充照片</p>';
    return;
  }

  photos.forEach((photo) => {
    const figure = document.createElement('figure');
    figure.innerHTML = `<img src="${photo.dataUrl}" alt="${escapeHtml(photo.name)}"><figcaption>${escapeHtml(photo.name)}</figcaption>`;
    elements.photoPreview.append(figure);
  });
}

async function addPinPhotos(files) {
  const pin = state.pins.find((item) => item.id === state.activePinId);
  if (!pin) return;

  const photos = await Promise.all(Array.from(files).map(async (file) => ({
    name: file.name,
    dataUrl: await readFileAsDataUrl(file)
  })));
  pin.photos.push(...photos);
  renderPhotoPreview(pin.photos);
  saveProject();
}

function saveActivePin() {
  const pin = state.pins.find((item) => item.id === state.activePinId);
  if (!pin) return;

  pin.title = elements.pinTitle.value.trim() || '未命名標籤';
  pin.time = elements.pinTime.value;
  pin.note = elements.pinNote.value.trim();
  renderPins();
  saveProject();
}

function deleteActivePin() {
  state.pins = state.pins.filter((pin) => pin.id !== state.activePinId);
  state.activePinId = null;
  elements.pinDialog.close();
  renderPins();
  saveProject();
}

function getProjectData() {
  return {
    version: 1,
    baseFile: state.baseFile,
    baseType: state.baseType,
    pins: state.pins,
    viewport: {
      scale: state.scale,
      translateX: state.translateX,
      translateY: state.translateY
    }
  };
}

function saveProject() {
  localStorage.setItem('field-survey-photo-mapper', JSON.stringify(getProjectData()));
}

function restoreProject(project) {
  state.baseFile = project.baseFile || null;
  state.baseType = project.baseType || null;
  state.pins = project.pins || [];
  state.scale = project.viewport?.scale || 1;
  state.translateX = project.viewport?.translateX ?? state.translateX;
  state.translateY = project.viewport?.translateY ?? state.translateY;
  elements.fileName.textContent = state.baseFile?.name || '尚未選擇檔案';
  showBaseMedia();
  renderPins();
  applyTransform();
  saveProject();
}

function downloadProject() {
  const blob = new Blob([JSON.stringify(getProjectData(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `現場勘查整理-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function importProject(file) {
  if (!file) return;
  const text = await file.text();
  restoreProject(JSON.parse(text));
}

elements.baseFileInput.addEventListener('change', (event) => loadBaseFile(event.target.files[0]));
elements.importProject.addEventListener('change', (event) => importProject(event.target.files[0]));
elements.exportProject.addEventListener('click', downloadProject);
elements.panMode.addEventListener('click', () => setMode('pan'));
elements.pinMode.addEventListener('click', () => setMode('pin'));
elements.zoomOut.addEventListener('click', () => zoomAt(state.scale - 0.15));
elements.zoomIn.addEventListener('click', () => zoomAt(state.scale + 0.15));
elements.zoomSlider.addEventListener('input', (event) => zoomAt(Number(event.target.value) / 100));
elements.pinPhotos.addEventListener('change', (event) => addPinPhotos(event.target.files));
elements.deletePin.addEventListener('click', deleteActivePin);
elements.cancelDialog.addEventListener('click', () => elements.pinDialog.close());

elements.pinForm.addEventListener('submit', (event) => {
  event.preventDefault();
  saveActivePin();
  elements.pinDialog.close();
});

elements.viewer.addEventListener('wheel', (event) => {
  event.preventDefault();
  const direction = event.deltaY > 0 ? -0.1 : 0.1;
  zoomAt(state.scale + direction, event.clientX, event.clientY);
}, { passive: false });

elements.viewer.addEventListener('pointerdown', (event) => {
  if (event.target.closest('.pin-marker')) return;
  if (state.mode === 'pin') {
    const point = viewerPointToStagePoint(event.clientX, event.clientY);
    if (point.x >= 0 && point.y >= 0 && point.x <= elements.stage.offsetWidth && point.y <= elements.stage.offsetHeight) {
      createPin(point.x, point.y);
    }
    return;
  }

  state.isDragging = true;
  state.dragStart = { x: event.clientX, y: event.clientY };
  state.startTranslate = { x: state.translateX, y: state.translateY };
  elements.viewer.setPointerCapture(event.pointerId);
  elements.viewer.style.cursor = 'grabbing';
});

elements.viewer.addEventListener('pointermove', (event) => {
  if (!state.isDragging) return;
  state.translateX = state.startTranslate.x + event.clientX - state.dragStart.x;
  state.translateY = state.startTranslate.y + event.clientY - state.dragStart.y;
  applyTransform();
});

elements.viewer.addEventListener('pointerup', (event) => {
  if (!state.isDragging) return;
  state.isDragging = false;
  elements.viewer.releasePointerCapture(event.pointerId);
  elements.viewer.style.cursor = state.mode === 'pin' ? 'crosshair' : 'grab';
  saveProject();
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && elements.pinDialog.open) {
    elements.pinDialog.close();
  }
});

const storedProject = localStorage.getItem('field-survey-photo-mapper');
if (storedProject) {
  try {
    restoreProject(JSON.parse(storedProject));
  } catch {
    localStorage.removeItem('field-survey-photo-mapper');
  }
}

setMode('pan');
applyTransform();
renderPins();
