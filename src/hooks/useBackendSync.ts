import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react';
import {
  acknowledgeViewRefresh,
  getRemoteGeneration,
  getSyncStatus,
  subscribeRemoteChanges,
  subscribeSyncStatus,
  type BackendSyncStatus,
} from '../utils/backendSync';

export function useSyncStatus(): BackendSyncStatus {
  return useSyncExternalStore(subscribeSyncStatus, getSyncStatus, getSyncStatus);
}

const RETRY_WHILE_BUSY_MS = 750;
const NON_TEXT_INPUT_TYPES = new Set(['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'reset', 'submit']);

/**
 * True while remounting the page would interrupt the user: a modal dialog is
 * open or focus is in a control that holds an unsaved draft.
 */
export function isInteractionBusy(doc: Document = document): boolean {
  if (doc.querySelector('[aria-modal="true"], dialog[open]')) return true;
  const active = doc.activeElement;
  if (!(active instanceof HTMLElement)) return false;
  if (active.isContentEditable || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement) return true;
  return active instanceof HTMLInputElement && !NON_TEXT_INPUT_TYPES.has(active.type);
}

interface EpochState {
  epoch: number;
  generation: number;
  focusInMain: boolean;
  scrollY: number;
}

/**
 * Data epoch for the routed page. Remote database changes bump it (which
 * remounts the page so it reads the refreshed cache), deferred while a
 * dialog is open or the user is editing a field.
 */
export function useDataEpoch(): number {
  const [state, setState] = useState<EpochState>({ epoch: 0, generation: 0, focusInMain: false, scrollY: 0 });

  useEffect(() => {
    let pending = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const apply = () => {
      timer = null;
      if (!pending) return;
      if (isInteractionBusy()) {
        timer = setTimeout(apply, RETRY_WHILE_BUSY_MS);
        return;
      }
      pending = false;
      const main = document.getElementById('main-content');
      setState((previous) => ({
        epoch: previous.epoch + 1,
        generation: getRemoteGeneration(),
        focusInMain: Boolean(main && document.activeElement && main.contains(document.activeElement)),
        scrollY: window.scrollY,
      }));
    };
    const unsubscribe = subscribeRemoteChanges(() => {
      pending = true;
      if (!timer) timer = setTimeout(apply, 0);
    });
    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, []);

  useLayoutEffect(() => {
    if (state.epoch === 0) return;
    acknowledgeViewRefresh(state.generation);
    if (state.focusInMain && (!document.activeElement || document.activeElement === document.body)) {
      const main = document.getElementById('main-content');
      if (main) {
        main.tabIndex = -1;
        main.focus({ preventScroll: true });
      }
    }
    if (window.scrollY !== state.scrollY) window.scrollTo({ top: state.scrollY });
  }, [state]);

  return state.epoch;
}
