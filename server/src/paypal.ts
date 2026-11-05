import { randomUUID } from 'crypto';

let cached: { token: string; exp: number } | null = null;

async function getToken(): Promise<string> {
  if (cached && Date.now() < cached.exp) return cached.token;
  const basic = Buffer.from(
    `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
  ).toString('base64');
  const r = await fetch(`${process.env.PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const j: any = await r.json().catch(() => ({}));
  if (!j.access_token) throw Object.assign(new Error(`PayPal token failed (HTTP ${r.status})`), { paypal: true });
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000 };
  return cached.token;
}

async function ppCall(method: string, path: string, body?: unknown, requestId: string = randomUUID()): Promise<any> {
  const tok = await getToken();
  const r = await fetch(`${process.env.PAYPAL_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${tok}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': requestId,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = j.details?.[0]?.issue ?? j.message ?? j.name ?? 'PayPal error';
    throw Object.assign(new Error(`PayPal ${method} ${path} -> HTTP ${r.status}: ${msg}`), { paypal: true });
  }
  return j;
}

/** Client approves once; funds are held as an authorization. */
export async function createAuthorizeOrder(amount: string, currency: string, jobId: string) {
  const web = process.env.WEB_URL ?? 'https://example.com';
  const j = await ppCall('POST', '/v2/checkout/orders', {
    intent: 'AUTHORIZE',
    purchase_units: [{ reference_id: jobId, amount: { currency_code: currency, value: amount } }],
    payment_source: {
      paypal: { experience_context: { return_url: `${web}/paypal/return?jobId=${jobId}`, cancel_url: `${web}/jobs` } },
    },
  });
  const link = j.links?.find((l: any) => l.rel === 'payer-action' || l.rel === 'approve');
  return { orderId: j.id as string, approveUrl: link?.href as string | undefined };
}

/** Call after the client approved the order. Returns the authorization id. */
export async function authorizeOrder(orderId: string): Promise<string> {
  const j = await ppCall('POST', `/v2/checkout/orders/${orderId}/authorize`, {});
  const authId = j.purchase_units?.[0]?.payments?.authorizations?.[0]?.id;
  if (!authId) throw Object.assign(new Error('Order was not approved or authorized yet'), { paypal: true });
  return authId;
}

/** One partial capture per milestone. requestId makes retries safe (no double capture). */
export async function capturePartial(authId: string, amount: string, currency: string, requestId: string) {
  const j = await ppCall(
    'POST',
    `/v2/payments/authorizations/${authId}/capture`,
    { amount: { currency_code: currency, value: amount }, final_capture: false },
    requestId
  );
  return { captureId: j.id as string, status: j.status as string };
}

/** Pay the worker from the platform account. itemId makes the batch id unique per milestone. */
export async function sendPayout(receiverEmail: string, amount: string, currency: string, itemId: string) {
  const j = await ppCall('POST', '/v1/payments/payouts', {
    sender_batch_header: { sender_batch_id: `kazi-${itemId}`, email_subject: 'Kazi-proof milestone payment' },
    items: [{
      recipient_type: 'EMAIL',
      amount: { value: amount, currency },
      receiver: receiverEmail,
      note: 'Milestone payment',
      sender_item_id: itemId,
    }],
  });
  return { batchId: j.batch_header?.payout_batch_id as string, status: j.batch_header?.batch_status as string };
}
