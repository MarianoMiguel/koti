//! Customizer Mode runtime switch (PRD §49, §63). v0 owns the `/run` flag the
//! audit's customization check observes. The full §63 off-sequence (unload dev
//! KWin code, restore policies, stage a trusted image) grows here as those
//! subsystems land — but the invariant is already right: leaving Customizer
//! Mode never *declares* the machine secure, the audit decides.

use crate::audit::{self, Probes};
use crate::state::{self, SecurityState};

pub const FLAG_PATH: &str = "/run/koti/customizer";

pub trait Flag {
    fn set(&mut self, active: bool) -> Result<(), String>;
}

/// The real flag at `/run/koti/customizer` (tmpfs: cleared on reboot, which is
/// the safe failure direction — a reboot never wakes up still-customizing).
pub struct RunFlag;

impl Flag for RunFlag {
    fn set(&mut self, active: bool) -> Result<(), String> {
        let path = std::path::Path::new(FLAG_PATH);
        if active {
            if let Some(dir) = path.parent() {
                std::fs::create_dir_all(dir).map_err(perm_hint)?;
            }
            std::fs::write(path, b"").map_err(perm_hint)
        } else {
            match std::fs::remove_file(path) {
                Ok(()) => Ok(()),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
                Err(e) => Err(perm_hint(e)),
            }
        }
    }
}

fn perm_hint(e: std::io::Error) -> String {
    if e.kind() == std::io::ErrorKind::PermissionDenied {
        format!("{e} — run as root (run0 osctl customize …; secureblue ships run0, not sudo); a polkit-backed helper is planned")
    } else {
        e.to_string()
    }
}

pub fn turn_on(flag: &mut dyn Flag) -> Result<String, String> {
    flag.set(true)?;
    Ok("Customizer Mode: ON\n\n\
        Security state is now CUSTOMIZING (PRD §50).\n\
        Development capabilities (desktop reload, dev scripts) unlock as they land.\n\
        Return with: osctl customize off"
        .to_string())
}

pub fn turn_off(flag: &mut dyn Flag, probes: &dyn Probes) -> Result<String, String> {
    flag.set(false)?;
    // Drift detection v0 = the full invariant audit (PRD §63).
    let checks = audit::run(probes);
    let derived = state::derive(&checks);
    let mut out = String::from("Customizer Mode: OFF\n\nDrift check (osctl audit):\n\n");
    out.push_str(&audit::render(&checks));
    out.push_str(&format!("\nResult\n{derived}\n"));
    if derived != SecurityState::Secure {
        out.push_str("\nThe system did NOT return to SECURE — review the results above (PRD §63).\n");
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audit::MockProbes;

    #[derive(Default)]
    struct MockFlag {
        pub active: bool,
        pub fail_with: Option<String>,
    }

    impl Flag for MockFlag {
        fn set(&mut self, active: bool) -> Result<(), String> {
            if let Some(e) = &self.fail_with {
                return Err(e.clone());
            }
            self.active = active;
            Ok(())
        }
    }

    #[test]
    fn on_sets_the_flag_and_names_the_state() {
        let mut flag = MockFlag::default();
        let msg = turn_on(&mut flag).unwrap();
        assert!(flag.active);
        assert!(msg.contains("CUSTOMIZING"));
    }

    #[test]
    fn off_with_clean_system_returns_secure() {
        let mut flag = MockFlag { active: true, fail_with: None };
        let msg = turn_off(&mut flag, &MockProbes::secure()).unwrap();
        assert!(!flag.active);
        assert!(msg.contains("Result\nSECURE"));
        assert!(!msg.contains("did NOT return"));
    }

    #[test]
    fn off_with_drift_reports_degraded_not_secure() {
        let mut flag = MockFlag { active: true, fail_with: None };
        let mut probes = MockProbes::secure();
        probes.selinux = Some(false);
        let msg = turn_off(&mut flag, &probes).unwrap();
        assert!(msg.contains("Result\nDEGRADED"));
        assert!(msg.contains("did NOT return to SECURE"));
    }

    #[test]
    fn flag_errors_propagate_with_context() {
        let mut flag = MockFlag { active: false, fail_with: Some("permission denied".into()) };
        assert!(turn_on(&mut flag).is_err());
    }
}
