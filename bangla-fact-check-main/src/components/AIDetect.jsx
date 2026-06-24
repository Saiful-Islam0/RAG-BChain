import React, { useRef, useState } from "react";
import MainComponent from "./MainComponent";

const VERDICT_META = {
  "AI-generated": { label: "সম্ভবত AI দ্বারা তৈরি", icon: "auto_awesome", tone: "danger" },
  "Deepfake detected": { label: "ডিপফেক সনাক্ত", icon: "face_retouching_off", tone: "danger" },
  "AI-generated + Deepfake": { label: "AI তৈরি + ডিপফেক", icon: "warning", tone: "danger" },
  "Likely authentic": { label: "সম্ভবত আসল", icon: "verified", tone: "success" },
  Inconclusive: { label: "অনিশ্চিত", icon: "help", tone: "warning" },
};

const TONE_CLASS = {
  success: "text-emerald-700 bg-emerald-100 border-emerald-300",
  warning: "text-amber-700 bg-amber-100 border-amber-300",
  danger: "text-red-700 bg-red-100 border-red-300",
};

const SCORE_CLASS = (score) => {
  if (score <= 0.3) return "text-emerald-700";
  if (score <= 0.7) return "text-amber-700";
  return "text-red-700";
};

const SCORE_BAR = (score) => {
  if (score <= 0.3) return "bg-emerald-400";
  if (score <= 0.7) return "bg-amber-400";
  return "bg-red-400";
};

function getVerdictMeta(v) {
  return VERDICT_META[v] || VERDICT_META.Inconclusive;
}

function frameAi(f) {
  return f?.type?.ai_generated ?? f?.ai_generated ?? 0;
}

function frameDeepfake(f) {
  return f?.type?.deepfake ?? f?.deepfake ?? 0;
}

function framePosition(f) {
  return f?.info?.position ?? f?.position ?? null;
}

const MetricTile = ({ label, value }) => {
  const pct = Math.round((value || 0) * 100);
  return (
    <div className="glass-soft rounded-xl p-4 transition-transform duration-300 hover:scale-[1.02]">
      <p className="text-[11px] uppercase tracking-widest text-slate-500 mb-1">{label}</p>
      <p className={`text-2xl font-black ${SCORE_CLASS(value || 0)}`}>{pct}%</p>
      <div className="h-1.5 rounded-full bg-slate-200 mt-2 overflow-hidden">
        <div
          className={`h-full transition-all duration-700 ease-out ${SCORE_BAR(value || 0)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

function RawResponseShell({ hasData, children, onCopy, copyLabel }) {
  return (
    <div className="glass-soft p-4 min-h-[200px] flex flex-col border border-dashed border-slate-200/80">
      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="text-xs uppercase tracking-widest text-slate-500 font-bold">Raw response</p>
        {hasData && (
          <button type="button" onClick={onCopy} className="text-[11px] font-bold text-primary hover:underline transition-opacity">
            {copyLabel}
          </button>
        )}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

function RawResponsePlaceholder() {
  return (
    <div className="rounded-xl bg-slate-100/60 border border-slate-200/80 p-4 space-y-3 animate-pulse">
      <div className="h-2.5 bg-slate-300/70 rounded w-3/4" />
      <div className="h-2.5 bg-slate-300/50 rounded w-full" />
      <div className="h-2.5 bg-slate-300/50 rounded w-5/6" />
      <div className="h-2.5 bg-slate-300/40 rounded w-2/3" />
      <div className="h-24 bg-slate-200/50 rounded-lg mt-4" />
    </div>
  );
}

function formatTs(ts) {
  if (ts == null) return "—";
  const n = Number(ts);
  if (Number.isNaN(n)) return String(ts);
  try {
    return new Date(n * 1000).toISOString();
  } catch {
    return String(ts);
  }
}

export default function AIDetect() {
  const [mode, setMode] = useState("image");
  const [imageInputMode, setImageInputMode] = useState("upload");
  const [urlValue, setUrlValue] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [videoFile, setVideoFile] = useState(null);
  const [videoName, setVideoName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [copyOk, setCopyOk] = useState(false);
  const imageInputRef = useRef(null);
  const videoInputRef = useRef(null);

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
      setResult(null);
      setError(null);
    }
  };

  const handleImageDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
      setResult(null);
      setError(null);
    }
  };

  const handleVideoChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 50 * 1024 * 1024) {
        setError("ভিডিও ফাইল সর্বোচ্চ ৫০ MB হতে পারে।");
        return;
      }
      setVideoFile(file);
      setVideoName(file.name);
      setResult(null);
      setError(null);
    }
  };

  const handleVideoDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("video/")) {
      if (file.size > 50 * 1024 * 1024) {
        setError("ভিডিও ফাইল সর্বোচ্চ ৫০ MB হতে পারে।");
        return;
      }
      setVideoFile(file);
      setVideoName(file.name);
      setResult(null);
      setError(null);
    }
  };

  const handleSubmit = async () => {
    setError(null);
    setResult(null);
    setLoading(true);

    try {
      let res;

      if (mode === "image") {
        if (imageInputMode === "url") {
          const url = urlValue.trim();
          if (!url) {
            setError("অনুগ্রহ করে একটি ইমেজ URL দিন।");
            setLoading(false);
            return;
          }
          res = await fetch("/api/detect/image-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
          });
        } else {
          if (!imageFile) {
            setError("অনুগ্রহ করে একটি ইমেজ আপলোড করুন।");
            setLoading(false);
            return;
          }
          const formData = new FormData();
          formData.append("file", imageFile);
          res = await fetch("/api/detect/image", {
            method: "POST",
            body: formData,
          });
        }
      } else {
        if (!videoFile) {
          setError("অনুগ্রহ করে একটি ভিডিও ফাইল আপলোড করুন।");
          setLoading(false);
          return;
        }
        const formData = new FormData();
        formData.append("file", videoFile);
        res = await fetch("/api/detect/video", {
          method: "POST",
          body: formData,
        });
      }

      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.detail || `Server error (${res.status})`);
      }

      const data = await res.json();
      const provider =
        data.sightengine ?? data.sightEngine ?? data.raw_response ?? data.rawResponse ?? null;
      const stripKeys = new Set(["sightengine", "sightEngine", "raw_response", "rawResponse"]);
      const rest = Object.fromEntries(Object.entries(data).filter(([k]) => !stripKeys.has(k)));
      const rawPayload = provider != null ? provider : data;
      setResult({ ...rest, rawResponse: rawPayload, scanMode: mode });
    } catch (err) {
      setError(err.message || "কিছু সমস্যা হয়েছে। আবার চেষ্টা করুন।");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setUrlValue("");
    setImageFile(null);
    setImagePreview(null);
    setVideoFile(null);
    setVideoName("");
    setResult(null);
    setError(null);
    setCopyOk(false);
    if (imageInputRef.current) imageInputRef.current.value = "";
    if (videoInputRef.current) videoInputRef.current.value = "";
  };

  const copyRawResponse = async () => {
    if (!result?.rawResponse) return;
    const text = JSON.stringify(result.rawResponse, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopyOk(true);
      setTimeout(() => setCopyOk(false), 2000);
    } catch {
      setCopyOk(false);
    }
  };

  const apiPayload = result?.rawResponse;
  const showProviderFields =
    apiPayload &&
    typeof apiPayload === "object" &&
    apiPayload.status === "success" &&
    (apiPayload.request != null ||
      apiPayload.media != null ||
      apiPayload.type != null ||
      apiPayload.data != null);
  const meta = result
    ? getVerdictMeta(
        result.scanMode === "video" ? result.summary?.verdict : result.verdict,
      )
    : null;

  return (
    <MainComponent>
      <div className="glass-page min-h-screen text-slate-800 font-display">
        <main className="max-w-7xl mx-auto px-4 md:px-10 py-10 relative z-10">
          <section className="glass-card p-6 md:p-8 mb-6">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
              <h1 className="text-4xl md:text-5xl font-black text-primary headline-spacing uppercase">
                AI Detection Lab
              </h1>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[1fr_minmax(280px,420px)] gap-6">
              <div className="space-y-5">
                <div className="glass-soft p-5">
                  <div className="flex glass-card p-1 mb-4 max-w-xs">
                    {["image", "video"].map((m) => (
                      <button
                        key={m}
                        onClick={() => {
                          setMode(m);
                          setError(null);
                          setResult(null);
                        }}
                        className={`flex-1 rounded-lg py-2 text-xs font-black uppercase tracking-widest transition-colors ${
                          mode === m ? "bg-primary text-white" : "text-slate-500 hover:text-primary"
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>

                  {mode === "image" && (
                    <>
                      <div className="flex glass-card p-1 mb-4 max-w-xs">
                        {["upload", "url"].map((sub) => (
                          <button
                            key={sub}
                            onClick={() => setImageInputMode(sub)}
                            className={`flex-1 rounded-lg py-2 text-[11px] font-black uppercase tracking-widest transition-colors ${
                              imageInputMode === sub ? "bg-primary text-white" : "text-slate-500 hover:text-primary"
                            }`}
                          >
                            {sub}
                          </button>
                        ))}
                      </div>
                      {imageInputMode === "url" ? (
                        <input
                          type="url"
                          value={urlValue}
                          onChange={(e) => setUrlValue(e.target.value)}
                          placeholder="https://example.com/image.jpg"
                          className="w-full h-14 px-4 rounded-xl bg-white/70 border border-white/80 outline-none focus:border-neon-cyan"
                        />
                      ) : (
                        <div
                          className="h-44 rounded-xl border-2 border-dashed border-primary/20 bg-white/45 flex items-center justify-center cursor-pointer"
                          onClick={() => imageInputRef.current?.click()}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={handleImageDrop}
                        >
                          <input
                            ref={imageInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleImageChange}
                          />
                          {imagePreview ? (
                            <img src={imagePreview} alt="preview" className="max-h-36 object-contain rounded-lg" />
                          ) : (
                            <p className="text-slate-500 text-sm font-medium">Drop or upload image</p>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {mode === "video" && (
                    <div
                      className="h-44 rounded-xl border-2 border-dashed border-primary/20 bg-white/45 flex items-center justify-center cursor-pointer"
                      onClick={() => videoInputRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={handleVideoDrop}
                    >
                      <input
                        ref={videoInputRef}
                        type="file"
                        accept="video/*"
                        className="hidden"
                        onChange={handleVideoChange}
                      />
                      <p className="text-slate-500 text-sm font-medium">{videoName || "Drop or upload video (max 50MB)"}</p>
                    </div>
                  )}

                  <div className="flex gap-3 mt-5">
                    <button onClick={handleSubmit} disabled={loading} className="glass-btn-primary h-12 px-6 disabled:opacity-60">
                      {loading ? "Analyzing..." : "Run Detection"}
                    </button>
                    <button onClick={handleClear} className="glass-btn-outline h-12 px-6">
                      Reset
                    </button>
                  </div>
                </div>

                {error && <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

                {loading && (
                  <div className="glass-soft p-8 animate-pulse">
                    <div className="h-5 w-44 bg-slate-200 rounded mb-4" />
                    <div className="h-24 bg-slate-200 rounded" />
                  </div>
                )}

                {result && meta && (
                  <>
                    <div className="glass-soft p-5 ai-detect-enter">
                      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                        <span className={`text-xs border rounded-full px-3 py-1 font-bold ${TONE_CLASS[meta.tone]}`}>{meta.label}</span>
                        <span className="text-xs text-slate-500 uppercase tracking-widest">সারসংক্ষেপ</span>
                      </div>
                      {result.scanMode === "image" ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 ai-detect-enter-stagger">
                          <MetricTile label="AI generated" value={result.ai_generated} />
                          <MetricTile label="Deepfake" value={result.deepfake} />
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 ai-detect-enter-stagger">
                          <MetricTile label="AI Avg" value={result.summary.ai_generated_avg} />
                          <MetricTile label="AI Max" value={result.summary.ai_generated_max} />
                          <MetricTile label="DF Avg" value={result.summary.deepfake_avg} />
                          <MetricTile label="DF Max" value={result.summary.deepfake_max} />
                        </div>
                      )}
                    </div>

                    {showProviderFields && (
                      <div className="glass-soft p-5 space-y-3 ai-detect-enter">
                        <p className="text-sm font-bold text-primary uppercase tracking-widest">Response fields</p>
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm ai-detect-enter-stagger">
                          <div className="mono-chip rounded-lg p-3 transition-shadow hover:shadow-md duration-300">
                            <dt className="text-[10px] uppercase tracking-wider text-slate-500">status</dt>
                            <dd className="font-mono font-semibold mt-0.5">{apiPayload.status ?? "—"}</dd>
                          </div>
                          <div className="mono-chip rounded-lg p-3 transition-shadow hover:shadow-md duration-300">
                            <dt className="text-[10px] uppercase tracking-wider text-slate-500">request.id</dt>
                            <dd className="font-mono text-xs break-all mt-0.5">{apiPayload.request?.id ?? "—"}</dd>
                          </div>
                          <div className="mono-chip rounded-lg p-3 transition-shadow hover:shadow-md duration-300">
                            <dt className="text-[10px] uppercase tracking-wider text-slate-500">request.timestamp</dt>
                            <dd className="font-mono text-xs mt-0.5">{formatTs(apiPayload.request?.timestamp)}</dd>
                          </div>
                          <div className="mono-chip rounded-lg p-3 transition-shadow hover:shadow-md duration-300">
                            <dt className="text-[10px] uppercase tracking-wider text-slate-500">request.operations</dt>
                            <dd className="font-mono font-semibold mt-0.5">{apiPayload.request?.operations ?? "—"}</dd>
                          </div>
                          <div className="mono-chip rounded-lg p-3 sm:col-span-2 transition-shadow hover:shadow-md duration-300">
                            <dt className="text-[10px] uppercase tracking-wider text-slate-500">media</dt>
                            <dd className="font-mono text-xs break-all mt-0.5">
                              id: {apiPayload.media?.id ?? "—"}
                              {apiPayload.media?.uri ? (
                                <>
                                  <br />
                                  <span className="text-slate-600">uri: {apiPayload.media.uri}</span>
                                </>
                              ) : null}
                            </dd>
                          </div>
                          {apiPayload.type && (
                            <div className="mono-chip rounded-lg p-3 sm:col-span-2 transition-shadow hover:shadow-md duration-300">
                              <dt className="text-[10px] uppercase tracking-wider text-slate-500">type</dt>
                              <dd className="font-mono text-xs mt-1 whitespace-pre-wrap">{JSON.stringify(apiPayload.type, null, 2)}</dd>
                            </div>
                          )}
                          {result.scanMode === "video" && apiPayload.data != null && (
                            <div className="mono-chip rounded-lg p-3 sm:col-span-2 transition-shadow hover:shadow-md duration-300">
                              <dt className="text-[10px] uppercase tracking-wider text-slate-500">data</dt>
                              <dd className="font-mono text-xs mt-1">
                                frames: {Array.isArray(apiPayload.data.frames) ? apiPayload.data.frames.length : "—"}
                                {apiPayload.data.duration != null && (
                                  <>
                                    <br />
                                    duration: {String(apiPayload.data.duration)}
                                  </>
                                )}
                              </dd>
                            </div>
                          )}
                        </dl>
                      </div>
                    )}

                    {result.scanMode === "video" && result.frames?.length > 0 && (
                      <div className="glass-soft p-5 space-y-4 ai-detect-enter">
                        <p className="text-sm font-bold mb-1 text-primary uppercase tracking-widest">Frame timeline · AI generated</p>
                        <div className="flex items-end gap-0.5 h-28 overflow-x-auto pb-1">
                          {result.frames.slice(0, 120).map((f, i) => (
                            <div
                              key={i}
                              title={`#${i + 1} pos ${framePosition(f) ?? "?"} · AI ${(frameAi(f) * 100).toFixed(1)}%`}
                              className="flex-1 min-w-[3px] max-w-[8px] rounded-t bg-primary/40 origin-bottom transition-transform duration-300 hover:scale-y-110"
                              style={{ height: `${Math.max(4, Math.round(frameAi(f) * 100))}%` }}
                            />
                          ))}
                        </div>
                        <div className="overflow-x-auto max-h-72 border border-white/60 rounded-xl">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-white/70 sticky top-0">
                              <tr className="text-slate-500 uppercase tracking-wider">
                                <th className="p-2 font-bold">#</th>
                                <th className="p-2 font-bold">position</th>
                                <th className="p-2 font-bold">ai_generated</th>
                                <th className="p-2 font-bold">deepfake</th>
                              </tr>
                            </thead>
                            <tbody>
                              {result.frames.map((f, i) => (
                                <tr key={i} className="border-t border-white/50 hover:bg-white/30">
                                  <td className="p-1.5 font-mono">{i + 1}</td>
                                  <td className="p-1.5 font-mono">{framePosition(f) ?? "—"}</td>
                                  <td className="p-1.5 font-mono">{frameAi(f).toFixed(4)}</td>
                                  <td className="p-1.5 font-mono">{frameDeepfake(f).toFixed(4)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
                <RawResponseShell
                  hasData={!!result}
                  onCopy={copyRawResponse}
                  copyLabel={copyOk ? "Copied" : "Copy"}
                >
                  {!result ? (
                    <RawResponsePlaceholder />
                  ) : (
                    <pre className="text-[10px] leading-relaxed font-mono bg-slate-900/90 text-emerald-100/95 p-3 rounded-xl overflow-auto max-h-[min(70vh,560px)] whitespace-pre-wrap break-all border border-slate-700/60 ai-detect-enter">
                      {JSON.stringify(result.rawResponse ?? {}, null, 2)}
                    </pre>
                  )}
                </RawResponseShell>
              </aside>
            </div>
          </section>
        </main>
      </div>
    </MainComponent>
  );
}
