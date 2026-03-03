import { Request, Response, NextFunction } from 'express';
import { OAuth2Client } from 'google-auth-library';
import { logger } from '../utils/logger';

const oauthClient = new OAuth2Client();

const EXPECTED_SERVICE_ACCOUNT = process.env.CLOUD_TASKS_SERVICE_ACCOUNT || '';

/**
 * Middleware to verify OIDC tokens from Cloud Tasks.
 * Only allows requests from the expected Cloud Tasks service account.
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // Skip auth in development
  if (process.env.NODE_ENV === 'development' && process.env.SKIP_AUTH === 'true') {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    logger.warn('Missing or invalid Authorization header');
    res.status(401).json({ error: 'Missing Bearer token' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const ticket = await oauthClient.verifyIdToken({
      idToken: token,
      audience: process.env.DISPATCHER_URL || undefined,
    });

    const payload = ticket.getPayload();
    if (!payload?.email) {
      logger.warn('OIDC token has no email claim');
      res.status(403).json({ error: 'Invalid token: no email' });
      return;
    }

    if (EXPECTED_SERVICE_ACCOUNT && payload.email !== EXPECTED_SERVICE_ACCOUNT) {
      logger.warn(
        { expected: EXPECTED_SERVICE_ACCOUNT, got: payload.email },
        'Unauthorized service account',
      );
      res.status(403).json({ error: 'Unauthorized service account' });
      return;
    }

    logger.info({ serviceAccount: payload.email }, 'Authenticated Cloud Tasks request');
    next();
  } catch (error) {
    logger.error({ error: String(error) }, 'OIDC token verification failed');
    res.status(401).json({ error: 'Invalid token' });
  }
}
