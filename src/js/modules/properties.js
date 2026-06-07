import { EventBus, formatTime, clamp } from './utils.js';

class PropertiesPanel {
  constructor() {
    this.noSelection = document.getElementById('no-selection');
    this.clipProperties = document.getElementById('clip-properties');
    this.textProperties = document.getElementById('text-properties');
    this.stickerProperties = document.getElementById('sticker-properties');
    
    this.currentClip = null;
    this.currentTextItem = null;
    this.currentStickerItem = null;
    this.currentType = null;

    this.initClipElements();
    this.initTextElements();
    this.initStickerElements();
    this.init();
  }

  initClipElements() {
    this.clipPropName = document.getElementById('clip-prop-name');
    this.clipPropDuration = document.getElementById('clip-prop-duration');
    this.clipPropResolution = document.getElementById('clip-prop-resolution');
    this.clipPropRotation = document.getElementById('clip-prop-rotation');

    this.clipVolumeSlider = document.getElementById('clip-prop-volume');
    this.clipVolumeValue = document.getElementById('clip-volume-value');
    this.clipMuteBtn = document.getElementById('clip-btn-mute');

    this.clipFadeInInput = document.getElementById('clip-prop-fadein');
    this.clipFadeOutInput = document.getElementById('clip-prop-fadeout');

    this.clipRotateBtns = document.querySelectorAll('.rotate-btn');
    this.clipAspectBtns = document.querySelectorAll('.aspect-btn');

    this.clipTrimStartInput = document.getElementById('clip-trim-start');
    this.clipTrimEndInput = document.getElementById('clip-trim-end');
    this.clipSetStartBtn = document.getElementById('clip-btn-set-start');
    this.clipSetEndBtn = document.getElementById('clip-btn-set-end');
    this.clipApplyTrimBtn = document.getElementById('clip-btn-apply-trim');

    this.clipSplitBtn = document.getElementById('clip-btn-split');
    this.clipDeleteBtn = document.getElementById('clip-btn-delete');
  }

  initTextElements() {
    this.textContent = document.getElementById('text-content');
    this.textFontFamily = document.getElementById('text-font-family');
    this.textFontSize = document.getElementById('text-font-size');
    this.textFontSizeValue = document.getElementById('font-size-value');
    this.textColor = document.getElementById('text-color');
    this.textStrokeColor = document.getElementById('text-stroke-color');
    this.textStrokeWidth = document.getElementById('text-stroke-width');
    this.textStrokeWidthValue = document.getElementById('stroke-width-value');
    this.textShadowBlur = document.getElementById('text-shadow-blur');
    this.textShadowBlurValue = document.getElementById('shadow-blur-value');
    this.textAnimation = document.getElementById('text-animation');
    this.textAnimDuration = document.getElementById('text-anim-duration');
    this.textStartTime = document.getElementById('text-start-time');
    this.textEndTime = document.getElementById('text-end-time');
    this.textScale = document.getElementById('text-scale');
    this.textScaleValue = document.getElementById('text-scale-value');
    this.textRotation = document.getElementById('text-rotation');
    this.textRotationValue = document.getElementById('text-rotation-value');
    this.textOpacity = document.getElementById('text-opacity');
    this.textOpacityValue = document.getElementById('text-opacity-value');
    this.textBtnBold = document.getElementById('btn-bold');
    this.textBtnItalic = document.getElementById('btn-italic');
    this.textBtnDelete = document.getElementById('text-btn-delete');
  }

  initStickerElements() {
    this.stickerPropName = document.getElementById('sticker-prop-name');
    this.stickerPropSize = document.getElementById('sticker-prop-size');
    this.stickerStartTime = document.getElementById('sticker-start-time');
    this.stickerEndTime = document.getElementById('sticker-end-time');
    this.stickerScale = document.getElementById('sticker-scale');
    this.stickerScaleValue = document.getElementById('sticker-scale-value');
    this.stickerRotation = document.getElementById('sticker-rotation');
    this.stickerRotationValue = document.getElementById('sticker-rotation-value');
    this.stickerOpacity = document.getElementById('sticker-opacity');
    this.stickerOpacityValue = document.getElementById('sticker-opacity-value');
    this.stickerFadeIn = document.getElementById('sticker-fadein');
    this.stickerFadeOut = document.getElementById('sticker-fadeout');
    this.stickerBtnDelete = document.getElementById('sticker-btn-delete');
  }

  init() {
    this.setupClipEventListeners();
    this.setupTextEventListeners();
    this.setupStickerEventListeners();

    EventBus.on('clip:selected', (clip) => this.onClipSelected(clip));
    EventBus.on('clip:updated', (clip) => {
      if (clip && this.currentClip && clip.id === this.currentClip.id) {
        this.updateClip(clip);
      }
    });
    EventBus.on('text:selected', (item) => this.onTextSelected(item));
    EventBus.on('text:updated', (item) => {
      if (item && this.currentTextItem && item.id === this.currentTextItem.id) {
        this.updateTextItem(item);
      }
    });
    EventBus.on('sticker:selected', (item) => this.onStickerSelected(item));
    EventBus.on('sticker:updated', (item) => {
      if (item && this.currentStickerItem && item.id === this.currentStickerItem.id) {
        this.updateStickerItem(item);
      }
    });
    EventBus.on('selection:cleared', () => this.clearSelection());
  }

  setupClipEventListeners() {
    this.clipVolumeSlider.addEventListener('input', (e) => {
      if (!this.currentClip) return;
      const volume = parseInt(e.target.value) / 100;
      this.clipVolumeValue.textContent = e.target.value;
      EventBus.emit('clip:update-property', {
        clipId: this.currentClip.id,
        property: 'volume',
        value: volume
      });
    });

    this.clipMuteBtn.addEventListener('click', () => {
      if (!this.currentClip) return;
      const isMuted = !this.currentClip.muted;
      this.clipMuteBtn.textContent = isMuted ? '🔇' : '🔊';
      EventBus.emit('clip:update-property', {
        clipId: this.currentClip.id,
        property: 'muted',
        value: isMuted
      });
    });

    this.clipFadeInInput.addEventListener('change', (e) => {
      if (!this.currentClip) return;
      const value = clamp(parseFloat(e.target.value) || 0, 0, this.currentClip.endTime - this.currentClip.startTime);
      e.target.value = value;
      EventBus.emit('clip:update-property', {
        clipId: this.currentClip.id,
        property: 'fadeIn',
        value: value
      });
    });

    this.clipFadeOutInput.addEventListener('change', (e) => {
      if (!this.currentClip) return;
      const value = clamp(parseFloat(e.target.value) || 0, 0, this.currentClip.endTime - this.currentClip.startTime);
      e.target.value = value;
      EventBus.emit('clip:update-property', {
        clipId: this.currentClip.id,
        property: 'fadeOut',
        value: value
      });
    });

    this.clipRotateBtns.forEach(btn => {
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

    this.clipAspectBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (!this.currentClip) return;
        this.clipAspectBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        EventBus.emit('clip:update-property', {
          clipId: this.currentClip.id,
          property: 'aspectRatio',
          value: btn.dataset.ratio
        });
      });
    });

    this.clipSetStartBtn.addEventListener('click', () => {
      if (!this.currentClip || !window.__videoPlayer) return;
      const currentTime = window.__videoPlayer.getCurrentTime();
      const clipLocalTime = currentTime - this.currentClip.startTime + this.currentClip.trimStart;
      this.clipTrimStartInput.value = clamp(clipLocalTime, 0, this.currentClip.trimEnd - 0.1).toFixed(2);
    });

    this.clipSetEndBtn.addEventListener('click', () => {
      if (!this.currentClip || !window.__videoPlayer) return;
      const currentTime = window.__videoPlayer.getCurrentTime();
      const clipLocalTime = currentTime - this.currentClip.startTime + this.currentClip.trimStart;
      this.clipTrimEndInput.value = clamp(clipLocalTime, this.currentClip.trimStart + 0.1, this.currentClip.material.duration).toFixed(2);
    });

    this.clipApplyTrimBtn.addEventListener('click', () => {
      if (!this.currentClip) return;
      const trimStart = parseFloat(this.clipTrimStartInput.value);
      const trimEnd = parseFloat(this.clipTrimEndInput.value);
      
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

    this.clipSplitBtn.addEventListener('click', () => {
      if (!this.currentClip || !window.__videoPlayer) return;
      EventBus.emit('timeline:split', window.__videoPlayer.getCurrentTime());
    });

    this.clipDeleteBtn.addEventListener('click', () => {
      if (!this.currentClip) return;
      EventBus.emit('clip:delete', this.currentClip.id);
    });
  }

  setupTextEventListeners() {
    this.textContent.addEventListener('input', (e) => {
      if (!this.currentTextItem) return;
      EventBus.emit('text:update-property', {
        itemId: this.currentTextItem.id,
        property: 'text',
        value: e.target.value
      });
    });

    this.textFontFamily.addEventListener('change', (e) => {
      if (!this.currentTextItem) return;
      EventBus.emit('text:update-property', {
        itemId: this.currentTextItem.id,
        property: 'fontFamily',
        value: e.target.value
      });
    });

    this.textFontSize.addEventListener('input', (e) => {
      if (!this.currentTextItem) return;
      this.textFontSizeValue.textContent = e.target.value;
      EventBus.emit('text:update-property', {
        itemId: this.currentTextItem.id,
        property: 'fontSize',
        value: parseInt(e.target.value)
      });
    });

    this.textColor.addEventListener('input', (e) => {
      if (!this.currentTextItem) return;
      EventBus.emit('text:update-property', {
        itemId: this.currentTextItem.id,
        property: 'color',
        value: e.target.value
      });
    });

    this.textStrokeColor.addEventListener('input', (e) => {
      if (!this.currentTextItem) return;
      EventBus.emit('text:update-property', {
        itemId: this.currentTextItem.id,
        property: 'strokeColor',
        value: e.target.value
      });
    });

    this.textStrokeWidth.addEventListener('input', (e) => {
      if (!this.currentTextItem) return;
      this.textStrokeWidthValue.textContent = e.target.value;
      EventBus.emit('text:update-property', {
        itemId: this.currentTextItem.id,
        property: 'strokeWidth',
        value: parseInt(e.target.value)
      });
    });

    this.textShadowBlur.addEventListener('input', (e) => {
      if (!this.currentTextItem) return;
      this.textShadowBlurValue.textContent = e.target.value;
      EventBus.emit('text:update-property', {
        itemId: this.currentTextItem.id,
        property: 'shadowBlur',
        value: parseInt(e.target.value)
      });
    });

    this.textAnimation.addEventListener('change', (e) => {
      if (!this.currentTextItem) return;
      EventBus.emit('text:update-property', {
        itemId: this.currentTextItem.id,
        property: 'animation',
        value: e.target.value
      });
    });

    this.textAnimDuration.addEventListener('change', (e) => {
      if (!this.currentTextItem) return;
      EventBus.emit('text:update-property', {
        itemId: this.currentTextItem.id,
        property: 'animationDuration',
        value: parseFloat(e.target.value) || 1
      });
    });

    this.textStartTime.addEventListener('change', (e) => {
      if (!this.currentTextItem) return;
      const value = Math.max(0, parseFloat(e.target.value) || 0);
      e.target.value = value;
      EventBus.emit('text:update-property', {
        itemId: this.currentTextItem.id,
        property: 'startTime',
        value: value
      });
    });

    this.textEndTime.addEventListener('change', (e) => {
      if (!this.currentTextItem) return;
      const value = Math.max(parseFloat(this.textStartTime.value) + 0.1, parseFloat(e.target.value) || 0);
      e.target.value = value;
      EventBus.emit('text:update-property', {
        itemId: this.currentTextItem.id,
        property: 'endTime',
        value: value
      });
    });

    this.textScale.addEventListener('input', (e) => {
      if (!this.currentTextItem) return;
      this.textScaleValue.textContent = e.target.value;
      EventBus.emit('text:update-property', {
        itemId: this.currentTextItem.id,
        property: 'scale',
        value: parseInt(e.target.value) / 100
      });
    });

    this.textRotation.addEventListener('input', (e) => {
      if (!this.currentTextItem) return;
      this.textRotationValue.textContent = e.target.value;
      EventBus.emit('text:update-property', {
        itemId: this.currentTextItem.id,
        property: 'rotation',
        value: parseInt(e.target.value)
      });
    });

    this.textOpacity.addEventListener('input', (e) => {
      if (!this.currentTextItem) return;
      this.textOpacityValue.textContent = e.target.value;
      EventBus.emit('text:update-property', {
        itemId: this.currentTextItem.id,
        property: 'opacity',
        value: parseInt(e.target.value) / 100
      });
    });

    this.textBtnBold.addEventListener('click', () => {
      if (!this.currentTextItem) return;
      const newValue = !this.currentTextItem.bold;
      this.textBtnBold.classList.toggle('active', newValue);
      EventBus.emit('text:update-property', {
        itemId: this.currentTextItem.id,
        property: 'bold',
        value: newValue
      });
    });

    this.textBtnItalic.addEventListener('click', () => {
      if (!this.currentTextItem) return;
      const newValue = !this.currentTextItem.italic;
      this.textBtnItalic.classList.toggle('active', newValue);
      EventBus.emit('text:update-property', {
        itemId: this.currentTextItem.id,
        property: 'italic',
        value: newValue
      });
    });

    this.textBtnDelete.addEventListener('click', () => {
      if (!this.currentTextItem) return;
      EventBus.emit('text:delete', this.currentTextItem.id);
    });
  }

  setupStickerEventListeners() {
    this.stickerStartTime.addEventListener('change', (e) => {
      if (!this.currentStickerItem) return;
      const value = Math.max(0, parseFloat(e.target.value) || 0);
      e.target.value = value;
      EventBus.emit('sticker:update-property', {
        itemId: this.currentStickerItem.id,
        property: 'startTime',
        value: value
      });
    });

    this.stickerEndTime.addEventListener('change', (e) => {
      if (!this.currentStickerItem) return;
      const value = Math.max(parseFloat(this.stickerStartTime.value) + 0.1, parseFloat(e.target.value) || 0);
      e.target.value = value;
      EventBus.emit('sticker:update-property', {
        itemId: this.currentStickerItem.id,
        property: 'endTime',
        value: value
      });
    });

    this.stickerScale.addEventListener('input', (e) => {
      if (!this.currentStickerItem) return;
      this.stickerScaleValue.textContent = e.target.value;
      EventBus.emit('sticker:update-property', {
        itemId: this.currentStickerItem.id,
        property: 'scale',
        value: parseInt(e.target.value) / 100
      });
    });

    this.stickerRotation.addEventListener('input', (e) => {
      if (!this.currentStickerItem) return;
      this.stickerRotationValue.textContent = e.target.value;
      EventBus.emit('sticker:update-property', {
        itemId: this.currentStickerItem.id,
        property: 'rotation',
        value: parseInt(e.target.value)
      });
    });

    this.stickerOpacity.addEventListener('input', (e) => {
      if (!this.currentStickerItem) return;
      this.stickerOpacityValue.textContent = e.target.value;
      EventBus.emit('sticker:update-property', {
        itemId: this.currentStickerItem.id,
        property: 'opacity',
        value: parseInt(e.target.value) / 100
      });
    });

    this.stickerFadeIn.addEventListener('change', (e) => {
      if (!this.currentStickerItem) return;
      const duration = this.currentStickerItem.endTime - this.currentStickerItem.startTime;
      const value = clamp(parseFloat(e.target.value) || 0, 0, duration);
      e.target.value = value;
      EventBus.emit('sticker:update-property', {
        itemId: this.currentStickerItem.id,
        property: 'fadeIn',
        value: value
      });
    });

    this.stickerFadeOut.addEventListener('change', (e) => {
      if (!this.currentStickerItem) return;
      const duration = this.currentStickerItem.endTime - this.currentStickerItem.startTime;
      const value = clamp(parseFloat(e.target.value) || 0, 0, duration);
      e.target.value = value;
      EventBus.emit('sticker:update-property', {
        itemId: this.currentStickerItem.id,
        property: 'fadeOut',
        value: value
      });
    });

    this.stickerBtnDelete.addEventListener('click', () => {
      if (!this.currentStickerItem) return;
      EventBus.emit('sticker:delete', this.currentStickerItem.id);
    });
  }

  hideAllPanels() {
    this.noSelection.style.display = 'none';
    this.clipProperties.style.display = 'none';
    this.textProperties.style.display = 'none';
    this.stickerProperties.style.display = 'none';
  }

  clearSelection() {
    this.currentClip = null;
    this.currentTextItem = null;
    this.currentStickerItem = null;
    this.currentType = null;
    this.hideAllPanels();
    this.noSelection.style.display = 'flex';
  }

  onClipSelected(clip) {
    this.currentClip = clip;
    this.currentTextItem = null;
    this.currentStickerItem = null;
    this.currentType = 'clip';

    this.hideAllPanels();
    if (!clip) {
      this.noSelection.style.display = 'flex';
      return;
    }

    this.clipProperties.style.display = 'flex';
    this.updateClip(clip);
  }

  onTextSelected(item) {
    this.currentClip = null;
    this.currentTextItem = item;
    this.currentStickerItem = null;
    this.currentType = 'text';

    this.hideAllPanels();
    if (!item) {
      this.noSelection.style.display = 'flex';
      return;
    }

    this.textProperties.style.display = 'flex';
    this.updateTextItem(item);
  }

  onStickerSelected(item) {
    this.currentClip = null;
    this.currentTextItem = null;
    this.currentStickerItem = item;
    this.currentType = 'sticker';

    this.hideAllPanels();
    if (!item) {
      this.noSelection.style.display = 'flex';
      return;
    }

    this.stickerProperties.style.display = 'flex';
    this.updateStickerItem(item);
  }

  updateClip(clip) {
    if (!clip) return;
    this.currentClip = clip;

    this.clipPropName.textContent = clip.material.name;
    this.clipPropDuration.textContent = formatTime(clip.endTime - clip.startTime);
    this.clipPropResolution.textContent = `${clip.material.width} × ${clip.material.height}`;
    this.clipPropRotation.textContent = `${clip.rotation}°`;

    this.clipVolumeSlider.value = Math.round(clip.volume * 100);
    this.clipVolumeValue.textContent = Math.round(clip.volume * 100);
    this.clipMuteBtn.textContent = clip.muted ? '🔇' : '🔊';

    this.clipFadeInInput.value = clip.fadeIn;
    this.clipFadeOutInput.value = clip.fadeOut;

    this.clipAspectBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.ratio === clip.aspectRatio);
    });

    this.clipTrimStartInput.value = clip.trimStart.toFixed(2);
    this.clipTrimEndInput.value = clip.trimEnd.toFixed(2);
    this.clipTrimStartInput.max = (clip.trimEnd - 0.1).toFixed(2);
    this.clipTrimEndInput.min = (clip.trimStart + 0.1).toFixed(2);
  }

  updateTextItem(item) {
    if (!item) return;
    this.currentTextItem = item;

    this.textContent.value = item.text || '';
    this.textFontFamily.value = item.fontFamily || 'Arial';
    this.textFontSize.value = item.fontSize || 36;
    this.textFontSizeValue.textContent = item.fontSize || 36;
    this.textColor.value = item.color || '#ffffff';
    this.textStrokeColor.value = item.strokeColor || '#000000';
    this.textStrokeWidth.value = item.strokeWidth || 0;
    this.textStrokeWidthValue.textContent = item.strokeWidth || 0;
    this.textShadowBlur.value = item.shadowBlur || 0;
    this.textShadowBlurValue.textContent = item.shadowBlur || 0;
    this.textAnimation.value = item.animation || 'none';
    this.textAnimDuration.value = item.animationDuration || 1;
    this.textStartTime.value = item.startTime || 0;
    this.textEndTime.value = item.endTime || 10;
    this.textScale.value = Math.round((item.scale || 1) * 100);
    this.textScaleValue.textContent = Math.round((item.scale || 1) * 100);
    this.textRotation.value = item.rotation || 0;
    this.textRotationValue.textContent = item.rotation || 0;
    this.textOpacity.value = Math.round((item.opacity || 1) * 100);
    this.textOpacityValue.textContent = Math.round((item.opacity || 1) * 100);
    this.textBtnBold.classList.toggle('active', item.bold || false);
    this.textBtnItalic.classList.toggle('active', item.italic || false);
  }

  updateStickerItem(item) {
    if (!item) return;
    this.currentStickerItem = item;

    this.stickerPropName.textContent = item.name || '贴纸';
    this.stickerPropSize.textContent = item.originalWidth && item.originalHeight 
      ? `${item.originalWidth} × ${item.originalHeight}` 
      : '-';
    this.stickerStartTime.value = item.startTime || 0;
    this.stickerEndTime.value = item.endTime || 10;
    this.stickerScale.value = Math.round((item.scale || 1) * 100);
    this.stickerScaleValue.textContent = Math.round((item.scale || 1) * 100);
    this.stickerRotation.value = item.rotation || 0;
    this.stickerRotationValue.textContent = item.rotation || 0;
    this.stickerOpacity.value = Math.round((item.opacity || 1) * 100);
    this.stickerOpacityValue.textContent = Math.round((item.opacity || 1) * 100);
    this.stickerFadeIn.value = item.fadeIn || 0;
    this.stickerFadeOut.value = item.fadeOut || 0;
  }
}

export const propertiesPanel = new PropertiesPanel();
