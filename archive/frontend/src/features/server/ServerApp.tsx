import { RouterProvider } from '@tanstack/react-router';
import { router } from '@/router';
import { initSentry } from '@/lib/sentry';

// This module is loaded only for the Python-backed server interface.
void initSentry();
export default function ServerApp() {
  return <RouterProvider router={router} />;
}
