//! Security-state machine (PRD §50): SECURE / CUSTOMIZING / DEGRADED are
//! verified technical states derived from audit results, never cosmetic labels.

use crate::audit::{Check, Status};
use std::fmt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SecurityState {
    Secure,
    Customizing,
    Degraded,
    /// One or more checks could not be determined (e.g. non-Linux dev host).
    /// Never reported as Secure: unknown is not verified (PRD §3.4).
    Undetermined,
}

impl fmt::Display for SecurityState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            SecurityState::Secure => "SECURE",
            SecurityState::Customizing => "CUSTOMIZING",
            SecurityState::Degraded => "DEGRADED",
            SecurityState::Undetermined => "UNDETERMINED",
        })
    }
}

pub fn derive(checks: &[Check]) -> SecurityState {
    if checks.iter().any(|c| c.status == Status::Fail) {
        return SecurityState::Degraded;
    }
    let customizing = checks
        .iter()
        .any(|c| c.id == "customization.inactive" && c.status == Status::IntentionalDeviation);
    if customizing {
        return SecurityState::Customizing;
    }
    if checks.iter().any(|c| c.status == Status::Unknown) {
        return SecurityState::Undetermined;
    }
    SecurityState::Secure
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audit::{run, MockProbes};

    fn probes(selinux: Option<bool>, secure_boot: Option<bool>, customizer: Option<bool>) -> MockProbes {
        MockProbes {
            selinux,
            secure_boot,
            customizer,
        }
    }

    #[test]
    fn all_invariants_pass_is_secure() {
        let checks = run(&probes(Some(true), Some(true), Some(false)));
        assert_eq!(derive(&checks), SecurityState::Secure);
    }

    #[test]
    fn active_customizer_is_customizing_not_degraded() {
        let checks = run(&probes(Some(true), Some(true), Some(true)));
        assert_eq!(derive(&checks), SecurityState::Customizing);
    }

    #[test]
    fn any_failed_invariant_is_degraded() {
        let checks = run(&probes(Some(false), Some(true), Some(false)));
        assert_eq!(derive(&checks), SecurityState::Degraded);
    }

    #[test]
    fn failure_outranks_customizing() {
        let checks = run(&probes(Some(true), Some(false), Some(true)));
        assert_eq!(derive(&checks), SecurityState::Degraded);
    }

    #[test]
    fn unknown_probes_never_report_secure() {
        let checks = run(&probes(None, None, None));
        assert_eq!(derive(&checks), SecurityState::Undetermined);
    }
}
