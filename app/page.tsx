import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/login') // تعديل المسار هنا حسب الصفحة الموجودة لديك
}