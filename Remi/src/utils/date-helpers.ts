const SCHEDULE_PATTERNS = [
  // "3pm ET", "3:00pm ET", "15:00 ET"
  /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(ET|EST|EDT|CT|CST|CDT|PT|PST|PDT|MT|MST|MDT|UTC)/i,
  // "schedule now", "now", "immediately"
  /\b(now|immediately|asap)\b/i,
];

const TZ_OFFSETS: Record<string, number> = {
  ET: -5, EST: -5, EDT: -4,
  CT: -6, CST: -6, CDT: -5,
  MT: -7, MST: -7, MDT: -6,
  PT: -8, PST: -8, PDT: -7,
  UTC: 0,
};

export function parseScheduleTime(message: string): Date | null {
  // Check for "now" / "immediately"
  if (SCHEDULE_PATTERNS[1].test(message)) {
    return new Date();
  }

  const match = message.match(SCHEDULE_PATTERNS[0]);
  if (!match) return null;

  let hours = parseInt(match[1], 10);
  const minutes = match[2] ? parseInt(match[2], 10) : 0;
  const ampm = match[3]?.toLowerCase();
  const tz = match[4].toUpperCase();

  // Convert 12-hour to 24-hour
  if (ampm === 'pm' && hours < 12) hours += 12;
  if (ampm === 'am' && hours === 12) hours = 0;

  const offset = TZ_OFFSETS[tz];
  if (offset === undefined) return null;

  // Build a UTC date for today at the specified local time
  const now = new Date();
  const utcDate = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      hours - offset,
      minutes,
    ),
  );

  // If the time is already past today, schedule for tomorrow
  if (utcDate.getTime() <= Date.now()) {
    utcDate.setUTCDate(utcDate.getUTCDate() + 1);
  }

  return utcDate;
}

export function formatTimeET(date: Date): string {
  return date.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  });
}

export function formatTimeUTC(date: Date): string {
  return date.toISOString();
}
