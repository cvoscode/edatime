use super::{
    AdmissionMetricsGuard, ExecutionContext, QueryAdmission, QueryExecutor, configured_worker_count,
};
use edatime_core::error::DomainError;
use edatime_core::metrics::{AppMetrics, CpuStage};
use std::sync::Arc;
use std::time::Duration;

#[test]
fn query_worker_count_is_capped_by_available_parallelism() {
    assert_eq!(configured_worker_count(Some("12"), 6), 6);
    assert_eq!(configured_worker_count(Some("0"), 6), 6);
    assert_eq!(configured_worker_count(Some("invalid"), 16), 8);
    assert_eq!(configured_worker_count(None, 2), 2);
}

#[tokio::test]
async fn session_jobs_wait_past_http_deadline_with_bounded_queue() {
    let admission = QueryAdmission::new(1, 1, 1, 1, Duration::from_millis(5));
    let running = admission.acquire_background().await.expect("running job");
    let waiting = admission.background.acquire_queued();
    tokio::pin!(waiting);
    assert!(
        tokio::time::timeout(Duration::from_millis(20), &mut waiting)
            .await
            .is_err()
    );
    assert!(matches!(
        admission.background.acquire_queued().await,
        Err(DomainError::Overloaded(_))
    ));
    drop(running);
    let admitted = waiting.await.expect("session job remains queued");
    assert_eq!(admission.background.waiting.available_permits(), 1);
    drop(admitted);
    assert_eq!(admission.background.running.available_permits(), 1);
}

#[tokio::test]
async fn admission_has_independent_bounded_interactive_and_background_lanes() {
    let admission = QueryAdmission::new(1, 1, 1, 1, Duration::from_millis(50));
    let interactive = admission
        .acquire_interactive()
        .await
        .expect("interactive permit");
    assert!(
        admission
            .interactive
            .running
            .clone()
            .try_acquire_owned()
            .is_err()
    );

    let background = admission
        .acquire_background()
        .await
        .expect("background permit");
    assert!(
        admission
            .background
            .running
            .clone()
            .try_acquire_owned()
            .is_err()
    );

    drop(interactive);
    assert!(
        admission
            .interactive
            .running
            .clone()
            .try_acquire_owned()
            .is_ok()
    );
    drop(background);
    assert!(
        admission
            .background
            .running
            .clone()
            .try_acquire_owned()
            .is_ok()
    );
}

#[tokio::test]
async fn admission_rejects_when_the_bounded_waiting_room_is_full() {
    let admission = QueryAdmission::new(1, 1, 1, 1, Duration::from_secs(1));
    let running = admission
        .acquire_interactive()
        .await
        .expect("running permit");
    let queued_admission = admission.clone();
    let queued = tokio::spawn(async move { queued_admission.acquire_interactive().await });
    tokio::task::yield_now().await;

    let rejected = admission
        .acquire_interactive()
        .await
        .expect_err("second waiter must be rejected");
    assert!(matches!(rejected, DomainError::Overloaded(_)));

    drop(running);
    assert!(queued.await.expect("queued task join").is_ok());
}

#[tokio::test]
async fn admission_times_out_a_queued_worker() {
    let admission = QueryAdmission::new(1, 1, 1, 1, Duration::from_millis(5));
    let _running = admission
        .acquire_interactive()
        .await
        .expect("running permit");
    let rejected = admission
        .acquire_interactive()
        .await
        .expect_err("queued worker must time out");
    assert!(matches!(rejected, DomainError::Overloaded(_)));
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn cancelled_request_keeps_interactive_permit_until_worker_exits() {
    let executor = Arc::new(
        QueryExecutor::new(ExecutionContext::Parallel).with_admission(
            1,
            1,
            1,
            1,
            Duration::from_millis(10),
        ),
    );
    let (started_tx, started_rx) = std::sync::mpsc::sync_channel(1);
    let (cancelled_tx, cancelled_rx) = std::sync::mpsc::sync_channel(1);
    let (release_tx, release_rx) = std::sync::mpsc::channel();
    let (finished_tx, finished_rx) = std::sync::mpsc::sync_channel(1);
    let worker = Arc::clone(&executor);
    let request = tokio::spawn(async move {
        worker
            .run_interactive_cancellable(CpuStage::Scatter, move |probe| {
                started_tx.send(()).expect("signal worker start");
                while !probe.is_cancelled() {
                    std::thread::sleep(Duration::from_millis(1));
                }
                cancelled_tx.send(()).expect("signal cancellation");
                release_rx.recv().expect("wait for worker release");
                finished_tx.send(()).expect("signal worker finish");
            })
            .await
    });

    started_rx
        .recv_timeout(Duration::from_secs(1))
        .expect("worker started");
    request.abort();
    let _ = request.await;
    cancelled_rx
        .recv_timeout(Duration::from_secs(1))
        .expect("worker observed caller cancellation");
    assert!(matches!(
        executor.run_interactive(CpuStage::Scatter, || ()).await,
        Err(DomainError::Overloaded(_))
    ));

    release_tx.send(()).expect("release worker");
    finished_rx
        .recv_timeout(Duration::from_secs(1))
        .expect("worker finished");
    executor
        .run_interactive(CpuStage::Scatter, || ())
        .await
        .expect("worker released its admission permit");
}

#[tokio::test(flavor = "current_thread")]
async fn concurrent_interactive_work_keeps_tokio_tasks_responsive() {
    let executor = Arc::new(
        QueryExecutor::new(ExecutionContext::Parallel).with_admission(
            2,
            1,
            1,
            1,
            Duration::from_secs(1),
        ),
    );
    let heartbeat_count = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let heartbeat_counter = Arc::clone(&heartbeat_count);
    let heartbeat = tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_millis(2));
        interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        loop {
            interval.tick().await;
            heartbeat_counter.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        }
    });
    let first_executor = Arc::clone(&executor);
    let second_executor = Arc::clone(&executor);
    let first_counter = Arc::clone(&heartbeat_count);
    let second_counter = Arc::clone(&heartbeat_count);
    let work = async move {
        tokio::join!(
            first_executor.run_interactive(CpuStage::Scatter, move || {
                wait_for_heartbeat(first_counter)
            }),
            second_executor.run_interactive(CpuStage::Scatter, move || {
                wait_for_heartbeat(second_counter)
            }),
        )
    };
    let results = tokio::time::timeout(Duration::from_secs(2), work)
        .await
        .expect("interactive workers should finish");
    heartbeat.abort();
    assert!(results.0.expect("first worker") >= 3);
    assert!(results.1.expect("second worker") >= 3);
}

fn wait_for_heartbeat(counter: Arc<std::sync::atomic::AtomicUsize>) -> usize {
    let deadline = std::time::Instant::now() + Duration::from_secs(1);
    while counter.load(std::sync::atomic::Ordering::Relaxed) < 3
        && std::time::Instant::now() < deadline
    {
        std::thread::sleep(Duration::from_millis(1));
    }
    counter.load(std::sync::atomic::Ordering::Relaxed)
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn dropping_cancellable_work_signals_its_worker_and_records_cancellation() {
    let metrics = Arc::new(AppMetrics::new());
    let executor =
        Arc::new(QueryExecutor::new(ExecutionContext::Parallel).with_metrics(Arc::clone(&metrics)));
    let (started_tx, started_rx) = std::sync::mpsc::sync_channel(1);
    let (cancelled_tx, cancelled_rx) = std::sync::mpsc::sync_channel(1);
    let worker = Arc::clone(&executor);
    let task = tokio::spawn(async move {
        worker
            .run_interactive_cancellable(CpuStage::Analytics, move |probe| {
                started_tx.send(()).expect("signal worker start");
                loop {
                    if probe.is_cancelled() {
                        cancelled_tx.send(()).expect("signal cancellation");
                        break;
                    }
                    std::thread::sleep(Duration::from_millis(1));
                }
            })
            .await
    });

    started_rx
        .recv_timeout(Duration::from_secs(1))
        .expect("worker started");
    task.abort();
    let _ = task.await;
    cancelled_rx
        .recv_timeout(Duration::from_secs(1))
        .expect("worker observed cancellation");

    tokio::time::timeout(Duration::from_secs(1), async {
        loop {
            if metrics.snapshot(0, 0).cpu_admission.cancelled_total == 1 {
                return;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .expect("worker cancellation metric recorded");
    let snapshot = metrics.snapshot(0, 0).cpu_admission;
    assert_eq!(snapshot.cancelled_total, 1);
    assert_eq!(snapshot.running, 0);
}

#[test]
fn cancelled_admission_guard_balances_queue_metrics() {
    let metrics = Arc::new(AppMetrics::new());
    drop(AdmissionMetricsGuard::submitted(
        Some(Arc::clone(&metrics)),
        CpuStage::Analytics,
    ));
    let snapshot = metrics.snapshot(0, 0).cpu_admission;
    assert_eq!(snapshot.submitted_total, 1);
    assert_eq!(snapshot.cancelled_total, 1);
    assert_eq!(snapshot.queued, 0);
    assert_eq!(snapshot.running, 0);
}
