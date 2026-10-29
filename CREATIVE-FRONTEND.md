# Creative campaigns: frontend changes

The backend now supports a new service type, **Creative**. This document lists the frontend work needed to use it. The backend side is already built (see `../experientia_backend/app/routers/creative.py`).

## How it works

1. **Manager creates the campaign.** They pick service type "Creative", upload one image (the creative) and set the number of tasks N. All other campaign options work as usual: brand, center and geofence radius, executors, dates.
2. **Backend generates N images in the background.** Each is a copy of the source with a white strip at the bottom holding a QR code and a unique code such as `CR-AWC4-DPDR`. Each task gets its own image and code.
3. **Executor** opens a task, sees or downloads that task's image, puts it up, then takes **one** photo as proof. This uses the normal camera and proof upload flow, slot `photo_1`, inside the geofence.
4. **Backend verifies the proof** with a nightly job (02:00 IST) that reads the QR, falling back to OCR. The proof ends up **Verified**, **Failed** (shows a different task's code) or **Needs review** (no code found, or the read was unclear).
5. **Manager** sees a report, can approve or reject proofs by hand, and can trigger "Verify now" instead of waiting for the nightly run.

The task is **not completed when the photo is uploaded**. It stays `PENDING` until verified. Then `Task.status` becomes `ACCEPTED` (Verified) or `REJECTED` (Failed), so existing "completed" counts keep working.

---

## 1. API contract

All routes are under `/api`. Every creative route is manager-only except the existing task/proof routes.

### New endpoints

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/uploads/presign-creative` | `{ filename, content_type }` (jpeg/png/webp) | `PresignResponse` (same shape as `/uploads/presign-brand`) |
| GET | `/campaigns/{id}/creative-report?status=&page=1&limit=50` | none | `CreativeReport` |
| POST | `/tasks/{id}/creative-verify` | `{ status: 'VERIFIED' \| 'FAILED', note?: string }` | `CreativeReportItem` |
| POST | `/campaigns/{id}/creative-verify-now` | none | `{ ok: true, queued: number }` |
| POST | `/campaigns/{id}/creative-generate` | none | `CreativeCampaign` (retries image generation after a failure) |

`status` in the report query takes one of the `CreativeVerificationStatus` values below and is case-insensitive. `limit` is at most 500.

### Changed endpoints

- **`POST /campaigns`** accepts `source_image_key` (the `storage_key` from `presign-creative`, after uploading). It is required when `service_type` is `"Creative"`, and `total_tasks` is capped at **1000** for Creative.
- **`GET /campaigns/{id}`** and the create response include `creative: CreativeCampaign | null`. It is `null` for other service types.
- **Every `Task`** (campaign detail, `/tasks/{id}`, `/my/tasks`) includes `creative: CreativeTask | null`. It is `null` for other service types.
- **`POST /tasks/{id}/proofs`** works as before. For Creative tasks:
  - It sets the task to `PENDING_VERIFICATION` instead of completing it.
  - Executors may upload again to `photo_1` while the status is `NOT_SUBMITTED`, `FAILED` or `NEEDS_REVIEW`. The new photo replaces the old one.
  - Otherwise it returns 400 with `"Proof is awaiting verification"` or `"Proof already verified"`.
- **`DELETE /tasks/{id}/proofs/photo_1`** resets a Creative task to `NOT_SUBMITTED`.
- **`/my/tasks` → `next_open_task_id`** skips Creative tasks unless their status is `NOT_SUBMITTED` or `FAILED`.
- **Adding tasks** (`POST /campaigns/{id}/tasks`) and **assigning executors** to a Creative campaign create codes for the new tasks and restart generation. No frontend change is needed beyond refreshing generation status (section 5).

### Create-campaign errors (400, shown by the global error dialog)

`Creative campaigns need a source image` · `Invalid source image key` · `Source image not found — upload it first` · `Source image too large (max 25MB)` · `Source image is not a valid image` · `Source image must be JPG, PNG or WebP` · `Creative campaigns allow at most 1000 tasks`

---

## 2. `src/types.ts`

Add the service type to every service-type map:

```ts
export type ServiceType =
  | 'Auto Hood'
  | 'Gym'
  | 'No Parking Boards'
  | 'Pole Boards'
  | 'Shop Branding'
  | 'Creative'
  | 'Other'

// SERVICE_TYPES: add 'Creative' before 'Other'
// PHOTOS_REQUIRED: Creative: 1
// CAPTURE_SLOTS:   Creative: ['photo_1']
// DETAIL_FORM:     Creative: null
```

New types:

```ts
export type CreativeGenerationStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'

export type CreativeVerificationStatus =
  | 'NOT_SUBMITTED'
  | 'PENDING_VERIFICATION'
  | 'VERIFIED'
  | 'FAILED'
  | 'NEEDS_REVIEW'

export type CreativeDetectionMethod = 'QR' | 'OCR' | 'MANUAL'

export interface CreativeTask {
  verification_code: string
  generated_image_url?: string | null // null until the background job has rendered it
  verification_status: CreativeVerificationStatus
  detected_code?: string | null
  detection_method?: CreativeDetectionMethod | null
  verification_notes?: string | null // reason shown to executor / manager
  proof_uploaded_at?: string | null
  verified_at?: string | null
}

export interface CreativeCampaign {
  source_image_url: string
  generation_status: CreativeGenerationStatus
  generated_count: number
  generation_error?: string | null
}

export interface CreativeReportTotals {
  total_tasks: number
  not_submitted: number
  pending_verification: number
  verified: number
  failed: number
  needs_review: number
  success_rate: number // verified ÷ submitted, percent, 1 decimal
}

export interface CreativeReportItem {
  task_id: string
  sequence_number: number
  executor_user_id: string
  executor_name?: string | null
  verification_code: string
  verification_status: CreativeVerificationStatus
  detected_code?: string | null
  detection_method?: CreativeDetectionMethod | null
  ocr_confidence?: number | null
  generated_image_url?: string | null
  proof_image_url?: string | null
  proof_uploaded_at?: string | null
  verified_at?: string | null
  verification_attempts: number
  verification_notes?: string | null
}

export interface CreativeReport {
  campaign_id: string
  campaign_name: string
  generation: CreativeCampaign
  totals: CreativeReportTotals
  items: CreativeReportItem[]
  page: number
  page_size: number
  items_total: number
}
```

Add to existing interfaces:

```ts
// Task
creative?: CreativeTask | null

// Campaign
creative?: CreativeCampaign | null
```

Add labels for the statuses (use the existing `pill` classes):

```ts
export const CREATIVE_STATUS_LABELS: Record<CreativeVerificationStatus, string> = {
  NOT_SUBMITTED: 'Not submitted',
  PENDING_VERIFICATION: 'Awaiting check',
  VERIFIED: 'Verified',
  FAILED: 'Failed',
  NEEDS_REVIEW: 'Needs review',
}
```

**Update `canExecutorOpenTask`.** For Creative tasks the photo count no longer decides it, so check the creative status first. Without this, a Failed task can never be retaken, because it already has one photo. This must match the backend's `EXECUTOR_OPEN` set.

```ts
export function canExecutorOpenTask(
  task: Pick<Task, 'proof_image_count' | 'proof_images' | 'required_photos' | 'detail_form' | 'details_complete' | 'creative'>
) {
  if (task.creative) {
    const s = task.creative.verification_status
    return s === 'NOT_SUBMITTED' || s === 'FAILED'
  }
  // ...existing logic unchanged
}
```

---

## 3. `src/api.ts`

`createCampaign` payload: add `source_image_key?: string | null`.

New functions. They follow the existing `uploadBrandLogo` / `uploadFileToStorage` pattern:

```ts
export async function uploadCreativeSource(file: File): Promise<string> {
  const { data: presign } = await api.post<{
    upload_url: string
    storage_key: string
    public_url: string
    use_direct_put: boolean
  }>(
    '/uploads/presign-creative',
    { filename: file.name, content_type: file.type || 'image/jpeg' },
    silent
  )
  await uploadFileToStorage(presign, file)
  return presign.storage_key
}

export async function getCreativeReport(
  campaignId: string,
  params?: { status?: CreativeVerificationStatus; page?: number; limit?: number },
  opts?: { silent?: boolean }
) {
  const { data } = await api.get<CreativeReport>(`/campaigns/${campaignId}/creative-report`, {
    params,
    ...(opts?.silent ? silent : {}),
  })
  return data
}

export async function manualVerifyCreative(taskId: string, status: 'VERIFIED' | 'FAILED', note?: string) {
  const { data } = await api.post<CreativeReportItem>(`/tasks/${taskId}/creative-verify`, { status, note })
  return data
}

export async function creativeVerifyNow(campaignId: string) {
  const { data } = await api.post<{ ok: boolean; queued: number }>(
    `/campaigns/${campaignId}/creative-verify-now`
  )
  return data
}

export async function retryCreativeGeneration(campaignId: string) {
  const { data } = await api.post<CreativeCampaign>(`/campaigns/${campaignId}/creative-generate`)
  return data
}
```

Executor proof upload needs **no change**. `uploadProofFast` and `proofUploadQueue` already send `slot: 'photo_1'`.

---

## 4. `src/pages/NewCampaignPage.tsx` (manager)

When `serviceType === 'Creative'`:

- **Image field.** Show a "Creative image" file input (`accept="image/jpeg,image/png,image/webp"`) with a preview, plus a hint: *"Each task gets its own copy of this image with a unique code printed below it."*
- **Client-side checks.** Require a file, reject anything over 25 MB, and set the task-count input to `max={1000}`. Show validation through `showError`, like the existing checks.
- **On submit.** Call `uploadCreativeSource(file)` first, then pass the returned key as `source_image_key` to `createCampaign`. Keep the key in state for the selected file, so that if creation fails and the manager resubmits, the image isn't uploaded again. Clear the key when the file changes.
- **Other fields.** Everything else on the form (brand, map pin, radius, executors, dates) stays the same. The photos-per-task summary shows 1, from `PHOTOS_REQUIRED`.
- **After create.** Navigate to the campaign as today. Generation then runs in the background (section 5).

---

## 5. `src/pages/CampaignDetailPage.tsx` (manager and supervisor)

Do all of this only when `campaign.creative` is set.

### Generation status banner

| `generation_status` | Show |
|---|---|
| `PENDING` / `PROCESSING` | "Generating images… `generated_count` / `task_count`" with a progress bar. **Poll** `getCampaign(id, …, { silent: true })` every 3 s until the status changes. |
| `COMPLETED` | Nothing, or a small "Source image" thumbnail (`source_image_url`) next to the campaign info. |
| `FAILED` | An error banner showing `generation_error` and a **Retry** button that calls `retryCreativeGeneration`, then resumes polling. Only missing images are rendered again. |

Restart polling after **Add tasks** (`AddCampaignTasksModal`) and after assigning executors, because both queue generation for the new tasks.

### Task grid

- Show the `task.creative.generated_image_url` thumbnail. When it's null, show a "Generating…" placeholder.
- Show `verification_code` and a creative status pill in place of, or next to, the existing `STATUS_LABELS` pill.

### "Creative report" tab or section (managers only, since the endpoint is manager-only)

- **Totals row.** Tiles for Total, Not submitted, Awaiting check, Verified, Failed, Needs review, and Success rate (%).
- **Status filter.** Passes `?status=` and defaults to all. Default the view to `NEEDS_REVIEW` when that count is above zero.
- **Paginated table.**
  - Columns: Task #, Executor, Code, Generated image, Proof photo, Status, Detected code / method (`QR` / `OCR` with `ocr_confidence` / `MANUAL`), Notes, Uploaded at.
  - Show the generated image and the proof photo side by side so the manager can compare them. Open both in the existing preview or lightbox.
- **Row actions.** **Approve** and **Reject** call `manualVerifyCreative(taskId, 'VERIFIED' | 'FAILED', note)`. Ask for an optional note on reject. Disable both when there's no `proof_image_url`, because the backend returns 400. Replace the row with the response, then refetch the totals.
- **"Verify now" button.** Calls `creativeVerifyNow` and shows *"Queued N proofs for verification"*. Verification runs in the background, so refetch the report after ~10 s, or offer a Refresh button. Disable it when `pending_verification === 0`.

Supervisors don't get the report. They still see the generated images, codes and statuses through `task.creative` in the normal campaign view.

---

## 6. `src/pages/TaskDetailPage.tsx`

### Executor view

- **Above the camera**, show the task's generated image (`mediaUrl(task.creative.generated_image_url)`), its code in large monospace text, and a **Download image** button.
  - `<a download>` is ignored for cross-origin URLs, so download through `fetch(url) → blob → URL.createObjectURL` with filename `${verification_code}.jpg`.
  - `/api/uploads/view` doesn't need auth and sends `Access-Control-Allow-Origin: *`.
  - If the image is still null, show "Your creative is being prepared, check back shortly" and keep capture enabled. The code is already known, and verification only needs the photo.
- **Capture flow.** One slot (`photo_1`), unchanged, with the geofence still enforced. After upload, show *"Photo submitted — it will be checked automatically"*. The task then leaves the executor's open list, because `canExecutorOpenTask` returns false while it's `PENDING_VERIFICATION`.
- **When the status is `FAILED`.**
  - The task already has a `photo_1`, so the current "next empty slot" logic hides the camera. Add a **Retake photo** action that captures into `photo_1` again; the backend replaces the old photo.
  - Show `verification_notes` as the reason, e.g. *"Photo shows code CR-…, which belongs to task #7"*.
  - Treat `photosDone` as false in this state.
- **Upload rejected.** A 400 with `"Proof is awaiting verification"` or `"Proof already verified"` means the status changed on the server. Refresh the task and navigate back, like the existing redirect.

### Manager view

- **Creative panel.** Show the code, generated image, status pill, detected code and method, notes, and timestamps.
- **Approve / Reject buttons** (same calls as the report). Show them when a proof exists. After the call, refresh the task.
- **Deleting a proof.** This already works and resets the task to `NOT_SUBMITTED`, so the executor can capture again. No extra handling needed beyond refreshing.

---

## 7. `src/pages/ExecutorCampaignPage.tsx` and `ExecutorHomePage.tsx`

- With `canExecutorOpenTask` updated (section 2), the task list's open and locked states work without other changes.
- Show the creative status pill on each Creative task card, so executors can see "Awaiting check", "Failed – retake" and "Verified" at a glance. Show the code on the card as well.

---

## 8. No changes needed

- **`DashboardPage`.** The service filter is built from the campaigns, so "Creative" appears automatically, and completed counts use `ACCEPTED`, which the backend sets on Verified.
- **`CampaignEditModal`.** Service type and source image can't be edited after creation, and the backend doesn't accept changes to them.
- **PDF export.** It works as before, using the proof photos.
- **Offline proof queue.** No change.

## 9. Not available yet (backend)

- Downloading all generated images as a ZIP for printing. Today they're only available one at a time, through `generated_image_url`.
- Notifying executors when their proof fails. They only see it the next time they open the app.

---

## 10. Test checklist

- [ ] The Creative option appears on New campaign. Submitting without an image or with more than 1000 tasks is blocked.
- [ ] Create with 5 tasks and 1 executor. The progress banner counts up to 5/5 and then disappears.
- [ ] Each task shows a different generated image and code. The downloaded file opens and the QR scans to the same code.
- [ ] Executor: capture inside the geofence → "submitted" message → the task leaves the open list.
- [ ] Executor: capture outside the geofence is still blocked.
- [ ] Manager: "Verify now" → after a short wait the task shows Verified and the campaign's completed count goes up.
- [ ] Use a photo of **another task's** image as proof → Failed with the owning task in the notes. The executor sees **Retake**, retakes the photo, and it goes back to Awaiting check.
- [ ] A photo with no code → Needs review. Approve from the report → Verified.
- [ ] Reject with a note → the task shows Failed and the note.
- [ ] Delete the proof as manager → Not submitted, and the executor can capture again.
- [ ] Add 2 tasks to the campaign → generation runs again for only those 2.
- [ ] Supervisor: sees the images and statuses with no report tab and no approve/reject.
- [ ] Other service types: no visual or behaviour change.
