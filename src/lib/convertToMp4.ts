import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;
let loadingPromise: Promise<FFmpeg> | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg && ffmpeg.loaded) {
    return ffmpeg;
  }

  // Prevent multiple simultaneous loads
  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = (async () => {
    const ff = new FFmpeg();
    
    console.log('[FFmpeg] Loading...');
    
    // Load FFmpeg with CORS-enabled CDN
    await ff.load({
      coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js',
      wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm',
    });
    
    console.log('[FFmpeg] Loaded successfully');
    ffmpeg = ff;
    return ff;
  })();

  return loadingPromise;
}

export async function convertWebmToMp4(
  webmBlob: Blob,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  console.log('[FFmpeg] Starting conversion, blob size:', webmBlob.size);
  
  const ff = await getFFmpeg();

  // Set up progress handler
  if (onProgress) {
    ff.on('progress', ({ progress, time }) => {
      console.log('[FFmpeg] Progress:', progress, 'Time:', time);
      onProgress(Math.round(progress * 100));
    });
  }

  // Log output
  ff.on('log', ({ message }) => {
    console.log('[FFmpeg]', message);
  });

  // Write input file
  console.log('[FFmpeg] Writing input file...');
  const inputData = await fetchFile(webmBlob);
  await ff.writeFile('input.webm', inputData);
  console.log('[FFmpeg] Input file written, size:', inputData.length);

  // Remux WebM to MP4 container (fast, no re-encoding)
  // VP9 in MP4 container is widely supported
  console.log('[FFmpeg] Starting remux...');
  await ff.exec([
    '-i', 'input.webm',
    '-c:v', 'copy',      // Copy video without re-encoding (fast)
    // Opus in MP4 has poor player support, so transcode voice audio to AAC.
    // '?' makes the mapping optional for silent (solo) recordings.
    '-c:a', 'aac',
    '-b:a', '128k',
    '-map', '0:v:0',
    '-map', '0:a:0?',
    '-f', 'mp4',
    'output.mp4'
  ]);
  console.log('[FFmpeg] Remux complete');

  // Read output file
  const outputData = await ff.readFile('output.mp4');
  console.log('[FFmpeg] Output file read, size:', outputData instanceof Uint8Array ? outputData.length : 'unknown');
  
  // Clean up
  await ff.deleteFile('input.webm');
  await ff.deleteFile('output.mp4');

  // Convert to Blob - copy to a new Uint8Array to ensure ArrayBuffer type
  if (outputData instanceof Uint8Array) {
    const copy = new Uint8Array(outputData.length);
    copy.set(outputData);
    return new Blob([copy], { type: 'video/mp4' });
  }
  
  // Fallback for string type (shouldn't happen for binary files)
  return new Blob([outputData], { type: 'video/mp4' });
}
