import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Sankey, Tooltip } from 'recharts';
import { MonthlySnapshot } from '../types/netWorthTracker';
import { SupportedCurrency, SUPPORTED_CURRENCIES } from '../types/currency';
import { buildSankeyData } from '../utils/sankeyDataBuilder';
import { MaterialIcon } from './MaterialIcon';
import './NetWorthSankeyChart.css';
import { CHART_THEME } from '../utils/chartColors';

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
  payload: { name: string; fill: string; value: number; level?: number };
  currency: SupportedCurrency;
  isPrivacyMode: boolean;
}

/** Label background halo so "above" category labels stay readable over flows. */
const LABEL_HALO = CHART_THEME.background;

function CustomNode({ x, y, width, height, payload, currency, isPrivacyMode }: NodeRendererProps) {
  const fill = payload.fill ?? CHART_THEME.tooltipBorder;
  // Role comes from the graph (level), not a brittle x-threshold.
  const level = payload.level ?? (x < 200 ? 0 : 2);
  const valueLabel = formatAmount(payload.value, currency, isPrivacyMode);
  const cy = y + height / 2;

  // Category nodes (middle column) carry many flows on both sides, so their
  // label sits in a color-coded chip ABOVE the node. The solid chip lifts the
  // text cleanly out of the busy flow streams and ties it to the node colour.
  if (level === 1) {
    const labelX = x + width / 2;
    const chipText = `${payload.name}  ${valueLabel}`;
    const chipHeight = 22;
    const chipWidth = chipText.length * 6.6 + 22;
    const chipBottom = y - 5;
    const chipTop = chipBottom - chipHeight;
    const textY = chipTop + chipHeight / 2;
    return (
      <g>
        <rect x={x} y={y} width={width} height={height} fill={fill} rx={2} />
        <rect
          x={labelX - chipWidth / 2}
          y={chipTop}
          width={chipWidth}
          height={chipHeight}
          rx={6}
          fill={LABEL_HALO}
          stroke={fill}
          strokeOpacity={0.6}
          strokeWidth={1}
        />
        <text
          x={labelX}
          y={textY}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={11}
        >
          <tspan fill={CHART_THEME.textStrong} fontWeight={600}>{payload.name}</tspan>
          <tspan fill={CHART_THEME.text} fontWeight={500}>{`  ${valueLabel}`}</tspan>
        </text>
      </g>
    );
  }

  // Root (level 0) → label in the left margin; leaves (level 2) → right margin.
  const isRoot = level === 0;
  const labelX = isRoot ? x - 8 : x + width + 8;
  const textAnchor = isRoot ? 'end' : 'start';

  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} rx={2} />
      <text
        x={labelX}
        y={cy - 6}
        textAnchor={textAnchor}
        dominantBaseline="middle"
        fill={CHART_THEME.textStrong}
        fontSize={11}
        fontWeight={500}
      >
        {payload.name}
      </text>
      <text
        x={labelX}
        y={cy + 8}
        textAnchor={textAnchor}
        dominantBaseline="middle"
        fill={CHART_THEME.text}
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
  const sourceFill = payload.source.fill ?? CHART_THEME.tooltipBorder;
  const targetFill = payload.target.fill ?? CHART_THEME.text;
  const gradientId = `lg-${index}`;

  // Recharts passes sourceY/targetY as the CENTRE line of the band (it strokes
  // the centreline with strokeWidth=linkWidth). We fill an explicit ribbon, so
  // offset by half the width to keep the band centred and aligned with nodes.
  const half = linkWidth / 2;
  const sTop = sourceY - half;
  const tTop = targetY - half;

  return (
    <g>
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={sourceFill} stopOpacity={0.45} />
          <stop offset="100%" stopColor={targetFill} stopOpacity={0.2} />
        </linearGradient>
      </defs>
      <path
        d={`
          M${sourceX},${sTop}
          C${sourceControlX},${sTop} ${targetControlX},${tTop} ${targetX},${tTop}
          L${targetX},${tTop + linkWidth}
          C${targetControlX},${tTop + linkWidth} ${sourceControlX},${sTop + linkWidth} ${sourceX},${sTop + linkWidth}
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
        <MaterialIcon name="account_tree" size="large" className="sankey-empty-icon" />
        <p>{t('netWorth.sankey.noData')}</p>
      </div>
    );
  }

  return (
    <div className="sankey-chart-wrapper" role="region" tabIndex={0} aria-label={t('netWorth.sankey.title')}>
      <Sankey
        width={920}
        height={Math.max(440, sankeyData.nodes.filter(node => node.level === 2).length * 30 + 240)}
        data={sankeyData}
        nodeWidth={18}
        nodePadding={30}
        margin={{ top: 40, right: 150, bottom: 20, left: 150 }}
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
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '8px',
            color: 'var(--text-primary)',
          }}
          labelStyle={{ color: CHART_THEME.text }}
          itemStyle={{ color: CHART_THEME.textStrong }}
        />
      </Sankey>
    </div>
  );
}
