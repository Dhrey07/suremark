import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader, Table, Td } from "@/components/ui";
import { formatDateTime } from "@/lib/dates";
import { operatorJobs } from "@/lib/queries";
import { requireActor } from "@/lib/session";

export default async function LineJobsPage() {
  const actor = await requireActor();
  const jobs = await operatorJobs(actor);
  return (
    <>
      <PageHeader title="Line jobs" description="Print jobs for the production lines you are assigned to." />
      <Card>
        {jobs.length === 0 ? (
          <EmptyState>No print jobs on your lines.</EmptyState>
        ) : (
          <Table head={["Batch", "Product", "Line", "Labels", "Status", "Created"]}>
            {jobs.map(({ job, batch, product, line }) => (
              <tr key={job.id} className="hover:bg-slate-50">
                <Td>
                  <Link href={`/app/print-jobs/${job.id}`} className="whitespace-nowrap font-medium text-brand-700">{batch.lot}</Link>
                </Td>
                <Td>{product.name} {product.strength}</Td>
                <Td>{line.name}</Td>
                <Td className="tabular">{job.quantity.toLocaleString()}</Td>
                <Td>
                  <Badge tone={job.status === "completed" ? "neutral" : job.status === "in_progress" ? "blue" : "amber"}>
                    {job.status === "in_progress" ? "In progress" : job.status === "ready" ? "Ready" : "Completed"}
                  </Badge>
                </Td>
                <Td className="whitespace-nowrap text-slate-600">{formatDateTime(job.createdAt)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
