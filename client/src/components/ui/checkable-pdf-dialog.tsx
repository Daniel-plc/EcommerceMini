import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { generateOrderPDF } from "@/lib/pdf";
import { StoricoOrdine, RigaOrdine } from "@/lib/model";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { formatConfigurazione } from "@/lib/utils";
import { getCodiceProdotto, precaricaCodiciProdotto } from "@/lib/supabase";
import { CodiceProdotto } from "@/components/ui/codice-prodotto";
import logger from "@/lib/logger";

// Logger specifico per il componente CheckablePdfDialog
const pdfDialogLogger = logger.createLogger('CheckablePdfDialog');

interface CheckablePdfDialogProps {
  order: StoricoOrdine | null;
  isOpen: boolean;
  onClose: () => void;
}

export function CheckablePdfDialog({ order, isOpen, onClose }: CheckablePdfDialogProps) {
  // Stato locale per tenere traccia delle righe spuntate
  const [checkedRows, setCheckedRows] = useState<Record<string, Record<string, boolean>>>({});
  // Stato per memorizzare i codici prodotto recuperati
  const [codiciProdotto, setCodiciProdotto] = useState<Record<string, string>>({});
  // Riferimento al contenitore con scroll
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Recupera i codici prodotto quando il dialog viene aperto
  useEffect(() => {
    // Reset dello stato quando il dialog si chiude
    if (!isOpen) {
      setCodiciProdotto({});
      return;
    }
    
    if (isOpen && order?.righe) {
      // Funzione ottimizzata per recuperare i codici prodotto
      const fetchCodici = async () => {
        const codici: Record<string, string> = {};
        
        // Estrai tutti gli ID prodotto per il precaricamento batch
        const prodottiIds = order.righe
          .filter(riga => riga.prodotto_id !== undefined)
          .map(riga => riga.prodotto_id as number)
          .filter((id, index, self) => self.indexOf(id) === index); // Deduplica
        
        try {
          // Precarica tutti i codici in una singola chiamata API (mette in cache globale)
          if (prodottiIds.length > 0) {
            await precaricaCodiciProdotto(prodottiIds);
          }
          
          // Ora recupera i codici dalla cache globale in parallelo
          const promises = order.righe.map(async (riga) => {
            if (riga.prodotto_id && riga.configurazione) {
              try {
                const codice = await getCodiceProdotto(riga.prodotto_id, riga.configurazione);
                if (codice) {
                  // Usiamo una chiave univoca basata su prodotto e configurazione
                  // Usa configurazione ordinata per chiave di cache coerente
          const configOrdinata = ordinaConfigurazione(riga.configurazione);
          const key = `${riga.prodotto_id}-${JSON.stringify(configOrdinata)}`;
                  return { key, codice };
                }
              } catch (err) {
                pdfDialogLogger.error("Errore recupero codice prodotto:", err);
              }
            }
            return null;
          });
          
          // Attendi tutte le richieste in parallelo
          const results = await Promise.all(promises);
          
          // Popola l'oggetto codici (solo se il dialog è ancora aperto)
          if (isOpen) {
            results.forEach(result => {
              if (result) {
                codici[result.key] = result.codice;
              }
            });
            
            setCodiciProdotto(codici);
          }
        } catch (err) {
          pdfDialogLogger.error("Errore nel recupero dei codici prodotto:", err);
        }
      };
      
      fetchCodici();
    }
  }, [isOpen, order]);

  // Recupera lo stato di una riga specifica
  const isRowChecked = (prodottoIndex: number, rigaIndex: number) => {
    const prodKey = prodottoIndex.toString();
    const rigaKey = rigaIndex.toString();
    return checkedRows[prodKey]?.[rigaKey] || false;
  };

  // Gestisce il cambio di stato di una riga
  const toggleRowCheck = (prodottoIndex: number, rigaIndex: number) => {
    setCheckedRows(prev => {
      const prodKey = prodottoIndex.toString();
      const rigaKey = rigaIndex.toString();
      const prodottoChecks = prev[prodKey] || {};
      return {
        ...prev,
        [prodKey]: {
          ...prodottoChecks,
          [rigaKey]: !prodottoChecks[rigaKey]
        }
      };
    });
  };

  // Funzione per spuntare o deselezionare tutte le righe di un prodotto
  const toggleAllRowsForProduct = (prodottoIndex: number, righe: RigaOrdine[], checked: boolean) => {
    setCheckedRows(prev => {
      const prodKey = prodottoIndex.toString();
      const productChecks: Record<string, boolean> = {};
      righe.forEach((_, index) => {
        productChecks[index.toString()] = checked;
      });
      
      return {
        ...prev,
        [prodKey]: productChecks
      };
    });
  };
  
  // Recupera il codice prodotto dalla cache
  const getCodiceProdottoFromCache = (riga: RigaOrdine): string | null => {
    if (!riga.prodotto_id || !riga.configurazione) return null;
    
    // Utilizza una chiave di cache creata in modo deterministico
    // Ordina le chiavi per evitare differenze dovute all'ordine
    const configOrdinata = Object.keys(riga.configurazione)
      .sort()
      .reduce((obj, key) => {
        obj[key] = riga.configurazione[key];
        return obj;
      }, {} as Record<string, string>);
    
    const key = `${riga.prodotto_id}-${JSON.stringify(configOrdinata)}`;
    return codiciProdotto[key] || null;
  };

  // Genera il PDF con le spunte aggiornate
  const handleGeneratePDF = () => {
    if (!order) return;
    
    // Registriamo solo il numero delle righe selezionate per questioni di performance
  const righeSelezionate = Object.values(checkedRows).reduce((count, prodotto) => 
    count + Object.values(prodotto).filter(Boolean).length, 0);
  pdfDialogLogger.info(`Generazione PDF: ${righeSelezionate} righe selezionate`);
    
    // Crea una copia profonda dell'ordine per evitare mutazioni
    const orderCopy: StoricoOrdine = JSON.parse(JSON.stringify(order));
    
    // Raggruppa le righe originali per identificarle correttamente
    const originalGroups = groupByProduct(orderCopy.righe || []);
    
    // Aggiorna il flag 'checked' per ciascuna riga usando i gruppi visibili nel dialog
    // Questo metodo utilizza gli stessi indici che sono usati nella UI
    originalGroups.forEach((group, prodottoIndex) => {
      group.righe.forEach((riga, rigaIndex) => {
        // Determina se questa riga specifica è stata spuntata
        const isChecked = isRowChecked(prodottoIndex, rigaIndex);
        
        // Assegna in modo esplicito e deterministico
        riga.checked = isChecked;
        
        // Aggiungi il codice prodotto se disponibile
        const codice = getCodiceProdottoFromCache(riga);
        if (codice) {
          (riga as any).temp_codice_prodotto = codice;
        }
      });
    });
    
    // Riassegna le righe modificate all'ordine
    const allRows: RigaOrdine[] = [];
    originalGroups.forEach(group => {
      group.righe.forEach(riga => {
        allRows.push(riga);
      });
    });
    orderCopy.righe = allRows;
    
    // Genera il PDF
    generateOrderPDF(orderCopy);
    onClose();
  };
  

  
  // Funzione helper per ordinare le chiavi della configurazione per confronti coerenti
  const ordinaConfigurazione = (configurazione: Record<string, string>): Record<string, string> => {
    if (!configurazione) return {};
    return Object.keys(configurazione)
      .sort()
      .reduce((obj, key) => {
        obj[key] = configurazione[key];
        return obj;
      }, {} as Record<string, string>);
  };
  
  // Raggruppa le righe per prodotto
  function groupByProduct(rows: RigaOrdine[]) {
    const map: Record<string, RigaOrdine[]> = {};
    rows.forEach(r => { 
      map[r.nome_prodotto] = map[r.nome_prodotto] || []; 
      map[r.nome_prodotto].push(r); 
    });
    return Object.entries(map).map(([nome, righe]) => ({ nome, righe }));
  }

  // Formatta la configurazione utilizzando la funzione condivisa
  function formatConfig(conf: Record<string, string>, prodottoId?: number): string {
    if (!conf || Object.keys(conf).length === 0) return 'Nessuna configurazione';
    // Utilizza la funzione formatConfigurazione con il prodottoId
    return formatConfigurazione(conf, prodottoId).join(' - ');
  }
  
  if (!order) return null;

  // Raggruppa le righe per prodotto
  const groups = groupByProduct(order.righe || []);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[calc(100%-24px)] sm:w-[550px] md:w-[650px] lg:max-w-3xl max-h-[85vh] overflow-y-auto p-4">
        <DialogHeader className="pb-2">
          <DialogTitle className="text-base sm:text-lg">Prepara PDF con elementi spuntabili</DialogTitle>
          <DialogDescription className="text-xs leading-normal mt-1">
            Seleziona gli elementi da contrassegnare come verificati nel PDF. 
            I quadratini saranno già spuntati nel documento.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 sm:py-4 relative">
          <div className="text-xs sm:text-sm font-medium mb-2">
            Ordine #{order.n_ordine || order.id} - {format(new Date(order.data_ordine), "d MMMM yyyy", { locale: it })}
          </div>

          <div 
            ref={scrollContainerRef}
            className="space-y-4 mt-4 max-h-[calc(70vh-8rem)] overflow-y-auto pr-1"
          >
            {groups.map((group, prodottoIndex) => (
              <div key={prodottoIndex} className="border rounded-md overflow-hidden">
                <div className="bg-slate-50 px-3 sm:px-4 py-2 sm:py-3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                  <div className="font-medium">
                    {group.nome}
                    {/* Rimuoviamo il codice dall'intestazione del gruppo, lo mostriamo solo nelle righe */}
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2 self-end sm:self-auto">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-xs h-7 sm:h-8 px-2 sm:px-3 flex items-center gap-1"
                      onClick={() => toggleAllRowsForProduct(prodottoIndex, group.righe, true)}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                        <polyline points="9 11 12 14 22 4"></polyline>
                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                      </svg>
                      <span className="hidden xs:inline">Seleziona </span>tutti
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-xs h-7 sm:h-8 px-2 sm:px-3 flex items-center gap-1"
                      onClick={() => toggleAllRowsForProduct(prodottoIndex, group.righe, false)}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                      </svg>
                      <span className="hidden xs:inline">Deseleziona </span>tutti
                    </Button>
                  </div>
                </div>

                <div className="divide-y">
                  {group.righe.map((riga, rigaIndex) => (
                    <div key={rigaIndex} className="px-3 sm:px-4 py-2.5 sm:py-3 flex items-start sm:items-center">
                      <Checkbox 
                        id={`row-${prodottoIndex}-${rigaIndex}`}
                        checked={isRowChecked(prodottoIndex, rigaIndex)}
                        onCheckedChange={() => toggleRowCheck(prodottoIndex, rigaIndex)}
                        className="mr-2 sm:mr-3 mt-0.5 sm:mt-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap sm:flex-nowrap sm:items-center gap-1 sm:gap-2">
                          <label 
                            htmlFor={`row-${prodottoIndex}-${rigaIndex}`}
                            className="font-medium cursor-pointer flex-1 text-sm sm:text-base truncate flex items-center flex-wrap"
                          >
                            <span>{riga.nome_prodotto}</span>
                            {/* Utilizziamo il componente CodiceProdotto per coerenza in tutta l'app */}
                            <div className="ml-1.5">
                              <CodiceProdotto 
                                prodottoId={riga.prodotto_id || 0} 
                                configurazione={riga.configurazione || {}} 
                                className="ml-0 text-[10px]"
                                prefisso="Cod."
                              />
                            </div>
                          </label>
                          <Badge variant="outline" className="text-xs px-1.5 py-0.5 order-first sm:order-last sm:ml-auto">
                            Qta: {riga.quantità}
                          </Badge>
                        </div>
                        
                        <div className="text-xs sm:text-sm text-slate-500 mt-1 line-clamp-2">
                          {formatConfig(riga.configurazione || {}, riga.prodotto_id)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>


        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-2 mt-3">
          <Button 
            variant="outline" 
            onClick={onClose}
            size="sm"
            className="mt-2 sm:mt-0 w-full sm:w-auto text-xs sm:text-sm py-1.5 px-3 h-9"
          >
            Annulla
          </Button>
          <Button 
            onClick={handleGeneratePDF}
            size="sm"
            className="w-full sm:w-auto text-xs sm:text-sm py-1.5 px-3 h-9 flex items-center justify-center gap-1.5"
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              viewBox="0 0 20 20" 
              fill="currentColor" 
              className="w-3.5 h-3.5"
            >
              <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
              <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
            </svg>
            Scarica PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}