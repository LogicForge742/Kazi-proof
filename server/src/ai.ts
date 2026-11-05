// The only file that talks to the model provider. Choose with AI_PROVIDER=gemini|anthropic.
export async function askJson(system: string, user: string): Promise<unknown> {
  const key = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;
  const provider = process.env.AI_PROVIDER || 'anthropic';
  if (!key) throw new Error('AI_API_KEY is not set');
  if (!model) throw new Error('AI_MODEL is not set');

  let text = '';
  if (provider === 'gemini') {
    const r = await fetchRetry(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    });
    if (!r.ok) throw new Error(`AI request failed with status ${r.status}`);
    const d = (await r.json()) as any;
    text = (d.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('');
  } else {
    const r = await fetchRetry('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 1500, system, messages: [{ role: 'user', content: user }] }),
    });
    if (!r.ok) throw new Error(`AI request failed with status ${r.status}`);
    const d = (await r.json()) as any;
    text = (d.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text ?? '').join('');
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('AI returned no JSON');
  return JSON.parse(text.slice(start, end + 1));
}

// Same as askJson, but with one image attached (base64, no data: prefix).
export async function askVisionJson(
  system: string,
  user: string,
  imageBase64: string,
  mime = 'image/jpeg'
): Promise<unknown> {
  const key = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;
  const provider = process.env.AI_PROVIDER || 'anthropic';
  if (!key) throw new Error('AI_API_KEY is not set');
  if (!model) throw new Error('AI_MODEL is not set');
  const signal = AbortSignal.timeout(45000);

  let text = '';
  if (provider === 'gemini') {
    const r = await fetchRetry(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ inlineData: { mimeType: mime, data: imageBase64 } }, { text: user }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    });
    if (!r.ok) throw new Error(`AI request failed with status ${r.status}`);
    const d = (await r.json()) as any;
    text = (d.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('');
  } else {
    const r = await fetchRetry('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model,
        max_tokens: 800,
        system,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mime, data: imageBase64 } },
              { type: 'text', text: user },
            ],
          },
        ],
      }),
    });
    if (!r.ok) throw new Error(`AI request failed with status ${r.status}`);
    const d = (await r.json()) as any;
    text = (d.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text ?? '').join('');
  }

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error('AI returned no JSON');
  return JSON.parse(text.slice(start, end + 1));
}

// Retries when the provider is briefly overloaded (503) or rate limiting (429).
async function fetchRetry(url: string, init: RequestInit, tries = 3): Promise<Response> {
  let r = await fetch(url, init);
  for (let i = 1; i < tries && (r.status === 503 || r.status === 429); i++) {
    await new Promise((res) => setTimeout(res, 1500 * i));
    r = await fetch(url, init);
  }
  return r;
}
