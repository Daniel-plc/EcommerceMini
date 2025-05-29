import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { useOnboarding } from "@/hooks/use-onboarding";
import { Session, User } from "@supabase/supabase-js";
import logger from "@/lib/logger";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// Logger specifico per la pagina ImpostazioniUtente
const settingsLogger = logger.createLogger('ImpostazioniUtente');

export default function ImpostazioniUtente() {
  const [, setLocation] = useLocation();
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState(false);
  const { startTour, resetTour } = useOnboarding();

  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordErrors, setPasswordErrors] = useState<string[]>([]);

  const { toast } = useToast();

  // Funzione per validare la password
  const validatePassword = (password: string): string[] => {
    const errors: string[] = [];

    if (password.length < 6) {
      errors.push("La password deve contenere almeno 6 caratteri");
    }

    if (!/[A-Z]/.test(password)) {
      errors.push("La password deve contenere almeno una lettera maiuscola");
    }

    if (!/[0-9]/.test(password)) {
      errors.push("La password deve contenere almeno un numero");
    }

    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push(
        'La password deve contenere almeno un carattere speciale (!@#$%^&*(),.?":{}|<>)',
      );
    }

    return errors;
  };

  // Validazione password mentre l'utente digita
  useEffect(() => {
    if (newPassword) {
      setPasswordErrors(validatePassword(newPassword));
    } else {
      setPasswordErrors([]);
    }
  }, [newPassword]);

  useEffect(() => {
    async function getSession() {
      settingsLogger.info("Inizializzazione della pagina impostazioni utente");
      setLoading(true);
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        setSession(session);
        setUser(session?.user || null);
        settingsLogger.info("Sessione utente recuperata con successo");
      } catch (error) {
        settingsLogger.error("Errore nel recupero della sessione:", error);
        toast({
          title: "Errore",
          description: "Non è stato possibile recuperare i dati dell'utente",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    }

    getSession();
  }, []);

  // Reindirizza alla login se non loggato
  useEffect(() => {
    if (!loading && !session) {
      settingsLogger.info("Utente non autenticato, reindirizzamento alla pagina di login");
      setLocation("/login");
    }
  }, [loading, session, setLocation]);

  const handleChangeEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    settingsLogger.info("Avviata procedura di cambio email");

    if (!newEmail) {
      setEmailError("Inserisci una nuova email");
      settingsLogger.warn("Tentativo di cambio email con campo vuoto");
      return;
    }

    if (newEmail === user?.email) {
      setEmailError("La nuova email è uguale a quella attuale");
      settingsLogger.warn("Tentativo di cambio email con email identica all'attuale");
      return;
    }

    setEmailError("");
    setActionInProgress(true);
    settingsLogger.info("Invio richiesta di cambio email a Supabase", { newEmail: newEmail.replace(/(.{2})(.*)(@.*)/, "$1***$3") });

    try {
      const { error } = await supabase.auth.updateUser(
        {
          email: newEmail,
        },
        {
          emailRedirectTo:
            window.location.origin + "/auth/change-email-confirmed",
        },
      );

      if (error) throw error;

      settingsLogger.info("Richiesta di cambio email completata con successo");
      toast({
        title: "Richiesta inviata",
        description: "Controlla la nuova email per confermare la modifica",
      });

      setNewEmail("");
    } catch (error: any) {
      let errorMessage = "Errore durante la richiesta di cambio email";

      if (error.message.includes("rate limit")) {
        errorMessage = "Troppe richieste, riprova tra qualche minuto";
        settingsLogger.warn("Rate limit raggiunto per il cambio email");
      } else if (error.message.includes("already registered")) {
        errorMessage = "Email già registrata da un altro utente";
        settingsLogger.warn("Tentativo di cambio email con email già registrata");
      } else if (error.message) {
        errorMessage = error.message;
        settingsLogger.error("Errore durante il cambio email:", error);
      }

      setEmailError(errorMessage);
      toast({
        title: "Errore",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setActionInProgress(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    settingsLogger.info("Avviata procedura di cambio password");

    if (!newPassword) {
      setPasswordError("Inserisci una nuova password");
      settingsLogger.warn("Tentativo di cambio password con campo vuoto");
      return;
    }

    // Validare con criteri avanzati
    const errors = validatePassword(newPassword);
    if (errors.length > 0) {
      // Mostriamo il primo errore come messaggio principale e manteniamo la lista completa nella UI
      setPasswordError(errors[0]);
      settingsLogger.warn("Tentativo di cambio password con password non valida", { errors: errors });
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("Le password non coincidono");
      settingsLogger.warn("Tentativo di cambio password con password non coincidenti");
      return;
    }

    setPasswordError("");
    setActionInProgress(true);
    settingsLogger.info("Invio richiesta di cambio password a Supabase");

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) throw error;

      settingsLogger.info("Password aggiornata con successo");
      toast({
        title: "Password aggiornata",
        description: "La password è stata modificata con successo",
      });

      setNewPassword("");
      setConfirmPassword("");
      setPasswordErrors([]);
    } catch (error: any) {
      let errorMessage = "Errore durante la modifica della password";

      if (error.message.includes("rate limit")) {
        errorMessage = "Troppe richieste, riprova tra qualche minuto";
        settingsLogger.warn("Rate limit raggiunto per il cambio password");
      } else if (error.message) {
        errorMessage = error.message;
        settingsLogger.error("Errore durante il cambio password:", error);
      }

      setPasswordError(errorMessage);
      toast({
        title: "Errore",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setActionInProgress(false);
    }
  };

  const clearCart = () => {
    localStorage.removeItem("cart");
    window.dispatchEvent(new Event("cartUpdated"));
  };

  const handleDeleteAccount = async () => {
    settingsLogger.info("Avviata procedura di richiesta cancellazione account");
    setActionInProgress(true);

    try {
      // Verifico che l'utente sia loggato e che abbia un ID
      if (!session || !session.user || !session.user.id) {
        settingsLogger.error("Tentativo di cancellazione account senza utente autenticato");
        throw new Error("Utente non autenticato");
      }

      settingsLogger.info("Invio richiesta di cancellazione account al database");
      // Invio richiesta di cancellazione al database (verrà gestita lato admin)
      const { error } = await supabase
        .from("richieste_cancellazione")
        .insert({ user_id: session.user.id });

      if (error) {
        // Se c'è già una richiesta nelle ultime 24h, policy RLS blocca l'inserimento
        if (
          error.code === "23505" ||
          error.message.includes("violates row-level security")
        ) {
          settingsLogger.warn("Utente ha già fatto richiesta nelle ultime 24 ore", { userId: session.user.id });
          throw new Error("Hai già fatto richiesta nelle ultime 24 ore");
        }
        throw error;
      }

      settingsLogger.info("Logout utente dopo richiesta cancellazione");
      // Disconnetto l'utente
      await supabase.auth.signOut();

      // Svuota il carrello locale
      clearCart();
      settingsLogger.info("Carrello svuotato, richiesta completata con successo");

      toast({
        title: "Richiesta inviata",
        description:
          "✅ Richiesta di eliminazione inviata. Sarà completata entro 24 ore.",
      });

      setLocation("/login");
    } catch (error: any) {
      let errorMessage = error.message || "Si è verificato un errore";

      if (errorMessage.includes("già fatto richiesta")) {
        errorMessage = "Hai già fatto richiesta nelle ultime 24 ore";
      } else {
        settingsLogger.error("Errore durante la richiesta di cancellazione account:", error);
      }

      toast({
        title: "Errore",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setActionInProgress(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-primary text-xl font-semibold">
          Caricamento...
        </div>
      </div>
    );
  }

  return (
    <div className="container py-4 sm:py-6 md:py-8">
      <h1 className="text-xl sm:text-2xl font-semibold mb-3 sm:mb-4 md:mb-6 text-slate-800">
        Impostazioni Utente
      </h1>

      <div className="card p-4 sm:p-6 mb-6">
        <div className="mb-4">
          <h2 className="text-base sm:text-lg font-semibold mb-2 text-slate-800">
            Account
          </h2>
          <div className="bg-slate-50 rounded-md p-2.5 sm:p-3 border border-slate-100">
            <p className="text-sm text-slate-600">
              <span className="font-medium">Email attuale:</span> {user?.email}
            </p>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-4 mt-4">
          <h2 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-slate-800 flex items-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 mr-1.5 text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            Cambia Email
          </h2>

          <form onSubmit={handleChangeEmail} className="space-y-3 sm:space-y-4">
            <div>
              <label
                htmlFor="newEmail"
                className="block text-xs sm:text-sm font-medium text-slate-700 mb-1"
              >
                Nuova Email
              </label>
              <input
                id="newEmail"
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary text-sm"
                placeholder="nuova@email.com"
              />
              {emailError && (
                <p className="mt-1 text-xs sm:text-sm text-red-600">
                  {emailError}
                </p>
              )}
            </div>

            <div className="pt-1">
              <button
                type="submit"
                disabled={actionInProgress}
                className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2"
              >
                {actionInProgress ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Aggiornamento...
                  </>
                ) : (
                  <>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 mr-1.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    Aggiorna Email
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        <div className="border-t border-slate-200 pt-4 mt-4">
          <h2 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-slate-800 flex items-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 mr-1.5 text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            Cambia Password
          </h2>

          <form
            onSubmit={handleChangePassword}
            className="space-y-3 sm:space-y-4"
          >
            <div>
              <div className="flex justify-between items-center">
                <label
                  htmlFor="newPassword"
                  className="block text-xs sm:text-sm font-medium text-slate-700 mb-1"
                >
                  Nuova Password
                </label>
                <span className="text-[10px] sm:text-xs text-slate-500">
                  Requisiti di sicurezza
                </span>
              </div>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={`w-full px-3 py-2 border ${
                  passwordErrors.length > 0
                    ? "border-red-300"
                    : "border-slate-300"
                } rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary text-sm`}
                placeholder="Almeno 6 caratteri"
              />

              {/* Requisiti di password o errori */}
              {!newPassword && (
                <div className="mt-2 text-[10px] sm:text-xs text-slate-500 space-y-0.5 sm:space-y-1 bg-slate-50 p-2 rounded-md border border-slate-100">
                  <p>• Almeno 6 caratteri</p>
                  <p>• Almeno una lettera maiuscola (A-Z)</p>
                  <p>• Almeno un numero (0-9)</p>
                  <p>• Almeno un carattere speciale (!@#$%^&*)</p>
                </div>
              )}

              {newPassword && passwordErrors.length > 0 && (
                <div className="mt-2 text-[10px] sm:text-xs text-red-600 space-y-0.5 sm:space-y-1 bg-red-50 p-2 rounded-md border border-red-100">
                  {passwordErrors.map((error, index) => (
                    <p key={index} className="flex items-start">
                      <span className="mr-1 flex-shrink-0">❌</span>
                      <span>{error}</span>
                    </p>
                  ))}
                </div>
              )}

              {newPassword && passwordErrors.length === 0 && (
                <p className="mt-2 text-[10px] sm:text-xs text-green-600 flex items-center bg-green-50 p-2 rounded-md border border-green-100">
                  <span className="mr-1">✅</span>
                  <span>Password sicura</span>
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-xs sm:text-sm font-medium text-slate-700 mb-1"
              >
                Conferma Password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary text-sm"
                placeholder="Ripeti la password"
              />
              {passwordError && (
                <p className="mt-1 text-xs sm:text-sm text-red-600">
                  {passwordError}
                </p>
              )}
            </div>

            <div className="pt-1">
              <button
                type="submit"
                disabled={actionInProgress}
                className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2"
              >
                {actionInProgress ? (
                  <>
                    <svg
                      className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      ></circle>
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                    Aggiornamento...
                  </>
                ) : (
                  <>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-4 w-4 mr-1.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    Aggiorna Password
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        <div className="border-t border-slate-200 pt-4 mt-4">
          <h2 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-slate-800 flex items-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 mr-1.5 text-primary"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Tour Guidato
          </h2>
          
          <p className="text-sm text-slate-600 mb-4">
            Il tour guidato ti mostra le principali funzionalità dell'applicazione. Puoi avviarlo in qualsiasi momento.
          </p>
          
          <div className="flex flex-wrap gap-4">
            <button
              onClick={() => {
                // Prima reindirizza alla pagina prodotti, poi avvia il tour
                // Impostiamo un flag nel localStorage per indicare che il tour deve partire
                localStorage.setItem('ordini-app-avvia-tour', 'true');
                toast({
                  title: "Tour in avvio",
                  description: "Reindirizzamento alla pagina prodotti per iniziare il tour",
                });
                setLocation("/products");
              }}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 mr-1.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Avvia Tour
            </button>
            
            <button
              onClick={() => {
                resetTour();
                toast({
                  title: "Tour reimpostato",
                  description: "Il tour guidato è stato reimpostato e verrà mostrato al prossimo login",
                });
              }}
              className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-4 py-2"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-4 w-4 mr-1.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Reimposta Tour
            </button>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-4 mt-4">
          <h2 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4 text-red-600 flex items-center">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 mr-1.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            Zona Pericolosa
          </h2>

          <div className="bg-red-50 rounded-md p-3 mb-3 border border-red-100">
            <p className="text-xs sm:text-sm text-red-700">
              Questa azione è irreversibile e comporterà la perdita di tutti i
              tuoi dati.
            </p>
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background bg-red-600 text-white hover:bg-red-700 h-9 px-4 py-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-4 w-4 mr-1.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
                Elimina Account
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent className="max-w-sm">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-lg">
                  Sei sicuro di voler eliminare il tuo account?
                </AlertDialogTitle>
                <AlertDialogDescription className="text-xs sm:text-sm">
                  Questa azione non può essere annullata. Eliminerà
                  permanentemente il tuo account e i dati correlati.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="flex flex-col sm:flex-row sm:space-x-2 space-y-2 sm:space-y-0 sm:justify-end">
                <AlertDialogCancel className="mt-0 text-sm">
                  Annulla
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteAccount}
                  className="bg-red-600 hover:bg-red-700 text-white text-sm"
                >
                  {actionInProgress ? (
                    <>
                      <svg
                        className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        ></circle>
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                      Eliminazione...
                    </>
                  ) : (
                    <>Elimina Account</>
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="flex justify-center">
        <button
          onClick={() => setLocation("/products")}
          className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none ring-offset-background bg-primary text-primary-foreground hover:bg-primary/90 h-10 py-2 px-4"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4 mr-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
            />
          </svg>
          Torna ai prodotti
        </button>
      </div>
    </div>
  );
}
