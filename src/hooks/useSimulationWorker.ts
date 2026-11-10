import { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '../utils/logger';
import type { SimulationKind, SimulationMessage, SimulationTasks } from '../utils/simulationWorker';
import SimulationWorker from '../workers/simulation.worker?worker';

export function useSimulationWorker<Kind extends SimulationKind>(kind: Kind) {
  const [result, setResult] = useState<SimulationTasks[Kind]['result'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const workerRef = useRef<Worker | null>(null);
  const reportedProgress = useRef(0);

  const cancel = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setIsRunning(false);
    setProgress(0);
    reportedProgress.current = 0;
  }, []);

  const run = useCallback((input: SimulationTasks[Kind]['input']) => {
    cancel();
    setResult(null);
    setError(null);
    setIsRunning(true);

    const fail = (message: string) => {
      logger.error('simulation', 'worker-failed', `${kind} simulation failed`, { pii: { error: message } });
      setError(message);
      cancel();
    };

    try {
      const worker = new SimulationWorker();
      workerRef.current = worker;
      worker.onmessage = ({ data }: MessageEvent<SimulationMessage<SimulationTasks[Kind]['result']>>) => {
        if (workerRef.current !== worker) return;
        if (data.type === 'progress') {
          const next = Math.round(data.completed / data.total * 100);
          if (next - reportedProgress.current >= 5 || next === 100) {
            reportedProgress.current = next;
            setProgress(next);
          }
        } else if (data.type === 'result') {
          setResult(data.result);
          setIsRunning(false);
          setProgress(100);
          worker.terminate();
          workerRef.current = null;
        } else {
          fail(data.message);
        }
      };
      worker.onerror = (event) => {
        if (workerRef.current === worker) fail(event.message || 'The simulation worker could not start.');
      };
      worker.onmessageerror = () => {
        if (workerRef.current === worker) fail('The simulation result could not be read. Run it again.');
      };
      worker.postMessage({ kind, input });
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
  }, [kind, cancel]);

  useEffect(() => () => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  return { result, error, isRunning, progress, run, cancel };
}
