import { Card } from "@/components/common/Card";
import { EmptyState } from "@/components/common/States";

/** Placeholder for screens not yet in scope. */
export function ComingSoon({ title }: { title: string }) {
  return (
    <Card>
      <EmptyState title={`${title} isn't connected yet`} description="The backend does not provide this resource yet, so this screen is unavailable." />
    </Card>
  );
}
