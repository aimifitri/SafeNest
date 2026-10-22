let counter = 0;

/**
 * A channel name that is never reused. supabase.channel(name) hands back the SAME channel for a
 * repeated name, and adding postgres_changes listeners to one that is already subscribed throws.
 * That happens when an effect remounts (Strict Mode, Fast Refresh, two components with one id)
 * before the old channel has finished closing. A fresh suffix per subscription avoids it.
 */
export function uniqueChannelName(base: string): string {
  counter += 1;
  return `${base}:${Date.now().toString(36)}-${counter}`;
}
