import { useEffect, useState } from 'react';

type CancelSchedule = () => void;
const DEFERRED_RENDER_DELAY_MS = 150;

function scheduleFrame(callback: () => void): CancelSchedule {
  if (typeof window.requestAnimationFrame === 'function') {
    const frameId = window.requestAnimationFrame(callback);
    return () => window.cancelAnimationFrame(frameId);
  }

  const timeoutId = window.setTimeout(callback, 16);
  return () => window.clearTimeout(timeoutId);
}

export function useDeferredRender(enabled = true): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setReady(false);
      return;
    }

    let cancelSecondFrame: CancelSchedule = () => {};
    let idleCallbackId: number | undefined;
    let delayTimeoutId: number | undefined;
    let fallbackTimeoutId: number | undefined;

    const reveal = () => setReady(true);
    const cancelFirstFrame = scheduleFrame(() => {
      cancelSecondFrame = scheduleFrame(() => {
        delayTimeoutId = window.setTimeout(() => {
          if (typeof window.requestIdleCallback === 'function') {
            idleCallbackId = window.requestIdleCallback(reveal, { timeout: 500 });
          } else {
            fallbackTimeoutId = window.setTimeout(reveal, 0);
          }
        }, DEFERRED_RENDER_DELAY_MS);
      });
    });

    return () => {
      cancelFirstFrame();
      cancelSecondFrame();
      if (idleCallbackId !== undefined && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleCallbackId);
      }
      if (delayTimeoutId !== undefined) window.clearTimeout(delayTimeoutId);
      if (fallbackTimeoutId !== undefined) window.clearTimeout(fallbackTimeoutId);
    };
  }, [enabled]);

  return ready;
}
