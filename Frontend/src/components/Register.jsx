import React from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { toast } from "react-hot-toast";
import { IoEye, IoEyeOff } from "react-icons/io5";
import { 
  BsChatDotsFill, 
  BsArrowRight, 
  BsLock, 
  BsArrowLeft, 
  BsEnvelope, 
  BsTelephone, 
  BsShieldCheck,
  BsShieldLock,
  BsArrowCounterclockwise 
} from "react-icons/bs";
import { HiOutlineUser } from "react-icons/hi2";
import { API_ENDPOINTS } from "../config/api";
import CountrySelect from "./CountrySelect";
import { 
  generateKeyPair, 
  generateRandomBytes, 
  deriveWrappingKey, 
  wrapPrivateKey, 
  exportPublicKey 
} from "../utils/crypto";

const Register = () => {
  const [user, setUser] = React.useState({
    fullName: "",
    email: "",
    mobile: "",
    password: "",
    confirmPassword: "",
    gender: "",
  });
  const [countryCode, setCountryCode] = React.useState("+91");
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [focused, setFocused] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);

  // OTP Verification states
  const [isOtpScreen, setIsOtpScreen] = React.useState(false);
  const [registeredEmail, setRegisteredEmail] = React.useState("");
  const [otpInput, setOtpInput] = React.useState("");
  const [otpDigits, setOtpDigits] = React.useState(Array(6).fill(""));

  const [isResending, setIsResending] = React.useState(false);
  const [resendCooldown, setResendCooldown] = React.useState(0);

  const navigate = useNavigate();
  const location = useLocation();

  React.useEffect(() => {
    if (location.state?.email && location.state?.isVerifyOnly) {
      setRegisteredEmail(location.state.email);
      setIsOtpScreen(true);
    }
  }, [location]);

  React.useEffect(() => {
    let timer;
    if (resendCooldown > 0) {
      timer = setInterval(() => {
        setResendCooldown((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleCheckbox = (gender) => {
    setUser({ ...user, gender });
  };

  const validateForm = () => {
    const nameRegex = /^[A-Za-z\s]{3,50}$/;
    if (!nameRegex.test(user.fullName.trim())) {
      toast.error("Name must be 3-50 characters and contain only letters.");
      return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(user.email.trim())) {
      toast.error("Please enter a valid email address.");
      return false;
    }

    if (user.mobile.length < 6 || user.mobile.length > 15) {
      toast.error("Please enter a valid mobile number (6-15 digits).");
      return false;
    }

    if (user.password.length < 6) {
      toast.error("Password must be at least 6 characters long.");
      return false;
    }

    return true;
  };

  const onSubmithHandler = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    
    setIsLoading(true);
    try {
      // --- E2EE Key Generation ---
      // 1. Generate local key pair
      const keyPair = await generateKeyPair();
      
      // 2. Export public key
      const publicKey = await exportPublicKey(keyPair.publicKey);
      
      // 3. Generate salt & derive wrapping key from password
      const salt = generateRandomBytes(16);
      const wrappingKey = await deriveWrappingKey(user.password, salt);
      
      // 4. Encrypt (wrap) private key
      const { encryptedPrivateKey, iv } = await wrapPrivateKey(keyPair.privateKey, wrappingKey);

      // Append crypto fields to payload
      const payload = {
        ...user,
        mobile: countryCode + user.mobile,
        publicKey,
        encryptedPrivateKey,
        keySalt: salt,
        keyIv: iv,
      };

      const res = await axios.post(
        API_ENDPOINTS.USER.REGISTER,
        payload,
        {
          headers: {
            "Content-Type": "application/json",
          },
          withCredentials: true,
        },
      );
      if (res.data.success) {
        if (res.data.autoVerified) {
          toast.success(res.data.message || "Account created! Redirecting to login...");
          setTimeout(() => navigate("/login"), 1000);
          return;
        }
        setRegisteredEmail(user.email);
        toast.success(res.data.message || "OTP sent to your email!");
        setIsOtpScreen(true);
        setResendCooldown(30);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Registration failed");
    } finally {
      setIsLoading(false);
    }
  };

  // ── 6-box OTP handlers ──────────────────────────────────────────────
  const handleOtpDigitChange = (index, value) => {
    const digit = value.replace(/\D/g, '').slice(-1); // only last digit
    const newDigits = [...otpDigits];
    newDigits[index] = digit;
    setOtpDigits(newDigits);
    const combined = newDigits.join('');
    setOtpInput(combined);

    // Auto-advance
    if (digit && index < 5) {
      document.getElementById(`otp-digit-${index + 1}`)?.focus();
    }
    // Auto-submit when all 6 filled
    if (combined.length === 6 && newDigits.every(d => d !== '')) {
      document.getElementById('verify-btn')?.click();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace') {
      if (otpDigits[index]) {
        // Clear current
        const newDigits = [...otpDigits];
        newDigits[index] = '';
        setOtpDigits(newDigits);
        setOtpInput(newDigits.join(''));
      } else if (index > 0) {
        // Move back
        document.getElementById(`otp-digit-${index - 1}`)?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      document.getElementById(`otp-digit-${index - 1}`)?.focus();
    } else if (e.key === 'ArrowRight' && index < 5) {
      document.getElementById(`otp-digit-${index + 1}`)?.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    const newDigits = [...Array(6)].map((_, i) => pasted[i] || '');
    setOtpDigits(newDigits);
    setOtpInput(pasted);
    // Focus last filled or last box
    const focusIndex = Math.min(pasted.length, 5);
    document.getElementById(`otp-digit-${focusIndex}`)?.focus();
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otpInput || otpInput.trim().length === 0) {
      toast.error("Please enter the 6-digit OTP code");
      return;
    }

    setIsLoading(true);
    try {
      const res = await axios.post(
        API_ENDPOINTS.USER.VERIFY_OTP,
        {
          email: registeredEmail,
          otp: otpInput.trim(),
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
          withCredentials: true,
        },
      );
      if (res.data.success) {
        toast.success(res.data.message || "Email verified! Redirecting to login...");
        setTimeout(() => {
          navigate("/login");
        }, 1200);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "OTP verification failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || isResending) return;
    setIsResending(true);
    try {
      const res = await axios.post(
        API_ENDPOINTS.USER.RESEND_OTP,
        { email: registeredEmail },
        {
          headers: {
            "Content-Type": "application/json",
          },
          withCredentials: true,
        },
      );
      if (res.data.success) {
        toast.success(res.data.message || "New OTP sent to your email!");
        setResendCooldown(30);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to resend OTP");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col font-[Inter,system-ui,sans-serif] bg-gray-50 dark:bg-[#0d0d0d] transition-colors duration-300">

      {/* ── Top Navigation (Back to Home) ── */}
      <div className="w-full px-5 py-4 sm:p-6 flex justify-between items-center z-50 absolute top-0 left-0">
        <Link 
          to="/landing" 
          className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-stone-400 dark:hover:text-white transition-colors bg-white/50 dark:bg-[#111]/50 backdrop-blur-md px-3.5 py-2 rounded-xl border border-gray-200/50 dark:border-stone-800"
        >
          <BsArrowLeft className="text-lg" />
          <span className="hidden sm:inline">Back to home</span>
        </Link>
      </div>

      {/* ── Center Content ── */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden pt-24 pb-8 sm:py-0">
        {/* Subtle background blobs */}
        <div className="absolute top-0 left-0 w-[400px] h-[400px] rounded-full bg-violet-100/50 dark:bg-violet-900/20 blur-[100px] -z-0" />
        <div className="absolute bottom-0 right-0 w-[300px] h-[300px] rounded-full bg-violet-100/40 dark:bg-violet-900/20 blur-[80px] -z-0" />

        <div className="w-full max-w-lg relative z-10 px-5 sm:px-0">
          {/* ══════════════════════════════════════════════════════════ */}
          {/* VIEW 1: OTP VERIFICATION VIEW                             */}
          {/* ══════════════════════════════════════════════════════════ */}
          {isOtpScreen ? (
            <div>
              {/* Header */}
              <div className="mb-7 mt-10 sm:mt-0 text-center">
                <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-3 transition-colors">
                  Check your inbox
                </h1>
                <p className="text-gray-500 dark:text-stone-400 text-sm transition-colors leading-relaxed">
                  We sent a 6-digit code to
                </p>
                <div className="mt-2.5 inline-flex items-center gap-2 px-3.5 py-1.5 bg-gray-100 dark:bg-[#1a1a1a] text-gray-700 dark:text-stone-300 text-sm font-medium rounded-full border border-gray-200 dark:border-stone-800">
                  <BsEnvelope className="text-violet-500 shrink-0" />
                  <span className="truncate max-w-[220px]">{registeredEmail}</span>
                </div>
              </div>

              {/* Card */}
              <div className="bg-white dark:bg-[#111] rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-none border border-gray-100 dark:border-stone-800 p-7 transition-colors">


                <form onSubmit={handleVerifyOtp} className="space-y-6">
                  {/* 6-box OTP input */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 dark:text-stone-500 mb-4 text-center uppercase tracking-widest transition-colors">
                      Verification Code
                    </label>
                    <div className="flex items-center justify-center gap-1 sm:gap-2">
                      {otpDigits.map((digit, index) => (
                        <input
                          key={index}
                          id={`otp-digit-${index}`}
                          type="text"
                          inputMode="numeric"
                          maxLength={1}
                          value={digit}
                          autoFocus={index === 0}
                          onChange={(e) => handleOtpDigitChange(index, e.target.value)}
                          onKeyDown={(e) => handleOtpKeyDown(index, e)}
                          onPaste={handleOtpPaste}
                          className={`w-[40px] h-[50px] sm:w-[44px] sm:h-[54px] flex-shrink-0 text-center text-xl font-bold rounded-xl border-2 outline-none transition-all duration-150 bg-gray-50 dark:bg-stone-900/60 text-gray-900 dark:text-white caret-violet-500
                            ${digit
                              ? 'border-violet-500 dark:border-violet-500 bg-violet-50/50 dark:bg-violet-900/10'
                              : 'border-gray-200 dark:border-stone-700 focus:border-violet-500 dark:focus:border-violet-500 focus:bg-white dark:focus:bg-stone-900'
                            }`}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Verify Button */}
                  <button
                    id="verify-btn"
                    type="submit"
                    disabled={isLoading || otpInput.length < 6}
                    className="group w-full flex items-center justify-center gap-2 bg-violet-600 text-white py-3.5 rounded-xl font-semibold text-sm hover:bg-violet-700 transition-all duration-200 shadow-md shadow-violet-600/20 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isLoading ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        Verify Email
                        <BsArrowRight className="group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </button>

                  {/* Footer row */}
                  <div className="flex items-center justify-between text-sm">
                    <button
                      type="button"
                      onClick={() => setIsOtpScreen(false)}
                      className="text-gray-400 dark:text-stone-500 hover:text-gray-700 dark:hover:text-stone-200 transition-colors flex items-center gap-1.5 font-medium"
                    >
                      <BsArrowLeft />
                      Back
                    </button>

                    <button
                      type="button"
                      disabled={resendCooldown > 0 || isResending}
                      onClick={handleResendOtp}
                      className="font-semibold text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 transition-colors"
                    >
                      <BsArrowCounterclockwise className={isResending ? "animate-spin" : ""} />
                      {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
                    </button>
                  </div>

                  <p className="text-center text-sm text-gray-400 dark:text-stone-500 transition-colors">
                    Already verified?{' '}
                    <Link to="/login" className="text-violet-600 dark:text-violet-400 font-semibold hover:text-violet-700 dark:hover:text-violet-300 transition-colors">
                      Sign in
                    </Link>
                  </p>
                </form>
              </div>
            </div>
          ) : (

            /* ══════════════════════════════════════════════════════════ */
            /* VIEW 2: REGISTRATION FORM                                  */
            /* ══════════════════════════════════════════════════════════ */
            <div>
              {/* Header */}
              <div className="mb-6 mt-0 text-center sm:text-left flex flex-col items-center sm:items-start">
                <Link to="/" className="inline-flex items-center gap-2 mb-5 lg:hidden">
                  <div className="w-10 h-10 rounded-[14px] bg-violet-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
                    <BsChatDotsFill className="text-white text-lg" />
                  </div>
                  <span className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight transition-colors">
                    Ping<span className="text-violet-600">.</span>
                  </span>
                </Link>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-2 transition-colors">
                  Create your account
                </h1>
                <p className="text-gray-500 dark:text-stone-400 text-[15px] sm:text-sm transition-colors">
                  Fill in the details below to get started in seconds.
                </p>
              </div>

              {/* Form Card */}
              <div className="bg-white dark:bg-[#111] rounded-[24px] shadow-sm sm:shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 dark:border-stone-800 p-6 sm:p-8 transition-colors">
                <form onSubmit={onSubmithHandler} className="space-y-4">
                  {/* Name */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-stone-300 mb-1.5 transition-colors">
                      Name
                    </label>
                    <div className={`relative flex items-center rounded-xl border-2 transition-all duration-200 ${
                      focused === 'fullName' 
                        ? 'border-violet-500 dark:border-violet-500 shadow-sm shadow-violet-100 dark:shadow-violet-900/20 bg-white dark:bg-stone-900' 
                        : 'border-gray-200 dark:border-stone-700 hover:border-gray-300 dark:hover:border-stone-600 bg-gray-50 dark:bg-stone-900/50'
                    }`}>
                      <div className="pl-3.5 pr-1.5">
                        <HiOutlineUser className={`text-lg transition-colors duration-200 ${
                          focused === 'fullName' ? 'text-violet-500' : 'text-gray-400 dark:text-stone-500'
                        }`} />
                      </div>
                      <input
                        value={user.fullName}
                        onChange={(e) => setUser({ ...user, fullName: e.target.value })}
                        onFocus={() => setFocused('fullName')}
                        onBlur={() => setFocused('')}
                        className="flex-1 px-2 py-2.5 bg-transparent outline-none text-gray-900 dark:text-white text-sm placeholder:text-gray-400 dark:placeholder:text-stone-500"
                        type="text"
                        placeholder="Enter your name"
                        required
                      />
                    </div>
                  </div>

                  {/* Two-column: Email + Mobile */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Email */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-stone-300 mb-1.5 transition-colors">
                        Email Address
                      </label>
                      <div className={`relative flex items-center rounded-xl border-2 transition-all duration-200 ${
                        focused === 'email' 
                          ? 'border-violet-500 dark:border-violet-500 shadow-sm shadow-violet-100 dark:shadow-violet-900/20 bg-white dark:bg-stone-900' 
                          : 'border-gray-200 dark:border-stone-700 hover:border-gray-300 dark:hover:border-stone-600 bg-gray-50 dark:bg-stone-900/50'
                      }`}>
                        <div className="pl-3.5 pr-1.5">
                          <BsEnvelope className={`text-lg transition-colors duration-200 ${
                            focused === 'email' ? 'text-violet-500' : 'text-gray-400 dark:text-stone-500'
                          }`} />
                        </div>
                        <input
                          value={user.email}
                          onChange={(e) => setUser({ ...user, email: e.target.value })}
                          onFocus={() => setFocused('email')}
                          onBlur={() => setFocused('')}
                          className="flex-1 px-2 py-2.5 bg-transparent outline-none text-gray-900 dark:text-white text-sm placeholder:text-gray-400 dark:placeholder:text-stone-500 min-w-0"
                          type="email"
                          placeholder="Enter your email"
                          required
                        />
                      </div>
                    </div>

                    {/* Mobile */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-stone-300 mb-1.5 transition-colors">
                        Mobile Number
                      </label>
                      <div className={`relative flex items-center rounded-xl border-2 transition-all duration-200 ${
                        focused === 'mobile' 
                          ? 'border-violet-500 dark:border-violet-500 shadow-sm shadow-violet-100 dark:shadow-violet-900/20 bg-white dark:bg-stone-900' 
                          : 'border-gray-200 dark:border-stone-700 hover:border-gray-300 dark:hover:border-stone-600 bg-gray-50 dark:bg-stone-900/50'
                      }`}>
                        <div className="pl-1 pr-1 flex items-center border-r border-gray-200 dark:border-stone-700">
                          <CountrySelect 
                            value={countryCode} 
                            onChange={(code) => setCountryCode(code)} 
                          />
                        </div>
                        <input
                          value={user.mobile}
                          onChange={(e) => {
                            const val = e.target.value.replace(/\D/g, '');
                            if (val.length <= 15) setUser({ ...user, mobile: val });
                          }}
                          onFocus={() => setFocused('mobile')}
                          onBlur={() => setFocused('')}
                          className="flex-1 px-3 py-2.5 bg-transparent outline-none text-gray-900 dark:text-white text-sm placeholder:text-gray-400 dark:placeholder:text-stone-500 min-w-0"
                          type="tel"
                          placeholder="Phone number"
                          required
                        />
                      </div>
                    </div>
                  </div>

                  {/* Two-column: Password + Confirm */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Password */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-stone-300 mb-1.5 transition-colors">
                        Password
                      </label>
                      <div className={`relative flex items-center rounded-xl border-2 transition-all duration-200 ${
                        focused === 'password' 
                          ? 'border-violet-500 dark:border-violet-500 shadow-sm shadow-violet-100 dark:shadow-violet-900/20 bg-white dark:bg-stone-900' 
                          : 'border-gray-200 dark:border-stone-700 hover:border-gray-300 dark:hover:border-stone-600 bg-gray-50 dark:bg-stone-900/50'
                      }`}>
                        <div className="pl-3.5 pr-1.5 shrink-0 pointer-events-none">
                          <BsLock className={`text-base transition-colors duration-200 ${
                            focused === 'password' ? 'text-violet-500' : 'text-gray-400 dark:text-stone-500'
                          }`} />
                        </div>
                        <input
                          value={user.password}
                          onChange={(e) => setUser({ ...user, password: e.target.value })}
                          onFocus={() => setFocused('password')}
                          onBlur={() => setFocused('')}
                          className="w-full flex-1 min-w-0 px-2 pr-9 py-2.5 bg-transparent outline-none text-gray-900 dark:text-white text-sm placeholder:text-gray-400 dark:placeholder:text-stone-500"
                          type={showPassword ? "text" : "password"}
                          placeholder="Create password"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-stone-300 transition-colors p-1 flex items-center justify-center focus:outline-none"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                          {showPassword ? <IoEyeOff size={16} /> : <IoEye size={16} />}
                        </button>
                      </div>
                    </div>

                    {/* Confirm Password */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 dark:text-stone-300 mb-1.5 transition-colors">
                        Confirm
                      </label>
                      <div className={`relative flex items-center rounded-xl border-2 transition-all duration-200 ${
                        focused === 'confirmPassword' 
                          ? 'border-violet-500 dark:border-violet-500 shadow-sm shadow-violet-100 dark:shadow-violet-900/20 bg-white dark:bg-stone-900' 
                          : 'border-gray-200 dark:border-stone-700 hover:border-gray-300 dark:hover:border-stone-600 bg-gray-50 dark:bg-stone-900/50'
                      }`}>
                        <div className="pl-3.5 pr-1.5 shrink-0 pointer-events-none">
                          <BsLock className={`text-base transition-colors duration-200 ${
                            focused === 'confirmPassword' ? 'text-violet-500' : 'text-gray-400 dark:text-stone-500'
                          }`} />
                        </div>
                        <input
                          value={user.confirmPassword}
                          onChange={(e) => setUser({ ...user, confirmPassword: e.target.value })}
                          onFocus={() => setFocused('confirmPassword')}
                          onBlur={() => setFocused('')}
                          className="w-full flex-1 min-w-0 px-2 pr-9 py-2.5 bg-transparent outline-none text-gray-900 dark:text-white text-sm placeholder:text-gray-400 dark:placeholder:text-stone-500"
                          type={showConfirmPassword ? "text" : "password"}
                          placeholder="Repeat password"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-stone-300 transition-colors p-1 flex items-center justify-center focus:outline-none"
                          aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                        >
                          {showConfirmPassword ? <IoEyeOff size={16} /> : <IoEye size={16} />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Gender Selection — pill style */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-stone-300 mb-2.5 transition-colors">
                      Gender
                    </label>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => handleCheckbox("male")}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all duration-200 ${
                          user.gender === "male"
                            ? "border-violet-500 dark:border-violet-500 bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 shadow-sm shadow-violet-100 dark:shadow-violet-900/20"
                            : "border-gray-200 dark:border-stone-700 text-gray-500 dark:text-stone-400 hover:border-gray-300 dark:hover:border-stone-600 hover:bg-gray-50 dark:hover:bg-stone-800/50 bg-white dark:bg-stone-900/50"
                        }`}
                      >
                        Male
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCheckbox("female")}
                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all duration-200 ${
                          user.gender === "female"
                            ? "border-violet-500 dark:border-violet-500 bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 shadow-sm shadow-violet-100 dark:shadow-violet-900/20"
                            : "border-gray-200 dark:border-stone-700 text-gray-500 dark:text-stone-400 hover:border-gray-300 dark:hover:border-stone-600 hover:bg-gray-50 dark:hover:bg-stone-800/50 bg-white dark:bg-stone-900/50"
                        }`}
                      >
                        Female
                      </button>
                    </div>
                  </div>

                  {/* Sign Up Button */}
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="group w-full flex items-center justify-center gap-2 bg-violet-600 text-white py-3.5 rounded-xl font-semibold text-sm hover:bg-violet-700 transition-all duration-200 shadow-md shadow-violet-600/20 mt-2 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {isLoading ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        Create Account
                        <BsArrowRight className="group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </button>

                  {/* Divider */}
                  <div className="flex items-center gap-4 py-1">
                    <div className="flex-1 h-px bg-gray-200 dark:bg-stone-800 transition-colors" />
                    <span className="text-xs text-gray-400 font-medium uppercase tracking-wider">or</span>
                    <div className="flex-1 h-px bg-gray-200 dark:bg-stone-800 transition-colors" />
                  </div>

                  {/* Login Link */}
                  <p className="text-center text-sm text-gray-500 dark:text-stone-400 transition-colors">
                    Already have an account?{' '}
                    <Link 
                      to="/login" 
                      className="text-violet-600 dark:text-violet-400 font-semibold hover:text-violet-700 dark:hover:text-violet-300 transition-colors"
                    >
                      Sign in
                    </Link>
                  </p>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Register;
