import { createHash } from 'crypto';

/**
 * Generate a deterministic request_id from channel + thread_ts.
 * Format: remi_{YYYYMMDD}_{6-char-hex}
 *
 * The hex suffix is derived from a hash of channel:thread_ts,
 * ensuring the same Slack thread always produces the same request_id.
 */
export function generateRequestId(channel: string, threadTs: string): string {
  const date = new Date();
  const dateStr = [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('');

  const hash = createHash('sha256')
    .update(`${channel}:${threadTs}`)
    .digest('hex')
    .slice(0, 6);

  return `remi_${dateStr}_${hash}`;
}
