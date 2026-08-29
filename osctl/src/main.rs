mod audit;
mod customizer;
mod doctor;
mod state;

use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "osctl", version, about = "Koti system control")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Subcommand)]
enum Command {
    /// Show overall system status
    Status,
    /// Run the security audit (PRD §97)
    Audit,
    /// Enter or leave Customizer Mode (PRD §49)
    Customize {
        #[command(subcommand)]
        action: CustomizeAction,
    },
    /// System diagnostics (PRD §98)
    Doctor,
    /// Manage Agent Boxes (same surface as the `box` command)
    Box {
        #[command(subcommand)]
        action: agentboxd::cli::Cmd,
    },
}

#[derive(Subcommand)]
enum CustomizeAction {
    On,
    Off,
}

fn main() {
    let cli = Cli::parse();
    let probes = audit::platform_probes();
    match cli.command {
        Command::Status => {
            let checks = audit::run(probes.as_ref());
            println!("Security: {}", state::derive(&checks));
        }
        Command::Audit => {
            let checks = audit::run(probes.as_ref());
            print!("{}", audit::render(&checks));
            println!("\nResult\n{}", state::derive(&checks));
        }
        Command::Customize { action } => {
            let mut flag = customizer::RunFlag;
            let result = match action {
                CustomizeAction::On => customizer::turn_on(&mut flag),
                CustomizeAction::Off => customizer::turn_off(&mut flag, probes.as_ref()),
            };
            match result {
                Ok(msg) => println!("{msg}"),
                Err(e) => {
                    eprintln!("osctl customize: {e}");
                    std::process::exit(1);
                }
            }
        }
        Command::Doctor => {
            print!("{}", doctor::run(probes.as_ref(), &doctor::PlatformDoctorProbes));
        }
        Command::Box { action } => {
            std::process::exit(agentboxd::cli::run(action));
        }
    }
}
