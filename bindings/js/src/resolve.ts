/**
 * The core resolution algorithm — the cross-language contract.
 *
 * See `docs/architecture.md` and the Rust reference (`core-rs/src/resolve.rs`).
 */

import { data } from "./data.js";
import { sideNames, teamCode, teamName } from "./crosswalk.js";
import { normalize, teamMatches } from "./normalize.js";
import type {
  EspnGame,
  EspnSide,
  MapResult,
  Outcome,
  PmEvent,
  PmMarket,
  TeamBlock,
} from "./models.js";

function teamBlock(league: string, side: EspnSide): TeamBlock {
  return {
    espn_abbr: side.abbr,
    name: teamName(league, side),
    pm_code: teamCode(league, side.abbr),
  };
}

function isDraw(m: PmMarket): boolean {
  return m.slug.endsWith("-draw") || normalize(m.groupItemTitle).startsWith("draw");
}

function idxStr(arr: string[], i: number): string {
  return i >= 0 && i < arr.length ? arr[i] : "";
}

/** Resolve one ESPN game against a candidate Polymarket event. */
export function resolve(league: string, game: EspnGame, pm: PmEvent): MapResult {
  const homeBlock = teamBlock(league, game.home);
  const awayBlock = teamBlock(league, game.away);
  const kind = data().league(league)?.kind ?? "";

  const result: MapResult = {
    resolved: false,
    league,
    kind,
    espn_event_id: game.espnEventId,
    pm_event_slug: pm.slug,
    pm_market_slug: null,
    home: homeBlock,
    away: awayBlock,
    outcomes: [],
  };

  const homeNames = sideNames(league, game.home);
  const awayNames = sideNames(league, game.away);

  if (kind === "three_way") {
    let homeLeg: PmMarket | null = null;
    let awayLeg: PmMarket | null = null;
    let drawLeg: PmMarket | null = null;
    for (const m of pm.markets) {
      if (isDraw(m)) {
        if (drawLeg === null) drawLeg = m;
        continue;
      }
      const label = m.groupItemTitle === "" ? m.question : m.groupItemTitle;
      if (homeLeg === null && teamMatches(homeNames, label)) {
        homeLeg = m;
      } else if (awayLeg === null && teamMatches(awayNames, label)) {
        awayLeg = m;
      }
    }
    const legOutcome = (
      selection: "home" | "away" | "draw",
      team: string | null,
      m: PmMarket,
    ): Outcome => ({
      selection,
      team,
      pm_market_slug: m.slug,
      pm_outcome: idxStr(m.outcomes, 0),
      outcome_index: 0,
      token_id: idxStr(m.clobTokenIds, 0),
      price: idxStr(m.outcomePrices, 0),
    });
    if (homeLeg !== null) {
      result.outcomes.push(legOutcome("home", result.home.name, homeLeg));
    }
    if (awayLeg !== null) {
      result.outcomes.push(legOutcome("away", result.away.name, awayLeg));
    }
    if (drawLeg !== null) {
      result.outcomes.push(legOutcome("draw", null, drawLeg));
    }
    result.resolved = homeLeg !== null && awayLeg !== null;
    return result;
  }

  // two_way
  let ml = pm.markets.find((m) => m.slug === pm.slug);
  if (ml === undefined) {
    ml = pm.markets.find((m) => m.sportsMarketType === "moneyline");
  }
  if (ml === undefined) {
    return result;
  }
  result.pm_market_slug = ml.slug;

  let homeIdx: number | null = null;
  let awayIdx: number | null = null;
  for (let i = 0; i < ml.outcomes.length; i++) {
    const o = ml.outcomes[i];
    if (homeIdx === null && teamMatches(homeNames, o)) {
      homeIdx = i;
    } else if (awayIdx === null && teamMatches(awayNames, o)) {
      awayIdx = i;
    }
  }
  if (homeIdx !== null && awayIdx !== null && homeIdx !== awayIdx) {
    for (let i = 0; i < ml.outcomes.length; i++) {
      let selection: "home" | "away";
      let team: string;
      if (i === homeIdx) {
        selection = "home";
        team = result.home.name;
      } else if (i === awayIdx) {
        selection = "away";
        team = result.away.name;
      } else {
        continue;
      }
      result.outcomes.push({
        selection,
        team,
        pm_market_slug: ml.slug,
        pm_outcome: idxStr(ml.outcomes, i),
        outcome_index: i,
        token_id: idxStr(ml.clobTokenIds, i),
        price: idxStr(ml.outcomePrices, i),
      });
    }
    result.resolved = true;
  }
  return result;
}
