import React, { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { LangToggle } from "@/components/LangToggle";
import { ShieldCheck, Loader2 } from "lucide-react";

export function LoginScreen() {
  const { login } = useAuth();
  const { t } = useLang();
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(false);
    setLoading(true);
    const ok = await login(pin);
    setLoading(false);
    if (!ok) {
      setError(true);
      setPin("");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="absolute top-4 right-4">
        <LangToggle />
      </div>
      <Card className="w-full max-w-sm animate-fade-in">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mb-2">
            <ShieldCheck className="w-8 h-8 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-bold">{t("auth.title")}</CardTitle>
          <CardDescription>{t("auth.subtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder={t("auth.pin")}
                value={pin}
                onChange={e => { setPin(e.target.value.replace(/\D/g, "")); setError(false); }}
                className="text-center text-2xl tracking-[0.5em] h-14"
                autoFocus
              />
              {error && <p className="text-destructive text-sm mt-2 text-center">{t("auth.error")}</p>}
            </div>
            <Button type="submit" className="w-full h-12 text-lg" disabled={pin.length < 4 || loading}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : t("auth.login")}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground text-center mt-4">PIN: 1234</p>
        </CardContent>
      </Card>
    </div>
  );
}
