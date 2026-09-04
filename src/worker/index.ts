/**
 * Punto de entrada principal para Cloudflare Worker (Worker con Assets estáticos).
 */

import { handleApiRequest } from './api.ts';
import type { Env } from './types.ts';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Interceptar rutas de la API REST (/api/*)
    if (url.pathname.startsWith('/api')) {
      return handleApiRequest(request, env);
    }

    // Servir assets estáticos del frontend (Vite dist) si el binding está presente
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  },
};
