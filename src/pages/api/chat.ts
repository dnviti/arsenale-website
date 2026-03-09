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
- Only answer questions about Arsenale or comparisons between Arsenale and other products. Politely decline completely unrelated questions.
- Be concise and accurate. Use the provided documentation for Arsenale-specific details. Do not invent Arsenale features not in the documentation.
- Cite documentation sections when relevant.
- If the user asks about contacts or how to reach the team, tell them to write to info@arsenalepam.com.
- If the user asks about bug fixes, feature requests, or wants to propose changes, tell them to open an issue on the GitHub repository at https://github.com/dnviti/arsenale/issues.

PRODUCT COMPARISON RULES:
- When the user asks how Arsenale compares to other products, answer using your general knowledge about those products and the Arsenale documentation provided above.
- Apache Guacamole is a key competitor. You should be knowledgeable about its features, architecture, and limitations (e.g. no built-in credential vault, no native MFA, requires manual connection management, limited audit logging, no multi-tenant organization support, older UI).
- Be factual and fair. Do not invent capabilities or flaws about competitor products. If you are unsure about a competitor detail, say so.
- When comparing, highlight Arsenale differentiators where relevant: encrypted credential vault, built-in team collaboration and connection sharing, MFA support, comprehensive audit logging, multi-tenant organizations, modern user experience, integrated SFTP/SSH/RDP/VNC support.
- Always remain professional. Do not disparage competitors, just present objective differences.

=== ARSENALE DOCUMENTATION ===

${docSections}`;
}

const SYSTEM_PROMPT = buildSystemPrompt();
console.log(`[chat] System prompt loaded (${SYSTEM_PROMPT.length} chars, ~${Math.round(SYSTEM_PROMPT.length / 4)} tokens)\n${SYSTEM_PROMPT}`);

// --- Provider Configuration ---
const LLM_PROVIDER = (process.env.LLM_PROVIDER || 'ollama') as 'claude' | 'ollama';

// Ollama settings
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://ollama-web:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen3.5:0.8b';

// Claude settings
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const CLAUDE_MODEL = 'claude-haiku-4-5';
const CLAUDE_MAX_TOKENS = 4096;

console.log(`[chat] Provider: ${LLM_PROVIDER}`);
if (LLM_PROVIDER === 'ollama') {
  console.log(`[chat] Ollama endpoint: ${OLLAMA_BASE_URL}, model: ${OLLAMA_MODEL}`);
} else {
  console.log(`[chat] Claude model: ${CLAUDE_MODEL}, API key: ${ANTHROPIC_API_KEY ? 'set' : 'MISSING'}`);
}

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

  // Claude API key check
  if (LLM_PROVIDER === 'claude' && !ANTHROPIC_API_KEY) {
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

  // Dispatch to selected provider
  if (LLM_PROVIDER === 'claude') {
    return streamClaude(messages);
  }
  return streamOllama(messages);
};

// --- Claude Streaming ---
async function streamClaude(messages: ChatMessage[]): Promise<Response> {
  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    const stream = client.messages.stream({
      model: CLAUDE_MODEL,
      max_tokens: CLAUDE_MAX_TOKENS,
      thinking: { type: 'disabled' },
      system: [
        {
          type: 'text' as const,
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' as const },
        },
      ],
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });

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
          console.error('[chat] Claude stream error:', err);
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
    console.error('[chat] Claude API error:', err);
    return new Response(JSON.stringify({ error: 'Failed to generate response. Please try again.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// --- Ollama Streaming ---
async function streamOllama(messages: ChatMessage[]): Promise<Response> {
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
}
