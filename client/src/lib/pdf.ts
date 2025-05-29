import jsPDF from "jspdf";
// @ts-ignore - Importiamo la libreria ignorando errori di tipo
import autoTable from "jspdf-autotable";
import { StoricoOrdine, RigaOrdine } from "./model";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { formatConfigurazione } from "./utils";
import logger from "./logger";

// Logger specifico per il modulo PDF
const pdfLogger = logger.createLogger('PDF');

/**
 * Genera PDF a due colonne con numerazione, header ripetuti,
 * celle adattive, testi uniformi e centrati.
 * 
 * I codici prodotto vengono già trasferiti da checkable-pdf-dialog tramite 
 * la proprietà temp_codice_prodotto di ogni riga, quindi non c'è più bisogno
 * di recuperarli nuovamente qui.
 */
export function generateOrderPDF(order: StoricoOrdine): void {
  try {
    // Log iniziale con informazioni essenziali sull'ordine - un unico log per tutto l'ordine
    const numRighe = (order.righe || []).length;
    const numRigheSelezionate = (order.righe || []).filter(r => (r as any).checked === true).length;
    pdfLogger.info(`Generazione PDF ordine #${order.id}: ${numRighe} righe totali, ${numRigheSelezionate} selezionate`);
    
    // Clonazione
    const clonedOrder = JSON.parse(JSON.stringify(order)) as StoricoOrdine;
    
    // Generiamo il PDF con i dati già preparati
    generateOrderPDFInternal(clonedOrder);
    
    // Log di conferma
    pdfLogger.info(`PDF ordine #${order.id} completato con successo`);
  } catch (e) {
    pdfLogger.error("Errore nella generazione del PDF:", e);
  }
}

/**
 * Implementazione interna del generatore PDF
 * Approccio semplificato senza hooks complessi che non funzionavano
 */
function generateOrderPDFInternal(order: StoricoOrdine): void {
  // Creiamo il documento PDF
  const doc = new jsPDF();
  
  // Margini standard e dimensioni del documento
  const M = 10;
  const W = doc.internal.pageSize.width;
  const H = doc.internal.pageSize.height;
  const CONTENT_W = W - 2 * M;
  
  // Data formattata in italiano
  const dataFmt = format(new Date(order.data_ordine), "d MMMM yyyy", { locale: it });
  
  // Definizione delle dimensioni delle celle e colonne
  const cellStyles = {
    padding: 2,
    lineHeight: 7.5,  // Altezza riga ridotta ancora di più per matching con lo stile originale
    fontSize: 9
  };
  
  // Array per memorizzare la posizione (Y) delle intestazioni di pagina, da aggiornare dopo
  const headerPositions: { pageNum: number, textY: number }[] = [];
  
  // Funzione per disegnare l'intestazione in modo coerente su tutte le pagine
  function drawHeader(pageNum?: number) {
    // Titolo principale - usiamo n_ordine se disponibile, altrimenti id
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(`Riepilogo Ordine #${order.n_ordine || order.id}`, M, M + 6);
    
    // Stato a destra
    doc.text(`Stato: ${order.stato || 'Ordinato'}`, W - M, M + 6, { align: 'right' });
    
    // Data formattata in italiano
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Data: ${dataFmt}`, M, M + 14);
    
    // ID utente
    if (order.utente_id && typeof order.utente_id === 'string') {
      doc.setFontSize(9);
      doc.text(order.utente_id, W - M, M + 14, { align: 'right' });
    }
    
    // Numero di pagina (al centro sotto l'intestazione principale)
    if (pageNum) {
      const textY = M + 20;
      // Salviamo la posizione per aggiornarla successivamente
      headerPositions.push({ pageNum, textY });
      
      // Per ora, aggiungiamo solo un placeholder per il numero di pagina
      doc.setFontSize(8);
      doc.setTextColor(120, 120, 120);
      // Non includiamo ancora il numero totale di pagine, lo aggiorneremo dopo
      doc.text(`Pagina ${pageNum}`, W / 2, textY, { align: 'center' });
      doc.setTextColor(0, 0, 0); // Ripristina il colore del testo
    }
    
    // Ripristina lo stile predefinito
    doc.setFont("helvetica", "normal");
    doc.setFontSize(cellStyles.fontSize);
  }
  
  // Disegna l'intestazione sulla prima pagina con il numero di pagina
  drawHeader(1);
  
  // Impostazioni standard
  doc.setFontSize(cellStyles.fontSize);
  doc.setLineWidth(0.2);
  
  // Inizializziamo la posizione Y corrente
  let curY = M + 25;  // Partenza dopo l'intestazione
  
  // Raggruppiamo le righe per prodotto
  const groups = groupByProduct(order.righe);
  let globalIndex = 1;
  
  // Per ogni gruppo (prodotto)
  for (const group of groups) {
    // Assicuriamo che abbiamo ancora spazio sulla pagina
    if (curY > H - M - 30) {  // 30 è un margine di sicurezza
      doc.addPage();
      curY = M + 25;
      
      // Rimettiamo l'intestazione sulla nuova pagina usando la funzione dedicata
      // Passiamo il numero di pagina corrente
      drawHeader(doc.getNumberOfPages());
    }
    
    // Header del gruppo (prodotto)
    doc.setFillColor(245, 245, 245); // Colore più chiaro per l'header
    doc.setDrawColor(210, 210, 210); // Bordi più chiari come nell'originale
    const headerHeight = cellStyles.lineHeight;
    doc.rect(M, curY, CONTENT_W, headerHeight, 'FD');
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(group.nome, M + CONTENT_W / 2, curY + headerHeight / 2 + 2, { align: 'center' });
    
    // Andiamo alla riga successiva
    curY += headerHeight;
    
    // Intestazione delle colonne
    doc.setFillColor(245, 245, 245); // Colore più chiaro per l'header delle colonne
    doc.setDrawColor(210, 210, 210); // Bordi più chiari come nell'originale
    
    // Proporzioni delle colonne - ridotta colonna codice e aumentata configurazione
    const colWidths = {
      numero: CONTENT_W * 0.08,
      configurazione: CONTENT_W * 0.57, // Aumentata da 0.52 a 0.57
      codice: CONTENT_W * 0.15,        // Ridotta da 0.20 a 0.15
      quantita: CONTENT_W * 0.10,
      spunta: CONTENT_W * 0.10
    };
    
    // Posizioni X delle colonne
    const colX = {
      numero: M,
      configurazione: M + colWidths.numero,
      codice: M + colWidths.numero + colWidths.configurazione,
      quantita: M + colWidths.numero + colWidths.configurazione + colWidths.codice,
      spunta: M + colWidths.numero + colWidths.configurazione + colWidths.codice + colWidths.quantita
    };
    
    // Disegniamo l'intestazione delle colonne
    doc.rect(colX.numero, curY, colWidths.numero, headerHeight, 'FD');
    doc.rect(colX.configurazione, curY, colWidths.configurazione, headerHeight, 'FD');
    doc.rect(colX.codice, curY, colWidths.codice, headerHeight, 'FD');
    doc.rect(colX.quantita, curY, colWidths.quantita, headerHeight, 'FD');
    doc.rect(colX.spunta, curY, colWidths.spunta, headerHeight, 'FD');
    
    // Testo delle colonne
    doc.setFontSize(cellStyles.fontSize);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0); // Intestazioni sempre in nero
    
    // Centraggio verticale perfetto per le intestazioni (1.5 invece di 2)
    doc.text('N', colX.numero + colWidths.numero / 2, curY + headerHeight / 2 + 1.5, { align: 'center' });
    doc.text('Configurazione', colX.configurazione + colWidths.configurazione / 2, curY + headerHeight / 2 + 1.5, { align: 'center' });
    doc.text('ID prodotto', colX.codice + colWidths.codice / 2, curY + headerHeight / 2 + 1.5, { align: 'center' });
    doc.text('Q.tà', colX.quantita + colWidths.quantita / 2, curY + headerHeight / 2 + 1.5, { align: 'center' });
    doc.text("Check", colX.spunta + colWidths.spunta / 2, curY + headerHeight / 2 + 1.5, { align: 'center' });
    
    // Andiamo alla riga successiva
    curY += headerHeight;
    
    // Righe dei dati
    for (const riga of group.righe) {
      // Assicuriamo che abbiamo ancora spazio sulla pagina
      if (curY > H - M - cellStyles.lineHeight) {
        doc.addPage();
        curY = M + 25;
        
        // Rimettiamo l'intestazione sulla nuova pagina usando la funzione dedicata
        // Passiamo il numero di pagina corrente
        drawHeader(doc.getNumberOfPages());
        
        // Ripeti l'intestazione delle colonne
        doc.setFillColor(245, 245, 245); // Colore più chiaro per l'header
        doc.setDrawColor(210, 210, 210); // Bordi più chiari
        doc.rect(colX.numero, curY, colWidths.numero, headerHeight, 'FD');
        doc.rect(colX.configurazione, curY, colWidths.configurazione, headerHeight, 'FD');
        doc.rect(colX.codice, curY, colWidths.codice, headerHeight, 'FD');
        doc.rect(colX.quantita, curY, colWidths.quantita, headerHeight, 'FD');
        doc.rect(colX.spunta, curY, colWidths.spunta, headerHeight, 'FD');
        
        doc.setFont("helvetica", "bold");
        doc.setFontSize(cellStyles.fontSize);
        doc.setTextColor(0, 0, 0); // Intestazioni sempre in nero
        
        // Centraggio verticale perfetto per le intestazioni (1.5 invece di 2)
        doc.text('N', colX.numero + colWidths.numero / 2, curY + headerHeight / 2 + 1.5, { align: 'center' });
        doc.text('Configurazione', colX.configurazione + colWidths.configurazione / 2, curY + headerHeight / 2 + 1.5, { align: 'center' });
        doc.text('ID prodotto', colX.codice + colWidths.codice / 2, curY + headerHeight / 2 + 1.5, { align: 'center' });
        doc.text('Q.tà', colX.quantita + colWidths.quantita / 2, curY + headerHeight / 2 + 1.5, { align: 'center' });
        doc.text("Check", colX.spunta + colWidths.spunta / 2, curY + headerHeight / 2 + 1.5, { align: 'center' });
        
        curY += headerHeight;
      }
      
      // Disegniamo le celle della riga
      let rowHeight = cellStyles.lineHeight;
      doc.setDrawColor(210, 210, 210); // Colore bordi più chiaro
      doc.setFillColor(255, 255, 255);
      
      doc.rect(colX.numero, curY, colWidths.numero, rowHeight, 'S');
      doc.rect(colX.configurazione, curY, colWidths.configurazione, rowHeight, 'S');
      doc.rect(colX.codice, curY, colWidths.codice, rowHeight, 'S');
      doc.rect(colX.quantita, curY, colWidths.quantita, rowHeight, 'S');
      doc.rect(colX.spunta, curY, colWidths.spunta, rowHeight, 'S');
      
      // Formattiamo i dati
      const confParts = riga.configurazione 
        ? formatConfigurazione(riga.configurazione, riga.prodotto_id)
        : ['Nessuna configurazione'];
      const configurazione = confParts.join(' - ');
      
      // Codice prodotto (se presente)
      let codiceProdotto = '';
      if ((riga as any).temp_codice_prodotto) {
        codiceProdotto = (riga as any).temp_codice_prodotto;
      }
      
      // Determiniamo quali elementi disegnare nella riga corrente
      const isChecked = (riga as any).checked === true;
      const checkboxSize = 3; // Dimensioni del quadratino

      // Disegniamo i testi
      doc.setFont("helvetica", "normal");
      doc.setFontSize(cellStyles.fontSize);
      doc.setTextColor(70, 70, 70); // Colore del testo più chiaro (grigio) per le celle normali
      
      // Configurazione (con wrapping automatico per righe lunghe)
      // Dividiamo il testo per adattarlo alla larghezza della colonna, con un padding per i margini
      const confWidth = colWidths.configurazione - 8; // Sottraiamo un padding ancora più ampio
      const confLines = doc.splitTextToSize(configurazione, confWidth);
      
      // Adattiamo l'altezza della riga se necessario
      let actualRowHeight = rowHeight;
      if (confLines.length > 1) {
        // Calcoliamo l'altezza necessaria in base al numero di righe
        // Altezza base di ogni riga di testo
        const lineHeight = 3.5; 
        // Aggiungiamo spazio extra sopra e sotto il testo per una spaziatura equilibrata
        const extraPadding = 5;
        
        // Calcoliamo l'altezza totale necessaria
        actualRowHeight = Math.max(rowHeight, confLines.length * lineHeight + extraPadding);
      }
      
      // Se l'altezza effettiva è diversa da quella standard, ridisegniamo le celle
      if (actualRowHeight > rowHeight) {
        // Ridisegniamo tutte le celle con l'altezza corretta
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(210, 210, 210);
        
        // Prima cancelliamo completamente la riga precedente
        // Usiamo un rettangolo bianco leggermente più grande per evitare linee residue
        doc.rect(colX.numero - 0.1, curY - 0.1, CONTENT_W + 0.2, rowHeight + 0.2, 'F');
        
        // Ora disegniamo i bordi delle celle con l'altezza corretta
        doc.rect(colX.numero, curY, colWidths.numero, actualRowHeight, 'S');
        doc.rect(colX.configurazione, curY, colWidths.configurazione, actualRowHeight, 'S');
        doc.rect(colX.codice, curY, colWidths.codice, actualRowHeight, 'S');
        doc.rect(colX.quantita, curY, colWidths.quantita, actualRowHeight, 'S');
        doc.rect(colX.spunta, curY, colWidths.spunta, actualRowHeight, 'S');
      }
      
      // Numero (perfettamente centrato sia verticalmente che orizzontalmente)
      doc.text(globalIndex.toString(), colX.numero + colWidths.numero / 2, curY + actualRowHeight / 2 + 1.5, { align: 'center' });
      
      // Configurazione (allineata a sinistra con wrapping)
      // Calcoliamo con precisione lo spazio verticale per qualsiasi numero di righe
      const lineHeight = 3.5; // Altezza di ogni riga di testo
      const textHeight = confLines.length * lineHeight; // Altezza totale del testo
      
      // Calcoliamo il padding necessario per centrare il testo verticalmente nella cella
      // Aggiungiamo un offset di 2 punti per migliorare l'allineamento visivo
      const startY = curY + (actualRowHeight - textHeight) / 2 + lineHeight/2 + 2;
      
      // Quando abbiamo una sola riga usiamo direttamente il centramento verticale
      if (confLines.length === 1) {
        doc.text(confLines[0], colX.configurazione + 4, curY + actualRowHeight / 2 + 1.5);
      } else {
        // Per più righe, disegniamo ogni riga manualmente alla posizione corretta
        confLines.forEach((line: string, index: number) => {
          const yPos = startY + (index * lineHeight);
          doc.text(line, colX.configurazione + 4, yPos);
        });
      }
      
      // Codice prodotto
      doc.setFont("helvetica", "bold");
      if (codiceProdotto) {
        doc.text(`Cod. ${codiceProdotto}`, colX.codice + colWidths.codice / 2, curY + actualRowHeight / 2 + 1.5, { align: 'center' });
      }
      
      // Quantità
      doc.setFont("helvetica", "normal");
      doc.text(riga.quantità.toString(), colX.quantita + colWidths.quantita / 2, curY + actualRowHeight / 2 + 1.5, { align: 'center' });
      
      // Checkbox per la spunta
      // Calcola posizione del quadratino (centrato nella cella)
      const checkboxX = colX.spunta + colWidths.spunta / 2 - checkboxSize / 2;
      const checkboxY = curY + actualRowHeight / 2 - checkboxSize / 2;
      
      // Disegna il quadratino appropriato
      if (isChecked) {
        // Quadratino pieno nero per le righe selezionate
        doc.setFillColor(0, 0, 0);
        doc.rect(checkboxX, checkboxY, checkboxSize, checkboxSize, 'F');
      } else {
        // Quadratino vuoto per le righe non selezionate
        doc.setDrawColor(0, 0, 0);
        doc.rect(checkboxX, checkboxY, checkboxSize, checkboxSize, 'S');
      }
      
      // Aggiorniamo l'altezza della riga a quella effettivamente usata
      rowHeight = actualRowHeight;
      
      // Passiamo alla riga successiva
      curY += rowHeight;
      globalIndex++;
    }
    
    // Aggiungiamo un piccolo spazio tra i gruppi
    curY += 2; // Ridotto da 5 a 2 per uno stile più compatto
  }
  
  // Aggiungiamo il piè di pagina con note legali solo all'ultima pagina
  const pageCount = doc.getNumberOfPages();

  // Posizione ideale per il footer (fissa nella parte bassa della pagina)
  const footerY = H - 45; // Valore intermedio per un posizionamento equilibrato
  
  // Verifichiamo se l'ultima pagina ha abbastanza spazio per il footer
  doc.setPage(pageCount);
  
  // Se il contenuto del documento arriva troppo in basso, aggiungiamo una nuova pagina per il footer
  if (curY > footerY - 20) {
    doc.addPage();
    // Aggiorniamo il conteggio delle pagine
    const newPageCount = doc.getNumberOfPages();
    doc.setPage(newPageCount);
    // Aggiungi l'intestazione con il numero di pagina
    drawHeader(newPageCount);
  }
  
  // Stile per il separatore orizzontale
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(M, footerY, W - M, footerY);
  
  // Stile per il testo del footer
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  
  // Calcolo della larghezza massima per il testo adattandolo ai margini
  const maxWidth = W - (M * 2);
  
  // Testo delle note legali con supporto per il wrapping automatico
  const notes = [
    "Nota: I dati presenti in questo documento sono generati automaticamente al momento dell'ordine e devono essere verificati prima del ritiro o del pagamento.",
    "Importante: Questo documento non costituisce fattura e non ha valore fiscale.",
    "Privacy: Questo documento contiene dati riservati e personali. È vietata la diffusione, copia o uso non autorizzato delle informazioni qui riportate.",
    "Responsabilità: Si declina ogni responsabilità per eventuali errori materiali o variazioni di peso, in particolare per i prodotti calcolati a peso al momento del ritiro (es. Scamorza)."
  ];
  
  // Posizione iniziale del testo del footer (aumentata leggermente per uno stile più elegante)
  let noteY = footerY + 8;
  
  // Aggiungiamo ogni nota con wrapping automatico
  notes.forEach(noteText => {
    const textLines = doc.splitTextToSize(noteText, maxWidth);
    doc.text(textLines, M, noteY);
    noteY += textLines.length * 3.8 + 2; // Spaziatura intermedia per leggibilità ottimale
  });
  
  // Aggiornamento dei numeri di pagina con il conteggio finale
  const finalPageCount = doc.getNumberOfPages();
  
  // Aggiorniamo tutti i numeri di pagina nell'intestazione con il totale corretto
  headerPositions.forEach(pos => {
    doc.setPage(pos.pageNum);
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    
    // Disegniamo un rettangolo bianco per coprire il testo precedente
    doc.setFillColor(255, 255, 255);
    const textWidth = 60; // Larghezza stimata del testo "Pagina X di Y"
    doc.rect(W / 2 - textWidth / 2, pos.textY - 5, textWidth, 8, 'F');
    
    // Riscriviamo il testo con il numero totale di pagine corretto
    doc.text(`Pagina ${pos.pageNum} di ${finalPageCount}`, W / 2, pos.textY, { align: 'center' });
  });
  
  // Salvataggio del PDF con il nuovo formato di nome file
  // Formato: <ultime5cifreIDutente>_<numeroOrdine>_<YYYY-MM-DD>.pdf
  const dataFormattata = format(new Date(order.data_ordine), 'yyyy-MM-dd');
  
  // Estrai le ultime 5 cifre dell'ID utente (se disponibile)
  let userIdSuffix = "00000"; // Default in caso di ID non disponibile
  if (order.utente_id && typeof order.utente_id === 'string') {
    // Prende le ultime 5 cifre o caratteri
    userIdSuffix = order.utente_id.slice(-5);
  }
  
  // Crea il nome del file nel nuovo formato richiesto
  // Utilizziamo n_ordine se disponibile, altrimenti id come fallback
  doc.save(`${userIdSuffix}_${order.n_ordine || order.id}_${dataFormattata}.pdf`);
}

function groupByProduct(rows: RigaOrdine[]) {
  const map: Record<string, RigaOrdine[]> = {};
  rows.forEach(r => { map[r.nome_prodotto] = map[r.nome_prodotto] || []; map[r.nome_prodotto].push(r); });
  return Object.entries(map).map(([nome, righe]) => ({ nome, righe }));
}

function formatConfig(conf: Record<string, string>, prodottoId?: number): string {
  if (!conf || Object.keys(conf).length === 0) return 'Nessuna configurazione';
  
  // Utilizziamo la funzione centralizzata formatConfigurazione che include
  // il criterio secondario di ordinamento basato su ID caratteristica
  return formatConfigurazione(conf, prodottoId).join(' - ');
}
