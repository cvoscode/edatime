// frontend/src/utils/toast.ts
var _container = null;
function ensureContainer() {
  if (_container && _container.isConnected) return _container;
  _container = document.createElement("div");
  _container.className = "toast-container";
  _container.setAttribute("aria-live", "polite");
  _container.setAttribute("role", "status");
  document.body.appendChild(_container);
  return _container;
}
function toast(message, kind = "info", durationOrOpts) {
  const opts = typeof durationOrOpts === "number" ? { duration: durationOrOpts } : durationOrOpts ?? {};
  const duration = opts.duration ?? 4e3;
  const container = ensureContainer();
  const el = document.createElement("div");
  el.className = `toast toast--${kind}`;
  el.setAttribute("role", "alert");
  const icon = document.createElement("span");
  icon.className = "toast-icon";
  icon.textContent = kind === "success" ? "\u2713" : kind === "error" ? "\u2715" : kind === "warning" ? "\u26A0" : "\u2139";
  el.appendChild(icon);
  const text = document.createElement("span");
  text.className = "toast-text";
  text.textContent = message;
  el.appendChild(text);
  if (opts.action) {
    const btn = document.createElement("button");
    btn.className = "toast-action";
    btn.textContent = opts.action.label;
    btn.addEventListener("click", () => {
      opts.action.onClick();
      dismiss();
    });
    el.appendChild(btn);
  }
  const closeBtn = document.createElement("button");
  closeBtn.className = "toast-close";
  closeBtn.textContent = "\xD7";
  closeBtn.setAttribute("aria-label", "Dismiss");
  closeBtn.addEventListener("click", dismiss);
  el.appendChild(closeBtn);
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add("toast--visible"));
  let timer = null;
  if (duration > 0) {
    timer = setTimeout(dismiss, duration);
    el.addEventListener("mouseenter", () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    });
    el.addEventListener("mouseleave", () => {
      timer = setTimeout(dismiss, 2e3);
    });
  }
  function dismiss() {
    if (timer) clearTimeout(timer);
    el.classList.remove("toast--visible");
    el.classList.add("toast--exit");
    el.addEventListener("transitionend", () => el.remove(), { once: true });
    setTimeout(() => {
      if (el.parentNode) el.remove();
    }, 400);
  }
  return dismiss;
}

export {
  toast
};
//# sourceMappingURL=chunk-T63Y6LQO.js.map
