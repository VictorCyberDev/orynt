import { createContext, useContext, useState, type ReactNode } from "react";

export type Lang = "en" | "fr";
/** FRENCH IS UNREVIEWED: written by the build assistant, not a native-speaker translator. Shown with a visible notice. */
const fr: Record<string, string> = {
  "nav.overview": "Aperçu",
  "nav.payouts": "Paiements",
  "nav.approvals": "Approbations",
  "nav.incidents": "Incidents",
  "nav.connections": "Portefeuilles",
  "nav.team": "Équipe et règles",
  "nav.activity": "Journal",
  "nav.developers": "Développeurs",
  "nav.settings": "Réglages",
  "nav.verify": "Vérifier un reçu",
  "home.title": "Vos paiements, sous contrôle.",
  "home.attention": "À traiter maintenant",
  "home.empty": "Rien ne demande votre attention.",
  "btn.newPayout": "Nouveau paiement",
  "btn.signIn": "Se connecter",
  "btn.signOut": "Se déconnecter",
  "btn.approve": "Signer et approuver",
  "btn.send": "Envoyer le paiement",
  "btn.checkWallet": "Vérifier le portefeuille",
  "btn.submit": "Soumettre pour approbation",
  "btn.cancel": "Annuler",
  "btn.receipt": "Télécharger le reçu",
  "state.DRAFT": "Brouillon",
  "state.AWAITING_APPROVAL": "En attente d'approbation",
  "state.APPROVED": "Approuvé",
  "state.EXECUTION_RESERVED": "Démarrage",
  "state.DISPATCHING": "Envoi…",
  "state.PENDING": "En cours",
  "state.UNKNOWN": "Vérification du portefeuille",
  "state.RECONCILING": "Vérification du portefeuille",
  "state.SETTLED": "Réglé",
  "state.SIMULATED_SETTLED": "Simulé",
  "state.DEFINITIVELY_FAILED": "Échec confirmé",
  "state.REJECTED": "Rejeté",
  "state.CANCELLED": "Annulé",
  known: "Ce que nous savons",
  unknown: "Ce que nous ne savons pas encore",
  next: "Prochaine étape",
  "fr.notice": "Traduction française non vérifiée par un relecteur natif.",
};
const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: (k: string, en: string) => string }>({
  lang: "en",
  setLang: () => {},
  t: (_k, en) => en,
});
export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setL] = useState<Lang>(() => {
    try {
      return (localStorage.getItem("orynt.lang") as Lang) || "en";
    } catch {
      return "en";
    }
  });
  const setLang = (l: Lang) => {
    setL(l);
    try {
      localStorage.setItem("orynt.lang", l);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = l;
  };
  const t = (k: string, en: string) => (lang === "fr" ? (fr[k] ?? en) : en);
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}
export const useI18n = () => useContext(Ctx);
