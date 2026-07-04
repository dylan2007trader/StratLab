// "Never-perfect" progression helpers. Two honest ideas:
//  1. Alpha decay — markets drift, so a bot's edge gently ages over real days
//     unless retrained (or frozen). There is always maintenance to do.
//  2. Diminishing asymptote — each training yields less; you approach an
//     estimated ceiling that itself creeps up with level, but never reach 100%.

import { SavedBot } from "./storage";

const DAY = 86_400_000;
const STALE_DAYS = 45; // edge fully "aged" after ~6 weeks without training

/** 0..1 freshness of a bot's edge. Frozen or never-trained bots read fresh. */
export function edgeFreshness(bot: SavedBot, now = Date.now()): number {
  if (bot.frozen) return 1;
  const last = bot.schedule?.lastTrained ?? bot.createdAt;
  if (!last) return 1;
  const days = (now - last) / DAY;
  return Math.max(0.15, Math.min(1, 1 - days / STALE_DAYS));
}

export function freshnessLabel(f: number): string {
  return f > 0.75 ? "Fresh" : f > 0.45 ? "Aging" : "Stale";
}

export function daysSinceTrained(bot: SavedBot, now = Date.now()): number {
  const last = bot.schedule?.lastTrained ?? bot.createdAt;
  return last ? Math.max(0, Math.round((now - last) / DAY)) : 0;
}

/** Estimated fraction of this bot's potential reached — approaches but never
 *  hits 1, and the implied ceiling creeps up with level. */
export function potentialPct(bot: SavedBot): number {
  return 1 - 1 / (1 + bot.trainings * 0.35 + bot.level * 0.1);
}

/** Should we nudge the user to retrain? (Aged edge on a deployed/active bot.) */
export function needsRefresh(bot: SavedBot, now = Date.now()): boolean {
  return !bot.frozen && edgeFreshness(bot, now) < 0.45;
}

/** A "proven" bot has passed the Generalize field test — its edge travelled to
 *  other stocks. The prestige marker / graduation gate toward live deployment. */
export function isProven(bot: SavedBot): boolean {
  const g = bot.lastTraining?.generalize;
  return !!g && g.traveled >= 0.5 && (bot.best?.oosReturn ?? 0) > 0;
}

