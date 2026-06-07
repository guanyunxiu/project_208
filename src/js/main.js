import { EventBus, showToast } from './modules/utils.js';
import { materialManager } from './modules/materials.js';
import { timelineManager } from './modules/timeline.js';
import { videoPlayer } from './modules/player.js';
import { propertiesPanel } from './modules/properties.js';
import { videoExporter } from './modules/exporter.js';
import { storageManager } from './modules/storage.js';

window.__materialManager = materialManager;
window.__timelineManager = timelineManager;
window.__videoPlayer = videoPlayer;
window.__propertiesPanel = propertiesPanel;
window.__exporter = videoExporter;
window.__storageManager = storageManager;

class VideoEditorApp {
  constructor() {
    this.processingWorker = null;
    this.encodeWorker = null;
    
    this.init();
  }

  init() {
    console.log('🎬 Web Video Editor Initializing...');
    
    this.setupWorkers();
    this.setupGlobalEventBus();
    this.setupKeyboardShortcuts();
    
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

    EventBus.on('timeline:seek', (time) => {
      videoPlayer.currentTime = time;
      videoPlayer.renderFrame();
    });
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (document.activeElement.tagName === 'INPUT') return;

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
