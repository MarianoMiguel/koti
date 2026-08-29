//! Security audit framework (PRD §97). Checks are produced from `Probes` so the
//! audit logic is unit-testable off-device; only `LinuxProbes` touches the OS.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Status {
    Pass,
    Fail,
    /// Intentional, documented deviation (e.g. Customizer Mode active).
    IntentionalDeviation,
    /// Probe could not determine the value (unsupported platform, unreadable).
    Unknown,
}

pub struct Check {
    pub id: &'static str,
    pub group: &'static str,
    pub description: &'static str,
    pub status: Status,
}

/// System probes. `None` means "could not determine".
pub trait Probes {
    fn selinux_enforcing(&self) -> Option<bool>;
    fn secure_boot_enabled(&self) -> Option<bool>;
    /// Runtime Customizer Mode flag (contract owned by task M1-03).
    fn customizer_active(&self) -> Option<bool>;
}

pub fn platform_probes() -> Box<dyn Probes> {
    #[cfg(target_os = "linux")]
    {
        Box::new(LinuxProbes)
    }
    #[cfg(not(target_os = "linux"))]
    {
        Box::new(UnsupportedProbes)
    }
}

pub fn run(p: &dyn Probes) -> Vec<Check> {
    let bool_check = |v: Option<bool>| match v {
        Some(true) => Status::Pass,
        Some(false) => Status::Fail,
        None => Status::Unknown,
    };
    vec![
        Check {
            id: "mac.selinux",
            group: "MAC",
            description: "SELinux enforcing",
            status: bool_check(p.selinux_enforcing()),
        },
        Check {
            id: "boot.secureboot",
            group: "Boot",
            description: "Secure Boot enabled",
            status: bool_check(p.secure_boot_enabled()),
        },
        Check {
            id: "customization.inactive",
            group: "Customization",
            description: "Customizer Mode inactive",
            status: match p.customizer_active() {
                Some(false) => Status::Pass,
                // Active Customizer Mode is an intentional state, not a failure
                // (PRD §50): it drives CUSTOMIZING, never DEGRADED.
                Some(true) => Status::IntentionalDeviation,
                None => Status::Unknown,
            },
        },
    ]
}

pub fn render(checks: &[Check]) -> String {
    let mut out = String::from("SYSTEM SECURITY\n");
    let mut group = "";
    for c in checks {
        if c.group != group {
            group = c.group;
            out.push('\n');
            out.push_str(group);
            out.push('\n');
        }
        let mark = match c.status {
            Status::Pass => "✓",
            Status::Fail => "✗",
            Status::IntentionalDeviation => "◆",
            Status::Unknown => "?",
        };
        out.push_str(&format!("{mark} {}\n", c.description));
    }
    out
}

#[cfg(target_os = "linux")]
struct LinuxProbes;

#[cfg(target_os = "linux")]
impl Probes for LinuxProbes {
    fn selinux_enforcing(&self) -> Option<bool> {
        std::fs::read_to_string("/sys/fs/selinux/enforce")
            .ok()
            .map(|s| s.trim() == "1")
    }

    fn secure_boot_enabled(&self) -> Option<bool> {
        // EFI variable: 4-byte attribute prefix, then the value byte.
        let dir = std::fs::read_dir("/sys/firmware/efi/efivars").ok()?;
        for entry in dir.flatten() {
            if entry.file_name().to_string_lossy().starts_with("SecureBoot-") {
                let data = std::fs::read(entry.path()).ok()?;
                return Some(data.last().copied() == Some(1));
            }
        }
        None
    }

    fn customizer_active(&self) -> Option<bool> {
        Some(std::path::Path::new("/run/koti/customizer").exists())
    }
}

#[cfg(not(target_os = "linux"))]
struct UnsupportedProbes;

#[cfg(not(target_os = "linux"))]
impl Probes for UnsupportedProbes {
    fn selinux_enforcing(&self) -> Option<bool> {
        None
    }
    fn secure_boot_enabled(&self) -> Option<bool> {
        None
    }
    fn customizer_active(&self) -> Option<bool> {
        None
    }
}

#[cfg(test)]
pub struct MockProbes {
    pub selinux: Option<bool>,
    pub secure_boot: Option<bool>,
    pub customizer: Option<bool>,
}

#[cfg(test)]
impl Probes for MockProbes {
    fn selinux_enforcing(&self) -> Option<bool> {
        self.selinux
    }
    fn secure_boot_enabled(&self) -> Option<bool> {
        self.secure_boot
    }
    fn customizer_active(&self) -> Option<bool> {
        self.customizer
    }
}
