import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Users, HeartHandshake, Banknote, FileSpreadsheet, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Central Zone Malindi Teachers Welfare" },
      { name: "description", content: "Manage teacher welfare members, dependants, and event-based contributions transparently." },
      { property: "og:title", content: "Central Zone Malindi Teachers Welfare" },
      { property: "og:description", content: "Event-based welfare support for teachers — bereavement, emergencies, and welfare cases." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-primary text-primary-foreground">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-2">
            <HeartHandshake className="h-6 w-6" />
            <span className="font-semibold tracking-tight">CZMT Welfare</span>
          </div>
          <nav className="flex gap-2">
            <Link to="/login">
              <Button variant="secondary" size="sm">Sign in</Button>
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-20 text-center">
        <p className="mb-4 inline-block rounded-full bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
          Central Zone • Malindi
        </p>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
          Teachers Welfare, organised and transparent.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
          Manage members, dependants, and event-based welfare contributions for bereavement,
          emergencies, and other welfare needs — all in one place.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link to="/login">
            <Button size="lg">Get started</Button>
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Users, title: "Member Register", desc: "Teachers, staff numbers, schools & contact details." },
            { icon: HeartHandshake, title: "Dependants", desc: "Each member's dependants linked to their profile." },
            { icon: Banknote, title: "Event Contributions", desc: "Collect only when an event occurs. Track every coin." },
            { icon: FileSpreadsheet, title: "Reports", desc: "Committee-ready exports for every welfare case." },
          ].map((f) => (
            <Card key={f.title}>
              <CardContent className="pt-6">
                <f.icon className="mb-3 h-6 w-6 text-accent" />
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        <ShieldCheck className="mx-auto mb-2 h-5 w-5 text-accent" />
        Secure • Role-based access • Committee-friendly
      </footer>
    </div>
  );
}

// keep redirect import used by other files
void redirect;
