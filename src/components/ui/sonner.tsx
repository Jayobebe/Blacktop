import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="top-center"
      // Under the notch or Dynamic Island a toast (and its action button) can't be read or pressed.
      offset={{ top: "max(24px, calc(var(--safe-top) + 8px))", left: "max(24px, var(--safe-left))", right: "max(24px, var(--safe-right))" }}
      mobileOffset={{ top: "max(16px, calc(var(--safe-top) + 8px))", left: "max(16px, var(--safe-left))", right: "max(16px, var(--safe-right))" }}
      toastOptions={{
        classNames: {
          toast:
            "group toast frost-accent group-[.toaster]:!bg-card/60 group-[.toaster]:text-foreground group-[.toaster]:shadow-2xl group-[.toaster]:rounded-2xl group-[.toaster]:text-sm",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:text-xs",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
