import { EventBus, formatTime, getAspectRatio, clamp } from './utils.js';
import { filterManager } from './filters.js';
import { textManager } from './text.js';
import { transitionManager, TRANSITIONS } from './transitions.js';
import { audioManager } from './audio.js';

class VideoPlayer {
  constructor() {
    this.videoElement = document.getElementById('preview-video');
    this.canvasElement = document.getElementById('preview-canvas');
    this.previewOverlay = document.getElementById('preview-overlay');
    this.previewWrapper = document.getElementById('preview-wrapper');
    this.canvasCtx = this.canvasElement.getContext('2d');

    this.playBtn = document.getElementById('btn-play');
    this.prevBtn = document.getElementById('btn-prev');
    this.nextBtn = document.getElementById('btn-next');
    this.currentTimeEl = document.getElementById('current-time');
    this.totalTimeEl = document.getElementById('total-time');

    this.scrubberTrack = document.getElementById('scrubber-track');
    this.scrubberProgress = document.getElementById('scrubber-progress');
    this.scrubberHandle = document.getElementById('scrubber-handle');

    this.isPlaying = false;
    this.currentTime = 0;
    this.totalDuration = 0;
    this.currentClip = null;
    this.activeClips = [];
    this.loadedClips = new Map();

    this.activeAudioClips = new Map();
    this.videoVolume = 1;

    this.animationFrameId = null;
    this.isScrubbing = false;
  }

  init() {
    this.setupCanvas();
    this.setupEventListeners();
    this.setupInteractionHandlers();

    EventBus.on('clip:added', () => this.updateClips());
    EventBus.on('clip:deleted', () => this.updateClips());
    EventBus.on('clip:updated', () => this.updateClips());
    EventBus.on('clip:selected', (clip) => this.onClipSelected(clip));
    EventBus.on('clip:preview', (clip) => this.previewClip(clip));
    EventBus.on('timeline:seek', (time) => {
      this.currentTime = clamp(time, 0, this.totalDuration);
      this.updateTimeDisplay();
      this.updateScrubber();
      this.renderFrame();
      this.updateAudioClips();
    });
    EventBus.on('timeline:duration', (duration) => this.updateDuration(duration));
    EventBus.on('material:preview', (material) => this.previewMaterial(material));
    EventBus.on('player:update', () => this.renderFrame());
    EventBus.on('track:updated', () => this.renderFrame());

    EventBus.on('text:added', () => this.renderFrame());
    EventBus.on('text:updated', () => this.renderFrame());
    EventBus.on('text:deleted', () => this.renderFrame());
    EventBus.on('sticker:added', () => this.renderFrame());
    EventBus.on('sticker:updated', () => this.renderFrame());
    EventBus.on('sticker:deleted', () => this.renderFrame());
    EventBus.on('item:selected', () => this.renderFrame());

    EventBus.on('audio-clip:added', () => this.updateAudioClips());
    EventBus.on('audio-clip:deleted', () => this.updateAudioClips());
    EventBus.on('audio-clip:updated', () => this.updateAudioClips());
    EventBus.on('audio:preview', (audio) => this.previewAudio(audio));

    EventBus.on('timeline:undo-performed', () => {
      this.updateClips();
      this.updateAudioClips();
      this.renderFrame();
    });
    EventBus.on('timeline:redo-performed', () => {
      this.updateClips();
      this.updateAudioClips();
      this.renderFrame();
    });

    window.addEventListener('resize', () => this.setupCanvas());
  }

  setupCanvas() {
    const wrapperRect = this.previewWrapper.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    let width = wrapperRect.width;
    let height = wrapperRect.height;
    
    if (width <= 0 || height <= 0) {
      width = 800;
      height = 450;
    }

    this.canvasElement.width = width * dpr;
    this.canvasElement.height = height * dpr;
    this.canvasElement.style.width = width + 'px';
    this.canvasElement.style.height = height + 'px';
    this.canvasCtx.setTransform(1, 0, 0, 1, 0, 0);
    this.canvasCtx.scale(dpr, dpr);

    this.renderFrame();
  }

  previewAudio(audio) {
    const tempAudio = document.createElement('audio');
    tempAudio.src = audio.url;
    tempAudio.controls = true;
    tempAudio.style.position = 'fixed';
    tempAudio.style.bottom = '20px';
    tempAudio.style.right = '20px';
    tempAudio.style.zIndex = '9999';
    document.body.appendChild(tempAudio);
    tempAudio.play().catch(e => console.warn('Audio preview failed:', e));
    
    tempAudio.addEventListener('ended', () => {
      tempAudio.remove();
    });
    
    setTimeout(() => {
      if (document.body.contains(tempAudio)) {
        tempAudio.remove();
      }
    }, 60000);
  }

  updateAudioClips() {
    if (!window.__timelineManager || !audioManager) return;
    
    const activeAudioClips = window.__timelineManager.getActiveAudioClipsAtTime(this.currentTime);
    
    for (const [id, clip] of this.activeAudioClips) {
      const isStillActive = activeAudioClips.some(c => c.id === id);
      if (!isStillActive) {
        audioManager.stopAudioClip(clip);
        this.activeAudioClips.delete(id);
      }
    }
    
    for (const clip of activeAudioClips) {
      if (!clip.muted) {
        if (!this.activeAudioClips.has(clip.id)) {
          this.activeAudioClips.set(clip.id, clip);
        }
        
        const clipLocalTime = this.currentTime - clip.startTime + clip.trimStart;
        if (clip.element && Math.abs(clip.element.currentTime - clipLocalTime) > 0.1) {
          clip.element.currentTime = clamp(clipLocalTime, clip.trimStart, clip.trimEnd);
        }
        
        if (this.isPlaying) {
          audioManager.playAudioClip(clip);
          audioManager.applyFadeEffect(clip, this.currentTime);
        }
      }
    }
  }

  stopAllAudioClips() {
    for (const [id, clip] of this.activeAudioClips) {
      audioManager.stopAudioClip(clip);
    }
    this.activeAudioClips.clear();
  }

  setupInteractionHandlers() {
    this.canvasElement.addEventListener('mousedown', (e) => {
      if (textManager.handleMouseDown(e, this.canvasElement)) {
        e.preventDefault();
      }
    });

    this.canvasElement.addEventListener('mousemove', (e) => {
      if (textManager.handleMouseMove(e, this.canvasElement)) {
        e.preventDefault();
        this.canvasElement.style.cursor = 'move';
      } else {
        this.canvasElement.style.cursor = 'default';
      }
    });

    this.canvasElement.addEventListener('mouseup', () => {
      textManager.handleMouseUp();
    });

    this.canvasElement.addEventListener('mouseleave', () => {
      textManager.handleMouseUp();
    });

    this.canvasElement.addEventListener('wheel', (e) => {
      if (textManager.handleWheel(e, this.canvasElement)) {
        e.preventDefault();
      }
    }, { passive: false });
  }

  setupEventListeners() {
    this.playBtn.addEventListener('click', () => this.togglePlay());
    this.prevBtn.addEventListener('click', () => this.stepFrame(-1));
    this.nextBtn.addEventListener('click', () => this.stepFrame(1));

    this.scrubberTrack.addEventListener('mousedown', (e) => this.startScrubbing(e));
    document.addEventListener('mousemove', (e) => this.handleScrubbing(e));
    document.addEventListener('mouseup', () => this.stopScrubbing());

    this.videoElement.addEventListener('timeupdate', () => this.onVideoTimeUpdate());
    this.videoElement.addEventListener('ended', () => this.onVideoEnded());
    this.videoElement.addEventListener('loadedmetadata', () => this.onVideoLoaded());

    document.addEventListener('keydown', (e) => {
      if (document.activeElement.tagName === 'INPUT') return;
      
      if (e.code === 'Space') {
        e.preventDefault();
        this.togglePlay();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        this.seekTo(Math.max(0, this.currentTime - (e.shiftKey ? 5 : 1)));
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        this.seekTo(Math.min(this.totalDuration, this.currentTime + (e.shiftKey ? 5 : 1)));
      }
    });
  }

  updateClips() {
    if (window.__timelineManager) {
      this.activeClips = window.__timelineManager.getClips();
      this.totalDuration = window.__timelineManager.getTotalDuration();
      this.updateDuration(this.totalDuration);
    }

    if (this.activeClips.length > 0) {
      this.previewOverlay.classList.add('hidden');
      const activeClipsAtTime = this.getActiveClipsAtTime(this.currentTime);
      if (activeClipsAtTime.length > 0 && !this.isPlaying) {
        this.loadClipForPlayback(activeClipsAtTime[0]);
      }
    } else {
      this.previewOverlay.classList.remove('hidden');
    }

    this.renderFrame();
  }

  onClipSelected(clip) {
    this.currentClip = clip;
    this.renderFrame();
  }

  previewMaterial(material) {
    this.videoElement.src = material.url;
    this.videoElement.currentTime = 0;
    this.videoElement.muted = false;
    this.currentClip = null;
    this.totalDuration = material.duration;
    this.updateDuration(material.duration);
    this.previewOverlay.classList.add('hidden');
    this.play();
  }

  previewClip(clip) {
    this.currentClip = clip;
    this.videoElement.src = clip.material.url;
    this.videoElement.currentTime = clip.trimStart;
    this.currentTime = clip.startTime;
    this.previewOverlay.classList.add('hidden');
    this.play();
  }

  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  play() {
    if (this.activeClips.length === 0 && !this.videoElement.src) {
      return;
    }

    this.isPlaying = true;
    this.playBtn.textContent = '⏸';

    audioManager.resumeContext();

    this.videoElement.play().catch(e => console.warn('Playback failed:', e));
    this.updateAudioClips();
    this.startRenderLoop();
    EventBus.emit('player:play');
  }

  pause() {
    this.isPlaying = false;
    this.playBtn.textContent = '▶';
    this.videoElement.pause();
    this.stopAllAudioClips();
    this.stopRenderLoop();
    EventBus.emit('player:pause');
  }

  loadClipForPlayback(clip) {
    const clipLocalTime = this.currentTime - clip.startTime + clip.trimStart;
    const targetTime = clamp(clipLocalTime, clip.trimStart, clip.trimEnd);
    
    if (this.videoElement.src !== clip.material.url) {
      this.videoElement.src = clip.material.url;
      this.videoElement.load();
      
      const onLoaded = () => {
        try {
          this.videoElement.currentTime = targetTime;
        } catch (e) {
          console.warn('Failed to set video time:', e);
        }
        this.renderFrame();
        this.videoElement.removeEventListener('loadedmetadata', onLoaded);
        this.videoElement.removeEventListener('canplay', onLoaded);
      };
      
      this.videoElement.addEventListener('loadedmetadata', onLoaded);
      this.videoElement.addEventListener('canplay', onLoaded);
      
      setTimeout(() => {
        if (this.videoElement.readyState >= 1) {
          onLoaded();
        }
      }, 200);
    } else {
      if (Math.abs(this.videoElement.currentTime - targetTime) > 0.1) {
        try {
          this.videoElement.currentTime = targetTime;
        } catch (e) {
          console.warn('Failed to set video time:', e);
        }
      }
    }
  }

  getActiveClipsAtTime(time) {
    if (!window.__timelineManager) return [];
    return window.__timelineManager.getActiveClipsAtTime(time);
  }

  getPreviousClip(clip, allClips) {
    const sorted = [...allClips].sort((a, b) => a.startTime - b.startTime);
    const index = sorted.findIndex(c => c.id === clip.id);
    return index > 0 ? sorted[index - 1] : null;
  }

  seekTo(time) {
    this.currentTime = clamp(time, 0, this.totalDuration);
    this.updateTimeDisplay();
    this.updateScrubber();

    const activeClips = this.getActiveClipsAtTime(this.currentTime);
    if (activeClips.length > 0) {
      const topClip = activeClips[0];
      this.loadClipForPlayback(topClip);
    } else {
      this.videoElement.pause();
    }

    this.updateAudioClips();
    this.renderFrame();
    EventBus.emit('player:seek', this.currentTime);
  }

  stepFrame(direction) {
    const frameTime = 1 / 30;
    this.seekTo(clamp(this.currentTime + direction * frameTime, 0, this.totalDuration));
  }

  startRenderLoop() {
    const loop = () => {
      if (!this.isPlaying) return;
      
      this.updateFromVideo();
      this.renderFrame();
      this.animationFrameId = requestAnimationFrame(loop);
    };
    this.animationFrameId = requestAnimationFrame(loop);
  }

  stopRenderLoop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  updateFromVideo() {
    if (!this.videoElement.readyState) return;

    const activeClips = this.getActiveClipsAtTime(this.currentTime);
    
    if (activeClips.length > 0) {
      const topClip = activeClips[0];
      const videoTime = this.videoElement.currentTime;
      const clipLocalTime = videoTime - topClip.trimStart;
      const newTime = topClip.startTime + clipLocalTime;

      if (newTime >= topClip.endTime - 0.05) {
        const nextClips = this.getActiveClipsAtTime(topClip.endTime + 0.01);
        if (nextClips.length > 0) {
          this.switchToNextClip(nextClips[0], topClip);
          return;
        } else {
          this.currentTime = this.totalDuration;
          this.updateTimeDisplay();
          this.updateScrubber();
          EventBus.emit('player:timeupdate', this.currentTime);
          this.pause();
          setTimeout(() => {
            this.seekTo(0);
          }, 500);
          return;
        }
      } else {
        this.currentTime = clamp(newTime, 0, this.totalDuration);
      }

      const track = window.__timelineManager?.getTracks().find(t => t.id === topClip.trackId);
      if (track && !track.muted && !topClip.muted) {
        this.videoElement.volume = clamp(topClip.volume * this.videoVolume, 0, 1);
        this.applyVideoAudioFade(topClip);
      } else {
        this.videoElement.volume = 0;
      }
    } else {
      this.currentTime = Math.min(this.currentTime + 1/30, this.totalDuration);
    }

    this.updateAudioClips();
    
    this.updateTimeDisplay();
    this.updateScrubber();
    EventBus.emit('player:timeupdate', this.currentTime);
  }

  applyVideoAudioFade(clip) {
    const clipProgress = (this.currentTime - clip.startTime) / (clip.endTime - clip.startTime);
    let gainMultiplier = 1;

    if (clip.fadeIn > 0 && clipProgress < clip.fadeIn / (clip.endTime - clip.startTime)) {
      gainMultiplier = clipProgress / (clip.fadeIn / (clip.endTime - clip.startTime));
    } else if (clip.fadeOut > 0 && clipProgress > 1 - clip.fadeOut / (clip.endTime - clip.startTime)) {
      gainMultiplier = (1 - clipProgress) / (clip.fadeOut / (clip.endTime - clip.startTime));
    }

    this.videoElement.volume = clamp(clip.volume * this.videoVolume * gainMultiplier, 0, 1);
  }

  async switchToNextClip(nextClip, currentClip) {
    if (this.isSwitchingClips) return;
    this.isSwitchingClips = true;

    this.videoElement.pause();
    this.stopRenderLoop();

    const wasPlaying = this.isPlaying;
    this.currentTime = nextClip.startTime;

    const clipLocalTime = nextClip.trimStart;
    
    if (this.videoElement.src !== nextClip.material.url) {
      this.videoElement.src = nextClip.material.url;
      
      await new Promise((resolve) => {
        const onCanPlay = () => {
          this.videoElement.removeEventListener('canplay', onCanPlay);
          resolve();
        };
        this.videoElement.addEventListener('canplay', onCanPlay);
        this.videoElement.load();
      });
    }

    this.videoElement.currentTime = clipLocalTime;
    
    await new Promise(resolve => setTimeout(resolve, 50));
    
    this.updateTimeDisplay();
    this.updateScrubber();
    EventBus.emit('player:timeupdate', this.currentTime);

    this.isSwitchingClips = false;

    if (wasPlaying) {
      this.videoElement.play().catch(e => console.warn('Playback after switch failed:', e));
      this.startRenderLoop();
    }
  }

  onVideoTimeUpdate() {
    if (!this.isPlaying) {
      this.renderFrame();
    }
  }

  onVideoEnded() {
    if (this.currentClip) {
      const nextClips = this.getActiveClipsAtTime(this.currentClip.endTime + 0.01);
      if (nextClips.length > 0) {
        this.currentTime = nextClips[0].startTime;
        this.loadClipForPlayback(nextClips[0]);
        this.videoElement.play();
      } else {
        this.pause();
      }
    }
  }

  onVideoLoaded() {
    this.renderFrame();
  }

  renderFrame() {
    const width = this.canvasElement.width / window.devicePixelRatio;
    const height = this.canvasElement.height / window.devicePixelRatio;

    this.canvasCtx.fillStyle = '#000';
    this.canvasCtx.fillRect(0, 0, width, height);

    const activeClips = this.getActiveClipsAtTime(this.currentTime);
    
    for (const clip of activeClips) {
      this.renderClip(clip, width, height);
    }

    if (window.__textManager) {
      const activeItems = window.__textManager.getActiveItems(this.currentTime);
      for (const item of activeItems) {
        const track = window.__timelineManager?.getTracks().find(t => t.id === item.trackId);
        if (track && track.hidden) continue;
        
        window.__textManager.renderItem(this.canvasCtx, item, this.currentTime, width, height);
      }
    }
  }

  renderClip(clip, width, height) {
    if (this.videoElement.readyState < 2 || this.videoElement.videoWidth === 0) {
      if (this.videoElement.readyState < 2) {
        const retryRender = () => {
          if (this.videoElement.readyState >= 2 && this.videoElement.videoWidth > 0) {
            this.renderFrame();
          } else if (this.videoElement.readyState < 2) {
            setTimeout(retryRender, 50);
          }
        };
        setTimeout(retryRender, 30);
      }
      return;
    }

    const transitionInfo = transitionManager.isInTransition(clip, this.currentTime);
    
    if (transitionInfo && transitionInfo.transition) {
      const allClips = window.__timelineManager?.getClips() || [];
      const prevClip = this.getPreviousClip(clip, allClips);
      
      if (prevClip && transitionInfo.transition.type !== 'none') {
        this.renderWithTransition(prevClip, clip, transitionInfo, width, height);
        return;
      }
    }

    this.drawVideoFrame(clip, width, height);
    this.applyClipFilters(clip, width, height);
    this.applyFadeEffect(clip, width, height);
  }

  drawVideoFrame(clip, width, height) {
    this.canvasCtx.save();
    
    const centerX = width / 2;
    const centerY = height / 2;
    
    this.canvasCtx.translate(centerX, centerY);
    this.canvasCtx.rotate((clip.rotation * Math.PI) / 180);
    this.canvasCtx.translate(-centerX, -centerY);

    let drawWidth = this.videoElement.videoWidth;
    let drawHeight = this.videoElement.videoHeight;
    const aspectRatio = getAspectRatio(clip.aspectRatio);

    let sx = 0, sy = 0, sWidth = drawWidth, sHeight = drawHeight;

    if (aspectRatio) {
      const videoAspect = drawWidth / drawHeight;
      if (videoAspect > aspectRatio) {
        sWidth = drawHeight * aspectRatio;
        sx = (drawWidth - sWidth) / 2;
      } else {
        sHeight = drawWidth / aspectRatio;
        sy = (drawHeight - sHeight) / 2;
      }
    }

    let scaledWidth, scaledHeight;
    if (clip.rotation % 180 !== 0) {
      scaledWidth = Math.min(width, sHeight * (width / height));
      scaledHeight = Math.min(height, sWidth * (height / width));
      const temp = scaledWidth;
      scaledWidth = scaledHeight;
      scaledHeight = temp;
    } else {
      scaledWidth = Math.min(width, sWidth * (height / sHeight));
      scaledHeight = Math.min(height, sHeight * (width / sWidth));
      
      if (sWidth / sHeight > width / height) {
        scaledWidth = width;
        scaledHeight = width * (sHeight / sWidth);
      } else {
        scaledHeight = height;
        scaledWidth = height * (sWidth / sHeight);
      }
    }

    const drawX = (width - scaledWidth) / 2;
    const drawY = (height - scaledHeight) / 2;

    try {
      this.canvasCtx.drawImage(
        this.videoElement,
        sx, sy, sWidth, sHeight,
        drawX, drawY, scaledWidth, scaledHeight
      );
    } catch (e) {
      console.warn('Frame render failed:', e);
    }

    this.canvasCtx.restore();
  }

  applyFadeEffect(clip, width, height) {
    if (clip.fadeIn > 0 || clip.fadeOut > 0) {
      const clipDuration = clip.endTime - clip.startTime;
      const clipProgress = (this.currentTime - clip.startTime) / clipDuration;
      let opacity = 1;

      if (clip.fadeIn > 0 && clipProgress < clip.fadeIn / clipDuration) {
        opacity = clipProgress / (clip.fadeIn / clipDuration);
      } else if (clip.fadeOut > 0 && clipProgress > 1 - clip.fadeOut / clipDuration) {
        opacity = (1 - clipProgress) / (clip.fadeOut / clipDuration);
      }

      if (opacity < 1) {
        this.canvasCtx.fillStyle = `rgba(0, 0, 0, ${1 - opacity})`;
        this.canvasCtx.fillRect(0, 0, width, height);
      }
    }
  }

  renderWithTransition(prevClip, nextClip, transitionInfo, width, height) {
    this.drawVideoFrame(nextClip, width, height);
    this.applyClipFilters(nextClip, width, height);
    this.applyFadeEffect(nextClip, width, height);

    const dpr = window.devicePixelRatio || 1;
    const actualWidth = this.canvasElement.width;
    const actualHeight = this.canvasElement.height;
    const progress = transitionInfo.progress;
    const transitionType = transitionInfo.transition.type;

    this.canvasCtx.save();
    this.canvasCtx.setTransform(1, 0, 0, 1, 0, 0);

    if (transitionType === 'fade') {
      const alpha = Math.abs(progress - 0.5) * 2;
      this.canvasCtx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
      this.canvasCtx.fillRect(0, 0, actualWidth, actualHeight);
    } else if (transitionType === 'flash') {
      const alpha = 1 - Math.abs(progress - 0.5) * 2;
      this.canvasCtx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      this.canvasCtx.fillRect(0, 0, actualWidth, actualHeight);
    } else if (transitionType === 'slideLeft') {
      const offset = actualWidth * (1 - progress);
      this.canvasCtx.fillStyle = '#000';
      this.canvasCtx.fillRect(0, 0, offset, actualHeight);
    } else if (transitionType === 'slideRight') {
      const offset = actualWidth * progress;
      this.canvasCtx.fillStyle = '#000';
      this.canvasCtx.fillRect(offset, 0, actualWidth - offset, actualHeight);
    } else if (transitionType === 'slideUp') {
      const offset = actualHeight * (1 - progress);
      this.canvasCtx.fillStyle = '#000';
      this.canvasCtx.fillRect(0, 0, actualWidth, offset);
    } else if (transitionType === 'slideDown') {
      const offset = actualHeight * progress;
      this.canvasCtx.fillStyle = '#000';
      this.canvasCtx.fillRect(0, offset, actualWidth, actualHeight - offset);
    } else if (transitionType === 'dissolve') {
      const alpha = progress;
      this.canvasCtx.fillStyle = `rgba(0, 0, 0, ${alpha * 0.3})`;
      this.canvasCtx.fillRect(0, 0, actualWidth, actualHeight);
    } else if (transitionType === 'wipe') {
      const wipeWidth = actualWidth * progress;
      this.canvasCtx.fillStyle = '#000';
      this.canvasCtx.fillRect(0, 0, wipeWidth, actualHeight);
    } else if (transitionType === 'circle') {
      const maxRadius = Math.sqrt(actualWidth * actualWidth + actualHeight * actualHeight) / 2;
      const radius = maxRadius * progress;
      this.canvasCtx.save();
      this.canvasCtx.beginPath();
      this.canvasCtx.rect(0, 0, actualWidth, actualHeight);
      this.canvasCtx.arc(actualWidth / 2, actualHeight / 2, radius, 0, Math.PI * 2, true);
      this.canvasCtx.closePath();
      this.canvasCtx.fillStyle = '#000';
      this.canvasCtx.fill();
      this.canvasCtx.restore();
    } else if (transitionType === 'zoom') {
      const scale = 1 + progress * 0.3;
      const alpha = 1 - progress;
      this.canvasCtx.fillStyle = `rgba(0, 0, 0, ${(1 - alpha) * 0.5})`;
      this.canvasCtx.fillRect(0, 0, actualWidth, actualHeight);
    } else if (transitionType === 'flip') {
      const alpha = Math.abs(Math.cos(progress * Math.PI));
      this.canvasCtx.fillStyle = `rgba(0, 0, 0, ${1 - alpha})`;
      this.canvasCtx.fillRect(0, 0, actualWidth, actualHeight);
    }

    this.canvasCtx.restore();
  }

  applyClipFilters(clip, width, height) {
    if (filterManager) {
      const dpr = window.devicePixelRatio || 1;
      const actualWidth = this.canvasElement.width;
      const actualHeight = this.canvasElement.height;
      
      this.canvasCtx.save();
      this.canvasCtx.setTransform(1, 0, 0, 1, 0, 0);
      
      filterManager.applyFilters(this.canvasCtx, actualWidth, actualHeight, clip, this.currentTime);
      
      this.canvasCtx.restore();
    }
  }

  startScrubbing(e) {
    this.isScrubbing = true;
    this.wasPlaying = this.isPlaying;
    if (this.isPlaying) this.pause();
    this.handleScrubbing(e);
  }

  handleScrubbing(e) {
    if (!this.isScrubbing) return;
    
    const rect = this.scrubberTrack.getBoundingClientRect();
    const x = clamp(e.clientX - rect.left, 0, rect.width);
    const progress = x / rect.width;
    this.seekTo(progress * this.totalDuration);
  }

  stopScrubbing() {
    if (this.isScrubbing && this.wasPlaying) {
      this.play();
    }
    this.isScrubbing = false;
  }

  updateTimeDisplay() {
    this.currentTimeEl.textContent = formatTime(this.currentTime);
  }

  updateDuration(duration) {
    this.totalDuration = duration;
    this.totalTimeEl.textContent = formatTime(duration);
  }

  updateScrubber() {
    if (this.totalDuration === 0) return;
    
    const progress = (this.currentTime / this.totalDuration) * 100;
    this.scrubberProgress.style.width = progress + '%';
    this.scrubberHandle.style.left = progress + '%';
  }

  getCurrentTime() {
    return this.currentTime;
  }

  getDuration() {
    return this.totalDuration;
  }
}

export const videoPlayer = new VideoPlayer();
