"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { UserMenu } from "@/components/ui/UserMenu";

interface AuthenticatedNavbarProps {
  showLogo?: boolean;
  title?: string;
  leftContent?: React.ReactNode;
  centerContent?: React.ReactNode;
}

export function AuthenticatedNavbar({
  showLogo = true,
  title,
  leftContent,
  centerContent,
}: AuthenticatedNavbarProps) {
  const router = useRouter();

  const handleNewProject = () => {
    router.push("/projects/new");
  };

  return (
    <div className="navbar bg-base-100 border-b border-base-300 px-4">
      <div className="flex-1 flex items-center gap-3">
        {showLogo && (
          <Link href="/projects" className="flex items-center gap-2 text-xl font-bold">
            <img
              src="/img/logo.svg"
              alt="FlowCommander"
              className="w-7 h-7"
              style={{ filter: "invert(36%) sepia(85%) saturate(2046%) hue-rotate(238deg) brightness(87%) contrast(93%)" }}
            />
            FlowCommander
          </Link>
        )}
        {title && <span className="text-lg font-semibold">{title}</span>}
        {leftContent}
        {centerContent && <div className="flex-1">{centerContent}</div>}
      </div>
      <div className="flex-none flex items-center gap-3">
        {/* Tools dropdown */}
        <div className="dropdown dropdown-end">
          <div tabIndex={0} role="button" className="btn btn-ghost btn-sm gap-1">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-4 h-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21.75 6.75a4.5 4.5 0 01-4.884 4.484c-1.076-.091-2.264.071-2.95.904l-7.152 8.684a2.548 2.548 0 11-3.586-3.586l8.684-7.152c.833-.686.995-1.874.904-2.95a4.5 4.5 0 016.336-4.486l-3.276 3.276a3.004 3.004 0 002.25 2.25l3.276-3.276c.256.565.398 1.192.398 1.852z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.867 19.125h.008v.008h-.008v-.008z"
              />
            </svg>
            Tools
          </div>
          <ul tabIndex={0} className="dropdown-content menu bg-base-100 rounded-box z-[1] w-52 p-2 shadow-lg border border-base-300 mt-2">
            <li>
              <a href="/tools/phone" className="text-sm">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                  className="w-4 h-4"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z"
                  />
                </svg>
                Phone Testing Tool
              </a>
            </li>
          </ul>
        </div>

        {/* New Agent button */}
        <button onClick={handleNewProject} className="btn btn-primary btn-sm gap-1">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
            className="w-4 h-4"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
          New Agent
        </button>

        <UserMenu />
      </div>
    </div>
  );
}
