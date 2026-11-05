# Kazi-proof API Reference

Backend for Kazi-proof: milestone-based escrow payments for physical work (carpentry, construction, repairs, crafts). A client describes a job, the AI splits it into payment milestones, the client funds it once through PayPal, the worker submits photo proof per milestone, and the client approves each one to release that milestone's payment.

- Base URL (local): `http://localhost:4000`
- Stack: Node.js, Express, Prisma, PostgreSQL, PayPal sandbox, Gemini or Anthropic for the AI
- Source: `server/src` (`auth.ts`, `jobs.ts`, `milestones.ts`, `scoping.ts`, `verify.ts`, `ai.ts`, `paypal.ts`, `stateMachine.ts`)
- CORS is open (`Access-Control-Allow-Origin: *`), so a frontend on another port can call the API.

---

## 1. Concepts

### Roles
Every user is either a `CLIENT` (pays for the work) or a `WORKER` (does the work). Routes are locked to one role. A route marked (CLIENT) rejects a worker token, and the reverse.

### Demo users (seeded)
| Email | Role | Password |
|---|---|---|
| client@kazi.demo | CLIENT | demo1234 |
| worker@kazi.demo | WORKER | demo1234 |

### Authentication
Log in to get a token, then send it on every other request:

    Authorization: Bearer <token>

### Money format
Amounts in responses are **strings** (for example `"300"`, `"1000"`), because they come from a database decimal column. Parse them in the frontend. Amounts in requests are plain JSON numbers.

### Error format
Errors return a JSON body with an `error` message:

    { "error": "Job not found" }

Common status codes: `400` invalid input, `404` not found (or not yours), `409` the action is not allowed in the current state, `502` an external service (AI or PayPal) failed. The exact code for a missing or wrong token comes from `auth.ts` and has not been verified here.

### How the money works
1. The client approves **one** PayPal authorization for the whole job total.
2. Each milestone is released by a **separate partial capture** of that authorization.
3. The worker is paid out from the platform's PayPal account after each capture.
4. Money moves **only** when the client approves a milestone. An AI verdict never moves money.

---

## 2. Statuses

### Job status
`DRAFT` -> `AWAITING_FUNDING` -> `FUNDED` -> `COMPLETED`

- `DRAFT`: created, not yet funded.
- `AWAITING_FUNDING`: `/fund` was called, the PayPal order exists, the client has not confirmed.
- `FUNDED`: PayPal authorization is held. The worker may start work.
- `COMPLETED`: every milestone is released. A reputation event is written for the worker.

### Milestone status
`PLANNED` -> `ACTIVE` -> `SUBMITTED` -> (`UNDER_REVIEW` or `FLAGGED`) -> `APPROVED` -> `RELEASED`

| Status | Meaning |
|---|---|
| PLANNED | Not started. |
| ACTIVE | Worker is working on it. |
| SUBMITTED | Photo received. Passes through this state instantly. |
| UNDER_REVIEW | Photo passed all automatic checks. Waiting for the client. |
| FLAGGED | At least one automatic check failed. Waiting for the client, who can still approve. |
| APPROVED | Client approved. Payment is being captured and paid out. |
| RELEASED | Payment captured and payout sent. Final. |
| DISPUTED | Client rejected the evidence. The worker can restart it. |

### Allowed transitions (enforced in `stateMachine.ts`)
| From | Allowed next |
|---|---|
| PLANNED | ACTIVE |
| ACTIVE | SUBMITTED |
| SUBMITTED | UNDER_REVIEW, FLAGGED |
| UNDER_REVIEW | APPROVED, FLAGGED, DISPUTED |
| FLAGGED | SUBMITTED, APPROVED, DISPUTED |
| APPROVED | RELEASED |
| DISPUTED | ACTIVE, APPROVED |
| RELEASED | (none) |

Any other move returns `409`.

---

## 3. Auth

### POST /api/auth/login
Request:

    { "email": "client@kazi.demo", "password": "demo1234" }

Response `200`: a JSON object containing `token`. Other fields in the response have not been verified. Use the `token` value in the `Authorization` header.

---

## 4. Jobs

### POST /api/jobs/scope (CLIENT): AI preview
Turns a plain description into 2 to 4 payment milestones. **Nothing is saved and no money moves.** Call it as often as you like while the client edits the description.

Request:

    {
      "description": "Build 20 wooden school desks for a primary school in Kiambu. The carpenter supplies the timber and delivers them.",
      "totalAmount": 1000
    }

| Field | Rules |
|---|---|
| description | string, 10 to 2000 characters |
| totalAmount | positive number, at most 5000 (USD) |

Response `200`:

    {
      "plan": {
        "title": "Build and Deliver 20 Wooden School Desks",
        "milestones": [
          { "title": "Material Sourcing and Cut List", "amount": 300, "criteria": "Photos showing stacked rough timber, cut legs, and tabletops piled in the workshop." },
          { "title": "Assembly and Joining", "amount": 400, "criteria": "Photos showing 20 fully assembled wooden desk frames with bolted joints and sanded surfaces." },
          { "title": "Finishing and Delivery", "amount": 300, "criteria": "Photos showing all 20 finished desks coated in clear varnish, arranged inside the primary school classroom." }
        ]
      }
    }

Guarantees (enforced in code, not left to the AI):
- 2 to 4 milestones, in the order the work happens.
- Amounts add up to exactly `totalAmount` (the last milestone absorbs any rounding difference).
- No single milestone is more than 50% of the total.
- `criteria` describes what must be visible in photos.
- The description is treated as untrusted text. Instructions inside it are ignored.

Errors: `400` for invalid input; `502` `{ "error": "AI scoping failed, please try again" }` if the AI call fails or returns something unusable. Tell the user to retry.

### POST /api/jobs (CLIENT): create a job
Saves the job and its milestones. Pass the (possibly edited) milestones from `/scope`.

Request:

    {
      "title": "Build and Deliver 20 Wooden School Desks",
      "description": "Build 20 wooden school desks for a primary school in Kiambu.",
      "workerEmail": "worker@kazi.demo",
      "milestones": [
        { "title": "Frames", "amount": 500, "criteria": "Photos showing 20 desk frames." },
        { "title": "Finish", "amount": 500, "criteria": "Photos showing 20 varnished desks." }
      ],
      "siteLat": -1.17,
      "siteLng": 36.83,
      "currency": "USD",
      "autoApproveLimit": 0
    }

| Field | Rules |
|---|---|
| title, description | non-empty strings |
| workerEmail | valid email that belongs to an existing **WORKER** account |
| milestones | at least 1; each needs `title`, `criteria` (non-empty) and `amount` (positive number) |
| siteLat, siteLng | optional. If set, photo locations are checked against this site |
| currency | optional, 3 letters, default `USD` |
| autoApproveLimit | optional, default 0 (stored, not used by any route yet) |

The job total is **computed from the milestones**. The client cannot send a total.

Response `201`: `{ "job": { ... } }` with status `DRAFT` and every milestone `PLANNED`. Milestones get `position` 1, 2, 3... in the order sent.

Errors: `400` invalid job (with `details`), or `workerEmail must belong to a worker account`.

### GET /api/jobs
Returns `{ "jobs": [ ... ] }`: every job where the caller is the client or the worker, newest first, each with its milestones in order.

### GET /api/jobs/:id
Returns `{ "job": { ... } }` with milestones in order. Returns `404` if the job does not exist or the caller is neither its client nor its worker.

### POST /api/jobs/:id/fund (CLIENT): step A of funding
Creates a PayPal order for the job total.

Response `200`:

    { "orderId": "8FL706591S983323M", "approveUrl": "https://www.sandbox.paypal.com/checkoutnow?token=8FL706591S983323M" }

The frontend must send the client's browser to `approveUrl`. The client logs into PayPal and approves. PayPal then redirects the browser to:

    http://localhost:5173/paypal/return?jobId=<id>&token=<orderId>&PayerID=<payer>

The frontend needs a page at `/paypal/return` that calls `/confirm-funding` for that `jobId`.

Errors: `404` not found or not your job; `409 Job is already funded`; `409 Cannot fund a job in status ...`.

### POST /api/jobs/:id/confirm-funding (CLIENT): step B of funding
Call this **after** the client approved on PayPal. It authorizes the order and marks the job funded.

Response `200`: `{ "job": { ... } }` with `"status": "FUNDED"` and a non-null `paypalAuthId`.

Safe to call twice: if the job is already confirmed it just returns the job. Errors: `409 Call /fund first` if no order exists or the status is wrong.

### Job object

| Field | Notes |
|---|---|
| id | string |
| title, description | strings |
| status | see section 2 |
| clientId, workerId | user ids |
| siteLat, siteLng | numbers or null |
| totalAmount | string, sum of milestones |
| currency | 3-letter code |
| autoApproveLimit | string |
| paypalOrderId, paypalAuthId | null until funding steps happen |
| createdAt | ISO timestamp |
| milestones | array, ordered by `position` |

---

## 5. Milestones

### Milestone object

| Field | Notes |
|---|---|
| id, jobId | strings |
| position | 1, 2, 3... Work must happen in this order |
| title | string |
| amount | string |
| criteria | what must be visible in the photo |
| challengeCode | currently always null |
| status | see section 2 |

### POST /api/milestones/:id/start (WORKER)
Starts a milestone. Also restarts a `DISPUTED` one.

Response `200`: `{ "id": "...", "status": "ACTIVE" }`

Rules: the caller must be the job's worker (else `404`); the job must be `FUNDED` (else `409 Job is not funded yet`); every earlier milestone must be `RELEASED` (else `409 Earlier milestones must be released first`).

### POST /api/milestones/:id/submit (WORKER): photo proof
Request:

    {
      "photoBase64": "<base64 of the JPEG>",
      "capturedAt": "2026-11-05T11:08:00Z",
      "lat": -1.2921,
      "lng": 36.8219
    }

| Field | Rules |
|---|---|
| photoBase64 | required, base64 string. A `data:image/jpeg;base64,` prefix is accepted and stripped. Decoded size at most 8 MB |
| capturedAt | required, a valid date string. Use the time the photo was taken |
| lat, lng | optional numbers (the worker's location at capture) |

The milestone must be `ACTIVE` or `FLAGGED` (a flagged milestone can be resubmitted).

Response `201`:

    {
      "submissionId": "cmw3fza6q0005pseupuig6er0",
      "status": "FLAGGED",
      "flags": ["AI_NO_MATCH"],
      "distanceM": null,
      "aiVerdict": "NO_MATCH",
      "aiReason": "The photo shows people working with wood and a sewing machine in a workshop, but there are no desk frames visible."
    }

**Automatic checks.** Any flag makes the status `FLAGGED`. No flags makes it `UNDER_REVIEW`.

| Flag | Raised when |
|---|---|
| STALE_PHOTO | `capturedAt` is more than 24 hours ago |
| FUTURE_TIMESTAMP | `capturedAt` is more than 5 minutes in the future |
| NO_LOCATION | `lat` or `lng` missing |
| LOCATION_FAR | the job has a site set and the photo is more than 200 m from it |
| AI_NO_MATCH | the AI judges the photo does not show what `criteria` asks for |

**AI verdict (advisory only).** `aiVerdict` is `MATCH`, `PARTIAL` or `NO_MATCH`, and `aiReason` is one or two plain sentences. Only `NO_MATCH` adds a flag. The AI call is retried up to 3 times when the provider is briefly overloaded (503) or rate limiting (429). If it still fails or times out (45 s limit), the check is skipped: `aiVerdict` and `aiReason` come back `null`, the submission still succeeds, and the client reviews it by hand. The AI never approves or rejects anything by itself.

`distanceM` is the distance in metres between the photo and the job site, or `null` when the job has no site or the photo has no location.

Errors: `400` invalid submission, bad date, or empty/oversized photo; `409 Cannot submit while milestone is <status>`; `404`.

### POST /api/milestones/:id/approve (CLIENT): moves the money
Approves the milestone (from `UNDER_REVIEW`, `FLAGGED` or `DISPUTED`), then captures the payment and sends the payout.

Response `200`: `{ "id": "...", "status": "RELEASED" }`

If the last milestone of the job is released, the job becomes `COMPLETED` and a reputation event is recorded for the worker.

If PayPal fails after approval, the response is an error (`502` or `500`, or `409`) such as:

    {
      "error": "...",
      "milestoneStatus": "APPROVED",
      "hint": "Approved but not paid yet. Retry with POST /api/milestones/<id>/release"
    }

The milestone stays `APPROVED`. Show the hint and offer a retry button that calls `/release`.

The payout goes to the worker's email, or to `PAYOUT_RECEIVER_EMAIL` from `.env` when that is set (used in the sandbox so the payout lands in a test account).

### POST /api/milestones/:id/release (CLIENT): retry payment
For a milestone stuck in `APPROVED`. Safe to call repeatedly: capture and payout are idempotent, so the worker is never paid twice. Response `200`: `{ "id": "...", "status": "RELEASED" }`.

### POST /api/milestones/:id/dispute (CLIENT)
Rejects the evidence (from `UNDER_REVIEW` or `FLAGGED`). Response `200`: `{ "id": "...", "status": "DISPUTED" }`. The worker restarts it with `/start`, then submits new proof.

### GET /api/milestones/:id (client or worker of the job)
Returns the milestone with its history:

    {
      "milestone": {
        "id": "...", "position": 1, "title": "Frames", "amount": "5", "criteria": "...", "status": "RELEASED",
        "submissions": [
          { "id": "...", "photoPath": "uploads/<file>.jpg", "capturedAt": "...", "lat": -1.29, "lng": 36.82,
            "distanceM": null, "flags": ["AI_NO_MATCH"], "createdAt": "..." }
        ],
        "payment": { "captureId": "...", "payoutId": "...", "amount": "5", "status": "PAYOUT_SENT" }
      }
    }

Submissions are newest first. `payment` is `null` until the client approves. Payment status moves `PENDING` -> `CAPTURED` -> `PAYOUT_SENT`. In the PayPal sandbox a payout can stay pending for a while, which is normal.

Each submission also has a `reports` array with the stored AI check, so the verdict is still there after a page reload:

    "reports": [
      { "id": "...", "verdict": "MISMATCH", "confidence": 0.95,
        "summary": "The photo shows artisans working on wood carving ... but there are no desk frames visible." }
    ]

`verdict` here uses different names from `/submit`'s `aiVerdict`:

| `/submit` aiVerdict | Stored `reports[].verdict` |
|---|---|
| MATCH | MATCHES |
| PARTIAL | UNCLEAR |
| NO_MATCH | MISMATCH |

`confidence` is a number from 0 to 1 (how sure the AI is). `reports` is an empty array when the AI check was skipped, for example if the AI service was down. The client then reviews the photo by hand.

### GET /api/milestones/:id/photo (client or worker of the job)
Returns the **newest** photo submitted for the milestone as an image (`image/jpeg`).

Errors: `404 Milestone not found` (also when it isn't your job), `404 No photo submitted yet`, `404 Photo file not found`.

A plain `<img src="...">` tag cannot send the `Authorization` header, so it would get a 404. Fetch the photo with the header, turn it into a blob, and use that as the image source:

    async function loadPhoto(milestoneId, token) {
      const r = await fetch(`http://localhost:4000/api/milestones/${milestoneId}/photo`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) return null;
      return URL.createObjectURL(await r.blob()); // use as <img src={...}>
    }

---

## 6. Happy path, step by step

| Step | Who | Call |
|---|---|---|
| 1 | Client | `POST /api/auth/login` |
| 2 | Client | `POST /api/jobs/scope` (preview, repeat as needed) |
| 3 | Client | `POST /api/jobs` (save, status DRAFT) |
| 4 | Client | `POST /api/jobs/:id/fund`, then open `approveUrl` |
| 5 | Client | PayPal approval, redirect to `/paypal/return`, then `POST /api/jobs/:id/confirm-funding` (FUNDED) |
| 6 | Worker | `POST /api/auth/login`, then `POST /api/milestones/:id/start` (milestone 1) |
| 7 | Worker | `POST /api/milestones/:id/submit` (photo) |
| 8 | Client | `GET /api/milestones/:id` to review, then `POST .../approve` or `POST .../dispute` |
| 9 | Both | Repeat 6 to 8 for each milestone. After the last release the job is COMPLETED |

This exact flow was run end to end on the PayPal sandbox: real buyer approval, two milestones released, payment records with capture and payout ids, and the job reached `COMPLETED`.

---

## 7. Frontend notes

- Keep the token in memory or storage and attach it to every request.
- Send the photo as base64 JSON. Strip nothing. A `data:` prefix is fine.
- Build a `/paypal/return` page (the backend is configured to redirect there on port 5173) that reads `jobId` from the query string and calls `/confirm-funding`.
- Poll or refetch `GET /api/jobs/:id` to show milestone statuses.
- Show `flags` and `aiReason` to the client as hints, and make clear the decision is theirs.
- Disable "Start" on a milestone until the one before it is `RELEASED`.

---

## 8. Known gaps

- The JSON body size limit for photo uploads has only been tested with a small photo. Large phone photos may need a higher limit in `index.ts`.
- `autoApproveLimit` is stored but not used yet.
- `challengeCode`, `exif` and `phash` columns exist but are not used yet.
- Sandbox only: payouts and captures use PayPal sandbox accounts.

---

## 9. Running the backend locally

    cd ~/Kazi-proof/server
    npm run dev          # starts the API on http://localhost:4000

Required in `~/Kazi-proof/.env` (names only, never commit values): `AI_API_KEY`, `AI_PROVIDER` (`gemini` or `anthropic`), `AI_MODEL`, plus the PayPal sandbox credentials and `DATABASE_URL`.

Tip: do not `source ../.env` in your shell and then run the server. Exported shell variables override the values the server reads from `.env`, which caused a stale `AI_MODEL` earlier. If that happens, run `unset AI_API_KEY AI_PROVIDER AI_MODEL`.
