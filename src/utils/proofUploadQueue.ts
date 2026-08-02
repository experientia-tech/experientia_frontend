import { uploadProofFast } from '../api'

type UploadJob = {
  taskId: string
  file: File
  lat: number
  lng: number
  slot: string
  capturedAt: Date
  onError: () => void
}

const queue: UploadJob[] = []
let running = false

async function drain() {
  if (running) return
  running = true
  while (queue.length > 0) {
    const job = queue.shift()!
    try {
      await uploadProofFast(
        job.taskId,
        job.file,
        job.lat,
        job.lng,
        job.slot,
        job.capturedAt,
        { quiet: true }
      )
    } catch {
      job.onError()
    }
  }
  running = false
}

export function enqueueProofUpload(job: UploadJob) {
  queue.push(job)
  void drain()
}

export function flushProofUploads() {
  return new Promise<void>((resolve) => {
    const check = () => {
      if (!running && queue.length === 0) resolve()
      else setTimeout(check, 120)
    }
    check()
  })
}
