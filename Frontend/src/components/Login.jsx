import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import axios from "axios";
import { useDispatch } from "react-redux";
import { setAuthUser } from "../redux/userSlice";
import { IoEye, IoEyeOff } from "react-icons/io5";
import { BsChatDotsFill, BsArrowRight, BsPerson, BsLock, BsArrowLeft, BsEnvelope } from "react-icons/bs";
import { API_ENDPOINTS } from "../config/api";
import { 
  deriveWrappingKey, 
  unwrapPrivateKey, 
  exportPublicKey 
} from "../utils/crypto";
import { savePrivateKey } from "../utils/keyStore";

const Login = () => {
  const [user, setUser] = React.useState({
    email: "",
    password: "",
  });
  const [showPassword, setShowPassword] = React.useState(false);
  const [focused, setFocused] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);

  const dispatch = useDispatch();
  const navigate = useNavigate();

  const onSubmithHandler = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const res = await axios.post(
        API_ENDPOINTS.USER.LOGIN,
        user,
        {
          headers: {
            "Content-Type": "application/json",
          },
          withCredentials: true,
        },
      );

      let privateKeyObj = null;
      try {
        if (res.data.encryptedPrivateKey && res.data.keySalt && res.data.keyIv) {
          const wrappingKey = await deriveWrappingKey(user.password, res.data.keySalt);
          // unwrapPrivateKey now creates a NON-extractable CryptoKey
          privateKeyObj = await unwrapPrivateKey(res.data.encryptedPrivateKey, res.data.keyIv, wrappingKey);
        }
      } catch (err) {
        console.error("Failed to decrypt private key.", err);
        toast.error("Warning: Could not unlock E2E encryption. Messages may be unreadable.");
      }

      const userData = {
        _id: res.data._id,
        fullName: res.data.fullName,
        email: res.data.email,
        mobile: res.data.mobile,
        profilePhoto: res.data.profilePhoto,
        token: res.data.token,
        publicKey: res.data.publicKey,
        // privateKey is intentionally NOT stored here — it lives in IndexedDB only
      };

      // Securely store the CryptoKey in IndexedDB (not localStorage)
      if (privateKeyObj && res.data._id) {
        try {
          await savePrivateKey(res.data._id.toString(), privateKeyObj);
        } catch (e) {
          console.error("Failed to save private key to IndexedDB:", e);
        }
      }

      dispatch(setAuthUser(userData));
      localStorage.setItem("authUser", JSON.stringify(userData));

      if (res.data.success) {
        navigate("/");
      }
    } catch (error) {
      if (error.response?.data?.notVerified) {
        toast.error("Please verify your email before logging in.");
        navigate("/register", {
          state: {
            email: user.email,
            isVerifyOnly: true,
          },
        });
      } else {
        toast.error(error.response?.data?.message || "Login failed");
      }
    } finally {
      setIsLoading(false);
    }
    setUser({
      email: "",
      password: "",
    });
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

      {/* ── Right: Login Form ── */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden pt-24 pb-8 sm:py-0">
        {/* Subtle background blob */}
        <div className="absolute top-0 right-0 w-[400px] h-[400px] rounded-full bg-violet-100/50 dark:bg-violet-900/20 blur-[100px] -z-0" />
        <div className="absolute bottom-0 left-0 w-[300px] h-[300px] rounded-full bg-violet-100/40 dark:bg-violet-900/20 blur-[80px] -z-0" />

        <div className="w-full max-w-lg relative z-10 px-5 sm:px-0">
          
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
              Welcome back
            </h1>
            <p className="text-gray-500 dark:text-stone-400 text-[15px] sm:text-sm transition-colors">
              Sign in to your account to continue your conversations.
            </p>
          </div>

          {/* Form Card */}
          <div className="bg-white dark:bg-[#111] rounded-[24px] shadow-sm sm:shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 dark:border-stone-800 p-6 sm:p-8 transition-colors">
            <form onSubmit={onSubmithHandler} className="space-y-5">
              {/* Email Input */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-stone-300 mb-2 transition-colors">
                  Email Address
                </label>
                <div className={`relative flex items-center rounded-xl border-2 transition-all duration-200 ${
                  focused === 'email' 
                    ? 'border-violet-500 dark:border-violet-500 shadow-sm shadow-violet-100 dark:shadow-violet-900/20 bg-white dark:bg-stone-900' 
                    : 'border-gray-200 dark:border-stone-700 hover:border-gray-300 dark:hover:border-stone-600 bg-gray-50 dark:bg-stone-900/50'
                }`}>
                  <div className="pl-4 pr-2 shrink-0 pointer-events-none">
                    <BsEnvelope className={`text-lg transition-colors duration-200 ${
                      focused === 'email' ? 'text-violet-500' : 'text-gray-400 dark:text-stone-500'
                    }`} />
                  </div>
                  <input
                    value={user.email}
                    onChange={(e) => setUser({ ...user, email: e.target.value })}
                    onFocus={() => setFocused('email')}
                    onBlur={() => setFocused('')}
                    className="w-full flex-1 min-w-0 px-2 pr-4 py-3 bg-transparent outline-none text-gray-900 dark:text-white text-sm placeholder:text-gray-400 dark:placeholder:text-stone-500"
                    type="email"
                    placeholder="Enter your email"
                    required
                  />
                </div>
              </div>

              {/* Password Input */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-stone-300 mb-2 transition-colors">
                  Password
                </label>
                <div className={`relative flex items-center rounded-xl border-2 transition-all duration-200 ${
                  focused === 'password' 
                    ? 'border-violet-500 dark:border-violet-500 shadow-sm shadow-violet-100 dark:shadow-violet-900/20 bg-white dark:bg-stone-900' 
                    : 'border-gray-200 dark:border-stone-700 hover:border-gray-300 dark:hover:border-stone-600 bg-gray-50 dark:bg-stone-900/50'
                }`}>
                  <div className="pl-4 pr-2 shrink-0 pointer-events-none">
                    <BsLock className={`text-lg transition-colors duration-200 ${
                      focused === 'password' ? 'text-violet-500' : 'text-gray-400 dark:text-stone-500'
                    }`} />
                  </div>
                  <input
                    value={user.password}
                    onChange={(e) => setUser({ ...user, password: e.target.value })}
                    onFocus={() => setFocused('password')}
                    onBlur={() => setFocused('')}
                    className="w-full flex-1 min-w-0 px-2 pr-11 py-3 bg-transparent outline-none text-gray-900 dark:text-white text-sm placeholder:text-gray-400 dark:placeholder:text-stone-500"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-stone-300 transition-colors p-1 flex items-center justify-center focus:outline-none"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <IoEyeOff size={18} /> : <IoEye size={18} />}
                  </button>
                </div>
              </div>

              {/* Login Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="group w-full flex items-center justify-center gap-2 bg-violet-600 text-white py-3.5 rounded-xl font-semibold text-sm hover:bg-violet-700 transition-all duration-200 shadow-md shadow-violet-600/20 mt-2 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    Sign In
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

              {/* Sign Up Link */}
              <p className="text-center text-sm text-gray-500 dark:text-stone-400 transition-colors">
                Don't have an account?{' '}
                <Link 
                  to="/register" 
                  className="text-violet-600 dark:text-violet-400 font-semibold hover:text-violet-700 dark:hover:text-violet-300 transition-colors"
                >
                  Create one
                </Link>
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
