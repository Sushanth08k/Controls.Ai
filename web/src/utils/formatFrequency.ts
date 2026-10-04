/**
 * Utility to convert cron expressions and frequency strings into human-readable text.
 */

export function formatFrequency(frequency: string | undefined | null): string {
  if (!frequency) return 'Not configured';

  const trimmed = frequency.trim();
  const lower = trimmed.toLowerCase();

  // Keyword mappings
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
    const [, , dom, mon, dow] = parts;

    // Case 1: Weekly (dow specified)
    if (dom === '*' && mon === '*' && dow !== '*') {
      return 'Weekly';
    }

    // Case 2: Monthly (dom specified)
    if (dom !== '*' && mon === '*' && dow === '*') {
      return 'Monthly';
    }

    // Case 3: Daily
    if (dom === '*' && mon === '*' && dow === '*') {
      return 'Daily';
    }

    // Case 4: Annually
    if (dom !== '*' && mon !== '*' && dow === '*') {
      return 'Annually';
    }
  }

  if (lower.includes('event')) return 'On Event';
  if (lower.includes('week')) return 'Weekly';
  if (lower.includes('month')) return 'Monthly';
  if (lower.includes('day') || lower.includes('dail')) return 'Daily';

  // Fallback: return trimmed string
  return trimmed;
}

