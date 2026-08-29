//! `box` CLI (PRD §26). v0 drives the domain model in-process with the mock
//! runtime — the full command surface, state machine, and persistence are real;
//! only the VM itself is pending the on-device QEMU backend. It becomes a thin
//! client of agentboxd's socket once that exists.

use agentboxd::lifecycle::{after, check, BoxState, Op};
use agentboxd::runtime::{platform_runtime, VmRuntime};
use agentboxd::spec::{BoxSpec, Template};
use agentboxd::store::{BoxRecord, Store};
use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "box", version, about = "Koti Agent Boxes: persistent virtual computers for autonomous agents")]
struct Cli {
    #[command(subcommand)]
    command: Cmd,
}

#[derive(Subcommand)]
enum Cmd {
    /// Create a box from a template
    Create {
        name: String,
        #[arg(long, default_value = "full-developer")]
        template: String,
        #[arg(long)]
        repo: Option<String>,
    },
    Start { name: String },
    Stop { name: String },
    Restart { name: String },
    /// Open the box's graphical desktop
    Open { name: String },
    /// Open a shell inside the box
    Shell { name: String },
    Status { name: String },
    Snapshot { name: String },
    /// Reset the box to its template state (box must be stopped)
    Reset { name: String },
    /// Delete the box and its storage (box must be stopped)
    Delete { name: String },
    List,
}

fn main() {
    std::process::exit(run());
}

fn fail(msg: impl std::fmt::Display) -> i32 {
    eprintln!("box: {msg}");
    1
}

fn run() -> i32 {
    let cli = Cli::parse();
    let path = Store::default_path();
    let mut store = match Store::load(&path) {
        Ok(s) => s,
        Err(e) => return fail(format!("cannot read {}: {e}", path.display())),
    };
    let mut runtime = platform_runtime();

    let code = match cli.command {
        Cmd::Create { name, template, repo } => {
            let Some(template) = Template::parse(&template) else {
                return fail(format!(
                    "unknown template {template:?} (use full-developer, web-developer, infrastructure, regulated, minimal)"
                ));
            };
            match BoxSpec::from_template(&name, template) {
                Ok(mut spec) => {
                    spec.repo = repo;
                    if let Err(e) = runtime.create(&spec) {
                        return fail(e);
                    }
                    match store.insert(BoxRecord { spec, state: BoxState::Stopped }) {
                        Ok(()) => {
                            println!("Created box {name} (stopped). Start it with: box start {name}");
                            0
                        }
                        Err(e) => fail(e),
                    }
                }
                Err(e) => fail(e),
            }
        }
        Cmd::Start { name } => transition(&mut store, &mut runtime, &name, Op::Start),
        Cmd::Stop { name } => transition(&mut store, &mut runtime, &name, Op::Stop),
        Cmd::Restart { name } => {
            let stop = transition(&mut store, &mut runtime, &name, Op::Stop);
            if stop != 0 {
                stop
            } else {
                transition(&mut store, &mut runtime, &name, Op::Start)
            }
        }
        Cmd::Open { name } => not_yet_graphical(&store, &name, Op::Open, "graphical desktop (M7-04)"),
        Cmd::Shell { name } => not_yet_graphical(&store, &name, Op::Shell, "shell attach (M7-02)"),
        Cmd::Status { name } => match store.get(&name) {
            Some(rec) => {
                println!("{}", render_status(rec));
                0
            }
            None => fail(format!("no such box: {name}")),
        },
        Cmd::Snapshot { name } => transition(&mut store, &mut runtime, &name, Op::Snapshot),
        Cmd::Reset { name } => transition(&mut store, &mut runtime, &name, Op::Reset),
        Cmd::Delete { name } => {
            let Some(rec) = store.get(&name) else {
                return fail(format!("no such box: {name}"));
            };
            if let Err(e) = check(rec.state, Op::Delete) {
                return fail(e);
            }
            if let Err(e) = runtime.destroy(&name) {
                return fail(e);
            }
            store.remove(&name);
            println!("Deleted box {name}");
            0
        }
        Cmd::List => {
            if store.boxes.is_empty() {
                println!("No boxes. Create one with: box create <name>");
            }
            for rec in &store.boxes {
                println!("{:<20} {:?}", rec.spec.name, rec.state);
            }
            0
        }
    };

    if code == 0 {
        if let Err(e) = store.save(&path) {
            return fail(format!("cannot write {}: {e}", path.display()));
        }
    }
    code
}

fn transition(store: &mut Store, runtime: &mut dyn VmRuntime, name: &str, op: Op) -> i32 {
    let Some(rec) = store.get_mut(name) else {
        return fail(format!("no such box: {name}"));
    };
    let next = match after(rec.state, op) {
        Ok(s) => s,
        Err(e) => return fail(e),
    };
    let result = match op {
        Op::Start => runtime.start(name),
        Op::Stop => runtime.stop(name),
        Op::Snapshot => runtime.snapshot(name),
        _ => Ok(()),
    };
    if let Err(e) = result {
        return fail(e);
    }
    // Mock runtime completes instantly; the QEMU backend will confirm
    // Starting→Running / Stopping→Stopped from VM events instead.
    rec.state = match next {
        BoxState::Starting => BoxState::Running,
        BoxState::Stopping => BoxState::Stopped,
        s => s,
    };
    println!("box {name}: {:?} (mock runtime — VM operations become real with the on-device QEMU backend)", rec.state);
    0
}

fn not_yet_graphical(store: &Store, name: &str, op: Op, what: &str) -> i32 {
    let Some(rec) = store.get(name) else {
        return fail(format!("no such box: {name}"));
    };
    if let Err(e) = check(rec.state, op) {
        return fail(e);
    }
    fail(format!("{what} is not implemented yet on this platform"))
}

fn render_status(rec: &BoxRecord) -> String {
    let spec = &rec.spec;
    format!(
        "{}\n  state     {:?}\n  template  {:?}\n  repo      {}\n  agents    {}\n  internet  {:?}\n  git {} · ssh {} · persistent browser {}",
        spec.name,
        rec.state,
        spec.template,
        spec.repo.as_deref().unwrap_or("—"),
        if spec.agents.is_empty() { "—".to_string() } else { spec.agents.join(", ") },
        spec.internet,
        spec.git,
        spec.ssh,
        spec.browser_persistent,
    )
}
