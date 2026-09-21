"use client";

import { type ReactNode } from "react";
import { motion } from "framer-motion";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

export function AppShell({
  children,
  title,
  subtitle,
  actions,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="min-h-screen transition-[margin] duration-300 ease-out lg:mr-64">
        <Header title={title} subtitle={subtitle} actions={actions} />
        <motion.main
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: "easeOut" }}
          className="mx-auto w-full max-w-[1600px] p-3 sm:p-5 lg:p-6"
        >
          {children}
        </motion.main>
      </div>
    </div>
  );
}
