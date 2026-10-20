import { Logo } from "@/components/layout";
import { ScenicBackground } from "@/components/marketing/ScenicBackground";

/** Full-screen sky scene with a frosted card in the middle (login, signup). */
export function AuthLayout({ children }) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-canvas">
      <ScenicBackground />
      <header className="relative z-10 mx-auto flex h-16 w-full max-w-6xl items-center px-5 sm:px-8">
        <Logo />
      </header>
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 pb-16 pt-4">
        <div className="w-full max-w-[420px] rounded-[28px] border border-white/70 bg-white/80 p-7 shadow-raised backdrop-blur-xl sm:p-9">
          {children}
        </div>
      </main>
    </div>
  );
}
