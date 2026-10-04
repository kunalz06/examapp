'use client'

export type BrowserFaceDetector = {
  detectForVideo: (source: HTMLVideoElement, timestampMs: number) => { detections?: unknown[] }
  close?: () => void
}

type VisionModule = {
  FilesetResolver: {
    forVisionTasks: (wasmRoot: string) => Promise<unknown>
  }
  FaceDetector: {
    createFromOptions: (
      fileset: unknown,
      options: {
        baseOptions: { modelAssetPath: string }
        runningMode: 'VIDEO'
        minDetectionConfidence: number
        minSuppressionThreshold: number
      },
    ) => Promise<BrowserFaceDetector>
  }
}

declare global {
  interface Window {
    __examCoreVisionModule?: VisionModule
    __examCoreVisionPromise?: Promise<VisionModule>
  }
}

const MEDIAPIPE_VERSION = '1.0.1'
const MODULE_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/+esm`
const WASM_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite'
const MODULE_TIMEOUT_MS = 20_000

function loadVisionModule(): Promise<VisionModule> {
  if (window.__examCoreVisionModule) return Promise.resolve(window.__examCoreVisionModule)
  if (window.__examCoreVisionPromise) return window.__examCoreVisionPromise

  const promise = new Promise<VisionModule>((resolve, reject) => {
    const readyEvent = 'examcore:mediapipe-ready'
    const errorEvent = 'examcore:mediapipe-error'
    const script = document.createElement('script')
    script.type = 'module'
    script.dataset.examcoreMediapipe = 'true'

    const cleanup = () => {
      window.clearTimeout(timeout)
      window.removeEventListener(readyEvent, onReady)
      window.removeEventListener(errorEvent, onError)
      script.remove()
    }

    const onReady = () => {
      const vision = window.__examCoreVisionModule
      cleanup()
      if (vision) resolve(vision)
      else reject(new Error('Face detection module did not initialize.'))
    }

    const onError = () => {
      cleanup()
      delete window.__examCoreVisionPromise
      reject(new Error('Face detection module failed to load.'))
    }

    const timeout = window.setTimeout(() => {
      cleanup()
      delete window.__examCoreVisionPromise
      reject(new Error('Face detection module timed out.'))
    }, MODULE_TIMEOUT_MS)

    window.addEventListener(readyEvent, onReady, { once: true })
    window.addEventListener(errorEvent, onError, { once: true })

    script.textContent = `
      try {
        const vision = await import(${JSON.stringify(MODULE_URL)});
        window.__examCoreVisionModule = vision;
        window.dispatchEvent(new Event(${JSON.stringify(readyEvent)}));
      } catch (error) {
        console.error('ExamCore face monitor failed to load', error);
        window.dispatchEvent(new Event(${JSON.stringify(errorEvent)}));
      }
    `

    document.head.appendChild(script)
  })

  window.__examCoreVisionPromise = promise
  return promise
}

export async function createBrowserFaceDetector(): Promise<BrowserFaceDetector> {
  const visionModule = await loadVisionModule()
  const fileset = await visionModule.FilesetResolver.forVisionTasks(WASM_ROOT)
  return visionModule.FaceDetector.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL },
    runningMode: 'VIDEO',
    minDetectionConfidence: 0.6,
    minSuppressionThreshold: 0.3,
  })
}
