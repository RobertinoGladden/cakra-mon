// api/groq.js — Groq API proxy handler — Cakra v2.0.1
// © 2026 Robertino Gladden Narendra. Hak cipta dilindungi.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    return res.status(500).json({ error: 'Server environment variable GROQ_API_KEY is not configured.' });
  }

  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'Missing JSON body.' });
  }

  try {
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify(req.body)
    });

    const contentType = groqRes.headers.get('content-type') || 'application/json';
    const text = await groqRes.text();

    res.status(groqRes.status);
    res.setHeader('Content-Type', contentType);
    return res.send(text);
  } catch (err) {
    return res.status(500).json({ error: err?.message || 'Proxy request failed.' });
  }
}
