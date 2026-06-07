import { EventBus, generateId, formatTime, formatFileSize, showToast } from './utils.js';

const AUDIO_TYPES = {
  bgm: {
    name: '背景音乐',
    icon: '🎵',
    color: '#22c55e'
  },
  voice: {
    name: '人声',
    icon: '🎤',
    color: '#f97316'
  }
};

class AudioManager {
  constructor() {
    this.audios = [];
    this.audioContext = null;
    this.masterGainNode = null;
    this.bgmGainNode = null;
    this.voiceGainNode = null;
    this.voiceGain = 1;
    this.bgmGain = 1;
    this.activeSources = new Map();
    this.audioFileInput = null;
    this.voiceFileInput = null;
    this.bgmFileInput = null;
    this.audioList = null;
    this.emptyState = null;

    this.init();
  }

  init() {
    this.setupAudioContext();
    this.setupFileInputs();
    this.setupDragAndDrop();
    this.setupEventListeners();
    this.renderAllAudioMaterials();
    this.updateEmptyState();
  }

  renderAllAudioMaterials() {
    if (!this.audioList) return;
    this.audioList.innerHTML = '';
    for (const audio of this.audios) {
      this.renderAudioItem(audio);
    }
  }

  setupAudioContext() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      this.masterGainNode = this.audioContext.createGain();
      this.masterGainNode.gain.value = 1;
      this.masterGainNode.connect(this.audioContext.destination);
      
      this.bgmGainNode = this.audioContext.createGain();
      this.bgmGainNode.gain.value = 1;
      this.bgmGainNode.connect(this.masterGainNode);
      
      this.voiceGainNode = this.audioContext.createGain();
      this.voiceGainNode.gain.value = 1;
      this.voiceGainNode.connect(this.masterGainNode);
      
      console.log('✅ AudioContext initialized');
    } catch (e) {
      console.warn('Web Audio API not supported:', e);
    }
  }

  setupFileInputs() {
    this.audioList = document.getElementById('audio-materials-list');
    this.emptyState = document.getElementById('audio-empty-state');
  }

  setupDragAndDrop() {
    document.body.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });

    document.body.addEventListener('drop', (e) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files).filter(f => 
        f.type.startsWith('audio/') || 
        ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].some(ext => 
          f.name.toLowerCase().endsWith(ext)
        )
      );
      if (files.length > 0) {
        this.showAudioTypeSelector(files);
      }
    });
  }

  setupEventListeners() {
    EventBus.on('audio:added', (audio) => {
      this.renderAudioItem(audio);
      this.updateEmptyState();
    });

    EventBus.on('audio:deleted', () => {
      this.updateEmptyState();
    });

    EventBus.on('player:play', () => {
      this.resumeContext();
    });

    EventBus.on('audio:update-master-volume', ({ type, value }) => {
      this.setMasterVolume(type, value);
    });
  }

  async showAudioTypeSelector(files) {
    const modal = document.createElement('div');
    modal.className = 'audio-type-modal';
    modal.innerHTML = `
      <div class="modal-overlay"></div>
      <div class="modal-content">
        <h3>选择音频类型</h3>
        <p>请选择这些音频文件的类型：</p>
        <div class="audio-type-buttons">
          <button class="btn-primary" data-type="bgm">🎵 背景音乐</button>
          <button class="btn-secondary" data-type="voice">🎤 人声</button>
        </div>
        <button class="modal-close-btn">取消</button>
      </div>
    `;
    document.body.appendChild(modal);

    return new Promise((resolve) => {
      modal.querySelectorAll('[data-type]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const type = btn.dataset.type;
          modal.remove();
          await this.processAudioFiles(files, type);
          resolve(type);
        });
      });
      modal.querySelector('.modal-close-btn').addEventListener('click', () => {
        modal.remove();
        resolve(null);
      });
      modal.querySelector('.modal-overlay').addEventListener('click', () => {
        modal.remove();
        resolve(null);
      });
    });
  }

  async handleAudioFileSelect(e, audioType) {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    await this.processAudioFiles(files, audioType);
    e.target.value = '';
  }

  async processAudioFiles(files, audioType) {
    const audioFiles = files.filter(f => 
      f.type.startsWith('audio/') || 
      ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].some(ext => 
        f.name.toLowerCase().endsWith(ext)
      )
    );

    if (audioFiles.length === 0) {
      showToast('请选择有效的音频文件', 'error');
      return;
    }

    showToast(`正在导入 ${audioFiles.length} 个${AUDIO_TYPES[audioType].name}...`, 'info');

    for (const file of audioFiles) {
      try {
        const audio = await this.createAudio(file, audioType);
        this.audios.push(audio);
        EventBus.emit('audio:added', audio);
      } catch (error) {
        console.error('导入音频失败:', file.name, error);
        showToast(`导入失败: ${file.name}`, 'error');
      }
    }

    showToast(`成功导入 ${audioFiles.length} 个${AUDIO_TYPES[audioType].name}`, 'success');
  }

  async createAudio(file, audioType) {
    const metadata = await this.loadAudioMetadata(file);
    const url = URL.createObjectURL(file);

    const tempAudio = document.createElement('audio');
    tempAudio.src = url;
    tempAudio.preload = 'auto';
    
    await new Promise((resolve, reject) => {
      tempAudio.oncanplaythrough = resolve;
      tempAudio.onerror = reject;
      setTimeout(resolve, 3000);
    });

    const waveform = await this.generateWaveform(url);

    const audio = {
      id: generateId(),
      name: file.name,
      file: file,
      url: url,
      type: audioType,
      fileType: file.type || 'audio/mpeg',
      size: file.size,
      duration: metadata.duration,
      sampleRate: metadata.sampleRate,
      channels: metadata.channels,
      waveform: waveform,
      createdAt: Date.now()
    };

    return audio;
  }

  loadAudioMetadata(file) {
    return new Promise((resolve, reject) => {
      const audio = document.createElement('audio');
      audio.preload = 'metadata';

      audio.onloadedmetadata = () => {
        URL.revokeObjectURL(audio.src);
        resolve({
          duration: audio.duration,
          sampleRate: 44100,
          channels: 2
        });
      };

      audio.onerror = () => {
        URL.revokeObjectURL(audio.src);
        reject(new Error('无法加载音频元数据'));
      };

      audio.src = URL.createObjectURL(file);
    });
  }

  async generateWaveform(audioUrl) {
    try {
      const response = await fetch(audioUrl);
      const arrayBuffer = await response.arrayBuffer();
      
      if (!this.audioContext) {
        this.setupAudioContext();
      }
      
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer.slice(0));
      const channelData = audioBuffer.getChannelData(0);
      
      const samples = 100;
      const blockSize = Math.floor(channelData.length / samples);
      const waveform = [];
      
      for (let i = 0; i < samples; i++) {
        let sum = 0;
        for (let j = 0; j < blockSize; j++) {
          sum += Math.abs(channelData[i * blockSize + j]);
        }
        waveform.push(sum / blockSize);
      }
      
      const max = Math.max(...waveform);
      return waveform.map(v => v / max);
    } catch (e) {
      console.warn('Waveform generation failed:', e);
      return Array(100).fill(0.5);
    }
  }

  renderAudioItem(audio) {
    if (!this.audioList) return;

    const typeInfo = AUDIO_TYPES[audio.type];
    const item = document.createElement('div');
    item.className = 'material-item audio-item';
    item.draggable = true;
    item.dataset.id = audio.id;
    item.dataset.type = audio.type;

    item.innerHTML = `
      <div class="material-thumbnail audio-thumbnail" style="border-left: 4px solid ${typeInfo.color}">
        <div class="audio-waveform">
          ${this.renderWaveform(audio.waveform, typeInfo.color)}
        </div>
        <span class="material-duration">${formatTime(audio.duration)}</span>
        <span class="audio-type-badge" style="background: ${typeInfo.color}">${typeInfo.icon}</span>
      </div>
      <div class="material-info">
        <div class="material-name" title="${audio.name}">${audio.name}</div>
        <div class="material-meta">
          <span>${formatFileSize(audio.size)}</span>
          <span>${typeInfo.name}</span>
        </div>
      </div>
    `;

    item.addEventListener('dragstart', (e) => this.handleDragStart(e, audio));
    item.addEventListener('dragend', (e) => this.handleDragEnd(e));
    item.addEventListener('dblclick', () => this.previewAudio(audio));

    this.audioList.appendChild(item);
  }

  renderWaveform(waveform, color) {
    return waveform.map(v => 
      `<div class="waveform-bar" style="height: ${Math.max(2, v * 100)}%; background: ${color};"></div>`
    ).join('');
  }

  handleDragStart(e, audio) {
    e.dataTransfer.setData('application/json', JSON.stringify({
      type: 'audio',
      audioType: audio.type,
      audioId: audio.id
    }));
    e.dataTransfer.effectAllowed = 'copy';
    e.currentTarget.classList.add('dragging');
  }

  handleDragEnd(e) {
    e.currentTarget.classList.remove('dragging');
  }

  previewAudio(audio) {
    EventBus.emit('audio:preview', audio);
  }

  getAudioById(id) {
    return this.audios.find(a => a.id === id);
  }

  deleteAudio(id) {
    const index = this.audios.findIndex(a => a.id === id);
    if (index === -1) return;

    const audio = this.audios[index];
    URL.revokeObjectURL(audio.url);
    this.audios.splice(index, 1);

    const item = document.querySelector(`.audio-item[data-id="${id}"]`);
    if (item) item.remove();

    EventBus.emit('audio:deleted', audio);
  }

  updateEmptyState() {
    if (!this.emptyState) return;
    if (this.audios.length === 0) {
      this.emptyState.style.display = 'flex';
      if (this.audioList) this.audioList.style.display = 'none';
    } else {
      this.emptyState.style.display = 'none';
      if (this.audioList) this.audioList.style.display = 'flex';
    }
  }

  setMasterVolume(type, value) {
    if (type === 'bgm') {
      this.bgmGain = value;
      if (this.bgmGainNode) {
        this.bgmGainNode.gain.value = value;
      }
    } else if (type === 'voice') {
      this.voiceGain = value;
      if (this.voiceGainNode) {
        this.voiceGainNode.gain.value = value;
      }
    }
    EventBus.emit('audio:master-volume-changed', { type, value });
  }

  resumeContext() {
    if (this.audioContext?.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  createAudioSource(audioElement, audioType) {
    if (!this.audioContext) return null;

    const source = this.audioContext.createMediaElementSource(audioElement);
    
    const gainNode = this.audioContext.createGain();
    gainNode.gain.value = 1;
    
    const typeGainNode = audioType === 'bgm' ? this.bgmGainNode : this.voiceGainNode;
    source.connect(gainNode);
    gainNode.connect(typeGainNode);

    return { source, gainNode };
  }

  playAudioClip(audioClip) {
    if (!this.audioContext || !audioClip.element) return;

    const existing = this.activeSources.get(audioClip.id);
    if (existing) return existing;

    const { source, gainNode } = this.createAudioSource(audioClip.element, audioClip.audioType);
    audioClip.element.play().catch(e => console.warn('Audio play failed:', e));

    this.activeSources.set(audioClip.id, { source, gainNode });
    return { source, gainNode };
  }

  stopAudioClip(audioClip) {
    const active = this.activeSources.get(audioClip.id);
    if (active) {
      active.source.disconnect();
      active.gainNode.disconnect();
      audioClip.element.pause();
      this.activeSources.delete(audioClip.id);
    }
  }

  setClipVolume(audioClipId, volume) {
    const active = this.activeSources.get(audioClipId);
    if (active?.gainNode) {
      active.gainNode.gain.value = volume;
    }
  }

  applyFadeEffect(audioClip, currentTime) {
    const active = this.activeSources.get(audioClip.id);
    if (!active?.gainNode) return;

    const clipDuration = audioClip.endTime - audioClip.startTime;
    const clipProgress = (currentTime - audioClip.startTime) / clipDuration;
    let gainMultiplier = 1;

    if (audioClip.fadeIn > 0 && clipProgress < audioClip.fadeIn / clipDuration) {
      gainMultiplier = clipProgress / (audioClip.fadeIn / clipDuration);
    } else if (audioClip.fadeOut > 0 && clipProgress > 1 - audioClip.fadeOut / clipDuration) {
      gainMultiplier = (1 - clipProgress) / (audioClip.fadeOut / clipDuration);
    }

    active.gainNode.gain.value = audioClip.volume * gainMultiplier;
  }

  getAllAudios() {
    return [...this.audios];
  }

  getAudiosByType(type) {
    return this.audios.filter(a => a.type === type);
  }
}

export const audioManager = new AudioManager();
export { AUDIO_TYPES };
