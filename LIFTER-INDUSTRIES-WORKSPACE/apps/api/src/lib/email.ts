import { env } from "./env.js";
import { AppError } from "./errors.js";

export async function sendTransactionalEmail(input: {
  to: string;
  subject: string;
  text: string;
}): Promise<boolean> {
  if (!env.EMAIL_PROVIDER) {
    if (env.NODE_ENV !== "production") return false;
    throw new AppError(503, "EMAIL_UNAVAILABLE", "Password recovery email is not configured");
  }

  const response = await fetch(env.EMAIL_API_BASE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.EMAIL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: env.EMAIL_FROM, ...input }),
  });
  if (!response.ok) {
    throw new AppError(
      502,
      "EMAIL_DELIVERY_FAILED",
      "Password recovery email could not be delivered",
    );
  }
  return true;
}
