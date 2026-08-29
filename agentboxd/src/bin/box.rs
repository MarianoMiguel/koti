//! `box` — thin entrypoint over the shared command surface in
//! `agentboxd::cli` (also exposed as `osctl box`).

use agentboxd::cli::Cmd;
use clap::Parser;

#[derive(Parser)]
#[command(name = "box", version, about = "Koti Agent Boxes: persistent virtual computers for autonomous agents")]
struct Cli {
    #[command(subcommand)]
    command: Cmd,
}

fn main() {
    std::process::exit(agentboxd::cli::run(Cli::parse().command));
}
