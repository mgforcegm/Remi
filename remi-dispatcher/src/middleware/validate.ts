import { Request, Response, NextFunction } from 'express';
import { DispatchPayloadSchema } from '../types/dispatch-payload';
import { logger } from '../utils/logger';

/**
 * Middleware to validate the dispatch payload using Zod.
 * Parsed payload is attached to req.body.
 */
export function validatePayload(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const result = DispatchPayloadSchema.safeParse(req.body);

  if (!result.success) {
    const errors = result.error.errors.map((e) => ({
      path: e.path.join('.'),
      message: e.message,
    }));

    logger.warn({ errors }, 'Payload validation failed');
    res.status(400).json({ error: 'Invalid payload', details: errors });
    return;
  }

  req.body = result.data;
  next();
}
