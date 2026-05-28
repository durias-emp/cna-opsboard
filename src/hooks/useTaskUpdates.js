import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useTaskUpdates(todoId, aircraftId) {
  const [updates, setUpdates] = useState([])
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    if (!todoId) return
    setLoading(true)
    const { data } = await supabase
      .from('task_updates')
      .select('*')
      .eq('todo_id', todoId)
      .order('created_at', { ascending: false })
    if (data) setUpdates(data)
    setLoading(false)
  }, [todoId])

  useEffect(() => { load() }, [load])

  async function addUpdate({ author, notes, updateDate }) {
    const { data, error } = await supabase
      .from('task_updates')
      .insert({
        todo_id:     todoId,
        aircraft_id: aircraftId,
        author:      author || null,
        notes,
        update_date: updateDate || new Date().toISOString().split('T')[0],
      })
      .select()
      .single()
    if (error) throw new Error(error.message ?? 'Failed to save update')
    if (data) setUpdates(prev => [data, ...prev])
  }

  async function editUpdate(id, notes) {
    const { data, error } = await supabase
      .from('task_updates')
      .update({ notes, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw new Error(error.message ?? 'Failed to edit update')
    if (data) setUpdates(prev => prev.map(u => u.id === id ? data : u))
  }

  return { updates, loading, addUpdate, editUpdate, refresh: load }
}
