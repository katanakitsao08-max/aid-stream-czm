import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { HeartHandshake, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/admin-recovery")({
  head: () => ({
    meta: [
      { title: "Admin recovery — CZMT Welfare" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AdminRecoveryPage,
});

function AdminRecoveryPage() {
  const [secret, setSecret] = useState("");
  const [phone, setPhone] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      return toast.error("Passwords do not match");
    }
    if (newPassword.length < 8) {
      return toast.error("Password must be at least 8 characters");
    }
    setLoading(true);
    try {
      const res = await fetch("/api/public/admin-recovery", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ secret, phone, newPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data?.error ?? "Recovery failed");
        return;
      }
      toast.success("Password reset. You can now sign in.");
      setSecret("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      toast.error(err?.message ?? "Recovery failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2 text-primary">
          <HeartHandshake className="h-6 w-6" />
          <span className="font-semibold">CZMT Welfare</span>
        </Link>
        <Card>
          <CardHeader>
            <div className="mb-2 flex items-center gap-2 text-amber-600">
              <ShieldAlert className="h-5 w-5" />
              <span className="text-xs font-medium uppercase tracking-wide">
                Restricted
              </span>
            </div>
            <CardTitle>Admin password recovery</CardTitle>
            <CardDescription>
              Use this page only if an admin is locked out. Requires the recovery
              secret stored in project settings.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="secret">Recovery secret</Label>
                <Input
                  id="secret"
                  type="password"
                  required
                  autoComplete="off"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Admin phone number</Label>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  placeholder="0712 345 678"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pw">New password</Label>
                <Input
                  id="pw"
                  type="password"
                  minLength={8}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pw2">Confirm new password</Label>
                <Input
                  id="pw2"
                  type="password"
                  minLength={8}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Resetting…" : "Reset admin password"}
              </Button>
              <p className="text-center text-xs text-muted-foreground">
                <Link to="/login" className="underline">
                  Back to sign in
                </Link>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
