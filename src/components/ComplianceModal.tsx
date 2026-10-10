/**
 * Compliance and Ethics Modal
 * Implements Section 9 & 10 of the specification.
 */

import React from 'react';
import { ShieldCheck, AlertTriangle, Check, X, Scale } from 'lucide-react';

interface ComplianceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ComplianceModal: React.FC<ComplianceModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2 text-slate-100 font-bold text-sm">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <span>データ取得仕様 ＆ コンプライアンス・免責事項</span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs text-slate-300 leading-relaxed">
          {/* Section 9 Summary */}
          <div className="space-y-2">
            <h4 className="font-bold text-slate-100 flex items-center gap-1.5 text-sm">
              <Scale className="w-4 h-4 text-blue-400" />
              <span>1. データ取得方針（仕様書セクション 9）</span>
            </h4>
            <div className="p-3 bg-slate-950 rounded border border-slate-800 space-y-2">
              <p>
                <strong>方針:</strong> 取得先の利用規約および robots.txt を満たす場合のみ自動取得を行います。
              </p>
              <ul className="list-disc list-inside space-y-1 text-slate-400">
                <li>
                  <strong className="text-slate-200">公式サイト (keirin.jp):</strong> robots.txt によるレースページ取得制限等の情報が確認されるまで自動取得は行いません。
                </li>
                <li>
                  <strong className="text-slate-200">オッズパーク:</strong> サイトポリシーに基づき私的使用の範囲に限定し、自動巡回は行いません。
                </li>
                <li>
                  <strong className="text-slate-200">取得クライアントの厳格挙動:</strong> アクセス間隔は最低3秒以上、User-Agentに連絡先（メールアドレス）を明記、403/429検知時は即時中断。
                </li>
                <li>
                  <strong className="text-slate-200">フェーズ1 代替経路:</strong> ユーザー自身がブラウザで閲覧・保存したローカルHTMLの手動解析を推奨します。
                </li>
              </ul>
            </div>
          </div>

          {/* Mathematical & Financial Reality */}
          <div className="space-y-2">
            <h4 className="font-bold text-slate-100 flex items-center gap-1.5 text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>2. 控除率と統計的利益判定（仕様書セクション 7 & 10）</span>
            </h4>
            <div className="p-3 bg-amber-950/30 border border-amber-600/40 rounded space-y-2 text-amber-200/90">
              <p>
                競輪の車券投票には<strong>約25%の控除率</strong>（主催者取り分、還元率約75%）が存在します。
              </p>
              <p>
                機械学習モデルおよびHarville近似による期待値抽出は、市場の歪みや高EV目を特定するための数理的アプローチですが、<strong>将来の的中や金銭的利益を一切保証するものではありません。</strong>
              </p>
              <p>
                テスト期間の回収率の95%信頼区間（2,000回ブートストラップ）が100%を安定して上回らない限り、「利益が出る」と結論づけることは禁止されています。
              </p>
            </div>
          </div>

          {/* Privacy & Safety */}
          <div className="space-y-2">
            <h4 className="font-bold text-slate-100 text-sm">
              3. 個人情報・自動投票機能の排除
            </h4>
            <div className="p-3 bg-slate-950 rounded border border-slate-800 space-y-1 text-slate-400">
              <p>
                本システムは<strong>車券の自動購入機能および投票サイトへのログイン機能を持っていません。</strong>
              </p>
              <p>
                選手名は表示にのみ利用され、特徴量および学習器には一切含まれません（車番・競走得点・脚質・統計値のみ使用）。
              </p>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold"
          >
            確認・了解しました
          </button>
        </div>
      </div>
    </div>
  );
};
