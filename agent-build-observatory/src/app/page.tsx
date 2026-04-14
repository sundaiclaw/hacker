import { DashboardClient } from "@/components/dashboard-client";
import { getDashboardData } from "@/lib/observability";

export const dynamic = "force-dynamic";

export default async function Home() {
  const data = await getDashboardData();
  return <DashboardClient initialData={data} />;
}
