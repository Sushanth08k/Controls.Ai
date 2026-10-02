/**
 * Utility to convert cron expressions and frequency strings into human-readable text.
 */

const DAYS_OF_WEEK = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function getOrdinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) {
    return `${day}th`;
  }
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

function formatTime(hourStr: string, minStr: string): string {
  const hour = parseInt(hourStr, 10);
  const min = parseInt(minStr, 10);
  if (isNaN(hour) || isNaN(min)) {
    return `${hourStr}:${minStr}`;
  }
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  const formattedMin = min < 10 ? `0${min}` : `${min}`;
  return `${hour12}:${formattedMin} ${period}`;
}

export function formatFrequency(frequency: string | undefined | null): string {
  if (!frequency) return 'Not configured';

  const trimmed = frequency.trim();

  // Keyword mappings
  const lower = trimmed.toLowerCase();
  if (lower === 'on_event' || lower === 'on-event' || lower === 'onevent' || lower === 'event') {
    return 'On Event';
  }
  if (lower === 'daily') return 'Daily';
  if (lower === 'weekly') return 'Weekly';
  if (lower === 'monthly') return 'Monthly';
  if (lower === 'quarterly') return 'Quarterly';
  if (lower === 'hourly') return 'Hourly';

  // 5-part cron: minute hour day-of-month month day-of-week
  const parts = trimmed.split(/\s+/);
  if (parts.length === 5) {
    const [min, hour, dom, mon, dow] = parts;

    // Check if time is a specific number
    const isSpecificTime = /^\d+$/.test(hour) && /^\d+$/.test(min);

    // Case 1: Weekly (e.g., 0 1 * * 0 -> Weekly — Sunday at 1:00 AM)
    if (dom === '*' && mon === '*' && dow !== '*') {
      const dowNum = parseInt(dow, 10);
      const dayName = !isNaN(dowNum)
        ? DAYS_OF_WEEK[dowNum % 7]
        : dow;

      if (isSpecificTime) {
        return `Weekly — ${dayName} at ${formatTime(hour, min)}`;
      }
      return `Weekly — ${dayName}`;
    }

    // Case 2: Monthly (e.g., 0 3 1 * * -> Monthly — 1st at 3:00 AM)
    if (dom !== '*' && mon === '*' && dow === '*') {
      const domNum = parseInt(dom, 10);
      const domFormatted = !isNaN(domNum) ? getOrdinalSuffix(domNum) : dom;

      if (isSpecificTime) {
        return `Monthly — ${domFormatted} at ${formatTime(hour, min)}`;
      }
      return `Monthly — day ${domFormatted}`;
    }

    // Case 3: Daily (e.g., 0 1 * * * -> Daily at 1:00 AM)
    if (dom === '*' && mon === '*' && dow === '*') {
      if (isSpecificTime) {
        return `Daily at ${formatTime(hour, min)}`;
      }
      if (hour === '*' && min.startsWith('*/')) {
        return `Every ${min.slice(2)} minutes`;
      }
      if (min === '0' && hour.startsWith('*/')) {
        return `Every ${hour.slice(2)} hours`;
      }
      return 'Daily';
    }

    // Case 4: Specific day of specific month
    if (dom !== '*' && mon !== '*' && dow === '*') {
      const domNum = parseInt(dom, 10);
      const domFormatted = !isNaN(domNum) ? getOrdinalSuffix(domNum) : dom;
      if (isSpecificTime) {
        return `Annually — Month ${mon}, ${domFormatted} at ${formatTime(hour, min)}`;
      }
    }
  }

  // Fallback: return trimmed string
  return trimmed;
}
