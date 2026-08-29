//! VM runtime abstraction (PRD §40): the UX must stay runtime-independent.
//! KVM/QEMU is the initial backend and is implemented on-device; development
//! machines use the mock runtime so CLI and state logic stay exercisable.

use crate::spec::BoxSpec;

#[derive(Debug)]
pub enum RuntimeError {
    Unsupported(&'static str),
    Failed(String),
}

impl std::fmt::Display for RuntimeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RuntimeError::Unsupported(what) => write!(f, "unsupported here: {what}"),
            RuntimeError::Failed(why) => write!(f, "runtime failure: {why}"),
        }
    }
}

pub trait VmRuntime {
    fn create(&mut self, spec: &BoxSpec) -> Result<(), RuntimeError>;
    fn start(&mut self, name: &str) -> Result<(), RuntimeError>;
    fn stop(&mut self, name: &str) -> Result<(), RuntimeError>;
    fn destroy(&mut self, name: &str) -> Result<(), RuntimeError>;
    fn snapshot(&mut self, name: &str) -> Result<(), RuntimeError>;
}

/// Development runtime: records operations, performs nothing.
#[derive(Default)]
pub struct MockRuntime {
    pub log: Vec<String>,
}

impl VmRuntime for MockRuntime {
    fn create(&mut self, spec: &BoxSpec) -> Result<(), RuntimeError> {
        self.log.push(format!("create {}", spec.name));
        Ok(())
    }
    fn start(&mut self, name: &str) -> Result<(), RuntimeError> {
        self.log.push(format!("start {name}"));
        Ok(())
    }
    fn stop(&mut self, name: &str) -> Result<(), RuntimeError> {
        self.log.push(format!("stop {name}"));
        Ok(())
    }
    fn destroy(&mut self, name: &str) -> Result<(), RuntimeError> {
        self.log.push(format!("destroy {name}"));
        Ok(())
    }
    fn snapshot(&mut self, name: &str) -> Result<(), RuntimeError> {
        self.log.push(format!("snapshot {name}"));
        Ok(())
    }
}

/// KVM/QEMU backend (PRD §40) — lands with the on-device half of M7-01.
pub struct QemuRuntime;

impl VmRuntime for QemuRuntime {
    fn create(&mut self, _spec: &BoxSpec) -> Result<(), RuntimeError> {
        Err(RuntimeError::Unsupported("QEMU backend lands with on-device M7-01"))
    }
    fn start(&mut self, _name: &str) -> Result<(), RuntimeError> {
        Err(RuntimeError::Unsupported("QEMU backend lands with on-device M7-01"))
    }
    fn stop(&mut self, _name: &str) -> Result<(), RuntimeError> {
        Err(RuntimeError::Unsupported("QEMU backend lands with on-device M7-01"))
    }
    fn destroy(&mut self, _name: &str) -> Result<(), RuntimeError> {
        Err(RuntimeError::Unsupported("QEMU backend lands with on-device M7-01"))
    }
    fn snapshot(&mut self, _name: &str) -> Result<(), RuntimeError> {
        Err(RuntimeError::Unsupported("QEMU backend lands with on-device M7-01"))
    }
}

/// Mock everywhere until the QEMU backend exists; the CLI labels mock actions.
pub fn platform_runtime() -> MockRuntime {
    MockRuntime::default()
}
