//! Causal discovery engine — pure-Rust reimplementation of tigramite's
//! PCMCI / PCMCI+ / LPCMCI / FullCI / BivCI algorithms with ParCorr,
//! RobustParCorr, CMI-KNN, G-squared, and CMI-Symb independence tests.
//!
//! Reference: Runge et al., "Detecting and quantifying causal associations
//! in large nonlinear time series datasets", Science Advances 5(11), 2019.

pub mod data;
pub mod graph;
pub mod independence;
pub mod lpcmci;
pub mod pc;
pub mod pcmci;
pub mod pcmciplus;

pub use data::CausalDataFrame;
pub use graph::{CausalGraph, CausalResult, LinkType};
pub use independence::{CondIndTest, IndependenceTestKind};
pub use lpcmci::Lpcmci;
pub use pcmci::Pcmci;
pub use pcmciplus::PcmciPlus;
