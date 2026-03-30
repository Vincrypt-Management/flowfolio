/**
 * Schedule configuration for FlowFolio Instagram automation.
 *
 * Defines when and what to post, with sensible defaults for
 * optimal Instagram engagement.
 */

export interface ScheduleSlot {
  dayOfWeek: number; // 0=Sun, 6=Sat
  hour: number;      // 0-23 (local time)
  minute: number;    // 0-59
}

export interface ScheduleProfile {
  name: string;
  description: string;
  slots: ScheduleSlot[];
  contentMix: 'ig-only' | 'mixed' | 'all' | 'growth';
}

// Optimal Instagram posting times (research-based)
export const PROFILES: Record<string, ScheduleProfile> = {
  // 3x per week — safe, consistent growth
  'starter': {
    name: 'Starter',
    description: '3 posts/week — Tue, Thu, Sat at peak engagement times',
    contentMix: 'ig-only',
    slots: [
      { dayOfWeek: 2, hour: 11, minute: 0 },  // Tuesday 11 AM
      { dayOfWeek: 4, hour: 14, minute: 0 },  // Thursday 2 PM
      { dayOfWeek: 6, hour: 10, minute: 0 },  // Saturday 10 AM
    ],
  },

  // 5x per week — aggressive growth
  'growth': {
    name: 'Growth',
    description: '5 posts/week — mix of reels + feed posts at peak times',
    contentMix: 'growth',
    slots: [
      { dayOfWeek: 1, hour: 10, minute: 0 },  // Monday 10 AM
      { dayOfWeek: 2, hour: 13, minute: 0 },  // Tuesday 1 PM
      { dayOfWeek: 3, hour: 11, minute: 30 }, // Wednesday 11:30 AM
      { dayOfWeek: 4, hour: 14, minute: 0 },  // Thursday 2 PM
      { dayOfWeek: 5, hour: 12, minute: 0 },  // Friday 12 PM
    ],
  },

  // Daily posting
  'daily': {
    name: 'Daily',
    description: '7 posts/week — every day at optimal times',
    contentMix: 'mixed',
    slots: [
      { dayOfWeek: 0, hour: 11, minute: 0 },  // Sunday 11 AM
      { dayOfWeek: 1, hour: 10, minute: 0 },  // Monday 10 AM
      { dayOfWeek: 2, hour: 13, minute: 0 },  // Tuesday 1 PM
      { dayOfWeek: 3, hour: 11, minute: 30 }, // Wednesday 11:30 AM
      { dayOfWeek: 4, hour: 14, minute: 0 },  // Thursday 2 PM
      { dayOfWeek: 5, hour: 12, minute: 0 },  // Friday 12 PM
      { dayOfWeek: 6, hour: 10, minute: 0 },  // Saturday 10 AM
    ],
  },

  // Minimal — 1x per week
  'minimal': {
    name: 'Minimal',
    description: '1 post/week — Wednesday at peak time',
    contentMix: 'ig-only',
    slots: [
      { dayOfWeek: 3, hour: 12, minute: 0 },  // Wednesday 12 PM
    ],
  },
};

export const DEFAULT_PROFILE = 'starter';

/**
 * Generate scheduled dates for the next N weeks based on a profile.
 */
export function generateScheduleDates(
  profile: ScheduleProfile,
  weeks: number = 4,
  startDate?: Date
): Date[] {
  const dates: Date[] = [];
  const start = startDate || new Date();

  // Find the start of the current week (Sunday)
  const weekStart = new Date(start);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);

  for (let w = 0; w < weeks; w++) {
    for (const slot of profile.slots) {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + (w * 7) + slot.dayOfWeek);
      date.setHours(slot.hour, slot.minute, 0, 0);

      // Only include future dates
      if (date > start) {
        dates.push(date);
      }
    }
  }

  return dates.sort((a, b) => a.getTime() - b.getTime());
}

/**
 * Format a schedule for display
 */
export function formatSchedule(dates: Date[]): string {
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return dates
    .map((d, i) => {
      const day = dayNames[d.getDay()];
      const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      return `  ${(i + 1).toString().padStart(2)}. ${day} ${date} at ${time}`;
    })
    .join('\n');
}
