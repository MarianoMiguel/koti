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
    use crate::audit::{run, BootedImage, MockProbes};

    #[test]
    fn all_invariants_pass_is_secure() {
        assert_eq!(derive(&run(&MockProbes::secure())), SecurityState::Secure);
    }

    #[test]
    fn active_customizer_is_customizing_not_degraded() {
        let mut p = MockProbes::secure();
        p.customizer = Some(true);
        assert_eq!(derive(&run(&p)), SecurityState::Customizing);
    }

    #[test]
    fn any_failed_invariant_is_degraded() {
        let mut p = MockProbes::secure();
        p.selinux = Some(false);
        assert_eq!(derive(&run(&p)), SecurityState::Degraded);
    }

    #[test]
    fn failure_outranks_customizing() {
        let mut p = MockProbes::secure();
        p.secure_boot = Some(false);
        p.customizer = Some(true);
        assert_eq!(derive(&run(&p)), SecurityState::Degraded);
    }

    #[test]
    fn unknown_probes_never_report_secure() {
        let mut p = MockProbes::secure();
        p.selinux = None;
        assert_eq!(derive(&run(&p)), SecurityState::Undetermined);
    }

    #[test]
    fn running_xwayland_is_degraded() {
        let mut p = MockProbes::secure();
        p.xwayland = Some(true);
        assert_eq!(derive(&run(&p)), SecurityState::Degraded);
    }

    #[test]
    fn privileged_group_membership_is_degraded() {
        let mut p = MockProbes::secure();
        p.groups = vec!["docker"];
        assert_eq!(derive(&run(&p)), SecurityState::Degraded);
    }

    #[test]
    fn unverified_image_transport_is_degraded() {
        let mut p = MockProbes::secure();
        p.image = Some(BootedImage {
            reference: "ostree-unverified-registry:ghcr.io/marianomiguel/koti:latest".into(),
            layered_packages: 0,
        });
        assert_eq!(derive(&run(&p)), SecurityState::Degraded);
    }

    #[test]
    fn foreign_image_is_degraded() {
        let mut p = MockProbes::secure();
        p.image = Some(BootedImage {
            reference: "ostree-image-signed:docker://ghcr.io/someone/else:latest".into(),
            layered_packages: 0,
        });
        assert_eq!(derive(&run(&p)), SecurityState::Degraded);
    }

    #[test]
    fn package_layering_is_degraded() {
        let mut p = MockProbes::secure();
        if let Some(img) = &mut p.image {
            img.layered_packages = 2;
        }
        assert_eq!(derive(&run(&p)), SecurityState::Degraded);
    }
}
