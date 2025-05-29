import { useEffect, useState } from "react";

export function ScrollToTop() {
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      // Mostra il pulsante solo dopo aver scrollato di 300px
      setShowScrollTop(window.scrollY > 300);
    };
    
    window.addEventListener('scroll', handleScroll);
    
    // Controlla anche all'avvio
    handleScroll();
    
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);
  
  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  };

  if (!showScrollTop) return null;
  
  return (
    <button 
      onClick={scrollToTop}
      className="scroll-to-top fixed bottom-6 right-6 z-30 flex items-center justify-center h-10 w-10 rounded-full bg-primary/80 text-white shadow-md hover:bg-primary transition-all duration-300 animate-in fade-in slide-in-from-bottom-3"
      aria-label="Torna all'inizio"
    >
      <svg 
        xmlns="http://www.w3.org/2000/svg" 
        className="h-5 w-5" 
        fill="none" 
        viewBox="0 0 24 24" 
        stroke="currentColor"
      >
        <path 
          strokeLinecap="round" 
          strokeLinejoin="round" 
          strokeWidth={2} 
          d="M5 10l7-7m0 0l7 7m-7-7v18" 
        />
      </svg>
    </button>
  );
}