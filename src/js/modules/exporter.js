import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { EventBus, showToast, parseResolution } from './utils.js';

class VideoExporter {
  constructor() {
    this.ffmpeg = null;
    this.isLoaded = false;
    this.isExporting = false;
    this.exportAbortController = null;

    this.exportBtn = document.getElementById('btn-export');
    this.exportModal = document.getElementById('export-modal');
    this.closeExportBtn = document.getElementById('close-export');
    this.startExportBtn = document.getElementById('btn-start-export');
    this.cancelExportBtn = document.getElementById('btn-cancel-export');
    this.progressContainer = document.getElementById('export-progress');
    this.progressFill = document.getElementById('progress-fill');
    this.progressText = document.getElementById('progress-text');

    this.formatSelect = document.getElementById('export-format');
    this.resolutionSelect = document.getElementById('export-resolution');
    this.qualitySelect = document.getElementById('export-quality');

    this.init();
  }

  async init() {
    this.setupEventListeners();
    this.loadFFmpeg();
  }

  setupEventListeners() {
    this.exportBtn.addEventListener('click', () => this.openModal());
    this.closeExportBtn.addEventListener('click', () => this.closeModal());
    this.startExportBtn.addEventListener('click', () => this.startExport());
    this.cancelExportBtn.addEventListener('click', () => this.cancelExport());

    this.exportModal.addEventListener('click', (e) => {
      if (e.target === this.exportModal) {
        this.closeModal();
      }
    });
  }

  async loadFFmpeg() {
    try {
      this.ffmpeg = new FFmpeg();

      this.ffmpeg.on('log', ({ message }) => {
        console.log('[FFmpeg]', message);
      });

      this.ffmpeg.on('progress', ({ progress }) => {
        if (this.isExporting) {
          const percent = Math.round(progress * 100);
          this.updateProgress(percent);
        }
      });

      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      
      await this.ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm')
      });

      this.isLoaded = true;
      this.exportBtn.disabled = false;
      console.log('FFmpeg loaded successfully');
    } catch (error) {
      console.error('Failed to load FFmpeg:', error);
      showToast('FFmpeg 加载失败，导出功能可能不可用', 'warning');
      this.exportBtn.disabled = false;
    }
  }

  openModal() {
    if (!window.__timelineManager || window.__timelineManager.getClips().length === 0) {
      showToast('请先添加视频片段到时间轴', 'warning');
      return;
    }

    if (!this.isLoaded) {
      showToast('FFmpeg 正在加载中，请稍候...', 'info');
      return;
    }

    this.exportModal.style.display = 'flex';
    this.progressContainer.style.display = 'none';
    this.startExportBtn.disabled = false;
    this.resetProgress();
  }

  closeModal() {
    if (this.isExporting) {
      if (!confirm('导出正在进行中，确定要取消吗？')) {
        return;
      }
      this.cancelExport();
    }
    this.exportModal.style.display = 'none';
  }

  async startExport() {
    if (this.isExporting) return;

    const clips = window.__timelineManager.getClips();
    if (clips.length === 0) {
      showToast('时间轴为空，无法导出', 'error');
      return;
    }

    this.isExporting = true;
    this.exportAbortController = new AbortController();
    this.startExportBtn.disabled = true;
    this.progressContainer.style.display = 'block';
    this.updateProgress(0);

    try {
      const format = this.formatSelect.value;
      const quality = this.qualitySelect.value;
      
      const firstClip = clips[0];
      const resolution = parseResolution(
        this.resolutionSelect.value,
        firstClip.material.width,
        firstClip.material.height
      );

      const outputFilename = `export_${Date.now()}.${format}`;
      
      showToast('开始导出视频，这可能需要一些时间...', 'info');

      const result = await this.exportVideo(clips, {
        format,
        resolution,
        quality,
        outputFilename,
        signal: this.exportAbortController.signal
      });

      if (result) {
        this.downloadVideo(result, outputFilename);
        showToast('视频导出成功！', 'success');
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        showToast('导出已取消', 'info');
      } else {
        console.error('Export failed:', error);
        showToast(`导出失败: ${error.message}`, 'error');
      }
    } finally {
      this.isExporting = false;
      this.exportAbortController = null;
      this.startExportBtn.disabled = false;
    }
  }

  cancelExport() {
    if (this.exportAbortController) {
      this.exportAbortController.abort();
    }
    this.isExporting = false;
  }

  async exportVideo(clips, options) {
    const { format, resolution, quality, outputFilename, signal } = options;

    if (signal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const ffmpeg = this.ffmpeg;
    const sortedClips = [...clips].sort((a, b) => a.startTime - b.startTime);
    const totalDuration = Math.max(...clips.map(c => c.endTime));

    const fileList = [];
    const concatContent = [];

    for (let i = 0; i < sortedClips.length; i++) {
      const clip = sortedClips[i];
      const inputName = `input_${i}.${format}`;
      
      try {
        const fileData = await fetchFile(clip.material.file);
        await ffmpeg.writeFile(inputName, fileData);
        fileList.push(inputName);

        concatContent.push(`file '${inputName}'`);
        concatContent.push(`inpoint ${clip.trimStart}`);
        concatContent.push(`outpoint ${clip.trimEnd}`);
      } catch (e) {
        console.warn(`Failed to process clip ${i}:`, e);
      }
    }

    if (fileList.length === 0) {
      throw new Error('没有可导出的视频片段');
    }

    await ffmpeg.writeFile('concat.txt', concatContent.join('\n'));

    const crf = quality === 'high' ? 18 : quality === 'medium' ? 23 : 28;
    const preset = quality === 'high' ? 'slow' : quality === 'medium' ? 'medium' : 'fast';

    const filterComplex = this.buildFilterComplex(sortedClips, resolution, format);

    const args = [
      '-f', 'concat',
      '-safe', '0',
      '-i', 'concat.txt',
      '-c:v', format === 'mp4' ? 'libx264' : 'libvpx-vp9',
      '-crf', crf.toString(),
      '-preset', preset,
      '-c:a', format === 'mp4' ? 'aac' : 'libopus',
      '-b:a', '128k',
      '-vf', filterComplex,
      '-movflags', '+faststart',
      '-y',
      outputFilename
    ];

    this.updateProgress(5, '正在编码...');

    await ffmpeg.exec(args);

    this.updateProgress(95, '正在生成文件...');

    const data = await ffmpeg.readFile(outputFilename);

    for (const file of fileList) {
      try {
        await ffmpeg.deleteFile(file);
      } catch (e) {}
    }
    try {
      await ffmpeg.deleteFile('concat.txt');
      await ffmpeg.deleteFile(outputFilename);
    } catch (e) {}

    this.updateProgress(100, '导出完成！');

    return data;
  }

  buildFilterComplex(clips, resolution, format) {
    const filters = [];
    const firstClip = clips[0];

    const targetRatio = resolution.width / resolution.height;
    const sourceRatio = firstClip.material.width / firstClip.material.height;

    let scaleWidth = resolution.width;
    let scaleHeight = resolution.height;

    if (Math.abs(targetRatio - sourceRatio) > 0.01) {
      if (sourceRatio > targetRatio) {
        scaleHeight = Math.round(resolution.width / sourceRatio);
      } else {
        scaleWidth = Math.round(resolution.height * sourceRatio);
      }
    }

    scaleWidth = scaleWidth % 2 === 0 ? scaleWidth : scaleWidth + 1;
    scaleHeight = scaleHeight % 2 === 0 ? scaleHeight : scaleHeight + 1;

    filters.push(`scale=${scaleWidth}:${scaleHeight}`);

    if (scaleWidth !== resolution.width || scaleHeight !== resolution.height) {
      filters.push(`pad=${resolution.width}:${resolution.height}:(ow-iw)/2:(oh-ih)/2:black`);
    }

    return filters.join(',');
  }

  async exportWithMediaRecorder(clips, options) {
    const { format, resolution, outputFilename } = options;

    const canvas = document.createElement('canvas');
    canvas.width = resolution.width;
    canvas.height = resolution.height;
    const ctx = canvas.getContext('2d');

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const dest = audioContext.createMediaStreamDestination();
    const gainNode = audioContext.createGain();
    gainNode.connect(dest);

    const videoStream = canvas.captureStream(30);
    const audioStream = dest.stream;
    const combinedStream = new MediaStream([
      ...videoStream.getVideoTracks(),
      ...audioStream.getAudioTracks()
    ]);

    const mimeType = format === 'mp4' 
      ? 'video/webm;codecs=vp9,opus'
      : 'video/webm;codecs=vp9,opus';

    const mediaRecorder = new MediaRecorder(combinedStream, {
      mimeType,
      videoBitsPerSecond: 5000000
    });

    const chunks = [];
    mediaRecorder.ondataavailable = (e) => chunks.push(e.data);

    return new Promise((resolve, reject) => {
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        resolve(blob);
      };

      mediaRecorder.onerror = (e) => reject(e);

      mediaRecorder.start();

      let currentTime = 0;
      const frameDuration = 1000 / 30;
      const totalDuration = Math.max(...clips.map(c => c.endTime)) * 1000;

      const renderFrame = () => {
        if (options.signal.aborted) {
          mediaRecorder.stop();
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }

        const timeInSeconds = currentTime / 1000;
        const progress = (currentTime / totalDuration) * 80 + 10;
        this.updateProgress(progress, `正在渲染: ${Math.round(progress)}%`);

        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const activeClip = clips.find(c => 
          timeInSeconds >= c.startTime && timeInSeconds < c.endTime
        );

        if (activeClip) {
          const clipLocalTime = timeInSeconds - activeClip.startTime + activeClip.trimStart;
          
          ctx.save();
          const centerX = canvas.width / 2;
          const centerY = canvas.height / 2;
          ctx.translate(centerX, centerY);
          ctx.rotate((activeClip.rotation * Math.PI) / 180);
          ctx.translate(-centerX, -centerY);

          let drawWidth = activeClip.material.width;
          let drawHeight = activeClip.material.height;
          
          if (drawWidth > canvas.width) {
            drawHeight = (canvas.width / drawWidth) * drawHeight;
            drawWidth = canvas.width;
          }
          if (drawHeight > canvas.height) {
            drawWidth = (canvas.height / drawHeight) * drawWidth;
            drawHeight = canvas.height;
          }

          const x = (canvas.width - drawWidth) / 2;
          const y = (canvas.height - drawHeight) / 2;

          ctx.fillStyle = '#333';
          ctx.fillRect(x, y, drawWidth, drawHeight);
          ctx.fillStyle = '#fff';
          ctx.font = '24px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(activeClip.material.name, canvas.width / 2, canvas.height / 2);
          ctx.font = '14px sans-serif';
          ctx.fillText(
            `时间: ${timeInSeconds.toFixed(2)}s`,
            canvas.width / 2,
            canvas.height / 2 + 30
          );

          ctx.restore();

          const clipDuration = activeClip.endTime - activeClip.startTime;
          const clipProgress = (timeInSeconds - activeClip.startTime) / clipDuration;
          let volume = activeClip.volume;

          if (activeClip.fadeIn > 0 && clipProgress < activeClip.fadeIn / clipDuration) {
            volume *= clipProgress / (activeClip.fadeIn / clipDuration);
          } else if (activeClip.fadeOut > 0 && clipProgress > 1 - activeClip.fadeOut / clipDuration) {
            volume *= (1 - clipProgress) / (activeClip.fadeOut / clipDuration);
          }

          gainNode.gain.value = activeClip.muted ? 0 : volume;
        }

        currentTime += frameDuration;

        if (currentTime < totalDuration) {
          setTimeout(renderFrame, frameDuration);
        } else {
          mediaRecorder.stop();
          audioContext.close();
        }
      };

      renderFrame();
    });
  }

  downloadVideo(data, filename) {
    let blob;
    if (data instanceof Blob) {
      blob = data;
    } else {
      const mimeType = filename.endsWith('.mp4') 
        ? 'video/mp4' 
        : 'video/webm';
      blob = new Blob([data.buffer], { type: mimeType });
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  updateProgress(percent, message) {
    this.progressFill.style.width = percent + '%';
    this.progressText.textContent = message || `正在导出... ${percent}%`;
  }

  resetProgress() {
    this.progressFill.style.width = '0%';
    this.progressText.textContent = '准备导出...';
  }
}

export const videoExporter = new VideoExporter();
