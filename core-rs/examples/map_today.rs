//! Map today's games for one or all leagues against live Polymarket data.
//!
//!   cargo run --example map_today              # all leagues
//!   cargo run --example map_today -- nba       # one league

use espn_polymarket_map::client::{map_game, EspnClient};

fn main() {
    let leagues: Vec<String> = {
        let args: Vec<String> = std::env::args().skip(1).collect();
        if args.is_empty() {
            vec![
                "nba".into(),
                "mlb".into(),
                "nhl".into(),
                "fifa.world".into(),
            ]
        } else {
            args
        }
    };

    for league in &leagues {
        println!("\n=== {league} ===");
        let games = match EspnClient::scoreboard(league) {
            Ok(g) => g,
            Err(e) => {
                println!("  ESPN error: {e}");
                continue;
            }
        };
        if games.is_empty() {
            println!("  (no games today)");
            continue;
        }
        for game in &games {
            match map_game(game) {
                Ok(r) if r.resolved => {
                    let legs: Vec<String> = r
                        .outcomes
                        .iter()
                        .map(|o| format!("{}={}", o.selection, o.price))
                        .collect();
                    println!(
                        "  {} @ {}  ->  {}  [{}]",
                        game.away.abbr,
                        game.home.abbr,
                        r.pm_event_slug,
                        legs.join(", ")
                    );
                }
                Ok(_) => println!("  {} @ {}  ->  UNRESOLVED", game.away.abbr, game.home.abbr),
                Err(e) => println!("  {} @ {}  ->  error: {e}", game.away.abbr, game.home.abbr),
            }
        }
    }
}
