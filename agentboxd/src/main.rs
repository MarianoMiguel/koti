use clap::Parser;

#[derive(Parser)]
#[command(name = "agentboxd", version, about = "Koti Agent Box daemon (PRD §41)")]
struct Cli {
    /// Control socket path (future JSON API for `box` / `osctl box` / shell UI)
    #[arg(long, default_value = "/run/koti/agentboxd.sock")]
    socket: String,
}

fn main() {
    let cli = Cli::parse();
    eprintln!(
        "agentboxd: socket API at {} not implemented yet (task M7-01); \
         the `box` CLI currently operates in-process on the shared store.",
        cli.socket
    );
    std::process::exit(1);
}
