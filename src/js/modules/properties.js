import { EventBus, formatTime, clamp } from './utils.js';

class PropertiesPanel {
  constructor() {
    this.noSelection = document.getElementById('no-selection');
    this.propertiesContent = document.getElementById('properties-content');
    this.currentClip = null;

    this.propName = document.getElementById('prop-name');
    this.propDuration = document.getElementById('prop-duration');
    this.propResolution = document.getElementById('prop-resolution');
    this.propRotation = document.getElementById('prop-rotation');

    this.volumeSlider = document.getElementById('prop-volume');
    this.volumeValue = document.getElementById('volume-value');
    this.muteBtn = document.getElementById('btn-mute');

    this.fadeInInput = document.getElementById('prop-fadein');
    this.fadeOutInput = document.getElementById('prop-fadeout');

    this.rotateBtns = document.querySelectorAll('.rotate-btn');
    this.aspectBtns = document.querySelectorAll('.aspect-btn');

    this.trimStartInput = document.getElementById('trim-start');
    this.trimEndInput = document.getElementById('trim-end');
    this.setStartBtn = document.getElementById('btn-set-start');
    this.setEndBtn = document.getElementById('btn-set-end');
    this.applyTrimBtn = document.getElementById('btn-apply-trim');

    this.splitBtn = document.getElementById('btn-split');
    this.deleteBtn = document.getElementById('btn-delete');

    this.init();
  }

  init() {
    this.setupEventListeners();

    EventBus.on('clip:selected', (clip) => this.onClipSelected(clip));
    EventBus.on('clip:updated', (clip) => {
      if (clip && this.currentClip && clip.id === this.currentClip.id) {
        this.updateClip(clip);
      }
    });
  }

  setupEventListeners() {
    this.volumeSlider.addEventListener('input', (e) => {
      if (!this.currentClip) return;
      const volume = parseInt(e.target.value) / 100;
      this.volumeValue.textContent = e.target.value;
      EventBus.emit('clip:update-property', {
        clipId: this.currentClip.id,
        property: 'volume',
        value: volume
      });
    });

    this.muteBtn.addEventListener('click', () => {
      if (!this.currentClip) return;
      const isMuted = !this.currentClip.muted;
      this.muteBtn.textContent = isMuted ? '🔇' : '🔊';
      EventBus.emit('clip:update-property', {
        clipId: this.currentClip.id,
        property: 'muted',
        value: isMuted
      });
    });

    this.fadeInInput.addEventListener('change', (e) => {
      if (!this.currentClip) return;
      const value = clamp(parseFloat(e.target.value) || 0, 0, this.currentClip.endTime - this.currentClip.startTime);
      e.target.value = value;
      EventBus.emit('clip:update-property', {
        clipId: this.currentClip.id,
        property: 'fadeIn',
        value: value
      });
    });

    this.fadeOutInput.addEventListener('change', (e) => {
      if (!this.currentClip) return;
      const value = clamp(parseFloat(e.target.value) || 0, 0, this.currentClip.endTime - this.currentClip.startTime);
      e.target.value = value;
      EventBus.emit('clip:update-property', {
        clipId: this.currentClip.id,
        property: 'fadeOut',
        value: value
      });
    });

    this.rotateBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (!this.currentClip) return;
        const rotation = parseInt(btn.dataset.rotate);
        const newRotation = (this.currentClip.rotation + rotation) % 360;
        EventBus.emit('clip:update-property', {
          clipId: this.currentClip.id,
          property: 'rotation',
          value: newRotation < 0 ? newRotation + 360 : newRotation
        });
      });
    });

    this.aspectBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (!this.currentClip) return;
        this.aspectBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        EventBus.emit('clip:update-property', {
          clipId: this.currentClip.id,
          property: 'aspectRatio',
          value: btn.dataset.ratio
        });
      });
    });

    this.setStartBtn.addEventListener('click', () => {
      if (!this.currentClip || !window.__videoPlayer) return;
      const currentTime = window.__videoPlayer.getCurrentTime();
      const clipLocalTime = currentTime - this.currentClip.startTime + this.currentClip.trimStart;
      this.trimStartInput.value = clamp(clipLocalTime, 0, this.currentClip.trimEnd - 0.1).toFixed(2);
    });

    this.setEndBtn.addEventListener('click', () => {
      if (!this.currentClip || !window.__videoPlayer) return;
      const currentTime = window.__videoPlayer.getCurrentTime();
      const clipLocalTime = currentTime - this.currentClip.startTime + this.currentClip.trimStart;
      this.trimEndInput.value = clamp(clipLocalTime, this.currentClip.trimStart + 0.1, this.currentClip.material.duration).toFixed(2);
    });

    this.applyTrimBtn.addEventListener('click', () => {
      if (!this.currentClip) return;
      const trimStart = parseFloat(this.trimStartInput.value);
      const trimEnd = parseFloat(this.trimEndInput.value);
      
      if (trimEnd <= trimStart) {
        EventBus.emit('toast:show', { message: '出点必须大于入点', type: 'error' });
        return;
      }

      EventBus.emit('clip:trim', {
        clipId: this.currentClip.id,
        trimStart: trimStart,
        trimEnd: trimEnd
      });
    });

    this.splitBtn.addEventListener('click', () => {
      if (!this.currentClip || !window.__videoPlayer) return;
      EventBus.emit('timeline:split', window.__videoPlayer.getCurrentTime());
    });

    this.deleteBtn.addEventListener('click', () => {
      if (!this.currentClip) return;
      EventBus.emit('clip:delete', this.currentClip.id);
    });
  }

  onClipSelected(clip) {
    this.currentClip = clip;

    if (!clip) {
      this.noSelection.style.display = 'flex';
      this.propertiesContent.style.display = 'none';
      return;
    }

    this.noSelection.style.display = 'none';
    this.propertiesContent.style.display = 'flex';
    this.updateClip(clip);
  }

  updateClip(clip) {
    if (!clip) return;
    this.currentClip = clip;

    this.propName.textContent = clip.material.name;
    this.propDuration.textContent = formatTime(clip.endTime - clip.startTime);
    this.propResolution.textContent = `${clip.material.width} × ${clip.material.height}`;
    this.propRotation.textContent = `${clip.rotation}°`;

    this.volumeSlider.value = Math.round(clip.volume * 100);
    this.volumeValue.textContent = Math.round(clip.volume * 100);
    this.muteBtn.textContent = clip.muted ? '🔇' : '🔊';

    this.fadeInInput.value = clip.fadeIn;
    this.fadeOutInput.value = clip.fadeOut;

    this.aspectBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.ratio === clip.aspectRatio);
    });

    this.trimStartInput.value = clip.trimStart.toFixed(2);
    this.trimEndInput.value = clip.trimEnd.toFixed(2);
    this.trimStartInput.max = (clip.trimEnd - 0.1).toFixed(2);
    this.trimEndInput.min = (clip.trimStart + 0.1).toFixed(2);
  }
}

export const propertiesPanel = new PropertiesPanel();
