import { EventBus } from './utils.js';

export const TRANSITIONS = {
  none: {
    name: '无转场',
    icon: '➡️',
    duration: 0,
    apply: (ctx, fromCanvas, toCanvas, progress, width, height) => {
      ctx.drawImage(toCanvas, 0, 0, width, height);
    }
  },
  fade: {
    name: '淡入淡出',
    icon: '🌅',
    duration: 1,
    apply: (ctx, fromCanvas, toCanvas, progress, width, height) => {
      ctx.globalAlpha = 1 - progress;
      ctx.drawImage(fromCanvas, 0, 0, width, height);
      ctx.globalAlpha = progress;
      ctx.drawImage(toCanvas, 0, 0, width, height);
      ctx.globalAlpha = 1;
    }
  },
  flashWhite: {
    name: '闪白',
    icon: '⚡',
    duration: 0.5,
    apply: (ctx, fromCanvas, toCanvas, progress, width, height) => {
      const flashIntensity = Math.sin(progress * Math.PI);
      
      if (progress < 0.5) {
        ctx.drawImage(fromCanvas, 0, 0, width, height);
      } else {
        ctx.drawImage(toCanvas, 0, 0, width, height);
      }
      
      ctx.fillStyle = `rgba(255, 255, 255, ${flashIntensity})`;
      ctx.fillRect(0, 0, width, height);
    }
  },
  slideLeft: {
    name: '向左滑动',
    icon: '⬅️',
    duration: 1,
    apply: (ctx, fromCanvas, toCanvas, progress, width, height) => {
      const offset = progress * width;
      ctx.drawImage(fromCanvas, -offset, 0, width, height);
      ctx.drawImage(toCanvas, width - offset, 0, width, height);
    }
  },
  slideRight: {
    name: '向右滑动',
    icon: '➡️',
    duration: 1,
    apply: (ctx, fromCanvas, toCanvas, progress, width, height) => {
      const offset = progress * width;
      ctx.drawImage(fromCanvas, offset, 0, width, height);
      ctx.drawImage(toCanvas, -width + offset, 0, width, height);
    }
  },
  slideUp: {
    name: '向上滑动',
    icon: '⬆️',
    duration: 1,
    apply: (ctx, fromCanvas, toCanvas, progress, width, height) => {
      const offset = progress * height;
      ctx.drawImage(fromCanvas, 0, -offset, width, height);
      ctx.drawImage(toCanvas, 0, height - offset, width, height);
    }
  },
  slideDown: {
    name: '向下滑动',
    icon: '⬇️',
    duration: 1,
    apply: (ctx, fromCanvas, toCanvas, progress, width, height) => {
      const offset = progress * height;
      ctx.drawImage(fromCanvas, 0, offset, width, height);
      ctx.drawImage(toCanvas, 0, -height + offset, width, height);
    }
  },
  dissolve: {
    name: '溶解',
    icon: '✨',
    duration: 1,
    apply: (ctx, fromCanvas, toCanvas, progress, width, height) => {
      ctx.drawImage(fromCanvas, 0, 0, width, height);
      
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = width;
      tempCanvas.height = height;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.drawImage(toCanvas, 0, 0, width, height);
      
      const imageData = tempCtx.getImageData(0, 0, width, height);
      const data = imageData.data;
      
      for (let i = 0; i < data.length; i += 4) {
        const x = (i / 4) % width;
        const y = Math.floor((i / 4) / width);
        const noise = Math.random();
        
        if (noise > progress) {
          data[i + 3] = 0;
        }
      }
      
      tempCtx.putImageData(imageData, 0, 0);
      ctx.drawImage(tempCanvas, 0, 0, width, height);
    }
  },
  wipe: {
    name: '擦除',
    icon: '🧹',
    duration: 1,
    apply: (ctx, fromCanvas, toCanvas, progress, width, height) => {
      ctx.drawImage(fromCanvas, 0, 0, width, height);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, width * progress, height);
      ctx.clip();
      ctx.drawImage(toCanvas, 0, 0, width, height);
      ctx.restore();
    }
  },
  circle: {
    name: '圆形展开',
    icon: '⭕',
    duration: 1,
    apply: (ctx, fromCanvas, toCanvas, progress, width, height) => {
      ctx.drawImage(fromCanvas, 0, 0, width, height);
      ctx.save();
      ctx.beginPath();
      const maxRadius = Math.sqrt(width * width + height * height) / 2;
      ctx.arc(width / 2, height / 2, maxRadius * progress, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(toCanvas, 0, 0, width, height);
      ctx.restore();
    }
  },
  zoom: {
    name: '缩放',
    icon: '🔍',
    duration: 1,
    apply: (ctx, fromCanvas, toCanvas, progress, width, height) => {
      if (progress < 0.5) {
        const scale = 1 + progress;
        const scaledWidth = width * scale;
        const scaledHeight = height * scale;
        ctx.globalAlpha = 1 - progress * 2;
        ctx.drawImage(
          fromCanvas,
          (width - scaledWidth) / 2,
          (height - scaledHeight) / 2,
          scaledWidth,
          scaledHeight
        );
      } else {
        const scale = 2 - progress;
        const scaledWidth = width * scale;
        const scaledHeight = height * scale;
        ctx.globalAlpha = (progress - 0.5) * 2;
        ctx.drawImage(
          toCanvas,
          (width - scaledWidth) / 2,
          (height - scaledHeight) / 2,
          scaledWidth,
          scaledHeight
        );
      }
      ctx.globalAlpha = 1;
    }
  },
  flip: {
    name: '翻转',
    icon: '🔄',
    duration: 1,
    apply: (ctx, fromCanvas, toCanvas, progress, width, height) => {
      ctx.save();
      
      if (progress < 0.5) {
        const scaleX = Math.cos(progress * Math.PI);
        ctx.translate(width / 2, 0);
        ctx.scale(scaleX, 1);
        ctx.translate(-width / 2, 0);
        ctx.drawImage(fromCanvas, 0, 0, width, height);
      } else {
        const scaleX = Math.cos(progress * Math.PI);
        ctx.translate(width / 2, 0);
        ctx.scale(scaleX, 1);
        ctx.translate(-width / 2, 0);
        ctx.drawImage(toCanvas, 0, 0, width, height);
      }
      
      ctx.restore();
    }
  }
};

class TransitionManager {
  constructor() {
    this.transitions = new Map();
    this.tempCanvas1 = document.createElement('canvas');
    this.tempCanvas2 = document.createElement('canvas');
    this.tempCtx1 = this.tempCanvas1.getContext('2d');
    this.tempCtx2 = this.tempCanvas2.getContext('2d');
    this.init();
  }

  init() {
    EventBus.on('transition:add', ({ fromClipId, toClipId, transitionType, duration }) => {
      this.addTransition(fromClipId, toClipId, transitionType, duration);
    });

    EventBus.on('transition:remove', ({ fromClipId, toClipId }) => {
      this.removeTransition(fromClipId, toClipId);
    });

    EventBus.on('transition:update', ({ fromClipId, toClipId, data }) => {
      this.updateTransition(fromClipId, toClipId, data);
    });
  }

  addTransition(fromClipId, toClipId, transitionType = 'fade', duration = 1) {
    const key = this.getKey(fromClipId, toClipId);
    const transition = {
      id: `transition_${Date.now()}`,
      fromClipId,
      toClipId,
      type: transitionType,
      duration: duration,
      createdAt: Date.now()
    };
    
    this.transitions.set(key, transition);
    EventBus.emit('transition:added', transition);
    
    if (window.__timelineManager) {
      const toClip = window.__timelineManager.clips.find(c => c.id === toClipId);
      if (toClip) {
        window.__timelineManager.updateClipProperty(toClipId, 'transitionIn', {
          type: transitionType,
          duration,
          fromClipId
        });
      }
    }
    
    return transition;
  }

  removeTransition(fromClipId, toClipId) {
    const key = this.getKey(fromClipId, toClipId);
    const transition = this.transitions.get(key);
    if (transition) {
      this.transitions.delete(key);
      EventBus.emit('transition:removed', transition);
      
      if (window.__timelineManager) {
        const toClip = window.__timelineManager.clips.find(c => c.id === toClipId);
        if (toClip && toClip.transitionIn) {
          window.__timelineManager.updateClipProperty(toClipId, 'transitionIn', null);
        }
      }
    }
  }

  updateTransition(fromClipId, toClipId, data) {
    const key = this.getKey(fromClipId, toClipId);
    const transition = this.transitions.get(key);
    if (transition) {
      Object.assign(transition, data);
      EventBus.emit('transition:updated', transition);
      
      if (window.__timelineManager && data.type && data.duration) {
        window.__timelineManager.updateClipProperty(toClipId, 'transitionIn', {
          type: data.type,
          duration: data.duration,
          fromClipId
        });
      }
    }
  }

  getTransition(fromClipId, toClipId) {
    const key = this.getKey(fromClipId, toClipId);
    return this.transitions.get(key) || null;
  }

  getTransitionForClip(clipId) {
    for (const [key, transition] of this.transitions) {
      if (transition.toClipId === clipId) {
        return transition;
      }
    }
    return null;
  }

  getKey(fromClipId, toClipId) {
    return `${fromClipId}->${toClipId}`;
  }

  isInTransition(clip, currentTime) {
    if (!clip || !clip.transitionIn) return null;
    
    const transitionStart = clip.startTime;
    const transitionEnd = clip.startTime + clip.transitionIn.duration;
    
    if (currentTime >= transitionStart && currentTime < transitionEnd) {
      const progress = (currentTime - transitionStart) / clip.transitionIn.duration;
      return {
        transition: clip.transitionIn,
        progress: Math.max(0, Math.min(1, progress))
      };
    }
    
    return null;
  }

  applyTransition(ctx, fromCanvas, toCanvas, transitionType, progress, width, height) {
    const transition = TRANSITIONS[transitionType] || TRANSITIONS.fade;
    transition.apply(ctx, fromCanvas, toCanvas, progress, width, height);
  }

  renderClipToCanvas(clip, canvas, ctx, width, height, videoElement) {
    if (!videoElement || !videoElement.readyState || videoElement.videoWidth === 0) {
      return false;
    }

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    
    const centerX = width / 2;
    const centerY = height / 2;
    
    ctx.translate(centerX, centerY);
    ctx.rotate((clip.rotation * Math.PI) / 180);
    ctx.translate(-centerX, -centerY);

    let drawWidth = videoElement.videoWidth;
    let drawHeight = videoElement.videoHeight;

    let scaledWidth = Math.min(width, drawWidth * (height / drawHeight));
    let scaledHeight = Math.min(height, drawHeight * (width / drawWidth));
    
    if (drawWidth / drawHeight > width / height) {
      scaledWidth = width;
      scaledHeight = width * (drawHeight / drawWidth);
    } else {
      scaledHeight = height;
      scaledWidth = height * (drawWidth / drawHeight);
    }
    
    const drawX = (width - scaledWidth) / 2;
    const drawY = (height - scaledHeight) / 2;

    try {
      ctx.drawImage(
        videoElement,
        drawX, drawY, scaledWidth, scaledHeight
      );
    } catch (e) {
      console.warn('Transition frame render failed:', e);
      ctx.restore();
      return false;
    }

    ctx.restore();
    return true;
  }

  getTransitions() {
    return Array.from(this.transitions.values());
  }

  getAvailableTransitions() {
    return Object.entries(TRANSITIONS).map(([key, value]) => ({
      id: key,
      name: value.name,
      icon: value.icon,
      defaultDuration: value.duration
    }));
  }

  detectTransitions(clips) {
    const sortedClips = [...clips].sort((a, b) => a.startTime - b.startTime);
    
    for (let i = 0; i < sortedClips.length - 1; i++) {
      const currentClip = sortedClips[i];
      const nextClip = sortedClips[i + 1];
      
      const gap = nextClip.startTime - currentClip.endTime;
      
      if (Math.abs(gap) < 0.1 && !nextClip.transitionIn) {
        this.addTransition(currentClip.id, nextClip.id, 'fade', 1);
      }
    }
  }
}

export const transitionManager = new TransitionManager();
