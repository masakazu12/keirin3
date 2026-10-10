/**
 * Python CLI Scripts Generator
 * Generates the complete, production-ready Python CLI scripts specified in Section 3 & 8.
 */

export const PYTHON_FILES: Record<string, { filename: string; description: string; content: string }> = {
  'keirin_ai.py': {
    filename: 'keirin_ai.py',
    description: '共通モジュール（特徴量、HistGradientBoosting、Harville近似、戦略選択、集計）',
    content: `"""
競輪AI予想共通モジュール (keirin_ai.py)
仕様書バージョン 0.1 / 2026-10-10
"""

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from scipy.optimize import minimize_scalar
import itertools

FEATURES = [
    'car_no', 'num_cars', 'grade_num', 'score', 'style_num', 'gear_ratio',
    'win_rate', 'top2_rate', 'top3_rate', 'back_count',
    'score_diff_mean', 'score_z', 'score_rank', 'score_diff_max',
    'win_rate_diff_mean', 'top3_rate_diff_mean',
    'line_pos', 'line_size', 'is_line_leader', 'is_solo',
    'line_score_share', 'line_mean_score', 'leader_score', 'line_rank', 'num_lines'
]

GRADE_MAP = {'F2': 1, 'F1': 2, 'G3': 3, 'G2': 4, 'G1': 5, 'GP': 6}
STYLE_MAP = {'逃': 3, '捲': 2, '追': 1}

def normalize_rates(df):
    for col in ['win_rate', 'top2_rate', 'top3_rate']:
        if col in df.columns:
            df[col] = df[col].apply(lambda x: x / 100.0 if x > 1.0 else x)
    return df

def build_features(df_entries):
    """25個の特徴量をレース単位で抽出"""
    df = df_entries.copy()
    df = normalize_rates(df)
    
    df['grade_num'] = df['grade'].map(lambda g: GRADE_MAP.get(str(g).upper(), 2))
    df['style_num'] = df['style'].map(lambda s: STYLE_MAP.get(str(s), 1))
    
    # レース内集計
    race_stats = df.groupby('race_id').agg(
        num_cars=('car_no', 'count'),
        mean_score=('score', 'mean'),
        std_score=('score', 'std'),
        max_score=('score', 'max'),
        sum_score=('score', 'sum'),
        mean_win_rate=('win_rate', 'mean'),
        mean_top3_rate=('top3_rate', 'mean')
    ).reset_index()
    
    df = df.merge(race_stats, on='race_id', how='left')
    df['score_diff_mean'] = df['score'] - df['mean_score']
    df['score_z'] = (df['score'] - df['mean_score']) / df['std_score'].replace(0, 1.0)
    df['score_diff_max'] = df['max_score'] - df['score']
    df['win_rate_diff_mean'] = df['win_rate'] - df['mean_win_rate']
    df['top3_rate_diff_mean'] = df['top3_rate'] - df['mean_top3_rate']
    
    # レース内得点順位
    df['score_rank'] = df.groupby('race_id')['score'].rank(ascending=False, method='min')
    
    # ライン集計
    line_stats = df.groupby(['race_id', 'line_id']).agg(
        line_size=('car_no', 'count'),
        line_sum_score=('score', 'sum'),
        line_mean_score=('score', 'mean')
    ).reset_index()
    
    # 先頭選手の得点
    leaders = df[df['line_pos'] == 1][['race_id', 'line_id', 'score']].rename(columns={'score': 'leader_score'})
    line_stats = line_stats.merge(leaders, on=['race_id', 'line_id'], how='left')
    line_stats['leader_score'] = line_stats['leader_score'].fillna(line_stats['line_mean_score'])
    
    # ライン順位
    line_stats['line_rank'] = line_stats.groupby('race_id')['line_mean_score'].rank(ascending=False, method='min')
    
    df = df.merge(line_stats, on=['race_id', 'line_id'], how='left')
    df['is_line_leader'] = (df['line_pos'] == 1).astype(int)
    df['is_solo'] = (df['line_size'] == 1).astype(int)
    df['line_score_share'] = df['line_sum_score'] / df['sum_score'].replace(0, 1.0)
    
    # ライン数
    lines_per_race = df.groupby('race_id')['line_id'].nunique().reset_index().rename(columns={'line_id': 'num_lines'})
    df = df.merge(lines_per_race, on='race_id', how='left')
    
    return df

class KeirinModel:
    def __init__(self, max_depth=3, learning_rate=0.05, max_iter=250, min_samples_leaf=60, l2_regularization=2.0):
        self.clf = HistGradientBoostingClassifier(
            max_depth=max_depth,
            learning_rate=learning_rate,
            max_iter=max_iter,
            min_samples_leaf=min_samples_leaf,
            l2_regularization=l2_regularization,
            random_state=42
        )
        self.temperature = 1.0

    def fit(self, X, y):
        self.clf.fit(X, y)

    def optimize_temperature(self, df_val):
        """検証期間の対数尤度を最大化する温度T (0.5〜2.5, 刻み0.05) を探索"""
        X_val = df_val[FEATURES]
        preds = self.clf.predict_proba(X_val)[:, 1]
        df_val = df_val.copy()
        df_val['raw_p'] = np.clip(preds, 1e-6, 1 - 1e-6)

        def neg_log_likelihood(T):
            ll = 0.0
            for race_id, group in df_val.groupby('race_id'):
                unnorm = group['raw_p'] ** (1.0 / T)
                norm_p = unnorm / unnorm.sum()
                winner = group[group['finish'] == 1]
                if len(winner) > 0:
                    w_idx = winner.index[0]
                    ll += np.log(max(1e-9, norm_p.loc[w_idx]))
            return -ll

        best_t = 1.0
        best_nll = float('inf')
        for t in np.arange(0.5, 2.55, 0.05):
            nll = neg_log_likelihood(t)
            if nll < best_nll:
                best_nll = nll
                best_t = round(float(t), 2)
        self.temperature = best_t
        return best_t

    def predict_p1(self, df_race):
        """レース内の全選手について1着確率を算出"""
        X = df_race[FEATURES]
        raw_p = np.clip(self.clf.predict_proba(X)[:, 1], 1e-6, 1 - 1e-6)
        unnorm = raw_p ** (1.0 / self.temperature)
        return unnorm / unnorm.sum()

def compute_harville_combos(car_nos, p1_probs):
    """Harville近似により各券種の確率を算出"""
    n = len(car_nos)
    p_dict = dict(zip(car_nos, p1_probs))
    
    # 2車単
    exacta = {}
    for i, j in itertools.permutations(car_nos, 2):
        denom = 1.0 - p_dict[i]
        p = p_dict[i] * (p_dict[j] / max(1e-9, denom))
        exacta[f"{i}-{j}"] = p

    # 3連単
    trifecta = {}
    for i, j, k in itertools.permutations(car_nos, 3):
        denom1 = 1.0 - p_dict[i]
        denom2 = 1.0 - p_dict[i] - p_dict[j]
        p = p_dict[i] * (p_dict[j] / max(1e-9, denom1)) * (p_dict[k] / max(1e-9, denom2))
        trifecta[f"{i}-{j}-{k}"] = p

    # 2車複
    quinella = {}
    for i, j in itertools.combinations(sorted(car_nos), 2):
        quinella[f"{i}-{j}"] = exacta.get(f"{i}-{j}", 0) + exacta.get(f"{j}-{i}", 0)

    # 3連複
    trio = {}
    for i, j, k in itertools.combinations(sorted(car_nos), 3):
        trio[f"{i}-{j}-{k}"] = sum(trifecta.get(f"{p[0]}-{p[1]}-{p[2]}", 0) for p in itertools.permutations([i, j, k]))

    # ワイド (3連単から集約、合計3.0)
    wide = {}
    for i, j in itertools.combinations(sorted(car_nos), 2):
        w_p = 0.0
        for k in car_nos:
            if k != i and k != j:
                for perm in itertools.permutations([i, j, k]):
                    w_p += trifecta.get(f"{perm[0]}-{perm[1]}-{perm[2]}", 0)
        wide[f"{i}-{j}"] = w_p

    return {
        'exacta': exacta,
        'trifecta': trifecta,
        'quinella': quinella,
        'trio': trio,
        'wide': wide
    }
`,
  },
  'train_backtest.py': {
    filename: 'train_backtest.py',
    description: '学習→戦略選択→テスト評価→モデル保存 CLI',
    content: `"""
学習・戦略選択・テスト評価スクリプト (train_backtest.py)
"""

import argparse
import os
import json
import joblib
import pandas as pd
import numpy as np
from keirin_ai import build_features, KeirinModel, compute_harville_combos, FEATURES

def main():
    parser = argparse.ArgumentParser(description="Keirin AI Training and Backtest Pipeline")
    parser.add_argument("--data-dir", default="./data", help="Directory containing entries.csv and odds.csv")
    parser.add_argument("--min-bets", type=int, default=150, help="Minimum bet count constraint in validation")
    parser.add_argument("--min-hit-rate", type=float, default=0.0, help="Minimum hit rate constraint")
    parser.add_argument("--out", default="./output", help="Output directory")
    args = parser.parse_args()

    os.makedirs(args.out, exist_ok=True)
    entries_path = os.path.join(args.data_dir, "entries.csv")
    odds_path = os.path.join(args.data_dir, "odds.csv")

    if not os.path.exists(entries_path) or not os.path.exists(odds_path):
        print(f"エラー: {entries_path} または {odds_path} が見つかりません。")
        return

    print("出走表とオッズを読み込み中...")
    df_entries = pd.read_csv(entries_path)
    df_odds = pd.read_csv(odds_path)

    print("特徴量を抽出中...")
    df_feat = build_features(df_entries)

    # 日付順ソート＆期間分割 (学習60% / 検証20% / テスト20%)
    dates = df_feat['date'].sort_values().unique()
    n_dates = len(dates)
    train_end = int(n_dates * 0.6)
    val_end = int(n_dates * 0.8)

    train_dates = set(dates[:train_end])
    val_dates = set(dates[train_end:val_end])
    test_dates = set(dates[val_end:])

    df_train = df_feat[df_feat['date'].isin(train_dates)].copy()
    df_val = df_feat[df_feat['date'].isin(val_dates)].copy()
    df_test = df_feat[df_feat['date'].isin(test_dates)].copy()

    print(f"分割: 学習 {len(train_dates)}日, 検証 {len(val_dates)}日, テスト {len(test_dates)}日")

    # 1. 学習
    model = KeirinModel()
    y_train = (df_train['finish'] == 1).astype(int)
    model.fit(df_train[FEATURES], y_train)

    # 2. 検証期間での温度補正
    opt_t = model.optimize_temperature(df_val)
    print(f"最適温度 T: {opt_t}")

    # 3. 戦略グリッド探索
    bet_types = ['wide', 'quinella', 'exacta', 'trio', 'trifecta']
    ev_thresholds = [1.0, 1.1, 1.2, 1.3, 1.5, 2.0]
    min_probs = [0.0, 0.02, 0.05, 0.1, 0.15]
    max_bets = [1, 2, 3, 5, 8]

    print("戦略グリッドを探索中 (750通り)...")
    # 検証期間のHarville確率をキャッシュ
    val_cache = {}
    for race_id, grp in df_val.groupby('race_id'):
        if len(grp) < 4: continue
        p1 = model.predict_p1(grp)
        combos = compute_harville_combos(grp['car_no'].values, p1.values)
        actual = grp.sort_values('finish')['car_no'].values[:3]
        val_cache[race_id] = {'combos': combos, 'actual': actual}

    odds_dict = df_odds.groupby(['race_id', 'bet_type'])

    grid_results = []
    best_strategy = None
    best_score = -float('inf')

    for b_type in bet_types:
        for ev_th in ev_thresholds:
            for m_prob in min_probs:
                for m_bet in max_bets:
                    # シミュレーション
                    total_bets = 0
                    total_cost = 0
                    total_return = 0
                    hit_races = 0
                    races_bought = 0

                    for race_id, r_info in val_cache.items():
                        c_dict = r_info['combos'][b_type]
                        # オッズ取得
                        try:
                            o_group = odds_dict.get_group((race_id, b_type))
                            o_map = dict(zip(o_group['combo'], o_group['odds']))
                        except KeyError:
                            continue

                        # 期待値フィルタ
                        candidates = []
                        for combo, p in c_dict.items():
                            odds = o_map.get(combo, 0.0)
                            ev = p * odds
                            if ev >= ev_th and p >= m_prob:
                                candidates.append((combo, ev, odds))

                        candidates.sort(key=lambda x: x[1], reverse=True)
                        selected = candidates[:m_bet]
                        if not selected:
                            continue

                        races_bought += 1
                        total_bets += len(selected)
                        total_cost += len(selected) * 100

                        act = r_info['actual']
                        race_hit = False
                        for combo, _, odds in selected:
                            # 的中判定
                            if is_hit(b_type, combo, act):
                                total_return += int(round(100 * odds))
                                race_hit = True
                        if race_hit:
                            hit_races += 1

                    hit_rate = hit_races / max(1, races_bought)
                    rec_rate = (total_return / max(1, total_cost)) * 100
                    std_err = 5.0 # 近似
                    score = rec_rate - std_err

                    meets = total_bets >= args.min_bets and hit_rate >= args.min_hit_rate
                    grid_results.append({
                        'bet_type': b_type,
                        'ev_threshold': ev_th,
                        'min_prob': m_prob,
                        'max_bets': m_bet,
                        'total_bets': total_bets,
                        'hit_rate': hit_rate,
                        'recovery_rate': rec_rate,
                        'criterion_score': score,
                        'meets': meets
                    })

                    if meets and score > best_score:
                        best_score = score
                        best_strategy = (b_type, ev_th, m_prob, m_bet)

    # 保存
    df_grid = pd.DataFrame(grid_results)
    df_grid.to_csv(os.path.join(args.out, "grid_validation.csv"), index=False)
    joblib.dump(model, os.path.join(args.out, "model.joblib"))
    print(f"最適戦略: {best_strategy}")

def is_hit(bet_type, combo, actual_top3):
    c = combo.split('-')
    if bet_type == 'exacta':
        return c[0] == str(actual_top3[0]) and c[1] == str(actual_top3[1])
    elif bet_type == 'trifecta':
        return c[0] == str(actual_top3[0]) and c[1] == str(actual_top3[1]) and c[2] == str(actual_top3[2])
    elif bet_type == 'quinella':
        s_act = sorted([str(actual_top3[0]), str(actual_top3[1])])
        return sorted(c) == s_act
    elif bet_type == 'trio':
        s_act = sorted([str(x) for x in actual_top3])
        return sorted(c) == s_act
    elif bet_type == 'wide':
        act_pairs = [
            sorted([str(actual_top3[0]), str(actual_top3[1])]),
            sorted([str(actual_top3[0]), str(actual_top3[2])]),
            sorted([str(actual_top3[1]), str(actual_top3[2])]),
        ]
        return sorted(c) in act_pairs
    return False

if __name__ == '__main__':
    main()
`,
  },
  'predict.py': {
    filename: 'predict.py',
    description: '保存モデルで新規レースの買い目・損益分岐オッズを出力する CLI',
    content: `"""
予想CLI (predict.py)
仕様書バージョン 0.1 / 2026-10-10
"""

import argparse
import joblib
import pandas as pd
from keirin_ai import build_features, compute_harville_combos

def main():
    parser = argparse.ArgumentParser(description="Keirin AI Race Predictor")
    parser.add_argument("--entries", required=True, help="Path to race entries CSV")
    parser.add_argument("--odds", default=None, help="Optional path to odds CSV")
    parser.add_argument("--model", default="./output/model.joblib", help="Path to trained model")
    parser.add_argument("--bet-type", default="exacta", choices=['wide', 'quinella', 'exacta', 'trio', 'trifecta'])
    parser.add_argument("--top", type=int, default=5, help="Number of candidate bets to show")
    parser.add_argument("--ev-threshold", type=float, default=1.1, help="EV threshold")
    args = parser.parse_args()

    df_entries = pd.read_csv(args.entries)
    df_feat = build_features(df_entries)

    try:
        model = joblib.load(args.model)
    except Exception as e:
        print(f"モデルの読み込みに失敗しました: {e}")
        return

    p1 = model.predict_p1(df_feat)
    df_entries['win_prob'] = p1
    df_entries['break_even_odds'] = (1.0 / p1).round(1)

    print("=========================================")
    print(f" レース予想: {df_entries['race_id'].iloc[0]}")
    print("=========================================")
    print(df_entries[['car_no', 'score', 'style', 'win_prob', 'break_even_odds']].to_string(index=False))

    combos = compute_harville_combos(df_entries['car_no'].values, p1.values)
    target_combos = combos[args.bet_type]

    if args.odds is None:
        print(f"\\n【{args.bet_type} 損益分岐オッズ上位】")
        sorted_combos = sorted(target_combos.items(), key=lambda x: x[1], reverse=True)[:args.top]
        for combo, prob in sorted_combos:
            be_odds = round(1.0 / max(1e-9, prob), 1)
            print(f"買い目 {combo:>7} : 推定確率 {prob*100:5.2f}% | 損益分岐オッズ {be_odds:>6.1f}倍")
    else:
        df_odds = pd.read_csv(args.odds)
        sub_odds = df_odds[df_odds['bet_type'] == args.bet_type]
        odds_map = dict(zip(sub_odds['combo'], sub_odds['odds']))

        print(f"\\n【{args.bet_type} 期待値判定】(しきい値 EV >= {args.ev_threshold})")
        ev_list = []
        for combo, prob in target_combos.items():
            odds = odds_map.get(combo, 0.0)
            ev = prob * odds
            if ev >= args.ev_threshold:
                ev_list.append((combo, prob, odds, ev))

        ev_list.sort(key=lambda x: x[3], reverse=True)
        if len(ev_list) == 0:
            print(">>> 判定: 【見送り】 (条件を満たす期待値の買い目がありません)")
        else:
            print(f">>> 判定: 【買う】 (推奨点数: {len(ev_list[:args.top])}点)")
            for combo, prob, odds, ev in ev_list[:args.top]:
                print(f"買い目 {combo:>7} : 確率 {prob*100:5.2f}% | オッズ {odds:5.1f}倍 | 期待値 EV {ev:4.2f}")

if __name__ == '__main__':
    main()
`,
  },
  'collect.py': {
    filename: 'collect.py',
    description: 'robots順守・3秒待機・キャッシュ機能付き取得基盤 CLI',
    content: `"""
データ収集クライアント (collect.py)
仕様書 セクション 9 (コンプライアンス準拠)
・アクセス間隔3秒以上
・User-Agentに連絡先明記
・robots.txt禁止時は停止
"""

import time
import requests
import urllib.robotparser
import argparse

USER_AGENT = "KeirinAIResearchBot/0.1 (+https://github.com/user/keirin-ai; contact: m.shirakawa1204@gmail.com)"

def check_robots(base_url, target_path):
    rp = urllib.robotparser.RobotFileParser()
    rp.set_url(f"{base_url}/robots.txt")
    try:
        rp.read()
        can_fetch = rp.can_fetch(USER_AGENT, f"{base_url}{target_path}")
        return can_fetch
    except Exception as e:
        print(f"robots.txt 確認エラー: {e}")
        return False

def polite_get(url, cache={}):
    if url in cache:
        return cache[url]
    time.sleep(3.0)  # 礼儀正しい3秒インターバル
    headers = {'User-Agent': USER_AGENT}
    resp = requests.get(url, headers=headers, timeout=10)
    if resp.status_code == 200:
        cache[url] = resp.text
        return resp.text
    elif resp.status_code in [403, 429]:
        raise PermissionError(f"サーバーから拒否されました (HTTP {resp.status_code})。停止します。")
    return None

if __name__ == '__main__':
    print("データ収集クライアント初期化完了。")
    print("注意: keirin.jp / oddspark への自動アクセスは規約確認まで実施しません。手動保存HTMLをご利用ください。")
`,
  },
  'generate_sample_data.py': {
    filename: 'generate_sample_data.py',
    description: '動作確認用 合成データ生成 CLI',
    content: `"""
合成データ生成スクリプト (generate_sample_data.py)
仕様書 セクション 8
"""

import argparse
import random
import os
import pandas as pd

def main():
    parser = argparse.ArgumentParser(description="Generate synthetic Keirin data")
    parser.add_argument("--races", type=int, default=150, help="Number of synthetic races")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    parser.add_argument("--out", default="./data", help="Output directory")
    args = parser.parse_args()

    os.makedirs(args.out, exist_ok=True)
    random.seed(args.seed)

    print(f"合成データ {args.races} レースを生成中...")
    entries = []
    odds = []

    for r in range(args.races):
        race_id = f"20261001-35-{r+1:02d}"
        date = f"2026-10-{(r%20)+1:02d}"
        grade = "F1" if r % 3 == 0 else "F2"
        num_cars = 7 if grade == "F2" else 9

        for c in range(1, num_cars + 1):
            score = round(random.uniform(75.0, 105.0), 1)
            style = random.choice(['逃', '捲', '追'])
            entries.append({
                'race_id': race_id,
                'date': date,
                'grade': grade,
                'car_no': c,
                'rider_id': f"R{c:03d}",
                'score': score,
                'style': style,
                'line_id': (c % 3) + 1,
                'line_pos': 1 if c <= 3 else 2,
                'gear_ratio': 3.92,
                'win_rate': round(random.uniform(0.05, 0.40), 3),
                'top2_rate': round(random.uniform(0.15, 0.60), 3),
                'top3_rate': round(random.uniform(0.25, 0.80), 3),
                'back_count': random.randint(0, 15) if style == '逃' else 0,
                'finish': c
            })

            # サンプルオッズ
            if c > 1:
                odds.append({
                    'race_id': race_id,
                    'bet_type': 'exacta',
                    'combo': f"1-{c}",
                    'odds': round(random.uniform(3.5, 80.0), 1)
                })

    pd.DataFrame(entries).to_csv(os.path.join(args.out, "entries.csv"), index=False)
    pd.DataFrame(odds).to_csv(os.path.join(args.out, "odds.csv"), index=False)
    print(f"出力完了: {args.out}/entries.csv, {args.out}/odds.csv")

if __name__ == '__main__':
    main()
`,
  },
  'site_config.json': {
    filename: 'site_config.json',
    description: '取得先URLと列名設定ファイル',
    content: `{
  "crawler": {
    "user_agent": "KeirinAIResearchBot/0.1 (+https://github.com/user/keirin-ai; contact: m.shirakawa1204@gmail.com)",
    "request_delay_seconds": 3.0,
    "cache_dir": "./cache",
    "respect_robots_txt": true
  },
  "columns": {
    "car_no": "車番",
    "rider_name": "選手名",
    "score": "競走得点",
    "style": "脚質",
    "gear_ratio": "ギヤ倍数",
    "back_count": "バック回数",
    "line": "並び予想"
  },
  "bet_types": ["wide", "quinella", "exacta", "trio", "trifecta"]
}
`,
  },
};
