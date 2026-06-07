import { EventBus, generateId, formatTime, clamp } from './utils.js';

class TimelineManager {
  constructor() {
    this.clips = [];
    this.currentTime = 0;
    this.totalDuration = 0;
    this.selectedClipId = null;
    this.isPlaying = false;
    this.zoom = 100;
    this.pixelsPerSecond = 50;
    this.scrollLeft = 0;

    this.timelineCanvas = document.getElementById('timeline-canvas');
    this.rulerCanvas = document.getElementById('ruler-canvas');
    this.videoTrack = document.getElementById('video-track');
    this.playhead = document.getElementById('playhead');
    this.timelineCtx = this.timelineCanvas.getContext('2d');
    this.rulerCtx = this.rulerCanvas.getContext('2d');

    this.zoomInBtn = document.getElementById('btn-zoom-in');
    this.zoomOutBtn = document.getElementById('btn-zoom-out');
    this.fitBtn = document.getElementById('btn-fit');
    this.zoomValue = document.getElementById('zoom-value');

    this.isDragging = false;
    this.dragType = null;
    this.dragClipId = null;
    this.dragStartX = 0;
    this.dragStartPos = 0;

    this.init();
  }

  init() {
    this.setupCanvas();
    this.setupEventListeners();
    this.setupDragAndDrop();
    this.render();

    EventBus.on('material:added', () => this.render());
    EventBus.on('clip:updated', () => this.render());
    EventBus.on('clip:deleted', () => this.render());
    EventBus.on('player:timeupdate', (time) => this.updatePlayhead(time));
    EventBus.on('player:durationchange', (duration) => {
      this.totalDuration = duration;
      this.updateCanvasSize();
      this.render();
    });
  }

  setupCanvas() {
    const resizeCanvas = () => {
      const trackRect = this.videoTrack.getBoundingClientRect();
      const trackContentWidth = Math.max(trackRect.width, this.totalDuration * this.pixelsPerSecond + 200);
      
      this.timelineCanvas.width = trackContentWidth * window.devicePixelRatio;
      this.timelineCanvas.height = trackRect.height * window.devicePixelRatio;
      this.timelineCanvas.style.width = trackContentWidth + 'px';
      this.timelineCanvas.style.height = trackRect.height + 'px';
      this.timelineCtx.scale(window.devicePixelRatio, window.devicePixelRatio);

      const rulerRect = this.rulerCanvas.parentElement.getBoundingClientRect();
      this.rulerCanvas.width = rulerRect.width * window.devicePixelRatio;
      this.rulerCanvas.height = rulerRect.height * window.devicePixelRatio;
      this.rulerCanvas.style.width = rulerRect.width + 'px';
      this.rulerCanvas.style.height = rulerRect.height + 'px';
      this.rulerCtx.scale(window.devicePixelRatio, window.devicePixelRatio);

      this.render();
    };

    window.addEventListener('resize', resizeCanvas);
    this.videoTrack.addEventListener('scroll', () => {
      this.scrollLeft = this.videoTrack.scrollLeft;
      this.render();
    });

    setTimeout(resizeCanvas, 100);
  }

  updateCanvasSize() {
    const trackRect = this.videoTrack.getBoundingClientRect();
    const trackContentWidth = Math.max(trackRect.width, this.totalDuration * this.pixelsPerSecond + 200);
    
    this.timelineCanvas.width = trackContentWidth * window.devicePixelRatio;
    this.timelineCanvas.height = trackRect.height * window.devicePixelRatio;
    this.timelineCanvas.style.width = trackContentWidth + 'px';
    this.timelineCanvas.style.height = trackRect.height + 'px';
    this.timelineCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }

  setupEventListeners() {
    this.zoomInBtn.addEventListener('click', () => this.zoomIn());
    this.zoomOutBtn.addEventListener('click', () => this.zoomOut());
    this.fitBtn.addEventListener('click', () => this.fitToView());

    this.timelineCanvas.addEventListener('mousedown', (e) => this.handleMouseDown(e));
    this.timelineCanvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    this.timelineCanvas.addEventListener('mouseup', (e) => this.handleMouseUp(e));
    this.timelineCanvas.addEventListener('mouseleave', (e) => this.handleMouseUp(e));
    this.timelineCanvas.addEventListener('dblclick', (e) => this.handleDoubleClick(e));

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.selectedClipId && document.activeElement.tagName !== 'INPUT') {
          e.preventDefault();
          this.deleteClip(this.selectedClipId);
        }
      }
      if (e.key === 's' && e.ctrlKey) {
        e.preventDefault();
        EventBus.emit('timeline:split', this.currentTime);
      }
    });
  }

  setupDragAndDrop() {
    this.videoTrack.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      this.videoTrack.classList.add('drag-over');
    });

    this.videoTrack.addEventListener('dragleave', () => {
      this.videoTrack.classList.remove('drag-over');
    });

    this.videoTrack.addEventListener('drop', (e) => {
      e.preventDefault();
      this.videoTrack.classList.remove('drag-over');

      try {
        const data = JSON.parse(e.dataTransfer.getData('application/json'));
        if (data.type === 'material') {
          const rect = this.videoTrack.getBoundingClientRect();
          const x = e.clientX - rect.left + this.scrollLeft;
          const startTime = Math.max(0, x / this.pixelsPerSecond);
          this.addClip(data.materialId, startTime);
        }
      } catch (err) {
        console.error('Drop error:', err);
      }
    });
  }

  addClip(materialId, startTime = 0) {
    const material = EventBus.events['material:get'] ? 
      EventBus.emit('material:get', materialId) : null;
    
    const materialsList = document.querySelectorAll('.material-item');
    let mat = null;
    for (const item of materialsList) {
      if (item.dataset.id === materialId) {
        mat = window.__materialManager?.getMaterialById(materialId);
        break;
      }
    }

    if (!mat && window.__materialManager) {
      mat = window.__materialManager.getMaterialById(materialId);
    }

    if (!mat) {
      console.error('Material not found:', materialId);
      return null;
    }

    const adjustedStart = this.findInsertPosition(startTime, mat.duration);

    const clip = {
      id: generateId(),
      materialId: materialId,
      material: mat,
      startTime: adjustedStart,
      endTime: adjustedStart + mat.duration,
      trimStart: 0,
      trimEnd: mat.duration,
      volume: 1,
      muted: false,
      rotation: 0,
      aspectRatio: 'original',
      fadeIn: 0,
      fadeOut: 0,
      color: this.getClipColor(this.clips.length)
    };

    this.clips.push(clip);
    this.updateTotalDuration();
    this.selectedClipId = clip.id;
    
    EventBus.emit('clip:added', clip);
    EventBus.emit('clip:selected', clip);
    this.render();

    return clip;
  }

  findInsertPosition(startTime, duration) {
    let pos = startTime;
    const sortedClips = [...this.clips].sort((a, b) => a.startTime - b.startTime);
    
    for (const clip of sortedClips) {
      if (pos + duration <= clip.startTime) {
        break;
      }
      if (pos < clip.endTime) {
        pos = clip.endTime;
      }
    }
    
    return pos;
  }

  getClipColor(index) {
    const colors = [
      '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', 
      '#f97316', '#eab308', '#22c55e', '#14b8a6',
      '#06b6d4', '#3b82f6'
    ];
    return colors[index % colors.length];
  }

  deleteClip(clipId) {
    const index = this.clips.findIndex(c => c.id === clipId);
    if (index === -1) return;

    const clip = this.clips[index];
    this.clips.splice(index, 1);

    if (this.selectedClipId === clipId) {
      this.selectedClipId = null;
      EventBus.emit('clip:selected', null);
    }

    this.updateTotalDuration();
    EventBus.emit('clip:deleted', clip);
    this.render();
  }

  splitClip(clipId, splitTime) {
    const clip = this.clips.find(c => c.id === clipId);
    if (!clip) return null;

    const clipLocalTime = splitTime - clip.startTime + clip.trimStart;
    
    if (clipLocalTime <= clip.trimStart || clipLocalTime >= clip.trimEnd) {
      return null;
    }

    const newClip = {
      ...clip,
      id: generateId(),
      startTime: splitTime,
      trimStart: clipLocalTime,
      color: this.getClipColor(this.clips.length)
    };

    clip.endTime = splitTime;
    clip.trimEnd = clipLocalTime;

    this.clips.push(newClip);
    this.clips.sort((a, b) => a.startTime - b.startTime);
    
    EventBus.emit('clip:updated', clip);
    EventBus.emit('clip:added', newClip);
    this.render();

    return [clip, newClip];
  }

  splitAtCurrentTime() {
    for (const clip of this.clips) {
      if (this.currentTime >= clip.startTime && this.currentTime <= clip.endTime) {
        return this.splitClip(clip.id, this.currentTime);
      }
    }
    return null;
  }

  trimClip(clipId, trimStart, trimEnd) {
    const clip = this.clips.find(c => c.id === clipId);
    if (!clip) return null;

    const materialDuration = clip.material.duration;
    const newTrimStart = clamp(trimStart, 0, materialDuration);
    const newTrimEnd = clamp(trimEnd, newTrimStart + 0.1, materialDuration);

    const durationDelta = (newTrimEnd - newTrimStart) - (clip.trimEnd - clip.trimStart);
    
    clip.trimStart = newTrimStart;
    clip.trimEnd = newTrimEnd;
    clip.endTime = clip.startTime + (newTrimEnd - newTrimStart);

    this.updateTotalDuration();
    EventBus.emit('clip:updated', clip);
    this.render();

    return clip;
  }

  moveClip(clipId, newStartTime) {
    const clip = this.clips.find(c => c.id === clipId);
    if (!clip) return null;

    const duration = clip.endTime - clip.startTime;
    const clampedStart = clamp(newStartTime, 0, this.totalDuration - duration);

    clip.startTime = clampedStart;
    clip.endTime = clampedStart + duration;

    this.clips.sort((a, b) => a.startTime - b.startTime);
    
    EventBus.emit('clip:updated', clip);
    this.render();

    return clip;
  }

  updateClipProperty(clipId, property, value) {
    const clip = this.clips.find(c => c.id === clipId);
    if (!clip) return null;

    clip[property] = value;
    EventBus.emit('clip:updated', clip);
    
    if (this.selectedClipId === clipId) {
      EventBus.emit('clip:selected', clip);
    }

    return clip;
  }

  selectClip(clipId) {
    this.selectedClipId = clipId;
    const clip = this.clips.find(c => c.id === clipId);
    EventBus.emit('clip:selected', clip);
    this.render();
  }

  getClipAtPosition(x) {
    const time = x / this.pixelsPerSecond;
    for (const clip of this.clips) {
      if (time >= clip.startTime && time <= clip.endTime) {
        return clip;
      }
    }
    return null;
  }

  getClipAtMouse(e) {
    const rect = this.timelineCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    for (const clip of this.clips) {
      const clipX = clip.startTime * this.pixelsPerSecond;
      const clipWidth = (clip.endTime - clip.startTime) * this.pixelsPerSecond;
      const clipHeight = rect.height - 20;
      const clipY = 10;

      if (x >= clipX && x <= clipX + clipWidth && y >= clipY && y <= clipY + clipHeight) {
        if (x <= clipX + 8) {
          return { clip, handle: 'left' };
        } else if (x >= clipX + clipWidth - 8) {
          return { clip, handle: 'right' };
        } else {
          return { clip, handle: 'move' };
        }
      }
    }
    return null;
  }

  handleMouseDown(e) {
    const rect = this.timelineCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left + this.scrollLeft;
    const hit = this.getClipAtMouse(e);

    if (hit) {
      this.isDragging = true;
      this.dragType = hit.handle;
      this.dragClipId = hit.clip.id;
      this.dragStartX = x;
      this.dragStartPos = hit.clip.startTime;
      this.selectClip(hit.clip.id);
    } else {
      const time = x / this.pixelsPerSecond;
      this.seekTo(time);
    }
  }

  handleMouseMove(e) {
    if (!this.isDragging) return;

    const rect = this.timelineCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left + this.scrollLeft;
    const deltaX = x - this.dragStartX;
    const deltaTime = deltaX / this.pixelsPerSecond;

    const clip = this.clips.find(c => c.id === this.dragClipId);
    if (!clip) return;

    if (this.dragType === 'move') {
      const newStart = clamp(this.dragStartPos + deltaTime, 0, 
        this.totalDuration - (clip.endTime - clip.startTime));
      this.moveClip(this.dragClipId, newStart);
    } else if (this.dragType === 'left') {
      const newTrimStart = clamp(clip.trimStart + deltaTime, 0, clip.trimEnd - 0.1);
      this.trimClip(this.dragClipId, newTrimStart, clip.trimEnd);
    } else if (this.dragType === 'right') {
      const newTrimEnd = clamp(clip.trimEnd + deltaTime, clip.trimStart + 0.1, clip.material.duration);
      this.trimClip(this.dragClipId, clip.trimStart, newTrimEnd);
    }
  }

  handleMouseUp() {
    this.isDragging = false;
    this.dragType = null;
    this.dragClipId = null;
  }

  handleDoubleClick(e) {
    const hit = this.getClipAtMouse(e);
    if (hit) {
      EventBus.emit('clip:preview', hit.clip);
    }
  }

  seekTo(time) {
    this.currentTime = clamp(time, 0, this.totalDuration);
    EventBus.emit('timeline:seek', this.currentTime);
    this.updatePlayhead(this.currentTime);
  }

  updatePlayhead(time) {
    this.currentTime = time;
    const playheadX = 120 + time * this.pixelsPerSecond - this.scrollLeft;
    this.playhead.style.transform = `translateX(${playheadX}px)`;

    const totalWidth = this.videoTrack.clientWidth;
    if (playheadX > totalWidth - 50) {
      this.videoTrack.scrollLeft = Math.max(0, time * this.pixelsPerSecond - totalWidth + 100);
    }
  }

  updateTotalDuration() {
    if (this.clips.length === 0) {
      this.totalDuration = 60;
    } else {
      this.totalDuration = Math.max(60, ...this.clips.map(c => c.endTime));
    }
    EventBus.emit('timeline:duration', this.totalDuration);
  }

  zoomIn() {
    this.setZoom(Math.min(300, this.zoom + 20));
  }

  zoomOut() {
    this.setZoom(Math.max(20, this.zoom - 20));
  }

  setZoom(zoom) {
    this.zoom = zoom;
    this.pixelsPerSecond = 50 * (zoom / 100);
    this.zoomValue.textContent = zoom;
    this.updateCanvasSize();
    this.render();
  }

  fitToView() {
    if (this.clips.length === 0) {
      this.setZoom(100);
      return;
    }
    const maxEnd = Math.max(...this.clips.map(c => c.endTime));
    const trackWidth = this.videoTrack.clientWidth - 40;
    const newZoom = Math.max(20, Math.min(300, (trackWidth / maxEnd / 50) * 100));
    this.setZoom(newZoom);
  }

  render() {
    this.renderRuler();
    this.renderTimeline();
  }

  renderRuler() {
    const width = this.rulerCanvas.width / window.devicePixelRatio;
    const height = this.rulerCanvas.height / window.devicePixelRatio;
    
    this.rulerCtx.clearRect(0, 0, width, height);
    
    this.rulerCtx.fillStyle = '#1e293b';
    this.rulerCtx.fillRect(0, 0, width, height);

    const interval = this.getRulerInterval();
    const startOffset = this.scrollLeft % (interval * this.pixelsPerSecond);
    const startTime = Math.floor(this.scrollLeft / this.pixelsPerSecond / interval) * interval;

    this.rulerCtx.strokeStyle = '#334155';
    this.rulerCtx.fillStyle = '#94a3b8';
    this.rulerCtx.font = '10px monospace';
    this.rulerCtx.textAlign = 'center';

    let x = -startOffset;
    let time = startTime;

    while (x < width + this.pixelsPerSecond * interval) {
      const isMajor = time % (interval * 5) === 0;
      
      this.rulerCtx.beginPath();
      this.rulerCtx.moveTo(x, height);
      this.rulerCtx.lineTo(x, isMajor ? 4 : height - 8);
      this.rulerCtx.stroke();

      if (isMajor && x >= 0) {
        this.rulerCtx.fillText(formatTime(time), x, 14);
      }

      x += interval * this.pixelsPerSecond;
      time += interval;
    }
  }

  getRulerInterval() {
    if (this.pixelsPerSecond >= 200) return 0.2;
    if (this.pixelsPerSecond >= 100) return 0.5;
    if (this.pixelsPerSecond >= 50) return 1;
    if (this.pixelsPerSecond >= 20) return 2;
    if (this.pixelsPerSecond >= 10) return 5;
    return 10;
  }

  renderTimeline() {
    const width = this.timelineCanvas.width / window.devicePixelRatio;
    const height = this.timelineCanvas.height / window.devicePixelRatio;

    this.timelineCtx.clearRect(0, 0, width, height);

    this.renderGrid(width, height);
    this.renderClips(width, height);
  }

  renderGrid(width, height) {
    const interval = this.getRulerInterval() * 5;
    const startOffset = this.scrollLeft % (interval * this.pixelsPerSecond);

    this.timelineCtx.strokeStyle = 'rgba(51, 65, 85, 0.5)';
    this.timelineCtx.lineWidth = 1;

    let x = -startOffset;
    while (x < width) {
      this.timelineCtx.beginPath();
      this.timelineCtx.moveTo(x, 0);
      this.timelineCtx.lineTo(x, height);
      this.timelineCtx.stroke();
      x += interval * this.pixelsPerSecond;
    }
  }

  renderClips(width, height) {
    const trackY = 10;
    const trackHeight = height - 20;
    const cornerRadius = 6;

    for (const clip of this.clips) {
      const x = clip.startTime * this.pixelsPerSecond;
      const clipWidth = (clip.endTime - clip.startTime) * this.pixelsPerSecond;

      if (x + clipWidth < this.scrollLeft - 100 || x > this.scrollLeft + width + 100) {
        continue;
      }

      const isSelected = clip.id === this.selectedClipId;

      const gradient = this.timelineCtx.createLinearGradient(x, trackY, x, trackY + trackHeight);
      gradient.addColorStop(0, clip.color);
      gradient.addColorStop(1, this.darkenColor(clip.color, 30));

      this.timelineCtx.fillStyle = gradient;
      this.timelineCtx.beginPath();
      this.roundRect(x, trackY, clipWidth, trackHeight, cornerRadius);
      this.timelineCtx.fill();

      if (isSelected) {
        this.timelineCtx.strokeStyle = '#ffffff';
        this.timelineCtx.lineWidth = 2;
        this.timelineCtx.stroke();
      }

      if (clip.trimStart > 0 || clip.trimEnd < clip.material.duration) {
        this.timelineCtx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        if (clip.trimStart > 0) {
          const trimWidth = (clip.trimStart / clip.material.duration) * clipWidth;
          this.timelineCtx.fillRect(x, trackY, trimWidth, trackHeight);
        }
        if (clip.trimEnd < clip.material.duration) {
          const trimX = x + (clip.trimEnd / clip.material.duration) * clipWidth;
          const trimWidth = clipWidth - (trimX - x);
          this.timelineCtx.fillRect(trimX, trackY, trimWidth, trackHeight);
        }
      }

      if (clip.fadeIn > 0) {
        const fadeWidth = (clip.fadeIn / (clip.endTime - clip.startTime)) * clipWidth;
        const fadeGradient = this.timelineCtx.createLinearGradient(x, 0, x + fadeWidth, 0);
        fadeGradient.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
        fadeGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        this.timelineCtx.fillStyle = fadeGradient;
        this.timelineCtx.fillRect(x, trackY, fadeWidth, trackHeight);
      }

      if (clip.fadeOut > 0) {
        const fadeWidth = (clip.fadeOut / (clip.endTime - clip.startTime)) * clipWidth;
        const fadeX = x + clipWidth - fadeWidth;
        const fadeGradient = this.timelineCtx.createLinearGradient(fadeX, 0, fadeX + fadeWidth, 0);
        fadeGradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
        fadeGradient.addColorStop(1, 'rgba(255, 255, 255, 0.6)');
        this.timelineCtx.fillStyle = fadeGradient;
        this.timelineCtx.fillRect(fadeX, trackY, fadeWidth, trackHeight);
      }

      if (clipWidth > 60) {
        this.timelineCtx.fillStyle = '#ffffff';
        this.timelineCtx.font = '12px -apple-system, sans-serif';
        this.timelineCtx.textAlign = 'left';
        this.timelineCtx.textBaseline = 'top';
        
        const displayName = clip.material.name.length > 20 ? 
          clip.material.name.substring(0, 17) + '...' : clip.material.name;
        this.timelineCtx.fillText(displayName, x + 10, trackY + 8);

        this.timelineCtx.font = '10px monospace';
        this.timelineCtx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        this.timelineCtx.fillText(
          formatTime(clip.endTime - clip.startTime),
          x + 10, 
          trackY + trackHeight - 20
        );
      }

      if (clipWidth > 20) {
        this.timelineCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        this.timelineCtx.fillRect(x, trackY + trackHeight / 2 - 4, 4, 8);
        this.timelineCtx.fillRect(x + clipWidth - 4, trackY + trackHeight / 2 - 4, 4, 8);
      }
    }
  }

  roundRect(x, y, width, height, radius) {
    this.timelineCtx.moveTo(x + radius, y);
    this.timelineCtx.lineTo(x + width - radius, y);
    this.timelineCtx.quadraticCurveTo(x + width, y, x + width, y + radius);
    this.timelineCtx.lineTo(x + width, y + height - radius);
    this.timelineCtx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    this.timelineCtx.lineTo(x + radius, y + height);
    this.timelineCtx.quadraticCurveTo(x, y + height, x, y + height - radius);
    this.timelineCtx.lineTo(x, y + radius);
    this.timelineCtx.quadraticCurveTo(x, y, x + radius, y);
    this.timelineCtx.closePath();
  }

  darkenColor(color, percent) {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max(0, (num >> 16) - amt);
    const G = Math.max(0, ((num >> 8) & 0x00FF) - amt);
    const B = Math.max(0, (num & 0x0000FF) - amt);
    return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
  }

  getCurrentClip() {
    return this.clips.find(c => c.id === this.selectedClipId);
  }

  getClips() {
    return [...this.clips];
  }

  getTotalDuration() {
    return this.totalDuration;
  }
}

export const timelineManager = new TimelineManager();
