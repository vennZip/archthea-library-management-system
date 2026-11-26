export function startScheduler(repository, interval = 60000) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await repository.rpc("run_library_jobs");
    } catch {
      console.error(JSON.stringify({ code: "SCHEDULED_JOB_FAILED" }));
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, interval);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
