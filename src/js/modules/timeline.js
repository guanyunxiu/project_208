import { EventBus, generateId, formatTime, clamp } from './utils.js';

const TRACK_TYPES = {
  video: {
    name: '视频轨道',
    icon: '🎬',
    color: '#6366f1',
    height: 60
  },
  audio: {
    name: '音频轨道',
    icon: '🎵',
    color: '#8b5cf6',
    height: 40
  },
  text: {
    name: '文字轨道',
    icon: '📝',
    color: '#ec4899',
    height: 50
  },
  sticker: {
    name: '贴纸轨道',
    icon: '🖼️',
    color: '#f97316',
    height: 50
  }
};

class Track {
  constructor(type, index) {
    this.id = `track_${type}_${index}`;
    this.type = type;
    this.name = TRACK_TYPES[type].name + (index > 0 ? ` ${index + 1}` : '');
    this.icon = TRACK_TYPES[type].icon;
    this.color = TRACK_TYPES[type].color;
    this.height = TRACK_TYPES[type].height;
    this.locked = false;
    this.hidden = false;
    this.muted = false;
    this.items = [];
    this.zIndex = index;
  }
}

class TimelineManager {
  constructor() {
    this.tracks = [];
    this.clips = [];
    this.currentTime = 0;
    this.totalDuration = 60;
    this.selectedItemId = null;
    this.selectedTrackId = null;
    this.isPlaying = false;
    this.zoom = 100;
    this.pixelsPerSecond = 50;
    this.scrollLeft = 0;
    this.scrollTop = 0;

    this.timelineCanvas = document.getElementById('timeline-canvas');
    this.rulerCanvas = document.getElementById('ruler-canvas');
    this.tracksContainer = document.getElementById('tracks-container');
    this.playhead = document.getElementById('playhead');
    this.timelineCtx = this.timelineCanvas.getContext('2d');
    this.rulerCtx = this.rulerCanvas.getContext('2d');

    this.zoomInBtn = document.getElementById('btn-zoom-in');
    this.zoomOutBtn = document.getElementById('btn-zoom-out');
    this.fitBtn = document.getElementById('btn-fit');
    this.zoomValue = document.getElementById('zoom-value');

    this.isDragging = false;
    this.dragType = null;
    this.dragItemId = null;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.dragStartPos = 0;
    this.dragStartTrack = null;

    this.init();
  }

  init() {
    this.initializeTracks();
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

    EventBus.on('text:added', (text) => this.addItemToTrack(text, 'text'));
    EventBus.on('sticker:added', (sticker) => this.addItemToTrack(sticker, 'sticker'));
    EventBus.on('text:deleted', (text) => this.removeItemFromTrack(text.id));
    EventBus.on('sticker:deleted', (sticker) => this.removeItemFromTrack(sticker.id));
    EventBus.on('text:updated', () => this.render());
    EventBus.on('sticker:updated', () => this.render());

    EventBus.on('track:add', (type) => this.addTrack(type));
    EventBus.on('track:remove', (trackId) => this.removeTrack(trackId));
    EventBus.on('track:toggle-lock', (trackId) => this.toggleTrackLock(trackId));
    EventBus.on('track:toggle-hide', (trackId) => this.toggleTrackHide(trackId));
    EventBus.on('track:toggle-mute', (trackId) => this.toggleTrackMute(trackId));
    EventBus.on('track:move-up', (trackId) => this.moveTrackUp(trackId));
    EventBus.on('track:move-down', (trackId) => this.moveTrackDown(trackId));
  }

  initializeTracks() {
    this.tracks = [
      new Track('video', 0),
      new Track('video', 1),
      new Track('audio', 0),
      new Track('text', 0),
      new Track('sticker', 0)
    ];
  }

  addTrack(type) {
    const existingCount = this.tracks.filter(t => t.type === type).length;
    const newTrack = new Track(type, existingCount);
    
    const maxZIndex = Math.max(...this.tracks.map(t => t.zIndex));
    newTrack.zIndex = maxZIndex + 1;
    
    this.tracks.push(newTrack);
    this.tracks.sort((a, b) => a.zIndex - b.zIndex);
    
    this.updateCanvasSize();
    this.render();
    EventBus.emit('track:added', newTrack);
    return newTrack;
  }

  removeTrack(trackId) {
    const index = this.tracks.findIndex(t => t.id === trackId);
    if (index === -1) return;
    
    const track = this.tracks[index];
    
    for (const item of track.items) {
      if (item.type === 'clip') {
        this.clips = this.clips.filter(c => c.id !== item.id);
      } else if (item.type === 'text' && window.__textManager) {
        window.__textManager.deleteText(item.id);
      } else if (item.type === 'sticker' && window.__textManager) {
        window.__textManager.deleteSticker(item.id);
      }
    }
    
    this.tracks.splice(index, 1);
    this.updateCanvasSize();
    this.render();
    EventBus.emit('track:removed', track);
  }

  toggleTrackLock(trackId) {
    const track = this.tracks.find(t => t.id === trackId);
    if (track) {
      track.locked = !track.locked;
      this.render();
      EventBus.emit('track:updated', track);
    }
  }

  toggleTrackHide(trackId) {
    const track = this.tracks.find(t => t.id === trackId);
    if (track) {
      track.hidden = !track.hidden;
      this.render();
      EventBus.emit('player:update');
      EventBus.emit('track:updated', track);
    }
  }

  toggleTrackMute(trackId) {
    const track = this.tracks.find(t => t.id === trackId);
    if (track) {
      track.muted = !track.muted;
      this.render();
      EventBus.emit('player:update');
      EventBus.emit('track:updated', track);
    }
  }

  moveTrackUp(trackId) {
    const index = this.tracks.findIndex(t => t.id === trackId);
    if (index <= 0) return;
    
    [this.tracks[index], this.tracks[index - 1]] = [this.tracks[index - 1], this.tracks[index]];
    
    const tempZ = this.tracks[index].zIndex;
    this.tracks[index].zIndex = this.tracks[index - 1].zIndex;
    this.tracks[index - 1].zIndex = tempZ;
    
    this.tracks.sort((a, b) => a.zIndex - b.zIndex);
    this.updateCanvasSize();
    this.render();
    EventBus.emit('track:reordered', this.tracks);
  }

  moveTrackDown(trackId) {
    const index = this.tracks.findIndex(t => t.id === trackId);
    if (index === -1 || index >= this.tracks.length - 1) return;
    
    [this.tracks[index], this.tracks[index + 1]] = [this.tracks[index + 1], this.tracks[index]];
    
    const tempZ = this.tracks[index].zIndex;
    this.tracks[index].zIndex = this.tracks[index + 1].zIndex;
    this.tracks[index + 1].zIndex = tempZ;
    
    this.tracks.sort((a, b) => a.zIndex - b.zIndex);
    this.updateCanvasSize();
    this.render();
    EventBus.emit('track:reordered', this.tracks);
  }

  addItemToTrack(item, trackType) {
    const track = this.tracks.find(t => t.type === trackType && !t.locked);
    if (!track) {
      const newTrack = this.addTrack(trackType);
      newTrack.items.push(item);
    } else {
      track.items.push(item);
    }
    
    item.trackId = track ? track.id : this.tracks[this.tracks.length - 1].id;
    this.updateTotalDuration();
    this.render();
  }

  removeItemFromTrack(itemId) {
    for (const track of this.tracks) {
      track.items = track.items.filter(item => item.id !== itemId);
    }
    this.clips = this.clips.filter(c => c.id !== itemId);
    this.updateTotalDuration();
    this.render();
  }

  setupCanvas() {
    const resizeCanvas = () => {
      const totalTrackHeight = this.tracks.reduce((sum, t) => sum + t.height + 10, 0) + 20;
      const trackRect = this.tracksContainer.getBoundingClientRect();
      const trackContentWidth = Math.max(trackRect.width, this.totalDuration * this.pixelsPerSecond + 200);
      
      this.timelineCanvas.width = trackContentWidth * window.devicePixelRatio;
      this.timelineCanvas.height = totalTrackHeight * window.devicePixelRatio;
      this.timelineCanvas.style.width = trackContentWidth + 'px';
      this.timelineCanvas.style.height = totalTrackHeight + 'px';
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
    this.tracksContainer.addEventListener('scroll', () => {
      this.scrollLeft = this.tracksContainer.scrollLeft;
      this.scrollTop = this.tracksContainer.scrollTop;
      this.render();
    });

    setTimeout(resizeCanvas, 100);
  }

  updateCanvasSize() {
    const totalTrackHeight = this.tracks.reduce((sum, t) => sum + t.height + 10, 0) + 20;
    const trackRect = this.tracksContainer.getBoundingClientRect();
    const trackContentWidth = Math.max(trackRect.width, this.totalDuration * this.pixelsPerSecond + 200);
    
    this.timelineCanvas.width = trackContentWidth * window.devicePixelRatio;
    this.timelineCanvas.height = totalTrackHeight * window.devicePixelRatio;
    this.timelineCanvas.style.width = trackContentWidth + 'px';
    this.timelineCanvas.style.height = totalTrackHeight + 'px';
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
        if (this.selectedItemId && document.activeElement.tagName !== 'INPUT') {
          e.preventDefault();
          this.deleteItem(this.selectedItemId);
        }
      }
      if (e.key === 's' && e.ctrlKey) {
        e.preventDefault();
        EventBus.emit('timeline:split', this.currentTime);
      }
    });
  }

  setupDragAndDrop() {
    this.tracksContainer.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      this.tracksContainer.classList.add('drag-over');
    });

    this.tracksContainer.addEventListener('dragleave', () => {
      this.tracksContainer.classList.remove('drag-over');
    });

    this.tracksContainer.addEventListener('drop', (e) => {
      e.preventDefault();
      this.tracksContainer.classList.remove('drag-over');

      try {
        const data = JSON.parse(e.dataTransfer.getData('application/json'));
        if (data.type === 'material') {
          const rect = this.tracksContainer.getBoundingClientRect();
          const x = e.clientX - rect.left + this.scrollLeft;
          const y = e.clientY - rect.top + this.scrollTop;
          const startTime = Math.max(0, x / this.pixelsPerSecond);
          
          const track = this.getTrackAtY(y);
          if (track && track.type === 'video' && !track.locked) {
            this.addClip(data.materialId, startTime, track.id);
          } else {
            const videoTrack = this.tracks.find(t => t.type === 'video' && !t.locked);
            if (videoTrack) {
              this.addClip(data.materialId, startTime, videoTrack.id);
            }
          }
        }
      } catch (err) {
        console.error('Drop error:', err);
      }
    });
  }

  getTrackAtY(y) {
    let currentY = 10;
    for (const track of this.tracks) {
      if (y >= currentY && y < currentY + track.height) {
        return track;
      }
      currentY += track.height + 10;
    }
    return null;
  }

  getTrackY(trackId) {
    let y = 10;
    for (const track of this.tracks) {
      if (track.id === trackId) return y;
      y += track.height + 10;
    }
    return y;
  }

  addClip(materialId, startTime = 0, trackId = null) {
    const mat = window.__materialManager?.getMaterialById(materialId);
    if (!mat) {
      console.error('Material not found:', materialId);
      return null;
    }

    let targetTrack = trackId ? this.tracks.find(t => t.id === trackId) : null;
    if (!targetTrack) {
      targetTrack = this.tracks.find(t => t.type === 'video' && !t.locked);
      if (!targetTrack) {
        targetTrack = this.addTrack('video');
      }
    }

    if (targetTrack.locked) {
      console.warn('Track is locked');
      return null;
    }

    const adjustedStart = this.findInsertPosition(startTime, mat.duration, targetTrack);

    const clip = {
      id: generateId(),
      type: 'clip',
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
      filter: 'none',
      colorAdjust: { brightness: 0, contrast: 0, saturation: 0, temperature: 0 },
      transitionIn: null,
      trackId: targetTrack.id,
      zIndex: targetTrack.items.length,
      color: this.getClipColor(this.clips.length)
    };

    this.clips.push(clip);
    targetTrack.items.push(clip);
    this.updateTotalDuration();
    this.selectedItemId = clip.id;
    
    EventBus.emit('clip:added', clip);
    EventBus.emit('clip:selected', clip);
    this.render();

    return clip;
  }

  findInsertPosition(startTime, duration, track) {
    let pos = startTime;
    const sortedItems = [...track.items].sort((a, b) => a.startTime - b.startTime);
    
    for (const item of sortedItems) {
      if (pos + duration <= item.startTime) {
        break;
      }
      if (pos < item.endTime) {
        pos = item.endTime;
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

  deleteItem(itemId) {
    const clip = this.clips.find(c => c.id === itemId);
    if (clip) {
      this.deleteClip(itemId);
      return;
    }

    if (window.__textManager) {
      const text = window.__textManager.getTextById?.(itemId);
      if (text) {
        window.__textManager.deleteText(itemId);
        return;
      }
      
      const sticker = window.__textManager.getStickerById?.(itemId);
      if (sticker) {
        window.__textManager.deleteSticker(itemId);
        return;
      }
    }

    this.removeItemFromTrack(itemId);
  }

  deleteClip(clipId) {
    const index = this.clips.findIndex(c => c.id === clipId);
    if (index === -1) return;

    const clip = this.clips[index];
    this.clips.splice(index, 1);

    for (const track of this.tracks) {
      track.items = track.items.filter(item => item.id !== clipId);
    }

    if (this.selectedItemId === clipId) {
      this.selectedItemId = null;
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
      color: this.getClipColor(this.clips.length),
      transitionIn: null
    };

    clip.endTime = splitTime;
    clip.trimEnd = clipLocalTime;

    this.clips.push(newClip);
    
    const track = this.tracks.find(t => t.id === clip.trackId);
    if (track) {
      track.items.push(newClip);
    }

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

  moveItem(itemId, newStartTime, newTrackId = null) {
    const clip = this.clips.find(c => c.id === itemId);
    const item = clip || (window.__textManager?.getItemById?.(itemId));
    
    if (!item) return null;

    const track = this.tracks.find(t => t.id === (newTrackId || item.trackId));
    if (!track || track.locked) return null;

    const duration = item.endTime - item.startTime;
    const clampedStart = clamp(newStartTime, 0, this.totalDuration - duration);

    item.startTime = clampedStart;
    item.endTime = clampedStart + duration;
    
    if (newTrackId && newTrackId !== item.trackId) {
      const oldTrack = this.tracks.find(t => t.id === item.trackId);
      if (oldTrack) {
        oldTrack.items = oldTrack.items.filter(i => i.id !== itemId);
      }
      item.trackId = newTrackId;
      track.items.push(item);
    }

    if (clip) {
      this.clips.sort((a, b) => a.startTime - b.startTime);
    }

    EventBus.emit(clip ? 'clip:updated' : 'timeline:item-updated', item);
    this.render();

    return item;
  }

  updateClipProperty(clipId, property, value) {
    const clip = this.clips.find(c => c.id === clipId);
    if (!clip) return null;

    clip[property] = value;
    EventBus.emit('clip:updated', clip);
    
    if (this.selectedItemId === clipId) {
      EventBus.emit('clip:selected', clip);
    }

    this.render();
    return clip;
  }

  updateItemProperty(itemId, property, value) {
    const clip = this.clips.find(c => c.id === itemId);
    if (clip) {
      return this.updateClipProperty(itemId, property, value);
    }

    if (window.__textManager) {
      const text = window.__textManager.getTextById?.(itemId);
      if (text) {
        window.__textManager.updateText(itemId, { [property]: value });
        return text;
      }
      
      const sticker = window.__textManager.getStickerById?.(itemId);
      if (sticker) {
        window.__textManager.updateSticker(itemId, { [property]: value });
        return sticker;
      }
    }

    return null;
  }

  selectItem(itemId) {
    this.selectedItemId = itemId;
    
    const clip = this.clips.find(c => c.id === itemId);
    if (clip) {
      EventBus.emit('clip:selected', clip);
    } else if (window.__textManager) {
      const item = window.__textManager.getItemById?.(itemId);
      if (item) {
        EventBus.emit('item:selected', item);
      }
    }
    
    this.render();
  }

  getItemAtPosition(x, y) {
    const time = x / this.pixelsPerSecond;
    const track = this.getTrackAtY(y);
    if (!track) return null;

    for (const item of track.items) {
      if (time >= item.startTime && time <= item.endTime) {
        return { item, track };
      }
    }
    return null;
  }

  getItemAtMouse(e) {
    const rect = this.timelineCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left + this.scrollLeft;
    const y = e.clientY - rect.top + this.scrollTop;

    for (const track of this.tracks) {
      const trackY = this.getTrackY(track.id);
      const trackHeight = track.height;

      for (const item of track.items) {
        const itemX = item.startTime * this.pixelsPerSecond;
        const itemWidth = (item.endTime - item.startTime) * this.pixelsPerSecond;
        const itemY = trackY;
        const itemHeight = trackHeight - 20;

        if (x >= itemX && x <= itemX + itemWidth && 
            y >= itemY && y <= itemY + itemHeight + 20) {
          if (x <= itemX + 8) {
            return { item, track, handle: 'left' };
          } else if (x >= itemX + itemWidth - 8) {
            return { item, track, handle: 'right' };
          } else {
            return { item, track, handle: 'move' };
          }
        }
      }
    }
    return null;
  }

  handleMouseDown(e) {
    const rect = this.timelineCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left + this.scrollLeft;
    const y = e.clientY - rect.top + this.scrollTop;
    const hit = this.getItemAtMouse(e);

    if (hit && !hit.track.locked) {
      this.isDragging = true;
      this.dragType = hit.handle;
      this.dragItemId = hit.item.id;
      this.dragStartX = x;
      this.dragStartY = y;
      this.dragStartPos = hit.item.startTime;
      this.dragStartTrack = hit.track.id;
      this.selectItem(hit.item.id);
    } else {
      const time = x / this.pixelsPerSecond;
      this.seekTo(time);
    }
  }

  handleMouseMove(e) {
    if (!this.isDragging) return;

    const rect = this.timelineCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left + this.scrollLeft;
    const y = e.clientY - rect.top + this.scrollTop;
    const deltaX = x - this.dragStartX;
    const deltaTime = deltaX / this.pixelsPerSecond;

    const clip = this.clips.find(c => c.id === this.dragItemId);
    const item = clip || (window.__textManager?.getItemById?.(this.dragItemId));
    if (!item) return;

    const newTrack = this.getTrackAtY(y);
    const newTrackId = newTrack && !newTrack.locked && newTrack.type === (clip ? 'video' : item.type) 
      ? newTrack.id 
      : this.dragStartTrack;

    if (this.dragType === 'move') {
      const newStart = clamp(this.dragStartPos + deltaTime, 0, 
        this.totalDuration - (item.endTime - item.startTime));
      this.moveItem(this.dragItemId, newStart, newTrackId);
    } else if (this.dragType === 'left' && clip) {
      const newTrimStart = clamp(clip.trimStart + deltaTime, 0, clip.trimEnd - 0.1);
      this.trimClip(this.dragItemId, newTrimStart, clip.trimEnd);
    } else if (this.dragType === 'right' && clip) {
      const newTrimEnd = clamp(clip.trimEnd + deltaTime, clip.trimStart + 0.1, clip.material.duration);
      this.trimClip(this.dragItemId, clip.trimStart, newTrimEnd);
    }
  }

  handleMouseUp() {
    this.isDragging = false;
    this.dragType = null;
    this.dragItemId = null;
    this.dragStartTrack = null;
  }

  handleDoubleClick(e) {
    const hit = this.getItemAtMouse(e);
    if (hit && hit.item.type === 'clip') {
      EventBus.emit('clip:preview', hit.item);
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

    const totalWidth = this.tracksContainer.clientWidth;
    if (playheadX > totalWidth - 50) {
      this.tracksContainer.scrollLeft = Math.max(0, time * this.pixelsPerSecond - totalWidth + 100);
    }
  }

  updateTotalDuration() {
    let maxEnd = 0;
    
    for (const clip of this.clips) {
      maxEnd = Math.max(maxEnd, clip.endTime);
    }
    
    if (window.__textManager) {
      for (const text of window.__textManager.getTexts()) {
        maxEnd = Math.max(maxEnd, text.endTime);
      }
      for (const sticker of window.__textManager.getStickers()) {
        maxEnd = Math.max(maxEnd, sticker.endTime);
      }
    }

    this.totalDuration = Math.max(60, maxEnd);
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
    this.updateTotalDuration();
    const maxEnd = this.totalDuration;
    const trackWidth = this.tracksContainer.clientWidth - 140;
    const newZoom = Math.max(20, Math.min(300, (trackWidth / maxEnd / 50) * 100));
    this.setZoom(newZoom);
  }

  render() {
    this.renderRuler();
    this.renderTimeline();
    this.renderTrackHeaders();
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
    this.renderTracks(width, height);
    this.renderItems(width, height);
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

  renderTracks(width, height) {
    let y = 10;
    
    for (const track of this.tracks) {
      this.timelineCtx.fillStyle = track.hidden ? 'rgba(30, 41, 59, 0.5)' : '#1e293b';
      this.timelineCtx.fillRect(0, y, width, track.height);
      
      this.timelineCtx.strokeStyle = track.locked ? '#ef4444' : '#334155';
      this.timelineCtx.lineWidth = 1;
      this.timelineCtx.strokeRect(0, y, width, track.height);
      
      y += track.height + 10;
    }
  }

  renderTrackHeaders() {
    const headersContainer = document.getElementById('track-headers');
    if (!headersContainer) return;

    headersContainer.innerHTML = '';
    
    for (const track of this.tracks) {
      const header = document.createElement('div');
      header.className = 'track-header-item';
      header.style.height = track.height + 'px';
      header.style.backgroundColor = track.color + '20';
      header.style.borderLeft = `3px solid ${track.color}`;
      
      header.innerHTML = `
        <div class="track-header-content">
          <span class="track-icon">${track.icon}</span>
          <span class="track-name">${track.name}</span>
        </div>
        <div class="track-controls">
          <button class="track-btn ${track.locked ? 'active' : ''}" 
                  title="${track.locked ? '解锁' : '锁定'}"
                  onclick="EventBus.emit('track:toggle-lock', '${track.id}')">
            ${track.locked ? '🔒' : '🔓'}
          </button>
          <button class="track-btn ${track.hidden ? 'active' : ''}" 
                  title="${track.hidden ? '显示' : '隐藏'}"
                  onclick="EventBus.emit('track:toggle-hide', '${track.id}')">
            ${track.hidden ? '👁️‍🗨️' : '👁️'}
          </button>
          ${track.type === 'audio' || track.type === 'video' ? `
            <button class="track-btn ${track.muted ? 'active' : ''}" 
                    title="${track.muted ? '取消静音' : '静音'}"
                    onclick="EventBus.emit('track:toggle-mute', '${track.id}')">
              ${track.muted ? '🔇' : '🔊'}
            </button>
          ` : ''}
          <button class="track-btn" title="上移"
                  onclick="EventBus.emit('track:move-up', '${track.id}')">
            ⬆️
          </button>
          <button class="track-btn" title="下移"
                  onclick="EventBus.emit('track:move-down', '${track.id}')">
            ⬇️
          </button>
          ${this.tracks.filter(t => t.type === track.type).length > 1 ? `
            <button class="track-btn danger" title="删除轨道"
                    onclick="EventBus.emit('track:remove', '${track.id}')">
              🗑️
            </button>
          ` : ''}
        </div>
      `;
      
      headersContainer.appendChild(header);
    }

    const addTrackBtn = document.createElement('div');
    addTrackBtn.className = 'add-track-btn';
    addTrackBtn.innerHTML = `
      <button class="btn-small" onclick="EventBus.emit('track:add', 'video')">+ 视频</button>
      <button class="btn-small" onclick="EventBus.emit('track:add', 'audio')">+ 音频</button>
      <button class="btn-small" onclick="EventBus.emit('track:add', 'text')">+ 文字</button>
      <button class="btn-small" onclick="EventBus.emit('track:add', 'sticker')">+ 贴纸</button>
    `;
    headersContainer.appendChild(addTrackBtn);
  }

  renderItems(width, height) {
    const cornerRadius = 6;

    for (const track of this.tracks) {
      if (track.hidden) continue;

      const trackY = this.getTrackY(track.id);
      const trackHeight = track.height - 20;

      for (const item of track.items) {
        const x = item.startTime * this.pixelsPerSecond;
        const itemWidth = (item.endTime - item.startTime) * this.pixelsPerSecond;

        if (x + itemWidth < this.scrollLeft - 100 || x > this.scrollLeft + width + 100) {
          continue;
        }

        const isSelected = item.id === this.selectedItemId;
        const color = item.color || track.color;

        const gradient = this.timelineCtx.createLinearGradient(x, trackY, x, trackY + trackHeight);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, this.darkenColor(color, 30));

        this.timelineCtx.fillStyle = gradient;
        this.timelineCtx.beginPath();
        this.roundRect(x, trackY, itemWidth, trackHeight, cornerRadius);
        this.timelineCtx.fill();

        if (isSelected) {
          this.timelineCtx.strokeStyle = '#ffffff';
          this.timelineCtx.lineWidth = 2;
          this.timelineCtx.stroke();
        }

        if (item.type === 'clip' && (item.trimStart > 0 || item.trimEnd < item.material.duration)) {
          this.timelineCtx.fillStyle = 'rgba(0, 0, 0, 0.3)';
          if (item.trimStart > 0) {
            const trimWidth = (item.trimStart / item.material.duration) * itemWidth;
            this.timelineCtx.fillRect(x, trackY, trimWidth, trackHeight);
          }
          if (item.trimEnd < item.material.duration) {
            const trimX = x + (item.trimEnd / item.material.duration) * itemWidth;
            const trimWidth = itemWidth - (trimX - x);
            this.timelineCtx.fillRect(trimX, trackY, trimWidth, trackHeight);
          }
        }

        if (item.fadeIn > 0) {
          const fadeWidth = (item.fadeIn / (item.endTime - item.startTime)) * itemWidth;
          const fadeGradient = this.timelineCtx.createLinearGradient(x, 0, x + fadeWidth, 0);
          fadeGradient.addColorStop(0, 'rgba(255, 255, 255, 0.6)');
          fadeGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
          this.timelineCtx.fillStyle = fadeGradient;
          this.timelineCtx.fillRect(x, trackY, fadeWidth, trackHeight);
        }

        if (item.fadeOut > 0) {
          const fadeWidth = (item.fadeOut / (item.endTime - item.startTime)) * itemWidth;
          const fadeX = x + itemWidth - fadeWidth;
          const fadeGradient = this.timelineCtx.createLinearGradient(fadeX, 0, fadeX + fadeWidth, 0);
          fadeGradient.addColorStop(0, 'rgba(255, 255, 255, 0)');
          fadeGradient.addColorStop(1, 'rgba(255, 255, 255, 0.6)');
          this.timelineCtx.fillStyle = fadeGradient;
          this.timelineCtx.fillRect(fadeX, trackY, fadeWidth, trackHeight);
        }

        if (itemWidth > 60) {
          this.timelineCtx.fillStyle = '#ffffff';
          this.timelineCtx.font = '12px -apple-system, sans-serif';
          this.timelineCtx.textAlign = 'left';
          this.timelineCtx.textBaseline = 'top';
          
          const displayName = (item.type === 'clip' ? item.material.name : item.content || item.name);
          const truncatedName = displayName.length > 20 ? 
            displayName.substring(0, 17) + '...' : displayName;
          this.timelineCtx.fillText(truncatedName, x + 10, trackY + 8);

          this.timelineCtx.font = '10px monospace';
          this.timelineCtx.fillStyle = 'rgba(255, 255, 255, 0.8)';
          this.timelineCtx.fillText(
            formatTime(item.endTime - item.startTime),
            x + 10, 
            trackY + trackHeight - 20
          );
        }

        if (itemWidth > 20) {
          this.timelineCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
          this.timelineCtx.fillRect(x, trackY + trackHeight / 2 - 4, 4, 8);
          this.timelineCtx.fillRect(x + itemWidth - 4, trackY + trackHeight / 2 - 4, 4, 8);
        }

        if (item.transitionIn) {
          this.timelineCtx.fillStyle = 'rgba(59, 130, 246, 0.8)';
          this.timelineCtx.beginPath();
          this.timelineCtx.moveTo(x, trackY + trackHeight / 2);
          this.timelineCtx.lineTo(x + 12, trackY + 5);
          this.timelineCtx.lineTo(x + 12, trackY + trackHeight - 5);
          this.timelineCtx.closePath();
          this.timelineCtx.fill();
        }
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
    return this.clips.find(c => c.id === this.selectedItemId);
  }

  getClips() {
    return [...this.clips];
  }

  getVisibleClips() {
    return this.clips.filter(c => {
      const track = this.tracks.find(t => t.id === c.trackId);
      return track && !track.hidden;
    }).sort((a, b) => {
      const trackA = this.tracks.find(t => t.id === a.trackId);
      const trackB = this.tracks.find(t => t.id === b.trackId);
      return (trackB?.zIndex || 0) - (trackA?.zIndex || 0);
    });
  }

  getTracks() {
    return [...this.tracks];
  }

  getTotalDuration() {
    return this.totalDuration;
  }

  getAllItems() {
    const items = [];
    for (const track of this.tracks) {
      items.push(...track.items);
    }
    return items;
  }

  getActiveClipsAtTime(time) {
    return this.getVisibleClips().filter(clip => 
      time >= clip.startTime && time < clip.endTime
    );
  }
}

export const timelineManager = new TimelineManager();
