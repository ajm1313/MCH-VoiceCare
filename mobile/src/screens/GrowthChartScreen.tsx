/**
 * GrowthChartScreen — WHO growth charts with measurement dots overlaid.
 * MCHVC-SPEC-001 v1.1 §51. Shows LFA, WFA, WFL charts (0-24 months).
 * Offline-first (DEC-007).
 */
import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Image,
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import {useRoute} from '@react-navigation/native';

import {darkColors, lightColors, urgency} from '../theme/colors';
import {query} from '../core/db/database';

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

function dataToPercent(value: number, min: number, max: number): number {
  const clamped = Math.max(min, Math.min(max, value));
  return ((clamped - min) / (max - min)) * 100;
}

export function GrowthChartScreen() {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
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
      <View style={[styles.center, {backgroundColor: colors.background}]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, {backgroundColor: colors.background}]}>
      {/* Header */}
      <View style={[styles.header, {backgroundColor: colors.surface}]}>
        <Text style={[styles.title, {color: colors.textPrimary}]}>{childName}</Text>
        <Text style={[styles.subtitle, {color: colors.textSecondary}]}>
          WHO Growth Charts · {sex === 'boys' ? 'Boys' : 'Girls'} · {measurements.length} measurement{measurements.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* Chart tabs */}
      <View style={[styles.tabBar, {borderColor: colors.border}]}>
        {CHART_CONFIGS.map(cfg => (
          <Pressable
            key={cfg.key}
            onPress={() => setActiveChart(cfg)}
            style={[
              styles.tab,
              activeChart.key === cfg.key && {borderColor: colors.primary},
            ]}>
            <Text
              style={[
                styles.tabText,
                {color: activeChart.key === cfg.key ? colors.primary : colors.textSecondary},
                activeChart.key === cfg.key && {fontWeight: '700'},
              ]}>
              {cfg.key === 'lfa' ? 'LFA' : cfg.key === 'wfa' ? 'WFA' : 'WFL'}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Chart title */}
      <View style={styles.chartHeader}>
        <Text style={[styles.chartTitle, {color: colors.textPrimary}]}>{activeChart.title}</Text>
        <Text style={[styles.chartSub, {color: colors.textSecondary}]}>
          {activeChart.xLabel} vs {activeChart.yLabel}
        </Text>
      </View>

      {/* Chart image with overlay */}
      <View style={[styles.chartContainer, {backgroundColor: colors.surface}]}>
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
                    <Text style={[styles.zoneLabelText, {color: zone.color}]}>{zone.label}</Text>
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
                        borderColor: '#fff',
                      },
                    ]}
                  />
                  {/* Trend arrow */}
                  {i > 0 && (
                    <Text
                      style={[
                        styles.trendArrow,
                        {
                          left: p.px + 8,
                          top: p.py - 8,
                          color: trend === 'up' ? urgency.GREEN : trend === 'down' ? urgency.RED : urgency.GREY,
                        },
                      ]}>
                      {TREND_ARROW[trend]}
                    </Text>
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
          <View style={styles.emptyChart}>
            <Text style={[styles.emptyText, {color: colors.textSecondary}]}>
              No measurements with the required data for this chart.
            </Text>
          </View>
        )}
      </View>

      {/* Plotted measurements table */}
      {chartPoints.length > 0 && (
        <View style={[styles.tableContainer, {backgroundColor: colors.surface}]}>
          <Text style={[styles.tableTitle, {color: colors.textSecondary}]}>
            PLOTTED MEASUREMENTS
          </Text>
          {chartPoints.map((p, i) => (
            <View
              key={`row-${i}`}
              style={[styles.tableRow, {borderColor: colors.border}]}>
              <View style={styles.tableDateCol}>
                <Text style={[styles.tableDate, {color: colors.textPrimary}]}>
                  {p.date}
                </Text>
                {p.age_months != null && (
                  <Text style={[styles.tableAge, {color: colors.textSecondary}]}>
                    {p.age_months} mo
                  </Text>
                )}
              </View>
              <View style={styles.tableMetricsCol}>
                {p.weight_kg != null && (
                  <Text style={[styles.tableMetric, {color: colors.textPrimary}]}>
                    {p.weight_kg} kg
                  </Text>
                )}
                {p.length_cm != null && (
                  <Text style={[styles.tableMetric, {color: colors.textPrimary}]}>
                    {p.length_cm} cm
                  </Text>
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
                          <Text style={[styles.zScoreBadgeText, {color: zone.color}]}>{zone.label}</Text>
                        </View>
                      )}
                      {i > 0 && (
                        <Text style={[styles.trendArrowText, {color: trend === 'up' ? urgency.GREEN : trend === 'down' ? urgency.RED : urgency.GREY}]}>
                          {TREND_ARROW[trend]}
                        </Text>
                      )}
                      <View style={[styles.tableBadge, {backgroundColor: indicatorColor(p.indicator)}]}>
                        <Text style={styles.tableBadgeText}>
                          {p.indicator.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
                        </Text>
                      </View>
                    </View>
                  );
                })()}
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24},
  header: {margin: 16, padding: 16, borderRadius: 12},
  title: {fontSize: 20, fontWeight: '700'},
  subtitle: {fontSize: 13, marginTop: 4},
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    borderBottomWidth: 2,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -2,
  },
  tabText: {fontSize: 14, fontWeight: '500'},
  chartHeader: {paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8},
  chartTitle: {fontSize: 16, fontWeight: '600'},
  chartSub: {fontSize: 12, marginTop: 2},
  chartContainer: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    padding: 12,
    overflow: 'hidden',
  },
  imageWrapper: {
    position: 'relative',
    width: '100%',
  },
  chartImage: {
    borderRadius: 8,
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
  emptyChart: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {fontSize: 14, textAlign: 'center'},
  tableContainer: {
    marginHorizontal: 16,
    marginBottom: 24,
    borderRadius: 12,
    padding: 16,
  },
  tableTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 12,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tableDateCol: {flex: 1},
  tableDate: {fontSize: 14, fontWeight: '500'},
  tableAge: {fontSize: 11, marginTop: 2},
  tableMetricsCol: {flex: 1, alignItems: 'center'},
  tableMetric: {fontSize: 13},
  tableRightCol: {
    flex: 1,
    alignItems: 'flex-end',
  },
  tableBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tableBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  tableBadgeText: {color: '#fff', fontSize: 9, fontWeight: '700'},
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
    borderRadius: 6,
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
