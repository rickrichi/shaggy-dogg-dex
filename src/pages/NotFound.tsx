import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="animate-slide-in rounded-lg border border-border bg-card p-8 text-center shadow-md">
        <h1 className="mb-6 text-5xl font-bold text-primary">404</h1>
        <p className="mb-6 text-xl text-card-foreground">Page not found</p>
        <a href="/" className="text-primary underline transition-colors hover:text-primary/80">
          Return to Home
        </a>
      </div>
    </div>
  );
};

export default NotFound;
