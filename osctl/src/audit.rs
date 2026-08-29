//! Security audit framework (PRD §97). Checks are produced from `Probes` so the
//! audit logic is unit-testable off-device; only `LinuxProbes` touches the OS.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Status {
    Pass,
    Fail,
    /// Advisory only — rendered, never changes the derived state (PRD §97).
    Warning,
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
    pub note: Option<String>,
}

impl Check {
    fn new(id: &'static str, group: &'static str, description: &'static str, status: Status) -> Check {
        Check { id, group, description, status, note: None }
    }

    fn with_note(mut self, note: impl Into<String>) -> Check {
        self.note = Some(note.into());
        self
    }
}

/// The booted deployment as reported by rpm-ostree.
#[derive(Debug, Clone)]
pub struct BootedImage {
    /// e.g. "ostree-image-signed:docker://ghcr.io/marianomiguel/koti:latest"
    pub reference: String,
    pub layered_packages: u32,
}

/// System probes. `None` means "could not determine".
pub trait Probes {
    fn selinux_enforcing(&self) -> Option<bool>;
    fn secure_boot_enabled(&self) -> Option<bool>;
    /// Runtime Customizer Mode flag (contract owned by task M1-03).
    fn customizer_active(&self) -> Option<bool>;
    fn xwayland_running(&self) -> Option<bool>;
    fn docker_root_socket_present(&self) -> Option<bool>;
    /// Supplementary-group membership of the invoking user.
    fn user_in_group(&self, group: &str) -> Option<bool>;
    fn booted_image(&self) -> Option<BootedImage>;
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

/// Published Koti image path fragment the booted reference must contain.
pub const EXPECTED_IMAGE: &str = "marianomiguel/koti";
const SIGNED_TRANSPORT: &str = "ostree-image-signed:";

fn pass_when(v: Option<bool>, pass_value: bool) -> Status {
    match v {
        Some(x) if x == pass_value => Status::Pass,
        Some(_) => Status::Fail,
        None => Status::Unknown,
    }
}

pub fn run(p: &dyn Probes) -> Vec<Check> {
    let mut checks = Vec::new();

    // Image (PRD §51: trusted image, verified signature, no layering)
    match p.booted_image() {
        Some(img) => {
            let known = img.reference.contains(EXPECTED_IMAGE);
            let signed = img.reference.starts_with(SIGNED_TRANSPORT);
            checks.push(if known {
                Check::new("image.reference", "Image", "Booted image is a Koti release", Status::Pass)
            } else {
                Check::new("image.reference", "Image", "Booted image is a Koti release", Status::Fail)
                    .with_note(format!("booted: {}", img.reference))
            });
            checks.push(if signed {
                Check::new("image.signature", "Image", "Image pulled over a signature-verified transport", Status::Pass)
            } else {
                // §51 "image signature valid" is an invariant, so unverified
                // transports fail; the note points at the fix.
                Check::new("image.signature", "Image", "Image pulled over a signature-verified transport", Status::Fail)
                    .with_note("complete the signed rebase (docs/install.md, step 4)")
            });
            checks.push(if img.layered_packages == 0 {
                Check::new("image.layering", "Image", "No local package layering", Status::Pass)
            } else {
                Check::new("image.layering", "Image", "No local package layering", Status::Fail)
                    .with_note(format!("{} layered package(s) — see PRD §89", img.layered_packages))
            });
        }
        None => {
            checks.push(Check::new("image.reference", "Image", "Booted image is a Koti release", Status::Unknown));
        }
    }

    // Boot / MAC
    checks.push(Check::new(
        "boot.secureboot",
        "Boot",
        "Secure Boot enabled",
        pass_when(p.secure_boot_enabled(), true),
    ));
    checks.push(Check::new(
        "mac.selinux",
        "MAC",
        "SELinux enforcing",
        pass_when(p.selinux_enforcing(), true),
    ));

    // Desktop (PRD §51: XWayland disabled)
    checks.push(Check::new(
        "desktop.xwayland",
        "Desktop",
        "XWayland not running",
        pass_when(p.xwayland_running(), false),
    ));

    // Privileges (PRD §96)
    checks.push(Check::new(
        "privileges.docker-socket",
        "Privileges",
        "No Docker root socket",
        pass_when(p.docker_root_socket_present(), false),
    ));
    for (id, group, desc) in [
        ("privileges.group-docker", "docker", "User not in docker group"),
        ("privileges.group-libvirt", "libvirt", "User not in libvirt group"),
        ("privileges.group-uinput", "uinput", "User not in uinput group"),
    ] {
        checks.push(Check::new(id, "Privileges", desc, pass_when(p.user_in_group(group), false)));
    }

    // Customization
    checks.push(Check {
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
        note: None,
    });

    checks
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
            Status::Warning => "!",
            Status::IntentionalDeviation => "◆",
            Status::Unknown => "?",
        };
        out.push_str(&format!("{mark} {}\n", c.description));
        if let Some(note) = &c.note {
            out.push_str(&format!("  · {note}\n"));
        }
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

    fn xwayland_running(&self) -> Option<bool> {
        let proc = std::fs::read_dir("/proc").ok()?;
        for entry in proc.flatten() {
            let name = entry.file_name();
            if !name.to_string_lossy().chars().all(|c| c.is_ascii_digit()) {
                continue;
            }
            if let Ok(comm) = std::fs::read_to_string(entry.path().join("comm")) {
                if comm.trim() == "Xwayland" {
                    return Some(true);
                }
            }
        }
        Some(false)
    }

    fn docker_root_socket_present(&self) -> Option<bool> {
        Some(
            std::path::Path::new("/run/docker.sock").exists()
                || std::path::Path::new("/var/run/docker.sock").exists(),
        )
    }

    fn user_in_group(&self, group: &str) -> Option<bool> {
        let user = std::env::var("SUDO_USER").or_else(|_| std::env::var("USER")).ok()?;
        let groups = std::fs::read_to_string("/etc/group").ok()?;
        for line in groups.lines() {
            let mut fields = line.split(':');
            if fields.next() != Some(group) {
                continue;
            }
            let members = fields.nth(2).unwrap_or("");
            return Some(members.split(',').any(|m| m.trim() == user));
        }
        Some(false) // group doesn't exist → nobody is in it
    }

    fn booted_image(&self) -> Option<BootedImage> {
        let out = std::process::Command::new("rpm-ostree")
            .args(["status", "--json"])
            .output()
            .ok()?;
        if !out.status.success() {
            return None;
        }
        let json: serde_json::Value = serde_json::from_slice(&out.stdout).ok()?;
        let deployments = json.get("deployments")?.as_array()?;
        let booted = deployments
            .iter()
            .find(|d| d.get("booted").and_then(|b| b.as_bool()) == Some(true))?;
        let reference = booted
            .get("container-image-reference")
            .and_then(|r| r.as_str())
            .unwrap_or("")
            .to_string();
        let count = |key: &str| {
            booted
                .get(key)
                .and_then(|v| v.as_array())
                .map(|a| a.len() as u32)
                .unwrap_or(0)
        };
        Some(BootedImage {
            reference,
            layered_packages: count("packages") + count("requested-local-packages"),
        })
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
    fn xwayland_running(&self) -> Option<bool> {
        None
    }
    fn docker_root_socket_present(&self) -> Option<bool> {
        None
    }
    fn user_in_group(&self, _group: &str) -> Option<bool> {
        None
    }
    fn booted_image(&self) -> Option<BootedImage> {
        None
    }
}

#[cfg(test)]
pub struct MockProbes {
    pub selinux: Option<bool>,
    pub secure_boot: Option<bool>,
    pub customizer: Option<bool>,
    pub xwayland: Option<bool>,
    pub docker_socket: Option<bool>,
    pub groups: Vec<&'static str>,
    pub image: Option<BootedImage>,
}

#[cfg(test)]
impl MockProbes {
    /// A fully healthy SECURE baseline; tests perturb single fields.
    pub fn secure() -> MockProbes {
        MockProbes {
            selinux: Some(true),
            secure_boot: Some(true),
            customizer: Some(false),
            xwayland: Some(false),
            docker_socket: Some(false),
            groups: vec![],
            image: Some(BootedImage {
                reference: format!("{SIGNED_TRANSPORT}docker://ghcr.io/{EXPECTED_IMAGE}:latest"),
                layered_packages: 0,
            }),
        }
    }
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
    fn xwayland_running(&self) -> Option<bool> {
        self.xwayland
    }
    fn docker_root_socket_present(&self) -> Option<bool> {
        self.docker_socket
    }
    fn user_in_group(&self, group: &str) -> Option<bool> {
        Some(self.groups.contains(&group))
    }
    fn booted_image(&self) -> Option<BootedImage> {
        self.image.clone()
    }
}
