import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LoginForm from "@/components/auth/LoginForm";

export const metadata = { title: "登录 — EcomClaw" };

export default async function LoginPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/");

  return (
    <main className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
      <div className="mb-8 text-center">
        <div className="flex items-center justify-center gap-3 mb-3">
          <div className="w-9 h-9 bg-black rounded-xl flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span className="text-xl font-bold text-gray-900">EcomClaw</span>
        </div>
        <p className="text-sm text-gray-500">登录后即可生成 Amazon 品类分析报告</p>
      </div>

      <div className="w-full max-w-sm bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
        <LoginForm />
      </div>

      <p className="mt-6 text-xs text-gray-400">
        请使用已有账号登录
      </p>
    </main>
  );
}
