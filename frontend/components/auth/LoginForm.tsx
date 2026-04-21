"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

type Mode = "login" | "signup";

export default function LoginForm() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { signIn, signUp } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await signIn(email, password);
        if (error) {
          setError(
            error.message === "Invalid login credentials"
              ? "邮箱或密码错误"
              : error.message
          );
        } else {
          router.push("/");
          router.refresh();
        }
      } else {
        const { error } = await signUp(email, password);
        if (error) {
          setError(error.message);
        } else {
          setMessage("注册成功！请检查邮箱点击验证链接，然后回来登录。");
          setMode("login");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      {/* Tab */}
      <div className="flex border border-gray-200 rounded-xl p-1 mb-6">
        {(["login", "signup"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => { setMode(m); setError(null); setMessage(null); }}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
              mode === m ? "bg-black text-white shadow-sm" : "text-gray-500 hover:text-gray-800"
            }`}
          >
            {m === "login" ? "登录" : "注册"}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">邮箱</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-black transition-colors"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">密码</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            placeholder="最少 6 位"
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm outline-none focus:border-black transition-colors"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
        )}
        {message && (
          <p className="text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg">{message}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-black text-white text-sm font-semibold rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "处理中..." : mode === "login" ? "登录" : "创建账号"}
        </button>
      </form>
    </div>
  );
}
