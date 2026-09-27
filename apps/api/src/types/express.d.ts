declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
        companyId: string;
        roleIds: string[];
        permissions: string[];
      };
    }
  }
}

export {};
