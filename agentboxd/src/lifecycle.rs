//! Box lifecycle state machine. Destroying a Box is acceptable; escaping it is
//! not (PRD §22) — so transitions err on refusing surprising operations.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum BoxState {
    Stopped,
    Starting,
    Running,
    Stopping,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Op {
    Start,
    Stop,
    Open,
    Shell,
    Snapshot,
    Reset,
    Delete,
}

#[derive(Debug, PartialEq, Eq)]
pub struct IllegalTransition {
    pub state: BoxState,
    pub op: Op,
}

impl std::fmt::Display for IllegalTransition {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "cannot {:?} a box that is {:?}", self.op, self.state)
    }
}

/// Is `op` legal in `state`? Central authority used by CLI and daemon alike.
pub fn check(state: BoxState, op: Op) -> Result<(), IllegalTransition> {
    use BoxState::*;
    use Op::*;
    let ok = match op {
        Start => state == Stopped,
        Stop => matches!(state, Running | Starting),
        Open | Shell => state == Running,
        // Live QEMU snapshots come later; v0 snapshots quiesced state only.
        Snapshot => state == Stopped,
        // Reset/Delete mutate or remove storage: never while the VM could be using it.
        Reset | Delete => state == Stopped,
    };
    if ok {
        Ok(())
    } else {
        Err(IllegalTransition { state, op })
    }
}

/// State after an operation is initiated (the runtime later confirms
/// Starting→Running / Stopping→Stopped on events).
pub fn after(state: BoxState, op: Op) -> Result<BoxState, IllegalTransition> {
    check(state, op)?;
    Ok(match op {
        Op::Start => BoxState::Starting,
        Op::Stop => BoxState::Stopping,
        _ => state,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn start_only_from_stopped() {
        assert!(check(BoxState::Stopped, Op::Start).is_ok());
        for s in [BoxState::Starting, BoxState::Running, BoxState::Stopping] {
            assert!(check(s, Op::Start).is_err());
        }
    }

    #[test]
    fn open_and_shell_require_running() {
        assert!(check(BoxState::Running, Op::Open).is_ok());
        assert!(check(BoxState::Running, Op::Shell).is_ok());
        assert!(check(BoxState::Stopped, Op::Open).is_err());
    }

    #[test]
    fn destructive_ops_require_stopped() {
        for op in [Op::Reset, Op::Delete, Op::Snapshot] {
            assert!(check(BoxState::Stopped, op).is_ok());
            assert!(check(BoxState::Running, op).is_err(), "{op:?} while running");
        }
    }

    #[test]
    fn transitions_move_through_pending_states() {
        assert_eq!(after(BoxState::Stopped, Op::Start), Ok(BoxState::Starting));
        assert_eq!(after(BoxState::Running, Op::Stop), Ok(BoxState::Stopping));
        assert_eq!(after(BoxState::Running, Op::Shell), Ok(BoxState::Running));
    }
}
