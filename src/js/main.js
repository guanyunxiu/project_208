import { EventBus, showToast, generateId } from './modules/utils.js';
import { materialManager } from './modules/materials.js';
import { timelineManager } from './modules/timeline.js';
import { videoPlayer } from './modules/player.js';
import { propertiesPanel } from './modules/properties.js';
import { videoExporter } from './modules/exporter.js';
import { storageManager } from './modules/storage.js';
import { filterManager, FILTERS, COLOR_ADJUSTMENT } from './modules/filters.js';
import { textManager } from './modules/text.js';
import { transitionManager, TRANSITIONS } from './modules/transitions.js';

window.__materialManager = materialManager;
window.__timelineManager = timelineManager;
window.__videoPlayer = videoPlayer;
window.__propertiesPanel = propertiesPanel;
window.__exporter = videoExporter;
window.__storageManager = storageManager;
window.__filterManager = filterManager;
window.__textManager = textManager;
window.__transitionManager = transitionManager;

class VideoEditorApp {
  constructor() {
    this.processingWorker = null;
    this.encodeWorker = null;
    
    this.selectedFilterType = 'none';
    this.selectedTransitionType = 'none';
    this.colorAdjustment = {
      brightness: 0,
      contrast: 0,
      saturation: 0,
      temperature: 0
    };
    
    this.init();
  }

  init() {
    console.log('🎬 Web Video Editor Initializing...');
    
    this.setupWorkers();
    this.setupGlobalEventBus();
    this.setupKeyboardShortcuts();
    this.setupUIHandlers();
    this.setupFilterPanel();
    this.setupTransitionPanel();
    this.setupTextStickerButtons();
    
    videoPlayer.init();
    
    setTimeout(() => {
      showToast('欢迎使用 Web Video Editor！', 'info', 3000);
    }, 500);

    console.log('✅ Web Video Editor Ready!');
  }

  setupWorkers() {
    try {
      this.processingWorker = new Worker(
        new URL('./workers/processing.worker.js', import.meta.url),
        { type: 'module' }
      );

      this.encodeWorker = new Worker(
        new URL('./workers/encode.worker.js', import.meta.url),
        { type: 'module' }
      );

      this.processingWorker.onmessage = (e) => {
        const { type, data } = e.data;
        
        switch (type) {
          case 'thumbnail-complete':
            EventBus.emit('worker:thumbnail-complete', data);
            break;
          case 'analysis-complete':
            EventBus.emit('worker:analysis-complete', data);
            break;
          case 'processing-complete':
            EventBus.emit('worker:processing-complete', data);
            break;
          case 'processing-progress':
            EventBus.emit('worker:processing-progress', data);
            break;
        }
      };

      this.encodeWorker.onmessage = (e) => {
        const { type, data } = e.data;
        
        switch (type) {
          case 'encoder-ready':
            EventBus.emit('worker:encoder-ready', data);
            break;
          case 'encoding-progress':
            EventBus.emit('worker:encoding-progress', data);
            break;
          case 'encoding-complete':
            EventBus.emit('worker:encoding-complete', data);
            break;
        }
      };

      console.log('✅ Web Workers initialized');
    } catch (error) {
      console.warn('⚠️  Web Workers not available:', error);
    }
  }

  setupGlobalEventBus() {
    EventBus.on('clip:update-property', ({ clipId, property, value }) => {
      timelineManager.updateClipProperty(clipId, property, value);
      videoPlayer.renderFrame();
    });

    EventBus.on('clip:delete', (clipId) => {
      timelineManager.deleteClip(clipId);
    });

    EventBus.on('clip:trim', ({ clipId, trimStart, trimEnd }) => {
      timelineManager.trimClip(clipId, trimStart, trimEnd);
      showToast('裁剪已应用', 'success');
    });

    EventBus.on('timeline:split', (time) => {
      const result = timelineManager.splitAtCurrentTime();
      if (result) {
        showToast('片段已分割', 'success');
      } else {
        showToast('当前位置没有可分割的片段', 'warning');
      }
    });

    EventBus.on('timeline:split-at', ({ clipId, time }) => {
      const result = timelineManager.splitClip(clipId, time);
      if (result) {
        showToast('片段已分割', 'success');
      }
    });

    EventBus.on('toast:show', ({ message, type }) => {
      showToast(message, type);
    });

    EventBus.on('player:seek', (time) => {
      timelineManager.currentTime = time;
      timelineManager.updatePlayhead(time);
    });

    EventBus.on('text:update-property', ({ itemId, property, value }) => {
      textManager.updateItemProperty(itemId, property, value);
      videoPlayer.renderFrame();
    });

    EventBus.on('text:delete', (itemId) => {
      textManager.deleteItem(itemId);
      EventBus.emit('selection:cleared');
      videoPlayer.renderFrame();
    });

    EventBus.on('sticker:update-property', ({ itemId, property, value }) => {
      textManager.updateItemProperty(itemId, property, value);
      videoPlayer.renderFrame();
    });

    EventBus.on('sticker:delete', (itemId) => {
      textManager.deleteItem(itemId);
      EventBus.emit('selection:cleared');
      videoPlayer.renderFrame();
    });

    EventBus.on('timeline:item-selected', ({ item, type }) => {
      if (type === 'text') {
        EventBus.emit('text:selected', item);
      } else if (type === 'sticker') {
        EventBus.emit('sticker:selected', item);
      }
    });

    EventBus.on('timeline:track-action', ({ trackId, action }) => {
      switch (action) {
        case 'lock':
          timelineManager.toggleTrackLock(trackId);
          break;
        case 'hide':
          timelineManager.toggleTrackHide(trackId);
          break;
        case 'mute':
          timelineManager.toggleTrackMute(trackId);
          break;
        case 'up':
          timelineManager.moveTrackUp(trackId);
          break;
        case 'down':
          timelineManager.moveTrackDown(trackId);
          break;
        case 'delete':
          timelineManager.removeTrack(trackId);
          break;
      }
      videoPlayer.renderFrame();
    });
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;

      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'z':
            if (e.shiftKey) {
              e.preventDefault();
              this.redo();
            } else {
              e.preventDefault();
              this.undo();
            }
            break;
          case 'y':
            e.preventDefault();
            this.redo();
            break;
          case 'e':
            e.preventDefault();
            document.getElementById('btn-export').click();
            break;
          case 't':
            e.preventDefault();
            this.addDefaultText();
            break;
        }
      } else {
        switch (e.key.toLowerCase()) {
          case ' ':
            e.preventDefault();
            videoPlayer.togglePlay();
            break;
          case 'delete':
          case 'backspace':
            if (timelineManager.selectedClipId) {
              e.preventDefault();
              timelineManager.deleteClip(timelineManager.selectedClipId);
              showToast('片段已删除', 'info');
            } else if (textManager.selectedItemId) {
              e.preventDefault();
              textManager.deleteItem(textManager.selectedItemId);
              EventBus.emit('selection:cleared');
              videoPlayer.renderFrame();
              showToast('已删除', 'info');
            }
            break;
          case 's':
            e.preventDefault();
            EventBus.emit('timeline:split', videoPlayer.getCurrentTime());
            break;
          case 'm':
            e.preventDefault();
            const clip = timelineManager.getCurrentClip();
            if (clip) {
              timelineManager.updateClipProperty(clip.id, 'muted', !clip.muted);
              showToast(clip.muted ? '已静音' : '取消静音', 'info');
            }
            break;
          case 'arrowleft':
            e.preventDefault();
            videoPlayer.seekTo(Math.max(0, videoPlayer.getCurrentTime() - (e.shiftKey ? 5 : 1)));
            break;
          case 'arrowright':
            e.preventDefault();
            videoPlayer.seekTo(Math.min(videoPlayer.getDuration(), videoPlayer.getCurrentTime() + (e.shiftKey ? 5 : 1)));
            break;
          case ',':
            e.preventDefault();
            videoPlayer.stepFrame(-1);
            break;
          case '.':
            e.preventDefault();
            videoPlayer.stepFrame(1);
            break;
          case '+':
          case '=':
            e.preventDefault();
            timelineManager.zoomIn();
            break;
          case '-':
          case '_':
            e.preventDefault();
            timelineManager.zoomOut();
            break;
          case '0':
            e.preventDefault();
            timelineManager.fitToView();
            break;
          case 'escape':
            e.preventDefault();
            timelineManager.clearSelection();
            textManager.clearSelection();
            EventBus.emit('selection:cleared');
            break;
        }
      }
    });

    document.addEventListener('wheel', (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY < 0) {
          timelineManager.zoomIn();
        } else {
          timelineManager.zoomOut();
        }
      }
    }, { passive: false });
  }

  setupUIHandlers() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`tab-${tab}`).classList.add('active');
      });
    });

    document.getElementById('btn-reset-filter')?.addEventListener('click', () => {
      this.resetFilters();
    });

    document.getElementById('btn-apply-transition')?.addEventListener('click', () => {
      this.applyTransitionToSelected();
    });

    document.getElementById('btn-add-text')?.addEventListener('click', () => {
      this.addDefaultText();
    });

    document.getElementById('btn-add-sticker')?.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          this.addStickerFromFile(file);
        }
      };
      input.click();
    });
  }

  setupFilterPanel() {
    const grid = document.getElementById('filters-grid');
    if (!grid) return;

    grid.innerHTML = '';
    for (const [key, filter] of Object.entries(FILTERS)) {
      const item = document.createElement('div');
      item.className = `filter-item ${key === this.selectedFilterType ? 'active' : ''}`;
      item.dataset.filter = key;
      item.innerHTML = `
        <div class="filter-icon">${filter.icon}</div>
        <div class="filter-name">${filter.name}</div>
      `;
      item.addEventListener('click', () => {
        this.selectFilter(key);
      });
      grid.appendChild(item);
    }

    ['brightness', 'contrast', 'saturation', 'temperature'].forEach(prop => {
      const slider = document.getElementById(`adj-${prop}`);
      const valueSpan = document.getElementById(`${prop}-value`);
      if (slider && valueSpan) {
        slider.addEventListener('input', (e) => {
          const value = parseInt(e.target.value);
          valueSpan.textContent = value;
          this.colorAdjustment[prop] = value;
          this.applyColorAdjustment();
        });
      }
    });
  }

  setupTransitionPanel() {
    const grid = document.getElementById('transitions-grid');
    if (!grid) return;

    grid.innerHTML = '';
    for (const [key, transition] of Object.entries(TRANSITIONS)) {
      const item = document.createElement('div');
      item.className = `transition-item ${key === this.selectedTransitionType ? 'active' : ''}`;
      item.dataset.transition = key;
      item.innerHTML = `
        <div class="transition-icon">${transition.icon}</div>
        <div class="transition-name">${transition.name}</div>
      `;
      item.addEventListener('click', () => {
        this.selectTransition(key);
      });
      grid.appendChild(item);
    }
  }

  setupTextStickerButtons() {
    const stickerInput = document.createElement('input');
    stickerInput.type = 'file';
    stickerInput.id = 'sticker-file-input';
    stickerInput.accept = 'image/*';
    stickerInput.multiple = true;
    stickerInput.hidden = true;
    stickerInput.onchange = (e) => {
      const files = Array.from(e.target.files);
      files.forEach(file => this.addStickerFromFile(file));
    };
    document.body.appendChild(stickerInput);
  }

  selectFilter(filterType) {
    this.selectedFilterType = filterType;
    document.querySelectorAll('.filter-item').forEach(item => {
      item.classList.toggle('active', item.dataset.filter === filterType);
    });

    const selectedClip = timelineManager.getSelectedClip();
    if (selectedClip) {
      timelineManager.updateClipProperty(selectedClip.id, 'filter', filterType);
      showToast(`已应用滤镜: ${FILTERS[filterType].name}`, 'success');
    } else {
      showToast('请先选择一个片段', 'warning');
    }
    videoPlayer.renderFrame();
  }

  resetFilters() {
    this.selectedFilterType = 'none';
    this.colorAdjustment = {
      brightness: 0,
      contrast: 0,
      saturation: 0,
      temperature: 0
    };

    document.querySelectorAll('.filter-item').forEach(item => {
      item.classList.toggle('active', item.dataset.filter === 'none');
    });

    ['brightness', 'contrast', 'saturation', 'temperature'].forEach(prop => {
      const slider = document.getElementById(`adj-${prop}`);
      const valueSpan = document.getElementById(`${prop}-value`);
      if (slider) slider.value = 0;
      if (valueSpan) valueSpan.textContent = '0';
    });

    const selectedClip = timelineManager.getSelectedClip();
    if (selectedClip) {
      timelineManager.updateClipProperty(selectedClip.id, 'filter', 'none');
      timelineManager.updateClipProperty(selectedClip.id, 'colorAdjust', { ...this.colorAdjustment });
    }

    showToast('滤镜已重置', 'info');
    videoPlayer.renderFrame();
  }

  applyColorAdjustment() {
    const selectedClip = timelineManager.getSelectedClip();
    if (selectedClip) {
      timelineManager.updateClipProperty(selectedClip.id, 'colorAdjust', { ...this.colorAdjustment });
      videoPlayer.renderFrame();
    }
  }

  selectTransition(transitionType) {
    this.selectedTransitionType = transitionType;
    document.querySelectorAll('.transition-item').forEach(item => {
      item.classList.toggle('active', item.dataset.transition === transitionType);
    });
  }

  applyTransitionToSelected() {
    const selectedClip = timelineManager.getSelectedClip();
    if (!selectedClip) {
      showToast('请先选择一个片段', 'warning');
      return;
    }

    if (this.selectedTransitionType === 'none') {
      showToast('请先选择一个转场效果', 'warning');
      return;
    }

    const durationInput = document.getElementById('transition-duration');
    const duration = durationInput ? parseFloat(durationInput.value) || 1 : 1;

    const result = transitionManager.addTransition(
      selectedClip.id,
      null,
      this.selectedTransitionType,
      duration
    );

    if (result) {
      timelineManager.updateClipProperty(selectedClip.id, 'transitionIn', {
        type: this.selectedTransitionType,
        duration: duration
      });
      showToast(`已应用转场: ${TRANSITIONS[this.selectedTransitionType].name}`, 'success');
    } else {
      showToast('转场应用失败', 'error');
    }
    videoPlayer.renderFrame();
  }

  addDefaultText() {
    const currentTime = videoPlayer.getCurrentTime();
    const canvas = document.getElementById('preview-canvas');
    const rect = canvas.getBoundingClientRect();
    const textItem = textManager.addText({
      content: '双击编辑文字',
      startTime: currentTime,
      endTime: currentTime + 5,
      x: rect.width * 0.3,
      y: rect.height * 0.3,
      fontSize: 48,
      fontFamily: 'Microsoft YaHei',
      color: '#ffffff',
      strokeColor: '#000000',
      strokeWidth: 2,
      shadowBlur: 4,
      animation: 'fadeInOut',
      animationDuration: 1,
      bold: false,
      italic: false,
      textAlign: 'center'
    });

    if (textItem) {
      timelineManager.addItemToTrack(textItem, 'text');
      EventBus.emit('text:selected', textItem);
      showToast('文字已添加', 'success');
      videoPlayer.renderFrame();
    }
  }

  addStickerFromFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const currentTime = videoPlayer.getCurrentTime();
        const canvas = document.getElementById('preview-canvas');
        const rect = canvas.getBoundingClientRect();
        
        const maxWidth = rect.width * 0.3;
        const scale = maxWidth / img.width;
        const stickerWidth = img.width * scale;
        const stickerHeight = img.height * scale;
        
        const stickerItem = textManager.addSticker({
          name: file.name,
          url: e.target.result,
          startTime: currentTime,
          endTime: currentTime + 5,
          x: (rect.width - stickerWidth) / 2,
          y: (rect.height - stickerHeight) / 2,
          width: stickerWidth,
          height: stickerHeight,
          originalWidth: img.width,
          originalHeight: img.height,
          scale: 1,
          rotation: 0,
          opacity: 1,
          fadeIn: 0.5,
          fadeOut: 0.5
        });

        if (stickerItem) {
          timelineManager.addItemToTrack(stickerItem, 'sticker');
          EventBus.emit('sticker:selected', stickerItem);
          showToast('贴纸已添加', 'success');
          videoPlayer.renderFrame();
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  undo() {
    showToast('撤销功能开发中...', 'info');
  }

  redo() {
    showToast('重做功能开发中...', 'info');
  }

  getProcessingWorker() {
    return this.processingWorker;
  }

  getEncodeWorker() {
    return this.encodeWorker;
  }
}

const app = new VideoEditorApp();
window.__app = app;

export default app;
