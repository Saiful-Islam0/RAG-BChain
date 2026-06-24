import React, { useEffect, useMemo, useState } from "react";
import MainComponent from "./MainComponent";
import { pickTxUrl } from "../utils/blockchainExplorer";

const CLASSIFICATION_MAP = {
  REAL: {
    label: "যাচাইকৃত",
    heading: "উচ্চ নির্ভরযোগ্যতা",
    icon: "verified",
    color: "success",
  },
  FAKE: {
    label: "ভুয়া",
    heading: "ভুয়া তথ্য শনাক্ত",
    icon: "dangerous",
    color: "danger",
  },
  MISINFORMATION: {
    label: "বিভ্রান্তিকর",
    heading: "বিভ্রান্তিকর তথ্য",
    icon: "warning",
    color: "warning",
  },
  UNSURE: {
    label: "অনিশ্চিত",
    heading: "অনির্ণেয়",
    icon: "help",
    color: "slate-400",
  },
};

function getClassMeta(classification) {
  return CLASSIFICATION_MAP[classification] || CLASSIFICATION_MAP.UNSURE;
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
  const registrations = Array.isArray(onchain.registrations)
    ? onchain.registrations
    : [];
  const firstRegResult = registrations.find((r) => r?.result)?.result || {};
  return normalizeTxHash(
    registration.tx_hash ||
      registration.transaction_hash ||
      registration.txHash ||
      registration.hash ||
      registration?.raw?.tx_hash ||
      firstRegResult.tx_hash ||
      firstRegResult.transaction_hash ||
      firstRegResult.txHash ||
      firstRegResult.hash ||
      firstRegResult?.raw?.tx_hash ||
      onchain.tx_hash ||
      onchain.transaction_hash ||
      onchain.txHash ||
      onchain.hash
  );
}

const FactCheck = () => {
  const [inputType, setInputType] = useState("text");
  const [inputValue, setInputValue] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async () => {
    setError(null);
    setResult(null);
    setLoading(true);

    try {
      let res;

      if (inputType === "image") {
        if (!imageFile) {
          setError("অনুগ্রহ করে একটি ইমেজ আপলোড করুন।");
          setLoading(false);
          return;
        }
        const formData = new FormData();
        formData.append("file", imageFile);
        res = await fetch("/api/verify/image", {
          method: "POST",
          body: formData,
        });
      } else {
        const claim = inputType === "text" ? inputValue.trim() : "";
        const url = inputType === "url" ? inputValue.trim() : "";
        if (!claim && !url) {
          setError("অনুগ্রহ করে সত্যতা যাচাইয়ের জন্য একটি বক্তব্য বা লিঙ্ক দিন।");
          setLoading(false);
          return;
        }
        res = await fetch("/api/verify/text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ claim, url }),
        });
      }

      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.detail || `Server error (${res.status})`);
      }

      const data = await res.json();
      setResult(data);
    } catch (err) {
      setError(err.message || "কিছু সমস্যা হয়েছে। দয়া করে আবার চেষ্টা করুন।");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setInputValue("");
    setImageFile(null);
    setImagePreview(null);
    setResult(null);
    setError(null);
  };

  const meta = result ? getClassMeta(result.classification) : null;
  const score = result?.credibility_score ?? 0;
  const evidenceSources = result?.evidence_sources ?? [];
const flaggedSources = result?.flagged_sources ?? [];
const onchainSources = result?.onchain_sources ?? [];
  const onchain = result?.onchain_metadata ?? {};
  const warnings = result?.warnings ?? onchain?.warnings ?? [];
  const txHash = pickTxHash(onchain);
  const txUrl = pickTxUrl(onchain, txHash);
  const verdict = result?.verdict_translated || result?.verdict_original || result?.verdict_english || "";

  return (
    <MainComponent>
      <div className="glass-page min-h-screen text-slate-800 font-display">
        <main className="max-w-[1440px] mx-auto p-8">
          <div className="mb-8">
            <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">
              সংবাদ কন্টেন্ট বিশ্লেষণ করুন
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-2 text-lg">
              RAG এবং ব্লকচেইন যাচাইকরণের মাধ্যমে সত্যতা শনাক্ত করা হচ্ছে।
            </p>
          </div>

          <div className="flex flex-col lg:flex-row gap-8">
            {/* Left Column: Input Card */}
            <aside className="w-full lg:w-[420px] shrink-0">
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 sticky top-24">
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
                  আর্টিকেল ইনপুট
                </h2>

                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg mb-6">
                  {["text", "url", "image"].map((type) => (
                    <button
                      key={type}
                      onClick={() => {
                        setInputType(type);
                        setError(null);
                      }}
                      className={`flex-1 text-center py-2 px-2 rounded-md font-medium text-xs md:text-sm transition-all capitalize ${
                        inputType === type
                          ? "bg-white dark:bg-slate-700 shadow-sm text-primary"
                          : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                      }`}
                    >
                      {type === "text"
                        ? "টেক্সট"
                        : type === "url"
                          ? "URL"
                          : "ইমেজ"}
                    </button>
                  ))}
                </div>

                <div className="mb-6">
                  {inputType === "image" ? (
                    <div className="w-full min-h-[10rem] border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-900/50 transition-colors cursor-pointer relative overflow-hidden">
                      <input
                        type="file"
                        accept="image/*"
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        onChange={handleImageChange}
                      />
                      {imagePreview ? (
                        <img
                          src={imagePreview}
                          alt="Preview"
                          className="max-h-48 object-contain"
                        />
                      ) : (
                        <>
                          <span className="material-symbols-outlined text-slate-400 text-4xl mb-2">
                            add_photo_alternate
                          </span>
                          <p className="text-sm text-slate-500 text-center px-4">
                            ইমেজ আপলোড করতে এখানে ক্লিক করুন অথবা ড্র্যাগ এন্ড ড্রপ
                            করুন
                          </p>
                        </>
                      )}
                    </div>
                  ) : (
                    <textarea
                      className="w-full h-40 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg p-4 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none resize-none placeholder:text-slate-400"
                      placeholder={
                        inputType === "text"
                          ? "গভীর বিশ্লেষণের জন্য সংবাদ আর্টিকেলের কন্টেন্ট এখানে পেস্ট করুন..."
                          : "নিউজ লিঙ্ক পেস্ট করুন..."
                      }
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                    />
                  )}
                </div>

                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="w-full bg-primary hover:bg-primary/90 text-white font-bold py-3 px-6 rounded-lg flex items-center justify-center gap-2 transition-transform active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <>
                      <svg
                        className="animate-spin h-5 w-5"
                        viewBox="0 0 24 24"
                        fill="none"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                        />
                      </svg>
                      বিশ্লেষণ চলছে...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined">
                        analytics
                      </span>
                      গভীর বিশ্লেষণ শুরু করুন
                    </>
                  )}
                </button>

                {result && (
                  <button
                    onClick={handleClear}
                    className="w-full mt-3 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-medium py-2 px-6 rounded-lg text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    রিসেট করুন
                  </button>
                )}

                <p className="mt-4 text-[11px] text-center text-slate-400 uppercase tracking-widest font-semibold">
                  RAG এবং ব্লকচেইন যাচাইকরণ দ্বারা চালিত
                </p>
              </div>
            </aside>

            {/* Right Column: Output Stack */}
            <div className="flex-1 flex flex-col gap-6">
              {/* Error state */}
              {error && (
                <div className="bg-danger/5 border border-danger/20 rounded-xl p-6 flex items-start gap-3">
                  <span className="material-symbols-outlined text-danger mt-0.5">
                    error
                  </span>
                  <p className="text-sm text-danger font-medium">{error}</p>
                </div>
              )}

              {/* Loading state */}
              {loading && <ProcessingSteps inputType={inputType} />}

              {/* Empty state */}
              {!loading && !result && !error && <EmptyState />}

              {/* Results */}
              {result && meta && (
                <>
                  {/* Classification Card */}
                  <ClassificationCard meta={meta} score={score} />

                  {/* RAG Evidence Card */}
                  <EvidenceCard
                    sources={evidenceSources}
                    flaggedSources={flaggedSources}
                    onchainSources={onchainSources}
                    warnings={warnings}
                    onchain={onchain}
                    ocrText={result.ocr_text}
                    caption={result.caption}
                    visualSummary={result.visual_summary}
                  />

                  {/* AI Reasoning Card */}
                  <ReasoningCard verdict={verdict} />

                  {/* Blockchain Status Card */}
                  <BlockchainCard
                    classification={result.classification}
                    txHash={txHash}
                    txUrl={txUrl}
                    onchain={onchain}
                  />
                </>
              )}
            </div>
          </div>
        </main>
      </div>
    </MainComponent>
  );
};

/* ── Sub-components ────────────────────────────────────────────── */

const EmptyState = () => (
  <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-12 flex flex-col items-center justify-center text-center">
    <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 text-6xl mb-4">
      fact_check
    </span>
    <h3 className="text-lg font-bold text-slate-400 dark:text-slate-500 mb-2">
      বিশ্লেষণ শুরু করুন
    </h3>
    <p className="text-sm text-slate-400 dark:text-slate-500 max-w-sm">
      বামপাশে টেক্সট, URL, অথবা ইমেজ দিয়ে &quot;গভীর বিশ্লেষণ শুরু করুন&quot; বাটনে
      ক্লিক করুন।
    </p>
  </div>
);

function buildProcessingSteps(inputType) {
  const isImage = inputType === "image";
  const base = [
    {
      key: "validate",
      title: "ইনপুট যাচাই",
      detail: "কন্টেন্ট ফরম্যাট যাচাই করে প্রসেসিং প্রস্তুত করা হচ্ছে।",
      icon: "rule",
    },
    ...(isImage
      ? [
          {
            key: "vision_extract",
            title: "OCR / ক্যাপশন এক্সট্র্যাকশন",
            detail: "ইমেজ থেকে টেক্সট/অবজেক্ট তথ্য বের করা হচ্ছে।",
            icon: "text_snippet",
          },
        ]
      : [
          {
            key: "normalize",
            title: "ক্লেইম নরমালাইজেশন",
            detail: "প্রাসঙ্গিক বাক্যাংশ আলাদা করে বিশ্লেষণের জন্য প্রস্তুত করা হচ্ছে।",
            icon: "tune",
          },
        ]),
    {
      key: "rag_search",
      title: "RAG সোর্স খোঁজা",
      detail: "বিশ্বস্ত উৎস/প্রমাণ খুঁজে ক্রস-রেফারেন্স করা হচ্ছে।",
      icon: "travel_explore",
    },
    {
      key: "ai_reason",
      title: "এআই বিশ্লেষণ",
      detail: "বিশ্বাসযোগ্যতা স্কোর ও শ্রেণিবিভাগ নির্ণয় করা হচ্ছে।",
      icon: "psychology",
    },
    {
      key: "onchain",
      title: "ব্লকচেইন যাচাইকরণ",
      detail: "অন-চেইন রেকর্ড/রিপুটেশন ডেটা যাচাই করা হচ্ছে।",
      icon: "hub",
    },
    {
      key: "finalize",
      title: "রিপোর্ট প্রস্তুত",
      detail: "ফলাফল সাজিয়ে আপনার জন্য রিপোর্ট তৈরি করা হচ্ছে।",
      icon: "summarize",
    },
  ];

  return base;
}

const DEFAULT_TIPS = [
  "টিপস: URL দিলে সোর্স-চেক আরও দ্রুত হতে পারে।",
  "টিপস: একই খবর বিভিন্ন সাইটে থাকলে আমরা ক্রস-রেফারেন্স করি।",
  "টিপস: ইমেজ হলে OCR টেক্সট বের করতে কয়েক সেকেন্ড বেশি লাগতে পারে।",
  "গোপনীয়তা: আপনার ইনপুট শুধুমাত্র যাচাইয়ের জন্য ব্যবহৃত হচ্ছে।",
];

const ProcessingSteps = ({ inputType }) => {
  const steps = useMemo(() => buildProcessingSteps(inputType), [inputType]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
    setTipIndex(0);
  }, [inputType]);

  useEffect(() => {
    const stepMs = 3200;
    const tipMs = 5200;

    const stepInterval = window.setInterval(() => {
      setActiveIndex((cur) => Math.min(cur + 1, Math.max(0, steps.length - 1)));
    }, stepMs);

    const tipInterval = window.setInterval(() => {
      setTipIndex((cur) => (cur + 1) % DEFAULT_TIPS.length);
    }, tipMs);

    return () => {
      window.clearInterval(stepInterval);
      window.clearInterval(tipInterval);
    };
  }, [steps.length]);

  const activeStep = steps[Math.min(activeIndex, steps.length - 1)] || steps[0];
  const liveText = activeStep
    ? `ধাপ ${Math.min(activeIndex + 1, steps.length)} / ${steps.length}: ${activeStep.title}`
    : "বিশ্লেষণ চলছে";

  return (
    <section
      className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden"
      aria-label="Processing steps"
    >
      <div className="p-5 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center">
              <span className="absolute inline-flex h-9 w-9 rounded-full bg-primary/10 pulse-neon motion-reduce:animate-none" />
              <svg
                className="relative animate-spin motion-reduce:animate-none h-5 w-5 text-primary"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                />
              </svg>
            </div>
            <div className="min-w-0">
              <h3 className="font-black text-slate-900 dark:text-white tracking-tight">
                বিশ্লেষণ চলছে
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                সাধারণত 10–25 সেকেন্ড সময় লাগে (নেটওয়ার্ক/সোর্সের উপর নির্ভরশীল)।
              </p>
            </div>
          </div>

          <p className="sr-only" aria-live="polite">
            {liveText}
          </p>
        </div>

        <span className="text-[10px] font-black uppercase tracking-[0.28em] text-primary bg-primary/5 border border-primary/10 px-3 py-1.5 rounded-full shrink-0">
          LIVE
        </span>
      </div>

      <div className="p-5 sm:p-6">
        <ol className="space-y-4">
          {steps.map((s, idx) => {
            const state = idx < activeIndex ? "done" : idx === activeIndex ? "active" : "pending";
            const ring =
              state === "active"
                ? "ring-2 ring-neon-cyan/40 border-neon-cyan/30 bg-ice-blue/40 dark:bg-slate-800/60"
                : state === "done"
                  ? "border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20"
                  : "border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/30";

            const iconBg =
              state === "active"
                ? "bg-primary text-white shadow-lg shadow-primary/25"
                : state === "done"
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300";

            return (
              <li
                key={s.key}
                className={`flex items-start gap-4 p-4 rounded-2xl border ${ring} transition-colors`}
              >
                <div className="flex flex-col items-center gap-2">
                  <div className={`h-10 w-10 rounded-2xl flex items-center justify-center ${iconBg}`}>
                    <span className="material-symbols-outlined text-[20px]">
                      {state === "done" ? "check" : s.icon}
                    </span>
                  </div>
                  {idx !== steps.length - 1 && (
                    <div
                      className={`w-px flex-1 ${
                        idx < activeIndex ? "bg-emerald-300/70 dark:bg-emerald-800/60" : "bg-slate-200 dark:bg-slate-800"
                      }`}
                    />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-extrabold text-sm text-slate-900 dark:text-white truncate">
                      {s.title}
                    </p>
                    {state === "active" ? (
                      <span className="text-[10px] font-black uppercase tracking-[0.22em] text-neon-cyan">
                        Processing
                      </span>
                    ) : state === "done" ? (
                      <span className="text-[10px] font-black uppercase tracking-[0.22em] text-emerald-600">
                        Done
                      </span>
                    ) : (
                      <span className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">
                        Pending
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                    {idx === activeIndex ? s.detail : idx < activeIndex ? "সম্পন্ন হয়েছে।" : "শুরু হতে যাচ্ছে…"}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>

        <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 flex items-start gap-3">
          <span className="material-symbols-outlined text-neon-cyan mt-0.5">auto_awesome</span>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            {DEFAULT_TIPS[tipIndex]}
          </p>
        </div>
      </div>
    </section>
  );
};

const ClassificationCard = ({ meta, score }) => {
  const barColor =
    meta.color === "success"
      ? "bg-success"
      : meta.color === "danger"
        ? "bg-danger"
        : meta.color === "warning"
          ? "bg-warning"
          : "bg-slate-400";

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      <div className="p-6">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-1">
              বিশ্লেষণের ফলাফল
            </h3>
            <div className="flex items-center gap-3">
              <span className="text-3xl font-bold text-slate-900 dark:text-white">
                {meta.heading}
              </span>
              <span
                className={`px-3 py-1 bg-${meta.color}/10 text-${meta.color} text-xs font-bold rounded-full border border-${meta.color}/20 flex items-center gap-1`}
              >
                <span className="material-symbols-outlined text-sm">
                  {meta.icon}
                </span>{" "}
                {meta.label}
              </span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-4xl font-black text-primary">
              {score}%
            </span>
            <p className="text-xs font-medium text-slate-400 mt-1">
              নিশ্চয়তা স্কোর
            </p>
          </div>
        </div>
        <div className="w-full bg-slate-100 dark:bg-slate-800 h-3 rounded-full overflow-hidden">
          <div
            className={`${barColor} h-full rounded-full transition-all duration-700`}
            style={{ width: `${Math.min(score, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
};

const EvidenceCard = ({
  sources,
  flaggedSources,
  onchainSources,
  warnings,
  onchain,
  ocrText,
  caption,
  visualSummary,
}) => {
  const hasTextSources = sources && sources.length > 0;
  const hasImageInfo = ocrText || caption || visualSummary;
  const hasNoSourcesWarning =
    Array.isArray(warnings) && warnings.includes("no_sources_found");
  const hasNoFlaggedWarning =
    Array.isArray(warnings) && warnings.includes("no_flagged_sources_found");
  const hasNoRegisterableSourcesWarning =
    Array.isArray(warnings) && warnings.includes("no_sources_to_register");
  const skippedNoSources =
    onchain && typeof onchain === "object" && onchain.skipped === "no_sources";
  const hasFlaggedSources = Array.isArray(flaggedSources) && flaggedSources.length > 0;
  const hasOnchainSources = Array.isArray(onchainSources) && onchainSources.length > 0;

  if (!hasTextSources && !hasImageInfo && !hasFlaggedSources && !hasOnchainSources) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">source</span>
          <h3 className="font-bold">ক্রস-রেফারেন্সড প্রমাণ (RAG)</h3>
        </div>
        <div className="p-6 text-center text-sm text-slate-400">
          {hasNoSourcesWarning || skippedNoSources
            ? "কোনো উৎস খুঁজে পাওয়া যায়নি (সার্চ/API/নেটওয়ার্ক সমস্যা হতে পারে)।"
            : "কোনো প্রমাণ উৎস পাওয়া যায়নি।"}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
      <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <h3 className="font-bold flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">source</span>
          ক্রস-রেফারেন্সড প্রমাণ (RAG)
        </h3>
        {hasTextSources && (
          <span className="text-xs text-slate-400">
            {sources.length}টি উৎস পাওয়া গেছে
          </span>
        )}
      </div>

      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {(hasNoFlaggedWarning || hasNoRegisterableSourcesWarning || skippedNoSources) && (
          <div className="p-5">
            <div className="bg-warning/10 border border-warning/20 rounded-xl p-4 flex items-start gap-3">
              <span className="material-symbols-outlined text-warning mt-0.5">
                info
              </span>
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-slate-900 dark:text-white">
                  সোর্স ফ্ল্যাগ/অন-চেইন নিবন্ধন করা যায়নি
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                  {hasNoFlaggedWarning
                    ? "প্রমাণ পাওয়া গেলেও নির্দিষ্ট কোনো “মিথ্যা তথ্য ছড়ানোর উৎস” শনাক্ত/ফ্ল্যাগ করা যায়নি। সাধারণত URL/মূল সোর্স না থাকলে এমন হয়।"
                    : "নিবন্ধনের জন্য সোর্স তালিকা তৈরি করা যায়নি।"}
                </p>
              </div>
            </div>
          </div>
        )}

        {hasFlaggedSources && (
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-danger text-[18px]">
                  flag
                </span>
                ফ্ল্যাগড সোর্স (ভুল তথ্য ছড়ানোর সম্ভাব্য উৎস)
              </h4>
              <span className="text-xs text-slate-400">
                {flaggedSources.length}টি
              </span>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
              {flaggedSources.map((src, i) => (
                <EvidenceRow
                  key={`flagged-${i}`}
                  source={src.title || src.domain || src.url || `ফ্ল্যাগড উৎস ${i + 1}`}
                  url={src.url}
                  text={src.snippet || src.reason || ""}
                  date={null}
                />
              ))}
            </div>
          </div>
        )}

        {hasOnchainSources && (
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[18px]">
                  hub
                </span>
                অন-চেইন রেজিস্ট্রেশন টার্গেট সোর্স
              </h4>
              <span className="text-xs text-slate-400">
                {onchainSources.length}টি
              </span>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
              {onchainSources.map((src, i) => (
                <EvidenceRow
                  key={`onchain-${i}`}
                  source={src.title || src.domain || src.url || `সোর্স ${i + 1}`}
                  url={src.url}
                  text={src.snippet || ""}
                  date={null}
                />
              ))}
            </div>
          </div>
        )}

        {hasImageInfo && (
          <div className="p-5 flex flex-col gap-3">
            {ocrText && (
              <div>
                <span className="text-xs font-bold text-primary bg-primary/5 px-2 py-0.5 rounded">
                  OCR টেক্সট
                </span>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                  &ldquo;{ocrText}&rdquo;
                </p>
              </div>
            )}
            {caption && (
              <div>
                <span className="text-xs font-bold text-primary bg-primary/5 px-2 py-0.5 rounded">
                  ইমেজ ক্যাপশন
                </span>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                  &ldquo;{caption}&rdquo;
                </p>
              </div>
            )}
            {visualSummary && (
              <div>
                <span className="text-xs font-bold text-primary bg-primary/5 px-2 py-0.5 rounded">
                  ভিজ্যুয়াল সারাংশ
                </span>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                  {visualSummary}
                </p>
              </div>
            )}
          </div>
        )}

        {hasTextSources &&
          sources.map((src, i) => (
            <EvidenceRow
              key={i}
              source={src.title || src.url || `উৎস ${i + 1}`}
              url={src.url}
              text={src.snippet || ""}
              date={src.date}
            />
          ))}
      </div>
    </div>
  );
};

const EvidenceRow = ({ source, url, text, date }) => (
  <div className="p-5 flex flex-col gap-2">
    <div className="flex justify-between items-center">
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-bold text-primary bg-primary/5 px-2 py-0.5 rounded hover:underline"
        >
          {source}
        </a>
      ) : (
        <span className="text-xs font-bold text-primary bg-primary/5 px-2 py-0.5 rounded">
          {source}
        </span>
      )}
      {date && (
        <span className="text-[10px] text-slate-400 italic">{date}</span>
      )}
    </div>
    {text && (
      <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
        &ldquo;{text}&rdquo;
      </p>
    )}
  </div>
);

const ReasoningCard = ({ verdict }) => (
  <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
    <h3 className="font-bold mb-4 flex items-center gap-2">
      <span className="material-symbols-outlined text-primary">psychology</span>
      এআই রিজনিং ইঞ্জিন
    </h3>
    <p className="text-sm text-slate-600 dark:text-slate-400 leading-7 whitespace-pre-line">
      {verdict}
    </p>
  </div>
);

const BlockchainCard = ({ classification, txHash, txUrl, onchain }) => {
  const registered = !!txHash;
  const isClean = classification === "REAL";

  const borderColor = registered
    ? "border-l-primary"
    : isClean
      ? "border-l-success"
      : "border-l-slate-300 dark:border-l-slate-700";
  const iconBg = registered
    ? "bg-primary/10 text-primary"
    : isClean
      ? "bg-success/10 text-success"
      : "bg-slate-100 dark:bg-slate-800 text-slate-400";

  const publisherRep = onchain.publisher_reputation;
  const flagCount =
    publisherRep?.count ?? publisherRep?.urls?.length ?? null;

  return (
    <div
      className={`bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-l-4 ${borderColor}`}
    >
      <div className="flex items-center gap-4">
        <div
          className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${iconBg}`}
        >
          <span className="material-symbols-outlined">hub</span>
        </div>
        <div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            অপরিবর্তনীয় রেকর্ড স্ট্যাটাস
          </p>
          {registered ? (
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
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
            </h4>
          ) : isClean ? (
            <h4 className="text-sm font-semibold text-success">
              সত্যায়িত — অন-চেইন নিবন্ধন প্রয়োজন নেই
            </h4>
          ) : (
            <h4 className="text-sm font-semibold text-slate-500">
              অন-চেইন ডেটা পাওয়া যায়নি
            </h4>
          )}
        </div>
      </div>

      <div className="flex items-center gap-6">
        {flagCount !== null && (
          <div className="text-center">
            <p className="text-[10px] text-slate-400 uppercase">ফ্ল্যাগ সংখ্যা</p>
            <p className="text-xs font-bold">{flagCount}</p>
          </div>
        )}
        <div className="text-center">
          <p className="text-[10px] text-slate-400 uppercase">অখণ্ডতা</p>
          <span
            className={`material-symbols-outlined text-lg ${registered || isClean ? "text-success" : "text-slate-400"}`}
          >
            {registered || isClean ? "check_circle" : "pending"}
          </span>
        </div>
      </div>
    </div>
  );
};

export default FactCheck;
