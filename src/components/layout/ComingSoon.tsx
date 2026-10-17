import { Card } from "@/components/common/Card";
import { EmptyState } from "@/components/common/States";

/** Placeholder for screens not yet in scope. */
export function ComingSoon({ title }: { title: string }) {
  return (
    <Card>
      <EmptyState title={`${title} isn't built yet`} description="This screen is planned for a later phase after the dashboard is reviewed." />
    </Card>
  );
}
