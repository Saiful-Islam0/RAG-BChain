import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const Footer = () => {
  const [language, setLanguage] = useState("bn");

  useEffect(() => {
    const storedLanguage = localStorage.getItem("app_language") || "bn";
    setLanguage(storedLanguage);
  }, []);

  const handleLanguageChange = (e) => {
    const nextLanguage = e.target.value;
    setLanguage(nextLanguage);
    localStorage.setItem("app_language", nextLanguage);
    document.documentElement.lang = nextLanguage === "bn" ? "bn" : "en";
    window.dispatchEvent(new CustomEvent("app-language-change", { detail: { language: nextLanguage } }));
  };

  return (
    <footer className="mt-auto bg-white/30 backdrop-blur-xl border-t border-white pt-20 pb-10 px-4 md:px-10">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-12 mb-14">
          <div className="col-span-2">
            <div className="flex items-center gap-3 mb-6">
              <span className="material-symbols-outlined text-primary text-3xl">verified_user</span>
              <span className="text-2xl font-black headline-spacing text-primary">সত্য নাকি</span>
            </div>
            <p className="text-slate-500 font-medium text-sm leading-relaxed max-w-sm mb-8">
              {language === "bn"
                ? "এআই এবং ব্লকচেইন সমর্থিত তথ্য যাচাই প্ল্যাটফর্ম।"
                : "A premium glass-lab environment for truth verification powered by AI and distributed ledger intelligence."}
            </p>
            <div className="flex gap-4">
              <button className="w-11 h-11 glass-card flex items-center justify-center text-primary hover:text-neon-cyan transition-colors">
                <span className="material-symbols-outlined">alternate_email</span>
              </button>
              <button className="w-11 h-11 glass-card flex items-center justify-center text-primary hover:text-neon-cyan transition-colors">
                <span className="material-symbols-outlined">data_object</span>
              </button>
              <button className="w-11 h-11 glass-card flex items-center justify-center text-primary hover:text-neon-cyan transition-colors">
                <span className="material-symbols-outlined">hub</span>
              </button>
            </div>
          </div>

          <div>
            <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary mb-6">Ecosystem</h4>
            <ul className="space-y-3 text-xs font-bold text-slate-500 uppercase tracking-widest">
              <li><Link className="hover:text-neon-cyan transition-colors" to="/fact-check">Fact Core</Link></li>
              <li><Link className="hover:text-neon-cyan transition-colors" to="/tools">Visual Lab</Link></li>
              <li><Link className="hover:text-neon-cyan transition-colors" to="/detect">Deep Scan</Link></li>
              <li><Link className="hover:text-neon-cyan transition-colors" to="/howitworks">Protocol</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary mb-6">Company</h4>
            <ul className="space-y-3 text-xs font-bold text-slate-500 uppercase tracking-widest">
              <li><Link className="hover:text-neon-cyan transition-colors" to="/howitworks">About Us</Link></li>
              <li><Link className="hover:text-neon-cyan transition-colors" to="/howitworks">Research</Link></li>
              <li><Link className="hover:text-neon-cyan transition-colors" to="/howitworks">Legal</Link></li>
              <li><Link className="hover:text-neon-cyan transition-colors" to="/howitworks">Contact</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-[10px] font-black uppercase tracking-[0.3em] text-primary mb-6">Global</h4>
            <div className="glass-card p-4 flex items-center gap-3 border-white">
              <span className="material-symbols-outlined text-primary">language</span>
              <select
                value={language}
                onChange={handleLanguageChange}
                className="bg-transparent border-none text-[10px] font-black uppercase tracking-widest text-slate-600 focus:ring-0 cursor-pointer p-0"
              >
                <option value="en">English (US)</option>
                <option value="bn">Bengali</option>
              </select>
            </div>
          </div>
        </div>

        <div className="pt-8 border-t border-white/40 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
            © 2026 সত্য নাকি
          </p>
          <div className="flex items-center gap-3">
            <span className="neon-bullet"></span>
            <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">All Systems Nominal</p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
