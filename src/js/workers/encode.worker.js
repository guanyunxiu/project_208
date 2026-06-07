let frameQueue = [];
let isProcessing = false;
let frameCount = 0;
let totalFrames = 0;

self.onmessage = async (e) => {
  const { type, data } = e.data;

  switch (type) {
    case 'init':
      initEncoder(data);
      break;
    case 'add-frame':
      addFrame(data);
      break;
    case 'finalize':
      finalizeEncoding();
      break;
    case 'cancel':
      cancelEncoding();
      break;
    default:
      self.postMessage({ type: 'error', error: 'Unknown command' });
  }
};

function initEncoder(data) {
  const { width, height, fps, totalFrames: expectedFrames } = data;
  
  frameQueue = [];
  frameCount = 0;
  totalFrames = expectedFrames;
  isProcessing = false;

  self.postMessage({
    type: 'encoder-ready',
    data: { width, height, fps }
  });

  processQueue();
}

function addFrame(data) {
  const { frameData, timestamp } = data;
  
  frameQueue.push({
    data: frameData,
    timestamp,
    index: frameCount++
  });

  self.postMessage({
    type: 'frame-queued',
    data: { index: frameCount - 1, queueSize: frameQueue.length }
  });

  if (frameCount % 10 === 0) {
    self.postMessage({
      type: 'encoding-progress',
      data: { 
        progress: Math.round((frameCount / totalFrames) * 100),
        framesEncoded: frameCount,
        totalFrames 
      }
    });
  }
}

async function processQueue() {
  if (isProcessing) return;
  isProcessing = true;

  while (frameQueue.length > 0) {
    const frame = frameQueue.shift();
    
    try {
      await simulateFrameProcessing(frame);
      
      self.postMessage({
        type: 'frame-processed',
        data: { 
          index: frame.index,
          timestamp: frame.timestamp
        }
      });
    } catch (error) {
      self.postMessage({
        type: 'frame-error',
        data: { index: frame.index, error: error.message }
      });
    }

    await new Promise(resolve => setTimeout(resolve, 1));
  }

  isProcessing = false;
}

async function simulateFrameProcessing(frame) {
  return new Promise(resolve => {
    const data = frame.data;
    
    if (data instanceof ImageData) {
      resolve();
    } else if (data instanceof Uint8Array || data instanceof Uint8ClampedArray) {
      resolve();
    } else {
      resolve();
    }
  });
}

async function finalizeEncoding() {
  while (frameQueue.length > 0 || isProcessing) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  self.postMessage({
    type: 'encoding-complete',
    data: { 
      totalFrames: frameCount,
      duration: frameCount / 30
    }
  });

  resetEncoder();
}

function cancelEncoding() {
  frameQueue = [];
  isProcessing = false;
  frameCount = 0;
  totalFrames = 0;

  self.postMessage({
    type: 'encoding-cancelled'
  });
}

function resetEncoder() {
  frameQueue = [];
  isProcessing = false;
  frameCount = 0;
}
