import { supabase } from '@/lib/supabase'

export async function createNewTenant(tenantName: string, slug: string) {

  // 1. التأكد من وجود مستخدم مسجل الدخول
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    throw new Error('يجب تسجيل الدخول أولاً لإنشاء مركز جديد.')
  }

  // 2. إنشاء المركز في جدول tenants
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .insert([
      {
        name: tenantName,
        slug: slug.toLowerCase().trim().replace(/\s+/g, '-'),
      }
    ])
    .select()
    .single()

  if (tenantError) {
    console.error('Error creating tenant:', tenantError)
    throw new Error(tenantError.message.includes('unique') 
      ? 'اسم المعرف (slug) مستخدم بالفعل، يرجى اختيار اسم آخر.' 
      : 'حدث خطأ أثناء إنشاء المركز.')
  }

  // 3. ربط المستخدم الحالي كـ OWNER للمركز الجديد في جدول tenant_members
  const { error: memberError } = await supabase
    .from('tenant_members')
    .insert([
      {
        tenant_id: tenant.id,
        user_id: user.id,
        role: 'OWNER'
      }
    ])

  if (memberError) {
    console.error('Error linking member:', memberError)
    throw new Error('تم إنشاء المركز ولكن حدث خطأ أثناء إعطاء الصلاحيات.')
  }

  return tenant
}