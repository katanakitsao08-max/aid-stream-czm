import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Printer, ArrowLeft } from "lucide-react";
import { formatKES } from "@/lib/format";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/receipts/$contributionId")({
  component: ReceiptPage,
});

function ReceiptPage() {
  const { contributionId } = Route.useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["receipt", contributionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contributions")
        .select(
          "*, event:welfare_events(title, event_type, event_date), contributor:profiles!contributions_contributor_id_fkey(full_name, staff_number, school, phone)"
        )
        .eq("id", contributionId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <p className="text-muted-foreground">Loading receipt…</p>;
  if (!data) return <p className="text-muted-foreground">Receipt not found.</p>;

  if (data.status === "pending") {
    return (
      <div className="space-y-4">
        <Link to="/events" className="inline-flex items-center text-sm text-accent">
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Link>
        <p className="text-muted-foreground">
          This contribution is still pending admin confirmation. A receipt will be available once
          confirmed.
        </p>
      </div>
    );
  }

  const refCode = data.mpesa_code ?? data.id.slice(0, 8).toUpperCase();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link to="/events" className="inline-flex items-center text-sm text-accent">
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to events
        </Link>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" /> Print / Save as PDF
        </Button>
      </div>

      <div className="mx-auto max-w-2xl rounded-lg border border-border bg-card p-8 text-card-foreground shadow-sm print:border-0 print:shadow-none">
        <div className="border-b border-border pb-4">
          <h1 className="text-xl font-bold tracking-tight">Central Zone Malindi Teachers Welfare</h1>
          <p className="text-sm text-muted-foreground">Official Contribution Receipt</p>
        </div>

        <div className="mt-6 flex justify-between text-sm">
          <div>
            <p className="text-muted-foreground">Receipt No.</p>
            <p className="font-mono font-medium">{data.id.slice(0, 8).toUpperCase()}</p>
          </div>
          <div className="text-right">
            <p className="text-muted-foreground">Date paid</p>
            <p className="font-medium">{data.paid_at}</p>
          </div>
        </div>

        <div className="mt-6 space-y-1 text-sm">
          <p className="text-muted-foreground">Received from</p>
          <p className="text-base font-semibold">{data.contributor?.full_name ?? "—"}</p>
          <p className="text-muted-foreground">
            {[data.contributor?.staff_number, data.contributor?.school, data.contributor?.phone]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>

        <div className="mt-6 rounded-md border border-border bg-muted/40 p-4">
          <div className="flex items-baseline justify-between">
            <p className="text-sm text-muted-foreground">Amount</p>
            <p className="text-2xl font-bold">{formatKES(Number(data.amount))}</p>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-3 gap-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Event</dt>
            <dd className="font-medium">{data.event?.title ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Type</dt>
            <dd className="font-medium capitalize">{data.event?.event_type ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Event date</dt>
            <dd className="font-medium">{data.event?.event_date ?? "—"}</dd>
          </div>
        </dl>

        <div className="mt-6 border-t border-border pt-4 text-sm">
          <p className="text-muted-foreground">Transaction reference</p>
          <p className="font-mono text-base font-semibold uppercase">{refCode}</p>
          {data.mpesa_code && (
            <p className="mt-1 text-xs text-muted-foreground">Paid via M-Pesa</p>
          )}
        </div>

        {data.notes && (
          <div className="mt-4 text-sm">
            <p className="text-muted-foreground">Notes</p>
            <p>{data.notes}</p>
          </div>
        )}

        <div className="mt-8 flex items-end justify-between border-t border-border pt-6 text-xs text-muted-foreground">
          <div>
            <p>Status: <span className="font-semibold uppercase text-foreground">{data.status}</span></p>
            <p>Generated: {new Date().toLocaleString("en-KE")}</p>
          </div>
          <div className="text-right">
            <p className="border-t border-border pt-1">Welfare Committee</p>
          </div>
        </div>
      </div>
    </div>
  );
}
