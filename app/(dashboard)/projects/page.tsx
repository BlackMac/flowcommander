"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { AuthenticatedNavbar } from "@/components/ui/AuthenticatedNavbar";
import type { Project } from "@/types/database";

type SandboxStatus = "running" | "stopped" | "error" | "checking";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [sandboxStatuses, setSandboxStatuses] = useState<Record<string, SandboxStatus>>({});
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      const projectList: Project[] = data.projects || [];
      setProjects(projectList);

      // Check real sandbox status for projects that have sandbox_id
      const projectsWithSandbox = projectList.filter((p) => p.sandbox_id);
      if (projectsWithSandbox.length > 0) {
        // Set initial "checking" state
        const initialStatuses: Record<string, SandboxStatus> = {};
        projectsWithSandbox.forEach((p) => {
          initialStatuses[p.id] = "checking";
        });
        setSandboxStatuses(initialStatuses);

        // Fetch real status
        const statusRes = await fetch("/api/sandbox/status-bulk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectIds: projectsWithSandbox.map((p) => p.id) }),
        });
        const statusData = await statusRes.json();

        // Update statuses
        const realStatuses: Record<string, SandboxStatus> = {};
        for (const projectId in statusData.statuses) {
          realStatuses[projectId] = statusData.statuses[projectId].status;
        }
        setSandboxStatuses(realStatuses);
      }
    } catch (error) {
      console.error("Failed to fetch projects:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/projects/${id}`, { method: "DELETE" });
      setProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (error) {
      console.error("Failed to delete project:", error);
    }
  };

  const handleNewProject = () => {
    router.push("/projects/new");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="loading loading-spinner loading-lg"></span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-200">
      <AuthenticatedNavbar />

      {/* Content */}
      <div className="container mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold mb-6">Your Voice Agents</h1>

        {projects.length === 0 ? (
          <div className="text-center py-16">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1}
              stroke="currentColor"
              className="w-16 h-16 mx-auto text-base-content/30 mb-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"
              />
            </svg>
            <h2 className="text-xl font-semibold mb-2">No agents yet</h2>
            <p className="text-base-content/70 mb-6">
              Create your first AI voice agent to get started
            </p>
            <button onClick={handleNewProject} className="btn btn-primary">
              Create Your First Agent
            </button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                sandboxStatus={sandboxStatuses[project.id]}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
