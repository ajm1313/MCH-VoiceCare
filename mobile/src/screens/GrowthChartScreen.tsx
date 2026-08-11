/**
 * GrowthChartScreen — WHO growth charts with measurement dots overlaid.
 * MCHVC-SPEC-001 v1.1 §51. Shows LFA, WFA, WFL charts (0-24 months).
 * Offline-first (DEC-007).
 */
import React, {useCallback, useEffect, useState} from 'react';
import {
  Image,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import {useRoute} from '@react-navigation/native';

import {useTheme} from '../theme/useTheme';
import {urgency} from '../theme/colors';
import {query} from '../core/db/database';
import {
  Screen,
  Card,
  Badge,
  EmptyState,
  LoadingState,
  AppText,
  type BadgeTone,
} from '../components/ui';
import {border, radius, space} from '../theme/tokens';

type MeasurementRow = {
  id: string;
  measurement_date: string;
  age_days: number | null;
  weight_kg: number | null;
  length_cm: number | null;
  height_cm: number | null;
  muac_mm: number | null;
  indicator: string;
};

type ChartPoint = {
  x: number;
  y: number;
  date: string;
  age_months: number | null;
  weight_kg: number | null;
  length_cm: number | null;
  indicator: string;
};

type ChartConfig = {
  key: 'lfa' | 'wfa' | 'wfl';
  title: string;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  xLabel: string;
  yLabel: string;
};

type ZScoreZone = {
  label: string;
  yMin: number;
  yMax: number;
  color: string;
};

type TrendDirection = 'up' | 'down' | 'flat';

const CHART_FRAME = {
  leftPct: 9.0,
  rightPct: 98.1,
  topPct: 8.9,
  bottomPct: 95.0,
};

// Z-score zone boundaries (approximate WHO SD lines for boys 0-24mo)
const Z_SCORE_ZONES: Record<string, ZScoreZone[]> = {
  lfa: [
    {label: '+3 SD', yMin: 90, yMax: 999, color: '#f59e0b'},
    {label: 'Median', yMin: 49, yMax: 90, color: '#10b981'},
    {label: '-2 SD', yMin: 45, yMax: 49, color: '#f97316'},
    {label: '-3 SD', yMin: 0, yMax: 45, color: '#ef4444'},
  ],
  wfa: [
    {label: '+3 SD', yMin: 27, yMax: 999, color: '#f59e0b'},
    {label: 'Median', yMin: 6, yMax: 27, color: '#10b981'},
    {label: '-2 SD', yMin: 2, yMax: 6, color: '#f97316'},
    {label: '-3 SD', yMin: 0, yMax: 2, color: '#ef4444'},
  ],
  wfl: [
    {label: '+3 SD', yMin: 27, yMax: 999, color: '#f59e0b'},
    {label: 'Median', yMin: 6, yMax: 27, color: '#10b981'},
    {label: '-2 SD', yMin: 2, yMax: 6, color: '#f97316'},
    {label: '-3 SD', yMin: 0, yMax: 2, color: '#ef4444'},
  ],
};

function getZScoreZone(chartKey: string, y: number): ZScoreZone | null {
  const zones = Z_SCORE_ZONES[chartKey];
  if (!zones) return null;
  for (const z of zones) {
    if (y >= z.yMin && y <= z.yMax) return z;
  }
  return zones[zones.length - 1];
}

function getTrendDirection(points: ChartPoint[], index: number): TrendDirection {
  if (index === 0) return 'flat';
  const prev = points[index - 1];
  const curr = points[index];
  const diff = curr.y - prev.y;
  if (Math.abs(diff) < 0.1) return 'flat';
  return diff > 0 ? 'up' : 'down';
}

const TREND_ARROW: Record<TrendDirection, string> = {
  up: '↗',
  down: '↘',
  flat: '→',
};

const CHART_CONFIGS: ChartConfig[] = [
  {
    key: 'lfa',
    title: 'Length-for-Age (0–24 mo)',
    xMin: 0,
    xMax: 24,
    yMin: 45,
    yMax: 90,
    xLabel: 'Age (months)',
    yLabel: 'Length (cm)',
  },
  {
    key: 'wfa',
    title: 'Weight-for-Age (0–24 mo)',
    xMin: 0,
    xMax: 24,
    yMin: 0,
    yMax: 27,
    xLabel: 'Age (months)',
    yLabel: 'Weight (kg)',
  },
  {
    key: 'wfl',
    title: 'Weight-for-Length (45–90 cm)',
    xMin: 45,
    xMax: 90,
    yMin: 0,
    yMax: 27,
    xLabel: 'Length (cm)',
    yLabel: 'Weight (kg)',
  },
];

// Chart images bundled with the app
const CHART_IMAGES: Record<string, Record<string, any>> = {
  lfa: {
    boys: require('../../assets/growth/charts/lfa-boys.jpg'),
    girls: require('../../assets/growth/charts/lfa-girls.jpg'),
  },
  wfa: {
    boys: require('../../assets/growth/charts/wfa-boys.jpg'),
    girls: require('../../assets/growth/charts/wfa-girls.jpg'),
  },
  wfl: {
    boys: require('../../assets/growth/charts/wfl-boys.jpg'),
    girls: require('../../assets/growth/charts/wfl-girls.jpg'),
  },
};

function indicatorColor(ind: string): string {
  if (ind.includes('SEVERELY') || ind.includes('SAM') || ind.includes('OEDEMA')) return urgency.RED;
  if (ind.includes('WASTED') || ind.includes('STUNTED') || ind.includes('UNDERWEIGHT') || ind.includes('MAM')) return urgency.ORANGE;
  if (ind.includes('OVERWEIGHT') || ind.includes('OBESE')) return urgency.AMBER;
  return urgency.GREEN;
}

function indicatorTone(ind: string): BadgeTone {
  if (ind.includes('SEVERELY') || ind.includes('SAM') || ind.includes('OEDEMA')) return 'danger';
  if (ind.includes('WASTED') || ind.includes('STUNTED') || ind.includes('UNDERWEIGHT') || ind.includes('MAM')) return 'warning';
  if (ind.includes('OVERWEIGHT') || ind.includes('OBESE')) return 'warning';
  return 'success';
}

function dataToPercent(value: number, min: number, max: number): number {
  const clamped = Math.max(min, Math.min(max, value));
  return ((clamped - min) / (max - min)) * 100;
}

export function GrowthChartScreen() {
  const {colors} = useTheme();
  const route = useRoute();
  const childId = (route.params as {childId: string}).childId;

  const [childName, setChildName] = useState('');
  const [sex, setSex] = useState<'boys' | 'girls'>('boys');
  const [measurements, setMeasurements] = useState<MeasurementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeChart, setActiveChart] = useState<ChartConfig>(CHART_CONFIGS[0]);
  const [imageLayout, setImageLayout] = useState({width: 0, height: 0});

  const loadData = useCallback(() => {
    try {
      // Get child name and sex from the first measurement
      const childResult = query(
        `SELECT DISTINCT child_name FROM growth_measurements WHERE id = ? OR child_name = (SELECT child_name FROM growth_measurements WHERE id = ?) LIMIT 1`,
        [childId, childId],
      );
      if (childResult.length > 0) {
        setChildName(String(childResult[0].child_name || 'Unknown'));
      }

      // Get all measurements for this child, ordered by date
      const rows = query(
        `SELECT id, child_name, measurement_date, age_days, weight_kg, length_cm, height_cm, muac_mm, indicator
         FROM growth_measurements
         WHERE child_name = (SELECT child_name FROM growth_measurements WHERE id = ?)
         ORDER BY measurement_date ASC`,
        [childId],
      );
      const items: MeasurementRow[] = rows.map((r: any) => ({
        id: String(r.id),
        measurement_date: String(r.measurement_date || ''),
        age_days: r.age_days ? Number(r.age_days) : null,
        weight_kg: r.weight_kg ? Number(r.weight_kg) : null,
        length_cm: r.length_cm ? Number(r.length_cm) : null,
        height_cm: r.height_cm ? Number(r.height_cm) : null,
        muac_mm: r.muac_mm ? Number(r.muac_mm) : null,
        indicator: String(r.indicator || 'NORMAL'),
      }));
      setMeasurements(items);
    } finally {
      setLoading(false);
    }
  }, [childId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Build chart points for the active chart
  const chartPoints: ChartPoint[] = [];
  for (const m of measurements) {
    const ageMonths = m.age_days ? m.age_days / 30.4375 : null;
    const weight = m.weight_kg;
    const effectiveLength = m.length_cm ?? m.height_cm;

    if (activeChart.key === 'lfa' && ageMonths != null && effectiveLength != null) {
      chartPoints.push({
        x: ageMonths, y: effectiveLength, date: m.measurement_date,
        age_months: Math.round(ageMonths * 10) / 10, weight_kg: weight,
        length_cm: effectiveLength, indicator: m.indicator,
      });
    } else if (activeChart.key === 'wfa' && ageMonths != null && weight != null) {
      chartPoints.push({
        x: ageMonths, y: weight, date: m.measurement_date,
        age_months: Math.round(ageMonths * 10) / 10, weight_kg: weight,
        length_cm: effectiveLength, indicator: m.indicator,
      });
    } else if (activeChart.key === 'wfl' && effectiveLength != null && weight != null) {
      chartPoints.push({
        x: effectiveLength, y: weight, date: m.measurement_date,
        age_months: ageMonths != null ? Math.round(ageMonths * 10) / 10 : null,
        weight_kg: weight, length_cm: effectiveLength, indicator: m.indicator,
      });
    }
  }

  // Convert points to pixel positions
  const plotPoints = imageLayout.width > 0 ? chartPoints.map(p => {
    const xPct = dataToPercent(p.x, activeChart.xMin, activeChart.xMax);
    const yPct = dataToPercent(p.y, activeChart.yMin, activeChart.yMax);
    const plotW = (CHART_FRAME.rightPct - CHART_FRAME.leftPct) / 100 * imageLayout.width;
    const plotH = (CHART_FRAME.bottomPct - CHART_FRAME.topPct) / 100 * imageLayout.height;
    const plotLeft = CHART_FRAME.leftPct / 100 * imageLayout.width;
    const plotBottom = CHART_FRAME.bottomPct / 100 * imageLayout.height;
    return {
      ...p,
      px: plotLeft + (xPct / 100) * plotW,
      py: plotBottom - (yPct / 100) * plotH,
    };
  }) : [];

  const chartImage = CHART_IMAGES[activeChart.key][sex];

  if (loading) {
    return (
      <Screen>
        <LoadingState message="Loading growth charts…" />
      </Screen>
    );
  }

  return (
    <Screen scroll padded={false}>
      {/* Header */}
      <Card style={styles.header}>
        <AppText variant="h2">{childName}</AppText>
        <AppText variant="small" tone="secondary" style={styles.subtitle}>
          WHO Growth Charts · {sex === 'boys' ? 'Boys' : 'Girls'} · {measurements.length} measurement{measurements.length !== 1 ? 's' : ''}
        </AppText>
      </Card>

      {/* Chart tabs */}
      <View style={[styles.tabBar, {borderBottomColor: colors.border}]}>
        {CHART_CONFIGS.map(cfg => (
          <Pressable
            key={cfg.key}
            onPress={() => setActiveChart(cfg)}
            accessibilityRole="tab"
            accessibilityState={{selected: activeChart.key === cfg.key}}
            style={[
              styles.tab,
              activeChart.key === cfg.key && {borderBottomColor: colors.primary},
            ]}>
            <AppText
              variant="smallStrong"
              tone={activeChart.key === cfg.key ? 'brand' : 'secondary'}>
              {cfg.key === 'lfa' ? 'LFA' : cfg.key === 'wfa' ? 'WFA' : 'WFL'}
            </AppText>
          </Pressable>
        ))}
      </View>

      {/* Chart title */}
      <View style={styles.chartHeader}>
        <AppText variant="h3">{activeChart.title}</AppText>
        <AppText variant="caption" tone="secondary" style={styles.chartSub}>
          {activeChart.xLabel} vs {activeChart.yLabel}
        </AppText>
      </View>

      {/* Chart image with overlay */}
      <Card style={styles.chartContainer}>
        {chartPoints.length > 0 ? (
          <View
            style={styles.imageWrapper}
            onLayout={(e: LayoutChangeEvent) => {
              const {width, height} = e.nativeEvent.layout;
              // Calculate image height based on aspect ratio
              const imgRatio = 853 / 1241;
              const imgHeight = width * imgRatio;
              setImageLayout({width, height: imgHeight});
            }}>
            <Image
              source={chartImage}
              style={[styles.chartImage, {width: '100%', aspectRatio: 1241 / 853}]}
              resizeMode="contain"
            />
            {/* Z-score zone labels (left edge) */}
            {plotPoints.length > 0 && Z_SCORE_ZONES[activeChart.key] &&
              Z_SCORE_ZONES[activeChart.key].map((zone, zi) => {
                const zoneYTop = CHART_FRAME.topPct / 100 * imageLayout.height +
                  ((CHART_FRAME.bottomPct - CHART_FRAME.topPct) / 100 * imageLayout.height) *
                  (1 - (Math.min(zone.yMax, activeChart.yMax) - activeChart.yMin) / (activeChart.yMax - activeChart.yMin));
                const zoneYBottom = CHART_FRAME.topPct / 100 * imageLayout.height +
                  ((CHART_FRAME.bottomPct - CHART_FRAME.topPct) / 100 * imageLayout.height) *
                  (1 - (Math.max(zone.yMin, activeChart.yMin) - activeChart.yMin) / (activeChart.yMax - activeChart.yMin));
                if (zoneYBottom - zoneYTop < 10) return null;
                return (
                  <View
                    key={`zone-${zi}`}
                    style={[
                      styles.zoneLabel,
                      {top: (zoneYTop + zoneYBottom) / 2 - 8, backgroundColor: zone.color + '20'},
                    ]}>
                    <AppText variant="caption" tone="inherit" style={[styles.zoneLabelText, {color: zone.color}]}>
                      {zone.label}
                    </AppText>
                  </View>
                );
              })
            }
            {/* Overlay dots with Z-score ring */}
            {plotPoints.map((p, i) => {
              const color = indicatorColor(p.indicator);
              const zone = getZScoreZone(activeChart.key, p.y);
              const trend = getTrendDirection(chartPoints, i);
              return (
                <View key={`dot-${i}`}>
                  {/* Z-score ring */}
                  {zone && (
                    <View
                      style={[
                        styles.zScoreRing,
                        {
                          left: p.px - 10,
                          top: p.py - 10,
                          borderColor: zone.color,
                        },
                      ]}
                    />
                  )}
                  <View
                    style={[
                      styles.dot,
                      {
                        left: p.px - 6,
                        top: p.py - 6,
                        backgroundColor: color,
                        borderColor: colors.surface,
                      },
                    ]}
                  />
                  {/* Trend arrow */}
                  {i > 0 && (
                    <AppText
                      variant="bodyStrong"
                      tone="inherit"
                      style={[
                        styles.trendArrow,
                        {
                          left: p.px + 8,
                          top: p.py - 8,
                          color: trend === 'up' ? colors.success : trend === 'down' ? colors.danger : colors.textTertiary,
                        },
                      ]}>
                      {TREND_ARROW[trend]}
                    </AppText>
                  )}
                </View>
              );
            })}
            {/* Connecting line segments */}
            {plotPoints.length > 1 && plotPoints.map((p, i) => {
              if (i === 0) return null;
              const prev = plotPoints[i - 1];
              const dx = p.px - prev.px;
              const dy = p.py - prev.py;
              const length = Math.sqrt(dx * dx + dy * dy);
              const angle = Math.atan2(dy, dx) * (180 / Math.PI);
              return (
                <View
                  key={`line-${i}`}
                  style={[
                    styles.lineSegment,
                    {
                      left: prev.px,
                      top: prev.py,
                      width: length,
                      transform: [{rotate: `${angle}deg`}],
                      backgroundColor: colors.primary,
                    },
                  ]}
                />
              );
            })}
          </View>
        ) : (
          <EmptyState
            icon="chart"
            title="No chart data"
            message="No measurements with the required data for this chart."
          />
        )}
      </Card>

      {/* Plotted measurements table */}
      {chartPoints.length > 0 && (
        <Card style={styles.tableContainer}>
          <AppText variant="overline" tone="secondary" uppercase>
            Plotted Measurements
          </AppText>
          {chartPoints.map((p, i) => (
            <View
              key={`row-${i}`}
              style={[styles.tableRow, {borderBottomColor: colors.border}]}>
              <View style={styles.tableDateCol}>
                <AppText variant="smallStrong">{p.date}</AppText>
                {p.age_months != null && (
                  <AppText variant="caption" tone="secondary">
                    {p.age_months} mo
                  </AppText>
                )}
              </View>
              <View style={styles.tableMetricsCol}>
                {p.weight_kg != null && (
                  <AppText variant="small">{p.weight_kg} kg</AppText>
                )}
                {p.length_cm != null && (
                  <AppText variant="small">{p.length_cm} cm</AppText>
                )}
              </View>
              <View style={styles.tableRightCol}>
                {(() => {
                  const zone = getZScoreZone(activeChart.key, p.y);
                  const trend = getTrendDirection(chartPoints, i);
                  return (
                    <View style={styles.tableBadgeRow}>
                      {zone && (
                        <View style={[styles.zScoreBadge, {backgroundColor: zone.color + '20', borderColor: zone.color}]}>
                          <AppText variant="caption" tone="inherit" style={[styles.zScoreBadgeText, {color: zone.color}]}>
                            {zone.label}
                          </AppText>
                        </View>
                      )}
                      {i > 0 && (
                        <AppText
                          variant="bodyStrong"
                          tone="inherit"
                          style={[
                            styles.trendArrowText,
                            {color: trend === 'up' ? colors.success : trend === 'down' ? colors.danger : colors.textTertiary},
                          ]}>
                          {TREND_ARROW[trend]}
                        </AppText>
                      )}
                      <Badge
                        label={p.indicator.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
                        tone={indicatorTone(p.indicator)}
                        size="sm"
                        solid
                      />
                    </View>
                  );
                })()}
              </View>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {marginVertical: space[2]},
  subtitle: {marginTop: 2},
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: border.heavy,
  },
  tab: {
    flex: 1,
    paddingVertical: space[3],
    alignItems: 'center',
    borderBottomWidth: border.heavy,
    borderBottomColor: 'transparent',
    marginBottom: -2,
  },
  chartHeader: {paddingTop: space[4], paddingBottom: space[2]},
  chartSub: {marginTop: 2},
  chartContainer: {
    marginVertical: space[4],
    overflow: 'hidden',
  },
  imageWrapper: {
    position: 'relative',
    width: '100%',
  },
  chartImage: {
    borderRadius: radius.sm,
  },
  dot: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  lineSegment: {
    position: 'absolute',
    height: 2,
    opacity: 0.5,
    transformOrigin: 'left center',
  },
  tableContainer: {
    marginBottom: space[6],
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space[2] + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tableDateCol: {flex: 1},
  tableMetricsCol: {flex: 1, alignItems: 'center'},
  tableRightCol: {
    flex: 1,
    alignItems: 'flex-end',
  },
  tableBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  zScoreRing: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    opacity: 0.5,
  },
  zoneLabel: {
    position: 'absolute',
    left: 2,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  zoneLabelText: {
    fontSize: 8,
    fontWeight: '700',
  },
  trendArrow: {
    position: 'absolute',
    fontSize: 14,
    fontWeight: '700',
  },
  zScoreBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.xs,
    borderWidth: 1,
  },
  zScoreBadgeText: {
    fontSize: 8,
    fontWeight: '700',
  },
  trendArrowText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
