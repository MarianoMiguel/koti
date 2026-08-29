//! Box specification and templates (PRD §25, §27). Creation must be simple:
//! a template plus a name yields sane defaults for everything else.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Template {
    FullDeveloper,
    WebDeveloper,
    Infrastructure,
    Regulated,
    Minimal,
}

impl Template {
    pub const ALL: [Template; 5] = [
        Template::FullDeveloper,
        Template::WebDeveloper,
        Template::Infrastructure,
        Template::Regulated,
        Template::Minimal,
    ];

    pub fn parse(s: &str) -> Option<Template> {
        match s {
            "full-developer" => Some(Template::FullDeveloper),
            "web-developer" => Some(Template::WebDeveloper),
            "infrastructure" => Some(Template::Infrastructure),
            "regulated" => Some(Template::Regulated),
            "minimal" => Some(Template::Minimal),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Internet {
    /// Internet allowed; host services and LAN restricted (PRD §36 default).
    Full,
    /// Restricted egress (Regulated profile, PRD §42).
    Restricted,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BoxSpec {
    pub name: String,
    pub template: Template,
    pub repo: Option<String>,
    /// Agent CLIs provisioned inside the Box (e.g. "claude", "codex").
    pub agents: Vec<String>,
    pub browser_persistent: bool,
    pub internet: Internet,
    pub git: bool,
    pub ssh: bool,
}

impl BoxSpec {
    /// Template defaults (PRD §25: "everything else should use sane defaults").
    pub fn from_template(name: &str, template: Template) -> Result<BoxSpec, SpecError> {
        validate_name(name)?;
        let base = BoxSpec {
            name: name.to_string(),
            template,
            repo: None,
            agents: vec!["claude".into(), "codex".into()],
            browser_persistent: true,
            internet: Internet::Full,
            git: true,
            ssh: true,
        };
        Ok(match template {
            Template::FullDeveloper | Template::WebDeveloper | Template::Infrastructure => base,
            // Regulated: restricted egress, no ambient conveniences (PRD §42).
            Template::Regulated => BoxSpec {
                internet: Internet::Restricted,
                ..base
            },
            // Minimal: repository + shell (PRD §27).
            Template::Minimal => BoxSpec {
                agents: vec![],
                browser_persistent: false,
                git: true,
                ssh: false,
                ..base
            },
        })
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum SpecError {
    InvalidName(String),
}

impl std::fmt::Display for SpecError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SpecError::InvalidName(n) => write!(
                f,
                "invalid box name {n:?}: use 1-32 lowercase letters, digits or '-', starting with a letter"
            ),
        }
    }
}

pub fn validate_name(name: &str) -> Result<(), SpecError> {
    let ok = !name.is_empty()
        && name.len() <= 32
        && name.chars().next().is_some_and(|c| c.is_ascii_lowercase())
        && name
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-');
    if ok {
        Ok(())
    } else {
        Err(SpecError::InvalidName(name.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn full_developer_defaults_match_prd_36() {
        let s = BoxSpec::from_template("monarch", Template::FullDeveloper).unwrap();
        assert_eq!(s.internet, Internet::Full);
        assert!(s.browser_persistent && s.git && s.ssh);
        assert_eq!(s.agents, vec!["claude", "codex"]);
    }

    #[test]
    fn regulated_defaults_restrict_egress() {
        let s = BoxSpec::from_template("clinic", Template::Regulated).unwrap();
        assert_eq!(s.internet, Internet::Restricted);
    }

    #[test]
    fn minimal_is_repo_plus_shell() {
        let s = BoxSpec::from_template("tiny", Template::Minimal).unwrap();
        assert!(s.agents.is_empty());
        assert!(!s.browser_persistent && !s.ssh && s.git);
    }

    #[test]
    fn names_are_validated() {
        assert!(validate_name("monarch").is_ok());
        assert!(validate_name("dope-2").is_ok());
        for bad in ["", "Monarch", "9lives", "has space", "x".repeat(33).as_str()] {
            assert!(validate_name(bad).is_err(), "{bad:?} should be rejected");
        }
    }
}
