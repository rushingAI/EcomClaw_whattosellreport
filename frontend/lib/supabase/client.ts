import { createBrowserClient } from "@supabase/ssr";

// 模块级单例：整个 App 共享一个 Supabase 浏览器客户端
// 防止 React StrictMode 双 mount 创建多实例导致 Web Locks 竞争死锁
let _instance: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (!_instance) {
    _instance = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return _instance;
}
