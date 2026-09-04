/**
 * Adaptador Cloudflare Pages Functions para el enrutador /api/*
 */

import { handleApiRequest } from '../../src/worker/api.ts';
import type { Env } from '../../src/worker/types.ts';

interface EventContext {
  request: Request;
  env: Env;
}

export const onRequest = async (context: EventContext): Promise<Response> => {
  return handleApiRequest(context.request, context.env);
};
