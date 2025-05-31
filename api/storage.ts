import { type User, type InsertUser } from "../shared/schema";
import { supabase } from "./supabase.ts";

// Interfaccia per operazioni CRUD
export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
}

// Implementazione utilizzando Supabase SDK invece di Drizzle ORM
export class SupabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error || !data) {
      console.error('Errore nel recupero dell\'utente per ID:', error?.message);
      return undefined;
    }
    
    return data as User;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();
    
    if (error || !data) {
      if (error?.code !== 'PGRST116') { // Non loggare l'errore se l'utente non è stato trovato
        console.error('Errore nel recupero dell\'utente per username:', error?.message);
      }
      return undefined;
    }
    
    return data as User;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const { data, error } = await supabase
      .from('users')
      .insert(insertUser)
      .select('*')
      .single();
    
    if (error || !data) {
      console.error('Errore nella creazione dell\'utente:', error?.message);
      throw new Error(error?.message || 'Errore nella creazione dell\'utente');
    }
    
    return data as User;
  }
}

// Esporta l'istanza di storage utilizzando Supabase
export const storage = new SupabaseStorage();
