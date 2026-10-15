import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from '../src/main';

let cachedHandler:
  | ((req: IncomingMessage, res: ServerResponse) => void)
  | null = null;

async function getHandler() {
  if (cachedHandler) {
    return cachedHandler;
  }

  const { app } = await createApp();
  cachedHandler = app.getHttpAdapter().getInstance();
  return cachedHandler;
}

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
) {
  const nestHandler = await getHandler();
  nestHandler(req, res);
}
