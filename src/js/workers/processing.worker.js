self.onmessage = async (e) => {
  const { type, data } = e.data;

  switch (type) {
    case 'generate-thumbnail':
      handleGenerateThumbnail(data);
      break;
    case 'analyze-video':
      handleAnalyzeVideo(data);
      break;
    case 'process-frames':
      handleProcessFrames(data);
      break;
    default:
      self.postMessage({ type: 'error', error: 'Unknown command' });
  }
};

async function handleGenerateThumbnail(data) {
  const { videoData, width, height, time } = data;
  
  try {
    self.postMessage({ 
      type: 'thumbnail-progress', 
      progress: 20 
    });

    const result = {
      success: true,
      width,
      height,
      time
    };

    self.postMessage({ 
      type: 'thumbnail-complete', 
      data: result 
    });
  } catch (error) {
    self.postMessage({ 
      type: 'thumbnail-error', 
      error: error.message 
    });
  }
}

async function handleAnalyzeVideo(data) {
  const { frames } = data;
  
  try {
    const totalFrames = frames.length;
    const analysis = {
      brightness: [],
      contrast: [],
      motion: []
    };

    for (let i = 0; i < totalFrames; i++) {
      const progress = Math.round((i / totalFrames) * 100);
      
      if (i % 10 === 0) {
        self.postMessage({ 
          type: 'analysis-progress', 
          progress 
        });
      }

      const frameData = frames[i];
      const brightness = calculateBrightness(frameData);
      const contrast = calculateContrast(frameData);
      const motion = i > 0 ? calculateMotion(frames[i - 1], frameData) : 0;

      analysis.brightness.push(brightness);
      analysis.contrast.push(contrast);
      analysis.motion.push(motion);
    }

    self.postMessage({ 
      type: 'analysis-complete', 
      data: analysis 
    });
  } catch (error) {
    self.postMessage({ 
      type: 'analysis-error', 
      error: error.message 
    });
  }
}

async function handleProcessFrames(data) {
  const { frames, effect, params } = data;
  
  try {
    const totalFrames = frames.length;
    const processedFrames = [];

    for (let i = 0; i < totalFrames; i++) {
      const progress = Math.round((i / totalFrames) * 100);
      
      if (i % 5 === 0) {
        self.postMessage({ 
          type: 'processing-progress', 
          progress 
        });
      }

      let processed;
      switch (effect) {
        case 'grayscale':
          processed = applyGrayscale(frames[i]);
          break;
        case 'sepia':
          processed = applySepia(frames[i]);
          break;
        case 'brightness':
          processed = adjustBrightness(frames[i], params.value);
          break;
        case 'contrast':
          processed = adjustContrast(frames[i], params.value);
          break;
        default:
          processed = frames[i];
      }

      processedFrames.push(processed);
    }

    self.postMessage({ 
      type: 'processing-complete', 
      data: processedFrames 
    });
  } catch (error) {
    self.postMessage({ 
      type: 'processing-error', 
      error: error.message 
    });
  }
}

function calculateBrightness(imageData) {
  const data = imageData.data;
  let brightness = 0;
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    brightness += (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }
  
  return brightness / (data.length / 4);
}

function calculateContrast(imageData) {
  const data = imageData.data;
  const brightness = calculateBrightness(imageData);
  let variance = 0;
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    variance += Math.pow(lum - brightness, 2);
  }
  
  return Math.sqrt(variance / (data.length / 4));
}

function calculateMotion(prevFrame, currFrame) {
  const prevData = prevFrame.data;
  const currData = currFrame.data;
  let motion = 0;
  
  for (let i = 0; i < prevData.length; i += 4) {
    const diff = Math.abs(prevData[i] - currData[i]) +
                 Math.abs(prevData[i + 1] - currData[i + 1]) +
                 Math.abs(prevData[i + 2] - currData[i + 2]);
    motion += diff / (3 * 255);
  }
  
  return motion / (prevData.length / 4);
}

function applyGrayscale(imageData) {
  const data = new Uint8ClampedArray(imageData.data);
  
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
  }
  
  return new ImageData(data, imageData.width, imageData.height);
}

function applySepia(imageData) {
  const data = new Uint8ClampedArray(imageData.data);
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    
    data[i] = Math.min(255, 0.393 * r + 0.769 * g + 0.189 * b);
    data[i + 1] = Math.min(255, 0.349 * r + 0.686 * g + 0.168 * b);
    data[i + 2] = Math.min(255, 0.272 * r + 0.534 * g + 0.131 * b);
  }
  
  return new ImageData(data, imageData.width, imageData.height);
}

function adjustBrightness(imageData, value) {
  const data = new Uint8ClampedArray(imageData.data);
  const adjustment = value * 2.55;
  
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.max(0, Math.min(255, data[i] + adjustment));
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + adjustment));
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + adjustment));
  }
  
  return new ImageData(data, imageData.width, imageData.height);
}

function adjustContrast(imageData, value) {
  const data = new Uint8ClampedArray(imageData.data);
  const factor = (259 * (value + 255)) / (255 * (259 - value));
  
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.max(0, Math.min(255, factor * (data[i] - 128) + 128));
    data[i + 1] = Math.max(0, Math.min(255, factor * (data[i + 1] - 128) + 128));
    data[i + 2] = Math.max(0, Math.min(255, factor * (data[i + 2] - 128) + 128));
  }
  
  return new ImageData(data, imageData.width, imageData.height);
}
