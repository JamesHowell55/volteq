import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { useAuth } from './AuthContext';
import { useEntitlement } from './useEntitlement';

export interface Branding {
  companyName?: string;
  companyLogoUrl?: string;
}

// Only premium users' saved branding is ever returned — free users always get
// an empty object, so their exports fall back to the default Volteq mark
// (see pdfExport.ts: companyName/companyLogoUrl are optional).
export function useBranding(): Branding {
  const { user } = useAuth();
  const { isPremium } = useEntitlement();
  const [branding, setBranding] = useState<Branding>({});

  useEffect(() => {
    if (!user || !isPremium) {
      setBranding({});
      return;
    }
    supabase
      .from('branding')
      .select('company_name, logo_url')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        setBranding({ companyName: data?.company_name ?? undefined, companyLogoUrl: data?.logo_url ?? undefined });
      });
  }, [user, isPremium]);

  return branding;
}
