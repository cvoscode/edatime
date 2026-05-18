export function useAbortController() {
  let controller = new AbortController();

  return {
    get signal() {
      return controller.signal;
    },
    abort() {
      controller.abort();
      controller = new AbortController();
    },
    restart() {
      controller = new AbortController();
    },
  };
}