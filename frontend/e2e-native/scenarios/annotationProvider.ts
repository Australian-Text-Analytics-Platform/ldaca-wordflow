import { createServer } from 'node:http';

type Mode = 'success' | 'authentication' | 'hold' | 'partial';
/** Only the external service is controlled; app HTTP, batching, retries and publication are real. */
export async function annotationProvider() {
  let mode: Mode = 'success';
  const calls: string[][] = [];
  let active = 0,
    peak = 0;
  const held = new Set<() => void>();
  const server = createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    if (request.url === '/v1/models') {
      response.end(JSON.stringify({ data: [{ id: 'synthetic-annotation' }] }));
      return;
    }
    if (request.url !== '/v1/chat/completions') {
      response.writeHead(404);
      response.end('{}');
      return;
    }
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => {
      body += chunk;
    });
    request.on('end', () => {
      const payload = JSON.parse(body) as { messages: { role: string; content: string }[] };
      const message = payload.messages.find((m) => m.role === 'user');
      if (!message) {
        response.writeHead(400);
        response.end('{}');
        return;
      }
      const documents = JSON.parse(message.content) as string[];
      calls.push(documents);
      active++;
      peak = Math.max(peak, active);
      response.once('close', () => {
        active--;
      });
      const reply = () => {
        held.delete(reply);
        // A valid null is distinct from a provider failure and must clear existing labels.
        const labels = documents.map((text) => (text.includes('transport') ? 'B' : null));
        response.end(
          JSON.stringify({
            choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ labels }) } }],
          }),
        );
      };
      if (mode === 'authentication') {
        response.writeHead(401);
        response.end('{"error":"Synthetic expired credential"}');
      } else if (mode === 'partial' && documents.some((text) => text.includes('response 11:'))) {
        response.end(
          JSON.stringify({
            choices: [
              { finish_reason: 'stop', message: { content: '{"labels":["UNKNOWN_CODE"]}' } },
            ],
          }),
        );
      } else if (mode === 'hold') held.add(reply);
      else reply();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing provider address');
  return {
    endpoint: `http://127.0.0.1:${String(address.port)}/v1`,
    calls,
    requests: () => calls.length,
    peak: () => peak,
    setMode(value: Mode) {
      mode = value;
    },
    release() {
      for (const reply of held) reply();
    },
    async close() {
      for (const reply of held) reply();
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        }),
      );
    },
  };
}
export type AnnotationProvider = Awaited<ReturnType<typeof annotationProvider>>;
