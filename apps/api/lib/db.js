import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { Headers, fetch } from 'undici';

// Polyfill for Node.js 16 - add Headers and fetch to global
if (typeof globalThis.Headers === 'undefined') {
  globalThis.Headers = Headers;
}
if (typeof globalThis.fetch === 'undefined') {
  globalThis.fetch = fetch;
}

// Load environment variables
dotenv.config();

// Get environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Create Supabase client if credentials are available
// This key has admin privileges and bypasses Row Level Security (RLS)
export const supabase = (supabaseUrl && supabaseServiceRoleKey)
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null;

// Check if Supabase is configured
export const isConfigured = () => {
  return !!(supabaseUrl && supabaseServiceRoleKey);
};

// Test database connection
export const testConnection = async () => {
  // Check if Supabase is configured
  if (!isConfigured()) {
    return { 
      connected: false, 
      error: 'Supabase not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.' 
    };
  }

  if (!supabase) {
    return { 
      connected: false, 
      error: 'Supabase client not initialized' 
    };
  }

  try {
    // Test connection by querying a system table that should always exist
    // Using a simple query that will work if credentials are valid
    const { error } = await supabase
      .from('_test_connection_does_not_exist')
      .select('*')
      .limit(0);
    
    // If we get a "table not found" error, that means the connection is working
    // but the table doesn't exist (which is expected)
    // If we get an auth error, credentials are wrong
    if (error) {
      // These error codes mean "relation does not exist" - connection is working!
      if (error.code === 'PGRST116' || error.code === '42P01' || error.message?.includes('schema cache')) {
        return { connected: true, error: null };
      }
      
      // Auth errors mean credentials are wrong
      if (error.message?.includes('Invalid API key') || 
          error.message?.includes('JWT') || 
          error.message?.includes('JWT expired') ||
          error.code === 'PGRST301') {
        return { 
          connected: false, 
          error: 'Invalid Supabase credentials. Please check your SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' 
        };
      }
      
      // Other errors might indicate connection issues
      throw error;
    }
    
    return { connected: true, error: null };
  } catch (error) {
    return { connected: false, error: error.message || 'Connection test failed' };
  }
};

