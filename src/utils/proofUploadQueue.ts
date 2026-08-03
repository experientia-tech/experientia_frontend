import { uploadProofFast } from '../api'
import type { ProofImage } from '../types'
import { parseApiError } from './apiError'

type UploadJob = {
  taskId: string
  file: File
  lat: number
  lng: number
  slot: string
  capturedAt: Date
  onSuccess?: (proof: ProofImage) => void
  onError?: (message: string) => void
}

const queue: UploadJob[] = []
/** Slots with a queued or in-flight upload — prevents UI from dropping optimistic proofs. */
const pendingSlots = new Set<string>()
let draining: Promise<void> | null = null

async function runJob(job: UploadJob) {
  try {
    const proof = await uploadProofFast(
      job.taskId,
      job.file,
      job.lat,
      job.lng,
      job.slot,
      job.capturedAt,
      { quiet: true }
    )
    job.onSuccess?.(proof)
  } catch (error) {
    job.onError?.(parseApiError(error, 'Photo upload failed'))
  } finally {
    pendingSlots.delete(job.slot)
  }
}

async function drainLoop() {
  while (queue.length > 0) {
    const job = queue.shift()!
    await runJob(job)
  }
}

export function enqueueProofUpload(job: UploadJob) {
  pendingSlots.add(job.slot)
  for (let i = queue.length - 1; i >= 0; i -= 1) {
    if (queue[i].taskId === job.taskId && queue[i].slot === job.slot) {
      pendingSlots.delete(queue[i].slot) // will re-add below via same slot
      queue.splice(i, 1)
    }
  }
  pendingSlots.add(job.slot)
  queue.push(job)

  if (!draining) {
    draining = drainLoop().finally(() => {
      draining = null
    })
  }
}

export function hasPendingProofUpload(slot?: string) {
  if (slot) return pendingSlots.has(slot)
  return pendingSlots.size > 0
}

/** Wait until every queued/in-flight proof upload has settled. */
export function flushProofUploads() {
  return new Promise<void>((resolve) => {
    const check = () => {
      if (pendingSlots.size === 0 && queue.length === 0 && !draining) resolve()
      else setTimeout(check, 80)
    }
    check()
  })
}
