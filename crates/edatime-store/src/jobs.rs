//! In-process job state used by the future admitted background-work routes.
//!
//! The registry deliberately stores only operational metadata. It is not a
//! durable work queue: process restart expires the session, while a live job
//! gets a stable ID, observable state transitions, and a cooperative
//! cancellation signal that callers can check at safe stage boundaries.

use std::collections::BTreeMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard};

use chrono::{DateTime, Utc};
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum JobKind {
    Ingest,
    Profile,
    Materialization,
    Export,
    Analytics,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum JobStatus {
    Queued,
    Running,
    Cancelling,
    Cancelled,
    Completed,
    Failed,
    Expired,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobRecord {
    pub id: String,
    pub request_id: Option<String>,
    pub kind: JobKind,
    pub status: JobStatus,
    pub created_at: DateTime<Utc>,
    pub started_at: Option<DateTime<Utc>>,
    pub finished_at: Option<DateTime<Utc>>,
    pub progress_percent: Option<u8>,
    pub message: Option<String>,
}

#[derive(Clone)]
pub struct JobHandle {
    id: String,
    cancelled: Arc<AtomicBool>,
}

impl JobHandle {
    pub fn id(&self) -> &str {
        &self.id
    }

    pub fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::Acquire)
    }
}

struct ManagedJob {
    record: JobRecord,
    cancelled: Arc<AtomicBool>,
}

pub struct JobRegistry {
    next_id: AtomicU64,
    jobs: Mutex<BTreeMap<String, ManagedJob>>,
}

impl Default for JobRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl JobRegistry {
    pub fn new() -> Self {
        Self {
            next_id: AtomicU64::new(1),
            jobs: Mutex::new(BTreeMap::new()),
        }
    }

    pub fn create(&self, kind: JobKind) -> JobHandle {
        self.create_with_request_id(kind, None)
    }

    pub fn create_with_request_id(&self, kind: JobKind, request_id: Option<String>) -> JobHandle {
        let id = format!("job-{:016x}", self.next_id.fetch_add(1, Ordering::Relaxed));
        let cancelled = Arc::new(AtomicBool::new(false));
        let record = JobRecord {
            id: id.clone(),
            request_id,
            kind,
            status: JobStatus::Queued,
            created_at: Utc::now(),
            started_at: None,
            finished_at: None,
            progress_percent: Some(0),
            message: None,
        };
        lock_recover(&self.jobs).insert(
            id.clone(),
            ManagedJob {
                record,
                cancelled: Arc::clone(&cancelled),
            },
        );
        JobHandle { id, cancelled }
    }

    pub fn start(&self, handle: &JobHandle) -> bool {
        let mut jobs = lock_recover(&self.jobs);
        let Some(job) = jobs.get_mut(handle.id()) else {
            return false;
        };
        if job.cancelled.load(Ordering::Acquire) {
            job.record.status = JobStatus::Cancelled;
            job.record.finished_at = Some(Utc::now());
            return false;
        }
        if job.record.status != JobStatus::Queued {
            return false;
        }
        job.record.status = JobStatus::Running;
        job.record.started_at = Some(Utc::now());
        true
    }

    pub fn update_progress(
        &self,
        handle: &JobHandle,
        percent: u8,
        message: Option<String>,
    ) -> bool {
        let mut jobs = lock_recover(&self.jobs);
        let Some(job) = jobs.get_mut(handle.id()) else {
            return false;
        };
        if job.record.status != JobStatus::Running {
            return false;
        }
        job.record.progress_percent = Some(percent.min(100));
        job.record.message = message;
        true
    }

    pub fn complete(&self, handle: &JobHandle) -> bool {
        self.finish(handle, JobStatus::Completed, None)
    }

    pub fn fail(&self, handle: &JobHandle, message: String) -> bool {
        self.finish(handle, JobStatus::Failed, Some(message))
    }

    pub fn cancel(&self, id: &str) -> Option<JobRecord> {
        let mut jobs = lock_recover(&self.jobs);
        let job = jobs.get_mut(id)?;
        match job.record.status {
            JobStatus::Queued => {
                job.cancelled.store(true, Ordering::Release);
                job.record.status = JobStatus::Cancelled;
                job.record.finished_at = Some(Utc::now());
            }
            JobStatus::Running | JobStatus::Cancelling => {
                job.cancelled.store(true, Ordering::Release);
                job.record.status = JobStatus::Cancelling;
            }
            JobStatus::Cancelled
            | JobStatus::Completed
            | JobStatus::Failed
            | JobStatus::Expired => {}
        }
        Some(job.record.clone())
    }

    pub fn record(&self, id: &str) -> Option<JobRecord> {
        lock_recover(&self.jobs)
            .get(id)
            .map(|job| job.record.clone())
    }

    pub fn list(&self) -> Vec<JobRecord> {
        lock_recover(&self.jobs)
            .values()
            .map(|job| job.record.clone())
            .collect()
    }

    fn finish(&self, handle: &JobHandle, status: JobStatus, message: Option<String>) -> bool {
        let mut jobs = lock_recover(&self.jobs);
        let Some(job) = jobs.get_mut(handle.id()) else {
            return false;
        };
        if job.cancelled.load(Ordering::Acquire) {
            job.record.status = JobStatus::Cancelled;
        } else {
            job.record.status = status;
        }
        job.record.progress_percent = Some(100);
        if message.is_some() {
            job.record.message = message;
        }
        job.record.finished_at = Some(Utc::now());
        true
    }
}

fn lock_recover<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    match mutex.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    }
}

#[cfg(test)]
mod tests {
    use super::{JobKind, JobRegistry, JobStatus};

    #[test]
    fn job_lifecycle_reports_progress_and_completion() {
        let jobs = JobRegistry::new();
        let handle = jobs.create(JobKind::Export);
        assert_eq!(jobs.record(handle.id()).unwrap().status, JobStatus::Queued);
        assert!(jobs.start(&handle));
        assert!(jobs.update_progress(&handle, 45, Some("writing".into())));
        assert!(jobs.complete(&handle));
        let record = jobs.record(handle.id()).unwrap();
        assert_eq!(record.status, JobStatus::Completed);
        assert_eq!(record.progress_percent, Some(100));
        assert_eq!(record.message.as_deref(), Some("writing"));
    }

    #[test]
    fn cancelling_running_job_signals_handle_and_preserves_cancelled_terminal_state() {
        let jobs = JobRegistry::new();
        let handle = jobs.create(JobKind::Materialization);
        assert!(jobs.start(&handle));
        assert_eq!(
            jobs.cancel(handle.id()).unwrap().status,
            JobStatus::Cancelling
        );
        assert!(handle.is_cancelled());
        assert!(jobs.complete(&handle));
        assert_eq!(
            jobs.record(handle.id()).unwrap().status,
            JobStatus::Cancelled
        );
    }
}
