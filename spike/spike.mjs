// spike/spike.mjs: throwaway test of PayPal authorize + partial capture + payout
const BASE = process.env.PAYPAL_BASE_URL;
const basic = Buffer.from(
  `${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`
).toString('base64');

async function getToken() {
  const r = await fetch(`${BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const j = await r.json();
  if (!j.access_token) { console.error('TOKEN FAILED', r.status, j.error); process.exit(1); }
  return j.access_token;
}

async function call(tok, method, path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${tok}`,
      'Content-Type': 'application/json',
      'PayPal-Request-Id': crypto.randomUUID(),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  console.log(`\n${method} ${path} -> HTTP ${r.status}`);
  return { status: r.status, json: j };
}

const [mode, arg] = process.argv.slice(2);
const tok = await getToken();

if (mode === 'create') {
  const { json } = await call(tok, 'POST', '/v2/checkout/orders', {
    intent: 'AUTHORIZE',
    purchase_units: [{ amount: { currency_code: 'USD', value: '100.00' } }],
    payment_source: { paypal: { experience_context: {
      return_url: 'https://example.com/return',
      cancel_url: 'https://example.com/cancel',
    } } },
  });
  console.log('ORDER ID:', json.id, 'STATUS:', json.status);
  const link = json.links?.find(l => l.rel === 'payer-action' || l.rel === 'approve');
  console.log('OPEN THIS LINK AND APPROVE AS THE CLIENT:\n', link?.href);
}

if (mode === 'finish') {
  const a = await call(tok, 'POST', `/v2/checkout/orders/${arg}/authorize`, {});
  const authId = a.json.purchase_units?.[0]?.payments?.authorizations?.[0]?.id;
  console.log('AUTH ID:', authId, 'STATUS:', a.json.status);
  if (!authId) { console.log(JSON.stringify(a.json, null, 2)); process.exit(1); }

  // Exercise multiple partial captures before checking the authorization's final status.
  for (const n of [1, 2]) {
    const c = await call(tok, 'POST', `/v2/payments/authorizations/${authId}/capture`, {
      amount: { currency_code: 'USD', value: '30.00' },
      final_capture: false,
    });
    console.log(`CAPTURE ${n}:`, c.json.id, c.json.status, c.json.name ?? '', c.json.message ?? '');
  }
  const g = await call(tok, 'GET', `/v2/payments/authorizations/${authId}`);
  console.log('AUTH NOW:', g.json.status);
}

if (mode === 'payout') {
  const p = await call(tok, 'POST', '/v1/payments/payouts', {
    sender_batch_header: { sender_batch_id: `spike-${Date.now()}`, email_subject: 'Spike payout' },
    items: [{
      recipient_type: 'EMAIL',
      amount: { value: '10.00', currency: 'USD' },
      receiver: arg,
      note: 'spike',
      sender_item_id: '1',
    }],
  });
  console.log(JSON.stringify(p.json, null, 2));
}
