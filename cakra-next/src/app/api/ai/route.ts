import { NextResponse } from 'next/server';

const localResponse = () => NextResponse.json({ mode: 'local' });

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.messages?.length) return NextResponse.json({ error: 'messages required' }, { status: 400 });
  const key = process.env.GROQ_API_KEY;
  if (!key) return localResponse();
  const configuredModel = process.env.GROQ_MODEL;
  const model = configuredModel === 'llama-3.3-70b-versatile' || configuredModel === 'llama-3.1-8b-instant' ? 'openai/gpt-oss-120b' : configuredModel || 'openai/gpt-oss-120b';
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: body.messages, max_tokens: Math.min(Number(body.max_tokens) || 900, 1400), temperature: 0.2 }),
    });
    if (!response.ok) return localResponse();
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    return typeof content === 'string' && content.trim() ? NextResponse.json({ choices: [{ message: { content } }] }) : localResponse();
  } catch {
    return localResponse();
  }
}
