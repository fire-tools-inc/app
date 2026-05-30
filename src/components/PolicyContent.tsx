import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export type PolicyTarget = 'privacy' | 'cookie';

type ParagraphBlock = { type: 'p'; html: string };
type HeadingBlock = { type: 'h3'; text: string };
type ListBlock = { type: 'ul'; items: string[] };
type TableBlock = { type: 'table'; headers: string[]; rows: string[][] };
type LinkBlock = { type: 'link'; prefix: string; target: PolicyTarget; suffix: string };
type InfoBlock = { type: 'infoBox'; title: string; html: string };

type Block = ParagraphBlock | HeadingBlock | ListBlock | TableBlock | LinkBlock | InfoBlock;

interface PolicySection {
  title: string;
  blocks: Block[];
}

interface PolicyData {
  sections: PolicySection[];
}

interface PolicyContentProps {
  variant: PolicyTarget;
  /** When provided, link-blocks render as in-modal switch buttons instead of route links. */
  onSwitchPolicy?: (target: PolicyTarget) => void;
}

function isCookieBlock(block: TableBlock): boolean {
  return block.headers.length >= 4;
}

function renderBlock(
  block: Block,
  idx: number,
  t: (key: string) => string,
  onSwitchPolicy?: (target: PolicyTarget) => void,
) {
  switch (block.type) {
    case 'p':
      return <p key={idx} dangerouslySetInnerHTML={{ __html: block.html }} />;
    case 'h3':
      return <h3 key={idx}>{block.text}</h3>;
    case 'ul':
      return (
        <ul key={idx}>
          {block.items.map((item, i) => (
            <li key={i} dangerouslySetInnerHTML={{ __html: item }} />
          ))}
        </ul>
      );
    case 'table': {
      const wrapperClass = isCookieBlock(block) ? 'cookie-table-wrapper' : '';
      const tableClass = isCookieBlock(block) ? 'cookie-table' : 'policy-table';
      const table = (
        <table className={tableClass}>
          <thead>
            <tr>
              {block.headers.map((h, i) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td key={c} dangerouslySetInnerHTML={{ __html: cell }} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
      return wrapperClass ? (
        <div key={idx} className={wrapperClass}>
          {table}
        </div>
      ) : (
        <div key={idx}>{table}</div>
      );
    }
    case 'link': {
      const linkLabel =
        block.target === 'cookie' ? t('legal.cookiePolicy') : t('legal.privacyPolicy');
      if (onSwitchPolicy) {
        return (
          <p key={idx}>
            {block.prefix}
            <button
              type="button"
              className="policy-inline-link"
              onClick={() => onSwitchPolicy(block.target)}
            >
              {linkLabel}
            </button>
            {block.suffix}
          </p>
        );
      }
      const to = block.target === 'cookie' ? '/cookie-policy' : '/privacy-policy';
      return (
        <p key={idx}>
          {block.prefix}
          <Link to={to}>{linkLabel}</Link>
          {block.suffix}
        </p>
      );
    }
    case 'infoBox':
      return (
        <div key={idx} className="info-box">
          <h4>{block.title}</h4>
          <p dangerouslySetInnerHTML={{ __html: block.html }} />
        </div>
      );
    default:
      return null;
  }
}

export function PolicyContent({ variant, onSwitchPolicy }: PolicyContentProps) {
  const { t } = useTranslation();
  const data = t(`policyContent.${variant}`, { returnObjects: true }) as PolicyData;
  const sections = Array.isArray(data?.sections) ? data.sections : [];

  return (
    <>
      {sections.map((section, sIdx) => (
        <section key={sIdx} className="policy-section">
          <h2>{section.title}</h2>
          {section.blocks.map((block, bIdx) => renderBlock(block, bIdx, t, onSwitchPolicy))}
        </section>
      ))}
    </>
  );
}

export function PrivacyPolicyContent({
  onSwitchPolicy,
}: {
  onSwitchPolicy?: (target: PolicyTarget) => void;
}) {
  return <PolicyContent variant="privacy" onSwitchPolicy={onSwitchPolicy} />;
}

export function CookiePolicyContent({
  onSwitchPolicy,
}: {
  onSwitchPolicy?: (target: PolicyTarget) => void;
}) {
  return <PolicyContent variant="cookie" onSwitchPolicy={onSwitchPolicy} />;
}
