/**
 * Unified decision display — combines rule engine, ML prediction, and
 * engagement model into a single clinical decision with clear precedence
 * (spec §3.1, §5, PRED-010).
 *
 * Precedence (non-averaging):
 *   1. Rule engine result (deterministic, always runs offline)
 *   2. ML prediction (server-side, only when available and ml_mode != RULES_ONLY)
 *   3. Engagement model (risk stratification, never overrides rules)
 *
 * The final urgency is the highest (most urgent) across all sources.
 * Rules can never be de-escalated by ML or engagement (non-downgrade invariant).
 */

import {
  evaluateOffline,
  type AssessmentResult,
  type UrgencyClass,
} from './offlineEngine';
import { toBackendUrgency, type BackendUrgency } from '../utils/urgencyMapping';
import { getConfigString } from '../sync/configStore';

export interface MLPrediction {
  urgency: BackendUrgency | null;
  confidence: number | null;
  model_version: string | null;
  recommendation: string | null;
}

export interface EngagementScore {
  risk_tier: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  engagement_score: number | null;
  recommendation: string | null;
}

export interface UnifiedDecision {
  final_urgency: UrgencyClass;
  backend_urgency: BackendUrgency;
  rule_result: AssessmentResult;
  ml_prediction: MLPrediction | null;
  engagement: EngagementScore | null;
  recommended_action: string;
  sources_used: string[];
  clinician_override_available: boolean;
}

const URGENCY_RANK: Record<UrgencyClass, number> = {
  RED: 0,
  ORANGE: 1,
  AMBER: 2,
  GREEN: 3,
  GREY: 4,
};

function higher(a: UrgencyClass, b: UrgencyClass): UrgencyClass {
  return URGENCY_RANK[a] <= URGENCY_RANK[b] ? a : b;
}

function backendToOffline(backend: BackendUrgency): UrgencyClass {
  switch (backend) {
    case 'EMERGENCY': return 'RED';
    case 'PRIORITY': return 'ORANGE';
    case 'ROUTINE': return 'GREEN';
    case 'ABSTAIN': return 'GREY';
    default: return 'GREY';
  }
}

export function computeUnifiedDecision(
  module: 'pregnancy' | 'newborn' | 'growth' | 'immunisation',
  facts: Record<string, any>,
  mlPrediction?: MLPrediction | null,
  engagement?: EngagementScore | null,
): UnifiedDecision {
  // 1. Rule engine (always runs)
  const ruleResult = evaluateOffline(module, facts);

  let finalUrgency: UrgencyClass = ruleResult.minimum_class;
  const sourcesUsed: string[] = ['rule_engine'];

  // 2. ML prediction (only if available and ml_mode != RULES_ONLY)
  const mlMode = getConfigString('CLINICAL_ML_MODE', 'RULES_ONLY');
  let mlPred: MLPrediction | null = null;

  if (mlPrediction && mlMode !== 'RULES_ONLY' && mlPrediction.urgency) {
    mlPred = mlPrediction;
    const mlUrgencyOffline = backendToOffline(mlPrediction.urgency);
    // Non-downgrade: ML can only escalate, never de-escalate rules
    finalUrgency = higher(finalUrgency, mlUrgencyOffline);
    sourcesUsed.push('ml_prediction');
  }

  // 3. Engagement model (never overrides rules, only adds context)
  let engagementScore: EngagementScore | null = null;
  if (engagement && engagement.risk_tier) {
    engagementScore = engagement;
    // High engagement risk can escalate at most to AMBER
    if (engagement.risk_tier === 'HIGH') {
      finalUrgency = higher(finalUrgency, 'AMBER');
    }
    sourcesUsed.push('engagement_model');
  }

  // Build recommended action from highest-priority source
  let recommendedAction = ruleResult.recommended_action;
  if (mlPred && mlPred.recommendation && sourcesUsed[sourcesUsed.length - 1] === 'ml_prediction') {
    recommendedAction = mlPred.recommendation;
  }
  if (engagementScore && engagementScore.recommendation) {
    recommendedAction += ` Engagement: ${engagementScore.recommendation}`;
  }

  return {
    final_urgency: finalUrgency,
    backend_urgency: toBackendUrgency(finalUrgency),
    rule_result: ruleResult,
    ml_prediction: mlPred,
    engagement: engagementScore,
    recommended_action: recommendedAction,
    sources_used: sourcesUsed,
    clinician_override_available: finalUrgency !== 'GREY',
  };
}
