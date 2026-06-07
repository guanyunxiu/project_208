export const formatTime = (seconds) => {
  if (!isFinite(seconds) || seconds < 0) return '00:00.00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
};

export const formatFileSize = (bytes) => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
};

export const generateId = () => {
  return 'id_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
};

export const clamp = (value, min, max) => {
  return Math.max(min, Math.min(max, value));
};

export const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

export const throttle = (func, limit) => {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

export const showToast = (message, type = 'info', duration = 3000) => {
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.className = `toast show ${type}`;
  toast.textContent = message;

  setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
};

export const getAspectRatio = (ratio) => {
  const ratios = {
    'original': null,
    '16:9': 16 / 9,
    '9:16': 9 / 16,
    '1:1': 1,
    '4:3': 4 / 3
  };
  return ratios[ratio] || null;
};

export const parseResolution = (resStr, originalWidth, originalHeight) => {
  if (resStr === 'original') {
    return { width: originalWidth, height: originalHeight };
  }
  const [width, height] = resStr.split('x').map(Number);
  return { width, height };
};

export const createVideoThumbnail = (videoElement, width = 160, height = 90) => {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    const drawThumbnail = () => {
      try {
        ctx.drawImage(videoElement, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        resolve(dataUrl);
      } catch (e) {
        resolve(null);
      }
    };

    if (videoElement.readyState >= 2) {
      drawThumbnail();
    } else {
      videoElement.addEventListener('loadeddata', drawThumbnail, { once: true });
    }
  });
};

export const loadVideoMetadata = (file) => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
      window.URL.revokeObjectURL(video.src);
      resolve({
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight
      });
    };

    video.onerror = () => {
      window.URL.revokeObjectURL(video.src);
      reject(new Error('无法加载视频元数据'));
    };

    video.src = window.URL.createObjectURL(file);
  });
};

export const EventBus = {
  events: {},

  on(event, callback) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(callback);
    return () => this.off(event, callback);
  },

  off(event, callback) {
    if (!this.events[event]) return;
    this.events[event] = this.events[event].filter(cb => cb !== callback);
  },

  emit(event, data) {
    if (!this.events[event]) return;
    this.events[event].forEach(callback => callback(data));
  }
};
