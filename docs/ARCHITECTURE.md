# Architecture

## Principle
AI advises. Code decides. Only backend code moves money, and only on a valid
state transition. An AI report never triggers a payment by itself.

## Who does what
| Task | Done by |
|---|---|
| Turn a job description into milestones, prices, "done" criteria | AI |
| Design the challenge for each milestone (what must be shown) | AI |
| Read photos: count items, check the challenge code, compare to prior photos | AI |
| Write a plain-language risk summary and a recommendation | AI |
| Hold and release money (PayPal authorize + capture) | Backend + PayPal |
| Enforce state transitions, limits and the client's auto-approve rule | Backend |
| GPS distance, timestamp, EXIF, duplicate-photo hash | Backend |
| Reputation record | Backend |

## Payment flow (confirmed in the sandbox spike)
1. Client approves the job. Create an order with intent AUTHORIZE for the total.
2. Client approves it on PayPal. Backend authorizes the order and stores the
   authorization ID. The funds are now held.
3. Each approved milestone: capture its amount with final_capture=false.
4. The last milestone uses final_capture=true. If the job is cancelled,
   void the remaining authorization.
5. Backend pays the worker from the platform account with PayPal Payouts.
   (payout test pending)

Limits from PayPal's docs: the hold lasts 29 days, the honor period is 3 days,
and re-authorization is possible within the 29 days. Jobs are scoped to about
4 weeks. Production payouts to Kenya would need a local rail such as M-Pesa.

## Milestone state machine
PLANNED -> ACTIVE -> SUBMITTED -> UNDER_REVIEW -> APPROVED -> RELEASED
Side branches: FLAGGED (checks failed or suspicious), DISPUTED (client rejects).
Transitions are validated in one function. Nothing else writes the status.

## Data model
User, Job, Milestone, Submission, AiReport, Payment, ReputationEvent

- Job: client, worker, site GPS, total, auto-approve limit, PayPal order and
  authorization IDs
- Milestone: order, amount, criteria, status, challenge code
- Submission: photo, captured-at, GPS, EXIF, perceptual hash, flags
- AiReport: verdict, confidence, summary, raw model output
- Payment: capture ID, payout ID, amount, status
- ReputationEvent: worker, job, outcome, date

## Fraud layers and build order
1. Client approval and limits   2. Live capture + GPS   3. EXIF check
4. Duplicate-image hash   5. Challenge code   6. Small milestones
7. Reputation record
Build order: 2 and 5, then 1, 6, 7, then 3 and 4. Cut 3 or 4 first.

## Stack
TypeScript. Express + Prisma + PostgreSQL. React + Vite + Tailwind.
Hosting on Render. AI: LLM with JSON output for scoping, vision model for photos.