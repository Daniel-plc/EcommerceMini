import { Link, useLocation } from "wouter";
import { supabase, getCartKey } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useSupabaseAuth } from '@/hooks/useSupabase';
import { useState, useEffect, useRef } from "react";
import { Menu, X, ShoppingCart, HistoryIcon, Settings, LogOut, Package, Clock } from "lucide-react";

const Navbar = () => {
  // IMPORTANTE: Hook useLocation sempre all'inizio della funzione
  const [location, setLocation] = useLocation();
  const pathname = location; // Usiamo location direttamente
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { signOut } = useSupabaseAuth();
  const [cartCount, setCartCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node) && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    }
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [mobileMenuOpen]);

  // Close menu on resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768 && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [mobileMenuOpen]);

  // Listen to local storage changes for cart count
  useEffect(() => {
    const updateCartCount = (event?: CustomEvent) => {
      // Se l'evento ha un dettaglio con cartKey, usa quella chiave specifica
      const cartKey = event?.detail?.cartKey || getCartKey();
      // Aggiornamento conteggio carrello
      const cart = JSON.parse(localStorage.getItem(cartKey) || "[]");
      setCartCount(cart.length);
    };

    // Initial load
    updateCartCount();

    // Listen for storage events from other tabs
    const handleStorageEvent = (e: StorageEvent) => {
      const currentCartKey = getCartKey();
      
      // Verifica se la chiave modificata è quella del carrello dell'utente attuale o altri carrelli
      if (e.key === currentCartKey || e.key === "cart" || e.key?.startsWith("cart_")) {
        updateCartCount();
      }
    };
    window.addEventListener("storage", handleStorageEvent);

    // Create a custom event listener for the current tab
    // con throttling per limitare il numero di aggiornamenti
    let lastUpdateTime = 0;
    const THROTTLE_TIME = 300; // ms
    
    const handleCartUpdated = (event: Event) => {
      const customEvent = event as CustomEvent;
      const now = Date.now();
      // Verifica se è una richiesta di aggiornamento forzato (come nel riordino massivo)
      const forceUpdate = customEvent.detail?.forceUpdate === true;
      
      // Se è un aggiornamento forzato o è passato abbastanza tempo dall'ultimo aggiornamento
      if (forceUpdate || now - lastUpdateTime > THROTTLE_TIME) {
        updateCartCount(customEvent);
        lastUpdateTime = now;
      }
    };
    window.addEventListener("cartUpdated", handleCartUpdated);

    // Aggiungi listener per cambiamenti di autenticazione
    // con throttling per evitare aggiornamenti multipli
    const handleAuthChange = () => {
      // Forza l'aggiornamento dopo un breve ritardo per dare tempo al sistema
      // di aggiornare le sessioni
      setTimeout(() => {
        const cartKey = getCartKey();
        updateCartCount();
      }, 200); // Ritardo aumentato per dar tempo alle operazioni di autenticazione
    };
    window.addEventListener("authChange", handleAuthChange);

    return () => {
      window.removeEventListener("storage", handleStorageEvent);
      window.removeEventListener("cartUpdated", handleCartUpdated);
      window.removeEventListener("authChange", handleAuthChange);
    };
  }, []);

  const handleLogout = async () => {
    try {
      await signOut();
      queryClient.clear();
      setLocation("/login");
      toast({
        description: "Disconnessione effettuata con successo",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Errore",
        description: "Si è verificato un errore durante la disconnessione",
      });
    }
  };

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const navItems = [
    {
      href: "/products",
      label: "Prodotti",
      icon: <Package size={18} className="mr-2" />,
      active: pathname === "/products"
    },
    {
      href: "/order",
      label: "Ordine",
      icon: <ShoppingCart size={18} className="mr-2" />,
      active: pathname === "/order",
      badge: cartCount > 0 ? cartCount : null
    },
    {
      href: "/history",
      label: "Storico",
      icon: <HistoryIcon size={18} className="mr-2" />,
      active: pathname === "/history"
    },
    {
      href: "/account/settings",
      label: "Impostazioni",
      icon: <Settings size={18} className="mr-2" />,
      active: pathname === "/account/settings"
    }
  ];

  return (
    <header className="navbar bg-white shadow-sm sticky top-0 z-50">
      <div className="container py-3 md:py-4">
        {/* Desktop navigation */}
        <div className="hidden md:flex md:items-center md:justify-between">
          <Link href="/products" className="flex items-center">
            <h1 className="text-xl font-semibold text-primary">Ordini App</h1>
          </Link>
          
          <div className="flex items-center space-x-4">
            {/* Indicatore sessione temporanea rimosso come richiesto */}
            
            {/* Desktop menu items */}
            {navItems.map((item) => (
              <Link 
                key={item.href}
                href={item.href}
                className={`
                  flex items-center px-3 py-2 rounded-md text-base
                  ${item.active 
                    ? "bg-primary/10 text-primary font-medium" 
                    : "text-slate-700 hover:bg-slate-50"
                  } transition-colors
                  ${item.href === "/order" ? "cart-button" : ""}
                `}
              >
                {item.icon}
                <span>{item.label}</span>
                {item.badge && (
                  <span className="inline-flex ml-2 bg-primary text-white text-xs rounded-full w-5 h-5 items-center justify-center">
                    {item.badge}
                  </span>
                )}
              </Link>
            ))}
            
            {/* Desktop logout button */}
            <button
              onClick={handleLogout}
              className="flex items-center px-3 py-2 rounded-md text-base
                text-red-600 hover:bg-red-50 transition-colors ml-2"
              aria-label="Esci dall'applicazione"
            >
              <LogOut size={18} className="mr-2" />
              <span>Esci</span>
            </button>
          </div>
        </div>
        
        {/* Mobile navigation */}
        <div className="md:hidden flex items-center justify-between" ref={menuRef}>
          <Link href="/products" className="flex items-center">
            <h1 className="text-xl font-semibold text-primary">Ordini App</h1>
          </Link>
          
          {/* Mobile menu hamburger */}
          <button 
            className="flex items-center justify-center text-slate-600 w-10 h-10 rounded-md hover:bg-slate-100" 
            onClick={toggleMobileMenu}
            aria-label={mobileMenuOpen ? "Chiudi menu" : "Apri menu"}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          
          {/* Mobile menu overlay with backdrop blur effect */}
          {mobileMenuOpen && (
            <div 
              className="fixed inset-0 bg-black/30 backdrop-blur-md z-40 transition-all duration-300"
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  setMobileMenuOpen(false);
                }
              }}
            >
              {/* Mobile menu panel */}
              <div className="fixed left-0 top-0 bottom-0 w-[70%] max-w-[260px] bg-white z-50 shadow-xl 
                transform transition-all duration-300 ease-in-out flex flex-col rounded-r-xl">
                
                <div className="pt-16 flex flex-col h-full relative">
                  {/* Menu header with close button - with subtle bottom shadow */}
                  <div className="absolute right-0 top-0 left-0 flex items-center justify-between p-4 pb-3 shadow-sm bg-white rounded-tr-xl">
                    <span className="text-base font-medium text-slate-800">Menu</span>
                    <button 
                      className="text-slate-600 hover:text-slate-900 hover:bg-slate-100 p-2 rounded-full transition-colors" 
                      onClick={() => setMobileMenuOpen(false)}
                      aria-label="Chiudi menu"
                    >
                      <X size={18} />
                    </button>
                  </div>
                  
                  {/* Mobile menu items - with top margin for separation from header */}
                  <div className="flex-grow overflow-y-auto no-scrollbar">
                    {/* Indicatore sessione temporanea (mobile) rimosso come richiesto */}
                    
                    <ul className="space-y-2 px-3 mt-3">
                      {navItems.map((item) => (
                        <li key={item.href} className="w-full">
                          <Link 
                            href={item.href}
                            className={`
                              flex items-center w-full text-base px-3 py-3 rounded-md 
                              ${item.active 
                                ? "text-white bg-primary font-medium" 
                                : "text-slate-700 hover:bg-slate-100"
                              } transition-colors
                              ${item.href === "/order" ? "cart-button-mobile" : ""}
                            `}
                            onClick={() => setMobileMenuOpen(false)}
                          >
                            <div className="w-7 flex-shrink-0 flex items-center justify-center">
                              {item.icon}
                            </div>
                            <span className="truncate">{item.label}</span>
                            {item.badge && (
                              <span className="inline-flex ml-2 bg-white text-primary text-xs rounded-full w-5 h-5 items-center justify-center flex-shrink-0">
                                {item.badge}
                              </span>
                            )}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  {/* Mobile logout button - at the bottom */}
                  <div className="px-3 py-4 pb-6 mt-auto border-t border-slate-200">
                    <button
                      onClick={() => {
                        handleLogout();
                        setMobileMenuOpen(false);
                      }}
                      className="flex items-center w-full text-base px-3 py-3 rounded-md
                        text-red-600 hover:bg-red-50 transition-colors font-medium"
                      aria-label="Esci dall'applicazione"
                    >
                      <div className="w-7 flex-shrink-0 flex items-center justify-center">
                        <LogOut size={18} />
                      </div>
                      <span>Esci</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Navbar;
