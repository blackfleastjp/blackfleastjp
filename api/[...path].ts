import type { VercelRequest, VercelResponse } from "@vercel/node";
import { app } from "../apps/api/src/app.js";

export default function handler(request: VercelRequest, response: VercelResponse): void {
  app(request, response);
}
