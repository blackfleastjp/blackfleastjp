declare global {
  namespace Express {
    interface Request {
      requestId: string;
      auth?: { userId: string; email: string; companyId?: string; permissions?: Set<string> };
    }
  }
}

export {};
