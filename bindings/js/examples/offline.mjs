// Offline usage example: resolve a recorded ESPN game against a recorded
// Polymarket event, with no network access.
//
// Run after building:  node examples/offline.mjs
import { parseEspnEvent, parsePmEvent, resolve, candidateDates } from "../dist/index.js";

// A trimmed ESPN scoreboard `event` (only the fields the parser reads).
const espnEvent = {
  id: "760444",
  date: "2026-06-20T00:00Z",
  competitions: [
    {
      date: "2026-06-20T00:00Z",
      competitors: [
        {
          homeAway: "home",
          team: { abbreviation: "BRA", displayName: "Brazil", shortDisplayName: "Brazil", location: "Brazil", name: "Brazil" },
        },
        {
          homeAway: "away",
          team: { abbreviation: "HAI", displayName: "Haiti", shortDisplayName: "Haiti", location: "Haiti", name: "Haiti" },
        },
      ],
    },
  ],
};

// A trimmed Polymarket gamma `event` (3 Yes/No legs for a soccer match).
const pmEvent = {
  slug: "fifwc-bra-hai-2026-06-19",
  title: "Brazil vs. Haiti",
  markets: [
    {
      slug: "fifwc-bra-hai-2026-06-19-bra",
      groupItemTitle: "Brazil",
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.885", "0.115"]',
      clobTokenIds: '["111", "222"]',
    },
    {
      slug: "fifwc-bra-hai-2026-06-19-hai",
      groupItemTitle: "Haiti",
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.0355", "0.9645"]',
      clobTokenIds: '["333", "444"]',
    },
    {
      slug: "fifwc-bra-hai-2026-06-19-draw",
      groupItemTitle: "Draw",
      outcomes: '["Yes", "No"]',
      outcomePrices: '["0.0795", "0.9205"]',
      clobTokenIds: '["555", "666"]',
    },
  ],
};

console.log("candidate dates:", candidateDates(espnEvent.date));

const game = parseEspnEvent(espnEvent, "fifa.world");
const event = parsePmEvent(pmEvent);
const result = resolve("fifa.world", game, event);

console.log(JSON.stringify(result, null, 2));
