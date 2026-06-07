import { EventBus, generateId, formatTime, formatFileSize, createVideoThumbnail, loadVideoMetadata, showToast } from './utils.js';

class MaterialManager {
  constructor() {
    this.materials = [];
    this.fileInput = document.getElementById('file-input');
    this.importBtn = document.getElementById('btn-import');
    this.materialsList = document.getElementById('materials-list');
    this.emptyState = document.getElementById('empty-state');

    this.init();
  }

  init() {
    this.importBtn.addEventListener('click', () => this.fileInput.click());
    this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));

    this.setupDragAndDrop();
  }

  setupDragAndDrop() {
    document.body.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });

    document.body.addEventListener('drop', (e) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('video/'));
      if (files.length > 0) {
        this.processFiles(files);
      }
    });
  }

  async handleFileSelect(e) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    await this.processFiles(files);
    this.fileInput.value = '';
  }

  async processFiles(files) {
    const videoFiles = files.filter(f => f.type.startsWith('video/') || 
      ['mp4', 'mov', 'webm'].some(ext => f.name.toLowerCase().endsWith(ext)));

    if (videoFiles.length === 0) {
      showToast('请选择有效的视频文件', 'error');
      return;
    }

    showToast(`正在导入 ${videoFiles.length} 个视频...`, 'info');

    for (const file of videoFiles) {
      try {
        const material = await this.createMaterial(file);
        this.materials.push(material);
        this.renderMaterialItem(material);
        EventBus.emit('material:added', material);
      } catch (error) {
        console.error('导入视频失败:', file.name, error);
        showToast(`导入失败: ${file.name}`, 'error');
      }
    }

    this.updateEmptyState();
    showToast(`成功导入 ${videoFiles.length} 个视频`, 'success');
  }

  async createMaterial(file) {
    const metadata = await loadVideoMetadata(file);
    const url = URL.createObjectURL(file);

    const tempVideo = document.createElement('video');
    tempVideo.src = url;
    tempVideo.muted = true;
    tempVideo.preload = 'auto';
    await new Promise(resolve => {
      tempVideo.onloadeddata = resolve;
    });

    const thumbnail = await createVideoThumbnail(tempVideo, 320, 180);

    const material = {
      id: generateId(),
      name: file.name,
      file: file,
      url: url,
      type: file.type || 'video/mp4',
      size: file.size,
      duration: metadata.duration,
      width: metadata.width,
      height: metadata.height,
      thumbnail: thumbnail,
      createdAt: Date.now()
    };

    return material;
  }

  renderMaterialItem(material) {
    const item = document.createElement('div');
    item.className = 'material-item';
    item.draggable = true;
    item.dataset.id = material.id;

    item.innerHTML = `
      <div class="material-thumbnail">
        ${material.thumbnail ? `<img src="${material.thumbnail}" alt="${material.name}">` : `<div class="no-thumb">🎬</div>`}
        <span class="material-duration">${formatTime(material.duration)}</span>
      </div>
      <div class="material-info">
        <div class="material-name" title="${material.name}">${material.name}</div>
        <div class="material-meta">
          <span>${formatFileSize(material.size)}</span>
          <span>${material.width}×${material.height}</span>
        </div>
      </div>
    `;

    item.addEventListener('dragstart', (e) => this.handleDragStart(e, material));
    item.addEventListener('dragend', (e) => this.handleDragEnd(e));
    item.addEventListener('dblclick', () => this.previewMaterial(material));

    this.materialsList.appendChild(item);
  }

  handleDragStart(e, material) {
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'material',
      materialId: material.id
    }));
    e.dataTransfer.effectAllowed = 'copy';
    e.currentTarget.classList.add('dragging');
  }

  handleDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
  }

  previewMaterial(material) {
    EventBus.emit('material:preview', material);
  }

  getMaterialById(id) {
    return this.materials.find(m => m.id === id);
  }

  updateEmptyState() {
    if (this.materials.length === 0) {
      this.emptyState.style.display = 'flex';
      this.materialsList.style.display = 'none';
    } else {
      this.emptyState.style.display = 'none';
      this.materialsList.style.display = 'flex';
    }
  }

  getAllMaterials() {
    return [...this.materials];
  }
}

export const materialManager = new MaterialManager();
