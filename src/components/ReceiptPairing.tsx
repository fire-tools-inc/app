import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReceiptPairing as Pairing } from '../types/receiptImport';
import { startReceiptPairing, stopReceiptPairing } from '../utils/documentImportApi';
import { logger } from '../utils/logger';

interface ReceiptPairingProps {
  available: boolean;
  onActiveChange: (active: boolean) => void;
}

export function ReceiptPairing({ available, onActiveChange }: ReceiptPairingProps) {
  const { t, i18n } = useTranslation();
  const [port, setPort] = useState('8790');
  const [publicUrl, setPublicUrl] = useState('');
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const active = useRef<Pairing | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const current = active.current;
      active.current = null;
      if (current) void stopReceiptPairing(current.id).catch(() => {
        logger.error('receipt-pairing', 'close-failed', 'Receipt pairing could not be stopped; its server-side lease will expire.');
      });
    };
  }, []);

  useEffect(() => {
    if (!pairing) return;
    const timer = setTimeout(() => {
      active.current = null;
      setPairing(null);
      onActiveChange(false);
      void stopReceiptPairing(pairing.id).catch(() => {
        logger.error('receipt-pairing', 'expiry-close-failed', 'Expired receipt pairing could not be stopped.');
      });
    }, Math.max(0, Date.parse(pairing.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [pairing, onActiveChange]);

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      const result = await startReceiptPairing({
        port: Number(port), publicUrl: publicUrl.trim() || undefined, language: (i18n.resolvedLanguage ?? 'en').split('-')[0],
      });
      if (!mounted.current) {
        await stopReceiptPairing(result.id);
        return;
      }
      active.current = result;
      setPairing(result);
      onActiveChange(true);
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : t('common.unknownError'));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const stop = async () => {
    if (!pairing) return;
    setBusy(true);
    setError('');
    try {
      await stopReceiptPairing(pairing.id);
      active.current = null;
      if (mounted.current) {
        setPairing(null);
        onActiveChange(false);
      }
    } catch (failure) {
      if (mounted.current) setError(failure instanceof Error ? failure.message : t('common.unknownError'));
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  return (
    <section className="receipt-panel" aria-labelledby="receipt-pairing-title">
      <h3 id="receipt-pairing-title">{t('receiptImport.pairingTitle')}</h3>
      <p className="form-help">{t('receiptImport.pairingHelp')}</p>
      {!pairing ? <>
        <label htmlFor="receipt-port">{t('receiptImport.port')}</label>
        <input id="receipt-port" type="number" min={1024} max={65535} value={port}
          onChange={event => setPort(event.target.value)} disabled={busy || !available} />
        <label htmlFor="receipt-tunnel">{t('receiptImport.tunnel')}</label>
        <input id="receipt-tunnel" type="url" placeholder="https://receipts.example.com" value={publicUrl}
          onChange={event => setPublicUrl(event.target.value)} disabled={busy || !available} />
        <p className="form-help">{t('receiptImport.tunnelHelp')}</p>
        <button type="button" className="action-btn" disabled={busy || !available || !Number.isInteger(Number(port)) || Number(port) < 1024 || Number(port) > 65535}
          onClick={() => { void start(); }}>{t('receiptImport.startPairing')}</button>
      </> : <>
        <p>{t('receiptImport.activePort', { port: pairing.port })}</p>
        <p className="form-help">{t('receiptImport.linkWarning')}</p>
        {pairing.urls.map((url, index) => (
          <div className="receipt-pairing-link" key={url}>
            <label htmlFor={`receipt-link-${index}`}>
              {new URL(url).hostname === '127.0.0.1' ? t('receiptImport.localLink') : t('receiptImport.phoneLink')}
            </label>
            <input id={`receipt-link-${index}`} readOnly value={url} onFocus={event => event.target.select()} />
            <button type="button" className="action-btn" onClick={() => {
              if (!navigator.clipboard) { setError(t('receiptImport.copyManually')); return; }
              void navigator.clipboard.writeText(url).catch(() => setError(t('receiptImport.copyManually')));
            }}>{t('receiptImport.copyLink')}</button>
          </div>
        ))}
        <button type="button" className="action-btn" disabled={busy} onClick={() => { void stop(); }}>{t('receiptImport.stopPairing')}</button>
      </>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
