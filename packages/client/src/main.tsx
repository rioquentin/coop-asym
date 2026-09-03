import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("#root introuvable");

// Volontairement sans <StrictMode> : en developpement il monte les effets deux
// fois, ce qui ferait consommer deux des deux sieges de la room par le meme
// joueur. Voir DECISIONS.md.
createRoot(container).render(<App />);
