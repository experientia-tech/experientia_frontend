# Experientia Web App (Frontend)

React single-page app for Experientia campaign operations. One codebase serves three roles with different layouts:

- **Campaign managers** (desktop dashboard): create geofenced campaigns, manage brands and team, review proofs, export PDFs.
- **Brand supervisors** (desktop dashboard): read-only view of their brand's campaigns, plus PDF export.
- **Field executors** (mobile-first UI): capture GPS-tagged proof photos with the in-browser camera.

The API it talks to lives in [`../experientia_backend`](../experientia_backend/BACKEND.md).

> `README.md` in this folder is the unmodified Vite template. Use this file instead.

---

## 1. Tech stack

| Concern | Choice |
|---|---|
| Build / dev server | Vite 7 + `@vitejs/plugin-react` |
| Language | TypeScript ~5.8 (strict-ish: `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`) |
| UI | React 19, plain CSS (`src/index.css`, ~3.4k lines, CSS variables). No UI kit. |
| Routing | `react-router-dom` v7 (`BrowserRouter`) |
| HTTP | `axios` with interceptors, plus `fetch` for blob downloads and direct S3 PUTs |
| Maps | `leaflet` + `react-leaflet` v5 and `leaflet.markercluster` (lazy-loaded). Tiles from OSM and CARTO. |
| Font | Jost (Google Fonts, loaded in `index.html`) |
| State | React Context + module-level singletons. No Redux or React Query. |

`date-fns` is a dependency but is not imported anywhere. An `.oxlintrc.json` exists, but `oxlint` is not installed and there is no `lint` script.

---

## 2. Getting started

```bash
cd experientia_frontend
npm install
cp .env.example .env     # leave VITE_API_URL empty for local dev
npm run dev              # http://localhost:5173 (host: true → reachable on LAN)
```

The backend must be running on `127.0.0.1:8000`. Vite proxies `/api` and `/uploads` to it (`vite.config.ts`).

| Script | Does |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | `tsc -b` type-check, then `vite build` → `dist/` |
| `npm run preview` | Serve the built `dist/` |

**Testing on a phone:** the executor camera and geolocation APIs need a **secure context**. Over LAN (`http://192.168.x.x:5173`) most mobile browsers block them, so use an HTTPS tunnel or a deployed build.

**Logging in:** use a phone number that exists in the DB and the matching static OTP from the backend env (`MANAGER_OTP` for managers, `EXECUTOR_OTP` for everyone else).

### Environment

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | API origin with no trailing slash, e.g. `https://xxxx.ap-south-1.awsapprunner.com`. **Leave empty locally** so requests go to `/api` through the Vite proxy. Required for production builds because the SPA and API are on different origins. It is baked in at build time. |

---

## 3. Directory layout

```
src/
├── main.tsx                 # React root + BrowserRouter
├── App.tsx                  # Providers + route table + role guards
├── api.ts                   # axios instance, interceptors, every API call
├── axios.d.ts               # Adds `meta: { silent, skipErrorDialog }` to AxiosRequestConfig
├── types.ts                 # DTO types, service-type rules, label/format helpers
├── auth.tsx                 # AuthProvider / useAuth (token in localStorage)
├── ui.tsx                   # UIProvider / useUI (global loader + alert dialog)
├── feedback.ts              # Non-React bridge so axios can drive loader/alerts
├── exportQueue.tsx          # ExportQueueProvider (background PDF jobs, polling)
├── campaignSearch.tsx       # Top-bar search query context
├── index.css                # All styles
├── pages/
│   ├── LandingPage.tsx        /welcome
│   ├── LoginPage.tsx          /login
│   ├── DashboardPage.tsx      /            (manager, supervisor)
│   ├── ExecutorHomePage.tsx   /            (executor)
│   ├── NewCampaignPage.tsx    /campaigns/new
│   ├── CampaignDetailPage.tsx /campaigns/:id
│   ├── ExecutorCampaignPage.tsx /my/campaigns/:id
│   ├── TaskDetailPage.tsx     /tasks/:id   (all roles; behaviour differs)
│   ├── TeamPage.tsx           /team
│   └── DownloadsPage.tsx      /downloads
├── components/
│   ├── Shell.tsx              # Desktop layout (sidebar + topbar); delegates to ExecutorShell
│   ├── ExecutorShell.tsx      # Mobile layout (greeting header, account menu)
│   ├── ExecutorPermissionGate.tsx # Blocks executor UI until camera + location granted
│   ├── CameraCapture.tsx      # Full-screen getUserMedia camera with gallery fallback
│   ├── LocationMap.tsx        # Leaflet map: pick center, radius circle, markers
│   ├── TaskClusterMap.tsx     # Clustered map of completed tasks (lazy-loaded)
│   ├── ProofThumbGrid.tsx     # Proof thumbnails with per-photo mini map
│   ├── TeamPicker.tsx         # Searchable multi-select of users
│   ├── CampaignEditModal.tsx  # Edit campaign fields / center / radius / brand
│   ├── CampaignTeamModal.tsx  # Assign brand / executors / supervisors
│   ├── AddCampaignTasksModal.tsx # Manager: add a task with photos, or N empty tasks
│   ├── AlertDialog.tsx        # Modal alert (success / error / info)
│   └── GlobalLoader.tsx       # Full-screen overlay + inline loader
├── utils/
│   ├── apiError.ts            # FastAPI error → human message
│   ├── mediaUrl.ts            # Prefix relative /api URLs with VITE_API_URL
│   ├── proofUploadQueue.ts    # Serial background upload queue for proofs
│   ├── executorPermissions.ts # Probe/request camera + geolocation, sessionStorage cache
│   ├── leafletCluster.ts      # Lazy UMD loader for leaflet.markercluster
│   └── validation.ts          # Phone / name / OTP sanitizers and validators
└── assets/                  # hero.png, react.svg, vite.svg (unused template assets)
```

---

## 4. Application architecture

### Provider tree (`App.tsx`)

```
<UIProvider>                     global loader + AlertDialog, registers feedback bridge
  <AuthProvider>                 user, login/logout, bootstraps from localStorage token
    <Routes>
      /welcome, /login           public
      <AppLayout>                redirects to /welcome if no user
        <ExportQueueProvider>    only fetches for manager/supervisor
          <CampaignSearchProvider>
            <Shell>              desktop layout, or ExecutorShell + PermissionGate
              <Outlet/>
```

### Routing and role guards

| Path | Manager | Supervisor | Executor |
|---|---|---|---|
| `/welcome`, `/login` | ✓ (redirects to `/` when logged in) | ✓ | ✓ |
| `/` | `DashboardPage` | `DashboardPage` (read-only) | `ExecutorHomePage` |
| `/campaigns/new` | ✓ | → `/` | → `/` |
| `/campaigns/:id` | full controls | view + export | reachable by URL, but not linked from executor UI |
| `/my/campaigns/:id` | – | – | ✓ |
| `/tasks/:id` | review, upload or replace any slot | view only | capture flow |
| `/team` | ✓ | → `/` | → `/` |
| `/downloads` | ✓ | ✓ | → `/` |
| `*` | → `/welcome` | | |

The guards (`ManagerOnly`, `ExportAccess`) are UX only. **The backend enforces all permissions.**

### Auth (`auth.tsx`, `api.ts`)

- `login(phone, otp)` calls `POST /auth/login/json`, stores `access_token` in **`localStorage['token']`**, then calls `GET /auth/me` to get the `User` with its `role`.
- On load, `refresh()` calls `/auth/me` if a token exists. On failure it clears the token.
- The axios request interceptor adds `Authorization: Bearer <token>`.
- There is no refresh token. JWTs last 7 days, and a 401 shows no dialog. The user only lands back on login after a reload, when `/auth/me` fails.

### Global loading and errors (`feedback.ts`, `ui.tsx`, `api.ts`)

The axios interceptors call into `feedback.ts`, a module-level bridge that `UIProvider` registers. Non-React code can drive the UI this way.

- Every request shows the **full-screen loader** unless it is sent with `meta: { silent: true }`.
- Every failed request (except a 401) shows an **error AlertDialog** with `parseApiError()` text, unless it is sent with `meta: { skipErrorDialog: true }`.
- `api.ts` exports a `silent` constant that sets both flags. Background and polling calls use it.
- Pages usually call `showSuccess` / `showError` from `useUI()`, and leave the `catch` empty with the comment `// API errors shown globally`.
- Alerts close on their own: success after 2.8 s, info after 3.2 s. Errors stay until dismissed.
- `GlobalLoaderInline` hides itself while the overlay is visible, so only one loader shows at a time.

### Media URLs (`utils/mediaUrl.ts`)

The backend returns image URLs as `${PUBLIC_BASE_URL}/api/uploads/view?key=…`, an authenticated-origin proxy for the private S3 bucket. `mediaUrl()` leaves absolute, `data:` and `blob:` URLs alone and prefixes relative `/api/...` paths with `VITE_API_URL`. **Wrap every `<img src>` that shows server media with `mediaUrl()`.**

---

## 5. Domain rules mirrored from the backend (`types.ts`)

| Service type | Photos | Slots | Detail form |
|---|---|---|---|
| Auto Hood | 3 | front → side → back | driver (name, 10-digit phone, vehicle no.) |
| Gym | 2 | photo_1, photo_2 | gym (name, location) |
| No Parking Boards / Pole Boards / Shop Branding | 1 | photo_1 | – |
| Other | 3 | photo_1..3 | – |

- `STATUS_LABELS` maps task status `ACCEPTED` to the label **"COMPLETED"**.
- `canExecutorOpenTask()`: an executor can open a task while it still needs photos or an unfinished detail form. Finished tasks are locked for executors.
- `taskLabel()` returns `Task #<sequence_number>`.

> These constants duplicate `experientia_backend/app/media_rules.py`. When the backend returns `capture_slots` / `detail_form` on a task, the page prefers those values; the constants are only a fallback. Change both sides together.

---

## 6. Feature walkthrough

### Manager / supervisor dashboard (`DashboardPage`)

- Loads `GET /campaigns` silently and shows metric cards (total, completed, pending) and campaign cards with logo, status, service and progress.
- Filters by status and service type on the client. The top-bar search (`CampaignSearchProvider`) matches name, service, brand, address and status.
- Supervisors get the same page with "view-only" copy.

### Create campaign (`NewCampaignPage`, manager)

- Pick a brand, or add one inline with an optional logo (upload via presign, then `POST /brands`).
- Choose the service type, geofence radius (0.1–500 km), number of tasks (1–10000), dates, address, description and executors (checkboxes).
- Set the center by clicking the map or typing lat/lng and pressing "Set on map". A green circle shows the capture zone.
- `POST /campaigns` generates the tasks on the server, then the page navigates to `/campaigns/:id`.

### Campaign detail (`CampaignDetailPage`)

- Header: logo, service and brand pills, progress, address and center coordinates.
- Manager actions: **Edit** (`CampaignEditModal`), **Delete** (confirm, then hard delete), **+ Add tasks** (`AddCampaignTasksModal`).
- Manager and supervisor action: **Export to PDF**.
- Partner tiles (Brand, Agencies, Supervisors, Executors) have "+" buttons that open `CampaignTeamModal`. Agencies is a placeholder with no backend.
- Team members table with search and a role filter.
- Task list:
  - **Card view:** server-paginated (24 per page). Filters: Task ID or sequence search (300 ms debounce), status, assignee. "Show All Maps" adds a static OSM thumbnail per card.
  - **Location view:** lazily loads `TaskClusterMap`. It fetches **all `ACCEPTED` tasks** in one request (`limit` up to 10000) and clusters them. Cluster colour: blue under 100, yellow 100–500, green 500+.

### Add tasks modal (`AddCampaignTasksModal`, manager)

- **Add task with photos:** creates one `manager_owned` task, uploads a photo per slot (camera, gallery or file) at the campaign center coordinates, then submits the driver or gym details. The manager owns the task and the geofence check is skipped.
- **Add empty tasks:** 1–500 placeholder tasks, optionally all assigned to one executor.

### Team management (`TeamPage`, manager)

Three tabs:

- **Brands:** create a brand with a logo, or replace an existing logo.
- **Supervisors:** create a supervisor linked to a brand.
- **Executors:** create an executor.

Names accept letters and `' . -` only. Phones must be exactly 10 digits. There is no edit or delete UI, matching the backend.

### Downloads (`DownloadsPage`, `exportQueue.tsx`)

- `ExportQueueProvider` loads `GET /exports` and **polls every 2 s while any job is queued or processing**.
- Rows show queue position, progress percentage, done/total tasks, and Download PDF/ZIP once ready.
- Downloads use `fetch` with the bearer token, then a blob and an object URL. Jobs live 12 h on the server.
- The Shell sidebar shows a badge with the count of active plus ready jobs.

### Executor experience

1. **`ExecutorShell`:** mobile header ("Hello, <name>", date, GPS availability) and an account menu. The header is hidden on `/tasks/*` for a focused capture screen.
2. **`ExecutorPermissionGate`:** blocks the UI until camera **and** location are granted. It probes the Permissions API, prompts when needed, and caches the result in `sessionStorage['experientia.executor.permissions']`. It re-checks when the tab becomes visible again, but only while access is still blocked.
3. **`ExecutorHomePage`:** `GET /my/campaigns`, shown as cards with dates and pending counts.
4. **`ExecutorCampaignPage`:** `GET /my/tasks` (15 per page). A "complete next task" button jumps to `next_open_task_id`. Completed tasks are not clickable.
5. **`TaskDetailPage` (capture mode):**
   - Watches GPS with `watchPosition` (high accuracy) and shows a "GPS ready" status.
   - "Capture <slot>" opens `CameraCapture` for the **next empty slot, in order**. The `MediaStream` is acquired inside the click handler, which iOS Safari requires, and passed in as `initialStream`.
   - `CameraCapture` draws video frames to a canvas, downscales to a 1600 px max edge, and outputs JPEG at quality 0.82. "Use gallery instead" is the fallback.
   - **Optimistic upload:** the preview appears immediately from a blob URL. The file goes to `proofUploadQueue` (serial, deduplicated per task and slot), which runs presign, upload and `POST /tasks/:id/proofs`. `pendingProofsRef` and `mergeTaskProofs()` keep server refetches from wiping proofs that are still uploading. `flushProofUploads()` runs before any reload or detail submit.
   - Once all photos are captured, the driver or gym form appears if the service type needs one. When everything is done the server marks the task `ACCEPTED`.
   - Tapping a thumbnail opens a preview with a map toggle and **Retake** or **Delete**.
   - If the task is no longer openable, the page redirects back to the campaign task list.

### Task detail (manager / supervisor review mode)

- Shows status, coordinates, inside/outside geofence, campaign dates, photo count, flags and notes, the driver or gym details, and a map with the geofence circle and task marker.
- Managers get a per-slot panel: **Upload/Replace file**, **Camera** and **Remove**, with no geofence or ordering rules.
- Supervisors see everything read-only.

---

## 7. Maps

| Component | Tiles | Notes |
|---|---|---|
| `LocationMap` | `tile.openstreetmap.org` | Never remounts when the pin moves; `MapViewSync` pans or fits to the radius instead. The default marker icons load from **unpkg.com**. The default center is India (20.59, 78.96) at zoom 5. |
| `TaskClusterMap` | CARTO `light_all` | `leaflet.markercluster` is a UMD bundle: `ensureMarkerCluster()` sets `window.L` and then dynamically imports the plugin and its CSS. Falls back to a plain layer group if loading fails. Has custom zoom, recenter and fullscreen controls. |
| Card thumbnails | `staticmap.openstreetmap.de` | Plain `<img>`. Depends on a third-party service with no SLA. |

---

## 8. Styling

- One global stylesheet, `src/index.css`. Design tokens are on `:root` (`--bg`, `--ink`, `--accent #2563eb`, `--ok`, `--warn`, `--danger`, `--radius: 14px`, …).
- Class-based BEM-ish names (`executor-*`, `task-cluster-*`, `team-picker-*`, `modal-*`, `btn primary|ghost|small`, `pill`).
- Responsive breakpoints at 1100, 900, 800, 640 and 560 px. Below 1100 px the sidebar becomes an off-canvas drawer with a backdrop and Esc to close.
- Light theme only.
- `.pincode-row` styles are left over from a removed pincode lookup UI; the backend `/api/geo/pincode` endpoint still exists.

---

## 9. Build and deployment

`.github/workflows/deploy-s3.yml` runs on every push to `main` or on manual dispatch:

1. Node 22: `npm ci && npm run build`, with `VITE_API_URL` from secrets.
2. `aws s3 sync dist/` to `FRONTEND_S3_BUCKET` with `--delete`:
   - Hashed assets get `Cache-Control: public,max-age=31536000,immutable`.
   - `index.html` is uploaded separately with `max-age=60,must-revalidate`.
3. CloudFront invalidation of `/*` on `CLOUDFRONT_DISTRIBUTION_ID`.

Required GitHub secrets: `VITE_API_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `FRONTEND_S3_BUCKET`, `CLOUDFRONT_DISTRIBUTION_ID`.

For SPA routing, CloudFront must serve `index.html` on 403/404 responses (deep links such as `/campaigns/123`). This is configured outside the repo. The backend CORS allows any `*.cloudfront.net` origin by regex.

---

## 10. Conventions for contributors

- **All network calls go through `src/api.ts`.** Add typed wrapper functions there, not inline axios calls in components.
- Decide loader and dialog behaviour for each call: use `silent` for background fetches and polling. Otherwise rely on the global dialog and keep `catch` blocks empty.
- Put new DTO fields in `types.ts`, matching the backend Pydantic schemas (snake_case).
- Wrap server media in `mediaUrl()`.
- Executor screens must work on mobile Safari and Chrome. Acquire camera streams inside user gestures and stop tracks on unmount.
- Run `npm run build` before pushing. It is the only type-check, and there are no tests.

---

## 11. Known issues and tech debt

- **Token in `localStorage`** is readable by any XSS. A 401 mid-session shows no dialog and does not redirect to login.
- **Domain rules are duplicated** between `types.ts` and the backend `media_rules.py`.
- **Location view fetches up to 10,000 tasks** in one request (the full campaign DTO). This will be slow for large campaigns.
- `proofUploadQueue` tracks pending uploads **by slot name only**, not by task and slot. Switching tasks while an upload is in flight can make `hasPendingProofUpload` / `flushProofUploads` wait on the wrong task.
- For managers, uploads fall back to the **campaign center** coordinates rather than real GPS, so manager-uploaded proofs all show the same location.
- Unused code: `exportCampaignPdf` (deprecated), `listCampaignExports`, `getCampaignExportJob`, the `date-fns` dependency, the template assets in `src/assets/`, `public/icons.svg`, and the `.pincode-row` CSS.
- `README.md` is still the Vite template.
- External runtime dependencies with no fallback: unpkg (marker icons), Google Fonts, OSM, CARTO and staticmap tiles.
- There is no test suite, and the lint config has no installed linter.
- `CampaignDetailPage.tsx` (~820 lines) and `TaskDetailPage.tsx` (~850 lines) mix data fetching, upload orchestration and rendering. They are good candidates for extracting hooks (`useCampaignDetail`, `useProofCapture`).
