import { useEffect, useMemo, useState } from "react";
import { Download, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const DISMISS_KEY = "cep.install.prompt.dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const isStandaloneDisplay = (): boolean => {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
};

const AppInstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [open, setOpen] = useState(false);
  const [installed, setInstalled] = useState(isStandaloneDisplay());

  const canShowPrompt = useMemo(() => {
    if (typeof window === "undefined") return false;
    if (installed) return false;
    return window.localStorage.getItem(DISMISS_KEY) !== "true";
  }, [installed]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      if (window.localStorage.getItem(DISMISS_KEY) !== "true") {
        window.setTimeout(() => setOpen(true), 1200);
      }
    };

    const handleInstalled = () => {
      setInstalled(true);
      setOpen(false);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    const timer = window.setTimeout(() => {
      if (!deferredPrompt && canShowPrompt && !isStandaloneDisplay()) {
        setOpen(true);
      }
    }, 2000);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      window.clearTimeout(timer);
    };
  }, [canShowPrompt, deferredPrompt]);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      setOpen(false);
      return;
    }

    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    setOpen(false);
    window.localStorage.setItem(DISMISS_KEY, "true");
  };

  const handleDismiss = () => {
    setOpen(false);
    window.localStorage.setItem(DISMISS_KEY, "true");
  };

  if (installed) return null;

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen) handleDismiss();
      else setOpen(true);
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-2 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Smartphone className="h-5 w-5" />
          </div>
          <DialogTitle className="text-xl">Install CEP Tumba app</DialogTitle>
          <DialogDescription>
            Add the app to your phone or computer home screen for faster access without opening the browser each time.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-xl border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
          You can open it like a normal app from your shortcut or home screen.
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleDismiss} className="gap-2">
            <X className="h-4 w-4" />
            Not now
          </Button>
          <Button onClick={() => void handleInstall()} className="gap-2">
            <Download className="h-4 w-4" />
            Install app
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AppInstallPrompt;
