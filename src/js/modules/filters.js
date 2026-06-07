import { EventBus } from './utils.js';

export const FILTERS = {
  none: {
    name: '无滤镜',
    icon: '🎯',
    apply: (ctx, width, height, params) => {}
  },
  vintage: {
    name: '复古',
    icon: '📜',
    apply: (ctx, width, height, params) => {
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        data[i] = Math.min(255, r * 0.9 + 40);
        data[i + 1] = Math.min(255, g * 0.7 + 20);
        data[i + 2] = Math.min(255, b * 0.5);
      }
      ctx.putImageData(imageData, 0, 0);
    }
  },
  grayscale: {
    name: '黑白',
    icon: '⬛',
    apply: (ctx, width, height, params) => {
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        data[i] = data[i + 1] = data[i + 2] = gray;
      }
      ctx.putImageData(imageData, 0, 0);
    }
  },
  sepia: {
    name: '怀旧',
    icon: '🏺',
    apply: (ctx, width, height, params) => {
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        data[i] = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
        data[i + 1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
        data[i + 2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
      }
      ctx.putImageData(imageData, 0, 0);
    }
  },
  film: {
    name: '胶片',
    icon: '🎞️',
    apply: (ctx, width, height, params) => {
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.min(255, data[i] * 1.1 - 10);
        data[i + 1] = Math.min(255, data[i + 1] * 1.05);
        data[i + 2] = Math.max(0, Math.min(255, data[i + 2] * 0.95 + 15));
        const grain = (Math.random() - 0.5) * 15;
        data[i] = Math.max(0, Math.min(255, data[i] + grain));
        data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + grain));
        data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + grain));
      }
      ctx.putImageData(imageData, 0, 0);
    }
  },
  beauty: {
    name: '美颜',
    icon: '💄',
    apply: (ctx, width, height, params) => {
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      const tempData = new Uint8ClampedArray(data);
      const kernelSize = 3;
      const half = Math.floor(kernelSize / 2);
      
      for (let y = half; y < height - half; y++) {
        for (let x = half; x < width - half; x++) {
          let r = 0, g = 0, b = 0, count = 0;
          for (let ky = -half; ky <= half; ky++) {
            for (let kx = -half; kx <= half; kx++) {
              const idx = ((y + ky) * width + (x + kx)) * 4;
              r += tempData[idx];
              g += tempData[idx + 1];
              b += tempData[idx + 2];
              count++;
            }
          }
          const idx = (y * width + x) * 4;
          data[idx] = r / count;
          data[idx + 1] = g / count;
          data[idx + 2] = b / count;
          data[idx] = Math.min(255, data[idx] * 1.1);
          data[idx + 1] = Math.min(255, data[idx + 1] * 1.05);
          data[idx + 2] = Math.min(255, data[idx + 2] * 1.1);
        }
      }
      ctx.putImageData(imageData, 0, 0);
    }
  },
  warm: {
    name: '暖色',
    icon: '🔥',
    apply: (ctx, width, height, params) => {
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.min(255, data[i] + 30);
        data[i + 1] = Math.min(255, data[i + 1] + 10);
        data[i + 2] = Math.max(0, data[i + 2] - 20);
      }
      ctx.putImageData(imageData, 0, 0);
    }
  },
  cool: {
    name: '冷色',
    icon: '❄️',
    apply: (ctx, width, height, params) => {
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.max(0, data[i] - 20);
        data[i + 1] = Math.min(255, data[i + 1] + 10);
        data[i + 2] = Math.min(255, data[i + 2] + 30);
      }
      ctx.putImageData(imageData, 0, 0);
    }
  },
  vivid: {
    name: '鲜艳',
    icon: '🌈',
    apply: (ctx, width, height, params) => {
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        data[i] = Math.min(255, avg + (data[i] - avg) * 1.5);
        data[i + 1] = Math.min(255, avg + (data[i + 1] - avg) * 1.5);
        data[i + 2] = Math.min(255, avg + (data[i + 2] - avg) * 1.5);
      }
      ctx.putImageData(imageData, 0, 0);
    }
  },
  dreamy: {
    name: '梦幻',
    icon: '✨',
    apply: (ctx, width, height, params) => {
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      const tempData = new Uint8ClampedArray(data);
      
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          let r = 0, g = 0, b = 0;
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const idx = ((y + ky) * width + (x + kx)) * 4;
              const weight = (ky === 0 && kx === 0) ? 4 : 1;
              r += tempData[idx] * weight;
              g += tempData[idx + 1] * weight;
              b += tempData[idx + 2] * weight;
            }
          }
          const idx = (y * width + x) * 4;
          data[idx] = Math.min(255, r / 12 + 20);
          data[idx + 1] = Math.min(255, g / 12 + 20);
          data[idx + 2] = Math.min(255, b / 12 + 30);
        }
      }
      ctx.putImageData(imageData, 0, 0);
    }
  },
  dramatic: {
    name: '戏剧',
    icon: '🎭',
    apply: (ctx, width, height, params) => {
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        for (let c = 0; c < 3; c++) {
          const val = data[i + c];
          data[i + c] = val > 128 ? Math.min(255, val * 1.2) : Math.max(0, val * 0.8);
        }
      }
      ctx.putImageData(imageData, 0, 0);
    }
  },
  noir: {
    name: ' noir',
    icon: '🕶️',
    apply: (ctx, width, height, params) => {
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        const contrast = gray > 128 ? Math.min(255, gray * 1.3) : Math.max(0, gray * 0.7);
        data[i] = data[i + 1] = data[i + 2] = contrast;
      }
      ctx.putImageData(imageData, 0, 0);
    }
  },
  sunset: {
    name: '日落',
    icon: '🌅',
    apply: (ctx, width, height, params) => {
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.min(255, data[i] * 1.2 + 20);
        data[i + 1] = Math.min(255, data[i + 1] * 0.9 + 10);
        data[i + 2] = Math.max(0, data[i + 2] * 0.7);
      }
      ctx.putImageData(imageData, 0, 0);
    }
  },
  ocean: {
    name: '海洋',
    icon: '🌊',
    apply: (ctx, width, height, params) => {
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.max(0, data[i] * 0.8);
        data[i + 1] = Math.min(255, data[i + 1] * 1.1 + 10);
        data[i + 2] = Math.min(255, data[i + 2] * 1.3 + 20);
      }
      ctx.putImageData(imageData, 0, 0);
    }
  },
  forest: {
    name: '森林',
    icon: '🌲',
    apply: (ctx, width, height, params) => {
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.max(0, data[i] * 0.85);
        data[i + 1] = Math.min(255, data[i + 1] * 1.2 + 15);
        data[i + 2] = Math.max(0, data[i + 2] * 0.9);
      }
      ctx.putImageData(imageData, 0, 0);
    }
  },
  cyberpunk: {
    name: '赛博朋克',
    icon: '🤖',
    apply: (ctx, width, height, params) => {
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.min(255, data[i] * 1.3 + 10);
        data[i + 1] = Math.max(0, data[i + 1] * 0.7);
        data[i + 2] = Math.min(255, data[i + 2] * 1.4 + 20);
      }
      ctx.putImageData(imageData, 0, 0);
    }
  },
  lomo: {
    name: 'LOMO',
    icon: '📷',
    apply: (ctx, width, height, params) => {
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      const centerX = width / 2;
      const centerY = height / 2;
      const maxDist = Math.sqrt(centerX * centerX + centerY * centerY);
      
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
          const vignette = 1 - (dist / maxDist) * 0.6;
          
          data[idx] = Math.min(255, data[idx] * 1.1 * vignette + 10);
          data[idx + 1] = Math.min(255, data[idx + 1] * 0.95 * vignette);
          data[idx + 2] = Math.min(255, data[idx + 2] * 1.05 * vignette);
        }
      }
      ctx.putImageData(imageData, 0, 0);
    }
  },
  polaroid: {
    name: '宝丽来',
    icon: '🖼️',
    apply: (ctx, width, height, params) => {
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.min(255, data[i] * 0.95 + 25);
        data[i + 1] = Math.min(255, data[i + 1] * 0.9 + 25);
        data[i + 2] = Math.min(255, data[i + 2] * 0.85 + 30);
      }
      ctx.putImageData(imageData, 0, 0);
      
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 8;
      ctx.strokeRect(4, 4, width - 8, height - 8);
    }
  },
  comic: {
    name: '漫画',
    icon: '🎨',
    apply: (ctx, width, height, params) => {
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        for (let c = 0; c < 3; c++) {
          const val = data[i + c];
          if (val < 64) data[i + c] = 32;
          else if (val < 128) data[i + c] = 96;
          else if (val < 192) data[i + c] = 160;
          else data[i + c] = 224;
        }
      }
      ctx.putImageData(imageData, 0, 0);
    }
  },
  sketch: {
    name: '素描',
    icon: '✏️',
    apply: (ctx, width, height, params) => {
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      const gray = new Float32Array(width * height);
      
      for (let i = 0, j = 0; i < data.length; i += 4, j++) {
        gray[j] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      }
      
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = y * width + x;
          const gx = -gray[idx - width - 1] - 2 * gray[idx - 1] - gray[idx + width - 1]
                   + gray[idx - width + 1] + 2 * gray[idx + 1] + gray[idx + width + 1];
          const gy = -gray[idx - width - 1] - 2 * gray[idx - width] - gray[idx - width + 1]
                   + gray[idx + width - 1] + 2 * gray[idx + width] + gray[idx + width + 1];
          const edge = Math.sqrt(gx * gx + gy * gy);
          const val = Math.max(0, 255 - edge * 2);
          const dataIdx = idx * 4;
          data[dataIdx] = data[dataIdx + 1] = data[dataIdx + 2] = val;
        }
      }
      ctx.putImageData(imageData, 0, 0);
    }
  },
  invert: {
    name: '反转',
    icon: '🔄',
    apply: (ctx, width, height, params) => {
      const imageData = ctx.getImageData(0, 0, width, height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 255 - data[i];
        data[i + 1] = 255 - data[i + 1];
        data[i + 2] = 255 - data[i + 2];
      }
      ctx.putImageData(imageData, 0, 0);
    }
  }
};

export const COLOR_ADJUSTMENT = {
  apply: (ctx, width, height, params) => {
    const { brightness = 0, contrast = 0, saturation = 0, temperature = 0 } = params;
    
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    
    const brightnessFactor = 1 + brightness / 100;
    const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));
    
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i], g = data[i + 1], b = data[i + 2];
      
      r = contrastFactor * (r - 128) + 128;
      g = contrastFactor * (g - 128) + 128;
      b = contrastFactor * (b - 128) + 128;
      
      r *= brightnessFactor;
      g *= brightnessFactor;
      b *= brightnessFactor;
      
      if (temperature > 0) {
        r += temperature * 0.5;
        g += temperature * 0.2;
      } else {
        b += Math.abs(temperature) * 0.5;
        g += Math.abs(temperature) * 0.2;
      }
      
      if (saturation !== 0) {
        const gray = r * 0.299 + g * 0.587 + b * 0.114;
        const sat = 1 + saturation / 100;
        r = gray + (r - gray) * sat;
        g = gray + (g - gray) * sat;
        b = gray + (b - gray) * sat;
      }
      
      data[i] = Math.max(0, Math.min(255, r));
      data[i + 1] = Math.max(0, Math.min(255, g));
      data[i + 2] = Math.max(0, Math.min(255, b));
    }
    
    ctx.putImageData(imageData, 0, 0);
  }
};

class FilterManager {
  constructor() {
    this.currentFilter = 'none';
    this.colorParams = {
      brightness: 0,
      contrast: 0,
      saturation: 0,
      temperature: 0
    };
    this.filterTimeRange = null;
    this.init();
  }

  init() {
    EventBus.on('filter:apply', ({ filterName, clipId }) => {
      this.currentFilter = filterName;
      if (clipId && window.__timelineManager) {
        window.__timelineManager.updateClipProperty(clipId, 'filter', filterName);
      }
      EventBus.emit('player:update');
    });

    EventBus.on('filter:color-adjust', ({ params, clipId }) => {
      this.colorParams = { ...this.colorParams, ...params };
      if (clipId && window.__timelineManager) {
        window.__timelineManager.updateClipProperty(clipId, 'colorAdjust', { ...this.colorParams });
      }
      EventBus.emit('player:update');
    });

    EventBus.on('filter:set-time-range', ({ startTime, endTime, clipId }) => {
      this.filterTimeRange = { startTime, endTime };
      if (clipId && window.__timelineManager) {
        window.__timelineManager.updateClipProperty(clipId, 'filterTimeRange', { startTime, endTime });
      }
    });

    EventBus.on('filter:reset', () => {
      this.currentFilter = 'none';
      this.colorParams = { brightness: 0, contrast: 0, saturation: 0, temperature: 0 };
      this.filterTimeRange = null;
      EventBus.emit('player:update');
    });
  }

  applyFilters(ctx, width, height, clip, currentTime) {
    if (!clip) return;

    const filterName = clip.filter || this.currentFilter;
    const colorAdjust = clip.colorAdjust || this.colorParams;
    const timeRange = clip.filterTimeRange || this.filterTimeRange;

    if (timeRange) {
      const clipLocalTime = currentTime - clip.startTime;
      if (clipLocalTime < timeRange.startTime || clipLocalTime > timeRange.endTime) {
        return;
      }
    }

    if (filterName && FILTERS[filterName]) {
      FILTERS[filterName].apply(ctx, width, height, {});
    }

    if (colorAdjust && (colorAdjust.brightness !== 0 || colorAdjust.contrast !== 0 || 
        colorAdjust.saturation !== 0 || colorAdjust.temperature !== 0)) {
      COLOR_ADJUSTMENT.apply(ctx, width, height, colorAdjust);
    }
  }

  getFilters() {
    return Object.entries(FILTERS).map(([key, value]) => ({
      id: key,
      name: value.name,
      icon: value.icon
    }));
  }

  getCurrentFilter() {
    return this.currentFilter;
  }

  getColorParams() {
    return { ...this.colorParams };
  }
}

export const filterManager = new FilterManager();
