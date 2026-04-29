// =========================================================================
// whisper.js
// Speech-to-text engine for Creative Notebook v2.x.
//
// Wraps Hugging Face Transformers.js running OpenAI Whisper in the browser.
// All transcription happens on-device. After the initial model download,
// the app works fully offline.
//
// Public API:
//   loadModel(onProgress)  - fetch + initialize the model. Call once on app start.
//   isReady()              - returns true after loadModel resolved successfully.
//   transcribe(audioBlob)  - returns Promise<string>. Pass a recorded audio Blob.
//   modelName()            - the current model identifier.
// =========================================================================

import {
    pipeline,
    env
} from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2';

// Tell transformers.js to load models from the Hugging Face CDN, not local.
env.allowLocalModels = false;
env.useBrowserCache = true;

// Model choice. Bump this if we want to switch sizes later:
//   Xenova/whisper-tiny   ~40MB, fastest, lowest accuracy
//   Xenova/whisper-base   ~75MB, balanced (current default)
//   Xenova/whisper-small  ~250MB, best accuracy, slowest
const MODEL_NAME = 'Xenova/whisper-base';

let transcriber = null;
let loading = false;

export function modelName() {
    return MODEL_NAME;
}

export function isReady() {
    return transcriber !== null;
}

// Load the model. Idempotent - calling again while loading returns the
// in-flight promise. Calling after success is a no-op.
//
// onProgress({ status, progress, file, ... }) is fired by transformers.js
// during the download. Forward it to the UI so the user sees percentages.
export async function loadModel(onProgress) {
    if (transcriber) return transcriber;
    if (loading) {
        // Wait for the in-flight load to finish.
        while (loading) {
            await new Promise(r => setTimeout(r, 100));
        }
        return transcriber;
    }

    loading = true;
    try {
        transcriber = await pipeline(
            'automatic-speech-recognition',
            MODEL_NAME,
            {
                // Try WebGPU first (fast on iOS 18 / A17 Pro), fall back to WASM.
                device: 'webgpu',
                progress_callback: (p) => {
                    if (typeof onProgress === 'function') {
                        try { onProgress(p); } catch (_) { /* ignore UI errors */ }
                    }
                }
            }
        );
    } catch (err) {
        // WebGPU may not be available in some browsers / contexts.
        // Retry with WASM-only.
        console.warn('webgpu pipeline failed, retrying with wasm:', err);
        try {
            transcriber = await pipeline(
                'automatic-speech-recognition',
                MODEL_NAME,
                {
                    progress_callback: (p) => {
                        if (typeof onProgress === 'function') {
                            try { onProgress(p); } catch (_) {}
                        }
                    }
                }
            );
        } catch (err2) {
            loading = false;
            throw err2;
        }
    }
    loading = false;
    return transcriber;
}

// Transcribe a recorded audio Blob. Handles both audio/webm (Chrome / desktop
// Safari) and audio/mp4 (iOS Safari) - we let AudioContext.decodeAudioData
// figure out the format. Output is mono Float32 at 16kHz, which is what
// Whisper expects.
export async function transcribe(audioBlob) {
    if (!transcriber) {
        throw new Error('Whisper model not loaded. Call loadModel() first.');
    }
    if (!audioBlob || audioBlob.size === 0) {
        throw new Error('No audio captured.');
    }

    const arrayBuffer = await audioBlob.arrayBuffer();

    // 16kHz mono is Whisper's native input rate.
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioCtx({ sampleRate: 16000 });
    let decoded;
    try {
        decoded = await audioCtx.decodeAudioData(arrayBuffer);
    } finally {
        try { audioCtx.close(); } catch (_) {}
    }

    // First channel only - Whisper is mono.
    const audio = decoded.getChannelData(0);

    const result = await transcriber(audio, {
        // Whisper's defaults are decent. Tune later if needed.
        chunk_length_s:  30,
        stride_length_s: 5,
        // language: 'en', // uncomment to force English; leave off to auto-detect
    });

    return (result && result.text) ? result.text.trim() : '';
}
