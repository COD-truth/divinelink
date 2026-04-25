import React, { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLang } from "@/contexts/LangContext";
import { db, type User, type UserRole } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LangToggle } from "@/components/LangToggle";
import { ShieldCheck, Loader2, ArrowLeft, UserCog } from "lucide-react";

const roleBadge: Record<UserRole, string> = {
  admin: "bg-destructive text-destructive-foreground",
  doctor: "bg-primary text-primary-foreground",
  receptionist: "bg-secondary text-secondary-foreground",
};

export function LoginScreen() {
  const { login } = useAuth();
  const { t } = useLang();
  const [users, setUsers] = useState<User[]>([]);
  const [selected, setSelected] = useState<User | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    db.users.where("active").equals(1 as any).toArray().then(list => {
      // active may be stored as boolean true – fall back to all users
      if (list.length === 0) db.users.toArray().then(all => setUsers(all.filter(u => u.active !== false)));
      else setUsers(list);
    }).catch(() => db.users.toArray().then(all => setUsers(all.filter(u => u.active !== false))));
  }, []);

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
          <CardDescription>
            {selected ? `${selected.name}` : t("auth.subtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!selected ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground text-center mb-2">
                {t("auth.chooseAccount") || "Choose your account"}
              </p>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {users.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No users</p>
                ) : users.map(u => (
                  <button
                    key={u.id}
                    onClick={() => { setSelected(u); setPin(""); setError(false); }}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border hover:bg-accent transition-colors text-left"
                  >
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                      <UserCog className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{u.name}</p>
                    </div>
                    <Badge className={roleBadge[u.role]}>{t(`role.${u.role}`)}</Badge>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <button
                type="button"
                onClick={() => { setSelected(null); setPin(""); setError(false); }}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="w-3 h-3" /> {t("common.back") || "Back"}
              </button>
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
              {error && <p className="text-destructive text-sm text-center">{t("auth.error")}</p>}
              <Button type="submit" className="w-full h-12 text-lg" disabled={pin.length < 4 || loading}>
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : t("auth.login")}
              </Button>
            </form>
          )}
          <p className="text-xs text-muted-foreground text-center mt-4">PIN: 1234</p>
        </CardContent>
      </Card>
    </div>
  );
}
