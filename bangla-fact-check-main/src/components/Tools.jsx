import React, { useState, useRef } from "react";
import MainComponent from "./MainComponent";

const SEARCH_ENGINES = [
  {
    id: "google_lens",
    label: "Google Lens",
    icon: "search",
    color: "bg-blue-600 hover:bg-blue-700",
    description: "ভিজ্যুয়াল ম্যাচ ও তথ্য খুঁজুন",
  },
  {
    id: "google_images",
    label: "Google Images",
    icon: "image_search",
    color: "bg-red-500 hover:bg-red-600",
    description: "ওয়েবে একই ছবি খুঁজুন",
  },
  {
    id: "tineye",
    label: "TinEye",
    icon: "visibility",
    color: "bg-teal-600 hover:bg-teal-700",
    description: "ছবির উৎস ও ব্যবহার ট্র্যাক করুন",
  },
  {
    id: "yandex",
    label: "Yandex Images",
    icon: "travel_explore",
    color: "bg-amber-600 hover:bg-amber-700",
    description: "বিকল্প রিভার্স ইমেজ সার্চ",
  },
];

const Tools = () => {
  const [activeTool, setActiveTool] = useState("reverse");
  const [inputMode, setInputMode] = useState("url");
  const [urlValue, setUrlValue] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchUrls, setSearchUrls] = useState(null);
  const [publicUrl, setPublicUrl] = useState(null);
  const [metadataResult, setMetadataResult] = useState(null);
  const fileInputRef = useRef(null);

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
      setSearchUrls(null);
      setMetadataResult(null);
      setError(null);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
      setSearchUrls(null);
      setMetadataResult(null);
      setError(null);
    }
  };

  const handleSubmit = async () => {
    setError(null);
    setSearchUrls(null);
    setPublicUrl(null);
    setMetadataResult(null);
    setLoading(true);

    try {
      let res;

      if (inputMode === "url") {
        const url = urlValue.trim();
        if (!url) {
          setError("অনুগ্রহ করে একটি ইমেজ URL দিন।");
          setLoading(false);
          return;
        }
        const endpoint =
          activeTool === "reverse"
            ? "/api/tools/reverse-image-search-url"
            : "/api/tools/image-metadata-url";
        res = await fetch(
          endpoint,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
          }
        );
      } else {
        if (!imageFile) {
          setError("অনুগ্রহ করে একটি ইমেজ আপলোড করুন।");
          setLoading(false);
          return;
        }
        const formData = new FormData();
        formData.append("file", imageFile);
        const endpoint =
          activeTool === "reverse"
            ? "/api/tools/reverse-image-upload"
            : "/api/tools/image-metadata-upload";
        res = await fetch(
          endpoint,
          {
            method: "POST",
            body: formData,
          }
        );
      }

      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.detail || `Server error (${res.status})`);
      }

      const data = await res.json();
      if (activeTool === "reverse") {
        setPublicUrl(data.url);
        setSearchUrls(data.search_urls);
      } else {
        setMetadataResult(data);
      }
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
    setSearchUrls(null);
    setPublicUrl(null);
    setMetadataResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <MainComponent>
      <div className="glass-page min-h-screen text-slate-800 font-display">
        <main className="max-w-[1440px] mx-auto p-8">
          <div className="mb-8">
            <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white">
              অন্যান্য টুলস
            </h1>
            <p className="text-slate-500 dark:text-slate-400 mt-2 text-lg">
              ফেক নিউজ শনাক্তকরণে সহায়ক অতিরিক্ত টুল সমূহ।
            </p>
          </div>

          <div className="flex flex-col lg:flex-row gap-8">
            {/* Left Column: Input */}
            <aside className="w-full lg:w-[420px] shrink-0">
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 sticky top-24">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <span className="material-symbols-outlined text-primary">
                      image_search
                    </span>
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                      {activeTool === "reverse"
                        ? "রিভার্স ইমেজ সার্চ"
                        : "ইমেজ মেটাডাটা ডিটেকশন"}
                    </h2>
                    <p className="text-xs text-slate-400">
                      {activeTool === "reverse"
                        ? "Google Lens ও অন্যান্য ইঞ্জিনে ছবি অনুসন্ধান"
                        : "ইমেজ থেকে মেটাডাটা, হ্যাশ ও OCR তথ্য বের করুন"}
                    </p>
                  </div>
                </div>

                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg mb-4">
                  {[
                    { key: "reverse", label: "Reverse Search" },
                    { key: "metadata", label: "Metadata Detect" },
                  ].map((tool) => (
                    <button
                      key={tool.key}
                      onClick={() => {
                        setActiveTool(tool.key);
                        setError(null);
                        setSearchUrls(null);
                        setPublicUrl(null);
                        setMetadataResult(null);
                      }}
                      className={`flex-1 text-center py-2 px-2 rounded-md font-medium text-sm transition-all ${
                        activeTool === tool.key
                          ? "bg-white dark:bg-slate-700 shadow-sm text-primary"
                          : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                      }`}
                    >
                      {tool.label}
                    </button>
                  ))}
                </div>

                {/* Mode toggle */}
                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg mb-6">
                  {[
                    { key: "url", label: "URL" },
                    { key: "upload", label: "আপলোড" },
                  ].map((mode) => (
                    <button
                      key={mode.key}
                      onClick={() => {
                        setInputMode(mode.key);
                        setError(null);
                      }}
                      className={`flex-1 text-center py-2 px-2 rounded-md font-medium text-sm transition-all ${
                        inputMode === mode.key
                          ? "bg-white dark:bg-slate-700 shadow-sm text-primary"
                          : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>

                {/* Input area */}
                <div className="mb-6">
                  {inputMode === "url" ? (
                    <div>
                      <input
                        type="url"
                        className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg p-4 text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none placeholder:text-slate-400"
                        placeholder="https://example.com/image.jpg"
                        value={urlValue}
                        onChange={(e) => setUrlValue(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                      />
                      <p className="text-[11px] text-slate-400 mt-2">
                        সরাসরি অনুসন্ধানযোগ্য একটি পাবলিক ইমেজ URL দিন
                      </p>
                    </div>
                  ) : (
                    <div
                      className="w-full min-h-[10rem] border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-900/50 transition-colors cursor-pointer relative overflow-hidden"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
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
                            ইমেজ আপলোড করতে ক্লিক করুন অথবা ড্র্যাগ এন্ড ড্রপ করুন
                          </p>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Submit */}
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
                      প্রক্রিয়াকরণ হচ্ছে...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined">
                        {activeTool === "reverse" ? "image_search" : "data_object"}
                      </span>
                      {activeTool === "reverse"
                        ? "সার্চ লিংক তৈরি করুন"
                        : "মেটাডাটা বিশ্লেষণ করুন"}
                    </>
                  )}
                </button>

                {(searchUrls || metadataResult) && (
                  <button
                    onClick={handleClear}
                    className="w-full mt-3 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-medium py-2 px-6 rounded-lg text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    রিসেট করুন
                  </button>
                )}

                <p className="mt-4 text-[11px] text-center text-slate-400 uppercase tracking-widest font-semibold">
                  {activeTool === "reverse"
                    ? "Google Lens ও অন্যান্য ইঞ্জিন দ্বারা চালিত"
                    : "OCR, Hashing ও Image Profiling দ্বারা চালিত"}
                </p>
              </div>
            </aside>

            {/* Right Column: Results */}
            <div className="flex-1 flex flex-col gap-6">
              {/* Error */}
              {error && (
                <div className="bg-danger/5 border border-danger/20 rounded-xl p-6 flex items-start gap-3">
                  <span className="material-symbols-outlined text-danger mt-0.5">
                    error
                  </span>
                  <p className="text-sm text-danger font-medium">{error}</p>
                </div>
              )}

              {/* Loading */}
              {loading && (
                <div className="flex flex-col gap-6 animate-pulse">
                  <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
                    <div className="h-5 w-48 bg-slate-200 dark:bg-slate-700 rounded mb-4" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {[1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className="h-24 bg-slate-100 dark:bg-slate-800 rounded-lg"
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Empty state */}
              {!loading && !searchUrls && !metadataResult && !error && (
                <EmptyState activeTool={activeTool} />
              )}

              {/* Search engine buttons */}
              {activeTool === "reverse" && searchUrls && (
                <>
                  {publicUrl && (
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <span className="material-symbols-outlined text-primary text-lg">
                          link
                        </span>
                        <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                          পাবলিক ইমেজ URL
                        </h3>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 break-all text-slate-600 dark:text-slate-400">
                          {publicUrl}
                        </code>
                        <button
                          onClick={() => navigator.clipboard.writeText(publicUrl)}
                          className="shrink-0 p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          title="কপি করুন"
                        >
                          <span className="material-symbols-outlined text-slate-500 text-lg">
                            content_copy
                          </span>
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary">
                        travel_explore
                      </span>
                      <h3 className="font-bold text-slate-900 dark:text-white">
                        রিভার্স ইমেজ সার্চ ইঞ্জিনসমূহ
                      </h3>
                    </div>
                    <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {SEARCH_ENGINES.map((engine) => (
                        <a
                          key={engine.id}
                          href={searchUrls[engine.id]}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`${engine.color} text-white rounded-xl p-5 flex items-start gap-4 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-sm`}
                        >
                          <div className="h-11 w-11 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-2xl">
                              {engine.icon}
                            </span>
                          </div>
                          <div>
                            <h4 className="font-bold text-base">
                              {engine.label}
                            </h4>
                            <p className="text-white/80 text-xs mt-1">
                              {engine.description}
                            </p>
                          </div>
                          <span className="material-symbols-outlined ml-auto self-center text-white/60">
                            open_in_new
                          </span>
                        </a>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-5">
                    <h3 className="font-bold flex items-center gap-2 mb-3 text-slate-900 dark:text-white">
                      <span className="material-symbols-outlined text-primary">
                        info
                      </span>
                      কিভাবে ব্যবহার করবেন
                    </h3>
                    <ul className="text-sm text-slate-600 dark:text-slate-400 space-y-2 leading-relaxed">
                      <li className="flex items-start gap-2">
                        <span className="text-primary font-bold mt-0.5">১.</span>
                        উপরের যেকোনো সার্চ ইঞ্জিন বাটনে ক্লিক করুন — নতুন ট্যাবে
                        ফলাফল দেখা যাবে।
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary font-bold mt-0.5">২.</span>
                        Google Lens ভিজ্যুয়াল ম্যাচ, টেক্সট, ও প্রোডাক্ট তথ্য
                        দেখাবে।
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-primary font-bold mt-0.5">৩.</span>
                        TinEye ছবিটি কোথায় কোথায় ব্যবহৃত হয়েছে তা দেখাবে — ফেক
                        নিউজ শনাক্তে অত্যন্ত কার্যকর।
                      </li>
                    </ul>
                  </div>
                </>
              )}

              {activeTool === "metadata" && metadataResult && (
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-5 space-y-5">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">data_object</span>
                    <h3 className="font-bold text-slate-900 dark:text-white">
                      ইমেজ মেটাডাটা রিপোর্ট
                    </h3>
                  </div>

                  {(() => {
                    const meta = metadataResult?.image_metadata || {};
                    const basic = meta?.basic || {};
                    const capture = meta?.capture || {};
                    const camera = meta?.camera_settings || {};
                    const location = meta?.location || {};

                    return (
                      <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <MetaRow label="Image ID" value={metadataResult.image_id} />
                    <MetaRow label="Filename" value={metadataResult.filename} />
                    <MetaRow label="Taken At" value={capture?.taken_at} />
                    <MetaRow
                      label="Device"
                      value={[capture?.make, capture?.model].filter(Boolean).join(" ") || "-"}
                    />
                    <MetaRow
                      label="Dimensions"
                      value={`${basic?.width || metadataResult?.dimensions?.width || "-"} × ${
                        basic?.height || metadataResult?.dimensions?.height || "-"
                      }`}
                    />
                    <MetaRow label="Megapixels" value={basic?.megapixels ? `${basic.megapixels} MP` : "-"} />
                    <MetaRow label="Format" value={basic?.format || metadataResult.format} />
                    <MetaRow label="Color Mode" value={basic?.mode} />
                    <MetaRow
                      label="File Size"
                      value={
                        Number.isFinite(basic?.file_size_bytes || metadataResult.file_size)
                          ? `${((basic?.file_size_bytes || metadataResult.file_size) / 1024).toFixed(1)} KB`
                          : "-"
                      }
                    />
                    <MetaRow
                      label="GPS"
                      value={location?.has_gps ? `${location.latitude}, ${location.longitude}` : "Not available"}
                    />
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                    <p className="text-xs uppercase tracking-wider text-slate-500 mb-2">
                      Capture Metadata
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <MetaRow label="Software" value={capture?.software} />
                      <MetaRow label="Lens Model" value={capture?.lens_model} />
                      <MetaRow label="Orientation" value={basic?.orientation} />
                      <MetaRow label="Info Keys" value={Array.isArray(basic?.info_keys) ? basic.info_keys.join(", ") : "-"} />
                    </div>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                    <p className="text-xs uppercase tracking-wider text-slate-500 mb-2">
                      Camera Settings
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                      <MetaRow label="Exposure Time" value={camera?.exposure_time} />
                      <MetaRow label="Aperture (F-Number)" value={camera?.f_number} />
                      <MetaRow label="ISO" value={camera?.iso} />
                      <MetaRow label="Focal Length" value={camera?.focal_length} />
                      <MetaRow label="Flash" value={camera?.flash} />
                      <MetaRow label="Altitude" value={location?.altitude} />
                    </div>
                  </div>

                  <details className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
                    <summary className="text-xs uppercase tracking-wider text-slate-500 cursor-pointer">
                      Raw EXIF (Advanced)
                    </summary>
                    <pre className="mt-3 text-xs font-mono text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-all">
                      {JSON.stringify(meta?.raw_exif || {}, null, 2)}
                    </pre>
                  </details>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </MainComponent>
  );
};

const MetaRow = ({ label, value }) => (
  <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg p-3">
    <p className="text-[11px] uppercase tracking-wider text-slate-500 mb-1">{label}</p>
    <p className="text-slate-800 dark:text-slate-200 font-medium break-all">{value || "-"}</p>
  </div>
);

const EmptyState = ({ activeTool }) => (
  <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-12 flex flex-col items-center justify-center text-center">
    <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 text-6xl mb-4">
      {activeTool === "reverse" ? "image_search" : "data_object"}
    </span>
    <h3 className="text-lg font-bold text-slate-400 dark:text-slate-500 mb-2">
      {activeTool === "reverse" ? "রিভার্স ইমেজ সার্চ" : "ইমেজ মেটাডাটা ডিটেকশন"}
    </h3>
    <p className="text-sm text-slate-400 dark:text-slate-500 max-w-sm">
      {activeTool === "reverse"
        ? "বামপাশে একটি ইমেজ URL দিন অথবা ফাইল আপলোড করুন, তারপর সার্চ চালান।"
        : "বামপাশে একটি ইমেজ URL দিন অথবা ফাইল আপলোড করুন, তারপর মেটাডাটা বিশ্লেষণ করুন।"}
    </p>
  </div>
);

export default Tools;
