import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import MainComponent from "./MainComponent";
import { buildTxExplorerUrl } from "../utils/blockchainExplorer";

const HERO_VIDEO = "/hero-video.mp4";

const STYLE_BY_CLASS = {
  REAL: "text-emerald-700 bg-emerald-100 border-emerald-300",
  FAKE: "text-red-700 bg-red-100 border-red-300",
  MISINFORMATION: "text-amber-700 bg-amber-100 border-amber-300",
  MISLEADING: "text-amber-700 bg-amber-100 border-amber-300",
  UNSURE: "text-slate-600 bg-slate-100 border-slate-300",
};

function relativeTime(isoString) {
  if (!isoString) return "";
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "এইমাত্র";
  if (mins < 60) return `${mins} মিনিট আগে`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ঘণ্টা আগে`;
  const days = Math.floor(hrs / 24);
  return `${days} দিন আগে`;
}

const TRENDING_AUTO_MS = 3800;

/** How many cards are visible at once (4–5 on desktop). */
function visibleCountForWidth(w) {
  if (w >= 1200) return 5;
  if (w >= 900) return 4;
  if (w >= 640) return 3;
  if (w >= 420) return 2;
  return 1;
}

/** Last slide index so the strip actually moves (incl. when count ≤ visible). */
function maxSlideIndex(slideCount, visible) {
  if (slideCount < 2 || visible < 1) return 0;
  if (slideCount > visible) return slideCount - visible;
  return slideCount - 1;
}

const CAROUSEL_FALLBACK_CARD_PX = 272;

function BreakingNewsCarousel({ items, styleByClass, relativeTime }) {
  const viewportRef = useRef(null);
  const [layout, setLayout] = useState({ cardW: 0, step: 0, gap: 16, visible: 5 });
  const [slide, setSlide] = useState(0);

  const slideCount = items.length;

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    const measure = () => {
      const w = el.getBoundingClientRect().width || el.clientWidth;
      if (w < 1) return;
      const gap = 16;
      const visible = visibleCountForWidth(w);
      const cardW = (w - gap * Math.max(0, visible - 1)) / visible;
      setLayout({ cardW, step: cardW + gap, gap, visible });
    };
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    const t0 = requestAnimationFrame(() => measure());
    const t1 = window.setTimeout(measure, 50);
    const t2 = window.setTimeout(measure, 250);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(t0);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [items.length]);

  const gap = layout.gap;
  const cw = layout.cardW > 0 ? layout.cardW : CAROUSEL_FALLBACK_CARD_PX;
  const stepPx = layout.step > 0 ? layout.step : cw + gap;
  const visibleForSlide = layout.visible > 0 ? layout.visible : 5;

  useEffect(() => {
    if (slideCount < 2 || stepPx <= 0) return undefined;
    const maxS = maxSlideIndex(slideCount, visibleForSlide);
    if (maxS < 1) return undefined;
    const id = window.setInterval(() => {
      setSlide((s) => {
        const max = maxSlideIndex(slideCount, visibleForSlide);
        if (max < 1) return 0;
        const cur = Math.min(s, max);
        return cur >= max ? 0 : cur + 1;
      });
    }, TRENDING_AUTO_MS);
    return () => window.clearInterval(id);
  }, [slideCount, stepPx, visibleForSlide]);

  if (items.length === 0) {
    return (
      <div className="glass-soft p-5 text-sm text-slate-500">
        No breaking news yet. Run a fact check to populate the feed.
      </div>
    );
  }

  const maxS = maxSlideIndex(slideCount, visibleForSlide);
  const safeSlide = Math.min(slide, maxS);
  const offsetPx = safeSlide * stepPx;

  return (
    <div
      ref={viewportRef}
      className="relative w-full overflow-hidden py-1 px-0.5"
      aria-label="Breaking news carousel"
    >
      <div
        className="flex flex-nowrap will-change-transform"
        style={{
          gap,
          transform: `translate3d(${-offsetPx}px, 0, 0)`,
          transition: "transform 0.65s cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        {items.map((item) => (
          <div
            key={item.claim_id}
            className="shrink-0 box-border"
            style={{
              flex: "0 0 auto",
              width: cw,
              minWidth: cw,
              maxWidth: cw,
            }}
          >
            <Link
              to={`/claim/${item.claim_id}`}
              className="relative flex flex-col h-full w-full min-w-0 max-w-full min-h-[176px] pl-5 pr-5 py-6 md:pl-6 md:pr-6 md:py-7 rounded-2xl border border-slate-200/95 border-l-[5px] border-l-red-600 bg-white/95 backdrop-blur-md shadow-md shadow-slate-900/5 hover:border-l-red-500 hover:shadow-lg hover:shadow-slate-900/10 transition-all duration-300 group overflow-hidden box-border"
            >
              <div className="absolute top-3 right-3 flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600" />
                </span>
                <span className="text-[8px] font-black text-red-700 uppercase tracking-widest">Live</span>
              </div>
              <div className="flex items-center justify-between mb-3 gap-2 pr-14">
                <span
                  className={`px-3 py-1.5 text-[9px] rounded-full font-black uppercase tracking-widest border shrink-0 shadow-sm ${
                    styleByClass[item.classification] || styleByClass.UNSURE
                  }`}
                >
                  {item.classification || "UNSURE"}
                </span>
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest whitespace-nowrap">
                  {relativeTime(item.latest_timestamp)}
                </span>
              </div>
              <p className="text-sm text-slate-800 leading-relaxed line-clamp-3 group-hover:text-primary transition-colors flex-1">
                {item.claim_text}
              </p>
              <div className="mt-5 pt-4 border-t border-slate-200/80 flex items-center justify-between text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                <span>checks: {item.check_count || 1}</span>
                <span className="text-primary group-hover:translate-x-0.5 inline-block transition-transform">
                  OPEN →
                </span>
              </div>
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

const SuiteCard = ({ icon, title, description, tone }) => (
  <div className={`holographic-card p-8 transition-all duration-300 ${tone}`}>
    <div className="w-14 h-14 mb-6 rounded-xl bg-ice-blue border border-neon-cyan/20 flex items-center justify-center text-primary">
      <span className="material-symbols-outlined text-2xl">{icon}</span>
    </div>
    <h3 className="text-slate-900 font-extrabold text-lg uppercase headline-spacing mb-3">{title}</h3>
    <p className="text-slate-500 text-sm leading-relaxed">{description}</p>
    <div className="mt-6 flex items-center gap-2">
      <span className="neon-bullet" />
      <span className="text-[10px] font-bold text-primary uppercase tracking-widest">Active</span>
    </div>
  </div>
);

export default function Home() {
  const [breakingFeed, setBreakingFeed] = useState([]);
  const [ledgerState, setLedgerState] = useState({
    blockLabel: "BLOCK_PENDING",
    status: "WAITING_FOR_TX",
    txHash: null,
    reputationScore: 0,
    recordsCount: 0,
    explorerUrl: null,
  });

  useEffect(() => {
    fetch("/api/claims/breaking?limit=28")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => Array.isArray(data) && setBreakingFeed(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/claims/recent")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!Array.isArray(data) || data.length === 0) return;
        const latestOnchainClaim = data.find((claim) => {
          const onchain = claim?.onchain || claim?.onchain_metadata || {};
          return Boolean(onchain?.registration?.tx_hash || onchain?.tx_hash);
        });
        if (!latestOnchainClaim) return;

        const onchain = latestOnchainClaim?.onchain || latestOnchainClaim?.onchain_metadata || {};
        const txHash = onchain?.registration?.tx_hash || onchain?.tx_hash || null;
        const recordCount = Number(onchain?.publisher_reputation?.count || 0);
        // Simple trust score: more flagged records -> lower score.
        const reputationScore = Math.max(5, Math.min(100, 100 - recordCount * 15));
        const blockLabel = txHash
          ? `BLOCK_${txHash.slice(2, 8).toUpperCase()}`
          : "BLOCK_PENDING";
        const explorerUrl = buildTxExplorerUrl(txHash);

        setLedgerState({
          blockLabel,
          status: txHash ? "CONFIRMED" : "WAITING_FOR_TX",
          txHash,
          reputationScore,
          recordsCount: recordCount,
          explorerUrl,
        });
      })
      .catch(() => {});
  }, []);

  return (
    <MainComponent>
      <div className="glass-page text-slate-800 font-display antialiased overflow-x-hidden relative">

        <main className="relative z-10">
          <section className="relative pt-6 pb-10 px-4 md:px-10 overflow-hidden">
            <div className="max-w-7xl mx-auto relative h-[360px] md:h-[520px] lg:h-[620px] w-full overflow-hidden rounded-2xl">
              <video
                className="absolute inset-0 w-full h-full object-cover"
                src={HERO_VIDEO}
                autoPlay
                muted
                loop
                playsInline
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#f0f7ff]/35 via-transparent to-[#f0f7ff]/35 dark:from-[#0c1a31]/20 dark:to-[#0c1a31]/20" />
              <div className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-[#f0f7ff]/95 via-[#f0f7ff]/70 to-transparent dark:from-[#0c1a31]/95 dark:via-[#0c1a31]/70" />
              <div className="absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-[#f0f7ff]/95 via-[#f0f7ff]/70 to-transparent dark:from-[#0c1a31]/95 dark:via-[#0c1a31]/70" />
              <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#f0f7ff] to-transparent dark:from-[#0c1a31]" />
              <div className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-[#f0f7ff]/95 via-[#f0f7ff]/60 to-transparent dark:from-[#0c1a31]/95 dark:via-[#0c1a31]/60" />

              <div className="absolute inset-0 z-20 flex items-end justify-center px-5 md:px-10 pb-2 md:pb-5 lg:pb-7">
                <div className="space-y-6 text-center max-w-3xl">
                  <div className="inline-flex items-center gap-3 px-4 py-2 rounded-full glass-card border-neon-cyan/20 text-primary text-[10px] font-bold uppercase tracking-[0.2em]">
                    <span className="neon-bullet" />
                    Quantum AI Verification Engine
                  </div>
                  <h1 className="text-3xl md:text-5xl lg:text-6xl font-black leading-[1.1] text-slate-900 headline-spacing">
                    <span className="font-bengali block mb-2 text-primary">সত্যতা যাচাই করুন</span>
                    VERIFY TRUTH <br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-neon-cyan">INSTANTLY</span>
                  </h1>
                  <p className="text-sm md:text-base text-slate-600 font-medium max-w-2xl mx-auto leading-relaxed">
                    Advanced glass-lattice AI algorithms and immutable blockchain ledgers deliver high precision in detecting synthetic media and systemic disinformation.
                  </p>
                  <div className="flex flex-wrap gap-3 justify-center pt-1">
                    <Link to="/fact-check" className="glass-btn-primary h-12 md:h-14 px-7 md:px-10 flex items-center gap-2 md:gap-3">
                      <span className="material-symbols-outlined text-neon-cyan">security</span>
                      Start Analysis
                    </Link>
                    <Link to="/detect" className="glass-btn-outline glass-card h-12 md:h-14 px-7 md:px-10 flex items-center gap-2 md:gap-3">
                      <span className="material-symbols-outlined">center_focus_weak</span>
                      AI Detection
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="py-20 px-4 md:px-10">
            <div className="max-w-7xl mx-auto glass-card overflow-hidden border-white/60 ring-1 ring-red-600/10">

              <div className="flex items-center justify-between border-b border-red-600/15 px-6 py-5 bg-gradient-to-r from-red-600/10 via-white/35 to-white/30">
                <h3 className="text-xl font-black text-slate-900 flex items-center gap-3 headline-spacing uppercase">
                  <span className="flex items-center justify-center size-10 rounded-xl bg-red-600 text-white shadow-lg shadow-red-600/25">
                    <span className="material-symbols-outlined text-[22px]">newspaper</span>
                  </span>
                  <span className="flex flex-col items-start leading-tight">
                    <span className="text-xs font-black text-red-700 uppercase tracking-[0.25em]">Live feed</span>
                    <span className="text-primary">Breaking News</span>
                  </span>
                </h3>
                <Link to="/fact-check" className="text-[10px] font-black uppercase tracking-[0.2em] text-primary hover:text-neon-cyan transition-colors">
                  Live View
                </Link>
              </div>

              <div className="p-6 md:p-8 bg-gradient-to-b from-white/25 to-transparent">
                <BreakingNewsCarousel
                  items={breakingFeed}
                  styleByClass={STYLE_BY_CLASS}
                  relativeTime={relativeTime}
                />
              </div>
            </div>
          </section>

          <section className="py-20 px-4 md:px-10 bg-ice-blue/20">
            <div className="max-w-7xl mx-auto">
              <div>
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-2xl font-black headline-spacing text-primary uppercase flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">deployed_code</span>
                    Ledger State
                  </h2>
                </div>
                <div className="max-w-4xl mx-auto glass-card bg-primary p-10 text-white relative overflow-hidden shadow-2xl border-none">
                  <div className="relative z-10">
                    <div className="flex items-center gap-5 mb-8">
                      <div className="size-14 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20">
                        <span className="material-symbols-outlined text-neon-cyan text-3xl">terminal</span>
                      </div>
                      <div>
                        <h3 className="font-bold headline-spacing text-lg uppercase tracking-widest">Blockchain Node</h3>
                        <p className="text-xs text-white/60 uppercase tracking-[0.2em]">{ledgerState.status}</p>
                      </div>
                    </div>
                    <div className="space-y-5">
                      <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                        <p className="text-[9px] font-black text-white/40 uppercase tracking-[0.3em] mb-3">Master Hash</p>
                        <p className="font-mono text-xs text-neon-cyan truncate bg-black/20 p-3 rounded-xl border border-white/5 break-all">
                          {ledgerState.txHash || "Not available yet"}
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-5">
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                          <p className="text-[9px] font-black text-white/40 uppercase tracking-[0.3em] mb-2">Trust Score</p>
                          <p className="text-4xl font-black text-white">
                            {ledgerState.reputationScore}
                            <span className="text-xs text-white/40 font-bold">/100</span>
                          </p>
                          <div className="h-1 w-full bg-white/15 mt-2 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-neon-cyan"
                              style={{ width: `${ledgerState.reputationScore}%` }}
                            />
                          </div>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                          <p className="text-[9px] font-black text-white/40 uppercase tracking-[0.3em] mb-2">Validations</p>
                          <p className="text-4xl font-black text-white">
                            {ledgerState.recordsCount}
                            <span className="text-xs text-neon-cyan font-bold"> Nodes</span>
                          </p>
                        </div>
                      </div>
                    </div>
                    <a
                      href={ledgerState.explorerUrl || undefined}
                      target={ledgerState.explorerUrl ? "_blank" : undefined}
                      rel={ledgerState.explorerUrl ? "noopener noreferrer" : undefined}
                      className={`w-full mt-9 bg-white text-primary text-[10px] font-black uppercase tracking-[0.3em] py-5 rounded-2xl transition-all flex items-center justify-center gap-2 ${
                        ledgerState.explorerUrl
                          ? "hover:bg-neon-cyan"
                          : "opacity-60 cursor-not-allowed"
                      }`}
                      onClick={(e) => {
                        if (!ledgerState.explorerUrl) e.preventDefault();
                      }}
                    >
                      Explore Chain
                      <span className="material-symbols-outlined text-sm">arrow_forward</span>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="py-24 px-4 md:px-10">
            <div className="max-w-7xl mx-auto">
              <div className="text-center mb-16">
                <h2 className="text-4xl font-black headline-spacing text-primary uppercase mb-4">Protocol Capability</h2>
                <div className="w-24 h-1.5 bg-neon-cyan mx-auto rounded-full mb-6" />
                <p className="text-slate-500 font-medium max-w-2xl mx-auto">Multimodal detection across the digital spectrum.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                <SuiteCard icon="barcode_scanner" title="Neural OCR" description="Deconstructing visual text data using proprietary glass-lattice models." tone="hover:border-neon-cyan/40" />
                <SuiteCard icon="travel_explore" title="Source Map" description="Deep-web tracking to locate the genesis of manipulated narratives." tone="hover:border-neon-cyan/40" />
                <SuiteCard icon="psychology" title="Deepfake AI" description="Identifying synthetic facial synthesis and generative artifacts." tone="hover:border-neon-cyan/40" />
                <SuiteCard icon="account_tree" title="Chain Proof" description="Verifiable truth hashes recorded on decentralized infrastructure." tone="hover:border-neon-cyan/40" />
              </div>
            </div>
          </section>
        </main>
      </div>
    </MainComponent>
  );
}
