type Listener = () => void;

const listeners = new Set<Listener>();
let stop: (() => void) | null = null;

function tick() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      console.error(error);
    }
  });
}

// One shared one-second clock drives every poller and countdown. It runs inside a worker when
// possible because browsers throttle main-thread timers in background tabs far more aggressively.
function startTimer() {
  const id = window.setInterval(tick, 1_000);
  stop = () => window.clearInterval(id);
}

function start() {
  try {
    const source = 'setInterval(function () { postMessage(0); }, 1000);';
    const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    const worker = new Worker(url);
    const stopWorker = () => {
      worker.terminate();
      URL.revokeObjectURL(url);
    };
    worker.onmessage = tick;
    // A content security policy can reject the worker after construction; fall back to a timer.
    worker.onerror = () => {
      stopWorker();
      if (listeners.size) startTimer();
    };
    stop = stopWorker;
  } catch {
    startTimer();
  }
}

export function subscribeHeartbeat(listener: Listener) {
  listeners.add(listener);
  if (!stop) start();
  return () => {
    listeners.delete(listener);
    if (!listeners.size && stop) {
      stop();
      stop = null;
    }
  };
}
