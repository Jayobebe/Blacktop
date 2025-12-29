import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpeg && ffmpeg.loaded) {
    return ffmpeg;
  }

  ffmpeg = new FFmpeg();
  
  // Load FFmpeg with CORS-enabled CDN
  await ffmpeg.load({
    coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js',
    wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.wasm',
  });

  return ffmpeg;
}

export async function convertWebmToMp4(
  webmBlob: Blob,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  const ff = await getFFmpeg();

  // Set up progress handler
  if (onProgress) {
    ff.on('progress', ({ progress }) => {
      onProgress(Math.round(progress * 100));
    });
  }

  // Write input file
  const inputData = await fetchFile(webmBlob);
  await ff.writeFile('input.webm', inputData);

  // Convert to MP4 with H.264 codec for broad compatibility
  await ff.exec([
    '-i', 'input.webm',
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    'output.mp4'
  ]);

  // Read output file
  const outputData = await ff.readFile('output.mp4');
  
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
