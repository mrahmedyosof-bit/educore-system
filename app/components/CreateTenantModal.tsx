'use client'

import { useState } from 'react'
import { createNewTenant } from '@/lib/actions/tenant'

export default function CreateTenantModal({ onSuccess }: { onSuccess?: () => void }) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      await createNewTenant(name, slug)
      setSuccess(true)
      setName('')
      setSlug('')
      if (onSuccess) onSuccess()
    } catch (err: any) {
      setError(err.message || 'حدث خطأ غير متوقع')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 bg-white rounded-lg shadow-md max-w-md mx-auto dir-rtl text-right">
      <h2 className="text-xl font-bold mb-4 text-gray-800">إنشاء مركز تعليمي جديد</h2>
      
      {error && <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md text-sm">{error}</div>}
      {success && <div className="mb-4 p-3 bg-green-100 text-green-700 rounded-md text-sm">تم إنشاء المركز بنجاح! 🎉</div>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">اسم المركز</label>
          <input
            type="text"
            required
            placeholder="مثال: أكاديمية التفوق"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              // التوليد التلقائي للـ Slug
              setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))
            }}
            className="w-full px-3 py-2 border rounded-md text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">معرف المركز (Slug)</label>
          <input
            type="text"
            required
            placeholder="tafawuq-academy"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="w-full px-3 py-2 border rounded-md text-left dir-ltr focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 font-medium"
        >
          {loading ? 'جاري الإنشاء...' : 'إنشاء المركز'}
        </button>
      </form>
    </div>
  )
}