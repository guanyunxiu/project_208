import { EventBus, generateId, clamp } from './utils.js';

export const TEXT_ANIMATIONS = {
  none: {
    name: '无动画',
    apply: (ctx, text, time, duration) => 1
  },
  fadeIn: {
    name: '淡入',
    apply: (ctx, text, time, duration) => {
      const progress = Math.min(1, time / (text.animationDuration || 1));
      return progress;
    }
  },
  fadeOut: {
    name: '淡出',
    apply: (ctx, text, time, duration) => {
      const progress = Math.min(1, (duration - time) / (text.animationDuration || 1));
      return progress;
    }
  },
  fadeInOut: {
    name: '淡入淡出',
    apply: (ctx, text, time, duration) => {
      const animDuration = text.animationDuration || 1;
      if (time < animDuration) {
        return time / animDuration;
      } else if (time > duration - animDuration) {
        return (duration - time) / animDuration;
      }
      return 1;
    }
  },
  scrollLeft: {
    name: '向左滚动',
    apply: (ctx, text, time, duration) => {
      const scrollProgress = time / duration;
      text._scrollOffset = -scrollProgress * (ctx.measureText(text.content).width + 200);
      return 1;
    }
  },
  scrollRight: {
    name: '向右滚动',
    apply: (ctx, text, time, duration) => {
      const scrollProgress = time / duration;
      text._scrollOffset = scrollProgress * (ctx.measureText(text.content).width + 200);
      return 1;
    }
  },
  bounce: {
    name: '弹跳',
    apply: (ctx, text, time, duration) => {
      const bounce = Math.abs(Math.sin(time * 4)) * 10;
      text._bounceOffset = -bounce;
      return 1;
    }
  },
  typewriter: {
    name: '打字机',
    apply: (ctx, text, time, duration) => {
      const charsPerSecond = text.typewriterSpeed || 10;
      const visibleChars = Math.floor(time * charsPerSecond);
      text._visibleChars = Math.min(visibleChars, text.content.length);
      return 1;
    }
  }
};

class TextManager {
  constructor() {
    this.texts = [];
    this.stickers = [];
    this.selectedItemId = null;
    this.isDragging = false;
    this.isResizing = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.dragItem = null;
    
    this.stickerFileInput = document.createElement('input');
    this.stickerFileInput.type = 'file';
    this.stickerFileInput.accept = 'image/*';
    this.stickerFileInput.multiple = true;
    this.stickerFileInput.hidden = true;
    document.body.appendChild(this.stickerFileInput);
    
    this.init();
  }

  init() {
    EventBus.on('text:add', (textData) => this.addText(textData));
    EventBus.on('text:update', ({ id, data }) => this.updateText(id, data));
    EventBus.on('text:delete', (id) => this.deleteText(id));
    EventBus.on('sticker:add', (stickerData) => this.addSticker(stickerData));
    EventBus.on('sticker:update', ({ id, data }) => this.updateSticker(id, data));
    EventBus.on('sticker:delete', (id) => this.deleteSticker(id));
    EventBus.on('item:select', (id) => this.selectItem(id));
    EventBus.on('sticker:import', () => this.stickerFileInput.click());
    
    EventBus.on('text:update-property', ({ itemId, property, value }) => {
      this.updateItemProperty(itemId, property, value);
    });
    EventBus.on('sticker:update-property', ({ itemId, property, value }) => {
      this.updateItemProperty(itemId, property, value);
    });
    
    this.stickerFileInput.addEventListener('change', (e) => this.handleStickerFiles(e));
  }

  addText(textData = {}) {
    const text = {
      id: generateId(),
      type: 'text',
      content: textData.content || '双击编辑文字',
      x: textData.x || 100,
      y: textData.y || 100,
      fontSize: textData.fontSize || 36,
      fontFamily: textData.fontFamily || 'Arial',
      fontWeight: textData.fontWeight || 'normal',
      fontStyle: textData.fontStyle || 'normal',
      color: textData.color || '#ffffff',
      strokeColor: textData.strokeColor || '#000000',
      strokeWidth: textData.strokeWidth || 0,
      shadowColor: textData.shadowColor || 'rgba(0,0,0,0.5)',
      shadowBlur: textData.shadowBlur || 0,
      shadowOffsetX: textData.shadowOffsetX || 2,
      shadowOffsetY: textData.shadowOffsetY || 2,
      textAlign: textData.textAlign || 'left',
      rotation: textData.rotation || 0,
      opacity: textData.opacity || 1,
      scale: textData.scale || 1,
      animation: textData.animation || 'none',
      animationDuration: textData.animationDuration || 1,
      typewriterSpeed: textData.typewriterSpeed || 10,
      startTime: textData.startTime || 0,
      endTime: textData.endTime || 10,
      trackId: textData.trackId || 'text-track',
      zIndex: this.texts.length
    };
    
    this.texts.push(text);
    EventBus.emit('text:added', text);
    EventBus.emit('timeline:item-added', text);
    this.selectItem(text.id);
    return text;
  }

  updateText(id, data) {
    const text = this.texts.find(t => t.id === id);
    if (!text) return null;
    
    Object.assign(text, data);
    EventBus.emit('text:updated', text);
    EventBus.emit('timeline:item-updated', text);
    EventBus.emit('player:update');
    return text;
  }

  deleteText(id) {
    const index = this.texts.findIndex(t => t.id === id);
    if (index === -1) return;
    
    const text = this.texts[index];
    this.texts.splice(index, 1);
    
    if (this.selectedItemId === id) {
      this.selectedItemId = null;
      EventBus.emit('item:selected', null);
    }
    
    EventBus.emit('text:deleted', text);
    EventBus.emit('timeline:item-deleted', text);
    EventBus.emit('player:update');
  }

  async handleStickerFiles(e) {
    const files = Array.from(e.target.files);
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      
      const url = URL.createObjectURL(file);
      const img = new Image();
      
      await new Promise((resolve) => {
        img.onload = resolve;
        img.src = url;
      });
      
      this.addSticker({
        url,
        width: img.width,
        height: img.height,
        name: file.name
      });
    }
    e.target.value = '';
  }

  addSticker(stickerData = {}) {
    const sticker = {
      id: generateId(),
      type: 'sticker',
      url: stickerData.url,
      name: stickerData.name || '贴纸',
      x: stickerData.x || 100,
      y: stickerData.y || 100,
      width: stickerData.width || 100,
      height: stickerData.height || 100,
      originalWidth: stickerData.width || 100,
      originalHeight: stickerData.height || 100,
      rotation: stickerData.rotation || 0,
      opacity: stickerData.opacity || 1,
      scale: stickerData.scale || 1,
      startTime: stickerData.startTime || 0,
      endTime: stickerData.endTime || 10,
      trackId: stickerData.trackId || 'sticker-track',
      zIndex: this.stickers.length
    };
    
    this.stickers.push(sticker);
    EventBus.emit('sticker:added', sticker);
    EventBus.emit('timeline:item-added', sticker);
    this.selectItem(sticker.id);
    return sticker;
  }

  updateSticker(id, data) {
    const sticker = this.stickers.find(s => s.id === id);
    if (!sticker) return null;
    
    Object.assign(sticker, data);
    EventBus.emit('sticker:updated', sticker);
    EventBus.emit('timeline:item-updated', sticker);
    EventBus.emit('player:update');
    return sticker;
  }

  deleteSticker(id) {
    const index = this.stickers.findIndex(s => s.id === id);
    if (index === -1) return;
    
    const sticker = this.stickers[index];
    this.stickers.splice(index, 1);
    
    if (sticker.url && sticker.url.startsWith('blob:')) {
      URL.revokeObjectURL(sticker.url);
    }
    
    if (this.selectedItemId === id) {
      this.selectedItemId = null;
      EventBus.emit('item:selected', null);
    }
    
    EventBus.emit('sticker:deleted', sticker);
    EventBus.emit('timeline:item-deleted', sticker);
    EventBus.emit('player:update');
  }

  selectItem(id) {
    this.selectedItemId = id;
    const item = this.getItemById(id);
    EventBus.emit('item:selected', item);
    EventBus.emit('player:update');
  }

  getItemById(id) {
    return this.texts.find(t => t.id === id) || this.stickers.find(s => s.id === id);
  }

  getActiveItems(currentTime) {
    const items = [];
    
    for (const text of this.texts) {
      if (currentTime >= text.startTime && currentTime <= text.endTime) {
        items.push({ ...text });
      }
    }
    
    for (const sticker of this.stickers) {
      if (currentTime >= sticker.startTime && currentTime <= sticker.endTime) {
        items.push({ ...sticker });
      }
    }
    
    return items.sort((a, b) => a.zIndex - b.zIndex);
  }

  renderItem(ctx, item, currentTime, canvasWidth, canvasHeight) {
    if (item.type === 'text') {
      this.renderText(ctx, item, currentTime);
    } else if (item.type === 'sticker') {
      this.renderSticker(ctx, item, currentTime);
    }
    
    if (item.id === this.selectedItemId) {
      this.renderSelectionBox(ctx, item);
    }
  }

  renderText(ctx, text, currentTime) {
    const localTime = currentTime - text.startTime;
    const duration = text.endTime - text.startTime;
    
    ctx.save();
    
    let opacity = text.opacity;
    text._scrollOffset = 0;
    text._bounceOffset = 0;
    text._visibleChars = text.content.length;
    
    if (text.animation && TEXT_ANIMATIONS[text.animation]) {
      opacity *= TEXT_ANIMATIONS[text.animation].apply(ctx, text, localTime, duration);
    }
    
    ctx.globalAlpha = clamp(opacity, 0, 1);
    
    const fontParts = [];
    if (text.fontStyle !== 'normal') fontParts.push(text.fontStyle);
    if (text.fontWeight !== 'normal') fontParts.push(text.fontWeight);
    fontParts.push(`${text.fontSize * text.scale}px`);
    fontParts.push(text.fontFamily);
    ctx.font = fontParts.join(' ');
    
    ctx.textAlign = text.textAlign;
    ctx.textBaseline = 'top';
    
    const x = text.x + (text._scrollOffset || 0);
    const y = text.y + (text._bounceOffset || 0);
    
    const centerX = x + ctx.measureText(text.content).width / 2;
    const centerY = y + text.fontSize * text.scale / 2;
    
    if (text.rotation !== 0) {
      ctx.translate(centerX, centerY);
      ctx.rotate((text.rotation * Math.PI) / 180);
      ctx.translate(-centerX, -centerY);
    }
    
    if (text.shadowBlur > 0) {
      ctx.shadowColor = text.shadowColor;
      ctx.shadowBlur = text.shadowBlur;
      ctx.shadowOffsetX = text.shadowOffsetX;
      ctx.shadowOffsetY = text.shadowOffsetY;
    }
    
    const displayContent = text.content.substring(0, text._visibleChars || text.content.length);
    
    if (text.strokeWidth > 0) {
      ctx.strokeStyle = text.strokeColor;
      ctx.lineWidth = text.strokeWidth * 2;
      ctx.lineJoin = 'round';
      ctx.strokeText(displayContent, x, y);
    }
    
    ctx.fillStyle = text.color;
    ctx.fillText(displayContent, x, y);
    
    ctx.restore();
  }

  renderSticker(ctx, sticker, currentTime) {
    const localTime = currentTime - sticker.startTime;
    const duration = sticker.endTime - sticker.startTime;
    
    ctx.save();
    
    let opacity = sticker.opacity;
    if (sticker.fadeIn > 0 && localTime < sticker.fadeIn) {
      opacity *= localTime / sticker.fadeIn;
    }
    if (sticker.fadeOut > 0 && localTime > duration - sticker.fadeOut) {
      opacity *= (duration - localTime) / sticker.fadeOut;
    }
    
    ctx.globalAlpha = clamp(opacity, 0, 1);
    
    const centerX = sticker.x + (sticker.width * sticker.scale) / 2;
    const centerY = sticker.y + (sticker.height * sticker.scale) / 2;
    
    if (sticker.rotation !== 0) {
      ctx.translate(centerX, centerY);
      ctx.rotate((sticker.rotation * Math.PI) / 180);
      ctx.translate(-centerX, -centerY);
    }
    
    const img = new Image();
    img.src = sticker.url;
    
    if (img.complete && img.naturalWidth > 0) {
      ctx.drawImage(
        img,
        sticker.x,
        sticker.y,
        sticker.width * sticker.scale,
        sticker.height * sticker.scale
      );
    } else {
      ctx.fillStyle = '#6366f1';
      ctx.fillRect(
        sticker.x,
        sticker.y,
        sticker.width * sticker.scale,
        sticker.height * sticker.scale
      );
      ctx.fillStyle = '#ffffff';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('🖼️', centerX, centerY + 5);
    }
    
    ctx.restore();
  }

  renderSelectionBox(ctx, item) {
    ctx.save();
    
    let x, y, width, height;
    
    if (item.type === 'text') {
      ctx.font = `${item.fontSize * item.scale}px ${item.fontFamily}`;
      width = ctx.measureText(item.content).width;
      height = item.fontSize * item.scale * 1.2;
      x = item.x;
      y = item.y;
    } else {
      x = item.x;
      y = item.y;
      width = item.width * item.scale;
      height = item.height * item.scale;
    }
    
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(x - 5, y - 5, width + 10, height + 10);
    ctx.setLineDash([]);
    
    const handles = [
      { x: x - 5, y: y - 5, cursor: 'nwse-resize' },
      { x: x + width + 5, y: y - 5, cursor: 'nesw-resize' },
      { x: x - 5, y: y + height + 5, cursor: 'nesw-resize' },
      { x: x + width + 5, y: y + height + 5, cursor: 'nwse-resize' }
    ];
    
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    
    for (const handle of handles) {
      ctx.beginPath();
      ctx.rect(handle.x - 4, handle.y - 4, 8, 8);
      ctx.fill();
      ctx.stroke();
    }
    
    ctx.restore();
  }

  handleMouseDown(e, canvas) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    const clickedItem = this.findItemAt(x, y);
    if (clickedItem) {
      this.selectItem(clickedItem.id);
      this.isDragging = true;
      this.dragStartX = x - clickedItem.x;
      this.dragStartY = y - clickedItem.y;
      this.dragItem = clickedItem;
      return true;
    }
    
    this.selectItem(null);
    return false;
  }

  handleMouseMove(e, canvas) {
    if (!this.isDragging || !this.dragItem) return false;
    
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    const newX = clamp(x - this.dragStartX, 0, canvas.width - 50);
    const newY = clamp(y - this.dragStartY, 0, canvas.height - 50);
    
    if (this.dragItem.type === 'text') {
      this.updateText(this.dragItem.id, { x: newX, y: newY });
    } else {
      this.updateSticker(this.dragItem.id, { x: newX, y: newY });
    }
    
    return true;
  }

  handleMouseUp() {
    this.isDragging = false;
    this.isResizing = false;
    this.dragItem = null;
  }

  handleWheel(e, canvas) {
    if (!this.selectedItemId) return false;
    
    const item = this.getItemById(this.selectedItemId);
    if (!item) return false;
    
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newScale = clamp(item.scale + delta, 0.1, 5);
    
    if (item.type === 'text') {
      this.updateText(item.id, { scale: newScale });
    } else {
      this.updateSticker(item.id, { scale: newScale });
    }
    
    return true;
  }

  findItemAt(x, y) {
    const allItems = [...this.texts, ...this.stickers].sort((a, b) => b.zIndex - a.zIndex);
    
    for (const item of allItems) {
      if (this.isPointInItem(x, y, item)) {
        return item;
      }
    }
    return null;
  }

  isPointInItem(x, y, item) {
    let itemWidth, itemHeight;
    
    if (item.type === 'text') {
      const tempCanvas = document.createElement('canvas');
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.font = `${item.fontSize * item.scale}px ${item.fontFamily}`;
      itemWidth = tempCtx.measureText(item.content).width;
      itemHeight = item.fontSize * item.scale * 1.2;
    } else {
      itemWidth = item.width * item.scale;
      itemHeight = item.height * item.scale;
    }
    
    return x >= item.x && x <= item.x + itemWidth &&
           y >= item.y && y <= item.y + itemHeight;
  }

  getTexts() {
    return [...this.texts];
  }

  getStickers() {
    return [...this.stickers];
  }

  getAllItems() {
    return [...this.texts, ...this.stickers];
  }

  getSelectedItem() {
    return this.selectedItemId ? this.getItemById(this.selectedItemId) : null;
  }

  clearSelection() {
    this.selectedItemId = null;
    this.isDragging = false;
    this.isResizing = false;
    this.dragItem = null;
    EventBus.emit('item:selected', null);
    EventBus.emit('player:update');
  }

  getTextItemsForHistory() {
    const serializeItem = (item) => {
      const { element, ...rest } = item;
      return JSON.parse(JSON.stringify(rest));
    };
    
    return {
      texts: this.texts.map(serializeItem),
      stickers: this.stickers.map(serializeItem)
    };
  }

  restoreFromHistory(data) {
    if (!data) return;
    
    this.texts = data.texts || [];
    this.stickers = data.stickers || [];
    this.selectedItemId = null;
    
    for (const text of this.texts) {
      this.setupTextElement(text);
    }
    
    EventBus.emit('text:restored');
    EventBus.emit('sticker:restored');
    EventBus.emit('player:update');
  }

  updateItemProperty(itemId, property, value) {
    const item = this.getItemById(itemId);
    if (!item) return null;

    const propertyMap = {
      'text': 'content',
      'bold': 'fontWeight',
      'italic': 'fontStyle'
    };

    const actualProperty = propertyMap[property] || property;

    if (actualProperty === 'fontWeight') {
      item[actualProperty] = value ? 'bold' : 'normal';
    } else if (actualProperty === 'fontStyle') {
      item[actualProperty] = value ? 'italic' : 'normal';
    } else {
      item[actualProperty] = value;
    }

    EventBus.emit('text:updated', item);
    EventBus.emit('sticker:updated', item);
    EventBus.emit('player:update');

    return item;
  }
}

export const textManager = new TextManager();
