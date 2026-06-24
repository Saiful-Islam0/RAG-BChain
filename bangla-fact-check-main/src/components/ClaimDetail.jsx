import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { motion as Motion } from "framer-motion";
import MainComponent from "./MainComponent";
import { pickTxUrl } from "../utils/blockchainExplorer";

const CLASSIFICATION_META = {
  REAL: {
    label: "যাচাইকৃত",
    heading: "উচ্চ নির্ভরযোগ্যতা",
    icon: "verified",
    bg: "bg-green-50 dark:bg-green-900/20",
    border: "border-green-200 dark:border-green-800",
    text: "text-green-700 dark:text-green-400",
    badge: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
    bar: "bg-green-500",
  },
  FAKE: {
    label: "ভুয়া",
    heading: "ভুয়া তথ্য শনাক্ত",
    icon: "dangerous",
    bg: "bg-red-50 dark:bg-red-900/20",
    border: "border-red-200 dark:border-red-800",
    text: "text-red-700 dark:text-red-400",
    badge: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
    bar: "bg-red-500",
  },
  MISINFORMATION: {
    label: "বিভ্রান্তিকর",
    heading: "বিভ্রান্তিকর তথ্য",
    icon: "warning",
    bg: "bg-amber-50 dark:bg-amber-900/20",
    border: "border-amber-200 dark:border-amber-800",
    text: "text-amber-700 dark:text-amber-400",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
    bar: "bg-amber-500",
  },
  UNSURE: {
    label: "অনিশ্চিত",
    heading: "অনির্ণেয়",
    icon: "help",
    bg: "bg-slate-50 dark:bg-slate-800/40",
    border: "border-slate-200 dark:border-slate-700",
    text: "text-slate-500 dark:text-slate-400",
    badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
    bar: "bg-slate-400",
  },
};

function formatDate(isoString) {
  if (!isoString) return "";
  try {
    return new Date(isoString).toLocaleString("bn-BD", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

function normalizeTxHash(value) {
  if (!value || typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  return raw.startsWith("0x") ? raw : `0x${raw}`;
}

function pickTxHash(onchain) {
  if (!onchain || typeof onchain !== "object") return null;
  const registration = onchain.registration || {};
  return normalizeTxHash(
    registration.tx_hash ||
      registration.transaction_hash ||
      registration.txHash ||
      registration.hash ||
      registration?.raw?.tx_hash ||
      onchain.tx_hash ||
      onchain.transaction_hash ||
      onchain.txHash ||
      onchain.hash
  );
}

const ClaimDetail = () => {
  const { id } = useParams();
  const [claim, setClaim] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/claims/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "এই রিপোর্ট পাওয়া যায়নি।" : "Server error");
        return r.json();
      })
      .then((data) => setClaim(data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!claim) return <ErrorState message="কোনো তথ্য পাওয়া যায়নি।" />;

  const meta = CLASSIFICATION_META[claim.classification] || CLASSIFICATION_META.UNSURE;
  const score = claim.credibility_score ?? 0;
  const sources = claim.evidence_sources ?? [];
  const explanation = claim.explanation || "";
  const onchain = claim.onchain ?? {};
  const txHash = pickTxHash(onchain);
  const txUrl = pickTxUrl(onchain, txHash);

  return (
    <MainComponent>
      <div className="glass-page min-h-screen text-slate-800 font-display">
        <main className="max-w-[960px] mx-auto p-6 md:p-10">
          {/* Back link */}
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-primary transition-colors mb-6"
          >
            <span className="material-symbols-outlined text-lg">arrow_back</span>
            হোমে ফিরুন
          </Link>

          <Motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="flex flex-col gap-6"
          >
            {/* Classification Header */}
            <div className={`rounded-xl border ${meta.border} ${meta.bg} p-6 md:p-8`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
                <div>
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${meta.badge} mb-3`}>
                    <span className="material-symbols-outlined text-sm">{meta.icon}</span>
                    {meta.label}
                  </span>
                  <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white">
                    {meta.heading}
                  </h1>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-4xl font-black text-primary">{score}%</span>
                  <p className="text-xs font-medium text-slate-400 mt-1">নিশ্চয়তা স্কোর</p>
                </div>
              </div>
              <div className="w-full bg-white/50 dark:bg-black/10 h-3 rounded-full overflow-hidden">
                <Motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(score, 100)}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className={`${meta.bar} h-full rounded-full`}
                />
              </div>
            </div>

            {/* Claim Text */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
              <h2 className="font-bold mb-3 flex items-center gap-2 text-slate-900 dark:text-white">
                <span className="material-symbols-outlined text-primary">article</span>
                যাচাইকৃত বক্তব্য
              </h2>
              <p className="text-base text-slate-700 dark:text-slate-300 leading-relaxed">
                {claim.claim_text_original || claim.claim_text}
              </p>
              <div className="flex flex-wrap items-center gap-3 mt-4 text-xs text-slate-400">
                {claim.language && (
                  <span className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                    <span className="material-symbols-outlined text-xs">translate</span>
                    {claim.language}
                  </span>
                )}
                {claim.timestamp && (
                  <span className="inline-flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs">schedule</span>
                    {formatDate(claim.timestamp)}
                  </span>
                )}
              </div>
            </div>

            {/* AI Reasoning */}
            {explanation && (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
                <h2 className="font-bold mb-4 flex items-center gap-2 text-slate-900 dark:text-white">
                  <span className="material-symbols-outlined text-primary">psychology</span>
                  এআই রিজনিং
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-400 leading-7 whitespace-pre-line">
                  {explanation}
                </p>
              </div>
            )}

            {/* Evidence Sources */}
            {sources.length > 0 && (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <h2 className="font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                    <span className="material-symbols-outlined text-primary">source</span>
                    ক্রস-রেফারেন্সড প্রমাণ (RAG)
                  </h2>
                  <span className="text-xs text-slate-400">{sources.length}টি উৎস</span>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sources.map((src, i) => (
                    <div key={i} className="p-5 flex flex-col gap-2">
                      <div className="flex justify-between items-center">
                        {src.url ? (
                          <a
                            href={src.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-bold text-primary bg-primary/5 px-2 py-0.5 rounded hover:underline"
                          >
                            {src.title || src.url}
                          </a>
                        ) : (
                          <span className="text-xs font-bold text-primary bg-primary/5 px-2 py-0.5 rounded">
                            {src.title || `উৎস ${i + 1}`}
                          </span>
                        )}
                        {src.date && (
                          <span className="text-[10px] text-slate-400 italic">{src.date}</span>
                        )}
                      </div>
                      {src.snippet && (
                        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                          &ldquo;{src.snippet}&rdquo;
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Blockchain Status */}
            <div
              className={`bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-l-4 ${
                txHash ? "border-l-primary" : claim.classification === "REAL" ? "border-l-green-500" : "border-l-slate-300 dark:border-l-slate-700"
              }`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${
                    txHash ? "bg-primary/10 text-primary" : claim.classification === "REAL" ? "bg-green-100 dark:bg-green-900/30 text-green-600" : "bg-slate-100 dark:bg-slate-800 text-slate-400"
                  }`}
                >
                  <span className="material-symbols-outlined">hub</span>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                    অপরিবর্তনীয় রেকর্ড স্ট্যাটাস
                  </p>
                  {txHash ? (
                    <p className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                      ব্লকচেইনে নিবন্ধিত
                      <a
                        href={txUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] font-mono text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded break-all hover:underline"
                        title="Open blockchain transaction"
                      >
                        TX: {txHash}
                      </a>
                    </p>
                  ) : claim.classification === "REAL" ? (
                    <p className="text-sm font-semibold text-green-600">
                      সত্যায়িত — অন-চেইন নিবন্ধন প্রয়োজন নেই
                    </p>
                  ) : (
                    <p className="text-sm font-semibold text-slate-500">
                      অন-চেইন ডেটা পাওয়া যায়নি
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Flagged Sources */}
            {claim.flagged_sources && claim.flagged_sources.length > 0 && (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100 dark:border-slate-800">
                  <h2 className="font-bold flex items-center gap-2 text-slate-900 dark:text-white">
                    <span className="material-symbols-outlined text-red-500">flag</span>
                    ফ্ল্যাগড উৎসসমূহ
                  </h2>
                </div>
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {claim.flagged_sources.map((fs, i) => (
                    <div key={i} className="p-4 flex flex-col gap-1">
                      {fs.url ? (
                        <a href={fs.url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-red-600 hover:underline">
                          {fs.title || fs.url}
                        </a>
                      ) : (
                        <span className="text-xs font-bold text-red-600">{fs.title || `উৎস ${i + 1}`}</span>
                      )}
                      {fs.reason && <p className="text-xs text-slate-500">{fs.reason}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Motion.div>
        </main>
      </div>
    </MainComponent>
  );
};

const LoadingState = () => (
  <MainComponent>
    <div className="glass-page min-h-screen font-display">
      <main className="max-w-[960px] mx-auto p-6 md:p-10">
        <div className="flex flex-col gap-6 animate-pulse">
          <div className="h-5 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="rounded-xl bg-slate-100 dark:bg-slate-800 h-40" />
          <div className="rounded-xl bg-slate-100 dark:bg-slate-800 h-24" />
          <div className="rounded-xl bg-slate-100 dark:bg-slate-800 h-64" />
        </div>
      </main>
    </div>
  </MainComponent>
);

const ErrorState = ({ message }) => (
  <MainComponent>
    <div className="glass-page min-h-screen font-display flex items-center justify-center">
      <div className="text-center">
        <span className="material-symbols-outlined text-6xl text-slate-300 dark:text-slate-600 mb-4 block">
          error_outline
        </span>
        <p className="text-lg font-bold text-slate-500 dark:text-slate-400 mb-4">{message}</p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          <span className="material-symbols-outlined text-lg">arrow_back</span>
          হোমে ফিরুন
        </Link>
      </div>
    </div>
  </MainComponent>
);

export default ClaimDetail;
