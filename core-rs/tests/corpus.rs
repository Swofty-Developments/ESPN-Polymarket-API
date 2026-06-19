//! Conformance corpus: every case in `corpus/cases/*.json` must resolve to its frozen
//! `expected` MapResult. This is the cross-language contract; the Python and JS bindings run
//! the identical corpus.

use espn_polymarket_map::{parse_espn_event, parse_pm_event, resolve};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

fn corpus_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../corpus/cases")
}

#[test]
fn corpus_matches() {
    let dir = corpus_dir();
    let mut cases: Vec<PathBuf> = fs::read_dir(&dir)
        .unwrap_or_else(|e| panic!("read {}: {e}", dir.display()))
        .filter_map(|e| e.ok().map(|e| e.path()))
        .filter(|p| p.extension().map(|x| x == "json").unwrap_or(false))
        .collect();
    cases.sort();
    assert!(
        !cases.is_empty(),
        "no corpus cases found in {}",
        dir.display()
    );

    let mut failures = Vec::new();
    for path in &cases {
        let name = path.file_stem().unwrap().to_string_lossy().to_string();
        let raw = fs::read_to_string(path).unwrap();
        let case: Value = serde_json::from_str(&raw).unwrap_or_else(|e| panic!("{name}: {e}"));

        let league = case["league"].as_str().expect("case.league");
        let game = parse_espn_event(&case["espn"], league)
            .unwrap_or_else(|| panic!("{name}: failed to parse espn slice"));
        let event = parse_pm_event(&case["polymarket"]);
        let got = serde_json::to_value(resolve(league, &game, &event)).unwrap();
        let want = &case["expected"];

        if &got != want {
            failures.push(format!(
                "  ✗ {name}\n    expected: {}\n    got:      {}",
                serde_json::to_string(want).unwrap(),
                serde_json::to_string(&got).unwrap()
            ));
        }
    }

    if !failures.is_empty() {
        panic!(
            "{} corpus case(s) failed:\n{}",
            failures.len(),
            failures.join("\n")
        );
    }
    eprintln!("corpus: {} cases passed", cases.len());
}
