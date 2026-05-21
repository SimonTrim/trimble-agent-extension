import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import {
  AuthenticationGuard,
  TIDClient,
  TIDProvider,
} from "@trimble-oss/trimble-id-react";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Root element not found");
}

createRoot(root).render(
  <StrictMode>
    <TIDProvider
      tidClient={
        new TIDClient({
          config: {
            configurationEndpoint:
              "https://id.trimble.com/.well-known/openid-configuration", // Use prod for Trimble Connect
            clientId: import.meta.env.VITE_TID_CLIENT_ID || "YOUR_CLIENT_ID", // Replace with your actual Client ID
            redirectUrl: window.location.origin,
            logoutRedirectUrl: "https://id.trimble.com/oauth/logout",
            scopes: (import.meta.env.VITE_TID_SCOPES || "openid agents").split(","),
          },
        })
      }
      onRedirectCallback={() => {
        window.history.replaceState({}, document.title, window.origin);
      }}
    >
      <AuthenticationGuard
        loader={<div className="flex items-center justify-center h-screen">Loading Trimble ID...</div>}
        renderComponent={<App />}
      />
    </TIDProvider>
  </StrictMode>
);