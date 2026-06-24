import MainComponent from "./MainComponent";

const Methodology = () => {
  const steps = [
    {
      id: 1,
      icon: "cloud_download",
      title: "ডেটা সংগ্রহ",
      description:
        "বহুমাত্রিক বিশ্লেষণের জন্য একটি ব্যাপক বৈশ্বিক ডেটা পুল নিশ্চিত করতে বিভিন্ন এপিআই ফিড, সোশ্যাল সিগন্যাল এবং যাচাইকৃত প্রাতিষ্ঠানিক আউটলেট থেকে তথ্য সংগ্রহ করা হয়।",
    },
    {
      id: 2,
      icon: "psychology",
      title: "এআই বিশ্লেষণ",
      description:
        "তথ্য ক্রস-রেফারেন্স করা, সেমান্টিক বায়াস বা পক্ষপাত শনাক্ত করা এবং ভুল তথ্যে সাধারণ ভাষাগত প্যাটার্নগুলো চিহ্নিত করতে নিজস্ব স্মল ল্যাঙ্গুয়েজ মডেল (SLM) ব্যবহার করা হয়।",
    },
    {
      id: 3,
      icon: "database",
      title: "অন-চেইন স্টোরেজ",
      description:
        "যাচাইকৃত হ্যাশগুলো একটি পাবলিক লেজারে রেকর্ড করা হয়, যা তথ্যের সত্যতার একটি অপরিবর্তনীয় এবং স্বচ্ছ রেকর্ড প্রদান করে যা সবার জন্য উন্মুক্ত।",
    },
  ];

  return (
    <MainComponent>
      <section className="glass-page py-12 px-4">
        <div className="max-w-[1440px] mx-auto">
          {/* Section Heading */}
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-primary text-2xl font-black leading-tight headline-spacing uppercase">
              কার্যপদ্ধতি প্রবাহ
            </h2>
            <div className="h-[2px] grow ml-6 bg-gradient-to-r from-primary/20 to-transparent"></div>
          </div>

          {/* Detailed Methodology Description */}
          <p className="text-slate-600 text-base md:text-lg leading-relaxed max-w-[900px] mb-10">
            NewsVerifi প্ল্যাটফর্মটি সংবাদ বা তথ্য যাচাই করার জন্য একটি বহুমুখী
            এবং স্বয়ংক্রিয় পদ্ধতি ব্যবহার করে। প্রথমে, আমাদের সিস্টেম বিভিন্ন
            বিশ্বস্ত উৎস, যেমন সরকারি বা স্বীকৃত সংবাদ সংস্থা, সোশ্যাল মিডিয়া
            সিগন্যাল এবং এপিআই ফিড থেকে তথ্য সংগ্রহ করে। এরপর এই তথ্যগুলি আমাদের
            উন্নত এআই মডেল দ্বারা বিশ্লেষণ করা হয়, যা কৃত্রিম কনটেন্ট, ডিপফেক,
            পক্ষপাত, এবং স্বয়ংক্রিয় লেখনশৈলীর ধরণ চিহ্নিত করতে সক্ষম। প্রতিটি
            তথ্যের সত্যতা ক্রস-রেফারেন্স করা হয় এবং সম্ভাব্য ভুল বা
            বিভ্রান্তিকর উপাদান চিহ্নিত করা হয়। সবশেষে, যাচাইকৃত তথ্যের
            হ্যাশগুলো ব্লকচেইনে সংরক্ষণ করা হয়, যা একটি অপরিবর্তনীয় এবং স্বচ্ছ
            রেকর্ড তৈরি করে। এর ফলে ব্যবহারকারীরা যে কোনও খবরের উৎস পরীক্ষা করে
            তাৎক্ষণিকভাবে বিশ্বাসযোগ্যতার স্কোর এবং বিশ্লেষণ দেখতে পারে, যা
            সম্পূর্ণ স্বচ্ছ ও নিরাপদ।
          </p>

          {/* Methodology Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map((step) => (
              <div
                key={step.id}
                className="relative flex flex-col gap-6 glass-card p-8 hover:border-neon-cyan/60 transition-all duration-300 group"
              >
                {/* Step Number Badge */}
                <div className="absolute -top-4 -left-4 w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-primary/30">
                  {step.id}
                </div>

                {/* Icon */}
                <div className="text-primary bg-ice-blue w-12 h-12 rounded-lg border border-neon-cyan/20 flex items-center justify-center">
                  <span className="material-symbols-outlined text-3xl">
                    {step.icon}
                  </span>
                </div>

                {/* Content */}
                <div className="flex flex-col gap-3">
                  <h3 className="text-slate-900 text-xl font-black headline-spacing uppercase">
                    {step.title}
                  </h3>
                  <p className="text-slate-600 text-base leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </MainComponent>
  );
};

export default Methodology;
