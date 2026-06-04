import { useState, useEffect } from 'react';
import { ProfileScreen } from '@/components/ProfileScreen';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

export default function LandlordProfileScreen() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState([
    { label: 'Eiendommer', value: 0, icon: 'business-outline' },
    { label: 'Enheter', value: 0, icon: 'home-outline' },
    { label: 'Leietakere', value: 0, icon: 'people-outline' },
  ]);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const [propRes, unitRes] = await Promise.all([
        supabase.from('properties').select('id').eq('landlord_id', user.id),
        supabase.from('units')
          .select(`id, tenant_id, properties!inner(landlord_id)`)
          .eq('properties.landlord_id', user.id) as any,
      ]);
      const properties = propRes.data?.length ?? 0;
      const units = unitRes.data?.length ?? 0;
      const tenants = unitRes.data?.filter((u: any) => u.tenant_id).length ?? 0;
      setStats([
        { label: 'Eiendommer', value: properties, icon: 'business-outline' },
        { label: 'Enheter', value: units, icon: 'home-outline' },
        { label: 'Leietakere', value: tenants, icon: 'people-outline' },
      ]);
    };
    fetch();
  }, [user]);

  return <ProfileScreen role="landlord" stats={stats} />;
}
