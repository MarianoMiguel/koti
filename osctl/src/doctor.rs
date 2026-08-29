//! System diagnostics (PRD §98) — v0 reports what it can see and says
//! "unavailable" for the rest; a section is never silently omitted.

use crate::audit::Probes;

pub trait DoctorProbes {
    /// Names of failed systemd units; None if systemd isn't reachable.
    fn failed_units(&self) -> Option<Vec<String>>;
    fn agentboxd_installed(&self) -> bool;
}

pub struct PlatformDoctorProbes;

impl DoctorProbes for PlatformDoctorProbes {
    fn failed_units(&self) -> Option<Vec<String>> {
        #[cfg(target_os = "linux")]
        {
            let out = std::process::Command::new("systemctl")
                .args(["list-units", "--state=failed", "--no-legend", "--plain"])
                .output()
                .ok()?;
            if !out.status.success() {
                return None;
            }
            Some(
                String::from_utf8_lossy(&out.stdout)
                    .lines()
                    .filter_map(|l| l.split_whitespace().next().map(str::to_string))
                    .collect(),
            )
        }
        #[cfg(not(target_os = "linux"))]
        {
            None
        }
    }

    fn agentboxd_installed(&self) -> bool {
        std::path::Path::new("/usr/bin/agentboxd").exists()
    }
}

pub fn run(audit_probes: &dyn Probes, doctor: &dyn DoctorProbes) -> String {
    let mut out = String::from("KOTI DOCTOR\n");

    out.push_str("\nDeployment\n");
    match audit_probes.booted_image() {
        Some(img) => {
            out.push_str(&format!("  image    {}\n", img.reference));
            out.push_str(&format!("  layered  {} package(s)\n", img.layered_packages));
        }
        None => out.push_str("  unavailable (no rpm-ostree — dev host?)\n"),
    }

    out.push_str("\nCustomizer\n");
    match audit_probes.customizer_active() {
        Some(true) => out.push_str("  ACTIVE — security state is CUSTOMIZING\n"),
        Some(false) => out.push_str("  inactive\n"),
        None => out.push_str("  unavailable\n"),
    }

    out.push_str("\nServices\n");
    match doctor.failed_units() {
        Some(units) if units.is_empty() => out.push_str("  no failed systemd units\n"),
        Some(units) => {
            for u in &units {
                out.push_str(&format!("  FAILED  {u}\n"));
            }
        }
        None => out.push_str("  systemd status unavailable\n"),
    }

    out.push_str("\nAgent Boxes\n");
    out.push_str(if doctor.agentboxd_installed() {
        "  agentboxd installed\n"
    } else {
        "  agentboxd not installed\n"
    });

    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::audit::MockProbes;

    struct MockDoctor {
        units: Option<Vec<String>>,
        agentboxd: bool,
    }

    impl DoctorProbes for MockDoctor {
        fn failed_units(&self) -> Option<Vec<String>> {
            self.units.clone()
        }
        fn agentboxd_installed(&self) -> bool {
            self.agentboxd
        }
    }

    #[test]
    fn healthy_report_names_every_section() {
        let report = run(
            &MockProbes::secure(),
            &MockDoctor { units: Some(vec![]), agentboxd: true },
        );
        for section in ["Deployment", "Customizer", "Services", "Agent Boxes"] {
            assert!(report.contains(section), "missing section {section}");
        }
        assert!(report.contains("no failed systemd units"));
        assert!(report.contains("agentboxd installed"));
    }

    #[test]
    fn failed_units_are_listed_by_name() {
        let report = run(
            &MockProbes::secure(),
            &MockDoctor {
                units: Some(vec!["pipewire.service".into()]),
                agentboxd: false,
            },
        );
        assert!(report.contains("FAILED  pipewire.service"));
        assert!(report.contains("agentboxd not installed"));
    }

    #[test]
    fn unavailable_probes_are_reported_not_hidden() {
        let mut probes = MockProbes::secure();
        probes.image = None;
        let report = run(&probes, &MockDoctor { units: None, agentboxd: false });
        assert!(report.contains("unavailable"));
    }
}
