import type { Request, RequestHandler, Response } from 'express';

type AsyncRoute = (request: Request, response: Response) => Promise<unknown>;

export function asyncHandler(handler: AsyncRoute): RequestHandler {
  return (request, response, next) => {
    void handler(request, response).catch(next);
  };
}
