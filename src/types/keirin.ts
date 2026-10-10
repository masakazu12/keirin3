/**
 * Keirin AI Forecasting System - Core Type Definitions
 * Specification Version: 0.1 / 2026-10-10
 */

export type KeirinGrade = 'F2' | 'F1' | 'G3' | 'G2' | 'G1' | 'GP';
export type RiderStyle = '逃' | '捲' | '追';
export type BetType = 'wide' | 'quinella' | 'exacta' | 'trio' | 'trifecta';

export interface Entry {
  race_id: string;
  date: string; // YYYY-MM-DD
  grade: KeirinGrade;
  car_no: number; // 1-9
  rider_name?: string; // Optional display name
  rider_id?: string;
  score: number; // 競走得点 (e.g., 88.5)
  style: RiderStyle; // 脚質
  line_id: number; // ラインID
  line_pos: number; // ライン内位置 (1=先頭)
  gear_ratio: number; // ギヤ倍数 (e.g., 3.92)
  win_rate: number; // 勝率 0..1
  top2_rate: number; // 2連対率 0..1
  top3_rate: number; // 3連対率 0..1
  back_count: number; // バック回数
  finish?: number; // 着順 (1-9, drop/disqualify is 99)
}

export interface OddsItem {
  race_id: string;
  bet_type: BetType;
  combo: string; // e.g. "1-2" (exacta), "1-2" (quinella, sorted), "1-4-7" (trifecta/trio)
  odds: number; // 払戻倍率 (e.g. 15.4)
}

export interface RacePayoutItem {
  bet_type: BetType;
  combo: string; // e.g. "1-5", "1-5-2"
  payout: number; // 払戻金 (円)
  popularity?: number; // 人気順
}

export interface EntryResult {
  car_no: number;
  rider_name?: string;
  finish: number; // 1, 2, 3...
  margin?: string; // 着差 (例: "1/2車身", "タイヤ差")
  lastHalfLapTime?: string; // 上がりタイム (例: "11.2秒")
  kimarite?: '逃げ' | '捲くり' | '差し' | 'マーク' | '';
  line_id?: number;
}

export interface RaceResult {
  race_id: string;
  isConfirmed: boolean;
  confirmedAt?: string;
  weather?: string;
  wind?: string;
  ranks: EntryResult[];
  payouts: RacePayoutItem[];
  top3: [number, number, number];
  kimarite1st?: string;
  kimarite2nd?: string;
}

export interface RaceGroup {
  race_id: string;
  date: string;
  grade: KeirinGrade;
  venue: string;
  race_no: number;
  entries: Entry[];
  odds: OddsItem[];
  status?: 'scheduled' | 'closing_soon' | 'racing' | 'finished';
  postTime?: string;
  deadlineTime?: string;
  raceTitle?: string;
  timeSlot?: string;
  result?: RaceResult;
}

/** 開催レース概要情報 (番組表) */
export interface KaisaiRaceOverview {
  race_no: number;
  race_id: string;
  race_name: string; // 例: "Ａ級 準決勝", "Ｓ級 決勝", "Ｌ級 ガールズ予選"
  post_time: string; // 例: "23:20"
  deadline_time: string; // 例: "23:15"
  distance?: number; // 例: 2025 (メートル)
  car_count: number; // 7 または 9
  status: 'scheduled' | 'closing_soon' | 'racing' | 'finished';
  hasOdds?: boolean;
  hasResult?: boolean;
}

/** 開催場データ (全国の競輪場ごとの開催情報) */
export interface KaisaiMeet {
  meet_id: string; // 例: "2026101034"
  date: string; // "YYYY-MM-DD"
  venue_code: string; // 例: "34"
  venue_name: string; // 例: "川崎"
  grade: KeirinGrade; // "GP" | "G1" | "G2" | "G3" | "F1" | "F2"
  time_slot: 'モーニング' | 'デイ' | 'ナイター' | 'ミッドナイト';
  day_title?: string; // 例: "初日", "2日目", "準決勝", "最終日"
  meet_title: string; // 例: "開設74周年記念 (G3)", "日刊スポーツ杯 (F1)"
  bank_length: string; // "333m" | "400m" | "500m"
  bank_feature?: string; // 例: "直線58.0m, カント32°15′"
  weather?: string; // 例: "晴 / 気温 22℃ / 風速 1.2m"
  race_count: number; // 9 または 12
  status: 'holding' | 'selling' | 'finished' | 'scheduled';
  races: KaisaiRaceOverview[];
}

/** 開催日別スケジュール集計 */
export interface KaisaiScheduleDay {
  date: string;
  meets: KaisaiMeet[];
  totalMeets: number;
  totalRaces: number;
  fetchedAt: string;
  source: string;
}


export interface FeatureRow {
  race_id: string;
  car_no: number;
  finish?: number;
  is_first: number; // 1 if finish === 1, else 0
  features: number[]; // Array of 25 feature values
}

export interface ModelHyperparameters {
  maxDepth: number; // 3
  learningRate: number; // 0.05
  numTrees: number; // 250
  minSamplesLeaf: number; // 60 (or scaled down for sample size)
  l2Regularization: number; // 2.0
  temperature: number; // Optimal T found in [0.5, 2.5]
}

export interface StrategyParams {
  bet_type: BetType;
  ev_threshold: number; // 1.0, 1.1, 1.2, 1.3, 1.5, 2.0
  min_prob: number; // 0, 0.02, 0.05, 0.1, 0.15
  max_bets_per_race: number; // 1, 2, 3, 5, 8
}

export interface GridSearchRow {
  id: string;
  bet_type: BetType;
  ev_threshold: number;
  min_prob: number;
  max_bets_per_race: number;
  total_bets: number;
  total_races_bought: number;
  hit_rate: number; // Race-level hit rate (0..1)
  recovery_rate: number; // (Total return / Total cost) * 100%
  std_error: number;
  criterion_score: number; // recovery_rate - std_error
  meets_constraints: boolean;
}

export interface BacktestSummary {
  train_races: number;
  val_races: number;
  test_races: number;
  optimal_temperature: number;
  best_strategy: StrategyParams;
  val_performance: {
    total_bets: number;
    hit_rate: number;
    recovery_rate: number;
    criterion_score: number;
  };
  test_performance: {
    total_bets: number;
    total_cost: number;
    total_return: number;
    races_bought: number;
    total_races: number;
    hit_rate: number;
    recovery_rate: number;
    std_error: number;
    ci_95_low: number;
    ci_95_high: number;
    is_statistically_profitable: boolean;
  };
  baselines: {
    favorite1_recovery_rate: number;
    favorite1_hit_rate: number;
    ai_top_prob_recovery_rate: number;
    ai_top_prob_hit_rate: number;
  };
  trained_at: string;
}

export interface CombinationProb {
  bet_type: BetType;
  combo: string;
  prob: number; // Harville probability
  break_even_odds: number; // 1 / prob
  odds?: number;
  ev?: number; // prob * odds
  is_recommended?: boolean;
}

export interface RiderPrediction {
  car_no: number;
  rider_name?: string;
  line_id: number;
  line_pos: number;
  style: RiderStyle;
  score: number;
  win_prob: number; // Softmax temperature scaled P(1st)
  break_even_odds: number;
  rank: number;
}

export interface RacePredictionResult {
  race_id: string;
  riders: RiderPrediction[];
  combinations: CombinationProb[];
  verdict: 'BUY' | 'SKIP';
  verdict_reason: string;
  recommended_bets: CombinationProb[];
  strategy_used: StrategyParams;
}

/** 予想結果の的中・不的中判定ステータス */
export type HitMissStatus = 'hit' | 'miss' | 'skip' | 'pending';

/** 推奨買い目の的中・払戻評価情報 */
export interface EvaluatedBetItem {
  combo: string;
  prob: number;
  odds: number;
  ev: number;
  isHit?: boolean;
  payout?: number; // 100円あたりの払戻金
  returnAmount?: number; // 購入金額に応じた払戻額
}

/** 単一レースの予想結果的中・不的中および損益評価 */
export interface RacePredictionEvaluation {
  race_id: string;
  date: string;
  venue: string;
  race_no: number;
  grade: KeirinGrade;
  raceTitle?: string;
  status: 'scheduled' | 'closing_soon' | 'racing' | 'finished';
  verdict: 'BUY' | 'SKIP';
  verdictReason: string;
  bets: EvaluatedBetItem[];
  totalBets: number;
  betCost: number; // 投資額 (円)
  totalReturn: number; // 払戻額 (円)
  profit: number; // 損益 (円)
  recoveryRate: number; // 回収率 (%)
  hitStatus: HitMissStatus; // 'hit': 的中, 'miss': 不的中, 'skip': 見送り, 'pending': 未確定
  winningCombo?: string; // 実際の的中目
  top3?: [number, number, number]; // 確定着順 (1着-2着-3着)
  officialPayout?: number; // 公式払戻金
}

/** 開催地（競輪場）ごとの的中率・回収率・損益集計 */
export interface VenueEvaluationStat {
  venue: string;
  venueCode?: string;
  bankLength?: string;
  totalRaces: number;
  finishedRaces: number;
  boughtRaces: number;
  skippedRaces: number;
  hitRaces: number;
  missRaces: number;
  totalBets: number;
  totalCost: number; // 総投資額 (円)
  totalReturn: number; // 総払戻額 (円)
  netProfit: number; // 損益 (円)
  hitRate: number; // 的中率 (%)
  recoveryRate: number; // 回収率 (%)
}

/** 全レース総合評価サマリー */
export interface DatasetEvaluationSummary {
  totalRaces: number;
  finishedRaces: number;
  boughtRaces: number;
  skippedRaces: number;
  pendingRaces: number;
  hitRaces: number;
  missRaces: number;
  totalBets: number;
  totalCost: number; // 総投資額 (円)
  totalReturn: number; // 総払戻額 (円)
  netProfit: number; // 損益 (円)
  hitRate: number; // 的中率 (%)
  recoveryRate: number; // 回収率 (%)
  venueStats: VenueEvaluationStat[];
  evaluations: RacePredictionEvaluation[];
}
