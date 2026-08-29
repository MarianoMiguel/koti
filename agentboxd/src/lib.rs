//! Agent Box domain model (PRD §20–§41). Pure logic lives here so it builds and
//! tests anywhere; only the runtime module touches virtualization.

pub mod lifecycle;
pub mod runtime;
pub mod spec;
pub mod store;
