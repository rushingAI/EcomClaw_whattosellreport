import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import ReportContent from "./ReportContent";

// 服务器组件：在服务端读取 session token（无 Web Lock 竞争），
// 传给客户端组件，彻底解决 getSession() 永久挂起问题
export default async function ReportPage({
  searchParams,
}: {
  searchParams: Promise<{ keyword?: string }>;
}) {
  const { keyword = "" } = await searchParams;

  if (!keyword) {
    redirect("/");
  }

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    redirect("/login");
  }

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white flex items-center justify-center">
          <div className="text-gray-400">加载中...</div>
        </div>
      }
    >
      <ReportContent keyword={keyword} accessToken={session.access_token} />
    </Suspense>
  );
}
