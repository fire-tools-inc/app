import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReceiptDocument } from '../types/receiptImport';
import { deleteReceipt, downloadReceiptFile, getReceiptFile, listReceipts } from '../utils/documentImportApi';

interface ReceiptInboxProps {
  available: boolean;
  busy: boolean;
  pairingActive: boolean;
  refreshKey: number;
  onReview: (receipt: ReceiptDocument) => void;
  onDeleted: (id: number) => void;
}

export function ReceiptInbox({ available, busy, pairingActive, refreshKey, onReview, onDeleted }: ReceiptInboxProps) {
  const { t } = useTranslation();
  const [receipts, setReceipts] = useState<ReceiptDocument[]>([]);
  const [showReviewed, setShowReviewed] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!available) return;
    const controller = new AbortController();
    request.current = controller;
    let inFlight = false;
    const load = async () => {
      if (inFlight) return;
      inFlight = true;
      setLoading(true);
      try {
        const result = await listReceipts(showReviewed ? undefined : 'pending', undefined, controller.signal);
        if (controller.signal.aborted) return;
        setReceipts(result.items);
        setNextCursor(result.nextCursor);
        setError('');
      } catch (failure) {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : t('common.unknownError'));
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void load();
    const timer = pairingActive ? setInterval(() => { void load(); }, 5000) : undefined;
    return () => { clearInterval(timer); controller.abort(); request.current = null; };
  }, [available, showReviewed, refreshKey, reload, pairingActive, t]);

  const action = async (receipt: ReceiptDocument, kind: 'download' | 'delete') => {
    const signal = request.current?.signal;
    try {
      if (kind === 'download') {
        const file = await getReceiptFile(receipt, signal);
        if (!signal?.aborted) downloadReceiptFile(file);
      } else {
        if (!window.confirm(t('receiptImport.deleteConfirm', { fileName: receipt.fileName }))) return;
        await deleteReceipt(receipt.id, signal);
        if (!signal?.aborted) {
          setReceipts(previous => previous.filter(item => item.id !== receipt.id));
          onDeleted(receipt.id);
        }
      }
    } catch (failure) {
      if (!signal?.aborted) setError(failure instanceof Error ? failure.message : t('common.unknownError'));
    }
  };

  const more = async () => {
    if (!nextCursor) return;
    const signal = request.current?.signal;
    setLoading(true);
    try {
      const result = await listReceipts(showReviewed ? undefined : 'pending', nextCursor, signal);
      if (signal?.aborted) return;
      setReceipts(previous => [...previous, ...result.items.filter(item => !previous.some(existing => existing.id === item.id))]);
      setNextCursor(result.nextCursor);
    } catch (failure) {
      if (!signal?.aborted) setError(failure instanceof Error ? failure.message : t('common.unknownError'));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  return (
    <section className="receipt-panel" aria-labelledby="receipt-inbox-title">
      <h3 id="receipt-inbox-title">{t('receiptImport.inbox')}</h3>
      {!available ? <p className="form-help">{t('receiptImport.backendRequired')}</p> : <>
        <div className="receipt-inbox-controls">
          <label><input type="checkbox" checked={showReviewed} onChange={event => setShowReviewed(event.target.checked)} disabled={busy} />
            {t('receiptImport.showReviewed')}</label>
          <button type="button" className="action-btn" disabled={loading || busy} onClick={() => setReload(value => value + 1)}>{t('receiptImport.refresh')}</button>
        </div>
        {!loading && !error && receipts.length === 0 && <p>{t('receiptImport.emptyInbox')}</p>}
        <ul className="receipt-inbox-list">
          {receipts.map(receipt => <li key={receipt.id}>
            <span>{receipt.fileName} <small>{t(`receiptImport.${receipt.status}`)}</small></span>
            <div className="receipt-inbox-actions">
              <button type="button" className="action-btn" disabled={busy} onClick={() => onReview(receipt)}>{t('receiptImport.review')}</button>
              <button type="button" className="action-btn" disabled={busy} onClick={() => { void action(receipt, 'download'); }}>{t('receiptImport.download')}</button>
              <button type="button" className="action-btn" disabled={busy} onClick={() => { void action(receipt, 'delete'); }}>{t('common.delete')}</button>
            </div>
          </li>)}
        </ul>
        {nextCursor && <button type="button" className="action-btn" disabled={loading || busy} onClick={() => { void more(); }}>{t('receiptImport.more')}</button>}
      </>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
