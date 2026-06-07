import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { HeartHandshake } from "lucide-react";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in — CZMT Welfare" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && user) {
      navigate({ to: "/dashboard", replace: true });
    }
  }, [user, isLoading, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-12">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2 text-primary">
          <HeartHandshake className="h-6 w-6" />
          <span className="font-semibold">CZMT Welfare</span>
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>Welcome</CardTitle>
            <CardDescription>Sign in or register your welfare account.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Register</TabsTrigger>
              </TabsList>
              <TabsContent value="signin"><SignInForm /></TabsContent>
              <TabsContent value="signup"><SignUpForm /></TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Convert a Kenyan phone number to a canonical form: 2547XXXXXXXX
function normalizePhone(raw: string): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("254") && digits.length === 12) return digits;
  if (digits.startsWith("0") && digits.length === 10) return "254" + digits.slice(1);
  if (digits.length === 9 && digits.startsWith("7")) return "254" + digits;
  return null;
}

// Internal email synthesized from phone so Supabase Auth has an identifier.
// Users never see or type this.
function phoneToEmail(phone: string): string {
  return `${phone}@czmt.local`;
}

function SignInForm() {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const norm = normalizePhone(phone);
    if (!norm) return toast.error("Enter a valid phone number, e.g. 0712 345 678");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: phoneToEmail(norm),
      password,
    });
    setLoading(false);
    if (error) toast.error("Invalid phone or password");
    else toast.success("Signed in");
  };

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-4">
      <div className="space-y-2">
        <Label htmlFor="phone">Phone number</Label>
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
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

function SignUpForm() {
  const [fullName, setFullName] = useState("");
  const [staffNumber, setStaffNumber] = useState("");
  const [school, setSchool] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const norm = normalizePhone(phone);
    if (!norm) return toast.error("Enter a valid phone number, e.g. 0712 345 678");
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: phoneToEmail(norm),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { full_name: fullName, staff_number: staffNumber, school, phone: norm },
      },
    });
    setLoading(false);
    if (error) {
      if (/already|registered|exists/i.test(error.message)) {
        toast.error("That phone number is already registered. Try signing in.");
      } else {
        toast.error(error.message);
      }
      return;
    }
    toast.success("Account created — you're signed in.");
  };

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-3">
      <div className="space-y-2">
        <Label htmlFor="fn">Full name</Label>
        <Input id="fn" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ph">Phone number</Label>
        <Input
          id="ph"
          type="tel"
          inputMode="tel"
          placeholder="0712 345 678"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="staff">Staff no.</Label>
          <Input id="staff" value={staffNumber} onChange={(e) => setStaffNumber(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sch">School</Label>
          <Input id="sch" value={school} onChange={(e) => setSchool(e.target.value)} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="pw">Password</Label>
        <Input id="pw" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Creating…" : "Create account"}
      </Button>
    </form>
  );
}
