import SalesEntry from '@/screens/SalesEntry'
import Guard from '@/components/Guard'

// sales_manager sells as well as supervises: 20260814080000 added it to the
// fn_create_order allowlist, which is the real gate — that RPC is SECURITY
// DEFINER and bypasses the orders INSERT policies entirely.
export default function Page() {
  return (
    <Guard roles={['super_admin', 'sales', 'sales_manager', 'coordinator']}>
      <SalesEntry />
    </Guard>
  )
}
