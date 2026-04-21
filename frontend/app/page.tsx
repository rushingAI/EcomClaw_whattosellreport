import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import HomeClient from "./HomeClient";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // 读取配额
  const { data: profile } = await supabase
    .from("profiles")
    .select("plan, quota_remaining, quota_total")
    .eq("id", user.id)
    .single();

  return (
    <HomeClient
      userEmail={user.email ?? ""}
      quotaRemaining={profile?.quota_remaining ?? 0}
      quotaTotal={profile?.quota_total ?? 3}
    />
  );
}
