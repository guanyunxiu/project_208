import { EventBus, formatTime, getAspectRatio, clamp } from './utils.js';

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

    this.audioContext = null;
    this.audioSource = null;
    this.gainNode = null;

    this.animationFrameId = null;
    this.isScrubbing = false;

    this.init();
  }

  init() {
    this.setupCanvas();
    this.setupEventListeners();
    this.setupAudio();

    EventBus.on('clip:added', () => this.updateClips());
    EventBus.on('clip:deleted', () => this.updateClips());
    EventBus.on('clip:updated', () => this.updateClips());
    EventBus.on('clip:selected', (clip) => this.onClipSelected(clip));
    EventBus.on('clip:preview', (clip) => this.previewClip(clip));
    EventBus.on('timeline:seek', (time) => this.seekTo(time));
    EventBus.on('timeline:duration', (duration) => this.updateDuration(duration));
    EventBus.on('material:preview', (material) => this.previewMaterial(material));
    EventBus.on('player:update', () => this.renderFrame());

    window.addEventListener('resize', () => this.setupCanvas());
  }

  setupCanvas() {
    const wrapperRect = this.previewWrapper.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    this.canvasElement.width = wrapperRect.width * dpr;
    this.canvasElement.height = wrapperRect.height * dpr;
    this.canvasElement.style.width = wrapperRect.width + 'px';
    this.canvasElement.style.height = wrapperRect.height + 'px';
    this.canvasCtx.scale(dpr, dpr);

    this.renderFrame();
  }

  setupAudio() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
    } catch (e) {
      console.warn('Web Audio API not supported:', e);
    }
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

    if (this.audioContext?.state === 'suspended') {
      this.audioContext.resume();
    }

    const activeClip = this.getActiveClipAtTime(this.currentTime);
    if (activeClip) {
      this.loadClipForPlayback(activeClip);
    }

    this.videoElement.play().catch(e => console.warn('Playback failed:', e));
    this.startRenderLoop();
    EventBus.emit('player:play');
  }

  pause() {
    this.isPlaying = false;
    this.playBtn.textContent = '▶';
    this.videoElement.pause();
    this.stopRenderLoop();
    EventBus.emit('player:pause');
  }

  loadClipForPlayback(clip) {
    const clipLocalTime = this.currentTime - clip.startTime + clip.trimStart;
    
    if (this.videoElement.src !== clip.material.url) {
      this.videoElement.src = clip.material.url;
    }
    
    if (Math.abs(this.videoElement.currentTime - clipLocalTime) > 0.1) {
      this.videoElement.currentTime = clamp(clipLocalTime, clip.trimStart, clip.trimEnd);
    }

    this.applyClipEffects(clip);
  }

  applyClipEffects(clip) {
    this.videoElement.volume = clip.muted ? 0 : clip.volume;
    
    if (this.gainNode) {
      const clipProgress = (this.currentTime - clip.startTime) / (clip.endTime - clip.startTime);
      let gainMultiplier = 1;

      if (clip.fadeIn > 0 && clipProgress < clip.fadeIn / (clip.endTime - clip.startTime)) {
        gainMultiplier = clipProgress / (clip.fadeIn / (clip.endTime - clip.startTime));
      } else if (clip.fadeOut > 0 && clipProgress > 1 - clip.fadeOut / (clip.endTime - clip.startTime)) {
        gainMultiplier = (1 - clipProgress) / (clip.fadeOut / (clip.endTime - clip.startTime));
      }

      this.gainNode.gain.value = clamp(clip.muted ? 0 : clip.volume * gainMultiplier, 0, 2);
    }

    this.renderFrame();
  }

  getActiveClipAtTime(time) {
    return this.activeClips.find(clip => 
      time >= clip.startTime && time < clip.endTime
    );
  }

  seekTo(time) {
    this.currentTime = clamp(time, 0, this.totalDuration);
    this.updateTimeDisplay();
    this.updateScrubber();

    const activeClip = this.getActiveClipAtTime(this.currentTime);
    if (activeClip) {
      this.loadClipForPlayback(activeClip);
    } else {
      this.videoElement.pause();
    }

    this.renderFrame();
    EventBus.emit('timeline:seek', this.currentTime);
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

    const activeClip = this.getActiveClipAtTime(this.currentTime);
    if (activeClip) {
      const videoTime = this.videoElement.currentTime;
      const clipLocalTime = videoTime - activeClip.trimStart;
      const newTime = activeClip.startTime + clipLocalTime;

      if (newTime >= activeClip.endTime) {
        const nextClip = this.getActiveClipAtTime(activeClip.endTime + 0.01);
        if (nextClip) {
          this.currentTime = nextClip.startTime;
          this.loadClipForPlayback(nextClip);
        } else {
          this.pause();
          this.seekTo(0);
          return;
        }
      } else {
        this.currentTime = newTime;
      }

      this.applyClipEffects(activeClip);
    } else {
      this.currentTime = Math.min(this.currentTime + 1/30, this.totalDuration);
    }

    this.updateTimeDisplay();
    this.updateScrubber();
    EventBus.emit('player:timeupdate', this.currentTime);
  }

  onVideoTimeUpdate() {
    if (!this.isPlaying) {
      this.renderFrame();
    }
  }

  onVideoEnded() {
    if (this.currentClip) {
      const nextClip = this.getActiveClipAtTime(this.currentClip.endTime + 0.01);
      if (nextClip) {
        this.currentTime = nextClip.startTime;
        this.loadClipForPlayback(nextClip);
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

    if (!this.videoElement.readyState || this.videoElement.videoWidth === 0) {
      return;
    }

    const activeClip = this.currentClip || this.getActiveClipAtTime(this.currentTime);
    
    if (activeClip) {
      this.canvasCtx.save();
      
      const centerX = width / 2;
      const centerY = height / 2;
      
      this.canvasCtx.translate(centerX, centerY);
      this.canvasCtx.rotate((activeClip.rotation * Math.PI) / 180);
      this.canvasCtx.translate(-centerX, -centerY);

      let drawWidth = this.videoElement.videoWidth;
      let drawHeight = this.videoElement.videoHeight;
      const aspectRatio = getAspectRatio(activeClip.aspectRatio);

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
      if (activeClip.rotation % 180 !== 0) {
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

      if (activeClip.fadeIn > 0 || activeClip.fadeOut > 0) {
        const clipDuration = activeClip.endTime - activeClip.startTime;
        const clipProgress = (this.currentTime - activeClip.startTime) / clipDuration;
        let opacity = 1;

        if (activeClip.fadeIn > 0 && clipProgress < activeClip.fadeIn / clipDuration) {
          opacity = clipProgress / (activeClip.fadeIn / clipDuration);
        } else if (activeClip.fadeOut > 0 && clipProgress > 1 - activeClip.fadeOut / clipDuration) {
          opacity = (1 - clipProgress) / (activeClip.fadeOut / clipDuration);
        }

        if (opacity < 1) {
          this.canvasCtx.fillStyle = `rgba(0, 0, 0, ${1 - opacity})`;
          this.canvasCtx.fillRect(0, 0, width, height);
        }
      }
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
