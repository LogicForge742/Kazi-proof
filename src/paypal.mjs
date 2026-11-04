const BASE = "https://api-m.sandbox.paypal.com";

// Exchange the app credentials for a short-lived access token used by API calls.
async function token() {
  const a = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_SECRET}`).toString("base64");
  const r = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${a}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  return (await r.json()).access_token;
}

async function call(path, body, requestId) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await token()}`,
      "Content-Type": "application/json",
      ...(requestId && { "PayPal-Request-Id": requestId }),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(`PayPal ${r.status}`), { data });
  return data;
}

// Jobs use an authorization so milestone amounts can be captured separately later.
export const createOrder = (total, returnUrl, cancelUrl) =>
  call("/v2/checkout/orders", {
    intent: "AUTHORIZE",
    purchase_units: [{ amount: { currency_code: "USD", value: total } }],
    payment_source: { paypal: { experience_context: { return_url: returnUrl, cancel_url: cancelUrl, user_action: "PAY_NOW" } } },
  });

export const authorizeOrder = (orderId) => call(`/v2/checkout/orders/${orderId}/authorize`);

export const capture = (authId, amount, isFinal, requestId) =>
  call(`/v2/payments/authorizations/${authId}/capture`,
    { amount: { currency_code: "USD", value: amount }, final_capture: isFinal }, requestId);

export const voidAuth = (authId) => call(`/v2/payments/authorizations/${authId}/void`);

export const payout = (email, amount, batchId, note) =>
  call("/v1/payments/payouts", {
    sender_batch_header: { sender_batch_id: batchId, email_subject: "Kazi-proof payment" },
    items: [{ recipient_type: "EMAIL", receiver: email, sender_item_id: batchId,
              amount: { value: amount, currency: "USD" }, note }],
  });
