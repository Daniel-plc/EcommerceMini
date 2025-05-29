/**
 * Sistema di logging centralizzato ottimizzato per le prestazioni
 * Permette di abilitare/disabilitare facilmente i log con impatto minimo
 */

// Tipi di log supportati
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// Mapping dei livelli ai nomi di configurazione
const levelConfigMap = {
  debug: 'enableDebug',
  info: 'enableInfo',
  warn: 'enableWarn',
  error: 'enableError'
} as const;

// Configurazione del logger
const globalConfig = {
  // In produzione disabilita i log di debug e info
  enableDebug: import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEBUG_LOGS === 'true',
  enableInfo: import.meta.env.DEV,
  // Gli avvisi e gli errori sono sempre abilitati
  enableWarn: true,
  enableError: true,
  // Prefisso per i log
  prefix: '[App]'
};

// Mapping dei livelli di log ai relativi metodi console
const logMethods: Record<LogLevel, (message: string, ...args: any[]) => void> = {
  debug: console.debug,
  info: console.info,
  warn: console.warn,
  error: console.error
};

// Cache per le configurazioni già viste (ottimizzazione)
const configCache = new Map<string, boolean>();

/**
 * Controlla se un livello di log è abilitato
 * Utilizza una cache per evitare controlli ripetuti
 */
function isLevelEnabled(level: LogLevel, moduleConfig?: Record<string, boolean>): boolean {
  // Crea una chiave univoca per la cache
  const cacheKey = `${level}:${moduleConfig ? JSON.stringify(moduleConfig) : 'global'}`;
  
  // Controlla se abbiamo già determinato il risultato
  if (configCache.has(cacheKey)) {
    return configCache.get(cacheKey)!;
  }
  
  let enabled = false;
  const configKey = levelConfigMap[level]; // ottieni la chiave corretta
  
  // Controlla prima la configurazione del modulo, se fornita
  if (moduleConfig && moduleConfig[configKey] !== undefined) {
    enabled = Boolean(moduleConfig[configKey]);
  } else {
    // Altrimenti usa la configurazione globale
    enabled = Boolean(globalConfig[configKey]);
  }
  
  // Memorizza il risultato per futuri controlli
  configCache.set(cacheKey, enabled);
  
  return enabled;
}

/**
 * Logger per messaggi di debug
 * Utilizzare per informazioni dettagliate utili solo in fase di sviluppo
 */
export function debug(message: string, ...args: any[]): void {
  if (isLevelEnabled('debug')) {
    logMethods.debug(`${globalConfig.prefix} ${message}`, ...args);
  }
}

/**
 * Logger per messaggi informativi
 * Utilizzare per eventi importanti ma non critici
 */
export function info(message: string, ...args: any[]): void {
  if (isLevelEnabled('info')) {
    logMethods.info(`${globalConfig.prefix} ${message}`, ...args);
  }
}

/**
 * Logger per avvisi
 * Utilizzare per situazioni potenzialmente problematiche ma non critiche
 */
export function warn(message: string, ...args: any[]): void {
  if (isLevelEnabled('warn')) {
    logMethods.warn(`${globalConfig.prefix} ${message}`, ...args);
  }
}

/**
 * Logger per errori
 * Utilizzare per problemi critici che richiedono attenzione
 */
export function error(message: string, ...args: any[]): void {
  if (isLevelEnabled('error')) {
    logMethods.error(`${globalConfig.prefix} ${message}`, ...args);
  }
}

/**
 * Crea un logger con un prefisso specifico per un modulo
 * Supporta configurazione per modulo con override
 * 
 * @param moduleName Nome del modulo per il prefisso
 * @param config Configurazione specifica per il modulo (opzionale)
 */
export function createLogger(moduleName: string, config?: Record<string, any>) {
  const modulePrefix = `${globalConfig.prefix} [${moduleName}]`;
  
  // Estrai la configurazione dei livelli dal config fornito
  const moduleConfig: Record<string, boolean> = {};
  
  if (config) {
    // Supporto per la configurazione per livello
    if (config.level) {
      switch(config.level) {
        case 'error':
          moduleConfig.enableDebug = false;
          moduleConfig.enableInfo = false;
          moduleConfig.enableWarn = false;
          moduleConfig.enableError = true;
          break;
        case 'warn':
          moduleConfig.enableDebug = false;
          moduleConfig.enableInfo = false;
          moduleConfig.enableWarn = true;
          moduleConfig.enableError = true;
          break;
        case 'info':
          moduleConfig.enableDebug = false;
          moduleConfig.enableInfo = true;
          moduleConfig.enableWarn = true;
          moduleConfig.enableError = true;
          break;
        case 'debug':
          moduleConfig.enableDebug = true;
          moduleConfig.enableInfo = true;
          moduleConfig.enableWarn = true;
          moduleConfig.enableError = true;
          break;
      }
    } else {
      // Configurazione manuale per ogni livello
      if (config.enableDebug !== undefined) moduleConfig.enableDebug = config.enableDebug;
      if (config.enableInfo !== undefined) moduleConfig.enableInfo = config.enableInfo;
      if (config.enableWarn !== undefined) moduleConfig.enableWarn = config.enableWarn;
      if (config.enableError !== undefined) moduleConfig.enableError = config.enableError;
    }
  }
  
  return {
    debug: (message: string, ...args: any[]): void => {
      if (isLevelEnabled('debug', moduleConfig)) {
        logMethods.debug(`${modulePrefix} ${message}`, ...args);
      }
    },
    
    info: (message: string, ...args: any[]): void => {
      if (isLevelEnabled('info', moduleConfig)) {
        logMethods.info(`${modulePrefix} ${message}`, ...args);
      }
    },
    
    warn: (message: string, ...args: any[]): void => {
      if (isLevelEnabled('warn', moduleConfig)) {
        logMethods.warn(`${modulePrefix} ${message}`, ...args);
      }
    },
    
    error: (message: string, ...args: any[]): void => {
      if (isLevelEnabled('error', moduleConfig)) {
        logMethods.error(`${modulePrefix} ${message}`, ...args);
      }
    }
  };
}

/**
 * Logger di default esportato come oggetto singolo
 */
export const logger = {
  debug,
  info,
  warn,
  error,
  createLogger
};

export default logger;