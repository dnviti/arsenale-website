import type { APIRoute } from 'astro';
import Anthropic from '@anthropic-ai/sdk';
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

  // Validate API key
  const apiKey = process.env.ANTHROPIC_API_KEY || import.meta.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Chat service is not configured.' }), {
      status: 503,
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

  // Call Anthropic API with streaming
  try {
    const client = new Anthropic({ apiKey });

    const stream = client.messages.stream({
      model: 'claude-haiku-4-5',
      max_tokens: 4096,
      system: [
        {
          type: 'text' as const,
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' as const, ttl: '1h' },
        },
      ],
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

    // Return SSE stream
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      start(controller) {
        let closed = false;
        let fullResponse = '';

        function closeOnce() {
          console.log(`[chat] Full model response:\n${fullResponse}`);
          if (!closed) {
            closed = true;
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          }
        }

        stream.on('text', (text) => {
          if (!closed) {
            fullResponse += text;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
          }
        });

        stream.on('error', (err) => {
          console.error('Anthropic stream error:', err);
          if (!closed) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ error: 'Stream error occurred.' })}\n\n`)
            );
          }
          closeOnce();
        });

        stream.on('message', (message) => {
          const usage = message.usage as unknown as Record<string, number>;
          console.log(`[chat] Cache: write=${usage.cache_creation_input_tokens ?? 0}, read=${usage.cache_read_input_tokens ?? 0}, uncached=${usage.input_tokens}`);
        });

        stream.on('end', () => {
          closeOnce();
        });
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
    console.error('Anthropic API error:', err);
    return new Response(JSON.stringify({ error: 'Failed to generate response. Please try again.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
