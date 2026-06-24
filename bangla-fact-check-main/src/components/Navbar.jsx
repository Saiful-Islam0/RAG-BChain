import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [theme, setTheme] = useState("light");
  const [language, setLanguage] = useState("bn");

  const links = [
    { labelEn: "Home", labelBn: "হোম", hash: "/" },
    { labelEn: "Fact Check", labelBn: "ফ্যাক্ট চেক", hash: "fact-check" },
    { labelEn: "Tools", labelBn: "টুলস", hash: "tools" },
    { labelEn: "AI Detection", labelBn: "এআই ডিটেকশন", hash: "detect" },
    { labelEn: "How it Works", labelBn: "কীভাবে কাজ করে", hash: "howitworks" },
  ];

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    const initial =
      saved || (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setTheme(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");
  }, []);

  useEffect(() => {
    const storedLanguage = localStorage.getItem("app_language") || "bn";
    setLanguage(storedLanguage);
    document.documentElement.lang = storedLanguage === "bn" ? "bn" : "en";

    const onLanguageChange = (event) => {
      const nextLanguage = event?.detail?.language || localStorage.getItem("app_language") || "bn";
      setLanguage(nextLanguage);
      document.documentElement.lang = nextLanguage === "bn" ? "bn" : "en";
    };

    window.addEventListener("app-language-change", onLanguageChange);
    return () => window.removeEventListener("app-language-change", onLanguageChange);
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  return (
    <header className="sticky top-0 z-50 w-full px-4 md:px-10 py-4">
      <div className="max-w-7xl mx-auto glass-card px-5 md:px-8 py-3 flex items-center justify-between border-white/60">
        <div className="flex items-center gap-3">
          <div className="size-10 flex items-center justify-center rounded-xl bg-ice-blue border border-neon-cyan/30 text-primary">
            <span
              className="material-symbols-outlined text-2xl"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              verified_user
            </span>
          </div>
          <h2 className="text-xl font-extrabold tracking-tight text-primary headline-spacing">
            সত্য নাকি
          </h2>
        </div>

        <nav className="hidden md:flex items-center gap-7">
          {links.map((item) => (
            <Link
              key={item.hash}
              className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-600 hover:text-neon-cyan transition-colors"
              to={item.hash === "/" ? "/" : `/${item.hash}`}
            >
              {language === "bn" ? item.labelBn : item.labelEn}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 md:gap-4">
          <button
            onClick={toggleTheme}
            className="p-2 text-primary hover:text-neon-cyan transition-colors"
            aria-label="Toggle theme"
          >
            <span className="material-symbols-outlined">
              {theme === "dark" ? "dark_mode" : "light_mode"}
            </span>
          </button>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden p-2 rounded-md text-primary"
            aria-label="Toggle menu"
          >
            <span className="material-symbols-outlined text-2xl">{isOpen ? "close" : "menu"}</span>
          </button>
        </div>
      </div>

      {isOpen && (
        <nav className="md:hidden mt-2 max-w-7xl mx-auto glass-card p-4 flex flex-col gap-4">
          {links.map((item) => (
            <Link
              key={item.hash}
              className="text-[12px] font-bold uppercase tracking-[0.15em] text-slate-700 hover:text-neon-cyan transition-colors"
              to={item.hash === "/" ? "/" : `/${item.hash}`}
              onClick={() => setIsOpen(false)}
            >
              {language === "bn" ? item.labelBn : item.labelEn}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
};

export default Navbar;
