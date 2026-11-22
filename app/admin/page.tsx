import { redirect } from 'next/navigation'

// /admin has no page of its own. The middleware already sends signed-out visitors to
// /admin/login, so anyone who reaches this route is an administrator.
export default function AdminIndexPage() {
  redirect('/admin/dashboard')
}
