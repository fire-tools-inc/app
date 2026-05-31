import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './CopyableValue.css';

interface CopyableValueProps {
  value: string;
  label?: string;
  className?: string;
  title?: string;
  'data-testid'?: string;
}

const writeToClipboard = async (text: string): Promise<boolean> => {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy path
  }
  if (typeof document === 'undefined') return false;
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
};

export const CopyableValue: React.FC<CopyableValueProps> = ({
  value,
  label,
  className,
  title,
  'data-testid': testId,
}) => {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handleClick = useCallback(async () => {
    const ok = await writeToClipboard(value);
    if (!ok) return;
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 1500);
  }, [value]);

  const tooltip = copied
    ? t('common.copied')
    : title ?? t('common.copyToClipboard');

  return (
    <button
      type="button"
      className={`copyable-value${copied ? ' copyable-value--copied' : ''}${className ? ` ${className}` : ''}`}
      onClick={() => void handleClick()}
      title={tooltip}
      aria-label={label ?? tooltip}
      data-testid={testId}
    >
      <code>{value}</code>
      <span className="copyable-value-feedback" aria-hidden="true">
        {copied ? t('common.copied') : ''}
      </span>
    </button>
  );
};
