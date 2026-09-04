/**
 * Punto de entrada principal para Cloudflare Worker (Worker con Assets estáticos).
 */

import { handleApiRequest } from './api.ts';
import type { Env } from './types.ts';

const STATIC_SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Interceptar rutas de la API REST (/api/*)
    if (url.pathname.startsWith('/api')) {
      return handleApiRequest(request, env);
    }

    // Servir assets estáticos del frontend (Vite dist) si el binding está presente
    if (env.ASSETS) {
      const response = await env.ASSETS.fetch(request);
      const headers = new Headers(response.headers);

      for (const [key, value] of Object.entries(STATIC_SECURITY_HEADERS)) {
        headers.set(key, value);
      }

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    return new Response('Not Found', { status: 404 });
  },
};
