/**
 * espn-polymarket-map — map ESPN scoreboard games to Polymarket prediction
 * markets, producing byte-identical results to the Rust reference across the
 * conformance corpus.
 *
 * Offline (pure algorithm):
 * ```ts
 * import { parseEspnEvent, parsePmEvent, resolve } from "espn-polymarket-map";
 *
 * const game = parseEspnEvent(espnEventJson, "fifa.world");
 * const event = parsePmEvent(pmEventJson);
 * const result = resolve("fifa.world", game!, event);
 * console.log(JSON.stringify(result, null, 2));
 * ```
 *
 * Online (built-in fetch):
 * ```ts
 * import { EspnClient, mapGame } from "espn-polymarket-map";
 *
 * const games = await EspnClient.scoreboard("nba");
 * for (const g of games) console.log(await mapGame(g));
 * ```
 */

export type {
  EspnGame,
  EspnSide,
  PmEvent,
  PmMarket,
  MapResult,
  Outcome,
  TeamBlock,
} from "./models.js";

export { normalize, tokens, contentTokens, teamMatches } from "./normalize.js";
export { daysFromCivil, civilFromDays, parseUtc, candidateDates } from "./datecalc.js";
export { teamCode, teamName, sideNames, abbrKey } from "./crosswalk.js";
export { parseEspnEvent, parsePmEvent } from "./parse.js";
export { resolve } from "./resolve.js";
export { candidateSlugs } from "./slug.js";
export { data } from "./data.js";
export type { LeagueConfig, CrosswalkTeam } from "./data.js";
export { EspnClient, PolymarketClient, mapGame, ClientError } from "./client.js";
