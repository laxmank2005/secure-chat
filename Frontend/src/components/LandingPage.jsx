import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { 
  BsChatDotsFill, 
  BsArrowRight, 
  BsShieldLockFill, 
  BsLightningChargeFill, 
  BsPeopleFill, 
  BsFileEarmarkLockFill 
} from "react-icons/bs";

const LandingPage = () => {
  const { authUser } = useSelector((store) => store.user);
  const navigate = useNavigate();

  useEffect(() => {
    if (authUser) {
      navigate("/");
    }
  }, [authUser, navigate]);

  // Removed rotating words for a more solid, static UI

  return (
    <div className="bg-white dark:bg-[#0a0a0a] min-h-screen text-gray-900 dark:text-white font-[Inter,system-ui,sans-serif] selection:bg-violet-500/30 overflow-x-hidden flex flex-col transition-colors duration-300">
      
      {/* ── Navbar ── */}
      <motion.nav
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="w-full bg-white/70 dark:bg-[#0a0a0a]/70 backdrop-blur-xl border-b border-gray-200/50 dark:border-white/5 sticky top-0 z-50 transition-colors duration-300"
      >
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <BsChatDotsFill className="text-white text-lg" />
            </div>
            <span className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white transition-colors">
              Ping<span className="text-violet-600">.</span>
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-medium text-gray-600 dark:text-stone-300 hover:text-gray-900 dark:hover:text-white transition-colors">Features</a>
            <a href="#how-it-works" className="text-sm font-medium text-gray-600 dark:text-stone-300 hover:text-gray-900 dark:hover:text-white transition-colors">How it Works</a>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="px-4 py-2.5 text-sm font-semibold text-gray-700 dark:text-stone-300 hover:text-gray-900 dark:hover:text-white transition-colors rounded-xl hover:bg-gray-100 dark:hover:bg-white/5"
            >
              Log in
            </Link>
            <Link
              to="/register"
              className="px-5 py-2.5 text-sm font-semibold text-white bg-gray-900 dark:bg-white dark:text-black rounded-xl hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors shadow-sm"
            >
              Get started
            </Link>
          </div>
        </div>
      </motion.nav>

      {/* ── HERO SECTION ── */}
      <section className="relative pt-16 sm:pt-24 pb-16 sm:pb-32 overflow-hidden">
        {/* Background elements */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-violet-500/10 dark:bg-violet-500/10 blur-[120px] pointer-events-none" />
        
        <div className="max-w-7xl mx-auto px-6 w-full flex flex-col items-center text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="space-y-8 max-w-4xl"
          >
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 dark:bg-stone-800/80 border border-gray-200 dark:border-stone-700 text-gray-700 dark:text-stone-300 text-xs font-medium mb-6 shadow-sm">
              <BsShieldLockFill className="text-violet-600 dark:text-violet-500" />
              Now with End-to-End Encryption
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-7xl font-extrabold text-gray-900 dark:text-white leading-[1.15] tracking-tight">
              Talk to your <span className="text-violet-600">community</span>
              <br className="hidden sm:block" /> without the noise.
            </h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.8 }}
              className="text-[18px] sm:text-xl text-gray-500 dark:text-stone-400 mx-auto max-w-2xl leading-relaxed font-medium transition-colors"
            >
              Ping is a blazing fast, highly secure messaging platform designed for the modern web. Experience real-time communication with unparalleled privacy.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.5 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4"
            >
              <Link
                to="/register"
                className="group w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-violet-600 text-white px-8 py-4 rounded-xl font-semibold text-base hover:bg-violet-700 transition-all shadow-xl shadow-violet-600/20 hover:shadow-violet-600/40 hover:-translate-y-0.5"
              >
                Start chatting free
                <BsArrowRight className="text-sm group-hover:translate-x-1 transition-transform" />
              </Link>
              <a
                href="#features"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white px-8 py-4 rounded-xl font-semibold text-base hover:bg-gray-200 dark:hover:bg-white/10 transition-all"
              >
                Discover Features
              </a>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── FEATURES SECTION ── */}
      <section id="features" className="py-16 sm:py-24 bg-gray-50/50 dark:bg-[#111]/30 border-y border-gray-200/50 dark:border-white/5">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-20">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-6">Engineered for privacy.<br/>Designed for humans.</h2>
            <p className="text-lg text-gray-500 dark:text-stone-400">Everything you need to communicate effectively, built on a foundation of uncompromised security.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                icon: <BsShieldLockFill />,
                title: "End-to-End Encrypted",
                desc: "Your messages are encrypted before they leave your device. Only you and the recipient hold the keys."
              },
              {
                icon: <BsLightningChargeFill />,
                title: "Lightning Fast",
                desc: "Built on WebSockets for instantaneous message delivery. When you hit send, they see it."
              },
              {
                icon: <BsPeopleFill />,
                title: "Seamless Groups",
                desc: "Coordinate with your entire team or family. Secure group chats with dynamic key distribution."
              },
              {
                icon: <BsFileEarmarkLockFill />,
                title: "Secure File Sharing",
                desc: "Send high-res photos and documents. Peer-to-peer file transfer ensures no data hits our servers."
              }
            ].map((feature, i) => (
              <div key={i} className="bg-white dark:bg-[#161616] p-8 rounded-[24px] border border-gray-100 dark:border-white/5 shadow-sm hover:shadow-md transition-shadow">
                <div className="w-12 h-12 rounded-2xl bg-violet-100 dark:bg-violet-500/10 flex items-center justify-center text-violet-600 dark:text-violet-400 text-xl mb-6">
                  {feature.icon}
                </div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">{feature.title}</h3>
                <p className="text-gray-500 dark:text-stone-400 leading-relaxed text-sm">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS SECTION ── */}
      <section id="how-it-works" className="py-16 sm:py-32 relative">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center gap-16">
            <div className="flex-1 space-y-8">
              <div>
                <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 dark:text-white mb-6">How Ping works</h2>
                <p className="text-lg text-gray-500 dark:text-stone-400 max-w-lg">We stripped away the complexity to give you a straightforward, secure chatting experience. Get started in less than a minute.</p>
              </div>
              
              <div className="space-y-6">
                {[
                  { step: "01", title: "Create an Account", desc: "Sign up with your mobile number. No complex setup required." },
                  { step: "02", title: "Find Connections", desc: "Search for your friends by their mobile number or name to initiate a secure session." },
                  { step: "03", title: "Start Chatting", desc: "Exchange encrypted messages, photos, and files with absolute peace of mind." }
                ].map((item, i) => (
                  <div key={i} className="flex gap-4">
                    <div className="font-mono text-sm font-bold text-violet-600 dark:text-violet-400 pt-1">{item.step}</div>
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{item.title}</h4>
                      <p className="text-gray-500 dark:text-stone-400 text-sm leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="flex-1 w-full relative hidden sm:block">
              <div className="aspect-square sm:aspect-[4/3] rounded-[32px] bg-gradient-to-br from-gray-100 to-gray-50 dark:from-[#1a1a1a] dark:to-[#111] border border-gray-200/50 dark:border-white/5 shadow-2xl overflow-hidden relative flex items-center justify-center p-8">
                {/* Abstract UI Representation */}
                <div className="w-full max-w-sm bg-white dark:bg-[#0a0a0a] rounded-2xl shadow-xl border border-gray-100 dark:border-white/10 overflow-hidden flex flex-col">
                  <div className="h-14 border-b border-gray-100 dark:border-white/10 flex items-center px-4 gap-3 bg-gray-50 dark:bg-[#111]">
                    <div className="w-8 h-8 rounded-full bg-violet-500" />
                    <div className="w-24 h-3 rounded-full bg-gray-200 dark:bg-stone-700" />
                  </div>
                  <div className="p-4 space-y-4 flex-1 bg-white/50 dark:bg-[#0a0a0a]/50">
                    <div className="flex gap-3">
                      <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-stone-800" />
                      <div className="w-48 h-10 rounded-2xl rounded-tl-sm bg-gray-100 dark:bg-[#1a1a1a]" />
                    </div>
                    <div className="flex gap-3 flex-row-reverse">
                      <div className="w-48 h-10 rounded-2xl rounded-tr-sm bg-violet-600" />
                    </div>
                    <div className="flex gap-3">
                      <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-stone-800" />
                      <div className="w-32 h-10 rounded-2xl rounded-tl-sm bg-gray-100 dark:bg-[#1a1a1a]" />
                    </div>
                  </div>
                  <div className="h-16 border-t border-gray-100 dark:border-white/10 flex items-center px-4 p-3 gap-2">
                    <div className="flex-1 h-full rounded-xl bg-gray-100 dark:bg-[#1a1a1a]" />
                    <div className="w-10 h-full rounded-xl bg-violet-600" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA SECTION ── */}
      <section className="py-16 sm:py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-violet-600" />
        <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full bg-indigo-500 blur-[100px] opacity-50 mix-blend-screen" />
        <div className="max-w-4xl mx-auto px-6 relative z-10 text-center">
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6">Ready to take back your privacy?</h2>
          <p className="text-violet-100 text-lg mb-10 max-w-2xl mx-auto">Join thousands of users who have already switched to Ping for their daily communication needs.</p>
          <Link
            to="/register"
            className="inline-flex items-center justify-center gap-2 bg-white text-violet-900 px-8 py-4 rounded-xl font-bold text-lg hover:bg-gray-50 hover:scale-105 transition-all shadow-xl"
          >
            Create your account
          </Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="py-16 flex justify-center border-t border-gray-100 dark:border-white/5">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-violet-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <BsChatDotsFill className="text-white text-xl" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
            Ping<span className="text-violet-600">.</span>
          </span>
        </div>
      </footer>

    </div>
  );
};

export default LandingPage;
