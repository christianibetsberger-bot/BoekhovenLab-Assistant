import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://tokbjjuzkrkbmvcslstc.supabase.co'
const supabaseKey = 'sb_publishable_Ts9DBCncOdA0g1d88kBLfg_GWUt81IT'

export const db = createClient(supabaseUrl, supabaseKey)