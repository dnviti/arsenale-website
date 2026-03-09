import type { APIRoute } from 'astro';
import docsBundle from '../../data/docs-bundle.json';

export const prerender = false;

// --- Rate Limiter ---
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

// Clean up stale entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(ip);
    }
  }
}, 5 * 60 * 1000);

// --- System Prompt ---
function buildSystemPrompt(): string {
  const docSections = Object.entries(docsBundle as Record<string, string>)
    .map(([key, content]) => `## ${key.charAt(0).toUpperCase() + key.slice(1)}\n\n${content}`)
    .join('\n\n---\n\n');

  return `You are Arsenale Documentation Assistant. You answer questions ONLY about the Arsenale project based on the documentation provided below.

STRICT OUTPUT RULES:
1. Respond ONLY in plain text paragraphs. Do NOT use any Markdown formatting, lists, bullet points, numbered lists, headings, bold, backticks, code blocks, or tables.
2. Keep responses short and concise, maximum 2 paragraphs. Use Arsenale-specific keywords and terminology naturally within sentences.
3. Every paragraph MUST contain actual descriptive text. NEVER leave a section empty or with placeholder values.
4. The words "undefined", "null", "[object Object]", "NaN" must NEVER appear in your output under any circumstances. If you do not have information, say "Not documented" instead.
5. Respond in the same language as the user's question.

CONTENT RULES:
- Only answer questions about Arsenale. Politely decline unrelated questions.
- Be concise and accurate. Do not invent information not in the documentation.
- Cite documentation sections when relevant.
- NEVER mention, cite, or compare with other software products (e.g. no "like X" or "alternative to Y"). Only talk about Arsenale itself.
- If the user asks about contacts or how to reach the team, tell them to write to info@arsenalepam.com.
- If the user asks about bug fixes, feature requests, or wants to propose changes, tell them to open an issue on the GitHub repository at https://github.com/dnviti/arsenale/issues.

=== ARSENALE DOCUMENTATION ===

${docSections}`;
}

const SYSTEM_PROMPT = buildSystemPrompt();
console.log(`[chat] System prompt loaded (${SYSTEM_PROMPT.length} chars, ~${Math.round(SYSTEM_PROMPT.length / 4)} tokens)\n${SYSTEM_PROMPT}`);

// --- Ollama Configuration ---
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://ollama-web:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3.5:0.8b';
console.log(`[chat] Ollama endpoint: ${OLLAMA_BASE_URL}, model: ${OLLAMA_MODEL}`);

// --- API Handler ---
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  // Rate limiting
  const ip = clientAddress || request.headers.get('x-forwarded-for') || 'unknown';
  if (isRateLimited(ip)) {
    return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please wait before sending more messages.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Parse and validate request body
  let messages: ChatMessage[];
  try {
    const body = await request.json();
    messages = body.messages;

    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('Messages array is required');
    }
    if (messages.length > 40) {
      throw new Error('Conversation too long. Please start a new conversation.');
    }
    for (const msg of messages) {
      if (!msg.role || !msg.content || typeof msg.content !== 'string') {
        throw new Error('Invalid message format');
      }
      if (!['user', 'assistant'].includes(msg.role)) {
        throw new Error('Invalid message role');
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid request body';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Call Ollama API with streaming
  try {
    const ollamaRes = await fetch(`${OLLAMA_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: true,
        think: false,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
    });

    if (!ollamaRes.ok) {
      const errText = await ollamaRes.text().catch(() => 'Unknown error');
      console.error(`[chat] Ollama error ${ollamaRes.status}: ${errText}`);
      return new Response(JSON.stringify({ error: 'Failed to generate response. Please try again.' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Return SSE stream
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    const readable = new ReadableStream({
      async start(controller) {
        let fullResponse = '';
        const reader = ollamaRes.body!.getReader();
        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith('data: ')) continue;

              const data = trimmed.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  fullResponse += content;
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: content })}\n\n`));
                }
              } catch {
                // Skip malformed JSON chunks
              }
            }
          }
        } catch (err) {
          console.error('[chat] Ollama stream error:', err);
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: 'Stream error occurred.' })}\n\n`)
          );
        }

        console.log(`[chat] Full model response:\n${fullResponse}`);
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });

    return new Response(readable, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    console.error('[chat] Ollama API error:', err);
    return new Response(JSON.stringify({ error: 'Failed to generate response. Please try again.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
