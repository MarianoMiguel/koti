//! Box records persisted as JSON. v0 is a single state file driven by the
//! `box` CLI in-process; the daemon owns this once the socket API exists.

use crate::lifecycle::BoxState;
use crate::spec::BoxSpec;
use serde::{Deserialize, Serialize};
use std::io;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoxRecord {
    pub spec: BoxSpec,
    pub state: BoxState,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct Store {
    pub boxes: Vec<BoxRecord>,
}

impl Store {
    /// `$KOTI_STATE_DIR/boxes.json`, else `$XDG_STATE_HOME/koti/boxes.json`,
    /// else `~/.local/state/koti/boxes.json`.
    pub fn default_path() -> PathBuf {
        if let Ok(dir) = std::env::var("KOTI_STATE_DIR") {
            return PathBuf::from(dir).join("boxes.json");
        }
        let base = std::env::var("XDG_STATE_HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|_| {
                let home = std::env::var("HOME").unwrap_or_else(|_| ".".into());
                PathBuf::from(home).join(".local/state")
            });
        base.join("koti").join("boxes.json")
    }

    pub fn load(path: &Path) -> io::Result<Store> {
        match std::fs::read_to_string(path) {
            Ok(s) => serde_json::from_str(&s).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e)),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(Store::default()),
            Err(e) => Err(e),
        }
    }

    pub fn save(&self, path: &Path) -> io::Result<()> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::write(path, serde_json::to_string_pretty(self).expect("store serializes"))
    }

    pub fn get(&self, name: &str) -> Option<&BoxRecord> {
        self.boxes.iter().find(|b| b.spec.name == name)
    }

    pub fn get_mut(&mut self, name: &str) -> Option<&mut BoxRecord> {
        self.boxes.iter_mut().find(|b| b.spec.name == name)
    }

    pub fn insert(&mut self, record: BoxRecord) -> Result<(), String> {
        if self.get(&record.spec.name).is_some() {
            return Err(format!("box {:?} already exists", record.spec.name));
        }
        self.boxes.push(record);
        Ok(())
    }

    pub fn remove(&mut self, name: &str) -> bool {
        let before = self.boxes.len();
        self.boxes.retain(|b| b.spec.name != name);
        self.boxes.len() != before
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::spec::Template;

    #[test]
    fn round_trips_through_disk() {
        let dir = std::env::temp_dir().join(format!("koti-store-test-{}", std::process::id()));
        let path = dir.join("boxes.json");
        let mut store = Store::default();
        store
            .insert(BoxRecord {
                spec: BoxSpec::from_template("monarch", Template::FullDeveloper).unwrap(),
                state: BoxState::Stopped,
            })
            .unwrap();
        store.save(&path).unwrap();
        let back = Store::load(&path).unwrap();
        assert_eq!(back.boxes.len(), 1);
        assert_eq!(back.get("monarch").unwrap().state, BoxState::Stopped);
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn missing_file_is_an_empty_store() {
        let s = Store::load(Path::new("/nonexistent/koti/boxes.json")).unwrap();
        assert!(s.boxes.is_empty());
    }

    #[test]
    fn duplicate_names_are_rejected() {
        let mut store = Store::default();
        let rec = BoxRecord {
            spec: BoxSpec::from_template("dope", Template::Minimal).unwrap(),
            state: BoxState::Stopped,
        };
        store.insert(rec.clone()).unwrap();
        assert!(store.insert(rec).is_err());
    }
}
