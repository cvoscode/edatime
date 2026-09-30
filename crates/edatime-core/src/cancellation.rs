//! Small, dependency-free cancellation primitives for cooperative CPU work.
//!
//! The probe is intentionally polling-only: it is safe to pass into Rayon or
//! `spawn_blocking` closures, where async cancellation futures cannot be
//! awaited. Callers must poll at bounded intervals; opaque work that cannot
//! poll must continue to be governed by admission and work budgets.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use crate::error::DomainError;

#[derive(Clone, Debug)]
pub struct CancellationProbe(Arc<AtomicBool>);

#[derive(Clone, Debug)]
pub struct CancellationHandle(Arc<AtomicBool>);

/// Create a request-owned cancellation pair. The handle is held by the
/// awaiting task, while CPU workers receive only the probe.
pub fn cancellation_pair() -> (CancellationHandle, CancellationProbe) {
    let state = Arc::new(AtomicBool::new(false));
    (
        CancellationHandle(Arc::clone(&state)),
        CancellationProbe(state),
    )
}

impl CancellationHandle {
    pub fn cancel(&self) {
        self.0.store(true, Ordering::Release);
    }
}

impl CancellationProbe {
    pub fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::Acquire)
    }

    pub fn check(&self) -> Result<(), DomainError> {
        if self.is_cancelled() {
            Err(DomainError::Cancelled(
                "interactive request cancelled".to_string(),
            ))
        } else {
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn probe_observes_handle_cancellation() {
        let (handle, probe) = cancellation_pair();
        assert!(!probe.is_cancelled());
        handle.cancel();
        assert!(probe.is_cancelled());
        assert!(matches!(probe.check(), Err(DomainError::Cancelled(_))));
    }
}
