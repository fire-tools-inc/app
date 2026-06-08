import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Sankey, Tooltip } from 'recharts';
import { MonthlySnapshot } from '../types/netWorthTracker';
import { SupportedCurrency, SUPPORTED_CURRENCIES } from '../types/currency';
import { buildSankeyData } from '../utils/sankeyDataBuilder';
import './NetWorthSankeyChart.css';

interface NetWorthSankeyChartProps {
  snapshot: MonthlySnapshot;
  currency: SupportedCurrency;
  showPension?: boolean;
  isPrivacyMode?: boolean;
}

function getCurrencySymbol(currency: SupportedCurrency): string {
  return SUPPORTED_CURRENCIES.find(c => c.code === currency)?.symbol ?? currency;
}

function formatAmount(value: number, currency: SupportedCurrency, isPrivacyMode: boolean): string {
  if (isPrivacyMode) return '***';
  const symbol = getCurrencySymbol(currency);
  if (Math.abs(value) >= 1_000_000) return `${symbol}${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${symbol}${(value / 1_000).toFixed(1)}k`;
  return `${symbol}${value.toFixed(0)}`;
}

interface NodeRendererProps {
  x: number;
  y: number;
  width: number;
  height: number;
  index: number;
  payload: { name: string; fill: string; value: number };
  currency: SupportedCurrency;
  isPrivacyMode: boolean;
}

function CustomNode({ x, y, width, height, payload, currency, isPrivacyMode }: NodeRendererProps) {
  const fill = payload.fill ?? '#2DD4BF';
  const isLeft = x < 200;
  const labelX = isLeft ? x + width + 8 : x - 8;
  const textAnchor = isLeft ? 'start' : 'end';
  const valueLabel = formatAmount(payload.value, currency, isPrivacyMode);

  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} rx={2} />
      <text
        x={labelX}
        y={y + height / 2 - 6}
        textAnchor={textAnchor}
        dominantBaseline="middle"
        fill="#F8FAFC"
        fontSize={11}
        fontWeight={500}
      >
        {payload.name}
      </text>
      <text
        x={labelX}
        y={y + height / 2 + 8}
        textAnchor={textAnchor}
        dominantBaseline="middle"
        fill="#94A3B8"
        fontSize={10}
      >
        {valueLabel}
      </text>
    </g>
  );
}

interface LinkRendererProps {
  sourceX: number;
  targetX: number;
  sourceY: number;
  targetY: number;
  sourceControlX: number;
  targetControlX: number;
  sourceRelativeY: number;
  targetRelativeY: number;
  linkWidth: number;
  index: number;
  payload: {
    source: { fill?: string };
    target: { fill?: string };
    value: number;
  };
}

function CustomLink({
  sourceX, targetX, sourceY, targetY,
  sourceControlX, targetControlX,
  linkWidth,
  index,
  payload,
}: LinkRendererProps) {
  const sourceFill = payload.source.fill ?? '#2DD4BF';
  const targetFill = payload.target.fill ?? '#94A3B8';
  const gradientId = `lg-${index}`;

  return (
    <g>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={sourceFill} stopOpacity={0.55} />
          <stop offset="100%" stopColor={targetFill} stopOpacity={0.3} />
        </linearGradient>
      </defs>
      <path
        d={`
          M${sourceX},${sourceY}
          C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}
          L${targetX},${targetY + linkWidth}
          C${targetControlX},${targetY + linkWidth} ${sourceControlX},${sourceY + linkWidth} ${sourceX},${sourceY + linkWidth}
          Z
        `}
        fill={`url(#${gradientId})`}
        strokeWidth={0}
      />
    </g>
  );
}

export function NetWorthSankeyChart({
  snapshot,
  currency,
  showPension = true,
  isPrivacyMode = false,
}: NetWorthSankeyChartProps) {
  const { t } = useTranslation();

  const sankeyData = useMemo(
    () => buildSankeyData(snapshot, showPension, t),
    [snapshot, showPension, t]
  );

  if (sankeyData.nodes.length === 0) {
    return (
      <div className="sankey-empty" role="status" aria-label={t('netWorth.sankey.noData')}>
        <span className="sankey-empty-icon" aria-hidden="true">📊</span>
        <p>{t('netWorth.sankey.noData')}</p>
      </div>
    );
  }

  return (
    <div className="sankey-chart-wrapper" aria-label={t('netWorth.sankey.title')}>
      <Sankey
        width={900}
        height={380}
        data={sankeyData}
        nodeWidth={18}
        nodePadding={14}
        margin={{ top: 10, right: 160, bottom: 10, left: 160 }}
        sort={false}
        node={(nodeProps) => (
          <CustomNode
            {...(nodeProps as unknown as NodeRendererProps)}
            currency={currency}
            isPrivacyMode={isPrivacyMode}
          />
        )}
        link={(linkProps) => (
          <CustomLink {...(linkProps as unknown as LinkRendererProps)} />
        )}
      >
        <Tooltip
          formatter={(value) =>
            isPrivacyMode ? '***' : formatAmount(Number(value ?? 0), currency, false)
          }
          contentStyle={{
            background: '#1A1D26',
            border: '1px solid #2DD4BF',
            borderRadius: '8px',
            color: '#F8FAFC',
          }}
          labelStyle={{ color: '#94A3B8' }}
          itemStyle={{ color: '#F8FAFC' }}
        />
      </Sankey>
    </div>
  );
}
