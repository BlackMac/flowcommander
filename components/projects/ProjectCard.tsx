"use client";

import Link from "next/link";
import type { Project } from "@/types/database";

type SandboxStatus = "running" | "stopped" | "error" | "checking";

interface ProjectCardProps {
  project: Project;
  sandboxStatus?: SandboxStatus;
  onDelete?: (id: string) => void;
}

export function ProjectCard({ project, sandboxStatus, onDelete }: ProjectCardProps) {
  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this project?")) {
      onDelete?.(project.id);
    }
  };

  const renderStatusBadge = () => {
    if (sandboxStatus === "checking") {
      return (
        <span className="badge badge-ghost badge-sm gap-1">
          <span className="loading loading-spinner loading-xs"></span>
          Checking
        </span>
      );
    }
    if (sandboxStatus === "running") {
      return <span className="badge badge-success badge-sm">Running</span>;
    }
    if (sandboxStatus === "error") {
      return <span className="badge badge-error badge-sm">Error</span>;
    }
    // No badge for stopped or undefined
    return null;
  };

  return (
    <Link href={`/builder/${project.id}`}>
      <div className="card bg-base-100 shadow-md hover:shadow-lg transition-shadow cursor-pointer border border-base-300">
        <div className="card-body">
          <div className="flex items-start justify-between">
            <h2 className="card-title text-lg">{project.name}</h2>
            <div className="flex gap-1">
              {renderStatusBadge()}
            </div>
          </div>
          <p className="text-sm text-base-content/70 line-clamp-2">
            {project.initial_prompt}
          </p>
          <div className="card-actions justify-between items-center mt-2">
            <span className="text-xs text-base-content/50">
              Updated {new Date(project.updated_at).toLocaleDateString()}
            </span>
            <button
              onClick={handleDelete}
              className="btn btn-ghost btn-xs text-error"
              title="Delete project"
            >
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
                  d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </Link>
  );
}
