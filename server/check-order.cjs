const b = process.env.PAYPAL_BASE_URL;
const basic = Buffer.from(process.env.PAYPAL_CLIENT_ID + ':' + process.env.PAYPAL_CLIENT_SECRET).toString('base64');
(async () => {
  try {
    const t = await (await fetch(b + '/v1/oauth2/token', {
      method: 'POST',
      headers: { Authorization: 'Basic ' + basic, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(15000),
    })).json();
    const o = await (await fetch(b + '/v2/checkout/orders/' + process.argv[2], {
      headers: { Authorization: 'Bearer ' + t.access_token },
      signal: AbortSignal.timeout(15000),
    })).json();
    console.log('ORDER STATUS:', o.status);
    console.log('PAYER:', o.payer?.email_address ?? 'none yet');
  } catch {
    console.log('NETWORK ERROR');
  }
})();
